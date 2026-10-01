/**
 * ⚡ PantryPool API High-Concurrency Stress Testing Utility
 * Simulates breakroom rush-hour concurrency bursts (50-200 VUs)
 */
import { createUniversalApi } from '../src/server/api/app';
import {
  StorageAdapter,
  StoragePool,
  StorageUser,
  StorageItem,
  StorageTransaction,
  StoragePoolMember,
} from '../src/server/storage/types';
import { createUniversalToken } from '../src/server/api/authUtils';

function createInMemoryStorage(): StorageAdapter {
  const users = new Map<string, StorageUser>();
  const pools = new Map<string, StoragePool>();
  const members = new Map<string, StoragePoolMember>();
  const items = new Map<string, StorageItem>();
  const transactions: StorageTransaction[] = [];

  // Seed default pool and items
  const defaultPool: StoragePool = {
    id: 'pool_stress_1',
    name: 'Breakroom Alpha',
    category: 'Office',
    currency: '$',
  };
  pools.set(defaultPool.id, defaultPool);

  const defaultMember: StoragePoolMember = {
    id: 'mem_1',
    pool_id: 'pool_stress_1',
    user_id: 'u_stress_1',
    role: 'admin',
    balance: 100.0,
    balance_cents: 10000,
  };
  members.set(`${defaultMember.pool_id}_${defaultMember.user_id}`, defaultMember);

  const coldBrew: StorageItem = {
    id: 'item_cold_brew',
    pool_id: 'pool_stress_1',
    name: 'Nitro Cold Brew Coffee',
    category: 'Beverages',
    stock: 5000,
    min_stock: 10,
    cost_per_unit: 2.5,
    cost_per_unit_cents: 250,
    unit_name: 'can',
    icon: '☕',
  };
  items.set(coldBrew.id, coldBrew);

  const dummyUser: StorageUser = {
    id: 'u_stress_1',
    name: 'Alex Rush',
    email: 'alex@pantrypool.com',
    password_hash: 'test_password_hash_placeholder',
    system_role: 'user',
    token_version: 1,
  };
  users.set(dummyUser.id, dummyUser);

  return {
    async getPlatformStats() {
      return { totalUsers: users.size, totalPools: pools.size, totalTransactions: transactions.length, totalVolume: 1000 };
    },
    async getUserByEmail(email: string) {
      return Array.from(users.values()).find((u) => u.email === email) || null;
    },
    async getUserById(id: string) {
      return users.get(id) || null;
    },
    async createUser(data: any) {
      const u: StorageUser = {
        id: data.id,
        name: data.name,
        email: data.email,
        password_hash: data.password_hash || data.passwordHash,
        system_role: data.system_role || 'user',
        token_version: 1,
      };
      users.set(u.id, u);
      return u;
    },
    async updateUser() {},
    async listUsers() {
      return Array.from(users.values());
    },
    async bumpTokenVersion() {
      return 1;
    },
    async getPoolsByUserId() {
      return Array.from(pools.values());
    },
    async listPoolsForUser() {
      return Array.from(pools.values());
    },
    async getPoolById(id: string) {
      return pools.get(id) || null;
    },
    async getPoolMember(poolId: string, userId: string) {
      return members.get(`${poolId}_${userId}`) || null;
    },
    async listPoolMembers(poolId: string) {
      return Array.from(members.values()).filter((m) => m.pool_id === poolId);
    },
    async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number) {
      const key = `${poolId}_${userId}`;
      let mem = members.get(key);
      if (!mem) {
        mem = { id: 'mem_' + crypto.randomUUID(), pool_id: poolId, user_id: userId, role: 'member', balance: 0, balance_cents: 0 };
        members.set(key, mem);
      }
      mem.balance += deltaAmount;
      mem.balance_cents += deltaCents;
    },
    async listItemsByPool(poolId: string) {
      return Array.from(items.values()).filter((i) => i.pool_id === poolId);
    },
    async getItemById(id: string) {
      return items.get(id) || null;
    },
    async adjustItemStock(id: string, deltaQty: number) {
      const item = items.get(id);
      if (item) {
        item.stock = Math.max(0, item.stock + deltaQty);
      }
    },
    async listTransactionsByPool(poolId: string) {
      return transactions.filter((t) => t.pool_id === poolId);
    },
    async createTransaction(tx: any) {
      const created: StorageTransaction = {
        id: tx.id || 'tx_' + crypto.randomUUID(),
        pool_id: tx.pool_id || tx.poolId,
        user_id: tx.user_id || tx.userId,
        item_id: tx.item_id || tx.itemId,
        type: tx.type,
        amount: tx.amount,
        amount_cents: tx.amount_cents || Math.round((tx.amount || 0) * 100),
        quantity: tx.quantity || 1,
        description: tx.description || '',
        created_at: new Date().toISOString(),
      };
      transactions.push(created);
      return created;
    },
    async listWebhooks() {
      return [];
    },
    async recordTelemetryEvents() {},
    async getTelemetryStats() {
      return { periodDays: 7, totalEvents: 0, topFeatures: [], errorSummary: [], funnelBreakdown: [], activityByDay: [], recentEvents: [] };
    },
  } as unknown as StorageAdapter;
}

interface StressResult {
  endpoint: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTimeMs: number;
  throughputRps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

async function runStressScenario(
  name: string,
  totalRequests: number,
  fn: (i: number) => Promise<Response>
): Promise<StressResult> {
  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;

  const start = performance.now();

  const batch = Array.from({ length: totalRequests }, async (_, i) => {
    const t0 = performance.now();
    try {
      const res = await fn(i);
      const elapsed = performance.now() - t0;
      latencies.push(elapsed);
      if (res.status >= 200 && res.status < 400) {
        successful++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  });

  await Promise.all(batch);
  const totalTimeMs = performance.now() - start;

  latencies.sort((a, b) => a - b);
  const p50Ms = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95Ms = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99Ms = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const throughputRps = (totalRequests / (totalTimeMs / 1000));

  return {
    endpoint: name,
    totalRequests,
    successfulRequests: successful,
    failedRequests: failed,
    totalTimeMs,
    throughputRps,
    p50Ms,
    p95Ms,
    p99Ms,
  };
}

async function main() {
  console.log('======================================================================');
  console.log('   ⚡ PantryPool — High-Concurrency API Stress Benchmark');
  console.log('======================================================================\n');

  const storage = createInMemoryStorage();
  const secret = 'test-bench-jwt-secret-placeholder';
  const app = createUniversalApi(storage, secret);

  const token = await createUniversalToken(
    { userId: 'u_stress_1', email: 'alex@pantrypool.com', name: 'Alex Rush', systemRole: 'user' },
    secret
  );

  const CONCURRENCY = parseInt(process.env.STRESS_CONCURRENCY || '100', 10);
  console.log(`🚀 Executing scenarios with ${CONCURRENCY} concurrent virtual requests...\n`);

  // Scenario 1: SRE Health Probes
  const r1 = await runStressScenario('GET /api/health', CONCURRENCY, async () => {
    return app.request('/api/health');
  });

  // Scenario 2: Catalog Item Queries
  const r2 = await runStressScenario('GET /api/items?poolId=pool_stress_1', CONCURRENCY, async () => {
    return app.request('/api/items?poolId=pool_stress_1', {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  // Scenario 3: Breakroom Consumption Rush
  const r3 = await runStressScenario('POST /api/items/consume', CONCURRENCY, async () => {
    return app.request('/api/items/consume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        poolId: 'pool_stress_1',
        itemId: 'item_cold_brew',
        quantity: 1,
      }),
    });
  });

  // Scenario 4: Financial Balance Deposits
  const r4 = await runStressScenario('POST /api/transactions/deposit', CONCURRENCY, async (i) => {
    return app.request('/api/transactions/deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        poolId: 'pool_stress_1',
        userId: 'u_stress_1',
        amount: 25.0 + i,
        description: `Stress test deposit ${i}`,
      }),
    });
  });

  const results = [r1, r2, r3, r4];

  console.log('---------------------------------------------------------------------------------------------------------');
  console.log('📊 Stress Test Performance Benchmark Results (P50 / P95 / P99 Latency & Throughput)');
  console.log('---------------------------------------------------------------------------------------------------------');
  console.table(
    results.map((r) => ({
      Scenario: r.endpoint,
      Requests: r.totalRequests,
      Success: `${r.successfulRequests}/${r.totalRequests}`,
      'Total Time': `${r.totalTimeMs.toFixed(1)}ms`,
      'Throughput (req/s)': r.throughputRps.toFixed(1),
      'P50 Latency': `${r.p50Ms.toFixed(2)}ms`,
      'P95 Latency': `${r.p95Ms.toFixed(2)}ms`,
      'P99 Latency': `${r.p99Ms.toFixed(2)}ms`,
    }))
  );

  const allPassed = results.every((r) => r.failedRequests === 0);
  if (allPassed) {
    console.log('\n✅ All API stress testing scenarios passed with 100% success rate!\n');
    process.exit(0);
  } else {
    console.error('\n❌ Some stress scenarios experienced request drop failures.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
