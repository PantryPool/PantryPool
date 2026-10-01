import React, { useState, useRef, useEffect } from 'react';
import { Item, User } from '../types';
import { 
  CupSoda, 
  Coffee, 
  Zap, 
  Cookie, 
  Popcorn, 
  Milk, 
  Apple, 
  Package, 
  QrCode, 
  Plus, 
  Minus, 
  AlertCircle,
  CheckCircle2,
  Edit2,
  Trash2,
  Scale,
  MoreHorizontal,
  PackagePlus
} from 'lucide-react';

interface ItemCardProps {
  item: Item;
  currency: string;
  activeUser: User;
  onConsume: (item: Item) => void;
  onOpenEdit?: (item: Item) => void;
  onOpenQR: (item: Item) => void;
  onQuickRestock: (item: Item, addCount: number) => void;
  onOpenRestock?: (item: Item) => void;
  onDelete?: (item: Item) => void;
  onReportDiscrepancy?: (item: Item) => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  CupSoda,
  Coffee,
  Zap,
  Cookie,
  Popcorn,
  Milk,
  Apple,
  Package,
};

export const ItemCard = React.memo<ItemCardProps>(({
  item,
  currency,
  onConsume,
  onOpenEdit,
  onOpenQR,
  onQuickRestock,
  onOpenRestock,
  onDelete,
  onReportDiscrepancy,
}) => {
  const [isConsuming, setIsConsuming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const IconComponent = ICON_MAP[item.icon] || Package;

  const isLowStock = item.stock <= item.minStock && item.stock > 0;
  const isOutOfStock = item.stock <= 0;

  const handleConsumeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    setIsConsuming(true);
    onConsume(item);
    setTimeout(() => setIsConsuming(false), 300);
  };

  const displayUnit = item.unitName || (item as any).unit_name || (item as any).unit || 'unit';

  return (
    <div className={`relative bg-white border rounded-xl p-3.5 flex flex-col justify-between transition-[border-color,box-shadow,background-color] duration-150 hover:shadow-md ${
      isOutOfStock 
        ? 'border-[#EDE8E0] bg-[#FAF8F5]/60 opacity-85' 
        : isLowStock 
          ? 'border-[#D4870E]/30 bg-white hover:border-[#D4870E]/50' 
          : 'border-[#E0DAD1] hover:border-[#E8694A]/40'
    }`}>
      {/* Top Details */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg border ${
              isOutOfStock 
                ? 'bg-[#F0EBE3] text-[#6B6B6B] border-[#E0DAD1]' 
                : isLowStock 
                  ? 'bg-[#FFF8EB] text-[#D4870E] border-[#D4870E]/20' 
                  : 'bg-[#FDF0EC] text-[#E8694A] border-[#E8694A]/20'
            }`}>
              <IconComponent className="h-4 w-4 text-[#E8694A]" />
            </div>
            <div>
              <h3 className="font-semibold text-xs text-[#2D2D2D] line-clamp-1 leading-tight">
                {item.name}
              </h3>
              <span className="text-[10px] text-[#6B6B6B]">
                {item.category}
              </span>
            </div>
          </div>

          {/* Context Menu / Actions */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer"
              title="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#E0DAD1] rounded-lg shadow-lg py-1 z-20 text-xs">
                {onOpenEdit && (
                  <button
                    onClick={() => { setMenuOpen(false); onOpenEdit(item); }}
                    className="w-full px-3 py-1.5 text-left text-[#2D2D2D] hover:bg-[#FDF0EC] hover:text-[#E8694A] flex items-center gap-2 cursor-pointer"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span>Edit Details</span>
                  </button>
                )}
                {onOpenRestock && (
                  <button
                    onClick={() => { setMenuOpen(false); onOpenRestock(item); }}
                    className="w-full px-3 py-1.5 text-left text-[#2D2D2D] hover:bg-[#FDF0EC] hover:text-[#E8694A] flex items-center gap-2 cursor-pointer"
                  >
                    <PackagePlus className="h-3.5 w-3.5" />
                    <span>Restock Inventory</span>
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(false); onOpenQR(item); }}
                  className="w-full px-3 py-1.5 text-left text-[#2D2D2D] hover:bg-[#FDF0EC] hover:text-[#E8694A] flex items-center gap-2 cursor-pointer"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  <span>Item QR / Print</span>
                </button>
                {onReportDiscrepancy && (
                  <button
                    onClick={() => { setMenuOpen(false); onReportDiscrepancy(item); }}
                    className="w-full px-3 py-1.5 text-left text-[#2D2D2D] hover:bg-[#FDF0EC] hover:text-[#E8694A] flex items-center gap-2 cursor-pointer"
                  >
                    <Scale className="h-3.5 w-3.5" />
                    <span>Audit / Discrepancy</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(item); }}
                    className="w-full px-3 py-1.5 text-left text-[#C9553D] hover:bg-[#FDF0EC] flex items-center gap-2 border-t border-[#EDE8E0] mt-1 pt-1.5 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Item</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pricing & Stock Bar */}
        <div className="flex items-baseline justify-between pt-1">
          <div className="font-mono-financial font-semibold text-xs text-[#2D2D2D]">
            <span className="text-[#E8694A]">{currency}{(item.costPerUnit ?? 0).toFixed(2)}</span>
            <span className="text-[10px] text-[#6B6B6B] font-normal font-sans">/{displayUnit}</span>
          </div>

          <div>
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#C9553D] bg-[#FDF0EC] px-1.5 py-0.5 rounded-md border border-[#C9553D]/20">
                <AlertCircle className="h-2.5 w-2.5" />
                <span>0 left</span>
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#D4870E] bg-[#FFF8EB] px-1.5 py-0.5 rounded-md border border-[#D4870E]/30">
                <AlertCircle className="h-2.5 w-2.5" />
                <span>{item.stock} left (Low)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#5A9A6B] bg-[#EDF5EF] px-1.5 py-0.5 rounded-md border border-[#5A9A6B]/20 font-mono-financial">
                <CheckCircle2 className="h-2.5 w-2.5" />
                <span>{item.stock} {displayUnit}s</span>
              </span>
            )}
          </div>
        </div>

        {/* Vending Savings Badge */}
        {item.vendingBenchmarkCents !== undefined && item.vendingBenchmarkCents > Math.round((item.costPerUnit ?? 0) * 100) && (
          <div className="flex items-center gap-1 pt-0.5">
            <span className="inline-flex items-center gap-1 text-[9.5px] font-medium text-[#5A9A6B] bg-[#EDF5EF] px-1.5 py-0.5 rounded border border-[#5A9A6B]/20">
              <span>Save {currency}{((item.vendingBenchmarkCents - Math.round((item.costPerUnit ?? 0) * 100)) / 100).toFixed(2)} vs vending</span>
            </span>
          </div>
        )}
      </div>

      {/* Primary Action Button */}
      <div className="pt-3 mt-2 border-t border-[#EDE8E0]">
        {isOutOfStock ? (
          <button
            onClick={() => onOpenRestock ? onOpenRestock(item) : onQuickRestock(item, 10)}
            className="w-full py-1.5 px-2.5 rounded-lg bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#D4870E] text-xs font-medium border border-[#E0DAD1] flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <PackagePlus className="h-3.5 w-3.5" />
            <span>Restock Supply</span>
          </button>
        ) : (
          <button
            onClick={handleConsumeClick}
            disabled={isOutOfStock}
            className={`w-full py-1.5 px-3 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-98 cursor-pointer ${
              isConsuming
                ? 'bg-[#5A9A6B] text-white scale-102 shadow-sm'
                : 'bg-[#E8694A] hover:bg-[#D45A3D] text-white'
            }`}
          >
            {isConsuming ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Grabbed 1 {displayUnit}!</span>
              </>
            ) : (
              <>
                <Minus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Grab 1 {displayUnit}</span>
              </>
            )}
          </button>
        )}
      </div>

    </div>
  );
});
