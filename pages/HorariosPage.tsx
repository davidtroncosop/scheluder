import React, { useState, useEffect } from 'react';
import { MainLayout } from '../components/MainLayout';
import * as dataStore from '../lib/dataStore';

interface Subject {
    id: string;
    code: string;
    name: string;
    level: number;
    credits: number;
}

const API_BASE = '/api';

const HorariosPage: React.FC = () => {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState('2026-1');

    useEffect(() => {
        const fetchSubjects = async () => {
            const localSubjects = dataStore.getSubjects();
            if (localSubjects.length > 0) {
                const converted: Subject[] = localSubjects.map(s => ({
                    id: s.id,
                    code: s.codigo,
                    name: s.nombre,
                    level: s.nivel,
                    credits: s.creditos || 0,
                }));
                setSubjects(converted);
                setLoading(false);
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/subjects`);
                if (res.ok) {
                    const data = await res.json() as Subject[];
                    setSubjects(data);
                } else {
                    loadMockSubjects();
                }
            } catch (err) {
                loadMockSubjects();
            } finally {
                setLoading(false);
            }
        };
        fetchSubjects();
    }, []);

    const loadMockSubjects = () => {
        setSubjects([
            { id: '1', code: 'DMOR0030', name: 'Morfología', level: 3, credits: 6 },
            { id: '2', code: 'DBIO0031', name: 'Biomecánica I', level: 3, credits: 4 },
            { id: '3', code: 'DFIS0032', name: 'Fisiología I', level: 3, credits: 6 },
            { id: '4', code: 'DBIE0033', name: 'Bioética', level: 3, credits: 2 },
            { id: '5', code: 'DSAL0034', name: 'Salud Pública', level: 3, credits: 4 },
            { id: '6', code: 'DANA0020', name: 'Anatomía II', level: 2, credits: 6 },
            { id: '7', code: 'DANA0010', name: 'Anatomía I', level: 1, credits: 6 },
        ]);
    };

    const levels = [...new Set(subjects.map(s => s.level))].sort((a, b) => a - b);
    const filteredSubjects = selectedLevel ? subjects.filter(s => s.level === selectedLevel) : subjects;

    return (
        <MainLayout
            title="Horarios por Asignatura"
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            actions={
                <button className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg font-bold hover:bg-slate-200 transition-all">
                    <span className="material-symbols-outlined">download</span>
                    Exportar Todo
                </button>
            }
        >
            <div className="flex flex-col gap-6">
                {/* Level Filter */}
                <div className="flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
                    <button
                        onClick={() => setSelectedLevel(null)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${!selectedLevel ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-100 dark:border-slate-700 hover:bg-slate-50'}`}
                    >
                        Todos
                    </button>
                    {levels.map(level => (
                        <button
                            key={level}
                            onClick={() => setSelectedLevel(level)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${selectedLevel === level ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-100 dark:border-slate-700 hover:bg-slate-50'}`}
                        >
                            Nivel {level}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12 h-64">
                        <div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredSubjects.map(subject => (
                            <div key={subject.id} className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 cursor-pointer">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="size-10 rounded-xl bg-primary/5 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                        <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">calendar_view_day</span>
                                    </div>
                                    <span className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:text-primary rounded text-[9px] font-black uppercase transition-colors tracking-tighter">
                                        Nivel {subject.level}
                                    </span>
                                </div>

                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subject.code}</span>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 line-clamp-1">{subject.name}</h3>

                                <div className="pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-slate-500">
                                        <span className="material-symbols-outlined text-sm">visibility</span>
                                        <span className="text-[11px] font-bold uppercase">Ver Horario</span>
                                    </div>
                                    <span className="material-symbols-outlined text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all">chevron_right</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {filteredSubjects.length === 0 && !loading && (
                    <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                        <span className="material-symbols-outlined text-5xl text-slate-200 mb-4">calendar_today</span>
                        <p className="text-slate-400 font-bold uppercase text-xs">No se encontraron asignaturas con horarios</p>
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default HorariosPage;
