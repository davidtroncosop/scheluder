import { useCallback } from 'react';
import api from '../../../services/api';
import * as dataStore from '../../../lib/dataStore';
import {
  calculateHealth,
  mapBackendAssignments,
  type SchedulerAssignment as Assignment,
  type SchedulerConflict as Conflict,
  type SchedulerSection as Section,
} from '../model';
import { generateSchedulePdf } from '../export';
import type { SchedulerStateReturn } from './useSchedulerState';

interface UseSchedulerOperationsParams {
  state: SchedulerStateReturn;
  selectedPeriod: string;
  periods: Array<{ id: string; name: string }>;
}

export function useSchedulerOperations({
  state,
  selectedPeriod,
  periods,
}: UseSchedulerOperationsParams) {
  const {
    sections,
    setSections,
    assignments,
    setAssignments,
    conflicts,
    setConflicts,
    timeslots,
    setTimeslots,
    setMetrics,
    setLoading,
    setSaving,
    setHasChanges,
    setError,
    setNotice,
    setScheduleStatus,
    scheduleUpdatedAt,
    setScheduleUpdatedAt,
    availableRooms,
    setAvailableRooms,
    teachers,
    selectedViewRoom,
    setSelectedViewRoom,
    viewMode,
    selectedViewLevel,
    selectedViewTeacher,
    setTeacherAvailabilities,
    draggingSection,
    setDraggingSection,
    activeSchedulingSection,
    setActiveSchedulingSection,
    setDropTarget,
    roomSelectorData,
    setRoomSelectorData,
    setEditingAssignment,
    setEditingSection,
    setIsSectionModalOpen,
    setShowClearConfirmModal,
    setModalDefaultLevel,
    setModalInitialValues,
    setProposalResult,
    addAuditEntry,
  } = state;

  // Load schedule data from remote or local storage
  const loadScheduleData = useCallback(async () => {
    if (!selectedPeriod) return;
    setLoading(true);
    setError(null);
    try {
      const [
        remoteSchedule,
        remoteSections,
        remoteTimeslots,
        remoteConflicts,
        remoteStatus,
        remoteRooms,
        remoteTeachers,
        remoteAvails,
      ] = await Promise.all([
        api.getSchedule(selectedPeriod).catch(() => []),
        api.getSectionsForContext(selectedPeriod).catch(() => []),
        api.getTimeslots().catch(() => []),
        api.getConflicts(false).catch(() => []),
        api.getScheduleStatus(selectedPeriod).catch(() => ({ status: 'draft' as const, updated_at: null })),
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
      setScheduleUpdatedAt(remoteStatus.updated_at || null);

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
          expected_students: Number(s.expected_students || s.cupo || 0),
          assigned_slots: Number(s.assigned_slots || 0),
          priority: Number(s.priority || 0),
          teacher_name: s.teacher_name || s.profesor || null,
          career_id: s.career_id,
        }));
        setSections(mappedSecs);
        setMetrics(calculateHealth(mappedSecs, mappedAsgs, loadedConflicts));
      } else {
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
          expected_students: Number(s.cupo || s.expected_students || 0),
          assigned_slots: Number(s.assigned_slots || 0),
          priority: 0,
          teacher_name: s.profesor || s.teacher_name || null,
          career_id: s.career_id || '',
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
  }, [selectedPeriod, selectedViewRoom, setAvailableRooms, setConflicts, setError, setLoading, setMetrics, setScheduleStatus, setSelectedViewRoom, setTeacherAvailabilities, setTimeslots, setAssignments, setSections]);

  // Room helpers
  const getCompatibleRoomsForType = useCallback((sectionType: string, minCapacity = 0) => {
    const type = (sectionType || '').toUpperCase();
    return availableRooms.filter(r => {
      if (minCapacity > 0 && r.capacity < minCapacity) return false;
      if (type === 'SIM') return r.type === 'SIM';
      if (type === 'LAB') return r.type === 'LAB' || r.type === 'SIM';
      if (type === 'TAL') return r.type === 'TAL';
      return r.type === 'TEO' || r.type === 'AUD';
    });
  }, [availableRooms]);

  const findFreeCompatibleRoom = useCallback((sectionType?: string, dayOfWeek?: number, timeslotId?: string, minCapacity = 0) => {
    const compatRooms = getCompatibleRoomsForType(sectionType || 'TEO', minCapacity);
    if (!dayOfWeek || !timeslotId) return compatRooms[0] || null;

    const occupiedRoomIds = assignments
      .filter(a => a.day_of_week === dayOfWeek && a.timeslot_id === timeslotId)
      .map(a => (a.room_id || a.room_name || '').toUpperCase());

    const freeRooms = compatRooms.filter(
      r => !occupiedRoomIds.includes(r.id.toUpperCase()) && !occupiedRoomIds.includes(r.name.toUpperCase())
    );

    return freeRooms[0] || null;
  }, [assignments, getCompatibleRoomsForType]);

  // Unified direct execution
  const executeAssignment = useCallback(async (
    section: Section,
    roomId: string,
    timeslotId: string,
    dayOfWeek: number,
    parallelIndex = 0,
  ) => {
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
          parallel_index: parallelIndex,
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
          parallel_index: parallelIndex,
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
      addAuditEntry('assign', `Asignado NRC ${section.nrc} a día ${dayOfWeek} (Secc. ${parallelIndex + 1})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al asignar la sección';
      setError(msg);
      setNotice({ type: 'error', message: msg });
    } finally {
      setSaving(false);
      setRoomSelectorData(null);
    }
  }, [availableRooms, selectedPeriod, timeslots, addAuditEntry, loadScheduleData, setAssignments, setError, setHasChanges, setNotice, setRoomSelectorData, setSaving]);

  // Drag & Drop
  const handleDragStart = useCallback((e: React.DragEvent, section: Section) => {
    setDraggingSection(section);
    e.dataTransfer.setData('text/plain', JSON.stringify(section));
    e.dataTransfer.effectAllowed = 'copyMove';
  }, [setDraggingSection]);

  const handleDragEnd = useCallback(() => {
    setDraggingSection(null);
    setDropTarget(null);
  }, [setDraggingSection, setDropTarget]);

  const handleDragOver = useCallback((e: React.DragEvent, timeslotId: string, dayOfWeek: number, parallelIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTarget({ timeslotId, dayOfWeek, parallelIndex });
  }, [setDropTarget]);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, [setDropTarget]);

  const handleDrop = useCallback(async (e: React.DragEvent, timeslotId: string, dayOfWeek: number, parallelIndex: number) => {
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
      await executeAssignment(sectionToAssign, chosenRoomId, timeslotId, dayOfWeek, parallelIndex);
    } else {
      const freeRoom = findFreeCompatibleRoom(
        sectionToAssign.type,
        dayOfWeek,
        timeslotId,
        sectionToAssign.expected_students || 0
      );
      if (freeRoom) {
        await executeAssignment(sectionToAssign, freeRoom.id, timeslotId, dayOfWeek, parallelIndex);
      } else {
        setRoomSelectorData({
          section: sectionToAssign,
          timeslotId,
          dayOfWeek,
          parallelIndex,
        });
      }
    }
  }, [activeSchedulingSection, draggingSection, executeAssignment, findFreeCompatibleRoom, setDropTarget, setRoomSelectorData]);

  const handleSlotClick = useCallback(async (timeslotId: string, dayOfWeek: number, parallelIndex: number) => {
    if (!activeSchedulingSection) return;

    const chosenRoomId = activeSchedulingSection.room_id || activeSchedulingSection.preferred_room_id;
    if (chosenRoomId) {
      await executeAssignment(activeSchedulingSection, chosenRoomId, timeslotId, dayOfWeek, parallelIndex);
    } else {
      const freeRoom = findFreeCompatibleRoom(
        activeSchedulingSection.type,
        dayOfWeek,
        timeslotId,
        activeSchedulingSection.expected_students || 0
      );
      if (freeRoom) {
        await executeAssignment(activeSchedulingSection, freeRoom.id, timeslotId, dayOfWeek, parallelIndex);
      } else {
        setRoomSelectorData({
          section: activeSchedulingSection,
          timeslotId,
          dayOfWeek,
          parallelIndex,
        });
      }
    }
  }, [activeSchedulingSection, executeAssignment, findFreeCompatibleRoom, setRoomSelectorData]);

  const handleConfirmRoomAssignment = useCallback(async (roomId: string) => {
    if (!roomSelectorData || !selectedPeriod) return;
    const { section, timeslotId, dayOfWeek, parallelIndex } = roomSelectorData;
    await executeAssignment(section, roomId, timeslotId, dayOfWeek, parallelIndex ?? 0);
  }, [executeAssignment, roomSelectorData, selectedPeriod]);

  // Section inline modifications
  const handleUpdateSectionTeacher = useCallback(async (sectionId: string, teacherName: string, teacherId?: string) => {
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
  }, [activeSchedulingSection?.id, setActiveSchedulingSection, setSections]);

  const handleUpdateSectionRoom = useCallback((sectionId: string, roomId: string, roomName: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, room_id: roomId, preferred_room_id: roomId, room_name: roomName } : s));
    if (activeSchedulingSection?.id === sectionId) {
      setActiveSchedulingSection(prev => prev ? { ...prev, room_id: roomId, preferred_room_id: roomId, room_name: roomName } : null);
    }
  }, [activeSchedulingSection?.id, setActiveSchedulingSection, setSections]);

  // Auto-Assign with Bounded Backtracking
  const handleAutoAssign = useCallback(async () => {
    if (!sections.length || !selectedPeriod) return;
    setSaving(true);
    setNotice(null);

    try {
      const result = await api.autoAssignSchedule({
        periodId: selectedPeriod,
        careerId: (sections[0] as any)?.career_id,
        maxBacktrackDepth: 2,
        mode: 'merge',
      });

      await loadScheduleData();
      const failed = result.unassigned.reduce((sum, u) => sum + u.unassignedHours, 0);
      const deadlockMsg = result.deadlocksResolved > 0
        ? ` (${result.deadlocksResolved} callejones sin salida resueltos con backtracking)`
        : '';

      setProposalResult({
        completed: result.totalSlotsAssigned,
        failed,
        total: result.totalSlotsRequired,
      });

      setNotice({
        type: failed > 0 ? 'info' : 'success',
        message: failed > 0
          ? `Propuesta generada: ${result.totalSlotsAssigned} módulos asignados (${result.coveragePercentage}% cobertura)${deadlockMsg}. ${failed} pendientes de ajuste.`
          : `¡Propuesta automática completada! ${result.totalSlotsAssigned} módulos asignados (${result.coveragePercentage}% cobertura)${deadlockMsg} sin choques en ${result.executionTimeMs}ms.`,
      });
      addAuditEntry('auto-assign', `Propuesta automática generada: ${result.totalSlotsAssigned} bloques (${result.deadlocksResolved} deadlocks resueltos)`);
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error durante la optimización automática del horario',
      });
    } finally {
      setSaving(false);
    }
  }, [addAuditEntry, loadScheduleData, sections, selectedPeriod, setNotice, setProposalResult, setSaving]);

  // Clear All
  const handleClearAllAssignments = useCallback(async () => {
    if (!selectedPeriod) return;
    setSaving(true);
    setNotice(null);
    try {
      if (dataStore.getAuthToken()) {
        await api.clearAllAssignments(selectedPeriod);
        await loadScheduleData();
      } else {
        setAssignments([]);
        setHasChanges(true);
      }
      addAuditEntry('clear-all', `Se desasignaron todos los módulos del periodo ${selectedPeriod}`);
      setNotice({
        type: 'info',
        message: 'Todas las asignaciones han sido desasignadas exitosamente. Las secciones están listas en el backlog.',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al desasignar el horario');
    } finally {
      setSaving(false);
      setShowClearConfirmModal(false);
    }
  }, [addAuditEntry, loadScheduleData, selectedPeriod, setAssignments, setError, setHasChanges, setNotice, setSaving, setShowClearConfirmModal]);

  // Assignment Modal
  const handleEditAssignment = useCallback((assignment: Assignment) => {
    setEditingAssignment(assignment);
  }, [setEditingAssignment]);

  const handleSaveAssignment = useCallback(async (assignmentId: string, data: { room_name: string; teacher_name: string }) => {
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
  }, [availableRooms, teachers, addAuditEntry, loadScheduleData, setAssignments, setError, setHasChanges]);

  const handleDeleteAssignment = useCallback(async (assignmentId: string) => {
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
  }, [addAuditEntry, loadScheduleData, setAssignments, setError, setHasChanges]);

  // Section CRUD
  const handleOpenSectionModal = useCallback((section?: Section | null, preselectedLevel?: number) => {
    setEditingSection(section || null);
    setModalInitialValues(null);
    setModalDefaultLevel(preselectedLevel || (section ? section.level : (selectedViewLevel > 0 ? selectedViewLevel : 1)));
    setIsSectionModalOpen(true);
  }, [selectedViewLevel, setEditingSection, setIsSectionModalOpen, setModalDefaultLevel, setModalInitialValues]);

  const handleDuplicateSection = useCallback((sourceSection: Section) => {
    const sameSubjectSections = sections.filter(s => s.subject_id === sourceSection.subject_id);
    const nextSecNum = sameSubjectSections.length + 1;
    const allNrcs = sections.map(s => parseInt(s.nrc, 10)).filter(n => !isNaN(n));
    const maxNrc = allNrcs.length > 0 ? Math.max(...allNrcs) : 11000;
    const suggestedNrc = String(maxNrc + 1);

    setEditingSection(null);
    setModalDefaultLevel(sourceSection.level);
    setModalInitialValues({
      subject_id: sourceSection.subject_id,
      type: sourceSection.type,
      hours_per_week: sourceSection.hours_per_week,
      level: sourceSection.level,
      expected_students: sourceSection.expected_students,
      section_code: String(nextSecNum),
      nrc: suggestedNrc,
      teacher_name: '',
      parent_section_id: sourceSection.parent_section_id || '',
    });
    setIsSectionModalOpen(true);
  }, [sections, setEditingSection, setIsSectionModalOpen, setModalDefaultLevel, setModalInitialValues]);

  const handleSaveSection = useCallback(async (formData: {
    id?: string;
    nrc: string;
    section_code?: string;
    subject_id: string;
    type: string;
    hours_per_week: number;
    level: number;
    expected_students?: number;
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
            section_code: formData.section_code || '1',
            type: formData.type,
            parent_section_id: formData.parent_section_id || null,
            hours_per_week: formData.hours_per_week,
            expected_students: formData.expected_students || 30,
          });
        }
      } else {
        if (dataStore.getAuthToken() && selectedPeriod) {
          await api.createSection({
            period_id: selectedPeriod,
            subject_id: formData.subject_id,
            teacher_id: teacher?.id || null,
            nrc: formData.nrc,
            section_code: formData.section_code || '1',
            type: formData.type,
            parent_section_id: formData.parent_section_id || null,
            hours_per_week: formData.hours_per_week,
            expected_students: formData.expected_students || 30,
          });
        }
      }
      await loadScheduleData();
      addAuditEntry('save_section', `Guardada sección NRC ${formData.nrc} (${formData.section_code ? `Sec ${formData.section_code}` : 'Sec 1'})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar sección');
    }
  }, [teachers, selectedPeriod, addAuditEntry, loadScheduleData, setError]);

  const handleDeleteSection = useCallback(async (sectionId: string) => {
    try {
      if (dataStore.getAuthToken()) {
        await api.deleteSection(sectionId);
        await loadScheduleData();
      }
      addAuditEntry('delete_section', `Eliminada sección ${sectionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar sección');
    }
  }, [addAuditEntry, loadScheduleData, setError]);

  // Publish with Optimistic Concurrency Control
  const handlePublish = useCallback(async () => {
    const criticalCount = conflicts.filter(c => c.type === 'CRITICAL').length;
    if (criticalCount > 0) {
      alert('No se puede publicar: existen conflictos críticos sin resolver.');
      return;
    }
    try {
      if (dataStore.getAuthToken() && selectedPeriod) {
        await api.publishSchedule(selectedPeriod, undefined, scheduleUpdatedAt || undefined);
      }
      setScheduleStatus('published');
      setNotice({ type: 'success', message: 'Horario publicado exitosamente' });
      addAuditEntry('publish', `Publicado horario del período ${selectedPeriod}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No fue posible publicar';
      if (msg.includes('CONFLICT_CONCURRENT_MODIFICATION') || msg.includes('modificado') || msg.includes('actualizado')) {
        setNotice({
          type: 'error',
          message: 'El horario fue modificado en paralelo por otro usuario. Se han recargado los datos más recientes para evitar sobreescritura.',
        });
        await loadScheduleData();
      } else {
        setError(msg);
      }
    }
  }, [conflicts, selectedPeriod, scheduleUpdatedAt, addAuditEntry, loadScheduleData, setError, setNotice, setScheduleStatus]);

  // PDF Export
  const handleExportPdf = useCallback(async () => {
    try {
      const periodObj = periods.find(p => p.id === selectedPeriod);
      const filtered = assignments.filter(a => {
        if (viewMode === 'nivel' && selectedViewLevel > 0) return a.level === selectedViewLevel;
        if (viewMode === 'sala' && selectedViewRoom && selectedViewRoom !== 'TODAS') return a.room_name === selectedViewRoom;
        if (viewMode === 'docente' && selectedViewTeacher) return a.teacher_name === selectedViewTeacher;
        return true;
      });

      const doc = generateSchedulePdf({
        assignments: filtered,
        timeslots,
        periodName: periodObj?.name || 'Horario Académico',
        careerName: 'Planificación Académica',
        viewMode,
        selectedLevel: selectedViewLevel,
        selectedRoom: selectedViewRoom,
        selectedTeacher: selectedViewTeacher,
        parallelTracks: 2,
      });

      const fileName = `horario_${(periodObj?.name || 'academico').toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      addAuditEntry('export_pdf', `Exportado documento PDF del horario (${fileName})`);
    } catch (err) {
      console.error('Error al generar PDF:', err);
      setError('No fue posible generar el documento PDF');
    }
  }, [assignments, periods, selectedPeriod, selectedViewLevel, selectedViewRoom, selectedViewTeacher, timeslots, viewMode, addAuditEntry, setError]);

  return {
    loadScheduleData,
    executeAssignment,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleSlotClick,
    handleConfirmRoomAssignment,
    handleUpdateSectionTeacher,
    handleUpdateSectionRoom,
    handleAutoAssign,
    handleClearAllAssignments,
    handleEditAssignment,
    handleSaveAssignment,
    handleDeleteAssignment,
    handleOpenSectionModal,
    handleDuplicateSection,
    handleSaveSection,
    handleDeleteSection,
    handlePublish,
    handleExportPdf,
  };
}
