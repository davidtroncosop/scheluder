
import React, { useState, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-loaded pages (Code Splitting)
const TableSelectionPage = lazy(() => import('./pages/TableSelectionPage'));
const FileUploadPage = lazy(() => import('./pages/FileUploadPage'));
const MappingPage = lazy(() => import('./pages/MappingPage'));
const TeachersPage = lazy(() => import('./pages/TeachersPage'));
const SchedulerPage = lazy(() => import('./pages/SchedulerPage'));
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
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <ErrorBoundary>
      <div className={isDarkMode ? 'dark h-full' : 'h-full'}>
        <HashRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Auth */}
              <Route path="/" element={<LoginPage onToggleDarkMode={toggleDarkMode} isDarkMode={isDarkMode} />} />

              {/* Import Flow */}
              <Route path="/table-selection" element={<TableSelectionPage />} />
              <Route path="/upload" element={<FileUploadPage />} />
              <Route path="/mapping" element={<MappingPage />} />

              {/* Main Application */}
              <Route path="/scheduler" element={<SchedulerPage />} />
              <Route path="/horarios" element={<HorariosPage />} />

              {/* Masters */}
              <Route path="/teachers" element={<TeachersPage />} />
              <Route path="/asignaturas" element={<AsignaturasPage />} />
              <Route path="/salas" element={<SalasPage />} />

              {/* Configuration */}
              <Route path="/configuracion" element={<ConfiguracionPage />} />

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
