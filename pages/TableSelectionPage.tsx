
import React, { useState } from 'react';
import { useNavigate, Link } from '../lib/router';
import SharedHeader from '../components/SharedHeader';

const TableSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState('nrcs');

  const mainOptions = [
    { id: 'nrcs', title: 'Programación Base', icon: 'calendar_month', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', desc: 'Carga de NRCs, asignaturas, secciones y planificación semestral.' },
    { id: 'docentes', title: 'Docentes', icon: 'group', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', desc: 'Lista de profesores, tipos de contrato y horas máximas semanales.' },
    { id: 'asignaturas', title: 'Asignaturas', icon: 'menu_book', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', desc: 'Catálogo de cursos, niveles y créditos del plan de estudio.' },
    { id: 'espacios', title: 'Salas y Espacios', icon: 'meeting_room', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400', desc: 'Aulas teóricas, laboratorios, talleres y aforos máximos.' },
  ];

  const relationalOptions = [
    { id: 'docentes_asignaturas', title: 'Idoneidad Docente', icon: 'badge', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400', desc: 'Habilitación de profesores por asignatura (titulares y suplentes).' },
    { id: 'compatibilidad_salas', title: 'Salas por Asignatura', icon: 'domain', color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400', desc: 'Requisitos específicos de salas y laboratorios exclusivos o preferentes.' },
    { id: 'prerrequisitos', title: 'Prerrequisitos y Malla', icon: 'account_tree', color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400', desc: 'Prerrequisitos y correquisitos curriculares entre asignaturas.' },
    { id: 'disponibilidad_docente', title: 'Disponibilidad y Bloqueos', icon: 'event_available', color: 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400', desc: 'Matriz masiva de horarios disponibles, preferentes o bloqueados.' },
  ];

  const handleNext = () => {
    const typeMapping: Record<string, string> = {
      nrcs: 'horarios',
      docentes: 'docentes',
      asignaturas: 'asignaturas',
      espacios: 'salas',
      docentes_asignaturas: 'docentes_asignaturas',
      compatibilidad_salas: 'compatibilidad_salas',
      prerrequisitos: 'prerrequisitos',
      disponibilidad_docente: 'disponibilidad_docente',
    };
    navigate(`/upload?type=${typeMapping[selectedType] || 'horarios'}`);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display">
      <SharedHeader title="Gestión Académica e Importación" />
      <main className="flex-grow w-full flex justify-center py-6 px-4 md:px-10">
        <div className="flex flex-col max-w-[1050px] w-full gap-6">
          <div className="flex flex-col gap-3 p-4">
            <div className="flex gap-6 justify-between items-end">
              <div>
                <p className="text-sm font-bold text-primary mb-1 uppercase tracking-wider">Paso 1 de 4</p>
                <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-[-0.033em] dark:text-white text-slate-900">Selección de Tabla a Importar</h1>
                <p className="text-xs text-slate-500 mt-1">Selecciona si deseas cargar entidades maestras principales o tablas intermedias de relaciones académicas.</p>
              </div>
              <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark">25% completado</p>
            </div>
            <div className="rounded-full bg-gray-200 dark:bg-[#3b4754] h-2 w-full overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: '25%' }}></div>
            </div>
          </div>

          {/* Section 1: Tablas Principales */}
          <div className="px-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary">folder_open</span>
              Tablas Principales / Catálogos Base
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {mainOptions.map((opt) => (
                <label key={opt.id} className="relative group cursor-pointer h-full">
                  <input
                    className="peer sr-only"
                    name="dataType"
                    type="radio"
                    value={opt.id}
                    checked={selectedType === opt.id}
                    onChange={() => setSelectedType(opt.id)}
                  />
                  <div className="h-full flex flex-col p-5 rounded-2xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark transition-all duration-200 hover:shadow-lg hover:border-primary/50 peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary/40 peer-checked:bg-primary/5 dark:peer-checked:bg-primary/10">
                    <div className={`mb-3 size-10 rounded-xl ${opt.color} flex items-center justify-center`}>
                      <span className="material-symbols-outlined text-2xl">{opt.icon}</span>
                    </div>
                    <h3 className="text-sm font-bold mb-1 dark:text-white">{opt.title}</h3>
                    <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark flex-grow">{opt.desc}</p>
                  </div>
                  <div className="absolute top-3 right-3 opacity-0 peer-checked:opacity-100 transition-opacity text-primary">
                    <span className="material-symbols-outlined text-lg fill-current">check_circle</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Section 2: Tablas Intermedias */}
          <div className="px-4 pt-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-indigo-500">hub</span>
              Tablas Intermedias / Relaciones y Restricciones Académicas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {relationalOptions.map((opt) => (
                <label key={opt.id} className="relative group cursor-pointer h-full">
                  <input
                    className="peer sr-only"
                    name="dataType"
                    type="radio"
                    value={opt.id}
                    checked={selectedType === opt.id}
                    onChange={() => setSelectedType(opt.id)}
                  />
                  <div className="h-full flex flex-col p-5 rounded-2xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark transition-all duration-200 hover:shadow-lg hover:border-primary/50 peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary/40 peer-checked:bg-primary/5 dark:peer-checked:bg-primary/10">
                    <div className={`mb-3 size-10 rounded-xl ${opt.color} flex items-center justify-center`}>
                      <span className="material-symbols-outlined text-2xl">{opt.icon}</span>
                    </div>
                    <h3 className="text-sm font-bold mb-1 dark:text-white">{opt.title}</h3>
                    <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark flex-grow">{opt.desc}</p>
                  </div>
                  <div className="absolute top-3 right-3 opacity-0 peer-checked:opacity-100 transition-opacity text-primary">
                    <span className="material-symbols-outlined text-lg fill-current">check_circle</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-4 pt-6 mt-auto border-t border-transparent dark:border-border-dark">
            <Link to="/" className="px-6 py-2.5 rounded-lg text-sm font-bold text-text-secondary-light dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-dark transition-colors">
              Cancelar
            </Link>
            <button
              onClick={handleNext}
              className="btn-primary"
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
