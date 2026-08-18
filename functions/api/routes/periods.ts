import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware, isIsoDate } from '../middleware/auth';
import { ensureAutomaticPeriod, recordAudit } from '../services/scheduling';

export const periodRoutes = new Hono<HonoEnv>();

periodRoutes.get('/periods', authMiddleware, async (c) => {
    try {
        await ensureAutomaticPeriod(c.env.DB, c.env.ACADEMIC_TIMEZONE);
    } catch (error) {
        console.error('Automatic period provisioning failed:', error);
    }
    const periods = await c.env.DB.prepare(
        'SELECT id, code, name, start_date, end_date, is_active FROM periods ORDER BY start_date DESC, created_at DESC'
    ).all();
    return c.json(periods.results);
});

periodRoutes.post('/periods', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<{ code?: string; name?: string; start_date?: string; end_date?: string; is_active?: boolean }>();
    if (!body.code?.trim() || !body.name?.trim() || !isIsoDate(body.start_date) || !isIsoDate(body.end_date) || body.start_date! > body.end_date!) {
        return c.json({ error: 'Datos de período inválidos' }, 400);
    }
    const id = `per-${crypto.randomUUID()}`;
    if (body.is_active) await c.env.DB.prepare('UPDATE periods SET is_active = 0').run();
    await c.env.DB.prepare(`INSERT INTO periods (id, code, name, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(id, body.code.trim(), body.name.trim(), body.start_date, body.end_date, body.is_active ? 1 : 0).run();
    await recordAudit(c.env.DB, user, 'CREATE', 'period', id, null, { ...body, id });
    return c.json({ id }, 201);
});

periodRoutes.put('/periods/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id') as string;
    const existing = await c.env.DB.prepare('SELECT * FROM periods WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Período no encontrado' }, 404);
    const body = await c.req.json<{ code?: string; name?: string; start_date?: string; end_date?: string; is_active?: boolean }>();
    if (!body.code?.trim() || !body.name?.trim() || !isIsoDate(body.start_date) || !isIsoDate(body.end_date) || body.start_date! > body.end_date!) {
        return c.json({ error: 'Datos de período inválidos' }, 400);
    }
    if (body.is_active) await c.env.DB.prepare('UPDATE periods SET is_active = 0 WHERE id <> ?').bind(id).run();
    await c.env.DB.prepare(`UPDATE periods SET code = ?, name = ?, start_date = ?, end_date = ?, is_active = ? WHERE id = ?`)
        .bind(body.code.trim(), body.name.trim(), body.start_date, body.end_date, body.is_active ? 1 : 0, id).run();
    await recordAudit(c.env.DB, user, 'UPDATE', 'period', id, existing, body);
    return c.json({ success: true });
});

periodRoutes.delete('/periods/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id') as string;
    const assignments = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM schedule_assignments WHERE period_id = ?').bind(id).first<{ total: number }>();
    if ((assignments?.total || 0) > 0) return c.json({ error: 'No se puede eliminar un período con asignaciones' }, 409);
    await c.env.DB.prepare('DELETE FROM periods WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});
