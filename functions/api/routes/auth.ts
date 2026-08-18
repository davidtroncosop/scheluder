import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import {
    allowRequest,
    authMiddleware,
    getJwtSecret,
} from '../middleware/auth';
import {
    hashPassword,
    safeSecretEquals,
    signJwt,
    verifyPassword,
} from '../../../features/auth/security';

const DUMMY_PASSWORD_HASH = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const registrationAccepted = { message: 'Solicitud recibida. Un administrador debe aprobar la cuenta antes de que puedas ingresar.' };

export const authRoutes = new Hono<HonoEnv>();

authRoutes.post('/login', async (c) => {
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

authRoutes.post('/bootstrap', async (c) => {
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

authRoutes.get('/registration-options', async (c) => {
    const clientIp = c.req.header('CF-Connecting-IP') || 'unknown';
    if (!await allowRequest(c.env.DB, `registration-options:${clientIp}`, 60, 60)) {
        c.header('Retry-After', '60');
        return c.json({ error: 'Límite de solicitudes excedido' }, 429);
    }
    const careers = await c.env.DB.prepare('SELECT id, name, code FROM careers ORDER BY name LIMIT 200').all();
    return c.json(careers.results);
});

authRoutes.post('/register', async (c) => {
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

    const passwordHash = await hashPassword(body.password);
    const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return c.json(registrationAccepted, 202);
    try {
        await c.env.DB.prepare(`INSERT INTO users
            (id, email, name, password_hash, role, career_id, is_active, account_status)
            VALUES (?, ?, ?, ?, 'viewer', ?, 0, 'pending')`)
            .bind(`usr-${crypto.randomUUID()}`, email, name, passwordHash, body.career_id).run();
    } catch (error) {
        console.warn('Registration insert did not create a new request', error instanceof Error ? error.message : String(error));
    }
    c.header('Cache-Control', 'no-store');
    return c.json(registrationAccepted, 202);
});

authRoutes.get('/me', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const profile = await c.env.DB.prepare(
        'SELECT id, email, name, role, career_id, is_active, account_status, created_at FROM users WHERE id = ?'
    ).bind(user.id).first();
    return c.json(profile);
});
