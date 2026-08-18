import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware, canAccessCareer, canMutate } from '../middleware/auth';

export const subjectRoutes = new Hono<HonoEnv>();

subjectRoutes.get('/subjects', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const level = c.req.query('level');

    let query = 'SELECT * FROM subjects WHERE 1=1';
    const params: any[] = [];

    if (user.role !== 'admin' && user.career_id) {
        query += ' AND career_id = ?';
        params.push(user.career_id);
    }
    if (level) {
        query += ' AND level = ?';
        params.push(parseInt(level));
    }
    query += ' ORDER BY level, name';

    const subjects = await db.prepare(query).bind(...params).all();
    return c.json(subjects.results);
});

subjectRoutes.post('/subjects', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    const targetCareerId = user.career_id || String(body.career_id || await c.env.DB.prepare('SELECT id FROM careers ORDER BY name LIMIT 1').first<string>('id') || '');
    if (!targetCareerId) return c.json({ error: 'Carrera requerida' }, 400);
    const id = `sub-${crypto.randomUUID()}`;
    if (!body.code || !body.name) return c.json({ error: 'Código y nombre requeridos' }, 400);
    await c.env.DB.prepare('INSERT INTO subjects (id, career_id, code, name, level, credits) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, targetCareerId, String(body.code).toUpperCase(), body.name, Number(body.level || 1), Number(body.credits || 0)).run();
    return c.json({ id }, 201);
});

subjectRoutes.put('/subjects/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const subject = await c.env.DB.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!subject) return c.json({ error: 'Asignatura no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, subject.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    await c.env.DB.prepare(`UPDATE subjects SET code = ?, name = ?, level = ?, credits = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(String(body.code || '').toUpperCase(), body.name, Number(body.level || 1), Number(body.credits || 0), id).run();
    return c.json({ success: true });
});

subjectRoutes.delete('/subjects/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const subject = await c.env.DB.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!subject) return c.json({ error: 'Asignatura no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, subject.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const sections = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM sections WHERE subject_id = ?').bind(id).first<{ total: number }>();
    if ((sections?.total || 0) > 0) return c.json({ error: 'No se puede eliminar una asignatura con secciones asociadas' }, 409);
    await c.env.DB.prepare('DELETE FROM subjects WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// Get qualified teachers for this subject
subjectRoutes.get('/subjects/:id/teachers', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const teachers = await db.prepare(`
        SELECT ts.teacher_id, ts.subject_id, ts.priority, ts.max_sections,
               t.name AS teacher_name, t.rut AS teacher_rut, t.contract_type, t.email
        FROM teacher_subjects ts
        JOIN teachers t ON t.id = ts.teacher_id
        WHERE ts.subject_id = ? AND t.is_active = 1
        ORDER BY ts.priority, t.name
    `).bind(id).all();
    return c.json(teachers.results);
});

// Get compatible rooms for this subject
subjectRoutes.get('/subjects/:id/rooms', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const rooms = await db.prepare(`
        SELECT src.subject_id, src.room_id, src.requirement_level,
               r.name AS room_name, r.building, r.type AS room_type, r.capacity AS room_capacity
        FROM subject_room_compatibilities src
        JOIN rooms r ON r.id = src.room_id
        WHERE src.subject_id = ? AND r.is_active = 1
        ORDER BY CASE src.requirement_level WHEN 'EXCLUSIVE' THEN 1 WHEN 'PREFERRED' THEN 2 ELSE 3 END, r.name
    `).bind(id).all();
    return c.json(rooms.results);
});

// Update compatible rooms for this subject
subjectRoutes.put('/subjects/:id/rooms', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const user = c.get('user') as UserPayload;
    const { rooms } = await c.req.json<{ rooms?: Array<{ room_id: string; requirement_level?: 'EXCLUSIVE' | 'PREFERRED' | 'ALLOWED' }> }>();

    const subject = await db.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!subject) return c.json({ error: 'Asignatura no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, subject.career_id)) return c.json({ error: 'No autorizado' }, 403);
    if (!Array.isArray(rooms)) return c.json({ error: 'Lista de salas inválida' }, 400);

    try {
        await db.prepare('DELETE FROM subject_room_compatibilities WHERE subject_id = ?').bind(id).run();
        for (const item of rooms) {
            await db.prepare(`
                INSERT INTO subject_room_compatibilities (subject_id, room_id, requirement_level)
                VALUES (?, ?, ?)
            `).bind(id, item.room_id, item.requirement_level || 'ALLOWED').run();
        }
        return c.json({ success: true, count: rooms.length });
    } catch (error) {
        console.error('Update subject rooms error:', error);
        return c.json({ error: 'Error al actualizar salas compatibles' }, 500);
    }
});

// Get prerequisites for this subject
subjectRoutes.get('/subjects/:id/prerequisites', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const prereqs = await db.prepare(`
        SELECT sp.subject_id, sp.prerequisite_id, sp.type,
               s.code AS prerequisite_code, s.name AS prerequisite_name, s.level AS prerequisite_level
        FROM subject_prerequisites sp
        JOIN subjects s ON s.id = sp.prerequisite_id
        WHERE sp.subject_id = ?
        ORDER BY s.level, s.name
    `).bind(id).all();
    return c.json(prereqs.results);
});

// Update prerequisites for this subject
subjectRoutes.put('/subjects/:id/prerequisites', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id') as string;
    const user = c.get('user') as UserPayload;
    const { prerequisites } = await c.req.json<{ prerequisites?: Array<{ prerequisite_id: string; type?: 'MANDATORY' | 'COREQUISITE' | 'RECOMMENDED' }> }>();

    const subject = await db.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!subject) return c.json({ error: 'Asignatura no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, subject.career_id)) return c.json({ error: 'No autorizado' }, 403);
    if (!Array.isArray(prerequisites)) return c.json({ error: 'Lista de prerrequisitos inválida' }, 400);

    try {
        await db.prepare('DELETE FROM subject_prerequisites WHERE subject_id = ?').bind(id).run();
        for (const item of prerequisites) {
            if (item.prerequisite_id !== id) {
                await db.prepare(`
                    INSERT INTO subject_prerequisites (subject_id, prerequisite_id, type)
                    VALUES (?, ?, ?)
                `).bind(id, item.prerequisite_id, item.type || 'MANDATORY').run();
            }
        }
        return c.json({ success: true, count: prerequisites.length });
    } catch (error) {
        console.error('Update prerequisites error:', error);
        return c.json({ error: 'Error al actualizar prerrequisitos' }, 500);
    }
});
