-- Migration 0010: Add archive audit status columns to users, organizations, and pools
ALTER TABLE users ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN archived_at DATETIME;

ALTER TABLE organizations ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN archived_at DATETIME;

ALTER TABLE pools ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pools ADD COLUMN archived_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_users_archived ON users(is_archived);
CREATE INDEX IF NOT EXISTS idx_organizations_archived ON organizations(is_archived);
CREATE INDEX IF NOT EXISTS idx_pools_archived ON pools(is_archived);
