import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  updatePoolApi, 
  deletePoolApi, 
  joinPoolApi, 
  nudgeMemberApi, 
  verifyKioskPinApi, 
  fetchShoppingListApi, 
  addShoppingItemApi, 
  updateShoppingItemApi, 
  deleteShoppingItemApi, 
  fetchPollsApi, 
  createPollApi, 
  votePollApi,
  linkAuthProviderApi
} from '../src/lib/api';

describe('Phase 23 Full-Stack Synchronization & Mock Elimination Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('23.4: Shopping List API', () => {
    it('fetches shared shopping list for pool', async () => {
      const mockList = [
        { id: 'shop_1', poolId: 'pool1', itemName: 'Oat Milk', category: 'Beverages', quantity: 2, estimatedCost: 9.0, purchased: false }
      ];
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, shoppingList: mockList })
      } as any);

      const res = await fetchShoppingListApi('pool1');
      expect(res.success).toBe(true);
      expect(res.shoppingList).toEqual(mockList);
      expect(global.fetch).toHaveBeenCalledWith('/api/pools/pool1/shopping-list', expect.anything());
    });

    it('adds new item to shopping list', async () => {
      const newItem = { id: 'shop_2', poolId: 'pool1', itemName: 'Nitro Cold Brew', category: 'Beverages', quantity: 4, estimatedCost: 12.0, reason: 'Low on caffeine' };
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, item: newItem })
      } as any);

      const res = await addShoppingItemApi('pool1', {
        itemName: 'Nitro Cold Brew',
        category: 'Beverages',
        quantity: 4,
        estimatedCost: 12.0,
        reason: 'Low on caffeine'
      });
      expect(res.success).toBe(true);
      expect(res.item).toEqual(newItem);
    });

    it('toggles purchased status and deletes shopping item', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, itemId: 'shop_1', purchased: true })
      } as any);

      const updateRes = await updateShoppingItemApi('pool1', 'shop_1', { purchased: true });
      expect(updateRes.success).toBe(true);
      expect(updateRes.purchased).toBe(true);

      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, message: 'Deleted' })
      } as any);

      const delRes = await deleteShoppingItemApi('pool1', 'shop_1');
      expect(delRes.success).toBe(true);
    });
  });

  describe('23.5: Communal Team Polls & Voting API', () => {
    it('fetches polls, creates a poll, and registers votes', async () => {
      const mockPolls = [
        { id: 'poll_1', poolId: 'pool1', title: 'Snack Flavor?', options: [{ id: 'opt_1', name: 'BBQ', votes: [] }] }
      ];
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, polls: mockPolls })
      } as any);

      const listRes = await fetchPollsApi('pool1');
      expect(listRes.success).toBe(true);
      expect(listRes.polls).toEqual(mockPolls);

      const createdPoll = { id: 'poll_2', poolId: 'pool1', title: 'Coffee Bean?', options: [{ id: 'opt_a', name: 'Dark Roast', votes: [] }, { id: 'opt_b', name: 'Light Roast', votes: [] }] };
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, poll: createdPoll })
      } as any);

      const createRes = await createPollApi('pool1', 'Coffee Bean?', ['Dark Roast', 'Light Roast']);
      expect(createRes.success).toBe(true);
      expect(createRes.poll).toEqual(createdPoll);

      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, pollId: 'poll_2', options: [{ id: 'opt_a', name: 'Dark Roast', votes: ['u1'] }] })
      } as any);

      const voteRes = await votePollApi('pool1', 'poll_2', 'opt_a');
      expect(voteRes.success).toBe(true);
    });
  });

  describe('23.2, 23.6, 23.7, 23.9: Pool Operations & Nudge API', () => {
    it('dispatches nudge notification to member', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, message: 'Nudge sent' })
      } as any);

      const res = await nudgeMemberApi('pool1', 'u2');
      expect(res.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/pools/pool1/nudge', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetUserId: 'u2', message: undefined })
      }));
    });

    it('joins pool by invite code', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, poolId: 'pool1', poolName: '3rd Floor Pantry' })
      } as any);

      const res = await joinPoolApi('PNTR99');
      expect(res.success).toBe(true);
      expect(res.poolId).toBe('pool1');
      expect(global.fetch).toHaveBeenCalledWith('/api/pools/join', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'PNTR99' })
      }));
    });

    it('updates pool settings and deletes pool', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, message: 'Updated' })
      } as any);

      const updateRes = await updatePoolApi('pool1', { name: 'Main Breakroom', kioskPin: '4321' });
      expect(updateRes.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/pools/pool1', expect.objectContaining({
        method: 'PUT'
      }));

      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, message: 'Deleted' })
      } as any);

      const delRes = await deletePoolApi('pool1');
      expect(delRes.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/pools/pool1', expect.objectContaining({
        method: 'DELETE'
      }));
    });

    it('verifies kiosk exit PIN', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, verified: true })
      } as any);

      const res = await verifyKioskPinApi('pool1', '1234');
      expect(res.success).toBe(true);
      expect(res.verified).toBe(true);
    });

    it('links external auth provider via linkAuthProviderApi', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ success: true, message: 'Linked google' })
      } as any);

      const res = await linkAuthProviderApi('google', { credential: 'google_token_123', providerId: 'google_user@test.com' });
      expect(res.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/users/link-provider', expect.objectContaining({
        method: 'POST'
      }));
    });
  });

  describe('Kiosk Mode Feature Flag', () => {
    it('fetches kioskModeEnabled from public system settings', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: true,
          settings: {
            appleLoginEnabled: false,
            registrationEnabled: true,
            maintenanceMode: false,
            kioskModeEnabled: true,
            systemNotice: ''
          }
        })
      } as any);

      const { fetchPublicSettingsApi } = await import('../src/lib/api');
      const settings = await fetchPublicSettingsApi();
      expect(settings.kioskModeEnabled).toBe(true);

      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: true,
          settings: {
            appleLoginEnabled: false,
            registrationEnabled: true,
            maintenanceMode: false,
            kioskModeEnabled: false,
            systemNotice: ''
          }
        })
      } as any);

      const disabledSettings = await fetchPublicSettingsApi();
      expect(disabledSettings.kioskModeEnabled).toBe(false);
    });
  });
});
