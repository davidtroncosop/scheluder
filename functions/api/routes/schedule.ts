import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware, canAccessCareer, canMutate } from '../middleware/auth';
import {
    recordAudit,
    saveScheduleStatus,
    validateAssignment,
} from '../services/scheduling';
import {
    areDirectParentAndChild,
    shouldApplyLevelClash,
    type SectionRelationshipIdentity,
} from '../../../features/scheduler/relationships';

export const scheduleRoutes = new Hono<HonoEnv>();

scheduleRoutes.get('/schedule', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const periodId = c.req.query('period_id');
    const requestedCareerId = c.req.query('career_id');
    if (requestedCareerId && !canAccessCareer(user, requestedCareerId)) {
        return c.json({ error: 'No autorizado' }, 403);
    }

    let query = `
    SELECT 
      sa.*,
      sec.nrc,
      sec.section_code,
      sec.type as section_type,
      sub.name as subject_name,
      sub.code as subject_code,
      sub.level,
      t.name as teacher_name,
      t.id as teacher_id,
      r.name as room_name,
      r.type as room_type,
      ts.label as timeslot_label,
      ts.start_time,
      ts.end_time
    FROM schedule_assignments sa
    JOIN sections sec ON sec.id = sa.section_id AND sec.period_id = sa.period_id
    JOIN subjects sub ON sub.id = sec.subject_id
    LEFT JOIN teachers t ON t.id = sec.teacher_id
    LEFT JOIN rooms r ON r.id = sa.room_id
    JOIN timeslots ts ON ts.id = sa.timeslot_id
    WHERE 1=1
    `;
    const params: any[] = [];

    if (user.role !== 'admin' && user.career_id) {
        query += ' AND sa.career_id = ?';
        params.push(user.career_id);
    } else if (requestedCareerId) {
        query += ' AND sa.career_id = ?';
        params.push(requestedCareerId);
    }
    if (periodId) {
        query += ' AND sa.period_id = ?';
        params.push(periodId);
    }
    query += ' ORDER BY sa.day_of_week, ts.order_index';

    const assignments = await db.prepare(query).bind(...params).all();
    return c.json(assignments.results);
});

scheduleRoutes.get('/schedule/status', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const periodId = c.req.query('period_id');
    if (!periodId) return c.json({ error: 'period_id requerido' }, 400);
    const careerId = user.career_id || c.req.query('career_id');
    if (careerId && !canAccessCareer(user, careerId)) return c.json({ error: 'No autorizado' }, 403);
    if (careerId) {
        const row = await c.env.DB.prepare('SELECT status FROM schedule_statuses WHERE career_id = ? AND period_id = ?')
            .bind(careerId, periodId).first<{ status: 'draft' | 'review' | 'published' }>();
        return c.json({ status: row?.status || 'draft' });
    }
    let query = 'SELECT COUNT(*) AS total, SUM(is_published) AS published FROM schedule_assignments WHERE period_id = ?';
    const params: unknown[] = [periodId];
    if (user.role !== 'admin' && user.career_id) {
        query += ' AND career_id = ?';
        params.push(user.career_id);
    }
    const result = await c.env.DB.prepare(query).bind(...params).first<{ total: number; published: number | null }>();
    const total = result?.total || 0;
    return c.json({ status: total > 0 && result?.published === total ? 'published' : 'draft' });
});

scheduleRoutes.put('/schedule/status', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<{ period_id?: string; career_id?: string; status?: 'draft' | 'review' }>();
    const careerId = user.career_id || body.career_id;
    if (!body.period_id || !careerId || !['draft', 'review'].includes(body.status || '') || !canAccessCareer(user, careerId)) {
        return c.json({ error: 'Datos de estado inválidos' }, 400);
    }
    await saveScheduleStatus(c.env.DB, careerId, body.period_id, body.status!, user.id);
    await recordAudit(c.env.DB, user, 'STATUS_CHANGE', 'period', body.period_id, null, { career_id: careerId, status: body.status });
    return c.json({ success: true, status: body.status });
});

scheduleRoutes.post('/schedule/publish', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const { period_id, career_id } = await c.req.json<{ period_id?: string; career_id?: string }>();
    let targetCareerId = user.career_id || career_id;
    if (!targetCareerId && user.role === 'admin') {
        const careers = await c.env.DB.prepare('SELECT DISTINCT career_id FROM sections WHERE period_id = ? LIMIT 2')
            .bind(period_id).all<{ career_id: string }>();
        if (careers.results.length === 1) targetCareerId = careers.results[0].career_id;
    }
    if (!period_id || !targetCareerId || !canAccessCareer(user, targetCareerId)) return c.json({ error: 'period_id y carrera requeridos' }, 400);

    let conflictQuery = `SELECT COUNT(*) AS total FROM conflicts c
        JOIN schedule_assignments sa ON sa.id = c.assignment_id
        WHERE sa.period_id = ? AND c.type = 'CRITICAL' AND c.is_resolved = 0`;
    const params: unknown[] = [period_id, targetCareerId];
    conflictQuery += ' AND sa.career_id = ?';
    const conflicts = await c.env.DB.prepare(conflictQuery).bind(...params).first<{ total: number }>();
    if ((conflicts?.total || 0) > 0) return c.json({ error: 'Hay conflictos críticos pendientes' }, 409);

    const required = await c.env.DB.prepare(`SELECT COALESCE(SUM(s.hours_per_week), 0) AS total
        FROM sections s WHERE s.career_id = ? AND s.period_id = ?`)
        .bind(targetCareerId, period_id).first<{ total: number }>();
    const assigned = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM schedule_assignments
        WHERE period_id = ? AND career_id = ?`).bind(period_id, targetCareerId).first<{ total: number }>();
    if ((assigned?.total || 0) < (required?.total || 0)) {
        return c.json({ error: `Horario incompleto: ${assigned?.total || 0} de ${required?.total || 0} módulos asignados` }, 409);
    }

    const update = 'UPDATE schedule_assignments SET is_published = 1, updated_at = datetime(\'now\') WHERE period_id = ? AND career_id = ?';
    await c.env.DB.prepare(update).bind(...params).run();
    await saveScheduleStatus(c.env.DB, targetCareerId, period_id, 'published', user.id);
    await recordAudit(c.env.DB, user, 'PUBLISH', 'period', period_id, null, { career_id: targetCareerId, is_published: true });
    return c.json({ success: true, status: 'published' });
});

scheduleRoutes.post('/schedule/assign', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const { section_id, room_id, timeslot_id, day_of_week, period_id, parallel_index } = await c.req.json();

    try {
        const section = await db.prepare(`
            SELECT s.id, s.period_id, s.career_id
            FROM sections s
            WHERE s.id = ? AND s.period_id = ?
        `).bind(section_id, period_id).first() as any;

        if (!section) {
            return c.json({ error: 'Sección no encontrada' }, 404);
        }

        const targetCareerId = section.career_id;
        if (!canMutate(user) || !canAccessCareer(user, targetCareerId)) {
            return c.json({ error: 'No autorizado' }, 403);
        }
        if (!period_id || !timeslot_id || !room_id || !Number.isInteger(day_of_week) || day_of_week < 1 || day_of_week > 5) {
            return c.json({ error: 'Datos de asignación inválidos' }, 400);
        }
        const [period, room, timeslot] = await Promise.all([
            db.prepare('SELECT id FROM periods WHERE id = ?').bind(period_id).first(),
            db.prepare('SELECT career_id, is_shared FROM rooms WHERE id = ? AND is_active = 1').bind(room_id).first<{ career_id: string | null; is_shared: number }>(),
            db.prepare('SELECT id FROM timeslots WHERE id = ?').bind(timeslot_id).first(),
        ]);
        if (!period || !room || !timeslot) return c.json({ error: 'Período, sala o bloque no válido' }, 400);
        if (!room.is_shared && room.career_id !== targetCareerId) return c.json({ error: 'La sala no pertenece a la carrera' }, 403);

        const conflicts = await validateAssignment(db, {
            section_id,
            room_id,
            timeslot_id,
            day_of_week,
            career_id: targetCareerId,
            period_id,
            parallel_index: parallel_index || 0,
        });

        const criticalConflicts = conflicts.filter(c => c.type === 'CRITICAL');
        if (criticalConflicts.length > 0) {
            return c.json({
                error: 'Conflictos críticos detectados',
                conflicts: criticalConflicts
            }, 400);
        }

        const id = crypto.randomUUID();
        await db.prepare(`
      INSERT INTO schedule_assignments 
      (id, career_id, period_id, section_id, room_id, timeslot_id, day_of_week, parallel_index, assigned_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, targetCareerId, period_id, section_id, room_id, timeslot_id, day_of_week, parallel_index || 0, user.id).run();
        await saveScheduleStatus(db, targetCareerId, period_id, 'draft', user.id);
        await recordAudit(db, user, 'ASSIGN', 'assignment', id, null, { section_id, room_id, timeslot_id, day_of_week, parallel_index: parallel_index || 0, period_id });

        for (const conflict of conflicts.filter(c => c.type === 'WARNING')) {
            await db.prepare(`
        INSERT INTO conflicts (id, assignment_id, type, rule_code, description)
        VALUES (?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), id, conflict.type, conflict.rule_code, conflict.description).run();
        }

        return c.json({ id, warnings: conflicts.filter(c => c.type === 'WARNING') }, 201);
    } catch (error) {
        console.error('Assign error:', error);
        if (String(error).includes('PARENT_CHILD_SCHEDULE_OVERLAP')) {
            return c.json({
                error: 'Conflictos críticos detectados',
                conflicts: [{
                    type: 'CRITICAL',
                    rule_code: 'PARENT_CHILD_OVERLAP',
                    description: 'La teoría y su práctica asociada no pueden programarse en el mismo horario',
                }],
            }, 409);
        }
        return c.json({ error: 'Error al asignar' }, 500);
    }
});

scheduleRoutes.delete('/schedule/:id', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const user = c.get('user') as UserPayload;

    try {
        const assignment = await db.prepare('SELECT career_id, period_id FROM schedule_assignments WHERE id = ?').bind(id).first<{ career_id: string; period_id: string }>();
        if (!assignment) return c.json({ error: 'Asignación no encontrada' }, 404);
        if (!canMutate(user) || !canAccessCareer(user, assignment.career_id)) return c.json({ error: 'No autorizado' }, 403);
        await db.prepare('DELETE FROM conflicts WHERE assignment_id = ?').bind(id).run();
        await db.prepare('DELETE FROM schedule_assignments WHERE id = ?').bind(id).run();
        await saveScheduleStatus(db, assignment.career_id, assignment.period_id, 'draft', user.id);
        await recordAudit(db, user, 'DELETE', 'assignment', id, assignment, null);
        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: 'Error al eliminar' }, 500);
    }
});

scheduleRoutes.put('/schedule/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const assignment = await c.env.DB.prepare(`SELECT career_id, section_id, room_id, timeslot_id, day_of_week, period_id
        FROM schedule_assignments WHERE id = ?`).bind(id).first<{
            career_id: string; section_id: string; room_id: string; timeslot_id: string;
            day_of_week: number; period_id: string;
        }>();
    if (!assignment) return c.json({ error: 'Asignación no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, assignment.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();

    const roomId = typeof body.room_id === 'string' ? body.room_id : assignment.room_id;
    const timeslotId = typeof body.timeslot_id === 'string' ? body.timeslot_id : assignment.timeslot_id;
    const dayOfWeek = body.day_of_week === undefined ? assignment.day_of_week : Number(body.day_of_week);
    const teacherId = 'teacher_id' in body ? (body.teacher_id ? String(body.teacher_id) : null) : undefined;
    if (!roomId || !timeslotId || !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 5) {
        return c.json({ error: 'Datos de asignación inválidos' }, 400);
    }

    const room = await c.env.DB.prepare('SELECT career_id, is_shared FROM rooms WHERE id = ? AND is_active = 1')
        .bind(roomId).first<{ career_id: string | null; is_shared: number }>();
    if (!room || (!room.is_shared && room.career_id !== assignment.career_id)) {
        return c.json({ error: 'Sala no válida para la carrera' }, 400);
    }
    if (teacherId) {
        const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ? AND is_active = 1')
            .bind(teacherId).first<{ career_id: string }>();
        if (!teacher || teacher.career_id !== assignment.career_id) return c.json({ error: 'Docente no válido para la carrera' }, 400);
    }

    const conflicts = await validateAssignment(c.env.DB, {
        section_id: assignment.section_id,
        room_id: roomId,
        timeslot_id: timeslotId,
        day_of_week: dayOfWeek,
        career_id: assignment.career_id,
        period_id: assignment.period_id,
        parallel_index: body.parallel_index !== undefined ? Number(body.parallel_index) : ((assignment as any).parallel_index ?? 0),
        exclude_assignment_id: id,
        teacher_id_override: teacherId,
    });
    const critical = conflicts.filter(conflict => conflict.type === 'CRITICAL');
    if (critical.length > 0) return c.json({ error: 'Conflictos críticos detectados', conflicts: critical }, 409);

    try {
        await c.env.DB.prepare(`UPDATE schedule_assignments SET room_id = ?, timeslot_id = ?, day_of_week = ?,
            is_published = 0, updated_at = datetime('now') WHERE id = ?`).bind(roomId, timeslotId, dayOfWeek, id).run();
    } catch (error) {
        if (String(error).includes('PARENT_CHILD_SCHEDULE_OVERLAP')) {
            return c.json({ error: 'La teoría y su práctica asociada no pueden programarse en el mismo horario' }, 409);
        }
        throw error;
    }
    await saveScheduleStatus(c.env.DB, assignment.career_id, assignment.period_id, 'draft', user.id);
    if ('teacher_id' in body) await c.env.DB.prepare("UPDATE sections SET teacher_id = ?, updated_at = datetime('now') WHERE id = ?").bind(teacherId, assignment.section_id).run();
    await c.env.DB.prepare('UPDATE conflicts SET is_resolved = 1, resolved_at = datetime(\'now\') WHERE assignment_id = ? AND is_resolved = 0').bind(id).run();
    for (const warning of conflicts.filter(conflict => conflict.type === 'WARNING')) {
        await c.env.DB.prepare(`INSERT INTO conflicts (id, assignment_id, type, rule_code, description)
            VALUES (?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, warning.type, warning.rule_code, warning.description).run();
    }
    await recordAudit(c.env.DB, user, 'UPDATE', 'assignment', id, assignment, body);
    return c.json({ success: true, warnings: conflicts.filter(conflict => conflict.type === 'WARNING') });
});

scheduleRoutes.get('/schedule/score', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const section_id = c.req.query('section_id');
    const period_id = c.req.query('period_id');

    if (!section_id || !period_id) {
        return c.json({ error: 'section_id y period_id requeridos' }, 400);
    }

    const section = await db.prepare(`
    SELECT s.*, sub.level, s.career_id, t.id as teacher_id
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    WHERE s.id = ? AND s.period_id = ?
  `).bind(section_id, period_id).first() as any;

    if (!section) {
        return c.json({ error: 'Sección no encontrada' }, 404);
    }
    if (!canAccessCareer(user, section.career_id)) {
        return c.json({ error: 'No autorizado' }, 403);
    }

    const timeslots = await db.prepare('SELECT * FROM timeslots ORDER BY order_index').all();
    const rooms = await db.prepare(`
    SELECT * FROM rooms 
    WHERE is_active = 1 AND (is_shared = 1 OR career_id = ?)
  `).bind(section.career_id).all();

    const assignments = await db.prepare(`SELECT sa.id, sa.room_id, sa.timeslot_id, sa.day_of_week, sa.parallel_index,
        sec.id AS section_id, sec.parent_section_id, sec.teacher_id, sub.level, sub.career_id
        FROM schedule_assignments sa
        JOIN sections sec ON sec.id = sa.section_id AND sec.period_id = sa.period_id
        JOIN subjects sub ON sub.id = sec.subject_id
        WHERE sa.period_id = ?`).bind(period_id).all();
    const availability = section.teacher_id
        ? await db.prepare(`SELECT timeslot_id, day_of_week, status FROM teacher_availability WHERE teacher_id = ?`).bind(section.teacher_id).all()
        : { results: [] } as any;
    const roomCompatibilities = section.subject_id
        ? await db.prepare(`
            SELECT src.room_id, src.requirement_level, r.type as room_type
            FROM subject_room_compatibilities src
            JOIN rooms r ON r.id = src.room_id
            WHERE src.subject_id = ?
        `).bind(section.subject_id).all()
        : { results: [] } as any;

    const rows = assignments.results as any[];
    const targetRelationship: SectionRelationshipIdentity = { id: section.id, parent_section_id: section.parent_section_id };
    const roomBusy = new Set(rows.map(row => `${row.room_id}:${row.timeslot_id}:${row.day_of_week}`));
    const teacherBusy = new Set(rows.filter(row => row.teacher_id === section.teacher_id).map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const parentChildBusy = new Set(rows
        .filter(row => areDirectParentAndChild(targetRelationship, { id: row.section_id, parent_section_id: row.parent_section_id }))
        .map(row => `${row.timeslot_id}:${row.day_of_week}`));

    const levelAssignmentsBySlot = new Map<string, any[]>();
    rows.filter(row => (
        row.level === section.level &&
        row.career_id === section.career_id &&
        shouldApplyLevelClash(targetRelationship, { id: row.section_id, parent_section_id: row.parent_section_id })
    )).forEach(row => {
        const key = `${row.timeslot_id}:${row.day_of_week}`;
        const existing = levelAssignmentsBySlot.get(key) || [];
        existing.push(row);
        levelAssignmentsBySlot.set(key, existing);
    });

    const blocked = new Set((availability.results as any[]).filter(row => row.status === 'blocked').map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const preferred = new Set((availability.results as any[]).filter(row => row.status === 'preference').map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const orderById = new Map((timeslots.results as any[]).map(row => [row.id, row.order_index]));

    const isTypeCompatible = (secType?: string, rmType?: string) => {
        const s = (secType || 'TEO').toUpperCase();
        const r = (rmType || 'TEO').toUpperCase();
        if (s === 'LAB') return r === 'LAB' || r === 'SIM';
        if (s === 'SIM') return r === 'SIM';
        if (s === 'TAL') return r === 'TAL';
        return r === 'TEO' || r === 'AUD';
    };

    const relevantReqs = (roomCompatibilities.results as any[]).filter(r => isTypeCompatible(section.type, r.room_type));
    const exclusiveRoomIds = relevantReqs.filter(r => r.requirement_level === 'EXCLUSIVE').map(r => r.room_id);
    const preferredRoomIds = new Set(relevantReqs.filter(r => r.requirement_level === 'PREFERRED').map(r => r.room_id));

    const scores: any[] = [];

    for (const ts of timeslots.results as any[]) {
        for (let day = 1; day <= 5; day++) {
            const slotKey = `${ts.id}:${day}`;
            const levelRows = levelAssignmentsBySlot.get(slotKey) || [];

            // Hard constraint: Maximum 3 parallel sections per level in a single timeslot
            if (levelRows.length >= 3) continue;

            // Determine next free parallel track index (0, 1, or 2)
            const occupiedIndices = levelRows.map(r => r.parallel_index ?? 0);
            let nextParallelIndex = 0;
            while (occupiedIndices.includes(nextParallelIndex) && nextParallelIndex < 3) {
                nextParallelIndex++;
            }
            if (nextParallelIndex >= 3) continue;

            for (const room of rooms.results as any[]) {
                // Strict Hard Constraints - Skip any invalid or conflicting slot
                if (roomBusy.has(`${room.id}:${slotKey}`)) continue;
                if (teacherBusy.has(slotKey) || blocked.has(slotKey)) continue;
                if (parentChildBusy.has(slotKey)) continue;
                if (section.expected_students && room.capacity < section.expected_students) continue;
                if (!isTypeCompatible(section.type, room.type)) continue;
                if (exclusiveRoomIds.length > 0 && !exclusiveRoomIds.includes(room.id)) continue;

                let score = 100;
                const breakdown: Array<{ rule: string; points: number }> = [];

                // 1. PRIMARY OBJECTIVE FUNCTION: Minimize gaps / ventanas at the Section Cohort level
                const sectionTrackRows = rows.filter(row =>
                    row.level === section.level &&
                    row.career_id === section.career_id &&
                    Number(row.parallel_index ?? 0) === nextParallelIndex &&
                    row.day_of_week === day &&
                    row.section_id !== section.id
                );

                const sectionOrders = sectionTrackRows
                    .map(row => orderById.get(row.timeslot_id) as number)
                    .filter(order => order !== undefined);

                if (sectionOrders.length > 0) {
                    const minDistance = Math.min(...sectionOrders.map(o => Math.abs(o - ts.order_index)));
                    const minOrder = Math.min(...sectionOrders);
                    const maxOrder = Math.max(...sectionOrders);

                    if (minDistance === 1) {
                        // Immediately adjacent -> 0 gaps/ventanas
                        const isBridging = ts.order_index > minOrder && ts.order_index < maxOrder;
                        if (isBridging) {
                            score += 55;
                            breakdown.push({ rule: `Cierra ventana intermedia en Sección ${nextParallelIndex + 1} (bloque compacto)`, points: 55 });
                        } else {
                            score += 45;
                            breakdown.push({ rule: `Clase contigua en Sección ${nextParallelIndex + 1} (0 ventanas)`, points: 45 });
                        }
                    } else {
                        // Creates an unwanted gap/ventana in the section's day
                        const gap = minDistance - 1;
                        const penalty = gap === 1 ? -40 : gap === 2 ? -70 : -100;
                        score += penalty;
                        breakdown.push({
                            rule: `Ventana de ${gap} módulo(s) libre(s) en Sección ${nextParallelIndex + 1}`,
                            points: penalty,
                        });
                    }
                } else {
                    // First class of the day for this section track: reward standard compact cluster starts
                    if (ts.order_index === 1 || ts.order_index === 2) {
                        score += 20;
                        breakdown.push({ rule: `Inicio de bloque matutino compacto (Sección ${nextParallelIndex + 1})`, points: 20 });
                    } else if (ts.order_index === 5) {
                        score += 15;
                        breakdown.push({ rule: `Inicio de bloque vespertino compacto (Sección ${nextParallelIndex + 1})`, points: 15 });
                    } else if (ts.order_index >= 3 && ts.order_index <= 4) {
                        score -= 10;
                        breakdown.push({ rule: `Módulo intermedio aislado (puede inducir ventanas)`, points: -10 });
                    }
                }

                // 2. SECONDARY OBJECTIVE: Minimize Teacher Windows & Honor Preferences
                if (section.teacher_id) {
                    const teacherOrders = rows
                        .filter(row => row.teacher_id === section.teacher_id && row.day_of_week === day && row.section_id !== section.id)
                        .map(row => orderById.get(row.timeslot_id) as number)
                        .filter(order => order !== undefined);

                    if (teacherOrders.length > 0) {
                        const minTeacherDist = Math.min(...teacherOrders.map(o => Math.abs(o - ts.order_index)));
                        if (minTeacherDist === 1) {
                            score += 25;
                            breakdown.push({ rule: 'Clase consecutiva para el docente (reduce ventanas)', points: 25 });
                        } else {
                            const teacherGap = minTeacherDist - 1;
                            const teacherPenalty = Math.min(45, teacherGap * 20);
                            score -= teacherPenalty;
                            breakdown.push({ rule: `Ventana de ${teacherGap} módulo(s) para el docente`, points: -teacherPenalty });
                        }
                    }

                    if (preferred.has(slotKey)) {
                        score += 20;
                        breakdown.push({ rule: 'Preferencia horaria del docente', points: 20 });
                    }
                }

                // 3. Room Infrastructure Match
                if (section.type === room.type) {
                    score += 25;
                    breakdown.push({ rule: 'Tipo de sala exacto', points: 25 });
                }

                if (preferredRoomIds.has(room.id)) {
                    score += 20;
                    breakdown.push({ rule: 'Sala preferente para la asignatura', points: 20 });
                }

                // 4. Optimal Capacity fit bonus / penalty
                if (section.expected_students > 0) {
                    const ratio = room.capacity / section.expected_students;
                    if (ratio >= 1.0 && ratio <= 1.35) {
                        score += 15;
                        breakdown.push({ rule: 'Aforo óptimo y eficiente', points: 15 });
                    } else if (ratio > 2.5) {
                        score -= 15;
                        breakdown.push({ rule: 'Sala sobredimensionada', points: -15 });
                    }
                }

                // 5. Friday late afternoon penalty
                if (day === 5 && ts.order_index >= 6) {
                    score -= 15;
                    breakdown.push({ rule: 'Viernes último módulo', points: -15 });
                }

                scores.push({
                    timeslot_id: ts.id,
                    timeslot_label: ts.label,
                    day_of_week: day,
                    room_id: room.id,
                    room_name: room.name,
                    parallel_index: nextParallelIndex,
                    score: Math.max(1, Math.min(100, score)),
                    breakdown,
                    blocked: false,
                });
            }
        }
    }

    scores.sort((a, b) => b.score - a.score);
    return c.json(scores);
});
