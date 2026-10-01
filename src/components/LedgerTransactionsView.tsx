import React, { useState } from 'react';
import { Pool, Transaction, User } from '../types';
import { getDefaultAvatarUrl } from '../lib/avatar';
import { 
  History, 
  Search, 
  Download, 
  PlusCircle, 
  MinusCircle, 
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Undo2,
  Loader2
} from 'lucide-react';
import { AlertDialogModal, AlertDialogConfig } from './AlertDialogModal';

interface LedgerTransactionsViewProps {
  pool: Pool;
  transactions: Transaction[];
  activeUser: User;
  onRefundTransaction?: (tx: Transaction) => void;
}

export const LedgerTransactionsView: React.FC<LedgerTransactionsViewProps> = ({
  pool,
  transactions = [],
  activeUser,
  onRefundTransaction,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<AlertDialogConfig | null>(null);

  const poolId = pool?.id || '';
  const currency = pool?.currency || '$';
  const poolTxs = Array.isArray(transactions) 
    ? transactions.filter((t) => !poolId || t.poolId === poolId || !t.poolId)
    : [];

  // Dynamically compute running snapshot balances per user across pool transactions
  const poolTxsWithBalances = React.useMemo(() => {
    const sortedAsc = [...poolTxs].sort((a, b) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeA - timeB;
    });

    const userRunningSums = new Map<string, number>();
    const computedBalances = new Map<string, number>();

    for (const tx of sortedAsc) {
      const uId = tx.userId || tx.createdByName || 'unknown';
      const currentRun = userRunningSums.get(uId) ?? 0;
      const rawAmt = Number(tx.amount || 0);
      const rawType = String(tx.type || '');
      const isDeposit = rawType === 'deposit' || rawType === 'contribution';
      const isConsume = rawType === 'consume' || rawType === 'consumption';
      const delta = isDeposit ? Math.abs(rawAmt) : isConsume ? -Math.abs(rawAmt) : rawAmt;
      const nextRun = Number((currentRun + delta).toFixed(2));
      userRunningSums.set(uId, nextRun);

      const resolvedBalance = (tx.resultingBalance !== undefined && tx.resultingBalance !== null && tx.resultingBalance !== 0)
        ? tx.resultingBalance
        : nextRun;
      computedBalances.set(tx.id, resolvedBalance);
    }

    return poolTxs.map((t) => ({
      ...t,
      resultingBalance: computedBalances.get(t.id) ?? t.resultingBalance ?? 0
    }));
  }, [poolTxs]);

  const resolveMember = (tx: any) => {
    const memberMatch = pool?.members?.find(
      (m) => m.id === tx.userId || (m as any).userId === tx.userId || (m as any).user_id === tx.userId
    );
    const creatorName =
      (tx.createdByName && tx.createdByName !== 'Pool Member')
        ? tx.createdByName
        : (tx.userName && tx.userName !== 'Pool Member')
        ? tx.userName
        : (memberMatch?.name || (tx.userId === activeUser?.id ? activeUser?.name : null) || tx.createdByName || 'Pool Member');

    const creatorAvatar =
      tx.createdByAvatar ||
      tx.userAvatar ||
      tx.avatar ||
      memberMatch?.avatar ||
      (memberMatch as any)?.avatarUrl ||
      (tx.userId === activeUser?.id ? (activeUser?.avatar || (activeUser as any)?.avatarUrl) : null) ||
      getDefaultAvatarUrl(creatorName);

    return { creatorName, creatorAvatar };
  };

  const filteredTxs = poolTxsWithBalances.filter((tx) => {
    const { creatorName } = resolveMember(tx);
    const itemName = tx.itemName || '';
    const note = tx.note || (tx as any).description || '';
    const q = search.toLowerCase();

    const matchesSearch =
      creatorName.toLowerCase().includes(q) ||
      itemName.toLowerCase().includes(q) ||
      note.toLowerCase().includes(q);

    const rawType = String(tx.type || '');
    const txType = rawType === 'deposit' ? 'contribution' : rawType === 'consume' ? 'consumption' : (rawType || 'consumption');
    const matchesType = filterType === 'all' || txType === filterType;
    return matchesSearch && matchesType;
  });

  const handleDownloadCSV = () => {
    const headers = ['Transaction ID', 'Timestamp', 'User', 'Type', 'Item/Note', 'Amount', 'Snapshot Balance'];
    const rows = filteredTxs.map((t) => {
      const { creatorName } = resolveMember(t);
      const rawType = String(t.type || '');
      const tType = rawType === 'deposit' ? 'contribution' : rawType === 'consume' ? 'consumption' : (rawType || 'consumption');
      const isCons = tType === 'consumption';
      const isDep = tType === 'contribution';
      const rawAmt = Number(t.amount || 0);
      const csvAmt = isCons ? -Math.abs(rawAmt) : (isDep ? Math.abs(rawAmt) : rawAmt);
      return [
        t.id,
        t.timestamp || new Date().toISOString(),
        creatorName,
        tType,
        t.itemName || t.note || (t as any).description || '',
        csvAmt.toFixed(2),
        Number(t.resultingBalance ?? 0).toFixed(2),
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pantrypool_ledger_${poolId || 'pool'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRefund = (tx: Transaction) => {
    if (!onRefundTransaction) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Void / Refund Transaction',
      message: `Void and refund this transaction for ${currency}${Math.abs(Number(tx.amount)).toFixed(2)}? This will create a balanced correcting entry and update the member's balance.`,
      type: 'confirm',
      confirmText: 'Confirm Refund',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setRefundingId(tx.id);
        await onRefundTransaction(tx);
        setRefundingId(null);
      },
      onClose: () => setConfirmConfig(null)
    });
  };

  // Pre-calculate set of transaction IDs that have already been refunded
  const refundedTxIds = new Set<string>();
  transactions.forEach((t) => {
    const tType = (t.type as string) || '';
    const desc = t.note || (t as any).description || '';
    if (tType === 'refund' && desc) {
      const match = desc.match(/tx[-_a-zA-Z0-9]+/);
      if (match) {
        refundedTxIds.add(match[0]);
      }
    }
  });

  const isAlreadyRefunded = (tx: Transaction): boolean => {
    if (tx.type === 'refund') return true;
    if (refundedTxIds.has(tx.id)) return true;
    return false;
  };

  const canActuallyRefund = (tx: Transaction): boolean => {
    const typeStr = tx.type as string;
    if (typeStr === 'refund' || typeStr === 'adjustment' || typeStr === 'discrepancy') return false;
    const isOwner = tx.userId === activeUser.id;
    const isPoolAdmin = activeUser.role === 'champion' || activeUser.role === 'admin' || (activeUser as any).systemRole === 'superadmin' || (activeUser as any).systemRole === 'admin';
    return isOwner || isPoolAdmin;
  };

  return (
    <div className="bg-white border border-[#E0DAD1] rounded-lg p-5 sm:p-6 shadow-xs text-[#2D2D2D] space-y-5">
      {confirmConfig && (
        <AlertDialogModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          type={confirmConfig.type}
          confirmText={confirmConfig.confirmText}
          cancelText={confirmConfig.cancelText}
          onConfirm={confirmConfig.onConfirm}
          onClose={confirmConfig.onClose}
        />
      )}
      
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EDE8E0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#E8694A]" />
            <h2 className="text-lg font-semibold text-[#2D2D2D] tracking-tight">
              Shared Breakroom Ledger
            </h2>
          </div>
          <p className="text-xs text-[#6B6B6B]">
            Complete transparent audit log of all contributions, consumptions, and refunds in {pool.name}
          </p>
        </div>

        <button
          onClick={handleDownloadCSV}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#FAFAF8] border border-[#E0DAD1] text-xs font-medium text-[#2D2D2D] hover:bg-[#F0EBE3] transition shadow-xs self-start sm:self-auto"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#6B6B6B]" />
          <input
            type="text"
            placeholder="Search member, item, or note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#FAFAF8] border border-[#E0DAD1] rounded-md text-sm text-[#2D2D2D] placeholder-[#6B6B6B] focus:outline-none focus:border-[#E8694A] transition"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#FAFAF8] p-1 border border-[#E0DAD1] rounded-md self-start sm:self-auto overflow-x-auto max-w-full">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#6B6B6B] ml-2 mr-1 hidden sm:inline" />
          <button
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 text-xs rounded transition whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-white text-[#2D2D2D] font-semibold shadow-xs border border-[#E0DAD1]'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            All Logs
          </button>
          <button
            onClick={() => setFilterType('consumption')}
            className={`px-2.5 py-1 text-xs rounded transition whitespace-nowrap ${
              filterType === 'consumption'
                ? 'bg-white text-[#E8694A] font-semibold shadow-xs border border-[#E0DAD1]'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            Consumptions
          </button>
          <button
            onClick={() => setFilterType('contribution')}
            className={`px-2.5 py-1 text-xs rounded transition whitespace-nowrap ${
              filterType === 'contribution'
                ? 'bg-white text-[#5A9A6B] font-semibold shadow-xs border border-[#E0DAD1]'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            Deposits
          </button>
          <button
            onClick={() => setFilterType('refund')}
            className={`px-2.5 py-1 text-xs rounded transition whitespace-nowrap ${
              filterType === 'refund'
                ? 'bg-white text-[#5A9A6B] font-semibold shadow-xs border border-[#E0DAD1]'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            Refunds
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-[#F0EBE3] text-[#6B6B6B] font-medium border-b border-[#E0DAD1]">
              <th className="p-3 rounded-l-md">Date & Time</th>
              <th className="p-3">Member</th>
              <th className="p-3">Action Type</th>
              <th className="p-3">Item / Description</th>
              <th className="p-3 text-right">Amount</th>
              <th className="p-3 text-right">Member Balance</th>
              {onRefundTransaction && <th className="p-3 text-right rounded-r-md">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDE8E0]">
            {filteredTxs.length === 0 ? (
              <tr>
                <td colSpan={onRefundTransaction ? 7 : 6} className="text-center py-8 text-[#6B6B6B]">
                  No transactions found matching criteria.
                </td>
              </tr>
            ) : (
              filteredTxs.map((tx) => {
                const rawType = String(tx.type || '');
                const txType = rawType === 'deposit' ? 'contribution' : rawType === 'consume' ? 'consumption' : (rawType || 'consumption');
                const isContribution = txType === 'contribution';
                const isConsumption = txType === 'consumption';
                const isAdjustment = txType === 'adjustment' || rawType === 'discrepancy';
                const isRefund = txType === 'refund';
                const { creatorName, creatorAvatar } = resolveMember(tx);
                const rawAmount = Number(tx.amount || 0);
                const displayAmount = isConsumption ? -Math.abs(rawAmount) : (isContribution ? Math.abs(rawAmount) : rawAmount);
                const resultingBalance = Number(tx.resultingBalance ?? 0);
                
                let dateStr = 'Recent';
                try {
                  if (tx.timestamp) {
                    dateStr = new Date(tx.timestamp).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                  }
                } catch (e) {}

                return (
                  <tr key={tx.id || `tx-${Math.random()}`} className={`hover:bg-[#FAFAF8] transition-colors ${isRefund ? 'bg-[#EDF5EF]/40' : ''}`}>
                    <td className="p-3 font-mono-financial text-xs text-[#6B6B6B] whitespace-nowrap">
                      {dateStr}
                    </td>

                    <td className="p-3 font-medium text-[#2D2D2D] whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <img
                          src={creatorAvatar}
                          alt={creatorName}
                          className="h-6 w-6 rounded-full object-cover ring-1 ring-[#E0DAD1] shrink-0 bg-[#F0EBE3]"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = getDefaultAvatarUrl(creatorName);
                          }}
                        />
                        <span>{creatorName}</span>
                      </div>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      {isContribution ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30 font-mono-financial">
                          <PlusCircle className="h-3 w-3" />
                          <span>Deposit</span>
                        </span>
                      ) : isConsumption ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/30 font-mono-financial">
                          <MinusCircle className="h-3 w-3" />
                          <span>Consume</span>
                        </span>
                      ) : isAdjustment ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#F0EBE3] text-[#2D2D2D] border border-[#E0DAD1] font-mono-financial">
                          <Scale className="h-3 w-3 text-[#D4870E]" />
                          <span>Adjustment</span>
                        </span>
                      ) : isRefund ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30 font-mono-financial">
                          <Undo2 className="h-3 w-3" />
                          <span>Refund</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF8EB] text-[#D4870E] border border-[#D4870E]/30 font-mono-financial">
                          <RotateCcw className="h-3 w-3" />
                          <span>{txType}</span>
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-[#2D2D2D] max-w-xs truncate">
                      {tx.itemName ? (
                        <span className="font-medium text-[#2D2D2D]">
                          {tx.quantity && Math.abs(tx.quantity) > 0 ? (
                            <span className="font-mono-financial font-medium text-[#6B6B6B] mr-1">
                              ({tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity})
                            </span>
                          ) : ''}
                          {tx.itemName}
                        </span>
                      ) : (
                        tx.note || (tx as any).description || 'General transaction'
                      )}
                      {(tx.note || (tx as any).description) && (
                        <span className="text-[#6B6B6B] block text-[10px] truncate">{tx.note || (tx as any).description}</span>
                      )}
                    </td>

                    <td className={`p-3 text-right font-mono-financial font-semibold text-sm whitespace-nowrap ${
                      isAdjustment && displayAmount === 0 ? 'text-[#6B6B6B]' : displayAmount > 0 ? 'text-[#5A9A6B]' : 'text-[#E8694A]'
                    }`}>
                      {isAdjustment && displayAmount === 0 ? '—' : `${displayAmount > 0 ? '+' : '-'}${currency}${Math.abs(displayAmount).toFixed(2)}`}
                    </td>

                    <td className={`p-3 text-right font-mono-financial font-medium whitespace-nowrap ${
                      resultingBalance > 0 ? 'text-[#5A9A6B]' : resultingBalance < 0 ? 'text-[#C9553D]' : 'text-[#6B6B6B]'
                    }`}>
                      {resultingBalance < 0 ? `-${currency}${Math.abs(resultingBalance).toFixed(2)}` : `${currency}${resultingBalance.toFixed(2)}`}
                    </td>

                    {onRefundTransaction && (
                      <td className="p-3 text-right whitespace-nowrap">
                        {isAlreadyRefunded(tx) ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-[#8C827A] bg-[#F5F2EC] border border-[#E0DAD1] rounded px-2 py-0.5"
                            title="This transaction was already voided and refunded"
                          >
                            <Undo2 className="h-2.5 w-2.5 text-[#8C827A]" />
                            <span>Refunded</span>
                          </span>
                        ) : canActuallyRefund(tx) ? (
                          <button
                            onClick={() => handleRefund(tx)}
                            disabled={refundingId === tx.id || isRefund}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6B6B6B] hover:text-[#C9553D] border border-[#E0DAD1] hover:border-[#C9553D]/40 rounded px-2 py-0.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Void / Refund this transaction"
                          >
                            {refundingId === tx.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Undo2 className="h-3 w-3" />
                            )}
                            <span>{refundingId === tx.id ? 'Voiding...' : 'Void'}</span>
                          </button>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Customized Confirmation Dialog */}
      {confirmConfig && (
        <AlertDialogModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          type={confirmConfig.type}
          confirmText={confirmConfig.confirmText}
          cancelText={confirmConfig.cancelText}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}

    </div>
  );
};
