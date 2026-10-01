import { Pool, Item, Transaction, ShoppingListItem, PollItem } from '../types';

const STORAGE_KEYS = {
  POOLS: 'pantrypool_pools_v1',
  ACTIVE_POOL_ID: 'pantrypool_active_pool_id_v1',
  ACTIVE_USER_ID: 'pantrypool_active_user_id_v1',
  AUTH_USER: 'pantrypool_cached_auth_user_v1',
  ORGANIZATIONS: 'pantrypool_cached_orgs_v1',
  ACTIVE_ORG_ID: 'pantrypool_active_org_id_v1',
  ITEMS: 'pantrypool_items_v1',
  TRANSACTIONS: 'pantrypool_transactions_v1',
  SHOPPING: 'pantrypool_shopping_v1',
  POLLS: 'pantrypool_polls_v1',
  SOUND_ENABLED: 'pantrypool_sound_enabled_v1',
};

function getItem<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
    if (!raw && key.startsWith('pantrypool_')) {
      const legacyKey = key.replace('pantrypool_', 'stokd_');
      raw = localStorage.getItem(legacyKey);
    }
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    if (typeof raw === 'string' && raw.length > 0) {
      return raw as unknown as T;
    }
    console.warn(`[Storage] Failed to read key ${key}`, e);
    return fallback;
  }
}

function setItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[Storage] Failed to save key ${key}`, e);
  }
}

export function loadCachedAuthUser<T = any>(): T | null {
  return getItem<T | null>(STORAGE_KEYS.AUTH_USER, null);
}

export function saveCachedAuthUser(user: any): void {
  if (user) {
    setItem(STORAGE_KEYS.AUTH_USER, user);
  } else {
    localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
  }
}

export function loadCachedOrganizations<T = any>(): T[] {
  return getItem<T[]>(STORAGE_KEYS.ORGANIZATIONS, []);
}

export function saveCachedOrganizations(orgs: any[]): void {
  setItem(STORAGE_KEYS.ORGANIZATIONS, orgs);
}

export function loadActiveOrgId(): string {
  return getItem<string>(STORAGE_KEYS.ACTIVE_ORG_ID, '');
}

export function saveActiveOrgId(orgId: string): void {
  setItem(STORAGE_KEYS.ACTIVE_ORG_ID, orgId);
}

export function loadPools(forUserId?: string): Pool[] {
  const pools = getItem<Pool[]>(STORAGE_KEYS.POOLS, []);
  if (forUserId && pools.length > 0) {
    const belongs = pools.some((p) =>
      p.championId === forUserId ||
      p.members?.some((m: any) => m.id === forUserId || m.userId === forUserId || m.user_id === forUserId)
    );
    if (!belongs) {
      localStorage.removeItem(STORAGE_KEYS.POOLS);
      return [];
    }
  }
  return pools;
}

export function savePools(pools: Pool[]): void {
  setItem(STORAGE_KEYS.POOLS, pools);
}

export function loadActivePoolId(forUserId?: string): string {
  const pools = loadPools(forUserId);
  const saved = getItem<string>(STORAGE_KEYS.ACTIVE_POOL_ID, '');
  if (saved && pools.some((p) => p.id === saved)) {
    return saved;
  }
  return pools[0]?.id || '';
}

export function saveActivePoolId(id: string): void {
  setItem(STORAGE_KEYS.ACTIVE_POOL_ID, id);
}

export function loadActiveUserId(activePool?: Pool): string {
  if (!activePool || !Array.isArray(activePool.members)) return '';
  const saved = getItem<string>(STORAGE_KEYS.ACTIVE_USER_ID, '');
  if (saved && activePool.members.some((m) => m.id === saved)) {
    return saved;
  }
  return activePool.championId || activePool.members[0]?.id || '';
}

export function saveActiveUserId(id: string): void {
  setItem(STORAGE_KEYS.ACTIVE_USER_ID, id);
}

export function loadItems(): Item[] {
  return getItem<Item[]>(STORAGE_KEYS.ITEMS, []);
}

export function saveItems(items: Item[]): void {
  setItem(STORAGE_KEYS.ITEMS, items);
}

export function loadTransactions(): Transaction[] {
  return getItem<Transaction[]>(STORAGE_KEYS.TRANSACTIONS, []);
}

export function saveTransactions(txs: Transaction[]): void {
  setItem(STORAGE_KEYS.TRANSACTIONS, txs);
}

export function loadShoppingList(): ShoppingListItem[] {
  const raw = getItem<ShoppingListItem[]>(STORAGE_KEYS.SHOPPING, []);
  // Filter out any legacy mock demo items that may have been saved in browser localStorage
  return raw.filter((item) => item && item.id && !item.id.startsWith('sl') && item.poolId);
}

export function saveShoppingList(items: ShoppingListItem[]): void {
  setItem(STORAGE_KEYS.SHOPPING, items);
}

export function loadPolls(): PollItem[] {
  return getItem<PollItem[]>(STORAGE_KEYS.POLLS, []);
}

export function savePolls(polls: PollItem[]): void {
  setItem(STORAGE_KEYS.POLLS, polls);
}

export function isSoundEnabled(): boolean {
  return getItem<boolean>(STORAGE_KEYS.SOUND_ENABLED, true);
}

export function saveSoundEnabled(enabled: boolean): void {
  setItem(STORAGE_KEYS.SOUND_ENABLED, enabled);
}

export function clearUserData(options?: { preserveAuthTokens?: boolean }): void {
  Object.values(STORAGE_KEYS).forEach((key) => {
    if (key !== STORAGE_KEYS.SOUND_ENABLED) {
      localStorage.removeItem(key);
      if (key.startsWith('pantrypool_')) {
        localStorage.removeItem(key.replace('pantrypool_', 'stokd_'));
      }
    }
  });
  if (!options?.preserveAuthTokens) {
    localStorage.removeItem('pantrypool_token');
    localStorage.removeItem('pantrypool_auth_token');
    localStorage.removeItem('stokd_token');
  }
  localStorage.removeItem('pantrypool_offline_queue_v1');
  localStorage.removeItem('stokd_offline_queue_v1');
}
