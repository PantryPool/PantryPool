import React, { useState } from 'react';
import { Pool } from '../types';
import { 
  Share2, 
  X, 
  Copy, 
  Check, 
  MessageSquare, 
  Mail, 
  Send, 
  Printer, 
  Smartphone, 
  KeyRound,
  ExternalLink,
  MessageCircle
} from 'lucide-react';

interface SharePoolModalProps {
  pool: Pool;
  onClose: () => void;
  onOpenPoster?: () => void;
}

export const SharePoolModal: React.FC<SharePoolModalProps> = ({
  pool,
  onClose,
  onOpenPoster,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedSlack, setCopiedSlack] = useState(false);
  const [activeTab, setActiveTab] = useState<'link' | 'social'>('link');

  const poolCode = pool.code || (pool as any).qrCodeKey || (pool as any).qr_code_key || (typeof pool.id === 'string' && pool.id.startsWith('pool_') && pool.id.length > 10 ? pool.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : pool.id);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pantrypool.com';
  const inviteUrl = `${baseUrl}/?join=${encodeURIComponent(poolCode)}`;
  const shareTitle = `Join ${pool.name} on PantryPool`;
  const shareText = `☕ Grab snacks, drinks, and split costs fairly in our "${pool.name}"!`;

  const canNativeShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  const handleNativeShare = async () => {
    if (canNativeShare) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: inviteUrl,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleCopyLink = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyCode = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(poolCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleCopySlackMessage = () => {
    const slackText = `🎉 *Join our ${pool.name} Pantry Pool!*\n\n☕ Grab snacks, drinks, and split costs fairly on PantryPool.\n👉 *Join Link:* ${inviteUrl}\n🔑 *Join Code:* \`${poolCode}\``;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(slackText);
      setCopiedSlack(true);
      setTimeout(() => setCopiedSlack(false), 2500);
    }
  };

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText}\n\nJoin the pantry pool here: ${inviteUrl}`)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`${shareText}\n\nClick the link below to join the pantry pool:\n${inviteUrl}\n\nOr enter invite code: ${poolCode}`)}`;
  const smsUrl = `sms:?&body=${encodeURIComponent(`${shareText} Join here: ${inviteUrl}`)}`;

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/40 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-2xl max-w-md w-full p-6 text-[#2D2D2D] shadow-2xl relative my-8 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EDE8E0]">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#FDF0EC] text-[#E8694A]">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#2D2D2D]">Share & Invite</h2>
              <p className="text-xs text-[#6B6B6B]">Invite team members or roommates to {pool.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Primary Native Share Banner (Mobile/Device) */}
        {canNativeShare && (
          <button
            type="button"
            onClick={handleNativeShare}
            className="w-full py-3 px-4 rounded-xl bg-[#E8694A] hover:bg-[#D45A3D] text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-md shadow-[#E8694A]/20 transition cursor-pointer active:scale-[0.99]"
          >
            <Smartphone className="h-4 w-4" />
            <span>Share via Apps, AirDrop & Messages</span>
          </button>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1.5 bg-[#F0EBE3] p-1 rounded-xl border border-[#E0DAD1]">
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'link'
                ? 'bg-white text-[#2D2D2D] shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            Direct Link & Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('social')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'social'
                ? 'bg-white text-[#2D2D2D] shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            Social & Messaging
          </button>
        </div>

        {activeTab === 'link' ? (
          <div className="space-y-4">
            {/* Direct Invite Link */}
            <div>
              <label className="block text-xs font-semibold text-[#2D2D2D] mb-1.5 flex items-center justify-between">
                <span>Direct Invite Link</span>
                <span className="text-[10px] text-[#5A9A6B] font-medium font-sans">Auto-joins when opened</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 bg-[#FAF9F5] border border-[#E0DAD1] text-[#2D2D2D] text-xs font-mono-financial rounded-xl px-3 py-2.5 focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer ${
                    copiedLink
                      ? 'bg-[#5A9A6B] text-white'
                      : 'bg-[#2D2D2D] hover:bg-[#1A1A1A] text-white shadow-xs'
                  }`}
                >
                  {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Direct Join Code */}
            <div>
              <label className="block text-xs font-semibold text-[#2D2D2D] mb-1.5 flex items-center justify-between">
                <span>Manual Join Code</span>
                <span className="text-[10px] text-[#6B6B6B] font-normal font-sans">For breakroom whiteboards</span>
              </label>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF9F5] border border-[#E0DAD1]">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[#E8694A]" />
                  <span className="text-sm font-bold font-mono-financial tracking-wider text-[#2D2D2D]">
                    {poolCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="text-xs text-[#E8694A] hover:text-[#D45A3D] font-semibold flex items-center gap-1 cursor-pointer transition"
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5 text-[#5A9A6B]" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[#6B6B6B]">
              Share an invite directly to your team communication channels:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {/* WhatsApp */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-xl bg-[#FAF9F5] hover:bg-[#25D366]/10 border border-[#E0DAD1] hover:border-[#25D366]/40 flex items-center gap-2.5 transition group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#25D366]/20 text-[#25D366] flex items-center justify-center font-bold">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-[#2D2D2D] group-hover:text-[#25D366]">WhatsApp</div>
                  <div className="text-[10px] text-[#6B6B6B]">Send to chat</div>
                </div>
              </a>

              {/* Slack / Teams Formatted Copy */}
              <button
                type="button"
                onClick={handleCopySlackMessage}
                className="p-3 rounded-xl bg-[#FAF9F5] hover:bg-[#4A154B]/10 border border-[#E0DAD1] hover:border-[#4A154B]/40 flex items-center gap-2.5 transition text-left cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#4A154B]/20 text-[#4A154B] flex items-center justify-center font-bold">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#2D2D2D] group-hover:text-[#4A154B]">
                    {copiedSlack ? 'Copied!' : 'Slack / Teams'}
                  </div>
                  <div className="text-[10px] text-[#6B6B6B]">Copy formatted post</div>
                </div>
              </button>

              {/* Email */}
              <a
                href={emailUrl}
                className="p-3 rounded-xl bg-[#FAF9F5] hover:bg-[#0078D4]/10 border border-[#E0DAD1] hover:border-[#0078D4]/40 flex items-center gap-2.5 transition group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#0078D4]/20 text-[#0078D4] flex items-center justify-center font-bold">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-[#2D2D2D] group-hover:text-[#0078D4]">Email</div>
                  <div className="text-[10px] text-[#6B6B6B]">Open mail app</div>
                </div>
              </a>

              {/* SMS / Messages */}
              <a
                href={smsUrl}
                className="p-3 rounded-xl bg-[#FAF9F5] hover:bg-[#34C759]/10 border border-[#E0DAD1] hover:border-[#34C759]/40 flex items-center gap-2.5 transition group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#34C759]/20 text-[#34C759] flex items-center justify-center font-bold">
                  <Send className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold text-[#2D2D2D] group-hover:text-[#34C759]">Messages</div>
                  <div className="text-[10px] text-[#6B6B6B]">Send text / SMS</div>
                </div>
              </a>
            </div>
          </div>
        )}

        {/* Physical Breakroom Poster Shortcut */}
        {onOpenPoster && (
          <div className="pt-3 border-t border-[#EDE8E0]">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPoster();
              }}
              className="w-full p-3 rounded-xl bg-[#FAF9F5] hover:bg-[#F0EBE3] border border-[#E0DAD1] flex items-center justify-between transition cursor-pointer text-left group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#E0DAD1]/50 text-[#2D2D2D]">
                  <Printer className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#2D2D2D]">Printable Breakroom Poster & QR Stand</div>
                  <p className="text-[11px] text-[#6B6B6B]">Generate ready-to-print 5x7" acrylic signs for the fridge</p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-[#6B6B6B] group-hover:text-[#2D2D2D]" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
