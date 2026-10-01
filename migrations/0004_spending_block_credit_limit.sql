-- Migration 0004: Configurable Credit Limit & Hard Spending Block
-- Adds max_deficit and max_deficit_cents to pools table to prevent unbounded negative member balances
ALTER TABLE pools ADD COLUMN max_deficit REAL DEFAULT 10.00;
ALTER TABLE pools ADD COLUMN max_deficit_cents INTEGER DEFAULT 1000;
