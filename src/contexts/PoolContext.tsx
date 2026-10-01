import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Pool, Item, Transaction } from '../types';
import { loadPools, savePools, loadActivePoolId, saveActivePoolId, loadItems, saveItems, loadTransactions, saveTransactions } from '../lib/storage';
import { fetchPools, fetchItems, fetchTransactions, consumeItemApi, addDepositApi, refundTransactionApi } from '../lib/api';
import { playConsumeSound, playDepositSound } from '../lib/sound';
import { getDefaultAvatarUrl } from '../lib/avatar';

export interface PoolContextType {
  pools: Pool[];
  activePoolId: string;
  activePool: Pool | undefined;
  items: Item[];
  transactions: Transaction[];
  setActivePoolId: (id: string) => void;
  refreshPools: () => Promise<void>;
  refreshItems: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  consumeItem: (item: Item, targetUserId?: string) => Promise<boolean>;
  recordDeposit: (amount: number, targetUserId: string, note?: string) => Promise<boolean>;
  refundTransaction: (txId: string) => Promise<boolean>;
}

const PoolContext = createContext<PoolContextType | undefined>(undefined);

export const PoolProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pools, setPools] = useState<Pool[]>(loadPools);
  const [activePoolId, setActivePoolIdState] = useState<string>(loadActivePoolId);
  const [items, setItems] = useState<Item[]>(loadItems);
  const [transactions, setTransactions] = useState<Transaction[]>(loadTransactions);

  const activePool: Pool | undefined = pools.find((p) => p.id === activePoolId) || pools[0];

  const setActivePoolId = useCallback((id: string) => {
    setActivePoolIdState(id);
    saveActivePoolId(id);
  }, []);

  const refreshPools = useCallback(async () => {
    try {
      const serverPools = await fetchPools();
      if (Array.isArray(serverPools)) {
        const normalized: Pool[] = serverPools.map((p: any) => ({
          id: p.id,
          organizationId: p.organizationId,
          name: p.name,
          description: p.description || '',
          code: p.code || p.qrCodeKey || p.qr_code_key || (typeof p.id === 'string' && p.id.startsWith('pool_') && p.id.length > 10 ? p.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : p.id) || '',
          currency: p.currency || '$',
          championId: p.championId || '',
          members: Array.isArray(p.members) ? p.members.map((m: any) => ({
            id: m.id,
            name: m.name,
            email: m.email || '',
            avatar: m.avatar || m.avatarUrl || getDefaultAvatarUrl(m.name),
            avatarUrl: m.avatarUrl || m.avatar || getDefaultAvatarUrl(m.name),
            role: m.role || 'member',
            balance: Number(m.balance || 0),
            joinedAt: m.joinedAt || new Date().toISOString(),
          })) : [],
          createdAt: p.createdAt || new Date().toISOString(),
          category: p.category || 'Office',
          initialReserveFund: p.initialReserveFund,
          kioskPin: p.kioskPin
        }));
        setPools(normalized);
        savePools(normalized);
      }
    } catch (e) {
      // Fallback to local storage on offline drop
    }
  }, []);

  const refreshItems = useCallback(async () => {
    if (!activePool?.id) return;
    try {
      const serverItems = await fetchItems(activePool.id);
      if (Array.isArray(serverItems)) {
        const normalized: Item[] = serverItems.map((i: any) => ({
          id: i.id,
          poolId: i.poolId || activePool.id,
          name: i.name,
          category: i.category || 'Snacks',
          costPerUnit: Number(i.costPerUnit || 0),
          costPerUnitCents: i.costPerUnitCents,
          stock: Number(i.stock ?? 0),
          minStock: Number(i.minStock ?? 5),
          unitName: i.unitName || 'unit',
          icon: i.icon || 'package',
          imageUrl: i.imageUrl,
          description: i.description,
          lastRestockedAt: i.lastRestockedAt
        }));
        setItems(normalized);
        saveItems(normalized);
      }
    } catch (e) {}
  }, [activePool?.id]);

  const refreshTransactions = useCallback(async () => {
    if (!activePool?.id) return;
    try {
      const serverTxs = await fetchTransactions(activePool.id);
      if (Array.isArray(serverTxs)) {
        const normalized: Transaction[] = serverTxs.map((t: any) => ({
          id: t.id,
          poolId: t.poolId || t.pool_id || activePool.id,
          userId: t.userId || t.user_id || '',
          type: t.type === 'deposit' ? 'contribution' : t.type === 'consume' ? 'consumption' : (t.type || 'consumption'),
          amount: Number(t.amount || 0),
          amountCents: t.amountCents ?? t.amount_cents,
          savingsCents: t.savingsCents ?? t.savings_cents ?? 0,
          itemId: t.itemId || t.item_id,
          itemName: t.itemName || t.item_name || (t.type === 'deposit' ? 'Balance Deposit' : 'Item'),
          quantity: t.quantity ? Number(t.quantity) : undefined,
          timestamp: t.timestamp || t.created_at || t.createdAt || new Date().toISOString(),
          note: t.note || t.description || '',
          createdByName: t.createdByName || t.userName || t.user_name || 'Pool Member',
          createdByAvatar: t.createdByAvatar || t.userAvatar || t.user_avatar || t.avatar || t.avatarUrl,
          resultingBalance: Number(t.resultingBalance ?? 0),
        }));
        setTransactions(normalized);
        saveTransactions(normalized);
      }
    } catch (e) {}
  }, [activePool?.id]);

  useEffect(() => {
    refreshPools();
  }, [refreshPools]);

  useEffect(() => {
    if (activePool?.id) {
      refreshItems();
      refreshTransactions();
    }
  }, [activePool?.id, refreshItems, refreshTransactions]);

  const consumeItem = useCallback(async (item: Item, targetUserId?: string): Promise<boolean> => {
    if (!activePool) return false;
    const userId = targetUserId || activePool.members[0]?.id;
    if (!userId) return false;

    playConsumeSound();

    // Optimistically decrement item stock immediately
    setItems((currentItems) => {
      const updated = currentItems.map((i) =>
        i.id === item.id ? { ...i, stock: Math.max(0, i.stock - 1) } : i
      );
      saveItems(updated);
      return updated;
    });

    const res = await consumeItemApi(activePool.id, item.id, userId);
    if (res.success) {
      if (typeof res.remainingStock === 'number' || typeof res.newStock === 'number') {
        const finalStock = typeof res.remainingStock === 'number' ? res.remainingStock : res.newStock;
        setItems((currentItems) => {
          const updated = currentItems.map((i) =>
            i.id === item.id ? { ...i, stock: finalStock } : i
          );
          saveItems(updated);
          return updated;
        });
      }
      refreshTransactions();
      refreshPools();
      return true;
    } else {
      refreshItems();
    }
    return false;
  }, [activePool, refreshItems, refreshTransactions, refreshPools]);

  const recordDeposit = useCallback(async (amount: number, targetUserId: string, note?: string): Promise<boolean> => {
    if (!activePool) return false;
    playDepositSound();
    const res = await addDepositApi(activePool.id, targetUserId, amount, note);
    if (res.success) {
      refreshTransactions();
      refreshPools();
      return true;
    }
    return false;
  }, [activePool, refreshTransactions, refreshPools]);

  const refundTransaction = useCallback(async (txId: string): Promise<boolean> => {
    const res = await refundTransactionApi(txId);
    if (res.success) {
      refreshTransactions();
      refreshPools();
      return true;
    }
    return false;
  }, [refreshTransactions, refreshPools]);

  return (
    <PoolContext.Provider
      value={{
        pools,
        activePoolId,
        activePool,
        items,
        transactions,
        setActivePoolId,
        refreshPools,
        refreshItems,
        refreshTransactions,
        consumeItem,
        recordDeposit,
        refundTransaction,
      }}
    >
      {children}
    </PoolContext.Provider>
  );
};

export function usePool(): PoolContextType {
  const context = useContext(PoolContext);
  if (!context) {
    throw new Error('usePool must be used within a PoolProvider');
  }
  return context;
}
