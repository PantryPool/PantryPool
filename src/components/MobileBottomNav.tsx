import React, { useState } from 'react';
import { 
  Package, 
  Users, 
  QrCode, 
  ShoppingBag, 
  MoreHorizontal, 
  ReceiptText, 
  BarChart3, 
  Vote, 
  Receipt, 
  Printer, 
  Monitor, 
  Radio, 
  Settings, 
  X,
  ChevronRight,
  Copy,
  Check,
  Share2
} from 'lucide-react';
import { useModals } from '../contexts/ModalContext';

export type MainTabType = 'catalog' | 'members' | 'ledger' | 'polls' | 'analytics';

interface MobileBottomNavProps {
  activeTab: MainTabType;
  onTabChange: (tab: MainTabType) => void;
  onOpenQRScanner: () => void;
  onOpenShoppingList: () => void;
  shoppingListCount: number;
  poolCode?: string;
  onOpenLegal?: (tab: 'terms' | 'privacy' | 'user-agreement') => void;
  onOpenPolls?: () => void;
  onOpenReceiptScanner?: () => void;
  onOpenKiosk?: () => void;
  onOpenPoster?: () => void;
  onOpenNfc?: () => void;
  onOpenManagePool?: () => void;
  onOpenSharePool?: () => void;
  kioskModeEnabled?: boolean;
  pollsCount?: number;
  transactionsCount?: number;
  isManager?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  onOpenQRScanner,
  onOpenShoppingList,
  shoppingListCount,
  poolCode,
  onOpenLegal,
  onOpenPolls,
  onOpenReceiptScanner,
  onOpenKiosk,
  onOpenPoster,
  onOpenNfc,
  onOpenManagePool,
  onOpenSharePool,
  kioskModeEnabled = true,
  pollsCount = 0,
  transactionsCount = 0,
  isManager,
}) => {
  const modals = useModals();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = () => {
    if (poolCode) {
      navigator.clipboard.writeText(poolCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const isMoreActive = activeTab === 'ledger' || activeTab === 'analytics';

  return (
    <>
      {/* Mobile Slide-Up Action Sheet Drawer */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsSheetOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative bg-[#FAFAF8] border-t border-[#E0DAD1] rounded-t-2xl p-4 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom duration-200">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3">
              <div>
                <h3 className="font-semibold text-sm text-[#2D2D2D]">Pantry Hub & Views</h3>
                <p className="text-[11px] text-[#6B6B6B]">Quick access to reports, tools & settings</p>
              </div>
              <button
                onClick={() => setIsSheetOpen(false)}
                className="p-1.5 rounded-full bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#6B6B6B] transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Join Code Card */}
            {poolCode && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#E0DAD1] shadow-xs">
                <div>
                  <div className="text-[10px] text-[#6B6B6B] font-medium uppercase tracking-wider">Pantry Join Code</div>
                  <div className="font-mono-financial text-sm font-bold text-[#2D2D2D] tracking-wider mt-0.5">{poolCode}</div>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] transition cursor-pointer"
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5 text-[#5A9A6B]" /> : <Copy className="h-3.5 w-3.5 text-[#6B6B6B]" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            )}

            {/* Section 1: Views & Reports */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-[#6B6B6B] uppercase tracking-wider px-1 block">
                Activity & Reports
              </span>

              <div className="grid grid-cols-1 gap-1.5">
                {/* Ledger */}
                <button
                  onClick={() => {
                    onTabChange('ledger');
                    setIsSheetOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition text-left cursor-pointer ${
                    activeTab === 'ledger'
                      ? 'bg-[#FDF0EC] border-[#E8694A]/40 text-[#E8694A]'
                      : 'bg-white border-[#E0DAD1] hover:bg-[#F0EBE3] text-[#2D2D2D]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#F0EBE3] text-[#2D2D2D]">
                      <ReceiptText className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-xs">Ledger & Transaction History</div>
                      <div className="text-[10px] text-[#6B6B6B]">Audit trail of purchases & deposits</div>
                    </div>
                  </div>
                  {transactionsCount > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F0EBE3] text-[#6B6B6B]">
                      {transactionsCount}
                    </span>
                  )}
                </button>

                {/* Analytics */}
                <button
                  onClick={() => {
                    onTabChange('analytics');
                    setIsSheetOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition text-left cursor-pointer ${
                    activeTab === 'analytics'
                      ? 'bg-[#FDF0EC] border-[#E8694A]/40 text-[#E8694A]'
                      : 'bg-white border-[#E0DAD1] hover:bg-[#F0EBE3] text-[#2D2D2D]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#F0EBE3] text-[#2D2D2D]">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-xs">Analytics & Velocity</div>
                      <div className="text-[10px] text-[#6B6B6B]">Breakroom consumption trends</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#9A9A9A]" />
                </button>

                {/* Polls */}
                <button
                  onClick={() => {
                    if (onOpenPolls) onOpenPolls();
                    else modals.openModal('polls');
                    setIsSheetOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-[#E0DAD1] hover:bg-[#F0EBE3] transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#FFF8EB] text-[#D4870E]">
                      <Vote className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-xs text-[#2D2D2D]">Item Polls & Voting</div>
                      <div className="text-[10px] text-[#6B6B6B]">Request and vote on snacks</div>
                    </div>
                  </div>
                  {pollsCount > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF8EB] text-[#D4870E]">
                      {pollsCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Section 2: Breakroom Hardware & Tools */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-semibold text-[#6B6B6B] uppercase tracking-wider px-1 block">
                Hardware & Tools
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (onOpenSharePool) onOpenSharePool();
                    else modals.openModal('sharePool');
                    setIsSheetOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl bg-[#FDF0EC] border border-[#FADCD5] hover:bg-[#FADCD5] transition text-left cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-[#E8694A] text-white mb-2 shadow-xs">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div className="font-semibold text-xs text-[#2D2D2D]">Share & Invite</div>
                  <div className="text-[10px] text-[#6B6B6B]">AirDrop, link & chat</div>
                </button>

                <button
                  onClick={() => {
                    if (onOpenReceiptScanner) onOpenReceiptScanner();
                    else modals.openModal('receipt');
                    setIsSheetOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl bg-white border border-[#E0DAD1] hover:bg-[#F0EBE3] transition text-left cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-[#EDF5EF] text-[#5A9A6B] mb-2">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div className="font-medium text-xs text-[#2D2D2D]">Receipt OCR</div>
                  <div className="text-[10px] text-[#6B6B6B]">Scan store receipts</div>
                </button>


                <button
                  onClick={() => {
                    if (onOpenPoster) onOpenPoster();
                    else modals.openModal('poster');
                    setIsSheetOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl bg-white border border-[#E0DAD1] hover:bg-[#F0EBE3] transition text-left cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-[#F0EBE3] text-[#2D2D2D] mb-2">
                    <Printer className="h-4 w-4" />
                  </div>
                  <div className="font-medium text-xs text-[#2D2D2D]">Fridge Poster</div>
                  <div className="text-[10px] text-[#6B6B6B]">Print wall QR codes</div>
                </button>

                {kioskModeEnabled && (
                  <button
                    onClick={() => {
                      if (onOpenKiosk) onOpenKiosk();
                      else modals.openModal('kiosk');
                      setIsSheetOpen(false);
                    }}
                    className="flex flex-col items-start p-3 rounded-xl bg-white border border-[#E0DAD1] hover:bg-[#F0EBE3] transition text-left cursor-pointer"
                  >
                    <div className="p-2 rounded-lg bg-[#F0EBE3] text-[#2D2D2D] mb-2">
                      <Monitor className="h-4 w-4" />
                    </div>
                    <div className="font-medium text-xs text-[#2D2D2D]">Kiosk Mode</div>
                    <div className="text-[10px] text-[#6B6B6B]">Station touchscreen</div>
                  </button>
                )}

                <button
                  onClick={() => {
                    if (onOpenNfc) onOpenNfc();
                    else modals.openModal('nfc');
                    setIsSheetOpen(false);
                  }}
                  className="flex flex-col items-start p-3 rounded-xl bg-white border border-[#E0DAD1] hover:bg-[#F0EBE3] transition text-left cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-[#EDF5EF] text-[#2E7D32] mb-2">
                    <Radio className="h-4 w-4" />
                  </div>
                  <div className="font-medium text-xs text-[#2D2D2D]">NFC Tag Hub</div>
                  <div className="text-[10px] text-[#6B6B6B]">Tap-to-log stickers</div>
                </button>
              </div>
            </div>

            {/* Section 3: Pool Management */}
            {isManager && (
              <div className="pt-1">
                <button
                  onClick={() => {
                    if (onOpenManagePool) onOpenManagePool();
                    else modals.openModal('managePool');
                    setIsSheetOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-[#E0DAD1] hover:bg-[#F0EBE3] transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#F0EBE3] text-[#6B6B6B]">
                      <Settings className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-xs text-[#2D2D2D]">Pantry & Pool Settings</div>
                      <div className="text-[10px] text-[#6B6B6B]">Manage members, notifications & rules</div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#9A9A9A]" />
                </button>
              </div>
            )}

            {/* Section 4: Legal & Policies */}
            <div className="pt-2 border-t border-[#EDE8E0] space-y-1.5">
              <span className="text-[10px] font-semibold text-[#6B6B6B] uppercase tracking-wider px-1 block">
                Legal & Policies
              </span>
              <div className="flex items-center justify-around gap-2 px-1 text-xs text-[#6B6B6B]">
                <button
                  onClick={() => {
                    if (onOpenLegal) onOpenLegal('terms');
                    else modals.openModal('legal', { tab: 'terms' });
                    setIsSheetOpen(false);
                  }}
                  className="hover:text-[#2D2D2D] py-1 transition cursor-pointer"
                >
                  Terms
                </button>
                <span>•</span>
                <button
                  onClick={() => {
                    if (onOpenLegal) onOpenLegal('privacy');
                    else modals.openModal('legal', { tab: 'privacy' });
                    setIsSheetOpen(false);
                  }}
                  className="hover:text-[#2D2D2D] py-1 transition cursor-pointer"
                >
                  Privacy
                </button>
                <span>•</span>
                <button
                  onClick={() => {
                    if (onOpenLegal) onOpenLegal('user-agreement');
                    else modals.openModal('legal', { tab: 'user-agreement' });
                    setIsSheetOpen(false);
                  }}
                  className="hover:text-[#2D2D2D] py-1 transition cursor-pointer"
                >
                  Agreement
                </button>
                  <span>•</span>
                  <button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('open_cookie_preferences'));
                      setIsSheetOpen(false);
                    }}
                    className="hover:text-[#E8694A] py-1 transition cursor-pointer"
                  >
                    Cookies
                  </button>
                </div>
              </div>

          </div>
        </div>
      )}

      {/* Sticky Bottom Navigation Bar */}
      <nav aria-label="Mobile Navigation" className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E0DAD1] px-2 py-1 md:hidden shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-around relative">
          
          {/* Catalog Tab */}
          <button
            onClick={() => onTabChange('catalog')}
            className={`flex flex-col items-center gap-0.5 p-1.5 transition cursor-pointer ${
              activeTab === 'catalog' ? 'text-[#E8694A] font-semibold' : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Package className="h-5 w-5" />
            <span className="text-[10px]">Catalog</span>
            {activeTab === 'catalog' && (
              <span className="w-1 h-1 rounded-full bg-[#E8694A]" />
            )}
          </button>

          {/* Team Members Tab */}
          <button
            onClick={() => onTabChange('members')}
            data-testid="tab-members"
            aria-label="Members"
            title="Members"
            className={`flex flex-col items-center gap-0.5 p-1.5 transition cursor-pointer ${
              activeTab === 'members' ? 'text-[#E8694A] font-semibold' : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Users className="h-5 w-5" />
            <span className="text-[10px]">Members</span>
            {activeTab === 'members' && (
              <span className="w-1 h-1 rounded-full bg-[#E8694A]" />
            )}
          </button>

          {/* Center Prominent QR Code Scan Button */}
          <div className="relative -top-3">
            <button
              onClick={onOpenQRScanner}
              className="h-11 w-11 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white flex flex-col items-center justify-center shadow-md border-2 border-white active:scale-95 transition cursor-pointer"
              title="Scan Fridge QR Code"
            >
              <QrCode className="h-5 w-5 stroke-[2.5]" />
            </button>
            <span className="text-[9px] font-semibold text-[#E8694A] text-center block mt-0.5">
              Scan
            </span>
          </div>

          {/* Restock Shopping List */}
          <button
            onClick={onOpenShoppingList}
            className="flex flex-col items-center gap-0.5 p-1.5 text-[#6B6B6B] hover:text-[#2D2D2D] transition relative cursor-pointer"
          >
            <ShoppingBag className="h-5 w-5" />
            <span className="text-[10px]">Restock</span>
            {shoppingListCount > 0 && (
              <span className="absolute top-0.5 right-1.5 h-4 w-4 bg-[#E8694A] text-white font-medium text-[9px] rounded-full flex items-center justify-center border border-white">
                {shoppingListCount}
              </span>
            )}
          </button>

          {/* More Action Sheet Button */}
          <button
            onClick={() => setIsSheetOpen(true)}
            aria-label="Open quick actions and pantry tools"
            title="Open quick actions and pantry tools"
            className={`flex flex-col items-center gap-0.5 p-1.5 transition cursor-pointer relative ${
              isMoreActive ? 'text-[#E8694A] font-semibold' : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px]">More</span>
            {isMoreActive && (
              <span className="w-1 h-1 rounded-full bg-[#E8694A]" />
            )}
          </button>

        </div>
      </nav>
    </>
  );
};


