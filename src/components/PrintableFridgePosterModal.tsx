import React, { useState, useEffect } from 'react';
import { Pool, Item } from '../types';
import { 
  Printer, 
  X, 
  Radio, 
  SlidersHorizontal, 
  Scissors, 
  Check, 
  Smartphone, 
  Receipt, 
  CreditCard, 
  Sparkles, 
  RotateCcw,
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import { QRCodeDisplay } from './QRCodeDisplay';
import { PantryPoolIcon } from './Logo';

export type PosterTemplate = 'dual_path' | 'action_steps';
export type StandFormat = 'acrylic_5x7' | 'portrait_8x11' | 'wall_a4';
export type PosterTheme = 'color' | 'monochrome';

interface PrintableFridgePosterModalProps {
  pool: Pool;
  items: Item[];
  onClose: () => void;
  onOpenNfc?: () => void;
}

export const PrintableFridgePosterModal: React.FC<PrintableFridgePosterModalProps> = ({
  pool,
  items,
  onClose,
  onOpenNfc,
}) => {
  // Find champion name/contact from pool
  const championMember = pool.members?.find((m) => m.id === pool.championId || m.role === 'champion');
  const defaultChampion = championMember?.name 
    ? championMember.name + (championMember.email ? ` (${championMember.email})` : '')
    : 'the pool champion';

  // State management
  const [template, setTemplate] = useState<PosterTemplate>('dual_path');
  const [standFormat, setStandFormat] = useState<StandFormat>('acrylic_5x7');
  const [theme, setTheme] = useState<PosterTheme>('color');
  const [showCustomizer, setShowCustomizer] = useState(false);

  const [customTitle, setCustomTitle] = useState(pool.name || 'Breakroom Snack Hub');
  const [customHeadline, setCustomHeadline] = useState('WELCOME TO OUR SHARED PANTRY');
  const [customSubtitle, setCustomSubtitle] = useState(
    'No spreadsheets. No awkward IOUs. Powered by PantryPool.'
  );
  const [customChampion, setCustomChampion] = useState(defaultChampion);
  const [customPaymentNote, setCustomPaymentNote] = useState(
    'Supports Venmo, Cash App & Card • Zero account setup'
  );
  const [customCurrency, setCustomCurrency] = useState(pool.currency || '$');
  const [showShelfTags, setShowShelfTags] = useState(items.length > 0);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.add('poster-print-active');
      return () => {
        document.body.classList.remove('poster-print-active');
      };
    }
  }, []);

  const handlePrint = () => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.print();
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pantrypool.com';
  const cleanHost = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const poolCode = pool.code || (pool as any).qrCodeKey || (pool as any).qr_code_key || (typeof pool.id === 'string' && pool.id.startsWith('pool_') && pool.id.length > 10 ? pool.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : pool.id);
  const poolQrValue = `${baseUrl}/?join=${encodeURIComponent(poolCode)}`;
  const displayCode = poolCode.toUpperCase().split('').join(' ');

  // Switch template presets
  const applyTemplate = (tpl: PosterTemplate) => {
    setTemplate(tpl);
    if (tpl === 'dual_path') {
      setCustomHeadline('WELCOME TO OUR SHARED PANTRY');
      setCustomSubtitle('No spreadsheets. No awkward IOUs. Powered by PantryPool.');
    } else {
      setCustomHeadline('GRAB A SNACK. KEEP IT FAIR.');
      setCustomSubtitle('Take what you want — log what you owe.');
    }
  };

  const handleResetDefaults = () => {
    setCustomTitle(pool.name || 'Breakroom Snack Hub');
    setCustomChampion(defaultChampion);
    setCustomCurrency(pool.currency || '$');
    setCustomPaymentNote('Supports Venmo, Cash App & Card • Zero account setup');
    applyTemplate('dual_path');
    setStandFormat('acrylic_5x7');
    setTheme('color');
    setShowShelfTags(items.length > 0);
  };

  // Dimensions & font scaling based on physical stand format
  const is5x7 = standFormat === 'acrylic_5x7';
  const isA4 = standFormat === 'wall_a4';
  const isMono = theme === 'monochrome';

  // Sizing configuration
  const containerMaxWidth = is5x7 ? 'max-w-[440px]' : isA4 ? 'max-w-[650px]' : 'max-w-[620px]';
  const qrSize = is5x7 ? 130 : 165;
  const itemQrSize = is5x7 ? 76 : 88;

  const pageSizeRule = is5x7 ? '5in 7in' : isA4 ? 'A4 portrait' : 'letter portrait';
  const printMarginRule = is5x7 ? '0.2in' : isA4 ? '8mm' : '0.25in';

  return (
    <div className="printable-poster-modal-root fixed inset-0 z-50 bg-[#2D2D2D]/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200 print:p-0 print:bg-white print:static print:backdrop-blur-none print:animate-none print:opacity-100">
      {/* Dynamic Print CSS Injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: ${pageSizeRule};
            margin: ${printMarginRule};
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          /* Hide background workspace elements so no invisible flow height causes blank pages */
          body.poster-print-active header,
          body.poster-print-active nav,
          body.poster-print-active main,
          body.poster-print-active footer,
          body.poster-print-active #root > div > *:not(.printable-poster-modal-root) {
            display: none !important;
          }

          body.poster-print-active #root {
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          body.poster-print-active #root > div {
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            display: block !important;
          }

          /* Reset modal backdrop container */
          .printable-poster-modal-root {
            position: static !important;
            display: block !important;
            inset: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            animation: none !important;
            opacity: 1 !important;
            overflow: visible !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
          }

          /* Reset modal card dialog */
          .printable-poster-modal-dialog {
            position: static !important;
            display: block !important;
            margin: 0 auto !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            width: 100% !important;
            height: auto !important;
          }

          /* Reset preview wrapper */
          .printable-poster-preview-wrapper {
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            overflow: visible !important;
            display: flex !important;
            justify-content: center !important;
            width: 100% !important;
          }

          /* The printable poster itself */
          #printable-fridge-poster {
            position: relative !important;
            left: auto !important;
            top: auto !important;
            margin: 0 auto !important;
            display: block !important;
            width: 100% !important;
            max-width: ${is5x7 ? '4.6in' : isA4 ? '190mm' : '7.8in'} !important;
            box-shadow: none !important;
            border: 2px solid ${isMono ? '#000000' : '#2D2D2D'} !important;
            border-radius: 8px !important;
            padding: ${is5x7 ? '12px' : '20px'} !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            visibility: visible !important;
            opacity: 1 !important;
          }

          #printable-fridge-poster, #printable-fridge-poster * {
            visibility: visible !important;
            opacity: 1 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print\\:hidden,
          .printable-poster-modal-dialog > .print\\:hidden {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}} />

      <div className="printable-poster-modal-dialog bg-white border border-[#E0DAD1] rounded-2xl max-w-4xl w-full p-4 sm:p-6 text-[#2D2D2D] shadow-2xl relative my-6 space-y-5 max-h-[92vh] overflow-y-auto print:max-h-none print:overflow-visible print:border-none print:shadow-none print:p-0 print:my-0 print:max-w-none print:static">
        
        {/* Header Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#EDE8E0] print:hidden">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-[#2D2D2D]">Communal Refrigerator & Countertop Poster</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FDF0EC] text-[#DE6B48]">
                Marketing Hub
              </span>
            </div>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              Turnkey signage explaining how the pantry works, eliminating spreadsheets & awkward IOUs
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenNfc && (
              <button
                onClick={() => {
                  onClose();
                  onOpenNfc();
                }}
                className="px-3 py-1.5 rounded-full bg-[#FDF0EC] hover:bg-[#FADCD5] text-[#E8694A] font-medium text-xs border border-[#FADCD5] transition shadow-2xs flex items-center gap-1.5"
                title="Open NFC Tag Automation Hub"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>NFC Tags</span>
              </button>
            )}
            <button
              onClick={() => setShowCustomizer(!showCustomizer)}
              className={`px-3.5 py-1.5 rounded-full font-medium text-xs border transition shadow-2xs flex items-center gap-1.5 ${
                showCustomizer 
                  ? 'bg-[#2D2D2D] text-white border-[#2D2D2D]' 
                  : 'bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border-[#E0DAD1]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showCustomizer ? 'Close Customizer' : '⚙️ Customize Poster'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs flex items-center gap-1.5 shadow-xs transition"
            >
              <Printer className="h-4 w-4" />
              <span>Print Poster</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Customization Settings Drawer */}
        {showCustomizer && (
          <div className="p-4 sm:p-5 rounded-xl bg-[#F8F6F2] border border-[#E0DAD1] space-y-4 text-xs print:hidden animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#E8E2D9] pb-2">
              <div className="flex items-center gap-2 font-semibold text-[#2D2D2D]">
                <Sparkles className="w-4 h-4 text-[#DE6B48]" />
                <span>Poster Marketing & Hardware Stand Customizer</span>
              </div>
              <button
                onClick={handleResetDefaults}
                className="text-[11px] text-[#8C827A] hover:text-[#2D2D2D] flex items-center gap-1 font-medium transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Defaults</span>
              </button>
            </div>

            {/* Template & Format Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Marketing Template Chooser */}
              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1.5">
                  Marketing Concept
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-lg border border-[#E0DAD1]">
                  <button
                    type="button"
                    onClick={() => applyTemplate('dual_path')}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition text-center ${
                      template === 'dual_path'
                        ? 'bg-[#E8694A] text-white shadow-2xs'
                        : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F8F6F2]'
                    }`}
                  >
                    🤝 Dual-Path Explainer
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('action_steps')}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition text-center ${
                      template === 'action_steps'
                        ? 'bg-[#E8694A] text-white shadow-2xs'
                        : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F8F6F2]'
                    }`}
                  >
                    ⚡ 3-Step Action Hub
                  </button>
                </div>
              </div>

              {/* Physical Stand Format */}
              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1.5">
                  Physical Stand / Sheet Format
                </label>
                <select
                  value={standFormat}
                  onChange={(e) => setStandFormat(e.target.value as any)}
                  className="w-full bg-white border border-[#E0DAD1] rounded-lg px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A] font-medium"
                >
                  <option value="acrylic_5x7">🪟 Acrylic Counter Stand (5" × 7")</option>
                  <option value="portrait_8x11">📄 Fridge Door / Table Tent (8.5" × 11")</option>
                  <option value="wall_a4">🖼️ Breakroom Wall Sign (A4)</option>
                </select>
              </div>

              {/* Color Theme */}
              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1.5">
                  Print Ink Palette
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-lg border border-[#E0DAD1]">
                  <button
                    type="button"
                    onClick={() => setTheme('color')}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition text-center ${
                      theme === 'color'
                        ? 'bg-[#2D2D2D] text-white shadow-2xs'
                        : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F8F6F2]'
                    }`}
                  >
                    🎨 Terracotta & Stone
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('monochrome')}
                    className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition text-center ${
                      theme === 'monochrome'
                        ? 'bg-[#2D2D2D] text-white shadow-2xs'
                        : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F8F6F2]'
                    }`}
                  >
                    🖤 Pure B&W Laser
                  </button>
                </div>
              </div>
            </div>

            {/* Content Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1">
                  Pantry Hub Name
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Breakroom Snack Hub"
                  className="w-full bg-white border border-[#E0DAD1] rounded-lg px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1">
                  Main Headline / Pitch
                </label>
                <input
                  type="text"
                  value={customHeadline}
                  onChange={(e) => setCustomHeadline(e.target.value)}
                  placeholder="e.g. WELCOME TO OUR SHARED PANTRY"
                  className="w-full bg-white border border-[#E0DAD1] rounded-lg px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1">
                  Tagline / How It Works Subtitle
                </label>
                <input
                  type="text"
                  value={customSubtitle}
                  onChange={(e) => setCustomSubtitle(e.target.value)}
                  placeholder="e.g. No spreadsheets. No awkward IOUs."
                  className="w-full bg-white border border-[#E0DAD1] rounded-lg px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1">
                  Pool Champion / Contact Person
                </label>
                <input
                  type="text"
                  value={customChampion}
                  onChange={(e) => setCustomChampion(e.target.value)}
                  placeholder="e.g. Sarah in Ops or the pool champion"
                  className="w-full bg-white border border-[#E0DAD1] rounded-lg px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1">
                  Payment Methods & Trust Badges
                </label>
                <input
                  type="text"
                  value={customPaymentNote}
                  onChange={(e) => setCustomPaymentNote(e.target.value)}
                  placeholder="e.g. Supports Venmo, Cash App & Card • Zero account setup"
                  className="w-full bg-white border border-[#E0DAD1] rounded-lg px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1">
                  Currency Symbol
                </label>
                <select
                  value={customCurrency}
                  onChange={(e) => setCustomCurrency(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] rounded-lg px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                >
                  <option value="$">$ (USD / AUD / CAD)</option>
                  <option value="€">€ (EUR)</option>
                  <option value="£">£ (GBP)</option>
                  <option value="¥">¥ (JPY / CNY)</option>
                  <option value="₹">₹ (INR)</option>
                  <option value="R$">R$ (BRL)</option>
                  <option value="R">R (ZAR)</option>
                </select>
              </div>
            </div>

            {/* Checkbox Options */}
            <div className="pt-2 border-t border-[#E8E2D9] flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showShelfTags}
                  onChange={(e) => setShowShelfTags(e.target.checked)}
                  className="rounded border-[#E0DAD1] text-[#E8694A] focus:ring-[#E8694A] h-4 w-4"
                />
                <span className="text-[11px] font-medium text-[#2D2D2D]">
                  Include Shelf & Bin QR Cutout Tags ({items.length} items available)
                </span>
              </label>

              <div className="flex items-center gap-1.5 text-[11px] text-[#6B6B6B]">
                <span>Active format:</span>
                <span className="font-semibold text-[#2D2D2D]">
                  {is5x7 ? '5" × 7" Stand' : isA4 ? 'A4 Wall Sign' : '8.5" × 11" Door Poster'}
                </span>
                <span>•</span>
                <span>{isMono ? 'B&W Mode' : 'Color Mode'}</span>
              </div>
            </div>
          </div>
        )}

        {/* POSTER PREVIEW CONTAINER WRAPPER */}
        <div className="printable-poster-preview-wrapper flex justify-center bg-[#F3EFEA] p-3 sm:p-6 rounded-xl overflow-x-auto print:p-0 print:bg-white print:rounded-none print:overflow-visible">
          
          {/* PRINTABLE POSTER ROOT */}
          <div
            id="printable-fridge-poster"
            className={`w-full ${containerMaxWidth} bg-white text-[#2D2D2D] rounded-xl border-2 ${
              isMono ? 'border-black' : 'border-[#2D2D2D]'
            } shadow-md print:shadow-none print:rounded-none transition-all duration-200 ${
              is5x7 ? 'p-4 sm:p-5 space-y-3.5' : 'p-6 sm:p-8 space-y-5'
            }`}
          >
            
            {/* TOP BRAND & HUB HEADER */}
            <div className={`flex items-center justify-between border-b ${
              isMono ? 'border-black' : 'border-[#2D2D2D]/20'
            } pb-2.5`}>
              <div className="flex items-center gap-2">
                <PantryPoolIcon 
                  variant={isMono ? 'charcoal' : 'badge'} 
                  size={is5x7 ? 20 : 24} 
                />
                <span className="font-black text-xs sm:text-sm tracking-wider uppercase text-[#2D2D2D]">
                  PANTRYPOOL
                </span>
              </div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#6B6B6B]">
                {customTitle}
              </span>
            </div>

            {/* TEMPLATE 1: DUAL-PATH COMMUNITY EXPLAINER */}
            {template === 'dual_path' && (
              <div className={is5x7 ? 'space-y-3' : 'space-y-4'}>
                {/* Hero Banner */}
                <div className="text-center space-y-1">
                  <div className={`px-3 py-2 rounded-lg font-black tracking-tight text-white uppercase text-center ${
                    isMono ? 'bg-black text-white' : 'bg-[#2D2D2D] text-white'
                  } ${is5x7 ? 'text-sm sm:text-base' : 'text-base sm:text-xl md:text-2xl'}`}>
                    {customHeadline}
                  </div>
                  <p className={`font-medium text-[#4A4A4A] ${is5x7 ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                    {customSubtitle}
                  </p>
                </div>

                {/* Dual Path Columns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  {/* Grabbing Food */}
                  <div className={`p-3 sm:p-3.5 rounded-xl border ${
                    isMono 
                      ? 'border-black bg-white' 
                      : 'border-[#E0DAD1] bg-[#FAFAF8]'
                  } space-y-2`}>
                    <div className="flex items-center justify-between pb-1 border-b border-black/10">
                      <span className={`font-bold tracking-tight uppercase flex items-center gap-1.5 ${
                        isMono ? 'text-black' : 'text-[#DE6B48]'
                      } ${is5x7 ? 'text-xs' : 'text-xs sm:text-sm'}`}>
                        <span>🥪</span>
                        <span>GRABBING FOOD?</span>
                      </span>
                      <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-sm bg-black/5 text-[#6B6B6B]">
                        3 Sec
                      </span>
                    </div>

                    <ul className={`space-y-1.5 font-medium text-[#2D2D2D] ${is5x7 ? 'text-[10px] leading-tight' : 'text-[11px] sm:text-xs'}`}>
                      <li className="flex items-start gap-1.5">
                        <span className="font-bold text-[#DE6B48] select-none">•</span>
                        <span><strong>Scan the code</strong> below with your phone camera</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="font-bold text-[#DE6B48] select-none">•</span>
                        <span><strong>Tap the item</strong> you took to log to your tab</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="font-bold text-[#DE6B48] select-none">•</span>
                        <span><strong>Settle up on your time</strong> via Venmo, Cash App or restock</span>
                      </li>
                    </ul>
                  </div>

                  {/* Bringing Snacks */}
                  <div className={`p-3 sm:p-3.5 rounded-xl border ${
                    isMono 
                      ? 'border-black bg-white' 
                      : 'border-[#CDE5D3] bg-[#F7FAF7]'
                  } space-y-2`}>
                    <div className="flex items-center justify-between pb-1 border-b border-black/10">
                      <span className={`font-bold tracking-tight uppercase flex items-center gap-1.5 ${
                        isMono ? 'text-black' : 'text-[#2E7D32]'
                      } ${is5x7 ? 'text-xs' : 'text-xs sm:text-sm'}`}>
                        <span>🛒</span>
                        <span>BRINGING SNACKS?</span>
                      </span>
                      <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-sm bg-black/5 text-[#6B6B6B]">
                        100% Fair
                      </span>
                    </div>

                    <ul className={`space-y-1.5 font-medium text-[#2D2D2D] ${is5x7 ? 'text-[10px] leading-tight' : 'text-[11px] sm:text-xs'}`}>
                      <li className="flex items-start gap-1.5">
                        <span className="font-bold text-[#2E7D32] select-none">•</span>
                        <span><strong>Snap your receipt</strong> to add items to catalog</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="font-bold text-[#2E7D32] select-none">•</span>
                        <span><strong>Get 100% reimbursed</strong> or credited to your pool balance</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="font-bold text-[#2E7D32] select-none">•</span>
                        <span><strong>Help keep the room full</strong> & everyone fed</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Central High-Impact QR & Join Code */}
                <div className={`p-3.5 sm:p-4 rounded-xl border-2 ${
                  isMono ? 'border-black bg-white' : 'border-[#2D2D2D] bg-[#FAFAF8]'
                } text-center space-y-2.5`}>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <div className="bg-white p-2 rounded-lg border border-[#E0DAD1] inline-block shadow-2xs shrink-0">
                      <QRCodeDisplay value={poolQrValue} size={qrSize} />
                    </div>

                    <div className="text-center sm:text-left space-y-2">
                      <div>
                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[#6B6B6B] block">
                          POINT PHONE CAMERA TO JOIN
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-[#2D2D2D] block mt-0.5">
                          NO APP REQUIRED • RUNS IN BROWSER
                        </span>
                      </div>

                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-[#6B6B6B] block">
                          Or visit <strong>{cleanHost}</strong> & enter code:
                        </span>
                        <div className={`px-3 py-1.5 rounded-lg border-2 inline-block font-mono-financial font-bold tracking-[0.25em] ${
                          isMono 
                            ? 'border-black bg-white text-black' 
                            : 'border-[#2D2D2D] bg-white text-[#DE6B48]'
                        } ${is5x7 ? 'text-lg' : 'text-xl sm:text-2xl'}`}>
                          {displayCode}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TEMPLATE 2: 3-STEP ACTION HUB */}
            {template === 'action_steps' && (
              <div className={is5x7 ? 'space-y-3' : 'space-y-4'}>
                {/* Hero Pitch */}
                <div className="text-center space-y-1">
                  <h1 className={`font-black tracking-tight uppercase ${
                    is5x7 ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl md:text-3xl'
                  }`}>
                    {customHeadline}
                  </h1>
                  <p className={`font-medium text-[#6B6B6B] ${is5x7 ? 'text-xs' : 'text-sm sm:text-base'}`}>
                    {customSubtitle}
                  </p>
                </div>

                {/* 3 Step Cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className={`p-2.5 sm:p-3 rounded-xl border text-center space-y-1 ${
                    isMono ? 'border-black bg-white' : 'border-[#E0DAD1] bg-[#FAFAF8]'
                  }`}>
                    <div className={`h-6 w-6 sm:h-7 sm:w-7 rounded-full mx-auto flex items-center justify-center font-bold text-xs ${
                      isMono ? 'bg-black text-white' : 'bg-[#2D2D2D] text-white'
                    }`}>
                      1
                    </div>
                    <div className="font-bold text-[11px] sm:text-xs uppercase text-[#2D2D2D]">
                      SCAN QR
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-[#6B6B6B] leading-tight">
                      Point phone camera below
                    </div>
                  </div>

                  <div className={`p-2.5 sm:p-3 rounded-xl border text-center space-y-1 ${
                    isMono ? 'border-black bg-white' : 'border-[#E0DAD1] bg-[#FAFAF8]'
                  }`}>
                    <div className={`h-6 w-6 sm:h-7 sm:w-7 rounded-full mx-auto flex items-center justify-center font-bold text-xs ${
                      isMono ? 'bg-black text-white' : 'bg-[#2D2D2D] text-white'
                    }`}>
                      2
                    </div>
                    <div className="font-bold text-[11px] sm:text-xs uppercase text-[#2D2D2D]">
                      TAP ITEM
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-[#6B6B6B] leading-tight">
                      Deduct cost from pool
                    </div>
                  </div>

                  <div className={`p-2.5 sm:p-3 rounded-xl border text-center space-y-1 ${
                    isMono ? 'border-black bg-white' : 'border-[#E0DAD1] bg-[#FAFAF8]'
                  }`}>
                    <div className={`h-6 w-6 sm:h-7 sm:w-7 rounded-full mx-auto flex items-center justify-center font-bold text-xs ${
                      isMono ? 'bg-black text-white' : 'bg-[#2D2D2D] text-white'
                    }`}>
                      3
                    </div>
                    <div className="font-bold text-[11px] sm:text-xs uppercase text-[#2D2D2D]">
                      RESTOCK / PAY
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-[#6B6B6B] leading-tight">
                      Bring snacks or settle via P2P
                    </div>
                  </div>
                </div>

                {/* QR Code & Join Options Block */}
                <div className={`p-3.5 sm:p-4 rounded-xl border-2 ${
                  isMono ? 'border-black bg-white' : 'border-[#2D2D2D] bg-[#FAFAF8]'
                } grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-center`}>
                  <div className="flex flex-col items-center justify-center text-center space-y-1.5">
                    <div className="bg-white p-2 rounded-lg border border-[#E0DAD1] inline-block shadow-2xs">
                      <QRCodeDisplay value={poolQrValue} size={qrSize} />
                    </div>
                    <span className="text-[9px] font-bold tracking-wider text-[#6B6B6B] uppercase">
                      Instant Camera Scan
                    </span>
                  </div>

                  <div className="text-center sm:text-left space-y-2">
                    <div className="inline-block px-2 py-0.5 rounded-md bg-black/5 text-[#2D2D2D] font-bold text-[10px] uppercase">
                      NO APP REQUIRED
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-[#6B6B6B] block">
                        OR JOIN BY URL:
                      </span>
                      <span className="font-bold text-xs sm:text-sm text-[#2D2D2D] block">
                        {cleanHost}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#6B6B6B] block mb-1">
                        Enter Code:
                      </span>
                      <div className={`px-3 py-1.5 rounded-lg border-2 inline-block font-mono-financial font-bold tracking-[0.25em] ${
                        isMono 
                          ? 'border-black bg-white text-black' 
                          : 'border-[#2D2D2D] bg-white text-[#DE6B48]'
                      } ${is5x7 ? 'text-lg' : 'text-xl sm:text-2xl'}`}>
                        {displayCode}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TRUST BADGES & PAYMENT FOOTER */}
            <div className={`pt-2.5 border-t ${
              isMono ? 'border-black' : 'border-[#EDE8E0]'
            } space-y-1.5 text-center`}>
              <div className={`font-semibold text-[#2D2D2D] ${is5x7 ? 'text-[10px]' : 'text-xs'}`}>
                {customPaymentNote}
              </div>
              <div className={`text-[#6B6B6B] ${is5x7 ? 'text-[9px]' : 'text-[10px]'}`}>
                Questions or snack requests? Contact <strong>{customChampion}</strong> • {cleanHost}
              </div>
            </div>

            {/* OPTIONAL CUTOUT SHELF & BIN TAGS SECTION */}
            {showShelfTags && items.length > 0 && (
              <div className={`pt-3 border-t-2 border-dashed ${
                isMono ? 'border-black' : 'border-[#E0DAD1]'
              } space-y-2.5`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#6B6B6B] flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Cut & Tape Shelf & Bin QR Tags</span>
                  </span>
                  <span className="text-[9px] text-[#9A9A9A]">Direct-Select Item Scan</span>
                </div>

                <div className={`grid ${is5x7 ? 'grid-cols-2 gap-2' : 'grid-cols-2 sm:grid-cols-3 gap-2.5'}`}>
                  {items.slice(0, is5x7 ? 4 : 6).map((item) => {
                    const priceValue = (item.costPerUnitCents ? item.costPerUnitCents / 100 : item.costPerUnit) || 0;
                    const itemQrPayload = `${baseUrl}/?join=${encodeURIComponent(poolCode)}&item=${encodeURIComponent(item.id)}&action=consume&pool=${encodeURIComponent(pool.id)}`;
                    return (
                      <div
                        key={item.id}
                        className={`p-2 rounded-lg border ${
                          isMono ? 'border-black bg-white' : 'border-[#E0DAD1] bg-[#FAFAF8]'
                        } text-center space-y-1 relative`}
                      >
                        <div className="bg-white p-1.5 rounded-lg border border-[#E0DAD1] inline-block shadow-2xs">
                          <QRCodeDisplay value={itemQrPayload} size={itemQrSize} />
                        </div>
                        <div>
                          <span className="font-bold text-[11px] text-[#2D2D2D] block truncate leading-tight">
                            {item.name}
                          </span>
                          <span className={`text-[10px] font-semibold block ${
                            isMono ? 'text-black' : 'text-[#2E7D32]'
                          }`}>
                            {customCurrency}{priceValue.toFixed(2)} • {item.unitName || 'unit'}
                          </span>
                          <span className="text-[8px] text-[#8C827A] font-mono-financial block uppercase mt-0.5">
                            TAG-{item.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BRAND SIGN-OFF WATERMARK */}
            <div className="text-center pt-1 text-[9px] text-[#9A9A9A] tracking-wider uppercase">
              PantryPool • Communal Breakroom & Household Ledger System
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
