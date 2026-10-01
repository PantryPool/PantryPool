import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getOfflineQueue,
  saveOfflineQueue,
  enqueueOfflineAction,
  removeOfflineItem,
  clearCompletedQueue,
  subscribeOfflineQueue,
  flushOfflineQueue,
} from '../src/lib/offlineQueue';

describe('Offline Mutation Queue System', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should enqueue offline actions with unique IDs and pending status', () => {
    const item = enqueueOfflineAction('consume_item', {
      poolId: 'test-pool-1',
      itemId: 'item-coffee',
      userId: 'user-1',
      quantity: 2,
    });

    expect(item.id).toMatch(/^off_/);
    expect(item.action).toBe('consume_item');
    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(0);

    const queue = getOfflineQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe(item.id);
  });

  it('should remove items and clear completed queue items', () => {
    const item1 = enqueueOfflineAction('consume_item', { poolId: 'p1' });
    const item2 = enqueueOfflineAction('deposit_transaction', { poolId: 'p1', amount: 10 });

    expect(getOfflineQueue().length).toBe(2);

    removeOfflineItem(item1.id);
    expect(getOfflineQueue().length).toBe(1);
    expect(getOfflineQueue()[0].id).toBe(item2.id);

    saveOfflineQueue([{ ...item2, status: 'completed' }]);
    clearCompletedQueue();
    expect(getOfflineQueue().length).toBe(0);
  });

  it('should notify subscribers when queue updates', () => {
    let notifiedItems: any[] = [];
    const unsubscribe = subscribeOfflineQueue((items) => {
      notifiedItems = items;
    });

    enqueueOfflineAction('vote_poll', { poolId: 'p1', pollId: 'poll1' });
    expect(notifiedItems.length).toBe(1);
    expect(notifiedItems[0].action).toBe('vote_poll');

    unsubscribe();
  });

  it('should flush offline queue via batch endpoint', async () => {
    enqueueOfflineAction('consume_item', { poolId: 'p1', itemId: 'i1', userId: 'u1' });

    // Mock fetch for batch endpoint
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        results: [{ id: getOfflineQueue()[0].id, success: true }],
      }),
    } as any);

    const result = await flushOfflineQueue();
    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });
});
