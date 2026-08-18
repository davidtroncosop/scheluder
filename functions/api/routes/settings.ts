import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware, canAccessCareer, canMutate } from '../middleware/auth';

export const settingsRoutes = new Hono<HonoEnv>();

settingsRoutes.get('/settings', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const careerId = user.career_id || c.req.query('career_id');
    if (!careerId || !canAccessCareer(user, careerId)) return c.json({ error: 'Carrera requerida' }, 400);
    const row = await c.env.DB.prepare('SELECT settings FROM app_settings WHERE career_id = ?').bind(careerId).first<{ settings: string }>();
    return c.json(row ? JSON.parse(row.settings) : {});
});

settingsRoutes.put('/settings', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    const careerId = user.career_id || String(body.career_id || '');
    if (!careerId || !canAccessCareer(user, careerId)) return c.json({ error: 'Carrera requerida' }, 400);
    const { career_id: _, ...settings } = body;
    await c.env.DB.prepare(`INSERT INTO app_settings (career_id, settings, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(career_id) DO UPDATE SET settings = excluded.settings, updated_by = excluded.updated_by, updated_at = datetime('now')`)
        .bind(careerId, JSON.stringify(settings), user.id).run();
    return c.json({ success: true });
});
