import React, { useState, useEffect } from 'react';
import { Coffee, ShieldCheck, Wallet, X, ArrowRight, Check } from 'lucide-react';
import { Pool, User } from '../types';

interface MemberWelcomeBannerProps {
  pool: Pool;
  activeUser: User;
  isManager: boolean;
  onOpenSettleUp?: () => void;
}

export const MemberWelcomeBanner: React.FC<MemberWelcomeBannerProps> = ({
  pool,
  activeUser,
  isManager,
  onOpenSettleUp,
}) => {
  const poolId = pool?.id || '';
  const userId = activeUser?.id || '';
  const storageKey = `pantrypool_welcome_dismissed_${poolId}_${userId}`;

  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !poolId || !userId) return false;
    return localStorage.getItem(storageKey) === 'true';
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && poolId && userId) {
      setIsDismissed(localStorage.getItem(storageKey) === 'true');
    }
  }, [poolId, userId, storageKey]);

  if (isManager || isDismissed || !poolId) return null;

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, 'true');
    }
  };

  return (
    <div className="bg-gradient-to-r from-[#FAF8F5] via-[#FFF] to-[#F5F2EC] border border-[#E0DAD1] rounded-xl p-4 sm:p-5 shadow-xs text-[#2D2D2D] relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-md hover:bg-[#E0DAD1]/50 text-[#6B6B6B] transition cursor-pointer"
        aria-label="Close welcome guide"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3.5 pr-6">
        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-700 shrink-0 mt-0.5">
          <Coffee className="w-5 h-5" />
        </div>
        <div className="space-y-2 flex-1">
          <div>
            <h3 className="text-sm font-bold text-[#2D2D2D]">
              Welcome to {pool.name || 'the breakroom pantry'}! 👋
            </h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              Here is how our self-serve breakroom honor system works:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="flex items-start gap-2 text-xs">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                1
              </span>
              <div>
                <strong className="text-[#2D2D2D] block">Grab & Tap</strong>
                <span className="text-[#6B6B6B] text-[11px] leading-relaxed">
                  Take what you want from the fridge, then tap its card here to log it instantly.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                2
              </span>
              <div>
                <strong className="text-[#2D2D2D] block">Running Tab</strong>
                <span className="text-[#6B6B6B] text-[11px] leading-relaxed">
                  No credit card required. We keep an honest running balance of what you owe.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs">
              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                3
              </span>
              <div>
                <strong className="text-[#2D2D2D] block">Square Up Anytime</strong>
                <span className="text-[#6B6B6B] text-[11px] leading-relaxed">
                  Pay back the restocker on payday via Venmo, Cash App, or cash with the "Settle Up" button.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={handleDismiss}
              className="px-3.5 py-1.5 bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-medium rounded-full transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>Got it, let's grab a drink!</span>
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
