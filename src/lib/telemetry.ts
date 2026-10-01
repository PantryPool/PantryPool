/**
 * 📡 PantryPool Client Telemetry Engine
 * 
 * Provides resilient, privacy-preserving, first-party operational telemetry
 * that is immune to ad-blockers and operates under legitimate interest (zero cross-site tracking cookies),
 * alongside opt-in third-party analytics (Google Analytics 4) for marketing consent.
 */

import { trackEvent as trackGaEvent, trackPageView, getStoredConsent } from './analytics';
import { isChunkLoadError } from './lazyWithRetry';

export type TelemetryCategory = 'lifecycle' | 'feature' | 'error' | 'funnel' | 'performance';

export interface TelemetryEventPayload {
  event_name: string;
  category: TelemetryCategory;
  session_id?: string;
  user_id?: string | null;
  pool_id?: string | null;
  properties?: Record<string, any>;
  path?: string;
  client_timestamp?: string;
}

const SESSION_STORAGE_KEY = 'pantrypool_telemetry_sid';
const MAX_BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 3000;

class TelemetryEngine {
  private queue: TelemetryEventPayload[] = [];
  private flushTimer: any = null;
  private sessionId: string;
  private currentUserId: string | null = null;
  private currentPoolId: string | null = null;
  private isInitialized = false;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    if (typeof window === 'undefined') return 'server_session';
    try {
      let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!sid) {
        sid = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
      }
      return sid;
    } catch {
      return 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
    }
  }

  /**
   * Initializes global error listeners and visibility flush triggers.
   */
  public init(userId?: string | null, poolId?: string | null): void {
    if (typeof window === 'undefined' || this.isInitialized) return;
    this.isInitialized = true;

    if (userId) this.currentUserId = userId;
    if (poolId) this.currentPoolId = poolId;

    // Listen for page unload/hide to flush any lingering events
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flush(true);
      }
    });

    window.addEventListener('pagehide', () => {
      this.flush(true);
    });

    // Global Unhandled Exception Catcher
    window.addEventListener('error', (event) => {
      const err = event.error || event.message;
      if (isChunkLoadError(err)) return; // Suppress normal post-deployment chunk skew

      this.trackError('unhandled_js_error', err, {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    // Global Unhandled Promise Rejection Catcher
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      if (isChunkLoadError(reason)) return; // Suppress normal post-deployment chunk skew

      this.trackError('unhandled_promise_rejection', reason, {
        reason: typeof reason === 'object' ? (reason?.message || 'Unknown Promise Rejection') : String(reason),
      });
    });

    // Periodic flush timer
    this.scheduleFlush();
  }

  public setContext(userId?: string | null, poolId?: string | null): void {
    if (userId !== undefined) this.currentUserId = userId;
    if (poolId !== undefined) this.currentPoolId = poolId;
  }

  /**
   * Core telemetry event dispatcher.
   */
  public track(
    eventName: string,
    properties: Record<string, any> = {},
    category: TelemetryCategory = 'feature'
  ): void {
    const payload: TelemetryEventPayload = {
      event_name: eventName,
      category,
      session_id: this.sessionId,
      user_id: this.currentUserId,
      pool_id: this.currentPoolId,
      properties,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      client_timestamp: new Date().toISOString(),
    };

    // Forward to Google Analytics unless explicitly opted out
    trackGaEvent(eventName, properties);

    // Always enqueue for first-party operational telemetry
    this.queue.push(payload);

    if (this.queue.length >= MAX_BATCH_SIZE) {
      this.flush(false);
    } else {
      this.scheduleFlush();
    }
  }

  /**
   * Convenience helpers for specific event types.
   */
  public trackFeature(featureName: string, properties: Record<string, any> = {}): void {
    this.track(featureName, properties, 'feature');
  }

  public trackFunnel(funnelName: string, stepName: string, stepIndex = 1, properties: Record<string, any> = {}): void {
    this.track(`${funnelName}_${stepName}`, { funnel: funnelName, step: stepName, step_index: stepIndex, ...properties }, 'funnel');
  }

  public trackRoadblock(roadblockName: string, properties: Record<string, any> = {}): void {
    this.track(`roadblock_${roadblockName}`, { roadblock: roadblockName, ...properties }, 'error');
  }

  public trackError(errorName: string, error?: any, properties: Record<string, any> = {}): void {
    const errMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Unknown error');
    const errStack = error instanceof Error ? error.stack?.slice(0, 500) : undefined;
    this.track(`error_${errorName}`, {
      error_name: errorName,
      error_message: errMessage,
      error_stack: errStack,
      ...properties,
    }, 'error');
  }

  public trackView(viewName: string, path?: string, properties: Record<string, any> = {}): void {
    const computedPath = path || `/${viewName}`;
    const pageTitle = properties.title || `PantryPool — ${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`;
    trackPageView(pageTitle, computedPath);
    this.track(`view_${viewName}`, { view_name: viewName, path: computedPath, ...properties }, 'lifecycle');
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush(false);
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Flushes enqueued events to /api/telemetry/events.
   */
  public flush(isBeacon = false): void {
    if (this.queue.length === 0) return;
    const batch = [...this.queue];
    this.queue = [];

    if (typeof window === 'undefined') return;

    const payloadString = JSON.stringify({ events: batch });

    if (isBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payloadString], { type: 'application/json' });
      const sent = navigator.sendBeacon('/api/telemetry/events', blob);
      if (sent) return;
    }

    // Fallback standard fetch with keepalive
    fetch('/api/telemetry/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadString,
      keepalive: true,
    }).catch(() => {
      // Re-queue up to 20 failed events for retry
      if (this.queue.length < 20) {
        this.queue.unshift(...batch);
      }
    });
  }
}

// Global Singleton Instance
export const telemetry = new TelemetryEngine();
