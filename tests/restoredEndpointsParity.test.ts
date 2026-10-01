import { describe, it, expect, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';

function createMockStorageForParity() {
  const pools: Record<string, any> = {
    pool_open: {
      id: 'pool_open',
      name: 'Open Breakroom',
      kiosk_pin: '123456',
    },
    pool_no_pin: {
      id: 'pool_no_pin',
      name: 'No Pin Pantry',
      kiosk_pin: null,
    },
    pool_restricted: {
      id: 'pool_restricted',
      name: 'Restricted Corp Pool',
      organization_id: 'org_1',
      champion_id: 'usr_champ',
      kiosk_pin: '987654',
    }
  };

  const poolMembers: Record<string, any> = {
    'pool_restricted:usr_member': { role: 'member', balance: 0 },
    'pool_restricted:usr_champ': { role: 'champion', balance: 0 }
  };

  const shoppingItems: any[] = [];
  const polls: any[] = [];

  return {
    getPoolById: async (id: string) => (pools[id] ? { ...pools[id] } : null),
    getPoolMember: async (poolId: string, userId: string) => {
      return poolMembers[`${poolId}:${userId}`] || null;
    },
    getOrgById: async (id: string) => {
      if (id === 'org_1') return { id: 'org_1', owner_id: 'usr_org_owner' };
      return null;
    },
    listShoppingItems: async (poolId: string) => shoppingItems.filter(i => i.pool_id === poolId),
    createShoppingItem: async (item: any) => {
      const created = { ...item, created_at: new Date().toISOString() };
      shoppingItems.push(created);
      return created;
    },
    updateShoppingItemStatus: async (id: string, poolId: string, purchased: boolean) => {
      const item = shoppingItems.find(i => i.id === id && i.pool_id === poolId);
      if (item) item.purchased = purchased;
    },
    deleteShoppingItem: async (id: string, poolId: string) => {
      const idx = shoppingItems.findIndex(i => i.id === id && i.pool_id === poolId);
      if (idx !== -1) shoppingItems.splice(idx, 1);
    },
    listPolls: async (poolId: string) => polls.filter(p => p.pool_id === poolId),
    createPoll: async (poll: any) => {
      const created = { ...poll, created_at: new Date().toISOString() };
      polls.push(created);
      return created;
    }
  };
}

describe('Restored Endpoints Parity Test Suite', () => {
  const secret = 'test-secret-parity';
  let storage: ReturnType<typeof createMockStorageForParity>;
  let app: ReturnType<typeof createUniversalApi>;

  beforeEach(() => {
    storage = createMockStorageForParity();
    app = createUniversalApi(storage as any, secret);
  });

  describe('POST /api/pools/:poolId/verify-kiosk-pin', () => {
    it('returns 404 if pool does not exist', async () => {
      const res = await app.request('/api/pools/pool_nonexistent/verify-kiosk-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '123456' })
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.verified).toBe(false);
      expect(json.error).toMatch(/Pool not found/i);
    });

    it('returns 400 if kiosk pin is not configured on pool', async () => {
      const res = await app.request('/api/pools/pool_no_pin/verify-kiosk-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '123456' })
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.verified).toBe(false);
      expect(json.error).toMatch(/not configured/i);
    });

    it('returns 400 if incorrect PIN is provided', async () => {
      const res = await app.request('/api/pools/pool_open/verify-kiosk-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '999999' })
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.verified).toBe(false);
      expect(json.error).toMatch(/Incorrect Kiosk Admin PIN/i);
    });

    it('returns 200 with verified: true when PIN matches', async () => {
      const res = await app.request('/api/pools/pool_open/verify-kiosk-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '123456' })
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.verified).toBe(true);
    });
  });

  describe('Shopping List Root Alias Endpoints', () => {
    it('supports POST /api/shopping-list with poolId in body', async () => {
      const token = await createUniversalToken({ userId: 'usr_member', name: 'Test Member', email: 'member@example.com', systemRole: 'user' }, secret);
      const res = await app.request('/api/shopping-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          poolId: 'pool_open',
          name: 'Oat Milk Barista Edition',
          category: 'Dairy & Milks',
          quantity: 2,
          estimatedCost: 5.50
        })
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.item.name).toBe('Oat Milk Barista Edition');
      expect(json.item.pool_id).toBe('pool_open');
    });

    it('supports GET /api/shopping-list?poolId=... query parameter', async () => {
      const token = await createUniversalToken({ userId: 'usr_member', name: 'Test Member', email: 'member@example.com', systemRole: 'user' }, secret);
      // First add an item
      await app.request('/api/shopping-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          poolId: 'pool_open',
          name: 'Dark Roast Cold Brew',
          category: 'Coffee',
          quantity: 3,
          estimatedCost: 4.00
        })
      });

      // Retrieve via root query alias
      const res = await app.request('/api/shopping-list?poolId=pool_open', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.shoppingList.length).toBeGreaterThanOrEqual(1);
      expect(json.shoppingList.some((i: any) => i.name === 'Dark Roast Cold Brew')).toBe(true);
    });
  });

  describe('Polls Root Alias Endpoints', () => {
    it('supports POST /api/polls with poolId in body', async () => {
      const token = await createUniversalToken({ userId: 'usr_member', name: 'Test Member', email: 'member@example.com', systemRole: 'user' }, secret);
      const res = await app.request('/api/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          poolId: 'pool_open',
          title: 'What soda brand for next restock?',
          options: ['Coca-Cola', 'Poppi', 'Olipop']
        })
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.poll.title).toBe('What soda brand for next restock?');
      expect(json.poll.options).toHaveLength(3);
    });

    it('supports GET /api/polls?poolId=... query parameter', async () => {
      const token = await createUniversalToken({ userId: 'usr_member', name: 'Test Member', email: 'member@example.com', systemRole: 'user' }, secret);
      // First create a poll
      await app.request('/api/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          poolId: 'pool_open',
          title: 'Snack of the week',
          options: ['Trail Mix', 'Dried Mango']
        })
      });

      // Retrieve via root query alias
      const res = await app.request('/api/polls?poolId=pool_open', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.polls.length).toBeGreaterThanOrEqual(1);
      expect(json.polls.some((p: any) => p.title === 'Snack of the week')).toBe(true);
    });
  });
});
