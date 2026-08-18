import React from 'react';
import type { SchedulerSection as Section } from '../model';

interface RoomSelectorModalProps {
  selectorData: {
    section: Section;
    timeslotId: string;
    dayOfWeek: number;
    parallelIndex: number;
  } | null;
  compatibleRooms: Array<{ id: string; name: string; type: string; capacity: number }>;
  onClose: () => void;
  onSelectRoom: (roomId: string) => void;
}

const dayNames = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

export const RoomSelectorModal: React.FC<RoomSelectorModalProps> = ({
  selectorData,
  compatibleRooms,
  onClose,
  onSelectRoom,
}) => {
  if (!selectorData) return null;

  const { section, dayOfWeek } = selectorData;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Seleccionar Sala para Asignación
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              NRC {section.nrc} ({section.type || 'TEO'}) — {dayNames[dayOfWeek]}
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

        <div className="py-4 space-y-2 max-h-60 overflow-y-auto">
          {compatibleRooms.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">
              No hay salas compatibles disponibles.
            </p>
          ) : (
            compatibleRooms.map(room => (
              <button
                key={room.id}
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className="w-full p-3 text-left rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-all flex items-center justify-between group"
              >
                <div>
                  <div className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-primary">
                    {room.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Tipo: {room.type} | Capacidad: {room.capacity} alumnos
                  </div>
                </div>
                <span className="material-symbols-outlined text-slate-400 group-hover:text-primary text-sm">
                  arrow_forward
                </span>
              </button>
            ))
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
