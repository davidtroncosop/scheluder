import { Hono } from 'hono';
import type { HonoEnv, UserPayload } from '../types';
import { authMiddleware } from '../middleware/auth';

export const metricRoutes = new Hono<HonoEnv>();

metricRoutes.get('/metrics/health', authMiddleware, async (c) => {
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
