import type { Context, Next } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env, HonoEnv, SectionType, UserPayload } from '../types';
import { verifyJwt } from '../../../features/auth/security';

export function getJwtSecret(env: Env): string {
    if (env.JWT_SECRET && env.JWT_SECRET.length >= 32 && env.JWT_SECRET !== 'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS') {
        return env.JWT_SECRET;
    }
    if (env.ENVIRONMENT !== 'production' && env.DEMO_AUTH === 'true') {
        return 'scheduler-pro-local-demo-secret-change-me';
    }
    throw new Error('JWT_SECRET no está configurado de forma segura');
}

export const canAccessCareer = (user: UserPayload, careerId: string | null | undefined): boolean =>
    user.role === 'admin' || Boolean(user.career_id && user.career_id === careerId);

export const canMutate = (user: UserPayload): boolean =>
    user.role === 'admin' || user.role === 'coordinator';

export const hashRateLimitKey = async (key: string): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const allowRequest = async (db: D1Database, key: string, limit: number, periodSeconds: number): Promise<boolean> => {
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

export const requireExpensiveRequestBudget = async (c: Context<HonoEnv>, user: UserPayload) => {
    if (!await allowRequest(c.env.DB, `expensive:${user.id}:${c.req.path}`, 20, 60)) {
        c.header('Retry-After', '60');
        return c.json({ error: 'Límite de operaciones costosas excedido' }, 429);
    }
    return null;
};

export const authMiddleware = async (c: Context<HonoEnv>, next: Next) => {
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

export function isIsoDate(value?: string): value is string {
    return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

export function isTime(value?: string): value is string {
    return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

export function normalizeSectionType(value: unknown): SectionType {
    const normalized = String(value || 'TEO').trim().toUpperCase();
    return ['TEO', 'LAB', 'TAL', 'SIM'].includes(normalized) ? normalized as SectionType : 'TEO';
}
