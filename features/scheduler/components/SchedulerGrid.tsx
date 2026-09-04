import React, { useState, useRef, useMemo, useEffect } from 'react';
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
  activeSchedulingSection?: Section | null;
  onSelectActiveSection?: (section: Section | null) => void;
  onUpdateActiveTeacher?: (sectionId: string, teacherName: string, teacherId?: string) => void;
  onUpdateActiveRoom?: (sectionId: string, roomId: string, roomName: string) => void;
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
  activeSchedulingSection = null,
  onSelectActiveSection,
  onUpdateActiveTeacher,
  onUpdateActiveRoom,
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
  const [timeScope, setTimeScope] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [density, setDensity] = useState<'normal' | 'compact'>('normal');
  const [parallelTracks, setParallelTracks] = useState<number>(1);
  const [isScrolledDown, setIsScrolledDown] = useState(false);

  const gridScrollRef = useRef<HTMLDivElement>(null);
  const tardeSlotRef = useRef<HTMLDivElement>(null);

  // Recently assigned animation tracking
  const [recentlyAssignedIds, setRecentlyAssignedIds] = useState<Set<string>>(new Set());
  const prevAssignmentIdsRef = useRef<Set<string>>(new Set(assignments.map(a => a.id)));
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevAssignmentIdsRef.current = new Set(assignments.map(a => a.id));
      return;
    }

    const currentIds = new Set(assignments.map(a => a.id));
    const newIds: string[] = [];
    currentIds.forEach(id => {
      if (!prevAssignmentIdsRef.current.has(id)) {
        newIds.push(id);
      }
    });

    if (newIds.length > 0) {
      setRecentlyAssignedIds(prev => {
        const next = new Set(prev);
        newIds.forEach(id => next.add(id));
        return next;
      });

      const timer = setTimeout(() => {
        setRecentlyAssignedIds(prev => {
          const next = new Set(prev);
          newIds.forEach(id => next.delete(id));
          return next;
        });
      }, 2500);

      prevAssignmentIdsRef.current = currentIds;
      return () => clearTimeout(timer);
    } else {
      prevAssignmentIdsRef.current = currentIds;
    }
  }, [assignments]);

  // The section currently being planned (either dragged or active)
  const targetSection = draggingSection || activeSchedulingSection;

  // Sorted timeslots (All blocks are always included)
  const sortedTimeslots = [...timeslots].sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));

  // Handle scroll detection
  const handleScroll = () => {
    if (gridScrollRef.current) {
      setIsScrolledDown(gridScrollRef.current.scrollTop > 200);
    }
  };

  const scrollToTop = () => {
    gridScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToAfternoon = () => {
    if (tardeSlotRef.current && gridScrollRef.current) {
      const topPos = tardeSlotRef.current.offsetTop - 60;
      gridScrollRef.current.scrollTo({ top: topPos, behavior: 'smooth' });
    } else {
      gridScrollRef.current?.scrollTo({ top: 500, behavior: 'smooth' });
    }
  };

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

  // Calculate compatibility & feasibility heatmap for a slot when a section is targeted (dragged or active)
  const getSlotCompatibility = (dayOfWeek: number, timeslotId: string, parallelIndex = 0) => {
    if (!targetSection) return null;

    // 1. Check Teacher Conflict & Availability
    let teacherConflict: string | null = null;
    let isTeacherPreferred = false;

    if (targetSection.teacher_name) {
      const teacherNorm = targetSection.teacher_name.trim().toLowerCase();
      // Is teacher already teaching another section at this slot?
      const teacherOccupied = assignments.find(
        a => a.day_of_week === dayOfWeek &&
             a.timeslot_id === timeslotId &&
             a.teacher_name?.trim().toLowerCase() === teacherNorm &&
             a.section_id !== targetSection.id
      );

      if (teacherOccupied) {
        teacherConflict = `Prof. ${targetSection.teacher_name} ocupado (${teacherOccupied.subject_name || 'NRC ' + teacherOccupied.nrc})`;
      } else {
        // Teacher preference/blocked
        const matchingAvail = teacherAvailabilities.find(
          ta => (ta.teacher_name?.trim().toLowerCase() === teacherNorm ||
                 (teachers.find(t => t.nombre?.trim().toLowerCase() === teacherNorm)?.id === ta.teacher_id)) &&
                ta.day_of_week === dayOfWeek &&
                ta.timeslot_id === timeslotId
        );
        if (matchingAvail?.status === 'blocked') {
          teacherConflict = `Horario bloqueado por Prof. ${targetSection.teacher_name}`;
        } else if (matchingAvail?.status === 'preference') {
          isTeacherPreferred = true;
        }
      }
    }

    // 2. Check Level Clash (Tope de Nivel)
    // Rule A: Two classes of the same level in the SAME section track cannot overlap
    const parseSecNum = (code?: string | number | null, fallbackIdx = 0): number => {
      if (code !== undefined && code !== null && String(code).trim() !== '') {
        const match = String(code).match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (num >= 1) return num;
        }
      }
      return Number(fallbackIdx) + 1;
    };

    const targetSecNum = parseSecNum(targetSection.section_code, parallelIndex);

    const sameSectionAssigned = assignments.find(
      a => a.day_of_week === dayOfWeek &&
           a.timeslot_id === timeslotId &&
           Number(a.level) === Number(targetSection.level) &&
           parseSecNum(a.section_code, a.parallel_index) === targetSecNum &&
           a.section_id !== targetSection.id
    );

    let levelSectionConflict: string | null = null;
    if (sameSectionAssigned) {
      levelSectionConflict = `Tope Nivel ${targetSection.level} (Sección ${targetSecNum}): ${sameSectionAssigned.subject_name || 'NRC ' + sameSectionAssigned.nrc} ya asignada`;
    }

    // Rule B: Maximum 3 parallel sections allowed per level in a single timeslot
    const sameLevelAssigned = assignments.filter(
      a => a.day_of_week === dayOfWeek &&
           a.timeslot_id === timeslotId &&
           Number(a.level) === Number(targetSection.level) &&
           a.section_id !== targetSection.id
    );
    const levelClash = sameLevelAssigned.length >= 3
      ? { ...sameLevelAssigned[0], subject_name: `Nivel ${targetSection.level} saturado (3 secciones en paralelo)` }
      : null;

    // 3. Check Room Availability
    const sectionType = (targetSection.type || 'TEO').toUpperCase();
    const targetedRoomId = targetSection.room_id || targetSection.preferred_room_id;
    const targetedRoomName = targetSection.room_name;

    const occupiedAssignments = assignments.filter(
      a => a.day_of_week === dayOfWeek && a.timeslot_id === timeslotId && a.section_id !== targetSection.id
    );
    const occupiedRoomIdentifiers = occupiedAssignments.map(
      a => (a.room_id || a.room_name || '').toUpperCase()
    );

    let specificRoomConflict: string | null = null;
    let specificRoomFree = false;
    const expectedStudents = Number(targetSection.expected_students || 0);

    if (targetedRoomId || targetedRoomName) {
      const roomMatch = availableRooms.find(
        r => (targetedRoomId && r.id === targetedRoomId) ||
             (targetedRoomName && r.name.toUpperCase() === targetedRoomName.toUpperCase())
      );
      const rId = (roomMatch?.id || targetedRoomId || '').toUpperCase();
      const rName = (roomMatch?.name || targetedRoomName || '').toUpperCase();

      const isRoomOccupied = occupiedAssignments.find(
        a => (a.room_id && a.room_id.toUpperCase() === rId) ||
             (a.room_name && a.room_name.toUpperCase() === rName)
      );

      if (roomMatch && expectedStudents > 0 && roomMatch.capacity < expectedStudents) {
        specificRoomConflict = `Aforo insuficiente: ${roomMatch.name} (cap. ${roomMatch.capacity}) no alcanza para ${expectedStudents} alumnos`;
      } else if (isRoomOccupied) {
        specificRoomConflict = `Sala ${roomMatch?.name || targetedRoomName} ocupada por ${isRoomOccupied.subject_name || 'NRC ' + isRoomOccupied.nrc}`;
      } else {
        specificRoomFree = true;
      }
    }

    const compatRooms = availableRooms.filter(r => {
      if (expectedStudents > 0 && r.capacity < expectedStudents) return false;
      if (sectionType === 'SIM') return r.type === 'SIM';
      if (sectionType === 'LAB') return r.type === 'LAB' || r.type === 'SIM';
      if (sectionType === 'TAL') return r.type === 'TAL';
      return r.type === 'TEO' || r.type === 'AUD';
    });

    const freeCompatRooms = compatRooms.filter(
      r => !occupiedRoomIdentifiers.includes(r.id.toUpperCase()) && !occupiedRoomIdentifiers.includes(r.name.toUpperCase())
    );

    // === Decision Logic ===

    // Critical: Teacher conflict
    if (teacherConflict) {
      return {
        type: 'CRITICAL' as const,
        label: teacherConflict,
        tag: 'Conflicto Docente',
        bg: 'bg-rose-500/15 border-rose-400 text-rose-800 dark:text-rose-300 dark:bg-rose-950/40',
        dot: 'bg-rose-500',
      };
    }

    // Critical: Level Section Clash (same level in same section)
    if (levelSectionConflict) {
      return {
        type: 'CRITICAL' as const,
        label: levelSectionConflict,
        tag: `Tope Sec. ${parallelIndex + 1}`,
        bg: 'bg-rose-500/15 border-rose-400 text-rose-800 dark:text-rose-300 dark:bg-rose-950/40',
        dot: 'bg-rose-500',
      };
    }

    // Critical: Level Clash (too many parallel sections)
    if (levelClash) {
      return {
        type: 'CRITICAL' as const,
        label: `Tope Nivel ${targetSection.level}: ${levelClash.subject_name || 'NRC ' + levelClash.nrc}`,
        tag: 'Choque de Nivel',
        bg: 'bg-rose-500/15 border-rose-400 text-rose-800 dark:text-rose-300 dark:bg-rose-950/40',
        dot: 'bg-rose-500',
      };
    }

    // Critical: Chosen specific room is occupied or overcapacity
    if (specificRoomConflict) {
      return {
        type: 'CRITICAL' as const,
        label: specificRoomConflict,
        tag: specificRoomConflict.includes('Aforo') ? 'Aforo Insuficiente' : 'Sala Ocupada',
        bg: 'bg-rose-500/15 border-rose-400 text-rose-800 dark:text-rose-300 dark:bg-rose-950/40',
        dot: 'bg-rose-500',
      };
    }

    // Critical: No rooms exist with sufficient capacity for this section type
    if (compatRooms.length === 0) {
      return {
        type: 'CRITICAL' as const,
        label: `Sin salas ${sectionType} con aforo suficiente (${expectedStudents} alumnos)`,
        tag: 'Aforo Insuficiente',
        bg: 'bg-rose-500/15 border-rose-400 text-rose-800 dark:text-rose-300 dark:bg-rose-950/40',
        dot: 'bg-rose-500',
      };
    }

    // Warning: No specific room chosen and all compatible rooms are occupied
    if (!targetedRoomId && !targetedRoomName && compatRooms.length > 0 && freeCompatRooms.length === 0) {
      return {
        type: 'WARNING' as const,
        label: `Todas las salas ${sectionType} ocupadas (${compatRooms.length}/${compatRooms.length})`,
        tag: 'Sin Sala',
        bg: 'bg-amber-500/15 border-amber-400 text-amber-800 dark:text-amber-300 dark:bg-amber-950/40',
        dot: 'bg-amber-500',
      };
    }

    // Preferred: Teacher preference marked + Room available
    if (isTeacherPreferred) {
      const roomLabel = specificRoomFree
        ? `Sala ${targetSection.room_name || 'elegida'} libre`
        : `${freeCompatRooms.length} salas libres`;
      return {
        type: 'PREFERRED' as const,
        label: `🌟 Horario Preferido (${roomLabel})`,
        tag: 'Zona Ideal',
        bg: 'bg-emerald-500/20 border-emerald-500 text-emerald-900 dark:text-emerald-200 dark:bg-emerald-950/60 ring-2 ring-emerald-400/50',
        dot: 'bg-emerald-500',
      };
    }

    // Free & Compatible
    const roomSuccessLabel = specificRoomFree
      ? `✓ Sala ${targetSection.room_name || 'seleccionada'} libre`
      : freeCompatRooms.length > 0
      ? `✓ ${freeCompatRooms.length} salas libres`
      : '✓ Disponible';

    return {
      type: 'FREE' as const,
      label: `${roomSuccessLabel} · Sin conflicto`,
      tag: 'Disponible',
      bg: 'bg-emerald-500/10 border-emerald-300 text-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/30',
      dot: 'bg-emerald-400',
    };
  };

  const getTypeStyle = (type?: string) => {
    switch (type?.toUpperCase()) {
      case 'LAB':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 font-bold';
      case 'SIM':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 font-bold';
      case 'TAL':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 font-bold';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-bold';
    }
  };

  const getSectionBadgeStyle = (secCode?: string | number | null) => {
    const str = String(secCode || '1').toUpperCase();
    const num = parseInt(str.replace(/\D/g, ''), 10) || 1;
    if (num === 1) return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/60';
    if (num === 2) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60';
    if (num === 3) return 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60';
    return 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/60';
  };

  const formatSectionLabel = (secCode?: string | number | null, parallelIndex?: number) => {
    if (secCode) {
      const clean = String(secCode).trim();
      if (clean.toUpperCase().startsWith('S')) return clean;
      return `S${clean}`;
    }
    return `S${(parallelIndex ?? 0) + 1}`;
  };

  const getAssignmentTrackIndex = (assignment: Assignment, fallbackIndex: number, totalTracks: number): number => {
    if (assignment.section_code) {
      const match = String(assignment.section_code).match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num >= 1) return (num - 1) % totalTracks;
      }
    }
    if (assignment.parallel_index !== undefined && assignment.parallel_index !== null) {
      return Number(assignment.parallel_index) % totalTracks;
    }
    return fallbackIndex % totalTracks;
  };

  // Active days list based on timeScope
  const activeDays = timeScope === 'week' 
    ? [1, 2, 3, 4, 5] 
    : [selectedDay];

  const effectiveParallelTracks = useMemo(() => {
    if (viewMode !== 'nivel') return 1;
    return parallelTracks;
  }, [viewMode, parallelTracks]);

  // Compatible rooms for the active section
  const targetSecType = (targetSection?.type || 'TEO').toUpperCase();
  const compatibleRoomsForTarget = availableRooms.filter(r => {
    if (targetSecType === 'LAB') return r.type === 'LAB' || r.type === 'SIM';
    if (targetSecType === 'SIM') return r.type === 'SIM' || r.type === 'LAB';
    if (targetSecType === 'TAL') return r.type === 'TAL';
    return r.type === 'TEO' || r.type === 'AUD';
  });

  return (
    <div
      ref={gridScrollRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-auto custom-scrollbar bg-slate-50 dark:bg-slate-950 p-3 sm:p-5 flex flex-col gap-3 relative scroll-smooth"
    >
      {/* Top Scope & Density Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs shrink-0">
        {/* Left: Week vs Day View Mode */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setTimeScope('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                timeScope === 'week'
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-sm">calendar_view_week</span>
              <span>Vista Semanal (L-V)</span>
            </button>
            <button
              type="button"
              onClick={() => setTimeScope('day')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                timeScope === 'day'
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-sm">calendar_view_day</span>
              <span>Vista por Día</span>
            </button>
          </div>

          {/* Day Switcher when in Day View */}
          {timeScope === 'day' && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg animate-fade-in">
              {dayNames.map((dName, idx) => {
                const dayNum = idx + 1;
                return (
                  <button
                    key={dayNum}
                    type="button"
                    onClick={() => setSelectedDay(dayNum)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                      selectedDay === dayNum
                        ? 'bg-primary text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {dName}
                  </button>
                );
              })}
            </div>
          )}

          {/* Parallel Tracks Selector when in Level View */}
          {viewMode === 'nivel' && (
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl text-xs font-bold">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] hidden sm:inline">Secciones por día:</span>
              <div className="flex items-center gap-0.5 bg-white dark:bg-slate-700 p-0.5 rounded-lg shadow-xs">
                {[1, 2, 3].map(count => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setParallelTracks(count)}
                    className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                      effectiveParallelTracks === count
                        ? 'bg-primary text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-primary'
                    }`}
                  >
                    {count} {count === 1 ? 'Sección' : 'Secciones'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Jump Buttons: Mañana / Tarde */}
          <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={scrollToTop}
              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100"
              title="Saltar a los bloques de la mañana (M1 a M4)"
            >
              <span className="material-symbols-outlined text-xs">wb_sunny</span>
              <span>Mañana (M1-M4)</span>
            </button>
            <button
              type="button"
              onClick={scrollToAfternoon}
              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100"
              title="Saltar a los bloques de la tarde (T1 a T4)"
            >
              <span className="material-symbols-outlined text-xs">dark_mode</span>
              <span>Tarde (T1-T4) ↓</span>
            </button>
          </div>
        </div>

        {/* Right: Timeslots summary & Density toggle */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
            <strong className="text-slate-700 dark:text-slate-300">{sortedTimeslots.length}</strong> bloques ({sortedTimeslots[0]?.label || 'M1'} a {sortedTimeslots[sortedTimeslots.length - 1]?.label || 'T4'})
          </span>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setDensity('normal')}
              className={`p-1.5 rounded-md transition-all ${
                density === 'normal'
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Vista normal (Detallada)"
            >
              <span className="material-symbols-outlined text-base">view_agenda</span>
            </button>
            <button
              type="button"
              onClick={() => setDensity('compact')}
              className={`p-1.5 rounded-md transition-all ${
                density === 'compact'
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Vista compacta (Ver todo el día en pantalla)"
            >
              <span className="material-symbols-outlined text-base">table_rows</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Planning & Compatibility Radar Banner */}
      {targetSection && (
        <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl p-3.5 sm:p-4 shadow-xl border border-indigo-500/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-fade-in shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-xl animate-pulse">radar</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-primary text-white">
                  NRC {targetSection.nrc}
                </span>
                <span className="font-bold text-sm truncate">
                  {targetSection.subject_name || targetSection.subject_code}
                </span>
                <span className="text-xs text-indigo-300">
                  (Nivel {targetSection.level} · {targetSection.type})
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5">
                💡 <strong>Haz clic en cualquier bloque verde</strong> de la matriz para asignar o cambia de sala/docente abajo:
              </p>
            </div>
          </div>

          {/* Quick Pre-selectors in Header */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full md:w-auto">
            {/* Quick Teacher Select */}
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/15 text-xs">
              <span className="material-symbols-outlined text-sm text-indigo-300">person</span>
              <select
                value={targetSection.teacher_name || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const selT = teachers.find(t => t.nombre === val);
                  onUpdateActiveTeacher?.(targetSection.id, val, selT?.id);
                }}
                className="bg-transparent border-0 p-0 text-white text-xs font-semibold focus:ring-0 cursor-pointer max-w-[150px] truncate"
              >
                <option value="" className="text-slate-900">-- Docente --</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.nombre} className="text-slate-900">{t.nombre}</option>
                ))}
              </select>
            </div>

            {/* Quick Room Select */}
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/15 text-xs">
              <span className="material-symbols-outlined text-sm text-amber-400">meeting_room</span>
              <select
                value={targetSection.room_id || targetSection.preferred_room_id || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const selR = availableRooms.find(r => r.id === val);
                  onUpdateActiveRoom?.(targetSection.id, val, selR?.name || '');
                }}
                className="bg-transparent border-0 p-0 text-white text-xs font-semibold focus:ring-0 cursor-pointer max-w-[150px] truncate"
              >
                <option value="" className="text-slate-900">-- Sala ({targetSecType}) --</option>
                {compatibleRoomsForTarget.map(r => (
                  <option key={r.id} value={r.id} className="text-slate-900">{r.name} ({r.type})</option>
                ))}
              </select>
            </div>

            {/* Deactivate Button */}
            {activeSchedulingSection && (
              <button
                type="button"
                onClick={() => onSelectActiveSection?.(null)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
                title="Desactivar modo planificación"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid Container */}
      <div className="min-w-[800px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col mb-12">
        {/* Table Header with Days */}
        <div className={`grid ${timeScope === 'week' ? 'grid-cols-6' : 'grid-cols-4'} border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-800/90 sticky top-0 z-20 backdrop-blur-xs`}>
          <div className="p-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center border-r border-slate-200 dark:border-slate-800 flex items-center justify-center">
            Bloque Horario
          </div>
          {activeDays.map((dayOfWeek) => {
            const dayName = dayNames[dayOfWeek - 1];
            const effectiveTracks = viewMode === 'nivel' ? effectiveParallelTracks : 1;

            return (
              <div
                key={dayOfWeek}
                className={`border-r border-slate-200 dark:border-slate-800 last:border-r-0 flex flex-col ${timeScope === 'day' ? 'col-span-3' : ''}`}
              >
                <div className="p-2.5 text-center border-b border-slate-200 dark:border-slate-700/70 bg-slate-100/90 dark:bg-slate-800/90">
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">{dayName}</div>
                  <div className="text-[10px] font-semibold text-slate-400">Día {dayOfWeek} de la semana</div>
                </div>
                {effectiveTracks > 1 && (
                  <div className={`grid ${effectiveTracks === 3 ? 'grid-cols-3' : 'grid-cols-2'} divide-x divide-slate-200 dark:divide-slate-700/70 bg-slate-50/90 dark:bg-slate-850 py-1 text-center font-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wider font-mono`}>
                    {Array.from({ length: effectiveTracks }).map((_, pIdx) => (
                      <div key={pIdx} className="px-1 truncate">
                        Sección {pIdx + 1}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Timeslot Rows */}
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {sortedTimeslots.map((slot, index) => {
            const isFirstAfternoon = slot.label?.toUpperCase().startsWith('T') || index === 4;

            return (
              <div
                key={slot.id}
                ref={isFirstAfternoon ? tardeSlotRef : undefined}
                className={`grid ${timeScope === 'week' ? 'grid-cols-6' : 'grid-cols-4'} transition-all ${
                  density === 'compact' ? 'min-h-[75px]' : timeScope === 'day' ? 'min-h-[130px]' : 'min-h-[115px]'
                }`}
              >
                {/* Timeslot Label */}
                <div className={`p-2.5 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-center items-center text-center ${
                  isFirstAfternoon ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : 'bg-slate-50/50 dark:bg-slate-900/50'
                }`}>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{slot.label}</span>
                    {isFirstAfternoon && (
                      <span className="text-[9px] px-1 py-0.2 rounded font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300">
                        Tarde
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono font-semibold">
                    {slot.start_time} - {slot.end_time}
                  </span>
                </div>

                {/* Days Columns */}
                {activeDays.map((dayOfWeek) => {
                  const cellAssignments = getCellAssignments(dayOfWeek, slot.id);
                  const effectiveTracks = viewMode === 'nivel' ? effectiveParallelTracks : 1;

                  if (effectiveTracks === 1) {
                    const isTarget = dropTarget?.timeslotId === slot.id && dropTarget?.dayOfWeek === dayOfWeek;
                    const compatibility = getSlotCompatibility(dayOfWeek, slot.id);

                    return (
                      <div
                        key={dayOfWeek}
                        onDragOver={(e) => onDragOver(e, slot.id, dayOfWeek, 0)}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => onDrop(e, slot.id, dayOfWeek, 0)}
                        onClick={() => onSlotClick?.(slot.id, dayOfWeek, 0)}
                        className={`p-2 border-r border-slate-200 dark:border-slate-800 last:border-r-0 transition-all flex flex-col gap-1.5 relative cursor-pointer ${timeScope === 'day' ? 'col-span-3' : ''} ${
                          isTarget
                            ? 'bg-primary/15 ring-2 ring-primary ring-inset z-10'
                            : compatibility
                            ? compatibility.bg
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Compatibility Feasibility Indicator when Planning/Dragging */}
                        {compatibility && (
                          <div className="text-[10px] font-bold py-0.5 px-2 rounded flex items-center justify-between gap-1 border border-current/20 mb-0.5 shrink-0 backdrop-blur-xs">
                            <span className="truncate">{compatibility.label}</span>
                            <span className={`size-2 rounded-full shrink-0 ${compatibility.dot}`} />
                          </div>
                        )}

                        {/* Drag and Drop / Click Prompt */}
                        {cellAssignments.length === 0 && targetSection && (
                          <div className={`h-full w-full rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all duration-150 ${
                            isTarget
                              ? 'border-2 border-primary text-primary bg-primary/15 shadow-inner scale-[0.98] animate-drop-target'
                              : compatibility?.type === 'FREE' || compatibility?.type === 'PREFERRED'
                              ? 'border-2 border-dashed border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/15 hover:scale-[0.99] cursor-pointer'
                              : 'opacity-0'
                          }`}>
                            <span className={`material-symbols-outlined text-base mb-0.5 ${isTarget ? 'animate-bounce text-primary' : 'text-emerald-500'}`}>
                              {isTarget ? 'download' : 'add_circle'}
                            </span>
                            <span>{isTarget ? '¡Soltar aquí!' : 'Clic para asignar'}</span>
                          </div>
                        )}

                        {/* Assigned Cards */}
                        <div className={`flex flex-col gap-1.5 ${timeScope === 'day' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2' : ''}`}>
                          {cellAssignments.map((assignment) => {
                            const conflict = getAssignmentConflict(assignment.id);
                            const isRecentlyAssigned = recentlyAssignedIds.has(assignment.id);

                            return (
                              <div
                                key={assignment.id}
                                onClick={(e) => e.stopPropagation()}
                                className={`group relative p-2.5 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                                  isRecentlyAssigned
                                    ? 'animate-assign-pop animate-assign-glow ring-2 ring-primary border-primary z-20'
                                    : conflict
                                    ? conflict.type === 'CRITICAL'
                                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-l-4 border-l-rose-500 shadow-2xs'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-l-4 border-l-amber-500 shadow-2xs'
                                  : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1 mb-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                                      {assignment.subject_name || assignment.subject_code}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide border shadow-2xs flex items-center gap-0.5 ${getSectionBadgeStyle(assignment.section_code || ((assignment.parallel_index ?? 0) + 1))}`}>
                                      <span className="material-symbols-outlined text-[10px]">class</span>
                                      <span>{formatSectionLabel(assignment.section_code, assignment.parallel_index)}</span>
                                    </span>
                                    <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase border ${getTypeStyle(assignment.section_type)}`}>
                                      {assignment.section_type || 'TEO'}
                                    </span>
                                    {isRecentlyAssigned && (
                                      <span className="animate-badge-pop px-1.5 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-xs flex items-center gap-0.5">
                                        <span className="material-symbols-outlined text-[10px] animate-spin">auto_awesome</span>
                                        <span>¡Asignado!</span>
                                      </span>
                                    )}
                                  </div>

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

                                <div className="text-[10px] text-slate-600 dark:text-slate-400 flex flex-col gap-0.5 mt-0.5">
                                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span>NRC: <strong className="text-slate-800 dark:text-slate-200 font-mono">{assignment.nrc}</strong></span>
                                    <span className="px-1.5 py-0.2 rounded font-black text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                      Nivel {assignment.level || 1}
                                    </span>
                                  </div>

                                  {assignment.teacher_name && (
                                    <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 truncate font-medium text-[10px]">
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

                                {conflict && (
                                  <div className={`mt-1 pt-1 border-t text-[10px] font-bold flex items-center gap-1 ${
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
                      </div>
                    );
                  }

                  // Multi-track (2 or 3 parallel section columns per day)
                  return (
                    <div
                      key={dayOfWeek}
                      className={`grid ${effectiveTracks === 3 ? 'grid-cols-3' : 'grid-cols-2'} border-r border-slate-200 dark:border-slate-800 last:border-r-0 divide-x divide-slate-200 dark:divide-slate-800 ${timeScope === 'day' ? 'col-span-3' : ''}`}
                    >
                      {Array.from({ length: effectiveTracks }).map((_, pIdx) => {
                        const isTrackTarget = dropTarget?.timeslotId === slot.id && dropTarget?.dayOfWeek === dayOfWeek && (dropTarget?.parallelIndex ?? 0) === pIdx;
                        const compatibility = getSlotCompatibility(dayOfWeek, slot.id, pIdx);

                        const trackAssignments = cellAssignments.filter((a, idx) => {
                          const trackIdx = getAssignmentTrackIndex(a, idx, effectiveTracks);
                          return trackIdx === pIdx;
                        });

                        return (
                          <div
                            key={pIdx}
                            onDragOver={(e) => onDragOver(e, slot.id, dayOfWeek, pIdx)}
                            onDragLeave={onDragLeave}
                            onDrop={(e) => onDrop(e, slot.id, dayOfWeek, pIdx)}
                            onClick={() => onSlotClick?.(slot.id, dayOfWeek, pIdx)}
                            className={`p-1.5 transition-all flex flex-col gap-1.5 relative cursor-pointer min-h-[95px] ${
                              isTrackTarget
                                ? 'bg-primary/15 ring-2 ring-primary ring-inset z-10'
                                : compatibility
                                ? compatibility.bg
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            {/* Compatibility radar */}
                            {compatibility && (
                              <div className="text-[9px] font-bold py-0.5 px-1 rounded flex items-center justify-between gap-0.5 border border-current/20 mb-0.5 shrink-0 backdrop-blur-xs">
                                <span className="truncate">{compatibility.label}</span>
                                <span className={`size-1.5 rounded-full shrink-0 ${compatibility.dot}`} />
                              </div>
                            )}

                            {/* Drag and Drop prompt */}
                            {trackAssignments.length === 0 && targetSection && (
                              <div className={`h-full w-full rounded-xl flex flex-col items-center justify-center text-[10px] font-bold transition-all duration-150 ${
                                isTrackTarget
                                  ? 'border-2 border-primary text-primary bg-primary/15 shadow-inner scale-[0.98] animate-drop-target'
                                  : compatibility?.type === 'FREE' || compatibility?.type === 'PREFERRED'
                                  ? 'border-2 border-dashed border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/5 hover:bg-emerald-500/15 hover:scale-[0.99] cursor-pointer'
                                  : 'opacity-0'
                              }`}>
                                <span className={`material-symbols-outlined text-sm mb-0.5 ${isTrackTarget ? 'animate-bounce text-primary' : 'text-emerald-500'}`}>
                                  {isTrackTarget ? 'download' : 'add_circle'}
                                </span>
                                <span>{isTrackTarget ? '¡Soltar!' : `Sec. ${pIdx + 1}`}</span>
                              </div>
                            )}

                            {/* Assigned Cards in this track */}
                            <div className="flex flex-col gap-1.5">
                              {trackAssignments.map((assignment) => {
                                const conflict = getAssignmentConflict(assignment.id);
                                const isRecentlyAssigned = recentlyAssignedIds.has(assignment.id);

                                return (
                                  <div
                                    key={assignment.id}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`group relative p-2 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                                      isRecentlyAssigned
                                        ? 'animate-assign-pop animate-assign-glow ring-2 ring-primary border-primary z-20'
                                        : conflict
                                        ? conflict.type === 'CRITICAL'
                                        ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-l-4 border-l-rose-500 shadow-2xs'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 border-l-4 border-l-amber-500 shadow-2xs'
                                      : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-1 mb-1">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                                          {assignment.subject_name || assignment.subject_code}
                                        </span>
                                        <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-extrabold uppercase tracking-wide border shadow-2xs flex items-center gap-0.5 ${getSectionBadgeStyle(assignment.section_code || (pIdx + 1))}`}>
                                          <span className="material-symbols-outlined text-[9px]">class</span>
                                          <span>{formatSectionLabel(assignment.section_code, pIdx)}</span>
                                        </span>
                                        <span className={`px-1 py-0.2 rounded text-[8px] uppercase border ${getTypeStyle(assignment.section_type)}`}>
                                          {assignment.section_type || 'TEO'}
                                        </span>
                                        {isRecentlyAssigned && (
                                          <span className="animate-badge-pop px-1 py-0.2 rounded text-[7.5px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-xs flex items-center gap-0.5">
                                            <span className="material-symbols-outlined text-[9px] animate-spin">auto_awesome</span>
                                            <span>¡Asignado!</span>
                                          </span>
                                        )}
                                      </div>
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onEditAssignment(assignment);
                                          }}
                                          className="p-0.5 text-slate-400 hover:text-primary rounded"
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
                                          className="p-0.5 text-slate-400 hover:text-rose-500 rounded"
                                          title="Eliminar asignación"
                                        >
                                          <span className="material-symbols-outlined text-xs">delete</span>
                                        </button>
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700/60 font-mono">
                                      <span className="truncate">NRC {assignment.nrc}</span>
                                      <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                                        {assignment.room_name || 'Sin sala'}
                                      </span>
                                    </div>
                                    {assignment.teacher_name && (
                                      <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate mt-0.5 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[11px] text-primary">person</span>
                                        <span className="truncate">{assignment.teacher_name}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Jump Control Button */}
      <div className="fixed bottom-6 right-8 z-40">
        {isScrolledDown ? (
          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-white font-bold text-xs shadow-xl hover:bg-primary-dark hover:scale-105 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-sm">arrow_upward</span>
            <span>Subir al inicio (M1)</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={scrollToAfternoon}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs shadow-xl hover:opacity-90 hover:scale-105 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-sm">arrow_downward</span>
            <span>Ver bloques de la tarde (T1-T4)</span>
          </button>
        )}
      </div>
    </div>
  );
};
