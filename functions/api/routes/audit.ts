import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware } from '../middleware/auth';

export const auditRoutes = new Hono<HonoEnv>();

auditRoutes.get('/audit', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const periodId = c.req.query('period_id');
    let query = `SELECT al.*, u.name AS user_name FROM audit_log al LEFT JOIN users u ON u.id = al.user_id WHERE 1=1`;
    const params: unknown[] = [];
    if (user.role !== 'admin' && user.career_id) {
        query += ' AND al.career_id = ?';
        params.push(user.career_id);
    }
    if (periodId) {
        query += ` AND (al.entity_id = ? OR json_extract(al.new_value, '$.period_id') = ? OR json_extract(al.old_value, '$.period_id') = ?)`;
        params.push(periodId, periodId, periodId);
    }
    query += ' ORDER BY al.created_at DESC LIMIT 100';
    const rows = await c.env.DB.prepare(query).bind(...params).all();
    return c.json(rows.results);
});
