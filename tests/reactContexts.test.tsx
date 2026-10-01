import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { PoolProvider, usePool } from '../src/contexts/PoolContext';
import { NotificationProvider, useNotifications } from '../src/contexts/NotificationContext';
import * as api from '../src/lib/api';

describe('🧩 Modular React Context Providers (Sprint 3 / N12)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('AuthContext', () => {
    it('should manage authenticated user login, profile update, and logout', async () => {
      const mockUser = { id: 'u1', email: 'alex@example.com', name: 'Alex M.', systemRole: 'user' as const };
      vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue(mockUser);
      vi.spyOn(api, 'updateUserProfileApi').mockResolvedValue({
        success: true,
        user: { ...mockUser, name: 'Alex Morgan' }
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Initial login
      act(() => {
        result.current.login('test-jwt-token-123', mockUser);
      });

      expect(result.current.authUser?.name).toBe('Alex M.');
      expect(localStorage.getItem('pantrypool_token')).toBe('test-jwt-token-123');

      // Update profile
      await act(async () => {
        const updateRes = await result.current.updateProfile({ name: 'Alex Morgan' });
        expect(updateRes.success).toBe(true);
      });

      expect(result.current.authUser?.name).toBe('Alex Morgan');

      // Logout
      act(() => {
        result.current.logout();
      });

      expect(result.current.authUser).toBeNull();
      expect(localStorage.getItem('pantrypool_token')).toBeNull();
    });
  });

  describe('PoolContext', () => {
    it('should load pools, items, and switch active pool', async () => {
      const mockPools = [
        { id: 'p1', name: 'Engineering Pantry', category: 'Office' as const, currency: '$', championId: 'u1', members: [], createdAt: '' },
        { id: 'p2', name: 'Marketing Fridge', category: 'Office' as const, currency: '$', championId: 'u1', members: [], createdAt: '' }
      ];
      const mockItems = [
        { id: 'i1', poolId: 'p1', name: 'Cold Brew', category: 'Beverages' as const, costPerUnit: 2.50, stock: 10, minStock: 2, unitName: 'can', icon: 'coffee' }
      ];

      vi.spyOn(api, 'fetchPools').mockResolvedValue(mockPools as any);
      vi.spyOn(api, 'fetchItems').mockResolvedValue(mockItems as any);
      vi.spyOn(api, 'fetchTransactions').mockResolvedValue([]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <PoolProvider>{children}</PoolProvider>
      );

      const { result } = renderHook(() => usePool(), { wrapper });

      await act(async () => {
        await result.current.refreshPools();
      });

      expect(result.current.pools.length).toBe(2);
      expect(result.current.activePool?.id).toBe('p1');

      act(() => {
        result.current.setActivePoolId('p2');
      });

      expect(result.current.activePoolId).toBe('p2');
    });
  });

  describe('NotificationContext', () => {
    it('should manage notifications inbox and unread count', async () => {
      const mockNotifications = [
        { id: 'n1', title: 'Low Stock Alert', message: 'Cold Brew is running low', type: 'low_stock' as const, createdAt: '', isRead: false },
        { id: 'n2', title: 'Weekly Digest', message: 'Your weekly consumption report', type: 'weekly_digest' as const, createdAt: '', isRead: true }
      ];

      vi.spyOn(api, 'fetchNotificationsApi').mockResolvedValue(mockNotifications as any);
      vi.spyOn(api, 'markNotificationsReadApi').mockResolvedValue({ success: true } as any);
      vi.spyOn(api, 'deleteNotificationApi').mockResolvedValue({ success: true } as any);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <NotificationProvider>{children}</NotificationProvider>
      );

      const { result } = renderHook(() => useNotifications(), { wrapper });

      await act(async () => {
        await result.current.refreshNotifications();
      });

      expect(result.current.notifications.length).toBe(2);
      expect(result.current.unreadCount).toBe(1);

      await act(async () => {
        await result.current.markAsRead(['n1']);
      });

      expect(result.current.unreadCount).toBe(0);

      await act(async () => {
        await result.current.deleteNotification('n2');
      });

      expect(result.current.notifications.length).toBe(1);
    });
  });
});
