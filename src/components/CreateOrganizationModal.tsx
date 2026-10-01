import React, { useState, useEffect } from 'react';
import { X, Building2, Check, AlertCircle, KeyRound, ArrowRight, Sparkles } from 'lucide-react';
import { joinOrganizationApi, createOrganizationApi, ApiOrganization } from '../lib/api';
import { extractJoinCode } from '../lib/joinCode';
import { EnterpriseInquiryModal } from './EnterpriseInquiryModal';

interface CreateOrganizationModalProps {
  isOpen: boolean;
  ownerId: string;
  initialTier?: 'standard' | 'plus';
  initialBillingCycle?: 'monthly' | 'yearly';
  onClose: () => void;
  onSuccess: (org: ApiOrganization) => void;
}

export const CreateOrganizationModal: React.FC<CreateOrganizationModalProps> = ({
  isOpen,
  ownerId,
  initialTier = 'standard',
  initialBillingCycle = 'monthly',
  onClose,
  onSuccess,
}) => {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [tier, setTier] = useState<'standard' | 'plus'>(initialTier || 'standard');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(initialBillingCycle || 'monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnterpriseOpen, setIsEnterpriseOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialTier) setTier(initialTier);
      if (initialBillingCycle) setBillingCycle(initialBillingCycle);
    }
  }, [isOpen, initialTier, initialBillingCycle]);

  if (!isOpen) return null;

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = extractJoinCode(joinCode);
    if (!clean) {
      setError('Please enter a valid workspace invite code or link.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await joinOrganizationApi(clean);
      if (res.success && res.organization) {
        onSuccess(res.organization);
        onClose();
      } else {
        setError(res.error || 'Invalid or expired workspace invite code.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while joining the workspace.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your company or organization name.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await createOrganizationApi(name.trim(), ownerId, tier);
      if (data.success && data.organization) {
        onSuccess(data.organization);
        onClose();
        return;
      } else {
        setError(data.error || 'Failed to create workspace.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2D2D]/40 animate-fadeIn">
      <div className="relative w-full max-w-md bg-white border border-[#E0DAD1] rounded-xl shadow-xl overflow-hidden p-6 text-[#2D2D2D]">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#6B6B6B] hover:text-[#2D2D2D] p-1.5 rounded-md hover:bg-[#F0EBE3] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#FDF0EC] text-[#E8694A] mb-3">
            <Building2 className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-semibold text-[#2D2D2D]">
            Company Workspace
          </h2>
          <p className="text-xs text-[#6B6B6B] mt-1">
            Manage floor & breakroom pools under one shared team organization
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-[#F0EBE3] p-1 rounded-lg border border-[#E0DAD1] mb-5">
          <button
            type="button"
            onClick={() => { setTab('create'); setError(null); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition text-center ${
              tab === 'create'
                ? 'bg-[#E8694A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            Create Workspace
          </button>
          <button
            type="button"
            onClick={() => { setTab('join'); setError(null); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition text-center ${
              tab === 'join'
                ? 'bg-[#E8694A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            Join with Invite Code
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-md bg-[#FDF0EC] border border-[#C9553D]/30 text-[#C9553D] text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {tab === 'join' ? (
          <form onSubmit={handleJoinSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Workspace Invite Code or Link
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                <input
                  type="text"
                  required
                  placeholder="e.g. ORG_ABC123 or invite link"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] rounded-md py-2 pl-9 pr-3 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] outline-none transition uppercase tracking-wider"
                />
              </div>
              <p className="text-[11px] text-[#6B6B6B] mt-1.5">
                Paste the invite code or link provided by your workspace admin.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium rounded-full shadow-xs transition flex items-center justify-center gap-2 text-xs disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Join Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Company / Organization Name
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                <input
                  type="text"
                  required
                  placeholder="Acme Corp HQ"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] rounded-md py-2 pl-9 pr-3 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] outline-none transition"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5">
                <label className="block text-xs font-medium text-[#2D2D2D]">
                  Workspace Tier
                </label>
                <p className="text-[10px] text-[#6B6B6B]">
                  Select the resource limits for your multi-pantry workspace.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setTier('standard')}
                  className={`p-3 rounded-lg border text-left transition ${
                    tier === 'standard'
                      ? 'bg-[#FDF0EC] border-[#E8694A] text-[#2D2D2D]'
                      : 'bg-white border-[#E0DAD1] text-[#6B6B6B] hover:bg-[#F0EBE3]'
                  }`}
                >
                  <div className="font-semibold text-xs text-[#E8694A]">
                    Standard
                  </div>
                  <div className="text-[10px] text-[#6B6B6B]">
                    Up to 5 Pantries
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setTier('plus')}
                  className={`p-3 rounded-lg border text-left transition ${
                    tier === 'plus'
                      ? 'bg-[#FDF0EC] border-[#E8694A] text-[#2D2D2D]'
                      : 'bg-white border-[#E0DAD1] text-[#6B6B6B] hover:bg-[#F0EBE3]'
                  }`}
                >
                  <div className="font-semibold text-xs">Plus</div>
                  <div className="text-[10px] text-[#6B6B6B]">
                    Up to 15 Pantries
                  </div>
                </button>
              </div>

              <div className="mt-2.5 text-center">
                <button
                  type="button"
                  onClick={() => setIsEnterpriseOpen(true)}
                  className="text-[11px] text-purple-700 hover:text-purple-900 font-medium hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-purple-600" />
                  <span>Need unlimited pantries or custom deployment? Contact Enterprise →</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium rounded-full shadow-xs transition flex items-center justify-center gap-2 text-xs disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Create Workspace</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <EnterpriseInquiryModal
        isOpen={isEnterpriseOpen}
        onClose={() => setIsEnterpriseOpen(false)}
        defaultCompany={name}
      />
    </div>
  );
};
