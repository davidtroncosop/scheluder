import React, { useState, useMemo } from 'react';
import type { SchedulerSection as Section } from '../model';
import type { ImportedTeacher } from '../../../lib/dataStore';
import { calculateSectionDifficulty } from '../../assisted-planner/workflow';

interface SchedulerSidebarProps {
  sections: Section[];
  teachers: ImportedTeacher[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onDragStart: (e: React.DragEvent, section: Section) => void;
  onDragEnd: () => void;
  onOpenSectionModal: (section?: Section) => void;
  onTeacherSelect?: (teacherName: string) => void;
}

export const SchedulerSidebar: React.FC<SchedulerSidebarProps> = ({
  sections,
  teachers,
  collapsed,
  onToggleCollapse,
  onDragStart,
  onDragEnd,
  onOpenSectionModal,
  onTeacherSelect,
}) => {
  const [activeTab, setActiveTab] = useState<'secciones' | 'docentes'>('secciones');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<number | null>(null);
  const [filterPendingOnly, setFilterPendingOnly] = useState(false);

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
      <aside className="w-14 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 gap-4 z-20">
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

  // Filter sections
  const filteredSections = sections.filter(section => {
    const matchesSearch = 
      (section.nrc || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (section.subject_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (section.subject_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (section.teacher_name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesLevel = selectedLevelFilter === null || Number(section.level) === selectedLevelFilter;
    const isPending = (section.assigned_slots || 0) < Number(section.hours_per_week || 0);

    return matchesSearch && matchesLevel && (!filterPendingOnly || isPending);
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
    <aside className="w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full z-20 shadow-xs">
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
            Secciones ({sections.length})
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

        {/* Level Filters for Sections */}
        {activeTab === 'secciones' && (
          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              <span>Filtrar Nivel</span>
              <button
                type="button"
                onClick={() => setFilterPendingOnly(!filterPendingOnly)}
                className={`text-[10px] lowercase font-semibold transition-colors ${filterPendingOnly ? 'text-primary font-bold' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {filterPendingOnly ? 'solo pendientes ✓' : 'ver todas'}
              </button>
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
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
        {activeTab === 'secciones' ? (
          filteredSections.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <span className="material-symbols-outlined text-3xl mb-1 text-slate-300">event_busy</span>
              <p className="text-xs">No hay secciones que coincidan</p>
            </div>
          ) : (
            filteredSections.map(section => {
              const assigned = Number(section.assigned_slots || 0);
              const required = Number(section.hours_per_week || 2);
              const isCompleted = assigned >= required;

              return (
                <div
                  key={section.id}
                  draggable={!isCompleted}
                  onDragStart={(e) => onDragStart(e, section)}
                  onDragEnd={onDragEnd}
                  onClick={() => onOpenSectionModal(section)}
                  className={`p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing hover:shadow-md ${
                    isCompleted
                      ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800/60 opacity-60'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        NRC {section.nrc}
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
                    </div>
                    {getDifficultyBadge(section)}
                  </div>

                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
                    {section.subject_name || section.subject_code}
                  </p>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="truncate max-w-[140px]">
                      {section.teacher_name ? `👨‍🏫 ${section.teacher_name}` : '⚠️ Sin docente'}
                    </span>
                    <span className={`font-mono font-bold ${isCompleted ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {assigned}/{required} hrs {isCompleted ? '✓' : ''}
                    </span>
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
