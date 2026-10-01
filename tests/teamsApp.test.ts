import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';
import {
  formatTeamsAdaptiveCardPayload,
  formatTeamsRestockPayload
} from '../src/lib/webhooks';

describe('🟦 Microsoft Teams Bot & Adaptive Card Verification (Phase 32 P1)', () => {
  const sampleItem = {
    id: 'item-202',
    name: 'Sparkling Lime Water',
    category: 'Beverages',
    stock: 1,
    minStock: 6,
    costPerUnit: 1.75,
    poolId: 'pool-main'
  };

  it('generates valid Microsoft Teams Adaptive Card v1.5 with Action.Execute verbs', () => {
    const card = formatTeamsAdaptiveCardPayload(sampleItem, 'Engineering Breakroom');
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.5');
    expect(card.body).toBeDefined();

    const grabAction = card.actions.find((a: any) => a.verb === 'quick_grab');
    expect(grabAction).toBeDefined();
    expect(grabAction?.type).toBe('Action.Execute');
    expect(grabAction?.data?.itemId).toBe('item-202');

    const restockAction = card.actions.find((a: any) => a.verb === 'quick_restock');
    expect(restockAction).toBeDefined();
    expect(restockAction?.type).toBe('Action.Execute');
  });

  it('generates schema-valid Microsoft Teams restock notification card', () => {
    const card = formatTeamsRestockPayload('Organic Snack Mix', 12, 'Alex R.', 'Main Floor');
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.5');
    expect(card.body[0].items[0].text).toContain('Fresh Restock Alert');
    expect(card.body[0].items[1].text).toContain('Alex R.');
  });

  it('handles POST /api/teams/messages bot commands and Action.Execute invokes on edge', async () => {
    const mockDb = {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({
          all: async () => ({
            results: [
              { id: 'i-1', name: 'Nitro Cold Brew', stock: 3, cost_per_unit: 3.50 }
            ]
          }),
          first: async () => ({
            id: 'i-1', name: 'Nitro Cold Brew', stock: 3, cost_per_unit: 3.50, pool_id: 'pool1'
          }),
          run: async () => ({ success: true })
        }),
        all: async () => ({
          results: [
            { id: 'i-1', name: 'Nitro Cold Brew', stock: 3, cost_per_unit: 3.50 }
          ]
        }),
        first: async () => ({
          id: 'i-1', name: 'Nitro Cold Brew', stock: 3, cost_per_unit: 3.50, pool_id: 'pool1'
        }),
        run: async () => ({ success: true })
      })
    };

    const mockEnv: any = { pantrypool_db: mockDb };

    // 1. @PantryPool stock command
    const stockMsgReq = new Request('https://pantrypool.com/api/teams/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        text: '<at>PantryPool</at> stock',
        from: { name: 'Jordan V.' }
      })
    });
    const stockRes = await onRequest({ request: stockMsgReq, env: mockEnv, params: {} } as any);
    expect(stockRes.status).toBe(200);
    const stockData = await stockRes.json();
    expect(stockData.attachments).toBeDefined();
    expect(stockData.attachments[0].content.type).toBe('AdaptiveCard');

    // 2. Action.Execute invoke (quick_grab)
    const invokeReq = new Request('https://pantrypool.com/api/teams/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'invoke',
        name: 'adaptiveCard/action',
        from: { name: 'Jordan V.' },
        value: {
          action: {
            verb: 'quick_grab',
            data: { itemId: 'i-1', poolId: 'pool1' }
          }
        }
      })
    });
    const invokeRes = await onRequest({ request: invokeReq, env: mockEnv, params: {} } as any);
    expect(invokeRes.status).toBe(200);
    const invokeData = await invokeRes.json();
    expect(invokeData.value.text).toContain('Grab recorded');
  });
});
