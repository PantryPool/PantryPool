import { describe, it, expect, vi } from 'vitest';
import { onRequest } from '../functions/api/[[path]]';
import { createUniversalToken } from '../src/server/api/authUtils';

describe('Phase 21: Cloudflare Edge Security Suite (functions/api/[[path]].ts)', () => {
  const createMockDb = (users: any[] = [], systemSettings: any[] = []) => ({
    prepare: vi.fn((query: string) => {
      return {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results: query.includes('system_settings') ? systemSettings : users,
          success: true,
          meta: {}
        }),
        first: vi.fn().mockResolvedValue(users[0] || null),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      };
    })
  });

  const mockEnv = {
    pantrypool_db: createMockDb() as any,
    JWT_SECRET: 'test-edge-jwt-secret-2026',
    INITIAL_ADMIN_EMAIL: 'admin@pantrypool.com'
  };

  it('blocks unauthenticated access to /api/admin/stats with 401', async () => {
    const request = new Request('https://pantrypool.com/api/admin/stats', {
      method: 'GET'
    });

    const response = await onRequest({ request, env: mockEnv } as any);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Authentication required');
  });

  it('blocks non-superadmin user from /api/admin/users with 403', async () => {
    // First register or login to get a signed token
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@test.com', password: 'Password123!', name: 'Normal User' })
    });

    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    expect(regRes.status).toBe(200);
    const regBody = await regRes.json();
    const token = regBody.token;
    expect(token).toBeDefined();

    // Attempt admin route with normal user token
    const adminReq = new Request('https://pantrypool.com/api/admin/users', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const adminRes = await onRequest({ request: adminReq, env: mockEnv } as any);
    expect(adminRes.status).toBe(403);
    const adminBody = await adminRes.json();
    expect(adminBody.success).toBe(false);
    expect(adminBody.error).toContain('Superadmin');
  });

  it('grants access to /api/admin/stats for superadmin role', async () => {
    const adminReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pantrypool.com', password: 'Password123!', name: 'Admin' })
    });

    const adminRes = await onRequest({ request: adminReq, env: mockEnv } as any);
    expect(adminRes.status).toBe(200);
    const adminBody = await adminRes.json();
    const token = adminBody.token;
    expect(adminBody.user.systemRole).toBe('superadmin');

    const statsReq = new Request('https://pantrypool.com/api/admin/stats', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const statsRes = await onRequest({ request: statsReq, env: mockEnv } as any);
    expect(statsRes.status).toBe(200);
    const statsBody = await statsRes.json();
    expect(statsBody.success).toBe(true);
    expect(statsBody.stats).toBeDefined();
  });

  it('enforces restricted CORS headers matching allowed origins', async () => {
    const req = new Request('https://pantrypool.com/api/admin/public-settings', {
      method: 'GET',
      headers: { 'Origin': 'https://pantrypool.com' }
    });

    const res = await onRequest({ request: req, env: mockEnv } as any);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://pantrypool.com');
  });

  it('serves public settings without authentication and includes ssoConfigured status', async () => {
    const req = new Request('https://pantrypool.com/api/admin/public-settings', {
      method: 'GET'
    });

    const res = await onRequest({ request: req, env: mockEnv } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.settings).toBeDefined();
    expect(typeof body.settings.ssoConfigured).toBe('boolean');
  });



  it('handles POST /api/transactions/:id/refund successfully on edge', async () => {
    const mockTx = {
      id: 'tx-1786759762180',
      pool_id: 'pool-4th-floor',
      user_id: 'user-123',
      type: 'consume',
      amount: 3.50,
      item_id: 'item-1',
      description: 'Bought Coffee'
    };

    const userToken = await createUniversalToken(
      { userId: 'user-123', email: 'user@test.com', name: 'Test User', systemRole: 'user' },
      mockEnv.JWT_SECRET
    );

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (query.includes('FROM transactions WHERE id = ?')) {
            return mockTx;
          }
          if (query.includes("FROM transactions WHERE type = 'refund'")) {
            return null; // Not refunded yet
          }
          if (query.includes('FROM pool_members')) {
            return { balance: 13.50, role: 'member' };
          }
          if (query.includes('FROM users WHERE id = ?')) {
            return { id: 'user-123', email: 'user@test.com', name: 'Test User', system_role: 'user' };
          }
          return null;
        }),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    const req = new Request('https://pantrypool.com/api/transactions/tx-1786759762180/refund', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    const res = await onRequest({ request: req, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.originalTransactionId).toBe('tx-1786759762180');
    expect(body.refundTransactionId).toBeDefined();
  });

  it('returns 404 on edge if refunding non-existent transaction', async () => {
    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    const req = new Request('https://pantrypool.com/api/transactions/nonexistent-tx/refund', {
      method: 'POST'
    });

    const res = await onRequest({ request: req, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Transaction not found');
  });

  it('updates organization tier via PUT /api/admin/organizations/:id/tier for superadmin', async () => {
    // Register superadmin
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@pantrypool.com', password: 'Password123!', name: 'Superadmin' })
    });
    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    const { token } = await regRes.json();

    const tierReq = new Request('https://pantrypool.com/api/admin/organizations/org-test-123/tier', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tier: 'enterprise' })
    });

    const tierRes = await onRequest({ request: tierReq, env: mockEnv } as any);
    expect(tierRes.status).toBe(200);
    const tierBody = await tierRes.json();
    expect(tierBody.success).toBe(true);
    expect(tierBody.message).toContain('Organization tier updated');
  });



  it('handles GET /api/db/status for superadmin on edge', async () => {
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@pantrypool.com', password: 'Password123!', name: 'Superadmin' })
    });
    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    const { token } = await regRes.json();

    const dbReq = new Request('https://pantrypool.com/api/db/status', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const dbRes = await onRequest({ request: dbReq, env: mockEnv } as any);
    expect(dbRes.status).toBe(200);
    const dbBody = await dbRes.json();
    expect(dbBody.success).toBe(true);
    expect(dbBody.provider).toContain('Cloudflare D1');
  });

  it('handles PUT /api/pools/:poolId/polls/:pollId to update title and close poll on edge', async () => {
    const champToken = await createUniversalToken(
      { userId: 'user-champ', email: 'champ@pantrypool.com', name: 'Champ User', systemRole: 'user' },
      mockEnv.JWT_SECRET
    );

    const mockPoll = {
      id: 'poll-123',
      pool_id: 'pool-4th-floor',
      title: 'Original Poll',
      status: 'active',
      created_by: 'Superadmin',
      options_json: JSON.stringify([{ id: 'opt1', name: 'Option 1', votes: [] }])
    };

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (query.includes('FROM polls WHERE id = ?')) {
            return { ...mockPoll, title: 'Updated Poll Title', status: 'closed' };
          }
          if (query.includes('FROM pool_members')) {
            return { role: 'champion' };
          }
          if (query.includes('FROM users WHERE id = ?')) {
            return { id: 'user-champ', email: 'champ@pantrypool.com', name: 'Champ User', system_role: 'user' };
          }
          return null;
        }),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    const req = new Request('https://pantrypool.com/api/pools/pool-4th-floor/polls/poll-123', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${champToken}`
      },
      body: JSON.stringify({ title: 'Updated Poll Title', status: 'closed' })
    });

    const res = await onRequest({ request: req, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.poll.title).toBe('Updated Poll Title');
    expect(body.poll.status).toBe('closed');
  });

  it('handles POST /api/pools/:poolId/polls to create poll with options and allowWriteIn on edge', async () => {
    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null)
      }))
    };

    const req = new Request('https://pantrypool.com/api/pools/pool-4th-floor/polls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Best Team Snack?', options: ['Almonds', 'Pretzels'], allowWriteIn: true })
    });

    const res = await onRequest({ request: req, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.poll.title).toBe('Best Team Snack?');
    expect(body.poll.options).toHaveLength(2);
    expect(body.poll.allowWriteIn).toBe(true);
  });

  it('handles POST /api/pools/:poolId/polls/:pollId/vote with writeInOption on edge', async () => {
    const mockPoll = {
      id: 'poll-123',
      pool_id: 'pool-4th-floor',
      title: 'Snack Poll',
      options: JSON.stringify([{ id: 'opt1', name: 'Almonds', votes: [] }])
    };

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (query.includes('FROM polls WHERE id = ?')) return mockPoll;
          return null;
        }),
        run: vi.fn().mockResolvedValue({ success: true }),
        all: vi.fn().mockResolvedValue({ results: [] })
      }))
    };

    const req = new Request('https://pantrypool.com/api/pools/pool-4th-floor/polls/poll-123/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writeInOption: 'Cashews', userId: 'user-777' })
    });

    const res = await onRequest({ request: req, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.options).toHaveLength(2);
    expect(body.options[1].name).toBe('Cashews');
    expect(body.options[1].isWriteIn).toBe(true);
    expect(body.options[1].votes).toContain('user-777');
  });

  it('handles DELETE /api/pools/:poolId/polls/:pollId on edge', async () => {
    const champToken = await createUniversalToken(
      { userId: 'user-champ', email: 'champ@pantrypool.com', name: 'Champ User', systemRole: 'user' },
      mockEnv.JWT_SECRET
    );

    const mockPoll = {
      id: 'poll-123',
      pool_id: 'pool-4th-floor',
      title: 'Poll To Delete',
      created_by: 'Superadmin'
    };

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (query.includes('FROM polls WHERE id = ?')) {
            return mockPoll;
          }
          if (query.includes('FROM pool_members')) {
            return { role: 'champion' };
          }
          if (query.includes('FROM users WHERE id = ?')) {
            return { id: 'user-champ', email: 'champ@pantrypool.com', name: 'Champ User', system_role: 'user' };
          }
          return null;
        }),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    const req = new Request('https://pantrypool.com/api/pools/pool-4th-floor/polls/poll-123', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${champToken}`
      }
    });

    const res = await onRequest({ request: req, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('deleted');
  });

  it('handles GET and POST /api/organizations on edge', async () => {
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'orgowner@pantrypool.com', password: 'Password123!', name: 'Org Owner' })
    });
    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    const { token, user } = await regRes.json();

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (query.includes('FROM users')) return { id: user.id, email: user.email, name: user.name };
          if (query.includes('FROM organizations WHERE id = ?')) return { id: 'org-test-1', name: 'Acme Innovation Lab', owner_id: user.id, tier: 'community' };
          return null;
        }),
        all: vi.fn().mockResolvedValue({
          results: [{ id: 'org-test-1', name: 'Acme Test Corp', owner_id: user.id, tier: 'starter' }],
          success: true,
          meta: {}
        }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    // GET /api/organizations
    const getReq = new Request('https://pantrypool.com/api/organizations', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const getRes = await onRequest({ request: getReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.success).toBe(true);
    expect(Array.isArray(getBody.organizations)).toBe(true);

    // POST /api/organizations
    const postReq = new Request('https://pantrypool.com/api/organizations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Acme Innovation Lab' })
    });
    const postRes = await onRequest({ request: postReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.success).toBe(true);
    expect(postBody.organization.name).toBe('Acme Innovation Lab');
  });

  it('handles atomic onboarding via POST /api/organizations/onboard on edge', async () => {
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'founder@onboardtest.com', password: 'Password123!', name: 'Founder' })
    });
    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    const { token, user } = await regRes.json();

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          if (query.includes('FROM users')) return Promise.resolve({ id: user.id, email: user.email, name: user.name });
          if (query.includes('FROM organizations WHERE id = ?') || query.includes('FROM organizations WHERE id=')) return Promise.resolve({ id: 'org_test_onboard', name: 'Atlas Robotics', owner_id: user.id, tier: 'community', created_at: new Date().toISOString() });
          return Promise.resolve(null);
        }),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    // Missing orgName returns 400
    const badReq = new Request('https://pantrypool.com/api/organizations/onboard', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ poolName: 'Atlas Pantry' })
    });
    const badRes = await onRequest({ request: badReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(badRes.status).toBe(400);

    // Full atomic onboarding (Community tier + Starter items)
    const onboardReq = new Request('https://pantrypool.com/api/organizations/onboard', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orgName: 'Atlas Robotics',
        poolName: 'Atlas Main Breakroom',
        category: 'Engineering',
        currency: '$',
        tier: 'community',
        starterItems: true
      })
    });
    const onboardRes = await onRequest({ request: onboardReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(onboardRes.status).toBe(200);
    const onboardBody = await onboardRes.json();
    expect(onboardBody.success).toBe(true);
    expect(onboardBody.organization).toBeDefined();
    expect(onboardBody.organization.name).toBe('Atlas Robotics');
    expect(onboardBody.organization.tier).toBe('community');
    expect(onboardBody.pool).toBeDefined();
    expect(onboardBody.pool.name).toBe('Atlas Main Breakroom');
    expect(onboardBody.pool.category).toBe('Engineering');
    expect(onboardBody.pool.qrCodeKey).toMatch(/^PNTR_/);

    // GET /api/organizations/:id lookup
    const getOrgReq = new Request(`https://pantrypool.com/api/organizations/${onboardBody.organization.id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const getOrgRes = await onRequest({ request: getOrgReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(getOrgRes.status).toBe(200);
    const getOrgBody = await getOrgRes.json();
    expect(getOrgBody.success).toBe(true);
    expect(getOrgBody.organization.name).toBe('Atlas Robotics');
  });

  it('handles GET and POST /api/pools on edge', async () => {
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'poolcreator@pantrypool.com', password: 'Password123!', name: 'Pool Creator' })
    });
    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    const { token, user } = await regRes.json();

    const mockPool = {
      id: 'pool-test-1',
      name: 'Design Studio Kitchen',
      category: 'Design',
      currency: '$',
      organization_id: null
    };

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (query.includes('FROM users')) return { id: user.id, email: user.email, name: user.name };
          if (query.includes('FROM organizations')) return { id: 'org-1', tier: 'starter' };
          return null;
        }),
        all: vi.fn().mockResolvedValue({
          results: [mockPool],
          success: true,
          meta: {}
        }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    const getReq = new Request('https://pantrypool.com/api/pools', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const getRes = await onRequest({ request: getReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.success).toBe(true);

    const postReq = new Request('https://pantrypool.com/api/pools', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Design Studio Kitchen',
        category: 'Design',
        currency: '$'
      })
    });
    const postRes = await onRequest({ request: postReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.success).toBe(true);
    expect(postBody.pool.name).toBe('Design Studio Kitchen');
  });

  it('handles item consumption and deposit transactions on edge', async () => {
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'consumer@pantrypool.com', password: 'Password123!', name: 'Consumer' })
    });
    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    const { token, user } = await regRes.json();

    const mockItem = {
      id: 'item-coffee-1',
      name: 'Cold Brew Can',
      pool_id: 'pool-test-1',
      stock: 10,
      cost_per_unit: 3.00
    };

    const mockMember = {
      id: 'pm-1',
      pool_id: 'pool-test-1',
      user_id: user.id,
      balance: 15.00,
      role: 'member'
    };

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (query.includes('FROM items WHERE id = ?')) return mockItem;
          if (query.includes('FROM pool_members')) return mockMember;
          if (query.includes('FROM users')) return { id: user.id, email: user.email, name: user.name };
          return null;
        }),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    // POST /api/items/consume
    const consumeReq = new Request('https://pantrypool.com/api/items/consume', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        poolId: 'pool-test-1',
        itemId: 'item-coffee-1',
        quantity: 1
      })
    });
    const consumeRes = await onRequest({ request: consumeReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(consumeRes.status).toBe(200);
    const consumeBody = await consumeRes.json();
    expect(consumeBody.success).toBe(true);

    // POST /api/transactions/deposit
    const depositReq = new Request('https://pantrypool.com/api/transactions/deposit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        poolId: 'pool-test-1',
        amount: 20.00,
        description: 'Account reload'
      })
    });
    const depositRes = await onRequest({ request: depositReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(depositRes.status).toBe(200);
    const depositBody = await depositRes.json();
    expect(depositBody.success).toBe(true);
  });

  it('handles shopping list CRUD endpoints on edge', async () => {
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'shopper@pantrypool.com', password: 'Password123!', name: 'Shopper' })
    });
    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    const { token } = await regRes.json();

    const mockItem = {
      id: 'shop-1',
      pool_id: 'pool-test-1',
      name: 'Oat Milk 6-pack',
      category: 'Pantry',
      quantity: 2,
      status: 'pending'
    };

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (query.includes('FROM shopping_items WHERE id = ?')) return mockItem;
          return null;
        }),
        all: vi.fn().mockResolvedValue({
          results: [mockItem],
          success: true,
          meta: {}
        }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    // GET /api/pools/:poolId/shopping-list
    const getReq = new Request('https://pantrypool.com/api/pools/pool-test-1/shopping-list', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const getRes = await onRequest({ request: getReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.success).toBe(true);
    expect(Array.isArray(getBody.shoppingList)).toBe(true);

    // POST /api/pools/:poolId/shopping-list
    const postReq = new Request('https://pantrypool.com/api/pools/pool-test-1/shopping-list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Oat Milk 6-pack',
        category: 'Pantry',
        quantity: 2
      })
    });
    const postRes = await onRequest({ request: postReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.success).toBe(true);
    expect(postBody.item.name).toBe('Oat Milk 6-pack');
  });

  it('handles user profile and notification preference updates on edge', async () => {
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'profileuser@pantrypool.com', password: 'Password123!', name: 'Profile User' })
    });
    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    const { token, user } = await regRes.json();

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(async () => {
          if (query.includes('FROM users WHERE id = ?')) {
            return { id: user.id, email: user.email, name: 'Updated Profile User', avatar_url: 'https://avatar.test/pic.png' };
          }
          if (query.includes('FROM notification_preferences')) {
            return { user_id: user.id, low_stock_email: 1, low_stock_sms: 0, weekly_digest_email: 1 };
          }
          return null;
        }),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        run: vi.fn().mockResolvedValue({ success: true, results: [], meta: {} })
      }))
    };

    // PUT /api/users/profile
    const profileReq = new Request('https://pantrypool.com/api/users/profile', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated Profile User', avatarUrl: 'https://avatar.test/pic.png' })
    });
    const profileRes = await onRequest({ request: profileReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(profileRes.status).toBe(200);
    const profileBody = await profileRes.json();
    expect(profileBody.success).toBe(true);

    // GET /api/notifications/preferences
    const prefReq = new Request('https://pantrypool.com/api/notifications/preferences', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const prefRes = await onRequest({ request: prefReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(prefRes.status).toBe(200);
    const prefBody = await prefRes.json();
    expect(prefBody.success).toBe(true);
    expect(prefBody.preferences).toBeDefined();
  });

  it('allows superadmin to update user details and reset password via PUT /api/admin/users/:id', async () => {
    const adminReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pantrypool.com', password: 'Password123!', name: 'Superadmin' })
    });
    const adminRes = await onRequest({ request: adminReq, env: mockEnv } as any);
    const { token } = await adminRes.json();

    const updateReq = new Request('https://pantrypool.com/api/admin/users/user_target_123', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Alex Updated', email: 'alex.new@test.com', systemRole: 'admin', password: 'NewSecurePass123!' })
    });

    const updateRes = await onRequest({ request: updateReq, env: mockEnv } as any);
    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.success).toBe(true);
    expect(updateBody.message).toContain('User details updated');
  });

  it('allows superadmin to update and delete pantry pools via /api/admin/pools/:id', async () => {
    const adminReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pantrypool.com', password: 'Password123!', name: 'Superadmin' })
    });
    const adminRes = await onRequest({ request: adminReq, env: mockEnv } as any);
    const { token } = await adminRes.json();

    // PUT /api/admin/pools/pool_123
    const updatePoolReq = new Request('https://pantrypool.com/api/admin/pools/pool_123', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated Breakroom', category: 'Kitchen', currency: '$', description: 'Updated by admin' })
    });

    const updatePoolRes = await onRequest({ request: updatePoolReq, env: mockEnv } as any);
    expect(updatePoolRes.status).toBe(200);
    const updatePoolBody = await updatePoolRes.json();
    expect(updatePoolBody.success).toBe(true);

    // DELETE /api/admin/pools/pool_123
    const deletePoolReq = new Request('https://pantrypool.com/api/admin/pools/pool_123', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const deletePoolRes = await onRequest({ request: deletePoolReq, env: mockEnv } as any);
    expect(deletePoolRes.status).toBe(200);
    const deletePoolBody = await deletePoolRes.json();
    expect(deletePoolBody.success).toBe(true);
    expect(deletePoolBody.message).toContain('deleted');
  });

  it('N1: fails closed with 500 if JWT_SECRET is missing from environment', async () => {
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'no_secret@test.com', password: 'Password123!', name: 'No Secret' })
    });

    const envWithoutSecret = { ...mockEnv, JWT_SECRET: undefined };
    const res = await onRequest({ request: regReq, env: envWithoutSecret } as any);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Internal Server Error');
  });

  it('N2: rejects legacy SHA-256 hashes and requires password reset', async () => {
    // Legacy hash: SHA-256(password + 'pantrypool-salt-2026') — no longer supported
    const password = 'LegacyPassword123!';
    const legacyData = new TextEncoder().encode(password + 'pantrypool-salt-2026');
    const legacyBuffer = await crypto.subtle.digest('SHA-256', legacyData);
    const legacyHex = Array.from(new Uint8Array(legacyBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn((...args: any[]) => ({
          first: async () => {
            if (query.includes('FROM users WHERE email')) {
              return {
                id: 'user-legacy-1',
                email: 'legacy@test.com',
                name: 'Legacy User',
                password_hash: legacyHex,
                system_role: 'user',
                token_version: 1
              };
            }
            return null;
          },
          run: async () => ({ success: true }),
          all: async () => ({ results: [] })
        })),
        all: async () => ({ results: [] }),
        run: async () => ({ success: true })
      }))
    };

    const loginReq = new Request('https://pantrypool.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'legacy@test.com', password })
    });

    const loginRes = await onRequest({ request: loginReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(loginRes.status).toBe(401);
    const loginBody = await loginRes.json() as any;
    expect(loginBody.success).toBe(false);
  });

  it('N3: invalidates active token if user token_version is incremented', async () => {
    // Register user with token_version 1
    let currentTokenVersion = 1;
    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn((...args: any[]) => ({
          first: async () => {
            if (query.includes('FROM users WHERE id')) {
              return { id: 'u123', token_version: currentTokenVersion, system_role: 'user' };
            }
            return null;
          },
          run: async () => ({ success: true }),
          all: async () => ({ results: [] })
        })),
        all: async () => ({ results: [] }),
        run: async () => ({ success: true })
      }))
    };

    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'session_test@test.com', password: 'Password123!', name: 'Session Test' })
    });
    const regRes = await onRequest({ request: regReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    const { token } = await regRes.json();

    // 1. Token should be valid initially
    const testReq = new Request('https://pantrypool.com/api/users/profile', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Valid User' })
    });
    const testRes = await onRequest({ request: testReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(testRes.status).toBe(200);

    // 2. Bump token_version in database (simulating password change / session revoke)
    currentTokenVersion = 2;

    // 3. Old token should now be rejected as unauthorized
    const revokedReq = new Request('https://pantrypool.com/api/users/link-provider', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider: 'google', providerId: 'g_123' })
    });
    const revokedRes = await onRequest({ request: revokedReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(revokedRes.status).toBe(401);
  });

  it('N4: enforces rate limits and returns 429 when quota exceeded (including OAuth endpoints)', async () => {
    let rateCount = 0;
    const mockDb = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn((...args: any[]) => ({
          first: async () => {
            if (query.includes('edge_rate_limits')) {
              return { count: rateCount, reset_at: Math.floor(Date.now() / 1000) + 60 };
            }
            return null;
          },
          run: async () => {
            rateCount++;
            return { success: true };
          },
          all: async () => ({ results: [] })
        })),
        all: async () => ({ results: [] }),
        run: async () => ({ success: true })
      }))
    };

    // Simulate exceeding the 30 requests / min limit for auth
    for (let i = 0; i < 30; i++) {
      await onRequest({
        request: new Request('https://pantrypool.com/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.195' },
          body: JSON.stringify({ email: 'spam@test.com', password: 'password' })
        }),
        env: { ...mockEnv, pantrypool_db: mockDb }
      } as any);
    }

    const burstReq = new Request('https://pantrypool.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.195' },
      body: JSON.stringify({ email: 'spam@test.com', password: 'password' })
    });

    const res = await onRequest({ request: burstReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeDefined();
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Too many requests');

    // Test OAuth endpoint is also rate-limited
    const oauthReq = new Request('https://pantrypool.com/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.195' },
      body: JSON.stringify({ credential: 'dummy-token' })
    });
    const oauthRes = await onRequest({ request: oauthReq, env: { ...mockEnv, pantrypool_db: mockDb } } as any);
    expect(oauthRes.status).toBe(429);
  });

  it('N5: enforces strict CORS policy and fails closed when ENVIRONMENT is unset', async () => {
    // Development environment should allow localhost origins
    const devReq = new Request('https://pantrypool.com/api/admin/public-settings', {
      method: 'GET',
      headers: { 'Origin': 'http://localhost:5173' }
    });
    const devRes = await onRequest({ request: devReq, env: { ...mockEnv, ENVIRONMENT: 'development' } } as any);
    expect(devRes.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');

    // Production environment should deny localhost origins
    const prodLocalhostReq = new Request('https://pantrypool.com/api/admin/public-settings', {
      method: 'GET',
      headers: { 'Origin': 'http://localhost:3000' }
    });
    const prodRes = await onRequest({ request: prodLocalhostReq, env: { ...mockEnv, ENVIRONMENT: 'production' } } as any);
    expect(prodRes.headers.get('Access-Control-Allow-Origin')).toBe('https://pantrypool.com');

    // Unknown origin should fallback to default production domain
    const untrustedReq = new Request('https://pantrypool.com/api/admin/public-settings', {
      method: 'GET',
      headers: { 'Origin': 'https://evil-hacker.com' }
    });

    const untrustedRes = await onRequest({ request: untrustedReq, env: mockEnv } as any);
    expect(untrustedRes.headers.get('Access-Control-Allow-Origin')).toBe('https://pantrypool.com');
  });

  it('handles POST /api/auth/refresh for sliding session token renewal', async () => {
    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'refresh-user@pantrypool.com', password: 'Password123!', name: 'Refresh Tester' })
    });
    const regRes = await onRequest({ request: regReq, env: mockEnv } as any);
    const { token } = await regRes.json();

    const refreshReq = new Request('https://pantrypool.com/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const refreshRes = await onRequest({ request: refreshReq, env: mockEnv } as any);
    expect(refreshRes.status).toBe(200);
    const refreshData = await refreshRes.json();
    expect(refreshData.success).toBe(true);
    expect(refreshData.token).toBeDefined();
    expect(refreshData.user.email).toBe('refresh-user@pantrypool.com');
  });

  it('revokes access to money-moving routes immediately when token_version is bumped', async () => {
    let userVersion = 1;
    const mockDb: any = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn((...args: any[]) => ({
          first: async () => {
            if (query.includes('FROM users WHERE email')) {
              return null; // Return null so register succeeds
            }
            return { id: 'u_fin', email: 'fin@pantrypool.com', name: 'Finance User', system_role: 'user', token_version: userVersion };
          },
          all: async () => ({ results: [] }),
          run: async () => ({ success: true })
        })),
        all: async () => ({ results: [] }),
        run: async () => ({ success: true })
      }))
    };

    const customEnv = { ...mockEnv, pantrypool_db: mockDb };

    const regReq = new Request('https://pantrypool.com/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'fin@pantrypool.com', password: 'Password123!', name: 'Finance User' })
    });
    const regRes = await onRequest({ request: regReq, env: customEnv } as any);
    const { token } = await regRes.json();

    // 1. Initial profile update should work when token_version matches
    const profileReq = new Request('https://pantrypool.com/api/users/profile', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Finance User Updated' })
    });
    const profileRes = await onRequest({ request: profileReq, env: customEnv } as any);
    expect(profileRes.status).toBe(200);

    // 2. Bump token_version in DB (simulating password change / session revoke)
    userVersion = 2;

    // 3. Stolen/old token should immediately be rejected on sensitive and balance-mutating routes
    const revokedLinkReq = new Request('https://pantrypool.com/api/users/link-provider', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider: 'google', providerId: 'g123' })
    });
    const revokedLinkRes = await onRequest({ request: revokedLinkReq, env: customEnv } as any);
    expect(revokedLinkRes.status).toBe(401);
  });

  it('serves full-page OAuth redirect callback at GET /api/auth/google/callback', async () => {
    const req = new Request('https://pantrypool.com/api/auth/google/callback', {
      method: 'GET'
    });
    const res = await onRequest({ request: req, env: mockEnv } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('Signing in to PantryPool');

    // The callback logic is externalized to a same-origin script so it complies with
    // script-src 'self' (no 'unsafe-inline'). See public/google-callback.js.
    expect(text).toContain('<script src="/google-callback.js"></script>');
    const inlineScripts = text.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g) || [];
    expect(inlineScripts).toEqual([]);
  });
});
