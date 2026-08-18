import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware, isTime } from '../middleware/auth';

export const timeslotRoutes = new Hono<HonoEnv>();

timeslotRoutes.get('/timeslots', authMiddleware, async (c) => {
    const db = c.env.DB;
    const timeslots = await db.prepare('SELECT * FROM timeslots ORDER BY order_index').all();
    return c.json(timeslots.results);
});

timeslotRoutes.post('/timeslots', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<{ label?: string; start_time?: string; end_time?: string; order_index?: number }>();
    if (!body.label?.trim() || !isTime(body.start_time) || !isTime(body.end_time) || body.start_time! >= body.end_time!) {
        return c.json({ error: 'Datos de bloque inválidos' }, 400);
    }
    const id = `ts-${crypto.randomUUID()}`;
    await c.env.DB.prepare('INSERT INTO timeslots (id, label, start_time, end_time, order_index) VALUES (?, ?, ?, ?, ?)')
        .bind(id, body.label.trim(), body.start_time, body.end_time, Number(body.order_index || 1)).run();
    return c.json({ id }, 201);
});

timeslotRoutes.put('/timeslots/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id') as string;
    const body = await c.req.json<{ label?: string; start_time?: string; end_time?: string; order_index?: number }>();
    if (!body.label?.trim() || !isTime(body.start_time) || !isTime(body.end_time) || body.start_time! >= body.end_time!) {
        return c.json({ error: 'Datos de bloque inválidos' }, 400);
    }
    const result = await c.env.DB.prepare(`UPDATE timeslots SET label = ?, start_time = ?, end_time = ?, order_index = ? WHERE id = ?`)
        .bind(body.label.trim(), body.start_time, body.end_time, Number(body.order_index || 1), id).run();
    if (!result.meta.changes) return c.json({ error: 'Bloque no encontrado' }, 404);
    return c.json({ success: true });
});

timeslotRoutes.delete('/timeslots/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id') as string;
    const usage = await c.env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM schedule_assignments WHERE timeslot_id = ?) +
        (SELECT COUNT(*) FROM teacher_availability WHERE timeslot_id = ?) AS total`).bind(id, id).first<{ total: number }>();
    if ((usage?.total || 0) > 0) return c.json({ error: 'No se puede eliminar un bloque en uso' }, 409);
    await c.env.DB.prepare('DELETE FROM timeslots WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});
