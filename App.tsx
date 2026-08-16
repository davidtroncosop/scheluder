
import React, { useState, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from './lib/router';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminOverviewPage from './pages/AdminOverviewPage';
import ErrorBoundary from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';

// Lazy-loaded pages (Code Splitting)
const TableSelectionPage = lazy(() => import('./pages/TableSelectionPage'));
const FileUploadPage = lazy(() => import('./pages/FileUploadPage'));
const MappingPage = lazy(() => import('./pages/MappingPage'));
const TeachersPage = lazy(() => import('./pages/TeachersPage'));
const SchedulerPage = lazy(() => import('./pages/SchedulerPage'));
const AssistedPlannerPage = lazy(() => import('./pages/AssistedPlannerPage'));
const AsignaturasPage = lazy(() => import('./pages/AsignaturasPage'));
const SalasPage = lazy(() => import('./pages/SalasPage'));
const HorariosPage = lazy(() => import('./pages/HorariosPage'));
const ConfiguracionPage = lazy(() => import('./pages/ConfiguracionPage'));

const PageLoader = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-background-light dark:bg-background-dark">
    <div className="flex flex-col items-center gap-4">
      <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="text-sm font-medium text-slate-500 animate-pulse">Cargando aplicación...</p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  const toggleDarkMode = () => {
    setIsDarkMode(current => {
      const next = !current;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const protect = (page: React.ReactNode) => <ProtectedRoute>{page}</ProtectedRoute>;

  return (
    <ErrorBoundary>
      <div className={isDarkMode ? 'dark h-full' : 'h-full'}>
        <HashRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Auth */}
              <Route path="/" element={<LoginPage onToggleDarkMode={toggleDarkMode} isDarkMode={isDarkMode} />} />
              <Route path="/register" element={<RegisterPage onToggleDarkMode={toggleDarkMode} isDarkMode={isDarkMode} />} />
              <Route path="/admin" element={protect(<AdminOverviewPage />)} />

              {/* Import Flow */}
              <Route path="/table-selection" element={protect(<TableSelectionPage />)} />
              <Route path="/upload" element={protect(<FileUploadPage />)} />
              <Route path="/mapping" element={protect(<MappingPage />)} />

              {/* Main Application */}
              <Route path="/assistant" element={protect(<AssistedPlannerPage />)} />
              <Route path="/scheduler" element={protect(<SchedulerPage />)} />
              <Route path="/horarios" element={protect(<HorariosPage />)} />

              {/* Masters */}
              <Route path="/teachers" element={protect(<TeachersPage />)} />
              <Route path="/asignaturas" element={protect(<AsignaturasPage />)} />
              <Route path="/salas" element={protect(<SalasPage />)} />

              {/* Configuration */}
              <Route path="/configuracion" element={protect(<ConfiguracionPage />)} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </div>
    </ErrorBoundary>
  );
};

export default App;
