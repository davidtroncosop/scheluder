-- =============================================
-- SCHEDULER PRO - Seed Data
-- =============================================

-- Facultades
INSERT INTO faculties (id, name, code) VALUES
('fac-salud-001', 'Facultad de Ciencias de la Salud', 'SALUD'),
('fac-ing-001', 'Facultad de Ingeniería', 'ING');

-- Carreras
INSERT INTO careers (id, faculty_id, name, code) VALUES
('car-kine-001', 'fac-salud-001', 'Kinesiología', 'KINE'),
('car-enf-001', 'fac-salud-001', 'Enfermería', 'ENF'),
('car-med-001', 'fac-salud-001', 'Medicina', 'MED');

-- Período activo
INSERT INTO periods (id, code, name, start_date, end_date, is_active) VALUES
('per-2026-1', '2026-1', 'Primer Semestre 2026', '2026-03-01', '2026-07-15', 1);

-- Usuario admin (password: admin123)
INSERT INTO users (id, email, name, password_hash, role, career_id) VALUES
('usr-admin-001', 'admin@scheduler.pro', 'Administrador', 'ec83c02ae90515b13dac7c238046dcb1d5f70dca5a6d6238c206f6de0e2df4a1', 'admin', NULL),
('usr-coord-kine', 'coordinador@kine.edu', 'Coordinador Kinesiología', 'ec83c02ae90515b13dac7c238046dcb1d5f70dca5a6d6238c206f6de0e2df4a1', 'coordinator', 'car-kine-001');

-- Timeslots (Módulos)
INSERT INTO timeslots (id, label, start_time, end_time, order_index) VALUES
('ts-m1', 'M1', '08:00', '09:20', 1),
('ts-m2', 'M2', '09:40', '11:00', 2),
('ts-m3', 'M3', '11:20', '12:40', 3),
('ts-m4', 'M4', '13:00', '14:20', 4),
('ts-t1', 'T1', '14:40', '16:00', 5),
('ts-t2', 'T2', '16:20', '17:40', 6),
('ts-t3', 'T3', '18:00', '19:20', 7),
('ts-t4', 'T4', '19:40', '21:00', 8);

-- Docentes de Kinesiología
INSERT INTO teachers (id, career_id, rut, name, email, contract_type, max_hours_per_week) VALUES
('tch-reyes-001', 'car-kine-001', '12.345.678-9', 'Dr. Carlos Reyes', 'c.reyes@edu.cl', 'Planta', 44),
('tch-soto-001', 'car-kine-001', '13.456.789-0', 'Klgo. Roberto Soto', 'r.soto@edu.cl', 'Honorarios', 22),
('tch-valenz-001', 'car-kine-001', '14.567.890-1', 'Dr. Alejandro Valenzuela', 'a.valenzuela@edu.cl', 'Planta', 44),
('tch-rivas-001', 'car-kine-001', '15.678.901-2', 'Dra. María Paz Rivas', 'm.rivas@edu.cl', 'Media Jornada', 22);

-- Salas
INSERT INTO rooms (id, career_id, name, building, floor, type, capacity, is_shared) VALUES
('room-204', 'car-kine-001', 'SALA 204', 'Edificio D', 2, 'TEO', 40, 0),
('room-lab1', 'car-kine-001', 'LAB KINE 1', 'Edificio D', 1, 'LAB', 20, 0),
('room-sim1', 'car-kine-001', 'SIMULACIÓN 1', 'Edificio D', 1, 'SIM', 15, 0),
('room-aud1', NULL, 'AUDITORIO A', 'Edificio Central', 1, 'AUD', 200, 1);

-- Asignaturas Kinesiología Nivel 3
INSERT INTO subjects (id, career_id, code, name, level, credits) VALUES
('sub-morf-001', 'car-kine-001', 'DMOR0030', 'Morfología', 3, 6),
('sub-biom-001', 'car-kine-001', 'DBIO0031', 'Biomecánica I', 3, 4),
('sub-fisio-001', 'car-kine-001', 'DFIS0032', 'Fisiología I', 3, 6),
('sub-bioe-001', 'car-kine-001', 'DBIE0033', 'Bioética', 3, 2),
('sub-salp-001', 'car-kine-001', 'DSAL0034', 'Salud Pública', 3, 4),
('sub-anat-001', 'car-kine-001', 'DANA0020', 'Anatomía II', 2, 6);

-- Secciones (NRCs)
INSERT INTO sections (id, subject_id, nrc, section_code, type, expected_students, hours_per_week, teacher_id, priority) VALUES
('sec-morf-lab', 'sub-morf-001', '23456', 'S1', 'LAB', 25, 4, 'tch-reyes-001', 2),
('sec-biom-teo', 'sub-biom-001', '23489', 'S1', 'TEO', 40, 2, 'tch-soto-001', 1),
('sec-fisio-teo', 'sub-fisio-001', '23490', 'S1', 'TEO', 40, 4, 'tch-soto-001', 0),
('sec-bioe-teo', 'sub-bioe-001', '23491', 'S1', 'TEO', 40, 2, 'tch-reyes-001', 0),
('sec-salp-teo', 'sub-salp-001', '23492', 'S1', 'TEO', 40, 2, 'tch-valenz-001', 0),
('sec-anat-teo', 'sub-anat-001', '11202', 'S1', 'TEO', 40, 4, 'tch-rivas-001', 0);

-- Disponibilidad de docentes (bloqueados algunos horarios)
INSERT INTO teacher_availability (teacher_id, day_of_week, timeslot_id, status) VALUES
-- Prof. Reyes bloqueado Lunes M1, M2 y Miércoles completo
('tch-reyes-001', 1, 'ts-m1', 'blocked'),
('tch-reyes-001', 1, 'ts-m2', 'blocked'),
('tch-reyes-001', 3, 'ts-m1', 'blocked'),
('tch-reyes-001', 3, 'ts-m2', 'blocked'),
('tch-reyes-001', 3, 'ts-m3', 'blocked'),
('tch-reyes-001', 3, 'ts-m4', 'blocked'),
-- Prof. Reyes preferencia Jueves
('tch-reyes-001', 4, 'ts-m1', 'preference'),
('tch-reyes-001', 4, 'ts-m2', 'preference');

-- Reglas del motor
INSERT INTO rules (id, code, name, description, type, is_active, score_impact) VALUES
('rule-001', 'TEACHER_DUPLICATE', 'Unicidad Docente', 'El mismo docente no puede estar en dos lugares al mismo tiempo', 'CRITICAL', 1, -100),
('rule-002', 'ROOM_OCCUPIED', 'Sala Ocupada', 'La sala ya está asignada en ese horario', 'CRITICAL', 1, -100),
('rule-003', 'LEVEL_CLASH', 'Choque de Nivel', 'Alumnos del mismo nivel tienen dos clases simultáneas', 'WARNING', 1, -50),
('rule-004', 'TEACHER_BLOCKED', 'Docente No Disponible', 'El docente marcó ese horario como bloqueado', 'CRITICAL', 1, -100),
('rule-005', 'ROOM_TYPE_MISMATCH', 'Tipo de Sala Incompatible', 'La clase requiere un tipo de sala diferente', 'WARNING', 1, -30),
('rule-006', 'OVERCAPACITY', 'Sobrecapacidad', 'La sala tiene menos capacidad que los estudiantes esperados', 'WARNING', 1, -20),
('rule-007', 'FRIDAY_LAST_MODULE', 'Viernes Último Módulo', 'Baja productividad en viernes tarde', 'WARNING', 1, -15),
('rule-008', 'NO_LUNCH_BREAK', 'Sin Almuerzo', 'El docente no tiene pausa para almuerzo', 'WARNING', 1, -25);

-- Algunas asignaciones de ejemplo
INSERT INTO schedule_assignments (id, career_id, period_id, section_id, room_id, timeslot_id, day_of_week, is_published) VALUES
('asg-001', 'car-kine-001', 'per-2026-1', 'sec-salp-teo', 'room-204', 'ts-m1', 1, 1),
('asg-002', 'car-kine-001', 'per-2026-1', 'sec-fisio-teo', 'room-204', 'ts-m2', 1, 1),
('asg-003', 'car-kine-001', 'per-2026-1', 'sec-bioe-teo', 'room-204', 'ts-m2', 2, 1),
('asg-004', 'car-kine-001', 'per-2026-1', 'sec-anat-teo', 'room-204', 'ts-m1', 4, 1);

-- Conflicto de ejemplo
INSERT INTO conflicts (id, assignment_id, related_assignment_id, type, rule_code, description, is_resolved) VALUES
('conf-001', 'asg-003', 'asg-002', 'CRITICAL', 'TEACHER_DUPLICATE', 'El Docente Reyes está asignado simultáneamente en Morfología (M2) y Bioética (M2)', 0);
