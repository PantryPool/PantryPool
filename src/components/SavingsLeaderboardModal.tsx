import React, { useState, useEffect } from 'react';
import { Pool, User, PoolSavingsSummary, GlobalSavingsLeaderboardEntry } from '../types';
import { 
  X, 
  TrendingDown, 
  Trophy, 
  Sparkles, 
  Coffee, 
  Pizza, 
  Package, 
  ShieldCheck, 
  Settings, 
  Loader2, 
  Award,
  Users
} from 'lucide-react';
import { fetchPoolSavingsSummary, fetchGlobalSavingsLeaderboard } from '../lib/api';

interface SavingsLeaderboardModalProps {
  pool: Pool;
  activeUser: User;
  onClose: () => void;
  onOpenManagePool?: () => void;
  kioskModeEnabled?: boolean;
}

export const SavingsLeaderboardModal: React.FC<SavingsLeaderboardModalProps> = ({
  pool,
  activeUser,
  onClose,
  onOpenManagePool,
  kioskModeEnabled = true,
}) => {
  const [activeTab, setActiveTab] = useState<'pool' | 'leaderboard'>('pool');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PoolSavingsSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<GlobalSavingsLeaderboardEntry[]>([]);
  const [networkTotal, setNetworkTotal] = useState<number>(0);

  const currency = pool.currency || '$';

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const [sumRes, leadRes] = await Promise.all([
          fetchPoolSavingsSummary(pool.id),
          fetchGlobalSavingsLeaderboard(25)
        ]);

        if (isMounted) {
          if (sumRes?.success && sumRes.summary) {
            setSummary(sumRes.summary);
          }
          if (leadRes?.success) {
            setLeaderboard(leadRes.pools || []);
            setNetworkTotal(leadRes.networkTotalSavings || (leadRes.networkTotalSavingsCents ? leadRes.networkTotalSavingsCents / 100 : 0));
          }
        }
      } catch (err) {
        console.warn('[Savings Leaderboard Load Error]', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [pool.id]);

  const totalSaved = summary?.totalSavings ?? 0;
  const itemsCount = summary?.itemsConsumedCount ?? 0;

  // Real-world equivalencies (assuming ~$5.00 for a barista coffee, ~$120 for team pizza lunch)
  const coffeeEquiv = Math.max(0, Math.floor(totalSaved / 5.00));
  const pizzaEquiv = (totalSaved / 120.00).toFixed(1);

  const isCurrentPoolOptedIn = Boolean(pool.savingsLeaderboardOptIn);
  const currentPoolRankIndex = leaderboard.findIndex((p) => p.poolId === pool.id);
  const currentPoolRank = currentPoolRankIndex >= 0 ? currentPoolRankIndex + 1 : null;

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-2xl max-w-xl w-full text-[#2D2D2D] shadow-2xl relative my-6 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#EDE8E0] bg-[#FAF8F5] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#EDF5EF] text-[#5A9A6B] shadow-xs">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#2D2D2D]">
                Vending Machine Savings
              </h2>
              <p className="text-xs text-[#6B6B6B]">
                {pool.name} • How much your team keeps in their pockets
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9] transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#EDE8E0] px-5 bg-white text-xs font-medium">
          <button
            onClick={() => setActiveTab('pool')}
            className={`py-3 px-3 border-b-2 font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pool'
                ? 'border-[#E8694A] text-[#E8694A]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Our Pantry Impact</span>
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`py-3 px-3 border-b-2 font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'leaderboard'
                ? 'border-[#E8694A] text-[#E8694A]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Trophy className="h-4 w-4" />
            <span>Community Leaderboard (Between Pools)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {loading ? (
            <div className="py-16 text-center text-[#6B6B6B] space-y-3">
              <Loader2 className="h-7 w-7 animate-spin mx-auto text-[#E8694A]" />
              <p className="text-xs">Calculating team savings & vending rates...</p>
            </div>
          ) : activeTab === 'pool' ? (
            <>
              {/* Hero Savings Card */}
              <div className="bg-gradient-to-br from-[#EDF5EF] to-[#E3EFE5] border border-[#5A9A6B]/30 rounded-2xl p-5 text-center space-y-2 relative overflow-hidden shadow-xs">
                <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5A9A6B] uppercase tracking-wider bg-white/80 px-2.5 py-0.5 rounded-full shadow-2xs">
                  <span>Collective Team Savings</span>
                </div>
                <div className="font-mono-financial text-4xl sm:text-5xl font-extrabold text-[#246A38] tracking-tight">
                  {currency}{totalSaved.toFixed(2)}
                </div>
                <p className="text-xs text-[#3D7B50] max-w-sm mx-auto">
                  Saved across <strong>{itemsCount}</strong> snacks & drinks compared to local vending machine markups!
                </p>
              </div>

              {/* Equivalency Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl p-3 text-center space-y-1">
                  <div className="p-2 rounded-lg bg-white w-fit mx-auto border border-[#E0DAD1] text-[#D4870E] shadow-2xs">
                    <Coffee className="h-4 w-4" />
                  </div>
                  <div className="font-mono-financial font-bold text-sm text-[#2D2D2D]">
                    ~{coffeeEquiv} Coffees
                  </div>
                  <div className="text-[10px] text-[#6B6B6B]">Barista drinks avoided</div>
                </div>

                <div className="bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl p-3 text-center space-y-1">
                  <div className="p-2 rounded-lg bg-white w-fit mx-auto border border-[#E0DAD1] text-[#E8694A] shadow-2xs">
                    <Pizza className="h-4 w-4" />
                  </div>
                  <div className="font-mono-financial font-bold text-sm text-[#2D2D2D]">
                    {pizzaEquiv} Team Lunches
                  </div>
                  <div className="text-[10px] text-[#6B6B6B]">Pizza parties funded</div>
                </div>

                <div className="bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl p-3 text-center space-y-1 col-span-2 sm:col-span-1">
                  <div className="p-2 rounded-lg bg-white w-fit mx-auto border border-[#E0DAD1] text-[#5A9A6B] shadow-2xs">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="font-mono-financial font-bold text-sm text-[#2D2D2D]">
                    100% At Cost
                  </div>
                  <div className="text-[10px] text-[#6B6B6B]">Zero middleman markups</div>
                </div>
              </div>

              {/* Top Money-Saving Snacks */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#2D2D2D] uppercase tracking-wider">
                    Top Money-Saving Snacks
                  </h3>
                  <span className="text-[10px] text-[#6B6B6B]">Cumulative Savings</span>
                </div>

                {summary?.topSavedItems && summary.topSavedItems.length > 0 ? (
                  <div className="space-y-2">
                    {summary.topSavedItems.map((item, idx) => (
                      <div
                        key={item.itemId || idx}
                        className="flex items-center justify-between bg-white border border-[#EDE8E0] rounded-xl p-3 shadow-2xs hover:border-[#E8694A]/40 transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full bg-[#FAF8F5] border border-[#E0DAD1] flex items-center justify-center text-[10px] font-bold text-[#6B6B6B]">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="text-xs font-semibold text-[#2D2D2D]">{item.itemName}</div>
                            <div className="text-[10px] text-[#6B6B6B]">{item.quantity} grabbed</div>
                          </div>
                        </div>
                        <div className="font-mono-financial font-bold text-xs text-[#5A9A6B]">
                          +{currency}{(item.totalSavingsCents / 100).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center border border-dashed border-[#E0DAD1] rounded-xl text-xs text-[#6B6B6B]">
                    No savings recorded yet. Grab items from the catalog{kioskModeEnabled ? ' or kiosk' : ''} to watch your collective savings tally grow!
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Tab 2: Cross-Pool Leaderboard */
            <div className="space-y-4">
              {/* Opt-In Banner */}
              {!isCurrentPoolOptedIn ? (
                <div className="bg-[#FFF8EB] border border-[#D4870E]/30 rounded-xl p-3.5 flex items-start gap-3">
                  <Trophy className="h-5 w-5 text-[#D4870E] shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <h4 className="text-xs font-semibold text-[#8C5807]">
                      This Pool Has Not Joined the Public Leaderboard
                    </h4>
                    <p className="text-[11px] text-[#6B6B6B] leading-normal">
                      Participate in friendly competition with other office pantries and breakrooms. Your internal member names remain private!
                    </p>
                    {onOpenManagePool && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenManagePool();
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#E8694A] hover:underline pt-1 cursor-pointer"
                      >
                        <Settings className="h-3 w-3" />
                        <span>Enable in Pool Settings</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : currentPoolRank ? (
                <div className="bg-[#EDF5EF] border border-[#5A9A6B]/30 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Award className="h-5 w-5 text-[#5A9A6B]" />
                    <div>
                      <span className="text-xs font-bold text-[#2D2D2D]">
                        Your Pool Rank: #{currentPoolRank}
                      </span>
                      <p className="text-[10px] text-[#6B6B6B]">
                        Displayed as: <strong>{pool.leaderboardAlias || pool.name}</strong>
                      </p>
                    </div>
                  </div>
                  <span className="font-mono-financial text-xs font-bold text-[#5A9A6B]">
                    {currency}{totalSaved.toFixed(2)} Saved
                  </span>
                </div>
              ) : null}

              {/* Network Milestone Callout */}
              <div className="flex items-center justify-between bg-[#FAF8F5] border border-[#EDE8E0] rounded-xl px-3.5 py-2 text-xs">
                <span className="text-[#6B6B6B]">Platform Network Savings:</span>
                <span className="font-mono-financial font-bold text-[#5A9A6B]">
                  {currency}{networkTotal.toFixed(2)}
                </span>
              </div>

              {/* Leaderboard Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#6B6B6B] px-3 uppercase tracking-wider">
                  <span>Pantry Pool</span>
                  <span>Total Saved</span>
                </div>

                {leaderboard.length > 0 ? (
                  <div className="divide-y divide-[#EDE8E0] border border-[#EDE8E0] rounded-xl overflow-hidden bg-white shadow-2xs">
                    {leaderboard.map((item, idx) => {
                      const rank = idx + 1;
                      const isCurrent = item.poolId === pool.id;
                      return (
                        <div
                          key={item.poolId}
                          className={`flex items-center justify-between px-3.5 py-2.5 transition text-xs ${
                            isCurrent
                              ? 'bg-[#FDF0EC] font-semibold border-l-4 border-l-[#E8694A]'
                              : 'hover:bg-[#FAF8F5]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 text-center font-bold text-xs">
                              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                            </span>
                            <div className="truncate">
                              <div className="text-xs font-semibold text-[#2D2D2D] truncate flex items-center gap-1.5">
                                <span>{item.displayName}</span>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-[#E8694A] text-white">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-[#6B6B6B] flex items-center gap-1.5">
                                <span>{item.category}</span>
                                <span>•</span>
                                <span className="flex items-center gap-0.5">
                                  <Users className="h-2.5 w-2.5" />
                                  {item.memberCount} members
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="font-mono-financial font-bold text-xs text-[#5A9A6B] shrink-0">
                            {currency}{item.totalSavings.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-[#6B6B6B] border border-dashed border-[#E0DAD1] rounded-xl">
                    No pools have opted into the public leaderboard yet. Be the first to opt in from Pool Settings!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#EDE8E0] bg-[#FAF8F5] flex items-center justify-between text-xs">
          <div className="text-[11px] text-[#6B6B6B] flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#5A9A6B]" />
            <span>100% Zero-sum transparent ledger</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium shadow-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
