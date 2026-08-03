import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Types
export interface Env {
    DB: D1Database;
    JWT_SECRET?: string;
    ENVIRONMENT: string;
    DEMO_AUTH?: string;
    GEMINI_API_KEY?: string;
    API_KEY?: string;
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
    origin: (origin) => {
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:8788',
            'https://scheduler-pro.pages.dev',
        ];
        if (!origin || allowedOrigins.includes(origin)) {
            return origin || allowedOrigins[0];
        }
        return allowedOrigins[0];
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

// Health check
app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =============================================
// AUTH ROUTES
// =============================================

app.post('/auth/login', async (c) => {
    const { email } = await c.req.json<{ email?: string; password?: string }>();
    const db = c.env.DB;

    if (!email || typeof email !== 'string') {
        return c.json({ error: 'Email requerido' }, 400);
    }

    try {
        // Authentication is intentionally demo-only. Only seeded, active demo
        // accounts are accepted; any password works and no account is created.
        const user = await db.prepare(
            `SELECT id, email, name, role, career_id FROM users WHERE email = ? AND is_active = 1`
        ).bind(email.trim().toLowerCase()).first() as Record<string, unknown> | null;

        if (!user) {
            return c.json({ error: 'Cuenta demo no reconocida' }, 401);
        }

        const token = await generateJWT({
            id: user.id as string,
            email: user.email as string,
            role: user.role as 'admin' | 'coordinator' | 'viewer',
            career_id: user.career_id as string | null,
        }, getJwtSecret(c.env));

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

// JWT middleware for protected routes
const authMiddleware = async (c: any, next: any) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'No autorizado' }, 401);
    }

    try {
        const token = authHeader.split(' ')[1];
        const payload = await verifyJWT(token, getJwtSecret(c.env));
        c.set('user', payload);
        await next();
    } catch (error) {
        return c.json({ error: 'Token inválido' }, 401);
    }
};

const canAccessCareer = (user: UserPayload, careerId: string | null | undefined) =>
    user.role === 'admin' || Boolean(user.career_id && user.career_id === careerId);

const canMutate = (user: UserPayload) => user.role === 'admin' || user.role === 'coordinator';

// =============================================
// CAREERS (RLS Base)
// =============================================

app.get('/careers', async (c) => {
    const db = c.env.DB;
    const careers = await db.prepare('SELECT * FROM careers ORDER BY name').all();
    return c.json(careers.results);
});

app.get('/periods', authMiddleware, async (c) => {
    const periods = await c.env.DB.prepare(
        'SELECT id, code, name, start_date, end_date, is_active FROM periods ORDER BY start_date DESC'
    ).all();
    return c.json(periods.results);
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
    const id = String(body.id || `tch-${crypto.randomUUID().slice(0, 8)}`);
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
    const id = String(body.id || `room-${crypto.randomUUID().slice(0, 8)}`);
    const name = String(body.name || '').trim();
    if (!name) return c.json({ error: 'Nombre requerido' }, 400);
    const shared = user.role === 'admin' && body.is_shared === true;
    await c.env.DB.prepare(`INSERT INTO rooms (id, career_id, name, building, floor, type, capacity, is_shared, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
        .bind(id, shared ? null : targetCareerId, name, body.building || null, Number(body.floor || 1), body.type || 'TEO', Number(body.capacity || 30), shared ? 1 : 0).run();
    return c.json({ id }, 201);
});

app.put('/rooms/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const room = await c.env.DB.prepare('SELECT career_id, is_shared FROM rooms WHERE id = ?').bind(id).first<{ career_id: string | null; is_shared: number }>();
    if (!room) return c.json({ error: 'Sala no encontrada' }, 404);
    if (!canMutate(user) || (room.is_shared ? user.role !== 'admin' : !canAccessCareer(user, room.career_id))) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    await c.env.DB.prepare(`UPDATE rooms SET name = ?, building = ?, floor = ?, type = ?, capacity = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(body.name, body.building || null, Number(body.floor || 1), body.type || 'TEO', Number(body.capacity || 30), id).run();
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
    const id = String(body.id || `sub-${crypto.randomUUID().slice(0, 8)}`);
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

    let query = `
    SELECT 
      s.*,
      sub.name as subject_name,
      sub.code as subject_code,
      sub.level,
      sub.career_id,
      t.name as teacher_name,
      t.rut as teacher_rut,
      (
        SELECT COUNT(*) FROM schedule_assignments sa
        WHERE sa.section_id = s.id
          AND sa.period_id = COALESCE(?, (SELECT id FROM periods WHERE is_active = 1 LIMIT 1))
      ) as assigned_slots
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    `;
    const params: any[] = [periodId];

    if (user.role !== 'admin' && user.career_id) {
        query += ' WHERE sub.career_id = ?';
        params.push(user.career_id);
    }
    query += ' ORDER BY s.priority DESC, sub.level, sub.name';

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
    const subject = await c.env.DB.prepare('SELECT career_id FROM subjects WHERE id = ?').bind(body.subject_id).first<{ career_id: string }>();
    if (!subject) return c.json({ error: 'Asignatura no encontrada' }, 404);
    if (!canAccessCareer(user, subject.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const id = String(body.id || `sec-${crypto.randomUUID().slice(0, 8)}`);
    await c.env.DB.prepare(`INSERT INTO sections (id, subject_id, teacher_id, nrc, type, hours_per_week, expected_students, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, body.subject_id, body.teacher_id || null, body.nrc, body.type || 'TEO', Number(body.hours_per_week || 2), Number(body.expected_students || 30), Number(body.priority || 0)).run();
    return c.json({ id }, 201);
});

app.put('/sections/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const current = await c.env.DB.prepare(`SELECT sub.career_id FROM sections s JOIN subjects sub ON sub.id = s.subject_id WHERE s.id = ?`).bind(id).first<{ career_id: string }>();
    if (!current) return c.json({ error: 'Sección no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, current.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    await c.env.DB.prepare(`UPDATE sections SET subject_id = ?, teacher_id = ?, nrc = ?, type = ?, hours_per_week = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(body.subject_id, body.teacher_id || null, body.nrc, body.type || 'TEO', Number(body.hours_per_week || 2), id).run();
    return c.json({ success: true });
});

app.delete('/sections/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const current = await c.env.DB.prepare(`SELECT sub.career_id FROM sections s JOIN subjects sub ON sub.id = s.subject_id WHERE s.id = ?`).bind(id).first<{ career_id: string }>();
    if (!current) return c.json({ error: 'Sección no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, current.career_id)) return c.json({ error: 'No autorizado' }, 403);
    await c.env.DB.prepare('DELETE FROM sections WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// =============================================
// TIMESLOTS
// =============================================

app.get('/timeslots', async (c) => {
    const db = c.env.DB;
    const timeslots = await db.prepare('SELECT * FROM timeslots ORDER BY order_index').all();
    return c.json(timeslots.results);
});

// =============================================
// SCHEDULE ASSIGNMENTS
// =============================================

app.get('/schedule', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const periodId = c.req.query('period_id');

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
    JOIN sections sec ON sec.id = sa.section_id
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

app.post('/schedule/publish', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    if (!canMutate(user)) return c.json({ error: 'No autorizado' }, 403);
    const { period_id } = await c.req.json<{ period_id?: string }>();
    if (!period_id) return c.json({ error: 'period_id requerido' }, 400);

    let conflictQuery = `SELECT COUNT(*) AS total FROM conflicts c
        JOIN schedule_assignments sa ON sa.id = c.assignment_id
        WHERE sa.period_id = ? AND c.type = 'CRITICAL' AND c.is_resolved = 0`;
    const params: unknown[] = [period_id];
    if (user.role !== 'admin' && user.career_id) {
        conflictQuery += ' AND sa.career_id = ?';
        params.push(user.career_id);
    }
    const conflicts = await c.env.DB.prepare(conflictQuery).bind(...params).first<{ total: number }>();
    if ((conflicts?.total || 0) > 0) return c.json({ error: 'Hay conflictos críticos pendientes' }, 409);

    let update = 'UPDATE schedule_assignments SET is_published = 1, updated_at = datetime(\'now\') WHERE period_id = ?';
    if (user.role !== 'admin' && user.career_id) update += ' AND career_id = ?';
    await c.env.DB.prepare(update).bind(...params).run();
    await recordAudit(c.env.DB, user, 'PUBLISH', 'period', period_id, null, { is_published: true });
    return c.json({ success: true, status: 'published' });
});

app.post('/schedule/assign', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const { section_id, room_id, timeslot_id, day_of_week, period_id } = await c.req.json();

    try {
        // Resolve target career from the subject associated with the section
        const section = await db.prepare(`
            SELECT s.id, sub.career_id 
            FROM sections s
            JOIN subjects sub ON sub.id = s.subject_id
            WHERE s.id = ?
        `).bind(section_id).first() as any;

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
        return c.json({ error: 'Error al asignar' }, 500);
    }
});

app.delete('/schedule/:id', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
    const user = c.get('user') as UserPayload;

    try {
        const assignment = await db.prepare('SELECT career_id FROM schedule_assignments WHERE id = ?').bind(id).first<{ career_id: string }>();
        if (!assignment) return c.json({ error: 'Asignación no encontrada' }, 404);
        if (!canMutate(user) || !canAccessCareer(user, assignment.career_id)) return c.json({ error: 'No autorizado' }, 403);
        await db.prepare('DELETE FROM conflicts WHERE assignment_id = ?').bind(id).run();
        await db.prepare('DELETE FROM schedule_assignments WHERE id = ?').bind(id).run();
        await recordAudit(db, user, 'DELETE', 'assignment', id, assignment, null);
        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: 'Error al eliminar' }, 500);
    }
});

app.put('/schedule/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id');
    const assignment = await c.env.DB.prepare('SELECT career_id, section_id FROM schedule_assignments WHERE id = ?').bind(id).first<{ career_id: string; section_id: string }>();
    if (!assignment) return c.json({ error: 'Asignación no encontrada' }, 404);
    if (!canMutate(user) || !canAccessCareer(user, assignment.career_id)) return c.json({ error: 'No autorizado' }, 403);
    const body = await c.req.json<Record<string, unknown>>();
    if (body.room_id) await c.env.DB.prepare("UPDATE schedule_assignments SET room_id = ?, is_published = 0, updated_at = datetime('now') WHERE id = ?").bind(body.room_id, id).run();
    if ('teacher_id' in body) await c.env.DB.prepare("UPDATE sections SET teacher_id = ?, updated_at = datetime('now') WHERE id = ?").bind(body.teacher_id || null, assignment.section_id).run();
    await recordAudit(c.env.DB, user, 'UPDATE', 'assignment', id, assignment, body);
    return c.json({ success: true });
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
    SELECT s.*, sub.level, sub.career_id, t.id as teacher_id
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    WHERE s.id = ?
  `).bind(section_id).first() as any;

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
        sec.teacher_id, sub.level, sub.career_id
        FROM schedule_assignments sa
        JOIN sections sec ON sec.id = sa.section_id
        JOIN subjects sub ON sub.id = sec.subject_id
        WHERE sa.period_id = ?`).bind(period_id).all();
    const availability = section.teacher_id
        ? await db.prepare(`SELECT timeslot_id, day_of_week, status FROM teacher_availability WHERE teacher_id = ?`).bind(section.teacher_id).all()
        : { results: [] } as any;
    const rows = assignments.results as any[];
    const roomBusy = new Set(rows.map(row => `${row.room_id}:${row.timeslot_id}:${row.day_of_week}`));
    const teacherBusy = new Set(rows.filter(row => row.teacher_id === section.teacher_id).map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const levelBusy = new Set(rows.filter(row => row.level === section.level && row.career_id === section.career_id).map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const blocked = new Set((availability.results as any[]).filter(row => row.status === 'blocked').map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const preferred = new Set((availability.results as any[]).filter(row => row.status === 'preference').map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const orderById = new Map((timeslots.results as any[]).map(row => [row.id, row.order_index]));
    const scores: any[] = [];

    for (const ts of timeslots.results as any[]) {
        for (let day = 1; day <= 5; day++) {
            const slotKey = `${ts.id}:${day}`;
            for (const room of rooms.results as any[]) {
                if (roomBusy.has(`${room.id}:${slotKey}`) || teacherBusy.has(slotKey) || blocked.has(slotKey)) continue;
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
    JOIN sections sec ON sec.id = sa.section_id
    JOIN subjects sub ON sub.id = sec.subject_id
    LEFT JOIN teachers t ON t.id = sec.teacher_id
    JOIN timeslots ts ON ts.id = sa.timeslot_id
    WHERE 1=1
    `;
    const params: any[] = [];

    if (user.role !== 'admin' && user.career_id) {
        query += ' AND sa.career_id = ?';
        params.push(user.career_id);
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
    const { auto_resolve } = await c.req.json();

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
        await db.prepare(`UPDATE schedule_assignments SET room_id = ?, timeslot_id = ?, day_of_week = ?, updated_at = datetime('now') WHERE id = ?`)
            .bind(alternative.room_id, alternative.timeslot_id, alternative.day_of_week, conflict.assignment_id).run();
        resolution_action = `Movido a ${alternative.room_name}, ${alternative.timeslot_label}, día ${alternative.day_of_week}`;
        await recordAudit(db, user, 'RESOLVE', 'assignment', conflict.assignment_id, before, { ...alternative, period_id: conflict.period_id });
    }

    await db.prepare(`
    UPDATE conflicts 
    SET is_resolved = 1, resolved_by = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).bind(user.id, id).run();

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

    let totalQuery = `SELECT SUM(s.hours_per_week) as total FROM sections s JOIN subjects sub ON sub.id = s.subject_id`;
    let assignedQuery = `SELECT COUNT(*) as total FROM schedule_assignments sa JOIN periods p ON p.id = sa.period_id AND p.is_active = 1`;
    let conflictQuery = `SELECT SUM(CASE WHEN c.type = 'CRITICAL' THEN 1 ELSE 0 END) as critical, SUM(CASE WHEN c.type = 'WARNING' THEN 1 ELSE 0 END) as warnings FROM conflicts c JOIN schedule_assignments sa ON sa.id = c.assignment_id WHERE c.is_resolved = 0`;
    const params: any[] = [];
    const paramsAssigned: any[] = [];
    const paramsConflict: any[] = [];

    if (user.career_id) {
        totalQuery += ' WHERE sub.career_id = ?';
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
        const sharedText = (row.Compartida || row.compartida || 'No').toLowerCase();
        const isShared = user.role === 'admin' && (sharedText === 'sí' || sharedText === 'si');
        return db.prepare(`INSERT INTO rooms (id, career_id, name, building, floor, type, capacity, is_shared, is_active)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1 WHERE NOT EXISTS (
                SELECT 1 FROM rooms WHERE is_active = 1 AND name = ? AND COALESCE(building, '') = COALESCE(?, '') AND COALESCE(career_id, '') = COALESCE(?, '')
            )`).bind(`room-${crypto.randomUUID().slice(0, 8)}`, isShared ? null : targetCareerId, row.Nombre || row.nombre || '',
                row.Edificio || row.edificio || null, parseInt(row.Piso || row.piso || '1'), row.Tipo || row.tipo || 'TEO',
                parseInt(row.Capacidad || row.capacidad || '30'), isShared ? 1 : 0, row.Nombre || row.nombre || '',
                row.Edificio || row.edificio || null, isShared ? null : targetCareerId);
    });
    if (import_mode === 'replace') statements.unshift(db.prepare('UPDATE rooms SET is_active = 0 WHERE career_id = ?').bind(targetCareerId));
    try {
        await db.batch(statements);
        return c.json({ success: true, inserted: data.length, errors: [] });
    } catch (error) {
        return c.json({ error: 'La importación fue revertida', details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

// Import Schedules (Sections)
app.post('/import/horarios', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const { data, career_id, period_id } = await c.req.json();

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

    // Group by NRC to create sections
    const nrcGroups: Record<string, any[]> = {};
    for (const row of data) {
        const nrc = row['NRC'] || row['nrc'] || '';
        if (!nrcGroups[nrc]) nrcGroups[nrc] = [];
        nrcGroups[nrc].push(row);
    }

    const [subjectRows, teacherRows, existingNrcRows] = await Promise.all([
        db.prepare('SELECT id, code FROM subjects WHERE career_id = ?').bind(targetCareerId).all(),
        db.prepare('SELECT id, rut FROM teachers WHERE career_id = ?').bind(targetCareerId).all(),
        db.prepare(`SELECT s.nrc, sub.career_id FROM sections s JOIN subjects sub ON sub.id = s.subject_id WHERE s.nrc IN (${Object.keys(nrcGroups).map(() => '?').join(',') || "''"})`)
            .bind(...Object.keys(nrcGroups)).all(),
    ]);
    const foreignNrc = (existingNrcRows.results as any[]).find(row => row.career_id !== targetCareerId);
    if (foreignNrc) return c.json({ error: `El NRC ${foreignNrc.nrc} ya pertenece a otra carrera` }, 409);

    const subjectIds = new Map((subjectRows.results as any[]).map(row => [row.code, row.id]));
    const teacherIds = new Map((teacherRows.results as any[]).map(row => [row.rut, row.id]));
    const statements: D1PreparedStatement[] = [];
    for (const [nrc, rows] of Object.entries(nrcGroups)) {
        const firstRow = rows[0];
        const subjectCode = firstRow.Codigo || firstRow.codigo || '';
        let subjectId = subjectIds.get(subjectCode);
        if (!subjectId) {
            subjectId = `sub-${crypto.randomUUID().slice(0, 8)}`;
            subjectIds.set(subjectCode, subjectId);
            statements.push(db.prepare('INSERT INTO subjects (id, career_id, code, name, level, credits) VALUES (?, ?, ?, ?, ?, 4)')
                .bind(subjectId, targetCareerId, subjectCode, firstRow.Asignatura || firstRow.asignatura || '', parseInt(firstRow.Nivel || firstRow.nivel || '1')));
        }
        const teacherId = teacherIds.get(firstRow['RUT Docente'] || firstRow.rut_docente || '') || null;
        statements.push(db.prepare(`INSERT INTO sections (id, subject_id, teacher_id, nrc, type, hours_per_week, expected_students, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(nrc) DO UPDATE SET subject_id = excluded.subject_id, teacher_id = excluded.teacher_id,
            type = excluded.type, hours_per_week = excluded.hours_per_week, expected_students = excluded.expected_students,
            updated_at = datetime('now')`)
            .bind(`sec-${crypto.randomUUID().slice(0, 8)}`, subjectId, teacherId, nrc, firstRow.Tipo || firstRow.tipo || 'TEO',
                parseInt(firstRow.Horas || firstRow.horas || '2'), parseInt(firstRow.Estudiantes || firstRow.estudiantes || '30')));
    }
    try {
        await db.batch(statements);
        return c.json({ success: true, inserted: Object.keys(nrcGroups).length, errors: [], message: `${Object.keys(nrcGroups).length} secciones procesadas` });
    } catch (error) {
        return c.json({ error: 'La importación fue revertida', details: error instanceof Error ? error.message : String(error) }, 400);
    }
});

app.post('/import/analyze-mapping', authMiddleware, async (c) => {
    const { headers } = await c.req.json();
    const apiKey = c.env.GEMINI_API_KEY || c.env.API_KEY;
    if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
        // Return a mocked/fallback mapping if key is not properly set up
        const systemFields = ['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario'];
        const fallback = systemFields.map(field => ({
            systemField: field,
            csvHeader: headers.find((h: string) => h.toLowerCase().includes(field.toLowerCase())) || '',
            status: 'warning',
            message: 'Mapeo manual requerido'
        }));
        return c.json(fallback);
    }

    const systemFields = ['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario'];
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
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
                            required: ["systemField", "csvHeader", "status"]
                        }
                    }
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API error: ${errText}`);
        }

        const resData = await response.json() as any;
        const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return c.json([]);
        return c.json(JSON.parse(text));
    } catch (error: any) {
        console.error("Gemini mapping analysis failed:", error);
        const fallback = systemFields.map(field => ({
            systemField: field,
            csvHeader: headers.find((h: string) => h.toLowerCase().includes(field.toLowerCase())) || '',
            status: 'warning',
            message: 'Mapeo manual requerido'
        }));
        return c.json(fallback);
    }
});

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
    await db.prepare(`INSERT INTO audit_log (id, user_id, career_id, action, entity_type, entity_id, old_value, new_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), user.id, user.career_id, action, entityType, entityId,
            oldValue == null ? null : JSON.stringify(oldValue), newValue == null ? null : JSON.stringify(newValue)).run();
}

async function findBestAlternative(db: D1Database, assignment: any) {
    const section = await db.prepare(`SELECT s.*, sub.career_id FROM sections s JOIN subjects sub ON sub.id = s.subject_id WHERE s.id = ?`)
        .bind(assignment.section_id).first() as any;
    if (!section) return null;

    const [roomsResult, timeslotsResult, occupancyResult, blockedResult] = await Promise.all([
        db.prepare('SELECT id, name, type, capacity FROM rooms WHERE is_active = 1 AND (is_shared = 1 OR career_id = ?)').bind(section.career_id).all(),
        db.prepare('SELECT id, label, order_index FROM timeslots ORDER BY order_index').all(),
        db.prepare(`SELECT sa.room_id, sa.timeslot_id, sa.day_of_week, sec.teacher_id
            FROM schedule_assignments sa JOIN sections sec ON sec.id = sa.section_id
            WHERE sa.period_id = ? AND sa.id <> ?`).bind(assignment.period_id, assignment.assignment_id).all(),
        section.teacher_id
            ? db.prepare("SELECT timeslot_id, day_of_week FROM teacher_availability WHERE teacher_id = ? AND status = 'blocked'").bind(section.teacher_id).all()
            : Promise.resolve({ results: [] } as any),
    ]);

    const occupiedRooms = new Set((occupancyResult.results as any[]).map(row => `${row.room_id}:${row.timeslot_id}:${row.day_of_week}`));
    const occupiedTeacher = new Set((occupancyResult.results as any[])
        .filter(row => section.teacher_id && row.teacher_id === section.teacher_id)
        .map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const blocked = new Set((blockedResult.results as any[]).map(row => `${row.timeslot_id}:${row.day_of_week}`));
    const candidates: any[] = [];

    for (const timeslot of timeslotsResult.results as any[]) {
        for (let day = 1; day <= 5; day++) {
            if (occupiedTeacher.has(`${timeslot.id}:${day}`) || blocked.has(`${timeslot.id}:${day}`)) continue;
            for (const room of roomsResult.results as any[]) {
                if (occupiedRooms.has(`${room.id}:${timeslot.id}:${day}`)) continue;
                let score = 100;
                if (room.type === section.type) score += 30;
                else if (section.type !== 'TEO') score -= 30;
                if (room.capacity < section.expected_students) score -= 40;
                if (day === 5 && timeslot.order_index >= 6) score -= 15;
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
}) {
    const conflicts: { type: 'CRITICAL' | 'WARNING'; rule_code: string; description: string }[] = [];

    // Get section details (including real career_id)
    const section = await db.prepare(`
    SELECT s.*, sub.level, sub.career_id, t.id as teacher_id, t.name as teacher_name
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    WHERE s.id = ?
  `).bind(params.section_id).first() as any;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(params.room_id).first() as any;

    // CRITICAL: Room already occupied
    const roomConflict = await db.prepare(`
    SELECT sa.id FROM schedule_assignments sa
    JOIN periods p ON p.id = sa.period_id AND p.is_active = 1
    WHERE sa.room_id = ? AND sa.timeslot_id = ? AND sa.day_of_week = ? AND sa.period_id = ?
  `).bind(params.room_id, params.timeslot_id, params.day_of_week, params.period_id).first();

    if (roomConflict) {
        conflicts.push({
            type: 'CRITICAL',
            rule_code: 'ROOM_OCCUPIED',
            description: `La sala ${room.name} ya está ocupada en ese horario`,
        });
    }

    // CRITICAL: Teacher already assigned
    if (section.teacher_id) {
        const teacherConflict = await db.prepare(`
      SELECT sa.id FROM schedule_assignments sa
      JOIN sections sec ON sec.id = sa.section_id
      JOIN periods p ON p.id = sa.period_id AND p.is_active = 1
      WHERE sec.teacher_id = ? AND sa.timeslot_id = ? AND sa.day_of_week = ? AND sa.period_id = ?
    `).bind(section.teacher_id, params.timeslot_id, params.day_of_week, params.period_id).first();

        if (teacherConflict) {
            conflicts.push({
                type: 'CRITICAL',
                rule_code: 'TEACHER_DUPLICATE',
                description: `El docente ${section.teacher_name} ya está asignado en ese horario`,
            });
        }

        // CRITICAL: Teacher blocked
        const teacherBlocked = await db.prepare(`
      SELECT id FROM teacher_availability 
      WHERE teacher_id = ? AND timeslot_id = ? AND day_of_week = ? AND status = 'blocked'
    `).bind(section.teacher_id, params.timeslot_id, params.day_of_week).first();

        if (teacherBlocked) {
            conflicts.push({
                type: 'CRITICAL',
                rule_code: 'TEACHER_BLOCKED',
                description: `El docente ${section.teacher_name} tiene ese horario bloqueado`,
            });
        }
    }

    // WARNING: Level clash using section's actual career_id
    const levelClash = await db.prepare(`
    SELECT sa.id FROM schedule_assignments sa
    JOIN sections sec ON sec.id = sa.section_id
    JOIN subjects sub ON sub.id = sec.subject_id
    JOIN periods p ON p.id = sa.period_id AND p.is_active = 1
    WHERE sub.level = ? AND sub.career_id = ? AND sa.timeslot_id = ? AND sa.day_of_week = ? AND sa.period_id = ?
  `).bind(section.level, section.career_id, params.timeslot_id, params.day_of_week, params.period_id).first();

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
    JOIN sections sec ON sec.id = sa.section_id
    JOIN subjects sub ON sub.id = sec.subject_id
    JOIN timeslots ts ON ts.id = sa.timeslot_id
    WHERE sub.level = ? AND sub.career_id = ? AND sa.day_of_week = ?
    AND (ts.order_index = ? OR ts.order_index = ?)
  `).bind(
        params.section.level,
        params.section.career_id,
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
    // The checked-in fallback is acceptable only because this project explicitly
    // runs with demo authentication. Set JWT_SECRET before enabling real auth.
    return env.JWT_SECRET || 'scheduler-pro-demo-auth-only';
}

async function generateJWT(payload: UserPayload, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const claims = btoa(JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 }));

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(`${header}.${claims}`)
    );

    return `${header}.${claims}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

async function verifyJWT(token: string, secret: string): Promise<UserPayload> {
    const [header, claims, signature] = token.split('.');
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );

    const valid = await crypto.subtle.verify(
        'HMAC',
        key,
        Uint8Array.from(atob(signature), c => c.charCodeAt(0)),
        encoder.encode(`${header}.${claims}`)
    );

    if (!valid) throw new Error('Invalid signature');

    const payload = JSON.parse(atob(claims));
    if (payload.exp && payload.exp < Date.now()) throw new Error('Token expired');

    return payload;
}

// Cloudflare Pages Functions handler
export const onRequest = async (context: any) => {
    return app.fetch(context.request, context.env);
};
