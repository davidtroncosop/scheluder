import React, { useState, useEffect } from 'react';
import { MainLayout } from '../components/MainLayout';
import * as dataStore from '../lib/dataStore';
import { OFFLINE_DEMO_ENABLED } from '../lib/runtime';
import api from '../services/api';
import { useAcademicPeriods } from '../lib/academicPeriods';
import type { Teacher, Room, TeacherSubject, SubjectRoomCompatibility, SubjectPrerequisite } from '../types';

interface Subject {
  id: string;
  code: string;
  name: string;
  level: number;
  credits: number;
  career_id: string;
}

const AsignaturasPage: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const { selectedPeriod, setSelectedPeriod } = useAcademicPeriods();

  // All teachers and rooms for assignment
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);

  // Modal State for Basic Subject
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    level: 1,
    credits: 4,
    career_id: 'car-default-001',
  });

  // Relational Modal State (Docentes, Salas, Prerrequisitos)
  const [selectedSubjectDetails, setSelectedSubjectDetails] = useState<Subject | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<'teachers' | 'rooms' | 'prereqs'>('teachers');
  const [subjectTeachers, setSubjectTeachers] = useState<TeacherSubject[]>([]);
  const [subjectRooms, setSubjectRooms] = useState<SubjectRoomCompatibility[]>([]);
  const [subjectPrereqs, setSubjectPrereqs] = useState<SubjectPrerequisite[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // New relation selectors
  const [selectedTeacherToAdd, setSelectedTeacherToAdd] = useState('');
  const [selectedTeacherPriority, setSelectedTeacherPriority] = useState<number>(1);
  const [selectedRoomToAdd, setSelectedRoomToAdd] = useState('');
  const [selectedRoomReqLevel, setSelectedRoomReqLevel] = useState<'EXCLUSIVE' | 'PREFERRED' | 'ALLOWED'>('EXCLUSIVE');
  const [selectedPrereqToAdd, setSelectedPrereqToAdd] = useState('');
  const [selectedPrereqType, setSelectedPrereqType] = useState<'MANDATORY' | 'COREQUISITE' | 'RECOMMENDED'>('MANDATORY');

  const loadSubjectsList = async () => {
    setLoading(true);
    try {
      const [remote, teachersList, roomsList] = await Promise.all([
        api.getSubjects(),
        api.getTeachers().catch(() => []),
        api.getRooms().catch(() => []),
      ]);
      setAllTeachers(teachersList as Teacher[]);
      setAllRooms(roomsList as Room[]);
      if (remote.length > 0) {
        const converted = remote as Subject[];
        setSubjects(converted);
        dataStore.saveSubjects(remote.map(s => ({ id: s.id, codigo: s.code, nombre: s.name, nivel: s.level, creditos: s.credits, carrera: s.career_id })));
        setLoading(false);
        return;
      }
    } catch (error) {
      if (!OFFLINE_DEMO_ENABLED) {
        setLoading(false);
        alert(error instanceof Error ? error.message : 'No fue posible cargar las asignaturas');
        return;
      }
    }
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
    setLoading(false);
  };

  useEffect(() => {
    loadSubjectsList();
  }, []);

  // Fetch details for a specific subject
  const openSubjectConstraintsModal = async (subject: Subject) => {
    setSelectedSubjectDetails(subject);
    setLoadingDetails(true);
    try {
      const [teachers, rooms, prereqs] = await Promise.all([
        api.getSubjectTeachers(subject.id).catch(() => []),
        api.getSubjectRooms(subject.id).catch(() => []),
        api.getSubjectPrerequisites(subject.id).catch(() => []),
      ]);
      setSubjectTeachers(teachers);
      setSubjectRooms(rooms);
      setSubjectPrereqs(prereqs);
    } catch {
      setSubjectTeachers([]);
      setSubjectRooms([]);
      setSubjectPrereqs([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Add Qualified Teacher
  const handleAddSubjectTeacher = async () => {
    if (!selectedSubjectDetails || !selectedTeacherToAdd) return;
    const exists = subjectTeachers.some(st => st.teacher_id === selectedTeacherToAdd);
    if (exists) {
      alert('Este docente ya está habilitado para esta asignatura');
      return;
    }
    const targetTeacher = allTeachers.find(t => t.id === selectedTeacherToAdd);
    const updated = [
      ...subjectTeachers,
      {
        teacher_id: selectedTeacherToAdd,
        subject_id: selectedSubjectDetails.id,
        priority: selectedTeacherPriority,
        max_sections: 4,
        teacher_name: targetTeacher?.name,
        teacher_rut: targetTeacher?.rut,
      }
    ];
    try {
      await api.updateTeacherSubjects(selectedTeacherToAdd, [{
        subject_id: selectedSubjectDetails.id,
        priority: selectedTeacherPriority,
        max_sections: 4,
      }]);
      setSubjectTeachers(updated);
      setSelectedTeacherToAdd('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible habilitar al docente');
    }
  };

  // Remove Qualified Teacher
  const handleRemoveSubjectTeacher = async (teacherId: string) => {
    if (!selectedSubjectDetails) return;
    const updated = subjectTeachers.filter(st => st.teacher_id !== teacherId);
    try {
      await api.updateTeacherSubjects(teacherId, []);
      setSubjectTeachers(updated);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible deshabilitar al docente');
    }
  };

  // Add Compatible Room
  const handleAddSubjectRoom = async () => {
    if (!selectedSubjectDetails || !selectedRoomToAdd) return;
    const exists = subjectRooms.some(sr => sr.room_id === selectedRoomToAdd);
    if (exists) {
      alert('Esta sala ya está vinculada a la asignatura');
      return;
    }
    const targetRoom = allRooms.find(r => r.id === selectedRoomToAdd);
    const updated = [
      ...subjectRooms,
      {
        subject_id: selectedSubjectDetails.id,
        room_id: selectedRoomToAdd,
        requirement_level: selectedRoomReqLevel,
        room_name: targetRoom?.name,
        room_type: targetRoom?.type,
        room_capacity: targetRoom?.capacity,
      }
    ];
    try {
      await api.updateSubjectRooms(selectedSubjectDetails.id, updated.map(u => ({
        room_id: u.room_id,
        requirement_level: u.requirement_level,
      })));
      setSubjectRooms(updated);
      setSelectedRoomToAdd('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible vincular la sala');
    }
  };

  // Remove Compatible Room
  const handleRemoveSubjectRoom = async (roomId: string) => {
    if (!selectedSubjectDetails) return;
    const updated = subjectRooms.filter(sr => sr.room_id !== roomId);
    try {
      await api.updateSubjectRooms(selectedSubjectDetails.id, updated.map(u => ({
        room_id: u.room_id,
        requirement_level: u.requirement_level,
      })));
      setSubjectRooms(updated);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible desvincular la sala');
    }
  };

  // Add Prerequisite
  const handleAddPrerequisite = async () => {
    if (!selectedSubjectDetails || !selectedPrereqToAdd) return;
    const exists = subjectPrereqs.some(sp => sp.prerequisite_id === selectedPrereqToAdd);
    if (exists) {
      alert('Esta asignatura ya está agregada como prerrequisito');
      return;
    }
    const targetPrereq = subjects.find(s => s.id === selectedPrereqToAdd);
    const updated = [
      ...subjectPrereqs,
      {
        subject_id: selectedSubjectDetails.id,
        prerequisite_id: selectedPrereqToAdd,
        type: selectedPrereqType,
        prerequisite_name: targetPrereq?.name,
        prerequisite_code: targetPrereq?.code,
        prerequisite_level: targetPrereq?.level,
      }
    ];
    try {
      await api.updateSubjectPrerequisites(selectedSubjectDetails.id, updated.map(u => ({
        prerequisite_id: u.prerequisite_id,
        type: u.type,
      })));
      setSubjectPrereqs(updated);
      setSelectedPrereqToAdd('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible agregar el prerrequisito');
    }
  };

  // Remove Prerequisite
  const handleRemovePrerequisite = async (prereqId: string) => {
    if (!selectedSubjectDetails) return;
    const updated = subjectPrereqs.filter(sp => sp.prerequisite_id !== prereqId);
    try {
      await api.updateSubjectPrerequisites(selectedSubjectDetails.id, updated.map(u => ({
        prerequisite_id: u.prerequisite_id,
        type: u.type,
      })));
      setSubjectPrereqs(updated);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible eliminar el prerrequisito');
    }
  };

  const openModal = (subject?: Subject) => {
    if (subject) {
      setEditingSubject(subject);
      setFormData({
        code: subject.code,
        name: subject.name,
        level: subject.level,
        credits: subject.credits,
        career_id: subject.career_id,
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

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;

    const id = editingSubject ? editingSubject.id : `subj-${Date.now()}`;
    const newSubject: dataStore.ImportedSubject = {
      id,
      codigo: formData.code.toUpperCase(),
      nombre: formData.name,
      nivel: Number(formData.level),
      creditos: Number(formData.credits),
      carrera: formData.career_id,
    };

    try {
      await api.saveSubject({
        id, code: formData.code, name: formData.name, level: Number(formData.level), credits: Number(formData.credits),
      }, Boolean(editingSubject));
    } catch (error) {
      if (!OFFLINE_DEMO_ENABLED) {
        alert(error instanceof Error ? error.message : 'No fue posible guardar la asignatura');
        return;
      }
    }
    dataStore.addOrUpdateSubject(newSubject);
    await loadSubjectsList();
    setIsModalOpen(false);
  };

  const handleDeleteSubject = async (id: string, name: string) => {
    if (window.confirm(`¿Está seguro de que desea eliminar la asignatura "${name}"?`)) {
      try {
        await api.deleteSubject(id);
      } catch (error) {
        if (error instanceof Error && error.message.includes('secciones asociadas')) {
          alert(error.message);
          return;
        }
        if (!OFFLINE_DEMO_ENABLED) {
          alert(error instanceof Error ? error.message : 'No fue posible eliminar la asignatura');
          return;
        }
      }
      dataStore.deleteSubject(id);
      setSubjects(prev => prev.filter(s => s.id !== id));
    }
  };

  const levels = [...new Set(subjects.map(s => s.level))].sort((a, b) => a - b);
  const filteredSubjects = selectedLevel ? subjects.filter(s => s.level === selectedLevel) : subjects;

  return (
    <MainLayout
      title="Asignaturas y Malla"
      selectedPeriod={selectedPeriod}
      onPeriodChange={setSelectedPeriod}
      actions={
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
            {subjects.length} asignaturas
          </span>
          <button 
            type="button"
            onClick={() => openModal()}
            className="flex items-center gap-1.5 bg-primary text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-primary-dark transition-all shadow-md shadow-primary/20"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Nueva Asignatura
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 animate-fade-in">
        {/* Level Filter */}
        <div className="flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedLevel(null)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
              !selectedLevel ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Todos los niveles
          </button>
          {levels.map(level => (
            <button
              key={level}
              type="button"
              onClick={() => setSelectedLevel(level)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                selectedLevel === level ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
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
              <div key={subject.id} className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      {subject.code.slice(0, 4)}
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-primary rounded text-[10px] font-black uppercase transition-colors tracking-wider">
                      Nivel {subject.level}
                    </span>
                  </div>

                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subject.code}</span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 line-clamp-1">{subject.name}</h3>
                  <p className="text-xs text-slate-400 mb-4">{subject.credits} créditos académicos</p>
                </div>

                <div>
                  {/* Action to open constraints manager */}
                  <button
                    type="button"
                    onClick={() => openSubjectConstraintsModal(subject)}
                    className="w-full mb-3 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-primary/10 hover:text-primary text-slate-600 dark:text-slate-300 text-xs font-bold transition-all border border-slate-200 dark:border-slate-700"
                  >
                    <span className="material-symbols-outlined text-base">tune</span>
                    Restricciones y Docentes
                  </button>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-1">
                    <button 
                      type="button"
                      onClick={() => openModal(subject)}
                      className="size-8 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center"
                      title="Editar Asignatura"
                    >
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button 
                      type="button"
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

      {/* Relational Constraints Modal (Docentes Habilitados, Salas Exclusivas, Prerrequisitos) */}
      {selectedSubjectDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-7 my-auto max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0 pr-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-primary">Configuración Académica</span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                  {selectedSubjectDetails.name} ({selectedSubjectDetails.code})
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedSubjectDetails(null)}
                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all shrink-0"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-850 p-1 rounded-xl my-4 gap-1 overflow-x-auto custom-scrollbar shrink-0">
              <button
                type="button"
                onClick={() => setActiveDetailsTab('teachers')}
                className={`flex-1 min-w-[120px] py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 truncate ${
                  activeDetailsTab === 'teachers' ? 'bg-white dark:bg-slate-900 text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">groups</span>
                Docentes ({subjectTeachers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailsTab('rooms')}
                className={`flex-1 min-w-[120px] py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 truncate ${
                  activeDetailsTab === 'rooms' ? 'bg-white dark:bg-slate-900 text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">meeting_room</span>
                Salas ({subjectRooms.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailsTab('prereqs')}
                className={`flex-1 min-w-[120px] py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 truncate ${
                  activeDetailsTab === 'prereqs' ? 'bg-white dark:bg-slate-900 text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">account_tree</span>
                Prerrequisitos ({subjectPrereqs.length})
              </button>
            </div>

            {loadingDetails ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full"></div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {/* TAB 1: TEACHERS */}
                {activeDetailsTab === 'teachers' && (
                  <div>
                    <p className="text-xs text-slate-500 mb-3">
                      Define qué profesores están certificados para dictar esta materia. El optimizador solo asignará docentes de esta lista.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <select
                        value={selectedTeacherToAdd}
                        onChange={e => setSelectedTeacherToAdd(e.target.value)}
                        className="w-full sm:flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white truncate"
                      >
                        <option value="">Selecciona un docente...</option>
                        {allTeachers
                          .filter(t => !subjectTeachers.some(st => st.teacher_id === t.id))
                          .map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.contract_type})
                            </option>
                          ))}
                      </select>
                      <select
                        value={selectedTeacherPriority}
                        onChange={e => setSelectedTeacherPriority(Number(e.target.value))}
                        className="w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white"
                      >
                        <option value={1}>Titular</option>
                        <option value={2}>Suplente</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddSubjectTeacher}
                        disabled={!selectedTeacherToAdd}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark disabled:opacity-40 shrink-0"
                      >
                        Habilitar
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
                      {subjectTeachers.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          No hay docentes habilitados para esta asignatura.
                        </div>
                      ) : (
                        subjectTeachers.map(st => (
                          <div key={st.teacher_id} className="flex items-center justify-between p-3 gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{st.teacher_name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{st.teacher_rut || 'Sin RUT'}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                st.priority === 1 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {st.priority === 1 ? 'Titular' : 'Suplente'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveSubjectTeacher(st.teacher_id)}
                                className="size-7 rounded text-slate-400 hover:text-red-500 flex items-center justify-center"
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

                {/* TAB 2: ROOMS */}
                {activeDetailsTab === 'rooms' && (
                  <div>
                    <p className="text-xs text-slate-500 mb-3">
                      Establece salas específicas o exclusivas para los laboratorios y cátedras de esta asignatura.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <select
                        value={selectedRoomToAdd}
                        onChange={e => setSelectedRoomToAdd(e.target.value)}
                        className="w-full sm:flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white truncate"
                      >
                        <option value="">Selecciona una sala...</option>
                        {allRooms
                          .filter(r => !subjectRooms.some(sr => sr.room_id === r.id))
                          .map(r => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.type} · Cap: {r.capacity})
                            </option>
                          ))}
                      </select>
                      <select
                        value={selectedRoomReqLevel}
                        onChange={e => setSelectedRoomReqLevel(e.target.value as any)}
                        className="w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white"
                      >
                        <option value="EXCLUSIVE">Exclusiva</option>
                        <option value="PREFERRED">Preferente</option>
                        <option value="ALLOWED">Permitida</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddSubjectRoom}
                        disabled={!selectedRoomToAdd}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark disabled:opacity-40 shrink-0"
                      >
                        Vincular
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
                      {subjectRooms.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          Sin salas restringidas. La asignatura puede usar cualquier sala compatible.
                        </div>
                      ) : (
                        subjectRooms.map(sr => (
                          <div key={sr.room_id} className="flex items-center justify-between p-3 gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{sr.room_name}</p>
                              <p className="text-[10px] text-slate-400 truncate">Tipo: {sr.room_type} · Capacidad: {sr.room_capacity}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                sr.requirement_level === 'EXCLUSIVE'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-500/20'
                                  : sr.requirement_level === 'PREFERRED'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {sr.requirement_level === 'EXCLUSIVE' ? 'Exclusiva' : sr.requirement_level === 'PREFERRED' ? 'Preferente' : 'Permitida'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveSubjectRoom(sr.room_id)}
                                className="size-7 rounded text-slate-400 hover:text-red-500 flex items-center justify-center"
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

                {/* TAB 3: PREREQUISITES */}
                {activeDetailsTab === 'prereqs' && (
                  <div>
                    <p className="text-xs text-slate-500 mb-3">
                      Asignaturas previas requeridas en la malla curricular.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <select
                        value={selectedPrereqToAdd}
                        onChange={e => setSelectedPrereqToAdd(e.target.value)}
                        className="w-full sm:flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white truncate"
                      >
                        <option value="">Selecciona ramo previo...</option>
                        {subjects
                          .filter(s => s.id !== selectedSubjectDetails.id && !subjectPrereqs.some(sp => sp.prerequisite_id === s.id))
                          .map(s => (
                            <option key={s.id} value={s.id}>
                              {s.code} · {s.name} (Nivel {s.level})
                            </option>
                          ))}
                      </select>
                      <select
                        value={selectedPrereqType}
                        onChange={e => setSelectedPrereqType(e.target.value as any)}
                        className="w-full sm:w-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white"
                      >
                        <option value="MANDATORY">Obligatorio</option>
                        <option value="COREQUISITE">Correquisito</option>
                        <option value="RECOMMENDED">Recomendado</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddPrerequisite}
                        disabled={!selectedPrereqToAdd}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark disabled:opacity-40 shrink-0"
                      >
                        Agregar
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
                      {subjectPrereqs.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          Sin prerrequisitos registrados.
                        </div>
                      ) : (
                        subjectPrereqs.map(sp => (
                          <div key={sp.prerequisite_id} className="flex items-center justify-between p-3 gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{sp.prerequisite_name}</p>
                              <p className="text-[10px] text-slate-400 truncate">Código: {sp.prerequisite_code} · Nivel {sp.prerequisite_level}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                sp.type === 'MANDATORY' ? 'bg-red-100 text-red-800 dark:bg-red-500/20' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {sp.type === 'MANDATORY' ? 'Obligatorio' : sp.type === 'COREQUISITE' ? 'Correquisito' : 'Recomendado'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemovePrerequisite(sp.prerequisite_id)}
                                className="size-7 rounded text-slate-400 hover:text-red-500 flex items-center justify-center"
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
            )}
          </div>
        </div>
      )}

      {/* Modal de Registro/Edición Básica de Asignatura */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 my-auto overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">menu_book</span>
                {editingSubject ? 'Editar Asignatura' : 'Registrar Nueva Asignatura'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveSubject} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Código
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: DMOR0030"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 px-3 py-2.5 text-xs text-slate-900 dark:text-white font-mono uppercase focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Nombre de Asignatura
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Morfología Humana"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-medium focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
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
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-medium focus:border-primary focus:outline-none"
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
                    max={30}
                    value={formData.credits}
                    onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-medium focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark shadow-md shadow-primary/20 transition-all"
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
