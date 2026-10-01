import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOrganizationApi, fetchOrganizationsApi, createPoolInOrgApi, onboardWorkspaceApi } from '../src/lib/api';

describe('Phase 3 Multi-Tenancy API Suite (src/lib/api.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should call onboardWorkspaceApi and return new org and pool', async () => {
    const mockOrg = { id: 'org_onboard_1', name: 'Startup Inc', ownerId: 'u1', tier: 'community' };
    const mockPool = { id: 'pool_onboard_1', organizationId: 'org_onboard_1', name: 'Startup Pantry', code: 'PNTR_123' };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, organization: mockOrg, pool: mockPool })
    } as any) as unknown as typeof fetch;

    const res = await onboardWorkspaceApi({
      orgName: 'Startup Inc',
      poolName: 'Startup Pantry',
      tier: 'community',
      starterItems: true
    });
    expect(res.success).toBe(true);
    expect(res.organization).toEqual(mockOrg);
    expect(res.pool).toEqual(mockPool);
    expect(global.fetch).toHaveBeenCalledWith('/api/organizations/onboard', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        orgName: 'Startup Inc',
        poolName: 'Startup Pantry',
        tier: 'community',
        starterItems: true
      })
    }));
  });

  it('should call createOrganizationApi and return new org object', async () => {
    const mockOrg = { id: 'org_123', name: 'Acme Corp', ownerId: 'u1', tier: 'community' };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, organization: mockOrg })
    } as any) as unknown as typeof fetch;

    const res = await createOrganizationApi('Acme Corp', 'u1');
    expect(res.success).toBe(true);
    expect(res.organization).toEqual(mockOrg);
    expect(global.fetch).toHaveBeenCalledWith('/api/organizations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Acme Corp', ownerId: 'u1', tier: 'community' })
    }));
  });

  it('should call fetchOrganizationsApi and return list of organizations', async () => {
    const mockOrgs = [
      { id: 'org_1', name: 'Acme Corp HQ', tier: 'pro', poolsCount: 3 },
      { id: 'org_2', name: 'Design Studio', tier: 'starter', poolsCount: 1 }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, organizations: mockOrgs })
    } as any) as unknown as typeof fetch;

    const orgs = await fetchOrganizationsApi('u1');
    expect(orgs).toEqual(mockOrgs);
    expect(global.fetch).toHaveBeenCalledWith('/api/organizations?userId=u1', expect.anything());
  });

  it('should call createPoolInOrgApi to create pool tied to an organization', async () => {
    const mockPool = { id: 'pool_99', organizationId: 'org_1', name: '4th Floor Pantry', category: 'Office' };
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ success: true, pool: mockPool })
    } as any) as unknown as typeof fetch;

    const res = await createPoolInOrgApi('org_1', '4th Floor Pantry', 'Office', '$', 'u1');
    expect(res.success).toBe(true);
    expect(res.pool).toEqual(mockPool);
    expect(global.fetch).toHaveBeenCalledWith('/api/pools', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org_1', name: '4th Floor Pantry', category: 'Office', currency: '$', userId: 'u1' })
    }));
  });

  it('should clear cached user and pool data on clearUserData() without removing sound preferences', async () => {
    const { clearUserData, savePools, saveActiveUserId, saveSoundEnabled, isSoundEnabled, loadPools } = await import('../src/lib/storage');
    savePools([{ id: 'p1', name: 'Pantry 1', description: 'Test', category: 'Office', currency: '$', championId: 'u1', members: [], createdAt: '', code: 'C1' }]);
    saveActiveUserId('user_google_123');
    saveSoundEnabled(true);

    expect(loadPools().length).toBe(1);
    expect(localStorage.getItem('pantrypool_active_user_id_v1')).toBeTruthy();

    clearUserData();

    expect(loadPools().length).toBe(0);
    expect(localStorage.getItem('pantrypool_active_user_id_v1')).toBeNull();
    expect(isSoundEnabled()).toBe(true);
  });
});
