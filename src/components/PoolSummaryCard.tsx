import React, { useState } from 'react';
import { Pool, User, Item, Transaction } from '../types';
import { 
  PiggyBank, 
  Wallet, 
  Plus, 
  Copy, 
  Check,
  Settings,
  Zap,
  ShoppingBag,
  PackagePlus,
  Receipt,
  Share2,
  TrendingDown
} from 'lucide-react';

interface PoolSummaryCardProps {
  pool: Pool;
  activeUser: User;
  items: Item[];
  transactions: Transaction[];
  onOpenDeposit: () => void;
  onOpenSettleUp?: () => void;
  onOpenReceiptScanner: () => void;
  onOpenShoppingList: () => void;
  onOpenAddItem: () => void;
  onOpenManagePool?: () => void;
  onOpenSharePool?: () => void;
  onOpenSavings?: () => void;
  isManager?: boolean;
}

export const PoolSummaryCard: React.FC<PoolSummaryCardProps> = ({
  pool,
  activeUser,
  items,
  transactions = [],
  onOpenDeposit,
  onOpenSettleUp,
  onOpenReceiptScanner,
  onOpenShoppingList,
  onOpenAddItem,
  onOpenManagePool,
  onOpenSharePool,
  onOpenSavings,
  isManager,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);

  const isManagerUser = isManager !== undefined ? isManager : Boolean(
    activeUser && (
      activeUser.id === pool?.championId ||
      activeUser.role === 'champion' ||
      activeUser.role === 'admin' ||
      pool?.members?.find((m) => m.id === activeUser.id)?.role === 'champion' ||
      pool?.members?.find((m) => m.id === activeUser.id)?.role === 'admin'
    )
  );

  const poolItems = items.filter((i) => i.poolId === pool?.id);
  const lowStockCount = poolItems.filter((i) => i.stock <= i.minStock).length;

  const membersList = pool?.members || [];
  const netMemberBalance = membersList.reduce((acc, curr) => acc + curr.balance, 0);
  const totalPoolFund = ((pool?.initialReserveFund) || 0) + netMemberBalance;

  const totalPoolSavings = pool?.savingsEnabled
    ? transactions
        .filter((t) => (!t.poolId || t.poolId === pool?.id) && t.savingsCents && t.savingsCents > 0)
        .reduce((sum, t) => sum + (t.savingsCents! / 100), 0)
    : 0;

  const poolCode = pool?.code || (pool as any)?.qrCodeKey || (pool as any)?.qr_code_key || (typeof pool?.id === 'string' && pool.id.startsWith('pool_') && pool.id.length > 10 ? pool.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : pool?.id) || '';

  const handleShareClick = () => {
    if (onOpenSharePool) {
      onOpenSharePool();
    } else if (navigator?.clipboard && poolCode) {
      const inviteUrl = `${window.location.origin}/?join=${encodeURIComponent(poolCode)}`;
      navigator.clipboard.writeText(inviteUrl);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const formattedCurrency = (amount: number) => {
    const formatted = Math.abs(amount).toFixed(2);
    return `${pool?.currency || '$'}${formatted}`;
  };

  const currentUserMember = membersList.find((m) =>
    m.id === activeUser?.id ||
    (m as any).userId === activeUser?.id ||
    (m as any).user_id === activeUser?.id
  );
  const isPoolManager = activeUser?.id === pool?.championId || currentUserMember?.role === 'champion' || currentUserMember?.role === 'admin';
  const effectiveUserBalance = currentUserMember !== undefined ? currentUserMember.balance : (activeUser?.balance ?? 0);
  const isNegativeBalance = effectiveUserBalance < 0;

  return (
    <div className="bg-[#F0EBE3] border border-[#E0DAD1] rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-xs text-[#2D2D2D]">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
        
        {/* Left Side: Pool Name, Badges & Share / Code */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-[#2D2D2D] tracking-tight truncate">
            {pool.name}
          </h1>

          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-white text-[#6B6B6B] border border-[#E0DAD1] shrink-0">
            {pool.category}
          </span>

          <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border shrink-0 ${
            isPoolManager 
              ? 'bg-[#FFF8EB] text-[#8C5807] border-[#D4870E]/30 font-semibold' 
              : 'bg-white text-[#6B6B6B] border-[#E0DAD1]'
          }`}>
            {isPoolManager ? '👑 Manager' : '👤 Member'}
          </span>

          <button
            type="button"
            onClick={handleShareClick}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#E8694A]/10 hover:bg-[#E8694A]/20 text-[#E8694A] border border-[#E8694A]/30 transition cursor-pointer shrink-0 active:scale-[0.98]"
            title="Share invite link or copy pool code"
          >
            <Share2 className="h-3 w-3" />
            <span>Invite & Share</span>
          </button>
        </div>

        {/* Right Side: Balances Pill & Primary CTA */}
        <div className="flex items-center justify-between lg:justify-end gap-2 flex-wrap w-full lg:w-auto">
          
          {/* Balance Pills */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
            {/* My Balance */}
            <div 
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono-financial shadow-xs ${
                isNegativeBalance 
                  ? 'bg-[#FDF0EC] border-[#C9553D]/30 text-[#C9553D]' 
                  : 'bg-white border-[#E0DAD1] text-[#2D2D2D]'
              }`}
              title="Your personal balance in this pool"
            >
              <Wallet className="h-3.5 w-3.5 text-[#6B6B6B]" />
              <span className="text-[10px] text-[#6B6B6B] font-sans font-medium hidden xs:inline">My Bal:</span>
              <span className={`font-bold ${isNegativeBalance ? 'text-[#C9553D]' : 'text-[#5A9A6B]'}`}>
                {effectiveUserBalance >= 0 ? `+${formattedCurrency(effectiveUserBalance)}` : `-${formattedCurrency(effectiveUserBalance)}`}
              </span>
            </div>

            {/* Pool Reserve */}
            <div 
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#E0DAD1] text-xs font-mono-financial shadow-xs"
              title="Total collective pantry fund"
            >
              <PiggyBank className="h-3.5 w-3.5 text-[#5A9A6B]" />
              <span className="text-[10px] text-[#6B6B6B] font-sans font-medium hidden xs:inline">Reserve:</span>
              <span className="font-bold text-[#5A9A6B]">
                {formattedCurrency(totalPoolFund)}
              </span>
            </div>

            {/* Vending Savings Pill */}
            {pool?.savingsEnabled && onOpenSavings && (
              <button
                type="button"
                onClick={onOpenSavings}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EDF5EF] hover:bg-[#E3EFE5] border border-[#5A9A6B]/30 text-xs font-mono-financial shadow-xs transition cursor-pointer active:scale-95"
                title="Click to view Team Vending Savings & Leaderboard"
              >
                <TrendingDown className="h-3.5 w-3.5 text-[#5A9A6B]" />
                <span className="text-[10px] text-[#246A38] font-sans font-medium hidden xs:inline">Saved:</span>
                <span className="font-bold text-[#246A38]">
                  {formattedCurrency(totalPoolSavings)}
                </span>
              </button>
            )}
          </div>

          {/* Quick Restock Link & CTA Actions */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
            {lowStockCount > 0 && (
              <button
                onClick={onOpenShoppingList}
                className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-[#E8E2D9] text-[#D4870E] border border-[#D4870E]/30 text-xs font-medium transition cursor-pointer"
                title="View restock shopping list"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                <span>Restock ({lowStockCount})</span>
              </button>
            )}

            <button
              onClick={onOpenReceiptScanner}
              className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-white hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] font-medium text-xs shadow-xs transition cursor-pointer"
              title="Log items you brought in or scan a receipt to restock"
            >
              <PackagePlus className="h-3.5 w-3.5 text-[#E8694A]" />
              <span>Bring In Items</span>
            </button>

            {isNegativeBalance && onOpenSettleUp ? (
              <button
                onClick={onOpenSettleUp}
                className="flex items-center justify-center gap-1 px-3 py-1 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs shadow-xs transition cursor-pointer"
                title="1-Click Settle Up"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Settle Up</span>
              </button>
            ) : (
              <button
                onClick={onOpenDeposit}
                className="flex items-center justify-center gap-1 px-3 py-1 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs shadow-xs transition cursor-pointer"
                title="Add funds to pool"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Funds</span>
              </button>
            )}

            {isManagerUser && onOpenManagePool && (
              <button
                onClick={onOpenManagePool}
                className="p-1 rounded-lg text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white transition cursor-pointer"
                title="Pool Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

