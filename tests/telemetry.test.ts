import { describe, it, expect, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { StorageAdapter, StorageTelemetryEvent, TelemetryStats } from '../src/server/storage/types';
import { createUniversalToken } from '../src/server/api/authUtils';

class MockTelemetryStorage implements Partial<StorageAdapter> {
  events: StorageTelemetryEvent[] = [];
  users: Map<string, any> = new Map();

  async getUserById(id: string) {
    return this.users.get(id) || null;
  }

  async recordTelemetryEvents(incoming: StorageTelemetryEvent[]): Promise<void> {
    this.events.push(...incoming);
  }

  async getTelemetryStats(days = 7): Promise<TelemetryStats> {
    const features = this.events.filter((e) => e.category === 'feature');
    const errors = this.events.filter((e) => e.category === 'error');
    const funnels = this.events.filter((e) => e.category === 'funnel');

    const topFeaturesMap = new Map<string, number>();
    for (const f of features) {
      topFeaturesMap.set(f.event_name, (topFeaturesMap.get(f.event_name) || 0) + 1);
    }

    return {
      periodDays: days,
      totalEvents: this.events.length,
      topFeatures: Array.from(topFeaturesMap.entries()).map(([event_name, count]) => ({ event_name, count })),
      errorSummary: errors.map((e) => ({ event_name: e.event_name, count: 1, last_seen: e.created_at || '' })),
      funnelBreakdown: funnels.map((f) => ({ event_name: f.event_name, count: 1 })),
      activityByDay: [{ day: '2026-09-04', count: this.events.length }],
      recentEvents: this.events.slice(-50),
    };
  }

  async getPlatformStats() {
    return { totalUsers: 1, totalPools: 1, totalTransactions: 1, totalVolume: 10 };
  }
}

describe('📡 First-Party Telemetry Pipeline', () => {
  const secret = 'telemetry-test-secret-key-12345';
  let storage: MockTelemetryStorage;
  let app: any;

  beforeEach(() => {
    storage = new MockTelemetryStorage();
    storage.users.set('u_admin', {
      id: 'u_admin',
      email: 'admin@pantrypool.com',
      name: 'Admin Tester',
      system_role: 'superadmin',
      token_version: 1,
    });
    storage.users.set('u_regular', {
      id: 'u_regular',
      email: 'user@pantrypool.com',
      name: 'Regular User',
      system_role: 'user',
      token_version: 1,
    });
    app = createUniversalApi(storage as any, secret);
  });

  it('ingests a single telemetry event via POST /api/telemetry/events', async () => {
    const res = await app.request('/api/telemetry/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: 'item_consumed',
        category: 'feature',
        session_id: 'sid_test_123',
        properties: { item_id: 'item_coffee', method: 'kiosk' },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.recorded).toBe(1);

    expect(storage.events.length).toBe(1);
    expect(storage.events[0].event_name).toBe('item_consumed');
    expect(storage.events[0].category).toBe('feature');
    expect(storage.events[0].session_id).toBe('sid_test_123');
    expect(storage.events[0].properties_json).toContain('"method":"kiosk"');
  });

  it('ingests a batch of telemetry events in a single payload', async () => {
    const res = await app.request('/api/telemetry/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { event_name: 'receipt_scan_started', category: 'feature' },
          { event_name: 'receipt_scan_completed', category: 'feature', properties: { count: 5 } },
          { event_name: 'roadblock_item_out_of_stock', category: 'error', properties: { item: 'Cold Brew' } },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.recorded).toBe(3);
    expect(storage.events.length).toBe(3);
  });

  it('sanitizes and strips sensitive security properties (passwords, tokens)', async () => {
    await app.request('/api/telemetry/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: 'user_action',
        properties: {
          public_info: 'safe_value',
          password: 'my_secret_password_123',
          token: 'bearer_secret_token',
          api_key: 'sk_live_12345',
        },
      }),
    });

    expect(storage.events.length).toBe(1);
    const props = JSON.parse(storage.events[0].properties_json || '{}');
    expect(props.public_info).toBe('safe_value');
    expect(props.password).toBeUndefined();
    expect(props.token).toBeUndefined();
    expect(props.api_key).toBeUndefined();
  });

  it('normalizes invalid or unknown categories to "feature"', async () => {
    await app.request('/api/telemetry/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: 'custom_action',
        category: 'malicious_or_unknown_category',
      }),
    });

    expect(storage.events.length).toBe(1);
    expect(storage.events[0].category).toBe('feature');
  });

  it('blocks unauthenticated access to GET /api/admin/telemetry/stats', async () => {
    const res = await app.request('/api/admin/telemetry/stats');
    expect(res.status).toBe(401);
  });

  it('blocks non-admin users from GET /api/admin/telemetry/stats', async () => {
    const userToken = await createUniversalToken({ userId: 'u_regular', email: 'user@pantrypool.com', name: 'Regular User', systemRole: 'user', tokenVersion: 1 }, secret);
    const res = await app.request('/api/admin/telemetry/stats', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('allows superadmin to retrieve telemetry stats and aggregations', async () => {
    // Seed some events first
    storage.events.push(
      { id: '1', event_name: 'item_consumed', category: 'feature' },
      { id: '2', event_name: 'item_consumed', category: 'feature' },
      { id: '3', event_name: 'roadblock_barcode_miss', category: 'error' },
      { id: '4', event_name: 'onboarding_pool_created', category: 'funnel' }
    );

    const adminToken = await createUniversalToken({ userId: 'u_admin', email: 'admin@pantrypool.com', name: 'Admin Tester', systemRole: 'superadmin', tokenVersion: 1 }, secret);
    const res = await app.request('/api/admin/telemetry/stats?days=7', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.stats.totalEvents).toBe(4);
    expect(body.stats.topFeatures.find((f: any) => f.event_name === 'item_consumed')?.count).toBe(2);
    expect(body.stats.errorSummary.length).toBe(1);
    expect(body.stats.funnelBreakdown.length).toBe(1);
  });
});
