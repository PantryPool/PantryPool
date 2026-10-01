-- Migration 0003: Integer Cents Ledger & Exact Currency Backfill

-- Ensure integer cents columns exist for existing deployments
-- SQLite allows ADD COLUMN with default values
-- Update legacy rows where balance_cents is 0 but balance is non-zero
UPDATE pool_members 
SET balance_cents = CAST(ROUND(balance * 100) AS INTEGER) 
WHERE balance_cents = 0 AND balance != 0;

UPDATE transactions 
SET amount_cents = CAST(ROUND(amount * 100) AS INTEGER) 
WHERE amount_cents = 0 AND amount != 0;

UPDATE items 
SET cost_per_unit_cents = CAST(ROUND(cost_per_unit * 100) AS INTEGER) 
WHERE cost_per_unit_cents = 0 AND cost_per_unit != 0;

UPDATE shopping_items 
SET estimated_cost_cents = CAST(ROUND(estimated_cost * 100) AS INTEGER) 
WHERE estimated_cost_cents = 0 AND estimated_cost != 0;
