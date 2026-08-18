import React, { useState } from 'react';
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
  const [filterPendingOnly, setFilterPendingOnly] = useState(true);

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

    const isPending = (section.assigned_slots || 0) < Number(section.hours_per_week || 0);
    return matchesSearch && (!filterPendingOnly || isPending);
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
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20" title="Alta dificultad de asignación">Crítico</span>;
      case 'hard':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20" title="Dificultad media-alta">Complejo</span>;
      case 'medium':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">Medio</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Fácil</span>;
    }
  };

  return (
    <aside className="w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full z-20 shadow-xs">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('secciones')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'secciones'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Secciones ({sections.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docentes')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'docentes'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Docentes ({teachers.length})
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Colapsar panel"
        >
          <span className="material-symbols-outlined text-lg">chevron_left</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-400 text-sm">search</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={activeTab === 'secciones' ? 'Buscar por NRC, ramo, docente...' : 'Buscar docente...'}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 rounded-lg border-0 focus:ring-2 focus:ring-primary text-slate-800 dark:text-slate-200"
          />
        </div>

        {activeTab === 'secciones' && (
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={filterPendingOnly}
                onChange={(e) => setFilterPendingOnly(e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary size-3.5"
              />
              <span>Sólo pendientes</span>
            </label>

            <button
              type="button"
              onClick={() => onOpenSectionModal()}
              className="text-xs text-primary font-bold hover:underline flex items-center gap-0.5"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span>Nueva</span>
            </button>
          </div>
        )}
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {activeTab === 'secciones' && (
          <>
            {filteredSections.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <span className="material-symbols-outlined text-2xl mb-1 text-slate-300 dark:text-slate-600 block">inbox</span>
                No se encontraron secciones
              </div>
            ) : (
              filteredSections.map(section => {
                const assigned = section.assigned_slots || 0;
                const required = Number(section.hours_per_week || 0);
                const isComplete = assigned >= required && required > 0;

                return (
                  <div
                    key={section.id}
                    draggable={!isComplete}
                    onDragStart={(e) => onDragStart(e, section)}
                    onDragEnd={onDragEnd}
                    className={`p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none ${
                      isComplete
                        ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          NRC {section.nrc}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {section.type || 'TEO'}
                        </span>
                        {getDifficultyBadge(section)}
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenSectionModal(section)}
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5"
                        title="Editar sección"
                      >
                        <span className="material-symbols-outlined text-xs">edit</span>
                      </button>
                    </div>

                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-1 mb-1.5">
                      {section.subject_name || section.subject_code}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                      <span className="truncate max-w-[150px]">
                        {section.teacher_name ? `👨‍🏫 ${section.teacher_name}` : '⚠️ Sin docente'}
                      </span>
                      <span>Nivel {section.level || 1}</span>
                    </div>

                    {/* Hours Progress */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                        <span>Horas asignadas</span>
                        <span>{assigned} / {required} hrs</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isComplete ? 'bg-emerald-500' : 'bg-primary'
                          }`}
                          style={{ width: `${required > 0 ? (assigned / required) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {activeTab === 'docentes' && (
          <>
            {filteredTeachers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <span className="material-symbols-outlined text-2xl mb-1 text-slate-300 block">group_off</span>
                No se encontraron docentes
              </div>
            ) : (
              filteredTeachers.map(teacher => (
                <div
                  key={teacher.id || teacher.nombre}
                  onClick={() => onTeacherSelect?.(teacher.nombre)}
                  className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-primary/50 transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      {teacher.nombre}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      {teacher.tipo_contrato || 'Honorarios'}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between mt-1">
                    <span>{teacher.email || 'Sin correo registrado'}</span>
                    <span>Máx: {teacher.max_horas || 20} hrs</span>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </aside>
  );
};
