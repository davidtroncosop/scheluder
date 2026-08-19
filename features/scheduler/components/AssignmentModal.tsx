import React, { useState, useEffect } from 'react';
import type { SchedulerAssignment as Assignment } from '../model';

interface AssignmentModalProps {
  assignment: Assignment | null;
  isOpen: boolean;
  onClose: () => void;
  availableRooms: Array<{ id: string; name: string; type: string; capacity: number }>;
  availableTeachers: string[];
  onSave: (assignmentId: string, data: { room_name: string; teacher_name: string }) => Promise<void>;
  onDelete: (assignmentId: string) => Promise<void>;
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
  assignment,
  isOpen,
  onClose,
  availableRooms,
  availableTeachers,
  onSave,
  onDelete,
}) => {
  const [roomName, setRoomName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (assignment) {
      setRoomName(assignment.room_name || '');
      setTeacherName(assignment.teacher_name || '');
    }
  }, [assignment]);

  if (!isOpen || !assignment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(assignment.id, { room_name: roomName, teacher_name: teacherName });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Estás seguro de que deseas desasignar esta clase?')) return;
    setBusy(true);
    try {
      await onDelete(assignment.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Editar Asignación
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              NRC {assignment.nrc} — {assignment.subject_name || assignment.subject_code}
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

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Room Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Sala Asignada
            </label>
            <select
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
            >
              <option value="">Seleccionar sala...</option>
              {availableRooms.map(r => (
                <option key={r.id} value={r.name}>
                  {r.name} ({r.type} - Cap: {r.capacity})
                </option>
              ))}
            </select>
          </div>

          {/* Teacher Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Docente
            </label>
            <select
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
            >
              <option value="">Sin docente asignado</option>
              {availableTeachers.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="text-xs text-rose-600 dark:text-rose-400 font-bold hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              <span>Desasignar</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-1.5 text-xs font-bold bg-primary text-white hover:bg-primary/90 rounded-lg shadow-xs"
              >
                {busy ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
