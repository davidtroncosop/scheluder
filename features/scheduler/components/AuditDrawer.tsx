import React from 'react';

export interface AuditLogItem {
  id: string;
  timestamp: Date;
  action: string;
  description: string;
  user: string;
}

interface AuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  auditLog: AuditLogItem[];
}

export const AuditDrawer: React.FC<AuditDrawerProps> = ({
  isOpen,
  onClose,
  auditLog,
}) => {
  if (!isOpen) return null;

  const getActionBadge = (action: string) => {
    switch (action.toLowerCase()) {
      case 'publish':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600">Publicación</span>;
      case 'delete':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600">Eliminación</span>;
      case 'assign':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600">Asignación</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{action}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/30 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-500">history</span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Historial de Auditoría
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Audit List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {auditLog.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No hay registros de auditoría en este período
            </div>
          ) : (
            auditLog.map(item => (
              <div
                key={item.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  {getActionBadge(item.action)}
                  <span className="text-[10px] text-slate-400">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {item.description}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">account_circle</span>
                  <span>{item.user}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
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
