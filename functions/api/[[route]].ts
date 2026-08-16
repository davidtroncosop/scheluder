import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import {
    createLocalMapping,
    resolveMappingAIModel,
    type MappingAnalysis,
    type ResolvedMappingAIModel,
} from '../../features/ai/mapping';
import type { MappingField } from '../../types';
import { hashPassword, safeSecretEquals, signJwt, verifyJwt, verifyPassword } from '../../features/auth/security';
import {
    areDirectParentAndChild,
    shouldApplyLevelClash,
    type SectionRelationshipIdentity,
} from '../../features/scheduler/relationships';

const DUMMY_PASSWORD_HASH = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// Types
export interface Env {
    DB: D1Database;
    JWT_SECRET?: string;
    ENVIRONMENT: string;
    DEMO_AUTH?: string;
    GEMINI_API_KEY?: string;
    OPENAI_API_KEY?: string;
    API_KEY?: string;
    BOOTSTRAP_TOKEN?: string;
    CORS_ORIGINS?: string;
    ACADEMIC_TIMEZONE?: string;
    APP_VERSION?: string;
}

export interface UserPayload {
    id: string;
    email: string;
    role: 'admin' | 'coordinator' | 'viewer';
    career_id: string | null;
}

// Initialize Hono app with base path for /api
const app = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>().basePath('/api');

// CORS middleware
app.use('*', cors({
    origin: (origin, c) => {
        if (!origin) return null;
        const configured = String(c.env.CORS_ORIGINS || '').split(',').map((value: string) => value.trim()).filter(Boolean);
        const productionOrigins = ['https://scheduler-pro.pages.dev', ...configured];
        const developmentOrigins = ['http://localhost:3000', 'http://localhost:8788'];
        const allowedOrigins = c.env.ENVIRONMENT === 'production'
            ? productionOrigins
            : [...productionOrigins, ...developmentOrigins];
        return allowedOrigins.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', secureHeaders({
    crossOriginResourcePolicy: 'same-origin',
    referrerPolicy: 'no-referrer',
}));

// Health check
app.get('/health', async (c) => {
    try {
        await c.env.DB.prepare('SELECT 1 AS ok').first();
        c.header('Cache-Control', 'no-store');
        return c.json({
            status: 'ok',
            database: 'ok',
            version: c.env.APP_VERSION || 'development',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Health check failed:', error);
        c.header('Cache-Control', 'no-store');
        return c.json({
            status: 'degraded',
            database: 'unavailable',
            version: c.env.APP_VERSION || 'development',
            timestamp: new Date().toISOString(),
        }, 503);
    }
});

// =============================================
// AUTH ROUTES
// =============================================

app.post('/auth/login', async (c) => {
    const { email, password } = await c.req.json<{ email?: string; password?: string }>();
    const db = c.env.DB;

    if (!email || typeof email !== 'string' || email.length > 320 || !password || typeof password !== 'string' || password.length > 256) {
        return c.json({ error: 'Credenciales inválidas' }, 400);
    }
    const normalizedEmail = email.trim().toLowerCase();
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown';
    const [accountAllowed, clientAllowed] = await Promise.all([
        allowRequest(c.env.DB, `login-account:${normalizedEmail}`, 10, 60),
        allowRequest(c.env.DB, `login-client:${clientIp}`, 10, 60),
    ]);
    if (!accountAllowed || !clientAllowed) {
        c.header('Retry-After', '60');
        return c.json({ error: 'Demasiados intentos. Intenta nuevamente en un minuto.' }, 429);
    }

    try {
        const user = await db.prepare(
            `SELECT id, email, name, role, career_id, password_hash FROM users
             WHERE email = ? AND is_active = 1 AND account_status = 'active'`
        ).bind(normalizedEmail).first() as Record<string, unknown> | null;

        const demoAuth = c.env.ENVIRONMENT !== 'production' && c.env.DEMO_AUTH === 'true';
        const passwordValid = demoAuth
            ? Boolean(user)
            : await verifyPassword(password, String(user?.password_hash || DUMMY_PASSWORD_HASH));
        if (!user || !passwordValid) {
            return c.json({ error: 'Correo o contraseña incorrectos' }, 401);
        }

        const token = await signJwt({
            id: user.id as string,
            email: user.email as string,
            role: user.role as 'admin' | 'coordinator' | 'viewer',
            career_id: user.career_id as string | null,
        }, getJwtSecret(c.env));

        c.header('Cache-Control', 'no-store');
        return c.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                career_id: user.career_id,
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return c.json({ error: 'Error de autenticación' }, 500);
    }
});

// One-time bootstrap for an empty production database. Disable it after the
// first administrator has been created by removing BOOTSTRAP_TOKEN.
app.post('/auth/bootstrap', async (c) => {
    if (!c.env.BOOTSTRAP_TOKEN || c.env.BOOTSTRAP_TOKEN.length < 24) {
        return c.json({ error: 'Bootstrap no configurado' }, 404);
    }
    const suppliedToken = c.req.header('X-Bootstrap-Token') || '';
    if (!await allowRequest(c.env.DB, `bootstrap:${c.req.header('CF-Connecting-IP') || 'unknown'}`, 10, 60)) {
        c.header('Retry-After', '60');
        return c.json({ error: 'Demasiados intentos' }, 429);
    }
    if (!await safeSecretEquals(suppliedToken, c.env.BOOTSTRAP_TOKEN)) {
        return c.json({ error: 'No autorizado' }, 401);
    }
    const existing = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>();
    if ((existing?.total || 0) > 0) return c.json({ error: 'Bootstrap ya utilizado' }, 409);

    const body = await c.req.json<{ email?: string; name?: string; password?: string }>();
    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    if (!email || !name || !body.password || body.password.length < 12 || body.password.length > 256 || !/^\S+@\S+\.\S+$/.test(email)) {
        return c.json({ error: 'Nombre, correo y contraseña de 12 caracteres o más son requeridos' }, 400);
    }
    const passwordHash = await hashPassword(body.password);
    const id = `usr-${crypto.randomUUID()}`;
    const inserted = await c.env.DB.prepare(`INSERT INTO users (id, email, name, password_hash, role, career_id, is_active)
        SELECT ?, ?, ?, ?, 'admin', NULL, 1 WHERE NOT EXISTS (SELECT 1 FROM users)`)
        .bind(id, email, name, passwordHash).run();
    if (!inserted.meta.changes) return c.json({ error: 'Bootstrap ya utilizado' }, 409);
    return c.json({ success: true, id }, 201);
});

const registrationAccepted = { message: 'Solicitud recibida. Un administrador debe aprobar la cuenta antes de que puedas ingresar.' };

app.get('/auth/registration-options', async (c) => {
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown';
    if (!await allowRequest(c.env.DB, `registration-options:${clientIp}`, 60, 60)) {
        c.header('Retry-After', '60');
        return c.json({ error: 'Límite de solicitudes excedido' }, 429);
    }
    const careers = await c.env.DB.prepare('SELECT id, name, code FROM careers ORDER BY name LIMIT 200').all();
    return c.json(careers.results);
});

app.post('/auth/register', async (c) => {
    const body = await c.req.json<{ email?: string; name?: string; password?: string; career_id?: string }>();
    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown';
    if (!email || email.length > 320 || !/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 120 ||
        !body.password || body.password.length < 12 || body.password.length > 256 || !body.career_id) {
        return c.json({ error: 'Datos de registro inválidos' }, 400);
    }
    const [clientAllowed, accountAllowed] = await Promise.all([
        allowRequest(c.env.DB, `register-client:${clientIp}`, 5, 60 * 60),
        allowRequest(c.env.DB, `register-account:${email}`, 3, 60 * 60),
    ]);
    if (!clientAllowed || !accountAllowed) {
        c.header('Retry-After', '3600');
        return c.json({ error: 'Demasiadas solicitudes de cuenta. Intenta más tarde.' }, 429);
    }
    const career = await c.env.DB.prepare('SELECT id FROM careers WHERE id = ?').bind(body.career_id).first();
    if (!career) return c.json({ error: 'Carrera inválida' }, 400);

    // Hash before checking duplicates so response timing does not reveal whether
    // an email already exists. The response is intentionally identical.
    const passwordHash = await hashPassword(body.password);
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return c.json(registrationAccepted, 202);
    try {
        await c.env.DB.prepare(`INSERT INTO users
            (id, email, name, password_hash, role, career_id, is_active, account_status)
            VALUES (?, ?, ?, ?, 'viewer', ?, 0, 'pending')`)
            .bind(`usr-${crypto.randomUUID()}`, email, name, passwordHash, body.career_id).run();
    } catch (error) {
        // A concurrent request may win the unique-email race. Preserve the same
        // non-enumerating response instead of exposing database details.
        console.warn('Registration insert did not create a new request', error instanceof Error ? error.message : String(error));
    }
    c.header('Cache-Control', 'no-store');
    return c.json(registrationAccepted, 202);
});

// JWT middleware for protected routes
const authMiddleware = async (c: any, next: any) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'No autorizado' }, 401);
    }

    try {
        const token = authHeader.split(' ')[1];
        const payload = await verifyJwt(token, getJwtSecret(c.env));
        const currentUser = await c.env.DB.prepare(
            "SELECT id, email, role, career_id FROM users WHERE id = ? AND is_active = 1 AND account_status = 'active'"
        ).bind(payload.id).first() as UserPayload | null;
        if (!currentUser) return c.json({ error: 'Sesión expirada' }, 401);
        c.set('user', currentUser);
        const [userAllowed, routeAllowed] = await Promise.all([
            allowRequest(c.env.DB, `user:${currentUser.id}`, 300, 60),
            allowRequest(c.env.DB, `route:${currentUser.id}:${c.req.path}`, 300, 60),
        ]);
        if (!userAllowed || !routeAllowed) {
            c.header('Retry-After', '60');
            return c.json({ error: 'Límite de solicitudes excedido' }, 429);
        }
        await next();
    } catch (error) {
        return c.json({ error: 'Token inválido' }, 401);
    }
};

const canAccessCareer = (user: UserPayload, careerId: string | null | undefined) =>
    user.role === 'admin' || Boolean(user.career_id && user.career_id === careerId);

const canMutate = (user: UserPayload) => user.role === 'admin' || user.role === 'coordinator';

const allowRequest = async (db: D1Database, key: string, limit: number, periodSeconds: number): Promise<boolean> => {
    try {
        const now = Math.floor(Date.now() / 1000);
        const windowStart = Math.floor(now / periodSeconds) * periodSeconds;
        const keyHash = await hashRateLimitKey(key);
        const result = await db.prepare(`INSERT INTO rate_limit_counters
            (key_hash, window_start, request_count, expires_at) VALUES (?, ?, 1, ?)
            ON CONFLICT(key_hash, window_start) DO UPDATE SET request_count = request_count + 1
            RETURNING request_count`).bind(keyHash, windowStart, windowStart + periodSeconds * 2)
            .first<{ request_count: number }>();
        const cleanupSample = new Uint8Array(1);
        crypto.getRandomValues(cleanupSample);
        if (cleanupSample[0] === 0) {
            await db.prepare('DELETE FROM rate_limit_counters WHERE expires_at < ?').bind(now).run();
        }
        return Boolean(result && result.request_count <= limit);
    } catch (error) {
        console.error('Rate limiter error:', error);
        return false;
    }
};

const hashRateLimitKey = async (key: string): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const requireExpensiveRequestBudget = async (c: any, user: UserPayload) => {
    if (!await allowRequest(c.env.DB, `expensive:${user.id}:${c.req.path}`, 20, 60)) {
        c.header('Retry-After', '60');
        return c.json({ error: 'Límite de operaciones costosas excedido' }, 429);
    }
    return null;
};

/**
 * Ensures the planning period for the next academic semester exists.
 *
 * Planning windows follow the institution's Chilean calendar:
 * - May through September: prepare the second semester of the current year.
 * - October through April: prepare the first semester of the following year.
 *
 * This is intentionally idempotent and runs when periods are requested, so it
 * works on Pages Functions without requiring a separate scheduler/cron worker.
 */
const ensureAutomaticPeriod = async (db: D1Database, configuredTimezone?: string): Promise<string> => {
    const timezone = configuredTimezone || 'America/Santiago';
    let year: number;
    let month: number;
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: 'numeric',
        }).formatToParts(new Date());
        year = Number(parts.find(part => part.type === 'year')?.value);
        month = Number(parts.find(part => part.type === 'month')?.value);
    } catch {
        const now = new Date();
        year = now.getUTCFullYear();
        month = now.getUTCMonth() + 1;
    }

    const planningSecondSemester = month >= 5 && month <= 9;
    const targetYear = planningSecondSemester ? year : year + 1;
    const semester = planningSecondSemester ? 2 : 1;
    const code = `${targetYear}-${semester}`;
    const startDate = `${targetYear}-${semester === 1 ? '03-01' : '08-01'}`;
    const endDate = `${targetYear}-${semester === 1 ? '07-15' : '12-15'}`;
    const name = `${semester === 1 ? 'Primer' : 'Segundo'} Semestre ${targetYear}`;
    const id = `per-${targetYear}-${semester}`;

    await db.batch([
        db.prepare('UPDATE periods SET is_active = 0'),
        db.prepare(`INSERT INTO periods (id, code, name, start_date, end_date, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT(code) DO UPDATE SET
                name = excluded.name,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                is_active = 1`).bind(id, code, name, startDate, endDate),
    ]);
    return code;
};

app.get('/auth/me', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const profile = await c.env.DB.prepare(
        'SELECT id, email, name, role, career_id, is_active, account_status, created_at FROM users WHERE id = ?'
    ).bind(user.id).first();
    return c.json(profile);
});

// Institutional overview is deliberately a separate, aggregated admin endpoint.
// It avoids forcing the dashboard to download every row from every career while
// keeping the global view behind the same authenticated authorization boundary.
app.get('/admin/overview', authMiddleware, async (c) => {
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

// User administration never exposes password hashes and is intentionally
// admin-only. Regular users access only /auth/me, avoiding IDOR-prone profile URLs.
app.get('/users', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const rows = await c.env.DB.prepare(
        'SELECT id, email, name, role, career_id, is_active, account_status, created_at FROM users ORDER BY created_at DESC LIMIT 500'
    ).all();
    return c.json(rows.results);
});

app.post('/users', authMiddleware, async (c) => {
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

app.put('/users/:id', authMiddleware, async (c) => {
    const actor = c.get('user') as UserPayload;
    if (actor.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id');
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

app.post('/users/:id/approve', authMiddleware, async (c) => {
    const actor = c.get('user') as UserPayload;
    if (actor.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id, email, name, role, career_id, is_active, account_status FROM users WHERE id = ?').bind(id).first<any>();
    if (!existing) return c.json({ error: 'Usuario no encontrado' }, 404);
    if (existing.account_status !== 'pending') return c.json({ error: 'La cuenta no está pendiente' }, 409);
    if (!existing.career_id) return c.json({ error: 'La cuenta requiere una carrera' }, 400);
    await c.env.DB.prepare("UPDATE users SET is_active = 1, account_status = 'active', updated_at = datetime('now') WHERE id = ?")
        .bind(id).run();
    await recordAudit(c.env.DB, actor, 'APPROVE', 'user', id, existing, { ...existing, is_active: 1, account_status: 'active' });
    return c.json({ success: true });
});

app.delete('/users/:id', authMiddleware, async (c) => {
    const actor = c.get('user') as UserPayload;
    if (actor.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id');
    if (id === actor.id) return c.json({ error: 'No puedes desactivar tu propia cuenta' }, 400);
    const existing = await c.env.DB.prepare('SELECT id, email, name, role, career_id, is_active, account_status FROM users WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Usuario no encontrado' }, 404);
    await c.env.DB.prepare("UPDATE users SET is_active = 0, account_status = 'disabled', updated_at = datetime('now') WHERE id = ?").bind(id).run();
    await recordAudit(c.env.DB, actor, 'DEACTIVATE', 'user', id, existing, { is_active: false });
    return c.json({ success: true });
});

// =============================================
// CAREERS (RLS Base)
// =============================================

app.get('/careers', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const careers = user.role === 'admin'
        ? await db.prepare('SELECT * FROM careers ORDER BY name').all()
        : await db.prepare('SELECT * FROM careers WHERE id = ? ORDER BY name').bind(user.career_id).all();
    return c.json(careers.results);
});

app.post('/careers', authMiddleware, async (c) => {
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

app.put('/careers/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id');
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

app.delete('/careers/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id');
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

app.get('/periods', authMiddleware, async (c) => {
    try {
        await ensureAutomaticPeriod(c.env.DB, c.env.ACADEMIC_TIMEZONE);
    } catch (error) {
        // Reading existing periods remains available if automatic provisioning
        // is temporarily unavailable; the next request will retry it.
        console.error('Automatic period provisioning failed:', error);
    }
    const periods = await c.env.DB.prepare(
        'SELECT id, code, name, start_date, end_date, is_active FROM periods ORDER BY start_date DESC, created_at DESC'
    ).all();
    return c.json(periods.results);
});

app.post('/periods', authMiddleware, async (c) => {
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

app.put('/periods/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id');
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

app.delete('/periods/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id');
    const assignments = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM schedule_assignments WHERE period_id = ?').bind(id).first<{ total: number }>();
    if ((assignments?.total || 0) > 0) return c.json({ error: 'No se puede eliminar un período con asignaciones' }, 409);
    await c.env.DB.prepare('DELETE FROM periods WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

app.get('/settings', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const careerId = user.career_id || c.req.query('career_id');
    if (!careerId || !canAccessCareer(user, careerId)) return c.json({ error: 'Carrera requerida' }, 400);
    const row = await c.env.DB.prepare('SELECT settings FROM app_settings WHERE career_id = ?').bind(careerId).first<{ settings: string }>();
    return c.json(row ? JSON.parse(row.settings) : {});
});

app.put('/settings', authMiddleware, async (c) => {
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

// =============================================
// TEACHERS
// =============================================

app.get('/teachers', authMiddleware, async (c) => {
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

app.post('/teachers', authMiddleware, async (c) => {
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

app.put('/teachers/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!teacher) return c.json({ error: 'Docente no encontrado' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, teacher.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    await c.env.DB.prepare(`UPDATE teachers SET name = ?, email = ?, contract_type = ?, max_hours_per_week = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(body.name, body.email || null, body.contract_type || 'Honorarios', Number(body.max_hours_per_week || 20), body.is_active === false ? 0 : 1, id).run();
    return c.json({ success: true });
});

app.delete('/teachers/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!teacher) return c.json({ error: 'Docente no encontrado' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, teacher.career_id)) return c.json({ error: 'No autorizado' }, 403);
    await c.env.DB.prepare("UPDATE teachers SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(id).run();
    return c.json({ success: true });
});

app.get('/teachers/:id', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
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

    // Get availability
    const availability = await db.prepare(`
    SELECT ta.*, ts.label, ts.start_time, ts.end_time
    FROM teacher_availability ta
    JOIN timeslots ts ON ts.id = ta.timeslot_id
    WHERE ta.teacher_id = ?
    ORDER BY ta.day_of_week, ts.order_index
  `).bind(id).all();

    return c.json({ ...teacher, availability: availability.results });
});

app.put('/teachers/:id/availability', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
    const user = c.get('user') as UserPayload;
    const { availability } = await c.req.json();

    const teacher = await db.prepare('SELECT career_id FROM teachers WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!teacher) return c.json({ error: 'Docente no encontrado' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, teacher.career_id)) return c.json({ error: 'No autorizado' }, 403);
    if (!Array.isArray(availability)) return c.json({ error: 'Disponibilidad inválida' }, 400);

    try {
        // Delete existing
        await db.prepare('DELETE FROM teacher_availability WHERE teacher_id = ?').bind(id).run();

        // Insert new
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

// =============================================
// ROOMS
// =============================================

app.get('/rooms', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;

    let query = 'SELECT * FROM rooms WHERE is_active = 1';
    const params: any[] = [];

    if (user.role !== 'admin') {
        query += ' AND (is_shared = 1';
        if (user.career_id) {
            query += ' OR career_id = ?';
            params.push(user.career_id);
        }
        query += ')';
    }
    query += ' ORDER BY building, name';

    const rooms = await db.prepare(query).bind(...params).all();
    return c.json(rooms.results);
});

app.post('/rooms', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    const targetCareerId = user.career_id || String(body.career_id || await c.env.DB.prepare('SELECT id FROM careers ORDER BY name LIMIT 1').first<string>('id') || '');
    if (!targetCareerId) return c.json({ error: 'Carrera requerida' }, 400);
    const id = `room-${crypto.randomUUID()}`;
    const name = String(body.name || '').trim();
    if (!name) return c.json({ error: 'Nombre requerido' }, 400);
    const shared = user.role === 'admin' && body.is_shared === true;
    const roomCareerId = shared ? null : targetCareerId;
    const building = String(body.building || '').trim() || null;
    const duplicate = await c.env.DB.prepare(`SELECT id FROM rooms
        WHERE is_active = 1 AND lower(trim(name)) = lower(trim(?))
        AND lower(trim(COALESCE(building, ''))) = lower(trim(COALESCE(?, '')))
        AND COALESCE(career_id, '') = COALESCE(?, '') LIMIT 1`)
        .bind(name, building, roomCareerId).first();
    if (duplicate) return c.json({ error: 'Ya existe una sala activa con ese nombre y edificio' }, 409);
    try {
        await c.env.DB.prepare(`INSERT INTO rooms (id, career_id, name, building, floor, type, capacity, is_shared, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
            .bind(id, roomCareerId, name, building, Number(body.floor || 1), body.type || 'TEO', Number(body.capacity || 30), shared ? 1 : 0).run();
    } catch (error) {
        console.error('Create room error:', error);
        return c.json({ error: 'No fue posible crear la sala; verifica que no esté duplicada' }, 409);
    }
    return c.json({ id }, 201);
});

app.put('/rooms/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const room = await c.env.DB.prepare('SELECT career_id, is_shared FROM rooms WHERE id = ?').bind(id).first<{ career_id: string | null; is_shared: number }>();
    if (!room) return c.json({ error: 'Sala no encontrada' }, 404);
    if (!canMutate(user) || (room.is_shared ? user.role !== 'admin' : !canAccessCareer(user, room.career_id))) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    const name = String(body.name || '').trim();
    if (!name) return c.json({ error: 'Nombre requerido' }, 400);
    const building = String(body.building || '').trim() || null;
    const duplicate = await c.env.DB.prepare(`SELECT id FROM rooms
        WHERE id <> ? AND is_active = 1 AND lower(trim(name)) = lower(trim(?))
        AND lower(trim(COALESCE(building, ''))) = lower(trim(COALESCE(?, '')))
        AND COALESCE(career_id, '') = COALESCE(?, '') LIMIT 1`)
        .bind(id, name, building, room.career_id).first();
    if (duplicate) return c.json({ error: 'Ya existe una sala activa con ese nombre y edificio' }, 409);
    try {
        await c.env.DB.prepare(`UPDATE rooms SET name = ?, building = ?, floor = ?, type = ?, capacity = ?, updated_at = datetime('now') WHERE id = ?`)
            .bind(name, building, Number(body.floor || 1), body.type || 'TEO', Number(body.capacity || 30), id).run();
    } catch (error) {
        console.error('Update room error:', error);
        return c.json({ error: 'No fue posible actualizar la sala; verifica que no esté duplicada' }, 409);
    }
    return c.json({ success: true });
});

app.delete('/rooms/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const room = await c.env.DB.prepare('SELECT career_id, is_shared FROM rooms WHERE id = ?').bind(id).first<{ career_id: string | null; is_shared: number }>();
    if (!room) return c.json({ error: 'Sala no encontrada' }, 404);
    if (!canMutate(user) || (room.is_shared ? user.role !== 'admin' : !canAccessCareer(user, room.career_id))) return c.json({ error: 'No autorizado' }, 403);
    await c.env.DB.prepare("UPDATE rooms SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(id).run();
    return c.json({ success: true });
});

// =============================================
// SUBJECTS & SECTIONS
// =============================================

app.get('/subjects', authMiddleware, async (c) => {
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

app.post('/subjects', authMiddleware, async (c) => {
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

app.put('/subjects/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const subject = await c.env.DB.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!subject) return c.json({ error: 'Asignatura no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, subject.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    await c.env.DB.prepare(`UPDATE subjects SET code = ?, name = ?, level = ?, credits = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(String(body.code || '').toUpperCase(), body.name, Number(body.level || 1), Number(body.credits || 0), id).run();
    return c.json({ success: true });
});

app.delete('/subjects/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const subject = await c.env.DB.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!subject) return c.json({ error: 'Asignatura no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, subject.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const sections = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM sections WHERE subject_id = ?').bind(id).first<{ total: number }>();
    if ((sections?.total || 0) > 0) return c.json({ error: 'No se puede eliminar una asignatura con secciones asociadas' }, 409);
    await c.env.DB.prepare('DELETE FROM subjects WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

app.get('/sections', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const assigned = c.req.query('assigned');
    const periodId = c.req.query('period_id') || null;
    const requestedCareerId = c.req.query('career_id') || null;
    if (requestedCareerId && !canAccessCareer(user, requestedCareerId)) {
        return c.json({ error: 'No autorizado' }, 403);
    }

    let query = `
    SELECT 
      s.*,
      sub.name as subject_name,
      sub.code as subject_code,
      sub.level,
      sub.career_id,
      t.name as teacher_name,
      t.rut as teacher_rut,
      parent.nrc as parent_nrc,
      parent_subject.name as parent_subject_name,
      (
        SELECT COUNT(*) FROM schedule_assignments sa
        WHERE sa.section_id = s.id
          AND sa.period_id = COALESCE(?, (SELECT id FROM periods WHERE is_active = 1 LIMIT 1))
      ) as assigned_slots
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    LEFT JOIN sections parent ON parent.id = s.parent_section_id
    LEFT JOIN subjects parent_subject ON parent_subject.id = parent.subject_id
    `;
    const params: any[] = [periodId, periodId];
    query += ' WHERE s.period_id = COALESCE(?, (SELECT id FROM periods WHERE is_active = 1 LIMIT 1))';

    if (user.role !== 'admin' && user.career_id) {
        query += ' AND s.career_id = ?';
        params.push(user.career_id);
    } else if (requestedCareerId) {
        query += ' AND s.career_id = ?';
        params.push(requestedCareerId);
    }
    query += ` ORDER BY s.priority DESC, sub.level, sub.name,
        COALESCE(parent.nrc, s.nrc), CASE WHEN s.parent_section_id IS NULL THEN 0 ELSE 1 END, s.section_code, s.nrc`;

    const sections = await db.prepare(query).bind(...params).all();

    let results = sections.results as any[];
    if (assigned === 'true') {
        results = results.filter((s: any) => s.assigned_slots >= s.hours_per_week);
    } else if (assigned === 'false') {
        results = results.filter((s: any) => s.assigned_slots < s.hours_per_week);
    }

    return c.json(results);
});

app.post('/sections', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    const periodId = String(body.period_id || '');
    const period = await c.env.DB.prepare('SELECT id FROM periods WHERE id = ?').bind(periodId).first();
    if (!period) return c.json({ error: 'Período académico inválido' }, 400);
    const subject = await c.env.DB.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(body.subject_id).first<{ career_id: string }>();
    if (!subject) return c.json({ error: 'Asignatura no encontrada' }, 404);
    if (!canAccessCareer(user, subject.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const id = `sec-${crypto.randomUUID()}`;
    const sectionType = normalizeSectionType(body.type);
    const parentSectionId = sectionType === 'TEO' ? null : String(body.parent_section_id || '') || null;
    const parentError = await validateParentSelection(c.env.DB, {
        sectionId: id,
        parentSectionId,
        type: sectionType,
        subjectId: String(body.subject_id),
        careerId: subject.career_id,
        periodId,
    });
    if (parentError) return c.json({ error: parentError }, 400);
    if (body.teacher_id) {
        const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ? AND is_active = 1')
            .bind(body.teacher_id).first<{ career_id: string }>();
        if (!teacher || teacher.career_id !== subject.career_id) return c.json({ error: 'Docente no válido para la carrera' }, 400);
    }
    try {
        await c.env.DB.prepare(`INSERT INTO sections (id, period_id, career_id, subject_id, teacher_id, nrc, section_code, type, parent_section_id, hours_per_week, expected_students, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(id, periodId, subject.career_id, body.subject_id, body.teacher_id || null, body.nrc,
                body.section_code || null, sectionType, parentSectionId, Number(body.hours_per_week || 2),
                Number(body.expected_students || 30), Number(body.priority || 0)).run();
    } catch (error) {
        if (String(error).toLowerCase().includes('unique')) return c.json({ error: 'El NRC ya existe para esta carrera y período' }, 409);
        return c.json({ error: sectionRelationshipError(error) }, 409);
    }
    return c.json({ id }, 201);
});

app.put('/sections/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const current = await c.env.DB.prepare('SELECT career_id, period_id, subject_id, type, parent_section_id FROM sections WHERE id = ?').bind(id).first<{
        career_id: string; period_id: string; subject_id: string; type: SectionType; parent_section_id: string | null;
    }>();
    if (!current) return c.json({ error: 'Sección no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, current.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    const targetSubject = await c.env.DB.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(body.subject_id).first<{ career_id: string }>();
    if (!targetSubject || targetSubject.career_id !== current.career_id) return c.json({ error: 'Asignatura no válida para la carrera' }, 400);
    if (body.teacher_id) {
        const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ? AND is_active = 1')
            .bind(body.teacher_id).first<{ career_id: string }>();
        if (!teacher || teacher.career_id !== current.career_id) return c.json({ error: 'Docente no válido para la carrera' }, 400);
    }
    const sectionType = normalizeSectionType(body.type);
    const childCount = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM sections WHERE parent_section_id = ?').bind(id).first<{ total: number }>();
    if ((childCount?.total || 0) > 0 && (sectionType !== 'TEO' || String(body.subject_id) !== current.subject_id)) {
        return c.json({ error: 'No se puede cambiar el tipo o la asignatura de una teoría que tiene prácticas asociadas' }, 409);
    }
    const requestedParent = Object.prototype.hasOwnProperty.call(body, 'parent_section_id')
        ? (String(body.parent_section_id || '') || null)
        : current.parent_section_id;
    const parentSectionId = sectionType === 'TEO' ? null : requestedParent;
    const parentError = await validateParentSelection(c.env.DB, {
        sectionId: id,
        parentSectionId,
        type: sectionType,
        subjectId: String(body.subject_id),
        careerId: current.career_id,
        periodId: current.period_id,
    });
    if (parentError) return c.json({ error: parentError }, 400);
    try {
        await c.env.DB.prepare(`UPDATE sections SET subject_id = ?, teacher_id = ?, nrc = ?, section_code = ?, type = ?,
            parent_section_id = ?, hours_per_week = ?, updated_at = datetime('now') WHERE id = ?`)
            .bind(body.subject_id, body.teacher_id || null, body.nrc, body.section_code || null, sectionType,
                parentSectionId, Number(body.hours_per_week || 2), id).run();
    } catch (error) {
        return c.json({ error: sectionRelationshipError(error) }, 409);
    }
    return c.json({ success: true });
});

app.put('/sections/:id/teacher', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const current = await c.env.DB.prepare('SELECT teacher_id, career_id FROM sections WHERE id = ?')
        .bind(id).first<{ teacher_id: string | null; career_id: string }>();
    if (!current) return c.json({ error: 'Sección no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, current.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<{ teacher_id?: string | null }>();
    const teacherId = body.teacher_id || null;
    if (teacherId) {
        const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ? AND is_active = 1')
            .bind(teacherId).first<{ career_id: string }>();
        if (!teacher || teacher.career_id !== current.career_id) return c.json({ error: 'Docente no válido para la carrera' }, 400);
    }
    await c.env.DB.prepare("UPDATE sections SET teacher_id = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(teacherId, id).run();
    await recordAudit(c.env.DB, user, 'UPDATE_TEACHER', 'section', id, { teacher_id: current.teacher_id, career_id: current.career_id }, { teacher_id: teacherId, career_id: current.career_id });
    return c.json({ success: true });
});

app.delete('/sections/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const current = await c.env.DB.prepare('SELECT career_id FROM sections WHERE id = ?').bind(id).first<{ career_id: string }>();
    if (!current) return c.json({ error: 'Sección no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, current.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const children = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM sections WHERE parent_section_id = ?').bind(id).first<{ total: number }>();
    if ((children?.total || 0) > 0) return c.json({ error: 'No se puede eliminar una sección teórica que todavía tiene prácticas asociadas' }, 409);
    await c.env.DB.prepare('DELETE FROM sections WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// =============================================
// TIMESLOTS
// =============================================

app.get('/timeslots', authMiddleware, async (c) => {
    const db = c.env.DB;
    const timeslots = await db.prepare('SELECT * FROM timeslots ORDER BY order_index').all();
    return c.json(timeslots.results);
});

app.post('/timeslots', authMiddleware, async (c) => {
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

app.put('/timeslots/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id');
    const body = await c.req.json<{ label?: string; start_time?: string; end_time?: string; order_index?: number }>();
    if (!body.label?.trim() || !isTime(body.start_time) || !isTime(body.end_time) || body.start_time! >= body.end_time!) {
        return c.json({ error: 'Datos de bloque inválidos' }, 400);
    }
    const result = await c.env.DB.prepare(`UPDATE timeslots SET label = ?, start_time = ?, end_time = ?, order_index = ? WHERE id = ?`)
        .bind(body.label.trim(), body.start_time, body.end_time, Number(body.order_index || 1), id).run();
    if (!result.meta.changes) return c.json({ error: 'Bloque no encontrado' }, 404);
    return c.json({ success: true });
});

app.delete('/timeslots/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (user.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);
    const id = c.req.param('id');
    const usage = await c.env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM schedule_assignments WHERE timeslot_id = ?) +
        (SELECT COUNT(*) FROM teacher_availability WHERE timeslot_id = ?) AS total`).bind(id, id).first<{ total: number }>();
    if ((usage?.total || 0) > 0) return c.json({ error: 'No se puede eliminar un bloque en uso' }, 409);
    await c.env.DB.prepare('DELETE FROM timeslots WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// =============================================
// SCHEDULE ASSIGNMENTS
// =============================================

app.get('/schedule', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const periodId = c.req.query('period_id');
    const requestedCareerId = c.req.query('career_id');
    if (requestedCareerId && !canAccessCareer(user, requestedCareerId)) {
        return c.json({ error: 'No autorizado' }, 403);
    }

    let query = `
    SELECT 
      sa.*,
      sec.nrc,
      sec.type as section_type,
      sub.name as subject_name,
      sub.code as subject_code,
      sub.level,
      t.name as teacher_name,
      t.id as teacher_id,
      r.name as room_name,
      r.type as room_type,
      ts.label as timeslot_label,
      ts.start_time,
      ts.end_time
    FROM schedule_assignments sa
    JOIN sections sec ON sec.id = sa.section_id AND sec.period_id = sa.period_id
    JOIN subjects sub ON sub.id = sec.subject_id
    LEFT JOIN teachers t ON t.id = sec.teacher_id
    LEFT JOIN rooms r ON r.id = sa.room_id
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
    query += ' ORDER BY sa.day_of_week, ts.order_index';

    const assignments = await db.prepare(query).bind(...params).all();
    return c.json(assignments.results);
});

app.get('/schedule/status', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const periodId = c.req.query('period_id');
    if (!periodId) return c.json({ error: 'period_id requerido' }, 400);
    const careerId = user.career_id || c.req.query('career_id');
    if (careerId && !canAccessCareer(user, careerId)) return c.json({ error: 'No autorizado' }, 403);
    if (careerId) {
        const row = await c.env.DB.prepare('SELECT status FROM schedule_statuses WHERE career_id = ? AND period_id = ?')
            .bind(careerId, periodId).first<{ status: 'draft' | 'review' | 'published' }>();
        return c.json({ status: row?.status || 'draft' });
    }
    let query = 'SELECT COUNT(*) AS total, SUM(is_published) AS published FROM schedule_assignments WHERE period_id = ?';
    const params: unknown[] = [periodId];
    if (user.role !== 'admin' && user.career_id) {
        query += ' AND career_id = ?';
        params.push(user.career_id);
    }
    const result = await c.env.DB.prepare(query).bind(...params).first<{ total: number; published: number | null }>();
    const total = result?.total || 0;
    return c.json({ status: total > 0 && result?.published === total ? 'published' : 'draft' });
});

app.put('/schedule/status', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<{ period_id?: string; career_id?: string; status?: 'draft' | 'review' }>();
    const careerId = user.career_id || body.career_id;
    if (!body.period_id || !careerId || !['draft', 'review'].includes(body.status || '') || !canAccessCareer(user, careerId)) {
        return c.json({ error: 'Datos de estado inválidos' }, 400);
    }
    await saveScheduleStatus(c.env.DB, careerId, body.period_id, body.status!, user.id);
    await recordAudit(c.env.DB, user, 'STATUS_CHANGE', 'period', body.period_id, null, { career_id: careerId, status: body.status });
    return c.json({ success: true, status: body.status });
});

app.post('/schedule/publish', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const { period_id, career_id } = await c.req.json<{ period_id?: string; career_id?: string }>();
    let targetCareerId = user.career_id || career_id;
    if (!targetCareerId && user.role === 'admin') {
        const careers = await c.env.DB.prepare('SELECT DISTINCT career_id FROM sections WHERE period_id = ? LIMIT 2')
            .bind(period_id).all<{ career_id: string }>();
        if (careers.results.length === 1) targetCareerId = careers.results[0].career_id;
    }
    if (!period_id || !targetCareerId || !canAccessCareer(user, targetCareerId)) return c.json({ error: 'period_id y carrera requeridos' }, 400);

    let conflictQuery = `SELECT COUNT(*) AS total FROM conflicts c
        JOIN schedule_assignments sa ON sa.id = c.assignment_id
        WHERE sa.period_id = ? AND c.type = 'CRITICAL' AND c.is_resolved = 0`;
    const params: unknown[] = [period_id, targetCareerId];
    conflictQuery += ' AND sa.career_id = ?';
    const conflicts = await c.env.DB.prepare(conflictQuery).bind(...params).first<{ total: number }>();
    if ((conflicts?.total || 0) > 0) return c.json({ error: 'Hay conflictos críticos pendientes' }, 409);

    const required = await c.env.DB.prepare(`SELECT COALESCE(SUM(s.hours_per_week), 0) AS total
        FROM sections s WHERE s.career_id = ? AND s.period_id = ?`)
        .bind(targetCareerId, period_id).first<{ total: number }>();
    const assigned = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM schedule_assignments
        WHERE period_id = ? AND career_id = ?`).bind(period_id, targetCareerId).first<{ total: number }>();
    if ((assigned?.total || 0) < (required?.total || 0)) {
        return c.json({ error: `Horario incompleto: ${assigned?.total || 0} de ${required?.total || 0} módulos asignados` }, 409);
    }

    const update = 'UPDATE schedule_assignments SET is_published = 1, updated_at = datetime(\'now\') WHERE period_id = ? AND career_id = ?';
    await c.env.DB.prepare(update).bind(...params).run();
    await saveScheduleStatus(c.env.DB, targetCareerId, period_id, 'published', user.id);
    await recordAudit(c.env.DB, user, 'PUBLISH', 'period', period_id, null, { career_id: targetCareerId, is_published: true });
    return c.json({ success: true, status: 'published' });
});

app.post('/schedule/assign', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const { section_id, room_id, timeslot_id, day_of_week, period_id } = await c.req.json();

    try {
        // Resolve target career from the subject associated with the section
        const section = await db.prepare(`
            SELECT s.id, s.period_id, s.career_id
            FROM sections s
            WHERE s.id = ? AND s.period_id = ?
        `).bind(section_id, period_id).first() as any;

        if (!section) {
            return c.json({ error: 'Sección no encontrada' }, 404);
        }

        const targetCareerId = section.career_id;
        if (!canMutate(user) || !canAccessCareer(user, targetCareerId)) {
            return c.json({ error: 'No autorizado' }, 403);
        }
        if (!period_id || !timeslot_id || !room_id || !Number.isInteger(day_of_week) || day_of_week < 1 || day_of_week > 5) {
            return c.json({ error: 'Datos de asignación inválidos' }, 400);
        }
        const [period, room, timeslot] = await Promise.all([
            db.prepare('SELECT id FROM periods WHERE id = ?').bind(period_id).first(),
            db.prepare('SELECT career_id, is_shared FROM rooms WHERE id = ? AND is_active = 1').bind(room_id).first<{ career_id: string | null; is_shared: number }>(),
            db.prepare('SELECT id FROM timeslots WHERE id = ?').bind(timeslot_id).first(),
        ]);
        if (!period || !room || !timeslot) return c.json({ error: 'Período, sala o bloque no válido' }, 400);
        if (!room.is_shared && room.career_id !== targetCareerId) return c.json({ error: 'La sala no pertenece a la carrera' }, 403);

        // Validate conflicts using the section's actual career_id
        const conflicts = await validateAssignment(db, {
            section_id,
            room_id,
            timeslot_id,
            day_of_week,
            career_id: targetCareerId,
            period_id,
        });

        const criticalConflicts = conflicts.filter(c => c.type === 'CRITICAL');
        if (criticalConflicts.length > 0) {
            return c.json({
                error: 'Conflictos críticos detectados',
                conflicts: criticalConflicts
            }, 400);
        }

        // Create assignment (using targetCareerId instead of user.career_id to prevent null admin crash)
        const id = crypto.randomUUID();
        await db.prepare(`
      INSERT INTO schedule_assignments 
      (id, career_id, period_id, section_id, room_id, timeslot_id, day_of_week, assigned_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, targetCareerId, period_id, section_id, room_id, timeslot_id, day_of_week, user.id).run();
        await saveScheduleStatus(db, targetCareerId, period_id, 'draft', user.id);
        await recordAudit(db, user, 'ASSIGN', 'assignment', id, null, { section_id, room_id, timeslot_id, day_of_week, period_id });

        // Store warnings
        for (const conflict of conflicts.filter(c => c.type === 'WARNING')) {
            await db.prepare(`
        INSERT INTO conflicts (id, assignment_id, type, rule_code, description)
        VALUES (?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), id, conflict.type, conflict.rule_code, conflict.description).run();
        }

        return c.json({ id, warnings: conflicts.filter(c => c.type === 'WARNING') }, 201);
    } catch (error) {
        console.error('Assign error:', error);
        if (String(error).includes('PARENT_CHILD_SCHEDULE_OVERLAP')) {
            return c.json({
                error: 'Conflictos críticos detectados',
                conflicts: [{
                    type: 'CRITICAL',
                    rule_code: 'PARENT_CHILD_OVERLAP',
                    description: 'La teoría y su práctica asociada no pueden programarse en el mismo horario',
                }],
            }, 409);
        }
        return c.json({ error: 'Error al asignar' }, 500);
    }
});

app.delete('/schedule/:id', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
    const user = c.get('user') as UserPayload;

    try {
        const assignment = await db.prepare('SELECT career_id, period_id FROM schedule_assignments WHERE id = ?').bind(id).first<{ career_id: string; period_id: string }>();
        if (!assignment) return c.json({ error: 'Asignación no encontrada' }, 404);
        if (!canMutate(user) || !canAccessCareer(user, assignment.career_id)) return c.json({ error: 'No autorizado' }, 403);
        await db.prepare('DELETE FROM conflicts WHERE assignment_id = ?').bind(id).run();
        await db.prepare('DELETE FROM schedule_assignments WHERE id = ?').bind(id).run();
        await saveScheduleStatus(db, assignment.career_id, assignment.period_id, 'draft', user.id);
        await recordAudit(db, user, 'DELETE', 'assignment', id, assignment, null);
        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: 'Error al eliminar' }, 500);
    }
});

app.put('/schedule/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const assignment = await c.env.DB.prepare(`SELECT career_id, section_id, room_id, timeslot_id, day_of_week, period_id
        FROM schedule_assignments WHERE id = ?`).bind(id).first<{
            career_id: string; section_id: string; room_id: string; timeslot_id: string;
            day_of_week: number; period_id: string;
        }>();
    if (!assignment) return c.json({ error: 'Asignación no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, assignment.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();

    const roomId = typeof body.room_id === 'string' ? body.room_id : assignment.room_id;
    const timeslotId = typeof body.timeslot_id === 'string' ? body.timeslot_id : assignment.timeslot_id;
    const dayOfWeek = body.day_of_week === undefined ? assignment.day_of_week : Number(body.day_of_week);
    const teacherId = 'teacher_id' in body ? (body.teacher_id ? String(body.teacher_id) : null) : undefined;
    if (!roomId || !timeslotId || !Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 5) {
        return c.json({ error: 'Datos de asignación inválidos' }, 400);
    }

    const room = await c.env.DB.prepare('SELECT career_id, is_shared FROM rooms WHERE id = ? AND is_active = 1')
        .bind(roomId).first<{ career_id: string | null; is_shared: number }>();
    if (!room || (!room.is_shared && room.career_id !== assignment.career_id)) {
        return c.json({ error: 'Sala no válida para la carrera' }, 400);
    }
    if (teacherId) {
        const teacher = await c.env.DB.prepare('SELECT career_id FROM teachers WHERE id = ? AND is_active = 1')
            .bind(teacherId).first<{ career_id: string }>();
        if (!teacher || teacher.career_id !== assignment.career_id) return c.json({ error: 'Docente no válido para la carrera' }, 400);
    }

    const conflicts = await validateAssignment(c.env.DB, {
        section_id: assignment.section_id,
        room_id: roomId,
        timeslot_id: timeslotId,
        day_of_week: dayOfWeek,
        career_id: assignment.career_id,
        period_id: assignment.period_id,
        exclude_assignment_id: id,
        teacher_id_override: teacherId,
    });
    const critical = conflicts.filter(conflict => conflict.type === 'CRITICAL');
    if (critical.length > 0) return c.json({ error: 'Conflictos críticos detectados', conflicts: critical }, 409);

    try {
        await c.env.DB.prepare(`UPDATE schedule_assignments SET room_id = ?, timeslot_id = ?, day_of_week = ?,
            is_published = 0, updated_at = datetime('now') WHERE id = ?`).bind(roomId, timeslotId, dayOfWeek, id).run();
    } catch (error) {
        if (String(error).includes('PARENT_CHILD_SCHEDULE_OVERLAP')) {
            return c.json({ error: 'La teoría y su práctica asociada no pueden programarse en el mismo horario' }, 409);
        }
        throw error;
    }
    await saveScheduleStatus(c.env.DB, assignment.career_id, assignment.period_id, 'draft', user.id);
    if ('teacher_id' in body) await c.env.DB.prepare("UPDATE sections SET teacher_id = ?, updated_at = datetime('now') WHERE id = ?").bind(teacherId, assignment.section_id).run();
    await c.env.DB.prepare('UPDATE conflicts SET is_resolved = 1, resolved_at = datetime(\'now\') WHERE assignment_id = ? AND is_resolved = 0').bind(id).run();
    for (const warning of conflicts.filter(conflict => conflict.type === 'WARNING')) {
        await c.env.DB.prepare(`INSERT INTO conflicts (id, assignment_id, type, rule_code, description)
            VALUES (?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, warning.type, warning.rule_code, warning.description).run();
    }
    await recordAudit(c.env.DB, user, 'UPDATE', 'assignment', id, assignment, body);
    return c.json({ success: true, warnings: conflicts.filter(conflict => conflict.type === 'WARNING') });
});

// =============================================
// SCORING ENGINE
// =============================================

app.get('/schedule/score', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const section_id = c.req.query('section_id');
    const period_id = c.req.query('period_id');

    if (!section_id || !period_id) {
        return c.json({ error: 'section_id y period_id requeridos' }, 400);
    }

    // Get section details
    const section = await db.prepare(`
    SELECT s.*, sub.level, s.career_id, t.id as teacher_id
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    WHERE s.id = ? AND s.period_id = ?
  `).bind(section_id, period_id).first() as any;

    if (!section) {
        return c.json({ error: 'Sección no encontrada' }, 404);
    }
    if (!canAccessCareer(user, section.career_id)) {
        return c.json({ error: 'No autorizado' }, 403);
    }

    // Get all timeslots and rooms
    const timeslots = await db.prepare('SELECT * FROM timeslots ORDER BY order_index').all();
    const rooms = await db.prepare(`
    SELECT * FROM rooms 
    WHERE is_active = 1 AND (is_shared = 1 OR career_id = ?)
  `).bind(section.career_id).all();

    // Prefetch the scheduling state once. The previous implementation queried D1
    // several times for every day × block × room combination.
    const assignments = await db.prepare(`SELECT sa.room_id, sa.timeslot_id, sa.day_of_week,
        sec.id AS section_id, sec.parent_section_id, sec.teacher_id, sub.level, sub.career_id
        FROM schedule_assignments sa
        JOIN sections sec ON sec.id = sa.section_id AND sec.period_id = sa.period_id
        JOIN subjects sub ON sub.id = sec.subject_id
        WHERE sa.period_id = ?`).bind(period_id).all();
    const availability = section.teacher_id
        ? await db.prepare(`SELECT timeslot_id, day_of_week, status FROM teacher_availability WHERE teacher_id = ?`).bind(section.teacher_id).all()
        : { results: [] } as any;
    const rows = assignments.results as any[];
    const targetRelationship: SectionRelationshipIdentity = { id: section.id, parent_section_id: section.parent_section_id };
    const roomBusy = new Set(rows.map(row => `${row.room_id}:${row.timeslot_id}:${row.day_of_week}`));
    const teacherBusy = new Set(rows.filter(row => row.teacher_id === section.teacher_id).map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const parentChildBusy = new Set(rows
        .filter(row => areDirectParentAndChild(targetRelationship, { id: row.section_id, parent_section_id: row.parent_section_id }))
        .map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const levelBusy = new Set(rows.filter(row => (
        row.level === section.level &&
        row.career_id === section.career_id &&
        shouldApplyLevelClash(targetRelationship, { id: row.section_id, parent_section_id: row.parent_section_id })
    )).map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const blocked = new Set((availability.results as any[]).filter(row => row.status === 'blocked').map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const preferred = new Set((availability.results as any[]).filter(row => row.status === 'preference').map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const orderById = new Map((timeslots.results as any[]).map(row => [row.id, row.order_index]));
    const scores: any[] = [];

    for (const ts of timeslots.results as any[]) {
        for (let day = 1; day <= 5; day++) {
            const slotKey = `${ts.id}:${day}`;
            for (const room of rooms.results as any[]) {
                if (roomBusy.has(`${room.id}:${slotKey}`) || teacherBusy.has(slotKey) || blocked.has(slotKey) || parentChildBusy.has(slotKey)) continue;
                let score = 100;
                const breakdown: Array<{ rule: string; points: number }> = [];
                if (section.type === room.type) { score += 30; breakdown.push({ rule: 'Tipo de sala coincide', points: 30 }); }
                else if (section.type !== 'TEO') { score -= 15; breakdown.push({ rule: 'Tipo de sala diferente', points: -15 }); }
                if (preferred.has(slotKey)) { score += 20; breakdown.push({ rule: 'Preferencia del docente', points: 20 }); }
                const adjacent = rows.some(row => row.level === section.level && row.career_id === section.career_id && row.day_of_week === day && Math.abs((orderById.get(row.timeslot_id) as number) - ts.order_index) === 1);
                if (adjacent) { score += 20; breakdown.push({ rule: 'Horario contiguo con mismo nivel', points: 20 }); }
                if (room.capacity > section.expected_students * 2) { score -= 10; breakdown.push({ rule: 'Sala demasiado grande', points: -10 }); }
                if (day === 5 && ts.order_index >= 6) { score -= 15; breakdown.push({ rule: 'Viernes último módulo', points: -15 }); }
                if (levelBusy.has(slotKey)) { score -= 15; breakdown.push({ rule: 'Choque de nivel', points: -15 }); }
                if (room.capacity < section.expected_students) { score -= 15; breakdown.push({ rule: 'Capacidad insuficiente', points: -15 }); }
                scores.push({ timeslot_id: ts.id, timeslot_label: ts.label, day_of_week: day, room_id: room.id, room_name: room.name, score: Math.max(1, Math.min(100, score)), breakdown, blocked: false });
            }
        }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    return c.json(scores);
});

// =============================================
// CONFLICTS
// =============================================

app.get('/conflicts', authMiddleware, async (c) => {
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

app.post('/conflicts/:id/resolve', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
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

// =============================================
// HEALTH METRICS
// =============================================

app.get('/metrics/health', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;

    let totalQuery = `SELECT SUM(s.hours_per_week) as total FROM sections s WHERE s.period_id = (SELECT id FROM periods WHERE is_active = 1 LIMIT 1)`;
    let assignedQuery = `SELECT COUNT(*) as total FROM schedule_assignments sa JOIN periods p ON p.id = sa.period_id AND p.is_active = 1`;
    let conflictQuery = `SELECT SUM(CASE WHEN c.type = 'CRITICAL' THEN 1 ELSE 0 END) as critical, SUM(CASE WHEN c.type = 'WARNING' THEN 1 ELSE 0 END) as warnings FROM conflicts c JOIN schedule_assignments sa ON sa.id = c.assignment_id WHERE c.is_resolved = 0 AND sa.period_id = (SELECT id FROM periods WHERE is_active = 1 LIMIT 1)`;
    const params: any[] = [];
    const paramsAssigned: any[] = [];
    const paramsConflict: any[] = [];

    if (user.career_id) {
        totalQuery += ' AND s.career_id = ?';
        params.push(user.career_id);
        
        assignedQuery += ' WHERE sa.career_id = ?';
        paramsAssigned.push(user.career_id);
        
        conflictQuery += ' AND sa.career_id = ?';
        paramsConflict.push(user.career_id);
    }

    const totalSections = await db.prepare(totalQuery).bind(...params).first() as any;
    const assignedSlots = await db.prepare(assignedQuery).bind(...paramsAssigned).first() as any;
    const conflicts = await db.prepare(conflictQuery).bind(...paramsConflict).first() as any;

    const totalToAssign = totalSections?.total || 0;
    const assigned = assignedSlots?.total || 0;
    const assignmentPercentage = totalToAssign > 0 ? Math.round((assigned / totalToAssign) * 100) : 0;

    // Health score = assignment % minus conflict penalties
    const conflictPenalty = ((conflicts?.critical || 0) * 10) + ((conflicts?.warnings || 0) * 2);
    const healthScore = Math.max(0, assignmentPercentage - conflictPenalty);

    return c.json({
        total_slots_required: totalToAssign,
        slots_assigned: assigned,
        assignment_percentage: assignmentPercentage,
        critical_conflicts: conflicts?.critical || 0,
        warning_conflicts: conflicts?.warnings || 0,
        health_score: healthScore,
    });
});

app.get('/audit', authMiddleware, async (c) => {
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

// =============================================
// IMPORT ENDPOINTS (Bulk Insert)
// =============================================

// Import Teachers
app.post('/import/docentes', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const { data, career_id, import_mode } = await c.req.json();

    if (!data || !Array.isArray(data)) {
        return c.json({ error: 'Datos inválidos' }, 400);
    }

    const targetCareerId = user.role === 'admin' && career_id ? career_id : user.career_id;
    if (!targetCareerId) {
        return c.json({ error: 'Career ID requerido' }, 400);
    }

    if (data.length > 10_000) return c.json({ error: 'Máximo 10.000 registros por importación' }, 413);
    const statements = data.map((row: Record<string, string>) => {
        const id = `tch-${crypto.randomUUID().slice(0, 8)}`;
        const rut = row.RUT || row.rut || `DEMO-${id}`;
        return db.prepare(`INSERT INTO teachers (id, career_id, rut, name, email, contract_type, max_hours_per_week, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(rut) DO UPDATE SET name = excluded.name, email = excluded.email,
            contract_type = excluded.contract_type, max_hours_per_week = excluded.max_hours_per_week,
            is_active = excluded.is_active, updated_at = datetime('now')`)
            .bind(id, targetCareerId, rut, row.Nombre || row.nombre || '', row.Email || row.email || null,
                row['Tipo Contrato'] || row.tipo_contrato || 'Honorarios', parseInt(row['Max Horas'] || row.max_horas || '12'),
                (row.Estado || row.estado || 'Activo').toLowerCase() === 'activo' ? 1 : 0);
    });
    if (import_mode === 'replace') statements.unshift(db.prepare('UPDATE teachers SET is_active = 0 WHERE career_id = ?').bind(targetCareerId));
    try {
        await db.batch(statements);
        return c.json({ success: true, inserted: data.length, errors: [] });
    } catch (error) {
        return c.json({ error: 'La importación fue revertida', details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

// Import Subjects
app.post('/import/asignaturas', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const { data, career_id } = await c.req.json();

    if (!data || !Array.isArray(data)) {
        return c.json({ error: 'Datos inválidos' }, 400);
    }

    const targetCareerId = user.role === 'admin' && career_id ? career_id : user.career_id;
    if (!targetCareerId) {
        return c.json({ error: 'Career ID requerido' }, 400);
    }

    if (data.length > 10_000) return c.json({ error: 'Máximo 10.000 registros por importación' }, 413);
    const statements = data.map((row: Record<string, string>) => db.prepare(`
        INSERT INTO subjects (id, career_id, code, name, level, credits) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(career_id, code) DO UPDATE SET name = excluded.name, level = excluded.level,
        credits = excluded.credits, updated_at = datetime('now')`)
        .bind(`sub-${crypto.randomUUID().slice(0, 8)}`, targetCareerId, row.Codigo || row.codigo || '', row.Nombre || row.nombre || '',
            parseInt(row.Nivel || row.nivel || '1'), parseInt(row.Creditos || row.creditos || '4')));
    try {
        await db.batch(statements);
        return c.json({ success: true, inserted: data.length, errors: [] });
    } catch (error) {
        return c.json({ error: 'La importación fue revertida', details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

// Import Rooms
app.post('/import/salas', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const { data, career_id, import_mode } = await c.req.json();

    if (!data || !Array.isArray(data)) {
        return c.json({ error: 'Datos inválidos' }, 400);
    }

    const targetCareerId = user.role === 'admin' && career_id ? career_id : user.career_id;
    if (!targetCareerId) {
        return c.json({ error: 'Career ID requerido' }, 400);
    }

    if (data.length > 10_000) return c.json({ error: 'Máximo 10.000 registros por importación' }, 413);
    const uniqueRows = new Map<string, { row: Record<string, string>; roomCareerId: string | null; isShared: boolean }>();
    for (const row of data as Record<string, string>[]) {
        const sharedText = (row.Compartida || row.compartida || 'No').toLowerCase();
        const isShared = user.role === 'admin' && (sharedText === 'sí' || sharedText === 'si');
        const roomCareerId = isShared ? null : targetCareerId;
        const name = String(row.Nombre || row.nombre || '').trim();
        const building = String(row.Edificio || row.edificio || '').trim();
        if (!name) continue;
        const key = `${name.toLocaleLowerCase()}\u0000${building.toLocaleLowerCase()}\u0000${roomCareerId || ''}`;
        if (!uniqueRows.has(key)) uniqueRows.set(key, { row, roomCareerId, isShared });
    }
    const statements = [...uniqueRows.values()].map(({ row, roomCareerId, isShared }) => {
        const name = String(row.Nombre || row.nombre || '').trim();
        const building = String(row.Edificio || row.edificio || '').trim() || null;
        return db.prepare(`INSERT INTO rooms (id, career_id, name, building, floor, type, capacity, is_shared, is_active)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1 WHERE NOT EXISTS (
                SELECT 1 FROM rooms WHERE is_active = 1
                AND lower(trim(name)) = lower(trim(?))
                AND lower(trim(COALESCE(building, ''))) = lower(trim(COALESCE(?, '')))
                AND COALESCE(career_id, '') = COALESCE(?, '')
            )`).bind(`room-${crypto.randomUUID().slice(0, 8)}`, roomCareerId, name,
                building, parseInt(row.Piso || row.piso || '1'), row.Tipo || row.tipo || 'TEO',
                parseInt(row.Capacidad || row.capacidad || '30'), isShared ? 1 : 0, name,
                building, roomCareerId);
    });
    if (import_mode === 'replace') statements.unshift(db.prepare('UPDATE rooms SET is_active = 0 WHERE career_id = ?').bind(targetCareerId));
    try {
        await db.batch(statements);
        return c.json({ success: true, inserted: uniqueRows.size, skipped: data.length - uniqueRows.size, errors: [] });
    } catch (error) {
        return c.json({ error: 'La importación fue revertida', details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

// Import Schedules (Sections)
app.post('/import/horarios', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const { data, career_id, period_id, import_mode } = await c.req.json();

    if (!data || !Array.isArray(data)) {
        return c.json({ error: 'Datos inválidos' }, 400);
    }

    const targetCareerId = user.role === 'admin' && career_id ? career_id : user.career_id;
    if (!targetCareerId) {
        return c.json({ error: 'Career ID requerido' }, 400);
    }
    if (data.length > 10_000) return c.json({ error: 'Máximo 10.000 registros por importación' }, 413);
    const period = await db.prepare('SELECT id FROM periods WHERE id = ?').bind(period_id).first();
    if (!period) return c.json({ error: 'Período académico inválido' }, 400);

    const nrcGroups = new Map<string, Record<string, string>[]>();
    for (const row of data as Record<string, string>[]) {
        const nrc = String(row.NRC || row.nrc || '').trim();
        if (!nrc) return c.json({ error: 'Todas las secciones deben tener NRC' }, 400);
        const rows = nrcGroups.get(nrc) || [];
        rows.push(row);
        nrcGroups.set(nrc, rows);
    }

    const [subjectRows, teacherRows, existingSectionRows, existingAssignmentRows] = await Promise.all([
        db.prepare('SELECT id, code FROM subjects WHERE career_id = ?').bind(targetCareerId).all(),
        db.prepare('SELECT id, rut FROM teachers WHERE career_id = ?').bind(targetCareerId).all(),
        db.prepare(`SELECT s.id, s.nrc, s.type, s.subject_id, sub.code AS subject_code,
                (SELECT COUNT(*) FROM sections child WHERE child.parent_section_id = s.id) AS child_count
            FROM sections s JOIN subjects sub ON sub.id = s.subject_id
            WHERE s.career_id = ? AND s.period_id = ?`).bind(targetCareerId, period_id).all(),
        db.prepare(`SELECT section_id, timeslot_id, day_of_week FROM schedule_assignments
            WHERE career_id = ? AND period_id = ?`).bind(targetCareerId, period_id).all(),
    ]);

    const subjectIds = new Map((subjectRows.results as any[]).map(row => [String(row.code).trim().toUpperCase(), row.id as string]));
    const teacherIds = new Map((teacherRows.results as any[]).map(row => [row.rut, row.id]));
    const existingSections = new Map((existingSectionRows.results as any[]).map(row => [String(row.nrc), row]));
    const assignedSlotsBySection = new Map<string, Set<string>>();
    for (const assignment of existingAssignmentRows.results as any[]) {
        const slots = assignedSlotsBySection.get(String(assignment.section_id)) || new Set<string>();
        slots.add(`${assignment.timeslot_id}|${assignment.day_of_week}`);
        assignedSlotsBySection.set(String(assignment.section_id), slots);
    }
    const statements: D1PreparedStatement[] = [];

    type PreparedSection = {
        id: string;
        nrc: string;
        type: SectionType;
        subjectId: string;
        subjectCode: string;
        parentNrc: string | null;
        row: Record<string, string>;
    };
    const preparedSections: PreparedSection[] = [];

    for (const [nrc, rows] of nrcGroups) {
        const firstRow = rows[0];
        const subjectCode = String(firstRow.Codigo || firstRow.codigo || '').trim().toUpperCase();
        if (!subjectCode) return c.json({ error: `La sección NRC ${nrc} no tiene código de asignatura` }, 400);
        let subjectId = subjectIds.get(subjectCode);
        if (!subjectId) {
            subjectId = `sub-${crypto.randomUUID().slice(0, 8)}`;
            subjectIds.set(subjectCode, subjectId);
            statements.push(db.prepare('INSERT INTO subjects (id, career_id, code, name, level, credits) VALUES (?, ?, ?, ?, ?, 4)')
                .bind(subjectId, targetCareerId, subjectCode,
                    firstRow.Asignatura || firstRow.asignatura || firstRow.Nombre || firstRow.nombre || '',
                    parseInt(firstRow.Nivel || firstRow.nivel || '1')));
        }
        const type = normalizeSectionType(firstRow.Tipo || firstRow.tipo);
        const parentNrc = String(firstRow.nrc_teorico || firstRow.NRC_Teorico || firstRow['NRC Teorico'] || firstRow.nrc_padre || '').trim() || null;
        const existing = existingSections.get(nrc);
        if (existing && Number(existing.child_count || 0) > 0 && (
            type !== 'TEO' || String(existing.subject_code).trim().toUpperCase() !== subjectCode
        )) {
            return c.json({ error: `No se puede cambiar el tipo o la asignatura del NRC teórico ${nrc} porque tiene prácticas asociadas` }, 409);
        }
        preparedSections.push({
            id: import_mode === 'replace' ? `sec-${crypto.randomUUID().slice(0, 8)}` : existing?.id || `sec-${crypto.randomUUID().slice(0, 8)}`,
            nrc,
            type,
            subjectId,
            subjectCode,
            parentNrc,
            row: firstRow,
        });
    }

    const availableSections = new Map<string, { id: string; type: SectionType; subjectCode: string }>();
    if (import_mode !== 'replace') {
        for (const row of existingSectionRows.results as any[]) {
            availableSections.set(String(row.nrc), {
                id: String(row.id),
                type: normalizeSectionType(row.type),
                subjectCode: String(row.subject_code).trim().toUpperCase(),
            });
        }
    }
    for (const section of preparedSections) {
        availableSections.set(section.nrc, { id: section.id, type: section.type, subjectCode: section.subjectCode });
    }

    for (const section of preparedSections) {
        if (section.type === 'TEO' && section.parentNrc) {
            return c.json({ error: `La sección teórica NRC ${section.nrc} no puede tener NRC teórico padre` }, 400);
        }
        if (section.type !== 'TEO' && !section.parentNrc) {
            return c.json({ error: `La práctica NRC ${section.nrc} requiere la columna nrc_teorico` }, 400);
        }
        if (!section.parentNrc) continue;
        if (section.parentNrc === section.nrc) return c.json({ error: `La sección NRC ${section.nrc} no puede ser su propio padre` }, 400);
        const parent = availableSections.get(section.parentNrc);
        if (!parent) return c.json({ error: `No existe la sección teórica NRC ${section.parentNrc} indicada por la práctica NRC ${section.nrc}` }, 400);
        if (parent.type !== 'TEO') return c.json({ error: `El NRC padre ${section.parentNrc} debe ser de tipo TEO` }, 400);
        if (parent.subjectCode !== section.subjectCode) {
            return c.json({ error: `La práctica NRC ${section.nrc} y su teoría NRC ${section.parentNrc} deben pertenecer a la misma asignatura` }, 400);
        }
        if (import_mode !== 'replace') {
            const childSlots = assignedSlotsBySection.get(section.id) || new Set<string>();
            const parentSlots = assignedSlotsBySection.get(parent.id) || new Set<string>();
            if ([...childSlots].some(slot => parentSlots.has(slot))) {
                return c.json({ error: `No se puede vincular la práctica NRC ${section.nrc}: ya coincide en horario con la teoría NRC ${section.parentNrc}` }, 409);
            }
        }
    }

    preparedSections.sort((first, second) => Number(first.type !== 'TEO') - Number(second.type !== 'TEO'));
    for (const section of preparedSections) {
        const firstRow = section.row;
        const teacherId = teacherIds.get(firstRow['RUT Docente'] || firstRow.rut_docente || '') || null;
        const parentSectionId = section.parentNrc ? availableSections.get(section.parentNrc)!.id : null;
        const sectionCode = String(firstRow.Seccion || firstRow.seccion || '').trim() || null;
        statements.push(db.prepare(`INSERT INTO sections (id, period_id, career_id, subject_id, teacher_id, nrc, section_code, type, parent_section_id, hours_per_week, expected_students, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(period_id, career_id, nrc) DO UPDATE SET subject_id = excluded.subject_id, teacher_id = excluded.teacher_id,
            section_code = excluded.section_code, type = excluded.type, parent_section_id = excluded.parent_section_id,
            hours_per_week = excluded.hours_per_week, expected_students = excluded.expected_students,
            updated_at = datetime('now')`)
            .bind(section.id, period_id, targetCareerId, section.subjectId, teacherId, section.nrc, sectionCode,
                section.type, parentSectionId, parseInt(firstRow.Horas || firstRow.horas || '2'),
                parseInt(firstRow.Estudiantes || firstRow.estudiantes || '30')));
    }
    try {
        // Replace only the selected career/period scope. Deleting sections also
        // removes their stale schedule assignments through the FK cascade.
        if (import_mode === 'replace') {
            statements.unshift(
                db.prepare('DELETE FROM sections WHERE period_id = ? AND career_id = ? AND parent_section_id IS NOT NULL').bind(period_id, targetCareerId),
                db.prepare('DELETE FROM sections WHERE period_id = ? AND career_id = ?').bind(period_id, targetCareerId),
            );
        }
        await db.batch(statements);
        const linked = preparedSections.filter(section => section.parentNrc).length;
        return c.json({
            success: true,
            inserted: nrcGroups.size,
            linked,
            errors: [],
            message: `${nrcGroups.size} secciones procesadas; ${linked} prácticas vinculadas a su teoría`,
        });
    } catch (error) {
        return c.json({ error: sectionRelationshipError(error), details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

app.post('/import/analyze-mapping', authMiddleware, async (c) => {
    const user = c.get('user');
    const rateLimited = await requireExpensiveRequestBudget(c, user);
    if (rateLimited) return rateLimited;
    const body = await c.req.json<{ headers?: unknown; model?: unknown }>();
    if (!Array.isArray(body.headers) || body.headers.length === 0 || body.headers.length > 200 ||
        body.headers.some(header => typeof header !== 'string' || header.length === 0 || header.length > 200)) {
        return c.json({ error: 'Encabezados inválidos' }, 400);
    }

    const headers = body.headers as string[];
    const geminiApiKey = c.env.GEMINI_API_KEY || c.env.API_KEY;
    const selected = resolveMappingAIModel(body.model, {
        openai: isConfiguredApiKey(c.env.OPENAI_API_KEY),
        gemini: isConfiguredApiKey(geminiApiKey),
    });

    if (selected.provider === 'local') {
        return c.json(createMappingAnalysis(headers, selected));
    }

    try {
        const mappings = selected.provider === 'openai'
            ? await analyzeMappingWithOpenAI(headers, selected.model!, c.env.OPENAI_API_KEY!, user.id)
            : await analyzeMappingWithGemini(headers, selected.model!, geminiApiKey!);

        return c.json({ ...selected, mappings } satisfies MappingAnalysis);
    } catch (error: unknown) {
        console.error(`${selected.provider} mapping analysis failed:`, error instanceof Error ? error.message : error);
        return c.json(createMappingAnalysis(headers, {
            ...selected,
            provider: 'local',
            model: null,
            fallback: true,
            notice: `${selected.provider === 'openai' ? 'OpenAI' : 'Gemini'} no respondió; se aplicaron reglas locales.`,
        }));
    }
});

async function analyzeMappingWithGemini(headers: string[], model: string, apiKey: string): Promise<MappingField[]> {
    const systemFields = ['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario'];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `Analiza los siguientes encabezados de un archivo CSV de horarios académicos: [${headers.join(', ')}]. Mapea cada uno a los campos del sistema: [${systemFields.join(', ')}]. Devuelve un objeto JSON con el mapeo sugerido y una evaluación de validez.`
                }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            systemField: { type: "STRING" },
                            csvHeader: { type: "STRING" },
                            status: { type: "STRING", description: "valid, warning, or error" },
                            message: { type: "STRING" }
                        },
                        required: ["systemField", "csvHeader", "status", "message"]
                    }
                }
            }
        })
    });

    if (!response.ok) throw new Error(`Gemini API error ${response.status}`);

    const resData = await response.json() as any;
    const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini no devolvió contenido');
    return validateMappingResponse(JSON.parse(text), headers);
}

async function analyzeMappingWithOpenAI(headers: string[], model: string, apiKey: string, safetyIdentifier: string): Promise<MappingField[]> {
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            store: false,
            safety_identifier: safetyIdentifier,
            reasoning: { effort: 'low' },
            max_output_tokens: 1200,
            instructions: 'Eres un asistente de importación académica. Mapea encabezados CSV solo a los seis campos indicados. No inventes encabezados que no existan.',
            input: `Encabezados CSV: ${JSON.stringify(headers)}. Campos del sistema: Docente, Asignatura, NRC, Sala, Día, Horario. Marca valid si la coincidencia es clara, warning si requiere revisión y error si es incompatible.`,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'mapping_analysis',
                    strict: true,
                    schema: {
                        type: 'object',
                        properties: {
                            mappings: {
                                type: 'array',
                                minItems: 6,
                                maxItems: 6,
                                items: {
                                    type: 'object',
                                    properties: {
                                        systemField: { type: 'string', enum: ['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario'] },
                                        csvHeader: { type: 'string' },
                                        status: { type: 'string', enum: ['valid', 'warning', 'error'] },
                                        message: { type: 'string' },
                                    },
                                    required: ['systemField', 'csvHeader', 'status', 'message'],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ['mappings'],
                        additionalProperties: false,
                    },
                },
            },
        }),
    });

    if (!response.ok) throw new Error(`OpenAI API error ${response.status}`);

    const data = await response.json() as { status?: string; output_text?: string };
    if (data.status !== 'completed' || !data.output_text) throw new Error('OpenAI no completó la respuesta');
    const parsed = JSON.parse(data.output_text) as { mappings?: unknown };
    return validateMappingResponse(parsed.mappings, headers);
}

function validateMappingResponse(value: unknown, headers: string[]): MappingField[] {
    if (!Array.isArray(value) || value.length !== 6) throw new Error('Respuesta de mapeo inválida');
    const validSystemFields = new Set(['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario']);
    const validStatuses = new Set(['valid', 'warning', 'error']);
    const seen = new Set<string>();

    const mappings = value.map(item => {
        if (!item || typeof item !== 'object') throw new Error('Elemento de mapeo inválido');
        const candidate = item as Record<string, unknown>;
        if (typeof candidate.systemField !== 'string' || !validSystemFields.has(candidate.systemField) || seen.has(candidate.systemField) ||
            typeof candidate.csvHeader !== 'string' || (candidate.csvHeader !== '' && !headers.includes(candidate.csvHeader)) ||
            typeof candidate.status !== 'string' || !validStatuses.has(candidate.status) ||
            typeof candidate.message !== 'string') {
            throw new Error('Campos de mapeo inválidos');
        }
        seen.add(candidate.systemField);
        return candidate as unknown as MappingField;
    });

    return mappings;
}

function createMappingAnalysis(headers: string[], selected: ResolvedMappingAIModel): MappingAnalysis {
    return { ...selected, mappings: createLocalMapping(headers) };
}

function isConfiguredApiKey(value?: string): value is string {
    return Boolean(value && value !== 'PLACEHOLDER_API_KEY');
}

function isIsoDate(value?: string): value is string {
    return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function isTime(value?: string): value is string {
    return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

type SectionType = 'TEO' | 'LAB' | 'TAL' | 'SIM';

function normalizeSectionType(value: unknown): SectionType {
    const normalized = String(value || 'TEO').trim().toUpperCase();
    return ['TEO', 'LAB', 'TAL', 'SIM'].includes(normalized) ? normalized as SectionType : 'TEO';
}

function sectionRelationshipError(error: unknown): string {
    const message = String(error);
    if (message.includes('PRACTICE_REQUIRES_PARENT')) return 'Las secciones prácticas requieren una sección teórica padre';
    if (message.includes('THEORY_CANNOT_HAVE_PARENT')) return 'Una sección teórica no puede depender de otra sección';
    if (message.includes('SECTION_CANNOT_PARENT_ITSELF')) return 'Una sección no puede ser su propio padre';
    if (message.includes('PARENT_CHILD_SCHEDULE_OVERLAP')) return 'La teoría y su práctica ya están programadas en el mismo horario';
    if (message.includes('PARENT_UPDATE_INVALIDATES_CHILDREN')) return 'El cambio dejaría prácticas asociadas inválidas';
    if (message.includes('INVALID_PARENT_SECTION')) return 'La sección padre debe ser teórica y pertenecer a la misma asignatura, carrera y período';
    return 'No fue posible guardar la relación entre secciones';
}

async function validateParentSelection(db: D1Database, params: {
    sectionId: string;
    parentSectionId: string | null;
    type: SectionType;
    subjectId: string;
    careerId: string;
    periodId: string;
}): Promise<string | null> {
    if (params.type === 'TEO') {
        return params.parentSectionId ? 'Una sección teórica no puede depender de otra sección' : null;
    }
    if (!params.parentSectionId) return 'Selecciona la sección teórica padre para esta práctica';
    if (params.parentSectionId === params.sectionId) return 'Una sección no puede ser su propio padre';

    const parent = await db.prepare(`SELECT id FROM sections
        WHERE id = ? AND type = 'TEO' AND subject_id = ? AND career_id = ? AND period_id = ?`)
        .bind(params.parentSectionId, params.subjectId, params.careerId, params.periodId).first();
    if (!parent) return 'La sección padre debe ser teórica y pertenecer a la misma asignatura, carrera y período';

    const overlap = await db.prepare(`SELECT 1
        FROM schedule_assignments child_assignment
        JOIN schedule_assignments parent_assignment
          ON parent_assignment.section_id = ?
         AND parent_assignment.period_id = child_assignment.period_id
         AND parent_assignment.timeslot_id = child_assignment.timeslot_id
         AND parent_assignment.day_of_week = child_assignment.day_of_week
        WHERE child_assignment.section_id = ? LIMIT 1`)
        .bind(params.parentSectionId, params.sectionId).first();
    return overlap ? 'La teoría y su práctica ya están programadas en el mismo horario' : null;
}

// =============================================
// HELPER FUNCTIONS
// =============================================

async function recordAudit(
    db: D1Database,
    user: UserPayload,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
) {
    const careerId = user.career_id || getCareerId(newValue) || getCareerId(oldValue);
    await db.prepare(`INSERT INTO audit_log (id, user_id, career_id, action, entity_type, entity_id, old_value, new_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), user.id, careerId, action, entityType, entityId,
            oldValue == null ? null : JSON.stringify(oldValue), newValue == null ? null : JSON.stringify(newValue)).run();
}

function getCareerId(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = (value as Record<string, unknown>).career_id;
    return typeof candidate === 'string' && candidate ? candidate : null;
}

async function saveScheduleStatus(
    db: D1Database,
    careerId: string,
    periodId: string,
    status: 'draft' | 'review' | 'published',
    userId: string,
) {
    await db.prepare(`INSERT INTO schedule_statuses (career_id, period_id, status, updated_by, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(career_id, period_id) DO UPDATE SET status = excluded.status,
        updated_by = excluded.updated_by, updated_at = datetime('now')`)
        .bind(careerId, periodId, status, userId).run();
}

async function findBestAlternative(db: D1Database, assignment: any) {
    const section = await db.prepare('SELECT s.* FROM sections s WHERE s.id = ? AND s.period_id = ?')
        .bind(assignment.section_id, assignment.period_id).first() as any;
    if (!section) return null;

    // Load the planning context once. The previous implementation called
    // validateAssignment for every room/day/block combination, which resulted
    // in thousands of sequential D1 queries and caused the resolve request to
    // time out before returning an alternative.
    const teacherId = section.teacher_id as string | null;
    const [roomsResult, timeslotsResult, existingResult, blockedResult] = await Promise.all([
        db.prepare('SELECT id, name, type, capacity FROM rooms WHERE is_active = 1 AND (is_shared = 1 OR career_id = ?)').bind(section.career_id).all(),
        db.prepare('SELECT id, label, order_index FROM timeslots ORDER BY order_index').all(),
        db.prepare(`
            SELECT sa.room_id, sa.timeslot_id, sa.day_of_week,
                   sec.id AS section_id, sec.parent_section_id, sec.teacher_id, sub.level
            FROM schedule_assignments sa
            JOIN sections sec ON sec.id = sa.section_id AND sec.period_id = sa.period_id
            JOIN subjects sub ON sub.id = sec.subject_id
            WHERE sa.period_id = ? AND sa.id <> ?
        `).bind(assignment.period_id, assignment.assignment_id).all(),
        teacherId
            ? db.prepare(`SELECT timeslot_id, day_of_week FROM teacher_availability
                WHERE teacher_id = ? AND status = 'blocked'`).bind(teacherId).all()
            : Promise.resolve({ results: [] }),
    ]);

    const existing = existingResult.results as any[];
    const targetRelationship: SectionRelationshipIdentity = { id: section.id, parent_section_id: section.parent_section_id };
    const occupiedRooms = new Set(existing.map(row => `${row.room_id}|${row.timeslot_id}|${row.day_of_week}`));
    const occupiedTeachers = new Set(
        existing.filter(row => row.teacher_id === teacherId)
            .map(row => `${row.timeslot_id}|${row.day_of_week}`),
    );
    const blockedTeacherSlots = new Set(
        (blockedResult.results as any[]).map(row => `${row.timeslot_id}|${row.day_of_week}`),
    );
    const parentChildSlots = new Set(
        existing
            .filter(row => areDirectParentAndChild(targetRelationship, { id: row.section_id, parent_section_id: row.parent_section_id }))
            .map(row => `${row.timeslot_id}|${row.day_of_week}`),
    );
    const occupiedLevels = new Set(
        existing.filter(row => row.level === section.level && shouldApplyLevelClash(
            targetRelationship,
            { id: row.section_id, parent_section_id: row.parent_section_id },
        ))
            .map(row => `${row.timeslot_id}|${row.day_of_week}`),
    );
    const candidates: any[] = [];

    for (const timeslot of timeslotsResult.results as any[]) {
        for (let day = 1; day <= 5; day++) {
            for (const room of roomsResult.results as any[]) {
                const slotKey = `${timeslot.id}|${day}`;
                if (occupiedRooms.has(`${room.id}|${slotKey}`)) continue;
                if (teacherId && (occupiedTeachers.has(slotKey) || blockedTeacherSlots.has(slotKey))) continue;
                if (parentChildSlots.has(slotKey)) continue;
                let score = 100;
                if (room.type === section.type) score += 30;
                else if (section.type !== 'TEO') score -= 30;
                if (room.capacity < section.expected_students) score -= 40;
                if (day === 5 && timeslot.order_index >= 6) score -= 15;
                if (occupiedLevels.has(slotKey)) score -= 15;
                candidates.push({ room_id: room.id, room_name: room.name, timeslot_id: timeslot.id, timeslot_label: timeslot.label, day_of_week: day, score });
            }
        }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
}

async function validateAssignment(db: D1Database, params: {
    section_id: string;
    room_id: string;
    timeslot_id: string;
    day_of_week: number;
    career_id: string;
    period_id: string;
    exclude_assignment_id?: string;
    teacher_id_override?: string | null;
}) {
    const conflicts: { type: 'CRITICAL' | 'WARNING'; rule_code: string; description: string }[] = [];

    // Get section details (including real career_id)
    const section = await db.prepare(`
    SELECT s.*, sub.level, s.career_id, t.id as teacher_id, t.name as teacher_name
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    WHERE s.id = ? AND s.period_id = ?
  `).bind(params.section_id, params.period_id).first() as any;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(params.room_id).first() as any;

    // CRITICAL: Room already occupied
    const excludedId = params.exclude_assignment_id || null;
    const roomConflict = await db.prepare(`
    SELECT sa.id FROM schedule_assignments sa
    WHERE sa.room_id = ? AND sa.timeslot_id = ? AND sa.day_of_week = ? AND sa.period_id = ?
      AND (? IS NULL OR sa.id <> ?)
  `).bind(params.room_id, params.timeslot_id, params.day_of_week, params.period_id, excludedId, excludedId).first();

    if (roomConflict) {
        conflicts.push({
            type: 'CRITICAL',
            rule_code: 'ROOM_OCCUPIED',
            description: `La sala ${room.name} ya está ocupada en ese horario`,
        });
    }

    // CRITICAL: Teacher already assigned
    const teacherId = params.teacher_id_override === undefined ? section.teacher_id : params.teacher_id_override;
    const teacher = teacherId
        ? await db.prepare('SELECT id, name FROM teachers WHERE id = ?').bind(teacherId).first<{ id: string; name: string }>()
        : null;
    if (teacherId) {
        const teacherConflict = await db.prepare(`
      SELECT sa.id FROM schedule_assignments sa
      JOIN sections sec ON sec.id = sa.section_id AND sec.period_id = sa.period_id
      WHERE sec.teacher_id = ? AND sa.timeslot_id = ? AND sa.day_of_week = ? AND sa.period_id = ?
        AND (? IS NULL OR sa.id <> ?)
    `).bind(teacherId, params.timeslot_id, params.day_of_week, params.period_id, excludedId, excludedId).first();

        if (teacherConflict) {
            conflicts.push({
                type: 'CRITICAL',
                rule_code: 'TEACHER_DUPLICATE',
                description: `El docente ${teacher?.name || section.teacher_name || ''} ya está asignado en ese horario`,
            });
        }

        // CRITICAL: Teacher blocked
        const teacherBlocked = await db.prepare(`
      SELECT id FROM teacher_availability 
      WHERE teacher_id = ? AND timeslot_id = ? AND day_of_week = ? AND status = 'blocked'
    `).bind(teacherId, params.timeslot_id, params.day_of_week).first();

        if (teacherBlocked) {
            conflicts.push({
                type: 'CRITICAL',
                rule_code: 'TEACHER_BLOCKED',
                description: `El docente ${teacher?.name || section.teacher_name || ''} tiene ese horario bloqueado`,
            });
        }
    }

    const simultaneousResult = await db.prepare(`
    SELECT sa.id, sec.id AS section_id, sec.parent_section_id, sec.nrc, sub.name AS subject_name, sub.level, sub.career_id
    FROM schedule_assignments sa
    JOIN sections sec ON sec.id = sa.section_id AND sec.period_id = sa.period_id
    JOIN subjects sub ON sub.id = sec.subject_id
    WHERE sa.period_id = ? AND sa.timeslot_id = ? AND sa.day_of_week = ?
      AND (? IS NULL OR sa.id <> ?)
  `).bind(params.period_id, params.timeslot_id, params.day_of_week, excludedId, excludedId).all();
    const simultaneous = simultaneousResult.results as any[];
    const currentRelationship: SectionRelationshipIdentity = { id: section.id, parent_section_id: section.parent_section_id };
    const parentChildConflict = simultaneous.find(row => areDirectParentAndChild(
        currentRelationship,
        { id: row.section_id, parent_section_id: row.parent_section_id },
    ));

    if (parentChildConflict) {
        conflicts.push({
            type: 'CRITICAL',
            rule_code: 'PARENT_CHILD_OVERLAP',
            description: `La teoría y la práctica asociada (${parentChildConflict.subject_name}, NRC ${parentChildConflict.nrc}) no pueden programarse en el mismo horario`,
        });
    }

    // Sibling practices are different student groups and may run in parallel.
    // Unrelated sections from the same level keep the ordinary overlap warning.
    const levelClash = simultaneous.find(row => (
        row.level === section.level &&
        row.career_id === section.career_id &&
        shouldApplyLevelClash(currentRelationship, { id: row.section_id, parent_section_id: row.parent_section_id })
    ));

    if (levelClash) {
        conflicts.push({
            type: 'WARNING',
            rule_code: 'LEVEL_CLASH',
            description: `Alumnos de nivel ${section.level} ya tienen otra clase en ese horario`,
        });
    }

    // WARNING: Room type mismatch
    if (section.type !== room.type && section.type !== 'TEO') {
        conflicts.push({
            type: 'WARNING',
            rule_code: 'ROOM_TYPE_MISMATCH',
            description: `La sección requiere sala tipo ${section.type} pero se asignó ${room.type}`,
        });
    }

    // WARNING: Overcapacity  
    if (section.expected_students > room.capacity) {
        conflicts.push({
            type: 'WARNING',
            rule_code: 'OVERCAPACITY',
            description: `La sala tiene capacidad ${room.capacity} pero la sección espera ${section.expected_students} alumnos`,
        });
    }

    return conflicts;
}

async function calculateSlotScore(db: D1Database, params: {
    section: any;
    room: any;
    timeslot: any;
    day_of_week: number;
    period_id: string;
}) {
    let total = 100;
    const breakdown: { rule: string; points: number }[] = [];
    let blocked = false;

    // Check hard blocks
    const conflicts = await validateAssignment(db, {
        section_id: params.section.id,
        room_id: params.room.id,
        timeslot_id: params.timeslot.id,
        day_of_week: params.day_of_week,
        career_id: params.section.career_id,
        period_id: params.period_id,
    });

    if (conflicts.some(c => c.type === 'CRITICAL')) {
        return { total: 0, breakdown: [], blocked: true };
    }

    // Room type match bonus
    if (params.section.type === params.room.type) {
        total += 30;
        breakdown.push({ rule: 'Tipo de sala coincide', points: 30 });
    }

    // Teacher preference bonus
    if (params.section.teacher_id) {
        const preference = await db.prepare(`
      SELECT id FROM teacher_availability
      WHERE teacher_id = ? AND timeslot_id = ? AND day_of_week = ? AND status = 'preference'
    `).bind(params.section.teacher_id, params.timeslot.id, params.day_of_week).first();

        if (preference) {
            total += 20;
            breakdown.push({ rule: 'Preferencia del docente', points: 20 });
        }
    }

    // Contiguous class bonus (check if same level has class before/after)
    const adjacentClass = await db.prepare(`
    SELECT sa.id FROM schedule_assignments sa
    JOIN sections sec ON sec.id = sa.section_id AND sec.period_id = sa.period_id
    JOIN subjects sub ON sub.id = sec.subject_id
    JOIN timeslots ts ON ts.id = sa.timeslot_id
    WHERE sub.level = ? AND sub.career_id = ? AND sa.period_id = ? AND sa.day_of_week = ?
    AND (ts.order_index = ? OR ts.order_index = ?)
  `).bind(
        params.section.level,
        params.section.career_id,
        params.period_id,
        params.day_of_week,
        params.timeslot.order_index - 1,
        params.timeslot.order_index + 1
    ).first();

    if (adjacentClass) {
        total += 20;
        breakdown.push({ rule: 'Horario contiguo con mismo nivel', points: 20 });
    }

    // Room size penalty (too big)
    if (params.room.capacity > params.section.expected_students * 2) {
        total -= 10;
        breakdown.push({ rule: 'Sala demasiado grande', points: -10 });
    }

    // Friday last module penalty
    if (params.day_of_week === 5 && params.timeslot.order_index >= 6) {
        total -= 15;
        breakdown.push({ rule: 'Viernes último módulo', points: -15 });
    }

    // Apply warning penalties
    for (const conflict of conflicts.filter(c => c.type === 'WARNING')) {
        total -= 15;
        breakdown.push({ rule: conflict.description, points: -15 });
    }

    return { total: Math.max(0, Math.min(100, total)), breakdown, blocked: false };
}

// Simple JWT implementation for Workers
function getJwtSecret(env: Env): string {
    if (env.JWT_SECRET && env.JWT_SECRET.length >= 32 && env.JWT_SECRET !== 'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS') {
        return env.JWT_SECRET;
    }
    if (env.ENVIRONMENT !== 'production' && env.DEMO_AUTH === 'true') return 'scheduler-pro-local-demo-secret-change-me';
    throw new Error('JWT_SECRET no está configurado de forma segura');
}

app.notFound((c) => c.json({ error: 'Endpoint no encontrado' }, 404));
app.onError((error, c) => {
    console.error('Unhandled API error:', error);
    if (error instanceof SyntaxError) return c.json({ error: 'JSON inválido' }, 400);
    return c.json({ error: 'Error interno' }, 500);
});

// Cloudflare Pages Functions handler
export const onRequest = async (context: any) => {
    return app.fetch(context.request, context.env);
};
