
import React from 'react';
import { Link } from '../lib/router';

interface SharedHeaderProps {
  title: string;
}

const SharedHeader: React.FC<SharedHeaderProps> = ({ title }) => {
  return (
    <header className="w-full border-b border-slate-200/70 dark:border-white/5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl px-4 sm:px-10 py-3.5 sticky top-0 z-50 transition-colors duration-200">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between whitespace-nowrap">
        <div className="flex items-center gap-3 text-slate-900 dark:text-white">
          <Link to="/scheduler" className="flex items-center gap-2.5 group">
            <div className="size-9 flex items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-600 text-white shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[20px]">calendar_month</span>
            </div>
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block leading-none">Scheduler Pro</span>
              <h2 className="text-base font-bold leading-tight tracking-tight">{title}</h2>
            </div>
          </Link>
        </div>
        <div className="flex flex-1 justify-end gap-5 items-center">
          <nav className="hidden md:flex items-center gap-2">
            <Link to="/scheduler" className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">Planificador</Link>
            <Link to="/teachers" className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">Docentes</Link>
            <Link to="/asignaturas" className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">Asignaturas</Link>
            <Link to="/salas" className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">Salas</Link>
          </nav>
          <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-indigo-500 text-white font-bold text-xs shadow-xs">
            U
          </div>
        </div>
      </div>
    </header>
  );
};

export default SharedHeader;
