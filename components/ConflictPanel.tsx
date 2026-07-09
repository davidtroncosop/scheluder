import React from 'react';
import type { Conflict } from '../pages/SchedulerPage';

interface ConflictPanelProps {
    conflicts: Conflict[];
    days: string[];
    setShowConflictsPanel: (show: boolean) => void;
    setSelectedConflict: (conflict: Conflict) => void;
}

const ConflictPanel: React.FC<ConflictPanelProps> = ({
    conflicts,
    days,
    setShowConflictsPanel,
    setSelectedConflict,
}) => {
    return (
        <aside className="w-80 bg-white dark:bg-[#111418] border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-500">error</span>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">Conflictos ({conflicts.length})</h3>
                </div>
                <button
                    onClick={() => setShowConflictsPanel(false)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                >
                    <span className="material-symbols-outlined text-slate-400 text-lg">close</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {/* Critical Conflicts */}
                {conflicts.filter(c => c.type === 'CRITICAL').length > 0 && (
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">error</span>
                            Críticos ({conflicts.filter(c => c.type === 'CRITICAL').length})
                        </p>
                        {conflicts.filter(c => c.type === 'CRITICAL').map(conflict => (
                            <div
                                key={conflict.id}
                                className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg p-3 mb-2 cursor-pointer hover:border-red-200 dark:hover:border-red-800 transition-all"
                                onClick={() => setSelectedConflict(conflict)}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">{conflict.subject_name}</h4>
                                    <span className="text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">{conflict.rule_code}</span>
                                </div>
                                <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-2">{conflict.description}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-slate-400 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                                        {days[conflict.day_of_week - 1]} {conflict.timeslot_label}
                                    </span>
                                    <span className="text-[9px] font-bold text-primary flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px]">visibility</span>
                                        Ver detalle
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Warning Conflicts */}
                {conflicts.filter(c => c.type === 'WARNING').length > 0 && (
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">warning</span>
                            Alertas ({conflicts.filter(c => c.type === 'WARNING').length})
                        </p>
                        {conflicts.filter(c => c.type === 'WARNING').map(conflict => (
                            <div key={conflict.id} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-lg p-3 mb-2">
                                <div className="flex items-start justify-between mb-2">
                                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">{conflict.subject_name}</h4>
                                    <span className="text-[9px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">{conflict.rule_code}</span>
                                </div>
                                <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-2">{conflict.description}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-slate-400 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                                        {days[conflict.day_of_week - 1]} {conflict.timeslot_label}
                                    </span>
                                    <button className="text-[9px] font-bold text-amber-600 hover:underline flex items-center gap-1" onClick={() => setSelectedConflict(conflict)}>
                                        <span className="material-symbols-outlined text-[12px]">visibility</span>
                                        Ver detalle
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {conflicts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">check_circle</span>
                        <p className="text-sm font-bold text-slate-800 dark:text-white">Sin conflictos</p>
                        <p className="text-xs text-slate-500">El horario no tiene errores</p>
                    </div>
                )}
            </div>

            {conflicts.length > 0 && (
                <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0f141a]">
                    <button className="w-full py-2.5 bg-primary text-white text-xs font-bold rounded-lg shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">auto_fix</span>
                        Resolver todos automáticamente
                    </button>
                </div>
            )}
        </aside>
    );
};

export default ConflictPanel;
