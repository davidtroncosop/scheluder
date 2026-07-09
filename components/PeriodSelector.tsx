import React, { useState, useEffect } from 'react';
import * as dataStore from '../lib/dataStore';

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
        // Load dynamically from database/local storage
        const loaded = dataStore.getCustomPeriods();
        setPeriodsList(loaded);
    }, [selectedPeriod]); // reload when period changes to sync changes made elsewhere

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <span className="material-symbols-outlined text-slate-400 text-[18px]">event</span>
            <select
                value={selectedPeriod}
                onChange={(e) => onPeriodChange(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
                {periodsList.map(p => (
                    <option key={p.id} value={p.name}>
                        {p.name} ({p.status})
                    </option>
                ))}
            </select>
        </div>
    );
};

export default PeriodSelector;
