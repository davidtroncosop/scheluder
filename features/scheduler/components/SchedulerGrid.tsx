import React from 'react';
import type {
  SchedulerAssignment as Assignment,
  SchedulerConflict as Conflict,
  SchedulerSection as Section,
  SchedulerTimeslot as Timeslot,
} from '../model';

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
  parallelCount,
  draggingSection,
  dropTarget,
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
      return assignments.filter(a => Number(a.level) === selectedViewLevel);
    }
    if (viewMode === 'sala') {
      return assignments.filter(a => (a.room_name || '').toUpperCase() === selectedViewRoom.toUpperCase());
    }
    if (viewMode === 'docente') {
      if (!selectedViewTeacher) return [];
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

  const getTypeStyle = (type?: string) => {
    switch ((type || 'TEO').toUpperCase()) {
      case 'LAB':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
      case 'SIM':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30';
      case 'TAL':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30';
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-6">
      <div className="min-w-[900px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Table Header with Days */}
        <div className="grid grid-cols-6 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/70 sticky top-0 z-20">
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
            <div key={slot.id} className="grid grid-cols-6 min-h-[110px]">
              {/* Timeslot Label */}
              <div className="p-3 bg-slate-50/50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-center items-center text-center">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{slot.label}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  {slot.start_time} - {slot.end_time}
                </span>
              </div>

              {/* Days Columns */}
              {[1, 2, 3, 4, 5].map((dayOfWeek) => {
                const cellAssignments = getCellAssignments(dayOfWeek, slot.id);
                const isTarget = dropTarget?.timeslotId === slot.id && dropTarget?.dayOfWeek === dayOfWeek;

                return (
                  <div
                    key={dayOfWeek}
                    onDragOver={(e) => onDragOver(e, slot.id, dayOfWeek, 0)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, slot.id, dayOfWeek, 0)}
                    onClick={() => onSlotClick?.(slot.id, dayOfWeek, 0)}
                    className={`p-2 border-r border-slate-200 dark:border-slate-800 last:border-r-0 transition-colors flex flex-col gap-2 relative ${
                      isTarget
                        ? 'bg-primary/10 ring-2 ring-primary ring-inset'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {cellAssignments.length === 0 && draggingSection && isTarget && (
                      <div className="h-full w-full border-2 border-dashed border-primary/50 rounded-lg flex items-center justify-center text-xs font-semibold text-primary">
                        Soltar aquí
                      </div>
                    )}

                    {cellAssignments.map((assignment) => {
                      const conflict = getAssignmentConflict(assignment.id);

                      return (
                        <div
                          key={assignment.id}
                          className={`group relative p-2.5 rounded-lg border transition-all shadow-xs hover:shadow-md ${
                            conflict
                              ? conflict.type === 'CRITICAL'
                                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {/* Subject Header */}
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                                {assignment.subject_name || assignment.subject_code}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${getTypeStyle(assignment.section_type)}`}>
                                {assignment.section_type || 'TEO'}
                              </span>
                            </div>

                            {/* Actions Dropdown / Delete button */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditAssignment(assignment);
                                }}
                                className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="Editar asignación"
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
                                title="Desasignar"
                              >
                                <span className="material-symbols-outlined text-xs">delete</span>
                              </button>
                            </div>
                          </div>

                          {/* NRC and Details */}
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 flex flex-col gap-0.5 mt-1">
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span>NRC: <strong className="text-slate-700 dark:text-slate-300">{assignment.nrc}</strong></span>
                              <span>Nivel {assignment.level || 1}</span>
                            </div>

                            {assignment.teacher_name && (
                              <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 truncate">
                                <span className="material-symbols-outlined text-xs text-slate-400">person</span>
                                <span className="truncate">{assignment.teacher_name}</span>
                              </div>
                            )}

                            {assignment.room_name && (
                              <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined text-xs text-slate-400">meeting_room</span>
                                <span>{assignment.room_name}</span>
                              </div>
                            )}
                          </div>

                          {/* Conflict Warning Indicator */}
                          {conflict && (
                            <div
                              className={`mt-2 px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 ${
                                conflict.type === 'CRITICAL'
                                  ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-200'
                                  : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-200'
                              }`}
                              title={conflict.description}
                            >
                              <span className="material-symbols-outlined text-xs">
                                {conflict.type === 'CRITICAL' ? 'error' : 'warning'}
                              </span>
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
