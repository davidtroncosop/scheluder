import React, { useMemo } from 'react';
import {
  type SchedulerHealth as HealthMetrics,
  type SchedulerConflict as Conflict,
  type SchedulerAssignment,
  calculateSectionVentanas,
} from '../model';

interface SchedulerStatsProps {
  metrics: HealthMetrics | null;
  conflicts: Conflict[];
  assignments?: SchedulerAssignment[];
  onOpenConflictsPanel: () => void;
}

export const SchedulerStats: React.FC<SchedulerStatsProps> = ({
  metrics,
  conflicts,
  assignments = [],
  onOpenConflictsPanel,
}) => {
  const criticalCount = conflicts.filter(c => c.type === 'CRITICAL').length;
  const warningCount = conflicts.filter(c => c.type === 'WARNING').length;
  const healthScore = metrics?.health_score ?? 100;
  const coveragePercent = metrics?.assignment_percentage ?? 0;

  const sectionVentanas = useMemo(() => calculateSectionVentanas(assignments), [assignments]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-xs';
    if (score >= 50) return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-xs';
    return 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30 shadow-xs';
  };

  return (
    <div className="border-b border-slate-200/70 dark:border-white/5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs transition-colors">
      <div className="flex flex-wrap items-center gap-6">
        {/* Coverage Progress */}
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-500 dark:text-slate-400">Progreso Planificación:</span>
          <div className="w-36 bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-200/60 dark:border-slate-700/60">
            <div
              className="bg-gradient-to-r from-primary to-indigo-500 h-full rounded-full transition-all duration-500 shadow-xs"
              style={{ width: `${Math.min(100, coveragePercent)}%` }}
            />
          </div>
          <span className="font-extrabold text-slate-800 dark:text-slate-200">
            {metrics?.slots_assigned || 0} / {metrics?.total_slots_required || 0} hrs <span className="text-primary">({coveragePercent}%)</span>
          </span>
        </div>

        {/* Global Health Score */}
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500 dark:text-slate-400">Salud del Horario:</span>
          <span className={`px-2.5 py-0.5 rounded-full font-black border ${getScoreColor(healthScore)}`}>
            {healthScore}%
          </span>
        </div>

        {/* Section Compactness / Ventanas Metric */}
        {assignments.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500 dark:text-slate-400">Ventanas por Sección:</span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-black border flex items-center gap-1 ${
                sectionVentanas.total_ventanas === 0
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                  : sectionVentanas.total_ventanas <= 2
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30'
                  : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30'
              }`}
              title={`${sectionVentanas.total_ventanas} módulo(s) libre(s) detectado(s) entre clases de la misma sección`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {sectionVentanas.total_ventanas === 0 ? 'space_dashboard' : 'view_week'}
              </span>
              <span>
                {sectionVentanas.total_ventanas === 0
                  ? '0 ventanas (100% compacto)'
                  : `${sectionVentanas.total_ventanas} ventana(s) (${sectionVentanas.compactness_percentage}% compacto)`}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Conflicts Pills */}
      <div className="flex items-center gap-2">
        {criticalCount > 0 && (
          <button
            type="button"
            onClick={onOpenConflictsPanel}
            className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-full font-bold hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px] animate-pulse text-rose-500">error</span>
            <span>{criticalCount} {criticalCount === 1 ? 'Conflicto crítico' : 'Conflictos críticos'}</span>
          </button>
        )}

        {warningCount > 0 && (
          <button
            type="button"
            onClick={onOpenConflictsPanel}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full font-bold hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px] text-amber-500">warning</span>
            <span>{warningCount} {warningCount === 1 ? 'Advertencia' : 'Advertencias'}</span>
          </button>
        )}

        {criticalCount === 0 && warningCount === 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full font-bold text-xs shadow-xs">
            <span className="material-symbols-outlined text-[16px] text-emerald-500">verified</span>
            <span>Sin conflictos detectados</span>
          </div>
        )}
      </div>
    </div>
  );
};
