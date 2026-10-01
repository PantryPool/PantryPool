import { describe, it, expect, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { InMemoryStorageAdapter } from '../src/server/storage/inMemoryAdapter';
import { createUniversalToken } from '../src/server/api/authUtils';
import { computeWeeklyDigestMetrics, dispatchWeeklyDigestForPool, dispatchWeeklyDigestsAllPools } from '../src/server/services/digestService';
import { isWeeklyDigestEligible, normalizeTier } from '../src/server/api/tierLimits';

describe('📊 Weekly Email Summary Digest & Tier Gating Suite', () => {
  const JWT_SECRET = 'test-jwt-secret-digest-2026';
  let storage: InMemoryStorageAdapter;
  let app: ReturnType<typeof createUniversalApi>;
  let userToken: string;
  let superadminToken: string;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    app = createUniversalApi(storage, JWT_SECRET);

    // Setup standard user
    await storage.createUser({
      id: 'u_member_1',
      email: 'member@example.com',
      name: 'Alice Member',
      system_role: 'user',
      token_version: 1,
    });

    // Setup superadmin user
    await storage.createUser({
      id: 'u_superadmin',
      email: 'admin@pantrypool.com',
      name: 'Super Admin',
      system_role: 'superadmin',
      token_version: 1,
    });

    userToken = await createUniversalToken(
      { userId: 'u_member_1', email: 'member@example.com', name: 'Alice Member', systemRole: 'user', tokenVersion: 1 },
      JWT_SECRET
    );

    superadminToken = await createUniversalToken(
      { userId: 'u_superadmin', email: 'admin@pantrypool.com', name: 'Super Admin', systemRole: 'superadmin', tokenVersion: 1 },
      JWT_SECRET
    );
  });

  describe('1. Tier Eligibility Helper', () => {
    it('accurately identifies digest eligibility across tiers', () => {
      expect(isWeeklyDigestEligible('community')).toBe(false);
      expect(isWeeklyDigestEligible('standard')).toBe(false);
      expect(isWeeklyDigestEligible('pro')).toBe(false);
      expect(isWeeklyDigestEligible('starter')).toBe(false);
      expect(isWeeklyDigestEligible(undefined)).toBe(false);

      expect(isWeeklyDigestEligible('plus')).toBe(true);
      expect(isWeeklyDigestEligible('Hosted Plus')).toBe(true);
      expect(isWeeklyDigestEligible('enterprise')).toBe(true);
      expect(isWeeklyDigestEligible('ENTERPRISE')).toBe(true);
    });
  });

  describe('2. Data Aggregation & Metrics Calculation', () => {
    it('aggregates consumption, restocks, member deficits, and low stock items', async () => {
      // 1. Create Plus Org & Pool
      await storage.createOrg({
        id: 'org_plus',
        name: 'Acme Plus',
        owner_id: 'u_member_1',
        tier: 'plus',
      });

      const pool = await storage.createPool({
        id: 'pool_plus',
        name: 'Engineering Pantry',
        organization_id: 'org_plus',
        currency: '$',
      });

      // 2. Add Pool Members with balances
      await storage.upsertPoolMember({
        id: 'pm1',
        pool_id: pool.id,
        user_id: 'u_member_1',
        role: 'member',
        balance: 15.0,
        balance_cents: 1500,
      });

      await storage.upsertPoolMember({
        id: 'pm2',
        pool_id: pool.id,
        user_id: 'u_member_2',
        role: 'member',
        balance: -6.5,
        balance_cents: -650, // Deficit!
      });

      // 3. Add Items (one low stock, one healthy)
      await storage.saveItem({
        id: 'item_coldbrew',
        pool_id: pool.id,
        name: 'Cold Brew Can',
        stock: 2,
        min_stock: 5, // Low stock!
        cost_per_unit: 3.0,
        cost_per_unit_cents: 300,
        unit_name: 'can',
      });

      await storage.saveItem({
        id: 'item_almonds',
        pool_id: pool.id,
        name: 'Roasted Almonds',
        stock: 20,
        min_stock: 5,
        cost_per_unit: 1.5,
        cost_per_unit_cents: 150,
        unit_name: 'bag',
      });

      // 4. Add Transactions (consumption & restock within last 7 days)
      const nowIso = new Date().toISOString();
      await storage.createTransaction({
        id: 'tx_c1',
        pool_id: pool.id,
        user_id: 'u_member_1',
        item_id: 'item_coldbrew',
        item_name: 'Cold Brew Can',
        type: 'consume',
        amount: 3.0,
        amount_cents: 300,
        quantity: 2,
        created_at: nowIso,
      });

      await storage.createTransaction({
        id: 'tx_c2',
        pool_id: pool.id,
        user_id: 'u_member_2',
        item_id: 'item_almonds',
        item_name: 'Roasted Almonds',
        type: 'consume',
        amount: 1.5,
        amount_cents: 150,
        quantity: 1,
        created_at: nowIso,
      });

      await storage.createTransaction({
        id: 'tx_r1',
        pool_id: pool.id,
        user_id: 'u_member_1',
        type: 'deposit',
        amount: 25.0,
        amount_cents: 2500,
        quantity: 1,
        created_at: nowIso,
      });

      // 5. Compute Metrics
      const metrics = await computeWeeklyDigestMetrics(pool.id, storage);
      expect(metrics).not.toBeNull();
      expect(metrics?.poolName).toBe('Engineering Pantry');
      expect(metrics?.isEligible).toBe(true);
      expect(metrics?.orgTier).toBe('plus');

      // Consumption verification
      expect(metrics?.totalConsumedUnits).toBe(3); // 2 cold brew + 1 almonds
      expect(metrics?.totalConsumedCents).toBe(450); // $4.50
      expect(metrics?.topConsumedItems.length).toBe(2);
      expect(metrics?.topConsumedItems[0].name).toBe('Cold Brew Can');

      // Restocks verification
      expect(metrics?.totalRestockEvents).toBe(1);
      expect(metrics?.totalRestockedCents).toBe(2500); // $25.00

      // Member deficit verification
      expect(metrics?.totalMembers).toBe(2);
      expect(metrics?.membersInDeficitCount).toBe(1);
      expect(metrics?.totalDeficitCents).toBe(650); // $6.50

      // Low stock verification
      expect(metrics?.lowStockItems.length).toBe(1);
      expect(metrics?.lowStockItems[0].name).toBe('Cold Brew Can');
      expect(metrics?.summaryText).toContain('3 items consumed');
      expect(metrics?.summaryText).toContain('$4.50');
      expect(metrics?.summaryText).toContain('1 member(s) in deficit ($6.50 total)');
    });
  });

  describe('3. Route-Level Tier Gating (POST /api/notifications/trigger-weekly-digest)', () => {
    it('rejects trigger with 403 and upgrade prompt when pool is on Community tier', async () => {
      // Community pool (no org or community org)
      const pool = await storage.createPool({
        id: 'pool_free',
        name: 'Free Community Pool',
      });

      const res = await app.request('/api/notifications/trigger-weekly-digest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ poolId: pool.id }),
      });

      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.requiresUpgrade).toBe(true);
      expect(json.requiredTier).toBe('plus');
      expect(json.error).toContain('Hosted Plus');
    });

    it('rejects trigger with 403 when pool belongs to Hosted Standard tier', async () => {
      await storage.createOrg({
        id: 'org_standard',
        name: 'Standard Org',
        owner_id: 'u_member_1',
        tier: 'standard',
      });

      const pool = await storage.createPool({
        id: 'pool_standard',
        name: 'Standard Breakroom',
        organization_id: 'org_standard',
      });

      const res = await app.request('/api/notifications/trigger-weekly-digest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ poolId: pool.id }),
      });

      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.success).toBe(false);
      expect(json.requiresUpgrade).toBe(true);
      expect(json.requiredTier).toBe('plus');
    });

    it('succeeds with 200 when pool belongs to Hosted Plus tier', async () => {
      await storage.createOrg({
        id: 'org_plus_2',
        name: 'Plus Org',
        owner_id: 'u_member_1',
        tier: 'plus',
      });

      const pool = await storage.createPool({
        id: 'pool_plus_2',
        name: 'Plus Breakroom',
        organization_id: 'org_plus_2',
      });

      await storage.upsertPoolMember({
        id: 'pm_plus_1',
        pool_id: pool.id,
        user_id: 'u_member_1',
        role: 'member',
        balance: 10,
        balance_cents: 1000,
      });

      const res = await app.request('/api/notifications/trigger-weekly-digest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ poolId: pool.id }),
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain('Plus Breakroom');
      expect(json.digest).toBeDefined();
      expect(json.metrics).toBeDefined();
    });

    it('allows superadmin to trigger digest regardless of pool tier', async () => {
      const freePool = await storage.createPool({
        id: 'pool_free_superadmin',
        name: 'Admin Tested Free Pool',
      });

      const res = await app.request('/api/notifications/trigger-weekly-digest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superadminToken}`,
        },
        body: JSON.stringify({ poolId: freePool.id }),
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe('4. Notification Preferences Persistence in Storage', () => {
    it('retrieves default preferences and saves updated preferences to storage', async () => {
      // 1. Initial GET returns defaults
      const getRes = await app.request('/api/notifications/preferences?userId=u_member_1', {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(getRes.status).toBe(200);
      const getJson: any = await getRes.json();
      expect(getJson.preferences.weeklyDigestEmail).toBe(true);

      // 2. POST updates preferences
      const postRes = await app.request('/api/notifications/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          userId: 'u_member_1',
          weeklyDigestEmail: false,
          lowStockEmail: true,
          lowStockSms: true,
          phoneNumber: '+15551234567',
        }),
      });

      expect(postRes.status).toBe(200);
      const postJson: any = await postRes.json();
      expect(postJson.preferences.weeklyDigestEmail).toBe(false);
      expect(postJson.preferences.phoneNumber).toBe('+15551234567');

      // 3. Verify in-storage persistence
      const savedInDb = await storage.getNotificationPreferences('u_member_1');
      expect(savedInDb).not.toBeNull();
      expect(savedInDb?.weekly_digest_email).toBe(false);
      expect(savedInDb?.phone_number).toBe('+15551234567');
    });
  });

  describe('5. Internal Cron Digest Endpoint (POST /api/internal/dispatch-weekly-digest)', () => {
    it('rejects unauthenticated requests without valid cron secret with 401', async () => {
      const res = await app.request('/api/internal/dispatch-weekly-digest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': 'invalid-secret',
        },
      });

      expect(res.status).toBe(401);
    });

    it('processes sweep successfully when authenticated with valid CRON_SECRET', async () => {
      // We set CRON_SECRET on process.env for the test
      process.env.CRON_SECRET = 'secret-cron-key-test-2026';

      // Setup 1 free pool (should be skipped) and 1 plus pool (should be processed)
      await storage.createPool({ id: 'p_free_skip', name: 'Free Pool' });

      await storage.createOrg({ id: 'org_sweep_plus', name: 'Plus Co', owner_id: 'u_member_1', tier: 'plus' });
      await storage.createPool({ id: 'p_plus_process', name: 'Plus Pool', organization_id: 'org_sweep_plus' });

      const res = await app.request('/api/internal/dispatch-weekly-digest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': 'secret-cron-key-test-2026',
        },
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.summary.totalPoolsChecked).toBe(2);
      expect(json.summary.eligiblePoolsCount).toBe(1);
      expect(json.summary.skippedTierCount).toBe(1);
    });
  });
});
