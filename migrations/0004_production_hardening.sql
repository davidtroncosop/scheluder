ALTER TABLE conflicts ADD COLUMN resolution_type TEXT CHECK(resolution_type IN ('automatic', 'accepted'));
ALTER TABLE conflicts ADD COLUMN resolution_justification TEXT;

CREATE TABLE IF NOT EXISTS schedule_statuses (
    career_id TEXT NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
    period_id TEXT NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('draft', 'review', 'published')) DEFAULT 'draft',
    updated_by TEXT REFERENCES users(id),
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (career_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_status_period ON schedule_statuses(period_id);
