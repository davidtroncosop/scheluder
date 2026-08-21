import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware, canAccessCareer, canMutate } from '../middleware/auth';
import {
    findBestAlternative,
    recordAudit,
    saveScheduleStatus,
    validateAssignment,
} from '../services/scheduling';

export const conflictRoutes = new Hono<HonoEnv>();

conflictRoutes.get('/conflicts', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const resolved = c.req.query('resolved');
    const periodId = c.req.query('period_id');
    const requestedCareerId = c.req.query('career_id');
    if (requestedCareerId && !canAccessCareer(user, requestedCareerId)) {
        return c.json({ error: 'No autorizado' }, 403);
    }

    let query = `
    SELECT 
      c.*,
      sa.day_of_week,
      sa.parallel_index,
      ts.label as timeslot_label,
      sub.name as subject_name,
      sec.nrc,
      t.name as teacher_name
    FROM conflicts c
    JOIN schedule_assignments sa ON sa.id = c.assignment_id
    JOIN sections sec ON sec.id = sa.section_id AND sec.period_id = sa.period_id
    JOIN subjects sub ON sub.id = sec.subject_id
    LEFT JOIN teachers t ON t.id = sec.teacher_id
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
    if (resolved !== undefined) {
        query += ' AND c.is_resolved = ?';
        params.push(resolved === 'true' ? 1 : 0);
    }
    query += ' ORDER BY c.type DESC, c.created_at DESC';

    const conflicts = await db.prepare(query).bind(...params).all();
    return c.json(conflicts.results);
});

conflictRoutes.post('/conflicts/:id/resolve', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const { auto_resolve, justification } = await c.req.json<{ auto_resolve?: boolean; justification?: string }>();

    const conflict = await db.prepare(`
        SELECT c.*, sa.section_id, sa.room_id, sa.timeslot_id, sa.day_of_week, sa.period_id
        FROM conflicts c
        JOIN schedule_assignments sa ON sa.id = c.assignment_id
        WHERE c.id = ?
    `).bind(id).first() as any;

    if (!conflict) {
        return c.json({ error: 'Conflicto no encontrado' }, 404);
    }
    const assignmentCareer = await db.prepare('SELECT career_id FROM schedule_assignments WHERE id = ?')
        .bind(conflict.assignment_id).first<{ career_id: string }>();
    if (!assignmentCareer || !canMutate(user) || !canAccessCareer(user, assignmentCareer.career_id)) {
        return c.json({ error: 'No autorizado' }, 403);
    }

    let resolution_action: string | null = null;

    if (auto_resolve) {
        const alternative = await findBestAlternative(db, conflict);
        if (!alternative) return c.json({ error: 'No existe una alternativa válida automática' }, 409);
        const before = { room_id: conflict.room_id, timeslot_id: conflict.timeslot_id, day_of_week: conflict.day_of_week, period_id: conflict.period_id };
        await db.prepare(`UPDATE schedule_assignments SET room_id = ?, timeslot_id = ?, day_of_week = ?, is_published = 0, updated_at = datetime('now') WHERE id = ?`)
            .bind(alternative.room_id, alternative.timeslot_id, alternative.day_of_week, conflict.assignment_id).run();
        await saveScheduleStatus(db, assignmentCareer.career_id, conflict.period_id, 'draft', user.id);
        resolution_action = `Movido a ${alternative.room_name}, ${alternative.timeslot_label}, día ${alternative.day_of_week}`;
        await recordAudit(db, user, 'RESOLVE', 'assignment', conflict.assignment_id, before, { ...alternative, period_id: conflict.period_id });
        await db.prepare(`UPDATE conflicts SET is_resolved = 1, resolved_by = ?, resolved_at = datetime('now'),
            resolution_type = 'automatic' WHERE assignment_id = ? AND is_resolved = 0`).bind(user.id, conflict.assignment_id).run();
        const remainingWarnings = await validateAssignment(db, {
            section_id: conflict.section_id,
            room_id: alternative.room_id,
            timeslot_id: alternative.timeslot_id,
            day_of_week: alternative.day_of_week,
            career_id: assignmentCareer.career_id,
            period_id: conflict.period_id,
            exclude_assignment_id: conflict.assignment_id,
        });
        for (const warning of remainingWarnings.filter(item => item.type === 'WARNING')) {
            await db.prepare(`INSERT INTO conflicts (id, assignment_id, type, rule_code, description)
                VALUES (?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), conflict.assignment_id, warning.type, warning.rule_code, warning.description).run();
        }
    } else {
        const reason = justification?.trim();
        if (!reason || reason.length < 10 || reason.length > 500) {
            return c.json({ error: 'Se requiere una justificación de entre 10 y 500 caracteres' }, 400);
        }
        await db.prepare(`UPDATE conflicts SET is_resolved = 1, resolved_by = ?, resolved_at = datetime('now'),
            resolution_type = 'accepted', resolution_justification = ? WHERE id = ?`)
            .bind(user.id, reason, id).run();
        resolution_action = 'Excepción aceptada con justificación';
        await recordAudit(db, user, 'ACCEPT_EXCEPTION', 'conflict', id, null, { justification: reason });
    }

    return c.json({ 
        success: true, 
        resolution_action,
        message: auto_resolve ? `Conflicto resuelto automáticamente: ${resolution_action}` : 'Conflicto marcado como resuelto'
    });
});
