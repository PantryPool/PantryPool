import React, { useState, useRef, useEffect } from 'react';
import { Pool, User } from '../types';
import { 
  PackageCheck, 
  ChevronDown, 
  Plus, 
  Volume2, 
  VolumeX, 
  Monitor, 
  Receipt, 
  RotateCcw, 
  QrCode, 
  Printer, 
  Wrench, 
  LogIn, 
  LogOut, 
  Building2, 
  ShieldCheck, 
  Bell, 
  Bot,
  Database,
  Radio,
  Trash2,
  ShoppingBag,
  CreditCard,
  UserPlus,
  Check,
  HelpCircle
} from 'lucide-react';
import { AuthUser, ApiOrganization, isOrganizationsEnabled } from '../lib/api';
import { PantryPoolLogo } from './Logo';
import { getDefaultAvatarUrl } from '../lib/avatar';
import { LegalTabType } from './LegalModal';
import { useModals } from '../contexts/ModalContext';

interface HeaderProps {
  pools: Pool[];
  activePool?: Pool;
  organizations?: ApiOrganization[];
  activeOrgId?: string;
  onSelectOrg?: (orgId: string) => void;
  onOpenCreateOrg?: () => void;
  onOpenBillingPortal?: () => void;
  activeUser: User;
  authUser: AuthUser | null;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  onSelectPool: (poolId: string) => void;
  onSelectUser: (userId: string) => void;
  onOpenCreatePool: () => void;
  onOpenKiosk: () => void;
  onOpenReceiptScanner: () => void;
  onOpenQRScanner: () => void;
  onOpenPoster: () => void;
  onOpenNfc?: () => void;
  onOpenWebhooks?: () => void;
  onDeleteActiveOrg?: () => void;
  isCompanyAccount?: boolean;
  isCompanyAdmin?: boolean;
  isPaidSubscriber?: boolean;
  currentOrgTier?: string;
  kioskModeEnabled?: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenAdminConsole?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationCount?: number;
  onOpenUserProfile?: () => void;
  onOpenLegal?: (tab: LegalTabType) => void;
  onOpenHelpGuide?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  pools,
  activePool,
  organizations = [],
  activeOrgId,
  onSelectOrg,
  onOpenCreateOrg,
  onOpenBillingPortal,
  authUser,
  onOpenAuthModal,
  onLogout,
  onSelectPool,
  onOpenCreatePool,
  onOpenKiosk,
  onOpenReceiptScanner,
  onOpenQRScanner,
  onOpenPoster,
  onOpenNfc,
  onOpenWebhooks,
  onDeleteActiveOrg,
  isCompanyAccount = false,
  isCompanyAdmin = false,
  isPaidSubscriber = false,
  currentOrgTier = 'starter',
  kioskModeEnabled = true,
  soundEnabled,
  onToggleSound,
  onOpenAdminConsole,
  onOpenNotifications,
  unreadNotificationCount = 0,
  onOpenUserProfile,
  onOpenLegal,
  onOpenHelpGuide,
}) => {
  const modals = useModals();
  const [toolsOpen, setToolsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const [copiedOrgInvite, setCopiedOrgInvite] = useState(false);

  const handleCopyOrgInvite = (code: string) => {
    const inviteUrl = `${window.location.origin}/?org_join=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedOrgInvite(true);
    setTimeout(() => setCopiedOrgInvite(false), 2000);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-[#FFFFFF] border-b border-[#E0DAD1] text-[#2D2D2D] shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        
        {/* Brand Logo */}
        <PantryPoolLogo showSubtitle iconSize={32} subtitleClassName="hidden lg:block" />

        {/* Landing Navigation Links (When Logged Out) */}
        {!authUser && (
          <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-6 text-xs font-medium text-[#6B6B6B]">
            <a href="#features" className="hover:text-[#E8694A] transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-[#E8694A] transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-[#E8694A] transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-[#E8694A] transition-colors">FAQ</a>
            <a href="https://github.com/PantryPool/PantryPool" target="_blank" rel="noreferrer" className="hover:text-[#2D2D2D] transition-colors">GitHub</a>
          </nav>
        )}

        {/* Desktop Pool & Organization Switcher (Only Visible When Logged In) */}
        {authUser && (
          <div className="hidden md:flex items-center gap-1.5 lg:gap-2 min-w-0">
            {/* Organization Switcher (SaaS Edition Only) */}
            {isOrganizationsEnabled && organizations.length > 0 && (
              <div className="flex items-center gap-1 bg-[#F0EBE3] border border-[#E0DAD1] rounded-md p-1 shrink-0">
                <Building2 className="h-4 w-4 text-[#6B6B6B] ml-1 shrink-0" />
                <select
                  aria-label="Select Organization Workspace"
                  value={activeOrgId || ''}
                  onChange={(e) => onSelectOrg && onSelectOrg(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-medium text-[#2D2D2D] pl-1 pr-3 lg:pr-4 py-1 focus:outline-none cursor-pointer appearance-none max-w-[85px] sm:max-w-[100px] lg:max-w-[140px] truncate"
                >
                  <option value="" className="bg-white text-[#2D2D2D]">
                    All / Personal
                  </option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id} className="bg-white text-[#2D2D2D]">
                      {o.name}
                    </option>
                  ))}
                </select>
                {activeOrg?.inviteCode && (
                  <button
                    onClick={() => handleCopyOrgInvite(activeOrg.inviteCode!)}
                    title={copiedOrgInvite ? "Invite Link Copied!" : `Copy Workspace Invite Link (${activeOrg.inviteCode})`}
                    className={`hidden lg:flex p-1 rounded transition items-center justify-center ${
                      copiedOrgInvite ? 'bg-[#E3EFE6] text-[#2E7D32]' : 'bg-[#E8E2D9] hover:bg-[#E0DAD1] text-[#2D2D2D]'
                    }`}
                  >
                    {copiedOrgInvite ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                  </button>
                )}
                {onOpenCreateOrg && (
                  <button
                    onClick={onOpenCreateOrg}
                    title="Create or Join Company Workspace"
                    className="hidden lg:flex p-1 rounded bg-[#E8E2D9] hover:bg-[#E0DAD1] text-[#2D2D2D] transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Pool Switcher (Only show pulldown if at least 1 pool joined) */}
            {pools.length > 0 ? (
              <div className="flex items-center gap-1 bg-[#F0EBE3] border border-[#E0DAD1] rounded-md p-1 min-w-0">
                <select
                  aria-label="Select Active Pool"
                  value={activePool?.id || ''}
                  onChange={(e) => onSelectPool(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-medium text-[#2D2D2D] pl-1.5 lg:pl-2 pr-4 lg:pr-6 py-1 focus:outline-none cursor-pointer appearance-none max-w-[100px] sm:max-w-[125px] lg:max-w-[180px] truncate"
                >
                  {pools.map((p) => (
                    <option key={p.id} value={p.id} className="bg-white text-[#2D2D2D]">
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={onOpenCreatePool}
                  title="Create or Join Pool"
                  className="p-1 lg:p-1.5 rounded bg-[#E8E2D9] hover:bg-[#E0DAD1] text-[#2D2D2D] transition shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenCreatePool}
                title="Create or Join Pool"
                aria-label="Create or Join Pool"
                className="flex items-center gap-1.5 px-2.5 lg:px-3.5 py-1.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-medium transition shadow-xs shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Join / Create Pantry</span>
                <span className="lg:hidden">New Pantry</span>
              </button>
            )}
          </div>
        )}

        {/* Right Section: Tools Menu & Auth / User Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Desktop Scan QR Button (Logged In Only) */}
          {authUser && (
            <button
              onClick={() => {
                if (onOpenQRScanner) onOpenQRScanner();
                else modals.openModal('qrScanner');
              }}
              className="hidden sm:flex items-center gap-1.5 px-2.5 lg:px-3.5 py-1.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-medium transition shadow-xs"
              title="Scan Fridge or Item QR Code"
            >
              <QrCode className="h-4 w-4 stroke-[2]" />
              <span className="hidden lg:inline">Scan QR</span>
            </button>
          )}

          {/* Quick Guide & Help Button (Logged In Only) */}
          {authUser && (
            <button
              onClick={() => {
                if (onOpenHelpGuide) onOpenHelpGuide();
                else modals.openModal('helpGuide');
              }}
              className="p-2 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] transition flex items-center justify-center cursor-pointer"
              title="PantryPool Quick Guide & Help"
              aria-label="Help and Quick Guide"
            >
              <HelpCircle className="h-4 w-4 text-[#6B6B6B]" />
            </button>
          )}

          {/* Tools & Utilities Dropdown (Logged In Only) */}
          {authUser && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setToolsOpen(!toolsOpen)}
                className="p-2 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] transition flex items-center gap-1"
                title="More Tools & Settings"
              >
                <Wrench className="h-4 w-4 text-[#6B6B6B]" />
                <ChevronDown className="h-3 w-3 text-[#6B6B6B]" />
              </button>

              {toolsOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white border border-[#E0DAD1] shadow-xl p-2.5 z-50 text-xs space-y-1.5">
                  
                  {/* Mobile Pool Selector Section (Logged In Only) */}
                  <div className="md:hidden border-b border-[#EDE8E0] pb-2 space-y-1.5">
                    <div className="px-2 text-xs font-medium text-[#6B6B6B]">
                      Active Pantry / Pool
                    </div>
                    {pools.length > 0 ? (
                      <div className="flex gap-1.5 items-center">
                        <select
                          aria-label="Active Pantry or Pool"
                          value={activePool?.id || ''}
                          onChange={(e) => {
                            onSelectPool(e.target.value);
                            setToolsOpen(false);
                          }}
                          className="flex-1 bg-[#F0EBE3] border border-[#E0DAD1] text-xs font-medium text-[#2D2D2D] rounded-md p-2 focus:outline-none cursor-pointer"
                        >
                          {pools.map((p) => (
                            <option key={p.id} value={p.id} className="bg-white text-[#2D2D2D]">
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            onOpenCreatePool();
                            setToolsOpen(false);
                          }}
                          className="p-2 rounded-md bg-[#FDF0EC] text-[#E8694A] hover:bg-[#FDF0EC]/80 border border-[#E0DAD1] font-medium transition"
                          title="New Pool"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          onOpenCreatePool();
                          setToolsOpen(false);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 p-2 rounded-md bg-[#FDF0EC] text-[#E8694A] hover:bg-[#FDF0EC]/80 border border-[#E0DAD1] font-medium transition text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Join or Create Pantry</span>
                      </button>
                    )}
                  </div>

                  <div className="px-2 py-0.5 text-xs font-medium text-[#6B6B6B]">
                    Workspace Actions
                  </div>

                  {isOrganizationsEnabled && onOpenCreateOrg && (
                    <button
                      onClick={() => {
                        onOpenCreateOrg();
                        setToolsOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#F0EBE3] text-[#2D2D2D] font-medium transition text-left"
                    >
                      <Building2 className="h-4 w-4 text-[#6B6B6B]" />
                      <div>
                        <div>New Company Workspace</div>
                        <div className="text-[11px] text-[#6B6B6B] font-normal">Add company organization</div>
                      </div>
                    </button>
                  )}

                  {kioskModeEnabled && (
                    <button
                      onClick={() => {
                        if (onOpenKiosk) onOpenKiosk();
                        else modals.openModal('kiosk');
                        setToolsOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#F0EBE3] text-[#2D2D2D] transition text-left"
                    >
                      <Monitor className="h-4 w-4 text-[#6B6B6B]" />
                      <div>
                        <div className="font-medium">Kiosk Mode</div>
                        <div className="text-[11px] text-[#6B6B6B]">Touchscreen logging station</div>
                      </div>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (onOpenPoster) onOpenPoster();
                      else modals.openModal('poster');
                      setToolsOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#F0EBE3] text-[#2D2D2D] transition text-left"
                  >
                    <Printer className="h-4 w-4 text-[#6B6B6B]" />
                    <div>
                      <div className="font-medium">Print Fridge Poster</div>
                      <div className="text-[11px] text-[#6B6B6B]">Wall QR sign & shelf tags</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      if (onOpenNfc) onOpenNfc();
                      else modals.openModal('nfc');
                      setToolsOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#F0EBE3] text-[#2D2D2D] transition text-left"
                  >
                    <Radio className="h-4 w-4 text-[#E8694A]" />
                    <div>
                      <div className="font-medium flex items-center gap-1.5">
                        <span>NFC Tag Setup & Hub</span>
                        <span className="text-[9px] bg-[#E8F5E9] text-[#2E7D32] px-1.5 py-0.2 rounded font-semibold">Tap</span>
                      </div>
                      <div className="text-[11px] text-[#6B6B6B]">Fridge sticker & shelf tap setup</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      if (onOpenReceiptScanner) onOpenReceiptScanner();
                      else modals.openModal('receipt');
                      setToolsOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#F0EBE3] text-[#2D2D2D] transition text-left"
                  >
                    <Receipt className="h-4 w-4 text-[#6B6B6B]" />
                    <div>
                      <div className="font-medium">AI Receipt Scanner</div>
                      <div className="text-[11px] text-[#6B6B6B]">Auto-import restock costs</div>
                    </div>
                  </button>

                  {onOpenWebhooks && (
                    <button
                      onClick={() => {
                        onOpenWebhooks();
                        setToolsOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-[#F0EBE3] text-[#2D2D2D] transition text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <Bot className="h-4 w-4 text-[#6B6B6B]" />
                        <div>
                          <div className="font-medium">Slack & Teams Integrations</div>
                          <div className="text-[11px] text-[#6B6B6B]">2-way bots, manifests & alerts</div>
                        </div>
                      </div>
                      {!isPaidSubscriber && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#FFF8EB] text-[#8C5807] border border-[#D4870E]/30 uppercase shrink-0">
                          PRO
                        </span>
                      )}
                    </button>
                  )}

                  {onOpenBillingPortal && isCompanyAccount && isCompanyAdmin && isPaidSubscriber && (
                    <button
                      onClick={() => {
                        onOpenBillingPortal();
                        setToolsOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#F0EBE3] text-[#2D2D2D] transition text-left"
                    >
                      <CreditCard className="h-4 w-4 text-[#6B6B6B]" />
                      <div>
                        <div className="font-medium">Manage Subscription & Invoices</div>
                        <div className="text-[11px] text-[#6B6B6B]">Cancel, update card, download receipts</div>
                      </div>
                    </button>
                  )}

                  {onDeleteActiveOrg && isCompanyAccount && isCompanyAdmin && (
                    <button
                      onClick={() => {
                        onDeleteActiveOrg();
                        setToolsOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#FDF0EC] text-[#C9553D] transition text-left"
                    >
                      <Trash2 className="h-4 w-4 text-[#C9553D]" />
                      <div>
                        <div className="font-medium">Delete Company Workspace</div>
                        <div className="text-[11px] text-[#C9553D]/80">Unlink pools & remove workspace</div>
                      </div>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (onOpenHelpGuide) onOpenHelpGuide();
                      else modals.openModal('helpGuide');
                      setToolsOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[#F0EBE3] text-[#2D2D2D] transition text-left cursor-pointer"
                  >
                    <HelpCircle className="h-4 w-4 text-[#6B6B6B]" />
                    <div>
                      <div className="font-medium">Quick Guide & Help</div>
                      <div className="text-[11px] text-[#6B6B6B]">How to use, stock & settle</div>
                    </div>
                  </button>

                  <div className="border-t border-[#EDE8E0] pt-1 my-1" />

                  <button
                    onClick={() => {
                      onToggleSound();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-[#F0EBE3] text-[#2D2D2D] transition"
                  >
                    <div className="flex items-center gap-2.5">
                      {soundEnabled ? (
                        <Volume2 className="h-4 w-4 text-[#5A9A6B]" />
                      ) : (
                        <VolumeX className="h-4 w-4 text-[#6B6B6B]" />
                      )}
                      <span>Sound Effects</span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${soundEnabled ? 'bg-[#EDF5EF] text-[#5A9A6B]' : 'bg-[#E8E2D9] text-[#6B6B6B]'}`}>
                      {soundEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  {authUser && (authUser.systemRole === 'superadmin' || authUser.systemRole === 'admin') && (
                    <button
                      onClick={() => {
                        if (onOpenAdminConsole) onOpenAdminConsole();
                        else modals.openModal('admin');
                        setToolsOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-[#FDF0EC] hover:bg-[#FDF0EC]/80 text-[#E8694A] transition text-left font-medium cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4 text-[#E8694A]" />
                      <span>Platform Admin Console</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notification Center Trigger Button */}
          {authUser && (
            <button
              onClick={() => {
                if (onOpenNotifications) onOpenNotifications();
                else modals.openModal('notifications');
              }}
              className="relative p-2 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] border border-[#E0DAD1] text-[#6B6B6B] hover:text-[#2D2D2D] transition-colors"
              title="Notifications & Low Stock Alerts"
            >
              <Bell className="h-4 w-4" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E8694A] text-[10px] font-semibold text-white shadow-xs">
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </span>
              )}
            </button>
          )}

          {/* User Account / Auth Section */}
          {authUser ? (
            <div className="flex items-center gap-1.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-md p-1">
              <button
                onClick={() => {
                  if (onOpenUserProfile) onOpenUserProfile();
                  else modals.openModal('userProfile');
                }}
                title="Profile & Connected Accounts"
                className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer"
              >
                <img
                  src={authUser.avatarUrl || getDefaultAvatarUrl(authUser.name)}
                  alt={authUser.name}
                  className="h-6 w-6 rounded-full object-cover ring-1 ring-[#E0DAD1] bg-[#F0EBE3]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = getDefaultAvatarUrl(authUser.name);
                  }}
                />
                <span className="text-xs font-medium text-[#2D2D2D] px-1 max-w-[90px] truncate hidden lg:block">
                  {authUser.name}
                </span>
              </button>
              <button
                onClick={onLogout}
                title="Log Out"
                className="p-1 rounded hover:bg-[#FDF0EC] text-[#6B6B6B] hover:text-[#C9553D] transition"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-semibold transition shadow-xs"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </button>
          )}

        </div>

      </div>
    </header>
  );
};
