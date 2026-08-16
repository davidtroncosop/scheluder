import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '../lib/router';
import { MainLayout } from '../components/MainLayout';
import api from '../services/api';
import { session } from '../lib/session';
import type { AdminOverview, Period } from '../types';

const formatNumber = (value: number) => new Intl.NumberFormat('es-CL').format(Number(value || 0));

const coverageFor = (required: number, assigned: number) => (
  required > 0 ? Math.min(100, Math.round((assigned / required) * 100)) : 0
);

const statusCopy: Record<string, { label: string; className: string }> = {
  published: { label: 'Publicado', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' },
  review: { label: 'En revisión', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' },
  draft: { label: 'Borrador', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

const AdminOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (periodId?: string) => {
    setLoading(true);
    setError(null);
    try {
      let targetPeriod = periodId || selectedPeriod;
      if (!targetPeriod) {
        const remotePeriods = await api.getPeriods() as Period[];
        setPeriods(remotePeriods);
        targetPeriod = remotePeriods.find(period => Boolean(period.is_active))?.id || remotePeriods[0]?.id || '';
      }
      const data = await api.getAdminOverview(targetPeriod);
      setOverview(data);
      if (data.period?.id) setSelectedPeriod(data.period.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar el resumen institucional');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    if (session.getUser()?.role !== 'admin') {
      navigate('/scheduler', { replace: true });
      return;
    }
    void loadOverview();
  }, [loadOverview, navigate]);

  const totals = overview?.totals;
  const globalCoverage = useMemo(
    () => coverageFor(Number(totals?.required_slots || 0), Number(totals?.assigned_slots || 0)),
    [totals],
  );

  const attentionCount = Number(totals?.pending_users || 0) + Number(totals?.active_conflicts || 0);

  return (
    <MainLayout title="Resumen institucional" showPeriodSelector={false}>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-900/10 sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-indigo-400/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">
                <span className="material-symbols-outlined text-base" aria-hidden="true">account_balance</span>
                Vista de administración
              </div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Control institucional, en una sola mirada.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                Revisa el avance de todas las carreras, la carga operativa y los puntos que requieren atención antes de entrar al planificador.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="admin-period">Período académico</label>
              <select
                id="admin-period"
                value={selectedPeriod}
                onChange={event => {
                  setSelectedPeriod(event.target.value);
                  void loadOverview(event.target.value);
                }}
                className="h-11 min-w-52 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-300/30"
              >
                {periods.length === 0 && overview?.period && <option value={overview.period.id}>{overview.period.code}</option>}
                {periods.map(period => <option key={period.id} value={period.id} className="text-slate-900">{period.code} · {period.name}</option>)}
              </select>
              <button
                type="button"
                onClick={() => void loadOverview(selectedPeriod)}
                disabled={loading}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-wait disabled:opacity-60"
              >
                <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                Actualizar
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            <span>{error}</span>
            <button type="button" onClick={() => void loadOverview(selectedPeriod)} className="font-bold underline">Reintentar</button>
          </div>
        )}

        {loading && !overview ? (
          <div className="grid min-h-72 place-items-center rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-500"><span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />Cargando indicadores globales…</div>
          </div>
        ) : overview && totals ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores principales">
              <MetricCard icon="account_tree" label="Carreras activas" value={formatNumber(totals.careers)} detail={`${formatNumber(totals.subjects)} asignaturas registradas`} accent="indigo" />
              <MetricCard icon="view_timeline" label="Cobertura del horario" value={`${globalCoverage}%`} detail={`${formatNumber(totals.assigned_slots)} de ${formatNumber(totals.required_slots)} bloques`} accent="emerald" progress={globalCoverage} />
              <MetricCard icon="groups" label="Comunidad activa" value={formatNumber(totals.active_users)} detail={`${formatNumber(totals.teachers)} docentes · ${formatNumber(totals.rooms)} salas`} accent="sky" />
              <MetricCard icon="notifications_active" label="Atención requerida" value={formatNumber(attentionCount)} detail={`${formatNumber(totals.pending_users)} solicitudes · ${formatNumber(totals.active_conflicts)} conflictos`} accent={attentionCount > 0 ? 'amber' : 'emerald'} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Seguimiento académico</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Avance por carrera</h3>
                  </div>
                  <Link to="/configuracion" className="hidden items-center gap-1 text-xs font-bold text-primary hover:underline sm:flex">Administrar <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Link>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overview.careers.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-slate-500">Aún no hay carreras registradas.</div>
                  ) : overview.careers.map(career => {
                    const coverage = coverageFor(Number(career.required_slots), Number(career.assigned_slots));
                    const status = statusCopy[career.schedule_status] || statusCopy.draft;
                    return (
                      <div key={career.id} className="px-5 py-5 transition hover:bg-slate-50/80 dark:hover:bg-white/[0.02] sm:px-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0 md:w-2/5">
                            <div className="flex items-center gap-3">
                              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><span className="material-symbols-outlined" aria-hidden="true">school</span></div>
                              <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{career.name}</h4><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{career.code}</p></div>
                            </div>
                          </div>
                          <div className="flex-1 md:max-w-sm">
                            <div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-500">Cobertura</span><span className="font-black text-slate-800 dark:text-slate-200">{coverage}%</span></div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full transition-all ${coverage >= 90 ? 'bg-emerald-500' : coverage >= 60 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${coverage}%` }} /></div>
                            <p className="mt-2 text-[11px] font-medium text-slate-400">{formatNumber(career.assigned_slots)} / {formatNumber(career.required_slots)} bloques · {formatNumber(career.sections)} secciones</p>
                          </div>
                          <div className="flex items-center justify-between gap-4 md:w-32 md:justify-end"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span>{career.active_conflicts > 0 && <span className="flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400"><span className="material-symbols-outlined text-sm" aria-hidden="true">warning</span>{career.active_conflicts}</span>}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Estado del período</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{overview.period?.name || 'Sin período seleccionado'}</h3>
                  <div className="mt-5 space-y-4">
                    <SummaryLine icon="check_circle" label="Bloques publicados" value={formatNumber(totals.published_slots)} tone="emerald" />
                    <SummaryLine icon="pending_actions" label="Bloques por asignar" value={formatNumber(Math.max(0, Number(totals.required_slots) - Number(totals.assigned_slots)))} tone="amber" />
                    <SummaryLine icon="meeting_room" label="Espacios disponibles" value={formatNumber(totals.rooms)} tone="sky" />
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10 sm:p-6">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-300">Acciones rápidas</p><h3 className="mt-1 text-lg font-bold">Gestiona la institución</h3></div><span className="material-symbols-outlined text-indigo-300" aria-hidden="true">bolt</span></div>
                  <div className="mt-5 grid gap-2"><Link to="/assistant" className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-3 text-sm font-bold transition hover:bg-white/15">Iniciar planificación asistida <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Link><Link to="/configuracion" className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-3 text-sm font-bold transition hover:bg-white/15">Configuración global <span className="material-symbols-outlined text-base" aria-hidden="true">settings</span></Link></div>
                </div>
              </aside>
            </section>
          </>
        ) : null}
      </div>
    </MainLayout>
  );
};

const MetricCard: React.FC<{ icon: string; label: string; value: string; detail: string; accent: 'indigo' | 'emerald' | 'sky' | 'amber'; progress?: number }> = ({ icon, label, value, detail, accent, progress }) => {
  const accents = { indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300', emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300', sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300', amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">{value}</p></div><span className={`grid size-10 place-items-center rounded-xl ${accents[accent]}`}><span className="material-symbols-outlined" aria-hidden="true">{icon}</span></span></div><p className="mt-3 truncate text-xs font-medium text-slate-400">{detail}</p>{progress !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>}</article>;
};

const SummaryLine: React.FC<{ icon: string; label: string; value: string; tone: 'emerald' | 'amber' | 'sky' }> = ({ icon, label, value, tone }) => {
  const tones = { emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300', amber: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300', sky: 'text-sky-600 bg-sky-50 dark:bg-sky-500/10 dark:text-sky-300' };
  return <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><span className="material-symbols-outlined text-base" aria-hidden="true">{icon}</span></span><span className="truncate text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</span></div><span className="text-sm font-black text-slate-900 dark:text-white">{value}</span></div>;
};

export default AdminOverviewPage;
