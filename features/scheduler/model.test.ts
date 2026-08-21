import { describe, expect, it } from 'vitest';
import { calculateHealth, calculateSectionVentanas, mapBackendAssignments, type SchedulerSection } from './model';

describe('scheduler model', () => {
  it('assigns deterministic parallel columns per slot', () => {
    const rows = [
      { id: 'b', section_id: '2', nrc: '2', subject_name: 'B', subject_code: 'B', level: 1, timeslot_id: 'm1', timeslot_label: 'M1', day_of_week: 1 },
      { id: 'a', section_id: '1', nrc: '1', subject_name: 'A', subject_code: 'A', level: 1, timeslot_id: 'm1', timeslot_label: 'M1', day_of_week: 1 },
    ];
    expect(mapBackendAssignments(rows).map(row => row.parallel_index)).toEqual([0, 1]);
  });

  it('does not report 100% health when there are no required slots', () => {
    expect(calculateHealth([], [], []).health_score).toBe(0);
  });

  it('penalizes critical conflicts', () => {
    const section = { hours_per_week: 2 } as SchedulerSection;
    const assignments = mapBackendAssignments([{ id: 'a', section_id: '1', nrc: '1', subject_name: 'A', subject_code: 'A', level: 1, timeslot_id: 'm1', timeslot_label: 'M1', day_of_week: 1 }]);
    const conflicts = [{ id: 'c', type: 'CRITICAL', rule_code: 'X', description: '', subject_name: '', nrc: '', teacher_name: null, timeslot_label: 'M1', day_of_week: 1, parallel_index: 0 }];
    expect(calculateHealth([section], assignments, conflicts).health_score).toBe(35);
  });

  it('calculates zero ventanas for contiguous classes in the same academic level', () => {
    const assignments = mapBackendAssignments([
      { id: '1', section_id: '1', nrc: '101', subject_name: 'A', subject_code: 'A', level: 1, timeslot_id: 'm1', timeslot_label: 'M1', day_of_week: 1 },
      { id: '2', section_id: '2', nrc: '102', subject_name: 'B', subject_code: 'B', level: 1, timeslot_id: 'm2', timeslot_label: 'M2', day_of_week: 1 },
      { id: '3', section_id: '3', nrc: '103', subject_name: 'C', subject_code: 'C', level: 1, timeslot_id: 'm3', timeslot_label: 'M3', day_of_week: 1 },
    ]);
    const summary = calculateSectionVentanas(assignments, { m1: 1, m2: 2, m3: 3, m4: 4 });
    expect(summary.total_ventanas).toBe(0);
    expect(summary.compactness_percentage).toBe(100);
    expect(summary.days_with_ventanas).toBe(0);
  });

  it('detects and counts level ventanas when classes of the same level are non-contiguous', () => {
    const assignments = mapBackendAssignments([
      { id: '1', section_id: '1', nrc: '101', subject_name: 'A', subject_code: 'A', level: 1, timeslot_id: 'm1', timeslot_label: 'M1', day_of_week: 1 },
      // M2 is empty -> 1 ventana for Level 1
      { id: '2', section_id: '2', nrc: '102', subject_name: 'B', subject_code: 'B', level: 1, timeslot_id: 'm3', timeslot_label: 'M3', day_of_week: 1 },
    ]);
    const summary = calculateSectionVentanas(assignments, { m1: 1, m2: 2, m3: 3, m4: 4 });
    expect(summary.total_ventanas).toBe(1);
    expect(summary.days_with_ventanas).toBe(1);
    expect(summary.compactness_percentage).toBe(0);
  });
});

