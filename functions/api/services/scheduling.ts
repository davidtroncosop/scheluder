import type { D1Database } from '@cloudflare/workers-types';
import type { SectionType, UserPayload } from '../types';
import {
    areDirectParentAndChild,
    shouldApplyLevelClash,
    type SectionRelationshipIdentity,
} from '../../../features/scheduler/relationships';

export function getCareerId(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = (value as Record<string, unknown>).career_id;
    return typeof candidate === 'string' && candidate ? candidate : null;
}

export async function recordAudit(
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

export async function saveScheduleStatus(
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

export const ensureAutomaticPeriod = async (db: D1Database, configuredTimezone?: string): Promise<string> => {
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

export function sectionRelationshipError(error: unknown): string {
    const message = String(error);
    if (message.includes('PRACTICE_REQUIRES_PARENT')) return 'Las secciones prácticas requieren una sección teórica padre';
    if (message.includes('THEORY_CANNOT_HAVE_PARENT')) return 'Una sección teórica no puede depender de otra sección';
    if (message.includes('SECTION_CANNOT_PARENT_ITSELF')) return 'Una sección no puede ser su propio padre';
    if (message.includes('PARENT_CHILD_SCHEDULE_OVERLAP')) return 'La teoría y su práctica ya están programadas en el mismo horario';
    if (message.includes('PARENT_UPDATE_INVALIDATES_CHILDREN')) return 'El cambio dejaría prácticas asociadas inválidas';
    if (message.includes('INVALID_PARENT_SECTION')) return 'La sección padre debe ser teórica y pertenecer a la misma asignatura, carrera y período';
    return 'No fue posible guardar la relación entre secciones';
}

export async function validateParentSelection(db: D1Database, params: {
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

export async function validateAssignment(db: D1Database, params: {
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

    const section = await db.prepare(`
    SELECT s.*, sub.level, s.career_id, t.id as teacher_id, t.name as teacher_name
    FROM sections s
    JOIN subjects sub ON sub.id = s.subject_id
    LEFT JOIN teachers t ON t.id = s.teacher_id
    WHERE s.id = ? AND s.period_id = ?
  `).bind(params.section_id, params.period_id).first() as any;

    const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(params.room_id).first() as any;

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

    const levelClash = simultaneous.find(row => (
        row.level === section.level &&
        row.career_id === section.career_id &&
        shouldApplyLevelClash(currentRelationship, { id: row.section_id, parent_section_id: row.parent_section_id })
    ));

    if (levelClash) {
        conflicts.push({
            type: 'CRITICAL',
            rule_code: 'LEVEL_CLASH',
            description: `Tope de horario: Alumnos de nivel ${section.level} ya tienen la clase ${levelClash.subject_name || 'NRC ' + levelClash.nrc} en ese horario`,
        });
    }

    const isTypeCompatible = (secType?: string, rmType?: string) => {
        const s = (secType || 'TEO').toUpperCase();
        const r = (rmType || 'TEO').toUpperCase();
        if (s === 'LAB') return r === 'LAB' || r === 'SIM';
        if (s === 'SIM') return r === 'SIM';
        if (s === 'TAL') return r === 'TAL';
        return r === 'TEO' || r === 'AUD';
    };

    if (!isTypeCompatible(section.type, room.type)) {
        conflicts.push({
            type: 'CRITICAL',
            rule_code: 'ROOM_TYPE_MISMATCH',
            description: `Incompatibilidad de sala: La sección requiere sala tipo ${section.type} y no puede dictarse en ${room.type}`,
        });
    }

    if (section.expected_students > room.capacity) {
        conflicts.push({
            type: 'CRITICAL',
            rule_code: 'OVERCAPACITY',
            description: `Aforo insuficiente: La sala tiene capacidad ${room.capacity} pero la sección espera ${section.expected_students} alumnos`,
        });
    }

    // Specific Room Compatibility constraint
    if (section.subject_id) {
        const roomReqs = await db.prepare(`
            SELECT room_id, requirement_level FROM subject_room_compatibilities WHERE subject_id = ?
        `).bind(section.subject_id).all();
        if (roomReqs.results.length > 0) {
            const matching = roomReqs.results.find((r: any) => r.room_id === params.room_id);
            const hasExclusive = roomReqs.results.some((r: any) => r.requirement_level === 'EXCLUSIVE');
            if (hasExclusive && !matching) {
                conflicts.push({
                    type: 'CRITICAL',
                    rule_code: 'ROOM_NOT_COMPATIBLE',
                    description: `Esta asignatura requiere una de sus salas exclusivas designadas`,
                });
            }
        }
    }

    // Teacher Qualification constraint
    if (teacherId && section.subject_id) {
        const qualified = await db.prepare(`
            SELECT subject_id FROM teacher_subjects WHERE teacher_id = ?
        `).bind(teacherId).all();
        if (qualified.results.length > 0 && !qualified.results.some((s: any) => s.subject_id === section.subject_id)) {
            conflicts.push({
                type: 'WARNING',
                rule_code: 'TEACHER_NOT_QUALIFIED',
                description: `El docente no está habilitado en la especialidad de esta asignatura`,
            });
        }
    }

    return conflicts;
}

export async function findBestAlternative(db: D1Database, assignment: any) {
    const section = await db.prepare('SELECT s.* FROM sections s WHERE s.id = ? AND s.period_id = ?')
        .bind(assignment.section_id, assignment.period_id).first() as any;
    if (!section) return null;

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
                const isTypeCompatible = (secType?: string, rmType?: string) => {
                    const s = (secType || 'TEO').toUpperCase();
                    const r = (rmType || 'TEO').toUpperCase();
                    if (s === 'LAB') return r === 'LAB' || r === 'SIM';
                    if (s === 'SIM') return r === 'SIM';
                    if (s === 'TAL') return r === 'TAL';
                    return r === 'TEO' || r === 'AUD';
                };

                const slotKey = `${timeslot.id}|${day}`;
                if (occupiedRooms.has(`${room.id}|${slotKey}`)) continue;
                if (teacherId && (occupiedTeachers.has(slotKey) || blockedTeacherSlots.has(slotKey))) continue;
                if (parentChildSlots.has(slotKey)) continue;
                if (occupiedLevels.has(slotKey)) continue;
                if (room.capacity < section.expected_students) continue;
                if (!isTypeCompatible(section.type, room.type)) continue;

                let score = 100;
                if (room.type === section.type) score += 30;
                if (day === 5 && timeslot.order_index >= 6) score -= 15;
                candidates.push({ room_id: room.id, room_name: room.name, timeslot_id: timeslot.id, timeslot_label: timeslot.label, day_of_week: day, score });
            }
        }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
}

export async function calculateSlotScore(db: D1Database, params: {
    section: any;
    room: any;
    timeslot: any;
    day_of_week: number;
    period_id: string;
}) {
    let total = 100;
    const breakdown: { rule: string; points: number }[] = [];

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

    if (params.section.type === params.room.type) {
        total += 30;
        breakdown.push({ rule: 'Tipo de sala coincide', points: 30 });
    }

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

    if (params.room.capacity > params.section.expected_students * 2) {
        total -= 10;
        breakdown.push({ rule: 'Sala demasiado grande', points: -10 });
    }

    if (params.day_of_week === 5 && params.timeslot.order_index >= 6) {
        total -= 15;
        breakdown.push({ rule: 'Viernes último módulo', points: -15 });
    }

    for (const conflict of conflicts.filter(c => c.type === 'WARNING')) {
        total -= 15;
        breakdown.push({ rule: conflict.description, points: -15 });
    }

    return { total: Math.max(0, Math.min(100, total)), breakdown, blocked: false };
}
