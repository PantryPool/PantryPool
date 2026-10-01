/**
 * PantryPool Performance & Page Load Tracking Engine
 * 
 * Tracks Core Web Vitals (TTFB, FCP, LCP, CLS, INP), React Hydration,
 * API Request Waterfalls, and End-to-End Time-to-Interactive (Dashboard Ready).
 * Stores historical samples locally to measure performance improvements across releases.
 */

import { trackEvent } from './analytics';

export interface PerformanceMetric {
  ttfb: number;
  fcp: number;
  lcp: number;
  cls: number;
  domInteractive: number;
  domComplete: number;
  loadEvent: number;
  authResolveTime?: number;
  dashboardReadyTime?: number;
  timestamp: string;
  isLoggedIn: boolean;
}

export interface ApiTiming {
  id: string;
  url: string;
  method: string;
  durationMs: number;
  status: number;
  success: boolean;
  cached?: boolean;
  sizeBytes?: number;
  serverTiming?: string;
  timestamp: number;
}

export interface PerformanceHistoryEntry {
  id: string;
  timestamp: string;
  metrics: PerformanceMetric;
  apiCount: number;
  totalApiDurationMs: number;
  parallelApiDurationMs: number;
  isLoggedIn: boolean;
}

export interface PerformanceSummary {
  ttfb: number;
  fcp: number;
  lcp: number;
  cls: number;
  domInteractive: number;
  domComplete: number;
  authResolveTime: number | null;
  dashboardReadyTime: number | null;
  totalApiRequests: number;
  totalApiDurationMs: number;
  recentApis: ApiTiming[];
  isLoggedIn: boolean;
  historyCount: number;
  averageDashboardReadyTimeMs?: number;
  improvementVsHistoryMs?: number;
}

const PERF_STORAGE_KEY = 'pantrypool_perf_history';
const MAX_HISTORY_ENTRIES = 20;

// In-Memory State for Current Page Session
const sessionApiTimings: ApiTiming[] = [];
let sessionMetrics: Partial<PerformanceMetric> = {
  cls: 0,
};
let isTrackingInitialized = false;
let dashboardReadyMarked = false;

/**
 * Initializes PerformanceObserver for Web Vitals (FCP, LCP, CLS, Nav Timings).
 */
export function initPerformanceTracking(): void {
  if (typeof window === 'undefined' || isTrackingInitialized) return;
  isTrackingInitialized = true;

  // 1. Navigation & TTFB Timing
  try {
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length > 0) {
      const nav = navEntries[0] as PerformanceNavigationTiming;
      sessionMetrics.ttfb = Math.round(nav.responseStart - nav.requestStart || nav.responseStart);
      sessionMetrics.domInteractive = Math.round(nav.domInteractive);
      sessionMetrics.domComplete = Math.round(nav.domComplete);
      sessionMetrics.loadEvent = Math.round(nav.loadEventEnd || nav.loadEventStart);
    } else if (performance.timing) {
      // Fallback for older Navigation Timing API
      const t = performance.timing;
      sessionMetrics.ttfb = Math.max(0, t.responseStart - t.requestStart);
      sessionMetrics.domInteractive = Math.max(0, t.domInteractive - t.navigationStart);
      sessionMetrics.domComplete = Math.max(0, t.domComplete - t.navigationStart);
      sessionMetrics.loadEvent = Math.max(0, t.loadEventEnd - t.navigationStart);
    }
  } catch (e) {
    // Non-blocking
  }

  // 2. First Contentful Paint (FCP) Observer
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const paintObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            sessionMetrics.fcp = Math.round(entry.startTime);
            paintObserver.disconnect();
          }
        }
      });
      paintObserver.observe({ type: 'paint', buffered: true });
    } catch (e) {}

    // 3. Largest Contentful Paint (LCP) Observer
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          sessionMetrics.lcp = Math.round(lastEntry.startTime);
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}

    // 4. Cumulative Layout Shift (CLS) Observer
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            sessionMetrics.cls = Number(clsValue.toFixed(4));
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}
  }

  // Expose global debug interface
  setupGlobalPerfObject();
}

/**
 * Record timing and metadata for an API fetch request.
 */
export function recordApiTiming(timing: Omit<ApiTiming, 'id' | 'timestamp'>): void {
  const fullTiming: ApiTiming = {
    ...timing,
    id: `api_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    durationMs: Math.round(timing.durationMs),
  };

  sessionApiTimings.push(fullTiming);
  if (sessionApiTimings.length > 100) {
    sessionApiTimings.shift();
  }

  // Log slow API warnings in dev/console (> 500ms)
  if (fullTiming.durationMs > 500 && typeof console !== 'undefined') {
    console.warn(`[⚡ Perf Alert] Slow API call to ${fullTiming.url}: ${fullTiming.durationMs}ms`);
  }
}

/**
 * Mark high-level application milestones (auth_resolved, dashboard_ready, etc.)
 */
export function markAppMilestone(
  milestone: 'auth_resolved' | 'pools_loaded' | 'dashboard_ready' | 'catalog_rendered',
  metadata?: { isLoggedIn?: boolean; activePoolId?: string; itemCount?: number }
): void {
  if (typeof performance === 'undefined') return;

  const nowMs = Math.round(performance.now());

  if (milestone === 'auth_resolved') {
    sessionMetrics.authResolveTime = nowMs;
    sessionMetrics.isLoggedIn = metadata?.isLoggedIn ?? false;
  }

  if (milestone === 'dashboard_ready') {
    if (dashboardReadyMarked) return; // Only record first ready milestone per page load
    dashboardReadyMarked = true;

    sessionMetrics.dashboardReadyTime = nowMs;
    sessionMetrics.isLoggedIn = metadata?.isLoggedIn ?? true;
    sessionMetrics.timestamp = new Date().toISOString();

    // Finalize metrics snapshot
    finalizeSessionMetrics(metadata);
  }
}

/**
 * Finalizes current session metrics, computes summary, prints console report,
 * and saves to localStorage performance history.
 */
function finalizeSessionMetrics(metadata?: { isLoggedIn?: boolean; activePoolId?: string }): void {
  const currentSnapshot: PerformanceMetric = {
    ttfb: sessionMetrics.ttfb || 0,
    fcp: sessionMetrics.fcp || 0,
    lcp: sessionMetrics.lcp || sessionMetrics.fcp || 0,
    cls: sessionMetrics.cls || 0,
    domInteractive: sessionMetrics.domInteractive || 0,
    domComplete: sessionMetrics.domComplete || 0,
    loadEvent: sessionMetrics.loadEvent || 0,
    authResolveTime: sessionMetrics.authResolveTime,
    dashboardReadyTime: sessionMetrics.dashboardReadyTime,
    timestamp: new Date().toISOString(),
    isLoggedIn: metadata?.isLoggedIn ?? (sessionMetrics.isLoggedIn ?? false),
  };

  // Calculate API aggregates
  const totalApiDuration = sessionApiTimings.reduce((sum, a) => sum + a.durationMs, 0);

  // Save history sample
  savePerformanceSample(currentSnapshot, sessionApiTimings.length, totalApiDuration);

  // Report to Analytics if consent granted
  trackEvent('page_performance_v2', {
    ttfb_ms: currentSnapshot.ttfb,
    fcp_ms: currentSnapshot.fcp,
    lcp_ms: currentSnapshot.lcp,
    dashboard_ready_ms: currentSnapshot.dashboardReadyTime || 0,
    auth_resolve_ms: currentSnapshot.authResolveTime || 0,
    api_count: sessionApiTimings.length,
    total_api_ms: totalApiDuration,
    is_logged_in: currentSnapshot.isLoggedIn,
  });

  // Print formatted console summary for easy developer inspection
  printConsolePerfDigest(currentSnapshot, totalApiDuration);
}

/**
 * Saves a performance snapshot to localStorage history.
 */
function savePerformanceSample(metrics: PerformanceMetric, apiCount: number, totalApiDurationMs: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(PERF_STORAGE_KEY);
    const history: PerformanceHistoryEntry[] = raw ? JSON.parse(raw) : [];

    const newEntry: PerformanceHistoryEntry = {
      id: `perf_${Date.now()}`,
      timestamp: new Date().toISOString(),
      metrics,
      apiCount,
      totalApiDurationMs,
      parallelApiDurationMs: metrics.dashboardReadyTime ? metrics.dashboardReadyTime - (metrics.authResolveTime || 0) : 0,
      isLoggedIn: metrics.isLoggedIn,
    };

    history.push(newEntry);
    while (history.length > MAX_HISTORY_ENTRIES) {
      history.shift();
    }

    localStorage.setItem(PERF_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    // Non-blocking localStorage error
  }
}

/**
 * Retrieves past performance history from localStorage.
 */
export function getPerformanceHistory(): PerformanceHistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PERF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clears performance history from localStorage.
 */
export function clearPerformanceHistory(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PERF_STORAGE_KEY);
  } catch {}
}

/**
 * Generates an active performance summary for current session and historical comparisons.
 */
export function getPerformanceSummary(): PerformanceSummary {
  const history = getPerformanceHistory();
  const validHistoryWithReady = history.filter((h) => h.metrics.dashboardReadyTime && h.metrics.dashboardReadyTime > 0);

  let averageDashboardReadyTimeMs: number | undefined;
  let improvementVsHistoryMs: number | undefined;

  if (validHistoryWithReady.length > 1) {
    const previousEntries = validHistoryWithReady.slice(0, validHistoryWithReady.length - 1);
    const sum = previousEntries.reduce((acc, h) => acc + (h.metrics.dashboardReadyTime || 0), 0);
    averageDashboardReadyTimeMs = Math.round(sum / previousEntries.length);

    if (sessionMetrics.dashboardReadyTime && averageDashboardReadyTimeMs) {
      // Positive number means improvement (faster by X ms)
      improvementVsHistoryMs = averageDashboardReadyTimeMs - sessionMetrics.dashboardReadyTime;
    }
  }

  const totalApiDurationMs = sessionApiTimings.reduce((sum, a) => sum + a.durationMs, 0);

  return {
    ttfb: sessionMetrics.ttfb || 0,
    fcp: sessionMetrics.fcp || 0,
    lcp: sessionMetrics.lcp || sessionMetrics.fcp || 0,
    cls: sessionMetrics.cls || 0,
    domInteractive: sessionMetrics.domInteractive || 0,
    domComplete: sessionMetrics.domComplete || 0,
    authResolveTime: sessionMetrics.authResolveTime || null,
    dashboardReadyTime: sessionMetrics.dashboardReadyTime || null,
    totalApiRequests: sessionApiTimings.length,
    totalApiDurationMs,
    recentApis: [...sessionApiTimings],
    isLoggedIn: sessionMetrics.isLoggedIn ?? false,
    historyCount: history.length,
    averageDashboardReadyTimeMs,
    improvementVsHistoryMs,
  };
}

/**
 * Formats and prints a clean diagnostic digest in browser console.
 */
function printConsolePerfDigest(metrics: PerformanceMetric, totalApiMs: number): void {
  if (typeof console === 'undefined') return;

  const readyMs = metrics.dashboardReadyTime || 0;
  const isGood = readyMs > 0 && readyMs < 300;
  const color = isGood ? '#10B981' : readyMs < 600 ? '#F59E0B' : '#EF4444';

  console.groupCollapsed(
    `%c⚡ [PantryPool Perf] Page Ready: ${readyMs}ms | TTFB: ${metrics.ttfb}ms | FCP: ${metrics.fcp}ms | APIs: ${sessionApiTimings.length} (${totalApiMs}ms aggregate)`,
    `color: ${color}; font-weight: bold; font-family: monospace;`
  );

  console.table({
    'Time to First Byte (TTFB)': `${metrics.ttfb}ms`,
    'First Contentful Paint (FCP)': `${metrics.fcp}ms`,
    'Largest Contentful Paint (LCP)': `${metrics.lcp}ms`,
    'Cumulative Layout Shift (CLS)': metrics.cls,
    'Auth Hydration Time': `${metrics.authResolveTime || 0}ms`,
    'Dashboard Ready (TTI)': `${readyMs}ms`,
    'Total API Calls': sessionApiTimings.length,
    'Aggregate API Latency': `${totalApiMs}ms`,
    'Logged In State': metrics.isLoggedIn ? 'Yes (Workspace)' : 'No (Visitor / Landing)',
  });

  if (sessionApiTimings.length > 0) {
    console.log('%cAPI Requests Breakdown:', 'font-weight: bold;');
    console.table(
      sessionApiTimings.map((a) => ({
        URL: a.url,
        Method: a.method,
        'Duration (ms)': a.durationMs,
        Status: a.status,
      }))
    );
  }

  console.log('Type window.__PANTRYPOOL_PERF__.getSummary() for full programmatic metrics.');
  console.groupEnd();
}

/**
 * Exposes a global window object for interactive debugging and test validation.
 */
function setupGlobalPerfObject(): void {
  if (typeof window === 'undefined') return;

  (window as any).__PANTRYPOOL_PERF__ = {
    getSummary: getPerformanceSummary,
    getHistory: getPerformanceHistory,
    clearHistory: clearPerformanceHistory,
    getApiTimings: () => [...sessionApiTimings],
    recordMilestone: markAppMilestone,
    printReport: () => {
      const summary = getPerformanceSummary();
      console.log('=== PANTRYPOOL PERFORMANCE SUMMARY ===', summary);
    },
  };
}
