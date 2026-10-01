import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';
import { StorageAdapter, TelemetryStats } from '../src/server/storage/types';
import { MySqlStorageAdapter } from '../src/server/storage/mysqlAdapter';
import { D1StorageAdapter } from '../src/server/storage/d1Adapter';

class MockSecurityStorageAdapter implements StorageAdapter {
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
  async bumpTokenVersion(id: string) { return 1; }
  async deleteUser(id: string, options?: any) {
    if (options?.hardDelete || options?.gdpr) {
      this.users.delete(id);
    } else {
      const u = this.users.get(id);
      if (u) this.users.set(id, { ...u, is_archived: 1, archived_at: new Date().toISOString() });
    }
  }
  async archiveUser(id: string) { await this.deleteUser(id, { hardDelete: false }); }
  async restoreUser(id: string) {
    const u = this.users.get(id);
    if (u) this.users.set(id, { ...u, is_archived: 0, archived_at: null });
  }

  async createPasswordResetToken() {}
  async getPasswordResetToken() { return null; }
  async markPasswordResetTokenUsed() {}

  async getOrgById(id: string) { return null; }
  async getOrgByStripeCustomerId(customerId: string) { return null; }
  async listOrgsByOwner(ownerId: string) { return []; }
  async listAllOrgsForAdmin() { return []; }
  async createOrg(org: any) { return org; }
  async updateOrgTier(id: string, tier: any) {}
  async deleteOrg(id: string, options?: any) {
    if (options?.hardDelete || options?.gdpr) {
      // noop
    }
  }
  async archiveOrg(id: string) {}
  async restoreOrg(id: string) {}

  async getPoolById(id: string) { return this.pools.get(id) || null; }
  async listPoolsForUser(userId: string) { return Array.from(this.pools.values()).filter(p => !p.is_archived); }
  async listAllPoolsForAdmin() { return Array.from(this.pools.values()); }
  async createPool(pool: any) { this.pools.set(pool.id, pool); return pool; }
  async updatePool(id: string, updates: any) {
    const p = this.pools.get(id);
    if (p) this.pools.set(id, { ...p, ...updates });
  }
  async deletePool(id: string, options?: any) {
    if (options?.hardDelete || options?.gdpr) {
      this.pools.delete(id);
    } else {
      const p = this.pools.get(id);
      if (p) this.pools.set(id, { ...p, is_archived: 1, archived_at: new Date().toISOString() });
    }
  }
  async archivePool(id: string) { await this.deletePool(id, { hardDelete: false }); }
  async restorePool(id: string) {
    const p = this.pools.get(id);
    if (p) this.pools.set(id, { ...p, is_archived: 0, archived_at: null });
  }
  async getPoolMember(poolId: string, userId: string) { return this.members.get(`${poolId}_${userId}`) || null; }
  async listPoolMembers(poolId: string) { return Array.from(this.members.values()).filter(m => m.pool_id === poolId); }
  async upsertPoolMember(member: any) { this.members.set(`${member.pool_id}_${member.user_id}`, member); }
  async updateMemberRole(poolId: string, userId: string, role: string) {
    const m = this.members.get(`${poolId}_${userId}`);
    if (m) m.role = role;
  }
  async removePoolMember(poolId: string, userId: string) {
    this.members.delete(`${poolId}_${userId}`);
  }
  async countPoolsByOrg(orgId: string) { return 0; }
  async countPersonalPools(userId: string) { return 0; }
  async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number) {
    const m = this.members.get(`${poolId}_${userId}`);
    if (m) {
      m.balance = (m.balance || 0) + deltaAmount;
      m.balance_cents = (m.balance_cents || 0) + deltaCents;
    }
  }

  async getItemById(id: string) { return this.items.get(id) || null; }
  async listItemsByPool(poolId: string) { return Array.from(this.items.values()).filter(i => i.pool_id === poolId); }
  async searchItems(query: string) { return Array.from(this.items.values()); }
  async saveItem(item: any) { this.items.set(item.id, item); return item; }
  async deleteItem(id: string) { this.items.delete(id); }
  async adjustItemStock(id: string, deltaQty: number) {
    const item = this.items.get(id);
    if (item) item.stock = (item.stock || 0) + deltaQty;
  }

  async getTransactionById(id: string) { return this.transactions.get(id) || null; }
  async listTransactionsByPool(poolId: string) { return Array.from(this.transactions.values()).filter(t => t.pool_id === poolId); }
  async createTransaction(tx: any) { this.transactions.set(tx.id, tx); return tx; }

  async listShoppingItems(poolId: string) { return []; }
  async createShoppingItem(item: any) { return item; }
  async updateShoppingItemStatus() {}
  async deleteShoppingItem() {}

  async listPolls(poolId: string) { return Array.from(this.polls.values()).filter(p => p.pool_id === poolId); }
  async getPollById(id: string) { return this.polls.get(id) || null; }
  async createPoll(poll: any) { this.polls.set(poll.id, poll); return poll; }
  async updatePoll(id: string, poolId: string, updates: any) {
    const p = this.polls.get(id);
    if (p) this.polls.set(id, { ...p, ...updates });
  }
  async deletePoll(id: string) { this.polls.delete(id); }

  async listNotifications() { return []; }
  async createNotification(notif: any) { return notif; }
  async markNotificationsRead() {}

  async listWebhooks() { return []; }
  async saveWebhook(wh: any) { return wh; }
  async deleteWebhook() {}

  async getSsoConfigByDomain() { return null; }
  async getSsoConfigByOrg() { return null; }
  async getSsoConfigCount() { return 0; }
  async saveSsoConfig(cfg: any) { return cfg; }

  async getSystemSettings() { return this.settings; }
  async saveSystemSettings(s: any) { this.settings = s; }
  async getPlatformStats() {
    return { totalUsers: this.users.size, totalPools: this.pools.size, totalTransactions: this.transactions.size, totalVolume: 0 };
  }

  async recordTelemetryEvents() {}
  async getTelemetryStats(_days = 7): Promise<TelemetryStats> {
    return {
      periodDays: 7,
      totalEvents: 0,
      topFeatures: [],
      errorSummary: [],
      funnelBreakdown: [],
      activityByDay: [],
      recentEvents: []
    };
  }

  async logAiUsage() {}
  async logAiAppliedItems() {}
}

describe('🛡️ Architectural Guardrails: Storage Decoupling & Secret Hygiene', () => {
  const routesDir = path.resolve(__dirname, '../src/server/api/routes');
  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));

  it('permanently forbids raw database imports (db.ts) inside route handlers', () => {
    for (const file of routeFiles) {
      const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
      expect(
        content.includes("from '../../../../db'") || content.includes("from '../../../db'"),
        `CRITICAL ARCHITECTURAL VIOLATION: ${file} directly imports db.ts. All persistence must route through StorageAdapter.`
      ).toBe(false);
    }
  });

  it('permanently forbids raw database queries (db.prepare / pantrypool_db.prepare) in route handlers', () => {
    for (const file of routeFiles) {
      const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
      expect(
        content.includes('pantrypool_db.prepare(') || content.includes('env?.pantrypool_db?.prepare('),
        `CRITICAL ARCHITECTURAL VIOLATION: ${file} executes raw database queries. All persistence must route through StorageAdapter.`
      ).toBe(false);
    }
  });
});

describe('🔒 Strict Authorization Enforcement on Mutation Endpoints', () => {
  let app: ReturnType<typeof createUniversalApi>;
  let storage: MockSecurityStorageAdapter;

  beforeEach(() => {
    storage = new MockSecurityStorageAdapter();
    storage.createPool({ id: 'pool1', name: 'Main Pantry', champion_id: 'u_champ', max_deficit_cents: 1000 });
    storage.upsertPoolMember({ id: 'pm1', pool_id: 'pool1', user_id: 'u_member', role: 'member', balance: 0, balance_cents: 0 });
    storage.createTransaction({ id: 'tx1', pool_id: 'pool1', user_id: 'u_member', amount: -5.00, amount_cents: -500, type: 'consume' });
    storage.createPoll({ id: 'poll1', pool_id: 'pool1', title: 'Snack Poll', created_by: 'u_champ', options_json: '[]' });

    app = createUniversalApi(storage, 'test-secret-guardrail');
  });

  it('rejects unauthenticated transaction refunds with 401', async () => {
    const res = await app.request('/api/transactions/tx1/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolId: 'pool1' })
    });
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.success).toBe(false);
  });

  it('rejects unauthenticated pool settings modifications with 401', async () => {
    const res = await app.request('/api/pools/pool1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacked Name' })
    });
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.success).toBe(false);
  });

  it('rejects unauthenticated pool deletion with 401', async () => {
    const res = await app.request('/api/pools/pool1', {
      method: 'DELETE'
    });
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.success).toBe(false);
  });

  it('rejects unauthenticated member removal with 401', async () => {
    const res = await app.request('/api/pools/pool1/members/u_member', {
      method: 'DELETE'
    });
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.success).toBe(false);
  });

  it('rejects unauthenticated member role escalation with 401', async () => {
    const res = await app.request('/api/pools/pool1/members/u_member/role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'champion' })
    });
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.success).toBe(false);
  });

  it('rejects unauthenticated poll modifications with 401', async () => {
    const res = await app.request('/api/pools/pool1/polls/poll1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Modified Poll' })
    });
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.success).toBe(false);
  });

  it('rejects unauthenticated poll deletion with 401', async () => {
    const res = await app.request('/api/pools/pool1/polls/poll1', {
      method: 'DELETE'
    });
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.success).toBe(false);
  });
});

describe('⚖️ Ledger Integrity & Deficit Pre-Flights on Batch Sync', () => {
  let app: ReturnType<typeof createUniversalApi>;
  let storage: MockSecurityStorageAdapter;
  let userToken: string;

  beforeEach(async () => {
    storage = new MockSecurityStorageAdapter();
    storage.createPool({ id: 'pool1', name: 'Main Pantry', max_deficit_cents: 1000 }); // $10 max deficit
    storage.saveItem({ id: 'item1', pool_id: 'pool1', name: 'Cold Brew', cost_per_unit: 3.50, cost_per_unit_cents: 350, stock: 10 });
    storage.upsertPoolMember({ id: 'pm1', pool_id: 'pool1', user_id: 'u1', role: 'member', balance: -8.00, balance_cents: -800 }); // currently -$8.00

    app = createUniversalApi(storage, 'test-secret-guardrail');
    userToken = await createUniversalToken({
      userId: 'u1',
      email: 'u1@example.com',
      name: 'User One',
      systemRole: 'user',
      tokenVersion: 1
    }, 'test-secret-guardrail');
  });

  it('rejects negative quantity payloads in offline batch replay', async () => {
    const res = await app.request('/api/sync/offline-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        actions: [
          { id: 'act_1', action: 'consume_item', payload: { poolId: 'pool1', itemId: 'item1', userId: 'u1', quantity: -5 } }
        ]
      })
    });
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.results[0].success).toBe(false);
    expect(json.results[0].error).toContain('positive integer');
  });

  it('rejects offline batch consumption that breaches pool max_deficit_cents', async () => {
    // Current balance is -$8.00 (-800 cents), item is $3.50 (350 cents).
    // Consuming would push balance to -$11.50 (-1150 cents), breaching -1000 limit.
    const res = await app.request('/api/sync/offline-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        actions: [
          { id: 'act_breach', action: 'consume_item', payload: { poolId: 'pool1', itemId: 'item1', userId: 'u1', quantity: 1 } }
        ]
      })
    });
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.results[0].success).toBe(false);
    expect(json.results[0].error).toContain('Spending limit reached');

    // Verify stock and balance were NOT altered
    const item = await storage.getItemById('item1');
    expect(item?.stock).toBe(10);
    const member = await storage.getPoolMember('pool1', 'u1');
    expect(member?.balance_cents).toBe(-800);
  });

  it('rejects negative deposit amounts in offline batch replay', async () => {
    const res = await app.request('/api/sync/offline-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        actions: [
          { id: 'act_neg_dep', action: 'deposit', payload: { poolId: 'pool1', userId: 'u1', amount: -20 } }
        ]
      })
    });
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.results[0].success).toBe(false);
    expect(json.results[0].error).toContain('positive deposit amount');
  });

  it('successfully processes valid consumption within credit limits', async () => {
    // Reset member balance to $5.00 (+500 cents)
    await storage.adjustMemberBalance('pool1', 'u1', 13.00, 1300);

    const res = await app.request('/api/sync/offline-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        actions: [
          { id: 'act_valid', action: 'consume_item', payload: { poolId: 'pool1', itemId: 'item1', userId: 'u1', quantity: 1 } }
        ]
      })
    });
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.results[0].success).toBe(true);

    const item = await storage.getItemById('item1');
    expect(item?.stock).toBe(9);
    const member = await storage.getPoolMember('pool1', 'u1');
    expect(member?.balance_cents).toBe(150); // 500 - 350
  });
});

describe('🧩 Storage Adapter Parity: MySQL & Cloudflare D1', () => {
  const mysqlProto = Object.getOwnPropertyNames(MySqlStorageAdapter.prototype);
  const d1Proto = Object.getOwnPropertyNames(D1StorageAdapter.prototype);

  const requiredMethods = [
    'deleteUser',
    'archiveUser',
    'restoreUser',
    'deleteOrg',
    'archiveOrg',
    'restoreOrg',
    'deletePool',
    'archivePool',
    'restorePool',
    'getOrgByStripeCustomerId',
    'listAllOrgsForAdmin',
    'listAllPoolsForAdmin',
    'searchItems',
    'getSsoConfigCount',
    'getAiUsageStats',
    'logAiUsage',
    'logAiAppliedItems',
    'getSystemSettings',
    'saveSystemSettings',
    'getOrgByNameAndOwner',
    'getOrgByInviteCode',
    'listOrgsForUser',
    'addOrgMember',
    'getOrgMember',
    'listOrgMembers',
    'removeOrgMember',
    'getAllPools',
    'getPoolsByOrg',
    'reassignUserResources',
    'getPoolSavingsSummary',
    'getGlobalSavingsLeaderboard',
    'saveAffiliateImage',
    'getAffiliateImage',
    'deleteAffiliateImage'
  ];

  for (const method of requiredMethods) {
    it(`guarantees both MySqlStorageAdapter and D1StorageAdapter implement ${method}`, () => {
      expect(
        mysqlProto.includes(method),
        `MySqlStorageAdapter is missing method: ${method}`
      ).toBe(true);

      expect(
        d1Proto.includes(method),
        `D1StorageAdapter is missing method: ${method}`
      ).toBe(true);
    });
  }
});
