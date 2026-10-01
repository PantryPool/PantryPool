import {
  StorageAdapter,
  StorageUser,
  StorageOrganization,
  StorageOrganizationMember,
  StoragePool,
  StoragePoolMember,
  StorageItem,
  StorageTransaction,
  StorageShoppingItem,
  StoragePoll,
  StorageNotification,
  StorageNotificationPreferences,
  StorageWebhook,
  StorageSsoConfig,
  StorageTelemetryEvent,
  TelemetryStats,
  StoragePasskeyCredential,
  OrgTier,
  StorageGlobalSavingsLeaderboardResponse,
  StorageAffiliateImage,
  StorageEmailLog,
} from './types';

export class InMemoryStorageAdapter implements StorageAdapter {
  users = new Map<string, StorageUser>();
  orgs = new Map<string, StorageOrganization>();
  orgMembers = new Map<string, StorageOrganizationMember>();
  pools = new Map<string, StoragePool>();
  poolMembers = new Map<string, StoragePoolMember>();
  items = new Map<string, StorageItem>();
  transactions = new Map<string, StorageTransaction>();
  shoppingItems = new Map<string, StorageShoppingItem>();
  polls = new Map<string, StoragePoll>();
  notifications = new Map<string, StorageNotification>();
  notifPrefs = new Map<string, any>();
  webhooks = new Map<string, StorageWebhook>();
  ssoConfigs = new Map<string, StorageSsoConfig>();
  telemetryEvents: StorageTelemetryEvent[] = [];
  passkeys = new Map<string, StoragePasskeyCredential>();
  resetTokens = new Map<string, { id: string; user_id: string; token_hash: string; expires_at: string; used: boolean | number }>();
  affiliateImages = new Map<string, StorageAffiliateImage>();
  emailLogs = new Map<string, StorageEmailLog>();
  settings: Record<string, any> = {};

  clear() {
    this.users.clear();
    this.orgs.clear();
    this.orgMembers.clear();
    this.pools.clear();
    this.poolMembers.clear();
    this.items.clear();
    this.transactions.clear();
    this.shoppingItems.clear();
    this.polls.clear();
    this.notifications.clear();
    this.notifPrefs.clear();
    this.webhooks.clear();
    this.ssoConfigs.clear();
    this.telemetryEvents = [];
    this.passkeys.clear();
    this.resetTokens.clear();
    this.affiliateImages.clear();
    this.emailLogs.clear();
    this.settings = {};
  }

  // -------------------------------------------------------------
  // Users & Auth
  // -------------------------------------------------------------
  async getUserById(id: string): Promise<StorageUser | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<StorageUser | null> {
    return Array.from(this.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
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
      created_at: user.created_at || new Date().toISOString(),
    };
    this.users.set(user.id, fullUser);
    return fullUser;
  }

  async updateUser(id: string, updates: Partial<StorageUser>): Promise<void> {
    const u = this.users.get(id);
    if (u) {
      this.users.set(id, { ...u, ...updates });
    }
  }

  async listUsers(): Promise<StorageUser[]> {
    return Array.from(this.users.values());
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

  async deleteUser(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void> {
    const hard = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
    if (hard) {
      this.users.delete(id);
    } else {
      const u = this.users.get(id);
      if (u) {
        this.users.set(id, {
          ...u,
          is_archived: true,
          archived_at: new Date().toISOString(),
          token_version: (u.token_version || 1) + 1,
        });
      }
    }
  }

  async archiveUser(id: string): Promise<void> {
    await this.deleteUser(id, { hardDelete: false });
  }

  async restoreUser(id: string): Promise<void> {
    const u = this.users.get(id);
    if (u) {
      this.users.set(id, { ...u, is_archived: false, archived_at: null });
    }
  }

  async listAllUsersForAdmin(): Promise<any[]> {
    return Array.from(this.users.values()).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      systemRole: u.system_role,
      isArchived: Boolean(u.is_archived),
      archivedAt: u.archived_at || null,
      createdAt: u.created_at,
    }));
  }

  // -------------------------------------------------------------
  // Password Reset Tokens
  // -------------------------------------------------------------
  async createPasswordResetToken(token: { id: string; user_id: string; token_hash: string; expires_at: string; used?: boolean | number }): Promise<void> {
    this.resetTokens.set(token.token_hash, {
      id: token.id,
      user_id: token.user_id,
      token_hash: token.token_hash,
      expires_at: token.expires_at,
      used: token.used ?? false,
    });
  }

  async getPasswordResetToken(tokenHash: string): Promise<{ id: string; user_id: string; token_hash: string; expires_at: string; used: boolean | number } | null> {
    return this.resetTokens.get(tokenHash) || null;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    for (const [hash, tok] of this.resetTokens.entries()) {
      if (tok.id === id) {
        this.resetTokens.set(hash, { ...tok, used: true });
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // Passkey / WebAuthn
  // -------------------------------------------------------------
  async createPasskeyCredential(cred: StoragePasskeyCredential): Promise<StoragePasskeyCredential> {
    this.passkeys.set(cred.id, cred);
    return cred;
  }

  async getPasskeyCredentialById(id: string): Promise<StoragePasskeyCredential | null> {
    return this.passkeys.get(id) || null;
  }

  async getPasskeyCredentialsByUserId(userId: string): Promise<StoragePasskeyCredential[]> {
    return Array.from(this.passkeys.values()).filter((c) => c.user_id === userId);
  }

  async updatePasskeyCredentialCounter(id: string, counter: number, lastUsedAt?: string): Promise<void> {
    const cred = this.passkeys.get(id);
    if (cred) {
      cred.counter = counter;
      if (lastUsedAt) cred.last_used_at = lastUsedAt;
    }
  }

  async deletePasskeyCredential(id: string, userId: string): Promise<boolean> {
    const cred = this.passkeys.get(id);
    if (cred && cred.user_id === userId) {
      this.passkeys.delete(id);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------
  // Organizations
  // -------------------------------------------------------------
  async getOrgById(id: string): Promise<StorageOrganization | null> {
    return this.orgs.get(id) || null;
  }

  async getOrgByNameAndOwner(name: string, ownerId: string): Promise<StorageOrganization | null> {
    return Array.from(this.orgs.values()).find(
      (o) => o.owner_id === ownerId && o.name.toLowerCase() === name.toLowerCase() && !o.is_archived
    ) || null;
  }

  async getOrgByInviteCode(code: string): Promise<StorageOrganization | null> {
    return Array.from(this.orgs.values()).find(
      (o) => (o.invite_code || '').toUpperCase() === code.toUpperCase() && !o.is_archived
    ) || null;
  }

  async getOrgByStripeCustomerId(customerId: string): Promise<StorageOrganization | null> {
    return Array.from(this.orgs.values()).find((o) => o.stripe_customer_id === customerId) || null;
  }

  async getOrgByStripeSubscriptionId(subscriptionId: string): Promise<StorageOrganization | null> {
    return Array.from(this.orgs.values()).find((o) => o.stripe_subscription_id === subscriptionId) || null;
  }

  async listOrgsByOwner(ownerId: string): Promise<StorageOrganization[]> {
    return Array.from(this.orgs.values()).filter((o) => o.owner_id === ownerId && !o.is_archived);
  }

  async listOrgsForUser(userId: string): Promise<StorageOrganization[]> {
    const owned = Array.from(this.orgs.values()).filter((o) => o.owner_id === userId && !o.is_archived);
    const memberOrgIds = Array.from(this.orgMembers.values())
      .filter((m) => m.user_id === userId)
      .map((m) => m.organization_id);
    const memberOrgs = Array.from(this.orgs.values()).filter((o) => memberOrgIds.includes(o.id) && !o.is_archived);
    const set = new Map<string, StorageOrganization>();
    [...owned, ...memberOrgs].forEach((o) => set.set(o.id, o));
    return Array.from(set.values());
  }

  async listAllOrgsForAdmin(): Promise<any[]> {
    return Array.from(this.orgs.values()).map((o) => ({
      id: o.id,
      name: o.name,
      ownerId: o.owner_id,
      tier: o.tier,
      isArchived: Boolean(o.is_archived),
      archivedAt: o.archived_at || null,
      createdAt: o.created_at,
    }));
  }

  async createOrg(org: Partial<StorageOrganization> & { id: string; name: string; owner_id: string }): Promise<StorageOrganization> {
    const fullOrg: StorageOrganization = {
      id: org.id,
      name: org.name,
      owner_id: org.owner_id,
      tier: (org.tier as OrgTier) || 'starter',
      invite_code: org.invite_code || 'INVITE_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      is_archived: false,
      archived_at: null,
      created_at: org.created_at || new Date().toISOString(),
    };
    this.orgs.set(org.id, fullOrg);
    return fullOrg;
  }

  async updateOrgTier(id: string, tier: OrgTier | string): Promise<void> {
    const o = this.orgs.get(id);
    if (o) {
      o.tier = tier as OrgTier;
    }
  }

  async updateOrg(id: string, updates: Partial<StorageOrganization>): Promise<void> {
    const o = this.orgs.get(id);
    if (o) {
      this.orgs.set(id, { ...o, ...updates });
    }
  }

  async deleteOrg(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void> {
    const hard = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
    if (hard) {
      this.orgs.delete(id);
    } else {
      const o = this.orgs.get(id);
      if (o) {
        this.orgs.set(id, { ...o, is_archived: true, archived_at: new Date().toISOString() });
        for (const pool of this.pools.values()) {
          if (pool.organization_id === id) {
            this.pools.set(pool.id, { ...pool, is_archived: true, archived_at: new Date().toISOString() });
          }
        }
      }
    }
  }

  async archiveOrg(id: string): Promise<void> {
    await this.deleteOrg(id, { hardDelete: false });
  }

  async restoreOrg(id: string): Promise<void> {
    const o = this.orgs.get(id);
    if (o) {
      this.orgs.set(id, { ...o, is_archived: false, archived_at: null });
      for (const pool of this.pools.values()) {
        if (pool.organization_id === id) {
          this.pools.set(pool.id, { ...pool, is_archived: false, archived_at: null });
        }
      }
    }
  }

  async addOrgMember(member: StorageOrganizationMember): Promise<void> {
    this.orgMembers.set(`${member.organization_id}_${member.user_id}`, member);
  }

  async getOrgMember(orgId: string, userId: string): Promise<StorageOrganizationMember | null> {
    return this.orgMembers.get(`${orgId}_${userId}`) || null;
  }

  async listOrgMembers(orgId: string): Promise<StorageOrganizationMember[]> {
    return Array.from(this.orgMembers.values()).filter((m) => m.organization_id === orgId);
  }

  async removeOrgMember(orgId: string, userId: string): Promise<void> {
    this.orgMembers.delete(`${orgId}_${userId}`);
  }

  // -------------------------------------------------------------
  // Pools & Members
  // -------------------------------------------------------------
  async getPoolById(id: string): Promise<StoragePool | null> {
    return this.pools.get(id) || null;
  }

  async getPoolByCode(code: string): Promise<StoragePool | null> {
    return Array.from(this.pools.values()).find(
      (p) => (p.qr_code_key || '').toUpperCase() === code.toUpperCase() && !p.is_archived
    ) || null;
  }

  async getAllPools(): Promise<StoragePool[]> {
    return Array.from(this.pools.values());
  }

  async getPoolsByOrg(orgId: string): Promise<StoragePool[]> {
    return Array.from(this.pools.values()).filter((p) => p.organization_id === orgId && !p.is_archived);
  }

  async listPoolsForUser(userId: string): Promise<StoragePool[]> {
    const memberPoolIds = Array.from(this.poolMembers.values())
      .filter((m) => m.user_id === userId)
      .map((m) => m.pool_id);
    return Array.from(this.pools.values()).filter(
      (p) => !p.is_archived && (p.champion_id === userId || memberPoolIds.includes(p.id))
    );
  }

  async listAllPoolsForAdmin(): Promise<any[]> {
    return Array.from(this.pools.values()).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      isArchived: Boolean(p.is_archived),
      archivedAt: p.archived_at || null,
      createdAt: p.created_at,
    }));
  }

  async createPool(pool: Partial<StoragePool> & { id: string; name: string }): Promise<StoragePool> {
    const fullPool: StoragePool = {
      id: pool.id,
      name: pool.name,
      category: pool.category || 'Office',
      currency: pool.currency || '$',
      organization_id: pool.organization_id || null,
      champion_id: pool.champion_id || null,
      qr_code_key: pool.qr_code_key || 'POOL_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      kiosk_pin: pool.kiosk_pin || '1234',
      max_deficit: pool.max_deficit !== undefined ? pool.max_deficit : 10.0,
      max_deficit_cents: pool.max_deficit_cents !== undefined ? pool.max_deficit_cents : 1000,
      savings_enabled: pool.savings_enabled !== undefined ? pool.savings_enabled : true,
      savings_leaderboard_opt_in: pool.savings_leaderboard_opt_in !== undefined ? pool.savings_leaderboard_opt_in : false,
      leaderboard_alias: pool.leaderboard_alias || null,
      metro_tier: pool.metro_tier || 'standard',
      is_archived: false,
      archived_at: null,
      created_at: pool.created_at || new Date().toISOString(),
    };
    this.pools.set(pool.id, fullPool);
    return fullPool;
  }

  async updatePool(id: string, updates: Partial<StoragePool>): Promise<void> {
    const p = this.pools.get(id);
    if (p) {
      this.pools.set(id, { ...p, ...updates });
    }
  }

  async deletePool(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void> {
    const hard = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
    if (hard) {
      this.pools.delete(id);
    } else {
      const p = this.pools.get(id);
      if (p) {
        this.pools.set(id, { ...p, is_archived: true, archived_at: new Date().toISOString() });
      }
    }
  }

  async archivePool(id: string): Promise<void> {
    await this.deletePool(id, { hardDelete: false });
  }

  async restorePool(id: string): Promise<void> {
    const p = this.pools.get(id);
    if (p) {
      this.pools.set(id, { ...p, is_archived: false, archived_at: null });
    }
  }

  async getPoolMember(poolId: string, userId: string): Promise<StoragePoolMember | null> {
    return this.poolMembers.get(`${poolId}_${userId}`) || null;
  }

  async listPoolMembers(poolId: string): Promise<StoragePoolMember[]> {
    return Array.from(this.poolMembers.values()).filter((m) => m.pool_id === poolId);
  }

  async upsertPoolMember(member: Partial<StoragePoolMember> & { id: string; pool_id: string; user_id: string }): Promise<void> {
    const existing = this.poolMembers.get(`${member.pool_id}_${member.user_id}`);
    const fullMember: StoragePoolMember = {
      id: member.id,
      pool_id: member.pool_id,
      user_id: member.user_id,
      role: member.role || existing?.role || 'member',
      balance: member.balance !== undefined ? member.balance : existing?.balance ?? 0,
      balance_cents: member.balance_cents !== undefined ? member.balance_cents : existing?.balance_cents ?? 0,
      joined_at: member.joined_at || existing?.joined_at || new Date().toISOString(),
    };
    this.poolMembers.set(`${member.pool_id}_${member.user_id}`, fullMember);
  }

  async updateMemberRole(poolId: string, userId: string, role: string): Promise<void> {
    const m = this.poolMembers.get(`${poolId}_${userId}`);
    if (m) {
      m.role = role as any;
    }
  }

  async removePoolMember(poolId: string, userId: string): Promise<void> {
    this.poolMembers.delete(`${poolId}_${userId}`);
  }

  async countPoolsByOrg(orgId: string): Promise<number> {
    return Array.from(this.pools.values()).filter((p) => p.organization_id === orgId && !p.is_archived).length;
  }

  async countPersonalPools(userId: string): Promise<number> {
    return Array.from(this.pools.values()).filter((p) => !p.organization_id && p.champion_id === userId && !p.is_archived).length;
  }

  async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number): Promise<void> {
    const m = this.poolMembers.get(`${poolId}_${userId}`);
    if (m) {
      m.balance = (m.balance || 0) + deltaAmount;
      m.balance_cents = (m.balance_cents || 0) + deltaCents;
    }
  }

  async reassignUserResources(sourceUserId: string, targetUserId: string): Promise<void> {
    for (const pool of this.pools.values()) {
      if (pool.champion_id === sourceUserId) {
        pool.champion_id = targetUserId;
      }
    }
    for (const org of this.orgs.values()) {
      if (org.owner_id === sourceUserId) {
        org.owner_id = targetUserId;
      }
    }
  }

  async getPoolSavingsSummary(poolId: string): Promise<any> {
    return {
      poolId,
      totalSavingsCents: 4500,
      totalRetailBenchmarkCents: 12000,
      memberCount: 5,
    };
  }

  async getGlobalSavingsLeaderboard(limit = 10): Promise<StorageGlobalSavingsLeaderboardResponse> {
    return {
      pools: [],
      networkTotalSavingsCents: 0,
      networkTotalSavings: 0,
    };
  }

  // -------------------------------------------------------------
  // Items
  // -------------------------------------------------------------
  async getItemById(id: string): Promise<StorageItem | null> {
    return this.items.get(id) || null;
  }

  async listItemsByPool(poolId: string): Promise<StorageItem[]> {
    return Array.from(this.items.values()).filter((i) => i.pool_id === poolId);
  }

  async searchItems(query: string, poolId?: string, limit?: number): Promise<StorageItem[]> {
    const lower = query.toLowerCase();
    const results = Array.from(this.items.values()).filter(
      (i) => (!poolId || i.pool_id === poolId) && i.name.toLowerCase().includes(lower)
    );
    return limit ? results.slice(0, limit) : results;
  }

  async saveItem(item: Partial<StorageItem> & { id: string; pool_id: string; name: string }): Promise<StorageItem> {
    const existing = this.items.get(item.id);
    const fullItem: StorageItem = {
      id: item.id,
      pool_id: item.pool_id,
      name: item.name,
      category: item.category || existing?.category || 'Snacks',
      cost_per_unit: item.cost_per_unit !== undefined ? item.cost_per_unit : existing?.cost_per_unit ?? 1.0,
      cost_per_unit_cents: item.cost_per_unit_cents !== undefined ? item.cost_per_unit_cents : existing?.cost_per_unit_cents ?? 100,
      vending_benchmark_cents: item.vending_benchmark_cents !== undefined ? item.vending_benchmark_cents : existing?.vending_benchmark_cents ?? 200,
      stock: item.stock !== undefined ? item.stock : existing?.stock ?? 10,
      min_stock: item.min_stock !== undefined ? item.min_stock : existing?.min_stock ?? 3,
      unit_name: item.unit_name || existing?.unit_name || 'unit',
      icon: item.icon || existing?.icon || 'Package',
      image_url: item.image_url !== undefined ? item.image_url : existing?.image_url ?? null,
      description: item.description !== undefined ? item.description : existing?.description ?? null,
      created_at: item.created_at || existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.items.set(item.id, fullItem);
    return fullItem;
  }

  async deleteItem(id: string): Promise<void> {
    this.items.delete(id);
  }

  async adjustItemStock(id: string, deltaQty: number): Promise<void> {
    const i = this.items.get(id);
    if (i) {
      i.stock = (i.stock || 0) + deltaQty;
    }
  }

  // -------------------------------------------------------------
  // Transactions
  // -------------------------------------------------------------
  async getTransactionById(id: string): Promise<StorageTransaction | null> {
    return this.transactions.get(id) || null;
  }

  async listTransactionsByPool(poolId: string, limit?: number): Promise<StorageTransaction[]> {
    const list = Array.from(this.transactions.values())
      .filter((t) => t.pool_id === poolId)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return limit ? list.slice(0, limit) : list;
  }

  async createTransaction(tx: StorageTransaction): Promise<StorageTransaction> {
    this.transactions.set(tx.id, tx);
    return tx;
  }

  // -------------------------------------------------------------
  // Shopping Items
  // -------------------------------------------------------------
  async listShoppingItems(poolId: string): Promise<StorageShoppingItem[]> {
    return Array.from(this.shoppingItems.values()).filter((s) => s.pool_id === poolId);
  }

  async createShoppingItem(item: StorageShoppingItem): Promise<StorageShoppingItem> {
    this.shoppingItems.set(item.id, item);
    return item;
  }

  async updateShoppingItemStatus(id: string, poolId: string, purchased: boolean): Promise<void> {
    const s = this.shoppingItems.get(id);
    if (s && s.pool_id === poolId) {
      s.purchased = purchased;
    }
  }

  async deleteShoppingItem(id: string): Promise<void> {
    this.shoppingItems.delete(id);
  }

  // -------------------------------------------------------------
  // Polls
  // -------------------------------------------------------------
  async listPolls(poolId: string): Promise<StoragePoll[]> {
    return Array.from(this.polls.values()).filter((p) => p.pool_id === poolId);
  }

  async getPollById(id: string): Promise<StoragePoll | null> {
    return this.polls.get(id) || null;
  }

  async createPoll(poll: StoragePoll): Promise<StoragePoll> {
    this.polls.set(poll.id, poll);
    return poll;
  }

  async updatePoll(id: string, poolId: string, updates: Partial<StoragePoll>): Promise<void> {
    const p = this.polls.get(id);
    if (p && p.pool_id === poolId) {
      this.polls.set(id, { ...p, ...updates });
    }
  }

  async deletePoll(id: string): Promise<void> {
    this.polls.delete(id);
  }

  // -------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------
  async listNotifications(userId: string): Promise<StorageNotification[]> {
    return Array.from(this.notifications.values()).filter((n) => n.user_id === userId);
  }

  async createNotification(notif: StorageNotification): Promise<StorageNotification> {
    this.notifications.set(notif.id, notif);
    return notif;
  }

  async markNotificationsRead(userId: string): Promise<void> {
    for (const n of this.notifications.values()) {
      if (n.user_id === userId) {
        n.is_read = true;
      }
    }
  }

  async deleteNotification(id: string): Promise<void> {
    this.notifications.delete(id);
  }

  async getNotificationPreferences(userId: string): Promise<StorageNotificationPreferences | null> {
    return this.notifPrefs.get(userId) || null;
  }

  async saveNotificationPreferences(userId: string, prefs: Partial<StorageNotificationPreferences>): Promise<StorageNotificationPreferences> {
    const current = this.notifPrefs.get(userId) || {
      user_id: userId,
      low_stock_email: true,
      low_stock_sms: false,
      low_stock_in_app: true,
      weekly_digest_email: true,
      weekly_digest_in_app: true,
      deposit_in_app: true,
      phone_number: '',
    };
    const updated: StorageNotificationPreferences = {
      ...current,
      ...prefs,
      user_id: userId,
      low_stock_email: prefs.low_stock_email !== undefined ? Boolean(prefs.low_stock_email) : current.low_stock_email,
      low_stock_sms: prefs.low_stock_sms !== undefined ? Boolean(prefs.low_stock_sms) : current.low_stock_sms,
      weekly_digest_email: prefs.weekly_digest_email !== undefined ? Boolean(prefs.weekly_digest_email) : current.weekly_digest_email,
      phone_number: prefs.phone_number !== undefined ? (prefs.phone_number || '') : current.phone_number,
      updated_at: new Date().toISOString(),
    };
    this.notifPrefs.set(userId, updated);
    return updated;
  }

  // -------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------
  async listWebhooks(poolId: string): Promise<StorageWebhook[]> {
    return Array.from(this.webhooks.values()).filter((w) => w.pool_id === poolId);
  }

  async saveWebhook(wh: StorageWebhook): Promise<StorageWebhook> {
    this.webhooks.set(wh.id, wh);
    return wh;
  }

  async deleteWebhook(id: string): Promise<void> {
    this.webhooks.delete(id);
  }

  // -------------------------------------------------------------
  // System Settings & Admin
  // -------------------------------------------------------------
  async getSystemSettings(): Promise<Record<string, any>> {
    return this.settings;
  }

  async saveSystemSettings(s: Record<string, any>): Promise<void> {
    this.settings = s;
  }

  async getPlatformStats(): Promise<any> {
    return {
      totalUsers: this.users.size,
      totalPools: this.pools.size,
      totalTransactions: this.transactions.size,
      totalVolume: 12500,
    };
  }

  // -------------------------------------------------------------
  // SSO & Telemetry
  // -------------------------------------------------------------
  async getSsoConfigByDomain(domain: string): Promise<StorageSsoConfig | null> {
    return Array.from(this.ssoConfigs.values()).find((s) => s.domain.toLowerCase() === domain.toLowerCase()) || null;
  }

  async getSsoConfigByOrg(orgId: string): Promise<StorageSsoConfig | null> {
    return Array.from(this.ssoConfigs.values()).find((s) => s.organization_id === orgId) || null;
  }

  async saveSsoConfig(config: StorageSsoConfig): Promise<StorageSsoConfig> {
    this.ssoConfigs.set(config.id, config);
    return config;
  }

  async getSsoConfigCount(): Promise<number> {
    return this.ssoConfigs.size;
  }

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
      recentEvents: this.telemetryEvents.slice(-20),
    };
  }

  async getAiUsageStats(): Promise<any> {
    return {
      totalReceiptScans: 0,
      successfulParses: 0,
      avgConfidenceScore: 0.95,
      tokensUsed: 1200,
    };
  }

  async logAiUsage(log: any): Promise<void> {}
  async logAiAppliedItems(scanLogId: string, appliedJson: string): Promise<void> {}

  // -------------------------------------------------------------
  // Affiliate Images
  // -------------------------------------------------------------
  async saveAffiliateImage(image: StorageAffiliateImage): Promise<void> {
    this.affiliateImages.set(image.id, image);
  }

  async getAffiliateImage(id: string): Promise<StorageAffiliateImage | null> {
    return this.affiliateImages.get(id) || null;
  }

  async deleteAffiliateImage(id: string): Promise<void> {
    this.affiliateImages.delete(id);
  }

  // -------------------------------------------------------------
  // Email Delivery Logs
  // -------------------------------------------------------------
  async createEmailLog(log: StorageEmailLog): Promise<StorageEmailLog> {
    const id = log.id || ('elog_' + Math.random().toString(36).substring(2, 11));
    const fullLog: StorageEmailLog = {
      ...log,
      id,
      recipient_email: log.recipient_email.toLowerCase().trim(),
      created_at: log.created_at || new Date().toISOString()
    };
    this.emailLogs.set(id, fullLog);
    return fullLog;
  }

  async listEmailLogs(options?: { recipientEmail?: string; userId?: string; emailType?: string; limit?: number; offset?: number }): Promise<{ logs: StorageEmailLog[]; total: number }> {
    let list = Array.from(this.emailLogs.values());
    if (options?.recipientEmail) {
      const email = options.recipientEmail.toLowerCase().trim();
      list = list.filter((l) => l.recipient_email.toLowerCase() === email);
    }
    if (options?.userId) {
      list = list.filter((l) => l.user_id === options.userId);
    }
    if (options?.emailType) {
      list = list.filter((l) => l.email_type === options.emailType);
    }
    list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const total = list.length;
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 100));
    const offset = Math.max(0, options?.offset ?? 0);
    const logs = list.slice(offset, offset + limit);
    return { logs, total };
  }

  async getEmailLogById(id: string): Promise<StorageEmailLog | null> {
    return this.emailLogs.get(id) || null;
  }
}
