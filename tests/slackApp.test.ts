import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';
import {
  formatSlackBlockKitPayload,
  formatSlackRestockPayload,
  formatSlackSettlementDigestPayload,
  verifySlackHmacSignature,
  verifyStripeHmacSignature
} from '../src/lib/webhooks';

describe('💬 Slack App & Webhook Verification (Phase 31 P1)', () => {
  const sampleItem = {
    id: 'item-101',
    name: 'Nitro Cold Brew Can',
    category: 'Beverages',
    stock: 2,
    minStock: 5,
    costPerUnit: 3.50,
    poolId: 'pool-main'
  };

  it('generates schema-valid Slack Block Kit low-stock card', () => {
    const payload = formatSlackBlockKitPayload(sampleItem, 'Engineering Pantry');
    expect(payload.blocks).toBeDefined();
    expect(payload.blocks.length).toBeGreaterThanOrEqual(3);

    const header = payload.blocks[0];
    expect(header.type).toBe('header');
    expect((header as any).text.text).toContain('Nitro Cold Brew Can');

    const actions = payload.blocks.find((b: any) => b.type === 'actions');
    expect(actions).toBeDefined();
    expect((actions as any).elements.length).toBe(2);
  });

  it('generates schema-valid Slack restock announcement card', () => {
    const payload = formatSlackRestockPayload('Oat Milk', 6, 'Alex R.', 'Floor 3 Kitchen');
    expect(payload.blocks).toBeDefined();
    expect(payload.blocks[0].type).toBe('header');
    expect((payload.blocks[0] as any).text.text).toContain('Oat Milk');
    expect((payload.blocks[1] as any).text.text).toContain('Alex R.');
    expect((payload.blocks[1] as any).text.text).toContain('+6');
  });

  it('generates Friday balance digest payload', () => {
    const negativeMembers = [
      { name: 'Sarah C.', balance: -15.00 },
      { name: 'David K.', balance: -8.50 }
    ];
    const payload = formatSlackSettlementDigestPayload('Design Studio', negativeMembers);
    expect(payload.blocks).toBeDefined();
    expect((payload.blocks[0] as any).text.text).toContain('Friday Breakroom Balance Digest');
    expect((payload.blocks[2] as any).text.text).toContain('-$15.00');
  });

  it('verifies valid and invalid Slack HMAC signatures', async () => {
    const secret = 'slack_secret_test_123';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = 'command=%2Fpantry&text=stock&user_name=Sarah';

    // Compute expected signature
    const sigBasestring = `v0:${timestamp}:${rawBody}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(sigBasestring));
    const validSignature = 'v0=' + Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const isMatch = await verifySlackHmacSignature(rawBody, validSignature, timestamp, secret);
    expect(isMatch).toBe(true);

    const isInvalidMatch = await verifySlackHmacSignature(rawBody, 'v0=invalid_sig', timestamp, secret);
    expect(isInvalidMatch).toBe(false);

    // Stale timestamp (>300s)
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 400);
    const isStaleMatch = await verifySlackHmacSignature(rawBody, validSignature, staleTimestamp, secret);
    expect(isStaleMatch).toBe(false);
  });

  it('verifies valid and invalid Stripe Webhook HMAC signatures', async () => {
    const secret = 'whsec_test_secret_abc';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_123' } } });

    const signedPayload = `${timestamp}.${rawBody}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
    const validSigHex = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const sigHeader = `t=${timestamp},v1=${validSigHex}`;

    const isMatch = await verifyStripeHmacSignature(rawBody, sigHeader, secret);
    expect(isMatch).toBe(true);

    const isInvalid = await verifyStripeHmacSignature(rawBody, `t=${timestamp},v1=wrong_hex`, secret);
    expect(isInvalid).toBe(false);
  });

  it('serves POST /api/slack/commands with /pantry subcommands on edge', async () => {
    const mockDb = {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({
          all: async () => ({
            results: [
              { id: 'i1', name: 'Cold Brew', stock: 4, cost_per_unit: 3.50, category: 'Coffee' },
              { id: 'i2', name: 'Kind Bar', stock: 10, cost_per_unit: 1.50, category: 'Snacks' }
            ]
          }),
          first: async () => ({
            id: 'i1', name: 'Cold Brew', stock: 4, cost_per_unit: 3.50, category: 'Coffee', pool_id: 'pool1'
          }),
          run: async () => ({ success: true })
        }),
        all: async () => ({
          results: [
            { id: 'i1', name: 'Cold Brew', stock: 4, cost_per_unit: 3.50, category: 'Coffee' }
          ]
        }),
        first: async () => ({ id: 'i1', name: 'Cold Brew', stock: 4, cost_per_unit: 3.50, pool_id: 'pool1' }),
        run: async () => ({ success: true })
      })
    };

    const mockEnv: any = { pantrypool_db: mockDb };

    // 1. /pantry stock
    const stockReq = new Request('https://pantrypool.com/api/slack/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'command=%2Fpantry&text=stock&user_name=Sarah'
    });
    const stockRes = await onRequest({ request: stockReq, env: mockEnv, params: {} } as any);
    expect(stockRes.status).toBe(200);
    const stockData = await stockRes.json();
    expect(stockData.blocks).toBeDefined();

    // 2. /pantry grab
    const grabReq = new Request('https://pantrypool.com/api/slack/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'command=%2Fpantry&text=grab+cold+brew&user_name=Sarah'
    });
    const grabRes = await onRequest({ request: grabReq, env: mockEnv, params: {} } as any);
    expect(grabRes.status).toBe(200);
    const grabData = await grabRes.json();
    expect(grabData.text).toContain('grabbed 1x *Cold Brew*');

    // 3. /pantry request
    const requestReq = new Request('https://pantrypool.com/api/slack/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'command=%2Fpantry&text=request+Sparkling+Water&user_name=David'
    });
    const requestRes = await onRequest({ request: requestReq, env: mockEnv, params: {} } as any);
    expect(requestRes.status).toBe(200);
    const reqData = await requestRes.json();
    expect(reqData.text).toContain('added *"Sparkling Water"*');

    // 4. /pantry help
    const helpReq = new Request('https://pantrypool.com/api/slack/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'command=%2Fpantry&text=help&user_name=David'
    });
    const helpRes = await onRequest({ request: helpReq, env: mockEnv, params: {} } as any);
    expect(helpRes.status).toBe(200);
    const helpData = await helpRes.json();
    expect(helpData.blocks).toBeDefined();
  });

  it('handles POST /api/slack/interactivity button actions on edge', async () => {
    const mockDb = {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({
          first: async () => ({
            id: 'item-1', name: 'Cold Brew', stock: 5, cost_per_unit: 3.50, pool_id: 'pool1'
          }),
          run: async () => ({ success: true })
        })
      })
    };

    const mockEnv: any = { pantrypool_db: mockDb };

    const payloadObj = {
      user: { name: 'Sarah C.', id: 'U123' },
      actions: [
        { action_id: 'quick_consume', value: JSON.stringify({ itemId: 'item-1', poolId: 'pool1' }) }
      ]
    };

    const req = new Request('https://pantrypool.com/api/slack/interactivity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `payload=${encodeURIComponent(JSON.stringify(payloadObj))}`
    });

    const res = await onRequest({ request: req, env: mockEnv, params: {} } as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toContain('grabbed 1x *Cold Brew*');
  });
});
