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
  StorageAffiliateProduct,
  StorageAffiliateClick,
  StorageAffiliateStats,
  StorageAffiliateImage,
  StorageUserAvatar,
  StoragePoolSavingsSummary,
  StorageGlobalSavingsLeaderboardResponse,
  StoragePasskeyCredential,
  StorageAiUsageLog,
  StorageEmailLog
} from "./types";

function isTransientD1Error(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("busy") ||
    msg.includes("locked") ||
    msg.includes("unavailable") ||
    msg.includes("timeout") ||
    msg.includes("rate limit")
  );
}

async function executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (!isTransientD1Error(err) || attempt >= maxRetries) {
        throw err;
      }
      const delay = Math.min(60 * Math.pow(2, attempt) + Math.random() * 40, 1500);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function wrapStatement(stmt: any): any {
  if (!stmt || typeof stmt !== "object") return stmt;
  return new Proxy(stmt, {
    get(target, prop, receiver) {
      if (prop === "bind") {
        return (...bindArgs: any[]) => {
          const bound = target.bind(...bindArgs);
          return wrapStatement(bound);
        };
      }
      if (prop === "first" || prop === "all" || prop === "run" || prop === "raw") {
        return (...args: any[]) => executeWithRetry(() => target[prop](...args));
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function wrapD1WithRetry(db: any): any {
  if (!db || typeof db !== "object" || !db.prepare) return db;
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "batch") {
        return async (...args: any[]) => executeWithRetry(() => target.batch(...args));
      }
      if (prop === "exec") {
        return async (...args: any[]) => executeWithRetry(() => target.exec(...args));
      }
      if (prop === "prepare") {
        return (query: string) => {
          const stmt = target.prepare(query);
          return wrapStatement(stmt);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

export class D1StorageAdapter implements StorageAdapter {
  private db: any;

  constructor(d1Database: any) {
    this.db = wrapD1WithRetry(d1Database);
  }

  // Users & Auth
  async getUserById(id: string): Promise<StorageUser | null> {
    const row: any = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
    return row ? this.mapUser(row) : null;
  }

  async getUserByEmail(email: string): Promise<StorageUser | null> {
    const row: any = await this.db.prepare("SELECT * FROM users WHERE email = ?").bind(email.toLowerCase().trim()).first();
    return row ? this.mapUser(row) : null;
  }

  async createUser(user: Partial<StorageUser> & { id: string; email: string; name: string }): Promise<StorageUser> {
    await this.db.prepare(
      `INSERT INTO users (id, email, name, avatar_url, password_hash, google_id, apple_id, system_role, token_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      user.id,
      user.email.toLowerCase().trim(),
      user.name,
      user.avatar_url || null,
      user.password_hash || null,
      user.google_id || null,
      user.apple_id || null,
      user.system_role || 'user',
      user.token_version || 1
    ).run();

    const created = await this.getUserById(user.id);
    if (created && created.email === user.email.toLowerCase().trim()) return created;
    return {
      id: user.id,
      email: user.email.toLowerCase().trim(),
      name: user.name.trim(),
      avatar_url: user.avatar_url || null,
      password_hash: user.password_hash || null,
      google_id: user.google_id || null,
      apple_id: user.apple_id || null,
      system_role: user.system_role || 'user',
      token_version: user.token_version || 1,
      venmo_handle: null,
      cashapp_handle: null,
      paypal_handle: null,
      zelle_identifier: null,
      apple_pay_handle: null,
      preferred_payment_method: null,
      created_at: new Date().toISOString()
    };
  }

  async updateUser(id: string, updates: Partial<StorageUser>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email.toLowerCase().trim()); }
    if (updates.avatar_url !== undefined) { fields.push('avatar_url = ?'); values.push(updates.avatar_url); }
    if (updates.password_hash !== undefined) { fields.push('password_hash = ?'); values.push(updates.password_hash); }
    if (updates.google_id !== undefined) { fields.push('google_id = ?'); values.push(updates.google_id); }
    if (updates.apple_id !== undefined) { fields.push('apple_id = ?'); values.push(updates.apple_id); }
    if (updates.system_role !== undefined) { fields.push('system_role = ?'); values.push(updates.system_role); }
    if (updates.token_version !== undefined) { fields.push('token_version = ?'); values.push(updates.token_version); }
    if (updates.venmo_handle !== undefined) { fields.push('venmo_handle = ?'); values.push(updates.venmo_handle); }
    if (updates.cashapp_handle !== undefined) { fields.push('cashapp_handle = ?'); values.push(updates.cashapp_handle); }
    if (updates.paypal_handle !== undefined) { fields.push('paypal_handle = ?'); values.push(updates.paypal_handle); }
    if (updates.zelle_identifier !== undefined) { fields.push('zelle_identifier = ?'); values.push(updates.zelle_identifier); }
    if (updates.apple_pay_handle !== undefined) { fields.push('apple_pay_handle = ?'); values.push(updates.apple_pay_handle); }
    if (updates.preferred_payment_method !== undefined) { fields.push('preferred_payment_method = ?'); values.push(updates.preferred_payment_method); }

    if (fields.length === 0) return;
    values.push(id);
    await this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  async listUsers(): Promise<StorageUser[]> {
    const res = await this.db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
    return (res.results || []).map((r: any) => this.mapUser(r));
  }

  async countUsers(): Promise<number> {
    try {
      const stmt = this.db.prepare("SELECT COUNT(*) as count FROM users");
      if (typeof stmt?.first === 'function') {
        const res = await stmt.first();
        return Number((res as any)?.count || 0);
      }
      if (typeof stmt?.all === 'function') {
        const res = await stmt.all();
        return Number((res?.results?.[0] as any)?.count || 0);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  async bumpTokenVersion(userId: string): Promise<number> {
    await this.db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").bind(userId).run();
    const user = await this.getUserById(userId);
    return user?.token_version || 1;
  }

  // Password Reset Tokens
  async createPasswordResetToken(token: { id: string; user_id: string; token_hash: string; expires_at: string; used?: boolean | number }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(token.id, token.user_id, token.token_hash, token.expires_at, token.used ? 1 : 0).run();
  }

  async getPasswordResetToken(tokenHash: string): Promise<{ id: string; user_id: string; token_hash: string; expires_at: string; used: boolean | number } | null> {
    const row: any = await this.db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?").bind(tokenHash).first();
    if (!row) return null;
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      expires_at: row.expires_at,
      used: Boolean(row.used)
    };
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await this.db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?").bind(id).run();
  }

  // Passkey / WebAuthn Credentials
  private passkeyTableEnsured = false;
  private async ensurePasskeyTable(): Promise<void> {
    if (this.passkeyTableEnsured) return;
    try {
      await this.db.prepare(`
        CREATE TABLE IF NOT EXISTS passkey_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          public_key TEXT NOT NULL,
          counter INTEGER NOT NULL DEFAULT 0,
          device_type TEXT,
          backed_up INTEGER NOT NULL DEFAULT 0,
          transports TEXT,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_used_at DATETIME,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run();
      try {
        await this.db.prepare("CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON passkey_credentials(user_id)").run();
      } catch {}
      this.passkeyTableEnsured = true;
    } catch {
      // Ignore table creation error safely
    }
  }

  async createPasskeyCredential(cred: StoragePasskeyCredential): Promise<StoragePasskeyCredential> {
    const transportsJson = cred.transports ? JSON.stringify(cred.transports) : null;
    const runInsert = () => this.db.prepare(
      `INSERT INTO passkey_credentials (id, user_id, public_key, counter, device_type, backed_up, transports, name, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
    ).bind(
      cred.id,
      cred.user_id,
      cred.public_key,
      cred.counter || 0,
      cred.device_type || null,
      cred.backed_up ? 1 : 0,
      transportsJson,
      cred.name || null,
      cred.last_used_at || null
    ).run();

    try {
      await runInsert();
    } catch (err: any) {
      if (err?.message?.includes('no such table: passkey_credentials')) {
        await this.ensurePasskeyTable();
        await runInsert();
      } else {
        throw err;
      }
    }

    const created = await this.getPasskeyCredentialById(cred.id);
    return created || cred;
  }

  async getPasskeyCredentialById(id: string): Promise<StoragePasskeyCredential | null> {
    try {
      const row: any = await this.db.prepare("SELECT * FROM passkey_credentials WHERE id = ?").bind(id).first();
      return row ? this.mapPasskeyCredential(row) : null;
    } catch (err: any) {
      if (err?.message?.includes('no such table: passkey_credentials')) {
        await this.ensurePasskeyTable();
        const row: any = await this.db.prepare("SELECT * FROM passkey_credentials WHERE id = ?").bind(id).first().catch(() => null);
        return row ? this.mapPasskeyCredential(row) : null;
      }
      throw err;
    }
  }

  async getPasskeyCredentialsByUserId(userId: string): Promise<StoragePasskeyCredential[]> {
    try {
      const res: any = await this.db.prepare("SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
      const rows = res?.results || [];
      return rows.map((r: any) => this.mapPasskeyCredential(r));
    } catch (err: any) {
      if (err?.message?.includes('no such table: passkey_credentials')) {
        await this.ensurePasskeyTable();
        try {
          const res: any = await this.db.prepare("SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
          const rows = res?.results || [];
          return rows.map((r: any) => this.mapPasskeyCredential(r));
        } catch {
          return [];
        }
      }
      throw err;
    }
  }

  async updatePasskeyCredentialCounter(id: string, counter: number, lastUsedAt?: string): Promise<void> {
    const runUpdate = () => {
      if (lastUsedAt) {
        return this.db.prepare("UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE id = ?").bind(counter, lastUsedAt, id).run();
      } else {
        return this.db.prepare("UPDATE passkey_credentials SET counter = ?, last_used_at = datetime('now') WHERE id = ?").bind(counter, id).run();
      }
    };

    try {
      await runUpdate();
    } catch (err: any) {
      if (err?.message?.includes('no such table: passkey_credentials')) {
        await this.ensurePasskeyTable();
        await runUpdate().catch(() => {});
      } else {
        throw err;
      }
    }
  }

  async deletePasskeyCredential(id: string, userId: string): Promise<boolean> {
    try {
      const res: any = await this.db.prepare("DELETE FROM passkey_credentials WHERE id = ? AND user_id = ?").bind(id, userId).run();
      return (res?.meta?.changes || 0) > 0 || (res?.changes || 0) > 0;
    } catch (err: any) {
      if (err?.message?.includes('no such table: passkey_credentials')) {
        return false;
      }
      throw err;
    }
  }

  private mapPasskeyCredential(row: any): StoragePasskeyCredential {
    let transports: string[] | null = null;
    if (row.transports) {
      try {
        transports = typeof row.transports === 'string' ? JSON.parse(row.transports) : row.transports;
      } catch {
        transports = null;
      }
    }
    return {
      id: row.id,
      user_id: row.user_id,
      public_key: row.public_key,
      counter: Number(row.counter || 0),
      device_type: row.device_type || null,
      backed_up: Boolean(row.backed_up),
      transports,
      name: row.name || null,
      created_at: row.created_at,
      last_used_at: row.last_used_at || null
    };
  }

  // Organizations
  async getOrgById(id: string): Promise<StorageOrganization | null> {
    const row: any = await this.db.prepare("SELECT * FROM organizations WHERE id = ?").bind(id).first();
    return row ? this.mapOrg(row) : null;
  }

  private isMissingColumnError(err: any): boolean {
    const msg = String(err?.message || err || '').toLowerCase();
    return msg.includes('no such column') && (msg.includes('is_archived') || msg.includes('archived_at'));
  }

  async listOrgsByOwner(ownerId: string): Promise<StorageOrganization[]> {
    try {
      const res = await this.db.prepare("SELECT * FROM organizations WHERE owner_id = ? AND (is_archived = 0 OR is_archived IS NULL) ORDER BY created_at DESC").bind(ownerId).all();
      return (res.results || []).map((r: any) => this.mapOrg(r));
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const res = await this.db.prepare("SELECT * FROM organizations WHERE owner_id = ? ORDER BY created_at DESC").bind(ownerId).all();
        return (res.results || []).map((r: any) => this.mapOrg(r));
      }
      throw err;
    }
  }

  async createOrg(org: Partial<StorageOrganization> & { id: string; name: string; owner_id: string }): Promise<StorageOrganization> {
    await this.db.prepare(
      `INSERT INTO organizations (id, name, owner_id, tier, stripe_customer_id, stripe_subscription_id, invite_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      org.id,
      org.name,
      org.owner_id,
      org.tier || 'starter',
      org.stripe_customer_id || null,
      org.stripe_subscription_id || null,
      org.invite_code || null
    ).run();

    const created = await this.getOrgById(org.id);
    if (created && created.name === org.name) return created;
    return {
      id: org.id,
      name: org.name,
      owner_id: org.owner_id,
      tier: org.tier || 'starter',
      invite_code: org.invite_code || null,
      stripe_customer_id: org.stripe_customer_id || null,
      stripe_subscription_id: org.stripe_subscription_id || null,
      created_at: new Date().toISOString()
    };
  }

  async getOrgByNameAndOwner(name: string, ownerId: string): Promise<StorageOrganization | null> {
    try {
      const row: any = await this.db.prepare(
        "SELECT * FROM organizations WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND owner_id = ? AND (is_archived = 0 OR is_archived IS NULL)"
      ).bind(name, ownerId).first();
      return row ? this.mapOrg(row) : null;
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const row: any = await this.db.prepare(
          "SELECT * FROM organizations WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND owner_id = ?"
        ).bind(name, ownerId).first();
        return row ? this.mapOrg(row) : null;
      }
      throw err;
    }
  }

  async getOrgByInviteCode(code: string): Promise<StorageOrganization | null> {
    const normalized = code.trim().toUpperCase();
    try {
      const row: any = await this.db.prepare(
        "SELECT * FROM organizations WHERE UPPER(invite_code) = ? AND (is_archived = 0 OR is_archived IS NULL)"
      ).bind(normalized).first();
      return row ? this.mapOrg(row) : null;
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const row: any = await this.db.prepare(
          "SELECT * FROM organizations WHERE UPPER(invite_code) = ?"
        ).bind(normalized).first();
        return row ? this.mapOrg(row) : null;
      }
      throw err;
    }
  }

  async listOrgsForUser(userId: string): Promise<StorageOrganization[]> {
    try {
      const res = await this.db.prepare(`
        SELECT DISTINCT o.*,
               CASE WHEN o.owner_id = ? THEN 'owner' ELSE COALESCE(om.role, 'member') END as role
        FROM organizations o
        LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ?
        WHERE (o.is_archived = 0 OR o.is_archived IS NULL)
          AND (o.owner_id = ? OR om.user_id = ?)
        ORDER BY o.created_at DESC
      `).bind(userId, userId, userId, userId).all();
      return (res.results || []).map((r: any) => this.mapOrg(r));
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const res = await this.db.prepare(`
          SELECT DISTINCT o.*,
                 CASE WHEN o.owner_id = ? THEN 'owner' ELSE COALESCE(om.role, 'member') END as role
          FROM organizations o
          LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ?
          WHERE (o.owner_id = ? OR om.user_id = ?)
          ORDER BY o.created_at DESC
        `).bind(userId, userId, userId, userId).all();
        return (res.results || []).map((r: any) => this.mapOrg(r));
      }
      throw err;
    }
  }

  async addOrgMember(member: StorageOrganizationMember): Promise<void> {
    await this.db.prepare(`
      INSERT INTO organization_members (id, organization_id, user_id, role, invited_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role
    `).bind(member.id, member.organization_id, member.user_id, member.role || 'member', member.invited_by || null).run();
  }

  async getOrgMember(orgId: string, userId: string): Promise<StorageOrganizationMember | null> {
    const row: any = await this.db.prepare(`
      SELECT om.*, u.name as user_name, u.email as user_email
      FROM organization_members om
      LEFT JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ? AND om.user_id = ?
    `).bind(orgId, userId).first();
    if (!row) return null;
    return {
      id: row.id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.role,
      invited_by: row.invited_by,
      joined_at: row.joined_at,
      user_name: row.user_name,
      user_email: row.user_email
    };
  }

  async listOrgMembers(orgId: string): Promise<StorageOrganizationMember[]> {
    const res = await this.db.prepare(`
      SELECT om.*, u.name as user_name, u.email as user_email
      FROM organization_members om
      LEFT JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ?
      ORDER BY om.joined_at ASC
    `).bind(orgId).all();
    return (res.results || []).map((row: any) => ({
      id: row.id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.role,
      invited_by: row.invited_by,
      joined_at: row.joined_at,
      user_name: row.user_name,
      user_email: row.user_email
    }));
  }

  async removeOrgMember(orgId: string, userId: string): Promise<void> {
    await this.db.prepare("DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?").bind(orgId, userId).run();
  }

  async updateOrgTier(id: string, tier: string): Promise<void> {
    await this.db.prepare("UPDATE organizations SET tier = ? WHERE id = ?").bind(tier, id).run();
  }

  async updateOrg(id: string, updates: Partial<StorageOrganization>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name.trim()); }
    if (updates.tier !== undefined) { fields.push('tier = ?'); values.push(updates.tier); }
    if (updates.ai_scan_monthly_quota !== undefined) { fields.push('ai_scan_monthly_quota = ?'); values.push(updates.ai_scan_monthly_quota); }
    if (updates.scim_enabled !== undefined) { fields.push('scim_enabled = ?'); values.push(updates.scim_enabled ? 1 : 0); }
    if (fields.length === 0) return;
    values.push(id);
    await this.db.prepare(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  async deleteOrg(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void> {
    const isHardDelete = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
    if (isHardDelete) {
      try {
        await this.db.prepare("UPDATE pools SET organization_id = NULL WHERE organization_id = ?").bind(id).run();
      } catch {}
      try {
        await this.db.prepare("DELETE FROM sso_configurations WHERE organization_id = ?").bind(id).run();
      } catch {}
      try {
        await this.db.prepare("DELETE FROM organization_members WHERE organization_id = ?").bind(id).run();
      } catch {}
      await this.db.prepare("DELETE FROM organizations WHERE id = ?").bind(id).run();
    } else {
      await this.db.prepare("UPDATE organizations SET is_archived = 1, archived_at = datetime('now') WHERE id = ?").bind(id).run();
      try {
        await this.db.prepare("UPDATE pools SET is_archived = 1, archived_at = datetime('now') WHERE organization_id = ? AND (is_archived = 0 OR is_archived IS NULL)").bind(id).run();
      } catch {}
    }
  }

  async archiveOrg(id: string): Promise<void> {
    await this.deleteOrg(id, { hardDelete: false });
  }

  async restoreOrg(id: string): Promise<void> {
    await this.db.prepare("UPDATE organizations SET is_archived = 0, archived_at = NULL WHERE id = ?").bind(id).run();
  }

  // Pools & Members
  async getPoolById(id: string): Promise<StoragePool | null> {
    const row: any = await this.db.prepare("SELECT * FROM pools WHERE id = ?").bind(id).first();
    return row ? this.mapPool(row) : null;
  }

  async getPoolByCode(code: string): Promise<StoragePool | null> {
    const normalized = code.trim().toUpperCase();
    const stripped = normalized.replace(/^(PANTRY[-_]|PNTR[-_]|PP[-_]?)/i, '');
    const cleanAlphanumeric = normalized.replace(/[^A-Z0-9]/g, '');
    const row: any = await this.db.prepare(
      `SELECT * FROM pools 
       WHERE UPPER(qr_code_key) = ? 
          OR UPPER(qr_code_key) = ? 
          OR UPPER(qr_code_key) = ? 
          OR UPPER(qr_code_key) = ? 
          OR id = ?
          OR (LENGTH(?) >= 6 AND REPLACE(REPLACE(id, 'pool_', ''), '-', '') LIKE ?)`
    ).bind(
      normalized,
      stripped,
      `PP${stripped}`,
      `PNTR_${stripped}`,
      code.trim(),
      cleanAlphanumeric,
      `${cleanAlphanumeric}%`
    ).first();
    return row ? this.mapPool(row) : null;
  }

  async getAllPools(): Promise<StoragePool[]> {
    const res = await this.db.prepare("SELECT * FROM pools ORDER BY created_at DESC").all();
    return (res.results || []).map((r: any) => this.mapPool(r));
  }

  async getPoolsByOrg(orgId: string): Promise<StoragePool[]> {
    try {
      const res = await this.db.prepare("SELECT * FROM pools WHERE organization_id = ? AND (is_archived = 0 OR is_archived IS NULL) ORDER BY created_at DESC").bind(orgId).all();
      return (res.results || []).map((r: any) => this.mapPool(r));
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const res = await this.db.prepare("SELECT * FROM pools WHERE organization_id = ? ORDER BY created_at DESC").bind(orgId).all();
        return (res.results || []).map((r: any) => this.mapPool(r));
      }
      throw err;
    }
  }

  async listPoolsForUser(userId: string): Promise<StoragePool[]> {
    try {
      const res = await this.db.prepare(
        `SELECT DISTINCT p.* FROM pools p
         LEFT JOIN pool_members pm ON p.id = pm.pool_id AND pm.user_id = ?
         LEFT JOIN organizations o ON p.organization_id = o.id
         LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ?
         WHERE (p.is_archived = 0 OR p.is_archived IS NULL)
           AND (pm.user_id = ?
             OR p.champion_id = ?
             OR o.owner_id = ?
             OR om.user_id = ?)
         ORDER BY p.created_at DESC`
      ).bind(userId, userId, userId, userId, userId, userId).all();
      return (res.results || []).map((r: any) => this.mapPool(r));
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const res = await this.db.prepare(
          `SELECT DISTINCT p.* FROM pools p
           LEFT JOIN pool_members pm ON p.id = pm.pool_id AND pm.user_id = ?
           LEFT JOIN organizations o ON p.organization_id = o.id
           LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ?
           WHERE pm.user_id = ?
              OR p.champion_id = ?
              OR o.owner_id = ?
              OR om.user_id = ?
           ORDER BY p.created_at DESC`
        ).bind(userId, userId, userId, userId, userId, userId).all();
        return (res.results || []).map((r: any) => this.mapPool(r));
      }
      throw err;
    }
  }

  async reassignUserResources(sourceUserId: string, targetUserId: string): Promise<void> {
    if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) return;
    try {
      await this.db.prepare("UPDATE pools SET champion_id = ? WHERE champion_id = ?").bind(targetUserId, sourceUserId).run();
      await this.db.prepare(`
        UPDATE pool_members SET user_id = ? 
        WHERE user_id = ? AND pool_id NOT IN (SELECT pool_id FROM pool_members WHERE user_id = ?)
      `).bind(targetUserId, sourceUserId, targetUserId).run();
      await this.db.prepare("DELETE FROM pool_members WHERE user_id = ?").bind(sourceUserId).run();
      await this.db.prepare("UPDATE organizations SET owner_id = ? WHERE owner_id = ?").bind(targetUserId, sourceUserId).run();
      await this.db.prepare(`
        UPDATE organization_members SET user_id = ? 
        WHERE user_id = ? AND organization_id NOT IN (SELECT organization_id FROM organization_members WHERE user_id = ?)
      `).bind(targetUserId, sourceUserId, targetUserId).run();
      await this.db.prepare("DELETE FROM organization_members WHERE user_id = ?").bind(sourceUserId).run();
      await this.db.prepare("UPDATE transactions SET user_id = ? WHERE user_id = ?").bind(targetUserId, sourceUserId).run();
      if (sourceUserId === 'u_admin_init') {
        await this.db.prepare("DELETE FROM users WHERE id = ?").bind(sourceUserId).run();
      }
    } catch (e) {
      console.warn('[Storage] reassignUserResources warning:', e);
    }
  }

  async countPoolsByOrg(orgId: string): Promise<number> {
    try {
      const res = await this.db.prepare("SELECT COUNT(*) as count FROM pools WHERE organization_id = ? AND (is_archived = 0 OR is_archived IS NULL)").bind(orgId).first();
      return Number(res?.count || 0);
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const res = await this.db.prepare("SELECT COUNT(*) as count FROM pools WHERE organization_id = ?").bind(orgId).first();
        return Number(res?.count || 0);
      }
      throw err;
    }
  }

  async countPersonalPools(userId: string): Promise<number> {
    try {
      const res = await this.db.prepare("SELECT COUNT(*) as count FROM pools WHERE (organization_id IS NULL OR organization_id = '') AND champion_id = ? AND (is_archived = 0 OR is_archived IS NULL)").bind(userId).first();
      return Number(res?.count || 0);
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const res = await this.db.prepare("SELECT COUNT(*) as count FROM pools WHERE (organization_id IS NULL OR organization_id = '') AND champion_id = ?").bind(userId).first();
        return Number(res?.count || 0);
      }
      throw err;
    }
  }

  async createPool(pool: Partial<StoragePool> & { id: string; name: string }): Promise<StoragePool> {
    const maxDeficit = pool.max_deficit !== undefined ? pool.max_deficit : 10.00;
    const maxDeficitCents = pool.max_deficit_cents !== undefined ? pool.max_deficit_cents : Math.round(maxDeficit * 100);
    const savingsEnabled = pool.savings_enabled !== undefined ? (pool.savings_enabled ? 1 : 0) : 1;
    const leaderboardOptIn = pool.savings_leaderboard_opt_in ? 1 : 0;
    const leaderboardAlias = pool.leaderboard_alias || null;
    const metroTier = pool.metro_tier || 'standard';

    await this.db.prepare(
      `INSERT INTO pools (id, organization_id, name, category, currency, qr_code_key, description, kiosk_pin, initial_reserve_fund_cents, max_deficit, max_deficit_cents, champion_id, savings_enabled, savings_leaderboard_opt_in, leaderboard_alias, metro_tier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      pool.id,
      pool.organization_id || null,
      pool.name,
      pool.category || 'Office',
      pool.currency || '$',
      pool.qr_code_key || null,
      pool.description || null,
      pool.kiosk_pin || '1234',
      pool.initial_reserve_fund_cents || 0,
      maxDeficit,
      maxDeficitCents,
      pool.champion_id || null,
      savingsEnabled,
      leaderboardOptIn,
      leaderboardAlias,
      metroTier
    ).run();

    const created = await this.getPoolById(pool.id);
    if (created && created.name === pool.name) return created;
    return {
      id: pool.id,
      organization_id: pool.organization_id || null,
      name: pool.name,
      category: pool.category || 'Office',
      currency: pool.currency || '$',
      qr_code_key: pool.qr_code_key || null,
      description: pool.description || null,
      kiosk_pin: pool.kiosk_pin || '1234',
      initial_reserve_fund_cents: pool.initial_reserve_fund_cents || 0,
      max_deficit: maxDeficit,
      max_deficit_cents: maxDeficitCents,
      champion_id: pool.champion_id || null,
      savings_enabled: Boolean(savingsEnabled),
      savings_leaderboard_opt_in: Boolean(leaderboardOptIn),
      leaderboard_alias: leaderboardAlias,
      metro_tier: metroTier,
      created_at: new Date().toISOString()
    };
  }

  async updatePool(id: string, updates: Partial<StoragePool>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
    if (updates.currency !== undefined) { fields.push('currency = ?'); values.push(updates.currency); }
    if (updates.qr_code_key !== undefined) { fields.push('qr_code_key = ?'); values.push(updates.qr_code_key); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.kiosk_pin !== undefined) { fields.push('kiosk_pin = ?'); values.push(updates.kiosk_pin); }
    if (updates.max_deficit !== undefined) { fields.push('max_deficit = ?'); values.push(updates.max_deficit); }
    if (updates.max_deficit_cents !== undefined) { fields.push('max_deficit_cents = ?'); values.push(updates.max_deficit_cents); }
    if (updates.savings_enabled !== undefined) { fields.push('savings_enabled = ?'); values.push(updates.savings_enabled ? 1 : 0); }
    if (updates.savings_leaderboard_opt_in !== undefined) { fields.push('savings_leaderboard_opt_in = ?'); values.push(updates.savings_leaderboard_opt_in ? 1 : 0); }
    if (updates.leaderboard_alias !== undefined) { fields.push('leaderboard_alias = ?'); values.push(updates.leaderboard_alias); }
    if (updates.metro_tier !== undefined) { fields.push('metro_tier = ?'); values.push(updates.metro_tier); }

    if (fields.length === 0) return;
    values.push(id);
    await this.db.prepare(`UPDATE pools SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  async deletePool(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void> {
    const isHardDelete = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
    if (isHardDelete) {
      await this.db.prepare("DELETE FROM pools WHERE id = ?").bind(id).run();
    } else {
      await this.db.prepare("UPDATE pools SET is_archived = 1, archived_at = datetime('now') WHERE id = ?").bind(id).run();
    }
  }

  async archivePool(id: string): Promise<void> {
    await this.deletePool(id, { hardDelete: false });
  }

  async restorePool(id: string): Promise<void> {
    await this.db.prepare("UPDATE pools SET is_archived = 0, archived_at = NULL WHERE id = ?").bind(id).run();
  }

  async getPoolMember(poolId: string, userId: string): Promise<StoragePoolMember | null> {
    const row: any = await this.db.prepare("SELECT * FROM pool_members WHERE pool_id = ? AND user_id = ?").bind(poolId, userId).first();
    return row ? this.mapMember(row) : null;
  }

  async listPoolMembers(poolId: string): Promise<StoragePoolMember[]> {
    const res = await this.db.prepare("SELECT * FROM pool_members WHERE pool_id = ? ORDER BY joined_at ASC").bind(poolId).all();
    return (res.results || []).map((r: any) => this.mapMember(r));
  }

  async upsertPoolMember(member: Partial<StoragePoolMember> & { id: string; pool_id: string; user_id: string }): Promise<void> {
    await this.db.prepare(
      `INSERT INTO pool_members (id, pool_id, user_id, role, balance, balance_cents)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(pool_id, user_id) DO UPDATE SET role = excluded.role`
    ).bind(member.id, member.pool_id, member.user_id, member.role || 'member', member.balance || 0, member.balance_cents || 0).run();
  }

  async updateMemberRole(poolId: string, userId: string, role: string): Promise<void> {
    await this.db.prepare("UPDATE pool_members SET role = ? WHERE pool_id = ? AND user_id = ?").bind(role, poolId, userId).run();
  }

  async removePoolMember(poolId: string, userId: string): Promise<void> {
    await this.db.prepare("DELETE FROM pool_members WHERE pool_id = ? AND user_id = ?").bind(poolId, userId).run();
  }

  async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number): Promise<void> {
    await this.db.prepare(
      `UPDATE pool_members
       SET balance = balance + ?, balance_cents = balance_cents + ?
       WHERE pool_id = ? AND user_id = ?`
    ).bind(deltaAmount, deltaCents, poolId, userId).run();
  }

  // Items
  async getItemById(id: string): Promise<StorageItem | null> {
    const row: any = await this.db.prepare("SELECT * FROM items WHERE id = ?").bind(id).first();
    return row ? this.mapItem(row) : null;
  }

  async listItemsByPool(poolId: string): Promise<StorageItem[]> {
    const res = await this.db.prepare("SELECT * FROM items WHERE pool_id = ? ORDER BY name ASC").bind(poolId).all();
    return (res.results || []).map((r: any) => this.mapItem(r));
  }

  async saveItem(item: Partial<StorageItem> & { id: string; pool_id: string; name: string }): Promise<StorageItem> {
    const vendingBenchmarkCents = item.vending_benchmark_cents !== undefined ? Number(item.vending_benchmark_cents) : 0;
    await this.db.prepare(
      `INSERT INTO items (id, pool_id, name, category, stock, min_stock, cost_per_unit, cost_per_unit_cents, vending_benchmark_cents, unit_name, icon, image_url, description, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         category = excluded.category,
         stock = excluded.stock,
         min_stock = excluded.min_stock,
         cost_per_unit = excluded.cost_per_unit,
         cost_per_unit_cents = excluded.cost_per_unit_cents,
         vending_benchmark_cents = excluded.vending_benchmark_cents,
         unit_name = excluded.unit_name,
         icon = excluded.icon,
         image_url = excluded.image_url,
         description = excluded.description,
         barcode = excluded.barcode`
    ).bind(
      item.id,
      item.pool_id,
      item.name,
      item.category || 'Snacks',
      item.stock ?? 0,
      item.min_stock ?? 5,
      item.cost_per_unit || 0,
      item.cost_per_unit_cents || Math.round((item.cost_per_unit || 0) * 100),
      vendingBenchmarkCents,
      item.unit_name || 'unit',
      item.icon || 'package',
      item.image_url || null,
      item.description || null,
      item.barcode || null
    ).run();

    const saved = await this.getItemById(item.id);
    return saved!;
  }

  async deleteItem(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  }

  async adjustItemStock(id: string, deltaQty: number): Promise<void> {
    await this.db.prepare("UPDATE items SET stock = MAX(0, stock + ?) WHERE id = ?").bind(deltaQty, id).run();
  }

  // Transactions
  async getTransactionById(id: string): Promise<StorageTransaction | null> {
    const row: any = await this.db.prepare("SELECT * FROM transactions WHERE id = ?").bind(id).first();
    return row ? this.mapTransaction(row) : null;
  }

  async listTransactionsByPool(poolId: string, limit = 200): Promise<StorageTransaction[]> {
    const res = await this.db.prepare(
      `SELECT t.*, u.name as user_name, u.avatar_url as user_avatar, i.name as db_item_name
       FROM transactions t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN items i ON t.item_id = i.id
       WHERE t.pool_id = ?
       ORDER BY t.created_at DESC LIMIT ?`
    ).bind(poolId, limit).all();
    return (res.results || []).map((r: any) => this.mapTransaction(r));
  }

  async createTransaction(tx: StorageTransaction): Promise<StorageTransaction> {
    await this.db.prepare(
      `INSERT INTO transactions (id, pool_id, user_id, item_id, item_name, type, amount, amount_cents, savings_cents, quantity, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tx.id,
      tx.pool_id,
      tx.user_id,
      tx.item_id || null,
      tx.item_name || null,
      tx.type,
      tx.amount,
      tx.amount_cents || Math.round(tx.amount * 100),
      tx.savings_cents || 0,
      tx.quantity || 1,
      tx.description || null
    ).run();
    return tx;
  }

  // Shopping List
  async listShoppingItems(poolId: string): Promise<StorageShoppingItem[]> {
    const res = await this.db.prepare("SELECT * FROM shopping_items WHERE pool_id = ? ORDER BY created_at DESC").bind(poolId).all();
    return (res.results || []).map((r: any) => this.mapShoppingItem(r));
  }

  async createShoppingItem(item: StorageShoppingItem): Promise<StorageShoppingItem> {
    await this.db.prepare(
      `INSERT INTO shopping_items (id, pool_id, name, category, quantity, estimated_cost, estimated_cost_cents, suggested_by, purchased, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      item.id,
      item.pool_id,
      item.name,
      item.category,
      item.quantity,
      item.estimated_cost,
      item.estimated_cost_cents,
      item.suggested_by,
      item.purchased ? 1 : 0,
      item.reason || null
    ).run();
    return item;
  }

  async updateShoppingItemStatus(id: string, poolId: string, purchased: boolean): Promise<void> {
    await this.db.prepare(
      "UPDATE shopping_items SET purchased = ? WHERE id = ? AND pool_id = ?"
    ).bind(purchased ? 1 : 0, id, poolId).run();
  }

  async deleteShoppingItem(id: string, poolId: string): Promise<void> {
    await this.db.prepare("DELETE FROM shopping_items WHERE id = ? AND pool_id = ?").bind(id, poolId).run();
  }

  // Polls
  async listPolls(poolId: string): Promise<StoragePoll[]> {
    const res = await this.db.prepare("SELECT * FROM polls WHERE pool_id = ? ORDER BY created_at DESC").bind(poolId).all();
    return (res.results || []).map((r: any) => this.mapPollEntity(r));
  }

  async getPollById(id: string, poolId?: string): Promise<StoragePoll | null> {
    try {
      const query = poolId
        ? "SELECT * FROM polls WHERE id = ? AND pool_id = ?"
        : "SELECT * FROM polls WHERE id = ?";
      const row: any = poolId
        ? await this.db.prepare(query).bind(id, poolId).first()
        : await this.db.prepare(query).bind(id).first();
      return row ? this.mapPollEntity(row) : null;
    } catch {
      return null;
    }
  }

  async createPoll(poll: StoragePoll): Promise<StoragePoll> {
    const active = poll.status === 'closed' ? 0 : 1;
    const status = poll.status || 'active';
    try {
      await this.db.prepare(
        `INSERT INTO polls (id, pool_id, title, options, options_json, votes, created_by, active, status, created_at)
         VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, datetime('now'))`
      ).bind(poll.id, poll.pool_id, poll.title, poll.options_json, poll.options_json, poll.created_by, active, status).run();
    } catch {
      try {
        await this.db.prepare(
          `INSERT INTO polls (id, pool_id, title, options, votes, created_by, active, created_at)
           VALUES (?, ?, ?, ?, '{}', ?, ?, datetime('now'))`
        ).bind(poll.id, poll.pool_id, poll.title, poll.options_json, poll.created_by, active).run();
      } catch {
        await this.db.prepare(
          `INSERT INTO polls (id, pool_id, title, options_json, created_by, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(poll.id, poll.pool_id, poll.title, poll.options_json, poll.created_by, status).run();
      }
    }
    return poll;
  }

  async updatePoll(id: string, poolId: string, updates: Partial<StoragePoll>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.options_json !== undefined) { fields.push('options_json = ?'); values.push(updates.options_json); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }

    if (fields.length === 0) return;
    values.push(id, poolId);
    try {
      await this.db.prepare(`UPDATE polls SET ${fields.join(', ')} WHERE id = ? AND pool_id = ?`).bind(...values).run();
    } catch {
      // Handle fallback schema if columns named differently
      if (updates.options_json !== undefined) {
        await this.db.prepare("UPDATE polls SET options = ? WHERE id = ? AND pool_id = ?").bind(updates.options_json, id, poolId).run();
      }
    }
  }

  async deletePoll(id: string, poolId: string): Promise<void> {
    await this.db.prepare("DELETE FROM polls WHERE id = ? AND pool_id = ?").bind(id, poolId).run();
  }

  // Notifications
  async listNotifications(userId: string, limit = 50): Promise<StorageNotification[]> {
    const res = await this.db.prepare(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
    ).bind(userId, limit).all();
    return (res.results || []).map((r: any) => this.mapNotification(r));
  }

  async createNotification(notif: StorageNotification): Promise<StorageNotification> {
    await this.db.prepare(
      `INSERT INTO notifications (id, user_id, pool_id, type, title, message, channel, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      notif.id,
      notif.user_id,
      notif.pool_id || null,
      notif.type,
      notif.title,
      notif.message,
      notif.channel || 'in_app',
      notif.is_read ? 1 : 0
    ).run();
    return notif;
  }

  async markNotificationsRead(userId: string, notifId?: string): Promise<void> {
    if (notifId) {
      await this.db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?").bind(notifId, userId).run();
    } else {
      await this.db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").bind(userId).run();
    }
  }

  async deleteNotification(id: string, userId?: string): Promise<void> {
    if (userId) {
      await this.db.prepare("DELETE FROM notifications WHERE id = ? AND user_id = ?").bind(id, userId).run();
    } else {
      await this.db.prepare("DELETE FROM notifications WHERE id = ?").bind(id).run();
    }
  }

  // Notification Preferences
  async getNotificationPreferences(userId: string): Promise<StorageNotificationPreferences | null> {
    const res = await this.db.prepare("SELECT * FROM notification_preferences WHERE user_id = ?").bind(userId).all();
    const rows = res.results || [];
    if (!rows[0]) return null;
    const r: any = rows[0];
    return {
      user_id: r.user_id,
      low_stock_email: Boolean(r.low_stock_email),
      low_stock_sms: Boolean(r.low_stock_sms),
      low_stock_in_app: r.low_stock_in_app !== undefined ? Boolean(r.low_stock_in_app) : true,
      weekly_digest_email: Boolean(r.weekly_digest_email),
      weekly_digest_in_app: r.weekly_digest_in_app !== undefined ? Boolean(r.weekly_digest_in_app) : true,
      deposit_in_app: r.deposit_in_app !== undefined ? Boolean(r.deposit_in_app) : true,
      phone_number: r.phone_number || '',
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
    };
  }

  async saveNotificationPreferences(userId: string, prefs: Partial<StorageNotificationPreferences>): Promise<StorageNotificationPreferences> {
    const current = await this.getNotificationPreferences(userId);
    const lowStockEmail = prefs.low_stock_email !== undefined ? (prefs.low_stock_email ? 1 : 0) : (current?.low_stock_email ? 1 : 0);
    const lowStockSms = prefs.low_stock_sms !== undefined ? (prefs.low_stock_sms ? 1 : 0) : (current?.low_stock_sms ? 1 : 0);
    const weeklyDigestEmail = prefs.weekly_digest_email !== undefined ? (prefs.weekly_digest_email ? 1 : 0) : (current?.weekly_digest_email ? 1 : 0);
    const phoneNumber = prefs.phone_number !== undefined ? prefs.phone_number : (current?.phone_number || '');
    const nowIso = new Date().toISOString();

    await this.db.prepare(
      `INSERT INTO notification_preferences (user_id, low_stock_email, low_stock_sms, weekly_digest_email, phone_number, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         low_stock_email = excluded.low_stock_email,
         low_stock_sms = excluded.low_stock_sms,
         weekly_digest_email = excluded.weekly_digest_email,
         phone_number = excluded.phone_number,
         updated_at = excluded.updated_at`
    ).bind(userId, lowStockEmail, lowStockSms, weeklyDigestEmail, phoneNumber, nowIso).run();

    return {
      user_id: userId,
      low_stock_email: Boolean(lowStockEmail),
      low_stock_sms: Boolean(lowStockSms),
      weekly_digest_email: Boolean(weeklyDigestEmail),
      phone_number: phoneNumber,
      updated_at: nowIso,
    };
  }

  // Webhooks
  async listWebhooks(poolId: string): Promise<StorageWebhook[]> {
    const res = await this.db.prepare("SELECT * FROM pool_webhooks WHERE pool_id = ? ORDER BY created_at DESC").bind(poolId).all();
    return (res.results || []).map((r: any) => this.mapWebhook(r));
  }

  async saveWebhook(webhook: StorageWebhook): Promise<StorageWebhook> {
    await this.db.prepare(
      `INSERT INTO pool_webhooks (id, pool_id, platform, webhook_url, channel_name, enabled_events)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         platform = excluded.platform,
         webhook_url = excluded.webhook_url,
         channel_name = excluded.channel_name,
         enabled_events = excluded.enabled_events`
    ).bind(
      webhook.id,
      webhook.pool_id,
      webhook.platform,
      webhook.webhook_url,
      webhook.channel_name || null,
      webhook.enabled_events || '["consume","low_stock"]'
    ).run();
    return webhook;
  }

  async deleteWebhook(id: string, poolId?: string): Promise<void> {
    if (poolId) {
      await this.db.prepare("DELETE FROM pool_webhooks WHERE id = ? AND pool_id = ?").bind(id, poolId).run();
    } else {
      await this.db.prepare("DELETE FROM pool_webhooks WHERE id = ?").bind(id).run();
    }
  }

  // SSO
  async getSsoConfigByDomain(domain: string): Promise<StorageSsoConfig | null> {
    const row: any = await this.db.prepare("SELECT * FROM sso_configurations WHERE LOWER(domain) = LOWER(?)").bind(domain.trim()).first();
    return row ? this.mapSso(row) : null;
  }

  async getSsoConfigByOrg(orgId: string): Promise<StorageSsoConfig | null> {
    const row: any = await this.db.prepare("SELECT * FROM sso_configurations WHERE organization_id = ?").bind(orgId).first();
    return row ? this.mapSso(row) : null;
  }

  async saveSsoConfig(config: StorageSsoConfig): Promise<StorageSsoConfig> {
    await this.db.prepare(
      `INSERT INTO sso_configurations (id, organization_id, domain, idp_entity_id, sso_url, certificate, protocol, client_id, client_secret, jit_provisioning, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(domain) DO UPDATE SET
         idp_entity_id = excluded.idp_entity_id,
         sso_url = excluded.sso_url,
         certificate = excluded.certificate,
         protocol = excluded.protocol,
         client_id = excluded.client_id,
         client_secret = excluded.client_secret,
         jit_provisioning = excluded.jit_provisioning,
         enabled = excluded.enabled`
    ).bind(
      config.id,
      config.organization_id,
      config.domain.toLowerCase().trim(),
      config.idp_entity_id,
      config.sso_url,
      config.certificate || null,
      config.protocol || 'saml2',
      config.client_id || null,
      config.client_secret || null,
      config.jit_provisioning ? 1 : 0,
      config.enabled ? 1 : 0
    ).run();
    return config;
  }

  // System Settings & Admin
  async getSystemSettings(): Promise<Record<string, any>> {
    try {
      const res = await this.db.prepare("SELECT setting_key, setting_value FROM system_settings").all();
      const settings: Record<string, any> = {};
      for (const row of (res.results || []) as any[]) {
        const k = row.setting_key ?? row.key;
        const v = row.setting_value ?? row.value;
        if (k !== undefined && v !== undefined && v !== null) {
          try {
            settings[k] = JSON.parse(v);
          } catch {
            settings[k] = v;
          }
        }
      }
      return settings;
    } catch {
      return {};
    }
  }

  async saveSystemSettings(settings: Record<string, any>): Promise<void> {
    for (const [key, val] of Object.entries(settings)) {
      const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
      await this.db.prepare(
        "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value"
      ).bind(key, valStr).run();
    }
  }

  async getPlatformStats(): Promise<{ totalUsers: number; totalPools: number; totalTransactions: number; totalVolume: number }> {
    const [uRes, pRes, tRes]: any[] = await Promise.all([
      this.db.prepare("SELECT COUNT(*) as count FROM users").all(),
      this.db.prepare("SELECT COUNT(*) as count FROM pools").all(),
      this.db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(ABS(amount)), 0) as volume FROM transactions").all()
    ]);
    return {
      totalUsers: Number(uRes?.results?.[0]?.count || 0),
      totalPools: Number(pRes?.results?.[0]?.count || 0),
      totalTransactions: Number(tRes?.results?.[0]?.count || 0),
      totalVolume: Number(tRes?.results?.[0]?.volume || 0)
    };
  }

  // Telemetry & Operational Analytics
  async recordTelemetryEvents(events: StorageTelemetryEvent[]): Promise<void> {
    if (!events || events.length === 0) return;
    try {
      const stmts = events.map((e) =>
        this.db.prepare(
          `INSERT INTO telemetry_events (id, event_name, category, session_id, user_id, pool_id, properties_json, path, client_timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
          e.id,
          e.event_name,
          e.category,
          e.session_id || null,
          e.user_id || null,
          e.pool_id || null,
          e.properties_json || null,
          e.path || null,
          e.client_timestamp || null
        )
      );
      await this.db.batch(stmts);
    } catch (err: any) {
      console.warn('[D1StorageAdapter] Failed to record telemetry batch:', err?.message || err);
    }
  }

  async getTelemetryStats(days: number = 7): Promise<TelemetryStats> {
    try {
      const windowStr = `-${Math.max(1, Math.min(days, 90))} days`;
      const [totalRes, topFeatRes, errorRes, funnelRes, daysRes, recentRes]: any[] = await Promise.all([
        this.db.prepare("SELECT COUNT(*) as count FROM telemetry_events WHERE created_at >= datetime('now', ?)").bind(windowStr).all(),
        this.db.prepare("SELECT event_name, COUNT(*) as count FROM telemetry_events WHERE category = 'feature' AND created_at >= datetime('now', ?) GROUP BY event_name ORDER BY count DESC LIMIT 10").bind(windowStr).all(),
        this.db.prepare("SELECT event_name, COUNT(*) as count, MAX(created_at) as last_seen FROM telemetry_events WHERE category = 'error' AND created_at >= datetime('now', ?) GROUP BY event_name ORDER BY count DESC LIMIT 10").bind(windowStr).all(),
        this.db.prepare("SELECT event_name, COUNT(*) as count FROM telemetry_events WHERE category = 'funnel' AND created_at >= datetime('now', ?) GROUP BY event_name ORDER BY count DESC LIMIT 10").bind(windowStr).all(),
        this.db.prepare("SELECT date(created_at) as day, COUNT(*) as count FROM telemetry_events WHERE created_at >= datetime('now', ?) GROUP BY day ORDER BY day ASC").bind(windowStr).all(),
        this.db.prepare("SELECT * FROM telemetry_events ORDER BY created_at DESC LIMIT 50").all(),
      ]);

      return {
        periodDays: days,
        totalEvents: Number(totalRes?.results?.[0]?.count || 0),
        topFeatures: (topFeatRes?.results || []).map((r: any) => ({ event_name: r.event_name, count: Number(r.count || 0) })),
        errorSummary: (errorRes?.results || []).map((r: any) => ({ event_name: r.event_name, count: Number(r.count || 0), last_seen: r.last_seen || '' })),
        funnelBreakdown: (funnelRes?.results || []).map((r: any) => ({ event_name: r.event_name, count: Number(r.count || 0) })),
        activityByDay: (daysRes?.results || []).map((r: any) => ({ day: r.day, count: Number(r.count || 0) })),
        recentEvents: (recentRes?.results || []).map((r: any) => ({
          id: r.id,
          event_name: r.event_name,
          category: r.category,
          session_id: r.session_id,
          user_id: r.user_id,
          pool_id: r.pool_id,
          properties_json: r.properties_json,
          path: r.path,
          client_timestamp: r.client_timestamp,
          created_at: r.created_at,
        })),
      };
    } catch {
      return {
        periodDays: days,
        totalEvents: 0,
        topFeatures: [],
        errorSummary: [],
        funnelBreakdown: [],
        activityByDay: [],
        recentEvents: [],
      };
    }
  }

  // Entity Mappers
  private mapUser(row: any): StorageUser {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatar_url: row.avatar_url,
      password_hash: row.password_hash,
      google_id: row.google_id,
      apple_id: row.apple_id,
      system_role: row.system_role || 'user',
      token_version: Number(row.token_version || 1),
      venmo_handle: row.venmo_handle,
      cashapp_handle: row.cashapp_handle,
      paypal_handle: row.paypal_handle,
      zelle_identifier: row.zelle_identifier,
      apple_pay_handle: row.apple_pay_handle,
      preferred_payment_method: row.preferred_payment_method,
      is_archived: Boolean(row.is_archived),
      archived_at: row.archived_at || null,
      created_at: row.created_at
    };
  }

  private mapOrg(row: any): StorageOrganization {
    return {
      id: row.id,
      name: row.name,
      owner_id: row.owner_id,
      tier: row.tier || 'starter',
      invite_code: row.invite_code || null,
      role: row.role || undefined,
      stripe_customer_id: row.stripe_customer_id,
      stripe_subscription_id: row.stripe_subscription_id,
      ai_scan_monthly_quota: row.ai_scan_monthly_quota,
      ai_scan_count_current_period: row.ai_scan_count_current_period,
      scim_enabled: Boolean(row.scim_enabled),
      is_archived: Boolean(row.is_archived),
      archived_at: row.archived_at || null,
      created_at: row.created_at
    };
  }

  private mapPool(row: any): StoragePool {
    const maxDeficit = row.max_deficit !== undefined && row.max_deficit !== null ? Number(row.max_deficit) : 10.00;
    const maxDeficitCents = row.max_deficit_cents !== undefined && row.max_deficit_cents !== null ? Number(row.max_deficit_cents) : Math.round(maxDeficit * 100);
    return {
      id: row.id,
      organization_id: row.organization_id,
      name: row.name,
      category: row.category || 'Office',
      currency: row.currency || '$',
      qr_code_key: row.qr_code_key,
      description: row.description,
      kiosk_pin: row.kiosk_pin,
      initial_reserve_fund_cents: row.initial_reserve_fund_cents,
      champion_id: row.champion_id,
      max_deficit: maxDeficit,
      max_deficit_cents: maxDeficitCents,
      savings_enabled: Boolean(row.savings_enabled),
      savings_leaderboard_opt_in: Boolean(row.savings_leaderboard_opt_in),
      leaderboard_alias: row.leaderboard_alias || null,
      metro_tier: row.metro_tier || 'standard',
      is_archived: Boolean(row.is_archived),
      archived_at: row.archived_at || null,
      created_at: row.created_at
    };
  }

  private mapMember(row: any): StoragePoolMember {
    return {
      id: row.id,
      pool_id: row.pool_id,
      user_id: row.user_id,
      role: row.role || 'member',
      balance: Number(row.balance || 0),
      balance_cents: row.balance_cents !== undefined ? Number(row.balance_cents) : Math.round(Number(row.balance || 0) * 100),
      joined_at: row.joined_at
    };
  }

  private mapItem(row: any): StorageItem {
    return {
      id: row.id,
      pool_id: row.pool_id,
      name: row.name,
      category: row.category || 'Snacks',
      stock: Number(row.stock || 0),
      min_stock: Number(row.min_stock || 5),
      cost_per_unit: Number(row.cost_per_unit || 0),
      cost_per_unit_cents: row.cost_per_unit_cents !== undefined ? Number(row.cost_per_unit_cents) : Math.round(Number(row.cost_per_unit || 0) * 100),
      vending_benchmark_cents: row.vending_benchmark_cents !== undefined ? Number(row.vending_benchmark_cents) : 0,
      unit_name: row.unit_name || 'unit',
      icon: row.icon || 'package',
      image_url: row.image_url,
      description: row.description,
      barcode: row.barcode,
      last_restocked_at: row.last_restocked_at,
      updated_at: row.updated_at
    };
  }

  private mapTransaction(row: any): StorageTransaction {
    const resolvedItemName = row.item_name || row.db_item_name || (row.type === 'deposit' ? 'Balance Deposit' : null);
    return {
      id: row.id,
      pool_id: row.pool_id,
      user_id: row.user_id,
      user_name: row.user_name || null,
      user_avatar: row.user_avatar || null,
      item_id: row.item_id,
      item_name: resolvedItemName,
      type: row.type,
      amount: Number(row.amount || 0),
      amount_cents: row.amount_cents !== undefined ? Number(row.amount_cents) : Math.round(Number(row.amount || 0) * 100),
      savings_cents: row.savings_cents !== undefined ? Number(row.savings_cents) : 0,
      quantity: Number(row.quantity || 1),
      description: row.description,
      created_at: row.created_at
    };
  }

  private mapShoppingItem(row: any): StorageShoppingItem {
    const isPurchased = row.status === 'purchased' || row.purchased === 1 || row.purchased === true;
    return {
      id: row.id,
      pool_id: row.pool_id,
      name: row.name,
      category: row.category || 'Snacks',
      quantity: Number(row.quantity || 1),
      estimated_cost: Number(row.estimated_cost || 0),
      estimated_cost_cents: row.estimated_cost_cents !== undefined ? Number(row.estimated_cost_cents) : Math.round(Number(row.estimated_cost || 0) * 100),
      suggested_by: row.suggested_by || 'Member',
      purchased: isPurchased,
      reason: row.reason,
      created_at: row.created_at
    };
  }

  private mapPollEntity(row: any): StoragePoll {
    return {
      id: row.id,
      pool_id: row.pool_id,
      title: row.title,
      options_json: row.options_json || row.options || '[]',
      created_by: row.created_by || 'Member',
      status: row.status || (row.active === 0 ? 'closed' : 'active'),
      created_at: row.created_at
    };
  }

  private mapNotification(row: any): StorageNotification {
    return {
      id: row.id,
      user_id: row.user_id,
      pool_id: row.pool_id,
      type: row.type,
      title: row.title,
      message: row.message,
      channel: row.channel || 'in_app',
      is_read: Boolean(row.is_read),
      created_at: row.created_at
    };
  }

  private mapWebhook(row: any): StorageWebhook {
    return {
      id: row.id,
      pool_id: row.pool_id,
      platform: row.platform,
      webhook_url: row.webhook_url,
      channel_name: row.channel_name,
      enabled_events: row.enabled_events,
      created_at: row.created_at
    };
  }

  private mapSso(row: any): StorageSsoConfig {
    return {
      id: row.id,
      organization_id: row.organization_id,
      domain: row.domain,
      idp_entity_id: row.idp_entity_id,
      sso_url: row.sso_url,
      certificate: row.certificate,
      protocol: row.protocol || 'saml2',
      client_id: row.client_id,
      client_secret: row.client_secret,
      jit_provisioning: Boolean(row.jit_provisioning),
      enabled: Boolean(row.enabled),
      created_at: row.created_at
    };
  }

  // Affiliate Products & Click Tracking
  async listAffiliateProducts(onlyActive = true): Promise<StorageAffiliateProduct[]> {
    try {
      const query = onlyActive
        ? "SELECT * FROM affiliate_products WHERE is_active = 1 ORDER BY display_order ASC, created_at DESC"
        : "SELECT * FROM affiliate_products ORDER BY display_order ASC, created_at DESC";
      const { results } = await this.db.prepare(query).all();
      return (results || []).map((r: any) => this.mapAffiliateProduct(r));
    } catch {
      return [];
    }
  }

  async getAffiliateProductById(id: string): Promise<StorageAffiliateProduct | null> {
    try {
      const row = await this.db.prepare("SELECT * FROM affiliate_products WHERE id = ?").bind(id).first();
      return row ? this.mapAffiliateProduct(row) : null;
    } catch {
      return null;
    }
  }

  async createAffiliateProduct(product: Partial<StorageAffiliateProduct> & { id: string; title: string; affiliate_url: string }): Promise<StorageAffiliateProduct> {
    await this.db.prepare(`
      INSERT INTO affiliate_products (id, title, description, category, image_url, affiliate_url, badge, price_estimate, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      product.id,
      product.title.trim(),
      product.description || '',
      product.category || 'Pantry & Fridge Organizers',
      product.image_url || null,
      product.affiliate_url.trim(),
      product.badge || 'Staff Pick',
      product.price_estimate || 0.00,
      product.display_order || 0,
      product.is_active !== undefined ? (product.is_active ? 1 : 0) : 1
    ).run();

    const created = await this.getAffiliateProductById(product.id);
    if (created) return created;
    return {
      id: product.id,
      title: product.title.trim(),
      description: product.description || '',
      category: product.category || 'Pantry & Fridge Organizers',
      image_url: product.image_url || null,
      affiliate_url: product.affiliate_url.trim(),
      badge: product.badge || 'Staff Pick',
      price_estimate: product.price_estimate || 0.00,
      display_order: product.display_order || 0,
      is_active: product.is_active !== undefined ? product.is_active : true,
      click_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async updateAffiliateProduct(id: string, updates: Partial<StorageAffiliateProduct>): Promise<StorageAffiliateProduct | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title.trim()); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
    if (updates.image_url !== undefined) { fields.push('image_url = ?'); values.push(updates.image_url); }
    if (updates.affiliate_url !== undefined) { fields.push('affiliate_url = ?'); values.push(updates.affiliate_url.trim()); }
    if (updates.badge !== undefined) { fields.push('badge = ?'); values.push(updates.badge); }
    if (updates.price_estimate !== undefined) { fields.push('price_estimate = ?'); values.push(Number(updates.price_estimate)); }
    if (updates.display_order !== undefined) { fields.push('display_order = ?'); values.push(Number(updates.display_order)); }
    if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active ? 1 : 0); }
    if (updates.click_count !== undefined) { fields.push('click_count = ?'); values.push(Number(updates.click_count)); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      await this.db.prepare(`UPDATE affiliate_products SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    }

    return this.getAffiliateProductById(id);
  }

  async deleteAffiliateProduct(id: string): Promise<void> {
    try {
      await this.db.prepare("DELETE FROM affiliate_products WHERE id = ?").bind(id).run();
    } catch {}
  }

  async recordAffiliateClick(click: StorageAffiliateClick): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO affiliate_clicks (id, product_id, user_id, source, referrer, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        click.id,
        click.product_id,
        click.user_id || null,
        click.source || 'marketing',
        click.referrer || null,
        click.user_agent || null
      ).run();

      await this.db.prepare("UPDATE affiliate_products SET click_count = click_count + 1 WHERE id = ?").bind(click.product_id).run();
    } catch {}
  }

  async getAffiliateStats(): Promise<StorageAffiliateStats> {
    try {
      const prodCounts: any = await this.db.prepare(`
        SELECT COUNT(*) as total, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active, SUM(click_count) as total_clicks
        FROM affiliate_products
      `).first();

      const sourceRows: any = await this.db.prepare(`
        SELECT source, COUNT(*) as count FROM affiliate_clicks GROUP BY source ORDER BY count DESC
      `).all();

      const topRows: any = await this.db.prepare(`
        SELECT id, title, click_count FROM affiliate_products ORDER BY click_count DESC LIMIT 5
      `).all();

      return {
        totalProducts: Number(prodCounts?.total || 0),
        activeProducts: Number(prodCounts?.active || 0),
        totalClicks: Number(prodCounts?.total_clicks || 0),
        clicksBySource: (sourceRows?.results || []).map((r: any) => ({ source: r.source, count: Number(r.count) })),
        topProducts: (topRows?.results || []).map((r: any) => ({ id: r.id, title: r.title, clickCount: Number(r.click_count) }))
      };
    } catch {
      return { totalProducts: 0, activeProducts: 0, totalClicks: 0, clicksBySource: [], topProducts: [] };
    }
  }

  async saveAffiliateImage(image: StorageAffiliateImage): Promise<void> {
    await this.db
      .prepare("INSERT OR REPLACE INTO affiliate_images (id, mime_type, data) VALUES (?, ?, ?)")
      .bind(image.id, image.mime_type, image.data)
      .run();
  }

  async getAffiliateImage(id: string): Promise<StorageAffiliateImage | null> {
    const row: any = await this.db.prepare("SELECT * FROM affiliate_images WHERE id = ?").bind(id).first();
    if (!row) return null;
    return {
      id: row.id,
      mime_type: row.mime_type,
      data: row.data,
      created_at: row.created_at || undefined,
    };
  }

  async deleteAffiliateImage(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM affiliate_images WHERE id = ?").bind(id).run();
  }

  async saveUserAvatar(avatar: StorageUserAvatar): Promise<void> {
    await this.db
      .prepare("INSERT OR REPLACE INTO user_avatars (id, user_id, mime_type, data) VALUES (?, ?, ?, ?)")
      .bind(avatar.id, avatar.user_id, avatar.mime_type, avatar.data)
      .run();
  }

  async getUserAvatar(id: string): Promise<StorageUserAvatar | null> {
    const row: any = await this.db.prepare("SELECT * FROM user_avatars WHERE id = ?").bind(id).first();
    if (!row) return null;
    return {
      id: row.id,
      user_id: row.user_id,
      mime_type: row.mime_type,
      data: row.data,
      created_at: row.created_at || undefined,
    };
  }

  async deleteUserAvatar(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM user_avatars WHERE id = ?").bind(id).run();
  }

  async deleteUser(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void> {
    const isHardDelete = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
    if (isHardDelete) {
      try { await this.db.prepare("DELETE FROM passkey_credentials WHERE user_id = ?").bind(id).run(); } catch {}
      try { await this.db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").bind(id).run(); } catch {}
      try { await this.db.prepare("DELETE FROM notifications WHERE user_id = ?").bind(id).run(); } catch {}
      try { await this.db.prepare("DELETE FROM notification_preferences WHERE user_id = ?").bind(id).run(); } catch {}
      try { await this.db.prepare("DELETE FROM organization_members WHERE user_id = ?").bind(id).run(); } catch {}
      try { await this.db.prepare("DELETE FROM pool_members WHERE user_id = ?").bind(id).run(); } catch {}
      try { await this.db.prepare("UPDATE telemetry_events SET user_id = NULL WHERE user_id = ?").bind(id).run(); } catch {}
      await this.db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    } else {
      await this.db.prepare("UPDATE users SET is_archived = 1, archived_at = datetime('now'), token_version = token_version + 1 WHERE id = ?").bind(id).run();
    }
  }

  async archiveUser(id: string): Promise<void> {
    await this.deleteUser(id, { hardDelete: false });
  }

  async restoreUser(id: string): Promise<void> {
    await this.db.prepare("UPDATE users SET is_archived = 0, archived_at = NULL WHERE id = ?").bind(id).run();
  }

  async getOrgByStripeCustomerId(customerId: string): Promise<StorageOrganization | null> {
    const row: any = await this.db.prepare("SELECT * FROM organizations WHERE stripe_customer_id = ?").bind(customerId).first();
    return row ? this.mapOrg(row) : null;
  }

  async getOrgByStripeSubscriptionId(subscriptionId: string): Promise<StorageOrganization | null> {
    const row: any = await this.db.prepare("SELECT * FROM organizations WHERE stripe_subscription_id = ?").bind(subscriptionId).first();
    return row ? this.mapOrg(row) : null;
  }

  async listAllOrgsForAdmin(): Promise<any[]> {
    try {
      const res = await this.db.prepare(`
        SELECT o.id, o.name, o.owner_id, o.tier, o.is_archived, o.archived_at, o.created_at,
               u.name as owner_name, u.email as owner_email,
               (SELECT COUNT(*) FROM pools WHERE organization_id = o.id) as pools_count
        FROM organizations o
        LEFT JOIN users u ON o.owner_id = u.id
        ORDER BY o.created_at DESC
      `).all();
      return (res?.results || []).map((o: any) => ({
        id: o.id,
        name: o.name,
        ownerId: o.owner_id,
        ownerName: o.owner_name,
        ownerEmail: o.owner_email,
        tier: o.tier || 'starter',
        poolsCount: Number(o.pools_count || 0),
        isArchived: Boolean(o.is_archived),
        archivedAt: o.archived_at || null,
        createdAt: o.created_at
      }));
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const res = await this.db.prepare(`
          SELECT o.id, o.name, o.owner_id, o.tier, o.created_at,
                 u.name as owner_name, u.email as owner_email,
                 (SELECT COUNT(*) FROM pools WHERE organization_id = o.id) as pools_count
          FROM organizations o
          LEFT JOIN users u ON o.owner_id = u.id
          ORDER BY o.created_at DESC
        `).all();
        return (res?.results || []).map((o: any) => ({
          id: o.id,
          name: o.name,
          ownerId: o.owner_id,
          ownerName: o.owner_name,
          ownerEmail: o.owner_email,
          tier: o.tier || 'starter',
          poolsCount: Number(o.pools_count || 0),
          isArchived: false,
          archivedAt: null,
          createdAt: o.created_at
        }));
      }
      throw err;
    }
  }

  async listAllUsersForAdmin(): Promise<any[]> {
    try {
      const res = await this.db.prepare(`
        SELECT u.id, u.email, u.name, u.avatar_url, u.system_role, u.is_archived, u.archived_at, u.created_at,
               (
                 SELECT COUNT(DISTINCT p.id)
                 FROM pools p
                 LEFT JOIN pool_members pm ON p.id = pm.pool_id AND pm.user_id = u.id
                 LEFT JOIN organizations o ON p.organization_id = o.id
                 LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = u.id
                 WHERE pm.user_id = u.id 
                    OR p.champion_id = u.id
                    OR o.owner_id = u.id
                    OR om.user_id = u.id
               ) as pool_count
        FROM users u
        ORDER BY u.created_at DESC
      `).all();
      return (res?.results || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatar_url || null,
        systemRole: u.system_role,
        poolCount: Number(u.pool_count || 0),
        isArchived: Boolean(u.is_archived),
        archivedAt: u.archived_at || null,
        createdAt: u.created_at
      }));
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const res = await this.db.prepare(`
          SELECT u.id, u.email, u.name, u.avatar_url, u.system_role, u.created_at,
                 (
                   SELECT COUNT(DISTINCT p.id)
                   FROM pools p
                   LEFT JOIN pool_members pm ON p.id = pm.pool_id AND pm.user_id = u.id
                   LEFT JOIN organizations o ON p.organization_id = o.id
                   LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = u.id
                   WHERE pm.user_id = u.id 
                      OR p.champion_id = u.id
                      OR o.owner_id = u.id
                      OR om.user_id = u.id
                 ) as pool_count
          FROM users u
          ORDER BY u.created_at DESC
        `).all();
        return (res?.results || []).map((u: any) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          avatarUrl: u.avatar_url || null,
          systemRole: u.system_role,
          poolCount: Number(u.pool_count || 0),
          isArchived: false,
          archivedAt: null,
          createdAt: u.created_at
        }));
      }
      throw err;
    }
  }

  async listAllPoolsForAdmin(): Promise<any[]> {
    try {
      const res = await this.db.prepare(`
        SELECT p.id, p.name, p.category, p.currency, p.description, p.organization_id, p.is_archived, p.archived_at, p.created_at,
               o.name as org_name,
               (SELECT COUNT(*) FROM pool_members WHERE pool_id = p.id) as member_count,
               (SELECT COUNT(*) FROM items WHERE pool_id = p.id) as item_count,
               (SELECT COALESCE(SUM(balance), 0) FROM pool_members WHERE pool_id = p.id) as net_balance
        FROM pools p
        LEFT JOIN organizations o ON p.organization_id = o.id
        ORDER BY p.created_at DESC
      `).all();
      return (res?.results || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        currency: p.currency || '$',
        description: p.description,
        organizationId: p.organization_id,
        orgName: p.org_name || 'Independent',
        memberCount: Number(p.member_count || 0),
        itemCount: Number(p.item_count || 0),
        netBalance: Number(p.net_balance || 0),
        isArchived: Boolean(p.is_archived),
        archivedAt: p.archived_at || null,
        createdAt: p.created_at
      }));
    } catch (err: any) {
      if (this.isMissingColumnError(err)) {
        const res = await this.db.prepare(`
          SELECT p.id, p.name, p.category, p.currency, p.description, p.organization_id, p.created_at,
                 o.name as org_name,
                 (SELECT COUNT(*) FROM pool_members WHERE pool_id = p.id) as member_count,
                 (SELECT COUNT(*) FROM items WHERE pool_id = p.id) as item_count,
                 (SELECT COALESCE(SUM(balance), 0) FROM pool_members WHERE pool_id = p.id) as net_balance
          FROM pools p
          LEFT JOIN organizations o ON p.organization_id = o.id
          ORDER BY p.created_at DESC
        `).all();
        return (res?.results || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          currency: p.currency || '$',
          description: p.description,
          organizationId: p.organization_id,
          orgName: p.org_name || 'Independent',
          memberCount: Number(p.member_count || 0),
          itemCount: Number(p.item_count || 0),
          netBalance: Number(p.net_balance || 0),
          isArchived: false,
          archivedAt: null,
          createdAt: p.created_at
        }));
      }
      throw err;
    }
  }

  async searchItems(queryStr: string, poolId?: string, limit = 10): Promise<StorageItem[]> {
    const term = `%${queryStr.toLowerCase()}%`;
    let sql = "SELECT * FROM items WHERE LOWER(name) LIKE ?";
    const binds: any[] = [term];
    if (poolId) {
      sql += " AND pool_id = ?";
      binds.push(poolId);
    }
    sql += " ORDER BY stock DESC LIMIT ?";
    binds.push(limit);
    const res: any = await this.db.prepare(sql).bind(...binds).all();
    return (res?.results || []).map((r: any) => this.mapItem(r));
  }

  async getSsoConfigCount(): Promise<number> {
    try {
      const res: any = await this.db.prepare("SELECT COUNT(*) as count FROM sso_configurations WHERE enabled = 1 OR enabled = 'true'").all();
      return Number(res?.results?.[0]?.count || 0);
    } catch {
      return 0;
    }
  }

  async getAiUsageStats(envModel = 'gemini-2.5-flash-lite'): Promise<{ summary: any; modelBreakdown: any[]; recentLogs: any[] }> {
    try {
      const [summaryRes, recentLogsRes, modelBreakdownRes] = await Promise.all([
        this.db.prepare(`
          SELECT 
            COUNT(*) as total_scans,
            COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(estimated_cost_usd), 0.0) as total_estimated_cost_usd
          FROM ai_usage_logs
        `).first(),
        this.db.prepare(`
          SELECT id, user_id, user_email, pool_id, model, activity, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, status, parsed_items_json, applied_items_json, created_at
          FROM ai_usage_logs
          ORDER BY created_at DESC
          LIMIT 50
        `).all(),
        this.db.prepare(`
          SELECT model, COUNT(*) as scan_count, COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(estimated_cost_usd), 0.0) as cost_usd
          FROM ai_usage_logs
          GROUP BY model
          ORDER BY scan_count DESC
        `).all()
      ]);

      const totalScans = Number((summaryRes as any)?.total_scans || 0);
      const totalPromptTokens = Number((summaryRes as any)?.total_prompt_tokens || 0);
      const totalCompletionTokens = Number((summaryRes as any)?.total_completion_tokens || 0);
      const totalTokens = Number((summaryRes as any)?.total_tokens || 0);
      const totalEstimatedCostUsd = Number((summaryRes as any)?.total_estimated_cost_usd || 0);
      const avgCostPerScan = totalScans > 0 ? totalEstimatedCostUsd / totalScans : 0.00017;

      return {
        summary: {
          totalScans,
          totalPromptTokens,
          totalCompletionTokens,
          totalTokens,
          totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
          avgCostPerScanUsd: Number(avgCostPerScan.toFixed(6)),
          activePrimaryModel: envModel
        },
        modelBreakdown: ((modelBreakdownRes as any)?.results || []).map((m: any) => ({
          model: m.model,
          scanCount: Number(m.scan_count || 0),
          tokens: Number(m.tokens || 0),
          costUsd: Number(Number(m.cost_usd || 0).toFixed(6))
        })),
        recentLogs: ((recentLogsRes as any)?.results || []).map((l: any) => {
          let parsedItems = [];
          let appliedItems = [];
          try { if (l.parsed_items_json) parsedItems = JSON.parse(l.parsed_items_json); } catch {}
          try { if (l.applied_items_json) appliedItems = JSON.parse(l.applied_items_json); } catch {}

          return {
            id: l.id,
            userId: l.user_id,
            userEmail: l.user_email || 'anonymous',
            poolId: l.pool_id,
            model: l.model,
            activity: l.activity,
            promptTokens: Number(l.prompt_tokens || 0),
            completionTokens: Number(l.completion_tokens || 0),
            totalTokens: Number(l.total_tokens || 0),
            estimatedCostUsd: Number(Number(l.estimated_cost_usd || 0).toFixed(6)),
            status: l.status || 'success',
            parsedItems,
            appliedItems,
            createdAt: l.created_at
          };
        })
      };
    } catch {
      return {
        summary: {
          totalScans: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          totalEstimatedCostUsd: 0,
          avgCostPerScanUsd: 0.00017,
          activePrimaryModel: envModel
        },
        modelBreakdown: [],
        recentLogs: []
      };
    }
  }

  async logAiUsage(log: StorageAiUsageLog): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO ai_usage_logs (
          id, user_id, user_email, pool_id, model, activity,
          prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
          status, parsed_items_json, applied_items_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        log.id,
        log.user_id || null,
        log.user_email || null,
        log.pool_id || null,
        log.model,
        log.activity,
        log.prompt_tokens || 0,
        log.completion_tokens || 0,
        log.total_tokens || 0,
        log.estimated_cost_usd || 0.0,
        log.status || 'success',
        log.parsed_items_json || null,
        log.applied_items_json || null
      ).run();
    } catch (err) {
      console.warn('[AI Log Usage Error]', err);
    }
  }

  async logAiAppliedItems(scanLogId: string, appliedJson: string): Promise<void> {
    try {
      await this.db.prepare(`
        UPDATE ai_usage_logs
        SET applied_items_json = ?
        WHERE id = ?
      `).bind(appliedJson, scanLogId).run();
    } catch (err) {
      console.warn('[AI Log Applied Error]', err);
    }
  }

  async getPoolSavingsSummary(poolId: string): Promise<StoragePoolSavingsSummary> {
    const totalRes: any = await this.db.prepare(
      "SELECT COALESCE(SUM(savings_cents), 0) as total_savings_cents, COUNT(*) as count FROM transactions WHERE pool_id = ? AND type = 'consume' AND savings_cents > 0"
    ).bind(poolId).first();

    const topItemsRes: any = await this.db.prepare(
      `SELECT item_id, item_name, COALESCE(SUM(savings_cents), 0) as total_savings_cents, COALESCE(SUM(quantity), 0) as quantity
       FROM transactions
       WHERE pool_id = ? AND type = 'consume' AND savings_cents > 0 AND item_name IS NOT NULL
       GROUP BY item_id, item_name
       ORDER BY total_savings_cents DESC
       LIMIT 5`
    ).bind(poolId).all();

    const totalSavingsCents = Number(totalRes?.total_savings_cents || 0);
    return {
      totalSavingsCents,
      totalSavings: Number((totalSavingsCents / 100).toFixed(2)),
      itemsConsumedCount: Number(totalRes?.count || 0),
      topSavedItems: (topItemsRes?.results || []).map((r: any) => ({
        itemId: r.item_id || '',
        itemName: r.item_name || 'Item',
        totalSavingsCents: Number(r.total_savings_cents || 0),
        quantity: Number(r.quantity || 0)
      }))
    };
  }

  async getGlobalSavingsLeaderboard(limit: number = 20): Promise<StorageGlobalSavingsLeaderboardResponse> {
    const networkRes: any = await this.db.prepare(
      "SELECT COALESCE(SUM(savings_cents), 0) as total_network_savings_cents FROM transactions WHERE savings_cents > 0"
    ).first();

    const poolsRes: any = await this.db.prepare(
      `SELECT p.id as pool_id, COALESCE(NULLIF(p.leaderboard_alias, ''), p.name) as display_name, p.category,
              COALESCE(SUM(t.savings_cents), 0) as total_savings_cents,
              (SELECT COUNT(*) FROM pool_members pm WHERE pm.pool_id = p.id) as member_count
       FROM pools p
       LEFT JOIN transactions t ON t.pool_id = p.id AND t.type = 'consume' AND t.savings_cents > 0
       WHERE p.savings_enabled = 1 AND p.savings_leaderboard_opt_in = 1
       GROUP BY p.id, p.name, p.leaderboard_alias, p.category
       ORDER BY total_savings_cents DESC
       LIMIT ?`
    ).bind(limit).all();

    const networkTotalSavingsCents = Number(networkRes?.total_network_savings_cents || 0);

    return {
      pools: (poolsRes?.results || []).map((r: any) => {
        const cents = Number(r.total_savings_cents || 0);
        return {
          poolId: r.pool_id,
          displayName: r.display_name || 'Anonymous Pantry',
          category: r.category || 'Breakroom',
          totalSavingsCents: cents,
          totalSavings: Number((cents / 100).toFixed(2)),
          memberCount: Number(r.member_count || 1)
        };
      }),
      networkTotalSavingsCents,
      networkTotalSavings: Number((networkTotalSavingsCents / 100).toFixed(2))
    };
  }

  private mapAffiliateProduct(row: any): StorageAffiliateProduct {
    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      category: row.category || 'Pantry & Fridge Organizers',
      image_url: row.image_url || null,
      affiliate_url: row.affiliate_url,
      badge: row.badge || null,
      price_estimate: Number(row.price_estimate || 0),
      click_count: Number(row.click_count || 0),
      display_order: Number(row.display_order || 0),
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // Email Delivery Logs
  private emailLogsTableEnsured = false;
  private async ensureEmailLogsTable(): Promise<void> {
    if (this.emailLogsTableEnsured) return;
    try {
      await this.db.prepare(`
        CREATE TABLE IF NOT EXISTS email_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          recipient_email TEXT NOT NULL,
          email_type TEXT NOT NULL,
          subject TEXT NOT NULL,
          status TEXT NOT NULL,
          message_id TEXT,
          error_message TEXT,
          metadata_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      try {
        await this.db.prepare("CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email)").run();
        await this.db.prepare("CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id)").run();
        await this.db.prepare("CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at)").run();
      } catch {}
      this.emailLogsTableEnsured = true;
    } catch {
      // Table might already exist
    }
  }

  async createEmailLog(log: StorageEmailLog): Promise<StorageEmailLog> {
    await this.ensureEmailLogsTable();
    const id = log.id || ('elog_' + crypto.randomUUID());
    const createdAt = log.created_at || new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO email_logs (id, user_id, recipient_email, email_type, subject, status, message_id, error_message, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      log.user_id || null,
      log.recipient_email.toLowerCase().trim(),
      log.email_type,
      log.subject,
      log.status,
      log.message_id || null,
      log.error_message || null,
      log.metadata_json || null,
      createdAt
    ).run();
    return { ...log, id, created_at: createdAt };
  }

  async listEmailLogs(options?: { recipientEmail?: string; userId?: string; emailType?: string; limit?: number; offset?: number }): Promise<{ logs: StorageEmailLog[]; total: number }> {
    await this.ensureEmailLogsTable();
    const conditions: string[] = [];
    const params: any[] = [];
    if (options?.recipientEmail) {
      conditions.push('LOWER(recipient_email) = LOWER(?)');
      params.push(options.recipientEmail.trim());
    }
    if (options?.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }
    if (options?.emailType) {
      conditions.push('email_type = ?');
      params.push(options.emailType);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes: any = await this.db.prepare(`SELECT COUNT(*) as count FROM email_logs ${whereClause}`).bind(...params).first();
    const total = Number(countRes?.count || 0);

    const limit = Math.max(1, Math.min(options?.limit ?? 50, 100));
    const offset = Math.max(0, options?.offset ?? 0);
    const rowsRes: any = await this.db.prepare(
      `SELECT * FROM email_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    const logs: StorageEmailLog[] = (rowsRes?.results || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      recipient_email: r.recipient_email,
      email_type: r.email_type,
      subject: r.subject,
      status: r.status,
      message_id: r.message_id,
      error_message: r.error_message,
      metadata_json: r.metadata_json,
      created_at: r.created_at,
    }));
    return { logs, total };
  }

  async getEmailLogById(id: string): Promise<StorageEmailLog | null> {
    await this.ensureEmailLogsTable();
    const r: any = await this.db.prepare("SELECT * FROM email_logs WHERE id = ? LIMIT 1").bind(id).first();
    if (!r) return null;
    return {
      id: r.id,
      user_id: r.user_id,
      recipient_email: r.recipient_email,
      email_type: r.email_type,
      subject: r.subject,
      status: r.status,
      message_id: r.message_id,
      error_message: r.error_message,
      metadata_json: r.metadata_json,
      created_at: r.created_at,
    };
  }
}
