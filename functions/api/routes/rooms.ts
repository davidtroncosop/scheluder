import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware, canAccessCareer, canMutate } from '../middleware/auth';

export const roomRoutes = new Hono<HonoEnv>();

roomRoutes.get('/rooms', authMiddleware, async (c) => {
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

roomRoutes.post('/rooms', authMiddleware, async (c) => {
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

roomRoutes.put('/rooms/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
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

roomRoutes.delete('/rooms/:id', authMiddleware, async (c) => {
    const user = c.get('user') as UserPayload;
    const id = c.req.param('id') as string;
    const room = await c.env.DB.prepare('SELECT career_id, is_shared FROM rooms WHERE id = ?').bind(id).first<{ career_id: string | null; is_shared: number }>();
    if (!room) return c.json({ error: 'Sala no encontrada' }, 404);
    if (!canMutate(user) || (room.is_shared ? user.role !== 'admin' : !canAccessCareer(user, room.career_id))) return c.json({ error: 'No autorizado' }, 403);
    await c.env.DB.prepare("UPDATE rooms SET is_active = 0, updated_at = datetime('now') WHERE id = ?").bind(id).run();
    return c.json({ success: true });
});
