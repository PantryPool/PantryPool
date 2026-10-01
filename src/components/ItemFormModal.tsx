import React, { useState, useEffect } from 'react';
import { Item, ItemCategory, Pool } from '../types';
import { Package, X, Check, Trash2, AlertTriangle, Scan, ScanBarcode, Barcode, Search, Loader2, Sparkles, TrendingDown, RefreshCw, ExternalLink } from 'lucide-react';
import { lookupBarcode } from '../lib/barcodeLookup';
import { resolveSuggestedVendingBenchmark, MetroTier } from '../shared/vendingBenchmarks';
import { UpcScannerModal } from './UpcScannerModal';

interface ItemFormModalProps {
  pool: Pool;
  itemToEdit?: Item | null;
  onClose: () => void;
  onSaveItem: (itemData: Omit<Item, 'id' | 'poolId'>, editItemId?: string, creditAmount?: number) => void;
  onDeleteItem?: (itemId: string) => void;
}

const ICONS = ['CupSoda', 'Coffee', 'Zap', 'Cookie', 'Popcorn', 'Milk', 'Apple', 'Package'];

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  pool,
  itemToEdit,
  onClose,
  onSaveItem,
  onDeleteItem,
}) => {
  const [name, setName] = useState(itemToEdit?.name || '');
  const [barcode, setBarcode] = useState((itemToEdit as any)?.barcode || '');
  const [showUpcScanner, setShowUpcScanner] = useState(false);
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [barcodeFound, setBarcodeFound] = useState(false);
  const [category, setCategory] = useState<ItemCategory>(itemToEdit?.category || 'Beverages');
  const [costPerUnit, setCostPerUnit] = useState(itemToEdit?.costPerUnit.toString() || '1.50');
  const [stock, setStock] = useState(itemToEdit?.stock.toString() || '12');
  const [pricingMode, setPricingMode] = useState<'unit' | 'pack'>('pack');
  const [packPrice, setPackPrice] = useState(
    ((itemToEdit?.costPerUnit || 1.5) * (itemToEdit?.stock || 12)).toFixed(2)
  );
  const [minStock, setMinStock] = useState(itemToEdit?.minStock.toString() || '5');
  const [unitName, setUnitName] = useState(
    itemToEdit?.unitName || (itemToEdit as any)?.unit_name || (itemToEdit as any)?.unit || 'can'
  );
  const [icon, setIcon] = useState(itemToEdit?.icon || 'CupSoda');
  const [description, setDescription] = useState(itemToEdit?.description || '');
  const [creditInitialStock, setCreditInitialStock] = useState(true);

  // Vending Machine Benchmark state
  const initialBenchmark = itemToEdit?.vendingBenchmarkCents
    ? (itemToEdit.vendingBenchmarkCents / 100).toFixed(2)
    : (pool.savingsEnabled ? (resolveSuggestedVendingBenchmark(itemToEdit?.name || '', itemToEdit?.category || 'Beverages', (pool.metroTier as MetroTier) || 'standard') / 100).toFixed(2) : '2.00');

  const [vendingBenchmark, setVendingBenchmark] = useState(initialBenchmark);
  const [hasManuallyEditedBenchmark, setHasManuallyEditedBenchmark] = useState(Boolean(itemToEdit?.vendingBenchmarkCents));

  // Auto pre-fill benchmark when name or category changes if user hasn't typed a custom override
  useEffect(() => {
    if (pool.savingsEnabled && !hasManuallyEditedBenchmark && name.trim().length > 1) {
      const suggested = resolveSuggestedVendingBenchmark(name, category, (pool.metroTier as MetroTier) || 'standard');
      setVendingBenchmark((suggested / 100).toFixed(2));
    }
  }, [name, category, pool.savingsEnabled, pool.metroTier, hasManuallyEditedBenchmark]);

  const handleResetBenchmark = () => {
    const suggested = resolveSuggestedVendingBenchmark(name, category, (pool.metroTier as MetroTier) || 'standard');
    setVendingBenchmark((suggested / 100).toFixed(2));
    setHasManuallyEditedBenchmark(false);
  };

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleBarcodeLookup = async (codeToLookup?: string) => {
    const targetCode = (codeToLookup || barcode).trim();
    if (!targetCode || targetCode.length < 4) return;
    
    if (codeToLookup) {
      setBarcode(codeToLookup);
    }
    setIsSearchingBarcode(true);
    setBarcodeFound(false);

    try {
      const product = await lookupBarcode(targetCode);
      if (product) {
        setName(product.name);
        setCategory(product.category);
        if (product.servingSize) {
          setDescription(`Serving: ${product.servingSize}`);
        }
        if (product.suggestedUnit) {
          setUnitName(product.suggestedUnit);
        }
        if (product.suggestedIcon) {
          setIcon(product.suggestedIcon);
        }
        if (pool.savingsEnabled && !hasManuallyEditedBenchmark) {
          const suggested = resolveSuggestedVendingBenchmark(
            product.name,
            product.category,
            (pool.metroTier as MetroTier) || 'standard'
          );
          setVendingBenchmark((suggested / 100).toFixed(2));
        }
        setBarcodeFound(true);
      }
    } catch (err) {
      console.warn('[Barcode Lookup Failed]', err);
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  const handleDelete = () => {
    if (itemToEdit && onDeleteItem) {
      onDeleteItem(itemToEdit.id);
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedStock = parseInt(stock) || 0;
    const parsedCpu = parseFloat(costPerUnit) || 1.0;
    const creditAmount = (!itemToEdit && creditInitialStock && parsedStock > 0)
      ? Number((parsedStock * parsedCpu).toFixed(2))
      : undefined;

    const parsedBenchmarkCents = pool.savingsEnabled
      ? Math.max(0, Math.round((parseFloat(vendingBenchmark) || 0) * 100))
      : (itemToEdit?.vendingBenchmarkCents || 0);

    onSaveItem(
      {
        name: name.trim(),
        category,
        costPerUnit: parsedCpu,
        stock: parsedStock,
        minStock: parseInt(minStock) || 3,
        unitName: unitName.trim() || 'unit',
        icon,
        description: description.trim(),
        vendingBenchmarkCents: parsedBenchmarkCents,
        ...((barcode ? { barcode: barcode.trim() } : {}) as any),
      },
      itemToEdit?.id,
      creditAmount
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#2D2D2D]/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-[#E0DAD1] rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col text-[#2D2D2D] shadow-2xl relative my-auto overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header - Pinned at top */}
        <div className="flex items-center justify-between p-5 sm:p-6 pb-3 border-b border-[#EDE8E0] shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#FDF0EC] text-[#E8694A]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2D2D2D]">
                {itemToEdit ? 'Edit Item Details' : 'Add New Consumable Item'}
              </h2>
              <p className="text-xs text-[#6B6B6B]">Catalog entry for {pool.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form with scrollable body & pinned footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          
          {/* Scrollable inputs container */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* UPC / Barcode / QR Code Quick-Lookup & Scanner Row */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[#2D2D2D] flex items-center gap-1.5">
                <ScanBarcode className="h-3.5 w-3.5 text-[#E8694A]" />
                <span>UPC Barcode / QR Code (Optional)</span>
              </label>
              <span className="text-[10px] text-[#8A8A8A]">UPC-A · EAN-13 · QR</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-[#9A9A9A]" />
                <input
                  type="text"
                  placeholder="e.g. 012000001291 (UPC, barcode, or QR)"
                  value={barcode}
                  onChange={(e) => {
                    setBarcode(e.target.value);
                    setBarcodeFound(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleBarcodeLookup();
                    }
                  }}
                  className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md py-2 pl-9 pr-3 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] font-mono"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowUpcScanner(true)}
                  className="px-3 py-2 bg-[#FDF0EC] hover:bg-[#FCE2D9] text-[#E8694A] border border-[#F5C2B4] text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Open camera UPC barcode scanner"
                >
                  <ScanBarcode className="h-3.5 w-3.5" />
                  <span>Scan UPC</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBarcodeLookup()}
                  disabled={isSearchingBarcode || barcode.trim().length < 4}
                  className="px-3 py-2 bg-[#F0EBE3] hover:bg-[#E5DFD6] disabled:opacity-50 text-[#2D2D2D] text-xs font-semibold rounded-md flex items-center gap-1.5 transition cursor-pointer"
                  title="Lookup product info by UPC/barcode"
                >
                  {isSearchingBarcode ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : barcodeFound ? (
                    <Check className="h-3.5 w-3.5 text-[#437A65]" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-[#E8694A]" />
                  )}
                  Auto-Lookup
                </button>
              </div>
            </div>
            {barcodeFound && (
              <div className="mt-1.5 flex flex-wrap items-center justify-between text-[11px] text-[#437A65] gap-1">
                <span className="font-medium flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 text-[#437A65]" />
                  Auto-populated details for &ldquo;{name}&rdquo; via{' '}
                  <a
                    href="https://world.openfoodfacts.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-[#325d4d]"
                  >
                    Open Food Facts
                  </a>{' '}
                  (ODbL 1.0)
                </span>
                <a
                  href={`https://world.openfoodfacts.org/cgi/product.pl?type=edit&code=${encodeURIComponent(barcode.trim().replace(/[^0-9]/g, ''))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#E8694A] hover:underline flex items-center gap-0.5 ml-auto text-[10px]"
                >
                  <span>Edit on Open Food Facts</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            )}
            {!barcodeFound && barcode.trim().length >= 8 && !isSearchingBarcode && (
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#8A8A8A]">
                <span>Data powered by Open Food Facts (ODbL 1.0)</span>
                <a
                  href={`https://world.openfoodfacts.org/cgi/product.pl?type=edit&code=${encodeURIComponent(barcode.trim().replace(/[^0-9]/g, ''))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5A9A6B] hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Contribute to Open Food Facts</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
              Item Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. LaCroix Sparkling Water"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ItemCategory)}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              >
                <option value="Beverages">Beverages</option>
                <option value="Snacks">Snacks</option>
                <option value="Coffee & Tea">Coffee & Tea</option>
                <option value="Pantry & Fresh">Pantry & Fresh</option>
                <option value="Household">Household</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-[#2D2D2D]">
                  {pricingMode === 'pack' ? `Pack Total (${pool.currency})` : `Cost Per Unit (${pool.currency})`}
                </label>
                <button
                  type="button"
                  onClick={() => setPricingMode(pricingMode === 'unit' ? 'pack' : 'unit')}
                  className="text-[10px] text-[#E8694A] hover:underline cursor-pointer font-medium"
                >
                  {pricingMode === 'unit' ? 'Enter Pack Price instead' : 'Enter Unit Price instead'}
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={pricingMode === 'pack' ? packPrice : costPerUnit}
                onChange={(e) => {
                  const val = e.target.value;
                  const qty = Math.max(1, parseInt(stock) || 1);
                  if (pricingMode === 'pack') {
                    setPackPrice(val);
                    const unit = Number(((parseFloat(val) || 0) / qty).toFixed(2));
                    setCostPerUnit(unit.toString());
                  } else {
                    setCostPerUnit(val);
                    setPackPrice(((parseFloat(val) || 0) * qty).toFixed(2));
                  }
                }}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] font-mono-financial font-medium text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              />
              <p className="text-[10px] text-[#6B6B6B] mt-1 font-mono-financial">
                = <strong>{pool.currency}{costPerUnit || '0.00'}</strong> / {unitName || 'unit'} ({stock || 1} units)
              </p>
            </div>
          </div>

          {/* Local Vending Price Benchmark Section */}
          {pool.savingsEnabled && (
            <div className="bg-[#FAF8F5] border border-[#E0DAD1] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="h-4 w-4 text-[#5A9A6B]" />
                  <label className="text-xs font-semibold text-[#2D2D2D]">
                    Local Vending Machine Benchmark ({pool.currency})
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleResetBenchmark}
                  className="text-[10px] text-[#E8694A] hover:underline flex items-center gap-1 cursor-pointer"
                  title="Auto-suggest based on product name and region"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  <span>Auto-suggest</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-2.5 text-xs text-[#6B6B6B]">{pool.currency}</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={vendingBenchmark}
                    onChange={(e) => {
                      setVendingBenchmark(e.target.value);
                      setHasManuallyEditedBenchmark(true);
                    }}
                    placeholder="2.00"
                    className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] font-mono-financial font-medium text-xs rounded-md pl-6 p-2 focus:outline-none focus:border-[#E8694A]"
                  />
                </div>
                {/* Savings per unit preview */}
                {parseFloat(vendingBenchmark) > (parseFloat(costPerUnit) || 0) && (
                  <div className="bg-[#EDF5EF] border border-[#5A9A6B]/30 rounded-md px-2 py-1.5 text-right shrink-0">
                    <span className="text-[10px] text-[#5A9A6B] font-semibold flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Save {pool.currency}{(parseFloat(vendingBenchmark) - (parseFloat(costPerUnit) || 0)).toFixed(2)}/unit
                    </span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-[#6B6B6B]">
                Typical retail vending price in your area. Members see their savings on every transaction.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Unit Name
              </label>
              <input
                type="text"
                required
                placeholder="can, pod, bar"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Current Stock
              </label>
              <input
                type="number"
                min="0"
                required
                value={stock}
                onChange={(e) => {
                  const newStock = e.target.value;
                  setStock(newStock);
                  const qty = Math.max(1, parseInt(newStock) || 1);
                  if (pricingMode === 'pack') {
                    const unit = Number(((parseFloat(packPrice) || 0) / qty).toFixed(2));
                    setCostPerUnit(unit.toString());
                  } else {
                    setPackPrice(((parseFloat(costPerUnit) || 0) * qty).toFixed(2));
                  }
                }}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] font-mono-financial font-medium text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Min. Alert Threshold
              </label>
              <input
                type="number"
                min="1"
                required
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full bg-white border border-[#E0DAD1] text-[#D4870E] font-mono-financial font-medium text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              />
            </div>
          </div>

          {/* Icon selector */}
          <div>
            <label className="block text-xs font-medium text-[#2D2D2D] mb-1.5">
              Choose Icon Symbol
            </label>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition ${
                    icon === ic
                      ? 'bg-[#E8694A] text-white border-[#E8694A] shadow-xs'
                      : 'bg-[#F0EBE3] text-[#6B6B6B] border-[#E0DAD1] hover:bg-[#E8E2D9]'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
              Description / Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Stored in breakroom fridge top shelf"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-md p-2.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
            />
          </div>

          {!itemToEdit && (parseInt(stock) || 0) > 0 && (
            <div className="p-3 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#2D2D2D]">
                <input
                  type="checkbox"
                  checked={creditInitialStock}
                  onChange={(e) => setCreditInitialStock(e.target.checked)}
                  className="w-4 h-4 rounded text-[#E8694A] focus:ring-[#E8694A] border-[#E0DAD1]"
                />
                <span>
                  Credit my personal balance for this initial supply (<strong>+{pool.currency}{((parseInt(stock) || 0) * (parseFloat(costPerUnit) || 0)).toFixed(2)}</strong>)
                </span>
              </label>
            </div>
          )}

          </div>

          {/* Pinned action buttons footer */}
          <div className="p-4 sm:px-6 sm:py-3.5 border-t border-[#EDE8E0] bg-[#FAF8F5] shrink-0 flex items-center justify-between gap-3">
            {itemToEdit && onDeleteItem ? (
              isConfirmingDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-3.5 py-2 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Confirm Delete</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-3 py-2 rounded-full bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#6B6B6B] text-xs font-medium transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="px-3.5 py-2 rounded-full border border-[#E0DAD1] hover:border-[#E8694A]/40 text-[#C9553D] hover:bg-[#FDF0EC] text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                  title="Remove this item from pool catalog"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Item</span>
                </button>
              )
            ) : <div />}

            <button
              type="submit"
              className="px-6 py-2.5 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition ml-auto cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>{itemToEdit ? 'Save Changes' : 'Create Item Entry'}</span>
            </button>
          </div>

        </form>

        {/* Live UPC Camera Scanner Modal */}
        {showUpcScanner && (
          <UpcScannerModal
            isOpen={showUpcScanner}
            onClose={() => setShowUpcScanner(false)}
            onScan={(scanned) => {
              handleBarcodeLookup(scanned);
              setShowUpcScanner(false);
            }}
          />
        )}

      </div>
    </div>
  );
};
