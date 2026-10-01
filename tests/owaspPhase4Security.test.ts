import { describe, it, expect, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken, hashPassword } from '../src/server/api/authUtils';
import { resetRateLimitCacheForTesting, RATE_LIMITS } from '../src/server/api/rateLimit';
import { getSecurityAuditEvents, clearSecurityAuditEventsForTesting } from '../src/server/api/auditLogger';
import { StorageAdapter } from '../src/server/storage/types';
import fs from 'fs';
import path from 'path';

class MockPhase4Storage implements Partial<StorageAdapter> {
  users: Map<string, any> = new Map();
  pools: Map<string, any> = new Map();
  members: Map<string, any> = new Map();
  items: Map<string, any> = new Map();
  transactions: any[] = [];

  async getUserById(id: string) { return this.users.get(id) || null; }
  async getUserByEmail(email: string) {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }
  async updateUser(id: string, updates: any) {
    const u = this.users.get(id);
    if (!u) return null;
    Object.assign(u, updates);
    return u;
  }

  async getPoolById(id: string) { return this.pools.get(id) || null; }
  async updatePool(id: string, updates: any) {
    const p = this.pools.get(id);
    if (!p) return null;
    Object.assign(p, updates);
    return p;
  }

  async getPoolMember(poolId: string, userId: string) {
    return this.members.get(`${poolId}_${userId}`) || null;
  }
  async updateMemberRole(poolId: string, userId: string, role: any) {
    const m = this.members.get(`${poolId}_${userId}`);
    if (m) m.role = role;
    return m;
  }
  async adjustMemberBalance(poolId: string, userId: string, delta: number, deltaCents: number) {
    const m = this.members.get(`${poolId}_${userId}`);
    if (m) {
      m.balance = (m.balance || 0) + delta;
      m.balance_cents = (m.balance_cents || 0) + deltaCents;
    }
    return m;
  }

  async getItemById(id: string) { return this.items.get(id) || null; }
  async saveItem(item: any) {
    this.items.set(item.id, { ...item });
    return item;
  }
  async adjustItemStock(id: string, delta: number) {
    const it = this.items.get(id);
    if (it) it.stock = (it.stock || 0) + delta;
    return it;
  }

  async createTransaction(tx: any) {
    this.transactions.push(tx);
    return tx;
  }
}

describe('🔒 OWASP Top 10 (2025) Phase 4 Security Suite', () => {
  const JWT_SECRET = 'owasp-phase4-secret-key-32chars!!';
  let app: ReturnType<typeof createUniversalApi>;
  let storage: MockPhase4Storage;
  let userToken: string;
  let champToken: string;

  beforeEach(async () => {
    resetRateLimitCacheForTesting();
    clearSecurityAuditEventsForTesting();

    storage = new MockPhase4Storage();

    const passHash = await hashPassword('CorrectPassword123!');

    storage.users.set('u_bob', {
      id: 'u_bob',
      email: 'bob@example.com',
      name: 'Bob',
      password_hash: passHash,
      system_role: 'user',
      token_version: 1
    });

    storage.users.set('u_champ', {
      id: 'u_champ',
      email: 'champ@example.com',
      name: 'Champion',
      password_hash: passHash,
      system_role: 'user',
      token_version: 1
    });

    storage.pools.set('pool_dev', {
      id: 'pool_dev',
      name: 'Dev Pantry',
      champion_id: 'u_champ',
      max_deficit: 10.00,
      max_deficit_cents: 1000
    });

    storage.members.set('pool_dev_u_bob', {
      id: 'pm_bob',
      pool_id: 'pool_dev',
      user_id: 'u_bob',
      role: 'member',
      balance: 5.00,
      balance_cents: 500
    });

    storage.members.set('pool_dev_u_champ', {
      id: 'pm_champ',
      pool_id: 'pool_dev',
      user_id: 'u_champ',
      role: 'champion',
      balance: 10.00,
      balance_cents: 1000
    });

    storage.items.set('item_snack', {
      id: 'item_snack',
      pool_id: 'pool_dev',
      name: 'Protein Bar',
      cost_per_unit: 2.00,
      cost_per_unit_cents: 200,
      stock: 20,
      min_stock: 5
    });

    app = createUniversalApi(storage as any, JWT_SECRET);

    userToken = await createUniversalToken({
      userId: 'u_bob',
      email: 'bob@example.com',
      name: 'Bob',
      systemRole: 'user',
      tokenVersion: 1
    }, JWT_SECRET);

    champToken = await createUniversalToken({
      userId: 'u_champ',
      email: 'champ@example.com',
      name: 'Champion',
      systemRole: 'user',
      tokenVersion: 1
    }, JWT_SECRET);
  });

  describe('SEC-A03-01: Supply Chain Dependency Overrides', () => {
    it('verifies package.json specifies a secure qs override (>=6.16.0)', () => {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      expect(pkg.overrides).toBeDefined();
      expect(pkg.overrides.qs).toBeDefined();
      expect(pkg.overrides.qs).toMatch(/\^?6\.(1[6-9]|[2-9]\d)/);
    });
  });

  describe('SEC-A07-02: Universal Rate Limiting & Brute-Force Protection', () => {
    it('permits requests within auth category limit and throttles with HTTP 429 when exceeded', async () => {
      const testIp = '198.51.100.22';

      // Send requests up to RATE_LIMITS.auth.max (30)
      for (let i = 0; i < RATE_LIMITS.auth.max; i++) {
        const res = await app.request('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': testIp
          },
          body: JSON.stringify({ email: 'bob@example.com', password: 'wrong' })
        });
        expect(res.status).not.toBe(429);
      }

      // 31st request from same IP must be throttled with 429
      const throttledRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': testIp
        },
        body: JSON.stringify({ email: 'bob@example.com', password: 'wrong' })
      });

      expect(throttledRes.status).toBe(429);
      expect(throttledRes.headers.get('Retry-After')).toBeDefined();
      const data = await throttledRes.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Too many requests');
    });

    it('isolates rate limits between different client IP addresses', async () => {
      const ipBlocked = '203.0.113.10';
      const ipClean = '203.0.113.20';

      // Exhaust IP 1
      for (let i = 0; i < RATE_LIMITS.auth.max; i++) {
        await app.request('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': ipBlocked
          },
          body: JSON.stringify({ email: 'bob@example.com', password: 'wrong' })
        });
      }

      const blockedRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': ipBlocked
        },
        body: JSON.stringify({ email: 'bob@example.com', password: 'wrong' })
      });
      expect(blockedRes.status).toBe(429);

      // Clean IP must not be throttled
      const cleanRes = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': ipClean
        },
        body: JSON.stringify({ email: 'bob@example.com', password: 'wrong' })
      });
      expect(cleanRes.status).toBe(401); // Got through rate limiter to auth handler
    });

    it('throttles AI parse-receipt endpoint at its category ceiling (10/min)', async () => {
      const ipAi = '192.0.2.88';

      for (let i = 0; i < RATE_LIMITS.ai.max; i++) {
        const res = await app.request('/api/parse-receipt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': ipAi
          },
          body: JSON.stringify({ textInput: '2 apples' })
        });
        expect(res.status).not.toBe(429);
      }

      // Next call must be blocked with 429
      const aiBlocked = await app.request('/api/parse-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': ipAi
        },
        body: JSON.stringify({ textInput: '2 apples' })
      });
      expect(aiBlocked.status).toBe(429);
    });
  });

  describe('SEC-A09-01: Centralized Security Audit Logging', () => {
    it('records AUTH_FAILURE on incorrect login password', async () => {
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '10.10.10.1'
        },
        body: JSON.stringify({ email: 'bob@example.com', password: 'WrongPassword!' })
      });

      const events = getSecurityAuditEvents();
      const authFail = events.find(e => e.action === 'AUTH_FAILURE');
      expect(authFail).toBeDefined();
      expect(authFail?.status).toBe('FAILURE');
      expect(authFail?.ipAddress).toBe('10.10.10.1');
      expect(authFail?.metadata?.email).toBe('bob@example.com');
      expect(authFail?.metadata?.reason).toBe('invalid_password');
    });

    it('records AUTH_SUCCESS on valid login', async () => {
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '10.10.10.2'
        },
        body: JSON.stringify({ email: 'bob@example.com', password: 'CorrectPassword123!' })
      });

      const events = getSecurityAuditEvents();
      const authOk = events.find(e => e.action === 'AUTH_SUCCESS');
      expect(authOk).toBeDefined();
      expect(authOk?.status).toBe('SUCCESS');
      expect(authOk?.actorId).toBe('u_bob');
      expect(authOk?.ipAddress).toBe('10.10.10.2');
    });

    it('records ACCESS_DENIED on unauthorized cross-member balance deposit', async () => {
      // Bob attempts to deposit into Champion's balance without manager permissions
      const res = await app.request('/api/transactions/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
          'CF-Connecting-IP': '10.10.10.3'
        },
        body: JSON.stringify({
          poolId: 'pool_dev',
          userId: 'u_champ',
          amount: 50.00
        })
      });

      expect(res.status).toBe(403);
      const events = getSecurityAuditEvents();
      const accessDenied = events.find(e => e.action === 'ACCESS_DENIED' && e.metadata?.reason === 'cross_member_deposit_forbidden');
      expect(accessDenied).toBeDefined();
      expect(accessDenied?.status).toBe('FAILURE');
      expect(accessDenied?.actorId).toBe('u_bob');
      expect(accessDenied?.metadata?.targetUserId).toBe('u_champ');
    });

    it('records LIMIT_OVERRIDE when pool credit ceiling is modified', async () => {
      const res = await app.request('/api/pools/pool_dev', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${champToken}`,
          'CF-Connecting-IP': '10.10.10.4'
        },
        body: JSON.stringify({
          maxDeficit: 25.00
        })
      });

      expect(res.status).toBe(200);
      const events = getSecurityAuditEvents();
      const limitEv = events.find(e => e.action === 'LIMIT_OVERRIDE');
      expect(limitEv).toBeDefined();
      expect(limitEv?.status).toBe('SUCCESS');
      expect(limitEv?.targetResource).toBe('/api/pools/pool_dev');
      expect(limitEv?.metadata?.newDeficitCents).toBe(2500);
    });

    it('records ROLE_CHANGE when pool member role is updated by champion', async () => {
      const res = await app.request('/api/pools/pool_dev/members/u_bob/role', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${champToken}`,
          'CF-Connecting-IP': '10.10.10.5'
        },
        body: JSON.stringify({
          role: 'admin'
        })
      });

      expect(res.status).toBe(200);
      const events = getSecurityAuditEvents();
      const roleEv = events.find(e => e.action === 'ROLE_CHANGE');
      expect(roleEv).toBeDefined();
      expect(roleEv?.status).toBe('SUCCESS');
      expect(roleEv?.metadata?.newRole).toBe('admin');
      expect(roleEv?.metadata?.targetUserId).toBe('u_bob');
    });

    it('records DISCREPANCY_CALIBRATION when inventory stock is manually modified via PUT', async () => {
      const res = await app.request('/api/items/item_snack', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${champToken}`,
          'CF-Connecting-IP': '10.10.10.6'
        },
        body: JSON.stringify({
          stock: 15 // Previous was 20 -> delta -5
        })
      });

      expect(res.status).toBe(200);
      const events = getSecurityAuditEvents();
      const calibEv = events.find(e => e.action === 'DISCREPANCY_CALIBRATION');
      expect(calibEv).toBeDefined();
      expect(calibEv?.status).toBe('SUCCESS');
      expect(calibEv?.metadata?.previousStock).toBe(20);
      expect(calibEv?.metadata?.newStock).toBe(15);
      expect(calibEv?.metadata?.delta).toBe(-5);
    });
  });
});
