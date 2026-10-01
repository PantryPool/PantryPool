import React, { useState } from 'react';
import { 
  X, 
  Coffee, 
  Smartphone, 
  Receipt, 
  Printer, 
  Wallet, 
  QrCode, 
  ShieldCheck, 
  HelpCircle, 
  Sparkles,
  TrendingDown
} from 'lucide-react';

interface HelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'members' | 'managers' | 'faq';
  kioskModeEnabled?: boolean;
}

export const HelpGuideModal: React.FC<HelpGuideModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'members',
  kioskModeEnabled = true,
}) => {
  const [activeTab, setActiveTab] = useState<'members' | 'managers' | 'faq'>(initialTab);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div 
        className="bg-white border border-[#E0DAD1] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden text-[#2D2D2D]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E0DAD1] bg-[#FAF8F5]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#E8694A]/10 text-[#E8694A]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="help-modal-title" className="text-base font-bold text-[#2D2D2D]">
                PantryPool Quick Guide
              </h2>
              <p className="text-xs text-[#6B6B6B]">
                Everything you need to know about communal breakrooms and pantries.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#E0DAD1]/50 text-[#6B6B6B] transition cursor-pointer"
            aria-label="Close guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#E0DAD1] bg-[#FAF8F5]/50 px-6 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'members'
                ? 'border-[#E8694A] text-[#E8694A] bg-white'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            <span>For Members</span>
          </button>
          <button
            onClick={() => setActiveTab('managers')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'managers'
                ? 'border-[#E8694A] text-[#E8694A] bg-white'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>For Managers & Buyers</span>
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'faq'
                ? 'border-[#E8694A] text-[#E8694A] bg-white'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>FAQ & Tips</span>
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#6B6B6B] leading-relaxed flex-1">
          
          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#2D2D2D]">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <h4>How to log a drink or snack</h4>
                </div>
                <p>
                  Whenever you take something from the breakroom, open PantryPool (or scan the Fridge Door QR poster with your smartphone camera). Tap the item in the catalog. It updates immediately with 0ms delay.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#2D2D2D]">
                  <Wallet className="w-4 h-4 text-purple-600" />
                  <h4>How your tab works & settling up</h4>
                </div>
                <p>
                  You don't need a credit card on file. PantryPool keeps an honest communal ledger. If your balance dips into the negative, click the <strong>"Settle Up"</strong> button to square up directly with the pantry champion via Venmo, Cash App, PayPal, or cash.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#2D2D2D]">
                  <TrendingDown className="w-4 h-4 text-emerald-600" />
                  <h4>Savings vs Vending Machines</h4>
                </div>
                <p>
                  Every time you grab cold brew, soda, or snacks from PantryPool, you're buying at wholesale bulk cost (Costco/Trader Joe's). The live savings ticker calculates your dollars saved compared to standard office vending machine pricing!
                </p>
              </div>
            </div>
          )}

          {activeTab === 'managers' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#2D2D2D]">
                  <Receipt className="w-4 h-4 text-[#E8694A]" />
                  <h4>Restocking with Multimodal AI Receipt Scanning</h4>
                </div>
                <p>
                  Whenever you buy groceries for the breakroom, click <strong>"Scan Receipt"</strong>. Gemini Vision AI automatically parses every line item, volume discount, and sales tax split. It restocks the inventory and instantly credits your balance for the money you spent!
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#2D2D2D]">
                  <Printer className="w-4 h-4 text-blue-600" />
                  <h4>Printable Fridge Signage & Barcodes</h4>
                </div>
                <p>
                  Click <strong>"Print Poster"</strong> in the pool summary card to generate a ready-to-print 8.5x11 PDF. Tape it to the fridge door so coworkers can scan with their phone camera. You can also print individual QR code labels for snack bins or shelves!
                </p>
              </div>

              {kioskModeEnabled && (
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#2D2D2D]">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <h4>Breakroom Tablet Kiosk Mode</h4>
                  </div>
                  <p>
                    Have an old iPad or tablet? Put it on a stand next to the coffee maker and click <strong>"Kiosk Mode"</strong> in the Tools menu. It locks the view into a high-speed, tap-to-consume terminal.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'faq' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] space-y-1.5">
                <h4 className="text-xs font-bold text-[#2D2D2D]">What if I accidentally tap an item I didn't take?</h4>
                <p>
                  Pantry champions can easily adjust stock discrepancies or refund erroneous transactions from the member balance ledger with 1 click.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] space-y-1.5">
                <h4 className="text-xs font-bold text-[#2D2D2D]">What happens if the office WiFi drops?</h4>
                <p>
                  PantryPool has an offline mutation queue. Any items consumed while offline are queued securely in your browser and automatically flushed to the server once connectivity resumes.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E0DAD1] space-y-1.5">
                <h4 className="text-xs font-bold text-[#2D2D2D]">Can members vote on what groceries to buy next?</h4>
                <p>
                  Yes! Use the <strong>"Restock Polls"</strong> feature in the pool tools to propose new snacks or coffee flavors and let the team vote with their balance.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#E0DAD1] bg-[#FAF8F5] flex items-center justify-between">
          <span className="text-[11px] text-[#A8A29E]">
            Have more questions? Ask your pool champion.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#2D2D2D] hover:bg-[#1A1A1A] text-white text-xs font-semibold rounded-full transition cursor-pointer"
          >
            Close Guide
          </button>
        </div>

      </div>
    </div>
  );
};
