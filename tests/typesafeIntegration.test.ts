import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { createUniversalToken } from '../src/server/api/authUtils';

function createMockStorage(initialSettings: Record<string, any> = {}) {
  let settings: Record<string, any> = { ...initialSettings };
  const items: any[] = [
    {
      id: 'item_coke_zero_12',
      pool_id: 'pool_123',
      name: 'Coca-Cola Zero Sugar 12oz Cans',
      category: 'Beverages',
      stock: 12,
      min_stock: 4,
      cost_per_unit: 0.75
    },
    {
      id: 'item_cold_brew',
      pool_id: 'pool_123',
      name: 'Stumptown Nitro Cold Brew',
      category: 'Coffee & Tea',
      stock: 8,
      min_stock: 4,
      cost_per_unit: 2.50
    }
  ];

  return {
    getSystemSettings: async () => ({ ...settings }),
    saveSystemSettings: async (newSettings: Record<string, any>) => {
      settings = { ...settings, ...newSettings };
    },
    listItemsByPool: async (poolId: string) => {
      return items.filter(i => i.pool_id === poolId);
    },
    getPoolById: async (poolId: string) => ({
      id: poolId,
      name: 'Engineering Pantry',
      champion_id: 'usr_admin'
    }),
    getPoolMember: async () => ({ role: 'member' }),
    getUserById: async (userId: string) => ({
      id: userId,
      email: 'admin@pantrypool.com',
      system_role: 'superadmin'
    })
  } as any;
}

describe('TypeSafe AI System Settings & Integration Endpoints', () => {
  const jwtSecret = 'test_jwt_secret_for_typesafe_eval_1234567890';
  let adminToken: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.TYPESAFE_API_KEY = 'apikey_test_typesafe_mock_key_1234567890';
    adminToken = await createUniversalToken(
      { userId: 'usr_admin', email: 'admin@pantrypool.com', name: 'Admin', systemRole: 'superadmin' },
      jwtSecret
    );
  });

  it('exposes TypeSafe configuration status in GET /api/admin/settings', async () => {
    const mockStorage = createMockStorage({ typesafe_ai_enabled: 'true' });
    const app = createUniversalApi(mockStorage, jwtSecret);

    const res = await app.request('/api/admin/settings', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.settings).toBeDefined();
    expect(body.settings.typesafe_ai_enabled).toBe('true');
    expect(body.typesafe).toBeDefined();
    expect(body.typesafe.model).toBe('jev-latest');
  });

  it('allows superadmins to toggle typesafe_ai_enabled via POST /api/admin/settings', async () => {
    const mockStorage = createMockStorage({ typesafe_ai_enabled: 'true' });
    const app = createUniversalApi(mockStorage, jwtSecret);

    const saveRes = await app.request('/api/admin/settings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        settings: { typesafe_ai_enabled: 'false' }
      })
    });

    expect(saveRes.status).toBe(200);

    const readRes = await app.request('/api/admin/settings', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const readBody: any = await readRes.json();
    expect(readBody.settings.typesafe_ai_enabled).toBe('false');
  });

  it('exposes TypeSafe metadata in GET /api/admin/ai-usage', async () => {
    const mockStorage = createMockStorage();
    const app = createUniversalApi(mockStorage, jwtSecret);

    const res = await app.request('/api/admin/ai-usage', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.typesafe).toBeDefined();
    expect(body.typesafe.model).toBe('jev-latest');
    expect(body.typesafe.features).toContain('semantic_haul_parsing');
  });

  it('uses TypeSafe for haul categorization when enabled', async () => {
    const mockStorage = createMockStorage({ typesafe_ai_enabled: 'true' });
    const app = createUniversalApi(mockStorage, jwtSecret);

    const mockTypeSafeResponse = {
      model: 'jev-1.13.0',
      answers: {
        cat_0: {
          type: 'choice',
          choice: 'Beverages',
          confidence: 0.99,
          probabilities: { Beverages: 0.99 }
        },
        is_item_0: {
          type: 'noul',
          noul: 0.98
        }
      }
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockTypeSafeResponse
    } as any);

    const res = await app.request('/api/parse-receipt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        textInput: 'brought in 6 bottles of cold sparkling water for $9'
      })
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.aiSource).toBe('typesafe');
    expect(body.items[0].category).toBe('Beverages');
  });

  it('falls back to regex when typesafe_ai_enabled is toggled off', async () => {
    const mockStorage = createMockStorage({ typesafe_ai_enabled: 'false' });
    const app = createUniversalApi(mockStorage, jwtSecret);

    const fetchSpy = vi.spyOn(global, 'fetch');

    const res = await app.request('/api/parse-receipt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        textInput: 'brought in 6 bottles of sparkling water for $9'
      })
    });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.aiSource).toBe('regex');
    // Ensure no external TypeSafe fetch was initiated when toggled off
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('supports SKU catalog deduplication via POST /api/items/match-candidate', async () => {
    const mockStorage = createMockStorage({ typesafe_ai_enabled: 'true' });
    const app = createUniversalApi(mockStorage, jwtSecret);

    // 1. Exact match
    const exactRes = await app.request('/api/items/match-candidate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        poolId: 'pool_123',
        candidateName: 'Coca-Cola Zero Sugar 12oz Cans'
      })
    });
    const exactBody: any = await exactRes.json();
    expect(exactBody.success).toBe(true);
    expect(exactBody.strategy).toBe('exact');
    expect(exactBody.matchedItem.id).toBe('item_coke_zero_12');

    // 2. TypeSafe Semantic match for alternate phrasing
    const mockTypeSafeResponse = {
      model: 'jev-1.13.0',
      answers: {
        match: {
          type: 'choice',
          choice: 'item_coke_zero_12',
          confidence: 0.95
        }
      }
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockTypeSafeResponse
    } as any);

    const semanticRes = await app.request('/api/items/match-candidate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        poolId: 'pool_123',
        candidateName: 'Coke Zero 12pk'
      })
    });
    const semanticBody: any = await semanticRes.json();
    expect(semanticBody.success).toBe(true);
    expect(semanticBody.strategy).toBe('typesafe');
    expect(semanticBody.matchedItem.id).toBe('item_coke_zero_12');
  });
});
