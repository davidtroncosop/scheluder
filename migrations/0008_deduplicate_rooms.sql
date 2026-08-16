-- Consolidate rooms that differ only by case or surrounding whitespace.
-- The canonical room is the one already referenced by the schedule, falling
-- back to the oldest record. Existing assignment references are preserved.

CREATE TABLE _room_dedup_map_0008 (
    duplicate_id TEXT PRIMARY KEY,
    canonical_id TEXT NOT NULL
);

INSERT INTO _room_dedup_map_0008 (duplicate_id, canonical_id)
SELECT id, canonical_id
FROM (
    SELECT
        r.id,
        FIRST_VALUE(r.id) OVER (
            PARTITION BY
                lower(trim(r.name)),
                lower(trim(COALESCE(r.building, ''))),
                COALESCE(r.career_id, '')
            ORDER BY
                CASE WHEN EXISTS (
                    SELECT 1 FROM schedule_assignments sa WHERE sa.room_id = r.id
                ) THEN 0 ELSE 1 END,
                r.created_at,
                r.id
        ) AS canonical_id
    FROM rooms r
    WHERE r.is_active = 1
)
WHERE id <> canonical_id;

UPDATE schedule_assignments
SET room_id = (
    SELECT canonical_id
    FROM _room_dedup_map_0008
    WHERE duplicate_id = schedule_assignments.room_id
)
WHERE room_id IN (SELECT duplicate_id FROM _room_dedup_map_0008);

INSERT INTO audit_log (
    id, action, entity_type, entity_id, old_value, new_value, created_at
)
SELECT
    lower(hex(randomblob(16))),
    'MERGE',
    'room',
    duplicate_id,
    json_object('duplicate_id', duplicate_id),
    json_object('canonical_id', canonical_id),
    datetime('now')
FROM _room_dedup_map_0008;

UPDATE rooms
SET is_active = 0, updated_at = datetime('now')
WHERE id IN (SELECT duplicate_id FROM _room_dedup_map_0008);

DROP TABLE _room_dedup_map_0008;

-- Prevent repeated imports from recreating the same active physical room.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_active_identity
ON rooms (
    lower(trim(name)),
    lower(trim(COALESCE(building, ''))),
    COALESCE(career_id, '')
)
WHERE is_active = 1;
