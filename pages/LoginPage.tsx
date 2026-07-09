import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface LoginPageProps {
  onToggleDarkMode: () => void;
  isDarkMode: boolean;
}

const LoginPage: React.FC<LoginPageProps> = ({ onToggleDarkMode, isDarkMode }) => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'coordinator'>('coordinator');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok && (data as any).token) {
        try {
          localStorage.setItem('auth_token', (data as any).token);
          const userInfo = {
            ...(data as any).user,
            name: isRegisterMode && name.trim() ? name : (data as any).user.name,
            role: isRegisterMode ? role : (data as any).user.role
          };
          localStorage.setItem('user_info', JSON.stringify(userInfo));
        } catch (e) {
          console.warn('Failed to store session info:', e);
        }

        navigate('/scheduler');
      } else {
        setError((data as any).error || 'Credenciales inválidas');
      }
    } catch (err) {
      console.error('Auth error:', err);
      // Fallback offline: login/register locally
      if (email.includes('@') || email === 'admin') {
        try {
          localStorage.setItem('auth_token', 'demo-token');
          const simulatedUser = {
            id: `usr-${Math.random().toString(36).substr(2, 9)}`,
            email: email,
            name: isRegisterMode && name.trim() ? name : (email === 'admin' ? 'Administrador Demo' : email.split('@')[0]),
            role: isRegisterMode ? role : (email === 'admin' ? 'admin' : 'coordinator'),
            career_id: isRegisterMode && role === 'admin' ? null : 'car-default-001'
          };
          localStorage.setItem('user_info', JSON.stringify(simulatedUser));
        } catch (e) {
          console.warn('Failed to store demo session info:', e);
        }
        navigate('/scheduler');
      } else {
        setError('Por favor, ingrese un correo válido.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-500 bg-slate-50 dark:bg-slate-950">

      {/* Premium Background Effects */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary-light/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob"></div>
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[60%] rounded-full bg-indigo-300/20 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[50%] rounded-full bg-blue-300/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000"></div>
        <div className="absolute inset-0 pattern-dots opacity-50"></div>
      </div>

      {/* Dark/Light Mode Toggle */}
      <div className="absolute top-6 right-6 z-20 animate-fade-in">
        <div className="glass-panel rounded-full p-1.5 flex items-center gap-1">
          <button
            onClick={onToggleDarkMode}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${!isDarkMode ? 'bg-white shadow-md text-amber-500 scale-100' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 scale-95 hover:scale-100'}`}
          >
            <span className="material-symbols-outlined text-[20px] fill-1">light_mode</span>
          </button>
          <button
            onClick={onToggleDarkMode}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${isDarkMode ? 'bg-primary dark:bg-primary-dark shadow-md shadow-primary/30 text-white scale-100' : 'text-slate-400 hover:text-slate-600 scale-95 hover:scale-100'}`}
          >
            <span className="material-symbols-outlined text-[20px] fill-1">dark_mode</span>
          </button>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-[420px] animate-slide-up">
        <div className="glass-panel sm:rounded-3xl rounded-2xl overflow-hidden flex flex-col group relative">

          {/* Top Gradient Bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-primary-light via-primary to-indigo-600"></div>

          <div className="p-10 pb-6 flex flex-col items-center">
            {/* Logo Wrapper */}
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-150 group-hover:bg-primary/30 transition-all duration-500"></div>
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/30 ring-1 ring-white/20">
                <span className="material-symbols-outlined text-white text-[32px] drop-shadow-md">event_available</span>
              </div>
            </div>

            <h1 className="text-2xl font-display font-bold text-center tracking-tight mb-2">
              {isRegisterMode ? 'Crear Cuenta en' : 'Bienvenido a'} <br />
              <span className="text-gradient">Scheduler Pro</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium text-center">
              {isRegisterMode ? 'Regístrese para gestionar sus horarios académicos' : 'Poderosa gestión de horarios académicos'}
            </p>

            {/* Segmented Auth Selector */}
            <div className="w-full bg-slate-100/80 dark:bg-slate-900/80 p-1 rounded-xl flex gap-1 mt-6">
              <button
                type="button"
                onClick={() => { setIsRegisterMode(false); setError(null); }}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${!isRegisterMode
                  ? 'bg-white dark:bg-slate-800 text-primary shadow-sm'
                  : 'text-slate-450 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                onClick={() => { setIsRegisterMode(true); setError(null); }}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${isRegisterMode
                  ? 'bg-white dark:bg-slate-800 text-primary shadow-sm'
                  : 'text-slate-450 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                Registrarse
              </button>
            </div>
          </div>

          <div className="px-10 pb-10 flex flex-col gap-6">
            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">

              {error && (
                <div className="px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-start gap-3 animate-slide-up">
                  <span className="material-symbols-outlined text-red-500 mt-0.5 text-[20px]">error</span>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400 leading-relaxed">{error}</p>
                </div>
              )}

              {isRegisterMode && (
                <div className="flex flex-col gap-1.5 animate-fade-in">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pl-1">Nombre Completo</label>
                  <div className="relative group/input">
                    <input
                      className="flex w-full min-w-0 flex-1 rounded-xl h-12 pl-11 pr-4 text-base font-medium input-glass placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100"
                      placeholder="Ej: Dra. María Paz"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required={isRegisterMode}
                    />
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within/input:text-primary transition-colors">
                      <span className="material-symbols-outlined text-[20px]">person</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pl-1">Correo Electrónico</label>
                <div className="relative group/input">
                  <input
                    className="flex w-full min-w-0 flex-1 rounded-xl h-12 pl-11 pr-4 text-base font-medium input-glass placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100"
                    placeholder="ejemplo@universidad.cl"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within/input:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[20px]">mail</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center pl-1 pr-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contraseña</label>
                  {!isRegisterMode && (
                    <a className="text-xs font-semibold text-primary hover:text-primary-dark dark:hover:text-primary-light transition-colors" href="#recuperar">
                      ¿Olvidaste tu contraseña?
                    </a>
                  )}
                </div>
                <div className="relative group/input">
                  <input
                    className="flex w-full min-w-0 flex-1 rounded-xl h-12 pl-11 pr-4 text-base font-medium input-glass placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100 tracking-wider"
                    placeholder="••••••••"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within/input:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[20px]">lock_person</span>
                  </div>
                </div>
              </div>

              {isRegisterMode && (
                <div className="flex flex-col gap-1.5 animate-fade-in">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 pl-1">Rol de Acceso</label>
                  <div className="relative group/input">
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as any)}
                      className="flex w-full min-w-0 flex-1 rounded-xl h-12 pl-11 pr-4 text-sm font-medium input-glass text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:border-primary/50 appearance-none bg-transparent"
                    >
                      <option value="coordinator">Coordinador de Carrera</option>
                      <option value="admin">Administrador Global</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 group-focus-within/input:text-primary transition-colors">
                      <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-4 relative flex w-full items-center justify-center overflow-hidden rounded-xl h-12 px-6 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-base font-semibold transition-all hover-lift active:scale-95 disabled:opacity-70 disabled:pointer-events-none shadow-lg shadow-slate-900/20 dark:shadow-white/10 group/btn"
              >
                {loading ? (
                  <div className="animate-spin size-5 border-2 border-current border-t-transparent rounded-full"></div>
                ) : (
                  <>
                    <span className="relative z-10 flex items-center gap-2">
                      {isRegisterMode ? 'Crear Cuenta e Ingresar' : 'Ingresar al Sistema'}
                      <span className="material-symbols-outlined text-[18px] group-hover/btn:translate-x-1 transition-transform">arrow_forward</span>
                    </span>
                  </>
                )}
              </button>
            </form>

            <div className="flex justify-center -mt-2">
              <button
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setError(null);
                }}
                className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors underline bg-transparent border-none cursor-pointer"
              >
                {isRegisterMode ? '¿Ya tienes una cuenta? Inicia Sesión' : '¿No tienes cuenta? Registra tu correo aquí'}
              </button>
            </div>
          </div>
        </div>

        {/* Decorative footer */}
        <p className="text-center text-xs font-medium text-slate-400 dark:text-slate-500 mt-6">
          &copy; {new Date().getFullYear()} Scheduler Pro. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
