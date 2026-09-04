import { useState, useMemo, useCallback } from 'react';
import type {
  SchedulerAssignment as Assignment,
  SchedulerConflict as Conflict,
  SchedulerHealth as HealthMetrics,
  SchedulerSection as Section,
  SchedulerTimeslot as Timeslot,
} from '../model';
import type { AuditLogItem } from '../components/AuditDrawer';
import type { ImportedTeacher, ImportedSubject } from '../../../lib/dataStore';
import * as dataStore from '../../../lib/dataStore';
import { OFFLINE_DEMO_ENABLED } from '../../../lib/runtime';

export interface RoomItem {
  id: string;
  name: string;
  type: string;
  capacity: number;
}

export interface ProposalStats {
  completed: number;
  failed: number;
  total: number;
}

export function useSchedulerState() {
  // Core data states
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [timeslots, setTimeslots] = useState<Timeslot[]>([]);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Workflow state
  const [scheduleStatus, setScheduleStatus] = useState<'draft' | 'review' | 'published'>('draft');
  const [scheduleUpdatedAt, setScheduleUpdatedAt] = useState<string | null>(null);

  // Master data
  const [availableRooms, setAvailableRooms] = useState<RoomItem[]>([]);
  const [teachers, setTeachers] = useState<ImportedTeacher[]>([]);
  const [allSubjects, setAllSubjects] = useState<ImportedSubject[]>([]);
  const [teacherAvailabilities, setTeacherAvailabilities] = useState<
    Array<{ teacher_id: string; day_of_week: number; timeslot_id: string; status: string; teacher_name?: string }>
  >([]);

  // View mode states
  const [viewMode, setViewMode] = useState<'nivel' | 'sala' | 'docente'>('nivel');
  const [selectedViewLevel, setSelectedViewLevel] = useState<number>(1);
  const [selectedViewTeacher, setSelectedViewTeacher] = useState<string | null>(null);
  const [selectedViewRoom, setSelectedViewRoom] = useState<string>('TODAS');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Drag and Drop & Active Scheduling Section states
  const [draggingSection, setDraggingSection] = useState<Section | null>(null);
  const [activeSchedulingSection, setActiveSchedulingSection] = useState<Section | null>(null);
  const [dropTarget, setDropTarget] = useState<{ timeslotId: string; dayOfWeek: number; parallelIndex: number } | null>(null);
  const [roomSelectorData, setRoomSelectorData] = useState<{
    section: Section;
    timeslotId: string;
    dayOfWeek: number;
    parallelIndex: number;
  } | null>(null);

  // Modals & Panels state
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const [showConflictsPanel, setShowConflictsPanel] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [modalDefaultLevel, setModalDefaultLevel] = useState<number>(1);
  const [modalInitialValues, setModalInitialValues] = useState<Partial<Section> | null>(null);
  const [proposalResult, setProposalResult] = useState<ProposalStats | null>(null);

  // Audit Log state
  const [auditLog, setAuditLog] = useState<AuditLogItem[]>([
    { id: '1', timestamp: new Date(Date.now() - 3600000), action: 'save', description: 'Guardado borrador', user: 'Coordinador' },
    { id: '2', timestamp: new Date(Date.now() - 7200000), action: 'assign', description: 'Asignado módulo a Lunes Bloque 1', user: 'Coordinador' },
  ]);

  const addAuditEntry = useCallback((action: string, description: string) => {
    setAuditLog(prev => [{
      id: `audit-${Date.now()}`,
      timestamp: new Date(),
      action,
      description,
      user: 'Coordinador',
    }, ...prev]);
  }, []);

  // Room synchronization
  const refreshRooms = useCallback(() => {
    const rooms = dataStore.getRooms();
    const mapped = rooms.length > 0
      ? rooms.map((r: any) => ({
        id: r.id,
        name: r.nombre || r.name || 'Sin Nombre',
        type: (r.tipo || r.type || 'TEO').toUpperCase(),
        capacity: r.capacidad || r.capacity || 30,
      }))
      : OFFLINE_DEMO_ENABLED ? [
        { id: 'room-1', name: 'SALA 201', type: 'TEO', capacity: 40 },
        { id: 'room-2', name: 'SALA 202', type: 'TEO', capacity: 40 },
        { id: 'room-3', name: 'SALA 204', type: 'TEO', capacity: 35 },
        { id: 'room-4', name: 'LAB 1', type: 'LAB', capacity: 20 },
        { id: 'room-5', name: 'LAB 2', type: 'LAB', capacity: 20 },
        { id: 'room-6', name: 'SIMULADOR 1', type: 'SIM', capacity: 15 },
        { id: 'room-7', name: 'SIMULADOR 2', type: 'SIM', capacity: 15 },
      ] : [];
    setAvailableRooms(mapped);
    if (mapped[0] && !selectedViewRoom) {
      setSelectedViewRoom(mapped[0].name);
    }
  }, [selectedViewRoom]);

  // Derived memoized lists
  const availableTeachersList = useMemo(() => {
    const list = teachers.map(t => t.nombre).filter(Boolean);
    assignments.forEach(a => {
      if (a.teacher_name && !list.includes(a.teacher_name)) {
        list.push(a.teacher_name);
      }
    });
    return [...new Set(list)];
  }, [teachers, assignments]);

  const availableLevels = useMemo(() => {
    const levels = new Set<number>();
    sections.forEach(s => {
      if (s.level) levels.add(Number(s.level));
    });
    if (levels.size === 0) return [1, 2, 3, 4, 5, 6, 7, 8];
    return Array.from(levels).sort((a, b) => a - b);
  }, [sections]);

  const totalRequired = useMemo(() => sections.reduce((acc, s) => acc + Number(s.hours_per_week || 0), 0), [sections]);
  const canPublish = totalRequired > 0 && assignments.length >= totalRequired && conflicts.filter(c => c.type === 'CRITICAL').length === 0;

  return {
    // Core Data
    sections,
    setSections,
    assignments,
    setAssignments,
    conflicts,
    setConflicts,
    timeslots,
    setTimeslots,
    metrics,
    setMetrics,
    loading,
    setLoading,
    saving,
    setSaving,
    hasChanges,
    setHasChanges,
    error,
    setError,
    notice,
    setNotice,
    scheduleStatus,
    setScheduleStatus,
    scheduleUpdatedAt,
    setScheduleUpdatedAt,

    // Master Data
    availableRooms,
    setAvailableRooms,
    teachers,
    setTeachers,
    allSubjects,
    setAllSubjects,
    teacherAvailabilities,
    setTeacherAvailabilities,
    refreshRooms,

    // View Modes & Filters
    viewMode,
    setViewMode,
    selectedViewLevel,
    setSelectedViewLevel,
    selectedViewTeacher,
    setSelectedViewTeacher,
    selectedViewRoom,
    setSelectedViewRoom,
    sidebarCollapsed,
    setSidebarCollapsed,
    availableTeachersList,
    availableLevels,

    // Drag & Drop / Active Selection
    draggingSection,
    setDraggingSection,
    activeSchedulingSection,
    setActiveSchedulingSection,
    dropTarget,
    setDropTarget,
    roomSelectorData,
    setRoomSelectorData,

    // Modals & Panels
    editingAssignment,
    setEditingAssignment,
    editingSection,
    setEditingSection,
    isSectionModalOpen,
    setIsSectionModalOpen,
    showExportModal,
    setShowExportModal,
    showAuditPanel,
    setShowAuditPanel,
    showConflictsPanel,
    setShowConflictsPanel,
    showClearConfirmModal,
    setShowClearConfirmModal,
    modalDefaultLevel,
    setModalDefaultLevel,
    modalInitialValues,
    setModalInitialValues,
    proposalResult,
    setProposalResult,

    // Audit
    auditLog,
    setAuditLog,
    addAuditEntry,

    // Computed
    totalRequired,
    canPublish,
  };
}

export type SchedulerStateReturn = ReturnType<typeof useSchedulerState>;
