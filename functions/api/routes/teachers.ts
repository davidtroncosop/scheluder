import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware, canAccessCareer, canMutate } from '../middleware/auth';

export const teacherRoutes = new Hono<HonoEnv>();

teacherRoutes.get('/teachers', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;

    let query = 'SELECT * FROM teachers WHERE is_active = 1';
    const params: any[] = [];

    if (user.role !== 'admin' && user.career_id) {
        query += ' AND career_id = ?';
        params.push(user.career_id);
    }
    query += ' ORDER BY name';

    const teachers = await db.prepare(query).bind(...params).all();
    return c.json(teachers.results);
});

teacherRoutes.get('/teachers-availabilities', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;

    let query = `
    SELECT ta.teacher_id, ta.day_of_week, ta.timeslot_id, ta.status, t.name as teacher_name
    FROM teacher_availability ta
    JOIN teachers t ON t.id = ta.teacher_id
    WHERE t.is_active = 1
    `;
    const params: any[] = [];
    if (user.role !== 'admin' && user.career_id) {
        query += ' AND t.career_id = ?';
        params.push(user.career_id);
    }
    query += ' ORDER BY ta.day_of_week, ta.timeslot_id';

    const availabilities = await db.prepare(query).bind(...params).all();
    return c.json(availabilities.results || []);
});

teacherRoutes.post('/teachers', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    const targetCareerId = user.career_id || String(body.career_id || await c.env.DB.prepare('SELECT id FROM careers ORDER BY name LIMIT 1').first<string>('id') || '');
    if (!targetCareerId) return c.json({ error: 'Carrera requerida' }, 400);
    const id = `tch-${crypto.randomUUID()}`;
    const name = String(body.name || '').trim();
    if (!name) return c.json({ error: 'Nombre requerido' }, 400);
    await c.env.DB.prepare(`INSERT INTO teachers (id, career_id, rut, name, email, contract_type, max_hours_per_week, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, targetCareerId, String(body.rut || `DEMO-${id}`), name, body.email || null,
            body.contract_type || 'Honorarios', Number(body.max_hours_per_week || 20), body.is_active === false ? 0 : 1).run();
    return c.json({ id }, 201);
});

teacherRoutes.put('/teachers/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!teacher) return c.json({ error: 'Docente no encontrado' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, teacher.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    await c.env.DB.prepare(`UPDATE teachers SET name = ?, email = ?, contract_type = ?, max_hours_per_week = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(body.name, body.email || null, body.contract_type || 'Honorarios', Number(body.max_hours_per_week || 20), body.is_active === false ? 0 : 1, id).run();
    return c.json({ success: true });
});

teacherRoutes.delete('/teachers/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!teacher) return c.json({ error: 'Docente no encontrado' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, teacher.career_id)) return c.json({ error: 'No autorizado' }, 403);
    await c.env.DB.prepare("UPDATE teachers SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(id).run();
    return c.json({ success: true });
});

teacherRoutes.get('/teachers/:id', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const user = c.get('user') as UserPayload;

    const teacher = await db.prepare(
        'SELECT * FROM teachers WHERE id = ?'
    ).bind(id).first();

    if (!teacher) {
        return c.json({ error: 'Docente no encontrado' }, 404);
    }
    if (!canAccessCareer(user, (teacher as { career_id?: string }).career_id)) {
        return c.json({ error: 'No autorizado' }, 403);
    }

    const availability = await db.prepare(`
    SELECT ta.*, ts.label, ts.start_time, ts.end_time
    FROM teacher_availability ta
    JOIN timeslots ts ON ts.id = ta.timeslot_id
    WHERE ta.teacher_id = ?
    ORDER BY ta.day_of_week, ts.order_index
  `).bind(id).all();

    return c.json({ ...teacher, availability: availability.results });
});

teacherRoutes.put('/teachers/:id/availability', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const user = c.get('user') as UserPayload;
    const { availability } = await c.req.json();

    const teacher = await db.prepare('SELECT career_id FROM teachers WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!teacher) return c.json({ error: 'Docente no encontrado' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, teacher.career_id)) return c.json({ error: 'No autorizado' }, 403);
    if (!Array.isArray(availability)) return c.json({ error: 'Disponibilidad inválida' }, 400);

    try {
        await db.prepare('DELETE FROM teacher_availability WHERE teacher_id = ?').bind(id).run();
        for (const slot of availability) {
            await db.prepare(`
        INSERT INTO teacher_availability (teacher_id, day_of_week, timeslot_id, status)
        VALUES (?, ?, ?, ?)
      `).bind(id, slot.day_of_week, slot.timeslot_id, slot.status).run();
        }
        return c.json({ success: true });
    } catch (error) {
        console.error('Update availability error:', error);
        return c.json({ error: 'Error al actualizar disponibilidad' }, 500);
    }
});

// Get subjects qualified for a teacher
teacherRoutes.get('/teachers/:id/subjects', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const subjects = await db.prepare(`
        SELECT ts.teacher_id, ts.subject_id, ts.priority, ts.max_sections,
               s.code AS subject_code, s.name AS subject_name, s.level AS subject_level
        FROM teacher_subjects ts
        JOIN subjects s ON s.id = ts.subject_id
        WHERE ts.teacher_id = ?
        ORDER BY ts.priority, s.level, s.name
    `).bind(id).all();
    return c.json(subjects.results);
});

// Update qualified subjects for a teacher
teacherRoutes.put('/teachers/:id/subjects', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const user = c.get('user') as UserPayload;
    const { subjects } = await c.req.json<{ subjects?: Array<{ subject_id: string; priority?: number; max_sections?: number }> }>();

    const teacher = await db.prepare('SELECT career_id FROM teachers WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!teacher) return c.json({ error: 'Docente no encontrado' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, teacher.career_id)) return c.json({ error: 'No autorizado' }, 403);
    if (!Array.isArray(subjects)) return c.json({ error: 'Lista de asignaturas inválida' }, 400);

    try {
        await db.prepare('DELETE FROM teacher_subjects WHERE teacher_id = ?').bind(id).run();
        for (const item of subjects) {
            await db.prepare(`
                INSERT INTO teacher_subjects (teacher_id, subject_id, priority, max_sections)
                VALUES (?, ?, ?, ?)
            `).bind(id, item.subject_id, Number(item.priority || 1), Number(item.max_sections || 4)).run();
        }
        return c.json({ success: true, count: subjects.length });
    } catch (error) {
        console.error('Update teacher subjects error:', error);
        return c.json({ error: 'Error al actualizar asignaturas habilitadas' }, 500);
    }
});
