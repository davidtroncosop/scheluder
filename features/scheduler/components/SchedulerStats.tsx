import React from 'react';
import type { SchedulerHealth as HealthMetrics, SchedulerConflict as Conflict } from '../model';

interface SchedulerStatsProps {
  metrics: HealthMetrics | null;
  conflicts: Conflict[];
  onOpenConflictsPanel: () => void;
}

export const SchedulerStats: React.FC<SchedulerStatsProps> = ({
  metrics,
  conflicts,
  onOpenConflictsPanel,
}) => {
  const criticalCount = conflicts.filter(c => c.type === 'CRITICAL').length;
  const warningCount = conflicts.filter(c => c.type === 'WARNING').length;
  const healthScore = metrics?.health_score ?? 100;
  const coveragePercent = metrics?.assignment_percentage ?? 0;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 50) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
  };

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
      <div className="flex flex-wrap items-center gap-6">
        {/* Coverage Progress */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-500 dark:text-slate-400">Progreso:</span>
          <div className="w-32 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, coveragePercent)}%` }}
            />
          </div>
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {metrics?.slots_assigned || 0} / {metrics?.total_slots_required || 0} hrs ({coveragePercent}%)
          </span>
        </div>

        {/* Global Health Score */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-500 dark:text-slate-400">Salud del Horario:</span>
          <span className={`px-2 py-0.5 rounded-full font-bold border ${getScoreColor(healthScore)}`}>
            {healthScore}%
          </span>
        </div>
      </div>

      {/* Conflicts Pills */}
      <div className="flex items-center gap-2">
        {criticalCount > 0 && (
          <button
            type="button"
            onClick={onOpenConflictsPanel}
            className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-full font-semibold hover:bg-rose-500/20 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm animate-pulse">error</span>
            <span>{criticalCount} {criticalCount === 1 ? 'Conflicto crítico' : 'Conflictos críticos'}</span>
          </button>
        )}

        {warningCount > 0 && (
          <button
            type="button"
            onClick={onOpenConflictsPanel}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full font-semibold hover:bg-amber-500/20 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">warning</span>
            <span>{warningCount} {warningCount === 1 ? 'Advertencia' : 'Advertencias'}</span>
          </button>
        )}

        {criticalCount === 0 && warningCount === 0 && (
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>Sin conflictos detectados</span>
          </div>
        )}
      </div>
    </div>
  );
};
