import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware } from '../middleware/auth';
import { recordAudit } from '../services/scheduling';

export const careerRoutes = new Hono<HonoEnv>();

careerRoutes.get('/careers', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const careers = user.role === 'admin'
        ? await db.prepare('SELECT * FROM careers ORDER BY name').all()
        : await db.prepare('SELECT * FROM careers WHERE id = ? ORDER BY name').bind(user.career_id).all();
    return c.json(careers.results);
});

careerRoutes.post('/careers', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<{ name?: string; code?: string }>();
    const name = body.name?.trim();
    const code = body.code?.trim().toUpperCase();
    if (!name || !code || name.length > 120 || !/^[A-Z0-9_-]{2,20}$/.test(code)) {
        return c.json({ error: 'Nombre o código de carrera inválido' }, 400);
    }
    const duplicate = await c.env.DB.prepare('SELECT id FROM careers WHERE code = ?').bind(code).first();
    if (duplicate) return c.json({ error: 'Ya existe una carrera con ese código' }, 409);
    const id = `car-${crypto.randomUUID()}`;
    await c.env.DB.prepare('INSERT INTO careers (id, faculty_id, name, code) VALUES (?, NULL, ?, ?)')
        .bind(id, name, code).run();
    await recordAudit(c.env.DB, user, 'CREATE', 'career', id, null, { id, career_id: id, name, code });
    return c.json({ id }, 201);
});

careerRoutes.put('/careers/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id') as string;
    const existing = await c.env.DB.prepare('SELECT id, name, code FROM careers WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Carrera no encontrada' }, 404);
    const body = await c.req.json<{ name?: string; code?: string }>();
    const name = body.name?.trim();
    const code = body.code?.trim().toUpperCase();
    if (!name || !code || name.length > 120 || !/^[A-Z0-9_-]{2,20}$/.test(code)) {
        return c.json({ error: 'Nombre o código de carrera inválido' }, 400);
    }
    const duplicate = await c.env.DB.prepare('SELECT id FROM careers WHERE code = ? AND id <> ?').bind(code, id).first();
    if (duplicate) return c.json({ error: 'Ya existe una carrera con ese código' }, 409);
    await c.env.DB.prepare("UPDATE careers SET name = ?, code = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(name, code, id).run();
    await recordAudit(c.env.DB, user, 'UPDATE', 'career', id, existing, { id, career_id: id, name, code });
    return c.json({ success: true });
});

careerRoutes.delete('/careers/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id') as string;
    const existing = await c.env.DB.prepare('SELECT id, name, code FROM careers WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Carrera no encontrada' }, 404);
    const usage = await c.env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM users WHERE career_id = ?) +
        (SELECT COUNT(*) FROM teachers WHERE career_id = ?) +
        (SELECT COUNT(*) FROM subjects WHERE career_id = ?) +
        (SELECT COUNT(*) FROM rooms WHERE career_id = ?) AS total`).bind(id, id, id, id).first<{ total: number }>();
    if ((usage?.total || 0) > 0) return c.json({ error: 'No se puede eliminar una carrera con datos asociados' }, 409);
    await c.env.DB.prepare('DELETE FROM careers WHERE id = ?').bind(id).run();
    await recordAudit(c.env.DB, user, 'DELETE', 'career', id, { ...(existing as object), career_id: id }, null);
    return c.json({ success: true });
});
