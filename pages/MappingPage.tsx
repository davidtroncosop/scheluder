
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SharedHeader from '../components/SharedHeader';
import { analyzeMapping } from '../services/geminiService';
import { MappingField } from '../types';

const MappingPage: React.FC = () => {
  const navigate = useNavigate();
  const [mappings, setMappings] = useState<MappingField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalysis = async () => {
      // Simulated headers from a CSV
      const mockHeaders = ['PROFESOR_NOMBRE', 'COD_ASIGNATURA', 'N_NRC', 'SALA_COD', 'DIA_SEMANA', 'BLOQUE_HORARIO'];
      const result = await analyzeMapping(mockHeaders);
      setMappings(result);
      setLoading(false);
    };

    fetchAnalysis();
  }, []);

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display">
      <SharedHeader title="Gestión de Horarios" />
      <div className="layout-container flex h-full grow flex-col">
        <div className="px-4 md:px-10 lg:px-40 flex flex-1 justify-center py-8">
          <div className="layout-content-container flex flex-col max-w-[1200px] flex-1">
            <div className="flex flex-col gap-3 p-4 mb-6">
              <div className="flex gap-6 justify-between items-end">
                <p className="text-[#111418] dark:text-white text-base font-medium leading-normal">Asistente de Importación</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-normal leading-normal">Paso 3 de 4</p>
              </div>
              <div className="rounded-full bg-gray-200 dark:bg-gray-800 h-2 overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: '75%' }}></div>
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-6 p-4 border-b border-gray-200 dark:border-border-dark pb-8 mb-8">
              <div className="flex flex-col gap-3 max-w-2xl">
                <h1 className="text-[#111418] dark:text-white tracking-tight text-[32px] font-bold leading-tight">Mapeo de Columnas</h1>
                <p className="text-slate-500 dark:text-slate-400 text-base font-normal leading-normal">
                  Confirma que las columnas de tu archivo coincidan con los campos del sistema.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-4">
              <div className="lg:col-span-2 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[#111418] dark:text-white text-xl font-bold">Configuración</h3>
                    <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">auto_awesome</span>
                      IA Activa
                    </span>
                  </div>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-medium">Gemini analizando estructura del archivo...</p>
                  </div>
                ) : (
                  mappings.map((mapping, idx) => (
                    <div
                      key={idx}
                      className={`group border rounded-lg p-4 transition-all shadow-sm ${mapping.status === 'valid' ? 'bg-white dark:bg-surface-dark border-gray-200 dark:border-border-dark' :
                          mapping.status === 'warning' ? 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/40' :
                            'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-900/40'
                        }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start gap-4">
                        <div className="w-full md:w-1/3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`material-symbols-outlined text-lg ${mapping.status === 'valid' ? 'text-slate-400' : mapping.status === 'warning' ? 'text-orange-400' : 'text-red-400'}`}>table_chart</span>
                            <span className="text-[#111418] dark:text-white font-medium">{mapping.systemField}</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="relative">
                            <select
                              className="w-full bg-white dark:bg-black/20 text-[#111418] dark:text-white border border-gray-300 dark:border-border-dark rounded-lg h-10 px-3 pr-10 focus:outline-none focus:border-primary appearance-none cursor-pointer"
                              defaultValue={mapping.csvHeader}
                            >
                              <option value={mapping.csvHeader}>{mapping.csvHeader}</option>
                              <option value="none">-- Ignorar columna --</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                              <span className="material-symbols-outlined">expand_more</span>
                            </div>
                          </div>
                          {mapping.message && (
                            <p className={`text-xs mt-1 font-medium ${mapping.status === 'warning' ? 'text-orange-600' : 'text-red-600'}`}>
                              ⚠️ {mapping.message}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-end w-8 pt-2">
                          <span className={`material-symbols-outlined ${mapping.status === 'valid' ? 'text-green-600' : mapping.status === 'warning' ? 'text-orange-500' : 'text-red-500'}`}>
                            {mapping.status === 'valid' ? 'check_circle' : mapping.status === 'warning' ? 'warning' : 'error'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="lg:col-span-1">
                <div className="sticky top-24 flex flex-col gap-6">
                  <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-lg shadow-gray-200/50 dark:shadow-none">
                    <h3 className="text-[#111418] dark:text-white text-lg font-bold mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">analytics</span>
                      Resumen
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">Mapeos válidos</span>
                        <span className="font-bold text-green-600">4</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">Advertencias</span>
                        <span className="font-bold text-orange-500">2</span>
                      </div>
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                          La IA ha sugerido el 80% de los campos basándose en el historial de importación.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-8 mt-4 border-t border-gray-200 dark:border-border-dark">
              <Link to="/upload" className="flex items-center justify-center h-10 px-6 rounded-lg bg-white dark:bg-surface-dark border border-gray-300 dark:border-border-dark text-slate-700 dark:text-slate-300 text-sm font-bold hover:bg-gray-50 transition-colors gap-2 shadow-sm">
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                Atrás
              </Link>
              <button
                onClick={() => navigate('/teachers')}
                className="flex items-center justify-center h-10 px-6 rounded-lg bg-primary text-white text-sm font-bold hover:bg-blue-600 transition-colors gap-2 shadow-md shadow-blue-200"
              >
                Validar e Importar
                <span className="material-symbols-outlined text-lg">check</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MappingPage;
