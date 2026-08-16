import { useEffect, useState } from 'react';
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

export const preferredPeriodId = (periods: AcademicPeriodOption[]) => (
  periods.find(period => Boolean(period.is_active))?.id || periods[0]?.id || ''
);

/** Loads the server-selected academic period for every authenticated screen. */
export const useAcademicPeriods = () => {
  const [periods, setPeriods] = useState<AcademicPeriodOption[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');

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
        setSelectedPeriod(preferredPeriodId(normalized));
      })
      .catch(() => {
        if (!mounted || !OFFLINE_DEMO_ENABLED) return;
        setPeriods(LOCAL_PERIODS);
        setSelectedPeriod(preferredPeriodId(LOCAL_PERIODS));
      });
    return () => { mounted = false; };
  }, []);

  return { periods, selectedPeriod, setSelectedPeriod };
};
