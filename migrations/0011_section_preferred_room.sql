-- =============================================
-- Migration: 0011_section_preferred_room.sql
-- Add preferred_room_id column to sections table
-- =============================================

ALTER TABLE sections ADD COLUMN preferred_room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sections_preferred_room ON sections(preferred_room_id);
