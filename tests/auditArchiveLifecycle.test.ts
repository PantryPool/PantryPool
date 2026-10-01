import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';
import { D1StorageAdapter } from '../src/server/storage/d1Adapter';
import { MySqlStorageAdapter } from '../src/server/storage/mysqlAdapter';
import { StorageAdapter } from '../src/server/storage/types';
import * as db from '../db';

vi.mock('../db', () => ({
  query: vi.fn(),
  execute: vi.fn()
}));

describe('🛡️ Audit Archive Lifecycle & GDPR Purge Suite', () => {
  const secret = 'test-jwt-secret-audit-archive-suite-12345';

  describe('D1StorageAdapter Archive & GDPR Parity', () => {
    let queries: string[] = [];
    let boundArgs: any[] = [];
    let mockD1: any;

    beforeEach(() => {
      queries = [];
      boundArgs = [];
      mockD1 = {
        prepare: vi.fn((q: string) => {
          queries.push(q);
          return {
            bind: vi.fn((...args: any[]) => {
              boundArgs.push(args);
              return {
                run: vi.fn().mockResolvedValue({ success: true }),
                all: vi.fn().mockResolvedValue({ results: [] }),
                first: vi.fn().mockResolvedValue(null)
              };
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue(null)
          };
        })
      };
    });

    it('deleteUser archives by default for audit', async () => {
      const adapter = new D1StorageAdapter(mockD1);
      await adapter.deleteUser('u_audit_1');

      const archiveQuery = queries.find(q => q.includes('UPDATE users SET is_archived = 1'));
      expect(archiveQuery).toBeDefined();
      expect(archiveQuery).toContain('token_version = token_version + 1');
      expect(queries.some(q => q.includes('DELETE FROM users'))).toBe(false);
    });

    it('deleteUser executes permanent GDPR purge when requested', async () => {
      const adapter = new D1StorageAdapter(mockD1);
      await adapter.deleteUser('u_audit_1', { gdpr: true });

      const purgeQuery = queries.find(q => q.includes('DELETE FROM users WHERE id = ?'));
      expect(purgeQuery).toBeDefined();
      expect(queries.some(q => q.includes('DELETE FROM passkey_credentials'))).toBe(true);
      expect(queries.some(q => q.includes('DELETE FROM pool_members'))).toBe(true);
    });

    it('deleteOrg archives by default and marks child pools archived', async () => {
      const adapter = new D1StorageAdapter(mockD1);
      await adapter.deleteOrg('org_audit_1');

      const orgArchiveQuery = queries.find(q => q.includes('UPDATE organizations SET is_archived = 1'));
      const poolArchiveQuery = queries.find(q => q.includes('UPDATE pools SET is_archived = 1') && q.includes('organization_id = ?'));
      expect(orgArchiveQuery).toBeDefined();
      expect(poolArchiveQuery).toBeDefined();
      expect(queries.some(q => q.includes('DELETE FROM organizations'))).toBe(false);
    });

    it('deleteOrg executes permanent GDPR purge when requested', async () => {
      const adapter = new D1StorageAdapter(mockD1);
      await adapter.deleteOrg('org_audit_1', { hardDelete: true });

      const purgeQuery = queries.find(q => q.includes('DELETE FROM organizations WHERE id = ?'));
      expect(purgeQuery).toBeDefined();
      expect(queries.some(q => q.includes('UPDATE pools SET organization_id = NULL'))).toBe(true);
    });

    it('deletePool archives by default without deleting records', async () => {
      const adapter = new D1StorageAdapter(mockD1);
      await adapter.deletePool('pool_audit_1');

      const poolArchiveQuery = queries.find(q => q.includes('UPDATE pools SET is_archived = 1'));
      expect(poolArchiveQuery).toBeDefined();
      expect(queries.some(q => q.includes('DELETE FROM pools WHERE id = ?'))).toBe(false);
    });

    it('deletePool executes permanent GDPR purge when requested', async () => {
      const adapter = new D1StorageAdapter(mockD1);
      await adapter.deletePool('pool_audit_1', { gdpr: true });

      const purgeQuery = queries.find(q => q.includes('DELETE FROM pools WHERE id = ?'));
      expect(purgeQuery).toBeDefined();
    });

    it('restoreUser, restoreOrg, and restorePool restore active status in D1', async () => {
      const adapter = new D1StorageAdapter(mockD1);
      await adapter.restoreUser('u_1');
      await adapter.restoreOrg('org_1');
      await adapter.restorePool('p_1');

      expect(queries.some(q => q.includes('UPDATE users SET is_archived = 0, archived_at = NULL WHERE id = ?'))).toBe(true);
      expect(queries.some(q => q.includes('UPDATE organizations SET is_archived = 0, archived_at = NULL WHERE id = ?'))).toBe(true);
      expect(queries.some(q => q.includes('UPDATE pools SET is_archived = 0, archived_at = NULL WHERE id = ?'))).toBe(true);
    });

    it('listPoolsForUser filters out archived pools in D1', async () => {
      const adapter = new D1StorageAdapter(mockD1);
      await adapter.listPoolsForUser('u_1');

      const listQuery = queries.find(q => q.includes('FROM pools p'));
      expect(listQuery).toBeDefined();
      expect(listQuery).toContain('(p.is_archived = 0 OR p.is_archived IS NULL)');
    });

    it('listOrgsForUser filters out archived organizations in D1', async () => {
      const adapter = new D1StorageAdapter(mockD1);
      await adapter.listOrgsForUser('u_1');

      const listQuery = queries.find(q => q.includes('FROM organizations o'));
      expect(listQuery).toBeDefined();
      expect(listQuery).toContain('(o.is_archived = 0 OR o.is_archived IS NULL)');
    });
  });

  describe('MySqlStorageAdapter Archive & GDPR Parity', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('deleteUser archives by default in MySQL', async () => {
      const adapter = new MySqlStorageAdapter();
      await adapter.deleteUser('u_mysql_1');

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET is_archived = 1, archived_at = NOW(), token_version = token_version + 1 WHERE id = ?'),
        ['u_mysql_1']
      );
    });

    it('deleteUser executes permanent GDPR purge in MySQL', async () => {
      const adapter = new MySqlStorageAdapter();
      await adapter.deleteUser('u_mysql_1', { gdpr: true });

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM users WHERE id = ?'),
        ['u_mysql_1']
      );
    });

    it('deleteOrg archives by default and marks child pools archived in MySQL', async () => {
      const adapter = new MySqlStorageAdapter();
      await adapter.deleteOrg('org_mysql_1');

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE organizations SET is_archived = 1, archived_at = NOW() WHERE id = ?'),
        ['org_mysql_1']
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE pools SET is_archived = 1, archived_at = NOW() WHERE organization_id = ?'),
        ['org_mysql_1']
      );
    });

    it('deletePool archives by default in MySQL', async () => {
      const adapter = new MySqlStorageAdapter();
      await adapter.deletePool('p_mysql_1');

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE pools SET is_archived = 1, archived_at = NOW() WHERE id = ?'),
        ['p_mysql_1']
      );
    });

    it('restore methods reset is_archived to 0 in MySQL', async () => {
      const adapter = new MySqlStorageAdapter();
      await adapter.restoreUser('u_1');
      await adapter.restoreOrg('org_1');
      await adapter.restorePool('p_1');

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET is_archived = 0, archived_at = NULL WHERE id = ?'),
        ['u_1']
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE organizations SET is_archived = 0, archived_at = NULL WHERE id = ?'),
        ['org_1']
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE pools SET is_archived = 0, archived_at = NULL WHERE id = ?'),
        ['p_1']
      );
    });
  });

  describe('Universal Hono API Router Integration', () => {
    class InMemoryAuditStorageAdapter {
      users: Map<string, any> = new Map();
      orgs: Map<string, any> = new Map();
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
        const u = { ...user, token_version: 1, is_archived: 0, archived_at: null };
        this.users.set(user.id, u);
        return u;
      }
      async updateUser(id: string, updates: any) {
        const u = this.users.get(id);
        if (u) this.users.set(id, { ...u, ...updates });
      }
      async deleteUser(id: string, options?: any) {
        const isPurge = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
        if (isPurge) {
          this.users.delete(id);
        } else {
          const u = this.users.get(id);
          if (u) {
            u.is_archived = 1;
            u.archived_at = new Date().toISOString();
            u.token_version = (u.token_version || 1) + 1;
          }
        }
      }
      async archiveUser(id: string) { return this.deleteUser(id, false); }
      async restoreUser(id: string) {
        const u = this.users.get(id);
        if (u) { u.is_archived = 0; u.archived_at = null; }
      }
      async listUsers() { return Array.from(this.users.values()); }
      async bumpTokenVersion(id: string) {
        const u = this.users.get(id);
        if (u) { u.token_version = (u.token_version || 1) + 1; return u.token_version; }
        return 1;
      }
      async listAllUsersForAdmin() {
        return Array.from(this.users.values()).map(u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          systemRole: u.system_role || 'user',
          isArchived: Boolean(u.is_archived),
          archivedAt: u.archived_at || null,
          poolCount: 0,
          createdAt: u.created_at
        }));
      }

      async getOrgById(id: string) { return this.orgs.get(id) || null; }
      async listOrgsByOwner(ownerId: string) {
        return Array.from(this.orgs.values()).filter(o => o.owner_id === ownerId && !o.is_archived);
      }
      async listOrgsForUser(userId: string) {
        return Array.from(this.orgs.values()).filter(o => !o.is_archived);
      }
      async createOrg(org: any) {
        const o = { ...org, is_archived: 0, archived_at: null };
        this.orgs.set(org.id, o);
        return o;
      }
      async updateOrgTier(id: string, tier: any) {
        const o = this.orgs.get(id);
        if (o) o.tier = tier;
      }
      async deleteOrg(id: string, options?: any) {
        const isPurge = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
        if (isPurge) {
          this.orgs.delete(id);
        } else {
          const o = this.orgs.get(id);
          if (o) {
            o.is_archived = 1;
            o.archived_at = new Date().toISOString();
          }
          for (const pool of this.pools.values()) {
            if (pool.organization_id === id) {
              pool.is_archived = 1;
              pool.archived_at = new Date().toISOString();
            }
          }
        }
      }
      async archiveOrg(id: string) { return this.deleteOrg(id, false); }
      async restoreOrg(id: string) {
        const o = this.orgs.get(id);
        if (o) { o.is_archived = 0; o.archived_at = null; }
      }
      async listAllOrgsForAdmin() {
        return Array.from(this.orgs.values()).map(o => ({
          id: o.id,
          name: o.name,
          tier: o.tier,
          isArchived: Boolean(o.is_archived),
          archivedAt: o.archived_at || null,
          createdAt: o.created_at,
          poolsCount: 0
        }));
      }

      async getPoolById(id: string) { return this.pools.get(id) || null; }
      async listPoolsForUser(userId: string) {
        return Array.from(this.pools.values()).filter(p => !p.is_archived);
      }
      async createPool(pool: any) {
        const p = { ...pool, is_archived: 0, archived_at: null };
        this.pools.set(pool.id, p);
        return p;
      }
      async updatePool(id: string, updates: any) {
        const p = this.pools.get(id);
        if (p) this.pools.set(id, { ...p, ...updates });
      }
      async deletePool(id: string, options?: any) {
        const isPurge = typeof options === 'boolean' ? options : Boolean(options?.hardDelete || options?.gdpr);
        if (isPurge) {
          this.pools.delete(id);
        } else {
          const p = this.pools.get(id);
          if (p) {
            p.is_archived = 1;
            p.archived_at = new Date().toISOString();
          }
        }
      }
      async archivePool(id: string) { return this.deletePool(id, false); }
      async restorePool(id: string) {
        const p = this.pools.get(id);
        if (p) { p.is_archived = 0; p.archived_at = null; }
      }
      async listAllPoolsForAdmin() {
        return Array.from(this.pools.values()).map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          isArchived: Boolean(p.is_archived),
          archivedAt: p.archived_at || null,
          memberCount: 0,
          itemCount: 0
        }));
      }

      async getPoolMember(poolId: string, userId: string) { return this.members.get(`${poolId}_${userId}`) || null; }
      async listPoolMembers(poolId: string) { return Array.from(this.members.values()).filter(m => m.pool_id === poolId); }
      async upsertPoolMember(member: any) { this.members.set(`${member.pool_id}_${member.user_id}`, member); }
      async updateMemberRole(poolId: string, userId: string, role: string) {
        const m = this.members.get(`${poolId}_${userId}`);
        if (m) m.role = role;
      }
      async removePoolMember(poolId: string, userId: string) { this.members.delete(`${poolId}_${userId}`); }

      async getItemsByPool(poolId: string) { return Array.from(this.items.values()).filter(i => i.pool_id === poolId); }
      async getItemById(id: string) { return this.items.get(id) || null; }
      async upsertItem(item: any) { this.items.set(item.id, item); }
      async deleteItem(id: string) { this.items.delete(id); }

      async createTransaction(tx: any) { this.transactions.set(tx.id, tx); return tx; }
      async listTransactionsByPool(poolId: string) { return Array.from(this.transactions.values()).filter(t => t.pool_id === poolId); }
      async getTransactionById(id: string) { return this.transactions.get(id) || null; }
      async updateTransaction(id: string, updates: any) {
        const t = this.transactions.get(id);
        if (t) this.transactions.set(id, { ...t, ...updates });
      }

      async getShoppingItems(poolId: string) { return []; }
      async addShoppingItem(item: any) { return item; }
      async updateShoppingItem(id: string, updates: any) {}
      async deleteShoppingItem(id: string) {}

      async getPollsByPool(poolId: string) { return []; }
      async getPollById(id: string) { return null; }
      async createPoll(poll: any) { return poll; }
      async recordPollVote(pollId: string, userId: string, optionIndex: number) {}
      async updatePollStatus(id: string, status: string) {}
      async deletePoll(id: string) {}

      async getNotifications(userId: string) { return []; }
      async createNotification(notification: any) { return notification; }
      async markNotificationAsRead(id: string, userId: string) {}
      async markAllNotificationsAsRead(userId: string) {}
      async deleteNotification(id: string, userId: string) {}
      async getNotificationPreferences(userId: string) { return null; }
      async upsertNotificationPreferences(prefs: any) { return prefs; }

      async getWebhooksByPool(poolId: string) { return []; }
      async getWebhookById(id: string) { return null; }
      async createWebhook(webhook: any) { return webhook; }
      async updateWebhook(id: string, updates: any) {}
      async deleteWebhook(id: string) {}

      async getSsoConfigByOrg(orgId: string) { return null; }
      async upsertSsoConfig(config: any) { return config; }
      async deleteSsoConfig(orgId: string) {}

      async getSystemSettings() { return this.settings; }
      async setSystemSetting(key: string, value: string) { this.settings[key] = value; }
    }

    let storage: InMemoryAuditStorageAdapter;
    let app: any;
    let superadminToken: string;
    let regularUserToken: string;

    beforeEach(async () => {
      storage = new InMemoryAuditStorageAdapter();
      app = createUniversalApi(storage as any, secret);

      // Create initial users
      await storage.createUser({
        id: 'u_admin',
        name: 'Super Admin',
        email: 'admin@audit.com',
        password_hash: 'mock_admin_hash',
        system_role: 'superadmin',
        created_at: new Date().toISOString()
      });

      await storage.createUser({
        id: 'u_user1',
        name: 'Regular Alice',
        email: 'alice@audit.com',
        password_hash: 'mock_alice_hash',
        system_role: 'user',
        created_at: new Date().toISOString()
      });

      superadminToken = await createUniversalToken(
        { userId: 'u_admin', email: 'admin@audit.com', name: 'Super Admin', systemRole: 'superadmin', tokenVersion: 1 },
        secret
      );

      regularUserToken = await createUniversalToken(
        { userId: 'u_user1', email: 'alice@audit.com', name: 'Regular Alice', systemRole: 'user', tokenVersion: 1 },
        secret
      );

      // Create an org and a pool
      await storage.createOrg({
        id: 'org_1',
        name: 'Acme Workspace',
        owner_id: 'u_user1',
        tier: 'standard',
        created_at: new Date().toISOString()
      });

      await storage.createPool({
        id: 'POOL_1',
        organization_id: 'org_1',
        name: 'Breakroom Pantry',
        category: 'Office',
        currency: '$',
        created_at: new Date().toISOString()
      });

      await storage.upsertPoolMember({
        pool_id: 'POOL_1',
        user_id: 'u_user1',
        role: 'champion',
        balance: 1000
      });
    });

    it('rejects login for an archived user account', async () => {
      // Archive user
      await storage.archiveUser('u_user1');

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@audit.com', password: 'Password123!' })
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('archived');
    });

    it('rejects token authentication after user account is archived', async () => {
      // Active token before archive works on /api/auth/me
      const validRes = await app.request('/api/auth/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${regularUserToken}` }
      });
      expect(validRes.status).toBe(200);

      // Archive user -> bumps token_version and marks is_archived = 1
      await storage.archiveUser('u_user1');

      const invalidRes = await app.request('/api/auth/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${regularUserToken}` }
      });
      expect(invalidRes.status).toBe(401);
    });

    it('DELETE /api/auth/account archives user by default and purges with gdpr=true', async () => {
      // User self-deletion default (audit archive)
      const res = await app.request('/api/auth/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${regularUserToken}` }
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.isArchived).toBe(true);

      const archivedUser = await storage.getUserById('u_user1');
      expect(archivedUser).not.toBeNull();
      expect(archivedUser.is_archived).toBe(1);

      // Restore user for gdpr purge test
      await storage.restoreUser('u_user1');
      const restoredUser = await storage.getUserById('u_user1');
      expect(restoredUser.is_archived).toBe(0);

      const newAliceToken = await createUniversalToken(
        { userId: 'u_user1', email: 'alice@audit.com', name: 'Regular Alice', systemRole: 'user', tokenVersion: restoredUser.token_version },
        secret
      );

      // Purge user with ?gdpr=true
      const purgeRes = await app.request('/api/auth/account?gdpr=true', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${newAliceToken}` }
      });
      expect(purgeRes.status).toBe(200);
      const purgeData: any = await purgeRes.json();
      expect(purgeData.success).toBe(true);
      expect(purgeData.isArchived).toBe(false);

      const purgedUser = await storage.getUserById('u_user1');
      expect(purgedUser).toBeNull();
    });

    it('DELETE /api/admin/users/:id archives by default and POST /restore reactivates user', async () => {
      // Archive user via Admin
      const res = await app.request('/api/admin/users/u_user1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${superadminToken}` }
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.isArchived).toBe(true);

      let u = await storage.getUserById('u_user1');
      expect(u.is_archived).toBe(1);

      // Restore user via Admin
      const restoreRes = await app.request('/api/admin/users/u_user1/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${superadminToken}` }
      });
      expect(restoreRes.status).toBe(200);
      const restoreData: any = await restoreRes.json();
      expect(restoreData.success).toBe(true);

      u = await storage.getUserById('u_user1');
      expect(u.is_archived).toBe(0);
      expect(u.archived_at).toBeNull();
    });

    it('DELETE /api/pools/:poolId archives pool by default and blocks mutations on archived pool', async () => {
      // Champion archives pool
      const delRes = await app.request('/api/pools/POOL_1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${regularUserToken}` }
      });
      expect(delRes.status).toBe(200);
      const delData: any = await delRes.json();
      expect(delData.success).toBe(true);
      expect(delData.isArchived).toBe(true);

      const p = await storage.getPoolById('POOL_1');
      expect(p.is_archived).toBe(1);

      // Attempting to modify archived pool fails
      const updateRes = await app.request('/api/pools/POOL_1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regularUserToken}`
        },
        body: JSON.stringify({ name: 'Renamed Archived Pool' })
      });
      expect(updateRes.status).toBe(400);
      const updateData: any = await updateRes.json();
      expect(updateData.error).toContain('archived');

      // Attempting to save item to archived pool fails
      const saveItemRes = await app.request('/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regularUserToken}`
        },
        body: JSON.stringify({ poolId: 'POOL_1', name: 'Coffee Beans', costPerUnit: 5.0, stock: 10 })
      });
      expect(saveItemRes.status).toBe(400);
      const saveItemData: any = await saveItemRes.json();
      expect(saveItemData.error).toContain('archived');

      // Attempting to join archived pool fails
      const joinRes = await app.request('/api/pools/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superadminToken}`
        },
        body: JSON.stringify({ code: 'POOL_1' })
      });
      expect(joinRes.status).toBe(400);
      const joinData: any = await joinRes.json();
      expect(joinData.error).toContain('archived');
    });

    it('DELETE /api/admin/pools/:id supports archive and restore', async () => {
      // Archive via admin
      const res = await app.request('/api/admin/pools/POOL_1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${superadminToken}` }
      });
      expect(res.status).toBe(200);
      expect((await res.json() as any).isArchived).toBe(true);

      let p = await storage.getPoolById('POOL_1');
      expect(p.is_archived).toBe(1);

      // Restore via admin
      const restoreRes = await app.request('/api/admin/pools/POOL_1/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${superadminToken}` }
      });
      expect(restoreRes.status).toBe(200);

      p = await storage.getPoolById('POOL_1');
      expect(p.is_archived).toBe(0);
      expect(p.archived_at).toBeNull();
    });

    it('DELETE /api/admin/organizations/:id supports archive and restore', async () => {
      // Archive org via admin
      const res = await app.request('/api/admin/organizations/org_1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${superadminToken}` }
      });
      expect(res.status).toBe(200);
      expect((await res.json() as any).isArchived).toBe(true);

      let o = await storage.getOrgById('org_1');
      expect(o.is_archived).toBe(1);

      // Child pool was also archived
      let p = await storage.getPoolById('POOL_1');
      expect(p.is_archived).toBe(1);

      // Restore org via admin
      const restoreRes = await app.request('/api/admin/organizations/org_1/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${superadminToken}` }
      });
      expect(restoreRes.status).toBe(200);

      o = await storage.getOrgById('org_1');
      expect(o.is_archived).toBe(0);
      expect(o.archived_at).toBeNull();
    });
  });

  describe('🔄 Unmigrated Schema & Missing Column Fallback Suite', () => {
    it('D1StorageAdapter falls back when is_archived column is missing', async () => {
      let firstAttempt = true;
      const mockD1 = {
        prepare: vi.fn((sql: string) => ({
          bind: vi.fn((...args: any[]) => ({
            all: vi.fn(async () => {
              if (sql.includes('is_archived') && firstAttempt) {
                firstAttempt = false;
                throw new Error('D1_ERROR: no such column: p.is_archived');
              }
              return {
                results: [
                  {
                    id: 'pool_fallback_1',
                    name: 'Breakroom Alpha',
                    category: 'Office',
                    currency: '$',
                    created_at: new Date().toISOString()
                  }
                ]
              };
            })
          }))
        }))
      };

      const adapter = new D1StorageAdapter(mockD1 as any);
      const pools = await adapter.listPoolsForUser('u_test_user');
      expect(pools).toHaveLength(1);
      expect(pools[0].id).toBe('pool_fallback_1');
      expect(pools[0].name).toBe('Breakroom Alpha');
    });

    it('MySqlStorageAdapter falls back when is_archived column is missing', async () => {
      let firstAttempt = true;
      vi.mocked(db.query).mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('is_archived') && firstAttempt) {
          firstAttempt = false;
          const err: any = new Error("Unknown column 'p.is_archived' in 'where clause'");
          err.code = 'ER_BAD_FIELD_ERROR';
          throw err;
        }
        return [
          {
            id: 'pool_mysql_fallback',
            name: 'Pantry Beta',
            category: 'Kitchen',
            currency: '$',
            created_at: new Date().toISOString()
          }
        ];
      });

      const adapter = new MySqlStorageAdapter();
      const pools = await adapter.listPoolsForUser('u_mysql_user');
      expect(pools).toHaveLength(1);
      expect(pools[0].id).toBe('pool_mysql_fallback');
      expect(pools[0].name).toBe('Pantry Beta');
    });
  });
});
