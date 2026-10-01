import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  getAuthToken, 
  setAuthToken, 
  removeAuthToken, 
  fetchPools, 
  fetchItems, 
  fetchTransactions,
  consumeItemApi
} from '../src/lib/api';

describe('Frontend API Client Suite (src/lib/api.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should store and remove JWT auth token in localStorage', () => {
    expect(getAuthToken()).toBeNull();

    setAuthToken('sample-jwt-token-123');
    expect(getAuthToken()).toBe('sample-jwt-token-123');

    removeAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it('should fetch pools array from backend API', async () => {
    const mockPools = [
      { id: 'pool1', name: '3rd Floor Coffee', category: 'Office', currency: '$', members: [] }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, pools: mockPools })
    } as any) as unknown as typeof fetch;

    const pools = await fetchPools();
    expect(pools).toEqual(mockPools);
    expect(global.fetch).toHaveBeenCalledWith('/api/pools', expect.anything());
  });

  it('should fetch items for specific poolId from backend API', async () => {
    const mockItems = [
      { id: 'i1', name: 'Cold Brew Coffee', category: 'Coffee & Tea', stock: 10, minStock: 4, costPerUnit: 2.75 }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, items: mockItems })
    } as any) as unknown as typeof fetch;

    const items = await fetchItems('pool1');
    expect(items).toEqual(mockItems);
    expect(global.fetch).toHaveBeenCalledWith('/api/items?poolId=pool1', expect.anything());
  });

  it('should fetch transactions for specific poolId from backend API', async () => {
    const mockTxs = [
      { id: 't1', userId: 'u1', type: 'deposit', amount: 25.00, timestamp: new Date().toISOString() }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, transactions: mockTxs })
    } as any) as unknown as typeof fetch;

    const txs = await fetchTransactions('pool1');
    expect(txs).toEqual(mockTxs);
    expect(global.fetch).toHaveBeenCalledWith('/api/transactions?poolId=pool1', expect.anything());
  });

  it('automatically refreshes token on 401 response and retries original request', async () => {
    setAuthToken('expired-token');

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/pools') {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ success: false, error: 'Token expired' })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, pools: [{ id: 'p1', name: 'Refreshed Pool' }] })
        };
      }
      if (url === '/api/auth/refresh') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, token: 'brand-new-fresh-token' })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const pools = await fetchPools();
    expect(pools).toEqual([{ id: 'p1', name: 'Refreshed Pool' }]);
    expect(getAuthToken()).toBe('brand-new-fresh-token');
    expect(callCount).toBe(2);
  });

  it('automatically refreshes token on 401 response during consumeItemApi mutation and retries successfully', async () => {
    setAuthToken('expired-bearer-token');

    let consumeCallCount = 0;
    let authHeaderSentOnRetry = '';

    global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      if (url === '/api/items/consume') {
        consumeCallCount++;
        if (consumeCallCount === 1) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ success: false, error: 'Token expired' })
          };
        }
        authHeaderSentOnRetry = options?.headers?.Authorization || options?.headers?.authorization;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, newStock: 9, newBalance: 15.0 })
        };
      }
      if (url === '/api/auth/refresh') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, token: 'fresh-renewed-token-999' })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const result = await consumeItemApi('pool1', 'i1', 'u1', 1);
    expect(result.success).toBe(true);
    expect(result.newStock).toBe(9);
    expect(consumeCallCount).toBe(2);
    expect(getAuthToken()).toBe('fresh-renewed-token-999');
    expect(authHeaderSentOnRetry).toBe('Bearer fresh-renewed-token-999');
  });

  it('preserves existing token in localStorage when refresh fails due to network error', async () => {
    setAuthToken('token-during-network-outage');

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/pools') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: 'Token expired' })
        };
      }
      if (url === '/api/auth/refresh') {
        throw new Error('Failed to fetch (Network offline)');
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const pools = await fetchPools();
    expect(pools).toEqual([]);
    // Stored token is NOT deleted on network error to allow offline queue operations
    expect(getAuthToken()).toBe('token-during-network-outage');
  });

  it('preserves existing token in localStorage when refresh fails due to transient 500/502 server error', async () => {
    setAuthToken('token-during-transient-500');

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/pools') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: 'Token expired' })
        };
      }
      if (url === '/api/auth/refresh') {
        return {
          ok: false,
          status: 502,
          json: async () => ({ success: false, error: 'Bad Gateway' })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const pools = await fetchPools();
    expect(pools).toEqual([]);
    // Stored token is NOT deleted on transient 5xx server error
    expect(getAuthToken()).toBe('token-during-transient-500');
  });

  it('removes token from localStorage when refresh endpoint returns 401 or 403', async () => {
    setAuthToken('revoked-or-invalid-token');

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/pools') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: 'Token expired' })
        };
      }
      if (url === '/api/auth/refresh') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: 'Refresh token expired' })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const pools = await fetchPools();
    expect(pools).toEqual([]);
    // Stored token MUST be cleared on 401/403
    expect(getAuthToken()).toBeNull();
  });
});

