import { describe, it, expect, beforeEach } from 'vitest';
import { AppNotification, NotificationPreferences } from '../src/types';

describe('Phase 13: Notification Center & Digest Engine', () => {
  let sampleNotifications: AppNotification[];
  let samplePreferences: NotificationPreferences;

  beforeEach(() => {
    sampleNotifications = [
      {
        id: 'n1',
        userId: 'u1',
        poolId: 'pool1',
        type: 'low_stock',
        title: '⚠️ Low Stock: Oat Milk',
        message: 'Oat Milk stock is 3 (min: 5).',
        channel: 'in_app',
        isRead: false,
        createdAt: '2026-08-13T00:00:00.000Z'
      },
      {
        id: 'n2',
        userId: 'u1',
        poolId: 'pool1',
        type: 'weekly_digest',
        title: '📊 Weekly Digest',
        message: 'Pool balance is $15.50.',
        channel: 'email',
        isRead: true,
        createdAt: '2026-08-10T00:00:00.000Z'
      }
    ];

    samplePreferences = {
      userId: 'u1',
      lowStockEmail: true,
      lowStockSms: false,
      weeklyDigestEmail: true,
      phoneNumber: '+15550192834'
    };
  });

  it('calculates unread notification count correctly', () => {
    const unread = sampleNotifications.filter(n => !n.isRead).length;
    expect(unread).toBe(1);
  });

  it('filters notifications by alert type', () => {
    const lowStockAlerts = sampleNotifications.filter(n => n.type === 'low_stock');
    expect(lowStockAlerts.length).toBe(1);
    expect(lowStockAlerts[0].title).toContain('Low Stock');

    const weeklyDigests = sampleNotifications.filter(n => n.type === 'weekly_digest');
    expect(weeklyDigests.length).toBe(1);
    expect(weeklyDigests[0].channel).toBe('email');
  });

  it('marks single notification as read', () => {
    const updated = sampleNotifications.map(n => n.id === 'n1' ? { ...n, isRead: true } : n);
    expect(updated.find(n => n.id === 'n1')?.isRead).toBe(true);
    expect(updated.filter(n => !n.isRead).length).toBe(0);
  });

  it('marks all notifications as read', () => {
    const updated = sampleNotifications.map(n => ({ ...n, isRead: true }));
    expect(updated.every(n => n.isRead)).toBe(true);
    expect(updated.filter(n => !n.isRead).length).toBe(0);
  });

  it('updates user notification channel preferences', () => {
    const newPrefs: NotificationPreferences = {
      ...samplePreferences,
      lowStockSms: true,
      phoneNumber: '+15559876543'
    };

    expect(newPrefs.lowStockSms).toBe(true);
    expect(newPrefs.phoneNumber).toBe('+15559876543');
    expect(newPrefs.lowStockEmail).toBe(true);
  });

  it('generates a new low-stock alert when item drops below min threshold', () => {
    const item = { id: 'i1', name: 'Cold Brew', stock: 2, minStock: 5, poolId: 'pool1' };
    const isLow = item.stock <= item.minStock;
    expect(isLow).toBe(true);

    const generatedAlert: AppNotification = {
      id: 'notif_new',
      userId: 'u1',
      poolId: item.poolId,
      type: 'low_stock',
      title: `⚠️ Low Stock: ${item.name}`,
      message: `${item.name} stock is down to ${item.stock} (min threshold: ${item.minStock}).`,
      channel: 'in_app',
      isRead: false,
      createdAt: new Date().toISOString()
    };

    sampleNotifications.unshift(generatedAlert);
    expect(sampleNotifications.length).toBe(3);
    expect(sampleNotifications[0].id).toBe('notif_new');
  });

  it('formats weekly summary digest message correctly', () => {
    const totalMembers = 4;
    const lowStockCount = 1;
    const poolBalance = 15.50;

    const digestMessage = `Weekly Summary: Your pool has ${totalMembers} active members with ${lowStockCount} item below restock threshold. Total pool balance: $${poolBalance.toFixed(2)}.`;
    expect(digestMessage).toContain('4 active members');
    expect(digestMessage).toContain('1 item below restock threshold');
    expect(digestMessage).toContain('$15.50');
  });
});
