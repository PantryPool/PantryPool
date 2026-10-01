import React, { useState, useEffect } from 'react';
import { Item, Pool } from '../types';
import { X, Printer, Scissors } from 'lucide-react';
import { QRCodeDisplay } from './QRCodeDisplay';
import { PantryPoolIcon } from './Logo';

interface ItemQRCodeModalProps {
  item: Item;
  pool: Pool;
  onClose: () => void;
}

export const ItemQRCodeModal: React.FC<ItemQRCodeModalProps> = ({
  item,
  pool,
  onClose,
}) => {
  const [customTitle, setCustomTitle] = useState(item.name);
  const [customSubtitle, setCustomSubtitle] = useState(
    'Scan with your phone camera or in-app scanner to log item instantly!'
  );
  const [customUnitName, setCustomUnitName] = useState(item.unitName || 'item');
  const [standFormat, setStandFormat] = useState<
    'acrylic_5x7' | 'portrait_8x11' | 'shelf_tag_single' | 'sheet_6up'
  >('acrylic_5x7');
  const [showCustomizer, setShowCustomizer] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.add('shelf-tag-print-active');
      return () => {
        document.body.classList.remove('shelf-tag-print-active');
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
  const poolCode = pool.code || (pool as any).qrCodeKey || (pool as any).qr_code_key || (typeof pool.id === 'string' && pool.id.startsWith('pool_') && pool.id.length > 10 ? pool.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : pool.id);
  const qrPayload = `${baseUrl}/?join=${encodeURIComponent(poolCode)}&item=${encodeURIComponent(item.id)}&action=consume&pool=${encodeURIComponent(pool.id)}`;

  return (
    <div className="printable-shelf-tag-modal-root fixed inset-0 z-50 bg-[#2D2D2D]/40 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200 print:p-0 print:bg-white print:static print:animate-none print:opacity-100">
      {/* Dynamic Print CSS Injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body.shelf-tag-print-active header,
          body.shelf-tag-print-active nav,
          body.shelf-tag-print-active main,
          body.shelf-tag-print-active footer,
          body.shelf-tag-print-active #root > div > *:not(.printable-shelf-tag-modal-root) {
            display: none !important;
          }

          body.shelf-tag-print-active #root,
          body.shelf-tag-print-active #root > div {
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            display: block !important;
          }

          .printable-shelf-tag-modal-root {
            position: static !important;
            display: block !important;
            inset: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            overflow: visible !important;
            width: 100% !important;
            height: auto !important;
          }

          .printable-shelf-tag-modal-dialog {
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

          .print\\:hidden {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}} />

      <div className="printable-shelf-tag-modal-dialog bg-white border border-[#E0DAD1] rounded-xl max-w-2xl w-full p-6 text-[#2D2D2D] shadow-xl relative my-8 space-y-6 max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:border-none print:shadow-none print:p-0 print:my-0 print:max-w-none print:static">
        
        {/* Header Actions */}
        <div className="flex items-center justify-between pb-4 border-b border-[#EDE8E0] print:hidden">
          <div>
            <h2 className="text-xl font-semibold text-[#2D2D2D]">Turnkey Shelf Tag & QR Generator</h2>
            <p className="text-xs text-[#6B6B6B]">
              Ready-to-print shelf talkers, counter stands, bin tags & multi-tag cut sheets
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCustomizer(!showCustomizer)}
              className="px-3.5 py-1.5 rounded-full bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] font-medium text-xs border border-[#E0DAD1] transition shadow-xs"
            >
              {showCustomizer ? 'Close Customizer' : '⚙️ Customize Format'}
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs flex items-center gap-1.5 shadow-xs transition"
            >
              <Printer className="h-4 w-4" />
              <span>Print Shelf Tag</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition"
              title="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Customization Settings Drawer */}
        {showCustomizer && (
          <div className="p-4 rounded-lg bg-[#F0EBE3] border border-[#E0DAD1] space-y-3 text-xs print:hidden animate-in fade-in">
            <div className="font-semibold text-[#E8694A]">Printable Shelf Hardware & Label Presets</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#2D2D2D] mb-1">Stand / Print Format</label>
                <select
                  value={standFormat}
                  onChange={(e) => setStandFormat(e.target.value as any)}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                >
                  <option value="acrylic_5x7">🪟 Acrylic Stand (5" × 7")</option>
                  <option value="portrait_8x11">📄 Portrait Table Tent (8.5" × 11")</option>
                  <option value="shelf_tag_single">🏷️ Shelf Channel Tag (3.5" × 2")</option>
                  <option value="sheet_6up">✂️ Multi-Tag Sheet (6-up Grid)</option>
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className="block text-[11px] font-medium text-[#2D2D2D] mb-1">Item Title</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#2D2D2D] mb-1">Unit Description</label>
                <input
                  type="text"
                  value={customUnitName}
                  onChange={(e) => setCustomUnitName(e.target.value)}
                  placeholder="can, bottle, bar, pack"
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#2D2D2D] mb-1">Header Subtitle / Tagline</label>
              <input
                type="text"
                value={customSubtitle}
                onChange={(e) => setCustomSubtitle(e.target.value)}
                className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-1.5 text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
              />
            </div>
          </div>
        )}

        {/* PRINTABLE SHELF TAG CONTAINER */}
        <div className="bg-white text-[#2D2D2D] rounded-2xl p-6 sm:p-8 space-y-6 sm:space-y-8 border-2 border-[#2D2D2D] shadow-sm print:border-none print:shadow-none print:p-0">
          
          {/* FORMAT 1 & 2: Acrylic Stand (5x7) and Portrait Table Tent (8.5x11) */}
          {(standFormat === 'acrylic_5x7' || standFormat === 'portrait_8x11') && (
            <>
              {/* Main Banner Header */}
              <div className="text-center space-y-3 border-b-2 border-[#EDE8E0] pb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FDF0EC] text-[#DE6B48] text-xs font-semibold">
                  <PantryPoolIcon variant="duotone" size={16} />
                  <span>PantryPool Shelf QR Tag • {pool.name}</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#2D2D2D] tracking-tight">
                  {customTitle}
                </h1>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0EBE3] text-[#2D2D2D] border border-[#E0DAD1]">
                    {item.category}
                  </span>
                  <div className="inline-flex items-baseline gap-1 px-3 py-0.5 rounded-full bg-[#EDF5EF] text-[#5A9A6B] border border-[#CDE5D3]">
                    <span className="text-xs font-semibold">
                      Unit: {customUnitName}
                    </span>
                    <span className="text-[10px] text-[#6B6B6B]">
                      • Dynamic Price on Scan
                    </span>
                  </div>
                </div>
                <p className="text-xs sm:text-sm font-normal text-[#6B6B6B] max-w-md mx-auto">
                  {customSubtitle}
                </p>
              </div>

              {/* Central QR Code & Step Instructions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                {/* QR Code Box */}
                <div className="p-6 rounded-2xl bg-[#FAFAF8] border-2 border-[#2D2D2D] text-center space-y-3 shadow-xs">
                  <div className="bg-white p-3 rounded-xl border border-[#E0DAD1] inline-block shadow-xs">
                    <QRCodeDisplay value={qrPayload} size={standFormat === 'portrait_8x11' ? 160 : 135} />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold tracking-wider text-[#6B6B6B] block">
                      SCAN & INSTANT LOG
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FDF0EC] text-[#DE6B48] text-[10px] font-semibold mt-1">
                      <PantryPoolIcon variant="duotone" size={11} />
                      PantryPool Verified Tag
                    </span>
                  </div>
                </div>

                {/* 3-Step Instructions */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-[#2D2D2D] border-b border-[#EDE8E0] pb-2">
                    How to Log in 3 Steps:
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex gap-3 items-start">
                      <div className="h-7 w-7 rounded-full bg-[#2D2D2D] text-white font-semibold text-xs flex items-center justify-center shrink-0">
                        1
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#2D2D2D]">Scan Shelf QR</p>
                        <p className="text-[11px] text-[#6B6B6B]">
                          Open camera on smartphone to direct-select {customTitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 items-start">
                      <div className="h-7 w-7 rounded-full bg-[#2D2D2D] text-white font-semibold text-xs flex items-center justify-center shrink-0">
                        2
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#2D2D2D]">Take Your Item</p>
                        <p className="text-[11px] text-[#6B6B6B]">
                          Take 1 {customUnitName} from breakroom shelf or fridge
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 items-start">
                      <div className="h-7 w-7 rounded-full bg-[#2D2D2D] text-white font-semibold text-xs flex items-center justify-center shrink-0">
                        3
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#2D2D2D]">Auto-Balanced Ledger</p>
                        <p className="text-[11px] text-[#6B6B6B]">
                          Current unit cost is dynamically resolved in {pool.name}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* FORMAT 3: Single Shelf Edge / Channel Tag (3.5" x 2") */}
          {standFormat === 'shelf_tag_single' && (
            <div className="p-6 rounded-2xl bg-[#FAFAF8] border-2 border-[#2D2D2D] space-y-4">
              <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FDF0EC] text-[#DE6B48] text-[11px] font-semibold">
                  <PantryPoolIcon variant="duotone" size={14} />
                  <span>{pool.name} Shelf Tag</span>
                </div>
                <span className="text-[10px] text-[#6B6B6B] font-medium">{item.category}</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-5 justify-between">
                <div className="space-y-2 text-center sm:text-left flex-1">
                  <h2 className="text-2xl font-bold text-[#2D2D2D] tracking-tight">{customTitle}</h2>
                  <div className="inline-flex items-baseline gap-1.5 px-3 py-1 rounded-lg bg-white border border-[#E0DAD1] shadow-xs">
                    <span className="text-sm font-bold text-[#E8694A]">
                      Scan to Log
                    </span>
                    <span className="text-xs font-medium text-[#6B6B6B]">
                      / {customUnitName}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B6B6B] pt-1">
                    Scan QR code with phone camera or app scanner to log consumption. Live cost syncs dynamically.
                  </p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-[#E0DAD1] text-center shrink-0 shadow-xs">
                  <QRCodeDisplay value={qrPayload} size={110} />
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-[#FDF0EC] text-[#DE6B48] text-[9px] font-semibold">
                    <PantryPoolIcon variant="duotone" size={9} />
                    Verified
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* FORMAT 4: Multi-Tag Sheet (6-up Cut Sheet) */}
          {standFormat === 'sheet_6up' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                <span className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                  <Scissors className="h-3.5 w-3.5 text-[#E8694A]" />
                  Multi-Tag Shelf Sheet (6-up Grid)
                </span>
                <span className="text-[11px] text-[#6B6B6B]">{pool.name} • {item.name}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[...Array(6)].map((_, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border-2 border-dashed border-[#2D2D2D] bg-[#FAFAF8] text-center space-y-2 relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-[#E8694A] uppercase tracking-wide">
                        {pool.name}
                      </span>
                      <span className="text-[9px] text-[#6B6B6B] font-medium">
                        {item.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 justify-center text-left">
                      <div className="bg-white p-1.5 rounded-lg border border-[#E0DAD1] shrink-0 shadow-xs">
                        <QRCodeDisplay value={qrPayload} size={70} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm text-[#2D2D2D] truncate">{customTitle}</h4>
                        <span className="text-xs font-bold text-[#E8694A] block">
                          Scan to Log <span className="text-[10px] font-normal text-[#6B6B6B]">/ {customUnitName}</span>
                        </span>
                        <span className="inline-flex items-center gap-0.5 mt-0.5 text-[8px] text-[#DE6B48] font-medium">
                          <PantryPoolIcon variant="duotone" size={8} />
                          PantryPool Verified
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Scissor Cutout Notice — only shown for 6-up sheet */}
              <div className="pt-3 border-t-2 border-dashed border-[#E0DAD1] flex items-center justify-between text-xs text-[#6B6B6B]">
                <span className="flex items-center gap-1.5">
                  <Scissors className="h-3.5 w-3.5 text-[#E8694A]" />
                  Cut along dashed lines to fit shelf channel or basket clip
                </span>
                <span className="text-[10px] text-[#9A9A9A]">PantryPool Verified Tags</span>
              </div>
            </div>
          )}

          {/* Footer Branding */}
          <div className="text-center pt-2 border-t border-[#EDE8E0] text-[10px] text-[#9A9A9A]">
            PantryPool • Communal Breakroom & Household Ledger Platform
          </div>

        </div>

      </div>
    </div>
  );
};
