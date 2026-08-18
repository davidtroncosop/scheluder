-- Seed academic constraints for Demo
-- 1. Vincular docentes con asignaturas de su especialidad
INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id, priority, max_sections)
SELECT t.id, s.id, 1, 3
FROM teachers t, subjects s
WHERE (t.name LIKE '%Valenzuela%' AND s.name LIKE '%Morfología%')
   OR (t.name LIKE '%Rivas%' AND s.name LIKE '%Biomecánica%')
   OR (t.name LIKE '%Soto%' AND s.name LIKE '%Fisiología%')
   OR (t.name LIKE '%Alejandro%' AND s.code LIKE '%DMOR%')
   OR (t.name LIKE '%María%' AND s.code LIKE '%DBIO%');

-- Si hay docentes y asignaturas sin match específico, habilitar el primer docente en las primeras 2 asignaturas
INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id, priority, max_sections)
SELECT (SELECT id FROM teachers LIMIT 1), id, 1, 4 FROM subjects LIMIT 3;

-- 2. Vincular asignaturas con salas específicas
INSERT OR IGNORE INTO subject_room_compatibilities (subject_id, room_id, requirement_level)
SELECT s.id, r.id, 'EXCLUSIVE'
FROM subjects s, rooms r
WHERE (s.name LIKE '%Morfología%' AND r.name LIKE '%Lab%')
   OR (s.name LIKE '%Simulación%' AND r.type = 'SIM')
   OR (s.name LIKE '%Taller%' AND r.type = 'TAL');

-- 3. Prerrequisitos entre asignaturas
INSERT OR IGNORE INTO subject_prerequisites (subject_id, prerequisite_id, type)
SELECT s2.id, s1.id, 'MANDATORY'
FROM subjects s1, subjects s2
WHERE s1.name LIKE '%Anatomía I%' AND s2.name LIKE '%Anatomía II%';
