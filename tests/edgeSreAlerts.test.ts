import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { dispatchEdgeErrorAlert } from '../src/server/api/sreAlerts';

describe('Edge SRE Error Alerting & Webhook Suite', () => {
  let originalFetch: typeof global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    originalFetch = global.fetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.SRE_ALERT_WEBHOOK_URL;
    delete process.env.ALERT_WEBHOOK_URL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'SRE_ALERT_WEBHOOK_URL', 'ALERT_WEBHOOK_URL']) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
    vi.restoreAllMocks();
  });

  it('dispatches HTML-formatted alert to Telegram when token and chat ID are configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock;

    const mockCtx: any = {
      env: {
        TELEGRAM_BOT_TOKEN: 'mock_bot_token_123',
        TELEGRAM_CHAT_ID: '987654321'
      },
      req: {
        method: 'POST',
        url: 'https://pantrypool.com/api/stripe/webhook',
        path: '/api/stripe/webhook'
      },
      executionCtx: {
        waitUntil: vi.fn((p) => p)
      }
    };

    dispatchEdgeErrorAlert(mockCtx, {
      level: 'critical',
      error: new Error('Simulated D1 transaction failure'),
      source: 'stripe_webhook',
      context: { subscriptionId: 'sub_123' }
    });

    // Wait for microtasks
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('https://api.telegram.org/botmock_bot_token_123/sendMessage');
    expect(options.method).toBe('POST');
    
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe('987654321');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('[PantryPool Edge SRE Alert]');
    expect(body.text).toContain('CRITICAL');
    expect(body.text).toContain('POST /api/stripe/webhook');
    expect(body.text).toContain('Simulated D1 transaction failure');
    expect(body.text).toContain('sub_123');
    expect(mockCtx.executionCtx.waitUntil).toHaveBeenCalled();
  });

  it('dispatches to webhook URL when SRE_ALERT_WEBHOOK_URL is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchMock;

    const mockCtx: any = {
      env: {
        SRE_ALERT_WEBHOOK_URL: 'https://hooks.slack.com/services/mock/alert'
      },
      req: {
        method: 'GET',
        url: 'https://pantrypool.com/api/test-route'
      }
    };

    dispatchEdgeErrorAlert(mockCtx, {
      level: 'warning',
      error: 'High latency detected on item lookup'
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/services/mock/alert');
    const body = JSON.parse(options.body);
    expect(body.text).toContain('[PantryPool Edge SRE] WARNING');
    expect(body.text).toContain('High latency detected');
  });

  it('global app.onError dispatches SRE alert on uncaught 500 error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock;

    const mockStorage: any = {
      getPlatformStats: vi.fn().mockRejectedValue(new Error('Fatal database disk error'))
    };

    const app = createUniversalApi(mockStorage, 'test-secret');

    // Add a deliberately failing route
    app.get('/api/test-crash', () => {
      throw new Error('Uncaught catastrophic worker error');
    });

    const res = await app.request('/api/test-crash', {
      method: 'GET'
    }, {
      TELEGRAM_BOT_TOKEN: 'token_crash',
      TELEGRAM_CHAT_ID: 'chat_crash'
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Uncaught catastrophic worker error');

    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('Uncaught catastrophic worker error');
    expect(body.text).toContain('/api/test-crash');
  });
});
