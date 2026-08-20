import React, { useState, useEffect } from 'react';
import type { SchedulerSection as Section } from '../model';
import type { ImportedSubject } from '../../../lib/dataStore';

interface SectionModalProps {
  section: Section | null;
  isOpen: boolean;
  onClose: () => void;
  allSubjects: ImportedSubject[];
  availableTeachers: string[];
  existingTheories: Section[];
  defaultLevel?: number;
  initialValues?: Partial<Section> | null;
  onSave: (data: {
    id?: string;
    nrc: string;
    section_code?: string;
    subject_id: string;
    type: string;
    hours_per_week: number;
    level: number;
    expected_students?: number;
    teacher_name: string;
    parent_section_id: string;
  }) => Promise<void>;
  onDelete?: (sectionId: string) => Promise<void>;
}

export const SectionModal: React.FC<SectionModalProps> = ({
  section,
  isOpen,
  onClose,
  allSubjects,
  availableTeachers,
  existingTheories,
  defaultLevel,
  initialValues,
  onSave,
  onDelete,
}) => {
  const [nrc, setNrc] = useState('');
  const [sectionCode, setSectionCode] = useState('1');
  const [subjectId, setSubjectId] = useState('');
  const [type, setType] = useState('TEO');
  const [hours, setHours] = useState(2);
  const [level, setLevel] = useState(1);
  const [expectedStudents, setExpectedStudents] = useState(30);
  const [teacherName, setTeacherName] = useState('');
  const [parentSectionId, setParentSectionId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (section) {
      setNrc(section.nrc || '');
      setSectionCode((section as any).section_code || '1');
      setSubjectId(section.subject_id || '');
      setType(section.type || 'TEO');
      setHours(Number(section.hours_per_week || 2));
      setLevel(Number(section.level || 1));
      setExpectedStudents(Number(section.expected_students || 30));
      setTeacherName(section.teacher_name || '');
      setParentSectionId(section.parent_section_id || '');
    } else if (initialValues) {
      setNrc(initialValues.nrc || '');
      setSectionCode((initialValues as any).section_code || '2');
      setSubjectId(initialValues.subject_id || allSubjects[0]?.id || '');
      setType(initialValues.type || 'TEO');
      setHours(Number(initialValues.hours_per_week || 2));
      setLevel(Number(initialValues.level || defaultLevel || 1));
      setExpectedStudents(Number(initialValues.expected_students || 30));
      setTeacherName(initialValues.teacher_name || '');
      setParentSectionId(initialValues.parent_section_id || '');
    } else {
      setNrc('');
      setSectionCode('1');
      const targetLvl = defaultLevel && defaultLevel > 0 ? defaultLevel : 1;
      const matchedSubjects = allSubjects.filter(s => Number(s.nivel || 1) === targetLvl);
      const chosenSub = matchedSubjects[0] || allSubjects[0];
      setSubjectId(chosenSub?.id || '');
      setType('TEO');
      setHours(2);
      setLevel(targetLvl);
      setExpectedStudents(30);
      setTeacherName('');
      setParentSectionId('');
    }
  }, [section, allSubjects, defaultLevel, initialValues]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        id: section?.id,
        nrc,
        section_code: sectionCode,
        subject_id: subjectId,
        type,
        hours_per_week: hours,
        level,
        expected_students: expectedStudents,
        teacher_name: teacherName,
        parent_section_id: type === 'TEO' ? '' : parentSectionId,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {section ? 'Editar Sección' : initialValues ? 'Crear Sección Paralela' : 'Nueva Sección'}
            </h3>
            <p className="text-xs text-slate-500">
              {section ? `NRC ${section.nrc}` : initialValues ? 'Crea un nuevo paralelo (ej. Sección 2) para esta asignatura' : 'Define un nuevo bloque de curso en el catálogo'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-3 gap-3">
            {/* NRC */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                NRC *
              </label>
              <input
                type="text"
                required
                value={nrc}
                onChange={(e) => setNrc(e.target.value)}
                placeholder="Ej: 10423"
                className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white font-mono font-bold"
              />
            </div>

            {/* Section / Paralelo */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Sección / Paralelo
              </label>
              <select
                value={sectionCode}
                onChange={(e) => setSectionCode(e.target.value)}
                className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white font-bold"
              >
                <option value="1">Sección 1</option>
                <option value="2">Sección 2</option>
                <option value="3">Sección 3</option>
                <option value="4">Sección 4</option>
                <option value="5">Sección 5</option>
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tipo
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white font-semibold"
              >
                <option value="TEO">Teoría (TEO)</option>
                <option value="LAB">Laboratorio (LAB)</option>
                <option value="TAL">Taller (TAL)</option>
                <option value="SIM">Simulación (SIM)</option>
              </select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Asignatura *
            </label>
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                const sub = allSubjects.find(s => s.id === e.target.value);
                if (sub) setLevel(Number(sub.nivel || 1));
              }}
              required
              className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
            >
              {allSubjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.codigo} - {s.nombre} (Nivel {s.nivel})
                </option>
              ))}
            </select>
          </div>

          {/* Parent Section (if practical) */}
          {type !== 'TEO' && (
            <div className="bg-primary/5 p-3 rounded-xl border border-primary/20">
              <label className="block text-xs font-bold text-primary mb-1">
                Sección Teórica Padre (NRC Teórico) *
              </label>
              <select
                value={parentSectionId}
                onChange={(e) => setParentSectionId(e.target.value)}
                required
                className="w-full text-xs bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
              >
                <option value="">Seleccionar sección teórica padre...</option>
                {existingTheories
                  .filter(t => !section || t.id !== section.id)
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      NRC {t.nrc} - {t.subject_name || t.subject_code}
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                La práctica nunca se solapará en el mismo horario con su teoría padre.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {/* Hours */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Horas / Sem.
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value) || 2)}
                className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white font-mono"
              />
            </div>

            {/* Level */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nivel
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value) || 1)}
                className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white font-mono"
              />
            </div>

            {/* Expected Students */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Alumnos
              </label>
              <input
                type="number"
                min="1"
                max="300"
                value={expectedStudents}
                onChange={(e) => setExpectedStudents(parseInt(e.target.value) || 30)}
                className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white font-mono"
                title="Cantidad de alumnos matriculados o esperados en esta sección"
              />
            </div>
          </div>

          {/* Teacher */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Docente Asignado
            </label>
            <select
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
            >
              <option value="">Sin docente asignado</option>
              {availableTeachers.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
            {section && onDelete ? (
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm('¿Eliminar esta sección?')) {
                    setBusy(true);
                    try {
                      await onDelete(section.id);
                      onClose();
                    } finally {
                      setBusy(false);
                    }
                  }
                }}
                disabled={busy}
                className="text-xs text-rose-600 dark:text-rose-400 font-bold hover:underline"
              >
                Eliminar Sección
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 text-xs font-bold bg-primary text-white hover:bg-primary/90 rounded-lg shadow-xs"
              >
                {busy ? 'Guardando...' : 'Guardar Sección'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
