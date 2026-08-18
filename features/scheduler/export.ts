import type { SchedulerAssignment as Assignment } from './model';

export interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  dayOfWeek: number; // 1 = Monday, 5 = Friday
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string from a list of scheduled assignments.
 * Assumes recurring weekly events during an academic period.
 */
export const generateICalendar = (
  assignments: Assignment[],
  options?: {
    calendarName?: string;
    startDate?: string; // "YYYY-MM-DD"
    endDate?: string;   // "YYYY-MM-DD"
  }
): string => {
  const calendarName = options?.calendarName || 'Horario Académico - Scheduler Pro';
  const startDateStr = options?.startDate || '2026-03-02'; // Default start of semester (Monday)
  const endDateStr = options?.endDate || '2026-07-15';

  const formatUtcTimestamp = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const pad = (n: number) => n.toString().padStart(2, '0');

  // Days mapping for RRULE (1 = MO, 2 = TU, 3 = WE, 4 = TH, 5 = FR)
  const dayRruleMap: Record<number, string> = {
    1: 'MO',
    2: 'TU',
    3: 'WE',
    4: 'TH',
    5: 'FR',
  };

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Scheduler Pro//Academic Calendar Engine//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarName}`,
    'X-WR-TIMEZONE:America/Santiago',
  ];

  const nowStamp = formatUtcTimestamp(new Date());

  assignments.forEach((assignment, index) => {
    const dayOfWeek = assignment.day_of_week;
    const rruleDay = dayRruleMap[dayOfWeek] || 'MO';
    
    // Calculate reference date for the first occurrence in the week
    const baseDate = new Date(`${startDateStr}T00:00:00`);
    const dayOffset = (dayOfWeek - 1); // Monday is 0 offset
    baseDate.setDate(baseDate.getDate() + dayOffset);

    const year = baseDate.getFullYear();
    const month = pad(baseDate.getMonth() + 1);
    const date = pad(baseDate.getDate());

    const startTime = (assignment.start_time || '08:30').replace(':', '') + '00';
    const endTime = (assignment.end_time || '10:00').replace(':', '') + '00';
    const untilDate = endDateStr.replace(/-/g, '') + 'T235959Z';

    const dtStart = `${year}${month}${date}T${startTime}`;
    const dtEnd = `${year}${month}${date}T${endTime}`;

    const summary = `${assignment.subject_code || ''} - ${assignment.subject_name || 'Clase'} (NRC ${assignment.nrc || ''})`;
    const location = assignment.room_name ? `Sala ${assignment.room_name}` : 'Sala por confirmar';
    const description = `Docente: ${assignment.teacher_name || 'Sin docente asignado'}\\nNivel: ${assignment.level || 1}\\nTipo: ${assignment.section_type || 'TEO'}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:sched-${assignment.id || index}-${nowStamp}@scheduler.pro`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay};UNTIL=${untilDate}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`LOCATION:${location}`);
    lines.push(`DESCRIPTION:${description}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};

/**
 * Generates CSV string for exporting schedule data to Excel
 */
export const generateScheduleCsv = (assignments: Assignment[]): string => {
  const dayNames = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const headers = ['Día', 'Bloque', 'Inicio', 'Fin', 'NRC', 'Código', 'Asignatura', 'Nivel', 'Tipo', 'Docente', 'Sala'];
  
  const rows = assignments.map(a => [
    dayNames[a.day_of_week] || `Día ${a.day_of_week}`,
    `"${a.timeslot_label || ''}"`,
    `"${a.start_time || ''}"`,
    `"${a.end_time || ''}"`,
    `"${a.nrc || ''}"`,
    `"${a.subject_code || ''}"`,
    `"${(a.subject_name || '').replace(/"/g, '""')}"`,
    a.level || 1,
    `"${a.section_type || 'TEO'}"`,
    `"${(a.teacher_name || '').replace(/"/g, '""')}"`,
    `"${(a.room_name || '').replace(/"/g, '""')}"`,
  ]);

  return [
    headers.join(','),
    ...rows.map(r => r.join(',')),
  ].join('\n');
};

/**
 * Downloads a string content as a file in the browser
 */
export const downloadFile = (content: string, fileName: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
