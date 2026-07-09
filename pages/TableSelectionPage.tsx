
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SharedHeader from '../components/SharedHeader';

const TableSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState('nrcs');

  const options = [
    { id: 'docentes', title: 'Docentes', icon: 'group', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', desc: 'Importar lista de profesores, tipos de contrato y restricciones.' },
    { id: 'espacios', title: 'Espacios Físicos', icon: 'meeting_room', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400', desc: 'Aulas teóricas, laboratorios y espacios especializados.' },
    { id: 'nrcs', title: 'Programación Base', icon: 'calendar_month', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', desc: 'Carga de NRCs, asignaturas, grupos y planificación semestral.' }
  ];

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display">
      <SharedHeader title="Gestión Académica" />
      <main className="flex-grow w-full flex justify-center py-6 px-4 md:px-10">
        <div className="flex flex-col max-w-[960px] w-full gap-6">
          <div className="flex flex-col gap-3 p-4">
            <div className="flex gap-6 justify-between items-end">
              <div>
                <p className="text-sm font-bold text-primary mb-1 uppercase tracking-wider">Paso 1 de 4</p>
                <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-[-0.033em] dark:text-white text-slate-900">Selección de Tabla</h1>
              </div>
              <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark">25% completado</p>
            </div>
            <div className="rounded-full bg-gray-200 dark:bg-[#3b4754] h-2 w-full overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: '25%' }}></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4 py-2">
            {options.map((opt) => (
              <label key={opt.id} className="relative group cursor-pointer h-full">
                <input
                  className="peer sr-only"
                  name="dataType"
                  type="radio"
                  value={opt.id}
                  checked={selectedType === opt.id}
                  onChange={() => setSelectedType(opt.id)}
                />
                <div className="h-full flex flex-col p-6 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark transition-all duration-200 hover:shadow-lg hover:border-primary/50 peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary peer-checked:bg-primary/5 dark:peer-checked:bg-primary/10">
                  <div className={`mb-4 size-12 rounded-lg ${opt.color} flex items-center justify-center`}>
                    <span className="material-symbols-outlined text-3xl">{opt.icon}</span>
                  </div>
                  <h3 className="text-lg font-bold mb-2 dark:text-white">{opt.title}</h3>
                  <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark mb-4 flex-grow">{opt.desc}</p>
                </div>
                <div className="absolute top-4 right-4 opacity-0 peer-checked:opacity-100 transition-opacity text-primary">
                  <span className="material-symbols-outlined fill-current">check_circle</span>
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between px-4 pt-6 mt-auto border-t border-transparent dark:border-border-dark">
            <Link to="/" className="px-6 py-2.5 rounded-lg text-sm font-bold text-text-secondary-light dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-dark transition-colors">
              Cancelar
            </Link>
            <button
              onClick={() => navigate('/upload')}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary hover:bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition-all"
            >
              <span>Siguiente Paso</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TableSelectionPage;
