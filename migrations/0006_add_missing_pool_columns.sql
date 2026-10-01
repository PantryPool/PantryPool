-- Migration 0006: Add missing champion_id, deficit, and reserve columns to pools
ALTER TABLE pools ADD COLUMN champion_id TEXT;
ALTER TABLE pools ADD COLUMN max_deficit REAL DEFAULT 10.00;
ALTER TABLE pools ADD COLUMN max_deficit_cents INTEGER DEFAULT 1000;
ALTER TABLE pools ADD COLUMN initial_reserve_fund REAL DEFAULT 0.00;
ALTER TABLE pools ADD COLUMN initial_reserve_fund_cents INTEGER DEFAULT 0;
