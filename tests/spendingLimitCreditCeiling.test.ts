import { describe, it, expect } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';
import { StorageAdapter, StoragePool, StorageItem, StorageTransaction } from '../src/server/storage/types';
import { onRequest } from '../functions/api/[[path]]';

class InMemoryStorageAdapter implements StorageAdapter {
  users: Map<string, any> = new Map();
  pools: Map<string, any> = new Map();
  members: Map<string, any> = new Map();
  items: Map<string, any> = new Map();
  transactions: Map<string, any> = new Map();
  shoppingItems: Map<string, any> = new Map();
  polls: Map<string, any> = new Map();
  notifications: Map<string, any> = new Map();
  webhooks: Map<string, any> = new Map();
  sso: Map<string, any> = new Map();
  settings: Record<string, any> = {};

  async getUserById(id: string) { return this.users.get(id) || null; }
  async getUserByEmail(email: string) {
    return Array.from(this.users.values()).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }
  async createUser(user: any) {
    const u = { ...user, token_version: 1 };
    this.users.set(user.id, u);
    return u;
  }
  async updateUser(id: string, updates: any) {
    const u = this.users.get(id);
    if (u) this.users.set(id, { ...u, ...updates });
  }
  async listUsers() { return Array.from(this.users.values()); }
  async bumpTokenVersion(id: string) {
    const u = this.users.get(id);
    if (u) { u.token_version = (u.token_version || 1) + 1; }
    return u?.token_version || 1;
  }

  async getOrgById(id: string) { return null; }
  async listOrgsByOwner(ownerId: string) { return []; }
  async createOrg(org: any) { return org; }
  async updateOrgTier(id: string, tier: any) {}

  async getPoolById(id: string) { return this.pools.get(id) || null; }
  async listPoolsForUser(userId: string) { return Array.from(this.pools.values()); }
  async createPool(pool: any) { this.pools.set(pool.id, pool); return pool; }
  async updatePool(id: string, updates: any) {
    const p = this.pools.get(id);
    if (p) this.pools.set(id, { ...p, ...updates });
  }
  async deletePool(id: string) { this.pools.delete(id); }
  async getPoolMember(poolId: string, userId: string) { return this.members.get(`${poolId}_${userId}`) || null; }
  async listPoolMembers(poolId: string) { return Array.from(this.members.values()).filter(m => m.pool_id === poolId); }
  async upsertPoolMember(member: any) { this.members.set(`${member.pool_id}_${member.user_id}`, member); }
  async updateMemberRole(poolId: string, userId: string, role: string) {
    const m = this.members.get(`${poolId}_${userId}`);
    if (m) m.role = role;
  }
  async removePoolMember(poolId: string, userId: string) { this.members.delete(`${poolId}_${userId}`); }
  async countPoolsByOrg(orgId: string) { return Array.from(this.pools.values()).filter(p => p.organization_id === orgId).length; }
  async countPersonalPools(userId: string) { return Array.from(this.pools.values()).filter(p => !p.organization_id && p.champion_id === userId).length; }
  async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number) {
    const m = this.members.get(`${poolId}_${userId}`) || { id: 'm1', pool_id: poolId, user_id: userId, balance: 0, balance_cents: 0 };
    m.balance += deltaAmount;
    m.balance_cents += deltaCents;
    this.members.set(`${poolId}_${userId}`, m);
  }

  async getItemById(id: string) { return this.items.get(id) || null; }
  async listItemsByPool(poolId: string) { return Array.from(this.items.values()).filter(i => i.pool_id === poolId); }
  async saveItem(item: any) { this.items.set(item.id, item); return item; }
  async deleteItem(id: string) { this.items.delete(id); }
  async adjustItemStock(id: string, deltaQty: number) {
    const item = this.items.get(id);
    if (item) item.stock = Math.max(0, item.stock + deltaQty);
  }

  async getTransactionById(id: string) { return this.transactions.get(id) || null; }
  async listTransactionsByPool(poolId: string) { return Array.from(this.transactions.values()).filter(t => t.pool_id === poolId); }
  async createTransaction(tx: any) { this.transactions.set(tx.id, tx); return tx; }

  async listShoppingItems(poolId: string) { return []; }
  async createShoppingItem(item: any) { return item; }
  async updateShoppingItemStatus(id: string, poolId: string, purchased: boolean) {}
  async deleteShoppingItem(id: string, poolId: string) {}

  async listPolls(poolId: string) { return []; }
  async createPoll(poll: any) { return poll; }
  async updatePoll(id: string, poolId: string, updates: any) {}
  async deletePoll(id: string, poolId: string) {}

  async listNotifications(userId: string) { return []; }
  async createNotification(notif: any) { return notif; }
  async markNotificationsRead(userId: string, notifId?: string) {}

  async listWebhooks(poolId: string) { return []; }
  async saveWebhook(webhook: any) { return webhook; }
  async deleteWebhook(id: string, poolId: string) {}

  async getSsoConfigByDomain(domain: string) { return null; }
  async getSsoConfigByOrg(orgId: string) { return null; }
  async saveSsoConfig(config: any) { return config; }

  async getSystemSettings() { return this.settings; }
  async saveSystemSettings(s: any) { this.settings = { ...this.settings, ...s }; }
  async getPlatformStats() {
    return {
      totalUsers: this.users.size,
      totalPools: this.pools.size,
      totalTransactions: this.transactions.size,
      totalVolume: 0
    };
  }

  resetTokens: Map<string, any> = new Map();
  async createPasswordResetToken(token: any) { this.resetTokens.set(token.token_hash, token); }
  async getPasswordResetToken(tokenHash: string) { return this.resetTokens.get(tokenHash) || null; }
  async markPasswordResetTokenUsed(id: string) {
    for (const [k, v] of this.resetTokens.entries()) {
      if (v.id === id) {
        this.resetTokens.set(k, { ...v, used: true });
      }
    }
  }

  telemetryEvents: any[] = [];
  async recordTelemetryEvents(events: any[]) { this.telemetryEvents.push(...events); }
  async getTelemetryStats(days = 7) {
    return {
      periodDays: days,
      totalEvents: this.telemetryEvents.length,
      topFeatures: [],
      errorSummary: [],
      funnelBreakdown: [],
      activityByDay: [],
      recentEvents: this.telemetryEvents,
    };
  }

  async getPoolSavingsSummary(poolId: string) {
    return {
      totalSavingsCents: 0,
      totalSavings: 0,
      itemsConsumedCount: 0,
      topSavedItems: []
    };
  }

  async getGlobalSavingsLeaderboard(limit = 20) {
    return {
      pools: [],
      leaderboard: [],
      totalOptedInPools: 0,
      networkTotalSavingsCents: 0,
      networkTotalSavings: 0
    };
  }
}

describe('🛑 Member Credit Limit & Hard Spending Block Enforcement Suite', () => {
  it('enforces default $10.00 credit ceiling on consumption in Universal Hono Server', async () => {
    const storage = new InMemoryStorageAdapter();
    const app = createUniversalApi(storage);

    // 1. Register User
    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bob@example.com', password: 'Password123!', name: 'Bob Deficit' })
    });
    const { token, user } = await regRes.json();

    // 2. Create Pool (default max_deficit = 10.00, 1000 cents)
    const poolRes = await app.request('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: 'Coffee Club', category: 'Office', currency: '$' })
    });
    const { pool } = await poolRes.json();
    expect(pool.max_deficit).toBe(10.00);
    expect(pool.max_deficit_cents).toBe(1000);

    // 3. Create expensive item ($6.00)
    const itemRes = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        poolId: pool.id,
        name: 'Artisan Latte',
        category: 'Coffee',
        stock: 5,
        costPerUnit: 6.00
      })
    });
    const { item } = await itemRes.json();
    expect(item.cost_per_unit).toBe(6.00);

    // 4. First consume: $6.00 item when balance is $0.00 -> prospective -$6.00 is within -$10.00 limit
    const consume1Res = await app.request('/api/items/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ poolId: pool.id, itemId: item.id, quantity: 1 })
    });
    expect(consume1Res.status).toBe(200);
    const consume1Data = await consume1Res.json();
    expect(consume1Data.success).toBe(true);

    // Check member balance is -$6.00
    const member1 = await storage.getPoolMember(pool.id, user.id);
    expect(member1?.balance).toBe(-6.00);
    expect(member1?.balance_cents).toBe(-600);

    // Check item stock decremented to 4
    const itemAfter1 = await storage.getItemById(item.id);
    expect(itemAfter1?.stock).toBe(4);

    // 5. Second consume attempt: another $6.00 item -> prospective -$12.00 would exceed -$10.00 limit!
    const consume2Res = await app.request('/api/items/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ poolId: pool.id, itemId: item.id, quantity: 1 })
    });
    expect(consume2Res.status).toBe(403);
    const consume2Data = await consume2Res.json();
    expect(consume2Data.success).toBe(false);
    expect(consume2Data.spendingBlocked).toBe(true);
    expect(consume2Data.error).toContain('Spending limit reached');
    expect(consume2Data.error).toContain('credit ceiling');

    // Verify item stock was NOT decremented and member balance was NOT changed
    const itemAfter2 = await storage.getItemById(item.id);
    expect(itemAfter2?.stock).toBe(4);
    const memberAfter2 = await storage.getPoolMember(pool.id, user.id);
    expect(memberAfter2?.balance).toBe(-6.00);

    // 6. Admin increases credit ceiling to $20.00
    const updatePoolRes = await app.request(`/api/pools/${pool.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ maxDeficit: 20.00 })
    });
    expect(updatePoolRes.status).toBe(200);

    // 7. Now second consume attempt should succeed!
    const consume3Res = await app.request('/api/items/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ poolId: pool.id, itemId: item.id, quantity: 1 })
    });
    expect(consume3Res.status).toBe(200);
    const consume3Data = await consume3Res.json();
    expect(consume3Data.success).toBe(true);

    const memberAfter3 = await storage.getPoolMember(pool.id, user.id);
    expect(memberAfter3?.balance).toBe(-12.00);
    const itemAfter3 = await storage.getItemById(item.id);
    expect(itemAfter3?.stock).toBe(3);
  });

  it('enforces strict pre-paid mode when maxDeficit is set to 0.00', async () => {
    const storage = new InMemoryStorageAdapter();
    const app = createUniversalApi(storage);

    // 1. Register User
    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'prepaid@example.com', password: 'Password123!', name: 'Prepaid User' })
    });
    const { token, user } = await regRes.json();

    // 2. Create Pool with maxDeficit = 0 (Strict Pre-Paid)
    const poolRes = await app.request('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: 'Strict Pre-Paid Pool', category: 'Office', currency: '$', maxDeficit: 0 })
    });
    const { pool } = await poolRes.json();
    expect(pool.max_deficit).toBe(0);
    expect(pool.max_deficit_cents).toBe(0);

    // 3. Create Item ($2.50)
    const itemRes = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        poolId: pool.id,
        name: 'Sparkling Water',
        category: 'Drinks',
        stock: 10,
        costPerUnit: 2.50
      })
    });
    const { item } = await itemRes.json();

    // 4. Attempt consume with 0 balance -> should be blocked immediately
    const consumeRes = await app.request('/api/items/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ poolId: pool.id, itemId: item.id, quantity: 1 })
    });
    expect(consumeRes.status).toBe(403);
    const consumeData = await consumeRes.json();
    expect(consumeData.success).toBe(false);
    expect(consumeData.spendingBlocked).toBe(true);
    expect(consumeData.error).toContain('pre-paid mode');

    // Verify stock remains untouched at 10
    const itemCheck = await storage.getItemById(item.id);
    expect(itemCheck?.stock).toBe(10);
  });

  it('Cloudflare edge items consume route blocks breach of credit ceiling', async () => {
    // Mock D1 DB
    let poolRecord: any = {
      id: 'pool_cf_1',
      name: 'Edge Pool',
      currency: '$',
      max_deficit: 10.00,
      max_deficit_cents: 1000
    };
    let itemRecord: any = {
      id: 'item_cf_1',
      pool_id: 'pool_cf_1',
      name: 'Energy Drink',
      cost_per_unit: 4.00,
      cost_per_unit_cents: 400,
      stock: 5
    };
    let memberRecord: any = {
      id: 'pm_cf_1',
      pool_id: 'pool_cf_1',
      user_id: 'u_cf_1',
      balance: -8.00,
      balance_cents: -800,
      role: 'member'
    };

    const mockDb = {
      prepare: (query: string) => ({
        bind: (...params: any[]) => ({
          first: async () => {
            if (query.includes('FROM pools WHERE id = ?')) return poolRecord;
            if (query.includes('FROM items WHERE id = ?')) return itemRecord;
            if (query.includes('FROM pool_members WHERE pool_id = ? AND user_id = ?')) return memberRecord;
            return null;
          },
          all: async () => ({ results: [], success: true, meta: {} }),
          run: async () => ({ success: true, results: [], meta: {} })
        })
      })
    };

    const mockEnv = {
      pantrypool_db: mockDb as any,
      JWT_SECRET: 'test-cf-secret-1234'
    };

    const cfToken = await createUniversalToken({
      userId: 'u_cf_1',
      email: 'user@cf.com',
      name: 'CF User',
      systemRole: 'user',
      tokenVersion: 1
    }, mockEnv.JWT_SECRET);

    // User is at -8.00 (-800 cents). Consuming $4.00 item brings deficit to -12.00 (-1200 cents),
    // which exceeds pool ceiling of 10.00 (1000 cents).
    const request = new Request('https://pantrypool.com/api/items/consume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfToken}`
      },
      body: JSON.stringify({
        poolId: 'pool_cf_1',
        itemId: 'item_cf_1',
        userId: 'u_cf_1',
        quantity: 1
      })
    });

    const response = await onRequest({ request, env: mockEnv } as any);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.spendingBlocked).toBe(true);
    expect(body.error).toContain('Spending limit reached');
  });
});
