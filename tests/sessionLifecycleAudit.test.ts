import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearUserData, savePools, saveActiveUserId, saveSoundEnabled, isSoundEnabled, loadPools, loadActiveUserId } from '../src/lib/storage';
import { setAuthToken, getAuthToken, removeAuthToken, fetchOrganizationsApi } from '../src/lib/api';
import { enqueueOfflineAction, getOfflineQueue } from '../src/lib/offlineQueue';

describe('🔒 Session Lifecycle & Account Switching Audit', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('purges all user-specific storage on logout without losing UI preferences', () => {
    // 1. Setup User A state
    setAuthToken('jwt_user_a_token');
    localStorage.setItem('pantrypool_auth_token', 'legacy_token_a');
    saveActiveUserId('user_a_id');
    const mockPoolA = { id: 'pool_a1', name: 'User A Pool', description: 'Desc A', category: 'Office' as const, currency: '$', championId: 'user_a_id', members: [{ id: 'user_a_id', name: 'User A', email: 'a@example.com', avatar: '', balance: 0, role: 'champion' as const, joinedAt: '' }], createdAt: '', code: 'A1' };
    savePools([mockPoolA]);
    enqueueOfflineAction('consume_item', { transactionId: 'tx_a1', itemId: 'item_a1' });
    saveSoundEnabled(true);

    expect(getAuthToken()).toBe('jwt_user_a_token');
    expect(loadPools().length).toBe(1);
    expect(getOfflineQueue().length).toBe(1);
    expect(loadActiveUserId(mockPoolA)).toBe('user_a_id');

    // 2. Perform Logout
    removeAuthToken();
    clearUserData();

    // 3. Verify zero bleed
    expect(getAuthToken()).toBeNull();
    expect(localStorage.getItem('pantrypool_auth_token')).toBeNull();
    expect(localStorage.getItem('pantrypool_token')).toBeNull();
    expect(loadPools().length).toBe(0);
    expect(getOfflineQueue().length).toBe(0);
    expect(loadActiveUserId()).toBe('');
    // Global user interface preference retained
    expect(isSoundEnabled()).toBe(true);
  });

  it('correctly partitions organizations between accounts during runtime switch', async () => {
    const userAOrgs = [{ id: 'org_a', name: 'User A Corp', ownerId: 'user_a' }];
    const userBOrgs: any[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('userId=user_a')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, organizations: userAOrgs })
        });
      }
      if (url.includes('userId=user_b')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, organizations: userBOrgs })
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, organizations: [] })
      });
    });

    // Fetch for User A
    const orgsA = await fetchOrganizationsApi('user_a');
    expect(orgsA).toHaveLength(1);
    expect(orgsA[0].id).toBe('org_a');

    // Switch to User B (has 0 orgs)
    const orgsB = await fetchOrganizationsApi('user_b');
    expect(orgsB).toHaveLength(0);
  });

  it('rejects cached pools from prior user when hydrating for a different user ID', () => {
    // Setup User A's cached pools in localStorage
    const poolA = {
      id: 'pool_a',
      name: "User A's Secret Pantry",
      description: '',
      category: 'Office' as const,
      currency: '$',
      championId: 'user_a',
      members: [{ id: 'user_a', name: 'User A', email: 'a@example.com', avatar: '', balance: 0, role: 'champion' as const, joinedAt: '' }],
      createdAt: '',
      code: 'PA'
    };
    savePools([poolA]);
    expect(loadPools().length).toBe(1);

    // User B checks cached pools — should detect non-membership and reject immediately
    const poolsForB = loadPools('user_b');
    expect(poolsForB).toHaveLength(0);
    // Verified that stale cache was purged from localStorage
    expect(loadPools().length).toBe(0);
  });

  it('applies cache: no-store in apiFetch for user-sensitive endpoints to prevent HTTP cache bleed', async () => {
    const { apiFetch } = await import('../src/lib/api');
    let capturedOptions: any = null;
    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      capturedOptions = opts;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ success: true, pools: [] })
      });
    });

    await apiFetch('/api/pools');
    expect(capturedOptions?.cache).toBe('no-store');

    await apiFetch('/api/auth/me');
    expect(capturedOptions?.cache).toBe('no-store');

    await apiFetch('/api/organizations');
    expect(capturedOptions?.cache).toBe('no-store');
  });

  it('preserves newly issued auth token when clearUserData({ preserveAuthTokens: true }) is executed on login', () => {
    // Simulate new token saved upon login
    setAuthToken('jwt_newly_logged_in_token');
    savePools([{ id: 'old_pool', name: 'Old', description: '', category: 'Office', currency: '$', championId: 'old', members: [], createdAt: '', code: 'OP' }]);

    // Execute login cleanup with preserveAuthTokens
    clearUserData({ preserveAuthTokens: true });

    // Stale pools are cleared
    expect(loadPools().length).toBe(0);
    // Token is intact for subsequent authenticated requests
    expect(getAuthToken()).toBe('jwt_newly_logged_in_token');
  });
});
