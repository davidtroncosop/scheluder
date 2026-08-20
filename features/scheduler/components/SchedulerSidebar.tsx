import React, { useState, useMemo } from 'react';
import type { SchedulerSection as Section } from '../model';
import type { ImportedTeacher } from '../../../lib/dataStore';
import { calculateSectionDifficulty } from '../../assisted-planner/workflow';

interface SchedulerSidebarProps {
  sections: Section[];
  teachers: ImportedTeacher[];
  availableRooms?: Array<{ id: string; name: string; type: string; capacity: number }>;
  activeSectionId?: string | null;
  onSelectSectionForScheduling?: (section: Section | null) => void;
  onUpdateSectionTeacher?: (sectionId: string, teacherName: string, teacherId?: string) => void;
  onUpdateSectionRoom?: (sectionId: string, roomId: string, roomName: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDragStart: (e: React.DragEvent, section: Section) => void;
  onDragEnd: () => void;
  onOpenSectionModal: (section?: Section | null, preselectedLevel?: number) => void;
  onDuplicateSection?: (section: Section) => void;
  onTeacherSelect?: (teacherName: string) => void;
}

export const SchedulerSidebar: React.FC<SchedulerSidebarProps> = ({
  sections,
  teachers,
  availableRooms = [],
  activeSectionId = null,
  onSelectSectionForScheduling,
  onUpdateSectionTeacher,
  onUpdateSectionRoom,
  collapsed,
  onToggleCollapse,
  onDragStart,
  onDragEnd,
  onOpenSectionModal,
  onDuplicateSection,
  onTeacherSelect,
}) => {
  const [activeTab, setActiveTab] = useState<'secciones' | 'docentes'>('secciones');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'completed'>('pending');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<number | null>(null);

  // Available levels from sections
  const availableLevels = useMemo(() => {
    const levels = new Set<number>();
    sections.forEach(s => {
      if (s.level) levels.add(Number(s.level));
    });
    return Array.from(levels).sort((a, b) => a - b);
  }, [sections]);

  if (collapsed) {
    return (
      <aside className="w-14 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 gap-4 z-20 shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          title="Expandir panel lateral"
        >
          <span className="material-symbols-outlined text-lg">chevron_right</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onToggleCollapse();
            setActiveTab('secciones');
          }}
          className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
          title="Ver secciones"
        >
          <span className="material-symbols-outlined text-lg">view_list</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onToggleCollapse();
            setActiveTab('docentes');
          }}
          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          title="Ver docentes"
        >
          <span className="material-symbols-outlined text-lg">groups</span>
        </button>
      </aside>
    );
  }

  const pendingCount = useMemo(() => sections.filter(s => (s.assigned_slots || 0) < Number(s.hours_per_week || 0)).length, [sections]);
  const completedCount = sections.length - pendingCount;

  // Filter sections
  const filteredSections = sections.filter(section => {
    const matchesSearch = 
      (section.nrc || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (section.subject_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (section.subject_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (section.teacher_name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesLevel = selectedLevelFilter === null || Number(section.level) === selectedLevelFilter;
    const isCompleted = (section.assigned_slots || 0) >= Number(section.hours_per_week || 0);

    let matchesStatus = true;
    if (statusFilter === 'pending') matchesStatus = !isCompleted;
    if (statusFilter === 'completed') matchesStatus = isCompleted;

    return matchesSearch && matchesLevel && matchesStatus;
  });

  // Filter teachers
  const filteredTeachers = teachers.filter(t => 
    (t.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDifficultyBadge = (section: Section) => {
    const diff = calculateSectionDifficulty({
      type: section.type,
      hours_per_week: section.hours_per_week,
      teacher_id: section.teacher_name ? 'assigned' : null,
      parent_section_id: section.parent_section_id,
    });

    switch (diff.level) {
      case 'critical':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20" title="Alta dificultad de asignación">Crítico</span>;
      case 'hard':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20" title="Dificultad media-alta">Complejo</span>;
      case 'medium':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">Medio</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Fácil</span>;
    }
  };

  return (
    <aside className="w-84 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full z-20 shadow-xs shrink-0">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('secciones')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
              activeTab === 'secciones'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Backlog ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docentes')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
              activeTab === 'docentes'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Docentes ({teachers.length})
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenSectionModal()}
            className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="Crear nueva sección"
          >
            <span className="material-symbols-outlined text-lg">add</span>
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
            title="Colapsar barra lateral"
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
        </div>
      </div>

      {/* Search & Level Filters */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
          <input
            type="text"
            placeholder={activeTab === 'secciones' ? "Buscar por NRC, ramo o profesor..." : "Buscar profesor..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 rounded-lg border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
          />
        </div>

        {/* Status Sub-Tabs: Todas, Pendientes, Completadas */}
        {activeTab === 'secciones' && (
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`flex-1 py-1 text-center rounded-md transition-all ${
                statusFilter === 'pending'
                  ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pendientes ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('completed')}
              className={`flex-1 py-1 text-center rounded-md transition-all ${
                statusFilter === 'completed'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Listas ({completedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`flex-1 py-1 text-center rounded-md transition-all ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todas ({sections.length})
            </button>
          </div>
        )}

        {/* Level Filters for Sections */}
        {activeTab === 'secciones' && (
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              <span>Nivel Académico</span>
              {selectedLevelFilter && (
                <button
                  type="button"
                  onClick={() => onOpenSectionModal(null, selectedLevelFilter)}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5 font-bold cursor-pointer"
                  title={`Crear una nueva sección para Nivel ${selectedLevelFilter}`}
                >
                  <span className="material-symbols-outlined text-xs">add_circle</span>
                  <span>+ Sección N{selectedLevelFilter}</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1">
              <button
                type="button"
                onClick={() => setSelectedLevelFilter(null)}
                className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all shrink-0 ${
                  selectedLevelFilter === null
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
                }`}
              >
                Todos
              </button>
              {availableLevels.map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevelFilter(lvl)}
                  className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all shrink-0 ${
                    selectedLevelFilter === lvl
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  Nivel {lvl}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
        {activeTab === 'secciones' ? (
          filteredSections.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-400 flex flex-col items-center">
              {statusFilter === 'pending' ? (
                <>
                  <span className="material-symbols-outlined text-4xl mb-2 text-emerald-500">task_alt</span>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">¡Backlog vacío!</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-[200px] leading-relaxed">
                    Todas las secciones requeridas ya están asignadas en la matriz.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                  >
                    Ver todas ({sections.length})
                  </button>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-3xl mb-1 text-slate-300">event_busy</span>
                  <p className="text-xs">No hay secciones que coincidan</p>
                </>
              )}
            </div>
          ) : (
            filteredSections.map(section => {
              const assigned = Number(section.assigned_slots || 0);
              const required = Number(section.hours_per_week || 2);
              const isCompleted = assigned >= required;
              const isActive = activeSectionId === section.id;

              // Filter compatible rooms strictly by capacity and certified type
              const secType = (section.type || 'TEO').toUpperCase();
              const expectedStudents = Number(section.expected_students || 0);
              const compatibleRooms = availableRooms.filter(r => {
                if (expectedStudents > 0 && r.capacity < expectedStudents) return false;
                if (secType === 'SIM') return r.type === 'SIM';
                if (secType === 'LAB') return r.type === 'LAB' || r.type === 'SIM';
                if (secType === 'TAL') return r.type === 'TAL';
                return r.type === 'TEO' || r.type === 'AUD';
              });

              const hasNoCompatibleRoom = compatibleRooms.length === 0 && expectedStudents > 0;

              return (
                <div
                  key={section.id}
                  draggable={!isCompleted && !hasNoCompatibleRoom}
                  onDragStart={(e) => onDragStart(e, section)}
                  onDragEnd={onDragEnd}
                  className={`p-3 rounded-xl border transition-all ${
                    hasNoCompatibleRoom
                      ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/40 dark:bg-rose-950/20'
                      : 'cursor-grab active:cursor-grabbing hover:shadow-md'
                  } flex flex-col gap-2.5 ${
                    isActive
                      ? 'bg-primary/5 dark:bg-primary/10 border-primary ring-2 ring-primary/40 shadow-md'
                      : isCompleted
                      ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800/60 opacity-75'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary/50'
                  }`}
                >
                  {/* Top Header: NRC, Level, Type & Status */}
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        NRC {section.nrc}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        {section.section_code ? (section.section_code.startsWith('SEC') ? section.section_code : `Sec ${section.section_code}`) : 'Sec 1'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        N{section.level}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        section.type === 'TEO' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                        section.type === 'LAB' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                        'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                      }`}>
                        {section.type}
                      </span>
                      {expectedStudents > 0 && (
                        <span className="text-[10px] font-mono text-slate-500 font-semibold">
                          ({expectedStudents} cupos)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5">
                      {getDifficultyBadge(section)}
                      {onDuplicateSection && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateSection(section);
                          }}
                          className="p-1 text-slate-400 hover:text-primary rounded transition-colors"
                          title="Crear sección paralela (ej. Sección 2) de esta asignatura"
                        >
                          <span className="material-symbols-outlined text-xs">content_copy</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSectionModal(section);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                        title="Configuración avanzada de la sección"
                      >
                        <span className="material-symbols-outlined text-xs">settings</span>
                      </button>
                    </div>
                  </div>

                  {/* Subject Name */}
                  <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {section.subject_name || section.subject_code}
                  </p>

                  {/* Insufficient Infrastructure Warning Tag */}
                  {hasNoCompatibleRoom && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40 p-1.5 rounded-lg border border-rose-300 dark:border-rose-800">
                      <span className="material-symbols-outlined text-sm shrink-0 text-rose-600">warning</span>
                      <span>Sin salas {secType} con aforo ≥ {expectedStudents}</span>
                    </div>
                  )}

                  {/* Pre-configuration Selectors: Docente & Sala */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                    {/* Docente Selector */}
                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700/70">
                      <span className="material-symbols-outlined text-xs text-primary shrink-0">person</span>
                      <select
                        value={section.teacher_name || ''}
                        onChange={(e) => {
                          e.stopPropagation();
                          const val = e.target.value;
                          const selTeacher = teachers.find(t => t.nombre === val);
                          onUpdateSectionTeacher?.(section.id, val, selTeacher?.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-[11px] font-medium bg-transparent border-0 p-0 text-slate-800 dark:text-slate-200 focus:ring-0 cursor-pointer truncate"
                      >
                        <option value="">-- Sin docente asignado --</option>
                        {teachers.map(t => (
                          <option key={t.id} value={t.nombre} className="text-slate-900 dark:text-slate-100">
                            {t.nombre} ({t.tipo_contrato})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Sala Selector - Only showing rooms that can fit expected students */}
                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700/70">
                      <span className="material-symbols-outlined text-xs text-amber-500 shrink-0">meeting_room</span>
                      <select
                        disabled={hasNoCompatibleRoom}
                        value={section.room_id || section.preferred_room_id || ''}
                        onChange={(e) => {
                          e.stopPropagation();
                          const val = e.target.value;
                          const selRoom = availableRooms.find(r => r.id === val);
                          onUpdateSectionRoom?.(section.id, val, selRoom?.name || '');
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-[11px] font-medium bg-transparent border-0 p-0 text-slate-800 dark:text-slate-200 focus:ring-0 cursor-pointer truncate disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {hasNoCompatibleRoom ? (
                          <option value="">-- Sin salas con aforo ≥ {expectedStudents} cupos --</option>
                        ) : (
                          <>
                            <option value="">-- Cualquier sala compatible ({secType} · ≥{expectedStudents} cupos) --</option>
                            {compatibleRooms.map(r => (
                              <option key={r.id} value={r.id} className="text-slate-900 dark:text-slate-100">
                                {r.name} ({r.type} · Cap. {r.capacity})
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Hours & Schedule Trigger Button */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                    <span className={`text-[11px] font-mono font-bold ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {assigned}/{required} hrs {isCompleted ? '✓' : ''}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSectionForScheduling?.(isActive ? null : section);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shrink-0 ${
                        isActive
                          ? 'bg-primary text-white shadow-xs'
                          : 'bg-primary/10 hover:bg-primary text-primary hover:text-white'
                      }`}
                    >
                      <span className="material-symbols-outlined text-xs">
                        {isActive ? 'check_circle' : 'radar'}
                      </span>
                      <span>{isActive ? 'Planificando' : 'Ver en Matriz'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )
        ) : (
          filteredTeachers.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <span className="material-symbols-outlined text-3xl mb-1 text-slate-300">person_off</span>
              <p className="text-xs">No hay docentes encontrados</p>
            </div>
          ) : (
            filteredTeachers.map(teacher => (
              <div
                key={teacher.id}
                onClick={() => onTeacherSelect?.(teacher.nombre)}
                className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary transition-all cursor-pointer"
              >
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  {teacher.nombre}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {teacher.tipo_contrato} · Máx {teacher.max_horas} hrs/semana
                </p>
              </div>
            ))
          )
        )}
      </div>
    </aside>
  );
};
