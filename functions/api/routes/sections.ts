import { Hono } from 'hono';
import type { HonoEnv, SectionType, UserPayload } from '../types';
import { authMiddleware, canAccessCareer, canMutate, normalizeSectionType } from '../middleware/auth';
import { recordAudit, sectionRelationshipError, validateParentSelection } from '../services/scheduling';

export const sectionRoutes = new Hono<HonoEnv>();

sectionRoutes.get('/sections', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const assigned = c.req.query('assigned');
    const periodId = c.req.query('period_id') || null;
    const requestedCareerId = c.req.query('career_id') || null;
    if (requestedCareerId && !canAccessCareer(user, requestedCareerId)) {
        return c.json({ error: 'No autorizado' }, 403);
    }

    let query = `
    SELECT 
      s.*,
      sub.name as subject_name,
      sub.code as subject_code,
      sub.level,
      sub.career_id,
      t.name as teacher_name,
      t.rut as teacher_rut,
      parent.nrc as parent_nrc,
      parent_subject.name as parent_subject_name,
      (
        SELECT COUNT(*) FROM schedule_assignments sa
        WHERE sa.section_id = s.id
          AND sa.period_id = COALESCE(?, (SELECT id FROM periods WHERE is_active = 1 LIMIT 1))
      ) as assigned_slots
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    LEFT JOIN sections parent ON parent.id = s.parent_section_id
    LEFT JOIN subjects parent_subject ON parent_subject.id = parent.subject_id
    `;
    const params: any[] = [periodId, periodId];
    query += ' WHERE s.period_id = COALESCE(?, (SELECT id FROM periods WHERE is_active = 1 LIMIT 1))';

    if (user.role !== 'admin' && user.career_id) {
        query += ' AND s.career_id = ?';
        params.push(user.career_id);
    } else if (requestedCareerId) {
        query += ' AND s.career_id = ?';
        params.push(requestedCareerId);
    }
    query += ` ORDER BY s.priority DESC, sub.level, sub.name,
        COALESCE(parent.nrc, s.nrc), CASE WHEN s.parent_section_id IS NULL THEN 0 ELSE 1 END, s.section_code, s.nrc`;

    const sections = await db.prepare(query).bind(...params).all();

    let results = sections.results as any[];
    if (assigned === 'true') {
        results = results.filter((s: any) => s.assigned_slots >= s.hours_per_week);
    } else if (assigned === 'false') {
        results = results.filter((s: any) => s.assigned_slots < s.hours_per_week);
    }

    return c.json(results);
});

sectionRoutes.post('/sections', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    const periodId = String(body.period_id || '');
    const period = await c.env.DB.prepare('SELECT id FROM periods WHERE id = ?').bind(periodId).first();
    if (!period) return c.json({ error: 'Período académico inválido' }, 400);
    const subject = await c.env.DB.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(body.subject_id).first<{ career_id: string }>();
    if (!subject) return c.json({ error: 'Asignatura no encontrada' }, 404);
    if (!canAccessCareer(user, subject.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const id = `sec-${crypto.randomUUID()}`;
    const sectionType = normalizeSectionType(body.type);
    const parentSectionId = sectionType === 'TEO' ? null : String(body.parent_section_id || '') || null;
    const parentError = await validateParentSelection(c.env.DB, {
        sectionId: id,
        parentSectionId,
        type: sectionType,
        subjectId: String(body.subject_id),
        careerId: subject.career_id,
        periodId,
    });
    if (parentError) return c.json({ error: parentError }, 400);
    if (body.teacher_id) {
        const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ? AND is_active = 1')
            .bind(body.teacher_id).first<{ career_id: string }>();
        if (!teacher || teacher.career_id !== subject.career_id) return c.json({ error: 'Docente no válido para la carrera' }, 400);
    }
    try {
        await c.env.DB.prepare(`INSERT INTO sections (id, period_id, career_id, subject_id, teacher_id, nrc, section_code, type, parent_section_id, hours_per_week, expected_students, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(id, periodId, subject.career_id, body.subject_id, body.teacher_id || null, body.nrc,
                body.section_code || null, sectionType, parentSectionId, Number(body.hours_per_week || 2),
                Number(body.expected_students || 30), Number(body.priority || 0)).run();
    } catch (error) {
        if (String(error).toLowerCase().includes('unique')) return c.json({ error: 'El NRC ya existe para esta carrera y período' }, 409);
        return c.json({ error: sectionRelationshipError(error) }, 409);
    }
    return c.json({ id }, 201);
});

sectionRoutes.put('/sections/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const current = await c.env.DB.prepare('SELECT career_id, period_id, subject_id, type, parent_section_id FROM sections WHERE id = ?').bind(id).first<{
        career_id: string; period_id: string; subject_id: string; type: SectionType; parent_section_id: string | null;
    }>();
    if (!current) return c.json({ error: 'Sección no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, current.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    const targetSubject = await c.env.DB.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(body.subject_id).first<{ career_id: string }>();
    if (!targetSubject || targetSubject.career_id !== current.career_id) return c.json({ error: 'Asignatura no válida para la carrera' }, 400);
    if (body.teacher_id) {
        const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ? AND is_active = 1')
            .bind(body.teacher_id).first<{ career_id: string }>();
        if (!teacher || teacher.career_id !== current.career_id) return c.json({ error: 'Docente no válido para la carrera' }, 400);
    }
    const sectionType = normalizeSectionType(body.type);
    const childCount = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM sections WHERE parent_section_id = ?').bind(id).first<{ total: number }>();
    if ((childCount?.total || 0) > 0 && (sectionType !== 'TEO' || String(body.subject_id) !== current.subject_id)) {
        return c.json({ error: 'No se puede cambiar el tipo o la asignatura de una teoría que tiene prácticas asociadas' }, 409);
    }
    const requestedParent = Object.prototype.hasOwnProperty.call(body, 'parent_section_id')
        ? (String(body.parent_section_id || '') || null)
        : current.parent_section_id;
    const parentSectionId = sectionType === 'TEO' ? null : requestedParent;
    const parentError = await validateParentSelection(c.env.DB, {
        sectionId: id,
        parentSectionId,
        type: sectionType,
        subjectId: String(body.subject_id),
        careerId: current.career_id,
        periodId: current.period_id,
    });
    if (parentError) return c.json({ error: parentError }, 400);
    try {
        await c.env.DB.prepare(`UPDATE sections SET subject_id = ?, teacher_id = ?, nrc = ?, section_code = ?, type = ?,
            parent_section_id = ?, hours_per_week = ?, updated_at = datetime('now') WHERE id = ?`)
            .bind(body.subject_id, body.teacher_id || null, body.nrc, body.section_code || null, sectionType,
                parentSectionId, Number(body.hours_per_week || 2), id).run();
    } catch (error) {
        return c.json({ error: sectionRelationshipError(error) }, 409);
    }
    return c.json({ success: true });
});

sectionRoutes.put('/sections/:id/teacher', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const current = await c.env.DB.prepare('SELECT teacher_id, career_id FROM sections WHERE id = ?')
        .bind(id).first<{ teacher_id: string | null; career_id: string }>();
    if (!current) return c.json({ error: 'Sección no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, current.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<{ teacher_id?: string | null }>();
    const teacherId = body.teacher_id || null;
    if (teacherId) {
        const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ? AND is_active = 1')
            .bind(teacherId).first<{ career_id: string }>();
        if (!teacher || teacher.career_id !== current.career_id) return c.json({ error: 'Docente no válido para la carrera' }, 400);
    }
    await c.env.DB.prepare("UPDATE sections SET teacher_id = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(teacherId, id).run();
    await recordAudit(c.env.DB, user, 'UPDATE_TEACHER', 'section', id, { teacher_id: current.teacher_id, career_id: current.career_id }, { teacher_id: teacherId, career_id: current.career_id });
    return c.json({ success: true });
});

sectionRoutes.delete('/sections/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const current = await c.env.DB.prepare('SELECT career_id FROM sections WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!current) return c.json({ error: 'Sección no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, current.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const children = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM sections WHERE parent_section_id = ?').bind(id).first<{ total: number }>();
    if ((children?.total || 0) > 0) return c.json({ error: 'No se puede eliminar una sección teórica que todavía tiene prácticas asociadas' }, 409);
    await c.env.DB.prepare('DELETE FROM sections WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});
