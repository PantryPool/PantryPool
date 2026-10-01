import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { StorageAdapter, StoragePool, StorageItem, StorageTransaction } from '../src/server/storage/types';
import { D1StorageAdapter } from '../src/server/storage/d1Adapter';

describe('🚀 Option 1: Universal Web-Standards Routing & Unified Storage Suite', () => {
  // In-memory Storage Adapter for rigorous contract testing
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

    async listShoppingItems(poolId: string) { return Array.from(this.shoppingItems.values()).filter(s => s.pool_id === poolId); }
    async createShoppingItem(item: any) { this.shoppingItems.set(item.id, item); return item; }
    async updateShoppingItemStatus(id: string, poolId: string, purchased: boolean) {
      const item = this.shoppingItems.get(id);
      if (item) item.purchased = purchased;
    }
    async deleteShoppingItem(id: string, poolId: string) { this.shoppingItems.delete(id); }

    async listPolls(poolId: string) { return Array.from(this.polls.values()).filter(p => p.pool_id === poolId); }
    async createPoll(poll: any) { this.polls.set(poll.id, poll); return poll; }
    async updatePoll(id: string, poolId: string, updates: any) {
      const poll = this.polls.get(id);
      if (poll) this.polls.set(id, { ...poll, ...updates });
    }
    async deletePoll(id: string, poolId: string) { this.polls.delete(id); }

    async listNotifications(userId: string) { return Array.from(this.notifications.values()).filter(n => n.user_id === userId); }
    async createNotification(notif: any) { this.notifications.set(notif.id, notif); return notif; }
    async markNotificationsRead(userId: string, notifId?: string) {
      for (const n of this.notifications.values()) {
        if (n.user_id === userId && (!notifId || n.id === notifId)) n.is_read = true;
      }
    }

    async listWebhooks(poolId: string) { return Array.from(this.webhooks.values()).filter(w => w.pool_id === poolId); }
    async saveWebhook(webhook: any) { this.webhooks.set(webhook.id, webhook); return webhook; }
    async deleteWebhook(id: string, poolId: string) { this.webhooks.delete(id); }

    async getSsoConfigByDomain(domain: string) { return this.sso.get(domain) || null; }
    async getSsoConfigByOrg(orgId: string) { return null; }
    async saveSsoConfig(config: any) { this.sso.set(config.domain, config); return config; }

    async getSystemSettings() { return this.settings; }
    async saveSystemSettings(s: any) { this.settings = { ...this.settings, ...s }; }
    async getPlatformStats() {
      return {
        totalUsers: this.users.size,
        totalPools: this.pools.size,
        totalTransactions: this.transactions.size,
        totalVolume: Array.from(this.transactions.values()).reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
      };
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

  it('runs health check endpoint with operational status', async () => {
    const storage = new InMemoryStorageAdapter();
    const app = createUniversalApi(storage);

    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.service).toContain('PantryPool Universal API');
    expect(body.checks.database.status).toBe('connected');
  });

  it('handles user registration, JWT issuance, and authentication across runtimes', async () => {
    const storage = new InMemoryStorageAdapter();
    const app = createUniversalApi(storage);

    // 1. Register
    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alex@pantrypool.com', password: 'Password123!', name: 'Alex Rivera' })
    });
    expect(regRes.status).toBe(200);
    const regBody = await regRes.json();
    expect(regBody.success).toBe(true);
    expect(regBody.token).toBeDefined();
    expect(regBody.user.email).toBe('alex@pantrypool.com');

    // 2. Fetch authenticated /api/auth/me
    const meRes = await app.request('/api/auth/me', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${regBody.token}` }
    });
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.success).toBe(true);
    expect(meBody.user.name).toBe('Alex Rivera');
  });

  it('creates pools, items, records consumption, and updates ledger with 100% envelope consistency', async () => {
    const storage = new InMemoryStorageAdapter();
    const app = createUniversalApi(storage);

    // 1. Register User
    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sarah@pantrypool.com', password: 'Password123!', name: 'Sarah Chen' })
    });
    const { token, user } = await regRes.json();

    // 2. Create Pool
    const poolRes = await app.request('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: 'Engineering Breakroom', category: 'Office', currency: '$' })
    });
    expect(poolRes.status).toBe(200);
    const { pool } = await poolRes.json();
    expect(pool.id).toBeDefined();
    expect(pool.name).toBe('Engineering Breakroom');

    // 3. Add Item
    const itemRes = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        poolId: pool.id,
        name: 'Cold Brew Coffee',
        category: 'Beverages',
        stock: 12,
        costPerUnit: 3.50
      })
    });
    expect(itemRes.status).toBe(200);
    const { item } = await itemRes.json();
    expect(item.id).toBeDefined();
    expect(item.stock).toBe(12);

    // 4. Query Items (ensuring { success: true, items: [...] } envelope)
    const getItemsRes = await app.request(`/api/items?poolId=${pool.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(getItemsRes.status).toBe(200);
    const itemsData = await getItemsRes.json();
    expect(itemsData.success).toBe(true);
    expect(Array.isArray(itemsData.items)).toBe(true);
    expect(itemsData.items.length).toBe(1);

    // 5. Consume Item
    const consumeRes = await app.request('/api/items/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ poolId: pool.id, itemId: item.id, quantity: 2 })
    });
    expect(consumeRes.status).toBe(200);
    const consumeData = await consumeRes.json();
    expect(consumeData.success).toBe(true);
    expect(consumeData.transaction.amount).toBe(-7.00);

    // 6. Query Transactions (ensuring { success: true, transactions: [...] } envelope)
    const txRes = await app.request(`/api/transactions?poolId=${pool.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(txRes.status).toBe(200);
    const txData = await txRes.json();
    expect(txData.success).toBe(true);
    expect(Array.isArray(txData.transactions)).toBe(true);
    expect(txData.transactions.length).toBe(1);
    expect(txData.transactions[0].quantity).toBe(2);
    expect(txData.transactions[0].createdByName).toBe('Sarah Chen');
    expect(txData.transactions[0].userName).toBe('Sarah Chen');
    expect(txData.transactions[0].timestamp).toBeDefined();
    expect(txData.transactions[0].itemName).toBe('Cold Brew Coffee');

    // 6b. Create Poll & Vote with explicit voter userId
    const createPollRes = await app.request(`/api/pools/${pool.id}/polls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Snack restock choice',
        options: ['Cashews', 'Pretzels'],
        allowWriteIn: true
      })
    });
    expect(createPollRes.status).toBe(200);
    const createPollData = await createPollRes.json();
    expect(createPollData.success).toBe(true);
    const pollId = createPollData.poll.id;
    const optionId = createPollData.poll.options[0].id;

    // Cast vote with explicit voter userId
    const voteRes = await app.request(`/api/pools/${pool.id}/polls/${pollId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        optionId,
        userId: 'u_voter_custom_99'
      })
    });
    expect(voteRes.status).toBe(200);
    const voteData = await voteRes.json();
    expect(voteData.success).toBe(true);
    expect(voteData.options[0].votes).toContain('u_voter_custom_99');

    // Verify GET /api/pools/:poolId/polls returns poll with votes and allowWriteIn preserved
    const getPollsRes = await app.request(`/api/pools/${pool.id}/polls`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(getPollsRes.status).toBe(200);
    const getPollsData = await getPollsRes.json();
    expect(getPollsData.success).toBe(true);
    const fetchedPoll = getPollsData.polls.find((p: any) => p.id === pollId);
    expect(fetchedPoll).toBeDefined();
    expect(fetchedPoll.options[0].votes).toContain('u_voter_custom_99');
    expect(fetchedPoll.allowWriteIn).toBe(true);

    // 7. Delete Pool Authorization: regular member is blocked with 403
    const regMemberRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'member@pantrypool.com', password: 'Password123!', name: 'Regular Member' })
    });
    const { token: memberToken, user: memberUser } = await regMemberRes.json();
    await storage.upsertPoolMember({
      id: `pm_${pool.id}_${memberUser.id}`,
      pool_id: pool.id,
      user_id: memberUser.id,
      role: 'member',
      balance: 0,
      balance_cents: 0
    });

    const unauthorizedDel = await app.request(`/api/pools/${pool.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${memberToken}` }
    });
    expect(unauthorizedDel.status).toBe(403);
    const unauthorizedData = await unauthorizedDel.json();
    expect(unauthorizedData.success).toBe(false);
    expect(unauthorizedData.error).toMatch(/Only pool managers may delete pools/i);

    // 8. Delete Pool: pool champion / manager succeeds
    const authorizedDel = await app.request(`/api/pools/${pool.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(authorizedDel.status).toBe(200);
    const authorizedData = await authorizedDel.json();
    expect(authorizedData.success).toBe(true);
  });
});
