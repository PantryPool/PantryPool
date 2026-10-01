-- Migration 0008: Add vending machine benchmark pricing, pool savings toggles, and cross-pool leaderboard
ALTER TABLE pools ADD COLUMN savings_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pools ADD COLUMN savings_leaderboard_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pools ADD COLUMN leaderboard_alias TEXT;
ALTER TABLE pools ADD COLUMN metro_tier TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE items ADD COLUMN vending_benchmark_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE transactions ADD COLUMN savings_cents INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_transactions_pool_savings ON transactions(pool_id, savings_cents);
