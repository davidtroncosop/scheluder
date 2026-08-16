import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '../lib/router';

interface RegisterPageProps {
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
}

interface CareerOption {
  id: string;
  name: string;
  code: string;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onToggleDarkMode, isDarkMode }) => {
  const [careers, setCareers] = useState<CareerOption[]>([]);
  const [form, setForm] = useState({ name: '', email: '', career_id: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch('/api/auth/registration-options')
      .then(async response => {
        const data = await response.json() as CareerOption[] | { error?: string };
        if (!response.ok || !Array.isArray(data)) throw new Error(!Array.isArray(data) ? data.error : 'No fue posible cargar las carreras');
        setCareers(data);
        if (data.length === 1) setForm(current => ({ ...current, career_id: data[0].id }));
      })
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar las carreras'))
      .finally(() => setOptionsLoading(false));
  }, []);

  const passwordChecks = useMemo(() => ({
    length: form.password.length >= 12,
    match: Boolean(form.password) && form.password === form.confirmPassword,
  }), [form.password, form.confirmPassword]);

  const update = (field: keyof typeof form, value: string) => setForm(current => ({ ...current, [field]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!passwordChecks.length || !passwordChecks.match) {
      setError('Revisa la contraseña antes de continuar.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, career_id: form.career_id, password: form.password }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'No fue posible enviar la solicitud');
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 p-4 py-8 transition-colors dark:bg-slate-950">
      <button type="button" onClick={onToggleDarkMode} aria-label={isDarkMode ? 'Usar tema claro' : 'Usar tema oscuro'} className="absolute right-5 top-5 z-20 grid size-11 place-items-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:-translate-y-0.5 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200">
        <span className="material-symbols-outlined" aria-hidden="true">{isDarkMode ? 'light_mode' : 'dark_mode'}</span>
      </button>

      <section className="glass-panel grid w-full max-w-5xl overflow-hidden rounded-3xl lg:grid-cols-[0.78fr_1.22fr]">
        <aside className="flex flex-col justify-between bg-slate-950 p-8 text-white sm:p-10">
          <div>
            <Link to="/" className="mb-10 inline-flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <span className="grid size-11 place-items-center rounded-xl bg-primary shadow-lg shadow-primary/30"><span className="material-symbols-outlined">event_available</span></span>
              <span className="font-display text-xl font-bold">Scheduler Pro</span>
            </Link>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-300">Acceso institucional</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight">Solicita tu espacio de trabajo.</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">Tu solicitud será revisada por un administrador antes de habilitar el acceso a información académica.</p>
          </div>
          <ol className="mt-10 space-y-4 text-sm text-slate-300">
            {[
              ['1', 'Completa tus datos institucionales'],
              ['2', 'Un administrador valida tu solicitud'],
              ['3', 'Ingresa con la contraseña que definiste'],
            ].map(([number, text]) => <li key={number} className="flex items-center gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full border border-slate-700 text-xs font-bold text-indigo-300">{number}</span><span>{text}</span></li>)}
          </ol>
        </aside>

        <div className="bg-white/95 p-8 dark:bg-slate-900/95 sm:p-10">
          {submitted ? (
            <div className="flex min-h-[470px] flex-col items-center justify-center text-center">
              <span className="grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"><span className="material-symbols-outlined text-3xl">mark_email_read</span></span>
              <h2 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">Solicitud enviada</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">La cuenta quedó pendiente de aprobación. Cuando el administrador la habilite podrás ingresar con el correo y contraseña que acabas de definir.</p>
              <Link to="/" className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950">Volver al inicio de sesión<span className="material-symbols-outlined text-lg">arrow_forward</span></Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Crear cuenta</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Usa datos que el administrador pueda reconocer.</p>
              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Nombre completo<input type="text" required maxLength={120} autoComplete="name" value={form.name} onChange={event => update('name', event.target.value)} className="input-glass mt-1.5 h-11 w-full rounded-xl px-3 text-slate-900 dark:text-white" /></label>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Correo institucional<input type="email" required maxLength={320} autoComplete="email" value={form.email} onChange={event => update('email', event.target.value)} className="input-glass mt-1.5 h-11 w-full rounded-xl px-3 text-slate-900 dark:text-white" /></label>
                </div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Carrera<select required disabled={optionsLoading} value={form.career_id} onChange={event => update('career_id', event.target.value)} className="input-glass mt-1.5 h-11 w-full rounded-xl px-3 text-slate-900 dark:text-white"><option value="">{optionsLoading ? 'Cargando carreras…' : 'Selecciona una carrera'}</option>{careers.map(career => <option key={career.id} value={career.id}>{career.name} · {career.code}</option>)}</select></label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Contraseña<input type="password" required minLength={12} maxLength={256} autoComplete="new-password" value={form.password} onChange={event => update('password', event.target.value)} className="input-glass mt-1.5 h-11 w-full rounded-xl px-3 text-slate-900 dark:text-white" /></label>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Confirmar contraseña<input type="password" required minLength={12} maxLength={256} autoComplete="new-password" value={form.confirmPassword} onChange={event => update('confirmPassword', event.target.value)} className="input-glass mt-1.5 h-11 w-full rounded-xl px-3 text-slate-900 dark:text-white" /></label>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className={`inline-flex items-center gap-1.5 ${passwordChecks.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}><span className="material-symbols-outlined text-base">{passwordChecks.length ? 'check_circle' : 'radio_button_unchecked'}</span>12 caracteres mínimo</span>
                  <span className={`inline-flex items-center gap-1.5 ${passwordChecks.match ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}><span className="material-symbols-outlined text-base">{passwordChecks.match ? 'check_circle' : 'radio_button_unchecked'}</span>Las contraseñas coinciden</span>
                </div>
                <button type="submit" disabled={loading || optionsLoading || careers.length === 0} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-bold text-white shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60">{loading ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <><span>Enviar solicitud</span><span className="material-symbols-outlined text-lg">person_add</span></>}</button>
                <p className="text-center text-sm text-slate-500 dark:text-slate-400">¿Ya tienes cuenta? <Link to="/" className="font-bold text-primary hover:underline">Inicia sesión</Link></p>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default RegisterPage;
