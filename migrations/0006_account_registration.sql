ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'
    CHECK(account_status IN ('pending', 'active', 'disabled'));

UPDATE users
SET account_status = CASE WHEN is_active = 1 THEN 'active' ELSE 'disabled' END;

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
