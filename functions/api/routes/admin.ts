import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware } from '../middleware/auth';
import { ensureAutomaticPeriod, recordAudit } from '../services/scheduling';
import { hashPassword } from '../../../features/auth/security';

export const adminRoutes = new Hono<HonoEnv>();

// Mounted on /admin/overview
adminRoutes.get('/admin/overview', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);

    await ensureAutomaticPeriod(c.env.DB, c.env.ACADEMIC_TIMEZONE);
    const requestedPeriod = c.req.query('period_id');
    const activePeriod = await c.env.DB.prepare(
        'SELECT id, code, name, start_date, end_date, is_active FROM periods WHERE is_active = 1 ORDER BY start_date DESC LIMIT 1'
    ).first<{ id: string; code: string; name: string; start_date: string; end_date: string; is_active: number }>();
    const periodId = requestedPeriod || activePeriod?.id || '';

    const [totals, careers, period] = await Promise.all([
        c.env.DB.prepare(`SELECT
            (SELECT COUNT(*) FROM careers) AS careers,
            (SELECT COUNT(*) FROM users WHERE is_active = 1 AND account_status = 'active') AS active_users,
            (SELECT COUNT(*) FROM users WHERE account_status = 'pending') AS pending_users,
            (SELECT COUNT(*) FROM teachers WHERE is_active = 1) AS teachers,
            (SELECT COUNT(*) FROM rooms WHERE is_active = 1) AS rooms,
            (SELECT COUNT(*) FROM subjects) AS subjects,
            (SELECT COUNT(*) FROM sections WHERE period_id = ?) AS sections,
            (SELECT COALESCE(SUM(s.hours_per_week), 0)
                FROM sections s WHERE s.period_id = ?) AS required_slots,
            (SELECT COUNT(*) FROM schedule_assignments WHERE period_id = ?) AS assigned_slots,
            (SELECT COUNT(*) FROM schedule_assignments WHERE period_id = ? AND is_published = 1) AS published_slots,
            (SELECT COUNT(*)
                FROM conflicts c
                JOIN schedule_assignments sa ON sa.id = c.assignment_id
                WHERE sa.period_id = ? AND c.is_resolved = 0) AS active_conflicts`)
            .bind(periodId, periodId, periodId, periodId, periodId).first(),
        c.env.DB.prepare(`SELECT
            c.id, c.name, c.code,
            (SELECT COUNT(*) FROM subjects sub WHERE sub.career_id = c.id) AS subjects,
            (SELECT COUNT(*) FROM sections s WHERE s.career_id = c.id AND s.period_id = ?) AS sections,
            (SELECT COALESCE(SUM(s.hours_per_week), 0)
                FROM sections s WHERE s.career_id = c.id AND s.period_id = ?) AS required_slots,
            (SELECT COUNT(*) FROM teachers t WHERE t.career_id = c.id AND t.is_active = 1) AS teachers,
            (SELECT COUNT(*) FROM rooms r WHERE r.career_id = c.id AND r.is_active = 1) AS rooms,
            (SELECT COUNT(*) FROM schedule_assignments sa WHERE sa.career_id = c.id AND sa.period_id = ?) AS assigned_slots,
            (SELECT COUNT(*) FROM schedule_assignments sa WHERE sa.career_id = c.id AND sa.period_id = ? AND sa.is_published = 1) AS published_slots,
            (SELECT COUNT(*)
                FROM conflicts conflict
                JOIN schedule_assignments sa ON sa.id = conflict.assignment_id
                WHERE sa.career_id = c.id AND sa.period_id = ? AND conflict.is_resolved = 0) AS active_conflicts,
            COALESCE((SELECT status FROM schedule_statuses ss WHERE ss.career_id = c.id AND ss.period_id = ? LIMIT 1), 'draft') AS schedule_status
            FROM careers c ORDER BY c.name`)
            .bind(periodId, periodId, periodId, periodId, periodId, periodId).all(),
        periodId
            ? c.env.DB.prepare('SELECT id, code, name, start_date, end_date, is_active FROM periods WHERE id = ?').bind(periodId).first()
            : Promise.resolve(null),
    ]);

    return c.json({ period, totals, careers: careers.results });
});

// Mounted on /users
adminRoutes.get('/users', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const rows = await c.env.DB.prepare(
        'SELECT id, email, name, role, career_id, is_active, account_status, created_at FROM users ORDER BY created_at DESC LIMIT 500'
    ).all();
    return c.json(rows.results);
});

adminRoutes.post('/users', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<{ email?: string; name?: string; password?: string; role?: string; career_id?: string | null }>();
    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!email || !name || !body.password || body.password.length < 12 || body.password.length > 256 || !/^\S+@\S+\.\S+$/.test(email) || !['admin', 'coordinator', 'viewer'].includes(body.role || '')) {
        return c.json({ error: 'Datos de usuario inválidos' }, 400);
    }
    const duplicate = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (duplicate) return c.json({ error: 'Ya existe un usuario con ese correo' }, 409);
    if (body.role !== 'admin' && !body.career_id) return c.json({ error: 'La carrera es requerida para este rol' }, 400);
    if (body.career_id) {
        const career = await c.env.DB.prepare('SELECT id FROM careers WHERE id = ?').bind(body.career_id).first();
        if (!career) return c.json({ error: 'Carrera inválida' }, 400);
    }
    const id = `usr-${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(body.password);
    await c.env.DB.prepare(`INSERT INTO users (id, email, name, password_hash, role, career_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)`).bind(id, email, name, passwordHash, body.role, body.role === 'admin' ? null : body.career_id).run();
    await recordAudit(c.env.DB, user, 'CREATE', 'user', id, null, { email, name, role: body.role, career_id: body.career_id });
    return c.json({ id }, 201);
});

adminRoutes.put('/users/:id', authMiddleware, async (c) => {
    const actor = c.get('user') as UserPayload;
    if (actor.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id') as string;
    const existing = await c.env.DB.prepare('SELECT id, email, name, role, career_id, is_active, account_status FROM users WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Usuario no encontrado' }, 404);
    const body = await c.req.json<{ name?: string; role?: string; career_id?: string | null; is_active?: boolean; password?: string }>();
    const role = body.role || (existing as any).role;
    const careerId = role === 'admin' ? null : (body.career_id === undefined ? (existing as any).career_id : body.career_id);
    if (!body.name?.trim() || !['admin', 'coordinator', 'viewer'].includes(role) || (role !== 'admin' && !careerId)) {
        return c.json({ error: 'Datos de usuario inválidos' }, 400);
    }
    if (careerId) {
        const career = await c.env.DB.prepare('SELECT id FROM careers WHERE id = ?').bind(careerId).first();
        if (!career) return c.json({ error: 'Carrera inválida' }, 400);
    }
    if (body.password && (body.password.length < 12 || body.password.length > 256)) {
        return c.json({ error: 'La contraseña debe tener entre 12 y 256 caracteres' }, 400);
    }
    const active = body.is_active === undefined ? Number((existing as any).is_active) : (body.is_active ? 1 : 0);
    const accountStatus = active ? 'active' : ((existing as any).account_status === 'pending' ? 'pending' : 'disabled');
    await c.env.DB.prepare(`UPDATE users SET name = ?, role = ?, career_id = ?, is_active = ?, account_status = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(body.name.trim(), role, careerId, active, accountStatus, id).run();
    if (body.password) {
        const passwordHash = await hashPassword(body.password);
        await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(passwordHash, id).run();
    }
    await recordAudit(c.env.DB, actor, 'UPDATE', 'user', id, existing, { name: body.name, role, career_id: careerId, is_active: body.is_active });
    return c.json({ success: true });
});

adminRoutes.post('/users/:id/approve', authMiddleware, async (c) => {
    const actor = c.get('user') as UserPayload;
    if (actor.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id') as string;
    const existing = await c.env.DB.prepare('SELECT id, email, name, role, career_id, is_active, account_status FROM users WHERE id = ?').bind(id).first<any>();
    if (!existing) return c.json({ error: 'Usuario no encontrado' }, 404);
    if (existing.account_status !== 'pending') return c.json({ error: 'La cuenta no está pendiente' }, 409);
    if (!existing.career_id) return c.json({ error: 'La cuenta requiere una carrera' }, 400);
    await c.env.DB.prepare("UPDATE users SET is_active = 1, account_status = 'active', updated_at = datetime('now') WHERE id = ?")
        .bind(id).run();
    await recordAudit(c.env.DB, actor, 'APPROVE', 'user', id, existing, { ...existing, is_active: 1, account_status: 'active' });
    return c.json({ success: true });
});

adminRoutes.delete('/users/:id', authMiddleware, async (c) => {
    const actor = c.get('user') as UserPayload;
    if (actor.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id') as string;
    if (id === actor.id) return c.json({ error: 'No puedes desactivar tu propia cuenta' }, 400);
    const existing = await c.env.DB.prepare('SELECT id, email, name, role, career_id, is_active, account_status FROM users WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Usuario no encontrado' }, 404);
    await c.env.DB.prepare("UPDATE users SET is_active = 0, account_status = 'disabled', updated_at = datetime('now') WHERE id = ?").bind(id).run();
    await recordAudit(c.env.DB, actor, 'DEACTIVATE', 'user', id, existing, { is_active: false });
    return c.json({ success: true });
});
