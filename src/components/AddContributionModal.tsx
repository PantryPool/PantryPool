import React, { useState } from 'react';
import { Pool, User } from '../types';
import { X, Check, PlusCircle } from 'lucide-react';

interface AddContributionModalProps {
  pool: Pool;
  preselectedUser?: User;
  onClose: () => void;
  onRecordDeposit: (userId: string, amount: number, note: string) => void;
}

export const AddContributionModal: React.FC<AddContributionModalProps> = ({
  pool,
  preselectedUser,
  onClose,
  onRecordDeposit,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(
    preselectedUser?.id || pool.members[0]?.id || ''
  );
  const [amountStr, setAmountStr] = useState<string>('20.00');
  const [note, setNote] = useState<string>('Venmo transfer for pool credit');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountStr);
    if (!selectedUserId || isNaN(parsedAmount) || parsedAmount <= 0) return;

    onRecordDeposit(selectedUserId, parsedAmount, note.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E0DAD1] rounded-xl max-w-md w-full p-6 text-[#2D2D2D] shadow-xl relative my-8 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EDE8E0]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-[#FDF0EC] text-[#E8694A]">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2D2D2D]">Log Fund Deposit</h2>
              <p className="text-xs text-[#6B6B6B]">Add credit to a member's balance in {pool.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Member Selection */}
          <div>
            <label htmlFor="contribution-member-select" className="block text-xs font-medium text-[#2D2D2D] mb-1">
              Select Member
            </label>
            <select
              id="contribution-member-select"
              aria-label="Select Member"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
            >
              {pool.members.map((m) => (
                <option key={m.id} value={m.id} className="bg-white text-[#2D2D2D]">
                  {m.name} (Current Balance: {pool.currency}{m.balance.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          {/* Amount Input */}
          <div>
            <label htmlFor="contribution-amount-input" className="block text-xs font-medium text-[#2D2D2D] mb-1">
              Deposit Amount ({pool.currency})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9A9A] font-semibold text-base">
                {pool.currency}
              </span>
              <input
                id="contribution-amount-input"
                aria-label={`Deposit Amount in ${pool.currency}`}
                type="number"
                step="1.00"
                min="1"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full bg-white border border-[#E0DAD1] text-[#5A9A6B] font-mono-financial font-semibold text-lg rounded-md pl-8 pr-3 py-2 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              />
            </div>
          </div>

          {/* Quick preset buttons */}
          <div className="flex items-center gap-2">
            {['10', '20', '35', '50'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmountStr(preset)}
                className="px-3 py-1 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] text-xs font-medium border border-[#E0DAD1] transition font-mono-financial"
              >
                +{pool.currency}{preset}
              </button>
            ))}
          </div>

          {/* Payment Note */}
          <div>
            <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
              Payment Method / Note
            </label>
            <input
              type="text"
              placeholder="e.g. Venmo, Cash, Zelle, Apple Pay"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-2.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition mt-2"
          >
            <Check className="h-4 w-4" />
            <span>Record Deposit & Credit Member</span>
          </button>

        </form>

      </div>
    </div>
  );
};
