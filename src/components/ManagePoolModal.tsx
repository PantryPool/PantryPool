import React, { useState, useEffect } from 'react';
import { Pool, User, Item } from '../types';
import { Settings, X, Check, Copy, Share2, Sparkles, TrendingDown, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { METRO_TIERS, MetroTier, resolveSuggestedVendingBenchmark } from '../shared/vendingBenchmarks';

interface ManagePoolModalProps {
  pool: Pool & { kioskPin?: string };
  activeUser: User;
  items?: Item[];
  isManager?: boolean;
  onClose: () => void;
  onUpdatePool: (updatedData: Partial<Pool> & { kioskPin?: string }) => Promise<boolean | void> | void;
  onUpdateItem?: (item: Item) => void;
  onDeletePool?: (poolId: string) => void;
  onOpenSharePool?: () => void;
  kioskModeEnabled?: boolean;
}

export const ManagePoolModal: React.FC<ManagePoolModalProps> = ({
  pool,
  activeUser,
  items = [],
  isManager,
  onClose,
  onUpdatePool,
  onUpdateItem,
  onDeletePool,
  onOpenSharePool,
  kioskModeEnabled = true,
}) => {
  const [name, setName] = useState(pool.name || '');
  const [description, setDescription] = useState(pool.description || '');
  const [category, setCategory] = useState(pool.category || 'Office');
  const [currency, setCurrency] = useState(pool.currency || '$');
  const [kioskPin, setKioskPin] = useState(pool.kioskPin || '1234');
  const [maxDeficit, setMaxDeficit] = useState<number | string>(
    pool.maxDeficit !== undefined ? pool.maxDeficit : 10.00
  );
  const resolvedInitialCode = pool.code || (pool as any)?.qrCodeKey || (pool as any)?.qr_code_key || (typeof pool.id === 'string' && pool.id.startsWith('pool_') && pool.id.length > 10 ? pool.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : pool.id) || '';
  const [code, setCode] = useState(resolvedInitialCode || '');
  const [copiedCode, setCopiedCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Vending Savings & Leaderboard State
  const [savingsEnabled, setSavingsEnabled] = useState(pool.savingsEnabled !== undefined ? Boolean(pool.savingsEnabled) : true);
  const [metroTier, setMetroTier] = useState<MetroTier>((pool.metroTier as MetroTier) || 'standard');
  const [savingsLeaderboardOptIn, setSavingsLeaderboardOptIn] = useState(Boolean(pool.savingsLeaderboardOptIn));
  const [leaderboardAlias, setLeaderboardAlias] = useState(pool.leaderboardAlias || '');
  const [showBatchReview, setShowBatchReview] = useState(false);
  const [itemBenchmarks, setItemBenchmarks] = useState<Record<string, string>>({});

  const poolItems = items.filter((i) => i.poolId === pool.id);

  // Synchronize state when pool prop updates
  useEffect(() => {
    setName(pool.name || '');
    setDescription(pool.description || '');
    setCategory(pool.category || 'Office');
    setCurrency(pool.currency || '$');
    setKioskPin(pool.kioskPin || '1234');
    setMaxDeficit(pool.maxDeficit !== undefined ? pool.maxDeficit : 10.00);
    const resolved = pool.code || (pool as any)?.qrCodeKey || (pool as any)?.qr_code_key || (typeof pool.id === 'string' && pool.id.startsWith('pool_') && pool.id.length > 10 ? pool.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : pool.id) || '';
    setCode(resolved || '');
    setSavingsEnabled(pool.savingsEnabled !== undefined ? Boolean(pool.savingsEnabled) : true);
    setMetroTier((pool.metroTier as MetroTier) || 'standard');
    setSavingsLeaderboardOptIn(Boolean(pool.savingsLeaderboardOptIn));
    setLeaderboardAlias(pool.leaderboardAlias || '');
  }, [pool]);

  // Initialize or re-fill suggested item benchmarks whenever metro tier changes
  useEffect(() => {
    if (poolItems.length > 0) {
      const initialMap: Record<string, string> = {};
      for (const item of poolItems) {
        if (item.vendingBenchmarkCents && item.vendingBenchmarkCents > 0) {
          initialMap[item.id] = (item.vendingBenchmarkCents / 100).toFixed(2);
        } else {
          // Pre-fill with region suggested benchmark
          const suggestedCents = resolveSuggestedVendingBenchmark(item.name, item.category, metroTier);
          initialMap[item.id] = (suggestedCents / 100).toFixed(2);
        }
      }
      setItemBenchmarks(initialMap);
    }
  }, [metroTier, poolItems.length]);

  const isManagerUser = isManager !== undefined ? isManager : Boolean(
    activeUser && (
      activeUser.id === pool.championId ||
      activeUser.role === 'champion' ||
      activeUser.role === 'admin' ||
      pool.members?.find((m) => m.id === activeUser.id)?.role === 'champion' ||
      pool.members?.find((m) => m.id === activeUser.id)?.role === 'admin'
    )
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setIsSubmitting(true);
    try {
      const finalCode = (code || '').trim().toUpperCase() || resolvedInitialCode || pool.id;
      const parsedDeficit = maxDeficit === '' ? 10.00 : Math.max(0, Number(maxDeficit));
      const res = await onUpdatePool({
        name: (name || '').trim(),
        description: (description || '').trim(),
        category,
        currency,
        kioskPin: (kioskPin || '').trim() || '1234',
        code: finalCode,
        maxDeficit: isNaN(parsedDeficit) ? 10.00 : parsedDeficit,
        savingsEnabled,
        metroTier,
        savingsLeaderboardOptIn,
        leaderboardAlias: (leaderboardAlias || '').trim() || undefined,
      });

      if (res === false) {
        setIsSubmitting(false);
        return;
      }

      // If batch reviewed items, update modified items
      if (onUpdateItem && poolItems.length > 0 && savingsEnabled) {
        for (const item of poolItems) {
          const valStr = itemBenchmarks[item.id];
          if (valStr !== undefined) {
            const cents = Math.round((parseFloat(valStr) || 0) * 100);
            if (cents !== (item.vendingBenchmarkCents || 0)) {
              onUpdateItem({
                ...item,
                vendingBenchmarkCents: cents
              });
            }
          }
        }
      }

      onClose();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!isManagerUser) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (onDeletePool) {
      onDeletePool(pool.id);
    }
    onClose();
  };

  const handleCopy = () => {
    const codeToCopy = code || resolvedInitialCode || pool.id;
    if (codeToCopy) {
      navigator.clipboard.writeText(codeToCopy);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  if (!isManagerUser) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col text-[#2D2D2D] shadow-2xl relative my-auto overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header - Pinned at top */}
        <div className="flex items-center justify-between p-5 sm:p-6 pb-3 border-b border-[#EDE8E0] shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#FDF0EC] text-[#E8694A]">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2D2D2D]">Pool Settings</h2>
              <p className="text-xs text-[#6B6B6B]">Configure parameters for {pool.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form with scrollable body & pinned footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          
          {/* Scrollable inputs container */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
            <div>
            <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
              Pool Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[#2D2D2D]">
                Shareable Join Code
              </label>
              <div className="flex items-center gap-2">
                {onOpenSharePool && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSharePool();
                    }}
                    className="text-[11px] text-[#E8694A] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Share2 className="h-3 w-3" />
                    <span>Share Options</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-[11px] text-[#6B6B6B] hover:text-[#2D2D2D] flex items-center gap-1 cursor-pointer"
                >
                  {copiedCode ? <Check className="h-3 w-3 text-[#5A9A6B]" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. PNTR4F or BREAK1"
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs font-mono-financial font-semibold rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
            />
            <p className="text-[11px] text-[#6B6B6B] mt-1 leading-normal">
              Used for QR code posters and direct joins. <span className="text-[#C9553D]">Note:</span> Changing this code will invalidate previously printed physical QR posters or NFC tags.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A]"
              >
                <option value="Office" className="bg-white text-[#2D2D2D]">Office</option>
                <option value="Home / Apartment" className="bg-white text-[#2D2D2D]">Home / Apartment</option>
                <option value="Co-Working" className="bg-white text-[#2D2D2D]">Co-Working</option>
                <option value="Club / Group" className="bg-white text-[#2D2D2D]">Club / Group</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Currency Symbol
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A]"
              >
                <option value="$" className="bg-white text-[#2D2D2D]">$ (USD)</option>
                <option value="€" className="bg-white text-[#2D2D2D]">€ (EUR)</option>
                <option value="£" className="bg-white text-[#2D2D2D]">£ (GBP)</option>
                <option value="¥" className="bg-white text-[#2D2D2D]">¥ (JPY)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[#2D2D2D]">
                Member Credit Ceiling ({currency})
              </label>
              <span className="text-[11px] text-[#6B6B6B] font-mono-financial">
                {Number(maxDeficit) === 0 ? 'Strict Pre-Paid ($0.00)' : `Max deficit: -${currency}${Number(maxDeficit || 0).toFixed(2)}`}
              </span>
            </div>
            <input
              type="number"
              min="0"
              step="0.50"
              value={maxDeficit}
              onChange={(e) => setMaxDeficit(e.target.value)}
              placeholder="10.00"
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs font-mono-financial rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
            />
            <p className="text-[11px] text-[#6B6B6B] mt-1 leading-normal">
              Consumption is locked when a member's deficit reaches this ceiling. Set to <span className="font-mono text-[#E8694A] bg-[#FDF0EC] px-1 py-0.2 rounded font-semibold">0.00</span> to enforce strict pre-paid balances (no negative tabs).
            </p>
          </div>

          {kioskModeEnabled && (
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Breakroom Kiosk Exit PIN (4 digits)
              </label>
              <input
                type="password"
                maxLength={6}
                value={kioskPin}
                onChange={(e) => setKioskPin(e.target.value)}
                placeholder="1234"
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              />
            </div>
          )}

          {/* Vending Machine Savings & Benchmarking Section */}
          <div className="border border-[#E0DAD1] rounded-xl p-3.5 bg-[#FAF8F5] space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-[#EDF5EF] text-[#5A9A6B]">
                  <TrendingDown className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-[#2D2D2D]">Vending Machine Savings</h3>
                  <p className="text-[11px] text-[#6B6B6B]">Track how much members save vs vending retail markups</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={savingsEnabled}
                  onChange={(e) => setSavingsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#E0DAD1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#5A9A6B]"></div>
              </label>
            </div>

            {savingsEnabled && (
              <div className="space-y-3 pt-2 border-t border-[#EDE8E0] animate-in fade-in duration-200">
                {/* Metro Tier Selector */}
                <div>
                  <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                    Local Area / Cost of Living
                  </label>
                  <select
                    value={metroTier}
                    onChange={(e) => setMetroTier(e.target.value as MetroTier)}
                    className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A]"
                  >
                    <option value="baseline">National Baseline / Small Town (Affordable)</option>
                    <option value="standard">Standard Metro / Suburban (Most Common)</option>
                    <option value="high">High-Cost Metro / Tech Hub (NYC, SF, Seattle, LA)</option>
                  </select>
                  <p className="text-[10px] text-[#6B6B6B] mt-1">
                    {METRO_TIERS[metroTier].description}
                  </p>
                </div>

                {/* Live Sample Prices Preview Card */}
                <div className="bg-white border border-[#E0DAD1] rounded-lg p-2.5 shadow-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-[#6B6B6B] uppercase tracking-wider">
                      Sample Vending Benchmarks ({METRO_TIERS[metroTier].label.split(' ')[0]})
                    </span>
                    <span className="text-[10px] text-[#5A9A6B] font-medium flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Auto-applied
                    </span>
                  </div>
                  <div className="grid grid-cols-2 xs:grid-cols-4 gap-1.5 text-center font-mono-financial">
                    <div className="bg-[#FAF8F5] p-1 rounded border border-[#EDE8E0]">
                      <div className="text-[10px] text-[#6B6B6B]">🥤 Soda Can</div>
                      <div className="font-semibold text-xs text-[#2D2D2D]">{currency}{(METRO_TIERS[metroTier].samplePrices.soda / 100).toFixed(2)}</div>
                    </div>
                    <div className="bg-[#FAF8F5] p-1 rounded border border-[#EDE8E0]">
                      <div className="text-[10px] text-[#6B6B6B]">🍫 Candy Bar</div>
                      <div className="font-semibold text-xs text-[#2D2D2D]">{currency}{(METRO_TIERS[metroTier].samplePrices.candyBar / 100).toFixed(2)}</div>
                    </div>
                    <div className="bg-[#FAF8F5] p-1 rounded border border-[#EDE8E0]">
                      <div className="text-[10px] text-[#6B6B6B]">⚡ Energy Drink</div>
                      <div className="font-semibold text-xs text-[#2D2D2D]">{currency}{(METRO_TIERS[metroTier].samplePrices.energyDrink / 100).toFixed(2)}</div>
                    </div>
                    <div className="bg-[#FAF8F5] p-1 rounded border border-[#EDE8E0]">
                      <div className="text-[10px] text-[#6B6B6B]">🥨 Chips Bag</div>
                      <div className="font-semibold text-xs text-[#2D2D2D]">{currency}{(METRO_TIERS[metroTier].samplePrices.chips / 100).toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                {/* Community Leaderboard Opt-in */}
                <div className="pt-2 border-t border-[#EDE8E0] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="h-3.5 w-3.5 text-[#D4870E]" />
                      <span className="text-xs font-medium text-[#2D2D2D]">Join Cross-Pool Savings Leaderboard</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={savingsLeaderboardOptIn}
                        onChange={(e) => setSavingsLeaderboardOptIn(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-[#E0DAD1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#D4870E]"></div>
                    </label>
                  </div>
                  {savingsLeaderboardOptIn && (
                    <div className="space-y-1 pl-5">
                      <label className="block text-[11px] text-[#6B6B6B]">
                        Leaderboard Display Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={leaderboardAlias}
                        onChange={(e) => setLeaderboardAlias(e.target.value)}
                        placeholder={name || pool.name || 'e.g. Floor 4 Snackers'}
                        className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2 focus:outline-none focus:border-[#E8694A]"
                      />
                      <p className="text-[10px] text-[#6B6B6B]">
                        Defaults to pantry name if blank. Compete with other breakrooms across the platform!
                      </p>
                    </div>
                  )}
                </div>

                {/* Batch Calibration Drawer */}
                {poolItems.length > 0 && (
                  <div className="pt-2 border-t border-[#EDE8E0]">
                    <button
                      type="button"
                      onClick={() => setShowBatchReview(!showBatchReview)}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-white hover:bg-[#EDE8E0] text-[#2D2D2D] border border-[#E0DAD1] text-xs font-medium flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <span>Review & Calibrate Item Vending Prices ({poolItems.length})</span>
                      </span>
                      {showBatchReview ? <ChevronUp className="h-3.5 w-3.5 text-[#6B6B6B]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#6B6B6B]" />}
                    </button>

                    {showBatchReview && (
                      <div className="mt-2 bg-white border border-[#E0DAD1] rounded-lg p-2.5 space-y-2 max-h-48 overflow-y-auto">
                        <p className="text-[10px] text-[#6B6B6B]">
                          Pre-filled using {METRO_TIERS[metroTier].label.split(' ')[0]} rates. Adjust if your local machine charges differently:
                        </p>
                        <div className="space-y-1.5">
                          {poolItems.map((it) => (
                            <div key={it.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-[#FAF8F5]">
                              <div className="min-w-0 flex-1 truncate">
                                <span className="font-medium text-[#2D2D2D]">{it.name}</span>
                                <span className="text-[10px] text-[#6B6B6B] block">Pool: {currency}{(it.costPerUnit || 0).toFixed(2)}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-[#6B6B6B]">Vending: {currency}</span>
                                <input
                                  type="number"
                                  step="0.05"
                                  min="0"
                                  value={itemBenchmarks[it.id] || '2.00'}
                                  onChange={(e) => setItemBenchmarks({ ...itemBenchmarks, [it.id]: e.target.value })}
                                  className="w-16 bg-[#FAF8F5] border border-[#E0DAD1] rounded px-1.5 py-0.5 text-xs font-mono-financial text-right focus:outline-none focus:border-[#E8694A]"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
            />
          </div>

          {saveError && (
            <div className="p-2.5 bg-[#FDF0EC] border border-[#F5C2B5] text-[#C9553D] rounded-lg text-xs">
              {saveError}
            </div>
          )}
          </div>

          {/* Pinned action buttons footer */}
          <div className="p-4 sm:px-6 sm:py-3.5 border-t border-[#EDE8E0] bg-[#FAF8F5] shrink-0 flex items-center justify-between gap-3">
            {onDeletePool && isManagerUser ? (
              <button
                type="button"
                onClick={handleDelete}
                className={`px-3.5 py-2 rounded-full text-xs font-medium border transition cursor-pointer ${
                  confirmDelete
                    ? 'bg-[#FDF0EC] text-[#C9553D] border-[#C9553D]/40 hover:bg-[#C9553D] hover:text-white'
                    : 'bg-transparent text-[#6B6B6B] border-[#E0DAD1] hover:text-[#C9553D] hover:border-[#C9553D]/30'
                }`}
              >
                {confirmDelete ? '⚠️ Click again to permanently delete this pool' : 'Delete Pool'}
              </button>
            ) : <div />}

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] disabled:opacity-50 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition ml-auto cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Save Settings</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
