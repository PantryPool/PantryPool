import React, { useState } from 'react';
import { Item, Pool, User, DiscrepancyReason } from '../types';
import { 
  Scale, 
  X, 
  Check, 
  AlertTriangle, 
  UserX, 
  Clock, 
  PackageMinus, 
  ClipboardCheck, 
  HelpCircle,
  Plus,
  Minus
} from 'lucide-react';

interface StockDiscrepancyModalProps {
  item: Item;
  pool: Pool;
  activeUser: User;
  onClose: () => void;
  onSubmitDiscrepancy: (data: {
    itemId: string;
    actualStock: number;
    delta: number;
    reason: DiscrepancyReason;
    notes?: string;
  }) => void;
}

const REASONS: {
  id: DiscrepancyReason;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'forgot_to_log',
    label: 'Forgot to Log',
    sublabel: 'Member grabbed item and forgot to log in app',
    icon: Clock,
  },
  {
    id: 'visitor_take',
    label: 'Guest / Visitor',
    sublabel: 'Item taken by office visitor or non-member',
    icon: UserX,
  },
  {
    id: 'damaged_expired',
    label: 'Damaged or Expired',
    sublabel: 'Broken, leaked, spoiled, or discarded item',
    icon: PackageMinus,
  },
  {
    id: 'audit_recount',
    label: 'Physical Recount',
    sublabel: 'Regular shelf audit count adjustment',
    icon: ClipboardCheck,
  },
  {
    id: 'other',
    label: 'Other Reason',
    sublabel: 'Specify custom details below',
    icon: HelpCircle,
  },
];

export const StockDiscrepancyModal: React.FC<StockDiscrepancyModalProps> = ({
  item,
  pool,
  activeUser,
  onClose,
  onSubmitDiscrepancy,
}) => {
  const [actualStock, setActualStock] = useState<number>(Math.max(0, item.stock - 1));
  const [reason, setReason] = useState<DiscrepancyReason>('forgot_to_log');
  const [notes, setNotes] = useState<string>('');

  const delta = actualStock - item.stock;

  const handleStep = (step: number) => {
    setActualStock((prev) => Math.max(0, prev + step));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitDiscrepancy({
      itemId: item.id,
      actualStock,
      delta,
      reason,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/40 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-xl max-w-lg w-full p-6 text-[#2D2D2D] shadow-xl relative my-8 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EDE8E0]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#FFF8EB] text-[#D4870E]">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2D2D2D]">
                Report Stock Discrepancy
              </h2>
              <p className="text-xs text-[#6B6B6B]">
                Sync physical shelf count for {item.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Current vs Actual Count Card */}
          <div className="bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-[#6B6B6B] block">Recorded System Stock</span>
                <span className="text-sm font-semibold text-[#2D2D2D] font-mono-financial">
                  {item.stock} {item.unitName}s
                </span>
              </div>

              {/* Dynamic Delta Badge */}
              <div className="text-right">
                <span className="text-xs text-[#6B6B6B] block">Count Discrepancy</span>
                {delta < 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold font-mono-financial text-[#C9553D] bg-[#FDF0EC] px-2.5 py-0.5 rounded-full border border-[#C9553D]/30">
                    {delta} {item.unitName}s (Missing)
                  </span>
                ) : delta > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold font-mono-financial text-[#5A9A6B] bg-[#EDF5EF] px-2.5 py-0.5 rounded-full border border-[#5A9A6B]/30">
                    +{delta} {item.unitName}s (Surplus)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#6B6B6B] bg-white px-2.5 py-0.5 rounded-full border border-[#E0DAD1]">
                    0 (Counts Match)
                  </span>
                )}
              </div>
            </div>

            {/* Actual Physical Count Stepper */}
            <div className="pt-2 border-t border-[#E0DAD1]/60">
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1.5">
                Actual Physical Shelf Count
              </label>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStep(-5)}
                  className="px-2.5 py-2 rounded-md bg-white border border-[#E0DAD1] hover:bg-[#E8E2D9] text-[#2D2D2D] text-xs font-mono-financial font-medium transition"
                  title="-5 units"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => handleStep(-1)}
                  className="p-2 rounded-md bg-white border border-[#E0DAD1] hover:bg-[#E8E2D9] text-[#2D2D2D] transition"
                  title="-1 unit"
                >
                  <Minus className="h-4 w-4" />
                </button>

                <input
                  type="number"
                  min="0"
                  required
                  value={actualStock}
                  onChange={(e) => setActualStock(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full text-center bg-white border border-[#E0DAD1] text-[#2D2D2D] font-mono-financial font-semibold text-lg rounded-md py-1.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
                />

                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  className="p-2 rounded-md bg-white border border-[#E0DAD1] hover:bg-[#E8E2D9] text-[#2D2D2D] transition"
                  title="+1 unit"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStep(5)}
                  className="px-2.5 py-2 rounded-md bg-white border border-[#E0DAD1] hover:bg-[#E8E2D9] text-[#2D2D2D] text-xs font-mono-financial font-medium transition"
                  title="+5 units"
                >
                  +5
                </button>
              </div>
            </div>
          </div>

          {/* Reason Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[#2D2D2D]">
              Reason for Discrepancy
            </label>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REASONS.map((r) => {
                const IconComponent = r.icon;
                const isSelected = reason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReason(r.id)}
                    className={`p-3 rounded-lg border text-left flex items-start gap-2.5 transition ${
                      isSelected
                        ? 'bg-[#FDF0EC] border-[#E8694A] shadow-xs'
                        : 'bg-white border-[#E0DAD1] hover:bg-[#FAFAF8]'
                    }`}
                  >
                    <div className={`p-1.5 rounded-md flex-shrink-0 mt-0.5 ${
                      isSelected ? 'bg-[#E8694A] text-white' : 'bg-[#F0EBE3] text-[#6B6B6B]'
                    }`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <div>
                      <div className={`text-xs font-semibold ${isSelected ? 'text-[#E8694A]' : 'text-[#2D2D2D]'}`}>
                        {r.label}
                      </div>
                      <div className="text-[11px] text-[#6B6B6B] leading-tight mt-0.5">
                        {r.sublabel}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
              Additional Details / Note <span className="text-[#9A9A9A] font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Client meeting in boardroom 3 took 4 cans"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#EDE8E0]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#6B6B6B] text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition"
            >
              <Check className="h-4 w-4" />
              <span>Update Stock & Log Discrepancy</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
