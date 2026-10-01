import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Coffee, 
  Check, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  X, 
  AlertCircle, 
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  PackageCheck
} from 'lucide-react';
import { 
  onboardWorkspaceApi, 
  createPoolApi,
  saveItemApi,
  ApiOrganization 
} from '../lib/api';

export interface OnboardingWizardProps {
  isOpen: boolean;
  ownerId: string;
  initialTier?: 'community' | 'standard' | 'plus' | string;
  initialBillingCycle?: 'monthly' | 'yearly';
  onClose: () => void;
  onSuccess: (result: { organization?: ApiOrganization | null; pool: any }) => void;
}

export const OnboardingWizardModal: React.FC<OnboardingWizardProps> = ({
  isOpen,
  ownerId,
  initialTier = 'community',
  initialBillingCycle = 'yearly',
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Setup mode: company workspace vs standalone pantry
  const [setupMode, setSetupMode] = useState<'standalone' | 'company'>(() => {
    const clean = (initialTier || 'community').toLowerCase();
    if (clean === 'plus' || clean === 'enterprise' || clean === 'standard' || clean === 'pro') {
      return 'company';
    }
    return 'standalone';
  });

  // Step 1: Workspace & Plan (Company Workspace is strictly a paid feature)
  const [orgName, setOrgName] = useState('');
  const [tier, setTier] = useState<'standard' | 'plus'>(() => {
    const clean = (initialTier || 'standard').toLowerCase();
    if (clean === 'plus' || clean === 'enterprise') return 'plus';
    return 'standard';
  });
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(initialBillingCycle || 'yearly');

  useEffect(() => {
    if (isOpen) {
      const clean = (initialTier || 'community').toLowerCase();
      if (clean === 'plus' || clean === 'enterprise' || clean === 'standard' || clean === 'pro') {
        setSetupMode('company');
        setTier(clean === 'plus' || clean === 'enterprise' ? 'plus' : 'standard');
      } else {
        setSetupMode('standalone');
      }
      if (initialBillingCycle) {
        setBillingCycle(initialBillingCycle);
      }
    }
  }, [isOpen, initialTier, initialBillingCycle]);

  // Step 2: First Pantry
  const [poolName, setPoolName] = useState('');
  const [category, setCategory] = useState<'Office' | 'Home / Apartment' | 'Club / Group' | 'Co-Working'>('Office');
  const [currency, setCurrency] = useState('$');
  const [starterItems, setStarterItems] = useState(true);

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNextFromStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (setupMode === 'company' && !orgName.trim()) {
      setError('Please enter a name for your company workspace, or switch to Standalone Pantry.');
      return;
    }
    setError(null);
    if (!poolName) {
      if (setupMode === 'company' && orgName.trim()) {
        setPoolName(`${orgName.trim()} Main Breakroom`);
      } else {
        setPoolName('Main Breakroom');
      }
    }
    setStep(2);
  };

  const handleNextFromStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poolName.trim()) {
      setError('Please give your breakroom or pantry a name.');
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleFinalSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      if (setupMode === 'standalone') {
        // Standalone Pantry: No company workspace created
        const createRes = await createPoolApi(
          poolName.trim(),
          category,
          currency,
          null,
          'Primary supply pantry',
          ownerId
        );

        if (createRes && createRes.success) {
          const createdPool = createRes.pool || {
            id: createRes.poolId,
            name: poolName.trim(),
            category,
            currency,
            code: createRes.qrCodeKey,
            qrCodeKey: createRes.qrCodeKey,
            organizationId: null,
            championId: ownerId,
          };

          if (starterItems && (createRes.poolId || createdPool.id)) {
            const targetPoolId = createRes.poolId || createdPool.id;
            const defaultItems = [
              { name: 'Coffee Beans (1kg bag)', category: 'Drinks & Coffee', costPerUnit: 14.50, stock: 3, minStock: 1, unitName: 'bag' },
              { name: 'Oat Milk (Barista)', category: 'Drinks & Coffee', costPerUnit: 3.75, stock: 6, minStock: 2, unitName: 'carton' },
              { name: 'Sparkling Water (Can)', category: 'Drinks & Coffee', costPerUnit: 1.25, stock: 12, minStock: 4, unitName: 'can' },
              { name: 'Protein Bars (Box)', category: 'Snacks', costPerUnit: 2.00, stock: 15, minStock: 5, unitName: 'bar' }
            ];

            for (const item of defaultItems) {
              try {
                await saveItemApi({
                  poolId: targetPoolId,
                  name: item.name,
                  category: item.category,
                  costPerUnit: item.costPerUnit,
                  stock: item.stock,
                  minStock: item.minStock,
                  unitName: item.unitName
                });
              } catch (err) {
                console.warn('[Starter Item Warning]', err);
              }
            }
          }

          onSuccess({ organization: null, pool: createdPool });
          onClose();
        } else {
          setError(createRes?.error || 'Failed to setup pantry pool.');
        }
      } else {
        // Multi-pantry company workspace: atomic creation of organization + pantry + starter items
        const onboardRes = await onboardWorkspaceApi({
          orgName: orgName.trim(),
          poolName: poolName.trim(),
          category,
          currency,
          tier,
          starterItems
        });

        if (onboardRes.success && onboardRes.organization && onboardRes.pool) {
          onSuccess({ organization: onboardRes.organization, pool: onboardRes.pool });
          onClose();
        } else {
          setError(onboardRes.error || 'Failed to create workspace.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2D2D]/50 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white border border-[#E0DAD1] rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 text-[#2D2D2D]">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#6B6B6B] hover:text-[#2D2D2D] p-1.5 rounded-full hover:bg-[#F0EBE3] transition-colors"
          title="Skip setup for now"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Progress Stepper */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-[#6B6B6B] mb-2 font-medium">
            <span className={step >= 1 ? 'text-[#E8694A] font-semibold' : ''}>
              {setupMode === 'company' ? '1. Workspace & Plan' : '1. Pantry Type'}
            </span>
            <span className={step >= 2 ? 'text-[#E8694A] font-semibold' : ''}>
              {setupMode === 'company' ? '2. First Pantry' : '2. Pantry Details'}
            </span>
            <span className={step >= 3 ? 'text-[#E8694A] font-semibold' : ''}>3. Launch</span>
          </div>
          <div className="w-full bg-[#E0DAD1] h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-[#E8694A] h-full transition-all duration-300 ease-out"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[#FDF0EC] border border-[#C9553D]/30 text-[#C9553D] text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Workspace & Plan */}
        {step === 1 && (
          <form onSubmit={handleNextFromStep1} className="space-y-4">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#FDF0EC] text-[#E8694A] mb-2">
                {setupMode === 'company' ? <Building2 className="w-6 h-6" /> : <Coffee className="w-6 h-6" />}
              </div>
              <h2 className="text-xl font-semibold text-[#2D2D2D]">
                {setupMode === 'company' ? "Welcome! Let's set up your team" : "Welcome! Let's set up your pantry"}
              </h2>
              <p className="text-xs text-[#6B6B6B] mt-1">
                {setupMode === 'company'
                  ? 'Name your company or organization workspace to host your breakroom pantries'
                  : 'Set up an independent breakroom or snack pantry with zero company overhead'}
              </p>
            </div>

            {/* Mode Switcher: Standalone vs Company */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSetupMode('standalone');
                  setError(null);
                }}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  setupMode === 'standalone'
                    ? 'bg-[#FDF0EC] border-[#E8694A] text-[#2D2D2D] ring-1 ring-[#E8694A]'
                    : 'bg-white border-[#E0DAD1] text-[#6B6B6B] hover:bg-[#FAF9F5]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-[#2D2D2D]">
                    <Coffee className={`w-3.5 h-3.5 ${setupMode === 'standalone' ? 'text-[#E8694A]' : 'text-[#6B6B6B]'}`} />
                    <span>Standalone Pantry</span>
                  </div>
                  <div className="text-[10px] text-[#6B6B6B] mt-1 leading-snug">
                    Individual breakroom, household, or club. No company required.
                  </div>
                </div>
                <div className="text-[10px] text-[#3B6E47] font-semibold mt-2">
                  Free forever
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSetupMode('company');
                  setError(null);
                }}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                  setupMode === 'company'
                    ? 'bg-[#FDF0EC] border-[#E8694A] text-[#2D2D2D] ring-1 ring-[#E8694A]'
                    : 'bg-white border-[#E0DAD1] text-[#6B6B6B] hover:bg-[#FAF9F5]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-[#2D2D2D]">
                    <Building2 className={`w-3.5 h-3.5 ${setupMode === 'company' ? 'text-[#E8694A]' : 'text-[#6B6B6B]'}`} />
                    <span>Company Workspace</span>
                  </div>
                  <div className="text-[10px] text-[#6B6B6B] mt-1 leading-snug">
                    Multi-pantry team governance, billing, and invites.
                  </div>
                </div>
                <div className="text-[10px] text-[#E8694A] font-semibold mt-2">
                  Paid plans only (from $5/mo)
                </div>
              </button>
            </div>

            {setupMode === 'company' ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-[#2D2D2D]">
                      Company or Workspace Name
                    </label>
                    <button
                      type="button"
                      onClick={() => setSetupMode('standalone')}
                      className="text-[11px] text-[#E8694A] hover:underline cursor-pointer"
                    >
                      Skip company setup
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Acme Studio, SF Office, or Lab 4B"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full bg-[#FAF9F5] border border-[#E0DAD1] focus:border-[#E8694A] focus:bg-white focus:ring-1 focus:ring-[#E8694A] rounded-lg py-2.5 px-3.5 text-sm text-[#2D2D2D] placeholder-[#9A9A9A] outline-none transition"
                  />
                </div>

                {/* Plan Selection for Company Workspaces */}
                <div>
                  <div className="mb-2">
                    <label className="block text-xs font-semibold text-[#2D2D2D]">
                      Select Workspace Tier
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Standard */}
                    <button
                      type="button"
                      onClick={() => setTier('standard')}
                      className={`relative p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        tier === 'standard'
                          ? 'bg-[#FDF0EC] border-[#E8694A] text-[#2D2D2D] shadow-xs'
                          : 'bg-white border-[#E0DAD1] text-[#6B6B6B] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      <div className="absolute -top-2 right-2 bg-[#E8694A] text-white text-[8px] font-bold px-1.5 py-0.2 rounded-full uppercase">
                        Popular
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-[#E8694A]">Standard</div>
                      </div>
                      <div className="text-[10px] text-[#6B6B6B] mt-2 border-t border-[#EDE8E0] pt-1.5">
                        5 pools · 50 members
                      </div>
                    </button>

                    {/* Plus */}
                    <button
                      type="button"
                      onClick={() => setTier('plus')}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        tier === 'plus'
                          ? 'bg-[#FDF0EC] border-[#E8694A] text-[#2D2D2D] shadow-xs'
                          : 'bg-white border-[#E0DAD1] text-[#6B6B6B] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-xs text-[#2D2D2D]">Plus</div>
                      </div>
                      <div className="text-[10px] text-[#6B6B6B] mt-2 border-t border-[#EDE8E0] pt-1.5">
                        Unlimited pools & team
                      </div>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E0DAD1] space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#2D2D2D]">
                  <CheckCircle2 className="w-4 h-4 text-[#3B6E47]" />
                  <span>No company workspace required</span>
                </div>
                <p className="text-[11px] text-[#6B6B6B] leading-relaxed">
                  You are setting up an independent breakroom pantry. You can always create or join a company workspace later if your team needs multiple pools.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium rounded-full shadow-xs transition flex items-center justify-center gap-2 text-xs cursor-pointer"
            >
              <span>Continue to Pantry Setup</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-[#6B6B6B] hover:text-[#2D2D2D] underline transition cursor-pointer"
              >
                Skip setup for now
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: First Pantry Setup */}
        {step === 2 && (
          <form onSubmit={handleNextFromStep2} className="space-y-4">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#EDF5EF] text-[#2C6E3B] mb-2">
                <Coffee className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-[#2D2D2D]">
                {setupMode === 'company' ? 'Set up your first pantry' : 'Set up your pantry'}
              </h2>
              <p className="text-xs text-[#6B6B6B] mt-1">
                Where do colleagues, roommates, or members grab snacks, drinks, or coffee?
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2D2D2D] mb-1.5">
                Pantry or Breakroom Name
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. 2nd Floor Kitchen or Coffee Bar"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
                className="w-full bg-[#FAF9F5] border border-[#E0DAD1] focus:border-[#E8694A] focus:bg-white focus:ring-1 focus:ring-[#E8694A] rounded-lg py-2.5 px-3.5 text-sm text-[#2D2D2D] outline-none transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#2D2D2D] mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full bg-[#FAF9F5] border border-[#E0DAD1] focus:border-[#E8694A] focus:bg-white rounded-lg py-2 px-3 text-xs text-[#2D2D2D] outline-none"
                >
                  <option value="Office">Corporate Office</option>
                  <option value="Co-Working">Coworking Space</option>
                  <option value="Club / Group">Club / Community</option>
                  <option value="Home / Apartment">Shared Household</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2D2D2D] mb-1.5">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-[#FAF9F5] border border-[#E0DAD1] focus:border-[#E8694A] focus:bg-white rounded-lg py-2 px-3 text-xs text-[#2D2D2D] outline-none font-mono"
                >
                  <option value="$">$ USD</option>
                  <option value="€">€ EUR</option>
                  <option value="£">£ GBP</option>
                  <option value="C$">C$ CAD</option>
                  <option value="A$">A$ AUD</option>
                </select>
              </div>
            </div>

            {/* Starter items checkbox */}
            <div className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#E0DAD1] flex items-start gap-3">
              <input
                type="checkbox"
                id="starter-items"
                checked={starterItems}
                onChange={(e) => setStarterItems(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded text-[#E8694A] focus:ring-[#E8694A] border-[#E0DAD1]"
              />
              <label htmlFor="starter-items" className="text-xs text-[#2D2D2D] cursor-pointer">
                <span className="font-semibold block">Pre-populate with starter pantry items</span>
                <span className="text-[11px] text-[#6B6B6B]">
                  Includes sample coffee beans, barista oat milk, sparkling waters, and protein bars so your catalog is immediately live.
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-full border border-[#E0DAD1] text-xs font-medium text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                type="submit"
                className="flex-1 py-2.5 px-4 bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium rounded-full shadow-xs transition flex items-center justify-center gap-2 text-xs cursor-pointer"
              >
                <span>Review & Launch</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Review & Activation */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#FFF4ED] text-[#E8694A] mb-2">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-[#2D2D2D]">Ready to launch your breakroom</h2>
              <p className="text-xs text-[#6B6B6B] mt-1">
                Verify your breakroom details below to start tracking supplies
              </p>
            </div>

            {/* Summary Card */}
            <div className="bg-[#FAF9F5] border border-[#E0DAD1] rounded-xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#EDE8E0]">
                <span className="text-[#6B6B6B]">
                  {setupMode === 'company' ? 'Company Workspace' : 'Setup Type'}
                </span>
                <span className="font-semibold text-[#2D2D2D]">
                  {setupMode === 'company' ? orgName : 'Standalone Pantry (No Company)'}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[#EDE8E0]">
                <span className="text-[#6B6B6B]">Breakroom Pantry</span>
                <span className="font-semibold text-[#2D2D2D]">{poolName}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[#EDE8E0]">
                <span className="text-[#6B6B6B]">Starter Catalog</span>
                <span className="font-medium text-[#2C6E3B] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5A9A6B]" />
                  <span>{starterItems ? '4 Items Included' : 'Empty Catalog'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[#6B6B6B]">Plan</span>
                <span className="font-semibold text-[#E8694A]">
                  {setupMode === 'standalone'
                    ? 'Community Edition (Unlimited)'
                    : tier === 'plus'
                    ? 'Plus Workspace'
                    : 'Standard Workspace'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={loading}
                className="px-4 py-3 rounded-full border border-[#E0DAD1] text-xs font-medium text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={loading}
                className="flex-1 py-3 px-4 bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium rounded-full shadow-sm transition flex items-center justify-center gap-2 text-xs disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <PackageCheck className="w-4 h-4" />
                    <span>
                      {setupMode === 'standalone' ? 'Launch Free Pantry' : 'Launch Workspace & Pantry'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
