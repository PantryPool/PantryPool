/**
 * Offline Mutation Queue for PantryPool
 * Provides resilient buffering for transactions, inventory takes, and pool mutations
 * when the network is unavailable or backend edge instances fail.
 */

export type OfflineActionType =
  | 'consume_item'
  | 'deposit_transaction'
  | 'adjust_discrepancy'
  | 'vote_poll'
  | 'add_shopping_item'
  | 'update_shopping_item'
  | 'create_pool'
  | 'update_pool';

export interface OfflineQueueItem {
  id: string;
  action: OfflineActionType;
  payload: any;
  timestamp: string;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  lastError?: string;
}

const STORAGE_KEY = 'pantrypool_offline_queue_v1';
const listeners: Array<(items: OfflineQueueItem[]) => void> = [];

function notifyListeners(items: OfflineQueueItem[]) {
  listeners.forEach((fn) => {
    try {
      fn(items);
    } catch (err) {
      console.warn('[OfflineQueue] Listener error:', err);
    }
  });
}

export function getOfflineQueue(): OfflineQueueItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[OfflineQueue] Failed to parse queue from storage', e);
    return [];
  }
}

export function saveOfflineQueue(items: OfflineQueueItem[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    notifyListeners(items);
  } catch (e) {
    console.warn('[OfflineQueue] Failed to save queue to storage', e);
  }
}

export function enqueueOfflineAction(action: OfflineActionType, payload: any): OfflineQueueItem {
  const queue = getOfflineQueue();
  const newItem: OfflineQueueItem = {
    id: 'off_' + (payload?.transactionId || crypto.randomUUID()),
    action,
    payload,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    status: 'pending',
  };

  queue.push(newItem);
  saveOfflineQueue(queue);
  console.info(`[OfflineQueue] Enqueued action "${action}" (${newItem.id})`);
  return newItem;
}

export function removeOfflineItem(id: string): void {
  const queue = getOfflineQueue();
  const filtered = queue.filter((item) => item.id !== id);
  saveOfflineQueue(filtered);
}

export function clearCompletedQueue(): void {
  const queue = getOfflineQueue();
  const pending = queue.filter((item) => item.status !== 'completed');
  saveOfflineQueue(pending);
}

export function subscribeOfflineQueue(callback: (items: OfflineQueueItem[]) => void): () => void {
  listeners.push(callback);
  callback(getOfflineQueue());
  return () => {
    const index = listeners.indexOf(callback);
    if (index !== -1) listeners.splice(index, 1);
  };
}

let isFlushing = false;

/**
 * Flushes all pending actions in the offline queue to the server.
 */
export async function flushOfflineQueue(): Promise<{ total: number; succeeded: number; failed: number }> {
  if (isFlushing) return { total: 0, succeeded: 0, failed: 0 };
  const queue = getOfflineQueue();
  const pending = queue.filter((item) => item.status === 'pending' || item.status === 'failed');

  if (pending.length === 0) {
    return { total: 0, succeeded: 0, failed: 0 };
  }

  isFlushing = true;
  let succeeded = 0;
  let failed = 0;

  // Mark pending items as syncing
  const updatedQueue = queue.map((item) =>
    item.status === 'pending' || item.status === 'failed' ? { ...item, status: 'syncing' as const } : item
  );
  saveOfflineQueue(updatedQueue);

  // Try bulk batch sync endpoint first
  try {
    const batchPayload = pending.map((item) => ({
      id: item.id,
      action: item.action,
      payload: item.payload,
    }));

    const response = await fetch('/api/sync/offline-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('pantrypool_token') || ''}`,
      },
      body: JSON.stringify({ actions: batchPayload }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && Array.isArray(data.results)) {
        const resultMap = new Map<string, { success: boolean; error?: string }>(
          data.results.map((r: any) => [r.id, r])
        );

        const finalizedQueue = getOfflineQueue()
          .map((item) => {
            const res = resultMap.get(item.id);
            if (res) {
              if (res.success) {
                succeeded++;
                return { ...item, status: 'completed' as const };
              } else {
                failed++;
                return {
                  ...item,
                  status: 'failed' as const,
                  retryCount: item.retryCount + 1,
                  lastError: res.error || 'Sync failed',
                };
              }
            }
            return item;
          })
          .filter((item) => item.status !== 'completed'); // remove completed items to keep storage clean

        saveOfflineQueue(finalizedQueue);
        isFlushing = false;
        return { total: pending.length, succeeded, failed };
      }
    }
  } catch (batchErr) {
    console.warn('[OfflineQueue] Batch endpoint unreachable, falling back to individual syncs:', batchErr);
  }

  // Fallback to individual dispatch if batch is unavailable or failed
  for (const item of pending) {
    try {
      let res: Response | null = null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('pantrypool_token') || ''}`,
      };

      switch (item.action) {
        case 'consume_item':
          res = await fetch('/api/items/consume', {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...item.payload, transactionId: item.id }),
          });
          break;

        case 'deposit_transaction':
          res = await fetch('/api/transactions/deposit', {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...item.payload, transactionId: item.id }),
          });
          break;

        case 'adjust_discrepancy':
          res = await fetch('/api/items/discrepancy', {
            method: 'POST',
            headers,
            body: JSON.stringify(item.payload),
          });
          break;

        case 'vote_poll':
          res = await fetch(`/api/pools/${encodeURIComponent(item.payload.poolId)}/polls/${encodeURIComponent(item.payload.pollId)}/vote`, {
            method: 'POST',
            headers,
            body: JSON.stringify(item.payload),
          });
          break;

        case 'add_shopping_item':
          res = await fetch(`/api/pools/${encodeURIComponent(item.payload.poolId)}/shopping-list`, {
            method: 'POST',
            headers,
            body: JSON.stringify(item.payload),
          });
          break;

        case 'create_pool':
          res = await fetch('/api/pools', {
            method: 'POST',
            headers,
            body: JSON.stringify(item.payload),
          });
          break;

        case 'update_pool':
          res = await fetch(`/api/pools/${encodeURIComponent(item.payload.poolId)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(item.payload),
          });
          break;
      }

      if (res && (res.ok || res.status === 409)) {
        succeeded++;
        const q = getOfflineQueue().filter((i) => i.id !== item.id);
        saveOfflineQueue(q);
      } else {
        failed++;
        const errorText = res ? await res.text() : 'Network error';
        const q = getOfflineQueue().map((i) =>
          i.id === item.id
            ? { ...i, status: 'failed' as const, retryCount: i.retryCount + 1, lastError: errorText }
            : i
        );
        saveOfflineQueue(q);
      }
    } catch (e: any) {
      failed++;
      const q = getOfflineQueue().map((i) =>
        i.id === item.id
          ? { ...i, status: 'failed' as const, retryCount: i.retryCount + 1, lastError: e.message || String(e) }
          : i
      );
      saveOfflineQueue(q);
    }
  }

  isFlushing = false;
  return { total: pending.length, succeeded, failed };
}

// Auto-register network connectivity listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('[OfflineQueue] Connection restored! Flushing offline queue...');
    flushOfflineQueue();
  });

  // Background retry interval (every 30 seconds if online)
  setInterval(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const queue = getOfflineQueue();
      if (queue.some((i) => i.status === 'pending' || i.status === 'failed')) {
        flushOfflineQueue();
      }
    }
  }, 30000);
}
