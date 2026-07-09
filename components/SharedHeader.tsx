
import React from 'react';
import { Link } from 'react-router-dom';

interface SharedHeaderProps {
  title: string;
}

const SharedHeader: React.FC<SharedHeaderProps> = ({ title }) => {
  return (
    <header className="w-full border-b border-border-light dark:border-border-dark bg-surface-light dark:bg-[#111418] px-4 sm:px-10 py-3 sticky top-0 z-50 transition-colors duration-200">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between whitespace-nowrap">
        <div className="flex items-center gap-4 text-gray-900 dark:text-white">
          <div className="size-8 flex items-center justify-center rounded bg-primary/20 text-primary">
            <span className="material-symbols-outlined">school</span>
          </div>
          <h2 className="text-lg font-bold leading-tight tracking-[-0.015em]">{title}</h2>
        </div>
        <div className="flex flex-1 justify-end gap-6 md:gap-8 items-center">
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/scheduler" className="text-sm font-medium leading-normal hover:text-primary transition-colors text-text-secondary-light dark:text-gray-300">Horarios</Link>
            <Link to="/teachers" className="text-sm font-medium leading-normal hover:text-primary transition-colors text-text-secondary-light dark:text-gray-300">Docentes</Link>
          </nav>
          <div className="flex items-center gap-2 pl-2 md:pl-0 text-text-secondary-light dark:text-text-secondary-dark">
            <span className="material-symbols-outlined text-[18px]">notifications</span>
            <span className="material-symbols-outlined text-[18px]">settings</span>
          </div>
          <div 
            className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border border-border-light dark:border-border-dark" 
            style={{backgroundImage: 'url("https://picsum.photos/100/100")'}}
          ></div>
        </div>
      </div>
    </header>
  );
};

export default SharedHeader;
