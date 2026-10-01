import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiRequest, setAuthToken, removeAuthToken, getAuthToken } from '../src/lib/api';

describe('🌐 Standardized API Client & Response Envelope (Sprint 3 / N15)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    removeAuthToken();
    vi.restoreAllMocks();
  });

  it('should return a standardized ApiResponse envelope with data on successful 200 responses', async () => {
    const mockData = { items: [{ id: 'i1', name: 'Sparkling Water', stock: 12 }] };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: mockData })
    });

    const response = await apiRequest('/api/items');
    expect(response.success).toBe(true);
    expect(response.statusCode).toBe(200);
    expect(response.data).toEqual(mockData);
    expect(response.error).toBeUndefined();
  });

  it('should automatically attach Authorization: Bearer token when token is set', async () => {
    setAuthToken('test-edge-jwt-token-xyz');
    let capturedHeaders: Record<string, string> = {};

    global.fetch = vi.fn().mockImplementation((url, options) => {
      capturedHeaders = options.headers;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, user: { id: 'u1', name: 'Sarah' } })
      });
    });

    const response = await apiRequest('/api/auth/me');
    expect(response.success).toBe(true);
    expect(capturedHeaders['Authorization']).toBe('Bearer test-edge-jwt-token-xyz');
  });

  it('should structure error responses with message and HTTP status code on 400 Bad Request', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: false, error: 'poolId and userId required' })
    });

    const response = await apiRequest('/api/items/consume', {
      method: 'POST',
      body: JSON.stringify({})
    });

    expect(response.success).toBe(false);
    expect(response.statusCode).toBe(400);
    expect(response.error).toBe('poolId and userId required');
  });

  it('should gracefully catch network exceptions and return a unified error envelope with statusCode: 0', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (Network connection lost)'));

    const response = await apiRequest('/api/pools');
    expect(response.success).toBe(false);
    expect(response.statusCode).toBe(0);
    expect(response.error).toContain('Network connection lost');
  });
});
