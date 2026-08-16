-- Make each course offering belong to one career and one academic period.
-- Existing rows are assigned to the most recent first-semester period, or to
-- the period of their first schedule assignment when one exists.
PRAGMA foreign_keys = OFF;

-- Keep dependent data while rebuilding `sections`. On D1, dropping a parent
-- table can still cascade its dependants even when this pragma is disabled.
-- The backups are deliberately untyped helper tables and are removed below.
CREATE TABLE schedule_assignments_backup AS SELECT * FROM schedule_assignments;
CREATE TABLE conflicts_backup AS SELECT * FROM conflicts;

CREATE TABLE sections_v2 (
    id TEXT PRIMARY KEY,
    period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    nrc TEXT NOT NULL,
    section_code TEXT,
    type TEXT CHECK(type IN ('TEO', 'LAB', 'TAL', 'SIM')) DEFAULT 'TEO',
    expected_students INTEGER DEFAULT 0,
    total_hours_semester INTEGER DEFAULT 0,
    hours_per_week INTEGER DEFAULT 2,
    teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
    color TEXT,
    priority INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(period_id, career_id, nrc)
);

INSERT INTO sections_v2 (
    id, period_id, career_id, subject_id, nrc, section_code, type,
    expected_students, total_hours_semester, hours_per_week, teacher_id,
    color, priority, created_at, updated_at
)
SELECT
    s.id,
    COALESCE(
        (SELECT sa.period_id FROM schedule_assignments sa
         WHERE sa.section_id = s.id
         ORDER BY CASE WHEN sa.period_id LIKE '%-1' THEN 0 ELSE 1 END, sa.created_at
         LIMIT 1),
        (SELECT p.id FROM periods p WHERE p.code LIKE '%-1' ORDER BY p.start_date DESC LIMIT 1),
        (SELECT p.id FROM periods p ORDER BY p.start_date DESC LIMIT 1)
    ),
    sub.career_id,
    s.subject_id,
    s.nrc,
    s.section_code,
    s.type,
    s.expected_students,
    s.total_hours_semester,
    s.hours_per_week,
    s.teacher_id,
    s.color,
    s.priority,
    s.created_at,
    s.updated_at
FROM sections s
JOIN subjects sub ON sub.id = s.subject_id;

DROP TABLE sections;
ALTER TABLE sections_v2 RENAME TO sections;

-- Restore rows explicitly so this remains compatible with optional columns
-- added to the live schedule table (for example parallel_index).
INSERT INTO schedule_assignments (
    id, career_id, period_id, section_id, room_id, timeslot_id,
    day_of_week, is_temporary, is_published, assigned_by, created_at, updated_at
)
SELECT
    id, career_id, period_id, section_id, room_id, timeslot_id,
    day_of_week, is_temporary, is_published, assigned_by, created_at, updated_at
FROM schedule_assignments_backup;

INSERT INTO conflicts (
    id, assignment_id, related_assignment_id, type, rule_code, description,
    is_resolved, resolved_by, resolved_at, created_at,
    resolution_type, resolution_justification
)
SELECT
    id, assignment_id, related_assignment_id, type, rule_code, description,
    is_resolved, resolved_by, resolved_at, created_at,
    resolution_type, resolution_justification
FROM conflicts_backup;

DROP TABLE conflicts_backup;
DROP TABLE schedule_assignments_backup;

CREATE INDEX idx_sections_period_career ON sections(period_id, career_id);
CREATE INDEX idx_sections_subject ON sections(subject_id);
CREATE INDEX idx_sections_teacher ON sections(teacher_id);
CREATE INDEX idx_sections_nrc ON sections(nrc);

PRAGMA foreign_keys = ON;
