import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { OFFLINE_DEMO_ENABLED } from './runtime';

export interface AcademicPeriodOption {
  id: string;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number | boolean;
  status: 'active' | 'draft' | 'published';
}

const LOCAL_PERIODS: AcademicPeriodOption[] = [
  { id: 'per-2026-1', code: '2026-1', name: 'Primer Semestre 2026', start_date: '2026-03-01', end_date: '2026-07-15', is_active: 1, status: 'active' },
  { id: 'per-2026-2', code: '2026-2', name: 'Segundo Semestre 2026', start_date: '2026-08-01', end_date: '2026-12-15', is_active: 0, status: 'draft' },
];

export const preferredPeriodId = (periods: AcademicPeriodOption[]) => {
  const saved = typeof window !== 'undefined' ? localStorage.getItem('scheduler_selected_period') : null;
  if (saved && periods.some(p => p.id === saved)) {
    return saved;
  }
  return periods.find(period => Boolean(period.is_active))?.id || periods[0]?.id || '';
};

/** Loads the server-selected academic period for every authenticated screen. */
export const useAcademicPeriods = () => {
  const [periods, setPeriods] = useState<AcademicPeriodOption[]>([]);
  const [selectedPeriod, setSelectedPeriodState] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('scheduler_selected_period') || 'per-2026-1' : 'per-2026-1';
  });

  const setSelectedPeriod = useCallback((periodId: string) => {
    setSelectedPeriodState(periodId);
    try {
      localStorage.setItem('scheduler_selected_period', periodId);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    api.getPeriods()
      .then(remotePeriods => {
        if (!mounted) return;
        const normalized = remotePeriods.map(period => ({
          ...period,
          status: Boolean(period.is_active) ? 'active' as const : 'draft' as const,
        }));
        setPeriods(normalized);
        const best = preferredPeriodId(normalized);
        if (best) {
          setSelectedPeriodState(best);
          try { localStorage.setItem('scheduler_selected_period', best); } catch {}
        }
      })
      .catch(() => {
        if (!mounted || !OFFLINE_DEMO_ENABLED) return;
        setPeriods(LOCAL_PERIODS);
        const best = preferredPeriodId(LOCAL_PERIODS);
        setSelectedPeriodState(best);
      });
    return () => { mounted = false; };
  }, []);

  return { periods, selectedPeriod, setSelectedPeriod };
};
