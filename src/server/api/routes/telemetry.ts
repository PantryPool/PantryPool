import { Hono } from 'hono';
import { HonoEnv } from '../app';
import { StorageTelemetryEvent } from '../../storage/types';

const ALLOWED_CATEGORIES = new Set(['lifecycle', 'feature', 'error', 'funnel', 'performance']);
const SENSITIVE_KEY_RE = /(password|token|secret|auth|bearer|credit_card|cvv|api_key)/i;

/**
 * Sanitizes and strips sensitive properties before persistence.
 */
function sanitizeProperties(props: any): string | null {
  if (!props || typeof props !== 'object') return null;
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(props)) {
    if (SENSITIVE_KEY_RE.test(key)) continue;
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = JSON.stringify(value).slice(0, 300);
    } else {
      sanitized[key] = typeof value === 'string' ? value.slice(0, 500) : value;
    }
  }
  const serialized = JSON.stringify(sanitized);
  return serialized.length > 2048 ? serialized.slice(0, 2048) : serialized;
}

export function registerTelemetryRoutes(app: Hono<HonoEnv>) {
  // 1. Ingestion Endpoint: POST /api/telemetry/events
  const handleEventIngestion = async (c: any) => {
    const storage = c.get('storage');
    const authUser = c.get('user');

    if (!storage) {
      return c.json({ success: false, error: 'Storage unavailable' }, 503);
    }

    let payload: any = null;
    const contentType = c.req.header('content-type') || '';
    try {
      if (contentType.includes('application/json')) {
        payload = await c.req.json();
      } else {
        const rawText = await c.req.text();
        payload = rawText ? JSON.parse(rawText) : {};
      }
    } catch {
      return c.json({ success: false, error: 'Invalid JSON payload' }, 400);
    }

    const rawEvents: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.events)
        ? payload.events
        : [payload];

    if (rawEvents.length === 0 || !rawEvents[0] || typeof rawEvents[0] !== 'object') {
      return c.json({ success: false, error: 'No valid events provided' }, 400);
    }

    // Limit maximum batch size to 50 events per request
    const batch = rawEvents.slice(0, 50);
    const validEvents: StorageTelemetryEvent[] = [];

    for (const item of batch) {
      const eventName = String(item?.event_name || item?.eventName || '').trim().slice(0, 80);
      if (!eventName) continue;

      let category = String(item?.category || 'feature').toLowerCase();
      if (!ALLOWED_CATEGORIES.has(category)) {
        category = 'feature';
      }

      const rawProps = item?.properties || item?.properties_json;
      const propertiesJson = typeof rawProps === 'string'
        ? rawProps.slice(0, 2048)
        : sanitizeProperties(rawProps);

      validEvents.push({
        id: 'te_' + crypto.randomUUID(),
        event_name: eventName,
        category: category as any,
        session_id: item?.session_id || item?.sessionId ? String(item?.session_id || item?.sessionId).slice(0, 64) : null,
        user_id: authUser?.userId || (item?.user_id ? String(item.user_id).slice(0, 64) : null),
        pool_id: item?.pool_id ? String(item.pool_id).slice(0, 64) : null,
        properties_json: propertiesJson,
        path: item?.path ? String(item.path).slice(0, 200) : null,
        client_timestamp: item?.client_timestamp || item?.timestamp || new Date().toISOString(),
      });
    }

    if (validEvents.length > 0) {
      await storage.recordTelemetryEvents(validEvents);
    }

    c.header('Cache-Control', 'no-store, no-cache');
    return c.json({ success: true, recorded: validEvents.length }, 200);
  };

  app.post('/api/telemetry/events', handleEventIngestion);
  app.post('/api/telemetry', handleEventIngestion);

  // 2. Admin Telemetry & Insights Stats: GET /api/admin/telemetry/stats
  app.get('/api/admin/telemetry/stats', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');

    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }
    if (user.systemRole !== 'superadmin' && user.systemRole !== 'admin') {
      return c.json({ success: false, error: 'Superadmin permissions required' }, 403);
    }

    const daysQuery = parseInt(c.req.query('days') || '7', 10);
    const days = isNaN(daysQuery) ? 7 : Math.max(1, Math.min(daysQuery, 90));

    const stats = await storage.getTelemetryStats(days);
    return c.json({
      success: true,
      stats,
    });
  });
}
