import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  registerUserApi, 
  loginUserApi, 
  googleLoginApi, 
  consumeItemApi, 
  addDepositApi, 
  createPoolApi, 
  saveItemApi,
  getAuthToken
} from '../src/lib/api';

describe('API Client Mutations Suite (src/lib/api.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should call registerUserApi and store JWT token on success', async () => {
    const mockRes = { success: true, token: 'mock-jwt-token-xyz', user: { id: 'u1', email: 'test@pantry.com', name: 'Test' } };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockRes)
    } as any) as unknown as typeof fetch;

    const res = await registerUserApi('test@pantry.com', 'pass123', 'Test User');
    expect(res).toEqual(mockRes);
    expect(getAuthToken()).toBe('mock-jwt-token-xyz');
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }));
  });

  it('should call loginUserApi and store JWT token on success', async () => {
    const mockRes = { success: true, token: 'login-token-123', user: { id: 'u1', email: 'test@pantry.com' } };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockRes)
    } as any) as unknown as typeof fetch;

    const res = await loginUserApi('test@pantry.com', 'pass123');
    expect(res).toEqual(mockRes);
    expect(getAuthToken()).toBe('login-token-123');
  });

  it('should call googleLoginApi and store JWT token on success', async () => {
    const mockRes = { success: true, token: 'google-jwt-token-456', user: { id: 'u_g1', email: 'g@gmail.com' } };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockRes)
    } as any) as unknown as typeof fetch;

    const res = await googleLoginApi({ email: 'g@gmail.com', name: 'Google User' });
    expect(res).toEqual(mockRes);
    expect(getAuthToken()).toBe('google-jwt-token-456');
  });

  it('should call googleLoginApi with credential token', async () => {
    const mockRes = { success: true, token: 'google-credential-jwt-789', user: { id: 'u_g2', email: 'credential@gmail.com' } };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockRes)
    } as any) as unknown as typeof fetch;

    const res = await googleLoginApi({ credential: 'mock-google-id-token-123' });
    expect(res).toEqual(mockRes);
    expect(getAuthToken()).toBe('google-credential-jwt-789');
  });

  it('should send consume item payload to /api/items/consume', async () => {
    const mockRes = { success: true, message: 'Item consumed' };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockRes)
    } as any) as unknown as typeof fetch;

    const res = await consumeItemApi('pool1', 'item1', 'user1', 2);
    expect(res).toEqual(mockRes);
    expect(global.fetch).toHaveBeenCalledWith('/api/items/consume', expect.objectContaining({
      method: 'POST',
      body: expect.stringMatching(/"poolId":"pool1".*"itemId":"item1".*"userId":"user1".*"quantity":2/)
    }));
  });

  it('should send deposit payload to /api/transactions/deposit', async () => {
    const mockRes = { success: true, message: 'Deposit added' };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockRes)
    } as any) as unknown as typeof fetch;

    const res = await addDepositApi('pool1', 'user1', 50.00, 'Monthly Contribution');
    expect(res).toEqual(mockRes);
    expect(global.fetch).toHaveBeenCalledWith('/api/transactions/deposit', expect.objectContaining({
      method: 'POST',
      body: expect.stringMatching(/"poolId":"pool1".*"userId":"user1".*"amount":50.*"description":"Monthly Contribution"/)
    }));
  });

  it('should send create pool payload to /api/pools', async () => {
    const mockRes = { success: true, pool: { id: 'pool_new', name: 'New Pool' } };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockRes)
    } as any) as unknown as typeof fetch;

    const res = await createPoolApi('New Pool', 'Office Pantry', '$', 'u1');
    expect(res).toEqual(mockRes);
    expect(global.fetch).toHaveBeenCalledWith('/api/pools', expect.objectContaining({ method: 'POST' }));
  });

  it('should send item payload to /api/items', async () => {
    const mockRes = { success: true, item: { id: 'item_new', name: 'Cold Brew' } };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockRes)
    } as any) as unknown as typeof fetch;

    const res = await saveItemApi({ poolId: 'pool1', name: 'Cold Brew', category: 'Coffee & Tea', stock: 10 });
    expect(res).toEqual(mockRes);
    expect(global.fetch).toHaveBeenCalledWith('/api/items', expect.objectContaining({ method: 'POST' }));
  });
});
