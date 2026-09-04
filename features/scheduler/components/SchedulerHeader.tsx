import React, { useState, useEffect, useRef } from 'react';
import { Link } from '../../../lib/router';
import type { AcademicPeriodOption } from '../../../lib/academicPeriods';
import type { SchedulerHealth, SchedulerConflict } from '../model';

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
  onClearAll?: () => void;
  assignedCount?: number;
  onPublish: () => void;
  onOpenExport: () => void;
  onOpenAudit: () => void;
  onSaveDraft: () => void;
  saving: boolean;
  hasChanges: boolean;
  canPublish: boolean;
  metrics?: SchedulerHealth | null;
  conflicts?: SchedulerConflict[];
  onOpenConflictsPanel?: () => void;
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
  onClearAll,
  assignedCount,
  onPublish,
  onOpenExport,
  onOpenAudit,
  onSaveDraft,
  saving,
  hasChanges,
  canPublish,
  metrics,
  conflicts = [],
  onOpenConflictsPanel,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu]);

  const statusLabels = {
    draft: { label: 'Borrador', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300/80 dark:border-slate-700', icon: 'edit_note' },
    review: { label: 'En Revisión', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300/80 dark:border-amber-700', icon: 'rate_review' },
    published: { label: 'Publicado', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-700', icon: 'verified' },
  };

  const status = statusLabels[scheduleStatus] || statusLabels.draft;
  const displayLevels = availableLevels.length > 0 ? availableLevels : [1, 2, 3, 4, 5, 6];

  const healthScore = metrics?.health_score ?? 100;
  const coveragePercent = metrics?.assignment_percentage ?? 0;
  const criticalCount = conflicts.filter(c => c.type === 'CRITICAL').length;

  return (
    <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800 px-4 sm:px-6 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sticky top-0 z-30 transition-colors">
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {/* Period Selector */}
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
          <span className="material-symbols-outlined text-primary text-base">calendar_month</span>
          <select
            value={selectedPeriod}
            onChange={(e) => onSelectPeriod(e.target.value)}
            className="text-xs font-semibold bg-transparent text-slate-800 dark:text-slate-200 border-0 p-0 pr-3 focus:ring-0 cursor-pointer"
          >
            {periods.map(p => (
              <option key={p.id} value={p.id} className="bg-white dark:bg-slate-800">{p.name}</option>
            ))}
          </select>
        </div>

        {/* Status Badge */}
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${status.color}`}>
          <span className="material-symbols-outlined text-xs">{status.icon}</span>
          <span>{status.label}</span>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
          <button
            type="button"
            onClick={() => onChangeViewMode('nivel')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'nivel'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Nivel
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('sala')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'sala'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Sala
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode('docente')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'docente'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Docente
          </button>
        </div>

        {/* Secondary View Filter: Levels */}
        {viewMode === 'nivel' && (
          <div className="flex items-center gap-1 overflow-x-auto max-w-[280px] sm:max-w-none custom-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => onChangeViewLevel(0)}
              className={`px-2 h-6.5 shrink-0 rounded-md text-[11px] font-bold transition-all ${
                selectedViewLevel === 0
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Ver todos los niveles"
            >
              Todos
            </button>
            {displayLevels.map(lvl => (
              <button
                key={lvl}
                type="button"
                onClick={() => onChangeViewLevel(lvl)}
                className={`size-6.5 shrink-0 rounded-md text-[11px] font-bold transition-all ${
                  selectedViewLevel === lvl
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title={`Nivel ${lvl}`}
              >
                {lvl}
              </button>
            ))}
          </div>
        )}

        {/* Secondary View Filter: Rooms */}
        {viewMode === 'sala' && (
          <select
            value={selectedViewRoom}
            onChange={(e) => onChangeViewRoom(e.target.value)}
            className="text-xs font-semibold bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="TODAS">Todas las Salas</option>
            {availableRooms.map(r => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
        )}

        {/* Secondary View Filter: Teachers */}
        {viewMode === 'docente' && (
          <select
            value={selectedViewTeacher || ''}
            onChange={(e) => onChangeViewTeacher(e.target.value)}
            className="text-xs font-semibold bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-primary cursor-pointer max-w-[200px]"
          >
            <option value="">Seleccionar Docente...</option>
            {availableTeachers.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Right Side: Health Chip, Progress Bar & Actions */}
      <div className="flex items-center gap-2 justify-end">
        {/* Compact Integrated Health Chip */}
        {onOpenConflictsPanel && (
          <button
            type="button"
            onClick={onOpenConflictsPanel}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              healthScore >= 80
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15'
                : healthScore >= 50
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/15'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/15'
            }`}
            title="Clic para ver detalle de salud y conflictos"
          >
            <span className="size-1.5 rounded-full bg-current" />
            <span>Salud {healthScore}%</span>
            {criticalCount > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-500 text-white">
                {criticalCount}
              </span>
            )}
          </button>
        )}

        {/* Compact Progress Indicator */}
        {metrics && (
          <div className="hidden xl:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="w-14 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, coveragePercent)}%` }}
              />
            </div>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {metrics.slots_assigned}/{metrics.total_slots_required} hrs ({coveragePercent}%)
            </span>
          </div>
        )}

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />

        {/* Primary Action Button: Autollenar */}
        <button
          type="button"
          onClick={onAutoAssign}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-xs hover:shadow-sm active:scale-97 transition-all cursor-pointer"
          title="Generar propuesta automática con optimizador"
        >
          <span className="material-symbols-outlined text-sm">auto_awesome</span>
          <span>Autollenar</span>
        </button>

        {/* Contextual Action: Guardar or Publicar */}
        {hasChanges ? (
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 rounded-lg shadow-2xs transition-all active:scale-97 cursor-pointer"
            title="Guardar cambios del borrador"
          >
            <span className="material-symbols-outlined text-sm text-slate-400">save</span>
            <span>{saving ? 'Guardando...' : 'Guardar'}</span>
          </button>
        ) : scheduleStatus !== 'published' ? (
          <button
            type="button"
            onClick={onPublish}
            disabled={!canPublish}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-97 cursor-pointer"
            title={canPublish ? 'Publicar horario oficial' : 'Resuelve los conflictos antes de publicar'}
          >
            <span className="material-symbols-outlined text-sm">verified</span>
            <span>Publicar</span>
          </button>
        ) : null}

        {/* Overflow Menu ('···' Más opciones) */}
        <div className="relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Más opciones"
          >
            <span className="material-symbols-outlined text-lg">more_vert</span>
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1.5 z-50 animate-fade-in text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onOpenExport();
                }}
                className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
              >
                <span className="material-symbols-outlined text-base text-slate-400">download</span>
                <span>Exportar horario (PDF)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onOpenAudit();
                }}
                className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
              >
                <span className="material-symbols-outlined text-base text-slate-400">history</span>
                <span>Registro de auditoría</span>
              </button>
              <Link
                to="/table-select"
                onClick={() => setShowMoreMenu(false)}
                className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
              >
                <span className="material-symbols-outlined text-base text-slate-400">upload_file</span>
                <span>Importar datos</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu(false);
                  onSaveDraft();
                }}
                className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
              >
                <span className="material-symbols-outlined text-base text-slate-400">save</span>
                <span>Guardar borrador</span>
              </button>

              {onClearAll && (
                <>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onClearAll();
                    }}
                    disabled={assignedCount === 0}
                    className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-base">restart_alt</span>
                    <span>Desasignar todo</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
