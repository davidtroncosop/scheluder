CREATE TABLE IF NOT EXISTS app_settings (
    career_id TEXT PRIMARY KEY REFERENCES careers(id) ON DELETE CASCADE,
    settings TEXT NOT NULL DEFAULT '{}',
    updated_by TEXT REFERENCES users(id),
    updated_at TEXT DEFAULT (datetime('now'))
);
