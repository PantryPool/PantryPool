import React, { useState } from 'react';
import { Pool, User, Item } from '../types';
import { 
  X, 
  Monitor, 
  Check, 
  UserCheck,
  DollarSign,
  Trophy,
  Sparkles,
  HeartHandshake
} from 'lucide-react';
import { PantryPoolIcon } from './Logo';
import { lazyWithRetry } from '../lib/lazyWithRetry';
const SettleUpModal = lazyWithRetry(() => import('./SettleUpModal').then(m => ({ default: m.SettleUpModal })));

interface ConsumptionKioskModalProps {
  pool: Pool & { kioskPin?: string };
  items: Item[];
  onClose: () => void;
  onConsumeItem: (item: Item, selectedUserId: string) => void;
  kioskPin?: string;
}

export const ConsumptionKioskModal: React.FC<ConsumptionKioskModalProps> = ({
  pool,
  items,
  onClose,
  onConsumeItem,
  kioskPin = '1234',
}) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(pool.members[0] || null);
  const [lastConsumedName, setLastConsumedName] = useState<string | null>(null);
  const [showSettleModal, setShowSettleModal] = useState(false);

  // PIN / Passcode Lock state for unattended breakroom wall mounts
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const adminPin = pool.kioskPin || kioskPin || '1234';
  const maxDeficit = pool.maxDeficit !== undefined ? Number(pool.maxDeficit) : 10.00;

  const poolItems = items.filter((i) => i.poolId === pool.id);

  const handleTapConsume = (item: Item) => {
    if (!selectedUser || item.stock <= 0) return;
    const prospective = selectedUser.balance - item.costPerUnit;
    if (maxDeficit >= 0 && prospective < -maxDeficit - 0.0001) {
      setLastConsumedName(`🛑 Spending blocked for ${selectedUser.name}! Limit reached.`);
      setTimeout(() => setLastConsumedName(null), 4000);
      setShowSettleModal(true);
      return;
    }
    onConsumeItem(item, selectedUser.id);

    const benchmarkCents = item.vendingBenchmarkCents || 0;
    const costCents = item.costPerUnitCents !== undefined ? item.costPerUnitCents : Math.round(item.costPerUnit * 100);
    const savingsCents = (pool.savingsEnabled && benchmarkCents > costCents) ? (benchmarkCents - costCents) : 0;
    const currency = pool.currency || '$';

    if (savingsCents > 0) {
      const savingsStr = (savingsCents / 100).toFixed(2);
      setLastConsumedName(`🎉 ${item.name} logged for ${selectedUser.name}! 💰 Saved ${currency}${savingsStr} vs vending!`);
    } else {
      setLastConsumedName(`${item.name} logged for ${selectedUser.name}!`);
    }
    setTimeout(() => setLastConsumedName(null), 3000);
  };

  const handleAttemptExit = () => {
    if (isPinLocked) {
      setShowUnlockModal(true);
      setEnteredPin('');
      setPinError(null);
    } else {
      onClose();
    }
  };

  const handleVerifyUnlockPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPin === adminPin) {
      setShowUnlockModal(false);
      onClose();
    } else {
      setPinError('Incorrect Admin PIN. Please check your pool settings.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FAFAF8] flex flex-col p-4 sm:p-6 overflow-hidden text-[#2D2D2D] animate-in fade-in duration-200">
      
      {/* Kiosk Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#E0DAD1]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#E8694A] text-white shadow-xs">
            <Monitor className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#2D2D2D] tracking-tight flex items-center gap-2">
              <span>Breakroom Quick Kiosk</span>
              {isPinLocked && (
                <span className="px-2 py-0.5 rounded-md bg-[#FFF8EB] text-[#D4870E] border border-[#D4870E]/40 text-xs font-medium">
                  🔒 PIN Locked
                </span>
              )}
            </h2>
            <p className="text-xs text-[#6B6B6B]">
              {pool.name} • Tap item to deduct from member balance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPinLocked(!isPinLocked)}
            className={`px-3.5 py-2 rounded-full text-xs font-medium border border-[#E0DAD1] transition flex items-center gap-1.5 shadow-xs ${
              isPinLocked
                ? 'bg-[#FFF8EB] border-[#D4870E]/40 text-[#D4870E]'
                : 'bg-white text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
            title="Lock kiosk with 4-digit PIN"
          >
            <span>{isPinLocked ? '🔒 PIN Lock Active' : '🔓 Lock Tablet'}</span>
          </button>

          <button
            onClick={handleAttemptExit}
            className="px-4 py-2 rounded-full bg-white hover:bg-[#F0EBE3] text-[#2D2D2D] border border-[#E0DAD1] text-xs font-medium transition shadow-xs flex items-center gap-1.5"
          >
            <X className="h-4 w-4" />
            <span>Exit Kiosk</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Split View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 mt-4 sm:mt-6 overflow-hidden">
        
        {/* Left Column: Member Selector */}
        <div className="lg:col-span-1 bg-white border border-[#E0DAD1] rounded-lg p-4 flex flex-col justify-between overflow-hidden shadow-xs">
          <div className="overflow-y-auto pr-1">
            <div className="flex items-center gap-2 mb-3 px-1">
              <UserCheck className="h-4 w-4 text-[#E8694A]" />
              <h3 className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider">
                Select Member ({pool.members.length})
              </h3>
            </div>

            <div className="space-y-2">
              {pool.members.map((member) => {
                const isSelected = selectedUser?.id === member.id;
                const isOverLimit = maxDeficit >= 0 && member.balance <= -maxDeficit;
                return (
                  <button
                    key={member.id}
                    onClick={() => setSelectedUser(member)}
                    className={`w-full p-3 rounded-lg flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-[#E8694A] text-white font-medium shadow-xs ring-1 ring-[#E8694A]'
                        : 'bg-white hover:bg-[#FAFAF8] text-[#2D2D2D] border border-[#E0DAD1]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={member.avatar}
                        alt={member.name}
                        className="h-10 w-10 rounded-full object-cover ring-1 ring-white/40"
                      />
                      <div className="text-left">
                        <div className="text-sm font-medium leading-tight flex items-center gap-1.5">
                          <span>{member.name}</span>
                          {isOverLimit && (
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                              isSelected ? 'bg-white text-[#C9553D]' : 'bg-[#FDF0EC] text-[#C9553D] border border-[#C9553D]/30'
                            }`}>
                              Limit
                            </span>
                          )}
                        </div>
                        <div className={`text-xs font-mono-financial ${isSelected ? 'text-white/90' : 'text-[#6B6B6B]'}`}>
                          Balance: {pool.currency}{member.balance.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {isSelected && <Check className="h-4 w-4 stroke-[2.5]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active User Summary Card at bottom */}
          {selectedUser && (
            <div className="mt-4 p-3.5 rounded-lg bg-white border border-[#E0DAD1] text-center space-y-1.5 shadow-xs">
              <span className="text-[11px] text-[#6B6B6B] font-medium">Currently Active</span>
              <div className="text-sm font-semibold text-[#2D2D2D]">{selectedUser.name}</div>
              <div className={`text-sm font-semibold font-mono-financial ${selectedUser.balance >= 0 ? 'text-[#5A9A6B]' : 'text-[#C9553D]'}`}>
                {selectedUser.balance >= 0 ? '+' : ''}{pool.currency}{selectedUser.balance.toFixed(2)}
              </div>
              {maxDeficit >= 0 && selectedUser.balance <= -maxDeficit && (
                <button
                  type="button"
                  onClick={() => setShowSettleModal(true)}
                  className="w-full mt-1 py-1 px-2 text-[11px] bg-[#FDF0EC] hover:bg-[#FBE4DD] text-[#C9553D] font-semibold rounded border border-[#C9553D]/30 transition flex items-center justify-center gap-1"
                >
                  <span>🛑 Spending Locked — Settle Up</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Touch Item Buttons Grid */}
        <div className="lg:col-span-3 bg-white border border-[#E0DAD1] rounded-lg p-4 sm:p-6 flex flex-col justify-between overflow-y-auto shadow-xs">
          
          <div>
            {/* Gentle Reminder Banner */}
            <div className="mb-4 p-3 bg-[#FFF8EB] border border-[#D4870E]/30 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🥤</span>
                <span className="text-xs text-[#6B6B6B]">
                  <strong className="text-[#8C5807]">Taking drinks or snacks?</strong> Gentle reminder to contribute funds to the members who stocked them, or bring in items next time!
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSettleModal(true)}
                className="px-3 py-1.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Send Funds to Top Stockers</span>
              </button>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-[#6B6B6B]">
                Tap item to log 1 unit
              </span>
              {lastConsumedName && (
                <span className="px-3 py-1 rounded-full bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30 text-xs font-medium animate-pulse flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  <span>{lastConsumedName}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {poolItems.map((item) => {
                const isOutOfStock = item.stock <= 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTapConsume(item)}
                    disabled={isOutOfStock}
                    className={`p-4 rounded-lg border text-left flex flex-col justify-between transition duration-150 transform active:scale-98 min-h-[120px] ${
                      isOutOfStock
                        ? 'bg-[#FAFAF8] border-[#E0DAD1] opacity-50 cursor-not-allowed'
                        : 'bg-white hover:bg-[#FAFAF8] border-[#E0DAD1] hover:border-[#E8694A] shadow-xs'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#F0EBE3] text-[#2D2D2D] border border-[#E0DAD1]">
                        {item.category}
                      </span>
                      <h4 className="font-semibold text-[#2D2D2D] text-sm mt-2 line-clamp-2 leading-tight">
                        {item.name}
                      </h4>
                    </div>

                    <div className="flex items-end justify-between mt-3 pt-2 border-t border-[#EDE8E0]">
                      <div>
                        <span className="text-xs text-[#6B6B6B] block font-medium">Cost</span>
                        <span className="text-sm font-semibold text-[#E8694A] font-mono-financial">
                          {pool.currency}{item.costPerUnit.toFixed(2)}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-[#6B6B6B] block font-medium">Stock</span>
                        <span className={`text-xs font-medium font-mono-financial ${isOutOfStock ? 'text-[#C9553D]' : 'text-[#6B6B6B]'}`}>
                          {item.stock} left
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#EDE8E0] flex items-center justify-between text-xs text-[#6B6B6B]">
            <span className="inline-flex items-center gap-1.5">
              <PantryPoolIcon variant="duotone" size={16} />
              <span>Powered by PantryPool Touch Ledger • Self-service breakroom logging</span>
            </span>
            <button
              onClick={handleAttemptExit}
              className="text-[#E8694A] hover:underline"
            >
              Back to Main View
            </button>
          </div>

        </div>

      </div>

      {/* Settle Up / Send Funds to Top Contributors Modal */}
      {showSettleModal && (
        <React.Suspense fallback={null}>
          <SettleUpModal
            pool={pool}
            currentUser={selectedUser || pool.members[0]}
            onClose={() => setShowSettleModal(false)}
          />
        </React.Suspense>
      )}

      {/* Admin Unlock Modal Overlay */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-[#2D2D2D]/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E0DAD1] rounded-xl max-w-sm w-full p-6 text-[#2D2D2D] shadow-xl">
            <div className="text-center space-y-3">
              <div className="h-12 w-12 rounded-lg bg-[#FFF8EB] text-[#D4870E] flex items-center justify-center mx-auto text-xl font-bold">
                🔒
              </div>
              <h3 className="text-lg font-semibold text-[#2D2D2D]">Enter Admin PIN to Exit</h3>
              <p className="text-xs text-[#6B6B6B]">
                This tablet kiosk is PIN protected for unattended breakroom mounting.
              </p>

              <form onSubmit={handleVerifyUnlockPin} className="space-y-4 pt-2">
                <input
                  type="password"
                  maxLength={4}
                  placeholder="Enter 4-digit PIN (default: 1234)"
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value)}
                  className="w-full text-center text-2xl tracking-widest font-mono-financial bg-white border border-[#E0DAD1] text-[#2D2D2D] rounded-md p-3 focus:outline-none focus:border-[#E8694A]"
                  autoFocus
                />

                {pinError && (
                  <p className="text-xs font-medium text-[#C9553D]">{pinError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUnlockModal(false)}
                    className="w-1/2 py-2 px-4 rounded-full bg-transparent hover:bg-[#F0EBE3] text-[#2D2D2D] font-medium text-xs border border-[#E0DAD1]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-2 px-4 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs shadow-xs"
                  >
                    Unlock & Exit
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
