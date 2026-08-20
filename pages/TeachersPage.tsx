import React, { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '../components/MainLayout';
import * as dataStore from '../lib/dataStore';
import { OFFLINE_DEMO_ENABLED } from '../lib/runtime';
import api from '../services/api';
import { useAcademicPeriods } from '../lib/academicPeriods';
import type { Subject, TeacherSubject } from '../types';

interface Teacher {
  id: string;
  name: string;
  email: string | null;
  rut: string;
  contract_type: 'Planta' | 'Honorarios' | 'Media Jornada' | 'Adjunto';
  max_hours_per_week: number;
  is_active: boolean;
  avatar_url: string | null;
  availability_raw?: any;
}

interface Availability {
  day_of_week: number;
  timeslot_id: string;
  label: string;
  start_time: string;
  end_time: string;
  status: 'available' | 'preference' | 'blocked';
}

const TeachersPage: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const { selectedPeriod, setSelectedPeriod } = useAcademicPeriods();

  // New Tab State for Right Panel
  const [activeTab, setActiveTab] = useState<'availability' | 'subjects'>('availability');
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubject[]>([]);
  const [selectedSubjectToAdd, setSelectedSubjectToAdd] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<number>(1);
  const [savingSubjects, setSavingSubjects] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    contract_type: 'Planta' as Teacher['contract_type'],
    max_hours_per_week: 20,
    is_active: true,
  });

  // Fetch teachers & subjects
  const loadTeachersList = async () => {
    setLoading(true);
    try {
      const [remoteTeachers, remoteSubjects] = await Promise.all([
        api.getTeachers(),
        api.getSubjects().catch(() => []),
      ]);
      setAllSubjects(remoteSubjects as Subject[]);
      if (remoteTeachers.length > 0) {
        const convertedTeachers = remoteTeachers.map(t => ({ ...t, is_active: Boolean(t.is_active), availability_raw: {} })) as Teacher[];
        setTeachers(convertedTeachers);
        dataStore.saveTeachers(remoteTeachers.map(t => ({
          id: t.id, nombre: t.name, email: t.email || '', tipo_contrato: t.contract_type,
          max_horas: t.max_hours_per_week,
        })));
        if (!selectedTeacherId && convertedTeachers[0]) setSelectedTeacherId(convertedTeachers[0].id);
        setLoading(false);
        return;
      }
    } catch (error) {
      if (!OFFLINE_DEMO_ENABLED) {
        setLoading(false);
        alert(error instanceof Error ? error.message : 'No fue posible cargar los docentes');
        return;
      }
    }
    const localTeachers = dataStore.getTeachers();
    if (localTeachers.length > 0) {
      const convertedTeachers: Teacher[] = localTeachers.map((t, idx) => ({
        id: t.id || `tch-${idx}`,
        name: t.nombre,
        email: t.email || null,
        rut: '',
        contract_type: (t.tipo_contrato as Teacher['contract_type']) || 'Planta',
        max_hours_per_week: t.max_horas || 20,
        is_active: true,
        avatar_url: null,
        availability_raw: t.availability || {}
      }));
      setTeachers(convertedTeachers);
      if (convertedTeachers.length > 0 && !selectedTeacherId) {
        setSelectedTeacherId(convertedTeachers[0].id);
      }
      setLoading(false);
      return;
    }

    // Fallback Mock
    const mock: Teacher[] = [
      { id: 'tch-001', name: 'Dr. Alejandro Valenzuela', email: 'a.valenzuela@edu.cl', rut: '12.345.678-9', contract_type: 'Planta', max_hours_per_week: 40, is_active: true, avatar_url: null, availability_raw: {} },
      { id: 'tch-002', name: 'Dra. María Paz Rivas', email: 'm.rivas@edu.cl', rut: '11.222.333-4', contract_type: 'Media Jornada', max_hours_per_week: 20, is_active: true, avatar_url: null, availability_raw: {} },
      { id: 'tch-003', name: 'Klgo. Roberto Soto', email: 'r.soto@edu.cl', rut: '10.111.222-3', contract_type: 'Honorarios', max_hours_per_week: 12, is_active: true, avatar_url: null, availability_raw: {} },
    ];
    setTeachers(mock);
    setSelectedTeacherId(mock[0].id);
    setLoading(false);
  };

  useEffect(() => {
    loadTeachersList();
  }, []);

  // Fetch teacher qualified subjects
  const loadTeacherSubjects = useCallback(async (teacherId: string) => {
    try {
      const subjects = await api.getTeacherSubjects(teacherId);
      setTeacherSubjects(subjects);
    } catch {
      setTeacherSubjects([]);
    }
  }, []);

  // Fetch teacher availability and qualified subjects
  useEffect(() => {
    if (!selectedTeacherId) return;
    setLoadingAvailability(true);

    loadTeacherSubjects(selectedTeacherId);

    const currentTeacher = teachers.find(t => t.id === selectedTeacherId);

    // 1. Try remote DB
    api.getTeacher(selectedTeacherId).then(data => {
      if (data && (data as any).availability && Array.isArray((data as any).availability)) {
        setAvailability((data as any).availability);
        setLoadingAvailability(false);
      } else {
        throw new Error('Sin disponibilidad remota');
      }
    }).catch(() => {
      // 2. Fallback to LocalStorage
      if (currentTeacher && currentTeacher.availability_raw) {
        const raw = currentTeacher.availability_raw;
        const parsed: Availability[] = [];
        Object.keys(raw).forEach(key => {
          const parts = key.split('-');
          if (parts.length >= 2) {
            const slotId = parts[0];
            const day = parseInt(parts[1], 10);
            parsed.push({
              day_of_week: day,
              timeslot_id: slotId,
              label: slotId.toUpperCase(),
              start_time: '08:00',
              end_time: '09:20',
              status: raw[key] as Availability['status']
            });
          }
        });
        if (parsed.length > 0) {
          setAvailability(parsed);
          setLoadingAvailability(false);
          return;
        }
      }

      // Default availability
      setAvailability([
        { day_of_week: 2, timeslot_id: 'ts-m2', label: 'M2', start_time: '09:40', end_time: '11:00', status: 'blocked' },
        { day_of_week: 5, timeslot_id: 'ts-t1', label: 'T1', start_time: '14:40', end_time: '16:00', status: 'blocked' },
        { day_of_week: 1, timeslot_id: 'ts-m1', label: 'M1', start_time: '08:00', end_time: '09:20', status: 'preference' },
      ]);
      setLoadingAvailability(false);
    });
  }, [loadTeacherSubjects, selectedTeacherId, teachers]);

  const selectedTeacher = teachers.find(t => t.id === selectedTeacherId);
  const timeHours = [8, 9, 10, 11, 12, 13, 14, 15, 16];

  const getSlotStatus = (hour: number, dayIndex: number): 'available' | 'preference' | 'blocked' => {
    if (!Array.isArray(availability)) return 'available';
    const currentSlotId = `ts-${hour < 14 ? 'm' + (Math.floor((hour - 8) / 1.5) + 1) : 't' + (Math.floor((hour - 14) / 1.5) + 1)}`;
    const day = dayIndex + 1;

    const slot = availability.find(a => {
      if (a.day_of_week === day) {
        if (a.timeslot_id && a.timeslot_id.toLowerCase() === currentSlotId.toLowerCase()) return true;
        if (a.start_time && parseInt(a.start_time.split(':')[0]) === hour) return true;
      }
      return false;
    });
    return slot?.status || 'available';
  };

  const handleCellClick = (hour: number, dayIndex: number) => {
    if (!selectedTeacherId) return;
    const currentSlotId = `ts-${hour < 14 ? 'm' + (Math.floor((hour - 8) / 1.5) + 1) : 't' + (Math.floor((hour - 14) / 1.5) + 1)}`;
    const day = dayIndex + 1;

    setAvailability(prev => {
      const idx = prev.findIndex(a => a.day_of_week === day && a.timeslot_id.toLowerCase() === currentSlotId.toLowerCase());
      if (idx >= 0) {
        const current = prev[idx].status;
        const nextStatus = current === 'preference' ? 'blocked' : 'available';
        
        const updated = [...prev];
        if (nextStatus === 'available') {
          updated.splice(idx, 1);
        } else {
          updated[idx] = { ...prev[idx], status: nextStatus };
        }
        return updated;
      } else {
        return [...prev, {
          day_of_week: day,
          timeslot_id: currentSlotId,
          label: currentSlotId.toUpperCase().replace('TS-', ''),
          start_time: `${hour < 10 ? '0' + hour : hour}:00`,
          end_time: `${hour + 1 < 10 ? '0' + (hour + 1) : hour + 1}:20`,
          status: 'preference'
        }];
      }
    });
  };

  const handleSaveAvailability = async () => {
    if (!selectedTeacherId) return;

    const rawAvailability: Record<string, 'available' | 'preference' | 'blocked'> = {};
    availability.forEach(a => {
      const key = `${a.timeslot_id}-${a.day_of_week}`;
      rawAvailability[key] = a.status;
    });

    const currentTeacher = teachers.find(t => t.id === selectedTeacherId);
    if (currentTeacher) {
      const updatedTeacherData: dataStore.ImportedTeacher = {
        id: currentTeacher.id,
        nombre: currentTeacher.name,
        email: currentTeacher.email || '',
        tipo_contrato: currentTeacher.contract_type,
        max_horas: currentTeacher.max_hours_per_week,
        availability: rawAvailability
      };
      
      try {
        await api.updateTeacherAvailability(selectedTeacherId, availability.map(({ day_of_week, timeslot_id, status }) => ({ day_of_week, timeslot_id, status })));
      } catch (error) {
        if (!OFFLINE_DEMO_ENABLED) {
          alert(error instanceof Error ? error.message : 'No fue posible guardar la disponibilidad');
          return;
        }
      }
      dataStore.addOrUpdateTeacher(updatedTeacherData);
      setTeachers(prev => prev.map(t => t.id === selectedTeacherId ? { ...t, availability_raw: rawAvailability } : t));
      alert(`✅ Disponibilidad de ${currentTeacher.name} guardada exitosamente.`);
    }
  };

  // Add a qualified subject
  const handleAddQualifiedSubject = async () => {
    if (!selectedTeacherId || !selectedSubjectToAdd) return;
    const exists = teacherSubjects.some(ts => ts.subject_id === selectedSubjectToAdd);
    if (exists) {
      alert('Esta asignatura ya está habilitada para este docente');
      return;
    }
    const targetSub = allSubjects.find(s => s.id === selectedSubjectToAdd);
    const updated = [
      ...teacherSubjects,
      {
        teacher_id: selectedTeacherId,
        subject_id: selectedSubjectToAdd,
        priority: selectedPriority,
        max_sections: 4,
        subject_name: targetSub?.name,
        subject_code: targetSub?.code,
        subject_level: targetSub?.level,
      }
    ];

    setSavingSubjects(true);
    try {
      await api.updateTeacherSubjects(selectedTeacherId, updated.map(u => ({
        subject_id: u.subject_id,
        priority: u.priority,
        max_sections: u.max_sections,
      })));
      setTeacherSubjects(updated);
      setSelectedSubjectToAdd('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible vincular la asignatura');
    } finally {
      setSavingSubjects(false);
    }
  };

  // Remove a qualified subject
  const handleRemoveQualifiedSubject = async (subjectId: string) => {
    if (!selectedTeacherId) return;
    const updated = teacherSubjects.filter(ts => ts.subject_id !== subjectId);
    setSavingSubjects(true);
    try {
      await api.updateTeacherSubjects(selectedTeacherId, updated.map(u => ({
        subject_id: u.subject_id,
        priority: u.priority,
        max_sections: u.max_sections,
      })));
      setTeacherSubjects(updated);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible eliminar la asignatura');
    } finally {
      setSavingSubjects(false);
    }
  };

  // Open modal for adding/editing teacher
  const openModal = (teacher?: Teacher) => {
    if (teacher) {
      setEditingTeacher(teacher);
      setFormData({
        name: teacher.name,
        email: teacher.email || '',
        contract_type: teacher.contract_type,
        max_hours_per_week: teacher.max_hours_per_week,
        is_active: teacher.is_active,
      });
    } else {
      setEditingTeacher(null);
      setFormData({
        name: '',
        email: '',
        contract_type: 'Planta',
        max_hours_per_week: 20,
        is_active: true,
      });
    }
    setIsModalOpen(true);
  };

  // Save teacher form submission
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const id = editingTeacher ? editingTeacher.id : `teacher-${Date.now()}`;
    const newTeacher: dataStore.ImportedTeacher = {
      id,
      nombre: formData.name,
      email: formData.email,
      tipo_contrato: formData.contract_type,
      max_horas: Number(formData.max_hours_per_week),
      availability: editingTeacher?.availability_raw || {},
    };

    try {
      await api.saveTeacher({
        id, name: formData.name, email: formData.email, contract_type: formData.contract_type,
        max_hours_per_week: Number(formData.max_hours_per_week), is_active: formData.is_active,
      }, Boolean(editingTeacher));
    } catch (error) {
      if (!OFFLINE_DEMO_ENABLED) {
        alert(error instanceof Error ? error.message : 'No fue posible guardar el docente');
        return;
      }
    }
    dataStore.addOrUpdateTeacher(newTeacher);
    await loadTeachersList();
    setIsModalOpen(false);

    if (!editingTeacher) {
      setSelectedTeacherId(id);
    }
  };

  // Delete Teacher
  const handleDeleteTeacher = async (id: string, name: string) => {
    if (window.confirm(`¿Está seguro de que desea eliminar al docente "${name}"?`)) {
      try { await api.deleteTeacher(id); } catch (error) {
        if (!OFFLINE_DEMO_ENABLED) {
          alert(error instanceof Error ? error.message : 'No fue posible eliminar el docente');
          return;
        }
      }
      dataStore.deleteTeacher(id);
      const updated = teachers.filter(t => t.id !== id);
      setTeachers(updated);
      if (selectedTeacherId === id) {
        setSelectedTeacherId(updated.length > 0 ? updated[0].id : null);
      }
    }
  };

  return (
    <MainLayout
      title="Planta Docente"
      selectedPeriod={selectedPeriod}
      onPeriodChange={setSelectedPeriod}
      actions={
        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-700/60 shadow-xs">
            {teachers.length} docentes registrados
          </span>
          <button 
            onClick={() => openModal()}
            className="btn-primary"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Nuevo Docente
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 h-64">
          <div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in">
          {/* Teachers List */}
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-[640px] flex flex-col">
              <div className="overflow-y-auto grow custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#111418]">
                      <th className="py-3 px-4 text-[10px] font-black uppercase text-slate-500 tracking-wider">Docente</th>
                      <th className="py-3 px-4 text-[10px] font-black uppercase text-slate-500 tracking-wider">Contrato</th>
                      <th className="py-3 px-4 text-[10px] font-black uppercase text-slate-500 tracking-wider text-center">Horas</th>
                      <th className="py-3 px-4 text-[10px] font-black uppercase text-slate-500 tracking-wider text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {teachers.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTeacherId(t.id)}
                        className={`${selectedTeacherId === t.id ? 'bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-gray-50/50 dark:hover:bg-white/5'} cursor-pointer transition-colors`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                              {t.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{t.name}</p>
                              <p className="text-xs text-slate-400">{t.email || t.rut || 'Sin correo'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.contract_type === 'Planta' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' :
                            t.contract_type === 'Media Jornada' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {t.contract_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-700 dark:text-slate-300 text-sm">
                          {t.max_hours_per_week}h
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openModal(t);
                              }}
                              className="size-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center"
                              title="Editar Docente"
                            >
                              <span className="material-symbols-outlined text-lg">edit</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTeacher(t.id, t.name);
                              }}
                              className="size-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/5 transition-all flex items-center justify-center"
                              title="Eliminar Docente"
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
          </div>

          {/* Right Panel: Tabs for Availability & Qualified Subjects */}
          <div className="lg:col-span-6 h-[640px] flex flex-col">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full overflow-hidden">
              {/* Header with Tabs */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {selectedTeacher?.name || 'Seleccione un docente'}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                    {selectedTeacher?.contract_type} · Max {selectedTeacher?.max_hours_per_week} hrs/sem
                  </p>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('availability')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activeTab === 'availability'
                        ? 'bg-white dark:bg-slate-900 text-primary shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">edit_calendar</span>
                    Disponibilidad
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('subjects')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activeTab === 'subjects'
                        ? 'bg-white dark:bg-slate-900 text-primary shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">school</span>
                    Asignaturas ({teacherSubjects.length})
                  </button>
                </div>
              </div>

              {/* Tab 1: Availability Grid */}
              {activeTab === 'availability' && (
                <>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                    {loadingAvailability ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full"></div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-6 gap-[1px] bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden shrink-0">
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-2 text-[10px] font-black text-slate-400 text-center flex items-center justify-center">HORA</div>
                        {['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE'].map(day => (
                          <div key={day} className="bg-slate-50 dark:bg-slate-900/50 p-2 text-[10px] font-black text-slate-950 dark:text-white text-center">{day}</div>
                        ))}

                        {timeHours.map((hour) => (
                          <React.Fragment key={hour}>
                            <div className="bg-white dark:bg-slate-900 p-2 text-[10px] font-bold text-slate-400 flex items-center justify-center font-mono select-none">
                              {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                            </div>
                            {[0, 1, 2, 3, 4].map((day) => {
                              const status = getSlotStatus(hour, day);
                              return (
                                <div
                                  key={day}
                                  onClick={() => handleCellClick(hour, day)}
                                  className={`h-10 flex items-center justify-center transition-all cursor-pointer border border-transparent hover:border-primary/40 ${status === 'blocked' ? 'bg-red-500/10 text-red-500 dark:bg-red-500/20' :
                                    status === 'preference' ? 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20' :
                                      'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  title="Haga clic para cambiar disponibilidad (Disponible -> Preferida -> Bloqueada)"
                                >
                                  {status === 'blocked' && <span className="material-symbols-outlined text-sm select-none">block</span>}
                                  {status === 'preference' && <span className="material-symbols-outlined text-sm select-none">favorite</span>}
                                </div>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex gap-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase select-none">
                        <span className="size-2 rounded-full bg-red-500"></span> Bloqueado
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase select-none">
                        <span className="size-2 rounded-full bg-emerald-500"></span> Preferencia
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase select-none">
                        <span className="size-2 rounded bg-slate-200 dark:bg-slate-700"></span> Disponible
                      </div>
                    </div>
                    <button 
                      onClick={handleSaveAvailability}
                      className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-primary-dark transition-all shadow-sm"
                      disabled={!selectedTeacherId}
                    >
                      Guardar Disponibilidad
                    </button>
                  </div>
                </>
              )}

              {/* Tab 2: Qualified Subjects (Idoneidad Docente) */}
              {activeTab === 'subjects' && (
                <div className="flex-1 flex flex-col overflow-hidden p-4">
                  <div className="mb-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Asignaturas que puede dictar</h3>
                    <p className="text-xs text-slate-400 mt-0.5">El optimizador y el planificador solo sugerirán a este docente para las asignaturas habilitadas aquí.</p>
                  </div>

                  {/* Add Subject Bar */}
                  <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <select
                      value={selectedSubjectToAdd}
                      onChange={e => setSelectedSubjectToAdd(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white"
                    >
                      <option value="">Selecciona una asignatura para habilitar...</option>
                      {allSubjects
                        .filter(s => !teacherSubjects.some(ts => ts.subject_id === s.id))
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.code} · {s.name} (Nivel {s.level})
                          </option>
                        ))}
                    </select>
                    <select
                      value={selectedPriority}
                      onChange={e => setSelectedPriority(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white"
                    >
                      <option value={1}>Titular / Prioridad Alta</option>
                      <option value={2}>Suplente / Respaldo</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddQualifiedSubject}
                      disabled={!selectedSubjectToAdd || savingSubjects}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-base">add</span>
                      Habilitar
                    </button>
                  </div>

                  {/* Qualified Subjects List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
                    {teacherSubjects.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400">
                        <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 block mb-2">school</span>
                        No tiene asignaturas habilitadas aún. Selecciona una arriba para habilitarlo.
                      </div>
                    ) : (
                      teacherSubjects.map(ts => (
                        <div key={ts.subject_id} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                              {ts.subject_code?.slice(0, 4) || 'SUB'}
                            </span>
                            <div>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">{ts.subject_name || ts.subject_code}</p>
                              <p className="text-[10px] text-slate-400">Código: {ts.subject_code} · Nivel {ts.subject_level}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ts.priority === 1
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {ts.priority === 1 ? 'Titular' : 'Suplente'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveQualifiedSubject(ts.subject_id)}
                              className="size-7 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center transition-colors"
                              title="Deshabilitar asignatura"
                            >
                              <span className="material-symbols-outlined text-base">close</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Registration/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="relative bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-md shadow-2xl p-5 sm:p-6 my-auto overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">person</span>
                {editingTeacher ? 'Editar Docente' : 'Registrar Nuevo Docente'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Dra. María Paz Rivas"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                  placeholder="Ej: m.rivas@edu.cl"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Tipo Contrato
                  </label>
                  <select
                    value={formData.contract_type}
                    onChange={(e) => setFormData({ ...formData, contract_type: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                  >
                    <option value="Planta">Planta</option>
                    <option value="Media Jornada">Media Jornada</option>
                    <option value="Honorarios">Honorarios</option>
                    <option value="Adjunto">Adjunto</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Horas Máximas
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={48}
                    value={formData.max_hours_per_week}
                    onChange={(e) => setFormData({ ...formData, max_hours_per_week: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
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
                  {editingTeacher ? 'Guardar Cambios' : 'Registrar Docente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default TeachersPage;
