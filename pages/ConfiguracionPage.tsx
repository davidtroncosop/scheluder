import React, { useState, useEffect } from 'react';
import { MainLayout } from '../components/MainLayout';
import * as dataStore from '../lib/dataStore';

const ConfiguracionPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'general' | 'timeslots' | 'periods' | 'users'>('general');
    const [selectedPeriod, setSelectedPeriod] = useState('2026-1');

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
        role: 'Lector',
    });

    // Load data from storage on mount
    useEffect(() => {
        // Settings
        const savedSettings = localStorage.getItem('scheduler_general_settings');
        if (savedSettings) {
            try { setSettings(JSON.parse(savedSettings)); } catch (e) { console.error(e); }
        }

        // Timeslots
        setTimeslots(dataStore.getCustomTimeslots());

        // Periods
        setPeriods(dataStore.getCustomPeriods());

        // Users
        const savedUsers = localStorage.getItem('scheduler_users');
        if (savedUsers) {
            try { setUsers(JSON.parse(savedUsers)); } catch (e) { console.error(e); }
        } else {
            const initialUsers = [
                { id: 'u1', name: 'Diego Troncoso', email: 'diego@ejemplo.com', role: 'Administrador', avatar: 'DT' },
                { id: 'u2', name: 'María Rivas', email: 'm.rivas@ejemplo.com', role: 'Editor', avatar: 'MR' },
                { id: 'u3', name: 'Roberto Soto', email: 'r.soto@ejemplo.com', role: 'Lector', avatar: 'RS' },
            ];
            setUsers(initialUsers);
            localStorage.setItem('scheduler_users', JSON.stringify(initialUsers));
        }
    }, []);

    // Save All configuration
    const handleSaveAll = () => {
        localStorage.setItem('scheduler_general_settings', JSON.stringify(settings));
        dataStore.saveCustomTimeslots(timeslots);
        dataStore.saveCustomPeriods(periods);
        localStorage.setItem('scheduler_users', JSON.stringify(users));
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

    const handleSaveTimeslot = (e: React.FormEvent) => {
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

        setTimeslots(updated);
        dataStore.saveCustomTimeslots(updated);
        setIsTimeslotModalOpen(false);
    };

    const handleDeleteTimeslot = (id: string) => {
        if (window.confirm('¿Está seguro de que desea eliminar este bloque horario?')) {
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

    const handleSavePeriod = (e: React.FormEvent) => {
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

        setPeriods(updated);
        dataStore.saveCustomPeriods(updated);
        setIsPeriodModalOpen(false);
    };

    const handleDeletePeriod = (id: string, name: string) => {
        if (window.confirm(`¿Está seguro de que desea eliminar el período académico "${name}"?`)) {
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
            });
        } else {
            setEditingUser(null);
            setUserFormData({
                name: '',
                email: '',
                role: 'Lector',
            });
        }
        setIsUserModalOpen(true);
    };

    const handleSaveUser = (e: React.FormEvent) => {
        e.preventDefault();
        if (!userFormData.name.trim() || !userFormData.email.trim()) return;

        let updated: any[];
        if (editingUser) {
            updated = users.map(u => u.id === editingUser.id ? {
                ...u,
                name: userFormData.name,
                email: userFormData.email,
                role: userFormData.role,
                avatar: userFormData.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase(),
            } : u);
        } else {
            const newUser = {
                id: `usr-${Date.now()}`,
                name: userFormData.name,
                email: userFormData.email,
                role: userFormData.role,
                avatar: userFormData.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase(),
            };
            updated = [...users, newUser];
        }

        setUsers(updated);
        localStorage.setItem('scheduler_users', JSON.stringify(updated));
        setIsUserModalOpen(false);
    };

    const handleDeleteUser = (id: string) => {
        if (window.confirm('¿Está seguro de que desea retirar el acceso para este usuario?')) {
            const updated = users.filter(u => u.id !== id);
            setUsers(updated);
            localStorage.setItem('scheduler_users', JSON.stringify(updated));
        }
    };

    const tabs = [
        { id: 'general', label: 'General', icon: 'settings' },
        { id: 'timeslots', label: 'Bloques Horarios', icon: 'schedule' },
        { id: 'periods', label: 'Períodos Académicos', icon: 'event' },
        { id: 'users', label: 'Usuarios y Permisos', icon: 'manage_accounts' },
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
                                                    period.status === 'Archivado' ? 'bg-slate-100 text-slate-450 dark:bg-slate-800 dark:text-slate-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
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
                                                <p className="text-xs text-slate-400">{user.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${user.role === 'Administrador' ? 'text-primary' : 'text-slate-450'}`}>
                                                {user.role}
                                            </span>
                                            <div className="flex gap-1">
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
                                    placeholder="Ej: m.rivas@universidad.cl"
                                    value={userFormData.email}
                                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
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
                                    <option value="Administrador">Administrador Global</option>
                                    <option value="Editor">Editor de Horarios</option>
                                    <option value="Lector">Lector (Solo Vista)</option>
                                </select>
                            </div>

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
