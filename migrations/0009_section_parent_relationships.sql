-- Model theoretical sections as parents of practical LAB/TAL/SIM sections.
-- Sibling practices may overlap; direct parent-child overlaps are rejected by
-- the scheduling API.

ALTER TABLE sections
ADD COLUMN parent_section_id TEXT REFERENCES sections(id) ON DELETE RESTRICT;

CREATE INDEX idx_sections_parent ON sections(parent_section_id);

-- Backfill legacy imports only when the parent can be identified without
-- ambiguity. Prefer the same section code/source group, then fall back to the
-- sole theoretical section for that subject and context.
UPDATE sections AS child
SET parent_section_id = COALESCE(
    (
        SELECT MIN(parent.id)
        FROM sections parent
        WHERE parent.type = 'TEO'
          AND parent.period_id = child.period_id
          AND parent.career_id = child.career_id
          AND parent.subject_id = child.subject_id
          AND (
              (child.section_code IS NULL AND parent.section_code IS NULL) OR
              parent.section_code = child.section_code
          )
        HAVING COUNT(*) = 1
    ),
    (
        SELECT MIN(parent.id)
        FROM sections parent
        WHERE parent.type = 'TEO'
          AND parent.period_id = child.period_id
          AND parent.career_id = child.career_id
          AND parent.subject_id = child.subject_id
        HAVING COUNT(*) = 1
    )
)
WHERE child.type <> 'TEO';
