import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getRequestListener } from '@hono/node-server';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';
import { StorageAdapter } from '../src/server/storage/types';
import { saveItemApi, fetchItems } from '../src/lib/api';

class InMemoryItemStorage implements Partial<StorageAdapter> {
  items: Map<string, any> = new Map();

  async getItemById(id: string) { return this.items.get(id) || null; }
  async listItemsByPool(poolId: string) { return Array.from(this.items.values()).filter(i => i.pool_id === poolId); }
  async saveItem(item: any) { this.items.set(item.id, item); return item; }
  async deleteItem(id: string) { this.items.delete(id); }
}

describe('📦 Item Unit Persistence Suite (Unit -> Bottle Bugfix)', () => {
  let app: any;
  let storage: InMemoryItemStorage;
  const JWT_SECRET = 'test-secret-unit-persistence-12345';
  let token: string;

  beforeEach(async () => {
    storage = new InMemoryItemStorage();
    const honoApp = createUniversalApi(storage as any, JWT_SECRET);
    app = getRequestListener(honoApp.fetch);
    token = await createUniversalToken({
      userId: 'u_tester',
      email: 'tester@acme.com',
      name: 'Tester',
      systemRole: 'superadmin',
      tokenVersion: 1
    }, JWT_SECRET);
  });

  describe('Backend API Item Unit Persistence', () => {
    it('POST /api/items correctly persists custom unitName: "bottle"', async () => {
      const res = await request(app)
        .post('/api/items')
        .set('Authorization', `Bearer ${token}`)
        .send({
          poolId: 'pool1',
          name: 'Olive Oil',
          category: 'Pantry & Fresh',
          stock: 3,
          minStock: 1,
          costPerUnit: 12.99,
          unitName: 'bottle',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.item.unitName).toBe('bottle');
      expect(res.body.item.unit_name).toBe('bottle');
    });

    it('PUT /api/items/:id updates unitName from "unit" to "bottle"', async () => {
      // 1. Seed item
      storage.items.set('item_kombucha', {
        id: 'item_kombucha',
        pool_id: 'pool1',
        name: 'Kombucha',
        category: 'Beverages',
        stock: 6,
        min_stock: 2,
        cost_per_unit: 3.50,
        unit_name: 'can'
      });

      // 2. Update item to bottle
      const updateRes = await request(app)
        .put('/api/items/item_kombucha')
        .set('Authorization', `Bearer ${token}`)
        .send({
          unitName: 'bottle',
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(updateRes.body.item.unitName).toBe('bottle');

      // 3. Verify via GET /api/items
      const listRes = await request(app)
        .get('/api/items?poolId=pool1');
      expect(listRes.status).toBe(200);
      const updatedItem = listRes.body.items.find((i: any) => i.id === 'item_kombucha');
      expect(updatedItem).toBeDefined();
      expect(updatedItem.unitName).toBe('bottle');
    });
  });

  describe('Frontend API Client Unit Transmission', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('saveItemApi transmits unitName in the POST body', async () => {
      const mockItem = {
        id: 'item_100',
        poolId: 'pool1',
        name: 'Sparkling Cider',
        category: 'Beverages',
        stock: 5,
        minStock: 2,
        costPerUnit: 4.00,
        unitName: 'bottle'
      };

      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, item: mockItem })
      } as any) as unknown as typeof fetch;

      const res = await saveItemApi(mockItem);
      expect(res.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/items', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"unitName":"bottle"')
      }));
    });

    it('fetchItems normalizes unit_name from backend into unitName', async () => {
      const backendItems = [
        {
          id: 'item_200',
          pool_id: 'pool1',
          name: 'Cold Brew Bottled',
          category: 'Coffee & Tea',
          stock: 8,
          min_stock: 2,
          cost_per_unit: 4.5,
          unit_name: 'bottle'
        }
      ];

      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, items: backendItems })
      } as any) as unknown as typeof fetch;

      const items = await fetchItems('pool1');
      expect(items.length).toBe(1);
      expect(items[0].unitName).toBe('bottle');
      expect(items[0].poolId).toBe('pool1');
    });
  });
});
