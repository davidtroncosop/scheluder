import React from 'react';
import type { AcademicPeriodOption } from '../../../lib/academicPeriods';

interface SchedulerHeaderProps {
  periods: AcademicPeriodOption[];
  selectedPeriod: string;
  onSelectPeriod: (periodId: string) => void;
  scheduleStatus: 'draft' | 'review' | 'published';
  viewMode: 'nivel' | 'sala' | 'docente';
  onChangeViewMode: (mode: 'nivel' | 'sala' | 'docente') => void;
  selectedViewLevel: number;
  onChangeViewLevel: (level: number) => void;
  availableLevels?: number[];
  onAddSectionForLevel?: (level: number) => void;
  selectedViewRoom: string;
  onChangeViewRoom: (room: string) => void;
  availableRooms: Array<{ id: string; name: string }>;
  selectedViewTeacher: string | null;
  onChangeViewTeacher: (teacher: string) => void;
  availableTeachers: string[];
  onAutoAssign: () => void;
  onPublish: () => void;
  onOpenExport: () => void;
  onOpenAudit: () => void;
  onSaveDraft: () => void;
  saving: boolean;
  hasChanges: boolean;
  canPublish: boolean;
}

export const SchedulerHeader: React.FC<SchedulerHeaderProps> = ({
  periods,
  selectedPeriod,
  onSelectPeriod,
  scheduleStatus,
  viewMode,
  onChangeViewMode,
  selectedViewLevel,
  onChangeViewLevel,
  availableLevels = [1, 2, 3, 4, 5, 6, 7, 8],
  onAddSectionForLevel,
  selectedViewRoom,
  onChangeViewRoom,
  availableRooms,
  selectedViewTeacher,
  onChangeViewTeacher,
  availableTeachers,
  onAutoAssign,
  onPublish,
  onOpenExport,
  onOpenAudit,
  onSaveDraft,
  saving,
  hasChanges,
  canPublish,
}) => {
  const statusLabels = {
    draft: { label: 'Borrador', color: 'bg-slate-500 text-white', icon: 'edit_note' },
    review: { label: 'En Revisión', color: 'bg-amber-500 text-white', icon: 'rate_review' },
    published: { label: 'Publicado', color: 'bg-emerald-500 text-white', icon: 'check_circle' },
  };

  const status = statusLabels[scheduleStatus] || statusLabels.draft;

  const displayLevels = availableLevels.length > 0 ? availableLevels : [1, 2, 3, 4, 5, 6];

  return (
    <header className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/5 px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 sticky top-0 z-30 shadow-xs transition-colors">
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        {/* Period Selector */}
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
          <span className="material-symbols-outlined text-primary text-[17px]">calendar_month</span>
          <select
            value={selectedPeriod}
            onChange={(e) => onSelectPeriod(e.target.value)}
            className="text-xs font-bold bg-transparent text-slate-800 dark:text-slate-200 border-0 p-0 pr-4 focus:ring-0 cursor-pointer"
          >
            {periods.map(p => (
              <option key={p.id} value={p.id} className="bg-white dark:bg-slate-800">{p.name}</option>
            ))}
          </select>
        </div>

        {/* Status Badge */}
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${status.color} shadow-xs`}>
          <span className="material-symbols-outlined text-[15px]">{status.icon}</span>
          <span>{status.label}</span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
          <button
            type="button"
            onClick={() => onChangeViewMode('nivel')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              viewMode === 'nivel'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Por Nivel
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('sala')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              viewMode === 'sala'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Por Sala
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('docente')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              viewMode === 'docente'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Por Docente
          </button>
        </div>

        {/* Secondary View Filter: Levels */}
        {viewMode === 'nivel' && (
          <div className="flex items-center gap-1 overflow-x-auto max-w-[280px] sm:max-w-none custom-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => onChangeViewLevel(0)}
              className={`px-2.5 h-7 shrink-0 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                selectedViewLevel === 0
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Ver asignaciones de todos los niveles en simultáneo"
            >
              Todos
            </button>
            {displayLevels.map(lvl => (
              <button
                key={lvl}
                type="button"
                onClick={() => onChangeViewLevel(lvl)}
                className={`size-7 shrink-0 rounded-lg text-xs font-black transition-all ${
                  selectedViewLevel === lvl
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title={`Ver asignaciones de Nivel ${lvl}`}
              >
                {lvl}°
              </button>
            ))}

            {/* Quick Add Section for this Level */}
            {selectedViewLevel > 0 && onAddSectionForLevel && (
              <button
                type="button"
                onClick={() => onAddSectionForLevel(selectedViewLevel)}
                className="flex items-center gap-1 px-2.5 h-7 shrink-0 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/30 transition-all shadow-xs ml-1"
                title={`Agregar una nueva sección o paralelo al Nivel ${selectedViewLevel}`}
              >
                <span className="material-symbols-outlined text-[15px]">add_circle</span>
                <span>+ Sección N{selectedViewLevel}</span>
              </button>
            )}
          </div>
        )}

        {viewMode === 'sala' && (
          <select
            value={selectedViewRoom}
            onChange={(e) => onChangeViewRoom(e.target.value)}
            className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-1.5 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary font-bold cursor-pointer"
          >
            <option value="TODAS">Todas las salas</option>
            {availableRooms.map(r => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
        )}

        {viewMode === 'docente' && (
          <select
            value={selectedViewTeacher || ''}
            onChange={(e) => onChangeViewTeacher(e.target.value)}
            className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-1.5 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary font-bold cursor-pointer"
          >
            <option value="">Todos los docentes</option>
            {availableTeachers.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onAutoAssign}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-dark hover:to-indigo-700 rounded-xl shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-95 transition-all"
          title="Generar propuesta automática con optimizador"
        >
          <span className="material-symbols-outlined text-[16px] text-amber-300">auto_awesome</span>
          <span>Autollenar</span>
        </button>

        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving || !hasChanges}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 rounded-xl shadow-xs transition-all disabled:opacity-50 active:scale-95"
          title="Guardar estado actual del borrador"
        >
          <span className="material-symbols-outlined text-[16px] text-slate-400">save</span>
          <span>{saving ? 'Guardando...' : 'Guardar'}</span>
        </button>

        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all disabled:opacity-50 disabled:bg-slate-400 active:scale-95"
          title={canPublish ? 'Publicar horario oficial' : 'Resuelve los conflictos críticos antes de publicar'}
        >
          <span className="material-symbols-outlined text-[16px]">verified</span>
          <span>Publicar</span>
        </button>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

        <button
          type="button"
          onClick={onOpenExport}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
          title="Exportar horario (PDF / Excel / iCal)"
        >
          <span className="material-symbols-outlined text-[19px]">download</span>
        </button>

        <button
          type="button"
          onClick={onOpenAudit}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
          title="Historial de cambios y auditoría"
        >
          <span className="material-symbols-outlined text-[19px]">history</span>
        </button>
      </div>
    </header>
  );
};
