import React, { useState, useEffect } from 'react';
import * as dataStore from '../lib/dataStore';
import api from '../services/api';

interface PeriodSelectorProps {
    selectedPeriod: string;
    onPeriodChange: (period: string) => void;
    className?: string;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
    selectedPeriod,
    onPeriodChange,
    className = ''
}) => {
    const [periodsList, setPeriodsList] = useState<dataStore.LocalPeriod[]>([]);

    useEffect(() => {
        // The API provisions the current planning period automatically and
        // returns it first as the active/default option.
        api.getPeriods()
            .then(remote => setPeriodsList(remote.map(period => ({
                id: period.id,
                name: period.name,
                status: period.is_active ? 'Activo' : 'Borrador',
                startDate: period.start_date,
                endDate: period.end_date,
            }))))
            .catch(() => setPeriodsList(dataStore.getCustomPeriods()));
    }, [selectedPeriod]); // reload when period changes to sync changes made elsewhere

    return (
        <div className={`relative flex items-center ${className}`}>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 shadow-xs backdrop-blur-md transition-all hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-800/90 dark:hover:border-slate-600">
                <span className="material-symbols-outlined text-primary text-[18px]">calendar_month</span>
                <select
                    value={selectedPeriod}
                    onChange={(e) => onPeriodChange(e.target.value)}
                    className="border-none bg-transparent p-0 pr-6 text-xs font-bold text-slate-800 focus:ring-0 dark:text-slate-100 cursor-pointer"
                >
                    {periodsList.map(p => (
                        <option key={p.id} value={p.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                            {p.name} {p.status === 'Activo' ? '🟢' : '⚪'}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default PeriodSelector;
