import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createTestToken } from '../src/test/createTestApp';

describe('⚡ API Concurrency & High-Load Stress Testing Suite', () => {
  let harness: ReturnType<typeof createTestApp>;
  let userToken: string;

  beforeEach(async () => {
    harness = createTestApp();

    const user = await harness.storage.createUser({
      id: 'u_rush_1',
      email: 'rush_user@acme.com',
      name: 'Rush Hour User',
      system_role: 'user',
    });

    userToken = await createTestToken(user, harness.secret);

    await harness.storage.createPool({
      id: 'pool_hq',
      name: 'HQ Breakroom Pool',
      champion_id: 'u_rush_1',
    });

    await harness.storage.upsertPoolMember({
      id: 'pm_rush_1',
      pool_id: 'pool_hq',
      user_id: 'u_rush_1',
      role: 'member',
      balance: 500.0,
      balance_cents: 50000,
    });
  });

  it('handles 100 concurrent health check probes with sub-50ms average latency', async () => {
    const CONCURRENCY = 100;
    const start = performance.now();

    const promises = Array.from({ length: CONCURRENCY }, () =>
      harness.app.request('/api/health')
    );

    const responses = await Promise.all(promises);
    const duration = performance.now() - start;
    const avgLatency = duration / CONCURRENCY;

    expect(responses.length).toBe(CONCURRENCY);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.service).toContain('PantryPool Universal API');
    }

    console.log(`[Stress Test: Health] ${CONCURRENCY} requests completed in ${duration.toFixed(2)}ms (avg: ${avgLatency.toFixed(2)}ms/req)`);
    expect(avgLatency).toBeLessThan(50);
  });

  it('handles 50 simultaneous 9:00 AM breakroom consumption item requests without race errors', async () => {
    await harness.storage.saveItem({
      id: 'item_cold_brew',
      pool_id: 'pool_hq',
      name: 'Nitro Cold Brew Coffee',
      category: 'Beverages',
      stock: 100,
      cost_per_unit: 2.5,
    });

    const CONCURRENCY = 50;
    const start = performance.now();

    const promises = Array.from({ length: CONCURRENCY }, () =>
      harness.app.request('/api/items/consume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          poolId: 'pool_hq',
          itemId: 'item_cold_brew',
          quantity: 1,
        }),
      })
    );

    const responses = await Promise.all(promises);
    const duration = performance.now() - start;

    expect(responses.length).toBe(CONCURRENCY);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    }

    console.log(`[Stress Test: 50 Concurrent Consumptions] completed in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(3000);
  });

  it('handles 50 concurrent balance deposit / ledger transactions under load', async () => {
    const CONCURRENCY = 50;
    const start = performance.now();

    const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
      harness.app.request('/api/transactions/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          poolId: 'pool_hq',
          userId: 'u_rush_1',
          amount: 10.0 + i,
          description: `Rush deposit ${i}`,
        }),
      })
    );

    const responses = await Promise.all(promises);
    const duration = performance.now() - start;

    expect(responses.length).toBe(CONCURRENCY);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    }

    console.log(`[Stress Test: 50 Concurrent Deposits] completed in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(3000);
  });

  it('handles rapid burst catalog queries for 50 concurrent filtered item requests', async () => {
    await harness.storage.saveItem({ id: 'i1', pool_id: 'pool_hq', name: 'Cold Brew', stock: 10, category: 'Beverages' });
    await harness.storage.saveItem({ id: 'i2', pool_id: 'pool_hq', name: 'Protein Bar', stock: 15, category: 'Snacks' });
    await harness.storage.saveItem({ id: 'i3', pool_id: 'pool_hq', name: 'Almond Milk', stock: 5, category: 'Dairy' });

    const CONCURRENCY = 50;
    const start = performance.now();

    const promises = Array.from({ length: CONCURRENCY }, () =>
      harness.app.request('/api/items?poolId=pool_hq', {
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      })
    );

    const responses = await Promise.all(promises);
    const duration = performance.now() - start;

    expect(responses.length).toBe(CONCURRENCY);
    for (const res of responses) {
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.items.length).toBe(3);
    }

    console.log(`[Stress Test: 50 Concurrent Catalog Queries] completed in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(2000);
  });
});
