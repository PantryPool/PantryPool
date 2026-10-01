import { describe, it, expect } from 'vitest';
import { 
  METRO_TIERS, 
  VENDING_BENCHMARK_CATALOG, 
  CATEGORY_DEFAULT_BENCHMARKS,
  resolveSuggestedVendingBenchmark 
} from '../src/shared/vendingBenchmarks';
import { createUniversalApi } from '../src/server/api/app';
import { 
  StorageAdapter, 
  StoragePool, 
  StorageItem, 
  StorageTransaction, 
  StoragePoolMember, 
  StorageGlobalSavingsLeaderboardEntry,
  StorageGlobalSavingsLeaderboardResponse 
} from '../src/server/storage/types';

describe('🥤 Vending Price Benchmark & Heuristics Engine', () => {
  it('should define valid metro tiers with ascending cost multipliers', () => {
    const tierKeys = Object.keys(METRO_TIERS);
    expect(tierKeys.length).toBe(3);
    const baseline = METRO_TIERS.baseline;
    const standard = METRO_TIERS.standard;
    const high = METRO_TIERS.high;

    expect(baseline).toBeDefined();
    expect(standard).toBeDefined();
    expect(high).toBeDefined();

    // Sample soda prices should scale up across tiers
    expect(baseline.samplePrices.soda).toBeLessThan(standard.samplePrices.soda);
    expect(standard.samplePrices.soda).toBeLessThan(high.samplePrices.soda);
  });

  it('should correctly resolve benchmark for common breakroom snacks across tiers', () => {
    // Soda (12oz can)
    const sodaBaseline = resolveSuggestedVendingBenchmark('Coca-Cola Classic Can 12oz', 'Beverages', 'baseline');
    const sodaStandard = resolveSuggestedVendingBenchmark('Coca-Cola Classic Can 12oz', 'Beverages', 'standard');
    const sodaHigh = resolveSuggestedVendingBenchmark('Coca-Cola Classic Can 12oz', 'Beverages', 'high');

    expect(sodaBaseline).toBe(150); // $1.50
    expect(sodaStandard).toBe(175); // $1.75
    expect(sodaHigh).toBe(225); // $2.25

    // Candy bar
    const snickersBaseline = resolveSuggestedVendingBenchmark('Snickers King Size', 'Snacks', 'baseline');
    const snickersHigh = resolveSuggestedVendingBenchmark('Snickers King Size', 'Snacks', 'high');
    expect(snickersBaseline).toBe(175);
    expect(snickersHigh).toBe(250);

    // Energy Drink
    const monsterStandard = resolveSuggestedVendingBenchmark('Monster Energy Ultra 16oz', 'Beverages', 'standard');
    expect(monsterStandard).toBe(375); // $3.75

    // Chips
    const doritosStandard = resolveSuggestedVendingBenchmark('Doritos Nacho Cheese 1.75oz', 'Snacks', 'standard');
    expect(doritosStandard).toBe(185); // $1.85
  });

  it('should resolve fallback benchmark by category when specific product is not recognized', () => {
    const exoticDrink = resolveSuggestedVendingBenchmark('Artisan Herbal Elixir', 'Beverages', 'standard');
    expect(exoticDrink).toBe(200);

    const exoticSnack = resolveSuggestedVendingBenchmark('Organic Dried Kelp Crisp Pack', 'Snacks', 'standard');
    expect(exoticSnack).toBe(195);

    const unknownItem = resolveSuggestedVendingBenchmark('Unknown Gadget', 'other', 'standard');
    expect(unknownItem).toBe(195); // falls back to Snacks category default
  });
});

describe('💰 Savings Benchmark API & Storage Integration', () => {
  // Rigorous in-memory storage adapter implementing savings methods
  class SavingsTestStorageAdapter {
    users = new Map<string, any>();
    pools = new Map<string, StoragePool>();
    members = new Map<string, StoragePoolMember>();
    items = new Map<string, StorageItem>();
    transactions = new Map<string, StorageTransaction>();
    shoppingItems = new Map<string, any>();
    polls = new Map<string, any>();
    notifications = new Map<string, any>();
    webhooks = new Map<string, any>();
    sso = new Map<string, any>();
    settings: Record<string, any> = {};

    async getUserById(id: string) { return this.users.get(id) || null; }
    async getUserByEmail(email: string) {
      return Array.from(this.users.values()).find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
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
    async deleteUser(id: string) { this.users.delete(id); }

    async getOrgById(id: string) { return null; }
    async listOrgsByOwner(ownerId: string) { return []; }
    async createOrg(org: any) { return org; }
    async updateOrgTier(id: string, tier: any) {}
    async getOrgByStripeCustomerId(cid: string) { return null; }
    async listAllOrgsForAdmin() { return []; }
    async getOrgByNameAndOwner() { return null; }
    async getOrgByInviteCode() { return null; }
    async listOrgsForUser() { return []; }
    async addOrgMember() {}
    async getOrgMember() { return null; }
    async listOrgMembers() { return []; }
    async removeOrgMember() {}

    async getPoolById(id: string) { return this.pools.get(id) || null; }
    async listPoolsForUser(userId: string) { return Array.from(this.pools.values()); }
    async createPool(pool: StoragePool) { this.pools.set(pool.id, pool); return pool; }
    async updatePool(id: string, updates: Partial<StoragePool>) {
      const p = this.pools.get(id);
      if (p) this.pools.set(id, { ...p, ...updates });
    }
    async deletePool(id: string) { this.pools.delete(id); }
    async getPoolMember(poolId: string, userId: string) { return this.members.get(`${poolId}_${userId}`) || null; }
    async listPoolMembers(poolId: string) { return Array.from(this.members.values()).filter(m => m.pool_id === poolId); }
    async upsertPoolMember(member: StoragePoolMember) { this.members.set(`${member.pool_id}_${member.user_id}`, member); }
    async updateMemberRole(poolId: string, userId: string, role: string) {
      const m = this.members.get(`${poolId}_${userId}`);
      if (m) (m as any).role = role;
    }
    async removePoolMember(poolId: string, userId: string) { this.members.delete(`${poolId}_${userId}`); }
    async countPoolsByOrg() { return 0; }
    async countPersonalPools() { return 0; }
    async listAllPoolsForAdmin() { return Array.from(this.pools.values()); }
    async getAllPools() { return Array.from(this.pools.values()); }
    async getPoolsByOrg() { return []; }
    async reassignUserResources() {}

    async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number) {
      const key = `${poolId}_${userId}`;
      const m = this.members.get(key) || {
        id: `m_${Date.now()}`,
        pool_id: poolId,
        user_id: userId,
        balance: 0,
        balance_cents: 0,
        role: 'member' as const,
        joined_at: new Date().toISOString()
      };
      m.balance += deltaAmount;
      m.balance_cents += deltaCents;
      this.members.set(key, m);
    }

    async getItemById(id: string) { return this.items.get(id) || null; }
    async listItemsByPool(poolId: string) { return Array.from(this.items.values()).filter(i => i.pool_id === poolId); }
    async saveItem(item: StorageItem) { this.items.set(item.id, item); return item; }
    async deleteItem(id: string) { this.items.delete(id); }
    async adjustItemStock(id: string, deltaQty: number) {
      const item = this.items.get(id);
      if (item) item.stock += deltaQty;
    }
    async searchItems() { return []; }

    async getTransactionById(id: string) { return this.transactions.get(id) || null; }
    async listTransactionsByPool(poolId: string) {
      return Array.from(this.transactions.values()).filter(t => t.pool_id === poolId);
    }
    async createTransaction(tx: StorageTransaction) {
      this.transactions.set(tx.id, tx);
      return tx;
    }
    async refundTransaction(id: string) {
      const tx = this.transactions.get(id);
      if (tx) (tx as any).refunded = 1;
    }

    async getPoolSavingsSummary(poolId: string) {
      const txs = Array.from(this.transactions.values()).filter(
        t => t.pool_id === poolId && !(t as any).refunded && (t.savings_cents ?? 0) > 0
      );
      const totalSavingsCents = txs.reduce((acc, t) => acc + (t.savings_cents || 0), 0);
      const totalTransactions = txs.length;

      // Group by item
      const itemAgg = new Map<string, { itemName: string; totalSavingsCents: number; totalQuantity: number }>();
      for (const t of txs) {
        if (!t.item_id) continue;
        const current = itemAgg.get(t.item_id) || {
          itemName: t.item_name || 'Item',
          totalSavingsCents: 0,
          totalQuantity: 0
        };
        current.totalSavingsCents += (t.savings_cents || 0);
        current.totalQuantity += (t.quantity || 1);
        itemAgg.set(t.item_id, current);
      }

      const topSavedItems = Array.from(itemAgg.entries())
        .map(([itemId, val]) => ({
          itemId,
          itemName: val.itemName,
          totalSavingsCents: val.totalSavingsCents,
          totalQuantity: val.totalQuantity,
        }))
        .sort((a, b) => b.totalSavingsCents - a.totalSavingsCents)
        .slice(0, 5);

      return {
        totalSavingsCents,
        totalTransactions,
        avgSavingsPerTxCents: totalTransactions > 0 ? Math.round(totalSavingsCents / totalTransactions) : 0,
        topSavedItems
      };
    }

    async getGlobalSavingsLeaderboard(limit: number = 20): Promise<StorageGlobalSavingsLeaderboardResponse> {
      const leaderboard: StorageGlobalSavingsLeaderboardEntry[] = [];

      for (const pool of this.pools.values()) {
        if (!pool.savings_enabled || !pool.savings_leaderboard_opt_in) continue;

        const summary = await this.getPoolSavingsSummary(pool.id);
        const members = await this.listPoolMembers(pool.id);
        leaderboard.push({
          rank: 1,
          poolId: pool.id,
          displayName: pool.leaderboard_alias?.trim() || pool.name,
          category: pool.category || 'office',
          memberCount: members.length,
          totalSavingsCents: summary.totalSavingsCents,
          totalSavings: summary.totalSavingsCents / 100
        });
      }

      leaderboard.sort((a, b) => b.totalSavingsCents - a.totalSavingsCents);
      leaderboard.forEach((entry, idx) => { entry.rank = idx + 1; });

      const sliced = leaderboard.slice(0, limit);
      const networkTotalSavingsCents = leaderboard.reduce((sum, e) => sum + e.totalSavingsCents, 0);

      return {
        pools: sliced,
        networkTotalSavingsCents,
        networkTotalSavings: networkTotalSavingsCents / 100
      };
    }

    async listShoppingItems() { return []; }
    async addShoppingItem(i: any) { return i; }
    async updateShoppingItem() {}
    async deleteShoppingItem() {}
    async listPollsByPool() { return []; }
    async getPollById() { return null; }
    async createPoll(p: any) { return p; }
    async updatePoll() {}
    async deletePoll() {}
    async votePoll() {}
    async listNotificationsByUser() { return []; }
    async createNotification(n: any) { return n; }
    async markNotificationsRead() {}
    async deleteNotification() {}
    async getNotificationPreferences() { return null; }
    async upsertNotificationPreferences() {}
    async listWebhooksByPool() { return []; }
    async getWebhookById() { return null; }
    async createWebhook(w: any) { return w; }
    async updateWebhook() {}
    async deleteWebhook() {}
    async getSsoConfigByDomain() { return null; }
    async getSsoConfigByOrg() { return null; }
    async saveSsoConfig() { return {} as any; }
    async deleteSsoConfig() {}
    async getSsoConfigCount() { return 0; }
    async getAiUsageStats() { return { summary: {}, modelBreakdown: [], recentLogs: [] }; }
    async logAiAppliedItems() {}
    async getSystemSettings() { return {}; }
    async saveSystemSettings() {}
    async createPasswordResetToken() {}
    async getPasswordResetToken() { return null; }
    async markPasswordResetTokenUsed() {}
  }

  it('should compute savings on item consumption when savings feature is enabled', async () => {
    const storage = new SavingsTestStorageAdapter();
    const app = createUniversalApi(storage as unknown as StorageAdapter, 'test-jwt-secret-key-1234567890123456');

    // 1. Register user
    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'worker@breakroom.io', password: 'Password123!', name: 'Snack Fan' })
    });
    expect(regRes.status).toBe(200);
    const { token, user } = await regRes.json();

    const pool: StoragePool = {
      id: 'pool_savings_1',
      name: 'Engineering Breakroom',
      category: 'office',
      currency: '$',
      champion_id: user.id,
      savings_enabled: 1,
      savings_leaderboard_opt_in: 1,
      leaderboard_alias: 'Top Notch Eng Lounge',
      metro_tier: 'standard',
      created_at: new Date().toISOString()
    };
    await storage.createPool(pool);
    await storage.upsertPoolMember({
      id: 'm_1',
      pool_id: pool.id,
      user_id: user.id,
      role: 'champion',
      balance: 10,
      balance_cents: 1000,
      joined_at: new Date().toISOString()
    });

    // 2. Add an item: cost is $0.75 (75 cents), benchmark is $1.75 (175 cents)
    const item: StorageItem = {
      id: 'item_coke_1',
      pool_id: pool.id,
      name: 'Coca-Cola 12oz',
      category: 'drinks',
      stock: 24,
      min_stock: 5,
      cost_per_unit: 0.75,
      cost_per_unit_cents: 75,
      unit_name: 'can',
      icon: '🥤',
      vending_benchmark_cents: 175, // $1.75 vending machine price
      created_at: new Date().toISOString()
    };
    await storage.saveItem(item);

    // 3. Consume 2 cans
    const consumeRes = await app.request('/api/items/consume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        itemId: item.id,
        quantity: 2,
        poolId: pool.id
      })
    });

    expect(consumeRes.status).toBe(200);
    const consumeData = await consumeRes.json();
    expect(consumeData.success).toBe(true);

    // Expected savings: (175 - 75) * 2 = 200 cents ($2.00)
    expect(consumeData.savingsCents).toBe(200);
    expect(consumeData.savings).toBe(2.00);
    expect(consumeData.savingsFormatted).toBe('2.00');

    // 4. Verify transaction record in storage captured savings_cents
    const poolTxs = await storage.listTransactionsByPool(pool.id);
    expect(poolTxs.length).toBe(1);
    expect(poolTxs[0].savings_cents).toBe(200);
    expect(poolTxs[0].amount_cents).toBe(-150); // Member was charged 2 * 75 = 150 cents debit

    // 5. Check Pool Savings Summary Endpoint
    const summaryRes = await app.request(`/api/pools/${pool.id}/savings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(summaryRes.status).toBe(200);
    const summaryData = await summaryRes.json();
    expect(summaryData.success).toBe(true);
    expect(summaryData.summary.totalSavingsCents).toBe(200);
    expect(summaryData.summary.totalTransactions).toBe(1);
    expect(summaryData.summary.topSavedItems).toHaveLength(1);
    expect(summaryData.summary.topSavedItems[0].itemName).toBe('Coca-Cola 12oz');
    expect(summaryData.summary.topSavedItems[0].totalSavingsCents).toBe(200);
  });

  it('should return 0 savings when pool savings feature is disabled', async () => {
    const storage = new SavingsTestStorageAdapter();
    const app = createUniversalApi(storage as unknown as StorageAdapter, 'test-jwt-secret-key-1234567890123456');

    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user2@corp.com', password: 'Password123!', name: 'User 2' })
    });
    const { token, user } = await regRes.json();

    const pool: StoragePool = {
      id: 'pool_nosavings',
      name: 'No Savings Pool',
      category: 'office',
      currency: '$',
      champion_id: user.id,
      savings_enabled: 0, // Disabled
      created_at: new Date().toISOString()
    };
    await storage.createPool(pool);
    await storage.upsertPoolMember({
      id: 'm_2',
      pool_id: pool.id,
      user_id: user.id,
      role: 'member',
      balance: 10,
      balance_cents: 1000,
      joined_at: new Date().toISOString()
    });

    const item: StorageItem = {
      id: 'item_chip_1',
      pool_id: pool.id,
      name: 'Doritos',
      category: 'snacks',
      stock: 10,
      min_stock: 2,
      cost_per_unit: 0.50,
      cost_per_unit_cents: 50,
      unit_name: 'bag',
      icon: '🥨',
      vending_benchmark_cents: 185,
      created_at: new Date().toISOString()
    };
    await storage.saveItem(item);

    const consumeRes = await app.request('/api/items/consume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        itemId: item.id,
        quantity: 1,
        poolId: pool.id
      })
    });

    const data = await consumeRes.json();
    expect(data.success).toBe(true);
    expect(data.savingsCents).toBe(0);

    const poolTxs = await storage.listTransactionsByPool(pool.id);
    expect(poolTxs[0].savings_cents).toBe(0);
  });

  it('should filter non-opted-in pools and respect custom alias on cross-pool leaderboard', async () => {
    const storage = new SavingsTestStorageAdapter();
    const app = createUniversalApi(storage as unknown as StorageAdapter, 'test-jwt-secret-key-1234567890123456');

    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@breakroom.io', password: 'Password123!', name: 'Owner' })
    });
    const { user } = await regRes.json();

    // Pool A: Opted-in with custom alias ($4.50 saved)
    const poolA: StoragePool = {
      id: 'pool_a',
      name: 'Engineering Breakroom Alpha',
      category: 'office',
      currency: '$',
      champion_id: user.id,
      savings_enabled: 1,
      savings_leaderboard_opt_in: 1,
      leaderboard_alias: 'Code Ninjas Breakroom',
      created_at: new Date().toISOString()
    };
    await storage.createPool(poolA);
    await storage.createTransaction({
      id: 'tx_a1',
      pool_id: poolA.id,
      user_id: user.id,
      type: 'consume',
      amount: 1,
      amount_cents: -100,
      quantity: 1,
      savings_cents: 450,
      created_at: new Date().toISOString()
    });

    // Pool B: Opted-in without alias ($8.00 saved - should be rank #1 and use pool name)
    const poolB: StoragePool = {
      id: 'pool_b',
      name: 'Design Floor Pantry',
      category: 'office',
      currency: '$',
      champion_id: user.id,
      savings_enabled: 1,
      savings_leaderboard_opt_in: 1,
      created_at: new Date().toISOString()
    };
    await storage.createPool(poolB);
    await storage.createTransaction({
      id: 'tx_b1',
      pool_id: poolB.id,
      user_id: user.id,
      type: 'consume',
      amount: 1,
      amount_cents: -100,
      quantity: 1,
      savings_cents: 800,
      created_at: new Date().toISOString()
    });

    // Pool C: Savings enabled, but opted-out of leaderboard ($12.00 saved - must NOT appear)
    const poolC: StoragePool = {
      id: 'pool_c',
      name: 'Private Secret Bunker',
      category: 'office',
      currency: '$',
      champion_id: user.id,
      savings_enabled: 1,
      savings_leaderboard_opt_in: 0,
      created_at: new Date().toISOString()
    };
    await storage.createPool(poolC);
    await storage.createTransaction({
      id: 'tx_c1',
      pool_id: poolC.id,
      user_id: user.id,
      type: 'consume',
      amount: 1,
      amount_cents: -100,
      quantity: 1,
      savings_cents: 1200,
      created_at: new Date().toISOString()
    });

    // Fetch leaderboard
    const res = await app.request('/api/leaderboard/savings');
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.pools).toHaveLength(2); // Only Pool B and Pool A

    // Rank 1: Pool B ($8.00 saved)
    expect(data.pools[0].poolId).toBe('pool_b');
    expect(data.pools[0].displayName).toBe('Design Floor Pantry');
    expect(data.pools[0].totalSavingsCents).toBe(800);

    // Rank 2: Pool A ($4.50 saved, custom alias)
    expect(data.pools[1].poolId).toBe('pool_a');
    expect(data.pools[1].displayName).toBe('Code Ninjas Breakroom');
    expect(data.pools[1].totalSavingsCents).toBe(450);
  });

  it('guarantees core zero-sum ledger invariants remain 100% unaffected by savings calculations', async () => {
    const storage = new SavingsTestStorageAdapter();
    const app = createUniversalApi(storage as unknown as StorageAdapter, 'test-jwt-secret-key-1234567890123456');

    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fin@pantrypool.com', password: 'Password123!', name: 'Finance Lead' })
    });
    const { token, user } = await regRes.json();

    const pool: StoragePool = {
      id: 'pool_zero_sum',
      name: 'Zero Sum Pool',
      category: 'office',
      currency: '$',
      champion_id: user.id,
      savings_enabled: 1,
      created_at: new Date().toISOString()
    };
    await storage.createPool(pool);
    await storage.upsertPoolMember({
      id: 'm_zero',
      pool_id: pool.id,
      user_id: user.id,
      role: 'member',
      balance: 10.00,
      balance_cents: 1000,
      joined_at: new Date().toISOString()
    });

    const item: StorageItem = {
      id: 'item_iced_tea',
      pool_id: pool.id,
      name: 'Iced Tea',
      category: 'Beverages',
      stock: 10,
      min_stock: 2,
      cost_per_unit: 1.00,
      cost_per_unit_cents: 100,
      unit_name: 'can',
      icon: '🧃',
      vending_benchmark_cents: 250, // $1.50 savings
      created_at: new Date().toISOString()
    };
    await storage.saveItem(item);

    // Consume item
    await app.request('/api/items/consume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        itemId: item.id,
        quantity: 1,
        poolId: pool.id
      })
    });

    const member = await storage.getPoolMember(pool.id, user.id);
    expect(member?.balance_cents).toBe(900); // 1000 - 100
    // Transaction amount is strictly -100 cents (debit to member), NOT affected by the 150 cents savings
    const tx = (await storage.listTransactionsByPool(pool.id))[0];
    expect(tx.amount_cents).toBe(-100);
    expect(tx.savings_cents).toBe(150);
  });

  it('turns on savings tracker by default when creating a pool without explicit savings flags', async () => {
    const storage = new SavingsTestStorageAdapter();
    const app = createUniversalApi(storage as unknown as StorageAdapter, 'test-jwt-secret-key-1234567890123456');

    // Register user
    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newcreator@breakroom.io', password: 'Password123!', name: 'New Creator' })
    });
    expect(regRes.status).toBe(200);
    const { token, user } = await regRes.json();

    const res = await app.request('/api/pools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Default Savings Breakroom',
        category: 'Office',
        currency: '$'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.pool.savingsEnabled).toBe(true);
    expect(data.pool.savings_enabled).toBe(true);

    // Verify stored pool entity also defaults savings_enabled to truthy
    const storedPool = await storage.getPoolById(data.poolId);
    expect(Boolean(storedPool?.savings_enabled)).toBe(true);

    // Verify GET /api/pools list returns savingsEnabled: true
    const listRes = await app.request('/api/pools', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const listData = await listRes.json();
    const created = listData.pools.find((p: any) => p.id === data.poolId);
    expect(created.savingsEnabled).toBe(true);
  });
});
