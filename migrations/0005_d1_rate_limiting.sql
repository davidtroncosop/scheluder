CREATE TABLE IF NOT EXISTS rate_limit_counters (
    key_hash TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (key_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expiry
    ON rate_limit_counters(expires_at);
