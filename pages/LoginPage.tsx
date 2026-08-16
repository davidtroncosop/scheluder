import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from '../lib/router';
import { createOfflineDemoSession, session, type SessionUser } from '../lib/session';
import api from '../services/api';

interface LoginPageProps {
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
}

const DEMO_USERS = [
  { email: 'coordinador@kine.edu', label: 'Coordinador', description: 'Planificación de Kinesiología', icon: 'school' },
  { email: 'admin@scheduler.pro', label: 'Administrador', description: 'Vista global de la institución', icon: 'admin_panel_settings' },
] as const;

const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true';

const LoginPage: React.FC<LoginPageProps> = ({ onToggleDarkMode, isDarkMode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState<string>(DEMO_MODE ? DEMO_USERS[0].email : '');
  const [password, setPassword] = useState(DEMO_MODE ? 'demo' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = (token: string, user: SessionUser) => {
    session.save(token, user);
    const destination = (location.state as { from?: string } | null)?.from || (user.role === 'admin' ? '/admin' : '/scheduler');
    navigate(destination, { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await api.login(email, password);
      enter(data.token, data.user as SessionUser);
    } catch (requestError) {
      if (DEMO_MODE && DEMO_USERS.some(user => user.email === email)) {
        const offline = createOfflineDemoSession(email);
        enter(offline.token, offline.user);
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Cuenta demo no reconocida');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors dark:bg-slate-950">
      <button
        type="button"
        onClick={onToggleDarkMode}
        aria-label={isDarkMode ? 'Usar tema claro' : 'Usar tema oscuro'}
        className="absolute right-5 top-5 z-20 grid size-11 place-items-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm backdrop-blur transition hover:-translate-y-0.5 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200"
      >
        <span className="material-symbols-outlined" aria-hidden="true">{isDarkMode ? 'light_mode' : 'dark_mode'}</span>
      </button>

      <div className="pointer-events-none absolute inset-0 pattern-dots opacity-30" aria-hidden="true" />

      <section className="glass-panel relative z-10 grid w-full max-w-4xl overflow-hidden rounded-3xl lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-between bg-slate-950 p-8 text-white sm:p-10">
          <div>
            <div className="mb-10 flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-primary shadow-lg shadow-primary/30">
                <span className="material-symbols-outlined" aria-hidden="true">event_available</span>
              </div>
              <span className="font-display text-xl font-bold">Scheduler Pro</span>
            </div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-indigo-300">Planificación académica</p>
            <h1 className="max-w-md text-3xl font-bold leading-tight text-white sm:text-4xl">Decisiones académicas claras, antes de que aparezcan los conflictos.</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">Gestiona horarios, disponibilidad docente, salas y conflictos desde un único espacio de trabajo.</p>
          </div>
          <div className="mt-10 flex items-center gap-2 text-xs text-slate-400">
            <span className="material-symbols-outlined text-base" aria-hidden="true">verified_user</span>
            Acceso protegido y trazable por usuario.
          </div>
        </div>

        <div className="bg-white/90 p-8 dark:bg-slate-900/90 sm:p-10">
          <h2 className="text-2xl font-bold">Iniciar sesión</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Ingresa con tu cuenta institucional.</p>

          {DEMO_MODE && <div className="mt-6 grid gap-3">
            {DEMO_USERS.map(user => (
              <button
                key={user.email}
                type="button"
                onClick={() => setEmail(user.email)}
                aria-pressed={email === user.email}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${email === user.email ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'}`}
              >
                <span className="material-symbols-outlined text-primary" aria-hidden="true">{user.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">{user.label}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{user.description}</span>
                </span>
                {email === user.email && <span className="material-symbols-outlined ml-auto text-primary" aria-hidden="true">check_circle</span>}
              </button>
            ))}
          </div>}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Correo
              <input className="input-glass mt-1.5 h-11 w-full rounded-xl px-3 text-slate-900 dark:text-white" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="username" />
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Contraseña
              <input className="input-glass mt-1.5 h-11 w-full rounded-xl px-3 text-slate-900 dark:text-white" type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" />
            </label>
            <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100">
              {loading ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-label="Ingresando" /> : <><span>Ingresar</span><span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_forward</span></>}
            </button>
            {!DEMO_MODE && <p className="text-center text-sm text-slate-500 dark:text-slate-400">¿Aún no tienes acceso? <Link to="/register" className="font-bold text-primary hover:underline">Crear cuenta</Link></p>}
          </form>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;
