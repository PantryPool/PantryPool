import { describe, it, expect, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken, timingSafeEqualStr } from '../src/server/api/authUtils';
import { StorageAdapter } from '../src/server/storage/types';

class MockPhase2Storage implements Partial<StorageAdapter> {
  pools: Map<string, any> = new Map();
  members: Map<string, any> = new Map();
  users: Map<string, any> = new Map();

  async getPoolById(id: string) { return this.pools.get(id) || null; }
  async listPoolsForUser(userId: string) { return Array.from(this.pools.values()); }
  async listPoolMembers(poolId: string) { return Array.from(this.members.values()).filter(m => m.pool_id === poolId); }
  async getPoolMember(poolId: string, userId: string) { return this.members.get(`${poolId}_${userId}`) || null; }
  async getUserById(id: string) { return this.users.get(id) || null; }
}

describe('🔒 OWASP Top 10 (2025) Phase 2 Security Suite', () => {
  const JWT_SECRET = 'owasp-phase2-secret-key-32chars!!';
  let app: ReturnType<typeof createUniversalApi>;
  let storage: MockPhase2Storage;
  let memberToken: string;
  let championToken: string;
  let adminToken: string;

  beforeEach(async () => {
    storage = new MockPhase2Storage();
    storage.pools.set('pool_breakroom', {
      id: 'pool_breakroom',
      name: 'Breakroom Pool',
      champion_id: 'u_champion',
      kiosk_pin: '9876',
      max_deficit_cents: 1000
    });

    storage.members.set('pool_breakroom_u_member', {
      id: 'pm_member',
      pool_id: 'pool_breakroom',
      user_id: 'u_member',
      role: 'member',
      balance: 10.00,
      balance_cents: 1000
    });

    storage.members.set('pool_breakroom_u_champion', {
      id: 'pm_champ',
      pool_id: 'pool_breakroom',
      user_id: 'u_champion',
      role: 'champion',
      balance: 20.00,
      balance_cents: 2000
    });

    app = createUniversalApi(storage as any, JWT_SECRET);

    memberToken = await createUniversalToken({
      userId: 'u_member',
      email: 'member@example.com',
      name: 'Regular Member',
      systemRole: 'user',
      tokenVersion: 1
    }, JWT_SECRET);

    championToken = await createUniversalToken({
      userId: 'u_champion',
      email: 'champ@example.com',
      name: 'Champion User',
      systemRole: 'user',
      tokenVersion: 1
    }, JWT_SECRET);

    adminToken = await createUniversalToken({
      userId: 'u_admin',
      email: 'admin@example.com',
      name: 'Admin User',
      systemRole: 'superadmin',
      tokenVersion: 1
    }, JWT_SECRET);
  });

  describe('SEC-A02-01: Global Security Headers Enforcement', () => {
    it('sets standard defensive HTTP security headers on all responses', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Permissions-Policy')).toContain('camera=(self)');
    });

    it('sets Strict-Transport-Security (HSTS) in production environments', async () => {
      const prodApp = createUniversalApi(storage as any, JWT_SECRET);
      const res = await prodApp.request('/api/health', {}, {
        ENVIRONMENT: 'production'
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload');
    });
  });

  describe('SEC-A02-02: Cryptographic Secret Hardening in Production', () => {
    it('fails closed with 500 when JWT_SECRET is unset in production', async () => {
      const bareApp = createUniversalApi(storage as any);
      const res = await bareApp.request('/api/pools', {}, {
        ENVIRONMENT: 'production',
        JWT_SECRET: undefined
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('JWT_SECRET');
    });
  });

  describe('SEC-A04-01: Kiosk PIN Redaction for Non-Privileged Callers', () => {
    it('redacts kiosk_pin from GET /api/pools for regular members', async () => {
      const res = await app.request('/api/pools', {
        headers: { 'Authorization': `Bearer ${memberToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      const pool = data.pools.find((p: any) => p.id === 'pool_breakroom');
      expect(pool).toBeDefined();
      expect(pool.kiosk_pin).toBeUndefined();
      expect(pool.kioskPin).toBeUndefined();
    });

    it('redacts kiosk_pin from GET /api/pools for unauthenticated visitors', async () => {
      const res = await app.request('/api/pools');
      expect(res.status).toBe(200);
      const data = await res.json();
      const pool = data.pools.find((p: any) => p.id === 'pool_breakroom');
      expect(pool).toBeDefined();
      expect(pool.kiosk_pin).toBeUndefined();
      expect(pool.kioskPin).toBeUndefined();
    });

    it('preserves kiosk_pin in GET /api/pools for the pool champion', async () => {
      const res = await app.request('/api/pools', {
        headers: { 'Authorization': `Bearer ${championToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      const pool = data.pools.find((p: any) => p.id === 'pool_breakroom');
      expect(pool).toBeDefined();
      expect(pool.kiosk_pin).toBe('9876');
    });

    it('preserves kiosk_pin in GET /api/pools for superadmins', async () => {
      const res = await app.request('/api/pools', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      const pool = data.pools.find((p: any) => p.id === 'pool_breakroom');
      expect(pool).toBeDefined();
      expect(pool.kiosk_pin).toBe('9876');
    });

    it('redacts kiosk_pin from GET /api/pools/:poolId for regular members', async () => {
      const res = await app.request('/api/pools/pool_breakroom', {
        headers: { 'Authorization': `Bearer ${memberToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.pool.kiosk_pin).toBeUndefined();
      expect(data.pool.kioskPin).toBeUndefined();
    });
  });

  describe('SEC-A04-02: Constant-Time Comparison for Email Relay Secret', () => {
    it('timingSafeEqualStr accurately compares matching and non-matching strings', () => {
      expect(timingSafeEqualStr('secret_key_12345', 'secret_key_12345')).toBe(true);
      expect(timingSafeEqualStr('secret_key_12345', 'secret_key_12346')).toBe(false);
      expect(timingSafeEqualStr('secret_key_12345', 'short')).toBe(false);
    });

    it('rejects email relay requests with mismatched secret with 401', async () => {
      const res = await app.request('/api/internal/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Secret': 'wrong-secret'
        },
        body: JSON.stringify({ to: 'user@example.com', subject: 'Test', html: '<p>Hello</p>' })
      }, {
        EMAIL_RELAY_SECRET: 'super-secure-email-relay-key-2026'
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Unauthorized relay access');
    });
  });
});
