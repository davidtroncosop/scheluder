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
