-- =============================================
-- Migration: 0010_academic_constraints.sql
-- Tablas intermedias para idoneidad docente, compatibilidad de salas y prerrequisitos
-- =============================================

-- 1. Habilitación y especialidad docente por asignatura
CREATE TABLE IF NOT EXISTS teacher_subjects (
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 1, -- 1=Titular / Preferente, 2=Suplente / Respaldo
    max_sections INTEGER DEFAULT 4,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (teacher_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher ON teacher_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject ON teacher_subjects(subject_id);

-- 2. Compatibilidad y requisitos específicos de salas por asignatura
CREATE TABLE IF NOT EXISTS subject_room_compatibilities (
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    requirement_level TEXT CHECK(requirement_level IN ('EXCLUSIVE', 'PREFERRED', 'ALLOWED')) DEFAULT 'ALLOWED',
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (subject_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_rooms_subject ON subject_room_compatibilities(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_rooms_room ON subject_room_compatibilities(room_id);

-- 3. Prerrequisitos y correquisitos entre asignaturas
CREATE TABLE IF NOT EXISTS subject_prerequisites (
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    prerequisite_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    type TEXT CHECK(type IN ('MANDATORY', 'COREQUISITE', 'RECOMMENDED')) DEFAULT 'MANDATORY',
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (subject_id, prerequisite_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_prereq_subject ON subject_prerequisites(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_prereq_prereq ON subject_prerequisites(prerequisite_id);
