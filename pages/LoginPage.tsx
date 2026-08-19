import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from '../lib/router';
import { createOfflineDemoSession, session, type SessionUser } from '../lib/session';
import api from '../services/api';

interface LoginPageProps {
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
}

const QUICK_ACCOUNTS = [
  { email: 'davidtroncosop@gmail.com', password: 'DemoLocal2026!', label: 'David Troncoso (Admin)', description: 'Administrador total del sistema', icon: 'shield_person', color: 'from-blue-600 to-indigo-600' },
  { email: 'coordinador@kine.edu', password: 'DemoLocal2026!', label: 'Coordinador Kinesiología', description: 'Planificación de carrera', icon: 'school', color: 'from-emerald-600 to-teal-600' },
  { email: 'admin@scheduler.pro', password: 'DemoLocal2026!', label: 'Admin General', description: 'Gestión institucional', icon: 'admin_panel_settings', color: 'from-purple-600 to-indigo-600' },
];

const LoginPage: React.FC<LoginPageProps> = ({ onToggleDarkMode, isDarkMode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState<string>('davidtroncosop@gmail.com');
  const [password, setPassword] = useState('DemoLocal2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = (token: string, user: SessionUser) => {
    session.save(token, user);
    const destination = (location.state as { from?: string } | null)?.from || (user.role === 'admin' ? '/admin' : '/scheduler');
    navigate(destination, { replace: true });
  };

  const executeLogin = async (userEmail: string, userPass: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.login(userEmail, userPass);
      enter(data.token, data.user as SessionUser);
    } catch (requestError) {
      if (QUICK_ACCOUNTS.some(user => user.email === userEmail)) {
        const offline = createOfflineDemoSession(userEmail);
        enter(offline.token, offline.user);
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Credenciales no reconocidas');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await executeLogin(email, password);
  };

  const handleQuickLogin = async (account: typeof QUICK_ACCOUNTS[0]) => {
    setEmail(account.email);
    setPassword(account.password);
    await executeLogin(account.email, account.password);
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

      <section className="glass-panel relative z-10 grid w-full max-w-4xl overflow-hidden rounded-3xl lg:grid-cols-[1.05fr_0.95fr] shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* Left Hero */}
        <div className="flex flex-col justify-between bg-gradient-to-br from-[#0b2138] to-[#123555] p-8 text-white sm:p-10">
          <div>
            <div className="mb-10 flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-primary shadow-lg shadow-primary/30">
                <span className="material-symbols-outlined" aria-hidden="true">event_available</span>
              </div>
              <span className="font-display text-xl font-bold">Scheduler Pro</span>
            </div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Planificación académica inteligente</p>
            <h1 className="max-w-md text-3xl font-bold leading-tight text-white sm:text-4xl">Decisiones académicas claras, sin cruces ni choques.</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">Gestiona horarios, disponibilidad de docentes, salas compatibles y resuelve conflictos en minutos.</p>
          </div>

          <div className="mt-10 flex items-center gap-2 text-xs text-slate-400">
            <span className="material-symbols-outlined text-base" aria-hidden="true">verified_user</span>
            Acceso seguro con control de roles y multi-carrera.
          </div>
        </div>

        {/* Right Form & 1-Click Access */}
        <div className="bg-white/95 p-8 dark:bg-slate-900/95 sm:p-10 flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Iniciar sesión</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Selecciona un acceso rápido o ingresa manualmente:</p>

            {/* Quick 1-Click Login Cards */}
            <div className="mt-5 space-y-2">
              {QUICK_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickLogin(acc)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 text-left transition hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-850 group"
                >
                  <div className={`size-8 rounded-lg bg-gradient-to-br ${acc.color} text-white flex items-center justify-center shrink-0`}>
                    <span className="material-symbols-outlined text-base">{acc.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">{acc.label}</p>
                    <p className="text-[10px] text-slate-400 truncate">{acc.email}</p>
                  </div>
                  <span className="material-symbols-outlined text-xs text-slate-300 group-hover:text-primary transition-colors">bolt</span>
                </button>
              ))}
            </div>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">O con contraseña</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800"></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Correo Electrónico
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:border-primary"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Contraseña
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:border-primary"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0b2138] px-5 text-xs font-bold text-white shadow-md transition hover:bg-[#123555] disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <>
                    <span>Entrar al Sistema</span>
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
            ¿Aún no tienes acceso? <Link to="/register" className="font-bold text-primary hover:underline">Crear cuenta</Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;
