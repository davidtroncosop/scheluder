export interface SchedulerSection {
  id: string;
  subject_id: string;
  nrc: string;
  section_code?: string | null;
  subject_name: string;
  subject_code: string;
  level: number;
  type: string;
  parent_section_id: string | null;
  parent_nrc: string | null;
  parent_subject_name?: string | null;
  hours_per_week: number;
  teacher_id?: string | null;
  teacher_name: string | null;
  room_id?: string | null;
  room_name?: string | null;
  preferred_room_id?: string | null;
  expected_students?: number;
  priority: number;
  assigned_slots: number;
}

export interface SchedulerAssignment {
  id: string;
  section_id: string;
  nrc: string;
  section_code?: string | null;
  subject_name: string;
  subject_code: string;
  level: number;
  section_type?: string;
  teacher_id?: string | null;
  teacher_name: string | null;
  room_id?: string | null;
  room_name: string | null;
  room_type?: string | null;
  timeslot_id: string;
  timeslot_label: string;
  start_time?: string;
  end_time?: string;
  day_of_week: number;
  parallel_index: number;
  period_id?: string;
}

export interface SchedulerConflict {
  id: string;
  assignment_id?: string;
  type: string;
  rule_code: string;
  description: string;
  subject_name?: string;
  nrc?: string;
  teacher_name?: string | null;
  timeslot_label?: string;
  day_of_week: number;
  parallel_index?: number;
  is_resolved?: boolean | number;
}

export interface SchedulerTimeslot {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
  order_index: number;
}

export interface SchedulerHealth {
  total_slots_required: number;
  slots_assigned: number;
  assignment_percentage: number;
  critical_conflicts: number;
  warning_conflicts: number;
  health_score: number;
}

export const mapBackendAssignments = (backendAssignments: Array<Record<string, any>>): SchedulerAssignment[] => {
  const sorted = [...backendAssignments].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const slotCounts: Record<string, number> = {};

  return sorted.map(assignment => {
    const key = `${assignment.day_of_week}-${assignment.timeslot_id}`;
    const computedParallelIndex = assignment.parallel_index !== undefined && assignment.parallel_index !== null
      ? Number(assignment.parallel_index)
      : (slotCounts[key] || 0);
    slotCounts[key] = (slotCounts[key] || 0) + 1;
    return {
      id: assignment.id,
      section_id: assignment.section_id,
      nrc: assignment.nrc,
      section_code: assignment.section_code || null,
      subject_name: assignment.subject_name,
      subject_code: assignment.subject_code,
      level: assignment.level,
      section_type: assignment.section_type || assignment.type || 'TEO',
      teacher_id: assignment.teacher_id || null,
      teacher_name: assignment.teacher_name,
      room_id: assignment.room_id || null,
      room_name: assignment.room_name,
      room_type: assignment.room_type || 'TEO',
      timeslot_id: assignment.timeslot_id,
      timeslot_label: assignment.timeslot_label,
      start_time: assignment.start_time,
      end_time: assignment.end_time,
      day_of_week: assignment.day_of_week,
      parallel_index: computedParallelIndex,
      period_id: assignment.period_id,
    };
  });
};

export const calculateHealth = (
  sections: SchedulerSection[],
  assignments: SchedulerAssignment[],
  conflicts: SchedulerConflict[],
): SchedulerHealth => {
  const totalRequired = sections.reduce((total, section) => total + (section.hours_per_week || 0), 0);
  const critical = conflicts.filter(conflict => conflict.type === 'CRITICAL').length;
  const warnings = conflicts.filter(conflict => conflict.type === 'WARNING').length;
  const percentage = totalRequired > 0 ? Math.round((assignments.length / totalRequired) * 100) : 0;
  return {
    total_slots_required: totalRequired,
    slots_assigned: assignments.length,
    assignment_percentage: percentage,
    critical_conflicts: critical,
    warning_conflicts: warnings,
    health_score: Math.max(0, Math.min(100, percentage - critical * 15 - warnings * 5)),
  };
};

export interface LevelVentanaSummary {
  total_ventanas: number;
  compactness_percentage: number;
  days_with_ventanas: number;
  total_level_days: number;
}

export type SectionVentanaSummary = LevelVentanaSummary;

export const calculateLevelVentanas = (
  assignments: SchedulerAssignment[],
  timeslotOrderMap?: Record<string, number>,
): LevelVentanaSummary => {
  if (!assignments || assignments.length === 0) {
    return {
      total_ventanas: 0,
      compactness_percentage: 100,
      days_with_ventanas: 0,
      total_level_days: 0,
    };
  }

  const defaultOrder = (id: string, label?: string): number => {
    if (timeslotOrderMap && timeslotOrderMap[id] !== undefined) {
      return timeslotOrderMap[id];
    }
    const match = (label || id).match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
  };

  // Group by Level Cohort: level + day_of_week
  const groups = new Map<string, number[]>();
  assignments.forEach(a => {
    const key = `${a.level || 1}-${a.day_of_week}`;
    const order = defaultOrder(a.timeslot_id, a.timeslot_label);
    const existing = groups.get(key) || [];
    // Only add unique order indices per day for the level
    if (!existing.includes(order)) {
      existing.push(order);
    }
    groups.set(key, existing);
  });

  let totalVentanas = 0;
  let daysWithVentanas = 0;
  let totalLevelDays = 0;

  groups.forEach(orders => {
    totalLevelDays++;
    if (orders.length > 1) {
      const sorted = [...orders].sort((a, b) => a - b);
      const span = sorted[sorted.length - 1] - sorted[0] + 1;
      const emptySlots = Math.max(0, span - sorted.length);
      if (emptySlots > 0) {
        totalVentanas += emptySlots;
        daysWithVentanas++;
      }
    }
  });

  const compactness = totalLevelDays > 0
    ? Math.max(0, Math.min(100, Math.round(((totalLevelDays - daysWithVentanas) / totalLevelDays) * 100)))
    : 100;

  return {
    total_ventanas: totalVentanas,
    compactness_percentage: compactness,
    days_with_ventanas: daysWithVentanas,
    total_level_days: totalLevelDays,
  };
};

export const calculateSectionVentanas = calculateLevelVentanas;


