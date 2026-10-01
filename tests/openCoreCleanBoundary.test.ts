import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createUniversalApi } from '../src/server/api/app';
import { InMemoryStorageAdapter } from '../src/test/InMemoryStorageAdapter';
import { getTierLimits } from '../src/server/api/tierLimits';

describe('Open-Core Clean Boundary & Anti-Leakage Verification', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('permanently confirms deletion of proprietary commercial modules from disk', () => {
    const proprietaryFiles = [
      'src/server/api/routes/billing.ts',
      'src/server/api/routes/sso.ts',
      'src/server/api/routes/affiliate.ts',
      'src/components/SsoConfigModal.tsx',
      'src/components/AffiliateProductsModal.tsx',
      'tests/stripeAndTiers.test.ts',
      'tests/sso.test.ts',
      'tests/affiliateProducts.test.ts',
      'tests/affiliateProductsModal.test.tsx',
    ];

    for (const relPath of proprietaryFiles) {
      const fullPath = path.join(rootDir, relPath);
      expect(
        fs.existsSync(fullPath),
        `PROPRIETARY LEAK DETECTED: ${relPath} must NOT exist in the open-core repository.`
      ).toBe(false);
    }
  });

  it('guarantees community pools have unlimited member capacity (999,999)', () => {
    const limits = getTierLimits('community');
    expect(limits.maxMembersPerPool).toBe(999999);
    expect(limits.maxPools).toBeGreaterThanOrEqual(1);
  });

  it('allows community pool to register 30+ members without tier limit denial', async () => {
    const storage = new InMemoryStorageAdapter();
    const app = createUniversalApi(storage, 'test-secret');

    // Register champion
    const champRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'champ@openpool.org', password: 'Password123!', name: 'Pool Champ' })
    });
    const champData = await champRes.json();
    const champToken = champData.token;

    // Create community pool
    const poolRes = await app.request('/api/pools', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${champToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Unlimited Open Community Pantry', category: 'Community', currency: '$' })
    });
    const poolData = await poolRes.json();
    expect(poolRes.status).toBe(200);
    const poolId = poolData.pool.id;
    const poolCode = poolData.pool.code;

    // Add 30 members to pool
    for (let i = 1; i <= 30; i++) {
      const ip = `192.168.1.${i}`;
      const memRes = await app.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': ip
        },
        body: JSON.stringify({ email: `neighbor${i}@openpool.org`, password: 'Password123!', name: `Neighbor ${i}` })
      });
      const memData = await memRes.json();
      const memToken = memData.token;

      const joinRes = await app.request('/api/pools/join', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${memToken}`,
          'Content-Type': 'application/json',
          'cf-connecting-ip': ip
        },
        body: JSON.stringify({ code: poolCode })
      });
      expect(joinRes.status, `Member ${i} should join community pool without tier restriction`).toBe(200);
    }

    const members = await storage.listPoolMembers(poolId);
    expect(members.length).toBe(31); // 1 champ + 30 members
  });

  it('confirms all proprietary Stripe endpoints return 404 Not Found on Universal Hono app', async () => {
    const storage = new InMemoryStorageAdapter();
    const app = createUniversalApi(storage, 'test-secret');

    const stripeEndpoints = [
      { method: 'POST', path: '/api/stripe/create-checkout-session' },
      { method: 'POST', path: '/api/stripe/create-portal-session' },
      { method: 'POST', path: '/api/stripe/portal' },
      { method: 'POST', path: '/api/stripe/verify-session' },
      { method: 'POST', path: '/api/stripe/webhook' },
    ];

    for (const ep of stripeEndpoints) {
      const res = await app.request(ep.path, { method: ep.method });
      expect(res.status, `Stripe endpoint ${ep.method} ${ep.path} must return 404`).toBe(404);
    }
  });

  it('confirms all proprietary Corporate SSO endpoints return 404 Not Found on Universal Hono app', async () => {
    const storage = new InMemoryStorageAdapter();
    const app = createUniversalApi(storage, 'test-secret');

    const ssoEndpoints = [
      { method: 'GET', path: '/api/auth/sso/status' },
      { method: 'POST', path: '/api/auth/sso/discover' },
      { method: 'POST', path: '/api/auth/sso/callback' },
      { method: 'GET', path: '/api/auth/sso/config' },
      { method: 'POST', path: '/api/auth/sso/config' },
    ];

    for (const ep of ssoEndpoints) {
      const res = await app.request(ep.path, { method: ep.method });
      expect(res.status, `SSO endpoint ${ep.method} ${ep.path} must return 404`).toBe(404);
    }
  });

  it('confirms all proprietary Amazon Affiliate endpoints return 404 Not Found on Universal Hono app', async () => {
    const storage = new InMemoryStorageAdapter();
    const app = createUniversalApi(storage, 'test-secret');

    const affiliateEndpoints = [
      { method: 'GET', path: '/api/affiliate/products' },
      { method: 'POST', path: '/api/affiliate/click' },
      { method: 'GET', path: '/api/admin/affiliate/products' },
      { method: 'POST', path: '/api/admin/affiliate/upload' },
    ];

    for (const ep of affiliateEndpoints) {
      const res = await app.request(ep.path, { method: ep.method });
      expect(res.status, `Affiliate endpoint ${ep.method} ${ep.path} must return 404`).toBe(404);
    }
  });
});
