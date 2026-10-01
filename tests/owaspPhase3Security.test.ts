import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';
import { sanitizeLlmReceiptOutput } from '../src/server/api/routes/ai';
import { StorageAdapter } from '../src/server/storage/types';

class MockPhase3Storage implements Partial<StorageAdapter> {
  pools: Map<string, any> = new Map();
  members: Map<string, any> = new Map();
  items: Map<string, any> = new Map();
  transactions: any[] = [];
  users: Map<string, any> = new Map();

  failBalanceAdjustment = false;
  failTransactionCreation = false;

  async getPoolById(id: string) { return this.pools.get(id) || null; }
  async listPoolsForUser(userId: string) { return Array.from(this.pools.values()); }
  async getPoolMember(poolId: string, userId: string) { return this.members.get(`${poolId}_${userId}`) || null; }
  async getUserById(id: string) { return this.users.get(id) || null; }
  async getItemById(id: string) { return this.items.get(id) || null; }

  async adjustItemStock(id: string, delta: number) {
    const item = this.items.get(id);
    if (!item) throw new Error('Item not found');
    item.stock = (item.stock || 0) + delta;
    return item;
  }

  async adjustMemberBalance(poolId: string, userId: string, delta: number, deltaCents: number) {
    if (this.failBalanceAdjustment) {
      throw new Error('Database error during adjustMemberBalance');
    }
    const member = this.members.get(`${poolId}_${userId}`);
    if (!member) throw new Error('Member not found');
    member.balance = (member.balance || 0) + delta;
    member.balance_cents = (member.balance_cents || 0) + deltaCents;
    return member;
  }

  async createTransaction(tx: any) {
    if (this.failTransactionCreation) {
      throw new Error('Database error during createTransaction');
    }
    this.transactions.push(tx);
    return tx;
  }
}

describe('🔒 OWASP Top 10 (2025) Phase 3 Security Suite', () => {
  const JWT_SECRET = 'owasp-phase3-secret-key-32chars!!';
  let app: ReturnType<typeof createUniversalApi>;
  let storage: MockPhase3Storage;
  let userToken: string;

  beforeEach(async () => {
    storage = new MockPhase3Storage();
    storage.pools.set('pool_breakroom', {
      id: 'pool_breakroom',
      name: 'Breakroom Pool',
      champion_id: 'u_champion',
      max_deficit_cents: 5000
    });

    storage.members.set('pool_breakroom_u_alice', {
      id: 'pm_alice',
      pool_id: 'pool_breakroom',
      user_id: 'u_alice',
      role: 'member',
      balance: 20.00,
      balance_cents: 2000
    });

    storage.items.set('item_coke', {
      id: 'item_coke',
      pool_id: 'pool_breakroom',
      name: 'Diet Coke',
      cost_per_unit: 1.50,
      cost_per_unit_cents: 150,
      stock: 10
    });

    app = createUniversalApi(storage as any, JWT_SECRET);

    userToken = await createUniversalToken({
      userId: 'u_alice',
      email: 'alice@example.com',
      name: 'Alice',
      systemRole: 'user',
      tokenVersion: 1
    }, JWT_SECRET);
  });

  describe('SEC-A05-02: Receipt OCR Upload Size Limiting', () => {
    it('rejects imageBase64 payloads exceeding 7MB with HTTP 413', async () => {
      // 7 * 1024 * 1024 + 10 bytes
      const giantBase64 = 'A'.repeat(7 * 1024 * 1024 + 10);
      const res = await app.request('/api/parse-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageBase64: giantBase64
        })
      });

      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('exceeds 5MB size limit');
    });

    it('processes reasonably sized image payloads without 413 error', async () => {
      const normalBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const res = await app.request('/api/parse-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageBase64: normalBase64
        })
      });

      // Status should be 200 (fallback items in test environment)
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
    });
  });

  describe('SEC-A05-01: LLM Schema Validation & Numeric Bounding', () => {
    it('sanitizes and clamps quantities, prices, categories, and UPC codes', () => {
      const rawLlmOutput = {
        storeName: '   Supermarket Express '.repeat(10),
        date: '2026-05-12T10:00:00Z',
        subtotal: 9999999,
        taxAmount: -50,
        totalAmount: 9999999,
        items: [
          {
            name: 'Dangerous <script> Injection Item',
            category: 'MaliciousCategory',
            quantity: -5,
            costPerUnit: -10,
            totalCost: -50,
            isTaxed: true,
            upc: 'INVALID_NON_DIGIT_UPC'
          },
          {
            name: 'Extreme Quantity Item',
            category: 'Beverages',
            quantity: 999999,
            costPerUnit: 120000,
            totalCost: 99999999,
            upc: '012345678905'
          }
        ]
      };

      const sanitized = sanitizeLlmReceiptOutput(rawLlmOutput);

      // Store name capped at 100 chars
      expect(sanitized.storeName.length).toBeLessThanOrEqual(100);
      expect(sanitized.date).toBe('2026-05-12');
      // Subtotal and total bounded
      expect(sanitized.subtotal).toBeLessThanOrEqual(50000);
      expect(sanitized.taxAmount).toBe(0); // negative tax clamped to 0

      // Item 1 bounds & normalization
      const item1 = sanitized.items[0];
      expect(item1.quantity).toBe(1); // negative clamped to 1
      expect(item1.costPerUnit).toBe(0); // negative clamped to 0
      expect(item1.totalCost).toBe(0);
      expect(item1.category).toBe('Snacks'); // invalid category defaulted to 'Snacks'
      expect(item1.upc).toBeNull(); // invalid UPC set to null

      // Item 2 bounds
      const item2 = sanitized.items[1];
      expect(item2.quantity).toBe(500); // capped to max 500
      expect(item2.costPerUnit).toBe(10000); // capped to max 10000
      expect(item2.totalCost).toBe(50000); // capped to max 50000
      expect(item2.upc).toBe('012345678905'); // valid UPC preserved
    });

    it('caps item count at 100 items', () => {
      const hugeItemList = Array.from({ length: 250 }, (_, i) => ({
        name: `Item ${i}`,
        quantity: 1,
        costPerUnit: 1.00
      }));

      const sanitized = sanitizeLlmReceiptOutput({ items: hugeItemList });
      expect(sanitized.items.length).toBe(100);
    });
  });

  describe('SEC-A10-01: Production OCR Fail-Closed Guard', () => {
    it('returns HTTP 503 instead of synthetic items in production when OCR is unavailable', async () => {
      const prodApp = createUniversalApi(storage as any, JWT_SECRET);
      const res = await prodApp.request('/api/parse-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        })
      }, {
        ENVIRONMENT: 'production'
      });

      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Receipt OCR service is temporarily unavailable');
      expect(data.items).toBeUndefined();
    });
  });

  describe('SEC-A06-01: Compensating Ledger Rollback on Consumption Failure', () => {
    it('successfully consumes item and updates stock and balance when no errors occur', async () => {
      const res = await app.request('/api/items/consume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          itemId: 'item_coke',
          poolId: 'pool_breakroom',
          quantity: 2
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const coke = storage.items.get('item_coke');
      expect(coke.stock).toBe(8); // 10 - 2

      const member = storage.members.get('pool_breakroom_u_alice');
      expect(member.balance_cents).toBe(1700); // 2000 - (2 * 150)
      expect(storage.transactions.length).toBe(1);
    });

    it('rolls back stock decrement if member balance adjustment fails', async () => {
      storage.failBalanceAdjustment = true;

      const res = await app.request('/api/items/consume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          itemId: 'item_coke',
          poolId: 'pool_breakroom',
          quantity: 2
        })
      });

      expect(res.status).toBe(500);

      // Stock must be rolled back to 10
      const coke = storage.items.get('item_coke');
      expect(coke.stock).toBe(10);

      // No transaction created
      expect(storage.transactions.length).toBe(0);
    });

    it('rolls back stock decrement and balance adjustment if transaction creation fails', async () => {
      storage.failTransactionCreation = true;

      const res = await app.request('/api/items/consume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          itemId: 'item_coke',
          poolId: 'pool_breakroom',
          quantity: 2
        })
      });

      expect(res.status).toBe(500);

      // Stock must be rolled back to 10
      const coke = storage.items.get('item_coke');
      expect(coke.stock).toBe(10);

      // Balance must be rolled back to original 2000 cents
      const member = storage.members.get('pool_breakroom_u_alice');
      expect(member.balance_cents).toBe(2000);

      // No transaction created
      expect(storage.transactions.length).toBe(0);
    });
  });
});
