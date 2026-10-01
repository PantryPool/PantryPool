import React, { useState, useEffect } from 'react';
import { Pool, User, Item, ItemCategory } from '../types';
import { 
  Receipt, 
  X, 
  Upload, 
  Sparkles, 
  Check, 
  Loader2, 
  AlertCircle,
  Plus,
  Minus,
  Trash2,
  PenTool,
  Camera,
  FileText,
  Package,
  ArrowRight,
  Barcode,
  ExternalLink
} from 'lucide-react';
import { optimizeReceiptImage } from '../lib/imageOptimizer';
import { getAuthToken } from '../lib/api';
import { calculateMovingAveragePrice } from '../lib/pricing';
import { telemetry } from '../lib/telemetry';
import { areBarcodesMatching } from '../shared/barcodeUtils';
import { distributeReceiptTax } from '../shared/receiptTaxUtils';

interface ReceiptScannerModalProps {
  pool: Pool;
  activeUser: User;
  items: Item[];
  initialSelectedItemId?: string;
  onClose: () => void;
  onApplyReceiptData: (
    itemsParsed: { 
      id?: string; 
      name: string; 
      category: ItemCategory; 
      costPerUnit: number; 
      quantity: number;
      unitName?: string;
      barcode?: string;
      icon?: string;
    }[],
    totalAmount: number,
    storeName: string
  ) => void;
}

interface RestockLineItem {
  rowId: string;
  existingItemId?: string;
  isNewItem: boolean;
  name: string;
  category: ItemCategory;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  unitName: string;
  currentStock: number;
  barcode?: string;
  isPack?: boolean;
  packQuantity?: number;
  packConfidence?: 'verified' | 'inferred';
  isBarcodeVerified?: boolean;
  packDescription?: string;
  packMode?: 'units' | 'pack';
  quantityDraft?: string;
  totalCostDraft?: string;
  costPerUnitDraft?: string;
  isTaxed?: boolean;
  taxFlag?: string | null;
  taxShare?: number;
  preTaxCost?: number;
}

const CATEGORIES: ItemCategory[] = [
  'Beverages',
  'Snacks',
  'Coffee & Tea',
  'Pantry & Fresh',
  'Household',
];

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  pool,
  activeUser,
  items,
  initialSelectedItemId,
  onClose,
  onApplyReceiptData,
}) => {
  const poolItems = items.filter((i) => i.poolId === pool.id);
  const [entryMode, setEntryMode] = useState<'manual' | 'text' | 'photo'>('manual');
  
  const createDefaultRow = (targetItemId?: string): RestockLineItem => {
    const existing = targetItemId
      ? poolItems.find((i) => i.id === targetItemId)
      : poolItems.length > 0 ? poolItems[0] : null;

    if (existing) {
      return {
        rowId: `row-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        existingItemId: existing.id,
        isNewItem: false,
        name: existing.name,
        category: existing.category,
        quantity: 6,
        costPerUnit: existing.costPerUnit || 1.0,
        totalCost: Number(((existing.costPerUnit || 1.0) * 6).toFixed(2)),
        unitName: existing.unitName || 'unit',
        currentStock: existing.stock,
      };
    }

    return {
      rowId: `row-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      existingItemId: undefined,
      isNewItem: true,
      name: '',
      category: 'Beverages',
      quantity: 6,
      costPerUnit: 1.0,
      totalCost: 6.0,
      unitName: 'unit',
      currentStock: 0,
    };
  };

  const [manualStore, setManualStore] = useState('Store Restock');
  const [manualItems, setManualItems] = useState<RestockLineItem[]>([
    createDefaultRow(initialSelectedItemId)
  ]);
  const [creditMyAccount, setCreditMyAccount] = useState(true);

  useEffect(() => {
    if (initialSelectedItemId) {
      setManualItems([createDefaultRow(initialSelectedItemId)]);
    }
  }, [initialSelectedItemId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [parsedData, setParsedData] = useState<{
    scanLogId?: string;
    storeName: string;
    totalAmount: number;
    subtotal?: number;
    taxAmount?: number;
    items: RestockLineItem[];
    isFallback?: boolean;
    message?: string;
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleScanReceipt = async () => {
    if (entryMode === 'photo' && !imagePreview) {
      setErrorMsg('Please select or drag a receipt photo to scan.');
      return;
    }
    if (entryMode === 'text' && !textInput.trim()) {
      setErrorMsg('Please describe what items you brought in.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      let payload: any = {
        poolId: pool.id,
        poolCurrency: pool.currency,
        catalogItems: poolItems.map(p => ({
          name: p.name,
          category: p.category,
          unitName: p.unitName || 'unit'
        }))
      };
      if (entryMode === 'photo' && imagePreview) {
        const optimized = await optimizeReceiptImage(imagePreview, 1600, 0.75);
        payload.imageBase64 = `data:image/jpeg;base64,${optimized.base64}`;
        payload.mimeType = 'image/jpeg';
      } else {
        payload.textInput = textInput.trim();
      }

      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const t0 = performance.now();
      telemetry.trackFeature('receipt_scan_started', {
        entry_mode: entryMode,
        has_image: Boolean(imagePreview),
        pool_id: pool.id,
      });

      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to parse items.');
      }

      // Helper function to normalize strings for robust fuzzy matching
      const normalizeForMatch = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

      const mappedItems: RestockLineItem[] = (data.items || []).map((item: any, idx: number) => {
        const rawName = (item.name || '').trim();
        const normRaw = normalizeForMatch(rawName);
        const itemBarcode = (item.upc || item.barcode || '').trim().replace(/[^0-9]/g, '');

        // 1. UPC / Barcode exact or candidate match against existing pool items
        let matchedItem = itemBarcode
          ? poolItems.find((p) => p.barcode && areBarcodesMatching(p.barcode, itemBarcode))
          : undefined;

        // 2. Exact or normalized name match
        // 3. Substring match
        // 4. Word token overlap match
        if (!matchedItem) {
          matchedItem = poolItems.find((p) => {
            const normP = normalizeForMatch(p.name);
            if (normP === normRaw || p.name.toLowerCase() === rawName.toLowerCase()) return true;
            if (normRaw.length >= 4 && normP.includes(normRaw)) return true;
            if (normP.length >= 4 && normRaw.includes(normP)) return true;

            // Check if key words match (e.g. "Dr Pepper" and "Dr Pepper Cherry")
            const pWords: string[] = p.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
            const rawWords: string[] = rawName.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
            const common = pWords.filter((w: string) => rawWords.some((rw: string) => rw.includes(w) || w.includes(rw)));
            return common.length >= 2 || (pWords.length === 1 && common.length === 1);
          });
        }

        const isPack = Boolean(item.isPack);
        const packQuantity = item.packQuantity || (isPack ? (parseInt(item.quantity, 10) || 1) : 1);
        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
        const cpu = matchedItem && (!item.costPerUnit || item.costPerUnit === 0)
          ? matchedItem.costPerUnit
          : Number(item.costPerUnit || 0);

        const preTax = typeof item.preTaxCost === 'number'
          ? item.preTaxCost
          : (item.taxShare ? Number((item.totalCost - item.taxShare).toFixed(2)) : (item.totalCost || (cpu * qty) || 0));

        return {
          rowId: `parsed-${Date.now()}-${idx}`,
          existingItemId: matchedItem?.id,
          isNewItem: !matchedItem,
          name: matchedItem ? matchedItem.name : rawName || 'Restocked Item',
          category: matchedItem ? matchedItem.category : ((item.category as ItemCategory) || 'Beverages'),
          quantity: qty,
          costPerUnit: cpu,
          totalCost: Number(item.totalCost || (cpu * qty) || 0),
          preTaxCost: preTax,
          taxShare: item.taxShare || 0,
          isTaxed: item.isTaxed,
          taxFlag: item.taxFlag,
          unitName: matchedItem?.unitName || item.unitName || 'unit',
          currentStock: matchedItem ? matchedItem.stock : 0,
          barcode: itemBarcode || matchedItem?.barcode || undefined,
          isPack,
          packQuantity,
          packConfidence: item.packConfidence,
          isBarcodeVerified: item.isBarcodeVerified || (Boolean(itemBarcode) && isPack && item.packConfidence === 'verified'),
          packDescription: item.packDescription,
          packMode: 'units' as const,
        };
      });

      telemetry.trackFeature('receipt_scan_completed', {
        items_count: mappedItems.length,
        store_name: data.storeName || 'Pantry Restock',
        total_amount: data.totalAmount,
        is_fallback: Boolean(data.isFallback),
        duration_ms: Math.round(performance.now() - t0),
      });

      const parsedTax = Number(data.taxAmount || 0);
      const parsedSub = typeof data.subtotal === 'number' ? data.subtotal : undefined;

      setParsedData({
        scanLogId: data.scanLogId || data.aiUsage?.logId,
        storeName: data.storeName || 'Pantry Restock',
        totalAmount: data.totalAmount || mappedItems.reduce((acc, curr) => acc + curr.totalCost, 0),
        subtotal: parsedSub,
        taxAmount: parsedTax > 0 ? parsedTax : undefined,
        items: mappedItems,
        isFallback: data.isFallback,
        message: data.message,
      });

    } catch (err: any) {
      console.error('[Receipt Parsing Error]', err);
      telemetry.trackRoadblock('receipt_scan_failed', {
        error_message: err.message || 'Parsing failed',
        entry_mode: entryMode,
      });
      setErrorMsg(err.message || 'An error occurred while analyzing entries.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPantryItem = (rowId: string, selectedValue: string) => {
    setManualItems((itemsList) =>
      itemsList.map((item) => {
        if (item.rowId !== rowId) return item;

        if (selectedValue === '__NEW__') {
          return {
            ...item,
            existingItemId: undefined,
            isNewItem: true,
            name: '',
            category: 'Beverages',
            unitName: 'unit',
            currentStock: 0,
          };
        }

        const selectedExisting = poolItems.find((p) => p.id === selectedValue);
        if (selectedExisting) {
          const cpu = selectedExisting.costPerUnit || 1.0;
          return {
            ...item,
            existingItemId: selectedExisting.id,
            isNewItem: false,
            name: selectedExisting.name,
            category: selectedExisting.category,
            costPerUnit: cpu,
            totalCost: Number((item.quantity * cpu).toFixed(2)),
            unitName: selectedExisting.unitName || 'unit',
            currentStock: selectedExisting.stock,
          };
        }

        return item;
      })
    );
  };

  const handleAddManualItemRow = () => {
    setManualItems([
      ...manualItems,
      createDefaultRow()
    ]);
  };

  const handleUpdateManualItem = (rowId: string, field: keyof RestockLineItem, value: any) => {
    setManualItems((itemsList) =>
      itemsList.map((item) => {
        if (item.rowId !== rowId) return item;
        const updated = { ...item };

        if (field === 'quantity') {
          if (value === '' || value === null || value === undefined) {
            updated.quantityDraft = '';
            return updated;
          }
          updated.quantityDraft = String(value);
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed) && parsed > 0) {
            updated.quantity = parsed;
            if (item.totalCost > 0 && !item.existingItemId) {
              updated.costPerUnit = Number((item.totalCost / parsed).toFixed(2));
            } else if (item.costPerUnit > 0) {
              updated.totalCost = Number((parsed * item.costPerUnit).toFixed(2));
            }
          }
        } else if (field === 'totalCost') {
          if (value === '' || value === null || value === undefined) {
            updated.totalCostDraft = '';
            return updated;
          }
          updated.totalCostDraft = String(value);
          const total = parseFloat(value);
          if (!isNaN(total) && total >= 0) {
            updated.totalCost = total;
            updated.costPerUnit = Number((total / item.quantity).toFixed(2));
          }
        } else if (field === 'costPerUnit') {
          if (value === '' || value === null || value === undefined) {
            updated.costPerUnitDraft = '';
            return updated;
          }
          updated.costPerUnitDraft = String(value);
          const cpu = parseFloat(value);
          if (!isNaN(cpu) && cpu >= 0) {
            updated.costPerUnit = cpu;
            updated.totalCost = Number((item.quantity * cpu).toFixed(2));
          }
        } else {
          (updated as any)[field] = value;
        }
        return updated;
      })
    );
  };

  const handleBlurField = (rowId: string, field: 'quantity' | 'totalCost' | 'costPerUnit', isManual = false) => {
    if (isManual) {
      setManualItems((list) =>
        list.map((item) => {
          if (item.rowId !== rowId) return item;
          if (field === 'quantity') {
            const parsed = parseInt(item.quantityDraft ?? '', 10);
            return {
              ...item,
              quantity: isNaN(parsed) || parsed < 1 ? 1 : parsed,
              quantityDraft: undefined,
            };
          }
          if (field === 'totalCost') {
            const parsed = parseFloat(item.totalCostDraft ?? '');
            return {
              ...item,
              totalCost: isNaN(parsed) || parsed < 0 ? 0 : parsed,
              totalCostDraft: undefined,
            };
          }
          if (field === 'costPerUnit') {
            const parsed = parseFloat(item.costPerUnitDraft ?? '');
            return {
              ...item,
              costPerUnit: isNaN(parsed) || parsed < 0 ? 0 : parsed,
              costPerUnitDraft: undefined,
            };
          }
          return item;
        })
      );
    } else {
      if (!parsedData) return;
      const updated = parsedData.items.map((item) => {
        if (item.rowId !== rowId) return item;
        if (field === 'quantity') {
          const parsed = parseInt(item.quantityDraft ?? '', 10);
          return {
            ...item,
            quantity: isNaN(parsed) || parsed < 1 ? 1 : parsed,
            quantityDraft: undefined,
          };
        }
        if (field === 'totalCost') {
          const parsed = parseFloat(item.totalCostDraft ?? '');
          return {
            ...item,
            totalCost: isNaN(parsed) || parsed < 0 ? 0 : parsed,
            totalCostDraft: undefined,
          };
        }
        if (field === 'costPerUnit') {
          const parsed = parseFloat(item.costPerUnitDraft ?? '');
          return {
            ...item,
            costPerUnit: isNaN(parsed) || parsed < 0 ? 0 : parsed,
            costPerUnitDraft: undefined,
          };
        }
        return item;
      });
      setParsedData({ ...parsedData, items: updated });
    }
  };

  const handleStepQuantity = (rowId: string, delta: number, isManual = false) => {
    if (isManual) {
      const target = manualItems.find((i) => i.rowId === rowId);
      if (!target) return;
      const next = Math.max(1, target.quantity + delta);
      setManualItems((list) =>
        list.map((item) => {
          if (item.rowId !== rowId) return item;
          const updated = { ...item, quantity: next, quantityDraft: undefined };
          if (item.totalCost > 0 && !item.existingItemId) {
            updated.costPerUnit = Number((item.totalCost / next).toFixed(2));
          } else if (item.costPerUnit > 0) {
            updated.totalCost = Number((next * item.costPerUnit).toFixed(2));
          }
          return updated;
        })
      );
    } else {
      if (!parsedData) return;
      const target = parsedData.items.find((i) => i.rowId === rowId);
      if (!target) return;
      const next = Math.max(1, target.quantity + delta);
      const updated = parsedData.items.map((item) => {
        if (item.rowId !== rowId) return item;
        const updatedItem = { ...item, quantity: next, quantityDraft: undefined };
        if (item.totalCost > 0) {
          updatedItem.costPerUnit = Number((item.totalCost / next).toFixed(2));
        } else if (item.costPerUnit > 0) {
          updatedItem.totalCost = Number((next * item.costPerUnit).toFixed(2));
        }
        return updatedItem;
      });
      const newTotal = updated.reduce((acc, curr) => acc + curr.totalCost, 0);
      setParsedData({
        ...parsedData,
        totalAmount: Number(newTotal.toFixed(2)),
        items: updated,
      });
    }
  };

  const handleSetQuickQuantity = (rowId: string, qty: number, isManual = false) => {
    if (isManual) {
      setManualItems((list) =>
        list.map((item) => {
          if (item.rowId !== rowId) return item;
          const updated = { ...item, quantity: qty, quantityDraft: undefined };
          if (item.totalCost > 0 && !item.existingItemId) {
            updated.costPerUnit = Number((item.totalCost / qty).toFixed(2));
          } else if (item.costPerUnit > 0) {
            updated.totalCost = Number((qty * item.costPerUnit).toFixed(2));
          }
          return updated;
        })
      );
    } else {
      if (!parsedData) return;
      const updated = parsedData.items.map((item) => {
        if (item.rowId !== rowId) return item;
        const updatedItem = { ...item, quantity: qty, quantityDraft: undefined };
        if (item.totalCost > 0) {
          updatedItem.costPerUnit = Number((item.totalCost / qty).toFixed(2));
        } else if (item.costPerUnit > 0) {
          updatedItem.totalCost = Number((qty * item.costPerUnit).toFixed(2));
        }
        return updatedItem;
      });
      const newTotal = updated.reduce((acc, curr) => acc + curr.totalCost, 0);
      setParsedData({
        ...parsedData,
        totalAmount: Number(newTotal.toFixed(2)),
        items: updated,
      });
    }
  };

  const handleRemoveManualItem = (rowId: string) => {
    if (manualItems.length <= 1) return;
    setManualItems((itemsList) => itemsList.filter((i) => i.rowId !== rowId));
  };

  const handleDirectManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = manualItems.filter((i) => i.name.trim().length > 0);
    if (validItems.length === 0) {
      setErrorMsg('Please select or enter at least one pantry item.');
      return;
    }

    const totalSpent = creditMyAccount
      ? validItems.reduce((acc, curr) => acc + curr.totalCost, 0)
      : 0;

    onApplyReceiptData(
      validItems.map((i) => ({
        id: i.existingItemId,
        name: i.name.trim(),
        category: i.category,
        costPerUnit: i.costPerUnit,
        quantity: i.quantity,
        unitName: i.unitName,
        barcode: i.barcode,
      })),
      totalSpent,
      manualStore.trim() || 'Store Restock'
    );
    onClose();
  };

  const handleTogglePackMode = (rowId: string) => {
    if (!parsedData) return;
    const updatedItems = parsedData.items.map((item) => {
      if (item.rowId !== rowId) return item;
      const isCurrentlyUnits = item.packMode !== 'pack';
      const packQty = item.packQuantity || 6;

      if (isCurrentlyUnits) {
        // Switch to 1 single pack container
        return {
          ...item,
          packMode: 'pack' as const,
          quantity: 1,
          costPerUnit: item.totalCost,
          unitName: 'pack',
        };
      } else {
        // Switch back to individual consumable units (e.g. 6 bottles)
        const newQty = packQty;
        const newCpu = Number((item.totalCost / newQty).toFixed(2));
        const matchedItem = item.existingItemId ? poolItems.find(p => p.id === item.existingItemId) : null;
        return {
          ...item,
          packMode: 'units' as const,
          quantity: newQty,
          costPerUnit: newCpu,
          unitName: matchedItem?.unitName || (item.category === 'Beverages' ? (packQty === 6 ? 'bottle' : 'can') : 'unit'),
        };
      }
    });

    const newTotal = updatedItems.reduce((acc, curr) => acc + curr.totalCost, 0);
    setParsedData({
      ...parsedData,
      totalAmount: Number(newTotal.toFixed(2)),
      items: updatedItems,
    });
  };

  const handleUpdateParsedItem = (rowId: string, field: keyof RestockLineItem, value: any) => {
    if (!parsedData) return;
    const updatedItems = parsedData.items.map((item) => {
      if (item.rowId !== rowId) return item;
      const updated = { ...item };

      if (field === 'quantity') {
        if (value === '' || value === null || value === undefined) {
          updated.quantityDraft = '';
          return updated;
        }
        updated.quantityDraft = String(value);
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed) && parsed > 0) {
          updated.quantity = parsed;
          if (item.totalCost > 0) {
            updated.costPerUnit = Number((item.totalCost / parsed).toFixed(2));
          } else if (item.costPerUnit > 0) {
            updated.totalCost = Number((parsed * item.costPerUnit).toFixed(2));
          }
        }
      } else if (field === 'totalCost') {
        if (value === '' || value === null || value === undefined) {
          updated.totalCostDraft = '';
          return updated;
        }
        updated.totalCostDraft = String(value);
        const total = parseFloat(value);
        if (!isNaN(total) && total >= 0) {
          updated.totalCost = total;
          updated.costPerUnit = Number((total / item.quantity).toFixed(2));
        }
      } else if (field === 'costPerUnit') {
        if (value === '' || value === null || value === undefined) {
          updated.costPerUnitDraft = '';
          return updated;
        }
        updated.costPerUnitDraft = String(value);
        const cpu = parseFloat(value);
        if (!isNaN(cpu) && cpu >= 0) {
          updated.costPerUnit = cpu;
          updated.totalCost = Number((item.quantity * cpu).toFixed(2));
        }
      } else {
        (updated as any)[field] = value;
      }
      return updated;
    });

    const newTotal = updatedItems.reduce((acc, curr) => acc + curr.totalCost, 0);
    setParsedData({
      ...parsedData,
      totalAmount: Number(newTotal.toFixed(2)),
      items: updatedItems,
    });
  };

  const handleSelectParsedItemMatch = (rowId: string, selectedValue: string) => {
    if (!parsedData) return;
    const updatedItems = parsedData.items.map((item) => {
      if (item.rowId !== rowId) return item;

      if (selectedValue === '__NEW__') {
        return {
          ...item,
          existingItemId: undefined,
          isNewItem: true,
          currentStock: 0,
        };
      }

      const selectedExisting = poolItems.find((p) => p.id === selectedValue);
      if (selectedExisting) {
        const cpu = item.costPerUnit > 0 ? item.costPerUnit : selectedExisting.costPerUnit;
        return {
          ...item,
          existingItemId: selectedExisting.id,
          isNewItem: false,
          name: selectedExisting.name,
          category: selectedExisting.category,
          costPerUnit: cpu,
          totalCost: Number((item.quantity * cpu).toFixed(2)),
          unitName: selectedExisting.unitName || 'unit',
          currentStock: selectedExisting.stock,
          barcode: item.barcode || selectedExisting.barcode || undefined,
        };
      }

      return item;
    });

    const newTotal = updatedItems.reduce((acc, curr) => acc + curr.totalCost, 0);
    setParsedData({
      ...parsedData,
      totalAmount: Number(newTotal.toFixed(2)),
      items: updatedItems,
    });
  };

  const handleRemoveParsedItem = (rowId: string) => {
    if (!parsedData || parsedData.items.length <= 1) return;
    const filtered = parsedData.items.filter((i) => i.rowId !== rowId);
    const newTotal = filtered.reduce((acc, curr) => acc + curr.totalCost, 0);
    setParsedData({
      ...parsedData,
      totalAmount: Number(newTotal.toFixed(2)),
      items: filtered,
    });
  };

  const handleToggleItemTaxed = (rowId: string) => {
    if (!parsedData) return;
    const taxAmt = parsedData.taxAmount || 0;
    const updated = parsedData.items.map((item) => {
      if (item.rowId !== rowId) return item;
      return {
        ...item,
        isTaxed: !item.isTaxed
      };
    });

    // Re-distribute tax proportionally among the updated taxable items
    const recomputed = taxAmt > 0
      ? distributeReceiptTax(updated, taxAmt)
      : updated;

    const newTotal = recomputed.reduce((acc, curr) => acc + curr.totalCost, 0);

    setParsedData({
      ...parsedData,
      totalAmount: Number(newTotal.toFixed(2)),
      items: recomputed as RestockLineItem[],
    });
  };

  const handleUpdateTaxAmount = (newTaxStr: string) => {
    if (!parsedData) return;
    const parsedTax = Math.max(0, parseFloat(newTaxStr) || 0);
    const recomputed = distributeReceiptTax(parsedData.items, parsedTax);
    const newTotal = recomputed.reduce((acc, curr) => acc + curr.totalCost, 0);

    setParsedData({
      ...parsedData,
      taxAmount: parsedTax,
      totalAmount: Number(newTotal.toFixed(2)),
      items: recomputed as RestockLineItem[],
    });
  };

  const handleConfirmAndAdd = () => {
    if (!parsedData) return;
    const validItems = parsedData.items.filter((i) => i.name.trim().length > 0);
    if (validItems.length === 0) return;

    const totalToCredit = creditMyAccount ? parsedData.totalAmount : 0;
    const appliedItemsPayload = validItems.map((i) => ({
      id: i.existingItemId,
      name: i.name.trim(),
      category: i.category,
      costPerUnit: i.costPerUnit,
      quantity: i.quantity,
      unitName: i.unitName,
      barcode: i.barcode,
    }));

    // Log the confirmed inventory items against the AI telemetry log
    if (parsedData.scanLogId) {
      const token = getAuthToken();
      fetch('/api/ai-log-applied', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          scanLogId: parsedData.scanLogId,
          appliedItems: appliedItemsPayload,
          storeName: parsedData.storeName,
          totalAmount: totalToCredit
        })
      }).catch((e) => console.warn('[AI Log Applied Fetch Error]', e));
    }

    onApplyReceiptData(
      appliedItemsPayload,
      totalToCredit,
      parsedData.storeName || 'Pantry Restock'
    );
    onClose();
  };

  const manualTotal = manualItems.reduce((acc, curr) => acc + curr.totalCost, 0);

  return (
    <div 
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#2D2D2D]/50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white border-t sm:border border-[#E0DAD1] rounded-t-2xl sm:rounded-xl max-w-2xl w-full max-h-[92vh] sm:max-h-[90vh] flex flex-col text-[#2D2D2D] shadow-2xl relative overflow-hidden"
      >
        
        {/* Mobile iOS Pull Handle */}
        <div className="w-10 h-1 rounded-full bg-[#E0DAD1] mx-auto mt-2.5 sm:hidden shrink-0" />

        {/* Modal Header */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-5 pb-3 border-b border-[#EDE8E0] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-lg bg-[#FDF0EC] text-[#E8694A] shrink-0">
                <Receipt className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-[#2D2D2D] truncate">
                  Bring In Items / Restock
                </h2>
                <p className="text-xs text-[#6B6B6B] truncate sm:whitespace-normal">
                  Restock existing pantry supplies or log new items & credit your balance
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer shrink-0 ml-2"
              title="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!parsedData && (
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#F0EBE3] rounded-xl mt-3 border border-[#E0DAD1]">
              <button
                type="button"
                onClick={() => { setEntryMode('manual'); setErrorMsg(null); }}
                className={`py-1.5 sm:py-2 px-1 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  entryMode === 'manual'
                    ? 'bg-white text-[#E8694A] shadow-xs font-semibold'
                    : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
                }`}
              >
                <PenTool className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Select & Restock</span>
              </button>

              <button
                type="button"
                onClick={() => { setEntryMode('text'); setErrorMsg(null); }}
                className={`py-1.5 sm:py-2 px-1 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  entryMode === 'text'
                    ? 'bg-white text-[#E8694A] shadow-xs font-semibold'
                    : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Describe Haul</span>
              </button>

              <button
                type="button"
                onClick={() => { setEntryMode('photo'); setErrorMsg(null); }}
                className={`py-1.5 sm:py-2 px-1 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  entryMode === 'photo'
                    ? 'bg-white text-[#E8694A] shadow-xs font-semibold'
                    : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
                }`}
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Scan Photo</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="mt-2.5 p-2.5 rounded-lg bg-[#FDF0EC] border border-[#C9553D]/30 text-[#C9553D] text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-[#C9553D] shrink-0" />
              <span className="leading-snug">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Mode 1: Manual Item Selection & Restock */}
        {!parsedData && entryMode === 'manual' && (
          <form onSubmit={handleDirectManualSubmit} className="flex flex-col flex-1 min-h-0">
            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3.5 sm:py-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-semibold text-[#2D2D2D]">
                    Pantry Items Brought In
                  </label>
                  <p className="text-[11px] text-[#6B6B6B]">
                    Select from existing pantry items or create a new catalog item
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddManualItemRow}
                  className="text-xs font-semibold text-[#E8694A] hover:underline flex items-center gap-1 cursor-pointer shrink-0 py-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Item</span>
                </button>
              </div>

              <div className="space-y-3">
                {manualItems.map((item) => (
                  <div 
                    key={item.rowId}
                    className="p-3 sm:p-3.5 bg-[#FAFAF8] border border-[#E0DAD1] rounded-xl space-y-2.5 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-[#E8694A]" />
                          <span>Select Existing Pantry Item</span>
                        </label>

                        {manualItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveManualItem(item.rowId)}
                            className="p-1 rounded text-[#6B6B6B] hover:text-[#C9553D] hover:bg-[#FDF0EC] transition cursor-pointer"
                            title="Remove line item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <select
                        value={item.isNewItem ? '__NEW__' : (item.existingItemId || '')}
                        onChange={(e) => handleSelectPantryItem(item.rowId, e.target.value)}
                        className="w-full bg-white border border-[#E0DAD1] rounded-lg px-2.5 py-2 text-xs text-[#2D2D2D] font-medium focus:outline-none focus:border-[#E8694A]"
                      >
                        {poolItems.length > 0 && (
                          <optgroup label="📋 Current Pantry Inventory">
                            {poolItems.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} • {pool.currency}{(p.costPerUnit ?? 0).toFixed(2)} ({p.stock} in stock)
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="➕ Create New Item">
                          <option value="__NEW__">
                            + New Item (Not in catalog yet)...
                          </option>
                        </optgroup>
                      </select>
                    </div>

                    {item.isNewItem && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-[#EDE8E0]">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] text-[#6B6B6B] font-medium mb-0.5">
                            New Item Name
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Dr Pepper Bottles (6-pack)"
                            value={item.name}
                            onChange={(e) => handleUpdateManualItem(item.rowId, 'name', e.target.value)}
                            className="w-full bg-white border border-[#E0DAD1] rounded-lg px-2.5 py-1.5 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-[#6B6B6B] font-medium mb-0.5">
                            Category
                          </label>
                          <select
                            value={item.category}
                            onChange={(e) => handleUpdateManualItem(item.rowId, 'category', e.target.value as ItemCategory)}
                            className="w-full bg-white border border-[#E0DAD1] rounded-lg px-2 py-1.5 text-xs text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                          >
                            {CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Responsive 2-Tier Inputs on Mobile / 3-Column on Desktop */}
                    <div className="space-y-2.5 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-2.5 pt-1">
                      {/* Tier 1 on Mobile: Quantity Stepper & Quick Pills */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] sm:text-[11px] text-[#6B6B6B] font-medium">
                            Quantity ({item.unitName || 'unit'}s)
                          </label>
                          <div className="flex items-center gap-1">
                            {[1, 6, 12, 24].map((q) => {
                              const isSelected = Number(item.quantity) === q;
                              return (
                                <button
                                  key={q}
                                  type="button"
                                  onClick={() => handleSetQuickQuantity(item.rowId, q, true)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#E8694A] text-white font-bold shadow-2xs'
                                      : 'bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#6B6B6B] border border-[#E0DAD1]/60'
                                  }`}
                                  title={`Set to ${q}`}
                                >
                                  {q}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex items-center rounded-lg border border-[#E0DAD1] bg-white overflow-hidden w-full focus-within:border-[#E8694A] shadow-2xs h-9 sm:h-8">
                          <button
                            type="button"
                            onClick={() => handleStepQuantity(item.rowId, -1, true)}
                            className="w-10 sm:w-8 h-full flex items-center justify-center text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] active:bg-[#E0DAD1] transition cursor-pointer"
                            title="Decrease quantity (-1)"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={item.quantityDraft !== undefined ? item.quantityDraft : item.quantity}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => handleBlurField(item.rowId, 'quantity', true)}
                            onChange={(e) => handleUpdateManualItem(item.rowId, 'quantity', e.target.value)}
                            className="flex-1 text-center bg-transparent border-none text-xs font-mono-financial font-bold text-[#2D2D2D] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleStepQuantity(item.rowId, 1, true)}
                            className="w-10 sm:w-8 h-full flex items-center justify-center text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] active:bg-[#E0DAD1] transition cursor-pointer"
                            title="Increase quantity (+1)"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Tier 2 on Mobile: 50/50 Pricing Grid */}
                      <div className="grid grid-cols-2 gap-2 sm:contents">
                        <div>
                          <label className="block text-[10px] sm:text-[11px] text-[#6B6B6B] font-medium mb-1 truncate">
                            Total Paid ({pool.currency})
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#9A9A9A]">
                              {pool.currency}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              value={item.totalCostDraft !== undefined ? item.totalCostDraft : item.totalCost}
                              onFocus={(e) => e.target.select()}
                              onBlur={() => handleBlurField(item.rowId, 'totalCost', true)}
                              onChange={(e) => handleUpdateManualItem(item.rowId, 'totalCost', e.target.value)}
                              className="w-full bg-white border border-[#E0DAD1] rounded-lg pl-6 pr-2 text-xs font-mono-financial font-bold text-[#2D2D2D] focus:outline-none focus:border-[#E8694A] h-9 sm:h-8"
                              placeholder="5.99"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[10px] sm:text-[11px] text-[#6B6B6B] font-medium truncate">
                              Unit Price ({pool.currency})
                            </label>
                            <span className="text-[9px] text-[#9A9A9A]">auto</span>
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#5A9A6B]">
                              {pool.currency}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              value={item.costPerUnitDraft !== undefined ? item.costPerUnitDraft : item.costPerUnit}
                              onFocus={(e) => e.target.select()}
                              onBlur={() => handleBlurField(item.rowId, 'costPerUnit', true)}
                              onChange={(e) => handleUpdateManualItem(item.rowId, 'costPerUnit', e.target.value)}
                              className="w-full bg-[#FAF8F5] border border-[#E0DAD1] rounded-lg pl-6 pr-2 text-xs font-mono-financial font-bold text-[#5A9A6B] focus:outline-none focus:border-[#E8694A] h-9 sm:h-8"
                              title="Auto-calculated (Total ÷ Qty) or edit directly"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {!item.isNewItem && item.existingItemId && (() => {
                      const existingItem = poolItems.find(p => p.id === item.existingItemId);
                      const currentStock = existingItem ? existingItem.stock : item.currentStock;
                      const currentCpu = existingItem ? existingItem.costPerUnit : item.costPerUnit;
                      const addedQty = parseInt(item.quantity as any, 10) || 0;
                      const newTotalStock = currentStock + addedQty;
                      const purchaseCpu = parseFloat(item.costPerUnit as any) || 0;

                      const blendedCpu = calculateMovingAveragePrice(
                        currentStock,
                        currentCpu,
                        addedQty,
                        purchaseCpu
                      );

                      return (
                        <div className="flex items-center justify-between gap-2 text-[11px] bg-[#F0EBE3] px-2.5 py-1.5 rounded-lg border border-[#E0DAD1]">
                          <div className="flex items-center gap-1.5 text-[#6B6B6B]">
                            <span>Stock:</span>
                            <strong className="text-[#2D2D2D] font-mono-financial">{currentStock}</strong>
                            <ArrowRight className="w-3 h-3 text-[#E8694A]" />
                            <strong className="text-[#5A9A6B] font-mono-financial">
                              {newTotalStock} {item.unitName}s
                            </strong>
                          </div>

                          <div className="flex items-center gap-1 text-[#6B6B6B]" title="Weighted moving average price based on existing inventory + new restock">
                            <span>Avg:</span>
                            <span className="font-mono-financial text-[#6B6B6B] line-through text-[10px]">
                              {pool.currency}{(currentCpu ?? 0).toFixed(2)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-[#E8694A]" />
                            <span className="font-mono-financial font-bold text-[#5A9A6B]">
                              {pool.currency}{(blendedCpu ?? 0).toFixed(2)}/{item.unitName || 'unit'}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>

              {/* Store / Source Note */}
              <div className="p-3 bg-[#F0EBE3] border border-[#E0DAD1] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex-1">
                  <label className="block text-[10px] text-[#6B6B6B] font-medium mb-0.5">
                    Store / Source Note
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Costco, Trader Joe's, Target, Local Market"
                    value={manualStore}
                    onChange={(e) => setManualStore(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] rounded-lg px-2.5 py-1.5 text-xs text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                  />
                </div>

                <div className="sm:text-right flex items-center sm:block justify-between pt-1 sm:pt-0 border-t sm:border-t-0 border-[#E0DAD1]/60">
                  <span className="text-[10px] text-[#6B6B6B] block font-medium">Total Out-of-Pocket</span>
                  <span className="text-base font-bold font-mono-financial text-[#5A9A6B]">
                    {pool.currency}{manualTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Open Food Facts Attribution */}
              <div className="pt-2 text-[10px] text-[#8A8A8A] flex flex-wrap items-center justify-between gap-1.5">
                <span>
                  Product data powered by{' '}
                  <a 
                    href="https://world.openfoodfacts.org" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#E8694A] hover:underline font-medium"
                  >
                    Open Food Facts
                  </a>{' '}
                  (<a 
                    href="https://opendatacommons.org/licenses/odbl/1-0/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#E8694A] hover:underline"
                  >
                    ODbL 1.0
                  </a>).
                </span>
                <a
                  href="https://world.openfoodfacts.org/cgi/product.pl?type=edit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5A9A6B] hover:underline font-medium flex items-center gap-1"
                >
                  <span>Contribute to Open Food Facts</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            {/* Sticky Mobile/Desktop Footer Action Bar */}
            <div className="px-4 sm:px-6 py-3 bg-[#FAF8F5] border-t border-[#EDE8E0] shrink-0 space-y-2.5 rounded-b-xl">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#2D2D2D]">
                <input
                  type="checkbox"
                  checked={creditMyAccount}
                  onChange={(e) => setCreditMyAccount(e.target.checked)}
                  className="w-4 h-4 rounded text-[#E8694A] focus:ring-[#E8694A] border-[#E0DAD1]"
                />
                <span>
                  Credit my personal balance for <strong>{pool.currency}{manualTotal.toFixed(2)}</strong>
                </span>
              </label>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/3 py-2.5 px-3 rounded-full bg-transparent hover:bg-[#F0EBE3] text-[#6B6B6B] hover:text-[#2D2D2D] font-medium text-xs border border-[#E0DAD1] transition cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-3 sm:py-2.5 px-4 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] font-semibold text-white text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>Restock {manualItems.length} Item{manualItems.length > 1 ? 's' : ''} & Credit Balance</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Mode 2: Describe Haul Text */}
        {!parsedData && entryMode === 'text' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3.5 sm:py-4 space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#2D2D2D]">
                    Describe Your Haul in Plain Text
                  </label>
                  <span className="text-[11px] text-[#6B6B6B]">Smart Matching Enabled</span>
                </div>
                <textarea
                  rows={4}
                  placeholder="e.g. Brought in a 6 pack of Dr Pepper bottles ($6.50) and 2 bags of chips ($4.00) from Target"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-xl p-3 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
                />
              </div>

              {/* Open Food Facts Attribution */}
              <div className="pt-2 text-[10px] text-[#8A8A8A] flex flex-wrap items-center justify-between gap-1.5">
                <span>
                  Product data powered by{' '}
                  <a 
                    href="https://world.openfoodfacts.org" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#E8694A] hover:underline font-medium"
                  >
                    Open Food Facts
                  </a>{' '}
                  (<a 
                    href="https://opendatacommons.org/licenses/odbl/1-0/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#E8694A] hover:underline"
                  >
                    ODbL 1.0
                  </a>).
                </span>
                <a
                  href="https://world.openfoodfacts.org/cgi/product.pl?type=edit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5A9A6B] hover:underline font-medium flex items-center gap-1"
                >
                  <span>Contribute to Open Food Facts</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-3 bg-[#FAF8F5] border-t border-[#EDE8E0] shrink-0 rounded-b-xl">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/3 py-2.5 px-3 rounded-full bg-transparent hover:bg-[#F0EBE3] text-[#6B6B6B] hover:text-[#2D2D2D] font-medium text-xs border border-[#E0DAD1] transition cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScanReceipt}
                  disabled={isLoading || !textInput.trim()}
                  className="w-2/3 py-3 sm:py-2.5 px-4 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] font-semibold text-white text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Extracting & Matching items...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Parse Text & Match to Pantry</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode 3: Scan Photo */}
        {!parsedData && entryMode === 'photo' && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3.5 sm:py-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#2D2D2D] mb-2">
                  Upload Paper Receipt Image
                </label>

                <div className="relative border-2 border-dashed border-[#E0DAD1] hover:border-[#E8694A] rounded-xl p-6 text-center bg-[#FAFAF8] hover:bg-[#F0EBE3] transition cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />

                  {imagePreview ? (
                    <div className="space-y-2">
                      <img
                        src={imagePreview}
                        alt="Receipt preview"
                        className="max-h-48 rounded-lg mx-auto object-contain ring-1 ring-[#E0DAD1]"
                      />
                      <span className="text-xs text-[#5A9A6B] font-medium block">
                        Receipt selected! Tap scan below.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="h-10 w-10 rounded-lg bg-[#F0EBE3] flex items-center justify-center mx-auto text-[#E8694A]">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div className="text-sm font-medium text-[#2D2D2D]">
                        Take photo or upload receipt
                      </div>
                      <div className="text-xs text-[#6B6B6B]">
                        JPG, PNG, WebP supported
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Open Food Facts Attribution */}
              <div className="pt-2 text-[10px] text-[#8A8A8A] flex flex-wrap items-center justify-between gap-1.5">
                <span>
                  Product data powered by{' '}
                  <a 
                    href="https://world.openfoodfacts.org" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#E8694A] hover:underline font-medium"
                  >
                    Open Food Facts
                  </a>{' '}
                  (<a 
                    href="https://opendatacommons.org/licenses/odbl/1-0/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#E8694A] hover:underline"
                  >
                    ODbL 1.0
                  </a>).
                </span>
                <a
                  href="https://world.openfoodfacts.org/cgi/product.pl?type=edit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5A9A6B] hover:underline font-medium flex items-center gap-1"
                >
                  <span>Contribute to Open Food Facts</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-3 bg-[#FAF8F5] border-t border-[#EDE8E0] shrink-0 rounded-b-xl">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/3 py-2.5 px-3 rounded-full bg-transparent hover:bg-[#F0EBE3] text-[#6B6B6B] hover:text-[#2D2D2D] font-medium text-xs border border-[#E0DAD1] transition cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScanReceipt}
                  disabled={isLoading || !imagePreview}
                  className="w-2/3 py-3 sm:py-2.5 px-4 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] font-semibold text-white text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Analyzing Receipt with Gemini AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Scan Receipt & Match Items</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode 4: Review Parsed Receipt Data */}
        {parsedData && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3.5 sm:py-4 space-y-3.5">
              {parsedData.isFallback && (
                <div className="p-3 rounded-lg bg-[#FFF8EB] border border-[#D4870E]/30 text-[#D4870E] text-xs">
                  {parsedData.message}
                </div>
              )}

              <div className="bg-[#F0EBE3] rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between border border-[#E0DAD1] gap-3">
                <div className="flex-1">
                  <span className="text-[10px] text-[#6B6B6B] block font-medium">Store / Source</span>
                  <input
                    type="text"
                    value={parsedData.storeName}
                    onChange={(e) => setParsedData({ ...parsedData, storeName: e.target.value })}
                    className="bg-white border border-[#E0DAD1] rounded-lg px-2 py-1 text-xs font-semibold text-[#2D2D2D] focus:outline-none focus:border-[#E8694A] max-w-[200px]"
                  />
                </div>

                {parsedData.taxAmount !== undefined && parsedData.taxAmount > 0 && (
                  <div className="flex items-center gap-3 text-xs bg-white/70 px-2.5 py-1 rounded-lg border border-[#E0DAD1]">
                    <div>
                      <span className="text-[10px] text-[#6B6B6B] block font-medium">Subtotal</span>
                      <span className="font-mono-financial font-semibold text-[#6B6B6B]">
                        {pool.currency}{(parsedData.subtotal ?? (parsedData.totalAmount - parsedData.taxAmount)).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#6B6B6B] block font-medium">Sales Tax</span>
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] text-[#9A9A9A] font-semibold">{pool.currency}</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={parsedData.taxAmount}
                          onChange={(e) => handleUpdateTaxAmount(e.target.value)}
                          className="w-14 bg-white border border-[#E0DAD1] rounded px-1 py-0.5 font-mono-financial text-xs font-bold text-[#E8694A] focus:outline-none focus:border-[#E8694A]"
                          title="Sales tax split proportionally across taxable items"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-right">
                  <span className="text-[10px] text-[#6B6B6B] block font-medium">Total Spent</span>
                  <span className="text-lg font-bold font-mono-financial text-[#5A9A6B]">
                    {pool.currency}{parsedData.totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-[#2D2D2D]">
                    Review & Tie to Pantry Items ({parsedData.items.length})
                  </h3>
                  <span className="text-[11px] text-[#6B6B6B]">Adjust matches or quantities</span>
                </div>

                <div className="space-y-3">
                  {parsedData.items.map((item) => (
                    <div
                      key={item.rowId}
                      className="p-3 bg-[#FAFAF8] border border-[#E0DAD1] rounded-xl space-y-2.5 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <select
                            value={item.isNewItem ? '__NEW__' : (item.existingItemId || '')}
                            onChange={(e) => handleSelectParsedItemMatch(item.rowId, e.target.value)}
                            className="w-full bg-white border border-[#E0DAD1] rounded-lg px-2 py-1.5 text-xs font-semibold text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                          >
                            {poolItems.length > 0 && (
                              <optgroup label="📋 Match to Existing Pantry Item">
                                {poolItems.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.stock} in stock)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="➕ Create as New Item">
                              <option value="__NEW__">
                                + New Item: "{item.name}"
                              </option>
                            </optgroup>
                          </select>
                        </div>

                        {item.isNewItem && (
                          <select
                            value={item.category}
                            onChange={(e) => handleUpdateParsedItem(item.rowId, 'category', e.target.value as ItemCategory)}
                            className="w-32 bg-white border border-[#E0DAD1] rounded-lg px-2 py-1.5 text-xs text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
                          >
                            {CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        )}

                        {parsedData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveParsedItem(item.rowId)}
                            className="p-1 text-[#6B6B6B] hover:text-[#C9553D] cursor-pointer shrink-0"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {(item.barcode || item.isPack) && (
                        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] text-[#6B6B6B] flex-wrap">
                          {item.barcode && (
                            <span className="inline-flex items-center gap-1 bg-[#EAE5DD] text-[#4A4A4A] px-1.5 py-0.5 rounded font-mono font-medium shrink-0">
                              <Barcode className="w-3 h-3 text-[#E8694A]" />
                              UPC: {item.barcode}
                            </span>
                          )}
                          {item.isPack && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                              item.isBarcodeVerified || item.packConfidence === 'verified'
                                ? 'text-[#2F6B3D] bg-[#EBF3ED]'
                                : 'text-[#8A5800] bg-[#FFF8E6]'
                            }`}>
                              {item.isBarcodeVerified || item.packConfidence === 'verified' ? '✓ ' : '~ '}
                              {item.packQuantity}-Pack {item.isBarcodeVerified || item.packConfidence === 'verified' ? 'Verified' : 'Detected'}
                            </span>
                          )}
                          {(item.isPack || (item.packQuantity && item.packQuantity > 1)) && (
                            <button
                              type="button"
                              onClick={() => handleTogglePackMode(item.rowId)}
                              className="inline-flex items-center gap-1 text-[10px] text-[#2F6B3D] hover:text-[#1F4A2A] bg-[#F4F9F5] hover:bg-[#EBF5EE] border border-[#D5E8DA] px-2 py-0.5 rounded transition cursor-pointer font-medium shrink-0 active:scale-95"
                              title="Toggle between counting individual units vs single pack container"
                            >
                              <span>📦</span>
                              <span>
                                {item.packMode === 'pack' 
                                  ? '1 Pack' 
                                  : `${item.quantity} ${item.unitName}s`}
                              </span>
                              <span className="text-[#E8694A] underline text-[9px] ml-0.5">
                                ({item.packMode === 'pack' ? `unpack to ${item.packQuantity || 6}` : 'as 1 pack'})
                              </span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Tax Status Pill & Tax Share Display */}
                      <div className="flex items-center justify-between text-[11px] pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleToggleItemTaxed(item.rowId)}
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium transition cursor-pointer active:scale-95 ${
                            item.isTaxed
                              ? 'bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/30 hover:bg-[#FCE6DF]'
                              : 'bg-[#F0EBE3] text-[#6B6B6B] border border-[#E0DAD1] hover:bg-[#E8E2D9]'
                          }`}
                          title="Click to toggle whether this item is subject to sales tax"
                        >
                          <span>{item.isTaxed ? '🏷️ Taxed' : '🌿 Tax-Exempt / No Tax'}</span>
                          {item.isTaxed && typeof item.taxShare === 'number' && item.taxShare > 0 && (
                            <span className="font-mono font-semibold">
                              (+{pool.currency}{item.taxShare.toFixed(2)} tax)
                            </span>
                          )}
                        </button>
                        {item.preTaxCost !== undefined && item.taxShare && item.taxShare > 0 ? (
                          <span className="text-[10px] text-[#8A8A8A] font-mono">
                            Pre-tax: {pool.currency}{item.preTaxCost.toFixed(2)}
                          </span>
                        ) : null}
                      </div>

                      {/* Responsive 2-Tier Inputs on Mobile / 3-Column on Desktop */}
                      <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-2 pt-1">
                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] text-[#6B6B6B] shrink-0 font-medium">Qty:</span>
                            <div className="flex items-center gap-1">
                              {[1, 6, 12, 24].map((q) => {
                                const isSelected = Number(item.quantity) === q;
                                return (
                                  <button
                                    key={q}
                                    type="button"
                                    onClick={() => handleSetQuickQuantity(item.rowId, q, false)}
                                    className={`min-w-6 h-6 px-1.5 rounded transition font-mono cursor-pointer text-[10px] flex items-center justify-center active:scale-95 ${
                                      isSelected
                                        ? 'bg-[#E8694A] text-white font-bold shadow-2xs'
                                        : 'bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#6B6B6B] border border-[#E0DAD1]/60'
                                    }`}
                                    title={`Set to ${q}`}
                                  >
                                    {q}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex items-center rounded-lg border border-[#E0DAD1] bg-white overflow-hidden w-full focus-within:border-[#E8694A] h-9 sm:h-7.5">
                            <button
                              type="button"
                              onClick={() => handleStepQuantity(item.rowId, -1, false)}
                              className="w-9 sm:w-7 h-full flex items-center justify-center text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer"
                              title="Decrease quantity (-1)"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantityDraft !== undefined ? item.quantityDraft : item.quantity}
                              onFocus={(e) => e.target.select()}
                              onBlur={() => handleBlurField(item.rowId, 'quantity', false)}
                              onChange={(e) => handleUpdateParsedItem(item.rowId, 'quantity', e.target.value)}
                              className="flex-1 text-center bg-transparent border-none text-xs font-mono-financial font-bold focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleStepQuantity(item.rowId, 1, false)}
                              className="w-9 sm:w-7 h-full flex items-center justify-center text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition cursor-pointer"
                              title="Increase quantity (+1)"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:contents">
                          <div>
                            <div className="flex items-center mb-0.5">
                              <span className="text-[10px] text-[#6B6B6B] shrink-0 font-medium">Total:</span>
                            </div>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#9A9A9A]">
                                {pool.currency}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.totalCostDraft !== undefined ? item.totalCostDraft : item.totalCost}
                                onFocus={(e) => e.target.select()}
                                onBlur={() => handleBlurField(item.rowId, 'totalCost', false)}
                                onChange={(e) => handleUpdateParsedItem(item.rowId, 'totalCost', e.target.value)}
                                className="w-full bg-white border border-[#E0DAD1] rounded-lg pl-6 pr-2 py-1 text-xs font-mono-financial font-bold text-[#2D2D2D] focus:outline-none focus:border-[#E8694A] h-9 sm:h-7.5"
                                title="Total amount paid for this pack or line"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] text-[#6B6B6B] shrink-0 font-medium">/Unit:</span>
                              <span className="text-[9px] text-[#9A9A9A]">auto</span>
                            </div>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#5A9A6B]">
                                {pool.currency}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.costPerUnitDraft !== undefined ? item.costPerUnitDraft : item.costPerUnit}
                                onFocus={(e) => e.target.select()}
                                onBlur={() => handleBlurField(item.rowId, 'costPerUnit', false)}
                                onChange={(e) => handleUpdateParsedItem(item.rowId, 'costPerUnit', e.target.value)}
                                className="w-full bg-[#FAF8F5] border border-[#E0DAD1] rounded-lg pl-6 pr-2 py-1 text-xs font-mono-financial font-bold text-[#5A9A6B] focus:outline-none focus:border-[#E8694A] h-9 sm:h-7.5"
                                title="Unit price (auto-computed from Total ÷ Qty)"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {!item.isNewItem && item.existingItemId && (() => {
                        const existing = poolItems.find(p => p.id === item.existingItemId);
                        if (!existing || existing.stock <= 0) return null;
                        const addedQty = parseInt(item.quantity as any, 10) || 0;
                        const purchaseCpu = parseFloat(item.costPerUnit as any) || 0;
                        const blended = calculateMovingAveragePrice(
                          existing.stock,
                          existing.costPerUnit,
                          addedQty,
                          purchaseCpu
                        );
                        return (
                          <div className="flex items-center gap-1.5 text-[10px] text-[#6B6B6B] bg-[#FAF8F5] px-2.5 py-1 rounded-lg border border-[#EDE8E0]">
                            <span>Blended Avg:</span>
                            <span className="font-mono-financial text-[#6B6B6B] line-through">{pool.currency}{existing.costPerUnit.toFixed(2)}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-[#E8694A]" />
                            <span className="font-mono-financial font-bold text-[#5A9A6B]">{pool.currency}{blended.toFixed(2)} / {item.unitName}</span>
                            <span className="text-[9px] text-[#9A9A9A]">({existing.stock} existing + {addedQty} new)</span>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Food Facts Attribution */}
              <div className="pt-2 text-[10px] text-[#8A8A8A] flex flex-wrap items-center justify-between gap-1.5">
                <span>
                  Product data powered by{' '}
                  <a 
                    href="https://world.openfoodfacts.org" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#E8694A] hover:underline font-medium"
                  >
                    Open Food Facts
                  </a>{' '}
                  (<a 
                    href="https://opendatacommons.org/licenses/odbl/1-0/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#E8694A] hover:underline"
                  >
                    ODbL 1.0
                  </a>).
                </span>
                <a
                  href="https://world.openfoodfacts.org/cgi/product.pl?type=edit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5A9A6B] hover:underline font-medium flex items-center gap-1"
                >
                  <span>Contribute to Open Food Facts</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="px-4 sm:px-6 py-3 bg-[#FAF8F5] border-t border-[#EDE8E0] shrink-0 space-y-2.5 rounded-b-xl">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[#2D2D2D]">
                <input
                  type="checkbox"
                  checked={creditMyAccount}
                  onChange={(e) => setCreditMyAccount(e.target.checked)}
                  className="w-4 h-4 rounded text-[#E8694A] focus:ring-[#E8694A] border-[#E0DAD1]"
                />
                <span>
                  Credit my personal balance for <strong>{pool.currency}{parsedData.totalAmount.toFixed(2)}</strong>
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2.5 rounded-full bg-transparent hover:bg-[#F0EBE3] text-[#6B6B6B] hover:text-[#2D2D2D] font-medium text-xs border border-[#E0DAD1] transition cursor-pointer text-center"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => setParsedData(null)}
                  className="px-3.5 py-2.5 rounded-full bg-transparent hover:bg-[#F0EBE3] text-[#2D2D2D] font-medium text-xs border border-[#E0DAD1] transition cursor-pointer text-center"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleConfirmAndAdd}
                  className="flex-1 py-3 sm:py-2.5 px-3 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>Restock Items {creditMyAccount ? '& Credit' : ''}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
