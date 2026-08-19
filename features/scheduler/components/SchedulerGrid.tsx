import React from 'react';
import type {
  SchedulerAssignment as Assignment,
  SchedulerConflict as Conflict,
  SchedulerSection as Section,
  SchedulerTimeslot as Timeslot,
} from '../model';
import type { ImportedTeacher } from '../../../lib/dataStore';

interface SchedulerGridProps {
  timeslots: Timeslot[];
  assignments: Assignment[];
  conflicts: Conflict[];
  viewMode: 'nivel' | 'sala' | 'docente';
  selectedViewLevel: number;
  selectedViewRoom: string;
  selectedViewTeacher: string | null;
  parallelCount: number;
  draggingSection: Section | null;
  dropTarget: { timeslotId: string; dayOfWeek: number; parallelIndex: number } | null;
  availableRooms?: Array<{ id: string; name: string; type: string; capacity: number }>;
  teacherAvailabilities?: Array<{ teacher_id: string; day_of_week: number; timeslot_id: string; status: string; teacher_name?: string }>;
  teachers?: ImportedTeacher[];
  onDragOver: (e: React.DragEvent, timeslotId: string, dayOfWeek: number, parallelIndex: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, timeslotId: string, dayOfWeek: number, parallelIndex: number) => void;
  onEditAssignment: (assignment: Assignment) => void;
  onDeleteAssignment: (assignmentId: string) => void;
  onSlotClick?: (timeslotId: string, dayOfWeek: number, parallelIndex: number) => void;
}

const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

export const SchedulerGrid: React.FC<SchedulerGridProps> = ({
  timeslots,
  assignments,
  conflicts,
  viewMode,
  selectedViewLevel,
  selectedViewRoom,
  selectedViewTeacher,
  draggingSection,
  dropTarget,
  availableRooms = [],
  teacherAvailabilities = [],
  teachers = [],
  onDragOver,
  onDragLeave,
  onDrop,
  onEditAssignment,
  onDeleteAssignment,
  onSlotClick,
}) => {
  // Helper to filter assignments according to current view mode
  const getFilteredAssignments = () => {
    if (viewMode === 'nivel') {
      if (selectedViewLevel === 0) return assignments; // Todos los niveles
      return assignments.filter(a => Number(a.level) === selectedViewLevel);
    }
    if (viewMode === 'sala') {
      if (!selectedViewRoom || selectedViewRoom === 'TODAS') return assignments;
      return assignments.filter(a => (a.room_name || '').toUpperCase() === selectedViewRoom.toUpperCase());
    }
    if (viewMode === 'docente') {
      if (!selectedViewTeacher || selectedViewTeacher === '') return assignments;
      return assignments.filter(a => (a.teacher_name || '').trim().toLowerCase() === selectedViewTeacher.trim().toLowerCase());
    }
    return assignments;
  };

  const filteredAssignments = getFilteredAssignments();

  // Find assignments for a specific day and timeslot
  const getCellAssignments = (dayOfWeek: number, timeslotId: string) => {
    return filteredAssignments.filter(
      a => a.day_of_week === dayOfWeek && a.timeslot_id === timeslotId
    );
  };

  // Find conflict for an assignment
  const getAssignmentConflict = (assignmentId: string) => {
    return conflicts.find(c => c.assignment_id === assignmentId && !c.is_resolved);
  };

  // Calculate compatibility & feasibility heatmap for a slot when dragging a section
  const getSlotCompatibility = (dayOfWeek: number, timeslotId: string) => {
    if (!draggingSection) return null;

    // 1. Check Teacher Conflict & Availability
    let teacherConflict: string | null = null;
    let isTeacherPreferred = false;

    if (draggingSection.teacher_name) {
      const teacherNorm = draggingSection.teacher_name.trim().toLowerCase();
      // Is teacher already teaching another section at this slot?
      const teacherOccupied = assignments.find(
        a => a.day_of_week === dayOfWeek &&
             a.timeslot_id === timeslotId &&
             a.teacher_name?.trim().toLowerCase() === teacherNorm &&
             a.section_id !== draggingSection.id
      );

      if (teacherOccupied) {
        teacherConflict = `Profesor ocupado en ${teacherOccupied.subject_name || 'NRC ' + teacherOccupied.nrc}`;
      } else {
        // Teacher preference/blocked
        const matchingAvail = teacherAvailabilities.find(
          ta => (ta.teacher_name?.trim().toLowerCase() === teacherNorm ||
                 (teachers.find(t => t.nombre?.trim().toLowerCase() === teacherNorm)?.id === ta.teacher_id)) &&
                ta.day_of_week === dayOfWeek &&
                ta.timeslot_id === timeslotId
        );
        if (matchingAvail?.status === 'blocked') {
          teacherConflict = 'Horario bloqueado por el docente';
        } else if (matchingAvail?.status === 'preference') {
          isTeacherPreferred = true;
        }
      }
    }

    // 2. Check Level Clash (Tope de Nivel)
    const levelClash = assignments.find(
      a => a.day_of_week === dayOfWeek &&
           a.timeslot_id === timeslotId &&
           Number(a.level) === Number(draggingSection.level) &&
           a.section_id !== draggingSection.id
    );

    // 3. Check Room Availability
    const sectionType = (draggingSection.type || 'TEO').toUpperCase();
    const compatRooms = availableRooms.filter(r => {
      if (sectionType === 'LAB') return r.type === 'LAB' || r.type === 'SIM';
      if (sectionType === 'SIM') return r.type === 'SIM' || r.type === 'LAB';
      if (sectionType === 'TAL') return r.type === 'TAL';
      return r.type === 'TEO' || r.type === 'AUD';
    });

    const occupiedRoomIds = assignments
      .filter(a => a.day_of_week === dayOfWeek && a.timeslot_id === timeslotId)
      .map(a => (a.room_id || a.room_name || '').toUpperCase());

    const freeRooms = compatRooms.filter(
      r => !occupiedRoomIds.includes(r.id.toUpperCase()) && !occupiedRoomIds.includes(r.name.toUpperCase())
    );

    // Decision Logic
    if (teacherConflict) {
      return {
        type: 'CRITICAL' as const,
        label: teacherConflict,
        tag: 'Conflicto Docente',
        bg: 'bg-rose-500/15 border-rose-400 text-rose-800 dark:text-rose-300 dark:bg-rose-950/40',
        dot: 'bg-rose-500',
      };
    }

    if (levelClash) {
      return {
        type: 'CRITICAL' as const,
        label: `Tope Nivel ${draggingSection.level}: ${levelClash.subject_name || 'NRC ' + levelClash.nrc}`,
        tag: 'Choque de Nivel',
        bg: 'bg-rose-500/15 border-rose-400 text-rose-800 dark:text-rose-300 dark:bg-rose-950/40',
        dot: 'bg-rose-500',
      };
    }

    if (compatRooms.length > 0 && freeRooms.length === 0) {
      return {
        type: 'WARNING' as const,
        label: `Salas ${sectionType} ocupadas (${compatRooms.length}/${compatRooms.length})`,
        tag: 'Sin Sala',
        bg: 'bg-amber-500/15 border-amber-400 text-amber-800 dark:text-amber-300 dark:bg-amber-950/40',
        dot: 'bg-amber-500',
      };
    }

    if (isTeacherPreferred) {
      return {
        type: 'PREFERRED' as const,
        label: `🌟 Horario Preferido (${freeRooms.length} salas libres)`,
        tag: 'Zona Ideal',
        bg: 'bg-emerald-500/20 border-emerald-500 text-emerald-900 dark:text-emerald-200 dark:bg-emerald-950/60 ring-2 ring-emerald-400/50',
        dot: 'bg-emerald-500',
      };
    }

    return {
      type: 'FREE' as const,
      label: `✓ Sin Conflicto (${freeRooms.length > 0 ? `${freeRooms.length} salas` : 'disponible'})`,
      tag: 'Compatible',
      bg: 'bg-emerald-500/10 border-emerald-300 text-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/30',
      dot: 'bg-emerald-400',
    };
  };

  const getTypeStyle = (type?: string) => {
    switch ((type || 'TEO').toUpperCase()) {
      case 'LAB':
        return 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-400/40 font-bold';
      case 'SIM':
        return 'bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-400/40 font-bold';
      case 'TAL':
        return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-400/40 font-bold';
      default:
        return 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-400/40 font-bold';
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 flex flex-col gap-3">
      {/* Visual Helper Banner when dragging */}
      {draggingSection && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-900 dark:text-indigo-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-500 text-base animate-pulse">radar</span>
            <span>
              <strong>Programando NRC {draggingSection.nrc} ({draggingSection.subject_name || draggingSection.subject_code}):</strong>
              {' '}Arrastra sobre las zonas verdes para evitar choques de salas, docentes y niveles.
            </span>
          </div>
          <div className="flex items-center gap-3 font-semibold text-[11px]">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-500 inline-block" /> Zona Ideal (Sin conflictos)</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-amber-500 inline-block" /> Advertencia (Salas ocupadas)</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-rose-500 inline-block" /> Conflicto (Docente / Tope nivel)</span>
          </div>
        </div>
      )}

      {/* Grid Container */}
      <div className="min-w-[950px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
        {/* Table Header with Days */}
        <div className="grid grid-cols-6 border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/80 sticky top-0 z-20">
          <div className="p-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center border-r border-slate-200 dark:border-slate-800">
            Bloque Horario
          </div>
          {dayNames.map((dayName, index) => (
            <div
              key={dayName}
              className="p-3 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-center border-r border-slate-200 dark:border-slate-800 last:border-r-0"
            >
              <span>{dayName}</span>
              <div className="text-[10px] font-normal text-slate-400">Día {index + 1}</div>
            </div>
          ))}
        </div>

        {/* Timeslot Rows */}
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {timeslots.map((slot) => (
            <div key={slot.id} className="grid grid-cols-6 min-h-[120px]">
              {/* Timeslot Label */}
              <div className="p-3 bg-slate-50/50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-center items-center text-center">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{slot.label}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono font-semibold">
                  {slot.start_time} - {slot.end_time}
                </span>
              </div>

              {/* Days Columns */}
              {[1, 2, 3, 4, 5].map((dayOfWeek) => {
                const cellAssignments = getCellAssignments(dayOfWeek, slot.id);
                const isTarget = dropTarget?.timeslotId === slot.id && dropTarget?.dayOfWeek === dayOfWeek;
                const compatibility = getSlotCompatibility(dayOfWeek, slot.id);

                return (
                  <div
                    key={dayOfWeek}
                    onDragOver={(e) => onDragOver(e, slot.id, dayOfWeek, 0)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, slot.id, dayOfWeek, 0)}
                    onClick={() => onSlotClick?.(slot.id, dayOfWeek, 0)}
                    className={`p-2 border-r border-slate-200 dark:border-slate-800 last:border-r-0 transition-all flex flex-col gap-2 relative ${
                      isTarget
                        ? 'bg-primary/15 ring-2 ring-primary ring-inset z-10'
                        : compatibility
                        ? compatibility.bg
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Compatibility Feasibility Indicator when Dragging */}
                    {compatibility && (
                      <div className="text-[10px] font-bold py-1 px-1.5 rounded flex items-center justify-between gap-1 border border-current/20 mb-1 shrink-0 backdrop-blur-xs">
                        <span className="truncate">{compatibility.label}</span>
                        <span className={`size-2 rounded-full shrink-0 ${compatibility.dot}`} />
                      </div>
                    )}

                    {/* Drag and Drop Prompt */}
                    {cellAssignments.length === 0 && draggingSection && isTarget && (
                      <div className="h-full w-full border-2 border-dashed border-primary rounded-lg flex items-center justify-center text-xs font-bold text-primary bg-primary/10">
                        Soltar aquí para asignar
                      </div>
                    )}

                    {/* Assigned Cards */}
                    {cellAssignments.map((assignment) => {
                      const conflict = getAssignmentConflict(assignment.id);

                      return (
                        <div
                          key={assignment.id}
                          className={`group relative p-2.5 rounded-xl border transition-all shadow-xs hover:shadow-md ${
                            conflict
                              ? conflict.type === 'CRITICAL'
                                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 text-rose-900 dark:text-rose-200 ring-1 ring-rose-400'
                                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-900 dark:text-amber-200'
                              : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-primary/50'
                          }`}
                        >
                          {/* Subject Header */}
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                                {assignment.subject_name || assignment.subject_code}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase border ${getTypeStyle(assignment.section_type)}`}>
                                {assignment.section_type || 'TEO'}
                              </span>
                            </div>

                            {/* Actions Dropdown / Delete button */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditAssignment(assignment);
                                }}
                                className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="Editar asignación y sala"
                              >
                                <span className="material-symbols-outlined text-xs">edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteAssignment(assignment.id);
                                }}
                                className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 dark:hover:bg-rose-950"
                                title="Desasignar del horario"
                              >
                                <span className="material-symbols-outlined text-xs">delete</span>
                              </button>
                            </div>
                          </div>

                          {/* NRC and Details */}
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-col gap-0.5 mt-1">
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span>NRC: <strong className="text-slate-800 dark:text-slate-200 font-mono">{assignment.nrc}</strong></span>
                              <span className="px-1.5 py-0.2 rounded font-black text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                Nivel {assignment.level || 1}
                              </span>
                            </div>

                            {assignment.teacher_name && (
                              <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 truncate font-medium text-[10px] mt-0.5">
                                <span className="material-symbols-outlined text-xs text-primary">person</span>
                                <span className="truncate">{assignment.teacher_name}</span>
                              </div>
                            )}

                            {assignment.room_name && (
                              <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-semibold text-[10px]">
                                <span className="material-symbols-outlined text-xs text-slate-400">meeting_room</span>
                                <span>{assignment.room_name}</span>
                              </div>
                            )}
                          </div>

                          {/* Conflict Warning Indicator */}
                          {conflict && (
                            <div className={`mt-1.5 pt-1 border-t text-[10px] font-bold flex items-center gap-1 ${
                              conflict.type === 'CRITICAL' ? 'border-rose-300 text-rose-700 dark:text-rose-300' : 'border-amber-300 text-amber-700 dark:text-amber-300'
                            }`}>
                              <span className="material-symbols-outlined text-xs shrink-0">warning</span>
                              <span className="truncate">{conflict.description}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
