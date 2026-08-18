import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, HonoEnv, UserPayload } from './types';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { careerRoutes } from './routes/careers';
import { periodRoutes } from './routes/periods';
import { settingsRoutes } from './routes/settings';
import { teacherRoutes } from './routes/teachers';
import { roomRoutes } from './routes/rooms';
import { subjectRoutes } from './routes/subjects';
import { sectionRoutes } from './routes/sections';
import { timeslotRoutes } from './routes/timeslots';
import { scheduleRoutes } from './routes/schedule';
import { conflictRoutes } from './routes/conflicts';
import { metricRoutes } from './routes/metrics';
import { auditRoutes } from './routes/audit';
import { importRoutes } from './routes/import';

export type { Env, UserPayload, HonoEnv };

// Initialize Hono app with base path for /api
export const app = new Hono<HonoEnv>().basePath('/api');

// Global middleware
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

// Mount modular sub-routers
app.route('/', authRoutes);
app.route('/', adminRoutes);
app.route('/', careerRoutes);
app.route('/', periodRoutes);
app.route('/', settingsRoutes);
app.route('/', teacherRoutes);
app.route('/', roomRoutes);
app.route('/', subjectRoutes);
app.route('/', sectionRoutes);
app.route('/', timeslotRoutes);
app.route('/', scheduleRoutes);
app.route('/', conflictRoutes);
app.route('/', metricRoutes);
app.route('/', auditRoutes);
app.route('/', importRoutes);

// Error handlers
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
