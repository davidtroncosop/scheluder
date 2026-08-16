import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '../lib/router';
import { MainLayout } from '../components/MainLayout';
import { useAcademicPeriods } from '../lib/academicPeriods';
import { session } from '../lib/session';
import api from '../services/api';
import { parseCsv, type CsvRow } from '../features/imports/csv';
import {
  buildAssignmentQueue,
  calculateCoverage,
  validateScheduleImport,
  type AssistedImportValidation,
} from '../features/assisted-planner/workflow';
import type { AssignmentWithDetails, Career, Conflict, SectionWithDetails } from '../types';

type WizardStep = 1 | 2 | 3 | 4;
type ImportMode = 'merge' | 'replace';

interface ContextConflict extends Conflict {
  subject_name?: string;
  nrc?: string;
  teacher_name?: string | null;
  timeslot_label?: string;
  day_of_week?: number;
}

const steps: Array<{ id: WizardStep; label: string; detail: string; icon: string }> = [
  { id: 1, label: 'Contexto', detail: 'Carrera y período', icon: 'school' },
  { id: 2, label: 'Carga', detail: 'Archivo de secciones', icon: 'upload_file' },
  { id: 3, label: 'Propuesta', detail: 'Generación automática', icon: 'auto_awesome' },
  { id: 4, label: 'Revisión', detail: 'Validar y publicar', icon: 'task_alt' },
];

const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const AssistedPlannerPage: React.FC = () => {
  const { periods, selectedPeriod, setSelectedPeriod } = useAcademicPeriods();
  const currentUser = session.getUser();
  const isAdmin = currentUser?.role === 'admin';
  const [careers, setCareers] = useState<Career[]>([]);
  const [selectedCareer, setSelectedCareer] = useState(currentUser?.career_id || '');
  const [step, setStep] = useState<WizardStep>(1);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [validation, setValidation] = useState<AssistedImportValidation | null>(null);
  const [sections, setSections] = useState<SectionWithDetails[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [conflicts, setConflicts] = useState<ContextConflict[]>([]);
  const [scheduleStatus, setScheduleStatus] = useState<'draft' | 'review' | 'published'>('draft');
  const [busy, setBusy] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    api.getCareers().then(result => {
      setCareers(result);
      if (!selectedCareer && result[0]) setSelectedCareer(result[0].id);
    }).catch(error => setNotice({ type: 'error', message: error instanceof Error ? error.message : 'No se pudieron cargar las carreras' }));
  }, [selectedCareer]);

  const refreshContext = useCallback(async () => {
    if (!selectedPeriod || !selectedCareer) return;
    const [sectionRows, assignmentRows, conflictRows, status] = await Promise.all([
      api.getSectionsForContext(selectedPeriod, selectedCareer),
      api.getSchedule(selectedPeriod, selectedCareer),
      api.getConflictsForContext(selectedPeriod, selectedCareer),
      api.getScheduleStatus(selectedPeriod, selectedCareer),
    ]);
    setSections(sectionRows);
    setAssignments(assignmentRows);
    setConflicts(conflictRows as ContextConflict[]);
    setScheduleStatus(status.status);
  }, [selectedCareer, selectedPeriod]);

  useEffect(() => {
    if (!selectedPeriod || !selectedCareer) return;
    refreshContext().catch(error => setNotice({ type: 'error', message: error instanceof Error ? error.message : 'No fue posible cargar la planificación' }));
  }, [refreshContext, selectedCareer, selectedPeriod]);

  const selectedPeriodInfo = periods.find(period => period.id === selectedPeriod);
  const selectedCareerInfo = careers.find(career => career.id === selectedCareer);
  const totalRequired = useMemo(() => sections.reduce((total, section) => total + Number(section.hours_per_week || 0), 0), [sections]);
  const coverage = calculateCoverage(totalRequired, assignments.length);
  const criticalConflicts = conflicts.filter(conflict => conflict.type === 'CRITICAL');
  const warningConflicts = conflicts.filter(conflict => conflict.type === 'WARNING');
  const canPublish = totalRequired > 0 && assignments.length >= totalRequired && criticalConflicts.length === 0;

  const readFile = async (file?: File) => {
    if (!file) return;
    setNotice(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setValidation({ valid: false, errors: ['El archivo debe estar en formato CSV'], matchedHeaders: {} });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setValidation({ valid: false, errors: ['El archivo supera el máximo de 5 MB'], matchedHeaders: {} });
      return;
    }
    try {
      const parsed = parseCsv(await file.text());
      const result = validateScheduleImport(parsed.headers, parsed.rows);
      setFileName(file.name);
      setRows(parsed.rows);
      setValidation(result);
      if (result.valid) setNotice({ type: 'success', message: `${parsed.rows.length} filas listas para importar` });
    } catch (error) {
      setRows([]);
      setValidation({ valid: false, errors: [error instanceof Error ? error.message : 'No fue posible leer el archivo'], matchedHeaders: {} });
    }
  };

  const importFile = async () => {
    if (!validation?.valid || !selectedPeriod || !selectedCareer) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.importSchedule(rows, selectedPeriod, selectedCareer, importMode);
      await refreshContext();
      setNotice({ type: 'success', message: result.message || `${result.inserted} secciones procesadas` });
      setStep(3);
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'No fue posible importar el archivo' });
    } finally {
      setBusy(false);
    }
  };

  const generateProposal = async () => {
    if (!sections.length || !selectedPeriod) return;
    setBusy(true);
    setNotice(null);
    const queue = buildAssignmentQueue(sections);
    let completed = 0;
    let failed = 0;
    setGenerationProgress({ done: 0, total: queue.length, failed: 0 });

    for (const sectionId of queue) {
      try {
        const scores = await api.getSlotScores(sectionId, selectedPeriod);
        const best = scores.find(score => !score.blocked);
        if (!best) {
          failed++;
        } else {
          await api.assignSection({
            section_id: sectionId,
            room_id: best.room_id,
            timeslot_id: best.timeslot_id,
            day_of_week: best.day_of_week,
            period_id: selectedPeriod,
          });
          completed++;
        }
      } catch {
        failed++;
      }
      setGenerationProgress(progress => ({ ...progress, done: progress.done + 1, failed }));
    }

    try {
      await refreshContext();
      setNotice({
        type: failed ? 'info' : 'success',
        message: failed
          ? `Se asignaron ${completed} bloques. ${failed} requieren revisión manual.`
          : `Propuesta generada: ${completed} bloques asignados automáticamente.`,
      });
      setStep(4);
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'La propuesta se generó, pero no pudo recargarse' });
    } finally {
      setBusy(false);
    }
  };

  const resolveConflict = async (conflictId: string) => {
    setBusy(true);
    try {
      await api.resolveConflict(conflictId, true);
      await refreshContext();
      setNotice({ type: 'success', message: 'Conflicto resuelto con la mejor alternativa disponible' });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'No existe una alternativa automática' });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!selectedPeriod || !selectedCareer) return;
    setBusy(true);
    try {
      await api.publishSchedule(selectedPeriod, selectedCareer);
      await refreshContext();
      setNotice({ type: 'success', message: 'Horario publicado correctamente' });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'No fue posible publicar el horario' });
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const content = `nrc,codigo,nombre,nivel,horas,tipo,rut_docente,estudiantes,nrc_teorico,seccion
10001,DMOR0030,Morfología TEO,3,2,TEO,12.345.678-9,50,,T1
10002,DMOR0030,Morfología LAB grupo 1,3,2,LAB,11.111.111-1,25,10001,P1
10003,DMOR0030,Morfología LAB grupo 2,3,2,LAB,22.222.222-2,25,10001,P2`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    link.download = 'plantilla_planificacion.csv';
    link.click();
  };

  const moveToStep = (next: WizardStep) => {
    if (next > 1 && (!selectedPeriod || !selectedCareer)) {
      setNotice({ type: 'error', message: 'Selecciona una carrera y un período para continuar' });
      return;
    }
    setNotice(null);
    setStep(next);
  };

  return (
    <MainLayout
      title="Planificación asistida"
      showPeriodSelector={false}
      actions={(
        <Link to="/scheduler" className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-lg">tune</span>
          Modo avanzado
        </Link>
      )}
    >
      <section className="overflow-hidden rounded-[28px] bg-[#0b2138] text-white shadow-xl shadow-slate-900/10">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.2fr_1fr] lg:px-9">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
              <span className="material-symbols-outlined text-lg">route</span>
              Asistente de planificación
            </div>
            <h2 className="max-w-2xl text-2xl font-black tracking-tight sm:text-3xl">Del archivo al horario, con una decisión clara en cada etapa.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Carga las secciones, genera una propuesta respetando disponibilidad y salas, revisa las excepciones y publica.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 self-end">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-2xl font-black">{sections.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Secciones</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-2xl font-black">{coverage}%</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cobertura</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-2xl font-black text-amber-300">{criticalConflicts.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Críticos</p>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="Progreso de planificación" className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-4">
        {steps.map(item => {
          const active = step === item.id;
          const completed = step > item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => moveToStep(item.id)}
              className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${active ? 'bg-primary text-white shadow-md shadow-primary/20' : completed ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'}`}
            >
              <span className={`material-symbols-outlined flex size-8 shrink-0 items-center justify-center rounded-lg text-lg ${active ? 'bg-white/15' : completed ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{completed ? 'check' : item.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-black">{item.id}. {item.label}</span>
                <span className={`block truncate text-[10px] ${active ? 'text-white/70' : 'text-slate-400'}`}>{item.detail}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {notice && (
        <div role="status" className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200' : notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-500/10 dark:text-rose-200' : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-500/10 dark:text-blue-200'}`}>
          <span className="material-symbols-outlined text-lg">{notice.type === 'success' ? 'check_circle' : notice.type === 'error' ? 'error' : 'info'}</span>
          <span>{notice.message}</span>
        </div>
      )}

      <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        {step === 1 && (
          <div className="mx-auto max-w-3xl">
            <div className="mb-7">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-primary">Paso 1</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">¿Qué horario vamos a preparar?</h3>
              <p className="mt-2 text-sm text-slate-500">Todo lo que cargues y generes quedará aislado en esta carrera y período.</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Carrera</span>
                {isAdmin ? (
                  <select value={selectedCareer} onChange={event => setSelectedCareer(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <option value="">Selecciona una carrera</option>
                    {careers.map(career => <option key={career.id} value={career.id}>{career.code} · {career.name}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <span className="material-symbols-outlined text-primary">school</span>
                    {selectedCareerInfo?.name || 'Carrera asignada'}
                  </div>
                )}
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Período académico</span>
                <select value={selectedPeriod} onChange={event => setSelectedPeriod(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                  <option value="">Selecciona un período</option>
                  {periods.map(period => <option key={period.id} value={period.id}>{period.code} · {period.name}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-500/5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-cyan-600">verified_user</span>
                <div>
                  <p className="text-sm font-black text-slate-800 dark:text-white">Contexto protegido</p>
                  <p className="text-xs text-slate-500">Los NRC y horarios de otras carreras o períodos no serán modificados.</p>
                </div>
              </div>
              <button type="button" onClick={() => moveToStep(2)} disabled={!selectedCareer || !selectedPeriod} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40">
                Continuar <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.15em] text-primary">Paso 2</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Carga las secciones del período</h3>
                <p className="mt-2 text-sm text-slate-500">Un archivo CSV puede crear el backlog completo de {selectedCareerInfo?.name} para {selectedPeriodInfo?.code}.</p>
              </div>
              <button type="button" onClick={downloadTemplate} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-300">
                <span className="material-symbols-outlined text-lg">download</span> Descargar plantilla
              </button>
            </div>

            <label className={`mt-7 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${validation?.valid ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-500/5' : 'border-slate-300 bg-slate-50 hover:border-primary hover:bg-primary/5 dark:border-slate-700 dark:bg-slate-800/40'}`}>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={event => readFile(event.target.files?.[0])} />
              <span className={`material-symbols-outlined flex size-14 items-center justify-center rounded-2xl text-3xl ${validation?.valid ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20' : 'bg-white text-primary shadow-sm dark:bg-slate-800'}`}>{validation?.valid ? 'check_circle' : 'upload_file'}</span>
              <p className="mt-4 text-base font-black text-slate-900 dark:text-white">{fileName || 'Selecciona o arrastra tu archivo CSV'}</p>
              <p className="mt-1 text-xs text-slate-500">Máximo 5 MB · Columnas: nrc, codigo, nombre, nivel, horas</p>
            </label>

            {validation && !validation.valid && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-500/10">
                <p className="text-sm font-black text-rose-800 dark:text-rose-200">Corrige el archivo antes de continuar</p>
                <ul className="mt-2 space-y-1 text-xs text-rose-700 dark:text-rose-300">
                  {validation.errors.slice(0, 8).map(error => <li key={error}>• {error}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-white">¿Cómo tratar datos existentes?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setImportMode('merge')} className={`rounded-lg px-3 py-2 text-xs font-bold ${importMode === 'merge' ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>Agregar y actualizar</button>
                  <button type="button" onClick={() => setImportMode('replace')} className={`rounded-lg px-3 py-2 text-xs font-bold ${importMode === 'replace' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>Reemplazar período</button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">{importMode === 'merge' ? 'Conserva lo existente y actualiza NRC repetidos.' : 'Elimina primero las secciones y horarios de esta carrera/período.'}</p>
              </div>
              <div className="flex gap-2">
                {sections.length > 0 && <button type="button" onClick={() => moveToStep(3)} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">Usar backlog actual</button>}
                <button type="button" onClick={importFile} disabled={!validation?.valid || busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-white shadow-md shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-40">
                  {busy && <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                  Importar y continuar
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mx-auto max-w-4xl">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.15em] text-primary">Paso 3</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Genera la primera propuesta</h3>
              <p className="mt-2 text-sm text-slate-500">El motor prioriza disponibilidad docente, sala compatible, capacidad y continuidad por nivel.</p>
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
                <span className="material-symbols-outlined text-primary">format_list_numbered</span>
                <p className="mt-3 text-3xl font-black text-slate-900 dark:text-white">{sections.length}</p>
                <p className="text-xs font-bold text-slate-500">Secciones en backlog</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
                <span className="material-symbols-outlined text-cyan-600">view_timeline</span>
                <p className="mt-3 text-3xl font-black text-slate-900 dark:text-white">{Math.max(0, totalRequired - assignments.length)}</p>
                <p className="text-xs font-bold text-slate-500">Bloques por asignar</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
                <span className="material-symbols-outlined text-emerald-600">event_available</span>
                <p className="mt-3 text-3xl font-black text-slate-900 dark:text-white">{assignments.length}</p>
                <p className="text-xs font-bold text-slate-500">Ya asignados</p>
              </div>
            </div>

            {busy && generationProgress.total > 0 && (
              <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-500/10">
                <div className="flex items-center justify-between text-sm font-black text-blue-900 dark:text-blue-100">
                  <span>Construyendo propuesta…</span>
                  <span>{generationProgress.done}/{generationProgress.total}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${generationProgress.total ? (generationProgress.done / generationProgress.total) * 100 : 0}%` }} />
                </div>
                <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">{generationProgress.failed ? `${generationProgress.failed} bloques requieren revisión` : 'Aplicando reglas y comprobando disponibilidad'}</p>
              </div>
            )}

            {!sections.length ? (
              <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-200">No hay secciones para generar. Regresa a la carga y agrega el archivo del período.</div>
            ) : (
              <div className="mt-7 flex flex-col gap-3 rounded-2xl bg-slate-50 p-5 dark:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">Listo para calcular {Math.max(0, totalRequired - assignments.length)} bloques</p>
                  <p className="mt-1 text-xs text-slate-500">Las asignaciones existentes se conservan. Solo se completan los espacios pendientes.</p>
                </div>
                <button type="button" onClick={generateProposal} disabled={busy || assignments.length >= totalRequired} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b2138] px-6 py-3 text-sm font-black text-white shadow-md transition hover:bg-[#123555] disabled:cursor-not-allowed disabled:opacity-40">
                  <span className="material-symbols-outlined text-lg">auto_awesome</span>
                  {assignments.length >= totalRequired ? 'Propuesta completa' : 'Generar propuesta'}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.15em] text-primary">Paso 4</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Revisa antes de publicar</h3>
                <p className="mt-2 text-sm text-slate-500">El sistema bloquea la publicación si falta cobertura o existe un conflicto crítico.</p>
              </div>
              <div className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-black ${scheduleStatus === 'published' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                <span className="material-symbols-outlined text-base">{scheduleStatus === 'published' ? 'verified' : 'edit_note'}</span>
                {scheduleStatus === 'published' ? 'Publicado' : 'Borrador'}
              </div>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-[1.1fr_1fr]">
              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Cobertura</p>
                    <p className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{coverage}%</p>
                  </div>
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-3xl">donut_large</span>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full ${coverage === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${coverage}%` }} />
                </div>
                <p className="mt-3 text-xs text-slate-500">{assignments.length} de {totalRequired} bloques asignados.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Validaciones</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Conflictos críticos</span><span className={`font-black ${criticalConflicts.length ? 'text-rose-600' : 'text-emerald-600'}`}>{criticalConflicts.length}</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Advertencias</span><span className="font-black text-amber-600">{warningConflicts.length}</span></div>
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Bloques pendientes</span><span className="font-black text-slate-900 dark:text-white">{Math.max(0, totalRequired - assignments.length)}</span></div>
                </div>
              </div>
            </div>

            {conflicts.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">Excepciones que requieren atención</h4>
                <div className="mt-3 space-y-3">
                  {conflicts.map(conflict => (
                    <div key={conflict.id} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${conflict.type === 'CRITICAL' ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-500/5' : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-500/5'}`}>
                      <div className="flex items-start gap-3">
                        <span className={`material-symbols-outlined ${conflict.type === 'CRITICAL' ? 'text-rose-600' : 'text-amber-600'}`}>{conflict.type === 'CRITICAL' ? 'error' : 'warning'}</span>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white">{conflict.subject_name || conflict.rule_code} {conflict.nrc ? `· NRC ${conflict.nrc}` : ''}</p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{conflict.description}</p>
                          {conflict.day_of_week && <p className="mt-1 text-[11px] font-bold text-slate-400">{dayNames[conflict.day_of_week - 1]} · {conflict.timeslot_label}</p>}
                        </div>
                      </div>
                      <button type="button" onClick={() => resolveConflict(conflict.id)} disabled={busy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-primary shadow-sm ring-1 ring-slate-200 hover:bg-primary hover:text-white dark:bg-slate-900 dark:ring-slate-700">
                        <span className="material-symbols-outlined text-lg">auto_fix</span> Resolver
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-7 flex flex-col gap-3 rounded-2xl bg-[#0b2138] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-black">{scheduleStatus === 'published' ? 'Horario publicado' : canPublish ? 'Todo listo para publicar' : 'Todavía falta completar la propuesta'}</p>
                <p className="mt-1 text-xs text-slate-300">{canPublish ? 'Al publicar, el horario quedará visible como versión oficial.' : 'Completa los bloques y resuelve los conflictos críticos.'}</p>
              </div>
              <div className="flex gap-2">
                <Link to="/scheduler" className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-3 text-xs font-black text-white hover:bg-white/10">Ajustar manualmente</Link>
                <button type="button" onClick={publish} disabled={!canPublish || busy || scheduleStatus === 'published'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">
                  <span className="material-symbols-outlined text-lg">publish</span>
                  {scheduleStatus === 'published' ? 'Publicado' : 'Publicar horario'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </MainLayout>
  );
};

export default AssistedPlannerPage;
