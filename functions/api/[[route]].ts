import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Types
export interface Env {
    DB: D1Database;
    JWT_SECRET: string;
    ENVIRONMENT: string;
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

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'scheduler-salt-2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
    const passwordHash = await hashPassword(password);
    return passwordHash === hash;
}

app.post('/auth/login', async (c) => {
    const { email, password } = await c.req.json();
    const db = c.env.DB;

    if (!email) {
        return c.json({ error: 'Email requerido' }, 400);
    }

    try {
        // Try to find the user in the database
        let user = await db.prepare(
            `SELECT id, email, name, role, career_id FROM users WHERE email = ? AND is_active = 1`
        ).bind(email).first() as any;

        // If not found, register them on the fly with a fresh sandbox workspace
        if (!user) {
            const isAdmin = email.toLowerCase().includes('admin');
            const userId = `usr-${crypto.randomUUID().slice(0, 8)}`;
            const careerId = isAdmin ? null : `car-${crypto.randomUUID().slice(0, 8)}`;
            const role = isAdmin ? 'admin' : 'coordinator';

            if (!isAdmin && careerId) {
                const careerName = `Demo (${email})`;
                const careerCode = `DEMO-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

                // Create Career
                await db.prepare(
                    `INSERT INTO careers (id, name, code) VALUES (?, ?, ?)`
                ).bind(careerId, careerName, careerCode).run();

                // Seed Demo Teachers for this Career (Unique emails to avoid constraint failures)
                const teacherIds = {
                    reyes: `tch-reyes-${crypto.randomUUID().slice(0, 4)}`,
                    soto: `tch-soto-${crypto.randomUUID().slice(0, 4)}`,
                    rivas: `tch-rivas-${crypto.randomUUID().slice(0, 4)}`,
                    valenzuela: `tch-valenz-${crypto.randomUUID().slice(0, 4)}`
                };

                await db.prepare(
                    `INSERT INTO teachers (id, career_id, name, email, tipo_contrato, max_horas) VALUES 
                     (?, ?, 'Prof. Reyes', ?, 'Planta', 18),
                     (?, ?, 'Prof. Soto', ?, 'Planta', 20),
                     (?, ?, 'Dra. Rivas', ?, 'Media Jornada', 12),
                     (?, ?, 'Dr. Valenzuela', ?, 'Honorarios', 8)`
                ).bind(
                    teacherIds.reyes, careerId, `reyes-${careerId}@u.cl`,
                    teacherIds.soto, careerId, `soto-${careerId}@u.cl`,
                    teacherIds.rivas, careerId, `rivas-${careerId}@u.cl`,
                    teacherIds.valenzuela, careerId, `valenzuela-${careerId}@u.cl`
                ).run();

                // Seed Demo Subjects for this Career
                const subjectIds = {
                    morf: `sub-morf-${crypto.randomUUID().slice(0, 4)}`,
                    biom: `sub-biom-${crypto.randomUUID().slice(0, 4)}`,
                    fisio: `sub-fisio-${crypto.randomUUID().slice(0, 4)}`,
                    bioe: `sub-bioe-${crypto.randomUUID().slice(0, 4)}`,
                    salp: `sub-salp-${crypto.randomUUID().slice(0, 4)}`,
                    anat: `sub-anat-${crypto.randomUUID().slice(0, 4)}`
                };

                await db.prepare(
                    `INSERT INTO subjects (id, career_id, code, name, level, credits) VALUES 
                     (?, ?, 'DMOR0030', 'Morfología', 3, 6),
                     (?, ?, 'DBIO0031', 'Biomecánica I', 3, 4),
                     (?, ?, 'DFIS0032', 'Fisiología I', 3, 6),
                     (?, ?, 'DBIE0033', 'Bioética', 3, 2),
                     (?, ?, 'DSAL0034', 'Salud Pública', 3, 4),
                     (?, ?, 'DANA0020', 'Anatomía II', 2, 6)`
                ).bind(
                    subjectIds.morf, careerId,
                    subjectIds.biom, careerId,
                    subjectIds.fisio, careerId,
                    subjectIds.bioe, careerId,
                    subjectIds.salp, careerId,
                    subjectIds.anat, careerId
                ).run();

                // Seed Demo Sections for this Career (Unique NRCs to avoid constraint failures)
                const nrcs = {
                    morf: String(Math.floor(10000 + Math.random() * 90000)),
                    biom: String(Math.floor(10000 + Math.random() * 90000)),
                    fisio: String(Math.floor(10000 + Math.random() * 90000)),
                    bioe: String(Math.floor(10000 + Math.random() * 90000)),
                    salp: String(Math.floor(10000 + Math.random() * 90000)),
                    anat: String(Math.floor(10000 + Math.random() * 90000)),
                };

                await db.prepare(
                    `INSERT INTO sections (id, subject_id, nrc, section_code, type, expected_students, hours_per_week, teacher_id, priority) VALUES 
                     (?, ?, ?, 'SEC-1', 'LAB', 25, 4, ?, 2),
                     (?, ?, ?, 'SEC-1', 'TEO', 40, 2, ?, 1),
                     (?, ?, ?, 'SEC-1', 'TEO', 35, 4, ?, 0),
                     (?, ?, ?, 'SEC-1', 'TEO', 30, 2, ?, 0),
                     (?, ?, ?, 'SEC-1', 'TEO', 30, 4, ?, 0),
                     (?, ?, ?, 'SEC-1', 'TEO', 45, 4, ?, 0)`
                ).bind(
                    `sec-morf-${crypto.randomUUID().slice(0, 4)}`, subjectIds.morf, nrcs.morf, teacherIds.reyes,
                    `sec-biom-${crypto.randomUUID().slice(0, 4)}`, subjectIds.biom, nrcs.biom, teacherIds.soto,
                    `sec-fisio-${crypto.randomUUID().slice(0, 4)}`, subjectIds.fisio, nrcs.fisio, teacherIds.soto,
                    `sec-bioe-${crypto.randomUUID().slice(0, 4)}`, subjectIds.bioe, nrcs.bioe, teacherIds.reyes,
                    `sec-salp-${crypto.randomUUID().slice(0, 4)}`, subjectIds.salp, nrcs.salp, teacherIds.valenzuela,
                    `sec-anat-${crypto.randomUUID().slice(0, 4)}`, subjectIds.anat, nrcs.anat, teacherIds.rivas
                ).run();
            }

            // Create User in DB
            await db.prepare(
                `INSERT INTO users (id, email, name, role, career_id, is_active) VALUES (?, ?, ?, ?, ?, 1)`
            ).bind(userId, email, email.split('@')[0], role, careerId).run();

            // Set user payload for JWT generation
            user = {
                id: userId,
                email: email,
                name: email.split('@')[0],
                role: role,
                career_id: careerId
            };
        }

        const token = await generateJWT({
            id: user.id as string,
            email: user.email as string,
            role: user.role as 'admin' | 'coordinator' | 'viewer',
            career_id: user.career_id as string | null,
        }, c.env.JWT_SECRET);

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
        const payload = await verifyJWT(token, c.env.JWT_SECRET);
        c.set('user', payload);
        await next();
    } catch (error) {
        return c.json({ error: 'Token inválido' }, 401);
    }
};

// =============================================
// CAREERS (RLS Base)
// =============================================

app.get('/careers', async (c) => {
    const db = c.env.DB;
    const careers = await db.prepare('SELECT * FROM careers ORDER BY name').all();
    return c.json(careers.results);
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

app.get('/teachers/:id', authMiddleware, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');

    const teacher = await db.prepare(
        'SELECT * FROM teachers WHERE id = ?'
    ).bind(id).first();

    if (!teacher) {
        return c.json({ error: 'Docente no encontrado' }, 404);
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
    const { availability } = await c.req.json();

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

app.get('/sections', authMiddleware, async (c) => {
    const db = c.env.DB;
    const user = c.get('user') as UserPayload;
    const assigned = c.req.query('assigned');

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
        JOIN periods p ON p.id = sa.period_id
        WHERE sa.section_id = s.id AND p.is_active = 1
      ) as assigned_slots
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    `;
    const params: any[] = [];

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
    JOIN periods p ON p.id = sa.period_id AND p.is_active = 1
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

    try {
        await db.prepare('DELETE FROM conflicts WHERE assignment_id = ?').bind(id).run();
        await db.prepare('DELETE FROM schedule_assignments WHERE id = ?').bind(id).run();
        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: 'Error al eliminar' }, 500);
    }
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

    // Get all timeslots and rooms
    const timeslots = await db.prepare('SELECT * FROM timeslots ORDER BY order_index').all();
    const rooms = await db.prepare(`
    SELECT * FROM rooms 
    WHERE is_active = 1 AND (is_shared = 1 OR career_id = ?)
  `).bind(section.career_id).all();

    // Calculate scores for each slot
    const scores: any[] = [];

    for (const ts of timeslots.results as any[]) {
        for (let day = 1; day <= 5; day++) {
            for (const room of rooms.results as any[]) {
                const score = await calculateSlotScore(db, {
                    section,
                    room,
                    timeslot: ts,
                    day_of_week: day,
                    period_id,
                });

                if (score.total > 0) {
                    scores.push({
                        timeslot_id: ts.id,
                        timeslot_label: ts.label,
                        day_of_week: day,
                        room_id: room.id,
                        room_name: room.name,
                        score: score.total,
                        breakdown: score.breakdown,
                        blocked: score.blocked,
                    });
                }
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

    let resolution_action: string | null = null;

    if (auto_resolve) {
        if (conflict.rule_code === 'ROOM_OCCUPIED') {
            resolution_action = 'Mover a otra sala disponible';
        } else if (conflict.rule_code === 'TEACHER_DUPLICATE') {
            resolution_action = 'Cambiar docente o horario';
        } else if (conflict.rule_code === 'TEACHER_BLOCKED') {
            resolution_action = 'Seleccionar otro horario disponible';
        } else if (conflict.rule_code === 'LEVEL_CLASH') {
            resolution_action = 'Ajustar horario para evitar choque de niveles';
        } else if (conflict.rule_code === 'ROOM_TYPE_MISMATCH') {
            resolution_action = 'Asignar sala del tipo correcto';
        } else if (conflict.rule_code === 'OVERCAPACITY') {
            resolution_action = 'Cambiar a sala con mayor capacidad';
        } else {
            resolution_action = 'Revisión manual requerida';
        }
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

// =============================================
// IMPORT ENDPOINTS (Bulk Insert)
// =============================================

// Import Teachers
app.post('/import/docentes', authMiddleware, async (c) => {
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

    let inserted = 0;
    const errors: string[] = [];

    for (const row of data) {
        try {
            const id = `tch-${crypto.randomUUID().slice(0, 8)}`;
            await db.prepare(`
                INSERT INTO teachers (id, career_id, rut, name, email, contract_type, max_hours_per_week, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                id,
                targetCareerId,
                row['RUT'] || row['rut'] || '',
                row['Nombre'] || row['nombre'] || '',
                row['Email'] || row['email'] || null,
                row['Tipo Contrato'] || row['tipo_contrato'] || 'Honorarios',
                parseInt(row['Max Horas'] || row['max_horas'] || '12'),
                (row['Estado'] || row['estado'] || 'Activo').toLowerCase() === 'activo' ? 1 : 0
            ).run();
            inserted++;
        } catch (err: any) {
            errors.push(`Error en fila ${inserted + 1}: ${err.message}`);
        }
    }

    return c.json({ success: true, inserted, errors });
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

    let inserted = 0;
    const errors: string[] = [];

    for (const row of data) {
        try {
            const id = `sub-${crypto.randomUUID().slice(0, 8)}`;
            const code = row['Codigo'] || row['codigo'] || '';
            const level = parseInt(row['Nivel'] || row['nivel'] || '1');

            await db.prepare(`
                INSERT INTO subjects (id, career_id, code, name, level, credits)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
                id,
                targetCareerId,
                code,
                row['Nombre'] || row['nombre'] || '',
                level,
                parseInt(row['Creditos'] || row['creditos'] || '4')
            ).run();
            inserted++;
        } catch (err: any) {
            errors.push(`Error en fila ${inserted + 1}: ${err.message}`);
        }
    }

    return c.json({ success: true, inserted, errors });
});

// Import Rooms
app.post('/import/salas', authMiddleware, async (c) => {
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

    let inserted = 0;
    const errors: string[] = [];

    for (const row of data) {
        try {
            const id = `room-${crypto.randomUUID().slice(0, 8)}`;
            const isShared = (row['Compartida'] || row['compartida'] || 'No').toLowerCase() === 'sí' ||
                (row['Compartida'] || row['compartida'] || 'No').toLowerCase() === 'si';

            await db.prepare(`
                INSERT INTO rooms (id, career_id, name, building, floor, type, capacity, is_shared, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            `).bind(
                id,
                isShared ? null : targetCareerId,
                row['Nombre'] || row['nombre'] || '',
                row['Edificio'] || row['edificio'] || null,
                parseInt(row['Piso'] || row['piso'] || '1'),
                row['Tipo'] || row['tipo'] || 'TEO',
                parseInt(row['Capacidad'] || row['capacidad'] || '30'),
                isShared ? 1 : 0
            ).run();
            inserted++;
        } catch (err: any) {
            errors.push(`Error en fila ${inserted + 1}: ${err.message}`);
        }
    }

    return c.json({ success: true, inserted, errors });
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

    let inserted = 0;
    const errors: string[] = [];

    // Group by NRC to create sections
    const nrcGroups: Record<string, any[]> = {};
    for (const row of data) {
        const nrc = row['NRC'] || row['nrc'] || '';
        if (!nrcGroups[nrc]) nrcGroups[nrc] = [];
        nrcGroups[nrc].push(row);
    }

    for (const [nrc, rows] of Object.entries(nrcGroups)) {
        const firstRow = rows[0];

        try {
            // Find or create subject
            const subjectCode = firstRow['Codigo'] || firstRow['codigo'] || '';
            let subject = await db.prepare('SELECT id FROM subjects WHERE code = ?').bind(subjectCode).first();

            if (!subject) {
                const subjectId = `sub-${crypto.randomUUID().slice(0, 8)}`;
                await db.prepare(`
                    INSERT INTO subjects (id, career_id, code, name, level, credits)
                    VALUES (?, ?, ?, ?, ?, 4)
                `).bind(
                    subjectId,
                    targetCareerId,
                    subjectCode,
                    firstRow['Asignatura'] || firstRow['asignatura'] || '',
                    parseInt(firstRow['Nivel'] || firstRow['nivel'] || '1')
                ).run();
                subject = { id: subjectId };
            }

            // Find teacher
            const teacherRut = firstRow['RUT Docente'] || firstRow['rut_docente'] || '';
            let teacher = await db.prepare('SELECT id FROM teachers WHERE rut = ?').bind(teacherRut).first();

            // Create section
            const sectionId = `sec-${crypto.randomUUID().slice(0, 8)}`;
            const sectionType = firstRow['Tipo'] || firstRow['tipo'] || 'TEO';
            const hoursPerWeek = parseInt(firstRow['Horas'] || firstRow['horas'] || '2');

            await db.prepare(`
                INSERT INTO sections (id, subject_id, teacher_id, nrc, type, hours_per_week, expected_students, priority)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `).bind(
                sectionId,
                subject.id,
                teacher?.id || null,
                nrc,
                sectionType,
                hoursPerWeek,
                parseInt(firstRow['Estudiantes'] || firstRow['estudiantes'] || '30')
            ).run();

            inserted++;
        } catch (err: any) {
            errors.push(`Error en NRC ${nrc}: ${err.message}`);
        }
    }

    return c.json({ success: true, inserted, errors, message: `${inserted} secciones creadas` });
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

