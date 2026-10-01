import {
  StorageAdapter,
  StorageUser,
  StoragePasskeyCredential,
  StorageOrganization,
  StorageOrganizationMember,
  StoragePool,
  StoragePoolMember,
  StorageItem,
  StorageTransaction,
  StorageShoppingItem,
  StoragePoll,
  StorageNotification,
  StorageWebhook,
  StorageSsoConfig,
  StorageTelemetryEvent,
  TelemetryStats,
  StoragePoolSavingsSummary,
  StorageGlobalSavingsLeaderboardResponse,
  StorageAffiliateProduct,
  StorageAffiliateClick,
  StorageAffiliateStats,
  StorageAffiliateImage,
  StorageUserAvatar,
  OrgTier
} from '../server/storage/types';

export class InMemoryStorageAdapter implements StorageAdapter {
  users: Map<string, StorageUser> = new Map();
  passkeys: Map<string, StoragePasskeyCredential> = new Map();
  passwordResetTokens: Map<string, any> = new Map();
  orgs: Map<string, StorageOrganization> = new Map();
  orgMembers: Map<string, StorageOrganizationMember> = new Map();
  pools: Map<string, StoragePool> = new Map();
  poolMembers: Map<string, StoragePoolMember> = new Map();
  items: Map<string, StorageItem> = new Map();
  transactions: Map<string, StorageTransaction> = new Map();
  shoppingItems: Map<string, StorageShoppingItem> = new Map();
  polls: Map<string, StoragePoll> = new Map();
  notifications: StorageNotification[] = [];
  webhooks: Map<string, StorageWebhook> = new Map();
  ssoConfigs: Map<string, StorageSsoConfig> = new Map();
  settings: Record<string, any> = {};
  telemetryEvents: StorageTelemetryEvent[] = [];
  affiliateProducts: Map<string, StorageAffiliateProduct> = new Map();
  affiliateClicks: StorageAffiliateClick[] = [];
  affiliateImages: Map<string, StorageAffiliateImage> = new Map();
  avatars: Map<string, StorageUserAvatar> = new Map();

  // ==========================================
  // Users & Auth
  // ==========================================
  async getUserById(id: string): Promise<StorageUser | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<StorageUser | null> {
    const target = email.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === target) return u;
    }
    return null;
  }

  async createUser(user: Partial<StorageUser> & { id: string; email: string; name: string }): Promise<StorageUser> {
    const created: StorageUser = {
      system_role: 'user',
      token_version: 1,
      is_archived: false,
      archived_at: null,
      created_at: new Date().toISOString(),
      ...user,
    };
    this.users.set(user.id, created);
    return created;
  }

  async updateUser(id: string, updates: Partial<StorageUser>): Promise<void> {
    const u = this.users.get(id);
    if (u) {
      this.users.set(id, { ...u, ...updates });
    }
  }

  async listUsers(): Promise<StorageUser[]> {
    return Array.from(this.users.values()).filter(u => !u.is_archived);
  }

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async bumpTokenVersion(userId: string): Promise<number> {
    const u = this.users.get(userId);
    if (u) {
      u.token_version = (u.token_version || 1) + 1;
      return u.token_version;
    }
    return 1;
  }

  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
  }

  async archiveUser(id: string): Promise<void> {
    const u = this.users.get(id);
    if (u) {
      u.is_archived = true;
      u.archived_at = new Date().toISOString();
    }
  }

  async restoreUser(id: string): Promise<void> {
    const u = this.users.get(id);
    if (u) {
      u.is_archived = false;
      u.archived_at = null;
    }
  }

  async listAllUsersForAdmin(): Promise<any[]> {
    return Array.from(this.users.values()).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatar_url || null,
      systemRole: u.system_role,
      isArchived: Boolean(u.is_archived),
      archivedAt: u.archived_at || null,
      poolCount: Array.from(this.poolMembers.values()).filter(pm => pm.user_id === u.id).length,
      createdAt: u.created_at || new Date().toISOString()
    }));
  }

  // ==========================================
  // Password Reset Tokens
  // ==========================================
  async createPasswordResetToken(token: { id: string; user_id: string; token_hash: string; expires_at: string; used?: boolean | number }): Promise<void> {
    this.passwordResetTokens.set(token.token_hash, { ...token, used: token.used ?? false });
  }

  async getPasswordResetToken(tokenHash: string): Promise<{ id: string; user_id: string; token_hash: string; expires_at: string; used: boolean | number } | null> {
    return this.passwordResetTokens.get(tokenHash) || null;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    for (const [k, v] of this.passwordResetTokens.entries()) {
      if (v.id === id) {
        this.passwordResetTokens.set(k, { ...v, used: true });
      }
    }
  }

  // ==========================================
  // Passkey / WebAuthn
  // ==========================================
  async createPasskeyCredential(cred: StoragePasskeyCredential): Promise<StoragePasskeyCredential> {
    this.passkeys.set(cred.id, cred);
    return cred;
  }

  async getPasskeyCredentialById(id: string): Promise<StoragePasskeyCredential | null> {
    return this.passkeys.get(id) || null;
  }

  async getPasskeyCredentialsByUserId(userId: string): Promise<StoragePasskeyCredential[]> {
    return Array.from(this.passkeys.values()).filter(p => p.user_id === userId);
  }

  async updatePasskeyCredentialCounter(id: string, counter: number, lastUsedAt?: string): Promise<void> {
    const p = this.passkeys.get(id);
    if (p) {
      p.counter = counter;
      if (lastUsedAt) p.last_used_at = lastUsedAt;
    }
  }

  async deletePasskeyCredential(id: string, userId: string): Promise<boolean> {
    const p = this.passkeys.get(id);
    if (p && p.user_id === userId) {
      return this.passkeys.delete(id);
    }
    return false;
  }

  // ==========================================
  // Organizations
  // ==========================================
  async getOrgById(id: string): Promise<StorageOrganization | null> {
    return this.orgs.get(id) || null;
  }

  async getOrgByNameAndOwner(name: string, ownerId: string): Promise<StorageOrganization | null> {
    const lowerName = name.toLowerCase();
    for (const o of this.orgs.values()) {
      if (o.name.toLowerCase() === lowerName && o.owner_id === ownerId) return o;
    }
    return null;
  }

  async getOrgByInviteCode(code: string): Promise<StorageOrganization | null> {
    for (const o of this.orgs.values()) {
      if (o.invite_code === code) return o;
    }
    return null;
  }

  async getOrgByStripeCustomerId(customerId: string): Promise<StorageOrganization | null> {
    for (const o of this.orgs.values()) {
      if (o.stripe_customer_id === customerId) return o;
    }
    return null;
  }

  async getOrgByStripeSubscriptionId(subscriptionId: string): Promise<StorageOrganization | null> {
    for (const o of this.orgs.values()) {
      if (o.stripe_subscription_id === subscriptionId) return o;
    }
    return null;
  }

  async listOrgsByOwner(ownerId: string): Promise<StorageOrganization[]> {
    return Array.from(this.orgs.values()).filter(o => o.owner_id === ownerId);
  }

  async listOrgsForUser(userId: string): Promise<StorageOrganization[]> {
    const memberships = Array.from(this.orgMembers.values()).filter(m => m.user_id === userId);
    const orgIds = new Set(memberships.map(m => m.organization_id));
    return Array.from(this.orgs.values()).filter(o => o.owner_id === userId || orgIds.has(o.id));
  }

  async listAllOrgsForAdmin(): Promise<any[]> {
    return Array.from(this.orgs.values());
  }

  async createOrg(org: Partial<StorageOrganization> & { id: string; name: string; owner_id: string }): Promise<StorageOrganization> {
    const created: StorageOrganization = {
      tier: 'community',
      created_at: new Date().toISOString(),
      ...org,
    };
    this.orgs.set(org.id, created);
    return created;
  }

  async updateOrgTier(id: string, tier: OrgTier | string): Promise<void> {
    const o = this.orgs.get(id);
    if (o) o.tier = tier;
  }

  async updateOrg(id: string, updates: Partial<StorageOrganization>): Promise<void> {
    const o = this.orgs.get(id);
    if (o) this.orgs.set(id, { ...o, ...updates });
  }

  async deleteOrg(id: string): Promise<void> {
    this.orgs.delete(id);
  }

  async archiveOrg(id: string): Promise<void> {
    const o = this.orgs.get(id);
    if (o) {
      o.is_archived = true;
      o.archived_at = new Date().toISOString();
    }
  }

  async restoreOrg(id: string): Promise<void> {
    const o = this.orgs.get(id);
    if (o) {
      o.is_archived = false;
      o.archived_at = null;
    }
  }

  async addOrgMember(member: StorageOrganizationMember): Promise<void> {
    this.orgMembers.set(`${member.organization_id}_${member.user_id}`, member);
  }

  async getOrgMember(orgId: string, userId: string): Promise<StorageOrganizationMember | null> {
    return this.orgMembers.get(`${orgId}_${userId}`) || null;
  }

  async listOrgMembers(orgId: string): Promise<StorageOrganizationMember[]> {
    return Array.from(this.orgMembers.values()).filter(m => m.organization_id === orgId);
  }

  async removeOrgMember(orgId: string, userId: string): Promise<void> {
    this.orgMembers.delete(`${orgId}_${userId}`);
  }

  // ==========================================
  // Pools & Members
  // ==========================================
  async getPoolById(id: string): Promise<StoragePool | null> {
    return this.pools.get(id) || null;
  }

  async getPoolByCode(code: string): Promise<StoragePool | null> {
    for (const p of this.pools.values()) {
      if (p.qr_code_key === code || (p as any).code === code) return p;
    }
    return null;
  }

  async getAllPools(): Promise<StoragePool[]> {
    return Array.from(this.pools.values()).filter(p => !p.is_archived);
  }

  async getPoolsByOrg(orgId: string): Promise<StoragePool[]> {
    return Array.from(this.pools.values()).filter(p => p.organization_id === orgId && !p.is_archived);
  }

  async listPoolsForUser(userId: string): Promise<StoragePool[]> {
    const userMemberships = Array.from(this.poolMembers.values()).filter(m => m.user_id === userId);
    const poolIds = new Set(userMemberships.map(m => m.pool_id));
    return Array.from(this.pools.values()).filter(p => (p.champion_id === userId || poolIds.has(p.id)) && !p.is_archived);
  }

  async listAllPoolsForAdmin(): Promise<any[]> {
    return Array.from(this.pools.values());
  }

  async createPool(pool: Partial<StoragePool> & { id: string; name: string }): Promise<StoragePool> {
    const created: StoragePool = {
      category: 'Office',
      currency: '$',
      created_at: new Date().toISOString(),
      ...pool,
    };
    this.pools.set(pool.id, created);
    return created;
  }

  async updatePool(id: string, updates: Partial<StoragePool>): Promise<void> {
    const p = this.pools.get(id);
    if (p) this.pools.set(id, { ...p, ...updates });
  }

  async deletePool(id: string): Promise<void> {
    this.pools.delete(id);
  }

  async archivePool(id: string): Promise<void> {
    const p = this.pools.get(id);
    if (p) {
      p.is_archived = true;
      p.archived_at = new Date().toISOString();
    }
  }

  async restorePool(id: string): Promise<void> {
    const p = this.pools.get(id);
    if (p) {
      p.is_archived = false;
      p.archived_at = null;
    }
  }

  async getPoolMember(poolId: string, userId: string): Promise<StoragePoolMember | null> {
    return this.poolMembers.get(`${poolId}_${userId}`) || null;
  }

  async listPoolMembers(poolId: string): Promise<StoragePoolMember[]> {
    return Array.from(this.poolMembers.values()).filter(m => m.pool_id === poolId);
  }

  async upsertPoolMember(member: Partial<StoragePoolMember> & { id: string; pool_id: string; user_id: string }): Promise<void> {
    const existing = this.poolMembers.get(`${member.pool_id}_${member.user_id}`);
    const balance = member.balance !== undefined ? member.balance : (existing?.balance ?? 0);
    const balance_cents = member.balance_cents !== undefined ? member.balance_cents : (existing?.balance_cents ?? Math.round(balance * 100));

    this.poolMembers.set(`${member.pool_id}_${member.user_id}`, {
      role: 'member',
      joined_at: new Date().toISOString(),
      ...existing,
      ...member,
      balance,
      balance_cents,
    });
  }

  async updateMemberRole(poolId: string, userId: string, role: string): Promise<void> {
    const m = this.poolMembers.get(`${poolId}_${userId}`);
    if (m) m.role = role as any;
  }

  async removePoolMember(poolId: string, userId: string): Promise<void> {
    this.poolMembers.delete(`${poolId}_${userId}`);
  }

  async countPoolsByOrg(orgId: string): Promise<number> {
    return Array.from(this.pools.values()).filter(p => p.organization_id === orgId && !p.is_archived).length;
  }

  async countPersonalPools(userId: string): Promise<number> {
    return Array.from(this.pools.values()).filter(p => p.champion_id === userId && !p.organization_id && !p.is_archived).length;
  }

  async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number): Promise<void> {
    const m = this.poolMembers.get(`${poolId}_${userId}`) || {
      id: `pm_${poolId}_${userId}`,
      pool_id: poolId,
      user_id: userId,
      role: 'member' as const,
      balance: 0,
      balance_cents: 0,
      joined_at: new Date().toISOString(),
    };
    m.balance += deltaAmount;
    m.balance_cents += deltaCents;
    this.poolMembers.set(`${poolId}_${userId}`, m);
  }

  // ==========================================
  // Items
  // ==========================================
  async getItemById(id: string): Promise<StorageItem | null> {
    return this.items.get(id) || null;
  }

  async listItemsByPool(poolId: string): Promise<StorageItem[]> {
    return Array.from(this.items.values()).filter(i => i.pool_id === poolId);
  }

  async searchItems(query: string, poolId?: string, limit = 20): Promise<StorageItem[]> {
    const lower = query.toLowerCase();
    return Array.from(this.items.values())
      .filter(i => (!poolId || i.pool_id === poolId) && (i.name.toLowerCase().includes(lower) || i.category.toLowerCase().includes(lower)))
      .slice(0, limit);
  }

  async saveItem(item: Partial<StorageItem> & { id: string; pool_id: string; name: string }): Promise<StorageItem> {
    const costPerUnit = item.cost_per_unit ?? 0;
    const costPerUnitCents = item.cost_per_unit_cents ?? Math.round(costPerUnit * 100);

    const saved: StorageItem = {
      category: 'General',
      stock: 0,
      min_stock: 0,
      cost_per_unit: costPerUnit,
      cost_per_unit_cents: costPerUnitCents,
      unit_name: 'unit',
      icon: 'package',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...this.items.get(item.id),
      ...item,
    };
    this.items.set(item.id, saved);
    return saved;
  }

  async deleteItem(id: string): Promise<void> {
    this.items.delete(id);
  }

  async adjustItemStock(id: string, deltaQty: number): Promise<void> {
    const item = this.items.get(id);
    if (item) {
      item.stock = Math.max(0, item.stock + deltaQty);
      item.updated_at = new Date().toISOString();
    }
  }

  // ==========================================
  // Transactions
  // ==========================================
  async getTransactionById(id: string): Promise<StorageTransaction | null> {
    return this.transactions.get(id) || null;
  }

  async listTransactionsByPool(poolId: string, limit?: number): Promise<StorageTransaction[]> {
    const list = Array.from(this.transactions.values()).filter(t => t.pool_id === poolId);
    return limit ? list.slice(0, limit) : list;
  }

  async createTransaction(tx: StorageTransaction): Promise<StorageTransaction> {
    this.transactions.set(tx.id, tx);
    return tx;
  }

  // ==========================================
  // Shopping List
  // ==========================================
  async listShoppingItems(poolId: string): Promise<StorageShoppingItem[]> {
    return Array.from(this.shoppingItems.values()).filter(s => s.pool_id === poolId);
  }

  async createShoppingItem(item: StorageShoppingItem): Promise<StorageShoppingItem> {
    this.shoppingItems.set(item.id, item);
    return item;
  }

  async updateShoppingItemStatus(id: string, poolId: string, purchased: boolean): Promise<void> {
    const item = this.shoppingItems.get(id);
    if (item && item.pool_id === poolId) {
      item.purchased = purchased;
    }
  }

  async deleteShoppingItem(id: string, poolId: string): Promise<void> {
    const item = this.shoppingItems.get(id);
    if (item && item.pool_id === poolId) {
      this.shoppingItems.delete(id);
    }
  }

  // ==========================================
  // Polls
  // ==========================================
  async listPolls(poolId: string): Promise<StoragePoll[]> {
    return Array.from(this.polls.values()).filter(p => p.pool_id === poolId);
  }

  async getPollById(id: string, poolId?: string): Promise<StoragePoll | null> {
    const p = this.polls.get(id);
    if (p && (!poolId || p.pool_id === poolId)) return p;
    return null;
  }

  async createPoll(poll: StoragePoll): Promise<StoragePoll> {
    this.polls.set(poll.id, poll);
    return poll;
  }

  async updatePoll(id: string, poolId: string, updates: Partial<StoragePoll>): Promise<void> {
    const poll = this.polls.get(id);
    if (poll && poll.pool_id === poolId) {
      Object.assign(poll, updates);
    }
  }

  async deletePoll(id: string, poolId: string): Promise<void> {
    const poll = this.polls.get(id);
    if (poll && poll.pool_id === poolId) {
      this.polls.delete(id);
    }
  }

  // ==========================================
  // Notifications
  // ==========================================
  async listNotifications(userId: string, limit = 50): Promise<StorageNotification[]> {
    return this.notifications.filter(n => n.user_id === userId).slice(0, limit);
  }

  async createNotification(notif: StorageNotification): Promise<StorageNotification> {
    this.notifications.push(notif);
    return notif;
  }

  async markNotificationsRead(userId: string, notifId?: string): Promise<void> {
    for (const n of this.notifications) {
      if (n.user_id === userId && (!notifId || n.id === notifId)) {
        n.is_read = true;
      }
    }
  }

  async deleteNotification(id: string, userId?: string): Promise<void> {
    this.notifications = this.notifications.filter(n => !(n.id === id && (!userId || n.user_id === userId)));
  }

  // ==========================================
  // Webhooks
  // ==========================================
  async listWebhooks(poolId: string): Promise<StorageWebhook[]> {
    return Array.from(this.webhooks.values()).filter(w => w.pool_id === poolId);
  }

  async saveWebhook(webhook: StorageWebhook): Promise<StorageWebhook> {
    this.webhooks.set(webhook.id, webhook);
    return webhook;
  }

  async deleteWebhook(id: string, poolId?: string): Promise<void> {
    const w = this.webhooks.get(id);
    if (w && (!poolId || w.pool_id === poolId)) {
      this.webhooks.delete(id);
    }
  }

  // ==========================================
  // SSO
  // ==========================================
  async getSsoConfigByDomain(domain: string): Promise<StorageSsoConfig | null> {
    for (const c of this.ssoConfigs.values()) {
      if (c.domain.toLowerCase() === domain.toLowerCase()) return c;
    }
    return null;
  }

  async getSsoConfigByOrg(orgId: string): Promise<StorageSsoConfig | null> {
    for (const c of this.ssoConfigs.values()) {
      if (c.organization_id === orgId) return c;
    }
    return null;
  }

  async getSsoConfigCount(): Promise<number> {
    return this.ssoConfigs.size;
  }

  async saveSsoConfig(config: StorageSsoConfig): Promise<StorageSsoConfig> {
    this.ssoConfigs.set(config.id, config);
    return config;
  }

  // ==========================================
  // System Settings & Admin
  // ==========================================
  async getSystemSettings(): Promise<Record<string, any>> {
    return { ...this.settings };
  }

  async saveSystemSettings(settings: Record<string, any>): Promise<void> {
    Object.assign(this.settings, settings);
  }

  async getPlatformStats(): Promise<{ totalUsers: number; totalPools: number; totalTransactions: number; totalVolume: number }> {
    return {
      totalUsers: this.users.size,
      totalPools: this.pools.size,
      totalTransactions: this.transactions.size,
      totalVolume: Array.from(this.transactions.values()).reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
    };
  }

  // ==========================================
  // Telemetry
  // ==========================================
  async recordTelemetryEvents(events: StorageTelemetryEvent[]): Promise<void> {
    this.telemetryEvents.push(...events);
  }

  async getTelemetryStats(days = 7): Promise<TelemetryStats> {
    return {
      periodDays: days,
      totalEvents: this.telemetryEvents.length,
      topFeatures: [],
      errorSummary: [],
      funnelBreakdown: [],
      activityByDay: [],
      recentEvents: this.telemetryEvents.slice(-50),
    };
  }

  // ==========================================
  // Savings & Leaderboard
  // ==========================================
  async getPoolSavingsSummary(poolId: string): Promise<StoragePoolSavingsSummary> {
    return {
      totalSavingsCents: 0,
      totalSavings: 0,
      itemsConsumedCount: 0,
      topSavedItems: []
    };
  }

  async getGlobalSavingsLeaderboard(limit = 20): Promise<StorageGlobalSavingsLeaderboardResponse> {
    return {
      pools: [],
      networkTotalSavingsCents: 0,
      networkTotalSavings: 0
    };
  }

  // ==========================================
  // Affiliate Products
  // ==========================================
  async listAffiliateProducts(onlyActive = true): Promise<StorageAffiliateProduct[]> {
    const list = Array.from(this.affiliateProducts.values());
    return onlyActive ? list.filter(p => Boolean(p.is_active)) : list;
  }

  async getAffiliateProductById(id: string): Promise<StorageAffiliateProduct | null> {
    return this.affiliateProducts.get(id) || null;
  }

  async createAffiliateProduct(product: Partial<StorageAffiliateProduct> & { id: string; title: string; affiliate_url: string }): Promise<StorageAffiliateProduct> {
    const p: StorageAffiliateProduct = {
      description: '',
      category: 'General',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...product,
    };
    this.affiliateProducts.set(product.id, p);
    return p;
  }

  async updateAffiliateProduct(id: string, updates: Partial<StorageAffiliateProduct>): Promise<StorageAffiliateProduct | null> {
    const p = this.affiliateProducts.get(id);
    if (!p) return null;
    const updated = { ...p, ...updates, updated_at: new Date().toISOString() };
    this.affiliateProducts.set(id, updated);
    return updated;
  }

  async deleteAffiliateProduct(id: string): Promise<void> {
    this.affiliateProducts.delete(id);
  }

  async recordAffiliateClick(click: StorageAffiliateClick): Promise<void> {
    this.affiliateClicks.push(click);
    const p = this.affiliateProducts.get(click.product_id);
    if (p) {
      p.click_count = (p.click_count || 0) + 1;
    }
  }

  async getAffiliateStats(): Promise<StorageAffiliateStats> {
    return {
      totalProducts: this.affiliateProducts.size,
      activeProducts: Array.from(this.affiliateProducts.values()).filter(p => p.is_active).length,
      totalClicks: this.affiliateClicks.length,
      clicksBySource: [],
      topProducts: []
    };
  }

  async saveAffiliateImage(image: StorageAffiliateImage): Promise<void> {
    this.affiliateImages.set(image.id, image);
  }

  async getAffiliateImage(id: string): Promise<StorageAffiliateImage | null> {
    return this.affiliateImages.get(id) || null;
  }

  async deleteAffiliateImage(id: string): Promise<void> {
    this.affiliateImages.delete(id);
  }

  // ==========================================
  // User Avatars
  // ==========================================
  async saveUserAvatar(avatar: StorageUserAvatar): Promise<void> {
    this.avatars.set(avatar.user_id, avatar);
  }

  async getUserAvatar(id: string): Promise<StorageUserAvatar | null> {
    return this.avatars.get(id) || null;
  }

  async deleteUserAvatar(id: string): Promise<void> {
    this.avatars.delete(id);
  }

  /**
   * Helper to reset all data between tests.
   */
  reset(): void {
    this.users.clear();
    this.passkeys.clear();
    this.passwordResetTokens.clear();
    this.orgs.clear();
    this.orgMembers.clear();
    this.pools.clear();
    this.poolMembers.clear();
    this.items.clear();
    this.transactions.clear();
    this.shoppingItems.clear();
    this.polls.clear();
    this.notifications = [];
    this.webhooks.clear();
    this.ssoConfigs.clear();
    this.settings = {};
    this.telemetryEvents = [];
    this.affiliateProducts.clear();
    this.affiliateClicks = [];
    this.affiliateImages.clear();
    this.avatars.clear();
  }
}
