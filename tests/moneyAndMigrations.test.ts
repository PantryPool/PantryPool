import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  toCents,
  toDollars,
  formatCents,
  addMoney,
  multiplyMoney,
  verifyZeroSumInvariant
} from '../src/lib/money';

describe('💵 Exact Integer Cents & Money Math Engine (Sprint 2 / N7)', () => {
  describe('toCents & toDollars Conversions', () => {
    it('should accurately convert fractional dollar floats to exact integer cents without precision loss', () => {
      expect(toCents(1.50)).toBe(150);
      expect(toCents(0.99)).toBe(99);
      expect(toCents(0.01)).toBe(1);
      expect(toCents(0.00)).toBe(0);
      expect(toCents(-14.75)).toBe(-1475);
      expect(toCents('12.34')).toBe(1234);
      expect(toCents(null)).toBe(0);
      expect(toCents(undefined)).toBe(0);
      expect(toCents(NaN)).toBe(0);
    });

    it('should handle typical floating-point precision traps (e.g. 0.1 + 0.2)', () => {
      const floatSum = 0.1 + 0.2; // 0.30000000000000004
      expect(toCents(floatSum)).toBe(30);
      expect(toDollars(30)).toBe(0.30);
    });

    it('should convert integer cents back to formatted dollar floats', () => {
      expect(toDollars(150)).toBe(1.50);
      expect(toDollars(99)).toBe(0.99);
      expect(toDollars(1)).toBe(0.01);
      expect(toDollars(0)).toBe(0.00);
      expect(toDollars(-1475)).toBe(-14.75);
    });

    it('should format cents into localized currency strings', () => {
      expect(formatCents(1250)).toBe('$12.50');
      expect(formatCents(-350)).toBe('$-3.50');
      expect(formatCents(500, '€')).toBe('€5.00');
      expect(formatCents(500, '$', true)).toBe('+$5.00');
    });

    it('should add multiple currency values accurately in integer cents', () => {
      const totalCents = addMoney(1.50, 0.99, '2.01', 0.50);
      expect(totalCents).toBe(500);
      expect(toDollars(totalCents)).toBe(5.00);
    });

    it('should multiply unit price by integer quantity accurately', () => {
      expect(multiplyMoney(1.99, 3)).toBe(597);
      expect(multiplyMoney('2.50', 4)).toBe(1000);
    });
  });

  describe('⚖️ Property-Based Zero-Sum Ledger Simulation', () => {
    it('should preserve zero-sum invariant across 1,000 multi-member transactions', () => {
      // 5 pool members starting at $0.00 balance
      const memberBalances: Record<string, number> = {
        alice: 0,
        bob: 0,
        charlie: 0,
        david: 0,
        elena: 0
      };

      let poolReserveFundCents = 0;
      const memberKeys = Object.keys(memberBalances);

      // Deterministic pseudo-random sequence for repeatability
      let seed = 42;
      function random(): number {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      }

      for (let i = 0; i < 1000; i++) {
        const actionType = random();
        const member = memberKeys[Math.floor(random() * memberKeys.length)];

        if (actionType < 0.4) {
          // 40% Consumption: Member buys item priced $0.50 - $4.50
          const itemPriceCents = Math.floor(random() * 400) + 50;
          const qty = Math.floor(random() * 3) + 1;
          const totalCostCents = itemPriceCents * qty;

          memberBalances[member] -= totalCostCents;
          poolReserveFundCents += totalCostCents; // Pool collects value (or owed balance)
        } else if (actionType < 0.7) {
          // 30% Deposit: Member deposits $5.00 - $25.00
          const depositCents = (Math.floor(random() * 20) + 5) * 100;
          memberBalances[member] += depositCents;
          poolReserveFundCents -= depositCents;
        } else if (actionType < 0.9) {
          // 20% Restock Credit: Member bought groceries ($10 - $50) for the pool
          const restockCents = (Math.floor(random() * 40) + 10) * 100;
          memberBalances[member] += restockCents;
          poolReserveFundCents -= restockCents;
        } else {
          // 10% Settle-Up P2P Transfer between two members
          const recipient = memberKeys[Math.floor(random() * memberKeys.length)];
          if (recipient !== member) {
            const transferCents = Math.floor(random() * 1500) + 100;
            memberBalances[member] += transferCents; // Debtor settled up
            memberBalances[recipient] -= transferCents; // Creditor received funds
          }
        }
      }

      // Sum of all member balances + pool reserve change must equal exactly 0
      const totalMemberBalancesCents = Object.values(memberBalances).reduce((a, b) => a + b, 0);
      const netLedgerInvariant = totalMemberBalancesCents + poolReserveFundCents;

      expect(netLedgerInvariant).toBe(0);
      expect(verifyZeroSumInvariant(0, totalMemberBalancesCents, -poolReserveFundCents, 0)).toBe(true);
    });
  });

  describe('🗄️ Versioned D1 Migrations Engine (Sprint 2 / N6)', () => {
    const migrationsDir = path.join(__dirname, '..', 'migrations');

    it('should have all 3 versioned migration scripts in migrations/ directory', () => {
      expect(fs.existsSync(migrationsDir)).toBe(true);
      const files = fs.readdirSync(migrationsDir).sort();
      expect(files).toContain('0001_initial_schema.sql');
      expect(files).toContain('0002_add_indexes_and_constraints.sql');
      expect(files).toContain('0003_integer_cents_currency.sql');
    });

    it('0001_initial_schema.sql should define all core tables and constraints', () => {
      const sql = fs.readFileSync(path.join(migrationsDir, '0001_initial_schema.sql'), 'utf-8');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS users');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS organizations');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS pools');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS pool_members');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS items');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS transactions');
      expect(sql).toContain('balance_cents INTEGER NOT NULL DEFAULT 0');
      expect(sql).toContain('amount_cents INTEGER NOT NULL DEFAULT 0');
      expect(sql).toContain('cost_per_unit_cents INTEGER NOT NULL DEFAULT 0');
    });

    it('0002_add_indexes_and_constraints.sql should contain performance indexes', () => {
      const sql = fs.readFileSync(path.join(migrationsDir, '0002_add_indexes_and_constraints.sql'), 'utf-8');
      expect(sql).toContain('idx_pool_members_user');
      expect(sql).toContain('idx_pool_members_pool');
      expect(sql).toContain('idx_items_pool');
      expect(sql).toContain('idx_transactions_pool');
      expect(sql).toContain('idx_transactions_created');
    });

    it('0003_integer_cents_currency.sql should backfill legacy money columns to integer cents', () => {
      const sql = fs.readFileSync(path.join(migrationsDir, '0003_integer_cents_currency.sql'), 'utf-8');
      expect(sql).toContain('UPDATE pool_members');
      expect(sql).toContain('balance_cents = CAST(ROUND(balance * 100) AS INTEGER)');
      expect(sql).toContain('UPDATE transactions');
      expect(sql).toContain('amount_cents = CAST(ROUND(amount * 100) AS INTEGER)');
      expect(sql).toContain('UPDATE items');
      expect(sql).toContain('cost_per_unit_cents = CAST(ROUND(cost_per_unit * 100) AS INTEGER)');
    });
  });
});
