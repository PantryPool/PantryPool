import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';
import { D1StorageAdapter } from '../src/server/storage/d1Adapter';
import { MySqlStorageAdapter } from '../src/server/storage/mysqlAdapter';
import * as db from '../db';

vi.mock('../db', () => ({
  query: vi.fn(),
  execute: vi.fn()
}));

describe('🛠️ Platform Settings API & Storage Parity (/api/admin/settings)', () => {
  const secret = 'test-admin-secret-key-12345';

  describe('D1StorageAdapter system settings', () => {
    it('executes SELECT with setting_key and setting_value columns in D1', async () => {
      let preparedQuery = '';
      const mockD1 = {
        prepare: vi.fn((q: string) => {
          preparedQuery = q;
          return {
            all: vi.fn().mockResolvedValue({
              results: [
                { setting_key: 'registration_enabled', setting_value: 'true' },
                { setting_key: 'maintenance_mode', setting_value: 'false' },
                { setting_key: 'system_notice', setting_value: 'Under maintenance' }
              ]
            })
          };
        })
      };

      const adapter = new D1StorageAdapter(mockD1);
      const settings = await adapter.getSystemSettings();

      expect(preparedQuery).toContain('SELECT setting_key, setting_value FROM system_settings');
      expect(settings.registration_enabled).toBe(true);
      expect(settings.maintenance_mode).toBe(false);
      expect(settings.system_notice).toBe('Under maintenance');
    });

    it('executes UPSERT with setting_key and setting_value in D1', async () => {
      const queries: string[] = [];
      const boundParams: any[] = [];
      const mockD1 = {
        prepare: vi.fn((q: string) => {
          queries.push(q);
          return {
            bind: vi.fn((...args: any[]) => {
              boundParams.push(args);
              return {
                run: vi.fn().mockResolvedValue({ success: true })
              };
            })
          };
        })
      };

      const adapter = new D1StorageAdapter(mockD1);
      await adapter.saveSystemSettings({
        maintenance_mode: 'true',
        system_notice: 'Scheduled maintenance'
      });

      expect(queries.length).toBe(2);
      expect(queries[0]).toContain('INSERT INTO system_settings (setting_key, setting_value)');
      expect(queries[0]).toContain('ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value');
      expect(boundParams[0]).toEqual(['maintenance_mode', 'true']);
      expect(boundParams[1]).toEqual(['system_notice', 'Scheduled maintenance']);
    });

    it('executes UPDATE for organizations in D1', async () => {
      let preparedQuery = '';
      let boundParams: any[] = [];
      const mockD1 = {
        prepare: vi.fn((q: string) => {
          preparedQuery = q;
          return {
            bind: vi.fn((...args: any[]) => {
              boundParams = args;
              return {
                run: vi.fn().mockResolvedValue({ success: true })
              };
            })
          };
        })
      };

      const adapter = new D1StorageAdapter(mockD1);
      await adapter.updateOrg('org-123', { name: 'Acme Corp Updated', tier: 'plus' });

      expect(preparedQuery).toBe('UPDATE organizations SET name = ?, tier = ? WHERE id = ?');
      expect(boundParams).toEqual(['Acme Corp Updated', 'plus', 'org-123']);
    });

    it('executes listAllUsersForAdmin with correlated pool_count in D1', async () => {
      let preparedQuery = '';
      const mockD1 = {
        prepare: vi.fn((q: string) => {
          preparedQuery = q;
          return {
            all: vi.fn().mockResolvedValue({
              results: [
                {
                  id: 'u_test_1',
                  email: 'test@example.com',
                  name: 'Test User',
                  avatar_url: 'https://avatar.png',
                  system_role: 'user',
                  pool_count: 1,
                  created_at: '2026-01-01T00:00:00Z'
                }
              ]
            })
          };
        })
      };

      const adapter = new D1StorageAdapter(mockD1);
      const users = await adapter.listAllUsersForAdmin();

      expect(preparedQuery).toContain('SELECT u.id, u.email, u.name, u.avatar_url, u.system_role');
      expect(preparedQuery).toContain('as pool_count');
      expect(users.length).toBe(1);
      expect(users[0]).toEqual({
        id: 'u_test_1',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://avatar.png',
        systemRole: 'user',
        isArchived: false,
        archivedAt: null,
        poolCount: 1,
        createdAt: '2026-01-01T00:00:00Z'
      });
    });
  });

  describe('MySqlStorageAdapter system settings', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('executes SELECT with setting_key and setting_value columns in MySQL', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        { setting_key: 'registration_enabled', setting_value: 'true' },
        { setting_key: 'maintenance_mode', setting_value: 'false' },
        { setting_key: 'system_notice', setting_value: 'Hello MySQL' }
      ]);

      const adapter = new MySqlStorageAdapter();
      const settings = await adapter.getSystemSettings();

      expect(db.query).toHaveBeenCalledWith('SELECT setting_key, setting_value FROM system_settings');
      expect(settings.registration_enabled).toBe(true);
      expect(settings.maintenance_mode).toBe(false);
      expect(settings.system_notice).toBe('Hello MySQL');
    });

    it('executes UPSERT with setting_key and setting_value in MySQL', async () => {
      vi.mocked(db.execute).mockResolvedValue({ affectedRows: 1 } as any);

      const adapter = new MySqlStorageAdapter();
      await adapter.saveSystemSettings({
        registration_enabled: 'false',
        system_notice: 'System Closed'
      });

      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(vi.mocked(db.execute).mock.calls[0][0]).toContain(
        'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
      );
      expect(vi.mocked(db.execute).mock.calls[0][1]).toEqual(['registration_enabled', 'false']);
      expect(vi.mocked(db.execute).mock.calls[1][1]).toEqual(['system_notice', 'System Closed']);
    });

    it('executes UPDATE for organizations in MySQL', async () => {
      vi.mocked(db.execute).mockResolvedValue({ affectedRows: 1 } as any);

      const adapter = new MySqlStorageAdapter();
      await adapter.updateOrg('org-456', { name: 'Globex Inc', tier: 'standard' });

      expect(db.execute).toHaveBeenCalledWith(
        'UPDATE organizations SET name = ?, tier = ? WHERE id = ?',
        ['Globex Inc', 'standard', 'org-456']
      );
    });

    it('executes listAllUsersForAdmin with correlated pool_count in MySQL', async () => {
      vi.mocked(db.query).mockResolvedValueOnce([
        {
          id: 'u_mysql_1',
          email: 'mysql@example.com',
          name: 'MySQL User',
          avatar_url: null,
          system_role: 'admin',
          pool_count: 3,
          created_at: '2026-02-01T00:00:00Z'
        }
      ]);

      const adapter = new MySqlStorageAdapter();
      const users = await adapter.listAllUsersForAdmin();

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('as pool_count'),
        []
      );
      expect(users.length).toBe(1);
      expect(users[0]).toEqual({
        id: 'u_mysql_1',
        email: 'mysql@example.com',
        name: 'MySQL User',
        avatarUrl: null,
        systemRole: 'admin',
        isArchived: false,
        archivedAt: null,
        poolCount: 3,
        createdAt: '2026-02-01T00:00:00Z'
      });
    });
  });

  describe('Universal API Routes (/api/admin/settings & /api/admin/public-settings)', () => {
    let app: ReturnType<typeof createUniversalApi>;
    let mockStorage: any;
    let superadminToken: string;
    let normalUserToken: string;

    beforeEach(async () => {
      const storedSettings: Record<string, any> = {
        registration_enabled: 'true',
        maintenance_mode: 'false',
        apple_login_enabled: 'false',
        kiosk_mode_enabled: 'true',
        system_notice: 'Welcome to PantryPool!'
      };

      mockStorage = {
        getUserById: vi.fn(async (id: string) => {
          if (id === 'u_superadmin') {
            return { id: 'u_superadmin', email: 'admin@pantrypool.com', name: 'Super Admin', system_role: 'superadmin', token_version: 1 };
          }
          return { id: 'u_regular', email: 'user@pantrypool.com', name: 'Regular User', system_role: 'user', token_version: 1 };
        }),
        getSystemSettings: vi.fn(async () => ({ ...storedSettings })),
        saveSystemSettings: vi.fn(async (newSettings: Record<string, any>) => {
          Object.assign(storedSettings, newSettings);
        })
      };

      app = createUniversalApi(mockStorage, secret);

      superadminToken = await createUniversalToken(
        { userId: 'u_superadmin', email: 'admin@pantrypool.com', name: 'Super Admin', systemRole: 'superadmin', tokenVersion: 1 },
        secret
      );

      normalUserToken = await createUniversalToken(
        { userId: 'u_regular', email: 'user@pantrypool.com', name: 'Regular User', systemRole: 'user', tokenVersion: 1 },
        secret
      );
    });

    it('rejects unauthenticated GET /api/admin/settings with 401', async () => {
      const res = await app.request('/api/admin/settings', { method: 'GET' });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Authentication required');
    });

    it('rejects non-superadmin GET /api/admin/settings with 403', async () => {
      const res = await app.request('/api/admin/settings', {
        method: 'GET',
        headers: { Authorization: `Bearer ${normalUserToken}` }
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Superadmin access required');
    });

    it('allows superadmin to GET /api/admin/settings', async () => {
      const res = await app.request('/api/admin/settings', {
        method: 'GET',
        headers: { Authorization: `Bearer ${superadminToken}` }
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.settings).toBeDefined();
      expect(json.settings.registration_enabled).toBe('true');
    });

    it('rejects unauthenticated POST /api/admin/settings with 401', async () => {
      const res = await app.request('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { maintenance_mode: 'true' } })
      });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('rejects non-superadmin POST /api/admin/settings with 403', async () => {
      const res = await app.request('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${normalUserToken}`
        },
        body: JSON.stringify({ settings: { maintenance_mode: 'true' } })
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
    });

    it('allows superadmin to save platform settings and retrieves updated values', async () => {
      const saveRes = await app.request('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superadminToken}`
        },
        body: JSON.stringify({
          settings: {
            registration_enabled: 'false',
            maintenance_mode: 'true',
            apple_login_enabled: 'true',
            system_notice: 'Scheduled maintenance from 12-1 AM'
          }
        })
      });

      expect(saveRes.status).toBe(200);
      const saveJson: any = await saveRes.json();
      expect(saveJson.success).toBe(true);
      expect(saveJson.message).toContain('Settings saved');

      // Check subsequent GET
      const getRes = await app.request('/api/admin/settings', {
        method: 'GET',
        headers: { Authorization: `Bearer ${superadminToken}` }
      });
      const getJson: any = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(getJson.settings.registration_enabled).toBe('false');
      expect(getJson.settings.maintenance_mode).toBe('true');
      expect(getJson.settings.apple_login_enabled).toBe('true');
      expect(getJson.settings.system_notice).toBe('Scheduled maintenance from 12-1 AM');

      // Check public settings endpoint reflects changes
      const pubRes = await app.request('/api/admin/public-settings');
      const pubJson: any = await pubRes.json();
      expect(pubJson.success).toBe(true);
      expect(pubJson.settings.registrationEnabled).toBe(false);
      expect(pubJson.settings.maintenanceMode).toBe(true);
      expect(pubJson.settings.appleLoginEnabled).toBe(true);
      expect(pubJson.settings.systemNotice).toBe('Scheduled maintenance from 12-1 AM');
    });

    it('allows superadmin to update organization details via PUT /api/admin/organizations/:id', async () => {
      mockStorage.updateOrg = vi.fn().mockResolvedValue(undefined);

      const res = await app.request('/api/admin/organizations/org-test-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superadminToken}`
        },
        body: JSON.stringify({
          name: 'New Org Name',
          tier: 'plus'
        })
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(mockStorage.updateOrg).toHaveBeenCalledWith('org-test-1', {
        name: 'New Org Name',
        tier: 'plus'
      });
    });

    it('rejects unauthenticated and non-superadmin updates to /api/admin/organizations/:id', async () => {
      const unauth = await app.request('/api/admin/organizations/org-test-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Hacked Org' })
      });
      expect(unauth.status).toBe(401);

      const forbidden = await app.request('/api/admin/organizations/org-test-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${normalUserToken}`
        },
        body: JSON.stringify({ name: 'Hacked Org' })
      });
      expect(forbidden.status).toBe(403);
    });

    it('returns users with accurate poolCount via GET /api/admin/users using listAllUsersForAdmin', async () => {
      mockStorage.listAllUsersForAdmin = vi.fn().mockResolvedValue([
        {
          id: 'u_1',
          email: 'u1@example.com',
          name: 'User One',
          avatarUrl: null,
          systemRole: 'user',
          poolCount: 1,
          createdAt: '2026-01-01T00:00:00Z'
        },
        {
          id: 'u_2',
          email: 'u2@example.com',
          name: 'User Two',
          avatarUrl: null,
          systemRole: 'superadmin',
          poolCount: 1,
          createdAt: '2026-01-01T00:00:00Z'
        }
      ]);

      const res = await app.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${superadminToken}` }
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.users).toHaveLength(2);
      expect(json.users[0].poolCount).toBe(1);
      expect(json.users[1].poolCount).toBe(1);
    });

    it('falls back to listPoolsForUser when listAllUsersForAdmin is not available', async () => {
      mockStorage.listAllUsersForAdmin = undefined;
      mockStorage.listUsers = vi.fn().mockResolvedValue([
        { id: 'u_fallback', email: 'fb@example.com', name: 'FB User', system_role: 'user', created_at: '2026-01-01' }
      ]);
      mockStorage.listPoolsForUser = vi.fn().mockResolvedValue([
        { id: 'pool_1', name: 'Office Pool' }
      ]);

      const res = await app.request('/api/admin/users', {
        headers: { Authorization: `Bearer ${superadminToken}` }
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.users[0].poolCount).toBe(1);
      expect(mockStorage.listPoolsForUser).toHaveBeenCalledWith('u_fallback');
    });
  });
});
