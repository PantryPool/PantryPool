import React, { useState } from 'react';
import { User, Pool } from '../types';
import { ApiOrganization, isOrganizationsEnabled } from '../lib/api';
import { extractJoinCode } from '../lib/joinCode';
import { Users, X, Check, KeyRound, Building2, Plus, AlertCircle, Sparkles } from 'lucide-react';

export { extractJoinCode };

interface CreatePoolModalProps {
  activeUser: User;
  pools?: Pool[];
  isPaidSubscriber?: boolean;
  organizations?: ApiOrganization[];
  activeOrgId?: string;
  onOpenCreateOrg?: () => void;
  onClose: () => void;
  onCreatePool: (
    name: string,
    description: string,
    category: 'Office' | 'Home / Apartment' | 'Club / Group' | 'Co-Working',
    currency: string,
    initialSeed: number,
    organizationId?: string | null
  ) => void;
  onJoinPool: (code: string) => void;
}

export const CreatePoolModal: React.FC<CreatePoolModalProps> = ({
  activeUser,
  pools = [],
  isPaidSubscriber = false,
  organizations = [],
  activeOrgId,
  onOpenCreateOrg,
  onClose,
  onCreatePool,
  onJoinPool,
}) => {
  const [tab, setTab] = useState<'create' | 'join'>('create');

  // Create state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'Office' | 'Home / Apartment' | 'Club / Group' | 'Co-Working'>('Office');
  const [currency, setCurrency] = useState('$');
  const [initialSeed, setInitialSeed] = useState('0');
  const [selectedOrgId, setSelectedOrgId] = useState<string>(() => {
    if (!isOrganizationsEnabled) return 'none';
    if (activeOrgId && activeOrgId !== '') return activeOrgId;
    if (organizations.length > 0) return organizations[0].id;
    return 'none';
  });

  // Limit Calculation
  const selectedOrg = organizations.find((o) => o.id === selectedOrgId);
  const isPersonalSelected = selectedOrgId === 'none' || !selectedOrgId;
  const personalPoolsCount = pools.filter(
    (p) => (!p.organizationId || p.organizationId === '') && p.championId === activeUser.id
  ).length;
  const orgPoolsCount = selectedOrg
    ? pools.filter((p) => p.organizationId === selectedOrg.id).length
    : 0;

  const isLimitReached = Boolean(
    !isPaidSubscriber && (
      (isPersonalSelected && personalPoolsCount >= 1) ||
      (selectedOrg && selectedOrg.tier === 'starter' && orgPoolsCount >= 1)
    )
  );

  // Join state
  const [joinCode, setJoinCode] = useState('');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const orgIdToPass = (!isOrganizationsEnabled || selectedOrgId === 'none' || selectedOrgId === '') ? null : selectedOrgId;

    onCreatePool(
      name.trim(),
      description.trim() || 'Shared consumables pool',
      category,
      currency,
      parseFloat(initialSeed) || 0,
      orgIdToPass
    );
    onClose();
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = extractJoinCode(joinCode);
    if (!clean) return;
    onJoinPool(clean);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col text-[#2D2D2D] shadow-2xl relative my-auto overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header & Tabs - Pinned at top */}
        <div className="flex items-center justify-between p-5 sm:p-6 pb-3 border-b border-[#EDE8E0] shrink-0 bg-white">
          <div className="flex items-center gap-1.5 bg-[#F0EBE3] p-1 rounded-lg border border-[#E0DAD1]">
            <button
              type="button"
              onClick={() => setTab('create')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                tab === 'create'
                  ? 'bg-[#E8694A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
              }`}
            >
              Create New Pool
            </button>
            <button
              type="button"
              onClick={() => setTab('join')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                tab === 'join'
                  ? 'bg-[#E8694A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
              }`}
            >
              Join with Code
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
            
            {/* Organization / Company Workspace Selector (SaaS Only) */}
            {isOrganizationsEnabled && (organizations.length > 0 || onOpenCreateOrg) && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#2D2D2D] flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-[#E8694A]" />
                    <span>Company / Organization Workspace</span>
                  </label>
                  {onOpenCreateOrg && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenCreateOrg();
                      }}
                      className="text-[11px] text-[#E8694A] hover:underline font-medium flex items-center gap-0.5"
                    >
                      <Plus className="h-3 w-3" />
                      <span>New Company</span>
                    </button>
                  )}
                </div>
                <select
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="w-full bg-[#FAF9F5] border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A]"
                >
                  <option value="none" className="bg-white text-[#2D2D2D]">
                    👤 No Company / Personal Pool (Independent)
                  </option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id} className="bg-white text-[#2D2D2D]">
                      🏢 {org.name} ({(org.tier || 'starter').toUpperCase()} Tier)
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#6B6B6B] mt-1">
                  {selectedOrgId === 'none'
                    ? 'Independent pool: not tied to any company workspace.'
                    : 'Company pool: shared across coworkers in this organization workspace.'}
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Pool Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 5th Floor Soda & Cold Brew Pool"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A]"
              >
                <option value="Office" className="bg-white text-[#2D2D2D]">Office / Worksite</option>
                <option value="Home / Apartment" className="bg-white text-[#2D2D2D]">Home / Roommates</option>
                <option value="Co-Working" className="bg-white text-[#2D2D2D]">Co-Working Space</option>
                <option value="Club / Group" className="bg-white text-[#2D2D2D]">Club / Social Group</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                  Currency Symbol
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A]"
                >
                  <option value="$" className="bg-white text-[#2D2D2D]">$ (USD/CAD/AUD)</option>
                  <option value="€" className="bg-white text-[#2D2D2D]">€ (EUR)</option>
                  <option value="£" className="bg-white text-[#2D2D2D]">£ (GBP)</option>
                  <option value="¥" className="bg-white text-[#2D2D2D]">¥ (JPY)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                  Initial Reserve ({currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  placeholder="0.00"
                  value={initialSeed}
                  onChange={(e) => setInitialSeed(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] text-[#5A9A6B] font-mono-financial font-semibold text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Description / Guidelines
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Self-service breakroom pool for cold drinks & snacks."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              />
            </div>

            {isLimitReached && (
              <div className="p-3 rounded-lg bg-[#FFF8EB] border border-[#D4870E]/30 text-[#8C5807] text-xs flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#D4870E] mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-[#2D2D2D]">Free Plan Pool Limit Reached (1/1)</div>
                  <p className="text-[11px] text-[#6B6B6B] leading-relaxed">
                    Free accounts are limited to 1 active pantry pool. Upgrade to a <strong>Hosted Standard Workspace ($5/mo)</strong> to manage up to 5 pantries, <strong>Hosted Plus ($12/mo)</strong> for up to 15 pantries, or <strong>Enterprise</strong> for unlimited pantries.
                  </p>
                  {onOpenCreateOrg && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenCreateOrg();
                      }}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#E8694A] hover:underline cursor-pointer"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Upgrade Workspace →</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            </div>

            <div className="p-4 sm:px-6 sm:py-3.5 border-t border-[#EDE8E0] bg-[#FAF8F5] shrink-0">
              {isLimitReached ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (onOpenCreateOrg) onOpenCreateOrg();
                  }}
                  className="w-full py-2.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Upgrade to Create More Pantries</span>
                </button>
              ) : (
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>Initialize New Pool</span>
                </button>
              )}
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoinSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2D2D2D] mb-1.5 flex items-center justify-between">
                  <span>Join Code or Invite Link</span>
                  <span className="text-[10px] text-[#6B6B6B] font-normal">Paste code or share URL</span>
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-[#E8694A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. PANTRY-4K9L2P or https://pantrypool.com/?join=..."
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] font-mono-financial font-semibold tracking-wide text-sm rounded-xl pl-10 pr-3 py-3 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
                  />
                </div>
                <p className="text-[11px] text-[#6B6B6B] mt-1.5 leading-normal">
                  Ask your pantry champion for their <strong>Share Link</strong> or <strong>Invite Code</strong>, or scan their printed breakroom QR poster.
                </p>
              </div>
            </div>

            <div className="p-4 sm:px-6 sm:py-3.5 border-t border-[#EDE8E0] bg-[#FAF8F5] shrink-0">
              <button
                type="submit"
                className="w-full py-2.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
              >
                <Users className="h-4 w-4" />
                <span>Join Team Pool</span>
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
