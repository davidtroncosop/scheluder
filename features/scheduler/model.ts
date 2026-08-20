export interface SchedulerSection {
  id: string;
  subject_id: string;
  nrc: string;
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
    const parallelIndex = slotCounts[key] || 0;
    slotCounts[key] = parallelIndex + 1;
    return {
      id: assignment.id,
      section_id: assignment.section_id,
      nrc: assignment.nrc,
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
      parallel_index: parallelIndex,
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
