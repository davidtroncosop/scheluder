import { describe, expect, it } from 'vitest';
import { generateICalendar, generateScheduleCsv } from './export';
import type { SchedulerAssignment as Assignment } from './model';

const mockAssignments: Assignment[] = [
  {
    id: 'asg-1',
    section_id: 'sec-1',
    room_id: 'room-101',
    timeslot_id: 'ts-1',
    day_of_week: 1, // Lunes
    period_id: 'per-2026-1',
    parallel_index: 0,
    nrc: '1001',
    subject_code: 'KIN101',
    subject_name: 'Anatomía Funcional',
    level: 1,
    section_type: 'TEO',
    teacher_id: 'tch-1',
    teacher_name: 'Dr. Soto',
    room_name: 'SALA 201',
    room_type: 'TEO',
    timeslot_label: 'Bloque 1',
    start_time: '08:30',
    end_time: '10:00',
  },
  {
    id: 'asg-2',
    section_id: 'sec-2',
    room_id: 'room-lab',
    timeslot_id: 'ts-2',
    day_of_week: 3, // Miércoles
    period_id: 'per-2026-1',
    parallel_index: 0,
    nrc: '1002',
    subject_code: 'KIN102',
    subject_name: 'Biomecánica LAB',
    level: 2,
    section_type: 'LAB',
    teacher_id: 'tch-2',
    teacher_name: 'Prof. Reyes',
    room_name: 'LAB 1',
    room_type: 'LAB',
    timeslot_label: 'Bloque 2',
    start_time: '10:15',
    end_time: '11:45',
  },
];

describe('scheduler export utilities', () => {
  it('generates valid RFC 5545 iCalendar content with recurring weekly events', () => {
    const ics = generateICalendar(mockAssignments, {
      calendarName: 'Kinesiología 2026-1',
      startDate: '2026-03-02',
      endDate: '2026-07-15',
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('X-WR-CALNAME:Kinesiología 2026-1');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:KIN101 - Anatomía Funcional (NRC 1001)');
    expect(ics).toContain('LOCATION:Sala SALA 201');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO;');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE;');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('generates well-formatted CSV with headers and quoted fields', () => {
    const csv = generateScheduleCsv(mockAssignments);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Día,Bloque,Inicio,Fin,NRC,Código,Asignatura,Nivel,Tipo,Docente,Sala');
    expect(lines[1]).toContain('Lunes');
    expect(lines[1]).toContain('KIN101');
    expect(lines[1]).toContain('Dr. Soto');
    expect(lines[2]).toContain('Miércoles');
    expect(lines[2]).toContain('LAB 1');
  });
});
