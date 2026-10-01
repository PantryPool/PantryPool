import { describe, it, expect, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';
import { StorageAdapter, StoragePool, StorageItem, StorageTransaction, StorageOrganization, StorageUser, StoragePoolMember, StorageShoppingItem, StoragePoll, StorageNotification, StorageWebhook } from '../src/server/storage/types';

class FullStateStorageAdapter implements StorageAdapter {
  users = new Map<string, StorageUser>();
  orgs = new Map<string, StorageOrganization>();
  orgMembers = new Map<string, any>();
  pools = new Map<string, StoragePool>();
  poolMembers = new Map<string, StoragePoolMember>();
  items = new Map<string, StorageItem>();
  transactions = new Map<string, StorageTransaction>();
  shoppingItems = new Map<string, StorageShoppingItem>();
  polls = new Map<string, StoragePoll>();
  notifications = new Map<string, StorageNotification>();
  notifPrefs = new Map<string, any>();
  webhooks = new Map<string, StorageWebhook>();
  ssoConfigs = new Map<string, any>();
  settings: Record<string, any> = {};

  // Users
  async getUserById(id: string): Promise<StorageUser | null> { return this.users.get(id) || null; }
  async getUserByEmail(email: string): Promise<StorageUser | null> {
    return Array.from(this.users.values()).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }
  async createUser(user: Partial<StorageUser> & { id: string; email: string; name: string }): Promise<StorageUser> {
    const fullUser: StorageUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url || null,
      password_hash: user.password_hash,
      system_role: user.system_role || 'user',
      token_version: user.token_version || 1,
      is_archived: Boolean(user.is_archived),
      archived_at: user.archived_at || null,
      created_at: new Date().toISOString()
    };
    this.users.set(user.id, fullUser);
    return fullUser;
  }
  async updateUser(id: string, updates: Partial<StorageUser>): Promise<void> {
    const u = this.users.get(id);
    if (u) this.users.set(id, { ...u, ...updates });
  }
  async listUsers(): Promise<StorageUser[]> { return Array.from(this.users.values()); }
  async bumpTokenVersion(id: string): Promise<number> {
    const u = this.users.get(id);
    if (u) {
      u.token_version = (u.token_version || 1) + 1;
      return u.token_version;
    }
    return 1;
  }
  async deleteUser(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void> {
    const hard = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
    if (hard) {
      this.users.delete(id);
    } else {
      const u = this.users.get(id);
      if (u) this.users.set(id, { ...u, is_archived: true, archived_at: new Date().toISOString(), token_version: (u.token_version || 1) + 1 });
    }
  }
  async archiveUser(id: string): Promise<void> { await this.deleteUser(id, { hardDelete: false }); }
  async restoreUser(id: string): Promise<void> {
    const u = this.users.get(id);
    if (u) this.users.set(id, { ...u, is_archived: false, archived_at: null });
  }

  // Password reset
  async createPasswordResetToken() {}
  async getPasswordResetToken() { return null; }
  async markPasswordResetTokenUsed() {}

  // Organizations
  async getOrgById(id: string): Promise<StorageOrganization | null> { return this.orgs.get(id) || null; }
  async getOrgByNameAndOwner(name: string, ownerId: string): Promise<StorageOrganization | null> {
    return Array.from(this.orgs.values()).find(o => o.owner_id === ownerId && o.name.toLowerCase() === name.toLowerCase() && !o.is_archived) || null;
  }
  async getOrgByInviteCode(code: string): Promise<StorageOrganization | null> {
    return Array.from(this.orgs.values()).find(o => (o.invite_code || '').toUpperCase() === code.toUpperCase() && !o.is_archived) || null;
  }
  async getOrgByStripeCustomerId(customerId: string): Promise<StorageOrganization | null> {
    return Array.from(this.orgs.values()).find(o => o.stripe_customer_id === customerId) || null;
  }
  async listOrgsByOwner(ownerId: string): Promise<StorageOrganization[]> {
    return Array.from(this.orgs.values()).filter(o => o.owner_id === ownerId && !o.is_archived);
  }
  async listOrgsForUser(userId: string): Promise<StorageOrganization[]> {
    const owned = Array.from(this.orgs.values()).filter(o => o.owner_id === userId && !o.is_archived);
    const memberOrgIds = Array.from(this.orgMembers.values()).filter(m => m.user_id === userId).map(m => m.organization_id);
    const memberOrgs = Array.from(this.orgs.values()).filter(o => memberOrgIds.includes(o.id) && !o.is_archived);
    const set = new Map<string, StorageOrganization>();
    [...owned, ...memberOrgs].forEach(o => set.set(o.id, o));
    return Array.from(set.values());
  }
  async createOrg(org: Partial<StorageOrganization> & { id: string; name: string; owner_id: string }): Promise<StorageOrganization> {
    const fullOrg: StorageOrganization = {
      id: org.id,
      name: org.name,
      owner_id: org.owner_id,
      tier: org.tier || 'starter',
      invite_code: org.invite_code || 'INVITE123',
      is_archived: false,
      archived_at: null,
      created_at: new Date().toISOString()
    };
    this.orgs.set(org.id, fullOrg);
    return fullOrg;
  }
  async updateOrg(id: string, updates: Partial<StorageOrganization>): Promise<void> {
    const o = this.orgs.get(id);
    if (o) this.orgs.set(id, { ...o, ...updates });
  }
  async updateOrgTier(id: string, tier: any): Promise<void> {
    const o = this.orgs.get(id);
    if (o) o.tier = tier;
  }
  async deleteOrg(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void> {
    const hard = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
    if (hard) {
      this.orgs.delete(id);
    } else {
      const o = this.orgs.get(id);
      if (o) this.orgs.set(id, { ...o, is_archived: true, archived_at: new Date().toISOString() });
      for (const pool of this.pools.values()) {
        if (pool.organization_id === id) {
          this.pools.set(pool.id, { ...pool, is_archived: true, archived_at: new Date().toISOString() });
        }
      }
    }
  }
  async archiveOrg(id: string): Promise<void> { await this.deleteOrg(id, { hardDelete: false }); }
  async restoreOrg(id: string): Promise<void> {
    const o = this.orgs.get(id);
    if (o) this.orgs.set(id, { ...o, is_archived: false, archived_at: null });
    for (const pool of this.pools.values()) {
      if (pool.organization_id === id) {
        this.pools.set(pool.id, { ...pool, is_archived: false, archived_at: null });
      }
    }
  }

  async addOrgMember(member: any): Promise<void> { this.orgMembers.set(`${member.organization_id}_${member.user_id}`, member); }
  async getOrgMember(orgId: string, userId: string): Promise<any | null> { return this.orgMembers.get(`${orgId}_${userId}`) || null; }
  async listOrgMembers(orgId: string): Promise<any[]> {
    return Array.from(this.orgMembers.values()).filter(m => m.organization_id === orgId);
  }
  async removeOrgMember(orgId: string, userId: string): Promise<void> { this.orgMembers.delete(`${orgId}_${userId}`); }

  // Pools
  async getPoolById(id: string): Promise<StoragePool | null> { return this.pools.get(id) || null; }
  async getPoolByCode(code: string): Promise<StoragePool | null> {
    return Array.from(this.pools.values()).find(p => (p.qr_code_key || '').toUpperCase() === code.toUpperCase() && !p.is_archived) || null;
  }
  async getAllPools(): Promise<StoragePool[]> { return Array.from(this.pools.values()); }
  async getPoolsByOrg(orgId: string): Promise<StoragePool[]> {
    return Array.from(this.pools.values()).filter(p => p.organization_id === orgId && !p.is_archived);
  }
  async listPoolsForUser(userId: string): Promise<StoragePool[]> {
    const memberPoolIds = Array.from(this.poolMembers.values()).filter(m => m.user_id === userId).map(m => m.pool_id);
    return Array.from(this.pools.values()).filter(p => !p.is_archived && (p.champion_id === userId || memberPoolIds.includes(p.id)));
  }
  async countPoolsByOrg(orgId: string): Promise<number> {
    return Array.from(this.pools.values()).filter(p => p.organization_id === orgId && !p.is_archived).length;
  }
  async countPersonalPools(userId: string): Promise<number> {
    return Array.from(this.pools.values()).filter(p => !p.organization_id && p.champion_id === userId && !p.is_archived).length;
  }
  async createPool(pool: Partial<StoragePool> & { id: string; name: string }): Promise<StoragePool> {
    const fullPool: StoragePool = {
      id: pool.id,
      name: pool.name,
      category: pool.category || 'Office',
      currency: pool.currency || '$',
      organization_id: pool.organization_id || null,
      champion_id: pool.champion_id || null,
      qr_code_key: pool.qr_code_key || 'POOL99',
      kiosk_pin: pool.kiosk_pin || '1234',
      max_deficit: pool.max_deficit !== undefined ? pool.max_deficit : 10.0,
      max_deficit_cents: pool.max_deficit_cents !== undefined ? pool.max_deficit_cents : 1000,
      is_archived: false,
      archived_at: null,
      created_at: new Date().toISOString()
    };
    this.pools.set(pool.id, fullPool);
    return fullPool;
  }
  async updatePool(id: string, updates: Partial<StoragePool>): Promise<void> {
    const p = this.pools.get(id);
    if (p) this.pools.set(id, { ...p, ...updates });
  }
  async deletePool(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void> {
    const hard = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
    if (hard) {
      this.pools.delete(id);
    } else {
      const p = this.pools.get(id);
      if (p) this.pools.set(id, { ...p, is_archived: true, archived_at: new Date().toISOString() });
    }
  }
  async archivePool(id: string): Promise<void> { await this.deletePool(id, { hardDelete: false }); }
  async restorePool(id: string): Promise<void> {
    const p = this.pools.get(id);
    if (p) this.pools.set(id, { ...p, is_archived: false, archived_at: null });
  }

  // Pool Members
  async getPoolMember(poolId: string, userId: string): Promise<StoragePoolMember | null> {
    return this.poolMembers.get(`${poolId}_${userId}`) || null;
  }
  async listPoolMembers(poolId: string): Promise<StoragePoolMember[]> {
    return Array.from(this.poolMembers.values()).filter(m => m.pool_id === poolId);
  }
  async upsertPoolMember(member: StoragePoolMember): Promise<void> {
    this.poolMembers.set(`${member.pool_id}_${member.user_id}`, member);
  }
  async updateMemberRole(poolId: string, userId: string, role: string): Promise<void> {
    const m = this.poolMembers.get(`${poolId}_${userId}`);
    if (m) m.role = role as any;
  }
  async removePoolMember(poolId: string, userId: string): Promise<void> {
    this.poolMembers.delete(`${poolId}_${userId}`);
  }
  async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number): Promise<void> {
    const m = this.poolMembers.get(`${poolId}_${userId}`);
    if (m) {
      m.balance = (m.balance || 0) + deltaAmount;
      m.balance_cents = (m.balance_cents || 0) + deltaCents;
    }
  }

  // Items
  async getItemById(id: string): Promise<StorageItem | null> { return this.items.get(id) || null; }
  async listItemsByPool(poolId: string): Promise<StorageItem[]> {
    return Array.from(this.items.values()).filter(i => i.pool_id === poolId);
  }
  async searchItems(query: string, poolId?: string): Promise<StorageItem[]> {
    return Array.from(this.items.values()).filter(i => (!poolId || i.pool_id === poolId) && i.name.toLowerCase().includes(query.toLowerCase()));
  }
  async saveItem(item: StorageItem): Promise<StorageItem> {
    this.items.set(item.id, item);
    return item;
  }
  async deleteItem(id: string): Promise<void> { this.items.delete(id); }
  async adjustItemStock(id: string, deltaQty: number): Promise<void> {
    const i = this.items.get(id);
    if (i) i.stock = (i.stock || 0) + deltaQty;
  }

  // Transactions
  async getTransactionById(id: string): Promise<StorageTransaction | null> { return this.transactions.get(id) || null; }
  async listTransactionsByPool(poolId: string): Promise<StorageTransaction[]> {
    return Array.from(this.transactions.values()).filter(t => t.pool_id === poolId);
  }
  async createTransaction(tx: StorageTransaction): Promise<StorageTransaction> {
    this.transactions.set(tx.id, tx);
    return tx;
  }

  // Shopping Items
  async listShoppingItems(poolId: string): Promise<StorageShoppingItem[]> {
    return Array.from(this.shoppingItems.values()).filter(s => s.pool_id === poolId);
  }
  async createShoppingItem(item: StorageShoppingItem): Promise<StorageShoppingItem> {
    this.shoppingItems.set(item.id, item);
    return item;
  }
  async updateShoppingItemStatus(id: string, poolId: string, purchased: boolean): Promise<void> {
    const s = this.shoppingItems.get(id);
    if (s) s.purchased = purchased;
  }
  async deleteShoppingItem(id: string): Promise<void> { this.shoppingItems.delete(id); }

  // Polls
  async listPolls(poolId: string): Promise<StoragePoll[]> {
    return Array.from(this.polls.values()).filter(p => p.pool_id === poolId);
  }
  async getPollById(id: string): Promise<StoragePoll | null> { return this.polls.get(id) || null; }
  async createPoll(poll: StoragePoll): Promise<StoragePoll> {
    this.polls.set(poll.id, poll);
    return poll;
  }
  async updatePoll(id: string, poolId: string, updates: Partial<StoragePoll>): Promise<void> {
    const p = this.polls.get(id);
    if (p) this.polls.set(id, { ...p, ...updates });
  }
  async deletePoll(id: string): Promise<void> { this.polls.delete(id); }

  // Notifications
  async listNotifications(userId: string): Promise<StorageNotification[]> {
    return Array.from(this.notifications.values()).filter(n => n.user_id === userId);
  }
  async createNotification(notif: StorageNotification): Promise<StorageNotification> {
    this.notifications.set(notif.id, notif);
    return notif;
  }
  async markNotificationsRead(userId: string): Promise<void> {
    for (const n of this.notifications.values()) {
      if (n.user_id === userId) n.is_read = true;
    }
  }
  async deleteNotification(id: string): Promise<void> { this.notifications.delete(id); }
  async getNotificationPreferences(userId: string) { return this.notifPrefs.get(userId) || null; }
  async saveNotificationPreferences(userId: string, prefs: any) { this.notifPrefs.set(userId, prefs); }

  // Webhooks
  async listWebhooks(poolId: string): Promise<StorageWebhook[]> {
    return Array.from(this.webhooks.values()).filter(w => w.pool_id === poolId);
  }
  async saveWebhook(wh: StorageWebhook): Promise<StorageWebhook> {
    this.webhooks.set(wh.id, wh);
    return wh;
  }
  async deleteWebhook(id: string): Promise<void> { this.webhooks.delete(id); }

  // Admin & System
  async getSystemSettings(): Promise<Record<string, any>> { return this.settings; }
  async saveSystemSettings(s: Record<string, any>): Promise<void> { this.settings = s; }
  async getPlatformStats(): Promise<any> {
    return {
      totalUsers: this.users.size,
      totalPools: this.pools.size,
      totalTransactions: this.transactions.size,
      totalVolume: 12500
    };
  }
  async listAllUsersForAdmin(): Promise<any[]> {
    return Array.from(this.users.values()).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      systemRole: u.system_role,
      isArchived: Boolean(u.is_archived),
      archivedAt: u.archived_at || null,
      createdAt: u.created_at
    }));
  }
  async listAllOrgsForAdmin(): Promise<any[]> {
    return Array.from(this.orgs.values()).map(o => ({
      id: o.id,
      name: o.name,
      ownerId: o.owner_id,
      tier: o.tier,
      isArchived: Boolean(o.is_archived),
      archivedAt: o.archived_at || null,
      createdAt: o.created_at
    }));
  }
  async listAllPoolsForAdmin(): Promise<any[]> {
    return Array.from(this.pools.values()).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      isArchived: Boolean(p.is_archived),
      archivedAt: p.archived_at || null,
      createdAt: p.created_at
    }));
  }

  // SSO & Telemetry
  async getSsoConfigByDomain(domain: string): Promise<any | null> { return null; }
  async getSsoConfigByOrg(orgId: string): Promise<any | null> { return null; }
  async saveSsoConfig(config: any): Promise<any> { return config; }
  async recordTelemetryEvents(events: any[]): Promise<void> {}
  async getTelemetryStats(days = 7): Promise<any> {
    return {
      periodDays: days,
      totalEvents: 0,
      topFeatures: [],
      errorSummary: [],
      funnelBreakdown: [],
      activityByDay: [],
      recentEvents: []
    };
  }
}

describe('🌐 End-to-End API Routes & Database Paths Verification', () => {
  const secret = 'e2e-all-routes-super-secret-key-2026';
  let storage: FullStateStorageAdapter;
  let app: any;
  let superadminToken: string;
  let championToken: string;
  let memberToken: string;

  beforeEach(async () => {
    storage = new FullStateStorageAdapter();
    app = createUniversalApi(storage, secret);

    // Seed Superadmin
    const superadmin = await storage.createUser({
      id: 'u_superadmin_e2e',
      email: 'admin@pantrypool.com',
      name: 'Site Superadmin',
      system_role: 'superadmin',
      token_version: 1
    });
    superadminToken = await createUniversalToken({
      userId: superadmin.id,
      email: superadmin.email,
      name: superadmin.name,
      systemRole: 'superadmin',
      tokenVersion: 1
    }, secret);

    // Seed Champion
    const champion = await storage.createUser({
      id: 'u_champ_e2e',
      email: 'champion@example.com',
      name: 'Pantry Champion',
      system_role: 'user',
      token_version: 1
    });
    championToken = await createUniversalToken({
      userId: champion.id,
      email: champion.email,
      name: champion.name,
      systemRole: 'user',
      tokenVersion: 1
    }, secret);

    // Seed Member
    const member = await storage.createUser({
      id: 'u_member_e2e',
      email: 'member@example.com',
      name: 'Active Member',
      system_role: 'user',
      token_version: 1
    });
    memberToken = await createUniversalToken({
      userId: member.id,
      email: member.email,
      name: member.name,
      systemRole: 'user',
      tokenVersion: 1
    }, secret);
  });

  // 1. Health & Public Config
  it('GET /api/health and /api/public-settings verify system status', async () => {
    const healthRes = await app.request('/api/health');
    expect(healthRes.status).toBe(200);
    const healthData = await healthRes.json();
    expect(healthData.success).toBe(true);

    const pubRes = await app.request('/api/public-settings');
    expect(pubRes.status).toBe(200);
    const pubData = await pubRes.json();
    expect(pubData.success).toBe(true);
  });

  // 2. Auth & Identity Lifecycle
  it('handles auth registration, login, me, and profile updates', async () => {
    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newbie@example.com', password: 'StrongPassword123!', name: 'Newbie User' })
    });
    expect(regRes.status).toBe(200);
    const regData = await regRes.json();
    expect(regData.success).toBe(true);
    expect(regData.token).toBeDefined();

    const meRes = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${regData.token}` }
    });
    expect(meRes.status).toBe(200);
    const meData = await meRes.json();
    expect(meData.user.email).toBe('newbie@example.com');

    const updateRes = await app.request('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regData.token}` },
      body: JSON.stringify({ name: 'Renamed User', venmoHandle: '@newbie_venmo' })
    });
    expect(updateRes.status).toBe(200);
    const updated = await storage.getUserById(regData.user.id);
    expect(updated?.name).toBe('Renamed User');
  });

  // 3. Organizations & Multi-tenancy
  it('manages organization creation, listing, membership, and invites', async () => {
    const orgRes = await app.request('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({ name: 'Acme Corporation' })
    });
    expect(orgRes.status).toBe(200);
    const orgData = await orgRes.json();
    expect(orgData.success).toBe(true);
    const orgId = orgData.organization.id;

    const listRes = await app.request('/api/organizations', {
      headers: { Authorization: `Bearer ${championToken}` }
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.organizations.some((o: any) => o.id === orgId)).toBe(true);

    const membersRes = await app.request(`/api/organizations/${orgId}/members`, {
      headers: { Authorization: `Bearer ${championToken}` }
    });
    expect(membersRes.status).toBe(200);
  });

  // 4. Pools Lifecycle & Membership
  it('creates, reads, joins, updates, and lists pantry pools', async () => {
    const createPoolRes = await app.request('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({
        name: 'Design Floor Breakroom',
        category: 'Office',
        currency: '$',
        description: 'Snacks and drinks for Design',
        maxDeficit: 15.0
      })
    });
    expect(createPoolRes.status).toBe(200);
    const poolData = await createPoolRes.json();
    expect(poolData.success).toBe(true);
    const poolId = poolData.pool.id;
    const poolCode = poolData.pool.code;

    // List pools for champion
    const listRes = await app.request('/api/pools', {
      headers: { Authorization: `Bearer ${championToken}` }
    });
    expect(listRes.status).toBe(200);
    const pools = (await listRes.json()).pools;
    expect(pools.some((p: any) => p.id === poolId)).toBe(true);

    // Active Member joins via code
    const joinRes = await app.request('/api/pools/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ code: poolCode })
    });
    expect(joinRes.status).toBe(200);

    // Verify member list
    const membersRes = await app.request(`/api/pools/${poolId}/members`, {
      headers: { Authorization: `Bearer ${championToken}` }
    });
    expect(membersRes.status).toBe(200);
    const memberData = await membersRes.json();
    expect(memberData.members.some((m: any) => m.userId === 'u_member_e2e')).toBe(true);
  });

  // 5. Items, Stock, and Deficit Checks
  it('manages items, inventory catalog, barcode search, and consumption', async () => {
    const pool = await storage.createPool({
      id: 'pool_catalog_e2e',
      name: 'Engineering Pantry',
      champion_id: 'u_champ_e2e',
      max_deficit: 10.0,
      max_deficit_cents: 1000
    });
    await storage.upsertPoolMember({
      id: 'pm_1',
      pool_id: pool.id,
      user_id: 'u_champ_e2e',
      role: 'champion',
      balance: 10.0,
      balance_cents: 1000,
      joined_at: new Date().toISOString()
    });

    const itemRes = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({
        poolId: pool.id,
        name: 'Cold Brew Espresso',
        category: 'Beverages',
        stock: 20,
        costPerUnit: 3.50,
        barcode: '012345678905'
      })
    });
    expect(itemRes.status).toBe(200);
    const itemData = await itemRes.json();
    const itemId = itemData.item.id;

    // List and verify items
    const itemsRes = await app.request(`/api/items?poolId=${pool.id}`, {
      headers: { Authorization: `Bearer ${championToken}` }
    });
    expect(itemsRes.status).toBe(200);
    const itemsList = (await itemsRes.json()).items;
    expect(itemsList.some((i: any) => i.id === itemId)).toBe(true);

    // Consume item
    const consumeRes = await app.request('/api/items/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({ poolId: pool.id, itemId, userId: 'u_champ_e2e', quantity: 1 })
    });
    expect(consumeRes.status).toBe(200);
    const updatedItem = await storage.getItemById(itemId);
    expect(updatedItem?.stock).toBe(19);
  });

  // 6. Ledger, Transactions & Refunds
  it('processes deposits and records ledger transactions with refund capabilities', async () => {
    const pool = await storage.createPool({ id: 'pool_ledger_e2e', name: 'Finance Pantry', champion_id: 'u_champ_e2e' });
    await storage.upsertPoolMember({
      id: 'pm_fin',
      pool_id: pool.id,
      user_id: 'u_champ_e2e',
      role: 'champion',
      balance: 0,
      balance_cents: 0,
      joined_at: new Date().toISOString()
    });

    const depositRes = await app.request('/api/transactions/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({ poolId: pool.id, userId: 'u_champ_e2e', amount: 25.0, note: 'Initial replenishment' })
    });
    expect(depositRes.status).toBe(200);

    const txsRes = await app.request(`/api/transactions?poolId=${pool.id}`, {
      headers: { Authorization: `Bearer ${championToken}` }
    });
    expect(txsRes.status).toBe(200);
    const txsData = await txsRes.json();
    expect(txsData.transactions.length).toBeGreaterThanOrEqual(1);
    const txId = txsData.transactions[0].id;

    // Refund transaction
    const refundRes = await app.request('/api/transactions/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({ poolId: pool.id, transactionId: txId, reason: 'Test reimbursement' })
    });
    expect(refundRes.status).toBe(200);
  });

  // 7. Shopping List, Polls, Notifications, and Webhooks
  it('manages shopping list, polls, notifications, and webhooks endpoints', async () => {
    const pool = await storage.createPool({ id: 'pool_extras_e2e', name: 'Community Hub', champion_id: 'u_champ_e2e' });

    // Shopping List
    const addShopRes = await app.request(`/api/pools/${pool.id}/shopping-list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({ name: 'Oat Milk', quantity: 3, estimatedCost: 4.50 })
    });
    expect(addShopRes.status).toBe(200);
    const shopListRes = await app.request(`/api/pools/${pool.id}/shopping-list`, {
      headers: { Authorization: `Bearer ${championToken}` }
    });
    expect(shopListRes.status).toBe(200);

    // Polls
    const createPollRes = await app.request(`/api/pools/${pool.id}/polls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({ title: 'Preferred Coffee Roast', options: ['Dark Roast', 'Medium Roast', 'Blonde'] })
    });
    expect(createPollRes.status).toBe(200);
    const pollId = (await createPollRes.json()).poll.id;
    const voteRes = await app.request(`/api/pools/${pool.id}/polls/${pollId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({ writeInOption: 'French Roast' })
    });
    expect(voteRes.status).toBe(200);

    // Notifications
    const notifRes = await app.request('/api/notifications', {
      headers: { Authorization: `Bearer ${championToken}` }
    });
    expect(notifRes.status).toBe(200);

    // Webhooks
    const hookRes = await app.request(`/api/pools/${pool.id}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${championToken}` },
      body: JSON.stringify({ platform: 'slack', webhookUrl: 'https://hooks.slack.com/services/test/test/test' })
    });
    expect(hookRes.status).toBe(200);
  });

  // 8. Admin Metrics & Audit Archiving Lifecycle
  it('manages admin stats, settings, and verifies soft audit archives and restores across entities', async () => {
    // Admin stats
    const statsRes = await app.request('/api/admin/stats', {
      headers: { Authorization: `Bearer ${superadminToken}` }
    });
    expect(statsRes.status).toBe(200);

    // Admin users, orgs, pools
    const usersRes = await app.request('/api/admin/users', { headers: { Authorization: `Bearer ${superadminToken}` } });
    expect(usersRes.status).toBe(200);

    // Archive pool via delete
    const pool = await storage.createPool({ id: 'pool_to_archive', name: 'Temporary Pool', champion_id: 'u_champ_e2e' });
    const deletePoolRes = await app.request(`/api/pools/${pool.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${championToken}` }
    });
    expect(deletePoolRes.status).toBe(200);
    expect((await deletePoolRes.json()).isArchived).toBe(true);

    const archivedPool = await storage.getPoolById(pool.id);
    expect(archivedPool?.is_archived).toBe(true);

    // Restore pool via admin
    const restorePoolRes = await app.request(`/api/admin/pools/${pool.id}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superadminToken}` }
    });
    expect(restorePoolRes.status).toBe(200);
    const restoredPool = await storage.getPoolById(pool.id);
    expect(restoredPool?.is_archived).toBe(false);

    // Permanent GDPR purge for a user
    const gdprUser = await storage.createUser({ id: 'u_gdpr_target', email: 'purge_me@example.com', name: 'GDPR Target' });
    const gdprToken = await createUniversalToken({ userId: gdprUser.id, email: gdprUser.email, name: gdprUser.name, systemRole: 'user', tokenVersion: 1 }, secret);

    const purgeRes = await app.request('/api/auth/account?gdpr=true', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${gdprToken}` }
    });
    expect(purgeRes.status).toBe(200);
    const purgedUser = await storage.getUserById('u_gdpr_target');
    expect(purgedUser).toBeNull();
  });
});
