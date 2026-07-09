
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as dataStore from '../lib/dataStore';
import ConflictPanel from '../components/ConflictPanel';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Types for the scheduler data
interface Section {
  id: string;
  nrc: string;
  subject_name: string;
  subject_code: string;
  level: number;
  type: string;
  hours_per_week: number;
  teacher_name: string | null;
  priority: number;
  assigned_slots: number;
}

interface Assignment {
  id: string;
  section_id: string;
  nrc: string;
  subject_name: string;
  subject_code: string;
  level: number;
  teacher_name: string | null;
  room_name: string | null;
  room_type: string | null;
  timeslot_id: string;
  timeslot_label: string;
  day_of_week: number;
  parallel_index: number; // 0, 1, 2, 3 representing the column within the day
}

export interface Conflict {
  id: string;
  type: string;
  rule_code: string;
  description: string;
  subject_name: string;
  nrc: string;
  teacher_name: string | null;
  timeslot_label: string;
  day_of_week: number;
  parallel_index: number;
}

interface Timeslot {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
  order_index: number;
}

interface HealthMetrics {
  total_slots_required: number;
  slots_assigned: number;
  assignment_percentage: number;
  critical_conflicts: number;
  warning_conflicts: number;
  health_score: number;
}

const mapBackendAssignments = (backendAsgs: any[]): Assignment[] => {
  const sorted = [...backendAsgs].sort((a, b) => a.id.localeCompare(b.id));
  const slotCounts: Record<string, number> = {};
  
  return sorted.map(asg => {
    const key = `${asg.day_of_week}-${asg.timeslot_id}`;
    const parallelIndex = slotCounts[key] || 0;
    slotCounts[key] = parallelIndex + 1;
    
    return {
      id: asg.id,
      section_id: asg.section_id,
      nrc: asg.nrc,
      subject_name: asg.subject_name,
      subject_code: asg.subject_code,
      level: asg.level,
      teacher_name: asg.teacher_name,
      room_name: asg.room_name,
      room_type: asg.room_type || 'TEO',
      timeslot_id: asg.timeslot_id,
      timeslot_label: asg.timeslot_label,
      day_of_week: asg.day_of_week,
      parallel_index: parallelIndex
    };
  });
};

const SchedulerPage: React.FC = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('Planificador');

  // Data states
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [timeslots, setTimeslots] = useState<Timeslot[]>([]);
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Assignment Modal state
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editFormData, setEditFormData] = useState({
    room_name: '',
    teacher_name: '',
  });

  // Edit Section Backlog Modal state
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [allSubjects, setAllSubjects] = useState<dataStore.ImportedSubject[]>([]);
  const [sectionFormData, setSectionFormData] = useState({
    nrc: '',
    subject_id: '',
    type: 'TEO',
    hours_per_week: 2,
    level: 1,
    teacher_name: '',
  });
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);

  // Period and workflow states
  const [selectedPeriod, setSelectedPeriod] = useState('2026-1');
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<'draft' | 'review' | 'published'>('draft');
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConflictsPanel, setShowConflictsPanel] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);

  // View mode states
  const [viewMode, setViewMode] = useState<'sala' | 'nivel' | 'docente'>('nivel'); // Default to nivel view
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [selectedViewLevel, setSelectedViewLevel] = useState<number>(1);
  const [selectedViewTeacher, setSelectedViewTeacher] = useState<string | null>(null);
  const [selectedViewRoom, setSelectedViewRoom] = useState<string>('SALA 201'); // Room for "Por Sala" view

  // Export and Audit states
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAuditPanel, setShowAuditPanel] = useState(false);
  const [teacherDropdownOpen, setTeacherDropdownOpen] = useState<string | null>(null); // NRC of open dropdown
  const [auditLog, setAuditLog] = useState<Array<{
    id: string;
    timestamp: Date;
    action: 'assign' | 'unassign' | 'resolve' | 'auto_assign' | 'publish' | 'save';
    description: string;
    user: string;
  }>>([
    { id: '1', timestamp: new Date(Date.now() - 3600000), action: 'save', description: 'Guardado borrador', user: 'Coordinador' },
    { id: '2', timestamp: new Date(Date.now() - 7200000), action: 'assign', description: 'Asignado Anatomía I a Lunes Bloque 1', user: 'Coordinador' },
  ]);

  // Drag and Drop states
  const [draggingSection, setDraggingSection] = useState<Section | null>(null);
  const [dropTarget, setDropTarget] = useState<{ timeslotId: string; dayOfWeek: number; parallelIndex: number } | null>(null);
  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [showRoomSelector, setShowRoomSelector] = useState<{ section: Section; timeslotId: string; dayOfWeek: number; parallelIndex: number } | null>(null);

  // Sidebar and Teacher states
  const [sidebarTab, setSidebarTab] = useState<'secciones' | 'docentes'>('secciones');
  const [parallelCount, setParallelCount] = useState<number>(3); // Number of columns per day - fixed at 3
  const [teachers, setTeachers] = useState<dataStore.ImportedTeacher[]>([]);

  // Consolidate teachers list: registered + those found in assignments
  const allAvailableTeachers = useMemo(() => {
    const list = [...teachers];

    // Add teachers found in assignments that aren't in the registered list
    if (Array.isArray(assignments)) {
      assignments.forEach(a => {
        if (a && a.teacher_name && !list.some(t => t.nombre?.trim() === a.teacher_name?.trim())) {
          list.push({
            id: `temp-${a.teacher_name}`,
            nombre: a.teacher_name.trim(),
            email: '',
            tipo_contrato: 'Desconocido',
            max_horas: 20
          });
        }
      });
    }

    return list;
  }, [teachers, assignments]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Collapsible sidebar state

  // Available rooms from localStorage
  // Load rooms and handle mapping between local/remote field names
  const refreshRooms = useCallback(() => {
    const rooms = dataStore.getRooms();
    const mapped = rooms.length > 0
      ? rooms.map((r: any) => ({
        id: r.id,
        name: r.nombre || r.name || 'Sin Nombre',
        type: (r.tipo || r.type || 'TEO').toUpperCase(),
        capacity: r.capacidad || r.capacity || 30
      }))
      : [
        { id: 'room-1', name: 'SALA 201', type: 'TEO', capacity: 40 },
        { id: 'room-2', name: 'SALA 202', type: 'TEO', capacity: 40 },
        { id: 'room-3', name: 'SALA 204', type: 'TEO', capacity: 35 },
        { id: 'room-4', name: 'LAB 1', type: 'LAB', capacity: 20 },
        { id: 'room-5', name: 'LAB 2', type: 'LAB', capacity: 20 },
        { id: 'room-6', name: 'SIMULADOR 1', type: 'SIM', capacity: 15 },
        { id: 'room-7', name: 'SIMULADOR 2', type: 'SIM', capacity: 15 },
      ];
    setAvailableRooms(mapped);
  }, []);

  // Filter rooms by section type
  const getCompatibleRooms = (sectionType: string) => {
    let compatible = [];
    const type = (sectionType || '').toUpperCase();

    if (type === 'SIM') {
      compatible = availableRooms.filter(r => r.type === 'SIM' || r.type === 'LAB');
    } else if (type === 'LAB') {
      compatible = availableRooms.filter(r => r.type === 'LAB' || r.type === 'SIM');
    } else {
      compatible = availableRooms.filter(r => r.type === 'TEO' || r.type === 'AUD');
    }

    // If no specific match, show all rooms as last resort
    if (compatible.length === 0) {
      return availableRooms;
    }
    return compatible;
  };

  // Available teachers list - combine imported and demo teachers
  const availableTeachers = React.useMemo(() => {
    const importedNames = teachers.map(t => t.nombre).filter(Boolean);
    const demoNames = ['Prof. Reyes', 'Prof. Soto', 'Dra. Rivas', 'Dr. Valenzuela', 'Ayud. Pérez', 'Prof. González', 'Dra. Martínez'];
    // Combine both lists, removing duplicates
    const allNames = [...new Set([...importedNames, ...demoNames])];
    return allNames;
  }, [teachers]);

  // Function to update teacher for a section
  const updateSectionTeacher = (sectionId: string, teacherName: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, teacher_name: teacherName } : s
    ));
    setTeacherDropdownOpen(null);
    setHasChanges(true);
    addAuditEntry('assign', `Asignado ${teacherName} a NRC ${sections.find(s => s.id === sectionId)?.nrc}`);
  };

  // Add to audit log helper
  const addAuditEntry = (action: typeof auditLog[0]['action'], description: string) => {
    setAuditLog(prev => [{
      id: `audit-${Date.now()}`,
      timestamp: new Date(),
      action,
      description,
      user: 'Coordinador'
    }, ...prev]);
  };

  const periods = [
    { id: '2026-1', name: '2026 - Primer Semestre', status: 'active' },
    { id: '2026-2', name: '2026 - Segundo Semestre', status: 'draft' },
    { id: '2025-2', name: '2025 - Segundo Semestre', status: 'published' },
  ];

  const statusLabels = {
    draft: { label: 'Borrador', color: 'bg-slate-500', icon: 'edit_note' },
    review: { label: 'En Revisión', color: 'bg-amber-500', icon: 'rate_review' },
    published: { label: 'Publicado', color: 'bg-emerald-500', icon: 'check_circle' },
  };

  // Navigation items
  const mainNavItems = [
    { name: 'Planificador', icon: 'grid_view', path: '/scheduler', badge: conflicts.filter(c => c.type === 'CRITICAL').length > 0 },
    { name: 'Horarios', icon: 'calendar_month', path: '/horarios' },
  ];

  const masterNavItems = [
    { name: 'Docentes', icon: 'groups', path: '/teachers' },
    { name: 'Asignaturas', icon: 'menu_book', path: '/asignaturas' },
    { name: 'Salas', icon: 'meeting_room', path: '/salas' },
  ];

  // Load data from remote or local storage
  const loadScheduleData = useCallback(async () => {
    setLoading(true);
    try {
      const token = dataStore.getAuthToken();
      if (token) {
        // Online: load from remote API
        const periodRes = await fetch(`/api/schedule?period_id=${selectedPeriod}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const sectionsRes = await fetch(`/api/sections?period_id=${selectedPeriod}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const conflictsRes = await fetch(`/api/conflicts?resolved=false`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (periodRes.ok && sectionsRes.ok) {
          const rawAsgs = await periodRes.json() as any[];
          const rawSecs = await sectionsRes.json() as any[];
          
          // Map assignments
          const mappedAsgs = mapBackendAssignments(rawAsgs);
          setAssignments(mappedAsgs);

          // Map sections and sync assigned_slots count from database
          const mappedSecs = rawSecs.map((s: any) => ({
            id: s.id,
            nrc: s.nrc,
            subject_name: s.subject_name || s.nombre,
            subject_code: s.subject_code || s.codigo,
            level: s.level,
            type: s.type,
            hours_per_week: s.hours_per_week || s.horas,
            teacher_name: s.teacher_name || s.docente_nombre || null,
            priority: s.priority || 0,
            assigned_slots: s.assigned_slots || 0
          }));
          setSections(mappedSecs);

          // Map conflicts
          if (conflictsRes.ok) {
            const rawConflicts = await conflictsRes.json() as any[];
            const mappedConflicts = rawConflicts.map((c: any) => ({
              id: c.id,
              type: c.type,
              rule_code: c.rule_code,
              description: c.description,
              subject_name: c.subject_name || '',
              nrc: c.nrc || '',
              teacher_name: c.teacher_name || '',
              timeslot_label: c.timeslot_label || '',
              day_of_week: c.day_of_week,
              parallel_index: 0 // Default
            }));
            setConflicts(mappedConflicts);
          }
          return;
        }
      }
      
      // Offline fallback: load from local storage
      loadLocalOrMockData();
    } catch (err) {
      console.error('Error loading schedule:', err);
      loadLocalOrMockData();
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  const loadLocalOrMockData = () => {
    // Fixed timeslots
    const customTimeslots = dataStore.getCustomTimeslots();
    setTimeslots(customTimeslots);

    // Load from local storage
    const localSections = dataStore.getSections(selectedPeriod);
    const localTeachers = dataStore.getTeachers();

    if (localTeachers.length > 0) {
      setTeachers(localTeachers);
    } else {
      setTeachers([
        { id: 't1', nombre: 'Prof. Reyes', email: 'reyes@u.cl', max_horas: 18, tipo_contrato: 'Planta', availability: { 'ts-m3-1': 'blocked', 'ts-m4-1': 'blocked', 'ts-t1-3': 'blocked', 'ts-t2-3': 'blocked' } },
        { id: 't2', nombre: 'Prof. Soto', email: 'soto@u.cl', max_horas: 20 },
        { id: 't3', nombre: 'Dra. Rivas', email: 'rivas@u.cl', max_horas: 12, availability: { 'ts-m1-5': 'blocked', 'ts-m2-5': 'blocked' } }
      ]);
    }

    // Try local assignments
    const localAsgsStr = localStorage.getItem(`scheduler_assignments_${selectedPeriod}`);
    let loadedAsgs: Assignment[] = [];
    if (localAsgsStr) {
      try {
        loadedAsgs = JSON.parse(localAsgsStr);
        setAssignments(loadedAsgs);
      } catch (e) {
        console.error('Error parsing local assignments:', e);
      }
    }

    if (loadedAsgs.length === 0 && (!localAsgsStr)) {
      // Use default demo assignments
      loadedAsgs = [
        { id: 'a1', section_id: '4', nrc: '23492', subject_name: 'Salud Pública', subject_code: 'DSAL0034', level: 3, teacher_name: 'Dr. Valenzuela', room_name: 'SALA 204', room_type: 'TEO', timeslot_id: 'ts-m1', timeslot_label: 'M1', day_of_week: 1, parallel_index: 0 },
        { id: 'a2', section_id: '5', nrc: '23490', subject_name: 'Fisiología I', subject_code: 'DFIS0032', level: 2, teacher_name: 'P. Soto', room_name: 'SALA 204', room_type: 'TEO', timeslot_id: 'ts-m2', timeslot_label: 'M2', day_of_week: 1, parallel_index: 0 },
        { id: 'a3', section_id: '6', nrc: '23491', subject_name: 'Bioética', subject_code: 'DBIE0033', level: 3, teacher_name: 'Prof. Reyes', room_name: 'SALA 204', room_type: 'TEO', timeslot_id: 'ts-m2', timeslot_label: 'M2', day_of_week: 2, parallel_index: 1 },
      ];
      setAssignments(loadedAsgs);
    }

    // Load sections
    if (localSections.length > 0) {
      const schedulerSections: Section[] = localSections.map(s => {
        const assignedCount = loadedAsgs.filter(a => a.section_id === s.id).length;
        return {
          id: s.id,
          nrc: s.nrc,
          subject_name: s.nombre,
          subject_code: s.codigo,
          level: s.nivel,
          type: s.tipo,
          hours_per_week: s.horas,
          teacher_name: s.docente_nombre || null,
          priority: s.nivel >= 3 ? 1 : 0,
          assigned_slots: assignedCount,
        };
      });
      setSections(schedulerSections);
    } else {
      setSections([
        { id: '1', nrc: '23456', subject_name: 'Morfología – LAB', subject_code: 'DMOR0030', level: 3, type: 'LAB', hours_per_week: 4, teacher_name: 'Prof. Reyes', priority: 2, assigned_slots: 0 },
        { id: '2', nrc: '23489', subject_name: 'Biomecánica I', subject_code: 'DBIO0031', level: 3, type: 'TEO', hours_per_week: 2, teacher_name: 'Prof. Soto', priority: 1, assigned_slots: 0 },
        { id: '3', nrc: '11202', subject_name: 'Anatomía II', subject_code: 'DANA0020', level: 2, type: 'TEO', hours_per_week: 4, teacher_name: 'Dra. Rivas', priority: 0, assigned_slots: 4 },
      ]);
    }

    // Try local conflicts
    const localConflictsStr = localStorage.getItem(`scheduler_conflicts_${selectedPeriod}`);
    if (localConflictsStr) {
      try {
        setConflicts(JSON.parse(localConflictsStr));
      } catch (e) {}
    } else {
      setConflicts([
        { id: 'c1', type: 'CRITICAL', rule_code: 'TEACHER_DUPLICATE', description: 'El Docente Reyes está asignado simultáneamente en Morfología (M2) y Bioética (M2)', subject_name: 'Bioética', nrc: '23491', teacher_name: 'Prof. Reyes', timeslot_label: 'M2', day_of_week: 2, parallel_index: 0 },
      ]);
    }
  };

  // Initialize data on mount / period change
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (dataStore.isAuthenticated()) {
          console.log('[SchedulerPage] Syncing with remote database...');
          await dataStore.syncWithRemote(selectedPeriod);
        }
        await loadScheduleData();
      } catch (err) {
        console.error('Error initializing data:', err);
        setError('Error al cargar datos. Usando modo local.');
        loadLocalOrMockData();
      } finally {
        refreshRooms();
        setLoading(false);
      }
    };
    initializeData();
  }, [selectedPeriod, loadScheduleData]);

  // Recalculate metrics dynamically based on actual state
  useEffect(() => {
    const totalRequired = sections.reduce((acc, s) => acc + (s.hours_per_week || 0), 0) || 1;
    const assignedCount = assignments.length;
    const criticalCount = conflicts.filter(c => c.type === 'CRITICAL').length;
    const warningCount = conflicts.filter(c => c.type === 'WARNING').length;

    const assignmentRatio = assignedCount / totalRequired;
    const penalty = (criticalCount * 15) + (warningCount * 5);
    const healthScore = Math.max(0, Math.min(100, Math.round((assignmentRatio * 100) - penalty)));

    setMetrics({
      total_slots_required: totalRequired,
      slots_assigned: assignedCount,
      assignment_percentage: Math.round((assignedCount / totalRequired) * 100),
      critical_conflicts: criticalCount,
      warning_conflicts: warningCount,
      health_score: healthScore,
    });
  }, [assignments, sections, conflicts]);

  // Get unassigned sections
  const unassignedSections = sections.filter(s => s.assigned_slots < s.hours_per_week);

  // Get filtered assignments based on view mode
  const getFilteredAssignments = () => {
    if (viewMode === 'sala') {
      return assignments.filter(a => a.room_name === selectedViewRoom);
    }
    if (viewMode === 'nivel') {
      return assignments.filter(a => String(a.level) === String(selectedViewLevel));
    }
    if (viewMode === 'docente' && selectedViewTeacher) {
      return assignments.filter(a => a.teacher_name === selectedViewTeacher);
    }
    return assignments;
  };

  // Check if ANY assignment exists in a slot (for conflict detection)
  const getAnyAssignmentForSlot = (timeslotId: string, dayOfWeek: number) => {
    return assignments.find(a => a.timeslot_id === timeslotId && a.day_of_week === dayOfWeek);
  };

  // Get assignments for a specific slot and parallel index
  const getAssignmentForSlot = (timeslotId: string, dayOfWeek: number, parallelIndex: number = 0) => {
    const filtered = getFilteredAssignments();
    return filtered.find(a =>
      a.timeslot_id === timeslotId &&
      a.day_of_week === dayOfWeek &&
      a.parallel_index === parallelIndex
    );
  };

  // Check if slot has conflict
  const hasConflict = (timeslotId: string, dayOfWeek: number) => {
    const ts = timeslots.find(t => t.id === timeslotId);
    if (!ts) return null;
    return conflicts.find(c => c.timeslot_label === ts.label && c.day_of_week === dayOfWeek);
  };

  // Calculate total students for a timeslot-day combination
  const getStudentCountForSlot = (timeslotId: string, dayOfWeek: number): number => {
    const slotAssignments = assignments.filter(a =>
      a.timeslot_id === timeslotId && a.day_of_week === dayOfWeek
    );
    // Get the sections for these assignments and sum their expected students
    return slotAssignments.reduce((total, a) => {
      const section = sections.find(s => s.id === a.section_id);
      // If section has expected students, use that; otherwise estimate 30
      return total + (section ? 30 : 30);
    }, 0);
  };

  // Check if a slot is available for the selected section
  const isSlotAvailable = (timeslotId: string, dayOfWeek: number, parallelIndex: number = 0): { available: boolean; reason?: string; score: number } => {
    if (!selectedSection) return { available: false, score: 0 };

    // Check if slot already has assignment in THIS parallel
    const existingInParallel = assignments.find(a =>
      a.timeslot_id === timeslotId &&
      a.day_of_week === dayOfWeek &&
      a.parallel_index === parallelIndex
    );
    if (existingInParallel) {
      return { available: false, reason: 'Paralelo ocupado', score: 0 };
    }

    // Check for level conflicts (same level, same slot, any parallel) - Optional: allow different parallels for same level?
    // Usually, same level sections should ideally not overlap, but it depends on the institution.
    // For now, let's keep it as a conflict if it's the SAME LEVEL in the SAME SLOT (independent of parallel?)
    // Actually, if we have parallels, we WANT same level sections to be able to run in parallel.
    // So level conflict only applies WITHIN the same parallel, or if it's the SAME SECTION.
    // Let's say level conflict is when same level exists in the same slot.
    const sameLevel = assignments.filter(a =>
      a.level === selectedSection.level &&
      a.timeslot_id === timeslotId &&
      a.day_of_week === dayOfWeek
    );
    // But wait, if they are different parallels, they SHOULD be allowed.
    // A conflict only exists if the teacher is the same or the room is the same.
    // So 'sameLevel' is not necessarily a hard block anymore if we have column support.

    // Check teacher availability and duplicate assignments
    if (selectedSection.teacher_name) {
      // 1. Check if teacher is already assigned to this exact slot anywhere
      const teacherConflict = assignments.find(a =>
        a.teacher_name === selectedSection.teacher_name &&
        a.timeslot_id === timeslotId &&
        a.day_of_week === dayOfWeek
      );
      if (teacherConflict) {
        return { available: false, reason: 'Docente ya ocupado', score: 0 };
      }

      // 2. Check for personal unavailability (blocked periods)
      const teacherObj = teachers.find(t => t.nombre === selectedSection.teacher_name);
      if (teacherObj?.availability && teacherObj.availability[`${timeslotId}-${dayOfWeek}`] === 'blocked') {
        return { available: false, reason: 'Fuera de disponibilidad', score: 0 };
      }
    }

    // Basic scoring
    let score = 100;

    // Teacher load penalty
    if (selectedSection.teacher_name) {
      const hours = getTeacherHours(selectedSection.teacher_name);
      const teacherObj = teachers.find(t => t.nombre === selectedSection.teacher_name);
      const max = teacherObj?.max_horas || 20;
      if (hours >= max) score -= 40;
    }

    const slot = timeslots.find(t => t.id === timeslotId);
    if (slot && slot.order_index <= 2) score += 10;
    if (dayOfWeek <= 3) score += 5;

    return { available: true, score };
  };

  // Get slot availability color class
  const getSlotColorClass = (timeslotId: string, dayOfWeek: number, parallelIndex: number = 0): string => {
    if (!selectedSection) return '';
    const { available, score } = isSlotAvailable(timeslotId, dayOfWeek, parallelIndex);

    if (!available) return 'bg-red-50/50 dark:bg-red-900/10 cursor-not-allowed opacity-60';
    if (score >= 100) return 'bg-emerald-100/80 dark:bg-emerald-500/20 border-2 border-emerald-400/60 dark:border-emerald-500/40 cursor-pointer hover:bg-emerald-200 dark:hover:bg-emerald-500/30 animate-pulse';
    return 'bg-emerald-50/50 dark:bg-emerald-900/20 border-2 border-dashed border-emerald-300 dark:border-emerald-700 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/30';
  };

  // Assign section to slot
  const handleAssignToSlot = async (timeslotId: string, dayOfWeek: number, parallelIndex: number = 0) => {
    const sectionToAssign = draggingSection || selectedSection;
    if (!sectionToAssign) return;

    const { available } = isSlotAvailable(timeslotId, dayOfWeek, parallelIndex);
    if (!available) return;

    setShowRoomSelector({ section: sectionToAssign, timeslotId, dayOfWeek, parallelIndex });
    setDraggingSection(null);
  };

  // Confirm assignment with selected room
  const confirmAssignment = async (roomName: string) => {
    if (!showRoomSelector) return;

    const { section, timeslotId, dayOfWeek, parallelIndex } = showRoomSelector;
    const timeslot = timeslots.find(t => t.id === timeslotId);
    if (!timeslot) return;

    // Find the room id
    const roomsList = dataStore.getRooms();
    const targetRoom = roomsList.find(r => r.nombre === roomName);
    const roomId = targetRoom?.id || roomName;

    setSaving(true);
    try {
      const token = dataStore.getAuthToken();
      if (token) {
        // Online: save to remote API
        const assignResponse = await fetch('/api/schedule/assign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            section_id: section.id,
            room_id: roomId,
            timeslot_id: timeslotId,
            day_of_week: dayOfWeek,
            period_id: selectedPeriod
          })
        });

        if (!assignResponse.ok) {
          const errData = await assignResponse.json() as any;
          throw new Error(errData.error || 'Error al asignar');
        }

        // Success: reload schedule data to stay perfectly in sync with D1 (including conflicts)
        await loadScheduleData();
        addAuditEntry('assign', `Asignado ${section.subject_name} a ${days[dayOfWeek - 1]} ${timeslot.label} (Sec ${parallelIndex}) en ${roomName}`);
      } else {
        // Offline: save to local state and localStorage
        const newAssignment: Assignment = {
          id: `asg-${Date.now()}`,
          section_id: section.id,
          nrc: section.nrc,
          subject_name: section.subject_name,
          subject_code: section.subject_code,
          level: section.level,
          teacher_name: section.teacher_name,
          room_name: roomName,
          room_type: section.type,
          timeslot_id: timeslotId,
          timeslot_label: timeslot.label,
          day_of_week: dayOfWeek,
          parallel_index: parallelIndex
        };

        const updatedAsgs = [...assignments, newAssignment];
        setAssignments(updatedAsgs);
        localStorage.setItem(`scheduler_assignments_${selectedPeriod}`, JSON.stringify(updatedAsgs));

        setSections(prev => prev.map(s => s.id === section.id ? { ...s, assigned_slots: s.assigned_slots + 1 } : s));
        setHasChanges(true);
        addAuditEntry('assign', `Asignado ${section.subject_name} a ${days[dayOfWeek - 1]} ${timeslot.label} (Sec ${parallelIndex}) en ${roomName}`);
      }
      
      if (section.assigned_slots + 1 >= section.hours_per_week) setSelectedSection(null);
      setShowRoomSelector(null);
    } catch (err: any) {
      console.error('Assignment failed:', err);
      alert(`⚠️ Error al asignar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Unassign
  const unassignFromSlot = async (assignmentId: string) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    setSaving(true);
    try {
      const token = dataStore.getAuthToken();
      if (token) {
        // Online: delete from remote API
        const deleteResponse = await fetch(`/api/schedule/${assignmentId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!deleteResponse.ok) {
          const errData = await deleteResponse.json() as any;
          throw new Error(errData.error || 'Error al eliminar');
        }

        // Success: reload schedule data
        await loadScheduleData();
        addAuditEntry('unassign', `Devuelto ${assignment.subject_name} al backlog`);
      } else {
        // Offline: remove from local state and update localStorage
        const updatedAsgs = assignments.filter(a => a.id !== assignmentId);
        setAssignments(updatedAsgs);
        localStorage.setItem(`scheduler_assignments_${selectedPeriod}`, JSON.stringify(updatedAsgs));

        setSections(prev => prev.map(s => s.id === assignment.section_id ? { ...s, assigned_slots: Math.max(0, s.assigned_slots - 1) } : s));
        setHasChanges(true);
        addAuditEntry('unassign', `Devuelto ${assignment.subject_name} al backlog`);
      }
    } catch (err: any) {
      console.error('Unassign failed:', err);
      alert(`⚠️ Error al eliminar asignación: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const openEditAssignmentModal = (asg: Assignment) => {
    setEditingAssignment(asg);
    setEditFormData({
      room_name: asg.room_name || '',
      teacher_name: asg.teacher_name || '',
    });
  };

  const saveEditedAssignment = () => {
    if (!editingAssignment) return;

    const roomsList = dataStore.getRooms();
    const targetRoom = roomsList.find(r => r.nombre === editFormData.room_name);
    const targetTeacher = teachers.find(t => t.nombre === editFormData.teacher_name);

    const updatedAsgs = assignments.map(a => {
      if (a.id === editingAssignment.id) {
        return {
          ...a,
          room_id: targetRoom?.id || null,
          room_name: editFormData.room_name || null,
          teacher_id: targetTeacher?.id || null,
          teacher_name: editFormData.teacher_name || null,
        };
      }
      return a;
    });

    setAssignments(updatedAsgs);
    localStorage.setItem(`scheduler_assignments_${selectedPeriod}`, JSON.stringify(updatedAsgs));
    setHasChanges(true);
    addAuditEntry('save', `Negociación en ${editingAssignment.subject_name}: Cambiado a sala ${editFormData.room_name || 'Sin sala'} y docente ${editFormData.teacher_name || 'Sin docente'}`);
    setEditingAssignment(null);
  };

  const openEditSectionModal = (sec?: Section) => {
    const subjectsList = dataStore.getSubjects();
    setAllSubjects(subjectsList);
    
    if (sec) {
      const matchedSub = subjectsList.find(s => s.codigo === sec.subject_code);
      setEditingSection(sec);
      setSectionFormData({
        nrc: sec.nrc,
        subject_id: matchedSub?.id || '',
        type: sec.type,
        hours_per_week: sec.hours_per_week,
        level: sec.level,
        teacher_name: sec.teacher_name || '',
      });
    } else {
      setEditingSection(null);
      setSectionFormData({
        nrc: '',
        subject_id: subjectsList.length > 0 ? subjectsList[0].id : '',
        type: 'TEO',
        hours_per_week: 2,
        level: 1,
        teacher_name: '',
      });
    }
    setIsSectionModalOpen(true);
  };

  const saveEditedSection = () => {
    const targetSub = allSubjects.find(s => s.id === sectionFormData.subject_id);
    if (!targetSub || !sectionFormData.nrc.trim()) {
      alert('Por favor seleccione una asignatura e ingrese el NRC.');
      return;
    }

    const id = editingSection ? editingSection.id : `section-${Date.now()}`;
    const newSectionData: dataStore.ImportedSection = {
      id,
      nrc: sectionFormData.nrc,
      codigo: targetSub.codigo,
      nombre: targetSub.nombre,
      nivel: Number(sectionFormData.level),
      horas: Number(sectionFormData.hours_per_week),
      tipo: sectionFormData.type as any,
      docente_nombre: sectionFormData.teacher_name || undefined,
      periodo: selectedPeriod,
    };

    dataStore.addOrUpdateSection(newSectionData);
    
    // Refresh sections state
    refreshBacklog();
    setIsSectionModalOpen(false);
  };

  const handleDeleteSection = (id: string, name: string) => {
    if (window.confirm(`¿Está seguro de que desea eliminar la sección "${name}"? Esto también removerá cualquier horario programado para ella.`)) {
      dataStore.deleteSection(id);
      
      const localAsgsStr = localStorage.getItem(`scheduler_assignments_${selectedPeriod}`);
      if (localAsgsStr) {
        try {
          const loadedAsgs: Assignment[] = JSON.parse(localAsgsStr);
          const filteredAsgs = loadedAsgs.filter(a => a.section_id !== id);
          setAssignments(filteredAsgs);
          localStorage.setItem(`scheduler_assignments_${selectedPeriod}`, JSON.stringify(filteredAsgs));
        } catch (e) {
          console.error(e);
        }
      }

      refreshBacklog();
    }
  };

  const refreshBacklog = () => {
    const localSections = dataStore.getSections(selectedPeriod);
    const loadedAsgsStr = localStorage.getItem(`scheduler_assignments_${selectedPeriod}`);
    let loadedAsgs: Assignment[] = [];
    if (loadedAsgsStr) {
      try { loadedAsgs = JSON.parse(loadedAsgsStr); } catch (e) {}
    }
    
    const schedulerSections: Section[] = localSections.map(s => {
      const assignedCount = loadedAsgs.filter(a => a.section_id === s.id).length;
      return {
        id: s.id,
        nrc: s.nrc,
        subject_name: s.nombre,
        subject_code: s.codigo,
        level: s.nivel,
        type: s.tipo,
        hours_per_week: s.horas,
        teacher_name: s.docente_nombre || null,
        priority: s.nivel >= 3 ? 1 : 0,
        assigned_slots: assignedCount,
      };
    });
    setSections(schedulerSections);
  };

  // Drag and Drop
  const handleDragStart = (e: React.DragEvent, section: Section) => {
    setDraggingSection(section);
    setSelectedSection(section);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', section.id);
  };

  const handleDragOver = (e: React.DragEvent, timeslotId: string, dayOfWeek: number, parallelIndex: number = 0) => {
    e.preventDefault();
    if (!draggingSection) return;
    const { available } = isSlotAvailable(timeslotId, dayOfWeek, parallelIndex);
    e.dataTransfer.dropEffect = available ? 'move' : 'none';
    setDropTarget({ timeslotId, dayOfWeek, parallelIndex });
  };

  const handleDrop = (e: React.DragEvent, timeslotId: string, dayOfWeek: number, parallelIndex: number = 0) => {
    e.preventDefault();
    if (!draggingSection) return;
    handleAssignToSlot(timeslotId, dayOfWeek, parallelIndex);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDraggingSection(null);
    setDropTarget(null);
  };

  // Difficulty Score
  const calculateDifficultyScore = (section: Section): number => {
    let difficulty = section.hours_per_week * 10;
    if (section.type === 'LAB') difficulty += 30;
    if (section.type === 'SIM') difficulty += 40;
    if (section.level >= 4) difficulty += 15;
    return difficulty + (section.priority * 15);
  };

  const sortedUnassignedSections = [...unassignedSections].sort((a, b) => calculateDifficultyScore(b) - calculateDifficultyScore(a));

  const sectionsByLevel = sortedUnassignedSections
    .filter(section => viewMode !== 'nivel' || String(section.level) === String(selectedViewLevel))
    .reduce((acc, section) => {
      if (!acc[section.level]) acc[section.level] = [];
      acc[section.level].push(section);
      return acc;
    }, {} as Record<number, Section[]>);

  // Suggestions
  const getBestSlotsForSection = (section: Section): Array<{ slotId: string; dayOfWeek: number; parallelIndex: number; score: number }> => {
    const options: Array<{ slotId: string; dayOfWeek: number; parallelIndex: number; score: number }> = [];
    timeslots.forEach(slot => {
      [1, 2, 3, 4, 5].forEach(day => {
        for (let p = 0; p < parallelCount; p++) {
          const { available, score } = isSlotAvailable(slot.id, day, p);
          if (available) options.push({ slotId: slot.id, dayOfWeek: day, parallelIndex: p, score });
        }
      });
    });
    return options.sort((a, b) => b.score - a.score).slice(0, 3);
  };

  const suggestSlotForSection = (section: Section) => {
    const best = getBestSlotsForSection(section);
    if (best.length === 0) { alert('No hay slots disponibles'); return; }
    setSelectedSection(section);
    const top = best[0];
    const ts = timeslots.find(t => t.id === top.slotId);
    alert(`Opción recomendada: ${days[top.dayOfWeek - 1]} ${ts?.label} (Sec ${top.parallelIndex})`);
  };

  const getTeacherHours = (teacherName: string | null): number => {
    if (!teacherName || !Array.isArray(assignments)) return 0;
    // Count assignments and multiply by 1.5 (average hours per slot)
    const slotCount = assignments.filter(a => a && a.teacher_name?.trim() === teacherName.trim()).length;
    return Math.round(slotCount * 1.5);
  };

  // Get teacher object by name (from imported or create temporary)
  const getTeacherByName = (name: string) => {
    const found = teachers.find(t => t.nombre === name);
    if (found) return found;
    // Return a default object if not found in imported teachers
    return { id: `temp-${name}`, nombre: name, email: '', max_horas: 20 };
  };

  // Check if a teacher has blocked availability for a specific slot
  const isTeacherBlockedForSlot = (teacherName: string, slotId: string, dayOfWeek: number): boolean => {
    const teacher = teachers.find(t => t.nombre === teacherName);
    if (!teacher?.availability) return false;
    return teacher.availability[`${slotId}-${dayOfWeek}`] === 'blocked';
  };

  // Count how many blocked slots a teacher has for currently assigned section slots
  const getTeacherBlockedSlots = (teacherName: string, sectionId: string): { blocked: number; conflicts: Array<{ day: string; slot: string }> } => {
    const sectionAssignments = assignments.filter(a => a.section_id === sectionId);
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const conflicts: Array<{ day: string; slot: string }> = [];

    sectionAssignments.forEach(a => {
      if (isTeacherBlockedForSlot(teacherName, a.timeslot_id, a.day_of_week)) {
        conflicts.push({ day: days[a.day_of_week - 1], slot: a.timeslot_label });
      }
    });

    return { blocked: conflicts.length, conflicts };
  };

  const autoAssignSection = (section: Section) => {
    const best = getBestSlotsForSection(section);
    if (best.length === 0) return false;
    const top = best[0];
    const ts = timeslots.find(t => t.id === top.slotId);
    if (!ts) return false;

    const newAssignment: Assignment = {
      id: `asg-${Date.now()}-${Math.random()}`,
      section_id: section.id,
      nrc: section.nrc,
      subject_name: section.subject_name,
      subject_code: section.subject_code,
      level: section.level,
      teacher_name: section.teacher_name,
      room_name: section.type === 'LAB' ? 'LAB 1' : 'SALA 204',
      room_type: section.type,
      timeslot_id: top.slotId,
      timeslot_label: ts.label,
      day_of_week: top.dayOfWeek,
      parallel_index: top.parallelIndex
    };

    setAssignments(prev => [...prev, newAssignment]);
    setSections(prev => prev.map(s => s.id === section.id ? { ...s, assigned_slots: s.assigned_slots + 1 } : s));
    setHasChanges(true);
    return true;
  };

  const autoAssignAll = () => {
    let count = 0;
    unassignedSections.filter(s => {
      const best = getBestSlotsForSection(s);
      return best.length > 0 && best[0].score >= 100;
    }).forEach(section => {
      const remaining = section.hours_per_week - section.assigned_slots;
      for (let i = 0; i < remaining; i++) {
        if (autoAssignSection(section)) count++;
      }
    });
    alert(`✅ Auto-asignados: ${count} slots`);
  };

  const resolveConflict = (conflict: Conflict) => {
    const section = sections.find(s => s.nrc === conflict.nrc);
    if (!section) return;
    const alternatives = getBestSlotsForSection(section);
    if (alternatives.length === 0) return;
    const top = alternatives[0];
    const ts = timeslots.find(t => t.id === top.slotId);
    if (!ts) return;

    setAssignments(prev => {
      const filtered = prev.filter(a =>
        a.nrc !== conflict.nrc ||
        a.timeslot_label !== conflict.timeslot_label ||
        a.day_of_week !== conflict.day_of_week ||
        a.parallel_index !== conflict.parallel_index
      );
      return [...filtered, {
        id: `asg-${Date.now()}`,
        section_id: section.id,
        nrc: section.nrc,
        subject_name: section.subject_name,
        subject_code: section.subject_code,
        level: section.level,
        teacher_name: section.teacher_name,
        room_name: 'SALA 204',
        room_type: section.type,
        timeslot_id: top.slotId,
        timeslot_label: ts.label,
        day_of_week: top.dayOfWeek,
        parallel_index: top.parallelIndex
      } as Assignment];
    });
    setConflicts(prev => prev.filter(c => c.id !== conflict.id));
    setHasChanges(true);
    setSelectedConflict(null);
  };

  const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const criticalCount = conflicts.filter(c => c.type === 'CRITICAL').length;
  const warningCount = conflicts.filter(c => c.type === 'WARNING').length;
  const healthPercent = metrics?.health_score || 78;

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    try {
      const token = dataStore.getAuthToken();
      if (token) {
        // Online: Already saved immediately! Just reload to confirm sync.
        await loadScheduleData();
        setHasChanges(false);
        alert('✅ Todos los cambios están sincronizados con la nube (Cloudflare D1).');
      } else {
        // Offline: Explicitly confirm local storage
        localStorage.setItem(`scheduler_assignments_${selectedPeriod}`, JSON.stringify(assignments));
        localStorage.setItem(`scheduler_conflicts_${selectedPeriod}`, JSON.stringify(conflicts));
        setHasChanges(false);
        alert('💾 Horario guardado localmente en el navegador.');
      }
    } catch (err) {
      console.error('Error saving:', err);
      alert('⚠️ Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['NRC', 'Asignatura', 'Código', 'Nivel', 'Docente', 'Sala', 'Día', 'Bloque', 'Paralelo'];
    const rows = assignments.map(a => [
      a.nrc, a.subject_name, a.subject_code, a.level.toString(), a.teacher_name || '', a.room_name || '', days[a.day_of_week - 1], a.timeslot_label, String.fromCharCode(65 + a.parallel_index)
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `horario_${selectedPeriod}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    addAuditEntry('save', `Exportado horario a CSV (${assignments.length} asignaciones)`);
    setShowExportModal(false);
  };

  // Export to PDF
  const exportToPDF = async () => {
    const element = document.getElementById('scheduler-calendar-view');
    if (!element) return;

    setSaving(true);
    try {
      // Create canvas from DOM element
      const canvas = await html2canvas(element, {
        scale: 2, // higher quality
        useCORS: true,
        backgroundColor: document.documentElement.classList.contains('dark') ? '#0b0e14' : '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('landscape', 'mm', 'a3');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.text(`Horario Planificador - Período ${selectedPeriod}`, 15, 15);
      pdf.addImage(imgData, 'PNG', 10, 25, pdfWidth - 20, pdfHeight - 20);
      pdf.save(`horario_${selectedPeriod}_${new Date().toISOString().split('T')[0]}.pdf`);

      addAuditEntry('save', `Exportado horario a PDF (${assignments.length} asignaciones)`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error al generar el PDF. Por favor, intente de nuevo.');
    } finally {
      setSaving(false);
      setShowExportModal(false);
    }
  };

  // Export handler
  const handleExport = () => {
    setShowExportModal(true);
  };

  // Publish handler
  const handlePublish = () => {
    if (criticalCount > 0) {
      alert('No se puede publicar: hay conflictos críticos pendientes');
      return;
    }
    setScheduleStatus('published');
    addAuditEntry('publish', `Horario ${selectedPeriod} publicado oficialmente`);
    alert('✅ Horario publicado exitosamente');
  };

  return (
    <div className="bg-[#f8fafc] dark:bg-[#0b0e11] text-slate-800 dark:text-slate-200 font-display h-screen flex flex-col overflow-hidden selection:bg-primary/20">
      {/* Top Main Header */}
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111418] flex items-center justify-between px-4 shrink-0 z-50 relative">
        <div className="flex items-center gap-4">
          <Link to="/scheduler" className="flex items-center gap-2 text-[#0f172a] dark:text-white">
            <div className="bg-primary p-1 rounded">
              <span className="material-symbols-outlined text-white text-xl">calendar_today</span>
            </div>
            <h1 className="text-base font-bold tracking-tight">Scheduler Pro</h1>
          </Link>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700"></div>

          {/* Period Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">calendar_month</span>
              <span>{selectedPeriod}</span>
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>

            {showPeriodDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-400 uppercase px-2">Períodos Académicos</p>
                </div>
                {periods.map(period => (
                  <button
                    key={period.id}
                    onClick={() => { setSelectedPeriod(period.id); setShowPeriodDropdown(false); }}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all ${selectedPeriod === period.id ? 'bg-primary/5 text-primary' : 'text-slate-700 dark:text-slate-300'}`}
                  >
                    <span className="font-medium">{period.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${period.status === 'published' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      period.status === 'active' ? 'bg-primary/10 text-primary' :
                        'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                      {period.status === 'published' ? 'Publicado' : period.status === 'active' ? 'Activo' : 'Borrador'}
                    </span>
                  </button>
                ))}
                <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/5 rounded-lg transition-all">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Crear Nuevo Período
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Status Badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] font-bold ${statusLabels[scheduleStatus].color}`}>
            <span className="material-symbols-outlined text-[14px]">{statusLabels[scheduleStatus].icon}</span>
            {statusLabels[scheduleStatus].label}
          </div>
        </div>


        <div className="flex items-center gap-2">
          {/* Conflict counters - clickable to open panel */}
          <button
            onClick={() => setShowConflictsPanel(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">error</span>
            {criticalCount}
          </button>
          <button
            onClick={() => setShowConflictsPanel(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">warning</span>
            {warningCount}
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

          {/* Action Buttons */}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${hasChanges
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              : 'bg-slate-50 dark:bg-slate-900 text-slate-400 cursor-not-allowed'
              }`}
          >
            {saving ? (
              <div className="animate-spin size-3 border border-slate-400 border-t-transparent rounded-full"></div>
            ) : (
              <span className="material-symbols-outlined text-[16px]">save</span>
            )}
            Guardar
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Exportar
          </button>

          <button
            onClick={handlePublish}
            disabled={scheduleStatus === 'published'}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${scheduleStatus === 'published'
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 cursor-default'
              : 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20'
              }`}
          >
            <span className="material-symbols-outlined text-[16px]">{scheduleStatus === 'published' ? 'check_circle' : 'publish'}</span>
            {scheduleStatus === 'published' ? 'Publicado' : 'Publicar'}
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

          <button
            onClick={() => setShowAuditPanel(true)}
            className="flex items-center gap-1.5 p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            title="Historial de cambios"
          >
            <span className="material-symbols-outlined text-[20px]">history</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Left Sidebar - with navigation links */}
        <nav className={`${sidebarCollapsed ? 'w-16' : 'w-56'} bg-white dark:bg-[#111418] border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 py-6 z-40 overflow-y-auto transition-all duration-300`}>
          {/* Collapse toggle button */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="absolute top-20 -right-3 z-50 size-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            style={{ left: sidebarCollapsed ? '52px' : '212px' }}
          >
            <span className="material-symbols-outlined text-[14px] text-slate-500">
              {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
          <div className={`${sidebarCollapsed ? 'px-2' : 'px-6'} mb-4`}>
            {!sidebarCollapsed && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Principal</p>}
          </div>
          <ul className={`space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            {mainNavItems.map(item => (
              <li key={item.name}>
                <Link
                  to={item.path}
                  className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} gap-3 ${sidebarCollapsed ? 'px-2 py-2.5' : 'px-4 py-2.5'} text-sm font-semibold rounded-xl transition-all group ${location.pathname === item.path
                    ? 'bg-white dark:bg-slate-800 text-primary border border-slate-100 dark:border-slate-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <div className={`flex items-center ${sidebarCollapsed ? '' : 'gap-3'}`}>
                    <span className={`material-symbols-outlined text-[20px] ${location.pathname === item.path ? 'fill-1' : ''}`}>{item.icon}</span>
                    {!sidebarCollapsed && item.name}
                  </div>
                  {item.badge && !sidebarCollapsed && <div className="size-2 rounded-full bg-red-500 ring-2 ring-red-500/20"></div>}
                  {item.badge && sidebarCollapsed && <div className="absolute top-0 right-0 size-2 rounded-full bg-red-500"></div>}
                </Link>
              </li>
            ))}
          </ul>

          <div className={`${sidebarCollapsed ? 'px-2' : 'px-6'} mt-8 mb-4`}>
            {!sidebarCollapsed && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Maestros</p>}
          </div>
          <ul className={`space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            {masterNavItems.map(item => (
              <li key={item.name}>
                <Link
                  to={item.path}
                  className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'px-2 py-2.5' : 'px-4 py-2.5'} text-sm font-semibold rounded-xl transition-all group ${location.pathname === item.path
                    ? 'bg-white dark:bg-slate-800 text-primary border border-slate-100 dark:border-slate-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  title={sidebarCollapsed ? item.name : undefined}
                >
                  <span className={`material-symbols-outlined text-[20px] ${location.pathname === item.path ? 'fill-1' : ''}`}>{item.icon}</span>
                  {!sidebarCollapsed && item.name}
                </Link>
              </li>
            ))}
          </ul>

          <div className={`${sidebarCollapsed ? 'px-2' : 'px-6'} mt-8 mb-4`}>
            {!sidebarCollapsed && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sistema</p>}
          </div>
          <ul className={`space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            <li>
              <Link
                to="/upload"
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'px-2 py-2.5' : 'px-4 py-2.5'} text-sm font-semibold rounded-xl transition-all ${location.pathname === '/upload'
                  ? 'bg-white dark:bg-slate-800 text-primary border border-slate-100 dark:border-slate-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                title={sidebarCollapsed ? 'Importar Datos' : undefined}
              >
                <span className={`material-symbols-outlined text-[20px] ${location.pathname === '/upload' ? 'fill-1' : ''}`}>upload_file</span>
                {!sidebarCollapsed && 'Importar Datos'}
              </Link>
            </li>
          </ul>

          <div className={`mt-auto ${sidebarCollapsed ? 'px-2' : 'px-4'}`}>
            <Link
              to="/configuracion"
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'px-2 py-2.5' : 'px-4 py-2.5'} text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all`}
              title={sidebarCollapsed ? 'Configuración' : undefined}
            >
              <span className="material-symbols-outlined text-[20px]">settings</span>
              {!sidebarCollapsed && 'Configuración'}
            </Link>
            <Link
              to="/"
              className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'px-2 py-2.5' : 'px-4 py-2.5'} text-sm font-semibold text-slate-500 hover:text-red-500 transition-all`}
              title={sidebarCollapsed ? 'Cerrar Sesión' : undefined}
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              {!sidebarCollapsed && 'Cerrar Sesión'}
            </Link>
          </div>
        </nav>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Por Asignar Panel */}
          <aside className="w-72 bg-[#fcfdfe] dark:bg-[#0f141a] border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
              <button
                onClick={() => setSidebarTab('secciones')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${sidebarTab === 'secciones'
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
              >
                Secciones ({unassignedSections.length})
              </button>
              <button
                onClick={() => setSidebarTab('docentes')}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${sidebarTab === 'docentes'
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
              >
                Carga Docente
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6 custom-scrollbar">
              {sidebarTab === 'secciones' ? (
                <>
                  <div className="py-4 flex items-center justify-between">
                    <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Pendientes de asignar
                    </h2>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditSectionModal()}
                        className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title="Nueva Sección / NRC"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                      </button>
                      <button
                        onClick={autoAssignAll}
                        className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                        title="Auto-asignar todos"
                      >
                        <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
                      </button>
                    </div>
                  </div>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    Object.entries(sectionsByLevel).sort(([a], [b]) => Number(b) - Number(a)).map(([level, levelSections]) => (
                      <div key={level} className="mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`size-2 rounded-full ${Number(level) >= 3 ? 'bg-emerald-500' : 'bg-primary'}`}></div>
                          <p className={`text-[10px] font-black uppercase tracking-widest ${Number(level) >= 3 ? 'text-emerald-600' : 'text-primary'}`}>
                            Nivel {level} {Number(level) >= 3 ? '- Prioridad Alta' : ''}
                          </p>
                        </div>

                        {levelSections.map((section, idx) => (
                          <div
                            key={section.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, section)}
                            onDragEnd={handleDragEnd}
                            onClick={() => setSelectedSection(selectedSection?.id === section.id ? null : section)}
                            className={`bg-white dark:bg-slate-800 rounded-xl border p-4 shadow-sm mb-4 relative cursor-grab active:cursor-grabbing transition-all ${selectedSection?.id === section.id
                              ? 'border-2 border-primary shadow-lg shadow-primary/5'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                              } ${draggingSection?.id === section.id ? 'opacity-50 scale-95' : ''}`}
                          >
                            {section.priority === 2 && (
                              <span className="material-symbols-outlined absolute top-2 right-2 text-amber-500 text-sm animate-pulse">local_fire_department</span>
                            )}
                            {section.priority === 1 && (
                              <span className="material-symbols-outlined absolute top-2 right-2 text-amber-500 text-sm">warning</span>
                            )}
                            <h3 className="text-xs font-black text-slate-900 dark:text-white mb-1">{section.subject_name}</h3>
                            <p className="text-[10px] text-slate-500 font-medium mb-2">NRC {section.nrc} • {section.hours_per_week} HRS</p>

                            {/* Difficulty indicator */}
                            {(() => {
                              const difficulty = calculateDifficultyScore(section);
                              const difficultyLevel = difficulty >= 80 ? 'hard' : difficulty >= 50 ? 'medium' : 'easy';
                              const colors = {
                                hard: { bg: 'bg-red-500', text: 'text-red-600', label: 'Difícil' },
                                medium: { bg: 'bg-amber-500', text: 'text-amber-600', label: 'Medio' },
                                easy: { bg: 'bg-emerald-500', text: 'text-emerald-600', label: 'Fácil' }
                              };
                              return (
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${colors[difficultyLevel].bg} rounded-full transition-all`}
                                      style={{ width: `${Math.min(100, difficulty)}%` }}
                                    />
                                  </div>
                                  <span className={`text-[9px] font-bold ${colors[difficultyLevel].text}`}>
                                    {colors[difficultyLevel].label}
                                  </span>
                                </div>
                              );
                            })()}

                            <div className="flex flex-wrap gap-1.5 mb-3">
                              <span className="px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 text-[9px] font-bold text-slate-500 uppercase">
                                {section.type}
                              </span>
                              {section.type === 'LAB' && (
                                <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 text-[9px] font-bold text-amber-600 uppercase">Sala Especial</span>
                              )}
                              {section.type === 'SIM' && (
                                <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/40 text-[9px] font-bold text-purple-600 uppercase">Simulador</span>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-1.5 mb-3 flex-wrap">
                              <button
                                onClick={(e) => { e.stopPropagation(); suggestSlotForSection(section); }}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-[9px] font-bold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[12px]">lightbulb</span>
                                Sugerir
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); autoAssignSection(section); }}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-[9px] font-bold rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[12px]">bolt</span>
                                Auto
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditSectionModal(section); }}
                                className="flex items-center justify-center gap-1 p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[9px] font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                title="Editar Sección"
                              >
                                <span className="material-symbols-outlined text-[12px]">edit</span>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteSection(section.id, section.subject_name); }}
                                className="flex items-center justify-center p-1.5 bg-red-50 dark:bg-red-950/20 text-red-500 rounded-lg hover:bg-red-100 transition-colors shrink-0"
                                title="Eliminar Sección"
                              >
                                <span className="material-symbols-outlined text-[12px]">delete</span>
                              </button>
                            </div>

                            {/* Association Info */}
                            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                              {/* Teacher - Dropdown Selector */}
                              <div className="relative">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setTeacherDropdownOpen(teacherDropdownOpen === section.id ? null : section.id); }}
                                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all text-left ${section.teacher_name
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 hover:border-emerald-400'
                                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:border-amber-400'
                                    }`}
                                >
                                  {section.teacher_name ? (
                                    <>
                                      <span className="material-symbols-outlined text-[14px] text-emerald-500">check_circle</span>
                                      <div className="size-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-[12px] text-emerald-600">person</span>
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 flex-1">{section.teacher_name}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="material-symbols-outlined text-[14px] text-amber-500">warning</span>
                                      <span className="text-[10px] font-medium text-amber-600 flex-1">Seleccionar docente...</span>
                                    </>
                                  )}
                                  <span className="material-symbols-outlined text-[14px] text-slate-400">expand_more</span>
                                </button>

                                {/* Dropdown Menu */}
                                {teacherDropdownOpen === section.id && (
                                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 max-h-56 overflow-y-auto p-1.5 space-y-1">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase px-2 py-1">Seleccionar Docente</p>
                                    {availableTeachers.map(teacherName => {
                                      const teacher = getTeacherByName(teacherName);
                                      const assigned = getTeacherHours(teacherName);
                                      const max = teacher.max_horas || 20;
                                      const isOver = assigned >= max;
                                      const blockedInfo = getTeacherBlockedSlots(teacherName, section.id);
                                      const hasConflicts = blockedInfo.blocked > 0;

                                      return (
                                        <button
                                          key={teacherName}
                                          onClick={(e) => { e.stopPropagation(); updateSectionTeacher(section.id, teacherName); }}
                                          className={`w-full flex flex-col gap-1 px-3 py-2 rounded-lg text-left transition-all ${hasConflicts ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : section.teacher_name === teacherName ? 'bg-primary/10 text-primary' : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                                            }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className={`material-symbols-outlined text-[16px] ${hasConflicts ? 'text-red-500' : ''}`}>person</span>
                                            <span className="text-[11px] font-bold">{teacherName}</span>
                                            {hasConflicts && (
                                              <span className="ml-auto px-1.5 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-[8px] font-black rounded-full flex items-center gap-0.5">
                                                <span className="material-symbols-outlined text-[10px]">warning</span>
                                                {blockedInfo.blocked} conflicto{blockedInfo.blocked > 1 ? 's' : ''}
                                              </span>
                                            )}
                                            {section.teacher_name === teacherName && !hasConflicts && (
                                              <span className="material-symbols-outlined text-[14px] ml-auto">check</span>
                                            )}
                                          </div>
                                          {hasConflicts && (
                                            <div className="flex flex-wrap gap-1 pl-6 mt-1">
                                              {blockedInfo.conflicts.map((c, i) => (
                                                <span key={i} className="text-[8px] px-1 py-0.5 bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 rounded">
                                                  {c.day} {c.slot}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          <div className="flex items-center gap-2 pl-6">
                                            <div className="h-1 flex-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                              <div
                                                className={`h-full ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`}
                                                style={{ width: `${Math.min(100, (assigned / max) * 100)}%` }}
                                              />
                                            </div>
                                            <span className={`text-[8px] font-black ${isOver ? 'text-red-500' : 'text-slate-400'}`}>
                                              {assigned}/{max}h
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Type & Level indicators */}
                              <div className="flex items-center gap-2 text-[9px]">
                                <span className="flex items-center gap-1 text-slate-500">
                                  <span className="material-symbols-outlined text-[12px]">school</span>
                                  Nivel {section.level}
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className={`flex items-center gap-1 ${section.type === 'LAB' ? 'text-amber-600' : section.type === 'SIM' ? 'text-purple-600' : 'text-blue-600'}`}>
                                  <span className="material-symbols-outlined text-[12px]">{section.type === 'LAB' ? 'science' : section.type === 'SIM' ? 'sports_esports' : 'menu_book'}</span>
                                  {section.type}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  )}

                  {/* Assigned sections */}
                  {sections.filter(s => s.assigned_slots >= s.hours_per_week).length > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="size-2 rounded-full bg-slate-300"></div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asignados</p>
                      </div>
                      {sections.filter(s => s.assigned_slots >= s.hours_per_week).map(section => (
                        <div key={section.id} className="bg-slate-50/50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-slate-800 p-4 opacity-50 mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-xs font-bold text-slate-400 line-through">{section.subject_name}</h3>
                            <span className="material-symbols-outlined text-emerald-500 text-[16px] fill-1">check_circle</span>
                          </div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">NRC {section.nrc} • ASIGNADO</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-4 space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Control de Carga Docente
                    </h2>
                    <span className="text-[9px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                      {allAvailableTeachers.length} docentes
                    </span>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-2 px-1">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2 text-center">
                      <p className="text-lg font-black text-emerald-600">{allAvailableTeachers.filter(t => getTeacherHours(t.nombre) < (t.max_horas || 20) * 0.8).length}</p>
                      <p className="text-[8px] font-bold text-emerald-600/70 uppercase">Óptimo</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-center">
                      <p className="text-lg font-black text-amber-600">{allAvailableTeachers.filter(t => {
                        const h = getTeacherHours(t.nombre);
                        const m = t.max_horas || 20;
                        return h >= m * 0.8 && h <= m;
                      }).length}</p>
                      <p className="text-[8px] font-bold text-amber-600/70 uppercase">Cerca</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 text-center">
                      <p className="text-lg font-black text-red-600">{allAvailableTeachers.filter(t => getTeacherHours(t.nombre) > (t.max_horas || 20)).length}</p>
                      <p className="text-[8px] font-bold text-red-600/70 uppercase">Sobrecarga</p>
                    </div>
                  </div>

                  {allAvailableTeachers.length === 0 ? (
                    <div className="text-center py-8">
                      <span className="material-symbols-outlined text-slate-300 text-3xl mb-2">person_off</span>
                      <p className="text-xs text-slate-500">No hay docentes cargados</p>
                      <p className="text-[10px] text-slate-400 mt-1">Importa docentes desde la sección de datos</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {allAvailableTeachers.filter(t => t && t.nombre).map(teacher => {
                        const assigned = getTeacherHours(teacher.nombre);
                        const max = teacher.max_horas || 20;
                        const percentage = Math.min(100, (assigned / Math.max(1, max)) * 100);
                        const isOverloaded = assigned > max;
                        const isNearLimit = assigned >= max * 0.8 && !isOverloaded;

                        // Get teacher's assignments
                        const teacherAssignments = Array.isArray(assignments) ? assignments.filter(a => a && a.teacher_name?.trim() === teacher.nombre?.trim()) : [];
                        const cardDays = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi'];

                        return (
                          <div
                            key={teacher.id}
                            className={`rounded-xl border transition-all overflow-hidden ${selectedViewTeacher === teacher.nombre && viewMode === 'docente'
                              ? 'bg-primary/5 border-primary shadow-md ring-1 ring-primary/20'
                              : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 hover:shadow-sm'
                              }`}
                            onClick={() => {
                              setViewMode('docente');
                              setSelectedViewTeacher(teacher.nombre);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            {/* Header */}
                            <div className="p-3 border-b border-slate-100/50 dark:border-slate-700/50">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className={`size-9 rounded-full flex items-center justify-center font-bold text-xs shadow-sm ${isOverloaded ? 'bg-gradient-to-br from-red-400 to-red-600 text-white' : isNearLimit ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' : 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white'
                                    }`}>
                                    {(teacher.nombre || '??').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight">{teacher.nombre}</p>
                                    <p className="text-[9px] text-slate-500 font-medium">{teacher.tipo_contrato || 'Honorarios'}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`text-sm font-black ${isOverloaded ? 'text-red-500' : isNearLimit ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                    {assigned}<span className="text-[10px] font-bold text-slate-400">/{max}h</span>
                                  </p>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="space-y-1">
                                <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ease-out ${isOverloaded ? 'bg-gradient-to-r from-red-500 to-rose-600' : isNearLimit ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500'
                                      }`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className={`text-[8px] font-black uppercase ${isOverloaded ? 'text-red-500' : isNearLimit ? 'text-amber-500' : 'text-emerald-600'
                                    }`}>
                                    {isOverloaded ? '⚠ SOBRECARGA' : isNearLimit ? '⚡ Cerca del límite' : '✓ Carga Óptima'}
                                  </span>
                                  <span className="text-[8px] font-bold text-slate-400">{Math.round(percentage)}%</span>
                                </div>
                              </div>
                            </div>

                            {/* Assignments list */}
                            {teacherAssignments.length > 0 && (
                              <div className="px-3 py-2 bg-slate-50/50 dark:bg-black/20">
                                <p className="text-[8px] font-bold text-slate-400 uppercase mb-1.5">Asignaturas asignadas</p>
                                <div className="flex flex-wrap gap-1">
                                  {teacherAssignments.slice(0, 4).map((a, i) => (
                                    <span
                                      key={i}
                                      className="text-[8px] px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-slate-600 dark:text-slate-300 font-medium"
                                    >
                                      {(a.subject_name || 'S/N').split(' ')[0]} • {(a.day_of_week && a.day_of_week <= cardDays.length) ? cardDays[a.day_of_week - 1] : '??'} {a.timeslot_label || ''}
                                    </span>
                                  ))}
                                  {teacherAssignments.length > 4 && (
                                    <span className="text-[8px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 rounded text-slate-500 dark:text-slate-400 font-bold">
                                      +{teacherAssignments.length - 4} más
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* No assignments */}
                            {teacherAssignments.length === 0 && (
                              <div className="px-3 py-2 bg-slate-50/50 dark:bg-black/20">
                                <p className="text-[9px] text-slate-400 italic">Sin asignaciones aún</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* Scheduler View */}
          <main className="flex-1 flex flex-col min-w-0 bg-[#eef2f6] dark:bg-black relative overflow-hidden">
            <div className="h-11 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#111418]/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10">
              <div className="flex items-center gap-4">
                {/* View Mode Selector */}
                <div className="relative">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <span>Vista:</span>
                    <button
                      onClick={() => setShowViewDropdown(!showViewDropdown)}
                      className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-800 dark:text-white font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      {viewMode === 'sala' && selectedViewRoom}
                      {viewMode === 'nivel' && `Nivel ${selectedViewLevel}`}
                      {viewMode === 'docente' && (selectedViewTeacher || 'Por Docente')}
                      <span className="material-symbols-outlined text-sm">expand_more</span>
                    </button>
                  </div>

                  {showViewDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
                      <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] font-bold text-slate-400 uppercase px-2">Tipo de Vista</p>
                      </div>

                      {/* Por Sala */}
                      <div className="border-b border-slate-100 dark:border-slate-800">
                        <button
                          onClick={() => { setViewMode('sala'); }}
                          className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all ${viewMode === 'sala' ? 'bg-primary/5 text-primary' : 'text-slate-700 dark:text-slate-300'}`}
                        >
                          <span className="material-symbols-outlined text-[18px]">meeting_room</span>
                          <span className="font-medium">Por Sala</span>
                        </button>
                        {viewMode === 'sala' && (
                          <div className="px-4 pb-3 flex flex-wrap gap-1">
                            {availableRooms.map(room => (
                              <button
                                key={room.id}
                                onClick={() => { setSelectedViewRoom(room.name); setShowViewDropdown(false); }}
                                className={`px-2 py-1 text-xs font-bold rounded ${selectedViewRoom === room.name ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
                              >
                                {room.name.replace('SALA ', '').replace('LAB ', '').replace('SIMULADOR ', 'SIM ')}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Por Nivel */}
                      <div className="border-t border-slate-100 dark:border-slate-800">
                        <button
                          onClick={() => { setViewMode('nivel'); }}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${viewMode === 'nivel' ? 'bg-primary/5 text-primary' : 'text-slate-700 dark:text-slate-300'}`}
                        >
                          <span className="material-symbols-outlined text-[18px]">school</span>
                          <span className="font-medium">Por Nivel</span>
                        </button>
                        {viewMode === 'nivel' && (
                          <div className="px-4 pb-3 flex flex-wrap gap-1">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(level => (
                              <button
                                key={level}
                                onClick={() => { setSelectedViewLevel(level); setShowViewDropdown(false); }}
                                className={`px-2 py-1 text-xs font-bold rounded ${selectedViewLevel === level ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Por Docente */}
                      <div className="border-t border-slate-100 dark:border-slate-800">
                        <button
                          onClick={() => { setViewMode('docente'); }}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${viewMode === 'docente' ? 'bg-primary/5 text-primary' : 'text-slate-700 dark:text-slate-300'}`}
                        >
                          <span className="material-symbols-outlined text-[18px]">person</span>
                          <span className="font-medium">Por Docente</span>
                        </button>
                        {viewMode === 'docente' && (
                          <div className="px-4 pb-3">
                            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                              {Array.from(new Set(sections.map(s => s.teacher_name).filter(Boolean))).map(teacher => (
                                <button
                                  key={teacher}
                                  onClick={() => { setSelectedViewTeacher(teacher); setShowViewDropdown(false); }}
                                  className={`px-2 py-1.5 text-xs font-bold rounded text-left ${selectedViewTeacher === teacher ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
                                >
                                  {teacher}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>

                {/* Current view indicator */}
                {viewMode === 'nivel' && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                    <span className="material-symbols-outlined text-blue-500 text-[14px]">school</span>
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">Mostrando Nivel {selectedViewLevel}</span>
                  </div>
                )}
                {viewMode === 'docente' && selectedViewTeacher && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 dark:bg-purple-900/20 rounded-full">
                    <span className="material-symbols-outlined text-purple-500 text-[14px]">person</span>
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">{selectedViewTeacher}</span>
                  </div>
                )}

                {selectedSection && (
                  <div className="flex items-center px-3 py-1 bg-primary/10 rounded-full text-[10px] font-bold text-primary ring-1 ring-primary/20">
                    Asignando: {selectedSection.subject_name} [NRC {selectedSection.nrc}]
                  </div>
                )}
              </div>
              <div className="flex gap-4">
                <span className="material-symbols-outlined text-slate-400 text-lg cursor-pointer hover:text-slate-600">zoom_in</span>
                <span className="material-symbols-outlined text-slate-400 text-lg cursor-pointer hover:text-slate-600">zoom_out</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 custom-scrollbar relative">
              <div id="scheduler-calendar-view" className="w-full min-w-[1000px] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-surface-dark">
                {/* Days Header */}
                <div className={`grid grid-cols-[80px_repeat(5,minmax(0,1fr))] divide-x divide-slate-200 dark:divide-slate-800 bg-slate-50 dark:bg-[#111418] border-b border-slate-200 dark:border-slate-800`}>
                  <div className="p-3 flex flex-col items-center justify-center gap-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase">Secciones</span>
                    <div className="flex bg-slate-200 dark:bg-slate-700 p-0.5 rounded-md">
                      {[1, 2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => setParallelCount(n)}
                          className={`size-5 rounded flex items-center justify-center text-[9px] font-black transition-all ${parallelCount === n ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  {days.map(day => (
                    <div key={day} className="">
                      <div className="p-2 text-center text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase border-b border-slate-200/50 dark:border-slate-800/50 min-w-0">
                        {day}
                      </div>
                      <div className="grid divide-x divide-slate-200/50 dark:divide-slate-800/50" style={{ gridTemplateColumns: `repeat(${parallelCount}, minmax(0, 1fr))` }}>
                        {Array.from({ length: parallelCount }).map((_, i) => (
                          <div key={i} className="py-1 text-center text-[8px] font-bold text-slate-400 uppercase bg-slate-100/30 dark:bg-white/5 truncate px-1 min-w-0">
                            Sec {String.fromCharCode(65 + i)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Time Slots Grid */}
                <div className="grid grid-cols-[80px_repeat(5,minmax(0,1fr))] divide-x divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#0b0e14]">
                  {timeslots.map(slot => (
                    <React.Fragment key={slot.id}>
                      {/* Time Label */}
                      <div className="flex flex-col items-center justify-center py-8 border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-transparent">
                        <span className="text-xs font-black text-slate-800 dark:text-white">{slot.label}</span>
                        <span className="text-[9px] text-slate-400 font-bold">{slot.start_time}</span>
                      </div>

                      {/* Day Columns */}
                      {[1, 2, 3, 4, 5].map(dayOfWeek => {
                        const studentCount = getStudentCountForSlot(slot.id, dayOfWeek);
                        return (
                          <div key={dayOfWeek} className="border-b border-slate-200 dark:border-slate-800 relative">
                            {/* Student count badge */}
                            {studentCount > 0 && (
                              <div className="absolute top-0 right-0 z-10 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded-bl-lg">
                                <span className="text-[8px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                                  <span className="material-symbols-outlined text-[10px]">group</span>
                                  {studentCount}
                                </span>
                              </div>
                            )}
                            <div className="grid h-full divide-x divide-slate-200/50 dark:divide-slate-800/50 min-w-0" style={{ gridTemplateColumns: `repeat(${parallelCount}, minmax(0, 1fr))` }}>
                              {Array.from({ length: parallelCount }).map((_, parallelIdx) => {
                                const assignment = getAssignmentForSlot(slot.id, dayOfWeek, parallelIdx);
                                const conflict = hasConflict(slot.id, dayOfWeek);
                                const sectionToCheck = draggingSection || selectedSection;
                                const slotInfo = sectionToCheck ? isSlotAvailable(slot.id, dayOfWeek, parallelIdx) : null;
                                const colorClass = sectionToCheck && !assignment ? getSlotColorClass(slot.id, dayOfWeek, parallelIdx) : '';
                                const isDropTarget = dropTarget?.timeslotId === slot.id && dropTarget?.dayOfWeek === dayOfWeek && dropTarget?.parallelIndex === parallelIdx;

                                // Teacher availability check
                                const currentContextTeacher = sectionToCheck?.teacher_name || (viewMode === 'docente' ? selectedViewTeacher : null);
                                const teacherObj = teachers.find(t => t && t.nombre?.trim() === currentContextTeacher?.trim());
                                const isTeacherBlocked = teacherObj?.availability?.[`${slot.id}-${dayOfWeek}`] === 'blocked';

                                return (
                                  <div
                                    key={`${slot.id}-${dayOfWeek}-${parallelIdx}`}
                                    onClick={() => sectionToCheck && !assignment && !isTeacherBlocked && handleAssignToSlot(slot.id, dayOfWeek, parallelIdx)}
                                    onDragOver={(e) => handleDragOver(e, slot.id, dayOfWeek, parallelIdx)}
                                    onDragLeave={() => setDropTarget(null)}
                                    onDrop={(e) => !isTeacherBlocked && handleDrop(e, slot.id, dayOfWeek, parallelIdx)}
                                    className={`p-1 min-h-[120px] transition-all relative group/cell ${conflict ? 'bg-red-50/10' : ''} ${colorClass} ${isDropTarget && slotInfo?.available ? 'bg-primary/20 ring-1 ring-primary ring-inset' : ''} ${isTeacherBlocked ? 'bg-red-500/[0.02]' : ''}`}
                                  >
                                    {isTeacherBlocked && !assignment && (
                                      <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none opacity-20">
                                        <div className="absolute inset-0 bg-red-500/5" style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(239, 68, 68, 0.05) 5px, rgba(239, 68, 68, 0.05) 10px)' }}></div>
                                      </div>
                                    )}
                                    {assignment ? (
                                      <div className={`h-full rounded-lg p-2 flex flex-col relative group ${conflict
                                        ? 'bg-white dark:bg-slate-800 border-2 border-red-500/50 shadow-xl shadow-red-500/5 ring-1 ring-red-500/20'
                                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm'
                                        }`}>
                                        {conflict && (
                                          <span className="material-symbols-outlined absolute top-2 right-2 text-red-500 text-[14px] fill-1 pr-[22px]">error</span>
                                        )}
                                        <div className={`absolute top-1 right-1 flex items-center gap-1 transition-all ${conflict ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); openEditAssignmentModal(assignment); }}
                                            className="p-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-500 hover:bg-blue-200 dark:hover:bg-blue-800/60"
                                            title="Editar asignación / Negociar"
                                          >
                                            <span className="material-symbols-outlined text-[12px]">edit</span>
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); unassignFromSlot(assignment.id); }}
                                            className="p-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-500 hover:bg-red-200 dark:hover:bg-red-800/60"
                                            title="Devolver al backlog"
                                          >
                                            <span className="material-symbols-outlined text-[12px]">undo</span>
                                          </button>
                                        </div>
                                        <div className="flex items-center justify-between mb-1 min-w-0">
                                          <h4 className="text-[10px] font-black text-slate-900 dark:text-white truncate">{assignment.subject_name}</h4>
                                        </div>
                                        <p className="text-[8px] text-slate-400 font-bold mb-3 uppercase tracking-tighter truncate">
                                          {assignment.room_name} • Nivel {assignment.level}
                                        </p>
                                        {conflict && (
                                          <div className="mt-auto px-2 py-1 bg-red-50 dark:bg-red-900/30 rounded text-[8px] font-black text-red-600 text-center uppercase tracking-widest border border-red-100 dark:border-red-900/40">
                                            Choque Docente
                                          </div>
                                        )}
                                        {!conflict && assignment.teacher_name && (
                                          <div className="flex flex-col gap-1 mt-auto overflow-hidden">
                                            <div className="flex items-center gap-1.5 ">
                                              <div className="size-3.5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-[10px] text-slate-500">person</span>
                                              </div>
                                              <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 truncate">{assignment.teacher_name}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                              {(() => {
                                                const teacherObj = teachers.find(t => t.nombre === assignment.teacher_name);
                                                const assigned = getTeacherHours(assignment.teacher_name);
                                                const max = teacherObj?.max_horas || 20;
                                                const percentage = Math.min(100, (assigned / max) * 100);
                                                const isOver = assigned > max;
                                                return (
                                                  <>
                                                    <div className="h-1 flex-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                      <div
                                                        className={`h-full transition-all ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`}
                                                        style={{ width: `${percentage}%` }}
                                                      />
                                                    </div>
                                                    <span className={`text-[7px] font-black shrink-0 ${isOver ? 'text-red-500' : 'text-slate-400'}`}>
                                                      {assigned}/{max}
                                                    </span>
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : sectionToCheck && slotInfo ? (
                                      <div className={`h-full rounded-lg flex flex-col items-center justify-center ${slotInfo.available
                                        ? 'border-2 border-dashed border-emerald-400 dark:border-emerald-600'
                                        : ''
                                        }`}>
                                        {slotInfo.available ? (
                                          <>
                                            <span className="material-symbols-outlined text-emerald-500 text-xl mb-1">add_circle</span>
                                            <p className="text-emerald-600 text-[10px] font-black uppercase tracking-tight">Asignar aquí</p>
                                            {slotInfo.score >= 100 && (
                                              <p className="text-[8px] text-emerald-500 font-bold flex items-center gap-1 mt-1">
                                                <span className="material-symbols-outlined text-[12px]">star</span>
                                                Recomendado
                                              </p>
                                            )}
                                          </>
                                        ) : (
                                          <p className="text-slate-400 text-[9px] font-bold">{slotInfo.reason}</p>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>{/* Conflict Alert Bottom Bar */}
              {conflicts.length > 0 && !showConflictsPanel && (
                <div
                  onClick={() => setShowConflictsPanel(true)}
                  className="absolute bottom-4 left-4 bg-white dark:bg-[#1a2430] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3 cursor-pointer hover:shadow-xl transition-all z-30"
                >
                  <div className="size-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-red-500 text-lg">error</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-white">{conflicts.length} conflicto{conflicts.length > 1 ? 's' : ''} detectado{conflicts.length > 1 ? 's' : ''}</p>
                    <p className="text-[10px] text-slate-500">Click para ver detalles</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 text-lg">chevron_right</span>
                </div>
              )}
            </div>

            {/* Conflicts Side Panel */}
            {showConflictsPanel && (
              <ConflictPanel
                conflicts={conflicts}
                days={days}
                setShowConflictsPanel={setShowConflictsPanel}
                setSelectedConflict={setSelectedConflict}
              />
            )}
          </main>
        </div>
      </div>

      {/* Conflict Detail Modal */}
      {selectedConflict && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a2430] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className={`p-5 ${selectedConflict.type === 'CRITICAL' ? 'bg-red-500' : 'bg-amber-500'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-white text-2xl">
                    {selectedConflict.type === 'CRITICAL' ? 'error' : 'warning'}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-white">Detalle del Conflicto</h3>
                    <p className="text-white/80 text-sm">{selectedConflict.rule_code}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedConflict(null)}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                >
                  <span className="material-symbols-outlined text-white">close</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5">
              {/* Affected Resource */}
              <div className="mb-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Asignatura Afectada</p>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">menu_book</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white">{selectedConflict.subject_name}</h4>
                    <p className="text-xs text-slate-500">NRC {selectedConflict.nrc}</p>
                  </div>
                </div>
              </div>

              {/* Problem Description */}
              <div className="mb-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">¿Cuál es el problema?</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedConflict.description}
                </p>
              </div>

              {/* When/Where */}
              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Día</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{days[selectedConflict.day_of_week - 1]}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Bloque</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{selectedConflict.timeslot_label}</p>
                </div>
              </div>

              {/* Teacher if applicable */}
              {selectedConflict.teacher_name && (
                <div className="mb-5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Docente Involucrado</p>
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{selectedConflict.teacher_name}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#111418] flex gap-3">
              <button
                onClick={() => setSelectedConflict(null)}
                className="flex-1 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
              >
                Ignorar
              </button>
              <button
                onClick={() => resolveConflict(selectedConflict)}
                className="flex-1 py-2.5 bg-primary text-white text-sm font-bold rounded-lg shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">auto_fix</span>
                Resolver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1a2430] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">download</span>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Exportar Horario</h3>
              </div>
              <button onClick={() => setShowExportModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-slate-500 mb-4">Selecciona el formato de exportación:</p>

              <div className="space-y-2">
                <button
                  onClick={exportToCSV}
                  className="w-full flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                >
                  <div className="size-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-emerald-600">table_chart</span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-white">CSV (Excel Compatible)</p>
                    <p className="text-xs text-slate-500">Tabla de datos para análisis</p>
                  </div>
                </button>

                <button
                  onClick={exportToPDF}
                  className="w-full flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                >
                  <div className="size-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-red-600">picture_as_pdf</span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-white">PDF</p>
                    <p className="text-xs text-slate-500">Documento profesional para imprimir</p>
                  </div>
                </button>
              </div>

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  <strong>{assignments.length}</strong> asignaciones serán exportadas para el período <strong>{selectedPeriod}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Panel */}
      {showAuditPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-end z-50">
          <div className="bg-white dark:bg-[#1a2430] w-full max-w-md h-full shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">history</span>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Historial de Cambios</h3>
              </div>
              <button onClick={() => setShowAuditPanel(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                <span className="material-symbols-outlined text-slate-400">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {auditLog.map(entry => (
                <div key={entry.id} className="flex gap-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${entry.action === 'assign' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                    entry.action === 'resolve' ? 'bg-blue-100 dark:bg-blue-900/30' :
                      entry.action === 'publish' ? 'bg-purple-100 dark:bg-purple-900/30' :
                        entry.action === 'auto_assign' ? 'bg-amber-100 dark:bg-amber-900/30' :
                          'bg-slate-100 dark:bg-slate-800'
                    }`}>
                    <span className={`material-symbols-outlined text-[16px] ${entry.action === 'assign' ? 'text-emerald-600' :
                      entry.action === 'resolve' ? 'text-blue-600' :
                        entry.action === 'publish' ? 'text-purple-600' :
                          entry.action === 'auto_assign' ? 'text-amber-600' :
                            'text-slate-500'
                      }`}>
                      {entry.action === 'assign' ? 'add_circle' :
                        entry.action === 'resolve' ? 'auto_fix' :
                          entry.action === 'publish' ? 'publish' :
                            entry.action === 'auto_assign' ? 'bolt' :
                              'save'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-white">{entry.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400">{entry.user}</span>
                      <span className="text-[10px] text-slate-300">•</span>
                      <span className="text-[10px] text-slate-400">
                        {entry.timestamp.toLocaleString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {auditLog.length === 0 && (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">history</span>
                  <p className="text-sm text-slate-400">No hay cambios registrados</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <span className="material-symbols-outlined text-amber-500">info</span>
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-amber-500 hover:text-amber-700">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Room Selector Modal */}
      {showRoomSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-primary/5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">meeting_room</span>
                Seleccionar Sala
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {showRoomSelector.section.subject_name} → {days[showRoomSelector.dayOfWeek - 1]}, {timeslots.find(t => t.id === showRoomSelector.timeslotId)?.label}
              </p>
            </div>

            <div className="p-4 max-h-[400px] overflow-y-auto">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Salas disponibles ({showRoomSelector.section.type})
              </p>
              <div className="space-y-2">
                {getCompatibleRooms(showRoomSelector.section.type).map(room => (
                  <button
                    key={room.id}
                    onClick={() => confirmAssignment(room.name)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-primary hover:bg-primary/5 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`size-10 rounded-lg flex items-center justify-center ${room.type === 'LAB' ? 'bg-purple-100 text-purple-600'
                        : room.type === 'SIM' ? 'bg-amber-100 text-amber-600'
                          : 'bg-blue-100 text-blue-600'
                        }`}>
                        <span className="material-symbols-outlined text-xl">
                          {room.type === 'LAB' ? 'science' : room.type === 'SIM' ? 'smart_toy' : 'school'}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{room.name}</p>
                        <p className="text-xs text-slate-500">{room.type} • {room.capacity} personas</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <button
                onClick={() => setShowRoomSelector(null)}
                className="w-full py-2 text-slate-600 dark:text-slate-400 font-semibold hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Assignment / Negotiation Modal */}
      {editingAssignment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">edit</span>
                Editar Asignación / Negociación
              </h3>
              <button 
                onClick={() => setEditingAssignment(null)}
                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="mb-4 p-3.5 bg-primary/5 rounded-xl border border-primary/10">
              <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Asignatura</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{editingAssignment.subject_name}</p>
              <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">
                {editingAssignment.subject_code} • {sections.find(s => s.id === editingAssignment.section_id)?.type || 'TEO'} • Nivel {editingAssignment.level}
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); saveEditedAssignment(); }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Sala Asignada
                </label>
                <select
                  value={editFormData.room_name}
                  onChange={(e) => setEditFormData({ ...editFormData, room_name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all appearance-none"
                >
                  <option value="">Sin sala</option>
                  {availableRooms.map(room => (
                    <option key={room.id} value={room.name}>
                      {room.name} ({room.type} • Cap: {room.capacity})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Docente Asignado
                </label>
                <select
                  value={editFormData.teacher_name}
                  onChange={(e) => setEditFormData({ ...editFormData, teacher_name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all appearance-none"
                >
                  <option value="">Sin docente</option>
                  {teachers.map((teacher, idx) => (
                    <option key={teacher.id || idx} value={teacher.nombre}>
                      {teacher.nombre} ({teacher.tipo_contrato || 'Contrato no especificado'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAssignment(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-md shadow-primary/20 transition-all"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Section Creation/Edition Modal */}
      {isSectionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">format_list_numbered</span>
                {editingSection ? 'Editar Sección' : 'Registrar Nueva Sección / NRC'}
              </h3>
              <button 
                onClick={() => setIsSectionModalOpen(false)}
                className="size-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); saveEditedSection(); }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Asignatura Relacionada
                </label>
                <select
                  value={sectionFormData.subject_id}
                  onChange={(e) => setSectionFormData({ ...sectionFormData, subject_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all appearance-none"
                  required
                >
                  <option value="" disabled>Seleccione asignatura</option>
                  {allSubjects.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.nombre} ({sub.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    NRC (Código Registro)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 23456"
                    value={sectionFormData.nrc}
                    onChange={(e) => setSectionFormData({ ...sectionFormData, nrc: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-805 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Tipo de Sección
                  </label>
                  <select
                    value={sectionFormData.type}
                    onChange={(e) => setSectionFormData({ ...sectionFormData, type: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-805 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all appearance-none"
                  >
                    <option value="TEO">Teórica (TEO)</option>
                    <option value="LAB">Laboratorio (LAB)</option>
                    <option value="SIM">Simulación (SIM)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Nivel / Semestre
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={12}
                    value={sectionFormData.level}
                    onChange={(e) => setSectionFormData({ ...sectionFormData, level: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-805 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Horas Semanales
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={12}
                    value={sectionFormData.hours_per_week}
                    onChange={(e) => setSectionFormData({ ...sectionFormData, hours_per_week: parseInt(e.target.value) || 2 })}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-805 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Docente Preferido / Inicial
                </label>
                <select
                  value={sectionFormData.teacher_name}
                  onChange={(e) => setSectionFormData({ ...sectionFormData, teacher_name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-2.5 text-sm focus:border-primary focus:ring-primary focus:outline-none dark:text-white transition-all appearance-none"
                >
                  <option value="">Sin docente preferido</option>
                  {teachers.map((teacher, idx) => (
                    <option key={teacher.id || idx} value={teacher.nombre}>
                      {teacher.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSectionModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-md shadow-primary/20 transition-all"
                >
                  {editingSection ? 'Guardar Cambios' : 'Crear Sección'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulerPage;
