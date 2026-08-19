import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { MainLayout } from '../components/MainLayout';
import ConflictPanel from '../components/ConflictPanel';
import api from '../services/api';
import * as dataStore from '../lib/dataStore';
import { OFFLINE_DEMO_ENABLED } from '../lib/runtime';
import { useAcademicPeriods } from '../lib/academicPeriods';
import {
  calculateHealth,
  mapBackendAssignments,
  type SchedulerAssignment as Assignment,
  type SchedulerConflict as Conflict,
  type SchedulerHealth as HealthMetrics,
  type SchedulerSection as Section,
  type SchedulerTimeslot as Timeslot,
} from '../features/scheduler/model';
import { buildPrioritizedAssignmentQueue } from '../features/assisted-planner/workflow';

import { SchedulerHeader } from '../features/scheduler/components/SchedulerHeader';
import { SchedulerStats } from '../features/scheduler/components/SchedulerStats';
import { SchedulerGrid } from '../features/scheduler/components/SchedulerGrid';
import { SchedulerSidebar } from '../features/scheduler/components/SchedulerSidebar';
import { AssignmentModal } from '../features/scheduler/components/AssignmentModal';
import { SectionModal } from '../features/scheduler/components/SectionModal';
import { RoomSelectorModal } from '../features/scheduler/components/RoomSelectorModal';
import { ExportModal } from '../features/scheduler/components/ExportModal';
import { AuditDrawer, type AuditLogItem } from '../features/scheduler/components/AuditDrawer';

export type { SchedulerConflict as Conflict } from '../features/scheduler/model';

const DAYS_LIST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const SchedulerPage: React.FC = () => {
  // Data states
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [timeslots, setTimeslots] = useState<Timeslot[]>([]);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Modals & Panels state
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const [showConflictsPanel, setShowConflictsPanel] = useState(false);
  const [proposalResult, setProposalResult] = useState<{
    completed: number;
    failed: number;
    total: number;
  } | null>(null);
  const [, setSelectedConflict] = useState<Conflict | null>(null);
  const [allSubjects, setAllSubjects] = useState<dataStore.ImportedSubject[]>([]);

  // Period & Workflow state
  const { periods, selectedPeriod, setSelectedPeriod } = useAcademicPeriods();
  const [scheduleStatus, setScheduleStatus] = useState<'draft' | 'review' | 'published'>('draft');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // View mode states
  const [viewMode, setViewMode] = useState<'nivel' | 'sala' | 'docente'>('nivel');
  const [selectedViewLevel, setSelectedViewLevel] = useState<number>(0);
  const [selectedViewTeacher, setSelectedViewTeacher] = useState<string | null>(null);
  const [selectedViewRoom, setSelectedViewRoom] = useState<string>('TODAS');
  const [teacherAvailabilities, setTeacherAvailabilities] = useState<Array<{ teacher_id: string; day_of_week: number; timeslot_id: string; status: string; teacher_name?: string }>>([]);

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
  const [availableRooms, setAvailableRooms] = useState<Array<{ id: string; name: string; type: string; capacity: number }>>([]);

  // Sidebar & Teacher states
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [teachers, setTeachers] = useState<dataStore.ImportedTeacher[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogItem[]>([
    { id: '1', timestamp: new Date(Date.now() - 3600000), action: 'save', description: 'Guardado borrador', user: 'Coordinador' },
    { id: '2', timestamp: new Date(Date.now() - 7200000), action: 'assign', description: 'Asignado módulo a Lunes Bloque 1', user: 'Coordinador' },
  ]);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Helper to add audit logs
  const addAuditEntry = (action: string, description: string) => {
    setAuditLog(prev => [{
      id: `audit-${Date.now()}`,
      timestamp: new Date(),
      action,
      description,
      user: 'Coordinador',
    }, ...prev]);
  };

  // Load Rooms
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

  // Load Teachers & Subjects master data
  useEffect(() => {
    refreshRooms();
    const storedTeachers = dataStore.getTeachers();
    setTeachers(storedTeachers);
    const storedSubjects = dataStore.getSubjects();
    setAllSubjects(storedSubjects);
  }, [refreshRooms]);

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

  // Load schedule data
  const loadScheduleData = useCallback(async () => {
    if (!selectedPeriod) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch remote data with api client
      const [remoteSchedule, remoteSections, remoteTimeslots, remoteConflicts, remoteStatus, remoteRooms, remoteTeachers, remoteAvails] = await Promise.all([
        api.getSchedule(selectedPeriod).catch(() => []),
        api.getSectionsForContext(selectedPeriod).catch(() => []),
        api.getTimeslots().catch(() => []),
        api.getConflicts(false).catch(() => []),
        api.getScheduleStatus(selectedPeriod).catch(() => ({ status: 'draft' as const })),
        api.getRooms().catch(() => []),
        api.getTeachers().catch(() => []),
        api.getTeacherAvailabilities().catch(() => []),
      ]);

      if (remoteAvails && remoteAvails.length > 0) {
        setTeacherAvailabilities(remoteAvails);
      }

      // Set Rooms
      if (remoteRooms.length > 0) {
        setAvailableRooms(remoteRooms.map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          capacity: r.capacity,
        })));
        if (!selectedViewRoom || selectedViewRoom === 'SALA 201') {
          setSelectedViewRoom('TODAS');
        }
      }

      // Set Timeslots
      if (remoteTimeslots && remoteTimeslots.length > 0) {
        const sorted = [...remoteTimeslots].sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
        setTimeslots(sorted.map(slot => ({
          id: slot.id,
          label: slot.label,
          start_time: slot.start_time,
          end_time: slot.end_time,
          order_index: Number(slot.order_index || 0),
        })));
      } else {
        setTimeslots(dataStore.getCustomTimeslots());
      }

      // Set Status
      setScheduleStatus(remoteStatus.status);

      // Set Assignments
      const mappedAsgs = mapBackendAssignments(remoteSchedule);
      setAssignments(mappedAsgs);

      // Set Conflicts
      const loadedConflicts: Conflict[] = (remoteConflicts as any[]).map((c: any) => ({
        id: c.id,
        assignment_id: c.assignment_id,
        type: c.type,
        rule_code: c.rule_code,
        description: c.description || '',
        subject_name: c.subject_name || '',
        nrc: c.nrc || '',
        teacher_name: c.teacher_name || null,
        timeslot_label: c.timeslot_label || '',
        day_of_week: Number(c.day_of_week || 1),
        parallel_index: Number(c.parallel_index || 0),
        is_resolved: c.is_resolved,
      }));
      setConflicts(loadedConflicts);

      // Set Sections
      if (remoteSections && remoteSections.length > 0) {
        const mappedSecs: Section[] = remoteSections.map((s: any) => ({
          id: s.id,
          subject_id: s.subject_id,
          nrc: s.nrc,
          subject_name: s.subject_name || s.nombre || s.codigo,
          subject_code: s.subject_code || s.codigo,
          level: Number(s.level || s.nivel || 1),
          type: s.type || s.tipo || 'TEO',
          parent_section_id: s.parent_section_id || null,
          parent_nrc: s.parent_nrc || null,
          parent_subject_name: s.parent_subject_name || null,
          hours_per_week: Number(s.hours_per_week || s.horas || 2),
          assigned_slots: Number(s.assigned_slots || 0),
          priority: Number(s.priority || 0),
          teacher_name: s.teacher_name || s.profesor || null,
        }));
        setSections(mappedSecs);
        setMetrics(calculateHealth(mappedSecs, mappedAsgs, loadedConflicts));
      } else {
        // Fallback to local store or demo sections
        const localSecs = dataStore.getSections().map((s: any) => ({
          id: s.id,
          subject_id: s.subject_id || '',
          nrc: s.nrc || '',
          subject_name: s.nombre || s.subject_name || s.codigo || '',
          subject_code: s.codigo || s.subject_code || '',
          level: Number(s.nivel || s.level || 1),
          type: s.tipo || s.type || 'TEO',
          parent_section_id: s.nrc_teorico || s.parent_section_id || null,
          parent_nrc: s.parent_nrc || null,
          hours_per_week: Number(s.horas || s.hours_per_week || 2),
          assigned_slots: Number(s.assigned_slots || 0),
          priority: 0,
          teacher_name: s.profesor || s.teacher_name || null,
        }));
        setSections(localSecs);
        setMetrics(calculateHealth(localSecs, mappedAsgs, loadedConflicts));
      }
    } catch (err) {
      console.error('Error loading schedule data:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod, selectedViewRoom]);

  useEffect(() => {
    loadScheduleData();
  }, [loadScheduleData]);

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, section: Section) => {
    setDraggingSection(section);
    e.dataTransfer.setData('text/plain', JSON.stringify(section));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragEnd = () => {
    setDraggingSection(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, timeslotId: string, dayOfWeek: number, parallelIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTarget({ timeslotId, dayOfWeek, parallelIndex });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const getCompatibleRoomsForType = (sectionType: string) => {
    const type = (sectionType || '').toUpperCase();
    if (type === 'SIM') return availableRooms.filter(r => r.type === 'SIM' || r.type === 'LAB');
    if (type === 'LAB') return availableRooms.filter(r => r.type === 'LAB' || r.type === 'SIM');
    if (type === 'TAL') return availableRooms.filter(r => r.type === 'TAL');
    return availableRooms.filter(r => r.type === 'TEO' || r.type === 'AUD');
  };

  const findFreeCompatibleRoom = (sectionType?: string, dayOfWeek?: number, timeslotId?: string) => {
    const secType = (sectionType || 'TEO').toUpperCase();
    const compatRooms = availableRooms.filter(r => {
      if (secType === 'LAB') return r.type === 'LAB' || r.type === 'SIM';
      if (secType === 'SIM') return r.type === 'SIM' || r.type === 'LAB';
      if (secType === 'TAL') return r.type === 'TAL';
      return r.type === 'TEO' || r.type === 'AUD';
    });

    if (!dayOfWeek || !timeslotId) return compatRooms[0] || availableRooms[0];

    const occupiedRoomIds = assignments
      .filter(a => a.day_of_week === dayOfWeek && a.timeslot_id === timeslotId)
      .map(a => (a.room_id || a.room_name || '').toUpperCase());

    const freeRooms = compatRooms.filter(
      r => !occupiedRoomIds.includes(r.id.toUpperCase()) && !occupiedRoomIds.includes(r.name.toUpperCase())
    );

    return freeRooms[0] || compatRooms[0] || availableRooms[0];
  };

  // Handler for updating teacher of a section
  const handleUpdateSectionTeacher = async (sectionId: string, teacherName: string, teacherId?: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, teacher_name: teacherName, teacher_id: teacherId || null } : s));
    if (activeSchedulingSection?.id === sectionId) {
      setActiveSchedulingSection(prev => prev ? { ...prev, teacher_name: teacherName, teacher_id: teacherId || null } : null);
    }
    if (dataStore.getAuthToken()) {
      try {
        await api.updateSectionTeacher(sectionId, teacherId || null);
      } catch (err) {
        console.warn('Failed to update teacher on server:', err);
      }
    }
  };

  // Handler for updating room of a section
  const handleUpdateSectionRoom = (sectionId: string, roomId: string, roomName: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, room_id: roomId, preferred_room_id: roomId, room_name: roomName } : s));
    if (activeSchedulingSection?.id === sectionId) {
      setActiveSchedulingSection(prev => prev ? { ...prev, room_id: roomId, preferred_room_id: roomId, room_name: roomName } : null);
    }
  };

  // Direct unified execution helper
  const executeAssignment = async (section: Section, roomId: string, timeslotId: string, dayOfWeek: number) => {
    if (!selectedPeriod) return;
    try {
      setSaving(true);
      setError(null);
      if (dataStore.getAuthToken()) {
        const res = await api.assignSection({
          section_id: section.id,
          room_id: roomId,
          timeslot_id: timeslotId,
          day_of_week: dayOfWeek,
          period_id: selectedPeriod,
        });

        const roomObj = availableRooms.find(r => r.id === roomId);
        if (res.warnings && res.warnings.length > 0) {
          setNotice({ type: 'info', message: `Asignado en ${roomObj?.name || 'sala'}: ${res.warnings[0].description}` });
        } else {
          setNotice({ type: 'success', message: `NRC ${section.nrc} asignado exitosamente en ${roomObj?.name || 'sala'}` });
        }
        await loadScheduleData();
      } else {
        const roomObj = availableRooms.find(r => r.id === roomId);
        const newAsg: Assignment = {
          id: `asg-${Date.now()}`,
          section_id: section.id,
          room_id: roomId,
          timeslot_id: timeslotId,
          day_of_week: dayOfWeek,
          period_id: selectedPeriod,
          parallel_index: 0,
          nrc: section.nrc,
          subject_code: section.subject_code,
          subject_name: section.subject_name,
          level: section.level,
          section_type: section.type,
          teacher_name: section.teacher_name,
          room_name: roomObj?.name || null,
          room_type: roomObj?.type || 'TEO',
          timeslot_label: timeslots.find(t => t.id === timeslotId)?.label || '',
        };
        setAssignments(prev => [...prev, newAsg]);
        setHasChanges(true);
      }
      addAuditEntry('assign', `Asignado NRC ${section.nrc} a día ${dayOfWeek}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar la sección');
    } finally {
      setSaving(false);
      setRoomSelectorData(null);
    }
  };

  // Direct slot click handler (Click-to-Assign)
  const handleSlotClick = async (timeslotId: string, dayOfWeek: number, parallelIndex: number) => {
    if (!activeSchedulingSection) return;

    const chosenRoomId = activeSchedulingSection.room_id || activeSchedulingSection.preferred_room_id;
    if (chosenRoomId) {
      await executeAssignment(activeSchedulingSection, chosenRoomId, timeslotId, dayOfWeek);
    } else {
      const freeRoom = findFreeCompatibleRoom(activeSchedulingSection.type, dayOfWeek, timeslotId);
      if (freeRoom) {
        await executeAssignment(activeSchedulingSection, freeRoom.id, timeslotId, dayOfWeek);
      } else {
        setRoomSelectorData({
          section: activeSchedulingSection,
          timeslotId,
          dayOfWeek,
          parallelIndex,
        });
      }
    }
  };

  const handleDrop = async (e: React.DragEvent, timeslotId: string, dayOfWeek: number, parallelIndex: number) => {
    e.preventDefault();
    setDropTarget(null);

    let sectionToAssign = draggingSection || activeSchedulingSection;
    if (!sectionToAssign) {
      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) sectionToAssign = JSON.parse(raw);
      } catch {
        return;
      }
    }

    if (!sectionToAssign) return;

    const chosenRoomId = sectionToAssign.room_id || sectionToAssign.preferred_room_id;
    if (chosenRoomId) {
      await executeAssignment(sectionToAssign, chosenRoomId, timeslotId, dayOfWeek);
    } else {
      const freeRoom = findFreeCompatibleRoom(sectionToAssign.type, dayOfWeek, timeslotId);
      if (freeRoom) {
        await executeAssignment(sectionToAssign, freeRoom.id, timeslotId, dayOfWeek);
      } else {
        setRoomSelectorData({
          section: sectionToAssign,
          timeslotId,
          dayOfWeek,
          parallelIndex,
        });
      }
    }
  };

  const handleConfirmRoomAssignment = async (roomId: string) => {
    if (!roomSelectorData || !selectedPeriod) return;
    const { section, timeslotId, dayOfWeek } = roomSelectorData;
    await executeAssignment(section, roomId, timeslotId, dayOfWeek);
  };

  // Auto assign solver handler
  const handleAutoAssign = async () => {
    if (!sections.length || !selectedPeriod) return;
    setSaving(true);
    setNotice(null);
    const queue = buildPrioritizedAssignmentQueue(sections);
    let completed = 0;
    let failed = 0;

    for (const sectionId of queue) {
      try {
        const scores = await api.getSlotScores(sectionId, selectedPeriod);
        const best = scores.find(score => !score.blocked);
        if (!best) {
          failed++;
        } else {
          await api.assignSection({
            section_id: sectionId,
            room_id: best.room_id,
            timeslot_id: best.timeslot_id,
            day_of_week: best.day_of_week,
            period_id: selectedPeriod,
          });
          completed++;
        }
      } catch {
        failed++;
      }
    }

    await loadScheduleData();
    setSaving(false);
    setProposalResult({
      completed,
      failed,
      total: queue.length,
    });
    setNotice({
      type: failed ? 'info' : 'success',
      message: failed
        ? `Propuesta generada: ${completed} bloques asignados (${failed} requieren ajuste manual)`
        : `Propuesta automática completada: ${completed} de ${queue.length} bloques asignados`,
    });
    addAuditEntry('auto-assign', `Generada propuesta automática: ${completed} bloques ubicados`);
  };

  // Edit Assignment Modal handlers
  const handleEditAssignment = (assignment: Assignment) => {
    setEditingAssignment(assignment);
  };

  const handleSaveAssignment = async (assignmentId: string, data: { room_name: string; teacher_name: string }) => {
    try {
      const room = availableRooms.find(r => r.name === data.room_name);
      const teacher = teachers.find(t => t.nombre === data.teacher_name);

      if (dataStore.getAuthToken()) {
        await api.updateAssignment(assignmentId, {
          room_id: room?.id,
          teacher_id: teacher?.id,
        });
        await loadScheduleData();
      } else {
        setAssignments(prev => prev.map(a =>
          a.id === assignmentId ? { ...a, room_name: data.room_name, teacher_name: data.teacher_name } : a
        ));
        setHasChanges(true);
      }
      addAuditEntry('update', `Modificada asignación ${assignmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      if (dataStore.getAuthToken()) {
        await api.deleteAssignment(assignmentId);
        await loadScheduleData();
      } else {
        setAssignments(prev => prev.filter(a => a.id !== assignmentId));
        setHasChanges(true);
      }
      addAuditEntry('delete', `Desasignada clase ${assignmentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  // Section Modal (Backlog CRUD) handlers
  const handleOpenSectionModal = (section?: Section) => {
    setEditingSection(section || null);
    setIsSectionModalOpen(true);
  };

  const handleSaveSection = async (formData: {
    id?: string;
    nrc: string;
    subject_id: string;
    type: string;
    hours_per_week: number;
    level: number;
    teacher_name: string;
    parent_section_id: string;
  }) => {
    try {
      const teacher = teachers.find(t => t.nombre === formData.teacher_name);

      if (formData.id) {
        if (dataStore.getAuthToken()) {
          await api.updateSection(formData.id, {
            subject_id: formData.subject_id,
            teacher_id: teacher?.id || null,
            nrc: formData.nrc,
            type: formData.type,
            parent_section_id: formData.parent_section_id || null,
            hours_per_week: formData.hours_per_week,
          });
        }
      } else {
        if (dataStore.getAuthToken() && selectedPeriod) {
          await api.createSection({
            period_id: selectedPeriod,
            subject_id: formData.subject_id,
            teacher_id: teacher?.id || null,
            nrc: formData.nrc,
            type: formData.type,
            parent_section_id: formData.parent_section_id || null,
            hours_per_week: formData.hours_per_week,
          });
        }
      }
      await loadScheduleData();
      addAuditEntry('save_section', `Guardada sección NRC ${formData.nrc}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar sección');
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    try {
      if (dataStore.getAuthToken()) {
        await api.deleteSection(sectionId);
        await loadScheduleData();
      }
      addAuditEntry('delete_section', `Eliminada sección ${sectionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar sección');
    }
  };

  // Publish handler
  const handlePublish = async () => {
    const criticalCount = conflicts.filter(c => c.type === 'CRITICAL').length;
    if (criticalCount > 0) {
      alert('No se puede publicar: existen conflictos críticos sin resolver.');
      return;
    }
    try {
      if (dataStore.getAuthToken() && selectedPeriod) {
        await api.publishSchedule(selectedPeriod);
      }
      setScheduleStatus('published');
      setNotice({ type: 'success', message: 'Horario publicado exitosamente' });
      addAuditEntry('publish', `Publicado horario del período ${selectedPeriod}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible publicar');
    }
  };

  // PDF Export
  const handleExportPdf = async () => {
    if (!gridContainerRef.current) return;
    const canvas = await html2canvas(gridContainerRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('landscape', 'mm', 'a3');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.text(`Planificación Académica - ${periods.find(p => p.id === selectedPeriod)?.name || selectedPeriod}`, 15, 15);
    pdf.addImage(imgData, 'PNG', 10, 25, pdfWidth - 20, pdfHeight - 20);
    pdf.save(`horario_${selectedPeriod}_${new Date().toISOString().split('T')[0]}.pdf`);
    addAuditEntry('export_pdf', `Exportado documento PDF del horario`);
  };

  const totalRequired = useMemo(() => sections.reduce((acc, s) => acc + Number(s.hours_per_week || 0), 0), [sections]);
  const canPublish = totalRequired > 0 && assignments.length >= totalRequired && conflicts.filter(c => c.type === 'CRITICAL').length === 0;

  return (
    <MainLayout
      title="Planificador"
      selectedPeriod={selectedPeriod}
      onPeriodChange={setSelectedPeriod}
      showPeriodSelector={false}
      noPadding={true}
      noHeader={true}
    >
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Notice alert */}
        {notice && (
          <div className={`px-6 py-2 text-xs font-semibold flex items-center justify-between shrink-0 ${
            notice.type === 'success' ? 'bg-emerald-500 text-white' : notice.type === 'error' ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white'
          }`}>
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} className="hover:opacity-80">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Error alert */}
        {error && (
          <div className="px-6 py-2 text-xs font-semibold bg-rose-600 text-white flex items-center justify-between shrink-0">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="hover:opacity-80">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Header Toolbar */}
        <SchedulerHeader
          periods={periods}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={setSelectedPeriod}
          scheduleStatus={scheduleStatus}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          selectedViewLevel={selectedViewLevel}
          onChangeViewLevel={setSelectedViewLevel}
          availableLevels={availableLevels}
          selectedViewRoom={selectedViewRoom}
          onChangeViewRoom={setSelectedViewRoom}
          availableRooms={availableRooms}
          selectedViewTeacher={selectedViewTeacher}
          onChangeViewTeacher={setSelectedViewTeacher}
          availableTeachers={availableTeachersList}
          onAutoAssign={handleAutoAssign}
          onPublish={handlePublish}
          onOpenExport={() => setShowExportModal(true)}
          onOpenAudit={() => setShowAuditPanel(true)}
          onSaveDraft={() => setHasChanges(false)}
          saving={saving}
          hasChanges={hasChanges}
          canPublish={canPublish}
        />

        {/* Health Stats & Conflict Badges */}
        <SchedulerStats
          metrics={metrics}
          conflicts={conflicts}
          onOpenConflictsPanel={() => setShowConflictsPanel(true)}
        />

        {/* Main Planning Area: Sidebar + Grid */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          {/* Backlog Sidebar */}
          <SchedulerSidebar
            sections={sections}
            teachers={teachers}
            availableRooms={availableRooms}
            activeSectionId={activeSchedulingSection?.id || null}
            onSelectSectionForScheduling={setActiveSchedulingSection}
            onUpdateSectionTeacher={handleUpdateSectionTeacher}
            onUpdateSectionRoom={handleUpdateSectionRoom}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onOpenSectionModal={handleOpenSectionModal}
            onTeacherSelect={(name) => {
              setViewMode('docente');
              setSelectedViewTeacher(name);
            }}
          />

          {/* Interactive Timetable Grid */}
          <div ref={gridContainerRef} className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                <span className="material-symbols-outlined animate-spin text-2xl mr-2">progress_activity</span>
                Cargando horario académico...
              </div>
            ) : (
              <SchedulerGrid
                timeslots={timeslots}
                assignments={assignments}
                conflicts={conflicts}
                viewMode={viewMode}
                selectedViewLevel={selectedViewLevel}
                selectedViewRoom={selectedViewRoom}
                selectedViewTeacher={selectedViewTeacher}
                parallelCount={3}
                draggingSection={draggingSection}
                activeSchedulingSection={activeSchedulingSection}
                onSelectActiveSection={setActiveSchedulingSection}
                onUpdateActiveTeacher={handleUpdateSectionTeacher}
                onUpdateActiveRoom={handleUpdateSectionRoom}
                dropTarget={dropTarget}
                availableRooms={availableRooms}
                teacherAvailabilities={teacherAvailabilities}
                teachers={teachers}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onSlotClick={handleSlotClick}
                onEditAssignment={handleEditAssignment}
                onDeleteAssignment={handleDeleteAssignment}
              />
            )}
          </div>
        </div>

        {/* Modals and Drawers */}
        <AssignmentModal
          assignment={editingAssignment}
          isOpen={Boolean(editingAssignment)}
          onClose={() => setEditingAssignment(null)}
          availableRooms={availableRooms}
          availableTeachers={availableTeachersList}
          onSave={handleSaveAssignment}
          onDelete={handleDeleteAssignment}
        />

        <SectionModal
          section={editingSection}
          isOpen={isSectionModalOpen}
          onClose={() => {
            setIsSectionModalOpen(false);
            setEditingSection(null);
          }}
          allSubjects={allSubjects}
          availableTeachers={availableTeachersList}
          existingTheories={sections.filter(s => s.type === 'TEO')}
          onSave={handleSaveSection}
          onDelete={handleDeleteSection}
        />

        <RoomSelectorModal
          selectorData={roomSelectorData}
          compatibleRooms={roomSelectorData ? getCompatibleRoomsForType(roomSelectorData.section.type || 'TEO') : []}
          onClose={() => setRoomSelectorData(null)}
          onSelectRoom={handleConfirmRoomAssignment}
        />

        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          assignments={assignments}
          periodName={periods.find(p => p.id === selectedPeriod)?.name}
          onExportPdf={handleExportPdf}
        />

        <AuditDrawer
          isOpen={showAuditPanel}
          onClose={() => setShowAuditPanel(false)}
          auditLog={auditLog}
        />

        {/* Proposal Result Modal with Academic Disclaimer */}
        {proposalResult && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
            <div className="relative bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Propuesta de Horario Generada
                    </h3>
                    <p className="text-xs text-slate-500">
                      Motor de optimización heurística y restricciones académicas
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProposalResult(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-center">
                <div>
                  <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {proposalResult.completed}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Asignados</div>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-800 dark:text-slate-200">
                    {proposalResult.total}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Requerido</div>
                </div>
                <div>
                  <div className={`text-xl font-extrabold ${proposalResult.failed > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {proposalResult.failed}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pendientes</div>
                </div>
              </div>

              {/* Disclaimer Block */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 text-xs text-amber-950 dark:text-amber-200 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300">
                  <span className="material-symbols-outlined text-base">verified_user</span>
                  <span>Aviso de Responsabilidad y Auditoría (Disclaimer)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                  Esta propuesta es una recomendación matemática y heurística generada por el algoritmo para optimizar la distribución horaria sin choques de docentes ni salas. 
                  <strong> La coordinación académica o dirección de carrera debe auditar y validar los acuerdos docentes, requerimientos de equipamiento y criterios pedagógicos antes de publicar este horario como oficial.</strong>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setProposalResult(null)}
                  className="px-4 py-2 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Revisar en la Matriz
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProposalResult(null);
                    setShowExportModal(true);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white transition-colors"
                >
                  Exportar Borrador
                </button>
                {canPublish && (
                  <button
                    type="button"
                    onClick={() => {
                      setProposalResult(null);
                      handlePublish();
                    }}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
                  >
                    Publicar Horario Oficial
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showConflictsPanel && (
          <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
            <ConflictPanel
              conflicts={conflicts}
              days={DAYS_LIST}
              setShowConflictsPanel={setShowConflictsPanel}
              setSelectedConflict={setSelectedConflict}
              onResolveAll={async () => {
                for (const conflict of conflicts) {
                  await api.resolveConflict(conflict.id, true);
                }
                await loadScheduleData();
              }}
            />
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default SchedulerPage;
