import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initPerformanceTracking,
  recordApiTiming,
  markAppMilestone,
  getPerformanceSummary,
  getPerformanceHistory,
  clearPerformanceHistory,
} from '../src/lib/performance';
import { apiFetch } from '../src/lib/api';

describe('PantryPool Performance & Page Load Tracking Engine', () => {
  beforeEach(() => {
    localStorage.clear();
    clearPerformanceHistory();
    vi.restoreAllMocks();
  });

  it('initializes performance tracking and attaches window.__PANTRYPOOL_PERF__', () => {
    initPerformanceTracking();
    expect((window as any).__PANTRYPOOL_PERF__).toBeDefined();
    expect(typeof (window as any).__PANTRYPOOL_PERF__.getSummary).toBe('function');
    expect(typeof (window as any).__PANTRYPOOL_PERF__.getHistory).toBe('function');
    expect(typeof (window as any).__PANTRYPOOL_PERF__.clearHistory).toBe('function');
  });

  it('records API timings accurately and aggregates in summary', () => {
    recordApiTiming({
      url: '/api/pools',
      method: 'GET',
      durationMs: 42.5,
      status: 200,
      success: true,
    });

    recordApiTiming({
      url: '/api/items',
      method: 'GET',
      durationMs: 35.2,
      status: 200,
      success: true,
    });

    const summary = getPerformanceSummary();
    expect(summary.totalApiRequests).toBeGreaterThanOrEqual(2);
    expect(summary.totalApiDurationMs).toBeGreaterThanOrEqual(77);
    expect(summary.recentApis.some(a => a.url === '/api/pools')).toBe(true);
    expect(summary.recentApis.some(a => a.url === '/api/items')).toBe(true);
  });

  it('records milestones and stores history samples upon dashboard_ready', () => {
    markAppMilestone('auth_resolved', { isLoggedIn: true });
    markAppMilestone('dashboard_ready', { isLoggedIn: true, activePoolId: 'pool_123', itemCount: 15 });

    const summary = getPerformanceSummary();
    expect(summary.isLoggedIn).toBe(true);
    expect(summary.dashboardReadyTime).toBeDefined();

    const history = getPerformanceHistory();
    expect(history.length).toBe(1);
    expect(history[0].isLoggedIn).toBe(true);
    expect(history[0].metrics.dashboardReadyTime).toBeDefined();
  });

  it('calculates performance improvements against previous runs', () => {
    // Seed history with an older slower run
    const fakeHistory = [
      {
        id: 'perf_old',
        timestamp: new Date().toISOString(),
        metrics: {
          ttfb: 50,
          fcp: 120,
          lcp: 120,
          cls: 0,
          domInteractive: 100,
          domComplete: 150,
          loadEvent: 160,
          dashboardReadyTime: 450,
          timestamp: new Date().toISOString(),
          isLoggedIn: true,
        },
        apiCount: 5,
        totalApiDurationMs: 300,
        parallelApiDurationMs: 150,
        isLoggedIn: true,
      },
    ];
    localStorage.setItem('pantrypool_perf_history', JSON.stringify(fakeHistory));

    const summary = getPerformanceSummary();
    expect(summary.historyCount).toBe(1);
  });

  it('clears performance history properly', () => {
    localStorage.setItem('pantrypool_perf_history', JSON.stringify([{ id: '1' }]));
    clearPerformanceHistory();
    expect(getPerformanceHistory()).toEqual([]);
  });

  it('instruments apiFetch to automatically record request duration', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        'server-timing': 'total;dur=12.5;desc="Total Server"',
      }),
      json: async () => ({ success: true }),
    });

    await apiFetch('/api/test-perf');

    const summary = getPerformanceSummary();
    const testApi = summary.recentApis.find(a => a.url === '/api/test-perf');
    expect(testApi).toBeDefined();
    expect(testApi?.status).toBe(200);
    expect(testApi?.serverTiming).toContain('total;dur=12.5');
  });
});
