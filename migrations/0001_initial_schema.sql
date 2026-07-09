-- =============================================
-- SCHEDULER PRO - Database Schema for D1 (SQLite)
-- =============================================

-- 1. NIVEL DE ACCESO Y SEGURIDAD
-- =============================================

-- Facultades
CREATE TABLE IF NOT EXISTS faculties (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Carreras (Base para RLS)
CREATE TABLE IF NOT EXISTS careers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    faculty_id TEXT REFERENCES faculties(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Usuarios del sistema
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'coordinator', 'viewer')) DEFAULT 'viewer',
    career_id TEXT REFERENCES careers(id) ON DELETE SET NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Períodos académicos
CREATE TABLE IF NOT EXISTS periods (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    code TEXT NOT NULL UNIQUE, -- Ej: "2026-1"
    name TEXT NOT NULL, -- Ej: "Primer Semestre 2026"
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2. RECURSOS BASE (MAESTROS)
-- =============================================

-- Docentes
CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
    rut TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    contract_type TEXT CHECK(contract_type IN ('Planta', 'Honorarios', 'Media Jornada', 'Adjunto')) DEFAULT 'Honorarios',
    max_hours_per_week INTEGER DEFAULT 44,
    avatar_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_teachers_career ON teachers(career_id);
CREATE INDEX idx_teachers_rut ON teachers(rut);

-- Módulos de tiempo (Slots)
CREATE TABLE IF NOT EXISTS timeslots (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    label TEXT NOT NULL UNIQUE, -- Ej: "M1", "M2", "T1"
    start_time TEXT NOT NULL, -- Formato "HH:MM"
    end_time TEXT NOT NULL,
    order_index INTEGER NOT NULL, -- Para ordenar
    created_at TEXT DEFAULT (datetime('now'))
);

-- Disponibilidad de docentes
CREATE TABLE IF NOT EXISTS teacher_availability (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 5), -- 1=Lunes, 5=Viernes
    timeslot_id TEXT NOT NULL REFERENCES timeslots(id) ON DELETE CASCADE,
    status TEXT CHECK(status IN ('available', 'blocked', 'preference')) DEFAULT 'available',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(teacher_id, day_of_week, timeslot_id)
);

CREATE INDEX idx_availability_teacher ON teacher_availability(teacher_id);

-- Salas/Espacios físicos
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    career_id TEXT REFERENCES careers(id) ON DELETE SET NULL, -- NULL = sala compartida global
    name TEXT NOT NULL,
    building TEXT, -- Ej: "Edificio D"
    floor INTEGER,
    type TEXT CHECK(type IN ('TEO', 'LAB', 'SIM', 'TAL', 'AUD')) DEFAULT 'TEO',
    capacity INTEGER NOT NULL DEFAULT 30,
    is_shared INTEGER DEFAULT 0, -- Si otras carreras pueden usarla
    equipment TEXT, -- JSON con equipamiento disponible
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_rooms_career ON rooms(career_id);
CREATE INDEX idx_rooms_type ON rooms(type);

-- 3. ESTRUCTURA ACADÉMICA
-- =============================================

-- Asignaturas
CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- Ej: "DMOR0030"
    name TEXT NOT NULL,
    level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 12), -- Semestre
    credits INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(career_id, code)
);

CREATE INDEX idx_subjects_career ON subjects(career_id);
CREATE INDEX idx_subjects_level ON subjects(level);

-- Secciones (NRCs - Las "Cajitas")
CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    nrc TEXT NOT NULL UNIQUE, -- Número de Registro de Curso
    section_code TEXT, -- Ej: "S13"
    type TEXT CHECK(type IN ('TEO', 'LAB', 'TAL', 'SIM')) DEFAULT 'TEO',
    expected_students INTEGER DEFAULT 0,
    total_hours_semester INTEGER DEFAULT 0,
    hours_per_week INTEGER DEFAULT 2, -- Módulos por semana
    teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
    color TEXT, -- Color para UI (hex)
    priority INTEGER DEFAULT 0, -- 0=normal, 1=alta, 2=crítica
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_sections_subject ON sections(subject_id);
CREATE INDEX idx_sections_teacher ON sections(teacher_id);
CREATE INDEX idx_sections_nrc ON sections(nrc);

-- 4. MOTOR DE PLANIFICACIÓN
-- =============================================

-- Asignaciones de horario (La planificación real)
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
    period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    timeslot_id TEXT NOT NULL REFERENCES timeslots(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 5),
    is_temporary INTEGER DEFAULT 0, -- Borrador/Simulación
    is_published INTEGER DEFAULT 0,
    assigned_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(period_id, room_id, timeslot_id, day_of_week, is_temporary)
);

CREATE INDEX idx_assignments_career ON schedule_assignments(career_id);
CREATE INDEX idx_assignments_period ON schedule_assignments(period_id);
CREATE INDEX idx_assignments_section ON schedule_assignments(section_id);
CREATE INDEX idx_assignments_room ON schedule_assignments(room_id);
CREATE INDEX idx_assignments_slot ON schedule_assignments(timeslot_id, day_of_week);

-- 5. INTELIGENCIA Y CONFLICTOS
-- =============================================

-- Registro de conflictos/alertas
CREATE TABLE IF NOT EXISTS conflicts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    assignment_id TEXT REFERENCES schedule_assignments(id) ON DELETE CASCADE,
    related_assignment_id TEXT REFERENCES schedule_assignments(id) ON DELETE SET NULL,
    type TEXT CHECK(type IN ('CRITICAL', 'WARNING')) NOT NULL,
    rule_code TEXT NOT NULL, -- Código de regla violada
    description TEXT,
    is_resolved INTEGER DEFAULT 0,
    resolved_by TEXT REFERENCES users(id),
    resolved_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_conflicts_assignment ON conflicts(assignment_id);
CREATE INDEX idx_conflicts_type ON conflicts(type);
CREATE INDEX idx_conflicts_resolved ON conflicts(is_resolved);

-- Reglas del motor (Configurables)
CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK(type IN ('CRITICAL', 'WARNING')) NOT NULL,
    is_active INTEGER DEFAULT 1,
    score_impact INTEGER DEFAULT 0, -- Puntos que resta al score
    created_at TEXT DEFAULT (datetime('now'))
);

-- 6. AUDITORÍA Y TRAZABILIDAD
-- =============================================

-- Log de cambios
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT REFERENCES users(id),
    career_id TEXT REFERENCES careers(id),
    action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'RESOLVE'
    entity_type TEXT NOT NULL, -- 'assignment', 'teacher', 'room', etc.
    entity_id TEXT,
    old_value TEXT, -- JSON
    new_value TEXT, -- JSON
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
