import jsPDF from 'jspdf';
import type { SchedulerAssignment as Assignment } from './model';

export interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  dayOfWeek: number; // 1 = Monday, 5 = Friday
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

export interface SchedulePdfExportOptions {
  assignments: Assignment[];
  timeslots: Array<{ id: string; label: string; start_time?: string; end_time?: string; order_index: number }>;
  periodName?: string;
  careerName?: string;
  viewMode?: 'nivel' | 'sala' | 'docente';
  selectedLevel?: number;
  selectedRoom?: string;
  selectedTeacher?: string | null;
  parallelTracks?: number;
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
  const headers = ['Día', 'Bloque', 'Inicio', 'Fin', 'NRC', 'Sección', 'Código', 'Asignatura', 'Nivel', 'Tipo', 'Docente', 'Sala'];
  
  const rows = assignments.map(a => [
    dayNames[a.day_of_week] || `Día ${a.day_of_week}`,
    `"${a.timeslot_label || ''}"`,
    `"${a.start_time || ''}"`,
    `"${a.end_time || ''}"`,
    `"${a.nrc || ''}"`,
    `"${a.section_code ? (a.section_code.startsWith('SEC') ? a.section_code : `Sec ${a.section_code}`) : `Sec ${(a.parallel_index ?? 0) + 1}`}"`,
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
 * Generates a clean, vector-based PDF document of the schedule
 */
/**
 * Renders a single academic schedule grid page on a jsPDF instance
 */
function renderSingleSchedulePage(doc: jsPDF, options: {
  assignments: Assignment[];
  timeslots: Array<{ id: string; label: string; start_time?: string; end_time?: string; order_index: number }>;
  periodName: string;
  careerName: string;
  scopeLabel: string;
  effectiveTracks: number;
  pageNumber?: number;
  totalPages?: number;
}) {
  const {
    assignments,
    timeslots,
    periodName,
    careerName,
    scopeLabel,
    effectiveTracks,
    pageNumber,
    totalPages,
  } = options;

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 10;
  const marginTop = 8;
  const usableWidth = pageWidth - (marginX * 2); // 277 mm

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.roundedRect(marginX, marginTop, usableWidth, 16, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SCHEDULER PRO · HORARIO ACADÉMICO', marginX + 6, marginTop + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`${careerName} · ${periodName} · ${scopeLabel}`, marginX + 6, marginTop + 12);

  // Right metadata in banner
  const todayStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text(`Emitido: ${todayStr}`, marginX + usableWidth - 6, marginTop + 7, { align: 'right' });
  const pageInfo = pageNumber && totalPages ? ` · Pág. ${pageNumber}/${totalPages}` : '';
  doc.text(`${assignments.length} clases programadas${pageInfo}`, marginX + usableWidth - 6, marginTop + 12, { align: 'right' });

  // Grid Configuration
  const gridStartY = marginTop + 19;
  const timeColWidth = 24;
  const daysColWidth = usableWidth - timeColWidth; // 253 mm
  const dayWidth = daysColWidth / 5; // 50.6 mm per day
  const tracks = Math.max(1, Math.min(3, effectiveTracks));
  const trackWidth = dayWidth / tracks;

  const sortedTimeslots = [...timeslots].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const availableGridHeight = pageHeight - gridStartY - 14; // margin for footer
  const headerHeight = tracks > 1 ? 10 : 7;
  const rowHeight = Math.min(22, Math.max(14, (availableGridHeight - headerHeight) / Math.max(1, sortedTimeslots.length)));

  // Day Headers
  const dayNames = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'];
  
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(marginX, gridStartY, timeColWidth, headerHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('HORARIO', marginX + (timeColWidth / 2), gridStartY + (headerHeight / 2) + 1, { align: 'center' });

  dayNames.forEach((dName, dIdx) => {
    const dayX = marginX + timeColWidth + (dIdx * dayWidth);
    doc.setFillColor(30, 41, 59);
    doc.rect(dayX, gridStartY, dayWidth, tracks > 1 ? 5.5 : headerHeight, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(dName, dayX + (dayWidth / 2), gridStartY + (tracks > 1 ? 3.8 : headerHeight / 2 + 1), { align: 'center' });

    if (tracks > 1) {
      for (let tIdx = 0; tIdx < tracks; tIdx++) {
        const subX = dayX + (tIdx * trackWidth);
        doc.setFillColor(51, 65, 85); // slate-700
        doc.rect(subX, gridStartY + 5.5, trackWidth, 4.5, 'F');
        doc.setTextColor(226, 232, 240); // slate-200
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.text(`Sec. ${tIdx + 1}`, subX + (trackWidth / 2), gridStartY + 8.8, { align: 'center' });
      }
    }
  });

  // Render Timeslot Rows & Assignments
  sortedTimeslots.forEach((slot, rIdx) => {
    const rowY = gridStartY + headerHeight + (rIdx * rowHeight);

    // Timeslot column cell
    doc.setFillColor(rIdx % 2 === 0 ? 248 : 241, rIdx % 2 === 0 ? 250 : 245, rIdx % 2 === 0 ? 252 : 249);
    doc.rect(marginX, rowY, timeColWidth, rowHeight, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(marginX, rowY, timeColWidth, rowHeight, 'S');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(slot.label || `B${rIdx + 1}`, marginX + (timeColWidth / 2), rowY + (rowHeight / 2) - 1.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    const timeRange = slot.start_time && slot.end_time ? `${slot.start_time} - ${slot.end_time}` : '';
    doc.text(timeRange, marginX + (timeColWidth / 2), rowY + (rowHeight / 2) + 2.5, { align: 'center' });

    // Days & Tracks
    for (let d = 1; d <= 5; d++) {
      const dayX = marginX + timeColWidth + ((d - 1) * dayWidth);

      for (let tIdx = 0; tIdx < tracks; tIdx++) {
        const cellX = dayX + (tIdx * trackWidth);

        // Empty slot background & border
        doc.setFillColor(255, 255, 255);
        doc.rect(cellX, rowY, trackWidth, rowHeight, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(cellX, rowY, trackWidth, rowHeight, 'S');

        // Find assignment for this cell
        const cellAssignments = assignments.filter(a => a.day_of_week === d && a.timeslot_id === slot.id);
        const asg = cellAssignments.find((a, idx) => {
          if (a.section_code) {
            const num = parseInt(a.section_code.replace(/\D/g, ''));
            if (!isNaN(num) && num >= 1 && num <= 3) return (num - 1) === tIdx;
          }
          if (a.parallel_index !== undefined && a.parallel_index !== null) {
            return Number(a.parallel_index) === tIdx;
          }
          return idx % tracks === tIdx;
        });

        if (asg) {
          const type = (asg.section_type || 'TEO').toUpperCase();
          
          // Color styles by component type
          let fillR = 224, fillG = 242, fillB = 254; // light blue TEO
          let strokeR = 2, strokeG = 132, strokeB = 199;
          let textR = 3, textG = 105, textB = 161;

          if (type === 'LAB') {
            fillR = 220; fillG = 252; fillB = 231; // light emerald LAB
            strokeR = 22; strokeG = 163; strokeB = 74;
            textR = 21; textG = 128; textB = 61;
          } else if (type === 'SIM') {
            fillR = 243; fillG = 232; fillB = 255; // light purple SIM
            strokeR = 147; strokeG = 51; strokeB = 234;
            textR = 126; textG = 34; textB = 206;
          } else if (type === 'TAL') {
            fillR = 254; fillG = 243; fillB = 199; // light amber TAL
            strokeR = 217; strokeG = 119; strokeB = 6;
            textR = 180; textG = 83; textB = 9;
          }

          // Card Box
          const padBox = 0.6;
          doc.setFillColor(fillR, fillG, fillB);
          doc.setDrawColor(strokeR, strokeG, strokeB);
          doc.roundedRect(cellX + padBox, rowY + padBox, trackWidth - (padBox * 2), rowHeight - (padBox * 2), 1, 1, 'FD');

          // Card Text Contents
          const innerX = cellX + padBox + 1.2;
          const maxTextW = trackWidth - (padBox * 2) - 2.4;

          // Subject Name
          doc.setTextColor(15, 23, 42);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(tracks === 3 ? 5.5 : 6.5);
          const rawName = asg.subject_name || asg.subject_code || 'Asignatura';
          const truncatedName = doc.splitTextToSize(rawName, maxTextW)[0] || rawName;
          doc.text(truncatedName, innerX, rowY + 3.8);

          // Type & NRC & Sec
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5);
          doc.setTextColor(textR, textG, textB);
          const secCode = asg.section_code ? (asg.section_code.startsWith('SEC') ? asg.section_code : `Sec ${asg.section_code}`) : `Sec ${tIdx + 1}`;
          doc.text(`[${type}] ${secCode} · NRC ${asg.nrc}`, innerX, rowY + 6.8);

          // Teacher
          if (asg.teacher_name) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5);
            doc.setTextColor(51, 65, 85);
            const teacherTrunc = doc.splitTextToSize(asg.teacher_name, maxTextW)[0] || asg.teacher_name;
            doc.text(teacherTrunc, innerX, rowY + 9.6);
          }

          // Room
          if (asg.room_name) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.2);
            doc.setTextColor(15, 23, 42);
            doc.text(`Sala: ${asg.room_name}`, innerX, rowY + rowHeight - 2);
          }
        }
      }
    }
  });

  // Footer Legend
  const footerY = pageHeight - 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('Leyenda: [TEO] Teoría · [LAB] Laboratorio · [SIM] Simulación · [TAL] Taller', marginX, footerY);
  doc.text('Documento oficial generado por Scheduler Pro · Sistema de Planificación Universitaria', marginX + usableWidth, footerY, { align: 'right' });
}

/**
 * Generates a clean, vector-based PDF document of the schedule respecting active view and filters
 */
export const generateSchedulePdf = (options: SchedulePdfExportOptions): jsPDF => {
  const {
    assignments,
    timeslots,
    periodName = 'Primer Semestre 2026',
    careerName = 'Planificación Académica',
    viewMode = 'nivel',
    selectedLevel = 0,
    selectedRoom = 'TODAS',
    selectedTeacher = null,
    parallelTracks = 2,
  } = options;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // 1. Nivel View Mode
  if (viewMode === 'nivel') {
    if (selectedLevel > 0) {
      // Specific single level
      const levelAssignments = assignments.filter(a => Number(a.level) === selectedLevel);
      renderSingleSchedulePage(doc, {
        assignments: levelAssignments,
        timeslots,
        periodName,
        careerName,
        scopeLabel: `Horario Nivel ${selectedLevel}°`,
        effectiveTracks: parallelTracks,
      });
      return doc;
    } else {
      // All levels: Generate 1 page per level
      const distinctLevels = Array.from(new Set(assignments.map(a => Number(a.level)).filter(l => !isNaN(l) && l > 0))).sort((a, b) => a - b);
      const levelsToRender = distinctLevels.length > 0 ? distinctLevels : [1];

      levelsToRender.forEach((lvl, idx) => {
        if (idx > 0) doc.addPage('a4', 'landscape');
        const levelAssignments = assignments.filter(a => Number(a.level) === lvl);
        renderSingleSchedulePage(doc, {
          assignments: levelAssignments,
          timeslots,
          periodName,
          careerName,
          scopeLabel: `Horario Nivel ${lvl}°`,
          effectiveTracks: parallelTracks,
          pageNumber: idx + 1,
          totalPages: levelsToRender.length,
        });
      });
      return doc;
    }
  }

  // 2. Sala View Mode
  if (viewMode === 'sala') {
    if (selectedRoom && selectedRoom !== 'TODAS') {
      const roomAssignments = assignments.filter(a => (a.room_name || '').toUpperCase() === selectedRoom.toUpperCase());
      renderSingleSchedulePage(doc, {
        assignments: roomAssignments,
        timeslots,
        periodName,
        careerName,
        scopeLabel: `Horario Sala: ${selectedRoom}`,
        effectiveTracks: 1,
      });
      return doc;
    } else {
      // All rooms: Generate 1 page per room
      const distinctRooms = Array.from(new Set(assignments.map(a => (a.room_name || '').trim()).filter(Boolean))).sort();
      const roomsToRender = distinctRooms.length > 0 ? distinctRooms : ['SALA GENERAL'];

      roomsToRender.forEach((room, idx) => {
        if (idx > 0) doc.addPage('a4', 'landscape');
        const roomAssignments = assignments.filter(a => (a.room_name || '').trim() === room);
        renderSingleSchedulePage(doc, {
          assignments: roomAssignments,
          timeslots,
          periodName,
          careerName,
          scopeLabel: `Horario Sala: ${room}`,
          effectiveTracks: 1,
          pageNumber: idx + 1,
          totalPages: roomsToRender.length,
        });
      });
      return doc;
    }
  }

  // 3. Docente View Mode
  if (viewMode === 'docente') {
    if (selectedTeacher) {
      const teacherAssignments = assignments.filter(a => (a.teacher_name || '').trim().toLowerCase() === selectedTeacher.trim().toLowerCase());
      renderSingleSchedulePage(doc, {
        assignments: teacherAssignments,
        timeslots,
        periodName,
        careerName,
        scopeLabel: `Horario Docente: ${selectedTeacher}`,
        effectiveTracks: 1,
      });
      return doc;
    } else {
      // All teachers: Generate 1 page per teacher
      const distinctTeachers = Array.from(new Set(assignments.map(a => (a.teacher_name || '').trim()).filter(Boolean))).sort();
      const teachersToRender = distinctTeachers.length > 0 ? distinctTeachers : ['DOCENTE'];

      teachersToRender.forEach((teacher, idx) => {
        if (idx > 0) doc.addPage('a4', 'landscape');
        const teacherAssignments = assignments.filter(a => (a.teacher_name || '').trim() === teacher);
        renderSingleSchedulePage(doc, {
          assignments: teacherAssignments,
          timeslots,
          periodName,
          careerName,
          scopeLabel: `Horario Docente: ${teacher}`,
          effectiveTracks: 1,
          pageNumber: idx + 1,
          totalPages: teachersToRender.length,
        });
      });
      return doc;
    }
  }

  // Default Fallback
  renderSingleSchedulePage(doc, {
    assignments,
    timeslots,
    periodName,
    careerName,
    scopeLabel: 'Vista General Completa',
    effectiveTracks: 1,
  });
  return doc;
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
