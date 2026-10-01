import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Printer, 
  Plus, 
  Receipt, 
  Share2, 
  Rocket,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Pool, Item } from '../types';

interface OnboardingChecklistProps {
  pool: Pool;
  items: Item[];
  isManager: boolean;
  onOpenAddItem: () => void;
  onOpenReceiptScanner: () => void;
  onOpenPrintPoster: () => void;
  onOpenSharePool: () => void;
}

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  pool,
  items,
  isManager,
  onOpenAddItem,
  onOpenReceiptScanner,
  onOpenPrintPoster,
  onOpenSharePool,
}) => {
  const poolId = pool?.id || '';
  const storageKey = `pantrypool_checklist_dismissed_${poolId}`;
  const posterKey = `pantrypool_poster_printed_${poolId}`;
  const inviteKey = `pantrypool_invite_shared_${poolId}`;

  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !poolId) return false;
    return localStorage.getItem(storageKey) === 'true';
  });

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [hasPrintedPoster, setHasPrintedPoster] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !poolId) return false;
    return localStorage.getItem(posterKey) === 'true';
  });
  const [hasSharedInvite, setHasSharedInvite] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !poolId) return false;
    return localStorage.getItem(inviteKey) === 'true';
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && poolId) {
      setIsDismissed(localStorage.getItem(storageKey) === 'true');
      setHasPrintedPoster(localStorage.getItem(posterKey) === 'true');
      setHasSharedInvite(localStorage.getItem(inviteKey) === 'true');
    }
  }, [poolId, storageKey, posterKey, inviteKey]);

  if (!isManager || isDismissed || !poolId) return null;

  const poolItems = items.filter((i) => i.poolId === poolId);
  const hasItems = poolItems.length > 0;
  const memberCount = pool.members?.length || 1;
  const isInviteDone = memberCount > 1 || hasSharedInvite;

  const steps = [
    { 
      id: 'create', 
      label: `Create breakroom pantry (${pool.name})`, 
      description: 'Breakroom workspace registered and configured.',
      done: true 
    },
    { 
      id: 'stock', 
      label: `Stock your pantry shelves (${poolItems.length} items)`, 
      description: 'Add snacks and drinks or scan store receipts to set costs.',
      done: hasItems 
    },
    { 
      id: 'poster', 
      label: 'Print & hang the Fridge Door QR poster', 
      description: 'Hang by the fridge or snack cabinet for self-checkout scans.',
      done: hasPrintedPoster 
    },
    { 
      id: 'invite', 
      label: `Invite coworkers or roommates (${memberCount} member${memberCount === 1 ? '' : 's'})`, 
      description: 'Share your join link so teammates can log drinks & deposit funds.',
      done: isInviteDone 
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);
  const isAllComplete = completedCount === steps.length;

  // Identify the first unfinished step as the current action
  const activeStepIndex = steps.findIndex((s) => !s.done);

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, 'true');
    }
  };

  const handlePrintPosterClick = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(posterKey, 'true');
      setHasPrintedPoster(true);
    }
    onOpenPrintPoster();
  };

  const handleShareInviteClick = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(inviteKey, 'true');
      setHasSharedInvite(true);
    }
    onOpenSharePool();
  };

  return (
    <div className="bg-[#FAF8F5] border border-[#E0DAD1] rounded-2xl p-3.5 sm:p-5 shadow-xs text-[#2D2D2D] transition-all duration-200 mb-4">
      {/* Header Bar */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#E8694A]/10 border border-[#E8694A]/20 flex items-center justify-center text-[#E8694A] shrink-0 mt-0.5">
            <Rocket className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-[#2D2D2D] tracking-tight">
                Breakroom Launch Guide
              </h3>
              <span className={`text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                isAllComplete 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-[#F0EBE3] text-[#6B6B6B] border-[#E0DAD1]'
              }`}>
                {isAllComplete 
                  ? 'All 4 steps complete! 🎉' 
                  : `${completedCount} of ${steps.length} completed (${progressPercent}%)`}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[#6B6B6B] mt-0.5 leading-snug">
              {isAllComplete 
                ? 'Your breakroom is ready. Coworkers can scan the fridge poster anytime!' 
                : 'Complete these quick steps to get your team logging drinks autonomously.'}
            </p>
          </div>
        </div>

        {/* Action Controls (Responsive touch targets) */}
        <div className="flex items-center gap-1 shrink-0 -mt-0.5">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:bg-[#E8E2D9]/60 active:bg-[#E0DAD1] text-[#6B6B6B] hover:text-[#2D2D2D] transition cursor-pointer"
            aria-label={isCollapsed ? 'Expand checklist' : 'Collapse checklist'}
            title={isCollapsed ? 'Expand Launch Guide' : 'Collapse Launch Guide'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" /> : <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
          <button
            onClick={handleDismiss}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:bg-[#E8E2D9]/60 active:bg-[#E0DAD1] text-[#6B6B6B] hover:text-[#C9553D] transition cursor-pointer"
            aria-label="Dismiss launch guide"
            title="Dismiss Launch Guide"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Progress Track (Segmented 4-step modern visual bar) */}
      <div className="mt-3.5 space-y-1.5">
        <div className="grid grid-cols-4 gap-1.5 h-1.5 sm:h-2">
          {steps.map((step, idx) => (
            <div 
              key={step.id} 
              className={`h-full rounded-full transition-all duration-300 ${
                step.done 
                  ? 'bg-emerald-600' 
                  : idx === activeStepIndex
                  ? 'bg-[#E8694A] animate-pulse'
                  : 'bg-[#E0DAD1]/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Collapsed Compact State Bar */}
      {isCollapsed && (
        <div className="mt-3 pt-2.5 border-t border-[#EDE8E0] flex items-center justify-between text-xs text-[#6B6B6B]">
          <span className="font-medium">
            {isAllComplete ? 'All 4 steps complete!' : `Next up: ${steps[activeStepIndex]?.label || 'Setup'}`}
          </span>
          <button
            onClick={() => setIsCollapsed(false)}
            className="text-[11px] font-semibold text-[#E8694A] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Resume Guide</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Steps List (Collapsible & Mobile Optimized) */}
      {!isCollapsed && (
        <div className="mt-3.5 pt-3 border-t border-[#EDE8E0] space-y-2.5 sm:space-y-3">
          
          {/* Step 1: Breakroom Created */}
          <div className="p-3 sm:p-3.5 rounded-xl border border-[#E8E2D9] bg-[#FAF8F5]/60 transition flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="font-medium line-through text-[#6B6B6B] truncate block">
                  Create breakroom pantry ({pool.name})
                </span>
                <span className="text-[10px] text-[#9A9A9A] hidden sm:block">Breakroom workspace active and ready.</span>
              </div>
            </div>
            <span className="text-[11px] text-emerald-700 font-semibold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 shrink-0">
              Done
            </span>
          </div>

          {/* Step 2: Stock Shelves */}
          <div className={`p-3 sm:p-3.5 rounded-xl border transition-all ${
            hasItems 
              ? 'border-[#E8E2D9] bg-[#FAF8F5]/60' 
              : activeStepIndex === 1
              ? 'border-[#E8694A]/40 bg-white shadow-xs ring-1 ring-[#E8694A]/10'
              : 'border-[#E0DAD1] bg-white'
          }`}>
            <div className="flex items-start sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                  hasItems 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-[#E8694A]/10 text-[#E8694A] font-bold text-[11px]'
                }`}>
                  {hasItems ? <CheckCircle2 className="w-4 h-4" /> : '2'}
                </div>
                <div className="min-w-0">
                  <span className={`text-xs font-semibold sm:font-medium block ${hasItems ? 'line-through text-[#6B6B6B]' : 'text-[#2D2D2D]'}`}>
                    Stock your pantry shelves ({poolItems.length} items)
                  </span>
                  <span className="text-[11px] text-[#6B6B6B] block mt-0.5">
                    {hasItems ? 'Inventory loaded on breakroom shelves.' : 'Add items manually or parse grocery receipts.'}
                  </span>
                </div>
              </div>

              {hasItems && (
                <span className="text-[11px] text-emerald-700 font-semibold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 shrink-0">
                  Done
                </span>
              )}
            </div>

            {/* Actions for Step 2 */}
            {!hasItems && (
              <div className="grid grid-cols-2 gap-2 mt-3 sm:flex sm:justify-end sm:items-center">
                <button
                  onClick={onOpenAddItem}
                  className="min-h-[38px] px-3.5 py-1.5 bg-[#E8694A] hover:bg-[#D45A3D] text-white rounded-lg font-medium text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Item</span>
                </button>
                <button
                  onClick={onOpenReceiptScanner}
                  className="min-h-[38px] px-3.5 py-1.5 bg-white hover:bg-[#F0EBE3] border border-[#E0DAD1] text-[#2D2D2D] rounded-lg font-medium text-xs transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <Receipt className="w-3.5 h-3.5 text-[#E8694A]" />
                  <span>Scan Receipt</span>
                </button>
              </div>
            )}
          </div>

          {/* Step 3: Fridge Door QR Poster */}
          <div className={`p-3 sm:p-3.5 rounded-xl border transition-all ${
            hasPrintedPoster 
              ? 'border-[#E8E2D9] bg-[#FAF8F5]/60' 
              : activeStepIndex === 2
              ? 'border-[#E8694A]/40 bg-white shadow-xs ring-1 ring-[#E8694A]/10'
              : 'border-[#E0DAD1] bg-white'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                  hasPrintedPoster 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-[#E8694A]/10 text-[#E8694A] font-bold text-[11px]'
                }`}>
                  {hasPrintedPoster ? <CheckCircle2 className="w-4 h-4" /> : '3'}
                </div>
                <div className="min-w-0">
                  <span className={`text-xs font-semibold sm:font-medium block ${hasPrintedPoster ? 'line-through text-[#6B6B6B]' : 'text-[#2D2D2D]'}`}>
                    Print & hang the Fridge Door QR poster
                  </span>
                  <span className="text-[11px] text-[#6B6B6B] block mt-0.5">
                    Hang on the breakroom door or cabinet so team members can scan to join.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end pt-1 sm:pt-0">
                <button
                  onClick={handlePrintPosterClick}
                  className={`w-full sm:w-auto min-h-[38px] px-3.5 py-1.5 rounded-lg font-medium text-xs transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 ${
                    hasPrintedPoster
                      ? 'bg-white hover:bg-[#F0EBE3] border border-[#E0DAD1] text-[#6B6B6B]'
                      : 'bg-[#E8694A] hover:bg-[#D45A3D] text-white shadow-xs'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{hasPrintedPoster ? 'View / Reprint' : 'Print Poster'}</span>
                </button>
                {hasPrintedPoster && (
                  <span className="text-[11px] text-emerald-700 font-semibold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 shrink-0">
                    Done
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Step 4: Invite Coworkers */}
          <div className={`p-3 sm:p-3.5 rounded-xl border transition-all ${
            isInviteDone 
              ? 'border-[#E8E2D9] bg-[#FAF8F5]/60' 
              : activeStepIndex === 3
              ? 'border-[#E8694A]/40 bg-white shadow-xs ring-1 ring-[#E8694A]/10'
              : 'border-[#E0DAD1] bg-white'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                  isInviteDone 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-[#E8694A]/10 text-[#E8694A] font-bold text-[11px]'
                }`}>
                  {isInviteDone ? <CheckCircle2 className="w-4 h-4" /> : '4'}
                </div>
                <div className="min-w-0">
                  <span className={`text-xs font-semibold sm:font-medium block ${isInviteDone ? 'line-through text-[#6B6B6B]' : 'text-[#2D2D2D]'}`}>
                    Invite coworkers or roommates ({memberCount} member{memberCount === 1 ? '' : 's'})
                  </span>
                  <span className="text-[11px] text-[#6B6B6B] block mt-0.5">
                    Share a direct link in Slack, Teams, or group chat.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end pt-1 sm:pt-0">
                <button
                  onClick={handleShareInviteClick}
                  className={`w-full sm:w-auto min-h-[38px] px-3.5 py-1.5 rounded-lg font-medium text-xs transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 ${
                    isInviteDone
                      ? 'bg-white hover:bg-[#F0EBE3] border border-[#E0DAD1] text-[#6B6B6B]'
                      : 'bg-[#E8694A] hover:bg-[#D45A3D] text-white shadow-xs'
                  }`}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{isInviteDone ? 'Share Again' : 'Share Invite Link'}</span>
                </button>
                {isInviteDone && (
                  <span className="text-[11px] text-emerald-700 font-semibold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 shrink-0">
                    Done
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* All Steps Completed Celebration Banner */}
          {isAllComplete && (
            <div className="mt-4 p-3.5 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-900 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <strong className="block font-bold text-emerald-950 text-sm">All launch steps complete! 🎉</strong>
                  <span className="text-[11px] text-emerald-800">Your breakroom pool is fully configured and ready for your team.</span>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="w-full sm:w-auto min-h-[40px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white rounded-lg font-semibold text-xs transition shrink-0 cursor-pointer shadow-xs text-center flex items-center justify-center gap-1.5"
              >
                <span>Complete & Close Guide</span>
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
