import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MainLayout } from '../components/MainLayout';
import { useAcademicPeriods } from '../lib/academicPeriods';
import { session } from '../lib/session';
import api from '../services/api';
import { generateICalendar, generateScheduleCsv, generateSchedulePdf, downloadFile } from '../features/scheduler/export';
import type { AssignmentWithDetails, Career, Room, Teacher, Timeslot } from '../types';

type ViewMode = 'level' | 'teacher' | 'room';

const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const typeBadgeColors: Record<string, string> = {
  TEO: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  LAB: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  SIM: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 border-purple-200 dark:border-purple-800',
  TAL: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-800',
  AUD: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-200 dark:border-rose-800',
};

const HorariosPage: React.FC = () => {
  const { periods, selectedPeriod, setSelectedPeriod } = useAcademicPeriods();
  const currentUser = session.getUser();
  const isAdmin = currentUser?.role === 'admin';

  const [careers, setCareers] = useState<Career[]>([]);
  const [selectedCareer, setSelectedCareer] = useState(currentUser?.career_id || '');
  const [viewMode, setViewMode] = useState<ViewMode>('level');
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([]);
  const [timeslots, setTimeslots] = useState<Timeslot[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleStatus, setScheduleStatus] = useState<'draft' | 'review' | 'published'>('draft');

  // Load initial career, timeslots, teachers, rooms
  useEffect(() => {
    Promise.all([
      api.getCareers(),
      api.getTimeslots(),
      api.getTeachers(),
      api.getRooms(),
    ]).then(([careerList, timeslotList, teacherList, roomList]) => {
      setCareers(careerList);
      setTimeslots((timeslotList as Timeslot[]).sort((a, b) => a.order_index - b.order_index));
      setTeachers(teacherList as Teacher[]);
      setRooms(roomList as Room[]);
      if (!selectedCareer && careerList[0]) setSelectedCareer(careerList[0].id);
      if (teacherList[0]) setSelectedTeacherId(teacherList[0].id);
      if (roomList[0]) setSelectedRoomId(roomList[0].id);
    }).catch(console.error);
  }, [selectedCareer]);

  // Load schedule assignments when context changes
  const loadSchedule = useCallback(async () => {
    if (!selectedPeriod || !selectedCareer) return;
    setLoading(true);
    try {
      const [scheduleRows, statusInfo] = await Promise.all([
        api.getSchedule(selectedPeriod, selectedCareer),
        api.getScheduleStatus(selectedPeriod, selectedCareer).catch(() => ({ status: 'draft' as const })),
      ]);
      setAssignments(scheduleRows);
      setScheduleStatus(statusInfo.status);
    } catch (error) {
      console.error('Error cargando horario:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCareer, selectedPeriod]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Distinct levels from assignments
  const availableLevels = useMemo(() => {
    const levels = new Set<number>();
    assignments.forEach(a => {
      if (a.level) levels.add(a.level);
    });
    if (levels.size === 0) return [1, 2, 3, 4, 5, 6, 7, 8];
    return Array.from(levels).sort((a, b) => a - b);
  }, [assignments]);

  // Filter assignments based on viewMode and search
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      // Search filter
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesName = a.subject_name?.toLowerCase().includes(query);
        const matchesCode = a.subject_code?.toLowerCase().includes(query);
        const matchesNrc = a.nrc?.toLowerCase().includes(query);
        const matchesTeacher = a.teacher_name?.toLowerCase().includes(query);
        const matchesRoom = a.room_name?.toLowerCase().includes(query);
        if (!matchesName && !matchesCode && !matchesNrc && !matchesTeacher && !matchesRoom) {
          return false;
        }
      }

      // View mode filter
      if (viewMode === 'level') {
        return a.level === selectedLevel;
      }
      if (viewMode === 'teacher') {
        return a.teacher_id === selectedTeacherId;
      }
      if (viewMode === 'room') {
        return a.room_id === selectedRoomId;
      }
      return true;
    });
  }, [assignments, searchTerm, viewMode, selectedLevel, selectedTeacherId, selectedRoomId]);

  // Map assignments to day + timeslot grid
  const gridMap = useMemo(() => {
    const map = new Map<string, AssignmentWithDetails[]>();
    filteredAssignments.forEach(a => {
      const key = `${a.day_of_week}_${a.timeslot_id}`;
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    });
    return map;
  }, [filteredAssignments]);

  const selectedCareerInfo = careers.find(c => c.id === selectedCareer);
  const selectedPeriodInfo = periods.find(p => p.id === selectedPeriod);

  // Exports
  const handleExportICal = () => {
    const ics = generateICalendar(filteredAssignments as any[], {
      calendarName: `${selectedCareerInfo?.name || 'Horario'} - ${selectedPeriodInfo?.name || selectedPeriod}`,
    });
    downloadFile(ics, `horario_${selectedCareerInfo?.code || 'carrera'}_${viewMode}_${selectedPeriod}.ics`, 'text/calendar;charset=utf-8;');
  };

  const handleExportCsv = () => {
    const csv = generateScheduleCsv(filteredAssignments as any[]);
    downloadFile(csv, `horario_${selectedCareerInfo?.code || 'carrera'}_${viewMode}_${selectedPeriod}.csv`, 'text/csv;charset=utf-8;');
  };

  const handleExportPdf = () => {
    const doc = generateSchedulePdf({
      assignments: filteredAssignments as any[],
      timeslots: timeslots.map(t => ({ id: t.id, label: t.label, start_time: t.start_time, end_time: t.end_time, order_index: t.order_index })),
      periodName: selectedPeriodInfo?.name || selectedPeriod,
      careerName: selectedCareerInfo?.name || 'Carrera Universitaria',
      viewMode: viewMode === 'level' ? 'nivel' : viewMode === 'room' ? 'sala' : 'docente',
      selectedLevel: viewMode === 'level' ? selectedLevel : 0,
      selectedRoom: viewMode === 'room' ? (rooms.find(r => r.id === selectedRoomId)?.name || 'TODAS') : 'TODAS',
      selectedTeacher: viewMode === 'teacher' ? (teachers.find(t => t.id === selectedTeacherId)?.name || null) : null,
      parallelTracks: 2,
    });
    doc.save(`horario_${selectedCareerInfo?.code || 'carrera'}_${viewMode}_${selectedPeriod}.pdf`);
  };

  return (
    <MainLayout
      title="Horarios Oficiales"
      selectedPeriod={selectedPeriod}
      onPeriodChange={setSelectedPeriod}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportICal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-primary hover:text-primary transition-all shadow-xs active:scale-95"
            title="Sincronizar con Google / Apple Calendar"
          >
            <span className="material-symbols-outlined text-base text-blue-500">calendar_month</span>
            <span className="hidden sm:inline">iCal (.ics)</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-primary hover:text-primary transition-all shadow-xs active:scale-95"
            title="Descargar Planilla Excel"
          >
            <span className="material-symbols-outlined text-base text-emerald-500">table_view</span>
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="btn-primary"
            title="Descargar Horario en PDF Oficial"
          >
            <span className="material-symbols-outlined text-[17px]">picture_as_pdf</span>
            <span className="hidden sm:inline">Descargar PDF</span>
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 animate-fade-in">
        {/* Controls Bar */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          {/* Career & Status Badge */}
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin ? (
              <select
                value={selectedCareer}
                onChange={e => setSelectedCareer(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white"
              >
                {careers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </select>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white">
                <span className="material-symbols-outlined text-base text-primary">school</span>
                {selectedCareerInfo?.name}
              </div>
            )}

            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
              scheduleStatus === 'published'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
            }`}>
              <span className="size-1.5 rounded-full bg-current"></span>
              {scheduleStatus === 'published' ? 'Publicado Oficial' : 'Borrador en Edición'}
            </span>

            <span className="text-xs font-bold text-slate-400">
              {filteredAssignments.length} bloques programados
            </span>
          </div>

          {/* View Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setViewMode('level')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'level' ? 'bg-white dark:bg-slate-900 text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">layers</span>
                Por Nivel
              </button>
              <button
                type="button"
                onClick={() => setViewMode('teacher')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'teacher' ? 'bg-white dark:bg-slate-900 text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">person</span>
                Por Docente
              </button>
              <button
                type="button"
                onClick={() => setViewMode('room')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'room' ? 'bg-white dark:bg-slate-900 text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">meeting_room</span>
                Por Sala
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
              <input
                type="text"
                placeholder="Buscar ramo, NRC o sala..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white font-medium focus:outline-none focus:border-primary w-48"
              />
            </div>
          </div>
        </div>

        {/* Sub-selector based on ViewMode */}
        {viewMode === 'level' && (
          <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
            {availableLevels.map(level => (
              <button
                key={level}
                type="button"
                onClick={() => setSelectedLevel(level)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 ${
                  selectedLevel === level
                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                    : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                }`}
              >
                Nivel {level}
              </button>
            ))}
          </div>
        )}

        {viewMode === 'teacher' && (
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500">Seleccionar Docente:</span>
            <select
              value={selectedTeacherId}
              onChange={e => setSelectedTeacherId(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white flex-1 max-w-md"
            >
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.contract_type})</option>
              ))}
            </select>
          </div>
        )}

        {viewMode === 'room' && (
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500">Seleccionar Sala / Espacio:</span>
            <select
              value={selectedRoomId}
              onChange={e => setSelectedRoomId(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-white flex-1 max-w-md"
            >
              {rooms.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.type} · Cap: {r.capacity})</option>
              ))}
            </select>
          </div>
        )}

        {/* Timetable Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
                  <th className="py-3 px-4 text-center text-xs font-black uppercase text-slate-400 tracking-wider w-24">
                    Bloque
                  </th>
                  {dayNames.map((day, idx) => (
                    <th key={day} className="py-3 px-4 text-center text-xs font-black uppercase text-slate-700 dark:text-slate-200 tracking-wider">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {timeslots.map(slot => (
                  <tr key={slot.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    {/* Time Column */}
                    <td className="py-3 px-3 text-center border-r border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/50">
                      <p className="text-xs font-black text-slate-800 dark:text-white">{slot.label}</p>
                      <p className="text-[10px] font-semibold text-slate-400 font-mono mt-0.5">{slot.start_time} - {slot.end_time}</p>
                    </td>

                    {/* Day Cells */}
                    {[1, 2, 3, 4, 5].map(day => {
                      const key = `${day}_${slot.id}`;
                      const cellAssignments = gridMap.get(key) || [];

                      return (
                        <td key={day} className="py-2 px-2.5 align-top min-w-[140px] border-r border-slate-100 dark:border-slate-800/60 last:border-r-0">
                          {cellAssignments.length === 0 ? (
                            <div className="h-16 flex items-center justify-center text-[10px] text-slate-300 dark:text-slate-700 font-bold">
                              —
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {cellAssignments.map(asg => {
                                const stype = asg.section_type || 'TEO';
                                const typeColor = typeBadgeColors[stype] || typeBadgeColors.TEO;

                                return (
                                  <div
                                    key={asg.id}
                                    className={`p-2.5 rounded-xl border transition-all hover:shadow-md ${typeColor}`}
                                  >
                                    <div className="flex items-start justify-between gap-1 mb-1">
                                      <span className="font-black text-xs leading-tight line-clamp-2">
                                        {asg.subject_name || asg.subject_code}
                                      </span>
                                      <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-white/70 dark:bg-black/40 border border-current shrink-0">
                                        {stype}
                                      </span>
                                    </div>

                                    <div className="text-[10px] space-y-0.5 opacity-90">
                                      <p className="font-bold flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px]">meeting_room</span>
                                        {asg.room_name || 'Sin sala'}
                                      </p>
                                      {viewMode !== 'teacher' && (
                                        <p className="flex items-center gap-1 truncate">
                                          <span className="material-symbols-outlined text-[12px]">person</span>
                                          {asg.teacher_name || 'Sin docente'}
                                        </p>
                                      )}
                                      <p className="text-[9px] text-slate-500 dark:text-slate-400 font-mono">
                                        NRC {asg.nrc}
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default HorariosPage;
