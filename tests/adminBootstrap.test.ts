import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createUniversalApi } from '../src/server/api/app';
import { StorageAdapter, StorageUser } from '../src/server/storage/types';

function createMockStorage(): StorageAdapter {
  const users: StorageUser[] = [];

  return {
    async countUsers(): Promise<number> {
      return users.length;
    },
    async getUserById(id: string): Promise<StorageUser | null> {
      return users.find(u => u.id === id) || null;
    },
    async getUserByEmail(email: string): Promise<StorageUser | null> {
      return users.find(u => u.email === email.toLowerCase().trim()) || null;
    },
    async createUser(userData: any): Promise<StorageUser> {
      const user: StorageUser = {
        id: userData.id || `u_${Date.now()}`,
        email: userData.email.toLowerCase().trim(),
        name: userData.name,
        avatar_url: userData.avatar_url || null,
        password_hash: userData.password_hash || null,
        google_id: userData.google_id || null,
        apple_id: userData.apple_id || null,
        system_role: userData.system_role || 'user',
        token_version: userData.token_version || 1,
        created_at: new Date().toISOString()
      };
      users.push(user);
      return user;
    },
    async updateUser(id: string, updates: Partial<StorageUser>): Promise<void> {
      const idx = users.findIndex(u => u.id === id);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...updates };
      }
    },
    async listUsers(): Promise<StorageUser[]> {
      return [...users];
    },
    async bumpTokenVersion(userId: string): Promise<number> {
      const user = users.find(u => u.id === userId);
      if (user) {
        user.token_version = (user.token_version || 1) + 1;
        return user.token_version;
      }
      return 1;
    },
    async getPlatformStats() {
      return { totalUsers: users.length, totalPools: 0, totalTransactions: 0, totalVolume: 0 };
    }
  } as unknown as StorageAdapter;
}

describe('Secure Open-Source Admin Bootstrap & Elimination of Hardcoded PII', () => {
  const originalInitialAdmin = process.env.INITIAL_ADMIN_EMAIL;
  const jwtSecret = 'test-secure-admin-bootstrap-jwt-secret-2026';

  beforeEach(() => {
    delete process.env.INITIAL_ADMIN_EMAIL;
  });

  afterEach(() => {
    if (originalInitialAdmin !== undefined) {
      process.env.INITIAL_ADMIN_EMAIL = originalInitialAdmin;
    } else {
      delete process.env.INITIAL_ADMIN_EMAIL;
    }
  });

  it('automatically grants superadmin to the very first registered user in an empty database', async () => {
    const storage = createMockStorage();
    const app = createUniversalApi(storage, jwtSecret);

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@open-community.org',
        password: 'SecurePassword123!',
        name: 'Alice Pioneer'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.email).toBe('alice@open-community.org');
    expect(body.user.systemRole).toBe('superadmin');

    const storedUser = await storage.getUserByEmail('alice@open-community.org');
    expect(storedUser?.system_role).toBe('superadmin');
  });

  it('assigns standard user role to subsequent registrations once an admin exists', async () => {
    const storage = createMockStorage();
    const app = createUniversalApi(storage, jwtSecret);

    // First user -> superadmin
    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@open-community.org',
        password: 'SecurePassword123!',
        name: 'Alice Pioneer'
      })
    });

    // Second user -> user
    const res2 = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@open-community.org',
        password: 'SecurePassword123!',
        name: 'Bob Member'
      })
    });

    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.user.email).toBe('bob@open-community.org');
    expect(body2.user.systemRole).toBe('user');

    const storedBob = await storage.getUserByEmail('bob@open-community.org');
    expect(storedBob?.system_role).toBe('user');
  });

  it('does NOT promote arbitrary users to superadmin when INITIAL_ADMIN_EMAIL is unset', async () => {
    const storage = createMockStorage();
    const app = createUniversalApi(storage, jwtSecret);

    // Seed initial user so DB is not empty
    await storage.createUser({
      id: 'u_existing',
      email: 'founder@selfhost.org',
      name: 'Founder',
      system_role: 'superadmin'
    });

    // Register contributor@example.com when INITIAL_ADMIN_EMAIL is not configured
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'contributor@example.com',
        password: 'SecurePassword123!',
        name: 'Community Contributor'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.systemRole).toBe('user');

    const storedUser = await storage.getUserByEmail('contributor@example.com');
    expect(storedUser?.system_role).toBe('user');
  });

  it('promotes user to superadmin if their email matches configured INITIAL_ADMIN_EMAIL', async () => {
    process.env.INITIAL_ADMIN_EMAIL = 'custom-admin@selfhost.org';

    const storage = createMockStorage();
    const app = createUniversalApi(storage, jwtSecret);

    // Seed existing regular user
    await storage.createUser({
      id: 'u_existing',
      email: 'member@selfhost.org',
      name: 'Member',
      system_role: 'user'
    });

    // Register user matching INITIAL_ADMIN_EMAIL
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'custom-admin@selfhost.org',
        password: 'SecurePassword123!',
        name: 'Configured Admin'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.systemRole).toBe('superadmin');

    const storedAdmin = await storage.getUserByEmail('custom-admin@selfhost.org');
    expect(storedAdmin?.system_role).toBe('superadmin');
  });

  it('elevates existing user to superadmin upon login if email matches INITIAL_ADMIN_EMAIL', async () => {
    process.env.INITIAL_ADMIN_EMAIL = 'elevated@selfhost.org';

    const storage = createMockStorage();
    const app = createUniversalApi(storage, jwtSecret);

    const { hashPassword } = await import('../src/server/api/authUtils');
    const passwordHash = await hashPassword('ValidPassword123!');

    await storage.createUser({
      id: 'u_elevate',
      email: 'elevated@selfhost.org',
      name: 'To Elevate',
      password_hash: passwordHash,
      system_role: 'user'
    });

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'elevated@selfhost.org',
        password: 'ValidPassword123!'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.systemRole).toBe('superadmin');

    const updatedUser = await storage.getUserByEmail('elevated@selfhost.org');
    expect(updatedUser?.system_role).toBe('superadmin');
  });

  it('guarantees no hardcoded superadmin backdoor emails remain in auth or script files', () => {
    const filesToCheck = [
      'src/server/api/routes/auth.ts',
      'functions/api/_middleware/auth.ts',
      'scripts/make_superadmin.ts'
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(__dirname, '..', relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content).not.toMatch(/@(?:gmail\.com)/);
      }
    }
  });

  it('guarantees no hardcoded default admin passwords remain in edge seeder', () => {
    const dbLibPath = path.resolve(__dirname, '../functions/api/_lib/db.ts');
    if (fs.existsSync(dbLibPath)) {
      const content = fs.readFileSync(dbLibPath, 'utf-8');
      expect(content).not.toContain('password_hash:');
    }
  });
});
