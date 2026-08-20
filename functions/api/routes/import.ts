import { Hono } from 'hono';
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import type { HonoEnv, SectionType, UserPayload } from '../types';
import {
    authMiddleware,
    canMutate,
    normalizeSectionType,
    requireExpensiveRequestBudget,
} from '../middleware/auth';
import { sectionRelationshipError } from '../services/scheduling';
import {
    analyzeMappingWithGemini,
    analyzeMappingWithOpenAI,
    createMappingAnalysis,
    isConfiguredApiKey,
} from '../services/aiMapping';
import { resolveMappingAIModel, type MappingAnalysis } from '../../../features/ai/mapping';

export const importRoutes = new Hono<HonoEnv>();

// Import Teachers
importRoutes.post('/import/docentes', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const { data, career_id, import_mode } = await c.req.json();

    if (!data || !Array.isArray(data)) {
        return c.json({ error: 'Datos inválidos' }, 400);
    }

    const targetCareerId = user.role === 'admin' && career_id ? career_id : user.career_id;
    if (!targetCareerId) {
        return c.json({ error: 'Career ID requerido' }, 400);
    }

    if (data.length > 10_000) return c.json({ error: 'Máximo 10.000 registros por importación' }, 413);
    const statements = data.map((row: Record<string, string>) => {
        const id = `tch-${crypto.randomUUID().slice(0, 8)}`;
        const rut = row.RUT || row.rut || `DEMO-${id}`;
        return db.prepare(`INSERT INTO teachers (id, career_id, rut, name, email, contract_type, max_hours_per_week, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(rut) DO UPDATE SET name = excluded.name, email = excluded.email,
            contract_type = excluded.contract_type, max_hours_per_week = excluded.max_hours_per_week,
            is_active = excluded.is_active, updated_at = datetime('now')`)
            .bind(id, targetCareerId, rut, row.Nombre || row.nombre || '', row.Email || row.email || null,
                row['Tipo Contrato'] || row.tipo_contrato || 'Honorarios', parseInt(row['Max Horas'] || row.max_horas || '12'),
                (row.Estado || row.estado || 'Activo').toLowerCase() === 'activo' ? 1 : 0);
    });
    if (import_mode === 'replace') statements.unshift(db.prepare('UPDATE teachers SET is_active = 0 WHERE career_id = ?').bind(targetCareerId));
    try {
        await db.batch(statements);
        return c.json({ success: true, inserted: data.length, errors: [] });
    } catch (error) {
        return c.json({ error: 'La importación fue revertida', details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

// Import Subjects
importRoutes.post('/import/asignaturas', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const { data, career_id } = await c.req.json();

    if (!data || !Array.isArray(data)) {
        return c.json({ error: 'Datos inválidos' }, 400);
    }

    const targetCareerId = user.role === 'admin' && career_id ? career_id : user.career_id;
    if (!targetCareerId) {
        return c.json({ error: 'Career ID requerido' }, 400);
    }

    if (data.length > 10_000) return c.json({ error: 'Máximo 10.000 registros por importación' }, 413);
    const statements = data.map((row: Record<string, string>) => db.prepare(`
        INSERT INTO subjects (id, career_id, code, name, level, credits) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(career_id, code) DO UPDATE SET name = excluded.name, level = excluded.level,
        credits = excluded.credits, updated_at = datetime('now')`)
        .bind(`sub-${crypto.randomUUID().slice(0, 8)}`, targetCareerId, row.Codigo || row.codigo || '', row.Nombre || row.nombre || '',
            parseInt(row.Nivel || row.nivel || '1'), parseInt(row.Creditos || row.creditos || '4')));
    try {
        await db.batch(statements);
        return c.json({ success: true, inserted: data.length, errors: [] });
    } catch (error) {
        return c.json({ error: 'La importación fue revertida', details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

// Import Rooms
importRoutes.post('/import/salas', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const { data, career_id, import_mode } = await c.req.json();

    if (!data || !Array.isArray(data)) {
        return c.json({ error: 'Datos inválidos' }, 400);
    }

    const targetCareerId = user.role === 'admin' && career_id ? career_id : user.career_id;
    if (!targetCareerId) {
        return c.json({ error: 'Career ID requerido' }, 400);
    }

    if (data.length > 10_000) return c.json({ error: 'Máximo 10.000 registros por importación' }, 413);
    const uniqueRows = new Map<string, { row: Record<string, string>; roomCareerId: string | null; isShared: boolean }>();
    for (const row of data as Record<string, string>[]) {
        const sharedText = (row.Compartida || row.compartida || 'No').toLowerCase();
        const isShared = user.role === 'admin' && (sharedText === 'sí' || sharedText === 'si');
        const roomCareerId = isShared ? null : targetCareerId;
        const name = String(row.Nombre || row.nombre || '').trim();
        const building = String(row.Edificio || row.edificio || '').trim();
        if (!name) continue;
        const key = `${name.toLocaleLowerCase()}\u0000${building.toLocaleLowerCase()}\u0000${roomCareerId || ''}`;
        if (!uniqueRows.has(key)) uniqueRows.set(key, { row, roomCareerId, isShared });
    }
    const statements = [...uniqueRows.values()].map(({ row, roomCareerId, isShared }) => {
        const name = String(row.Nombre || row.nombre || '').trim();
        const building = String(row.Edificio || row.edificio || '').trim() || null;
        return db.prepare(`INSERT INTO rooms (id, career_id, name, building, floor, type, capacity, is_shared, is_active)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1 WHERE NOT EXISTS (
                SELECT 1 FROM rooms WHERE is_active = 1
                AND lower(trim(name)) = lower(trim(?))
                AND lower(trim(COALESCE(building, ''))) = lower(trim(COALESCE(?, '')))
                AND COALESCE(career_id, '') = COALESCE(?, '')
            )`).bind(`room-${crypto.randomUUID().slice(0, 8)}`, roomCareerId, name,
                building, parseInt(row.Piso || row.piso || '1'), row.Tipo || row.tipo || 'TEO',
                parseInt(row.Capacidad || row.capacidad || '30'), isShared ? 1 : 0, name,
                building, roomCareerId);
    });
    if (import_mode === 'replace') statements.unshift(db.prepare('UPDATE rooms SET is_active = 0 WHERE career_id = ?').bind(targetCareerId));
    try {
        await db.batch(statements);
        return c.json({ success: true, inserted: uniqueRows.size, skipped: data.length - uniqueRows.size, errors: [] });
    } catch (error) {
        return c.json({ error: 'La importación fue revertida', details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

// Import Schedules (Sections)
importRoutes.post('/import/horarios', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const { data, career_id, period_id, import_mode } = await c.req.json();

    if (!data || !Array.isArray(data)) {
        return c.json({ error: 'Datos inválidos' }, 400);
    }

    const targetCareerId = user.role === 'admin' && career_id ? career_id : user.career_id;
    if (!targetCareerId) {
        return c.json({ error: 'Career ID requerido' }, 400);
    }
    if (data.length > 10_000) return c.json({ error: 'Máximo 10.000 registros por importación' }, 413);
    const period = await db.prepare('SELECT id FROM periods WHERE id = ?').bind(period_id).first();
    if (!period) return c.json({ error: 'Período académico inválido' }, 400);

    const nrcGroups = new Map<string, Record<string, string>[]>();
    for (const row of data as Record<string, string>[]) {
        const nrc = String(row.NRC || row.nrc || '').trim();
        if (!nrc) return c.json({ error: 'Todas las secciones deben tener NRC' }, 400);
        const rows = nrcGroups.get(nrc) || [];
        rows.push(row);
        nrcGroups.set(nrc, rows);
    }

    const [subjectRows, teacherRows, existingSectionRows, existingAssignmentRows] = await Promise.all([
        db.prepare('SELECT id, code FROM subjects WHERE career_id = ?').bind(targetCareerId).all(),
        db.prepare('SELECT id, rut FROM teachers WHERE career_id = ?').bind(targetCareerId).all(),
        db.prepare(`SELECT s.id, s.nrc, s.type, s.subject_id, sub.code AS subject_code,
                (SELECT COUNT(*) FROM sections child WHERE child.parent_section_id = s.id) AS child_count
            FROM sections s JOIN subjects sub ON sub.id = s.subject_id
            WHERE s.career_id = ? AND s.period_id = ?`).bind(targetCareerId, period_id).all(),
        db.prepare(`SELECT section_id, timeslot_id, day_of_week FROM schedule_assignments
            WHERE career_id = ? AND period_id = ?`).bind(targetCareerId, period_id).all(),
    ]);

    const subjectIds = new Map((subjectRows.results as any[]).map(row => [String(row.code).trim().toUpperCase(), row.id as string]));
    const teacherIds = new Map((teacherRows.results as any[]).map(row => [row.rut, row.id]));
    const existingSections = new Map((existingSectionRows.results as any[]).map(row => [String(row.nrc), row]));
    const assignedSlotsBySection = new Map<string, Set<string>>();
    for (const assignment of existingAssignmentRows.results as any[]) {
        const slots = assignedSlotsBySection.get(String(assignment.section_id)) || new Set<string>();
        slots.add(`${assignment.timeslot_id}|${assignment.day_of_week}`);
        assignedSlotsBySection.set(String(assignment.section_id), slots);
    }
    const statements: D1PreparedStatement[] = [];

    type PreparedSection = {
        id: string;
        nrc: string;
        type: SectionType;
        subjectId: string;
        subjectCode: string;
        parentNrc: string | null;
        row: Record<string, string>;
    };
    const preparedSections: PreparedSection[] = [];

    for (const [nrc, rows] of nrcGroups) {
        const firstRow = rows[0];
        const subjectCode = String(firstRow.Codigo || firstRow.codigo || '').trim().toUpperCase();
        if (!subjectCode) return c.json({ error: `La sección NRC ${nrc} no tiene código de asignatura` }, 400);
        let subjectId = subjectIds.get(subjectCode);
        if (!subjectId) {
            subjectId = `sub-${crypto.randomUUID().slice(0, 8)}`;
            subjectIds.set(subjectCode, subjectId);
            statements.push(db.prepare('INSERT INTO subjects (id, career_id, code, name, level, credits) VALUES (?, ?, ?, ?, ?, 4)')
                .bind(subjectId, targetCareerId, subjectCode,
                    firstRow.Asignatura || firstRow.asignatura || firstRow.Nombre || firstRow.nombre || '',
                    parseInt(firstRow.Nivel || firstRow.nivel || '1')));
        }
        const type = normalizeSectionType(firstRow.Tipo || firstRow.tipo);
        const parentNrc = String(firstRow.nrc_teorico || firstRow.NRC_Teorico || firstRow['NRC Teorico'] || firstRow.nrc_padre || '').trim() || null;
        const existing = existingSections.get(nrc);
        if (existing && Number(existing.child_count || 0) > 0 && (
            type !== 'TEO' || String(existing.subject_code).trim().toUpperCase() !== subjectCode
        )) {
            return c.json({ error: `No se puede cambiar el tipo o la asignatura del NRC teórico ${nrc} porque tiene prácticas asociadas` }, 409);
        }
        preparedSections.push({
            id: import_mode === 'replace' ? `sec-${crypto.randomUUID().slice(0, 8)}` : existing?.id || `sec-${crypto.randomUUID().slice(0, 8)}`,
            nrc,
            type,
            subjectId,
            subjectCode,
            parentNrc,
            row: firstRow,
        });
    }

    const availableSections = new Map<string, { id: string; type: SectionType; subjectCode: string }>();
    if (import_mode !== 'replace') {
        for (const row of existingSectionRows.results as any[]) {
            availableSections.set(String(row.nrc), {
                id: String(row.id),
                type: normalizeSectionType(row.type),
                subjectCode: String(row.subject_code).trim().toUpperCase(),
            });
        }
    }
    for (const section of preparedSections) {
        availableSections.set(section.nrc, { id: section.id, type: section.type, subjectCode: section.subjectCode });
    }

    for (const section of preparedSections) {
        if (section.type === 'TEO' && section.parentNrc) {
            return c.json({ error: `La sección teórica NRC ${section.nrc} no puede tener NRC teórico padre` }, 400);
        }
        if (section.type !== 'TEO' && !section.parentNrc) {
            return c.json({ error: `La práctica NRC ${section.nrc} requiere la columna nrc_teorico` }, 400);
        }
        if (!section.parentNrc) continue;
        if (section.parentNrc === section.nrc) return c.json({ error: `La sección NRC ${section.nrc} no puede ser su propio padre` }, 400);
        const parent = availableSections.get(section.parentNrc);
        if (!parent) return c.json({ error: `No existe la sección teórica NRC ${section.parentNrc} indicada por la práctica NRC ${section.nrc}` }, 400);
        if (parent.type !== 'TEO') return c.json({ error: `El NRC padre ${section.parentNrc} debe ser de tipo TEO` }, 400);
        if (parent.subjectCode !== section.subjectCode) {
            return c.json({ error: `La práctica NRC ${section.nrc} y su teoría NRC ${section.parentNrc} deben pertenecer a la misma asignatura` }, 400);
        }
        if (import_mode !== 'replace') {
            const childSlots = assignedSlotsBySection.get(section.id) || new Set<string>();
            const parentSlots = assignedSlotsBySection.get(parent.id) || new Set<string>();
            if ([...childSlots].some(slot => parentSlots.has(slot))) {
                return c.json({ error: `No se puede vincular la práctica NRC ${section.nrc}: ya coincide en horario con la teoría NRC ${section.parentNrc}` }, 409);
            }
        }
    }

    preparedSections.sort((first, second) => Number(first.type !== 'TEO') - Number(second.type !== 'TEO'));
    for (const section of preparedSections) {
        const firstRow = section.row;
        const teacherId = teacherIds.get(firstRow['RUT Docente'] || firstRow.rut_docente || '') || null;
        const parentSectionId = section.parentNrc ? availableSections.get(section.parentNrc)!.id : null;
        const sectionCode = String(firstRow.Seccion || firstRow.seccion || firstRow.Sección || firstRow.sección || firstRow.Paralelo || firstRow.paralelo || firstRow.Grupo || firstRow.grupo || '').trim() || null;
        const expectedStudents = parseInt(firstRow.Estudiantes || firstRow.estudiantes || firstRow.Alumnos || firstRow.alumnos || firstRow.Cupos || firstRow.cupos || firstRow.Aforo || firstRow.aforo || firstRow.Capacidad || firstRow.capacidad || '30') || 30;
        statements.push(db.prepare(`INSERT INTO sections (id, period_id, career_id, subject_id, teacher_id, nrc, section_code, type, parent_section_id, hours_per_week, expected_students, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(period_id, career_id, nrc) DO UPDATE SET subject_id = excluded.subject_id, teacher_id = excluded.teacher_id,
            section_code = excluded.section_code, type = excluded.type, parent_section_id = excluded.parent_section_id,
            hours_per_week = excluded.hours_per_week, expected_students = excluded.expected_students,
            updated_at = datetime('now')`)
            .bind(section.id, period_id, targetCareerId, section.subjectId, teacherId, section.nrc, sectionCode,
                section.type, parentSectionId, parseInt(firstRow.Horas || firstRow.horas || '2') || 2,
                expectedStudents));
    }
    try {
        if (import_mode === 'replace') {
            statements.unshift(
                db.prepare('DELETE FROM sections WHERE period_id = ? AND career_id = ? AND parent_section_id IS NOT NULL').bind(period_id, targetCareerId),
                db.prepare('DELETE FROM sections WHERE period_id = ? AND career_id = ?').bind(period_id, targetCareerId),
            );
        }
        await db.batch(statements);
        const linked = preparedSections.filter(section => section.parentNrc).length;
        return c.json({
            success: true,
            inserted: nrcGroups.size,
            linked,
            errors: [],
            message: `${nrcGroups.size} secciones procesadas; ${linked} prácticas vinculadas a su teoría`,
        });
    } catch (error) {
        return c.json({ error: sectionRelationshipError(error), details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

// Analyze Mapping
importRoutes.post('/import/analyze-mapping', authMiddleware, async (c) => {
    const user = c.get('user');
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const body = await c.req.json<{ headers?: unknown; model?: unknown }>();
    if (!Array.isArray(body.headers) || body.headers.length === 0 || body.headers.length > 200 ||
        body.headers.some(header => typeof header !== 'string' || header.length === 0 || header.length > 200)) {
        return c.json({ error: 'Encabezados inválidos' }, 400);
    }

    const headers = body.headers as string[];
    const geminiApiKey = c.env.GEMINI_API_KEY || c.env.API_KEY;
    const selected = resolveMappingAIModel(body.model, {
        openai: isConfiguredApiKey(c.env.OPENAI_API_KEY),
        gemini: isConfiguredApiKey(geminiApiKey),
    });

    if (selected.provider === 'local') {
        return c.json(createMappingAnalysis(headers, selected));
    }

    try {
        const mappings = selected.provider === 'openai'
            ? await analyzeMappingWithOpenAI(headers, selected.model!, c.env.OPENAI_API_KEY!, user.id)
            : await analyzeMappingWithGemini(headers, selected.model!, geminiApiKey!);

        return c.json({ ...selected, mappings } satisfies MappingAnalysis);
    } catch (error: unknown) {
        console.error(`${selected.provider} mapping analysis failed:`, error instanceof Error ? error.message : error);
        return c.json(createMappingAnalysis(headers, {
            ...selected,
            provider: 'local',
            model: null,
            fallback: true,
            notice: `${selected.provider === 'openai' ? 'OpenAI' : 'Gemini'} no respondió; se aplicaron reglas locales.`,
        }));
    }
});
