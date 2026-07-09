/**
 * Data Store - Persistencia local de datos para planificación
 * 
 * Este módulo permite que los datos importados persistan en localStorage
 * y estén disponibles en el planificador.
 */

// Types
export interface ImportedTeacher {
    id: string;
    nombre: string;
    email: string;
    departamento?: string;
    tipo_contrato?: string;
    max_horas?: number;
    availability?: {
        [key: string]: 'available' | 'blocked' | 'preference'; // key format: "slotId-day"
    };
}

export interface ImportedSubject {
    id: string;
    codigo: string;
    nombre: string;
    nivel: number;
    creditos?: number;
    carrera?: string;
}

export interface ImportedRoom {
    id: string;
    nombre: string;
    tipo: 'TEO' | 'LAB' | 'SIM' | 'AUD';
    capacidad: number;
    edificio?: string;
    asignaturas_permitidas?: string[]; // Códigos de asignaturas que pueden usar esta sala
}

export interface ImportedSection {
    id: string;
    nrc: string;
    codigo: string;
    nombre: string;
    nivel: number;
    horas: number;
    tipo: 'TEO' | 'LAB' | 'SIM';
    docente_id?: string;
    docente_nombre?: string;
    periodo: string;
    nrc_teorico?: string; // NRC del teórico padre (para LAB/SIM)
    sala_preferida?: string; // Nombre de sala preferida
    seccion?: number; // Número de sección (ej: LAB Sec 1, LAB Sec 2)
}


// Storage keys
const KEYS = {
    TEACHERS: 'scheduler_teachers',
    SUBJECTS: 'scheduler_subjects',
    ROOMS: 'scheduler_rooms',
    SECTIONS: 'scheduler_sections',
    PERIOD: 'scheduler_current_period',
    TOKEN: 'auth_token',
    USER: 'user_info',
    TIMESLOTS: 'scheduler_config_timeslots',
    PERIODS: 'scheduler_config_periods',
};

// API Helpers
export const getAuthToken = () => {
    try {
        return localStorage.getItem(KEYS.TOKEN);
    } catch (e) {
        return null;
    }
};
export const isAuthenticated = () => !!getAuthToken();
export const logout = () => {
    try {
        localStorage.removeItem(KEYS.TOKEN);
        localStorage.removeItem(KEYS.USER);
    } catch (e) {
        console.error('Logout: Failed to clear storage', e);
    }
    window.location.href = '#/';
};

const apiFetch = async (endpoint: string, options: any = {}) => {
    const token = getAuthToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const response = await fetch(endpoint, { ...options, headers });
    if (response.status === 401) {
        console.warn('Unauthorized access, logging out...');
        // logout(); // Optional: depend on UX
        return null;
    }
    return response;
};

export const syncWithRemote = async (periodId: string = 'per-2026-1') => {
    if (!isAuthenticated()) return false;

    console.log('[DataStore] Syncing with remote database...');
    try {
        // Load teachers
        const tRes = await apiFetch('/api/teachers');
        if (tRes && tRes.ok) saveTeachers(await tRes.json());

        // Load rooms
        const rRes = await apiFetch('/api/rooms');
        if (rRes && rRes.ok) saveRooms(await rRes.json());

        // Load subjects
        const sRes = await apiFetch('/api/subjects');
        if (sRes && sRes.ok) saveSubjects(await sRes.json());

        // Load sections
        const secRes = await apiFetch(`/api/sections?period_id=${periodId}`);
        if (secRes && secRes.ok) saveSections(await secRes.json());

        return true;
    } catch (e) {
        console.error('Remote sync failed:', e);
        return false;
    }
};

// Helper functions
const getFromStorage = <T>(key: string): T[] => {
    try {
        const data = localStorage.getItem(key);
        if (!data || data === 'undefined') return [];
        const parsed = JSON.parse(data);
        const result = Array.isArray(parsed) ? parsed : [];
        console.log(`[DataStore] GET ${key}: ${result.length} items`);
        return result;
    } catch (e) {
        console.error(`[DataStore] Error reading ${key}:`, e);
        return [];
    }
};

const saveToStorage = <T>(key: string, data: T[]): void => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        console.log(`[DataStore] SAVE ${key}: ${data.length} items saved`);
    } catch (e) {
        console.error('Error saving to localStorage:', e);
    }
};

// Teachers
export const getTeachers = (): ImportedTeacher[] => getFromStorage(KEYS.TEACHERS);
export const saveTeachers = (teachers: ImportedTeacher[]): void => saveToStorage(KEYS.TEACHERS, teachers);
export const addTeachers = (newTeachers: ImportedTeacher[]): void => {
    const existing = getTeachers();
    const merged = [...existing];
    newTeachers.forEach(t => {
        const idx = merged.findIndex(e => e.email === t.email);
        if (idx >= 0) merged[idx] = t;
        else merged.push(t);
    });
    saveTeachers(merged);
};
export const addOrUpdateTeacher = (teacher: ImportedTeacher): void => {
    const teachers = getTeachers();
    const idx = teachers.findIndex(t => t.id === teacher.id);
    if (idx >= 0) {
        teachers[idx] = teacher;
    } else {
        teachers.push(teacher);
    }
    saveTeachers(teachers);
};
export const deleteTeacher = (id: string): void => {
    const teachers = getTeachers();
    saveTeachers(teachers.filter(t => t.id !== id));
};

// Subjects
export const getSubjects = (): ImportedSubject[] => getFromStorage(KEYS.SUBJECTS);
export const saveSubjects = (subjects: ImportedSubject[]): void => saveToStorage(KEYS.SUBJECTS, subjects);
export const addSubjects = (newSubjects: ImportedSubject[]): void => {
    const existing = getSubjects();
    const merged = [...existing];
    newSubjects.forEach(s => {
        const idx = merged.findIndex(e => e.codigo === s.codigo);
        if (idx >= 0) merged[idx] = s;
        else merged.push(s);
    });
    saveSubjects(merged);
};
export const addOrUpdateSubject = (subject: ImportedSubject): void => {
    const subjects = getSubjects();
    const idx = subjects.findIndex(s => s.id === subject.id);
    if (idx >= 0) {
        subjects[idx] = subject;
    } else {
        subjects.push(subject);
    }
    saveSubjects(subjects);
};
export const deleteSubject = (id: string): void => {
    const subjects = getSubjects();
    saveSubjects(subjects.filter(s => s.id !== id));
};

// Rooms
export const getRooms = (): ImportedRoom[] => getFromStorage(KEYS.ROOMS);
export const saveRooms = (rooms: ImportedRoom[]): void => saveToStorage(KEYS.ROOMS, rooms);
export const addRooms = (newRooms: ImportedRoom[]): void => {
    const existing = getRooms();
    const merged = [...existing];
    newRooms.forEach(r => {
        const idx = merged.findIndex(e => e.nombre === r.nombre);
        if (idx >= 0) merged[idx] = r;
        else merged.push(r);
    });
    saveRooms(merged);
};
export const addOrUpdateRoom = (room: ImportedRoom): void => {
    const rooms = getRooms();
    const idx = rooms.findIndex(r => r.id === room.id);
    if (idx >= 0) {
        rooms[idx] = room;
    } else {
        rooms.push(room);
    }
    saveRooms(rooms);
};
export const deleteRoom = (id: string): void => {
    const rooms = getRooms();
    saveRooms(rooms.filter(r => r.id !== id));
};

// Sections
export const getSections = (period?: string): ImportedSection[] => {
    const all = getFromStorage<ImportedSection>(KEYS.SECTIONS);
    if (period) return all.filter(s => s.periodo === period);
    return all;
};
export const saveSections = (sections: ImportedSection[]): void => saveToStorage(KEYS.SECTIONS, sections);
export const addSections = (newSections: ImportedSection[], period: string): void => {
    const existing = getSections();
    const merged = [...existing];
    newSections.forEach(s => {
        const idx = merged.findIndex(e => e.nrc === s.nrc && e.periodo === period);
        if (idx >= 0) merged[idx] = { ...s, periodo: period };
        else merged.push({ ...s, periodo: period });
    });
    saveSections(merged);
};
export const addOrUpdateSection = (section: ImportedSection): void => {
    const sections = getFromStorage<ImportedSection>(KEYS.SECTIONS);
    const idx = sections.findIndex(s => s.id === section.id);
    if (idx >= 0) {
        sections[idx] = section;
    } else {
        sections.push(section);
    }
    saveSections(sections);
};
export const deleteSection = (id: string): void => {
    const sections = getFromStorage<ImportedSection>(KEYS.SECTIONS);
    saveSections(sections.filter(s => s.id !== id));
};

export interface LocalTimeslot {
    id: string;
    label: string;
    start_time: string;
    end_time: string;
    order_index: number;
    type?: string;
}

export interface LocalPeriod {
    id: string;
    name: string;
    status: 'Activo' | 'Archivado' | 'Borrador';
    startDate: string;
    endDate: string;
}

export const getCustomTimeslots = (): LocalTimeslot[] => {
    const list = getFromStorage<LocalTimeslot>(KEYS.TIMESLOTS);
    if (list.length > 0) return list;
    return [
        { id: 'ts-m1', label: 'M1', start_time: '08:00', end_time: '09:20', order_index: 1, type: 'Mañana' },
        { id: 'ts-m2', label: 'M2', start_time: '09:30', end_time: '10:50', order_index: 2, type: 'Mañana' },
        { id: 'ts-m3', label: 'M3', start_time: '11:00', end_time: '12:20', order_index: 3, type: 'Mañana' },
        { id: 'ts-t1', label: 'T1', start_time: '14:00', end_time: '15:20', order_index: 4, type: 'Tarde' },
        { id: 'ts-t2', label: 'T2', start_time: '15:30', end_time: '16:50', order_index: 5, type: 'Tarde' },
        { id: 'ts-t3', label: 'T3', start_time: '17:00', end_time: '18:20', order_index: 6, type: 'Tarde' },
    ];
};

export const saveCustomTimeslots = (timeslots: LocalTimeslot[]): void => saveToStorage(KEYS.TIMESLOTS, timeslots);

export const getCustomPeriods = (): LocalPeriod[] => {
    const list = getFromStorage<LocalPeriod>(KEYS.PERIODS);
    if (list.length > 0) return list;
    return [
        { id: '1', name: '2026-1', status: 'Activo', startDate: '2026-03-01', endDate: '2026-07-15' },
        { id: '2', name: '2025-2', status: 'Archivado', startDate: '2025-08-01', endDate: '2025-12-15' },
        { id: '3', name: '2026-2', status: 'Borrador', startDate: '2026-08-01', endDate: '2026-12-15' },
    ];
};

export const saveCustomPeriods = (periods: LocalPeriod[]): void => saveToStorage(KEYS.PERIODS, periods);

// Current Period
export const getCurrentPeriod = (): string => {
    try {
        return localStorage.getItem(KEYS.PERIOD) || '2026-1';
    } catch (e) {
        return '2026-1';
    }
};
export const setCurrentPeriod = (period: string): void => {
    try {
        localStorage.setItem(KEYS.PERIOD, period);
    } catch (e) {
        console.error('Failed to set current period', e);
    }
};

// Summary for dashboard
export interface DataSummary {
    teachers: number;
    subjects: number;
    rooms: number;
    sections: number;
    hasData: boolean;
}

export const getDataSummary = (period?: string): DataSummary => {
    const teachers = getTeachers().length;
    const subjects = getSubjects().length;
    const rooms = getRooms().length;
    const sections = getSections(period).length;

    return {
        teachers,
        subjects,
        rooms,
        sections,
        hasData: teachers > 0 || subjects > 0 || rooms > 0 || sections > 0,
    };
};

// Clear all data
export const clearAllData = (): void => {
    try {
        Object.values(KEYS).forEach(key => localStorage.removeItem(key));
    } catch (e) {
        console.error('Failed to clear all data', e);
    }
};

// Convert imported rows to typed objects
export const parseTeachersFromCSV = (rows: Record<string, string>[]): ImportedTeacher[] => {
    return rows.map((row, idx) => ({
        id: `teacher-${Date.now()}-${idx}`,
        nombre: row['nombre'] || row['Nombre'] || '',
        email: row['email'] || row['Email'] || row['correo'] || '',
        departamento: row['departamento'] || row['Departamento'] || '',
        tipo_contrato: row['tipo'] || row['contrato'] || row['tipo_contrato'] || '',
        max_horas: parseInt(row['max_horas'] || row['Horas'] || row['horas_maximas'] || '20') || 20,
    }));
};

export const parseSubjectsFromCSV = (rows: Record<string, string>[]): ImportedSubject[] => {
    return rows.map((row, idx) => ({
        id: `subject-${Date.now()}-${idx}`,
        codigo: row['codigo'] || row['Codigo'] || row['código'] || '',
        nombre: row['nombre'] || row['Nombre'] || row['asignatura'] || '',
        nivel: parseInt(row['nivel'] || row['Nivel'] || '1') || 1,
        creditos: parseInt(row['creditos'] || row['Creditos'] || '0') || undefined,
        carrera: row['carrera'] || row['Carrera'] || '',
    }));
};

export const parseRoomsFromCSV = (rows: Record<string, string>[]): ImportedRoom[] => {
    return rows.map((row, idx) => ({
        id: `room-${Date.now()}-${idx}`,
        nombre: row['nombre'] || row['Nombre'] || row['sala'] || '',
        tipo: (row['tipo'] || row['Tipo'] || 'TEO').toUpperCase() as ImportedRoom['tipo'],
        capacidad: parseInt(row['capacidad'] || row['Capacidad'] || '30') || 30,
        edificio: row['edificio'] || row['Edificio'] || '',
    }));
};

export const parseSectionsFromCSV = (rows: Record<string, string>[], period: string): ImportedSection[] => {
    return rows.map((row, idx) => ({
        id: `section-${Date.now()}-${idx}`,
        nrc: row['nrc'] || row['NRC'] || '',
        codigo: row['codigo'] || row['Codigo'] || row['código'] || '',
        nombre: row['nombre'] || row['Nombre'] || row['asignatura'] || '',
        nivel: parseInt(row['nivel'] || row['Nivel'] || '1') || 1,
        horas: parseInt(row['horas'] || row['Horas'] || row['hrs'] || '2') || 2,
        tipo: (row['tipo'] || row['Tipo'] || 'TEO').toUpperCase() as ImportedSection['tipo'],
        docente_nombre: row['docente'] || row['Docente'] || row['profesor'] || '',
        periodo: period,
        // Nuevos campos para relaciones TEO → LAB
        nrc_teorico: row['nrc_teorico'] || row['NRC_Teorico'] || row['nrc_padre'] || undefined,
        sala_preferida: row['sala_preferida'] || row['sala'] || row['Sala'] || undefined,
        seccion: parseInt(row['seccion'] || row['Seccion'] || '0') || undefined,
    }));
};

// Helper para obtener secciones relacionadas (TEO y sus LABs)
export const getRelatedSections = (nrc: string, period: string): ImportedSection[] => {
    const allSections = getSections(period);
    const mainSection = allSections.find(s => s.nrc === nrc);

    if (!mainSection) return [];

    // Si es un TEO, buscar sus LABs
    if (mainSection.tipo === 'TEO') {
        const labs = allSections.filter(s => s.nrc_teorico === nrc);
        return [mainSection, ...labs];
    }

    // Si es un LAB, buscar su TEO padre y hermanos
    if (mainSection.nrc_teorico) {
        const parent = allSections.find(s => s.nrc === mainSection.nrc_teorico);
        const siblings = allSections.filter(s => s.nrc_teorico === mainSection.nrc_teorico);
        return parent ? [parent, ...siblings] : siblings;
    }

    return [mainSection];
};

// Helper para encontrar salas compatibles
export const getCompatibleRooms = (section: ImportedSection): ImportedRoom[] => {
    const allRooms = getRooms();

    return allRooms.filter(room => {
        // Tipo debe coincidir (TEO→TEO/AUD, LAB→LAB, SIM→SIM)
        if (section.tipo === 'TEO' && !['TEO', 'AUD'].includes(room.tipo)) return false;
        if (section.tipo === 'LAB' && room.tipo !== 'LAB') return false;
        if (section.tipo === 'SIM' && room.tipo !== 'SIM') return false;

        // Si la sala tiene asignaturas permitidas, verificar
        if (room.asignaturas_permitidas && room.asignaturas_permitidas.length > 0) {
            if (!room.asignaturas_permitidas.includes(section.codigo)) return false;
        }

        // Si hay sala preferida, priorizar
        // (esto se maneja en el ordenamiento, no en el filtro)

        return true;
    }).sort((a, b) => {
        // Priorizar sala preferida
        if (section.sala_preferida) {
            if (a.nombre === section.sala_preferida) return -1;
            if (b.nombre === section.sala_preferida) return 1;
        }
        return 0;
    });
};
