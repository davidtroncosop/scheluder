import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '../lib/router';
import { MainLayout } from '../components/MainLayout';
import { useAcademicPeriods } from '../lib/academicPeriods';
import { session } from '../lib/session';
import api from '../services/api';
import { parseCsv, type CsvRow } from '../features/imports/csv';
import {
  buildPrioritizedAssignmentQueue,
  calculateCoverage,
  calculateSectionDifficulty,
  validateScheduleImport,
  type AssistedImportValidation,
} from '../features/assisted-planner/workflow';
import { downloadFile, generateICalendar, generateScheduleCsv } from '../features/scheduler/export';
import type { SolverResult } from '../features/scheduler/solver';
import type { AssignmentWithDetails, Career, Conflict, SectionWithDetails, Teacher, Room } from '../types';

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
  { id: 2, label: 'Carga', detail: 'Archivo o plantilla', icon: 'upload_file' },
  { id: 3, label: 'Propuesta', detail: 'Generación con IA/CSP', icon: 'auto_awesome' },
  { id: 4, label: 'Revisión', detail: 'Exportar y publicar', icon: 'task_alt' },
];

const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const DEMO_CSV_CONTENT = `nrc,codigo,nombre,nivel,horas,tipo,rut_docente,estudiantes,nrc_teorico,seccion
10001,DMOR0030,Morfología Humana TEO,1,4,TEO,12.345.678-9,50,,T1
10002,DMOR0030,Morfología LAB grupo 1,1,2,LAB,11.111.111-1,25,10001,P1
10003,DMOR0030,Morfología LAB grupo 2,1,2,LAB,22.222.222-2,25,10001,P2
10004,DKIN0010,Biomecánica TEO,2,3,TEO,13.333.333-3,40,,T1
10005,DKIN0010,Biomecánica TAL grupo 1,2,2,TAL,14.444.444-4,20,10004,P1
10006,DKIN0020,Simulación Clínica SIM,3,4,SIM,15.555.555-5,15,,T1`;

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
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [scheduleStatus, setScheduleStatus] = useState<'draft' | 'review' | 'published'>('draft');
  const [busy, setBusy] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [proposalResult, setProposalResult] = useState<SolverResult | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    api.getCareers().then(result => {
      setCareers(result);
      if (!selectedCareer && result[0]) setSelectedCareer(result[0].id);
    }).catch(error => setNotice({ type: 'error', message: error instanceof Error ? error.message : 'No se pudieron cargar las carreras' }));

    api.getTeachers().then(setTeachers).catch(() => {});
    api.getRooms().then(setRooms).catch(() => {});
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

  // Calculate difficulty insights for the sections
  const difficultyInsights = useMemo(() => {
    let critical = 0;
    let hard = 0;
    let specializedRooms = 0;
    sections.forEach(s => {
      const diff = calculateSectionDifficulty(s);
      if (diff.level === 'critical') critical++;
      if (diff.level === 'hard') hard++;
      if (s.type === 'SIM' || s.type === 'LAB' || s.type === 'TAL') specializedRooms++;
    });
    return { critical, hard, specializedRooms };
  }, [sections]);

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

  const loadSampleData = () => {
    const parsed = parseCsv(DEMO_CSV_CONTENT);
    const result = validateScheduleImport(parsed.headers, parsed.rows);
    setFileName('ejemplo_demostracion.csv');
    setRows(parsed.rows);
    setValidation(result);
    setNotice({ type: 'success', message: 'Datos de ejemplo cargados (6 secciones listas para importar)' });
  };

  const importFile = async () => {
    if (!validation?.valid || !selectedPeriod || !selectedCareer) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await api.importSchedule(rows, selectedPeriod, selectedCareer, importMode);
      await refreshContext();
      setNotice({ type: 'success', message: result.message || `${result.inserted} secciones procesadas exitosamente` });
      setStep(3);
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'No fue posible importar el archivo' });
    } finally {
      setBusy(false);
    }
  };

  const generateProposal = async () => {
    if (!sections.length || !selectedPeriod || !selectedCareer) return;
    setBusy(true);
    setNotice(null);
    setGenerationProgress({ done: 0, total: 100, failed: 0 });

    try {
      const result = await api.autoAssignSchedule({
        periodId: selectedPeriod,
        careerId: selectedCareer,
        maxBacktrackDepth: 2,
        mode: importMode,
      });

      setProposalResult(result);
      await refreshContext();

      const failedCount = result.unassigned.reduce((sum, u) => sum + u.unassignedHours, 0);
      const deadlockMsg = result.deadlocksResolved > 0
        ? ` (${result.deadlocksResolved} callejones sin salida resueltos mediante reubicación inteligente)`
        : '';

      setNotice({
        type: failedCount > 0 ? 'info' : 'success',
        message: failedCount > 0
          ? `Se asignaron ${result.totalSlotsAssigned} módulos (${result.coveragePercentage}% cobertura)${deadlockMsg}. ${failedCount} módulo(s) requieren atención o ajuste de capacidad.`
          : `¡Propuesta generada con éxito! ${result.totalSlotsAssigned} módulos asignados (${result.coveragePercentage}% cobertura)${deadlockMsg} sin choques en ${result.executionTimeMs}ms.`,
      });
      setStep(4);
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error durante la optimización automática del horario',
      });
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
      setNotice({ type: 'success', message: '¡Horario publicado oficialmente para todos los docentes y alumnos!' });
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'No fue posible publicar el horario' });
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([DEMO_CSV_CONTENT], { type: 'text/csv;charset=utf-8' }));
    link.download = 'plantilla_planificacion.csv';
    link.click();
  };

  const handleExportICal = () => {
    const ics = generateICalendar(assignments as any[], {
      calendarName: `${selectedCareerInfo?.name || 'Horario'} - ${selectedPeriodInfo?.name || selectedPeriod}`,
    });
    downloadFile(ics, `horario_${selectedCareerInfo?.code || 'carrera'}_${selectedPeriod}.ics`, 'text/calendar;charset=utf-8;');
  };

  const handleExportCsv = () => {
    const csv = generateScheduleCsv(assignments as any[]);
    downloadFile(csv, `horario_${selectedCareerInfo?.code || 'carrera'}_${selectedPeriod}.csv`, 'text/csv;charset=utf-8;');
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
          <span className="material-symbols-outlined text-lg">grid_view</span>
          Planificador interactivo
        </Link>
      )}
    >
      {/* Hero Banner */}
      <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0b2138] to-[#123555] text-white shadow-xl shadow-slate-900/10">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.2fr_1fr] lg:px-9">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              Asistente de Horarios en 4 Pasos
            </div>
            <h2 className="max-w-2xl text-2xl font-black tracking-tight sm:text-3xl">Del archivo Excel al horario oficial publicado en minutos.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">El asistente carga tus ramos, calcula automáticamente las mejores salas y horarios sin choques de profesores, y te permite publicar o exportar a Google Calendar.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 self-end">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xs">
              <p className="text-2xl font-black">{sections.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Secciones</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xs">
              <p className="text-2xl font-black">{coverage}%</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cobertura</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xs">
              <p className="text-2xl font-black text-amber-300">{criticalConflicts.length}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conflictos</p>
            </div>
          </div>
        </div>
      </section>

      {/* Steps Navigation Bar */}
      <nav aria-label="Progreso de planificación" className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-4">
        {steps.map(item => {
          const active = step === item.id;
          const completed = step > item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => moveToStep(item.id)}
              className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                active
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : completed
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5'
              }`}
            >
              <span className={`material-symbols-outlined flex size-8 shrink-0 items-center justify-center rounded-lg text-lg ${
                active ? 'bg-white/15' : completed ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-slate-100 dark:bg-slate-800'
              }`}>{completed ? 'check' : item.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-black">{item.id}. {item.label}</span>
                <span className={`block truncate text-[10px] ${active ? 'text-white/70' : 'text-slate-400'}`}>{item.detail}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Notice Alert */}
      {notice && (
        <div role="status" className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold animate-in fade-in duration-200 ${
          notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200' : notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-500/10 dark:text-rose-200' : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-500/10 dark:text-blue-200'
        }`}>
          <span className="material-symbols-outlined text-lg">{notice.type === 'success' ? 'check_circle' : notice.type === 'error' ? 'error' : 'info'}</span>
          <span className="flex-1">{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Step Containers */}
      <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        {/* STEP 1: CONTEXT */}
        {step === 1 && (
          <div className="mx-auto max-w-3xl">
            <div className="mb-7">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-primary">Paso 1 de 4</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">¿Qué horario vamos a preparar?</h3>
              <p className="mt-2 text-sm text-slate-500">Selecciona la carrera y el período académico que deseas armar. Todo quedará protegido y aislado en este contexto.</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Carrera</span>
                {isAdmin ? (
                  <select
                    value={selectedCareer}
                    onChange={event => setSelectedCareer(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                  >
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
                <select
                  value={selectedPeriod}
                  onChange={event => setSelectedPeriod(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 focus:border-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
                >
                  <option value="">Selecciona un período</option>
                  {periods.map(period => <option key={period.id} value={period.id}>{period.code} · {period.name}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-500/5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-cyan-600">verified_user</span>
                <div>
                  <p className="text-sm font-black text-slate-800 dark:text-white">Aislamiento por Carrera</p>
                  <p className="text-xs text-slate-500">Las asignaciones y docentes de otras carreras no serán alterados durante este proceso.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => moveToStep(2)}
                disabled={!selectedCareer || !selectedPeriod}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-black text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continuar al Paso 2 <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: LOAD SECTIONS / TEMPLATE */}
        {step === 2 && (
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.15em] text-primary">Paso 2 de 4</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Carga la lista de cursos</h3>
                <p className="mt-2 text-sm text-slate-500">Puedes subir tu propia planilla Excel/CSV o usar nuestra plantilla de ejemplo con un solo clic.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadSampleData}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">science</span> Cargar datos de prueba
                </button>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-300"
                >
                  <span className="material-symbols-outlined text-base">download</span> Plantilla CSV
                </button>
              </div>
            </div>

            {/* Drop Zone */}
            <label className={`mt-7 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
              validation?.valid
                ? 'border-emerald-400 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-500/5'
                : 'border-slate-300 bg-slate-50 hover:border-primary hover:bg-primary/5 dark:border-slate-700 dark:bg-slate-800/40'
            }`}>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={event => readFile(event.target.files?.[0])} />
              <span className={`material-symbols-outlined flex size-14 items-center justify-center rounded-2xl text-3xl ${
                validation?.valid ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20' : 'bg-white text-primary shadow-sm dark:bg-slate-800'
              }`}>{validation?.valid ? 'check_circle' : 'upload_file'}</span>
              <p className="mt-4 text-base font-black text-slate-900 dark:text-white">
                {fileName || 'Haz clic para seleccionar o arrastra tu archivo CSV'}
              </p>
              <p className="mt-1 text-xs text-slate-500">Columnas requeridas: nrc, codigo, nombre, nivel, horas (opcional: tipo, nrc_teorico, rut_docente)</p>
            </label>

            {validation && !validation.valid && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-500/10">
                <p className="text-sm font-black text-rose-800 dark:text-rose-200">Revisa los siguientes detalles en el archivo:</p>
                <ul className="mt-2 space-y-1 text-xs text-rose-700 dark:text-rose-300">
                  {validation.errors.slice(0, 8).map(error => <li key={error}>• {error}</li>)}
                </ul>
              </div>
            )}

            {/* Import Mode and Actions */}
            <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-white">Modo de importación</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                      importMode === 'merge' ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                    }`}
                  >
                    Agregar y actualizar (Recomendado)
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                      importMode === 'replace' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                    }`}
                  >
                    Reemplazar período completo
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                {sections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => moveToStep(3)}
                    className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50"
                  >
                    Usar {sections.length} secciones existentes
                  </button>
                )}
                <button
                  type="button"
                  onClick={importFile}
                  disabled={!validation?.valid || busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-black text-white shadow-md shadow-primary/20 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy && <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                  Importar y continuar <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: AUTO-GENERATE PROPOSAL */}
        {step === 3 && (
          <div className="mx-auto max-w-4xl">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.15em] text-primary">Paso 3 de 4</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Generar propuesta automática con Inteligencia/CSP</h3>
              <p className="mt-2 text-sm text-slate-500">El motor analiza la disponibilidad de tus profesores, busca salas compatibles y resuelve los cruces de horario automáticamente.</p>
            </div>

            {/* Resource and Readiness Cards */}
            <div className="mt-7 grid gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                <span className="material-symbols-outlined text-primary text-xl">menu_book</span>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{sections.length}</p>
                <p className="text-[11px] font-bold text-slate-500">Cursos / Secciones</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                <span className="material-symbols-outlined text-cyan-600 text-xl">groups</span>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{teachers.length}</p>
                <p className="text-[11px] font-bold text-slate-500">Docentes registrados</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                <span className="material-symbols-outlined text-purple-600 text-xl">meeting_room</span>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{rooms.length}</p>
                <p className="text-[11px] font-bold text-slate-500">Salas disponibles</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                <span className="material-symbols-outlined text-emerald-600 text-xl">schedule</span>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{Math.max(0, totalRequired - assignments.length)} hrs</p>
                <p className="text-[11px] font-bold text-slate-500">Por programar</p>
              </div>
            </div>

            {/* Difficulty Insights */}
            {difficultyInsights.specializedRooms > 0 && (
              <div className="mt-4 p-4 rounded-2xl border border-purple-200 bg-purple-50/60 dark:border-purple-900 dark:bg-purple-500/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-purple-600 text-lg">biotech</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Se detectaron {difficultyInsights.specializedRooms} secciones especializadas (LAB/SIM/TAL) que serán priorizadas en primer lugar para evitar saturación de salas.
                  </span>
                </div>
              </div>
            )}

            {/* Progress bar during solver run */}
            {busy && generationProgress.total > 0 && (
              <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-500/10 animate-pulse">
                <div className="flex items-center justify-between text-sm font-black text-blue-900 dark:text-blue-100">
                  <span>Calculando y asignando bloques óptimos…</span>
                  <span>{generationProgress.done} / {generationProgress.total}</span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900">
                  <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${generationProgress.total ? (generationProgress.done / generationProgress.total) * 100 : 0}%` }} />
                </div>
                <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                  Evaluando compatibilidad de salas, cruces de nivel y disponibilidad horaria de docentes…
                </p>
              </div>
            )}

            {!sections.length ? (
              <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                No hay secciones en el período. Regresa al Paso 2 para cargar o usar la plantilla de demostración.
              </div>
            ) : (
              <div className="mt-7 flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-slate-50 to-slate-100 p-6 dark:from-slate-800/40 dark:to-slate-800/80 sm:flex-row sm:items-center sm:justify-between border border-slate-200 dark:border-slate-700">
                <div>
                  <p className="text-base font-black text-slate-900 dark:text-white">
                    {assignments.length >= totalRequired
                      ? '🎉 Todos los bloques requeridos ya están programados'
                      : `Listo para programar ${Math.max(0, totalRequired - assignments.length)} horas automáticamente`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    El algoritmo respetará las asignaciones existentes y completará el resto de forma óptima.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={generateProposal}
                  disabled={busy || assignments.length >= totalRequired}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-black text-white shadow-lg shadow-primary/25 hover:bg-primary-dark transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-xl">auto_awesome</span>
                  {busy ? 'Generando propuesta…' : assignments.length >= totalRequired ? 'Propuesta Completa' : 'Generar Propuesta con 1 Clic'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: REVIEW & PUBLISH / EXPORT */}
        {step === 4 && (
          <div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.15em] text-primary">Paso 4 de 4</p>
                <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Revisión, Exportación y Publicación</h3>
                <p className="mt-2 text-sm text-slate-500">Verifica que no existan conflictos y exporta el horario a Google Calendar, Excel o publica la versión oficial.</p>
              </div>
              <div className={`inline-flex items-center gap-2 self-start rounded-full px-3.5 py-1.5 text-xs font-black ${
                scheduleStatus === 'published' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                <span className="material-symbols-outlined text-base">{scheduleStatus === 'published' ? 'verified' : 'edit_note'}</span>
                {scheduleStatus === 'published' ? 'Oficialmente Publicado' : 'Estado: Borrador'}
              </div>
            </div>

            {/* Metrics and Health */}
            <div className="mt-7 grid gap-4 md:grid-cols-[1.1fr_1fr]">
              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Cobertura Semanal</p>
                    <p className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{coverage}%</p>
                  </div>
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <span className="material-symbols-outlined text-3xl">donut_large</span>
                  </div>
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full transition-all duration-500 ${coverage === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${coverage}%` }} />
                </div>
                <p className="mt-3 text-xs text-slate-500">{assignments.length} de {totalRequired} bloques horarios cubiertos.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Validaciones de Calidad</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-rose-500">error</span> Conflictos críticos
                    </span>
                    <span className={`font-black ${criticalConflicts.length ? 'text-rose-600' : 'text-emerald-600'}`}>{criticalConflicts.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-amber-500">warning</span> Advertencias
                    </span>
                    <span className="font-black text-amber-600">{warningConflicts.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-slate-400">pending</span> Bloques pendientes
                    </span>
                    <span className="font-black text-slate-900 dark:text-white">{Math.max(0, totalRequired - assignments.length)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Backtracking and Solver Insights */}
            {proposalResult && proposalResult.deadlocksResolved > 0 && (
              <div className="mt-5 p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-xs">
                <div className="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-200">
                  <span className="material-symbols-outlined text-lg text-indigo-600">tune</span>
                  <span>Motor Heurístico con Backtracking Acotado: {proposalResult.deadlocksResolved} callejones sin salida resueltos</span>
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  El optimizador detectó bloques con sobre-demanda inicial y ejecutó {proposalResult.relocations.length} reubicaciones inteligentes sin introducir nuevos conflictos para maximizar la cobertura del horario.
                </p>
              </div>
            )}

            {/* Bottlenecks and Unassigned Diagnostics */}
            {proposalResult && proposalResult.unassigned.length > 0 && (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200 text-sm mb-3">
                  <span className="material-symbols-outlined text-amber-600">troubleshoot</span>
                  <span>Diagnóstico de Cuellos de Botella ({proposalResult.unassigned.length} asignaturas con módulos pendientes)</span>
                </div>
                <div className="space-y-2.5">
                  {proposalResult.unassigned.map(u => (
                    <div key={u.section_id} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/70 dark:border-amber-900/60 text-xs">
                      <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                        <span>{u.subject_name} (NRC {u.nrc})</span>
                        <span className="text-amber-600 font-bold">{u.unassignedHours} módulo(s) pendiente(s)</span>
                      </div>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-700 dark:text-slate-200">Causa principal:</strong> {u.primaryBottleneck}
                      </p>
                      <p className="mt-0.5 text-indigo-600 dark:text-indigo-400 font-medium">
                        <strong>Acción recomendada:</strong> {u.suggestedAction}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Export Hub */}
            <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 bg-slate-50/50 dark:bg-slate-800/40">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Descargas y Sincronización</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleExportICal}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary hover:text-primary transition-all text-xs font-bold text-slate-700 dark:text-slate-200 shadow-xs"
                >
                  <span className="material-symbols-outlined text-blue-500">calendar_month</span>
                  <span>Exportar a Google / Apple Calendar (.ics)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary hover:text-primary transition-all text-xs font-bold text-slate-700 dark:text-slate-200 shadow-xs"
                >
                  <span className="material-symbols-outlined text-emerald-500">table_view</span>
                  <span>Descargar Planilla Excel (CSV)</span>
                </button>
              </div>
            </div>

            {/* Conflicts List if any */}
            {conflicts.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">Excepciones que requieren atención</h4>
                <div className="mt-3 space-y-3">
                  {conflicts.map(conflict => (
                    <div key={conflict.id} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                      conflict.type === 'CRITICAL' ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-500/5' : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-500/5'
                    }`}>
                      <div className="flex items-start gap-3">
                        <span className={`material-symbols-outlined ${conflict.type === 'CRITICAL' ? 'text-rose-600' : 'text-amber-600'}`}>{conflict.type === 'CRITICAL' ? 'error' : 'warning'}</span>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white">{conflict.subject_name || conflict.rule_code} {conflict.nrc ? `· NRC ${conflict.nrc}` : ''}</p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{conflict.description}</p>
                          {conflict.day_of_week && <p className="mt-1 text-[11px] font-bold text-slate-400">{dayNames[conflict.day_of_week - 1]} · {conflict.timeslot_label}</p>}
                        </div>
                      </div>
                      <button type="button" onClick={() => resolveConflict(conflict.id)} disabled={busy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-primary shadow-sm ring-1 ring-slate-200 hover:bg-primary hover:text-white dark:bg-slate-900 dark:ring-slate-700">
                        <span className="material-symbols-outlined text-lg">auto_fix</span> Resolver con Alternativa
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Academic Responsibility & Audit Disclaimer */}
            <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 text-xs text-amber-950 dark:text-amber-200 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300">
                <span className="material-symbols-outlined text-base">verified_user</span>
                <span>Aviso de Responsabilidad y Auditoría Académica (Disclaimer)</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                Esta propuesta es una recomendación matemática generada por el motor heurístico para optimizar el uso de salas y evitar topes de horario. 
                <strong> La coordinación académica o dirección de carrera debe auditar y validar los acuerdos docentes, requerimientos de equipamiento y criterios pedagógicos antes de su publicación oficial definitiva.</strong>
              </p>
            </div>

            {/* Publishing Bar */}
            <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-[#0b2138] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-black">
                  {scheduleStatus === 'published' ? '✅ Horario Publicado Oficialmente' : canPublish ? '✨ Todo listo para publicar' : '⚠️ Pendiente de completar cobertura'}
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  {canPublish ? 'Al publicar, los docentes y estudiantes verán esta versión en el portal institucional.' : 'Puedes continuar ajustando en el planificador visual o publicar cuando la cobertura sea completa.'}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to="/scheduler" className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-3 text-xs font-black text-white hover:bg-white/10">
                  Abrir en Planificador Visual
                </Link>
                <button
                  type="button"
                  onClick={publish}
                  disabled={!canPublish || busy || scheduleStatus === 'published'}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-lg">publish</span>
                  {scheduleStatus === 'published' ? 'Publicado' : 'Publicar Horario'}
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
