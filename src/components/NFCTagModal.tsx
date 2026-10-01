import React, { useState, useEffect } from 'react';
import { Pool, Item, User } from '../types';
import { 
  Radio, 
  X, 
  Smartphone, 
  Copy, 
  Check, 
  ExternalLink, 
  Sparkles, 
  Info, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Tag, 
  Coffee, 
  Monitor, 
  Download,
  HelpCircle
} from 'lucide-react';
import { QRCodeDisplay } from './QRCodeDisplay';

interface NFCTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: Pool | null;
  items: Item[];
  activeUser: User | null;
  onConsumeItem?: (item: Item) => void;
  kioskModeEnabled?: boolean;
}

export const NFCTagModal: React.FC<NFCTagModalProps> = ({
  isOpen,
  onClose,
  pool,
  items,
  activeUser,
  onConsumeItem,
  kioskModeEnabled = true,
}) => {
  const [selectedTab, setSelectedTab] = useState<'generator' | 'guide' | 'webnfc'>('generator');
  const [selectedTagType, setSelectedTagType] = useState<'pool' | 'kiosk' | 'item'>('pool');
  const [selectedItemId, setSelectedItemId] = useState<string>(items[0]?.id || '');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!kioskModeEnabled && selectedTagType === 'kiosk') {
      setSelectedTagType('pool');
    }
  }, [kioskModeEnabled, selectedTagType]);

  // Web NFC State
  const [webNfcSupported, setWebNfcSupported] = useState<boolean>(false);
  const [isWritingNfc, setIsWritingNfc] = useState<boolean>(false);
  const [isReadingNfc, setIsReadingNfc] = useState<boolean>(false);
  const [nfcStatusMessage, setNfcStatusMessage] = useState<{ type: 'idle' | 'success' | 'error' | 'reading'; text: string }>({
    type: 'idle',
    text: ''
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      setWebNfcSupported(true);
    }
  }, []);

  if (!isOpen || !pool) return null;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pantrypool.com';

  const selectedItem = items.find(i => i.id === selectedItemId) || items[0];

  // Deep Link Payloads
  const poolCode = pool.code || (pool as any).qrCodeKey || (pool as any).qr_code_key || (typeof pool.id === 'string' && pool.id.startsWith('pool_') && pool.id.length > 10 ? pool.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : pool.id);
  const poolUrl = `${baseUrl}/?join=${encodeURIComponent(poolCode)}`;
  const kioskUrl = `${baseUrl}/?join=${encodeURIComponent(poolCode)}&kiosk=1`;
  const itemUrl = selectedItem ? `${baseUrl}/?join=${encodeURIComponent(poolCode)}&item=${encodeURIComponent(selectedItem.id)}&action=consume` : poolUrl;

  const currentPayloadUrl = 
    selectedTagType === 'pool' ? poolUrl :
    selectedTagType === 'kiosk' ? kioskUrl :
    itemUrl;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Web NFC Direct Write Handler
  const handleDirectWebNfcWrite = async () => {
    if (!('NDEFReader' in window)) {
      setNfcStatusMessage({
        type: 'error',
        text: 'Web NFC is not supported in this browser. Use Chrome on Android or the free NFC Tools mobile app.'
      });
      return;
    }

    try {
      setIsWritingNfc(true);
      setNfcStatusMessage({
        type: 'reading',
        text: 'Hold your NFC tag against the back of your phone to write...'
      });

      const ndef = new (window as any).NDEFReader();
      await ndef.write({
        records: [
          {
            recordType: 'url',
            data: currentPayloadUrl
          }
        ]
      });

      setNfcStatusMessage({
        type: 'success',
        text: '✅ NFC Tag successfully programmed! Tap it with any phone to test.'
      });
    } catch (err: any) {
      console.error('NFC Write Error:', err);
      setNfcStatusMessage({
        type: 'error',
        text: `NFC Write failed: ${err.message || 'Cancelled or permission denied.'}`
      });
    } finally {
      setIsWritingNfc(false);
    }
  };

  // Web NFC In-App Reader
  const handleStartWebNfcScan = async () => {
    if (!('NDEFReader' in window)) {
      setNfcStatusMessage({
        type: 'error',
        text: 'Web NFC is not supported in this browser. Use Chrome on Android.'
      });
      return;
    }

    try {
      setIsReadingNfc(true);
      setNfcStatusMessage({
        type: 'reading',
        text: 'Ready! Tap any PantryPool NFC sticker on your fridge or snack shelf...'
      });

      const ndef = new (window as any).NDEFReader();
      await ndef.scan();

      ndef.onreading = (event: any) => {
        const decoder = new TextDecoder();
        for (const record of event.message.records) {
          if (record.recordType === 'url') {
            const urlText = decoder.decode(record.data);
            setNfcStatusMessage({
              type: 'success',
              text: `🎯 Tag scanned: ${urlText}`
            });

            // Parse URL params for auto-consumption
            try {
              const url = new URL(urlText);
              const itemId = url.searchParams.get('item');
              if (itemId && onConsumeItem) {
                const target = items.find(i => i.id === itemId);
                if (target) {
                  onConsumeItem(target);
                }
              }
            } catch (e) {
              // fallback
            }
          }
        }
      };
    } catch (err: any) {
      setIsReadingNfc(false);
      setNfcStatusMessage({
        type: 'error',
        text: `NFC Scan failed: ${err.message || 'Permission denied.'}`
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-2xl max-w-3xl w-full p-6 text-[#2D2D2D] shadow-2xl relative my-6 max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#EDE8E0] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#FDF0EC] text-[#E8694A] border border-[#FADCD5]">
              <Radio className="h-6 w-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[#2D2D2D]">NFC Tag Automation & Setup Hub</h2>
                <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9]">
                  Zero-Friction
                </span>
              </div>
              <p className="text-xs text-[#6B6B6B]">
                Tap-to-open fridge door stickers & shelf micro-tags for instant mobile logging
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 pt-4 pb-2 border-b border-[#EDE8E0] text-xs font-medium shrink-0">
          <button
            onClick={() => setSelectedTab('generator')}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-1.5 ${
              selectedTab === 'generator'
                ? 'bg-[#E8694A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tag Payload Generator</span>
          </button>
          
          <button
            onClick={() => setSelectedTab('guide')}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-1.5 ${
              selectedTab === 'guide'
                ? 'bg-[#E8694A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>NFC Tools Step-by-Step Guide</span>
          </button>

          <button
            onClick={() => setSelectedTab('webnfc')}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-1.5 ${
              selectedTab === 'webnfc'
                ? 'bg-[#E8694A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3]'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Direct In-Browser NFC (Web NFC)</span>
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="overflow-y-auto flex-1 py-4 space-y-6 pr-1">

          {/* TAB 1: TAG PAYLOAD GENERATOR */}
          {selectedTab === 'generator' && (
            <div className="space-y-6">
              
              {/* Type Selection */}
              <div>
                <label className="block text-xs font-bold text-[#2D2D2D] mb-2 uppercase tracking-wide">
                  1. Choose Tag Placement & Action
                </label>
                <div className={`grid grid-cols-1 ${kioskModeEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
                  
                  {/* Fridge Door */}
                  <button
                    type="button"
                    onClick={() => setSelectedTagType('pool')}
                    className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      selectedTagType === 'pool'
                        ? 'border-[#E8694A] bg-[#FDF0EC] shadow-xs'
                        : 'border-[#E0DAD1] hover:border-[#6B6B6B] bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Layers className={`w-4 h-4 ${selectedTagType === 'pool' ? 'text-[#E8694A]' : 'text-[#6B6B6B]'}`} />
                        {selectedTagType === 'pool' && <CheckCircle2 className="w-4 h-4 text-[#E8694A]" />}
                      </div>
                      <div className="font-semibold text-xs text-[#2D2D2D]">Fridge Door Badge</div>
                      <p className="text-[11px] text-[#6B6B6B] mt-1 leading-snug">
                        Taps open the pantry pool dashboard directly on member phones.
                      </p>
                    </div>
                  </button>

                  {/* Kiosk Mode */}
                  {kioskModeEnabled && (
                    <button
                      type="button"
                      onClick={() => setSelectedTagType('kiosk')}
                      className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        selectedTagType === 'kiosk'
                          ? 'border-[#E8694A] bg-[#FDF0EC] shadow-xs'
                          : 'border-[#E0DAD1] hover:border-[#6B6B6B] bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <Monitor className={`w-4 h-4 ${selectedTagType === 'kiosk' ? 'text-[#E8694A]' : 'text-[#6B6B6B]'}`} />
                          {selectedTagType === 'kiosk' && <CheckCircle2 className="w-4 h-4 text-[#E8694A]" />}
                        </div>
                        <div className="font-semibold text-xs text-[#2D2D2D]">Breakroom Kiosk Station</div>
                        <p className="text-[11px] text-[#6B6B6B] mt-1 leading-snug">
                          Taps launch the unattended fullscreen tablet kiosk interface.
                        </p>
                      </div>
                    </button>
                  )}

                  {/* Item Micro Tag */}
                  <button
                    type="button"
                    onClick={() => setSelectedTagType('item')}
                    className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      selectedTagType === 'item'
                        ? 'border-[#E8694A] bg-[#FDF0EC] shadow-xs'
                        : 'border-[#E0DAD1] hover:border-[#6B6B6B] bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Tag className={`w-4 h-4 ${selectedTagType === 'item' ? 'text-[#E8694A]' : 'text-[#6B6B6B]'}`} />
                        {selectedTagType === 'item' && <CheckCircle2 className="w-4 h-4 text-[#E8694A]" />}
                      </div>
                      <div className="font-semibold text-xs text-[#2D2D2D]">Shelf Item Micro-Tag</div>
                      <p className="text-[11px] text-[#6B6B6B] mt-1 leading-snug">
                        Taps trigger 1-tap consumption logging for a specific snack or beverage.
                      </p>
                    </div>
                  </button>

                </div>
              </div>

              {/* Item Selector (If item type chosen) */}
              {selectedTagType === 'item' && (
                <div className="p-4 rounded-xl bg-[#F0EBE3] border border-[#E0DAD1] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#2D2D2D]">Select Shelf Consumable</label>
                    <span className="text-[11px] text-[#6B6B6B]">{items.length} items in catalog</span>
                  </div>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] rounded-lg px-3.5 py-2 text-xs text-[#2D2D2D] focus:outline-none focus:border-[#E8694A] font-medium"
                  >
                    {items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({pool.currency || '$'}{Number(item.costPerUnit || 0).toFixed(2)}) — Stock: {item.stock}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Generated Deep Link Payload Box */}
              <div className="p-5 rounded-2xl bg-[#FAFAF8] border border-[#E0DAD1] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#E8694A]" />
                    <span className="text-xs font-bold text-[#2D2D2D] uppercase tracking-wide">
                      Program Target URL Payload
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[#6B6B6B]">
                    NDEF URI Record ({currentPayloadUrl.length} bytes)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={currentPayloadUrl}
                    className="w-full bg-white border border-[#E0DAD1] rounded-lg px-3.5 py-2.5 text-xs text-[#2D2D2D] font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(currentPayloadUrl, 'payload')}
                    className="px-4 py-2.5 rounded-lg bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs flex items-center gap-1.5 transition shadow-xs shrink-0"
                  >
                    {copiedKey === 'payload' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'payload' ? 'Copied!' : 'Copy URL'}</span>
                  </button>
                </div>

                {/* QR Backup / Tag Preview */}
                <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                  <div className="p-2 bg-white rounded-lg border border-[#E0DAD1] shadow-2xs">
                    <QRCodeDisplay value={currentPayloadUrl} size={90} />
                  </div>
                  <div className="text-xs text-[#6B6B6B] space-y-1">
                    <div className="font-semibold text-[#2D2D2D]">Instant Native Phone Compatibility:</div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      <li><strong>Apple iPhones (iPhone XS & newer):</strong> Background NFC Tag Reading is always active; tapping immediately opens Safari.</li>
                      <li><strong>Android Devices:</strong> Native NFC Tag Dispatch opens Chrome instantly without prompt.</li>
                      <li><strong>Tag Hardware:</strong> Works with standard <strong>NTAG213, NTAG215, or NTAG216</strong> circular stickers (~$0.15/tag on Amazon).</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Hardware Buying Recommendation */}
              <div className="p-4 rounded-xl bg-[#F4F9F4] border border-[#C8E6C9] flex items-start gap-3">
                <Info className="w-5 h-5 text-[#2E7D32] shrink-0 mt-0.5" />
                <div className="text-xs text-[#2D2D2D] space-y-1">
                  <div className="font-bold text-[#2E7D32]">Hardware Tip for Refrigerators:</div>
                  <p className="text-[#4A7C59] text-[11px] leading-relaxed">
                    If sticking NFC tags onto a stainless steel or metallic refrigerator door, purchase <strong>"Anti-Metal / On-Metal" NFC stickers</strong> (these include a ferrite shielding layer that prevents metallic interference). Standard non-metal tags work best on plastic snack bins, acrylic signs, and wooden shelves.
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: STEP-BY-STEP NFC TOOLS GUIDE */}
          {selectedTab === 'guide' && (
            <div className="space-y-6">
              
              <div className="bg-[#FDF0EC] border border-[#FADCD5] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#E8694A]">Program Tags with the Free "NFC Tools" App</h3>
                  <p className="text-xs text-[#6B6B6B] mt-0.5">
                    Available for free on the Apple App Store (iOS) and Google Play Store (Android).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href="https://apps.apple.com/app/nfc-tools/id1252962749"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#E0DAD1] text-xs font-semibold text-[#2D2D2D] hover:bg-[#F0EBE3] transition flex items-center gap-1"
                  >
                    <span>iOS App</span>
                    <ExternalLink className="w-3 h-3 text-[#6B6B6B]" />
                  </a>
                  <a
                    href="https://play.google.com/store/apps/details?id=com.wakdev.wdnfc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#E0DAD1] text-xs font-semibold text-[#2D2D2D] hover:bg-[#F0EBE3] transition flex items-center gap-1"
                  >
                    <span>Android App</span>
                    <ExternalLink className="w-3 h-3 text-[#6B6B6B]" />
                  </a>
                </div>
              </div>

              {/* Steps List */}
              <div className="space-y-4">
                
                {/* Step 1 */}
                <div className="flex items-start gap-4 p-4 rounded-xl border border-[#E0DAD1] bg-white">
                  <div className="w-7 h-7 rounded-full bg-[#E8694A] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-[#2D2D2D] text-sm">Copy Your Desired Pantry URL</div>
                    <p className="text-[#6B6B6B] leading-relaxed">
                      Go to the <strong>Tag Payload Generator</strong> tab above, select whether you want a Fridge Door tag or a specific Snack tag, and click <strong>Copy URL</strong>.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-4 p-4 rounded-xl border border-[#E0DAD1] bg-white">
                  <div className="w-7 h-7 rounded-full bg-[#E8694A] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-[#2D2D2D] text-sm">Open NFC Tools & Tap "Write"</div>
                    <p className="text-[#6B6B6B] leading-relaxed">
                      Launch the <strong>NFC Tools</strong> app on your iPhone or Android phone. From the top navigation menu, tap the <strong>Write</strong> tab.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-4 p-4 rounded-xl border border-[#E0DAD1] bg-white">
                  <div className="w-7 h-7 rounded-full bg-[#E8694A] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-[#2D2D2D] text-sm">Tap "Add a record" ➔ "URL / URI"</div>
                    <p className="text-[#6B6B6B] leading-relaxed">
                      Select <strong>Add a record</strong>, then pick <strong>URL / URI</strong> from the list of record types.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex items-start gap-4 p-4 rounded-xl border border-[#E0DAD1] bg-white">
                  <div className="w-7 h-7 rounded-full bg-[#E8694A] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    4
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-[#2D2D2D] text-sm">Paste the URL & Tap "OK"</div>
                    <p className="text-[#6B6B6B] leading-relaxed">
                      Paste the PantryPool URL you copied into the URI field and tap <strong>OK</strong>.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="flex items-start gap-4 p-4 rounded-xl border border-[#E0DAD1] bg-white">
                  <div className="w-7 h-7 rounded-full bg-[#E8694A] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    5
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-[#2D2D2D] text-sm">Tap "Write / [X] Bytes" & Touch the Tag</div>
                    <p className="text-[#6B6B6B] leading-relaxed">
                      Tap the large <strong>Write / [X] Bytes</strong> button. Hold your phone's upper top edge against the physical NFC sticker. You will feel a haptic vibration and see a green checkmark!
                    </p>
                  </div>
                </div>

                {/* Step 6 */}
                <div className="flex items-start gap-4 p-4 rounded-xl border border-[#E0DAD1] bg-[#FAFAF8]">
                  <div className="w-7 h-7 rounded-full bg-[#2E7D32] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    ✓
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-[#2D2D2D] text-sm">Stick to Fridge or Snack Shelf</div>
                    <p className="text-[#6B6B6B] leading-relaxed">
                      Peel off the adhesive backing and stick the tag to your breakroom fridge, pantry shelf edge, or coffee machine. Any coworker can now tap to log with 0 friction!
                    </p>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 3: DIRECT WEB NFC */}
          {selectedTab === 'webnfc' && (
            <div className="space-y-5">
              
              <div className="p-4 rounded-xl bg-white border border-[#E0DAD1] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-5 h-5 text-[#E8694A]" />
                    <span className="font-bold text-sm text-[#2D2D2D]">In-Browser Web NFC Programming</span>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                    webNfcSupported 
                      ? 'bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]' 
                      : 'bg-[#FFF3E0] text-[#E65100] border-[#FFE0B2]'
                  }`}>
                    {webNfcSupported ? 'Browser Web NFC Available' : 'Requires Chrome on Android'}
                  </span>
                </div>

                <p className="text-xs text-[#6B6B6B] leading-relaxed">
                  Web NFC allows writing and reading NFC tags directly from your web browser without installing any third-party app. (Supported on Chrome for Android).
                </p>

                {/* Direct Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={handleDirectWebNfcWrite}
                    disabled={isWritingNfc}
                    className="px-4 py-3 rounded-xl bg-[#E8694A] hover:bg-[#D45A3D] text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-xs disabled:opacity-50"
                  >
                    <Radio className="w-4 h-4" />
                    <span>{isWritingNfc ? 'Writing... Tap Tag Now' : '1-Click Write Active Tag'}</span>
                  </button>

                  <button
                    onClick={handleStartWebNfcScan}
                    disabled={isReadingNfc}
                    className="px-4 py-3 rounded-xl bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] font-semibold text-xs border border-[#E0DAD1] flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <Smartphone className="w-4 h-4 text-[#6B6B6B]" />
                    <span>{isReadingNfc ? 'Listening for Taps...' : 'Test Tap Scan in App'}</span>
                  </button>
                </div>

                {/* Status Message Display */}
                {nfcStatusMessage.text && (
                  <div className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5 animate-in fade-in ${
                    nfcStatusMessage.type === 'success' ? 'bg-[#E8F5E9] text-[#2E7D32] border-[#C8E6C9]' :
                    nfcStatusMessage.type === 'error' ? 'bg-[#FFEBEE] text-[#C62828] border-[#FFCDD2]' :
                    'bg-[#E3F2FD] text-[#1565C0] border-[#BBDEFB]'
                  }`}>
                    {nfcStatusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> :
                     nfcStatusMessage.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> :
                     <Radio className="w-4 h-4 shrink-0 animate-pulse" />}
                    <span>{nfcStatusMessage.text}</span>
                  </div>
                )}

              </div>

              {/* Compatibility Notes */}
              <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[#E0DAD1] space-y-2 text-xs text-[#6B6B6B]">
                <div className="font-bold text-[#2D2D2D]">Platform Compatibility Breakdown:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] pt-1">
                  <div className="p-3 bg-white rounded-lg border border-[#EDE8E0]">
                    <div className="font-semibold text-[#2D2D2D] mb-1">🍏 Apple iOS (iPhone)</div>
                    <p>Apple restricts Web NFC in Safari. Use the free <strong>NFC Tools</strong> app to write once; after writing, every iPhone natively reads the tag when tapped!</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-[#EDE8E0]">
                    <div className="font-semibold text-[#2D2D2D] mb-1">🤖 Google Android</div>
                    <p>Fully supports both in-browser Web NFC writing and background native tag reading with 0 app installs required.</p>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-[#EDE8E0] flex items-center justify-between shrink-0 text-xs">
          <div className="text-[#6B6B6B] flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-[#E8694A]" />
            <span>NTAG213 / NTAG215 / NTAG216 Compatible</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] font-medium transition"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
