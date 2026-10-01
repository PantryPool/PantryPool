-- Migration 0002: Performance Indexes & Query Optimization for D1

CREATE INDEX IF NOT EXISTS idx_pool_members_user ON pool_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pool_members_pool ON pool_members(pool_id);
CREATE INDEX IF NOT EXISTS idx_items_pool ON items(pool_id);
CREATE INDEX IF NOT EXISTS idx_transactions_pool ON transactions(pool_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_reset ON edge_rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS idx_cached_barcodes_expires ON cached_barcodes(expires_at);
CREATE INDEX IF NOT EXISTS idx_pools_org ON pools(organization_id);
