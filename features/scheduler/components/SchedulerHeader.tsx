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

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        {/* Period Selector */}
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-400 text-lg">calendar_today</span>
          <select
            value={selectedPeriod}
            onChange={(e) => onSelectPeriod(e.target.value)}
            className="text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg px-3 py-1.5 border-0 focus:ring-2 focus:ring-primary cursor-pointer"
          >
            {periods.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Status Badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
          <span className="material-symbols-outlined text-sm">{status.icon}</span>
          <span>{status.label}</span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => onChangeViewMode('nivel')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              viewMode === 'nivel'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Por Nivel
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('sala')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              viewMode === 'sala'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Por Sala
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('docente')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              viewMode === 'docente'
                ? 'bg-white dark:bg-slate-700 text-primary shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Por Docente
          </button>
        </div>

        {/* Secondary View Filter */}
        {viewMode === 'nivel' && (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(lvl => (
              <button
                key={lvl}
                type="button"
                onClick={() => onChangeViewLevel(lvl)}
                className={`size-7 rounded-md text-xs font-bold transition-all ${
                  selectedViewLevel === lvl
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {lvl}°
              </button>
            ))}
          </div>
        )}

        {viewMode === 'sala' && (
          <select
            value={selectedViewRoom}
            onChange={(e) => onChangeViewRoom(e.target.value)}
            className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-md px-2 py-1.5 border-0 focus:ring-2 focus:ring-primary"
          >
            {availableRooms.map(r => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
        )}

        {viewMode === 'docente' && (
          <select
            value={selectedViewTeacher || ''}
            onChange={(e) => onChangeViewTeacher(e.target.value)}
            className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-md px-2 py-1.5 border-0 focus:ring-2 focus:ring-primary"
          >
            <option value="">Seleccionar docente...</option>
            {availableTeachers.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAutoAssign}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
          title="Generar propuesta automática con optimizador"
        >
          <span className="material-symbols-outlined text-sm">auto_awesome</span>
          <span>Autollenar</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-sm">download</span>
          <span>Exportar</span>
        </button>

        <button
          type="button"
          onClick={onOpenAudit}
          className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          title="Historial de cambios"
        >
          <span className="material-symbols-outlined text-lg">history</span>
        </button>

        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
            canPublish
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined text-sm">publish</span>
          <span>Publicar</span>
        </button>

        {hasChanges && (
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary text-white rounded-lg hover:bg-primary/90 transition-all shadow-xs animate-pulse"
          >
            <span className="material-symbols-outlined text-sm">{saving ? 'sync' : 'save'}</span>
            <span>{saving ? 'Guardando...' : 'Guardar'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
