import { describe, it, expect, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { StorageAdapter } from '../src/server/storage/types';
import { createUniversalToken } from '../src/server/api/authUtils';

class MockMultiTenantStorage implements StorageAdapter {
  users: Map<string, any> = new Map();
  orgs: Map<string, any> = new Map();
  orgMembers: Map<string, any> = new Map();
  pools: Map<string, any> = new Map();
  poolMembers: Map<string, any> = new Map();
  items: Map<string, any> = new Map();
  transactions: Map<string, any> = new Map();
  webhooks: Map<string, any> = new Map();
  shoppingItems: Map<string, any> = new Map();
  polls: Map<string, any> = new Map();
  settings: Record<string, any> = {};

  // User methods
  async getUserById(id: string) { return this.users.get(id) || null; }
  async getUserByEmail(email: string) {
    return Array.from(this.users.values()).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }
  async createUser(user: any) { this.users.set(user.id, { ...user, token_version: 1 }); return user; }
  async updateUser(id: string, updates: any) {
    const u = this.users.get(id);
    if (u) this.users.set(id, { ...u, ...updates });
  }
  async listUsers() { return Array.from(this.users.values()); }
  async bumpTokenVersion() { return 1; }
  async deleteUser(id: string) { this.users.delete(id); }

  async createPasswordResetToken() {}
  async getPasswordResetToken() { return null; }
  async markPasswordResetTokenUsed() {}

  // Organization methods
  async getOrgById(id: string) { return this.orgs.get(id) || null; }
  async getOrgByNameAndOwner(name: string, ownerId: string) {
    return Array.from(this.orgs.values()).find(o => o.name.toLowerCase() === name.toLowerCase() && o.owner_id === ownerId) || null;
  }
  async getOrgByInviteCode(code: string) {
    return Array.from(this.orgs.values()).find(o => o.invite_code === code) || null;
  }
  async getOrgByStripeCustomerId(customerId: string) {
    return Array.from(this.orgs.values()).find(o => o.stripe_customer_id === customerId) || null;
  }
  async listOrgsByOwner(ownerId: string) {
    return Array.from(this.orgs.values()).filter(o => o.owner_id === ownerId);
  }
  async listOrgsForUser(userId: string) {
    const memberships = Array.from(this.orgMembers.values()).filter(m => m.user_id === userId);
    const orgIds = new Set(memberships.map(m => m.organization_id));
    return Array.from(this.orgs.values()).filter(o => o.owner_id === userId || orgIds.has(o.id));
  }
  async listAllOrgsForAdmin() { return Array.from(this.orgs.values()); }
  async createOrg(org: any) { this.orgs.set(org.id, org); return org; }
  async updateOrg(id: string, updates: any) {
    const o = this.orgs.get(id);
    if (o) this.orgs.set(id, { ...o, ...updates });
  }
  async updateOrgTier(id: string, tier: string) {
    const o = this.orgs.get(id);
    if (o) o.tier = tier;
  }
  async deleteOrg(id: string) { this.orgs.delete(id); }

  // Org member methods
  async addOrgMember(member: any) { this.orgMembers.set(`${member.organization_id}_${member.user_id}`, member); }
  async getOrgMember(orgId: string, userId: string) { return this.orgMembers.get(`${orgId}_${userId}`) || null; }
  async listOrgMembers(orgId: string) {
    return Array.from(this.orgMembers.values()).filter(m => m.organization_id === orgId);
  }
  async removeOrgMember(orgId: string, userId: string) { this.orgMembers.delete(`${orgId}_${userId}`); }

  // Pool methods
  async getPoolById(id: string) { return this.pools.get(id) || null; }
  async getPoolByCode(code: string) {
    return Array.from(this.pools.values()).find(p => p.qr_code_key === code || p.code === code) || null;
  }
  async listPoolsForUser(userId: string) {
    const userMemberships = Array.from(this.poolMembers.values()).filter(m => m.user_id === userId);
    const poolIds = new Set(userMemberships.map(m => m.pool_id));
    return Array.from(this.pools.values()).filter(p => p.champion_id === userId || poolIds.has(p.id));
  }
  async getPoolsByOrg(orgId: string) {
    return Array.from(this.pools.values()).filter(p => p.organization_id === orgId);
  }
  async getAllPools() { return Array.from(this.pools.values()); }
  async listAllPoolsForAdmin() { return Array.from(this.pools.values()); }
  async countPoolsByOrg(orgId: string) {
    return Array.from(this.pools.values()).filter(p => p.organization_id === orgId).length;
  }
  async countPersonalPools(userId: string) {
    return Array.from(this.pools.values()).filter(p => p.champion_id === userId && !p.organization_id).length;
  }
  async createPool(pool: any) { this.pools.set(pool.id, pool); return pool; }
  async updatePool(id: string, updates: any) {
    const p = this.pools.get(id);
    if (p) this.pools.set(id, { ...p, ...updates });
  }
  async deletePool(id: string) { this.pools.delete(id); }

  // Pool member methods
  async getPoolMember(poolId: string, userId: string) { return this.poolMembers.get(`${poolId}_${userId}`) || null; }
  async listPoolMembers(poolId: string) {
    return Array.from(this.poolMembers.values()).filter(m => m.pool_id === poolId);
  }
  async upsertPoolMember(member: any) {
    this.poolMembers.set(`${member.pool_id}_${member.user_id}`, {
      ...member,
      balance: member.balance || 0,
      balance_cents: member.balance_cents !== undefined ? member.balance_cents : Math.round((member.balance || 0) * 100)
    });
  }
  async updateMemberRole(poolId: string, userId: string, role: string) {
    const m = this.poolMembers.get(`${poolId}_${userId}`);
    if (m) m.role = role;
  }
  async removePoolMember(poolId: string, userId: string) { this.poolMembers.delete(`${poolId}_${userId}`); }
  async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number) {
    const m = this.poolMembers.get(`${poolId}_${userId}`);
    if (m) {
      m.balance = (m.balance || 0) + deltaAmount;
      m.balance_cents = (m.balance_cents || 0) + deltaCents;
    }
  }

  // Items
  async getItemById(id: string) { return this.items.get(id) || null; }
  async listItemsByPool(poolId: string) { return Array.from(this.items.values()).filter(i => i.pool_id === poolId); }
  async searchItems() { return Array.from(this.items.values()); }
  async saveItem(item: any) { this.items.set(item.id, item); return item; }
  async deleteItem(id: string) { this.items.delete(id); }
  async adjustItemStock(id: string, deltaQty: number) {
    const item = this.items.get(id);
    if (item) item.stock = (item.stock || 0) + deltaQty;
  }

  // Transactions
  async getTransactionById(id: string) { return this.transactions.get(id) || null; }
  async listTransactionsByPool(poolId: string) {
    return Array.from(this.transactions.values()).filter(t => t.pool_id === poolId);
  }
  async createTransaction(tx: any) { this.transactions.set(tx.id, tx); return tx; }

  // Webhooks
  async listWebhooks(poolId: string) { return Array.from(this.webhooks.values()).filter(w => w.pool_id === poolId); }
  async saveWebhook(wh: any) { this.webhooks.set(wh.id, wh); return wh; }
  async deleteWebhook(id: string, poolId?: string) { this.webhooks.delete(id); }

  // Shopping & Polls
  async listShoppingItems(poolId: string) { return Array.from(this.shoppingItems.values()).filter(s => s.pool_id === poolId); }
  async createShoppingItem(item: any) { this.shoppingItems.set(item.id, item); return item; }
  async updateShoppingItemStatus(id: string, poolId: string, purchased: boolean) {
    const s = this.shoppingItems.get(id);
    if (s && s.pool_id === poolId) s.purchased = purchased;
  }
  async deleteShoppingItem(id: string, poolId: string) {
    const s = this.shoppingItems.get(id);
    if (s && s.pool_id === poolId) this.shoppingItems.delete(id);
  }

  async listPolls(poolId: string) { return Array.from(this.polls.values()).filter(p => p.pool_id === poolId); }
  async getPollById(id: string) { return this.polls.get(id) || null; }
  async createPoll(poll: any) { this.polls.set(poll.id, poll); return poll; }
  async updatePoll(id: string, poolId: string, updates: any) {
    const p = this.polls.get(id);
    if (p && p.pool_id === poolId) Object.assign(p, updates);
  }
  async deletePoll(id: string, poolId: string) {
    const p = this.polls.get(id);
    if (p && p.pool_id === poolId) this.polls.delete(id);
  }

  // Notifications & Admin Settings
  notifications: any[] = [];
  async listNotifications(userId: string, limit = 50) {
    return this.notifications.filter(n => n.user_id === userId).slice(0, limit);
  }
  async createNotification(notif: any) { this.notifications.push(notif); return notif; }
  async markNotificationsRead() {}

  ssoConfigs: Map<string, any> = new Map();
  async getSsoConfigByDomain(domain: string) {
    return Array.from(this.ssoConfigs.values()).find(c => c.domain === domain) || null;
  }
  async getSsoConfigByOrg(orgId: string) {
    return Array.from(this.ssoConfigs.values()).find(c => c.organization_id === orgId) || null;
  }
  async getSsoConfigCount() { return this.ssoConfigs.size; }
  async saveSsoConfig(cfg: any) { this.ssoConfigs.set(cfg.id, cfg); return cfg; }

  async getSystemSettings() { return this.settings; }
  async saveSystemSettings(s: any) { this.settings = s; }
  async getPlatformStats() {
    return {
      totalUsers: this.users.size,
      totalPools: this.pools.size,
      totalTransactions: this.transactions.size,
      totalVolume: 500.00
    };
  }

  async recordTelemetryEvents() {}
  async getTelemetryStats() {
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
}

describe('🏰 Cross-Tenant Security & Strict Multi-Tenancy Boundaries', () => {
  const JWT_SECRET = 'cross-tenant-secret-guardrail-xyz123!';
  let storage: MockMultiTenantStorage;
  let app: ReturnType<typeof createUniversalApi>;

  // Token holders
  let tokenTenantAOwner: string;
  let tokenTenantAMember: string;
  let tokenTenantBOwner: string;
  let tokenTenantBMember: string;
  let tokenStranger: string;
  let tokenSuperadmin: string;

  beforeEach(async () => {
    storage = new MockMultiTenantStorage();

    // 1. Seed Users
    await storage.createUser({ id: 'u_tenant_a_owner', email: 'owner@tenant-alpha.com', name: 'Alpha Owner', system_role: 'user' });
    await storage.createUser({ id: 'u_tenant_a_member', email: 'member@tenant-alpha.com', name: 'Alpha Member', system_role: 'user' });
    await storage.createUser({ id: 'u_tenant_b_owner', email: 'owner@tenant-beta.com', name: 'Beta Owner', system_role: 'user' });
    await storage.createUser({ id: 'u_tenant_b_member', email: 'member@tenant-beta.com', name: 'Beta Member', system_role: 'user' });
    await storage.createUser({ id: 'u_stranger', email: 'stranger@external.com', name: 'Charlie Stranger', system_role: 'user' });
    await storage.createUser({ id: 'u_superadmin', email: 'admin@pantrypool.com', name: 'Super Admin', system_role: 'superadmin' });

    // 2. Generate Cryptographic JWT Tokens
    tokenTenantAOwner = await createUniversalToken({
      userId: 'u_tenant_a_owner',
      email: 'owner@tenant-alpha.com',
      name: 'Alpha Owner',
      systemRole: 'user'
    }, JWT_SECRET);

    tokenTenantAMember = await createUniversalToken({
      userId: 'u_tenant_a_member',
      email: 'member@tenant-alpha.com',
      name: 'Alpha Member',
      systemRole: 'user'
    }, JWT_SECRET);

    tokenTenantBOwner = await createUniversalToken({
      userId: 'u_tenant_b_owner',
      email: 'owner@tenant-beta.com',
      name: 'Beta Owner',
      systemRole: 'user'
    }, JWT_SECRET);

    tokenTenantBMember = await createUniversalToken({
      userId: 'u_tenant_b_member',
      email: 'member@tenant-beta.com',
      name: 'Beta Member',
      systemRole: 'user'
    }, JWT_SECRET);

    tokenStranger = await createUniversalToken({
      userId: 'u_stranger',
      email: 'stranger@external.com',
      name: 'Charlie Stranger',
      systemRole: 'user'
    }, JWT_SECRET);

    tokenSuperadmin = await createUniversalToken({
      userId: 'u_superadmin',
      email: 'admin@pantrypool.com',
      name: 'Super Admin',
      systemRole: 'superadmin'
    }, JWT_SECRET);

    // 3. Seed Tenant A Organization, Pool, Items, and Ledger
    await storage.createOrg({
      id: 'org_alpha',
      name: 'Alpha Corp',
      owner_id: 'u_tenant_a_owner',
      tier: 'pro',
      invite_code: 'ALPHA_INVITE',
      stripe_customer_id: 'cus_alpha_123',
      stripe_subscription_id: 'sub_alpha_123'
    });
    await storage.addOrgMember({ id: 'om_a1', organization_id: 'org_alpha', user_id: 'u_tenant_a_owner', role: 'owner' });
    await storage.addOrgMember({ id: 'om_a2', organization_id: 'org_alpha', user_id: 'u_tenant_a_member', role: 'member' });

    await storage.createPool({
      id: 'pool_alpha',
      organization_id: 'org_alpha',
      name: 'Alpha Breakroom',
      champion_id: 'u_tenant_a_owner',
      max_deficit: 15.00,
      max_deficit_cents: 1500,
      qr_code_key: 'PPALPH'
    });
    await storage.upsertPoolMember({
      id: 'pm_a1',
      pool_id: 'pool_alpha',
      user_id: 'u_tenant_a_owner',
      role: 'champion',
      balance: 20.00,
      balance_cents: 2000
    });
    await storage.upsertPoolMember({
      id: 'pm_a2',
      pool_id: 'pool_alpha',
      user_id: 'u_tenant_a_member',
      role: 'member',
      balance: 10.00,
      balance_cents: 1000
    });

    await storage.saveItem({
      id: 'item_alpha_coffee',
      pool_id: 'pool_alpha',
      name: 'Cold Brew Nitro Can',
      category: 'Drinks',
      cost_per_unit: 3.50,
      cost_per_unit_cents: 350,
      stock: 12
    });

    await storage.createTransaction({
      id: 'tx_alpha_consume',
      pool_id: 'pool_alpha',
      user_id: 'u_tenant_a_member',
      type: 'consume',
      amount: -3.50,
      amount_cents: -350,
      description: 'Grabbed 1x Cold Brew Nitro Can'
    });

    await storage.saveWebhook({
      id: 'wh_alpha_slack',
      pool_id: 'pool_alpha',
      platform: 'slack',
      webhook_url: 'https://hooks.slack.com/services/T_ALPHA/B_ALPHA/SECRET_TOKEN',
      channel_name: '#alpha-breakroom'
    });

    await storage.createShoppingItem({
      id: 'shop_alpha_1',
      pool_id: 'pool_alpha',
      name: 'Sparkling Lime Seltzer',
      category: 'Drinks',
      quantity: 3,
      suggested_by: 'Alpha Member'
    });

    await storage.createPoll({
      id: 'poll_alpha_1',
      pool_id: 'pool_alpha',
      title: 'Which coffee beans next month?',
      options_json: JSON.stringify([
        { id: 'opt_1', name: 'Ethiopian Yirgacheffe', votes: [] },
        { id: 'opt_2', name: 'Colombian Supremo', votes: [] }
      ]),
      created_by: 'Alpha Owner',
      status: 'active'
    });

    await storage.saveSsoConfig({
      id: 'sso_alpha_1',
      organization_id: 'org_alpha',
      domain: 'tenant-alpha.com',
      idp_entity_id: 'https://idp.tenant-alpha.com',
      sso_url: 'https://idp.tenant-alpha.com/sso',
      enabled: true
    });

    // 4. Seed Tenant B Organization, Pool, and Items
    await storage.createOrg({
      id: 'org_beta',
      name: 'Beta Labs',
      owner_id: 'u_tenant_b_owner',
      tier: 'starter',
      invite_code: 'BETA_INVITE',
      stripe_customer_id: 'cus_beta_456',
      stripe_subscription_id: 'sub_beta_456'
    });
    await storage.addOrgMember({ id: 'om_b1', organization_id: 'org_beta', user_id: 'u_tenant_b_owner', role: 'owner' });
    await storage.addOrgMember({ id: 'om_b2', organization_id: 'org_beta', user_id: 'u_tenant_b_member', role: 'member' });

    await storage.createPool({
      id: 'pool_beta',
      organization_id: 'org_beta',
      name: 'Beta Micro-Kitchen',
      champion_id: 'u_tenant_b_owner',
      max_deficit: 10.00,
      max_deficit_cents: 1000,
      qr_code_key: 'PPBETA'
    });
    await storage.upsertPoolMember({
      id: 'pm_b1',
      pool_id: 'pool_beta',
      user_id: 'u_tenant_b_owner',
      role: 'champion',
      balance: 5.00,
      balance_cents: 500
    });
    await storage.upsertPoolMember({
      id: 'pm_b2',
      pool_id: 'pool_beta',
      user_id: 'u_tenant_b_member',
      role: 'member',
      balance: 5.00,
      balance_cents: 500
    });

    await storage.saveItem({
      id: 'item_beta_tea',
      pool_id: 'pool_beta',
      name: 'Matcha Green Tea',
      category: 'Drinks',
      cost_per_unit: 2.00,
      cost_per_unit_cents: 200,
      stock: 8
    });

    app = createUniversalApi(storage, JWT_SECRET);
  });

  // =========================================================================
  // 1. ORGANIZATION / WORKSPACE ISOLATION & IDOR DEFENSE
  // =========================================================================
  describe('🏢 Organization & Workspace Isolation (IDOR Defense)', () => {
    it('blocks Tenant B owner from viewing Tenant A organization details (403)', async () => {
      const res = await app.request('/api/organizations/org_alpha', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('blocks Tenant B member from viewing Tenant A organization details (403)', async () => {
      const res = await app.request('/api/organizations/org_alpha', {
        headers: { 'Authorization': `Bearer ${tokenTenantBMember}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('blocks unaffiliated stranger from viewing Tenant A organization details (403)', async () => {
      const res = await app.request('/api/organizations/org_alpha', {
        headers: { 'Authorization': `Bearer ${tokenStranger}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('allows legitimate Tenant A owner and member to read Tenant A details (200)', async () => {
      const resOwner = await app.request('/api/organizations/org_alpha', {
        headers: { 'Authorization': `Bearer ${tokenTenantAOwner}` }
      });
      expect(resOwner.status).toBe(200);
      const jsonOwner: any = await resOwner.json();
      expect(jsonOwner.success).toBe(true);
      expect(jsonOwner.organization.name).toBe('Alpha Corp');
      expect(jsonOwner.organization.role).toBe('owner');

      const resMember = await app.request('/api/organizations/org_alpha', {
        headers: { 'Authorization': `Bearer ${tokenTenantAMember}` }
      });
      expect(resMember.status).toBe(200);
      const jsonMember: any = await resMember.json();
      expect(jsonMember.success).toBe(true);
      expect(jsonMember.organization.role).toBe('member');
    });

    it('blocks Tenant B from listing members of Tenant A organization (403)', async () => {
      const res = await app.request('/api/organizations/org_alpha/members', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('blocks Tenant B from evicting a member from Tenant A organization (403)', async () => {
      const res = await app.request('/api/organizations/org_alpha/members/u_tenant_a_member', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      // Verify member was NOT deleted
      const member = await storage.getOrgMember('org_alpha', 'u_tenant_a_member');
      expect(member).not.toBeNull();
    });

    it('blocks Tenant B from deleting Tenant A organization (403)', async () => {
      const res = await app.request('/api/organizations/org_alpha', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      // Verify org was NOT deleted
      const org = await storage.getOrgById('org_alpha');
      expect(org).not.toBeNull();
    });

    it('blocks Tenant B from escalating Tenant A organization tier (403)', async () => {
      const res = await app.request('/api/organizations/org_alpha/tier', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tier: 'enterprise' })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const org = await storage.getOrgById('org_alpha');
      expect(org?.tier).toBe('pro');
    });

    it('ensures GET /api/organizations strictly scopes listings to caller and never leaks other tenants', async () => {
      const res = await app.request('/api/organizations', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.organizations.length).toBe(1);
      expect(json.organizations[0].id).toBe('org_beta');
      expect(json.organizations.some((o: any) => o.id === 'org_alpha')).toBe(false);
    });
  });

  // =========================================================================
  // 2. POOL ISOLATION & ACCESS BOUNDARY PROTECTION
  // =========================================================================
  describe('🏊 Pool Scoping & Boundary Enforcement', () => {
    it('prevents Tenant B from discovering Tenant A pools via org filter query', async () => {
      const res = await app.request('/api/pools?orgId=org_alpha', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      // Caller has no membership in org_alpha, so pools returned must be empty
      expect(json.pools.length).toBe(0);
    });

    it('blocks Tenant B from modifying Tenant A pool settings (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Hacked Alpha Pool', maxDeficit: 999 })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const pool = await storage.getPoolById('pool_alpha');
      expect(pool?.name).toBe('Alpha Breakroom');
      expect(pool?.max_deficit).toBe(15.00);
    });

    it('blocks Tenant B from deleting Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const pool = await storage.getPoolById('pool_alpha');
      expect(pool).not.toBeNull();
    });

    it('blocks Tenant B from injecting members into Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/members', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: 'u_tenant_b_member', role: 'member' })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const member = await storage.getPoolMember('pool_alpha', 'u_tenant_b_member');
      expect(member).toBeNull();
    });

    it('blocks Tenant B from altering member roles in Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/members/u_tenant_a_member/role', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'champion' })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const member = await storage.getPoolMember('pool_alpha', 'u_tenant_a_member');
      expect(member?.role).toBe('member');
    });

    it('blocks Tenant B from evicting members from Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/members/u_tenant_a_member', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const member = await storage.getPoolMember('pool_alpha', 'u_tenant_a_member');
      expect(member).not.toBeNull();
    });

    it('blocks Tenant B from creating a pool scoped to Tenant A workspace (403)', async () => {
      const res = await app.request('/api/pools', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Trojan Breakroom',
          organizationId: 'org_alpha',
          category: 'Office'
        })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('allows Tenant A owner to create pools in Tenant A workspace (200)', async () => {
      const res = await app.request('/api/pools', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantAOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Alpha 2nd Floor Pantry',
          organizationId: 'org_alpha',
          category: 'Office'
        })
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.pool.name).toBe('Alpha 2nd Floor Pantry');
    });

    it('blocks Tenant B from snooping member rosters and balances of Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/members', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('allows legitimate Tenant A member to view member roster of Tenant A pool (200)', async () => {
      const res = await app.request('/api/pools/pool_alpha/members', {
        headers: { 'Authorization': `Bearer ${tokenTenantAMember}` }
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.members.length).toBe(2);
    });

    it('blocks unauthenticated callers from inspecting pool members (401)', async () => {
      const res = await app.request('/api/pools/pool_alpha/members');
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authentication required');
    });

    it('redacts member PII (email, P2P handles) from GET /api/pools for unauthenticated visitors', async () => {
      const res = await app.request('/api/pools');
      expect(res.status).toBe(200);
      const json: any = await res.json();
      const alphaPool = json.pools.find((p: any) => p.id === 'pool_alpha');
      if (alphaPool && alphaPool.members && alphaPool.members.length > 0) {
        for (const m of alphaPool.members) {
          expect(m.email).toBeUndefined();
          expect(m.venmoHandle).toBeUndefined();
          expect(m.cashappHandle).toBeUndefined();
          expect(m.paypalHandle).toBeUndefined();
          expect(m.zelleIdentifier).toBeUndefined();
          expect(m.applePayHandle).toBeUndefined();
        }
      }
    });

    it('blocks Tenant B from sending balance reminder nudge to Tenant A member (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/nudge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: 'u_tenant_a_member' })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('blocks Tenant B from inspecting private savings summary of Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/savings', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. INVENTORY & ITEM CROSS-TENANT DEFENSE
  // =========================================================================
  describe('📦 Inventory & Item Cross-Tenant Defense', () => {
    it('blocks Tenant B from creating an item inside Tenant A pool (403)', async () => {
      const res = await app.request('/api/items', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          poolId: 'pool_alpha',
          name: 'Unauthorized Energy Drink',
          costPerUnit: 4.00,
          stock: 20
        })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('blocks Tenant B from modifying Tenant A items (403)', async () => {
      const res = await app.request('/api/items/item_alpha_coffee', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ costPerUnit: 0.01, stock: 0 })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const item = await storage.getItemById('item_alpha_coffee');
      expect(item?.cost_per_unit).toBe(3.50);
      expect(item?.stock).toBe(12);
    });

    it('blocks Tenant B from deleting Tenant A items (403)', async () => {
      const res = await app.request('/api/items/item_alpha_coffee', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const item = await storage.getItemById('item_alpha_coffee');
      expect(item).not.toBeNull();
    });

    it('blocks Tenant B from consuming items from Tenant A pool (403)', async () => {
      const res = await app.request('/api/items/consume', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBMember}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          poolId: 'pool_alpha',
          itemId: 'item_alpha_coffee',
          quantity: 1
        })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('not a member');

      // Verify stock was not decremented
      const item = await storage.getItemById('item_alpha_coffee');
      expect(item?.stock).toBe(12);
    });

    it('neutralizes spoofed userId payload: strictly binds to verified JWT identity', async () => {
      // Tenant B tries to charge Tenant A member by specifying userId: 'u_tenant_a_member' in payload
      const res = await app.request('/api/items/consume', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBMember}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          poolId: 'pool_alpha',
          itemId: 'item_alpha_coffee',
          quantity: 1,
          userId: 'u_tenant_a_member' // Spoofed body parameter
        })
      });
      // The API binds actingUserId to user.userId (u_tenant_b_member) and rejects with 403
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      // Verify User A member balance was NOT deducted
      const memberA = await storage.getPoolMember('pool_alpha', 'u_tenant_a_member');
      expect(memberA?.balance_cents).toBe(1000);
    });

    it('blocks Tenant B from adjusting inventory count on Tenant A item via discrepancy endpoint (403)', async () => {
      const res = await app.request('/api/items/discrepancy', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          poolId: 'pool_alpha',
          itemId: 'item_alpha_coffee',
          actualStock: 0,
          reason: 'visitor_take'
        })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const item = await storage.getItemById('item_alpha_coffee');
      expect(item?.stock).toBe(12);
    });
  });

  // =========================================================================
  // 4. FINANCIAL LEDGER & TRANSACTION DEFENSE
  // =========================================================================
  describe('💳 Financial Ledger & Transaction Tampering', () => {
    it('blocks Tenant B from refunding Tenant A transaction via route param (403)', async () => {
      const res = await app.request('/api/transactions/tx_alpha_consume/refund', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('blocks Tenant B from refunding Tenant A transaction via body payload (403)', async () => {
      const res = await app.request('/api/transactions/refund', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transactionId: 'tx_alpha_consume' })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('allows legitimate Tenant A champion to refund Tenant A transaction (200)', async () => {
      const res = await app.request('/api/transactions/tx_alpha_consume/refund', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenTenantAOwner}` }
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.originalTransactionId).toBe('tx_alpha_consume');
    });

    it('blocks Tenant B from inspecting Tenant A financial transaction ledger (403)', async () => {
      const res = await app.request('/api/transactions?poolId=pool_alpha', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('allows legitimate Tenant A member to inspect Tenant A transactions ledger (200)', async () => {
      const res = await app.request('/api/transactions?poolId=pool_alpha', {
        headers: { 'Authorization': `Bearer ${tokenTenantAMember}` }
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.transactions.length).toBeGreaterThan(0);
    });

    it('blocks Tenant B from depositing funds into Tenant A pool ledger (403)', async () => {
      const res = await app.request('/api/transactions/deposit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          poolId: 'pool_alpha',
          amount: 50.00,
          description: 'Malicious deposit injection'
        })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // 5. WEBHOOK & EVENT SNOOPING DEFENSE
  // =========================================================================
  describe('🔔 Webhook & Event Leakage Protection', () => {
    it('blocks Tenant B from viewing secret webhook URLs of Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/webhooks', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('blocks Tenant B from registering external webhooks into Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/webhooks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          platform: 'slack',
          webhookUrl: 'https://attacker.com/webhook-snoop',
          channelName: '#exfiltration'
        })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const webhooks = await storage.listWebhooks('pool_alpha');
      expect(webhooks.some(w => w.webhook_url.includes('attacker.com'))).toBe(false);
    });

    it('blocks Tenant B from deleting webhooks in Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/webhooks/wh_alpha_slack', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const wh = Array.from(storage.webhooks.values()).find(w => w.id === 'wh_alpha_slack');
      expect(wh).toBeDefined();
    });

    it('blocks unauthenticated callers from viewing webhooks (401)', async () => {
      const res = await app.request('/api/pools/pool_alpha/webhooks');
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('blocks unauthenticated callers from registering webhooks (401)', async () => {
      const res = await app.request('/api/pools/pool_alpha/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'slack',
          webhookUrl: 'https://hooks.slack.com/services/test',
          channelName: '#general'
        })
      });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('blocks unauthenticated callers from deleting webhooks (401)', async () => {
      const res = await app.request('/api/pools/pool_alpha/webhooks/wh_alpha_slack', {
        method: 'DELETE'
      });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const wh = Array.from(storage.webhooks.values()).find(w => w.id === 'wh_alpha_slack');
      expect(wh).toBeDefined();
    });

    it('blocks unauthenticated callers from listing webhooks via the flat endpoint (401)', async () => {
      const res = await app.request('/api/webhooks?poolId=pool_alpha');
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('blocks unauthenticated callers from registering webhooks via the flat endpoint (401)', async () => {
      const res = await app.request('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: 'pool_alpha',
          webhookUrl: 'https://attacker.com/flat-endpoint-exfil'
        })
      });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const webhooks = await storage.listWebhooks('pool_alpha');
      expect(webhooks.some(w => w.webhook_url.includes('flat-endpoint-exfil'))).toBe(false);
    });

    it('blocks unauthenticated callers from deleting webhooks via the flat endpoint (401)', async () => {
      const res = await app.request('/api/webhooks/wh_alpha_slack?poolId=pool_alpha', {
        method: 'DELETE'
      });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const wh = Array.from(storage.webhooks.values()).find(w => w.id === 'wh_alpha_slack');
      expect(wh).toBeDefined();
    });

    it('neutralizes SSRF attempts targeting private IP ranges, localhost, and non-HTTPS targets (400)', async () => {
      const forbiddenTargets = [
        'http://169.254.169.254/latest/meta-data/',
        'http://localhost:3000/internal',
        'http://127.0.0.1:8080/admin',
        'https://10.0.0.1/webhook',
        'https://192.168.1.1/webhook',
        'https://172.16.0.1/webhook'
      ];

      for (const target of forbiddenTargets) {
        const res = await app.request('/api/pools/pool_alpha/webhooks', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenTenantAOwner}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            platform: 'slack',
            webhookUrl: target,
            channelName: '#alerts'
          })
        });
        expect(res.status).toBe(400);
        const json: any = await res.json();
        expect(json.success).toBe(false);
      }
    });

    it('neutralizes SSRF on test-dispatch endpoint (400 / 401)', async () => {
      // Unauthenticated attempt
      const unauthRes = await app.request('/api/webhooks/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: 'https://hooks.slack.com/services/test' })
      });
      expect(unauthRes.status).toBe(401);

      // Authenticated SSRF attempt
      const ssrfRes = await app.request('/api/webhooks/test-dispatch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantAOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ webhookUrl: 'http://169.254.169.254/latest/meta-data/' })
      });
      expect(ssrfRes.status).toBe(400);
    });
  });



  // =========================================================================
  // 7. PLATFORM SUPERADMIN PRIVILEGES & ELEVATION PREVENTION
  // =========================================================================
  describe('👑 Platform Superadmin Privilege Boundaries', () => {
    it('blocks Tenant A owner from accessing global platform users directory (403)', async () => {
      const res = await app.request('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${tokenTenantAOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('blocks Tenant A owner from accessing global platform organizations directory (403)', async () => {
      const res = await app.request('/api/admin/organizations', {
        headers: { 'Authorization': `Bearer ${tokenTenantAOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('blocks Tenant A owner from promoting their own user account to superadmin (403)', async () => {
      const res = await app.request('/api/admin/users/u_tenant_a_owner/role', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokenTenantAOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'superadmin' })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const user = await storage.getUserById('u_tenant_a_owner');
      expect(user?.system_role).toBe('user');
    });

    it('allows genuine superadmin to access cross-tenant administration (200)', async () => {
      const res = await app.request('/api/admin/organizations', {
        headers: { 'Authorization': `Bearer ${tokenSuperadmin}` }
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.organizations.length).toBe(2);
    });
  });

  // =========================================================================
  // 8. SHOPPING LIST & COMMUNAL POLLS MULTI-TENANT ISOLATION
  // =========================================================================
  describe('🛒 Shopping List & Communal Polls Multi-Tenant Isolation', () => {
    it('blocks Tenant B from viewing Tenant A shopping list (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/shopping-list', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('allows legitimate Tenant A member to view Tenant A shopping list (200)', async () => {
      const res = await app.request('/api/pools/pool_alpha/shopping-list', {
        headers: { 'Authorization': `Bearer ${tokenTenantAMember}` }
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.shoppingList.length).toBe(1);
      expect(json.shoppingList[0].name).toBe('Sparkling Lime Seltzer');
    });

    it('blocks Tenant B from adding items to Tenant A shopping list (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/shopping-list', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Unauthorized Snacks',
          quantity: 5,
          estimatedCost: 15.00
        })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const items = await storage.listShoppingItems('pool_alpha');
      expect(items.some(i => i.name === 'Unauthorized Snacks')).toBe(false);
    });

    it('blocks Tenant B from modifying status of Tenant A shopping items (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/shopping-list/shop_alpha_1', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ purchased: true })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const items = await storage.listShoppingItems('pool_alpha');
      const item = items.find(i => i.id === 'shop_alpha_1');
      expect(item?.purchased).toBeFalsy();
    });

    it('blocks Tenant B from deleting items from Tenant A shopping list (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/shopping-list/shop_alpha_1', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const items = await storage.listShoppingItems('pool_alpha');
      expect(items.some(i => i.id === 'shop_alpha_1')).toBe(true);
    });

    it('blocks Tenant B from viewing Tenant A communal polls (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/polls', {
        headers: { 'Authorization': `Bearer ${tokenTenantBOwner}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Forbidden');
    });

    it('allows legitimate Tenant A member to view Tenant A communal polls (200)', async () => {
      const res = await app.request('/api/pools/pool_alpha/polls', {
        headers: { 'Authorization': `Bearer ${tokenTenantAMember}` }
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.polls.length).toBe(1);
      expect(json.polls[0].title).toBe('Which coffee beans next month?');
    });

    it('blocks Tenant B from creating a poll in Tenant A pool (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/polls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Trojan Poll',
          options: ['Option A', 'Option B']
        })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const polls = await storage.listPolls('pool_alpha');
      expect(polls.some(p => p.title === 'Trojan Poll')).toBe(false);
    });

    it('blocks Tenant B from voting in Tenant A poll (403)', async () => {
      const res = await app.request('/api/pools/pool_alpha/polls/poll_alpha_1/vote', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBMember}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ optionId: 'opt_1' })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const poll = await storage.getPollById('poll_alpha_1');
      const opts = JSON.parse(poll?.options_json || '[]');
      expect(opts[0].votes.includes('u_tenant_b_member')).toBe(false);
    });

    it('allows legitimate Tenant A member to vote in Tenant A poll (200)', async () => {
      const res = await app.request('/api/pools/pool_alpha/polls/poll_alpha_1/vote', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantAMember}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ optionId: 'opt_1' })
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);

      const poll = await storage.getPollById('poll_alpha_1');
      const opts = JSON.parse(poll?.options_json || '[]');
      expect(opts[0].votes.includes('u_tenant_a_member')).toBe(true);
    });
  });



  // =========================================================================
  // 10. OFFLINE QUEUE BATCH SYNCHRONIZATION ISOLATION
  // =========================================================================
  describe('⚡ Offline Queue Batch Synchronization Isolation', () => {
    it('rejects Tenant B offline batch consumption against Tenant A pool without membership', async () => {
      const res = await app.request('/api/sync/offline-batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBMember}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actions: [
            {
              id: 'act_consume_1',
              action: 'consume_item',
              payload: {
                poolId: 'pool_alpha',
                itemId: 'item_alpha_coffee',
                quantity: 2
              }
            }
          ]
        })
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.results[0].success).toBe(false);
      expect(json.results[0].error).toContain('Forbidden');

      // Verify item stock was not decreased
      const item = await storage.getItemById('item_alpha_coffee');
      expect(item?.stock).toBe(12);
    });

    it('rejects Tenant B offline batch deposit against Tenant A pool without membership', async () => {
      const res = await app.request('/api/sync/offline-batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantBMember}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actions: [
            {
              id: 'act_deposit_1',
              action: 'deposit',
              payload: {
                poolId: 'pool_alpha',
                amount: 100.00,
                description: 'Unauthorized batch deposit'
              }
            }
          ]
        })
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.results[0].success).toBe(false);
      expect(json.results[0].error).toContain('Forbidden');
    });

    it('allows legitimate Tenant A member to process offline batch consumption in Tenant A pool', async () => {
      const res = await app.request('/api/sync/offline-batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantAMember}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actions: [
            {
              id: 'act_legit_1',
              action: 'consume_item',
              payload: {
                poolId: 'pool_alpha',
                itemId: 'item_alpha_coffee',
                quantity: 1
              }
            }
          ]
        })
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.results[0].success).toBe(true);

      const item = await storage.getItemById('item_alpha_coffee');
      expect(item?.stock).toBe(11);
    });
  });

  // =========================================================================
  // 12. COMPREHENSIVE OWASP FAIL-CLOSED VERIFICATION
  //     Unauthenticated callers must never reach the authorization logic.
  // =========================================================================
  describe('🛡️ Comprehensive OWASP Fail-Closed Verification', () => {
    it('blocks unauthenticated callers from adjusting inventory via discrepancy endpoint (401)', async () => {
      const stockBefore = (await storage.getItemById('item_alpha_coffee'))?.stock;
      const res = await app.request('/api/items/discrepancy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: 'pool_alpha',
          itemId: 'item_alpha_coffee',
          actualStock: 0,
          reason: 'visitor_take'
        })
      });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);

      const item = await storage.getItemById('item_alpha_coffee');
      expect(item?.stock).toBe(stockBefore);
    });

    it('blocks unauthenticated callers from inspecting private pool transaction ledger (401)', async () => {
      const res = await app.request('/api/transactions?poolId=pool_alpha');
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('blocks unauthenticated callers from inspecting private pool savings summary (401)', async () => {
      const res = await app.request('/api/pools/pool_alpha/savings');
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('blocks unauthenticated callers from triggering low-stock check (401)', async () => {
      const res = await app.request('/api/notifications/trigger-low-stock-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: 'pool_alpha' })
      });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('prevents spoofed userId bodies from forging the discrepancy audit trail actor', async () => {
      const before = await storage.listTransactionsByPool('pool_alpha');
      const res = await app.request('/api/items/discrepancy', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenTenantAOwner}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          poolId: 'pool_alpha',
          itemId: 'item_alpha_coffee',
          actualStock: 11,
          reason: 'audit_recount',
          userId: 'u_tenant_b_owner'
        })
      });
      expect(res.status).toBe(200);

      const after = await storage.listTransactionsByPool('pool_alpha');
      const newest = after.find(t => !before.some(b => b.id === t.id));
      expect(newest).toBeDefined();
      expect(newest?.user_id).toBe('u_tenant_a_owner');
    });
  });
});
