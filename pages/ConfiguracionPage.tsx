import React, { useState, useEffect } from 'react';
import { MainLayout } from '../components/MainLayout';
import * as dataStore from '../lib/dataStore';
import api from '../services/api';
import { session } from '../lib/session';
import { useAcademicPeriods } from '../lib/academicPeriods';

const ConfiguracionPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'general' | 'careers' | 'timeslots' | 'periods' | 'users'>('general');
    const { selectedPeriod, setSelectedPeriod } = useAcademicPeriods();

    // General Settings State
    const [settings, setSettings] = useState({
        institutionName: 'Institución de Educación Superior',
        careerName: 'Mi Carrera',
        maxHoursPerTeacher: 22,
        blockDurationMinutes: 80,
        allowWeekends: false,
        autoSave: true,
        notifications: true,
    });

    // Lists States
    const [timeslots, setTimeslots] = useState<dataStore.LocalTimeslot[]>([]);
    const [periods, setPeriods] = useState<dataStore.LocalPeriod[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [careers, setCareers] = useState<Array<{ id: string; name: string; code: string }>>([]);
    const [editingCareer, setEditingCareer] = useState<{ id: string; name: string; code: string } | null>(null);
    const [careerFormData, setCareerFormData] = useState({ name: '', code: '' });
    const isAdmin = session.getUser()?.role === 'admin';
    const roleLabels: Record<string, string> = {
        admin: 'Administrador',
        coordinator: 'Coordinador',
        viewer: 'Lector',
    };

    // Modals States
    const [isTimeslotModalOpen, setIsTimeslotModalOpen] = useState(false);
    const [editingTimeslot, setEditingTimeslot] = useState<dataStore.LocalTimeslot | null>(null);
    const [timeslotFormData, setTimeslotFormData] = useState({
        label: '',
        start_time: '',
        end_time: '',
        type: 'Mañana',
    });

    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
    const [editingPeriod, setEditingPeriod] = useState<dataStore.LocalPeriod | null>(null);
    const [periodFormData, setPeriodFormData] = useState({
        name: '',
        status: 'Borrador' as dataStore.LocalPeriod['status'],
        startDate: '',
        endDate: '',
    });

    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [userFormData, setUserFormData] = useState({
        name: '',
        email: '',
        role: 'viewer',
        career_id: '',
        password: '',
    });

    // Load data from storage on mount
    useEffect(() => {
        // Settings
        const savedSettings = localStorage.getItem('scheduler_general_settings');
        if (savedSettings) {
            try { setSettings(JSON.parse(savedSettings)); } catch (e) { console.error(e); }
        }
        const ownCareerId = session.getUser()?.career_id;
        if (ownCareerId) {
            api.getSettings(ownCareerId).then(remote => {
                if (Object.keys(remote).length > 0) setSettings(current => ({ ...current, ...remote }));
            }).catch(() => { /* offline demo uses local settings */ });
        }

        Promise.all([api.getTimeslots(), api.getPeriods(), api.getCareers(), ...(isAdmin ? [api.getUsers()] : [])])
            .then(([remoteTimeslots, remotePeriods, remoteCareers, remoteUsers]) => {
                setTimeslots((remoteTimeslots as any[]).map(slot => ({ ...slot, type: Number(slot.order_index) <= 4 ? 'Mañana' : 'Tarde' })));
                setPeriods((remotePeriods as any[]).map(period => ({
                    id: period.id, name: period.name, status: period.is_active ? 'Activo' : 'Borrador',
                    startDate: period.start_date, endDate: period.end_date,
                })));
                const mappedCareers = (remoteCareers as any[]).map(career => ({ id: career.id, name: career.name, code: career.code }));
                setCareers(mappedCareers);
                if (!ownCareerId && mappedCareers[0]) {
                    api.getSettings(mappedCareers[0].id).then(remote => {
                        if (Object.keys(remote).length > 0) setSettings(current => ({ ...current, ...remote }));
                    }).catch(() => undefined);
                }
                if (remoteUsers) setUsers((remoteUsers as any[]).map(user => ({
                    ...user,
                    avatar: user.name.split(' ').map((part: string) => part[0]).slice(0, 2).join('').toUpperCase(),
                })));
            })
            .catch(error => console.error('No fue posible cargar la configuración remota', error));
    }, []);

    // Save All configuration
    const handleSaveAll = async () => {
        localStorage.setItem('scheduler_general_settings', JSON.stringify(settings));
        dataStore.saveCustomTimeslots(timeslots);
        dataStore.saveCustomPeriods(periods);
        const careerId = session.getUser()?.career_id || careers[0]?.id;
        if (!careerId) {
            alert('Primero debes crear una carrera.');
            return;
        }
        try { await api.saveSettings({ ...settings, career_id: careerId }); } catch (error) {
            alert(error instanceof Error ? error.message : 'No fue posible guardar la configuración');
            return;
        }
        alert('✅ Configuración del sistema guardada exitosamente.');
    };

    // Timeslots handlers
    const openTimeslotModal = (slot?: dataStore.LocalTimeslot) => {
        if (slot) {
            setEditingTimeslot(slot);
            setTimeslotFormData({
                label: slot.label,
                start_time: slot.start_time,
                end_time: slot.end_time,
                type: slot.type || 'Mañana',
            });
        } else {
            setEditingTimeslot(null);
            setTimeslotFormData({
                label: '',
                start_time: '',
                end_time: '',
                type: 'Mañana',
            });
        }
        setIsTimeslotModalOpen(true);
    };

    const handleSaveTimeslot = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!timeslotFormData.label.trim()) return;

        let updated: dataStore.LocalTimeslot[];
        if (editingTimeslot) {
            updated = timeslots.map(t => t.id === editingTimeslot.id ? {
                ...t,
                label: timeslotFormData.label,
                start_time: timeslotFormData.start_time,
                end_time: timeslotFormData.end_time,
                type: timeslotFormData.type,
            } : t);
        } else {
            const newSlot: dataStore.LocalTimeslot = {
                id: `ts-${Date.now()}`,
                label: timeslotFormData.label,
                start_time: timeslotFormData.start_time,
                end_time: timeslotFormData.end_time,
                order_index: timeslots.length + 1,
                type: timeslotFormData.type,
            };
            updated = [...timeslots, newSlot];
        }

        try {
            const result = await api.saveTimeslot({
                id: editingTimeslot?.id,
                label: timeslotFormData.label,
                start_time: timeslotFormData.start_time,
                end_time: timeslotFormData.end_time,
                order_index: editingTimeslot?.order_index || timeslots.length + 1,
            }, Boolean(editingTimeslot));
            if (!editingTimeslot && result.id) updated[updated.length - 1].id = result.id;
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No fue posible guardar el bloque');
            return;
        }
        setTimeslots(updated);
        dataStore.saveCustomTimeslots(updated);
        setIsTimeslotModalOpen(false);
    };

    const handleDeleteTimeslot = async (id: string) => {
        if (window.confirm('¿Está seguro de que desea eliminar este bloque horario?')) {
            try { await api.deleteTimeslot(id); } catch (error) {
                alert(error instanceof Error ? error.message : 'No fue posible eliminar el bloque');
                return;
            }
            const updated = timeslots.filter(t => t.id !== id);
            setTimeslots(updated);
            dataStore.saveCustomTimeslots(updated);
        }
    };

    // Periods handlers
    const openPeriodModal = (period?: dataStore.LocalPeriod) => {
        if (period) {
            setEditingPeriod(period);
            setPeriodFormData({
                name: period.name,
                status: period.status,
                startDate: period.startDate,
                endDate: period.endDate,
            });
        } else {
            setEditingPeriod(null);
            setPeriodFormData({
                name: '',
                status: 'Borrador',
                startDate: '',
                endDate: '',
            });
        }
        setIsPeriodModalOpen(true);
    };

    const handleSavePeriod = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!periodFormData.name.trim()) return;

        let updated: dataStore.LocalPeriod[];
        if (editingPeriod) {
            updated = periods.map(p => p.id === editingPeriod.id ? {
                ...p,
                name: periodFormData.name,
                status: periodFormData.status,
                startDate: periodFormData.startDate,
                endDate: periodFormData.endDate,
            } : p);
        } else {
            const newPeriod: dataStore.LocalPeriod = {
                id: `per-${Date.now()}`,
                name: periodFormData.name,
                status: periodFormData.status,
                startDate: periodFormData.startDate,
                endDate: periodFormData.endDate,
            };
            updated = [...periods, newPeriod];
        }

        try {
            const result = await api.savePeriod({
                id: editingPeriod?.id,
                code: periodFormData.name,
                name: periodFormData.name,
                start_date: periodFormData.startDate,
                end_date: periodFormData.endDate,
                is_active: periodFormData.status === 'Activo',
            }, Boolean(editingPeriod));
            if (!editingPeriod && result.id) updated[updated.length - 1].id = result.id;
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No fue posible guardar el período');
            return;
        }
        setPeriods(updated);
        dataStore.saveCustomPeriods(updated);
        setIsPeriodModalOpen(false);
    };

    const handleDeletePeriod = async (id: string, name: string) => {
        if (window.confirm(`¿Está seguro de que desea eliminar el período académico "${name}"?`)) {
            try { await api.deletePeriod(id); } catch (error) {
                alert(error instanceof Error ? error.message : 'No fue posible eliminar el período');
                return;
            }
            const updated = periods.filter(p => p.id !== id);
            setPeriods(updated);
            dataStore.saveCustomPeriods(updated);
        }
    };

    // Users handlers
    const openUserModal = (user?: any) => {
        if (user) {
            setEditingUser(user);
            setUserFormData({
                name: user.name,
                email: user.email,
                role: user.role,
                career_id: user.career_id || '',
                password: '',
            });
        } else {
            setEditingUser(null);
            setUserFormData({
                name: '',
                email: '',
                role: 'viewer',
                career_id: careers[0]?.id || '',
                password: '',
            });
        }
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userFormData.name.trim() || !userFormData.email.trim() || (!editingUser && userFormData.password.length < 12)) return;
        try {
            await api.saveUser({
                id: editingUser?.id,
                name: userFormData.name,
                email: userFormData.email,
                role: userFormData.role,
                career_id: userFormData.role === 'admin' ? null : userFormData.career_id,
                ...(userFormData.password ? { password: userFormData.password } : {}),
            }, Boolean(editingUser));
            const remote = await api.getUsers();
            setUsers(remote.map(user => ({
                ...user,
                avatar: user.name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase(),
            })));
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No fue posible guardar el usuario');
            return;
        }
        setIsUserModalOpen(false);
    };

    const handleDeleteUser = async (id: string) => {
        if (window.confirm('¿Está seguro de que desea retirar el acceso para este usuario?')) {
            try { await api.deleteUser(id); } catch (error) {
                alert(error instanceof Error ? error.message : 'No fue posible retirar el acceso');
                return;
            }
            setUsers(current => current.filter(user => user.id !== id));
        }
    };

    const handleApproveUser = async (id: string) => {
        try {
            await api.approveUser(id);
            setUsers(current => current.map(user => user.id === id ? { ...user, is_active: 1, account_status: 'active' } : user));
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No fue posible aprobar la cuenta');
        }
    };

    const handleSaveCareer = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!careerFormData.name.trim() || !careerFormData.code.trim()) return;
        try {
            await api.saveCareer({
                id: editingCareer?.id,
                name: careerFormData.name.trim(),
                code: careerFormData.code.trim().toUpperCase(),
            }, Boolean(editingCareer));
            const remote = await api.getCareers();
            setCareers(remote.map(career => ({ id: career.id, name: career.name, code: career.code })));
            setEditingCareer(null);
            setCareerFormData({ name: '', code: '' });
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No fue posible guardar la carrera');
        }
    };

    const handleDeleteCareer = async (career: { id: string; name: string }) => {
        if (!window.confirm(`¿Eliminar la carrera "${career.name}"?`)) return;
        try {
            await api.deleteCareer(career.id);
            setCareers(current => current.filter(item => item.id !== career.id));
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No fue posible eliminar la carrera');
        }
    };

    const tabs = [
        { id: 'general', label: 'General', icon: 'settings' },
        ...(isAdmin ? [
            { id: 'careers', label: 'Carreras', icon: 'school' },
            { id: 'timeslots', label: 'Bloques Horarios', icon: 'schedule' },
            { id: 'periods', label: 'Períodos Académicos', icon: 'event' },
            { id: 'users', label: 'Usuarios y Permisos', icon: 'manage_accounts' },
        ] as const : []),
    ] as const;

    return (
        <MainLayout
            title="Configuración del Sistema"
            showPeriodSelector={false}
            actions={
                <button 
                    onClick={handleSaveAll}
                    className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-primary-dark transition-all flex items-center gap-2 shadow-md shadow-primary/20"
                >
                    <span className="material-symbols-outlined text-sm">save</span>
                    Guardar Todo
                </button>
            }
        >
            <div className="flex flex-col gap-6 animate-fade-in">
                {/* Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-800">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === tab.id
                                    ? 'border-primary text-primary bg-primary/5'
                                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                        >
                            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                    {activeTab === 'general' && (
                        <div className="p-8 max-w-2xl">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">settings</span>
                                Ajustes Generales
                            </h3>
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Nombre Institución</label>
                                        <input
                                            type="text"
                                            value={settings.institutionName}
                                            onChange={e => setSettings({ ...settings, institutionName: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Carrera / Facultad</label>
                                        <input
                                            type="text"
                                            value={settings.careerName}
                                            onChange={e => setSettings({ ...settings, careerName: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Horas Máximas (Docente Planta)</label>
                                        <input
                                            type="number"
                                            value={settings.maxHoursPerTeacher}
                                            onChange={e => setSettings({ ...settings, maxHoursPerTeacher: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Duración Bloque (Minutos)</label>
                                        <input
                                            type="number"
                                            value={settings.blockDurationMinutes}
                                            onChange={e => setSettings({ ...settings, blockDurationMinutes: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 transition-all dark:text-white"
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">Permitir Fines de Semana</p>
                                            <p className="text-[10px] text-slate-400">Habilita Sábado y Domingo en el planificador</p>
                                        </div>
                                        <button
                                            onClick={() => setSettings({ ...settings, allowWeekends: !settings.allowWeekends })}
                                            className={`w-10 h-5 rounded-full transition-all relative ${settings.allowWeekends ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
                                        >
                                            <div className={`absolute top-1 size-3 bg-white rounded-full transition-all ${settings.allowWeekends ? 'left-6' : 'left-1'}`}></div>
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">Autoguardado Automático</p>
                                            <p className="text-[10px] text-slate-400">Guarda cambios cada vez que asignas un bloque</p>
                                        </div>
                                        <button
                                            onClick={() => setSettings({ ...settings, autoSave: !settings.autoSave })}
                                            className={`w-10 h-5 rounded-full transition-all relative ${settings.autoSave ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
                                        >
                                            <div className={`absolute top-1 size-3 bg-white rounded-full transition-all ${settings.autoSave ? 'left-6' : 'left-1'}`}></div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'timeslots' && (
                        <div className="p-0">
                            <div className="p-8 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Bloques Horarios</h3>
                                    <p className="text-xs text-slate-400">Define los rangos de tiempo de cada bloque académico</p>
                                </div>
                                <button 
                                    onClick={() => openTimeslotModal()}
                                    className="text-primary text-xs font-bold hover:bg-primary/5 px-4 py-2 rounded-lg transition-all flex items-center gap-2 border border-primary/20"
                                >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    Agregar Bloque
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                                        <tr>
                                            <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Etiqueta</th>
                                            <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Inicio</th>
                                            <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Fin</th>
                                            <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Tipo</th>
                                            <th className="px-8 py-4 text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                        {timeslots.map(slot => (
                                            <tr key={slot.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                                                <td className="px-8 py-4 text-sm font-bold text-primary">{slot.label}</td>
                                                <td className="px-8 py-4 text-sm text-slate-600 dark:text-slate-300 font-mono tracking-tighter">{slot.start_time}</td>
                                                <td className="px-8 py-4 text-sm text-slate-600 dark:text-slate-300 font-mono tracking-tighter">{slot.end_time}</td>
                                                <td className="px-8 py-4 text-sm text-slate-500">{slot.type || 'Mañana'}</td>
                                                <td className="px-8 py-4 text-center">
                                                    <div className="flex justify-center gap-1">
                                                        <button 
                                                            onClick={() => openTimeslotModal(slot)}
                                                            className="size-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">edit</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteTimeslot(slot.id)}
                                                            className="size-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'periods' && (
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Períodos Académicos</h3>
                                    <p className="text-xs text-slate-400">Gestiona los semestres y años lectivos</p>
                                </div>
                                <button 
                                    onClick={() => openPeriodModal()}
                                    className="bg-primary/10 text-primary text-xs font-bold px-4 py-2 rounded-lg hover:bg-primary/20 transition-all border border-primary/20"
                                >
                                    Nuevo Período
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {periods.map(period => (
                                    <div key={period.id} className="p-6 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0b0e11]/50 relative group">
                                        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => openPeriodModal(period)}
                                                className="size-7 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shadow-sm"
                                            >
                                                <span className="material-symbols-outlined text-base">edit</span>
                                            </button>
                                            <button 
                                                onClick={() => handleDeletePeriod(period.id, period.name)}
                                                className="size-7 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center shadow-sm"
                                            >
                                                <span className="material-symbols-outlined text-base">delete</span>
                                            </button>
                                        </div>
                                        <div className="flex justify-between items-start mb-4">
                                            <h4 className="text-base font-bold text-slate-900 dark:text-white">{period.name}</h4>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${period.status === 'Activo' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                                    period.status === 'Archivado' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                                                }`}>
                                                {period.status}
                                            </span>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3 text-xs text-slate-500">
                                                <span className="material-symbols-outlined text-base">calendar_today</span>
                                                <span>{period.startDate} al {period.endDate}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'careers' && (
                        <div className="p-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Carreras</h3>
                                <p className="mt-1 text-xs text-slate-400">Cada coordinador queda limitado a una de estas carreras.</p>
                                <div className="mt-6 divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                                    {careers.length === 0 && <p className="p-5 text-sm text-slate-400">Aún no hay carreras. Crea la primera para registrar coordinadores.</p>}
                                    {careers.map(career => (
                                        <div key={career.id} className="flex items-center justify-between p-4">
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">{career.name}</p>
                                                <p className="text-xs font-mono text-slate-400">{career.code}</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => { setEditingCareer(career); setCareerFormData({ name: career.name, code: career.code }); }} className="size-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-800" title="Editar carrera">
                                                    <span className="material-symbols-outlined text-base">edit</span>
                                                </button>
                                                <button onClick={() => handleDeleteCareer(career)} className="size-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20" title="Eliminar carrera">
                                                    <span className="material-symbols-outlined text-base">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <form onSubmit={handleSaveCareer} className="h-fit space-y-4 rounded-2xl border border-slate-100 p-5 dark:border-slate-800">
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{editingCareer ? 'Editar carrera' : 'Nueva carrera'}</h4>
                                <input required maxLength={120} value={careerFormData.name} onChange={event => setCareerFormData(current => ({ ...current, name: event.target.value }))} placeholder="Nombre de la carrera" className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                                <input required minLength={2} maxLength={20} pattern="[A-Za-z0-9_-]+" value={careerFormData.code} onChange={event => setCareerFormData(current => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="Código, ej. KINE" className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm font-mono uppercase dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                                <div className="flex justify-end gap-2">
                                    {editingCareer && <button type="button" onClick={() => { setEditingCareer(null); setCareerFormData({ name: '', code: '' }); }} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 dark:border-slate-800">Cancelar</button>}
                                    <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">Guardar Carrera</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {activeTab === 'users' && (
                        <div className="p-0">
                            <div className="p-8 border-b border-slate-50 dark:border-slate-800 flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Usuarios con Acceso</h3>
                                    <p className="text-xs text-slate-400">Controla quién puede ver y editar los horarios</p>
                                </div>
                                <button 
                                    onClick={() => openUserModal()}
                                    className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-primary-dark transition-all"
                                >
                                    Invitar Usuario
                                </button>
                            </div>
                            <div className="divide-y divide-slate-50 dark:divide-slate-800">
                                {users.map(user => (
                                    <div key={user.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="size-10 rounded-full bg-gradient-to-br from-primary/10 to-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                                                {user.avatar}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">{user.name}</p>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                                    <p className="text-xs text-slate-400">{user.email}</p>
                                                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${user.account_status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : user.account_status === 'disabled' || !user.is_active ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                                                        {user.account_status === 'pending' ? 'Pendiente' : user.account_status === 'disabled' || !user.is_active ? 'Desactivada' : 'Activa'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'text-primary' : 'text-slate-500'}`}>
                                                {roleLabels[user.role] || user.role}
                                            </span>
                                            <div className="flex gap-1">
                                                {user.account_status === 'pending' && <button
                                                    onClick={() => handleApproveUser(user.id)}
                                                    className="size-8 rounded bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                                                    title="Aprobar cuenta"
                                                >
                                                    <span className="material-symbols-outlined text-base">how_to_reg</span>
                                                </button>}
                                                <button 
                                                    onClick={() => openUserModal(user)}
                                                    className="size-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center"
                                                >
                                                    <span className="material-symbols-outlined text-base">edit</span>
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteUser(user.id)}
                                                    className="size-8 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center"
                                                >
                                                    <span className="material-symbols-outlined text-base">logout</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Timeslot Modal */}
            {isTimeslotModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">schedule</span>
                                {editingTimeslot ? 'Editar Bloque Horario' : 'Agregar Bloque Horario'}
                            </h3>
                            <button 
                                onClick={() => setIsTimeslotModalOpen(false)}
                                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSaveTimeslot} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Etiqueta
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: M1"
                                        value={timeslotFormData.label}
                                        onChange={(e) => setTimeslotFormData({ ...timeslotFormData, label: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all uppercase"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Tipo
                                    </label>
                                    <select
                                        value={timeslotFormData.type}
                                        onChange={(e) => setTimeslotFormData({ ...timeslotFormData, type: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all appearance-none"
                                    >
                                        <option value="Mañana">Mañana</option>
                                        <option value="Tarde">Tarde</option>
                                        <option value="Noche">Noche</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Hora Inicio
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: 08:00"
                                        value={timeslotFormData.start_time}
                                        onChange={(e) => setTimeslotFormData({ ...timeslotFormData, start_time: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Hora Fin
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: 09:20"
                                        value={timeslotFormData.end_time}
                                        onChange={(e) => setTimeslotFormData({ ...timeslotFormData, end_time: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all font-mono"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsTimeslotModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-md shadow-primary/20 transition-all"
                                >
                                    Guardar Bloque
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Period Modal */}
            {isPeriodModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">event</span>
                                {editingPeriod ? 'Editar Período Académico' : 'Crear Nuevo Período'}
                            </h3>
                            <button 
                                onClick={() => setIsPeriodModalOpen(false)}
                                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSavePeriod} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Identificador Período
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: 2026-2"
                                        value={periodFormData.name}
                                        onChange={(e) => setPeriodFormData({ ...periodFormData, name: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Estado
                                    </label>
                                    <select
                                        value={periodFormData.status}
                                        onChange={(e) => setPeriodFormData({ ...periodFormData, status: e.target.value as any })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all appearance-none"
                                    >
                                        <option value="Borrador">Borrador</option>
                                        <option value="Activo">Activo</option>
                                        <option value="Archivado">Archivado</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Fecha Inicio
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={periodFormData.startDate}
                                        onChange={(e) => setPeriodFormData({ ...periodFormData, startDate: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Fecha Fin
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={periodFormData.endDate}
                                        onChange={(e) => setPeriodFormData({ ...periodFormData, endDate: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsPeriodModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-md shadow-primary/20 transition-all"
                                >
                                    Guardar Período
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* User Modal */}
            {isUserModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">manage_accounts</span>
                                {editingUser ? 'Editar Permisos de Usuario' : 'Invitar Usuario'}
                            </h3>
                            <button 
                                onClick={() => setIsUserModalOpen(false)}
                                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSaveUser} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Nombre Completo
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: María Rivas"
                                    value={userFormData.name}
                                    onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Correo Electrónico
                                </label>
                                <input
                                    type="email"
                                    required
                                    disabled={Boolean(editingUser)}
                                    placeholder="Ej: m.rivas@universidad.cl"
                                    value={userFormData.email}
                                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-855 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    {editingUser ? 'Nueva contraseña (opcional)' : 'Contraseña temporal'}
                                </label>
                                <input
                                    type="password"
                                    required={!editingUser}
                                    minLength={12}
                                    autoComplete="new-password"
                                    value={userFormData.password}
                                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-855 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Rol / Permisos
                                </label>
                                <select
                                    value={userFormData.role}
                                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-855 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all appearance-none"
                                >
                                    <option value="admin">Administrador Global</option>
                                    <option value="coordinator">Coordinador de Horarios</option>
                                    <option value="viewer">Lector (Solo Vista)</option>
                                </select>
                            </div>

                            {userFormData.role !== 'admin' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                        Carrera
                                    </label>
                                    <select
                                        required
                                        value={userFormData.career_id}
                                        onChange={(e) => setUserFormData({ ...userFormData, career_id: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-855 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all appearance-none"
                                    >
                                        <option value="">Selecciona una carrera</option>
                                        {careers.map(career => <option key={career.id} value={career.id}>{career.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsUserModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-md shadow-primary/20 transition-all"
                                >
                                    {editingUser ? 'Guardar Cambios' : 'Registrar Acceso'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </MainLayout>
    );
};

export default ConfiguracionPage;
