import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { generateToken } from '../auth';

describe('Short Pool Join Code Integration Suite', () => {
  const userToken = generateToken({
    userId: 'u_champion',
    email: 'champion@example.com',
    name: 'Champion User',
    systemRole: 'user'
  });

  const memberToken = generateToken({
    userId: 'u_new_member',
    email: 'member@example.com',
    name: 'New Member',
    systemRole: 'user'
  });

  let inMemoryPools: any[] = [];
  let inMemoryMembers: any[] = [];

  const mockStorage: any = {
    getUserById: vi.fn(async (id: string) => {
      if (id === 'u_champion') return { id: 'u_champion', email: 'champion@example.com', name: 'Champion User' };
      if (id === 'u_new_member') return { id: 'u_new_member', email: 'member@example.com', name: 'New Member' };
      return null;
    }),
    countPersonalPools: vi.fn(async (userId: string) =>
      inMemoryPools.filter(p => p.champion_id === userId && !p.organization_id).length
    ),
    createPool: vi.fn(async (poolData: any) => {
      const p = { ...poolData, created_at: new Date().toISOString() };
      inMemoryPools.push(p);
      return p;
    }),
    getPoolById: vi.fn(async (id: string) => inMemoryPools.find(p => p.id === id) || null),
    getPoolByCode: vi.fn(async (code: string) => {
      const normalized = code.trim().toUpperCase();
      const stripped = normalized.replace(/^(PANTRY[-_]|PNTR[-_]|PP[-_]?)/i, '');
      return inMemoryPools.find(p => {
        const poolCode = (p.qr_code_key || '').toUpperCase();
        return poolCode === normalized || poolCode === stripped || poolCode === `PP${stripped}` || poolCode === `PNTR_${stripped}` || poolCode === `PNTR-${stripped}` || p.id === code;
      }) || null;
    }),
    listPoolsForUser: vi.fn(async () => inMemoryPools),
    listPoolMembers: vi.fn(async (poolId: string) => inMemoryMembers.filter(m => m.pool_id === poolId)),
    getPoolMember: vi.fn(async (poolId: string, userId: string) => inMemoryMembers.find(m => m.pool_id === poolId && m.user_id === userId) || null),
    upsertPoolMember: vi.fn(async (memberData: any) => {
      const idx = inMemoryMembers.findIndex(m => m.pool_id === memberData.pool_id && m.user_id === memberData.user_id);
      if (idx >= 0) inMemoryMembers[idx] = { ...inMemoryMembers[idx], ...memberData };
      else inMemoryMembers.push(memberData);
    }),
    updatePool: vi.fn(async (id: string, updates: any) => {
      const pool = inMemoryPools.find(p => p.id === id);
      if (pool) Object.assign(pool, updates);
    })
  };

  const app = createUniversalApi(mockStorage);

  beforeEach(() => {
    inMemoryPools = [];
    inMemoryMembers = [];
    vi.clearAllMocks();
  });

  it('creates pool with a short 6-character code by default', async () => {
    const res = await app.request('/api/pools', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Design Snacks',
        category: 'Snacks',
        currency: '$'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.code).toBeDefined();
    expect(body.code).toHaveLength(6);
    expect(body.code).toMatch(/^PP[2-9A-Z]{4}$/);
    expect(body.qrCodeKey).toBe(body.code);
    expect(body.pool.code).toBe(body.code);
  });

  it('exposes short code and qrCodeKey on GET /api/pools', async () => {
    inMemoryPools.push({
      id: 'pool_a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      name: 'Engineering Lounge',
      category: 'Drinks',
      currency: '$',
      qr_code_key: 'PNTR99'
    });

    const res = await app.request('/api/pools', {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.pools[0].code).toBe('PNTR99');
    expect(body.pools[0].qrCodeKey).toBe('PNTR99');
  });

  it('updates pool join code via PUT /api/pools/:poolId and persists to storage', async () => {
    const poolId = 'pool_cust_1';
    inMemoryPools.push({
      id: poolId,
      name: 'Breakroom',
      category: 'Office',
      currency: '$',
      champion_id: 'u_champion',
      qr_code_key: 'PNTR12'
    });
    inMemoryMembers.push({
      id: 'pm_1',
      pool_id: poolId,
      user_id: 'u_champion',
      role: 'champion',
      balance: 0
    });

    const res = await app.request(`/api/pools/${poolId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: 'SNACK1'
      })
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.pool.code).toBe('SNACK1');
    expect(body.pool.qrCodeKey).toBe('SNACK1');
    expect(mockStorage.updatePool).toHaveBeenCalledWith(poolId, expect.objectContaining({ qr_code_key: 'SNACK1' }));
  });

  it('allows joining with clean 6-character code, prefix, or full invite URL', async () => {
    const poolId = 'pool_team_1';
    inMemoryPools.push({
      id: poolId,
      name: 'Main Breakroom',
      category: 'Office',
      currency: '$',
      champion_id: 'u_champion',
      qr_code_key: 'PNTR4F'
    });

    // 1. Join with exact 6-char code
    const res1 = await app.request('/api/pools/join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${memberToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: 'PNTR4F' })
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.poolId).toBe(poolId);
    expect(body1.code).toBe('PNTR4F');

    // 2. Join with full invite link
    const res2 = await app.request('/api/pools/join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${memberToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: 'https://pantrypool.com/?join=PNTR4F' })
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.poolId).toBe(poolId);
  });

  it('rejects duplicate code when creating or updating with already taken code', async () => {
    inMemoryPools.push({
      id: 'pool_existing_99',
      name: 'Existing Pool',
      category: 'Office',
      currency: '$',
      qr_code_key: 'SNACK1'
    });

    // Attempt to create another pool with SNACK1
    const resCreate = await app.request('/api/pools', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Another Pool',
        code: 'SNACK1'
      })
    });
    expect(resCreate.status).toBe(400);
    const bodyCreate = await resCreate.json();
    expect(bodyCreate.success).toBe(false);
    expect(bodyCreate.error).toContain('already in use');

    // Attempt to update another pool to SNACK1
    inMemoryPools.push({
      id: 'pool_other',
      name: 'Other Pool',
      champion_id: 'u_champion',
      qr_code_key: 'PP2222'
    });
    inMemoryMembers.push({
      id: 'pm_other',
      pool_id: 'pool_other',
      user_id: 'u_champion',
      role: 'champion'
    });

    const resUpdate = await app.request('/api/pools/pool_other', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: 'SNACK1'
      })
    });
    expect(resUpdate.status).toBe(400);
    const bodyUpdate = await resUpdate.json();
    expect(bodyUpdate.success).toBe(false);
    expect(bodyUpdate.error).toContain('already in use');
  });
});
