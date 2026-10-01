import { describe, it, expect, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';
import { StorageAdapter } from '../src/server/storage/types';

class MockSecurityStorage implements Partial<StorageAdapter> {
  pools: Map<string, any> = new Map();
  members: Map<string, any> = new Map();
  items: Map<string, any> = new Map();
  transactions: Map<string, any> = new Map();
  users: Map<string, any> = new Map();

  async getPoolById(id: string) { return this.pools.get(id) || null; }
  async getPoolMember(poolId: string, userId: string) { return this.members.get(`${poolId}_${userId}`) || null; }
  async upsertPoolMember(m: any) { this.members.set(`${m.pool_id}_${m.user_id}`, m); }
  async adjustMemberBalance(poolId: string, userId: string, amount: number, amountCents: number) {
    const m = this.members.get(`${poolId}_${userId}`) || { pool_id: poolId, user_id: userId, balance: 0, balance_cents: 0 };
    m.balance = (m.balance || 0) + amount;
    m.balance_cents = (m.balance_cents || 0) + amountCents;
    this.members.set(`${poolId}_${userId}`, m);
  }
  async getItemById(id: string) { return this.items.get(id) || null; }
  async saveItem(item: any) { this.items.set(item.id, item); return item; }
  async adjustItemStock(id: string, delta: number) {
    const item = this.items.get(id);
    if (item) item.stock = (item.stock || 0) + delta;
  }
  async deleteItem(id: string) { this.items.delete(id); }
  async createTransaction(tx: any) { this.transactions.set(tx.id, tx); return tx; }
  async getTransactionById(id: string) { return this.transactions.get(id) || null; }
  async getUserById(id: string) { return this.users.get(id) || null; }
}

describe('🔒 OWASP Top 10 (2025) Phase 1 Security Suite', () => {
  const JWT_SECRET = 'owasp-phase1-secret-test-key-32chars!';
  let app: ReturnType<typeof createUniversalApi>;
  let storage: MockSecurityStorage;
  let aliceToken: string;
  let bobToken: string;

  beforeEach(async () => {
    storage = new MockSecurityStorage();
    storage.pools.set('pool1', {
      id: 'pool1',
      name: 'Main Pantry',
      champion_id: 'u_champion',
      max_deficit_cents: 1000
    });
    storage.items.set('item1', {
      id: 'item1',
      pool_id: 'pool1',
      name: 'Oat Milk',
      stock: 10,
      cost_per_unit: 3.00,
      cost_per_unit_cents: 300
    });
    storage.members.set('pool1_u_alice', {
      id: 'pm_alice',
      pool_id: 'pool1',
      user_id: 'u_alice',
      role: 'member',
      balance: 10.00,
      balance_cents: 1000
    });
    storage.members.set('pool1_u_bob', {
      id: 'pm_bob',
      pool_id: 'pool1',
      user_id: 'u_bob',
      role: 'member',
      balance: 10.00,
      balance_cents: 1000
    });

    app = createUniversalApi(storage as any, JWT_SECRET);

    aliceToken = await createUniversalToken({
      userId: 'u_alice',
      email: 'alice@example.com',
      name: 'Alice',
      systemRole: 'user',
      tokenVersion: 1
    }, JWT_SECRET);

    bobToken = await createUniversalToken({
      userId: 'u_bob',
      email: 'bob@example.com',
      name: 'Bob',
      systemRole: 'user',
      tokenVersion: 1
    }, JWT_SECRET);
  });

  describe('SEC-A01-01: Item Consumption Access Control & Spoofing Prevention', () => {
    it('rejects unauthenticated consume requests with 401', async () => {
      const res = await app.request('/api/items/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: 'pool1', itemId: 'item1', quantity: 1, userId: 'u_alice' })
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Authentication required');
    });

    it('ignores client-supplied userId and always charges the token authenticated user', async () => {
      // Alice tries to specify Bob as userId
      const res = await app.request('/api/items/consume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({
          poolId: 'pool1',
          itemId: 'item1',
          quantity: 1,
          userId: 'u_bob' // Attacker attempt to charge Bob
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify Alice was charged, NOT Bob
      const alice = await storage.getPoolMember('pool1', 'u_alice');
      const bob = await storage.getPoolMember('pool1', 'u_bob');
      expect(alice?.balance).toBe(7.00); // 10.00 - 3.00
      expect(bob?.balance).toBe(10.00); // untouched!
    });
  });

  describe('SEC-A01-02: Ledger Deposit Authorization & Attribution', () => {
    it('rejects unauthenticated deposit requests with 401', async () => {
      const res = await app.request('/api/transactions/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: 'pool1', amount: 50, userId: 'u_alice' })
      });
      expect(res.status).toBe(401);
    });

    it('forbids a regular member from depositing to another member balance', async () => {
      const res = await app.request('/api/transactions/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ poolId: 'pool1', amount: 50, userId: 'u_bob' })
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('cannot credit balances for other members');
    });

    it('allows a member to deposit to their own balance', async () => {
      const res = await app.request('/api/transactions/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ poolId: 'pool1', amount: 25 })
      });
      expect(res.status).toBe(200);
      const alice = await storage.getPoolMember('pool1', 'u_alice');
      expect(alice?.balance).toBe(35.00);
    });
  });

  describe('SEC-A01-03: Pantry Item Mutations Require Authentication', () => {
    it('rejects unauthenticated POST /api/items with 401', async () => {
      const res = await app.request('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: 'pool1', name: 'Malicious Item' })
      });
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated PUT /api/items/:id with 401', async () => {
      const res = await app.request('/api/items/item1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Tampered Name' })
      });
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated DELETE /api/items/:id with 401', async () => {
      const res = await app.request('/api/items/item1', {
        method: 'DELETE'
      });
      expect(res.status).toBe(401);
    });
  });

  describe('SEC-A01-04: Shopping Polls checkPoolAccess Fails Closed', () => {
    it('rejects unauthenticated shopping list access with 403', async () => {
      const res = await app.request('/api/pools/pool1/shopping-list');
      expect(res.status).toBe(403);
    });
  });



  describe('SEC-A08-02: Offline Batch Sync Action Replay & User Spoofing', () => {
    it('rejects unauthenticated offline batch sync with 401', async () => {
      const res = await app.request('/api/sync/offline-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions: [
            { id: 'act_1', action: 'consume_item', payload: { poolId: 'pool1', itemId: 'item1', userId: 'u_alice', quantity: 1 } }
          ]
        })
      });
      expect(res.status).toBe(401);
    });

    it('binds offline consume action strictly to the authenticated user token', async () => {
      const res = await app.request('/api/sync/offline-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({
          actions: [
            { id: 'act_spoof', action: 'consume_item', payload: { poolId: 'pool1', itemId: 'item1', userId: 'u_bob', quantity: 1 } }
          ]
        })
      });
      expect(res.status).toBe(200);

      // Verify Alice was charged, NOT Bob
      const alice = await storage.getPoolMember('pool1', 'u_alice');
      const bob = await storage.getPoolMember('pool1', 'u_bob');
      expect(alice?.balance).toBe(7.00);
      expect(bob?.balance).toBe(10.00);
    });
  });
});
