import React, { useState } from 'react';
import { Pool, User, PaymentProvider } from '../types';
import { 
  generateSettleUpLinks, 
  getTopCreditedContributors, 
  getUserPaymentHandles, 
  hasAnyPaymentHandle 
} from '../lib/settleUp';
import { 
  X, 
  DollarSign, 
  ExternalLink, 
  Copy, 
  Check, 
  ShieldAlert, 
  Sparkles, 
  CreditCard, 
  Trophy, 
  HeartHandshake, 
  Star,
  ShoppingBag,
  Info
} from 'lucide-react';

interface SettleUpModalProps {
  pool: Pool;
  currentUser: User | null;
  targetUser?: User | null;
  onClose: () => void;
  onNavigateToRestock?: () => void;
}

const PROVIDER_NAMES: Record<string, string> = {
  venmo: 'Venmo',
  cashapp: 'Cash App',
  paypal: 'PayPal',
  zelle: 'Zelle',
  applepay: 'Apple Pay',
};

export const SettleUpModal: React.FC<SettleUpModalProps> = ({
  pool,
  currentUser,
  targetUser,
  onClose,
  onNavigateToRestock,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // User who is paying / contributing
  const payingUser = (targetUser && targetUser.id === currentUser?.id) ? targetUser : (currentUser || targetUser);
  const payingBalance = payingUser?.balance ?? 0;
  const initialAmount = payingBalance < 0 ? Math.abs(payingBalance) : 5.0;
  const [customAmount, setCustomAmount] = useState<string>(initialAmount.toFixed(2));

  // Find top 3 credited contributors (members who brought in items / have positive balances)
  const topCreditedMembers = getTopCreditedContributors(pool.members || [], 3);
  
  // Selected recipient contributor
  const defaultRecipientId = 
    (targetUser && targetUser.id !== currentUser?.id ? targetUser.id : '') ||
    topCreditedMembers.find((m) => m.id !== currentUser?.id)?.id ||
    topCreditedMembers[0]?.id ||
    pool.championId ||
    pool.members.find((m) => m.id !== currentUser?.id)?.id ||
    pool.members[0]?.id ||
    '';

  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(defaultRecipientId);

  const selectedRecipient = pool.members.find((m) => m.id === selectedRecipientId) || topCreditedMembers[0] || pool.members[0];

  // Recipient payment handles & preferred method
  const recipientHandles = getUserPaymentHandles(selectedRecipient);
  
  // Fallback to pool handles if recipient has none configured
  const effectiveHandles = hasAnyPaymentHandle(recipientHandles)
    ? recipientHandles
    : {
        venmo: (pool as any).venmoHandle || '',
        cashapp: (pool as any).cashappHandle || '',
        paypal: (pool as any).paypalHandle || '',
        zelle: (pool as any).zelleIdentifier || '',
        applepay: (pool as any).applePayHandle || '',
        preferred: undefined,
      };

  const parsedAmount = parseFloat(customAmount) > 0 ? parseFloat(customAmount) : 5.0;
  const preferredMethod = selectedRecipient?.preferredPaymentMethod || recipientHandles.preferred || (effectiveHandles as any).preferred;
  const settleLinks = generateSettleUpLinks(
    pool.name, 
    parsedAmount, 
    effectiveHandles, 
    preferredMethod
  );

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const rankMedals = ['🥇', '🥈', '🥉'];

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col text-[#2D2D2D] shadow-2xl relative my-auto overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header - Pinned at top */}
        <div className="flex items-center justify-between p-5 sm:p-6 pb-3 border-b border-[#EDE8E0] shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#FDF0EC] text-[#E8694A]">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#2D2D2D] flex items-center gap-2">
                P2P Contribute & Settle Up
                <Sparkles className="h-4 w-4 text-[#E8694A]" />
              </h2>
              <p className="text-xs text-[#6B6B6B]">Reimburse top contributors who stocked items in {pool.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Gentle Community Reminder Banner */}
          <div className="p-3.5 rounded-xl bg-[#FFF8EB] border border-[#D4870E]/30 text-xs text-[#2D2D2D] space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">🥤</span>
            <div className="space-y-1">
              <span className="font-semibold text-[#8C5807]">Taking sodas or snacks?</span>
              <p className="text-[11.5px] text-[#6B6B6B] leading-relaxed">
                PantryPool is a community-sustained pantry. When you take items, you can <span className="font-medium text-[#2D2D2D]">send funds directly to the top 3 members who bought them</span>, or <span className="font-medium text-[#2D2D2D]">bring in items yourself next time</span> to earn pool credit!
              </p>
            </div>
          </div>

          {onNavigateToRestock && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToRestock();
                }}
                className="text-[11px] font-semibold text-[#E8694A] hover:underline flex items-center gap-1"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                I will bring in items myself (Log purchase / receipt) &rarr;
              </button>
            </div>
          )}
        </div>

        {/* Outstanding Balance & Custom Amount Selector */}
        <div className="bg-[#FAF8F5] border border-[#E0DAD1] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#6B6B6B]">
              {payingUser ? `${payingUser.name}'s Current Balance` : 'Your Balance'}
            </span>
            <span className={`text-base font-extrabold font-mono-financial ${payingBalance < 0 ? 'text-[#E8694A]' : 'text-[#437A65]'}`}>
              {payingBalance < 0 ? `-$${Math.abs(payingBalance).toFixed(2)}` : `+$${payingBalance.toFixed(2)}`}
            </span>
          </div>

          <div className="space-y-1.5 pt-1 border-t border-[#E0DAD1]/60">
            <label className="block text-xs font-semibold text-[#2D2D2D]">
              Contribution Amount ({pool.currency})
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9A9A] font-semibold text-xs">
                  {pool.currency}
                </span>
                <input
                  type="number"
                  step="0.50"
                  min="0.50"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] rounded-lg pl-7 pr-3 py-1.5 text-xs text-[#2D2D2D] font-mono-financial font-semibold focus:outline-none focus:border-[#E8694A]"
                />
              </div>

              {/* Preset quick buttons */}
              {['2.00', '5.00', '10.00', '20.00'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCustomAmount(preset)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold font-mono-financial border transition ${
                    customAmount === preset
                      ? 'bg-[#E8694A] text-white border-[#E8694A]'
                      : 'bg-white text-[#6B6B6B] border-[#E0DAD1] hover:bg-[#F0EBE3]'
                  }`}
                >
                  +{pool.currency}{parseFloat(preset)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Top 3 Credited Contributors Selection */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#2D2D2D] uppercase tracking-wider flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-[#D4870E]" />
              Send To: Top 3 With Credit For Bringing Items
            </label>
            <span className="text-[10px] text-[#6B6B6B] font-medium">Select Recipient</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {topCreditedMembers.map((member, index) => {
              const isSelected = selectedRecipient?.id === member.id;
              const hasCredit = member.balance > 0;
              const pref = member.preferredPaymentMethod;

              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setSelectedRecipientId(member.id)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition relative ${
                    isSelected
                      ? 'border-[#E8694A] bg-[#FDF0EC] ring-1 ring-[#E8694A]/40 shadow-xs'
                      : 'border-[#E0DAD1] bg-white hover:border-[#9A9A9A] hover:bg-[#FAF8F5]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm">{rankMedals[index] || '⭐️'}</span>
                    <div className="overflow-hidden">
                      <div className="text-xs font-bold text-[#2D2D2D] truncate">
                        {member.name}
                      </div>
                      <div className="text-[10px] text-[#5A9A6B] font-semibold font-mono-financial">
                        {hasCredit ? `+${pool.currency}${member.balance.toFixed(2)} credit` : `${pool.currency}0.00`}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-[#EDE8E0] flex items-center justify-between text-[10px]">
                    <span className="text-[#6B6B6B] truncate font-medium">
                      {pref ? `⭐ Prefers ${PROVIDER_NAMES[pref] || pref}` : (member.role === 'champion' ? 'Champion' : 'Stocker')}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#E8694A] stroke-[2.5]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Contributor Payment Channels */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#2D2D2D] uppercase tracking-wider flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-[#E8694A]" />
              {selectedRecipient?.name}'s Payment Channels
            </label>
            {selectedRecipient?.preferredPaymentMethod && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EDF5EF] text-[#5A9A6B] font-semibold flex items-center gap-1">
                <Star className="w-3 h-3 fill-[#5A9A6B]" />
                Prefers {PROVIDER_NAMES[selectedRecipient.preferredPaymentMethod] || selectedRecipient.preferredPaymentMethod}
              </span>
            )}
          </div>

          {settleLinks.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5">
              {settleLinks.map((link) => (
                <div
                  key={link.provider}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition shadow-xs group ${
                    link.isPreferred
                      ? 'border-[#E8694A] bg-[#FFFBF8] ring-1 ring-[#E8694A]/20'
                      : 'border-[#E0DAD1] bg-white hover:border-[#9A9A9A]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-xs"
                      style={{ backgroundColor: link.badgeColor }}
                    >
                      {link.label.slice(0, 1)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#2D2D2D] flex items-center gap-1.5">
                        <span>{link.label}</span>
                        {link.isPreferred && (
                          <span className="text-[9px] bg-[#E8694A] text-white px-1.5 py-0.2 rounded font-semibold">
                            Preferred
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#6B6B6B] font-mono-financial">
                        {link.identifier || link.instructions}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {link.identifier && (
                      <button
                        onClick={() => handleCopy(link.provider, link.identifier!)}
                        title="Copy handle"
                        className="p-1.5 rounded-md hover:bg-[#F0EBE3] text-[#6B6B6B] transition"
                      >
                        {copiedId === link.provider ? (
                          <Check className="h-4 w-4 text-[#437A65]" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    {link.url && (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E8694A] hover:bg-[#D2583A] text-white text-xs font-semibold shadow-xs transition"
                      >
                        Pay ${parsedAmount.toFixed(2)} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] text-center space-y-2">
              <CreditCard className="h-6 w-6 text-[#9A9A9A] mx-auto" />
              <p className="text-xs text-[#6B6B6B]">
                {selectedRecipient?.name} has not configured P2P handles yet. You can remind them in Profile Settings or choose another top contributor above!
              </p>
            </div>
          )}
        </div>

        {/* Non-Custodial Legal Notice */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#FDF0EC]/60 border border-[#FADCD5] text-[11px] text-[#6B6B6B] leading-relaxed">
          <ShieldAlert className="h-4 w-4 text-[#E8694A] shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-[#2D2D2D]">Communal Ledger Notice: </span>
            PantryPool is an informal communal tracking system. P2P transfers are sent directly to the member who purchased pantry stock.
          </div>
        </div>

        </div>

        {/* Footer Close - Pinned at bottom */}
        <div className="p-4 sm:px-6 sm:py-3.5 border-t border-[#EDE8E0] shrink-0 bg-[#FAF8F5]">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-[#F0EBE3] hover:bg-[#E5DFD6] text-[#2D2D2D] text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            Close Settle Up
          </button>
        </div>

      </div>
    </div>
  );
};
