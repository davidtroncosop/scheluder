import React, { useState } from 'react';
import type { SchedulerAssignment as Assignment } from '../model';
import { downloadFile, generateICalendar, generateScheduleCsv } from '../export';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignments: Assignment[];
  periodName?: string;
  onExportPdf: () => Promise<void>;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  assignments,
  periodName = 'Horario Académico',
  onExportPdf,
}) => {
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleExportCsv = () => {
    const csvContent = generateScheduleCsv(assignments);
    downloadFile(csvContent, `horario_${periodName.toLowerCase().replace(/\s+/g, '_')}.csv`, 'text/csv;charset=utf-8;');
    onClose();
  };

  const handleExportICal = () => {
    const icsContent = generateICalendar(assignments, {
      calendarName: periodName,
    });
    downloadFile(icsContent, `horario_${periodName.toLowerCase().replace(/\s+/g, '_')}.ics`, 'text/calendar;charset=utf-8;');
    onClose();
  };

  const handleExportPdfClick = async () => {
    setBusy(true);
    try {
      await onExportPdf();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Exportar Horario
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Elige el formato de descarga para {periodName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="py-4 space-y-3">
          {/* PDF */}
          <button
            type="button"
            onClick={handleExportPdfClick}
            disabled={busy}
            className="w-full p-3.5 text-left rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3 group"
          >
            <div className="size-10 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
              <span className="material-symbols-outlined">picture_as_pdf</span>
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary">
                Documento PDF
              </div>
              <div className="text-[11px] text-slate-500">
                Grilla semanal imprimible con formato institucional
              </div>
            </div>
          </button>

          {/* Excel / CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="w-full p-3.5 text-left rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3 group"
          >
            <div className="size-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined">table_view</span>
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary">
                Planilla Excel (CSV)
              </div>
              <div className="text-[11px] text-slate-500">
                Sábana completa de datos con docentes, salas y bloques
              </div>
            </div>
          </button>

          {/* iCal */}
          <button
            type="button"
            onClick={handleExportICal}
            className="w-full p-3.5 text-left rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3 group"
          >
            <div className="size-10 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined">calendar_add_on</span>
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary">
                Calendario iCal (.ics)
              </div>
              <div className="text-[11px] text-slate-500">
                Sincronización directa con Google Calendar, Apple Calendar y Outlook
              </div>
            </div>
          </button>
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
