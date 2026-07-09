import React, { useState, useEffect } from 'react';
import { MainLayout } from '../components/MainLayout';
import * as dataStore from '../lib/dataStore';

interface Subject {
    id: string;
    code: string;
    name: string;
    level: number;
    credits: number;
    career_id: string;
}

const API_BASE = '/api';

const AsignaturasPage: React.FC = () => {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState('2026-1');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        level: 1,
        credits: 4,
        career_id: 'car-default-001',
    });

    const loadSubjectsList = () => {
        setLoading(true);
        const localSubjects = dataStore.getSubjects();
        if (localSubjects.length > 0) {
            const converted: Subject[] = localSubjects.map(s => ({
                id: s.id,
                code: s.codigo,
                name: s.nombre,
                level: s.nivel,
                credits: s.creditos || 0,
                career_id: s.carrera || '',
            }));
            setSubjects(converted);
            setLoading(false);
            return;
        }

        // Mock Fallback
        const mock: Subject[] = [
            { id: '1', code: 'DMOR0030', name: 'Morfología', level: 3, credits: 6, career_id: 'car-default-001' },
            { id: '2', code: 'DBIO0031', name: 'Biomecánica I', level: 3, credits: 4, career_id: 'car-default-001' },
            { id: '3', code: 'DFIS0032', name: 'Fisiología I', level: 3, credits: 6, career_id: 'car-default-001' },
            { id: '4', code: 'DBIE0033', name: 'Bioética', level: 3, credits: 2, career_id: 'car-default-001' },
            { id: '5', code: 'DSAL0034', name: 'Salud Pública', level: 3, credits: 4, career_id: 'car-default-001' },
            { id: '6', code: 'DANA0020', name: 'Anatomía II', level: 2, credits: 6, career_id: 'car-default-001' },
            { id: '7', code: 'DANA0010', name: 'Anatomía I', level: 1, credits: 6, career_id: 'car-default-001' },
        ];
        setSubjects(mock);
        // Write mock to dataStore to initialize
        const convertedMock: dataStore.ImportedSubject[] = mock.map(m => ({
            id: m.id,
            codigo: m.code,
            nombre: m.name,
            nivel: m.level,
            creditos: m.credits,
            carrera: m.career_id,
        }));
        dataStore.saveSubjects(convertedMock);
        setLoading(false);
    };

    useEffect(() => {
        loadSubjectsList();
    }, []);

    const openModal = (subject?: Subject) => {
        if (subject) {
            setEditingSubject(subject);
            setFormData({
                code: subject.code,
                name: subject.name,
                level: subject.level,
                credits: subject.credits,
                career_id: subject.career_id || 'car-default-001',
            });
        } else {
            setEditingSubject(null);
            setFormData({
                code: '',
                name: '',
                level: 1,
                credits: 4,
                career_id: 'car-default-001',
            });
        }
        setIsModalOpen(true);
    };

    const handleSaveSubject = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.code.trim()) return;

        const id = editingSubject ? editingSubject.id : `subject-${Date.now()}`;
        const newSubjectData: dataStore.ImportedSubject = {
            id,
            codigo: formData.code.toUpperCase(),
            nombre: formData.name,
            nivel: Number(formData.level),
            creditos: Number(formData.credits),
            carrera: formData.career_id,
        };

        dataStore.addOrUpdateSubject(newSubjectData);
        loadSubjectsList();
        setIsModalOpen(false);
    };

    const handleDeleteSubject = (id: string, name: string) => {
        if (window.confirm(`¿Está seguro de que desea eliminar la asignatura "${name}"?`)) {
            dataStore.deleteSubject(id);
            setSubjects(prev => prev.filter(s => s.id !== id));
        }
    };

    const levels = [...new Set(subjects.map(s => s.level))].sort((a, b) => a - b);
    const filteredSubjects = selectedLevel ? subjects.filter(s => s.level === selectedLevel) : subjects;

    return (
        <MainLayout
            title="Asignaturas"
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            actions={
                <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
                        {subjects.length} asignaturas registradas
                    </span>
                    <button 
                        onClick={() => openModal()}
                        className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-bold hover:bg-primary-dark transition-all shadow-md shadow-primary/20"
                    >
                        <span className="material-symbols-outlined">add</span>
                        Nueva Asignatura
                    </button>
                </div>
            }
        >
            <div className="flex flex-col gap-6 animate-fade-in">
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
                            <div key={subject.id} className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="size-10 rounded-xl bg-primary/5 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                        <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">menu_book</span>
                                    </div>
                                    <span className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:text-primary rounded text-[9px] font-black uppercase transition-colors tracking-tighter">
                                        Nivel {subject.level}
                                    </span>
                                </div>

                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subject.code}</span>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 line-clamp-1">{subject.name}</h3>

                                <div className="pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-slate-500">
                                        <span className="material-symbols-outlined text-sm">school</span>
                                        <span className="text-[11px] font-bold uppercase">{subject.credits} CRÉDITOS</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => openModal(subject)}
                                            className="size-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center"
                                            title="Editar Asignatura"
                                        >
                                            <span className="material-symbols-outlined text-lg">edit</span>
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteSubject(subject.id, subject.name)}
                                            className="size-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/5 transition-all flex items-center justify-center"
                                            title="Eliminar Asignatura"
                                        >
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {filteredSubjects.length === 0 && !loading && (
                    <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                        <span className="material-symbols-outlined text-5xl text-slate-200 mb-4">menu_book</span>
                        <p className="text-slate-400 font-bold uppercase text-xs">No se encontraron asignaturas</p>
                    </div>
                )}
            </div>

            {/* Modal de Registro/Edición de Asignatura */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">menu_book</span>
                                {editingSubject ? 'Editar Asignatura' : 'Registrar Nueva Asignatura'}
                            </h3>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSaveSubject} className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Código
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: DMOR0030"
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-855 bg-slate-50/50 dark:bg-slate-900/30 px-3 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all font-mono uppercase"
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Nombre de Asignatura
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: Morfología"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-855 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Nivel / Semestre
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min={1}
                                        max={12}
                                        value={formData.level}
                                        onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) || 1 })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-855 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Créditos
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min={0}
                                        max={20}
                                        value={formData.credits}
                                        onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-855 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-md shadow-primary/20 transition-all"
                                >
                                    {editingSubject ? 'Guardar Cambios' : 'Registrar Asignatura'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </MainLayout>
    );
};

export default AsignaturasPage;
