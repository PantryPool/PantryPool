import React, { useState, useEffect } from 'react';
import { Pool, ShoppingListItem, Item, ItemCategory } from '../types';
import { 
  ShoppingBag, 
  X, 
  Plus, 
  Check, 
  Trash2, 
  Sparkles, 
  Loader2, 
  ShoppingCart,
  Bot,
  CheckCircle2
} from 'lucide-react';
import { getAuthToken } from '../lib/api';

interface ShoppingListModalProps {
  pool: Pool;
  shoppingList: ShoppingListItem[];
  items: Item[];
  onClose: () => void;
  onAddShoppingItem: (name: string, category: ItemCategory, estCost: number, quantity: number, reason: string) => void;
  onTogglePurchased: (id: string) => void;
  onDeleteShoppingItem: (id: string) => void;
  onClearShoppingList?: () => void;
  onExecuteRestockFromList: (itemsToRestock: ShoppingListItem[]) => void;
}

export const ShoppingListModal: React.FC<ShoppingListModalProps> = ({
  pool,
  shoppingList,
  items,
  onClose,
  onAddShoppingItem,
  onTogglePurchased,
  onDeleteShoppingItem,
  onClearShoppingList,
  onExecuteRestockFromList,
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [newCategory, setNewCategory] = useState<ItemCategory>('Beverages');
  const [newEstCost, setNewEstCost] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');
  const [newReason, setNewReason] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<string | null>(null);
  const [aiItemsCount, setAiItemsCount] = useState<number>(0);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const poolShoppingItems = shoppingList.filter((s) => s.poolId === pool.id);
  const totalEstimatedCost = poolShoppingItems.reduce((acc, curr) => acc + (Number(curr.estimatedCost) || 0) * (Number(curr.quantity) || 1), 0);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const parsedCost = parseFloat(newEstCost);
    onAddShoppingItem(
      newItemName.trim(),
      newCategory,
      !isNaN(parsedCost) && parsedCost >= 0 ? parsedCost : 0,
      parseInt(newQuantity) || 1,
      newReason.trim()
    );

    setNewItemName('');
    setNewEstCost('');
    setNewQuantity('1');
    setNewReason('');
  };

  const handleAiSuggest = async () => {
    setAiLoading(true);
    setAiSummary(null);
    setAiSource(null);
    setAiItemsCount(0);

    try {
      const token = getAuthToken();
      const poolItems = items.filter((i) => i.poolId === pool.id);
      const res = await fetch('/api/ai-suggest-restock', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          poolId: pool.id,
          poolName: pool.name,
          items: poolItems,
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.suggestions)) {
        setAiSummary(data.summary || 'Restock suggestions generated.');
        setAiSource(data.source || 'heuristic');

        // Existing unpurchased item names to prevent duplicates
        const existingNames = new Set(
          poolShoppingItems.filter((i) => !i.purchased).map((i) => (i.itemName || (i as any).name || '').toLowerCase().trim())
        );

        let addedCount = 0;
        data.suggestions.forEach((s: any) => {
          const itemName = s.itemName || s.name;
          if (itemName && !existingNames.has(itemName.toLowerCase().trim())) {
            const unitPrice = typeof s.estimatedUnitPrice === 'number' ? s.estimatedUnitPrice : (typeof s.costPerUnit === 'number' ? s.costPerUnit : 0);
            const qty = Number(s.recommendedQuantity || s.quantity || 1);
            const estCost = unitPrice * qty;
            onAddShoppingItem(
              itemName,
              (s.category as ItemCategory) || 'Beverages',
              estCost,
              qty,
              s.reason || 'Restock needed based on low inventory'
            );
            existingNames.add(itemName.toLowerCase().trim());
            addedCount++;
          }
        });
        setAiItemsCount(addedCount);
      }
    } catch (e) {
      console.error('[AI Restock Error]', e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleClearAll = () => {
    if (onClearShoppingList) {
      onClearShoppingList();
    } else {
      poolShoppingItems.forEach((i) => onDeleteShoppingItem(i.id));
    }
  };

  const handleRestockPurchased = () => {
    const purchased = poolShoppingItems.filter((i) => i.purchased);
    if (purchased.length === 0) return;
    onExecuteRestockFromList(purchased);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-[#2D2D2D]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white border border-[#E0DAD1] rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col text-[#2D2D2D] shadow-2xl relative my-auto overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Sticky Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDE8E0] bg-[#FAFAF8] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#FDF0EC] text-[#E8694A]">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#2D2D2D]">Pantry Restock List</h2>
              <p className="text-xs text-[#6B6B6B]">
                Low stock alerts & requested items for {pool.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Restock Modal"
            className="p-2 rounded-full bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] transition cursor-pointer flex items-center justify-center"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* AI Restock Button */}
          <div className="bg-[#F0EBE3] border border-[#E0DAD1] rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div>
              <span className="text-xs font-semibold text-[#E8694A] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#E8694A]" />
                <span>Smart Inventory Planner</span>
              </span>
              <p className="text-xs text-[#6B6B6B] mt-0.5">
                Evaluate inventory thresholds and auto-queue restock requests
              </p>
            </div>

            <button
              onClick={handleAiSuggest}
              disabled={aiLoading}
              className="px-4 py-2 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {aiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>Generate Restock List</span>
            </button>
          </div>

          {aiSummary && (
            <div className="p-3.5 rounded-xl bg-[#FFF8EB] border border-[#D4870E]/30 text-xs space-y-1.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#D4870E] flex items-center gap-1.5">
                  {aiSource === 'gemini' ? <Bot className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{aiSource === 'gemini' ? 'Gemini AI Inventory Analysis' : 'Inventory Health Assessment'}</span>
                </span>
                {aiItemsCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-[#EDF5EF] text-[#5A9A6B] px-2 py-0.5 rounded text-[10px] font-semibold border border-[#5A9A6B]/20 font-mono-financial">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>+{aiItemsCount} items added</span>
                  </span>
                )}
              </div>
              <p className="text-[#2D2D2D] leading-relaxed">{aiSummary}</p>
            </div>
          )}

          {/* Add New Item Form */}
          <form onSubmit={handleAddSubmit} className="bg-[#F0EBE3] border border-[#E0DAD1] rounded-xl p-3.5 sm:p-4 space-y-3 shadow-xs">
            <span className="text-xs font-semibold text-[#2D2D2D] block">
              Add Custom Item Request
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Enter item name..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="sm:col-span-2 bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-lg p-2.5 focus:outline-none focus:border-[#E8694A]"
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as ItemCategory)}
                className="bg-white border border-[#E0DAD1] text-[#2D2D2D] text-xs rounded-lg p-2.5 focus:outline-none focus:border-[#E8694A]"
              >
                <option value="Beverages">Beverages</option>
                <option value="Snacks">Snacks</option>
                <option value="Coffee & Tea">Coffee & Tea</option>
                <option value="Pantry & Fresh">Pantry & Fresh</option>
                <option value="Household">Household</option>
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <input
                type="number"
                step="0.50"
                placeholder="0.00"
                value={newEstCost}
                onChange={(e) => setNewEstCost(e.target.value)}
                className="bg-white border border-[#E0DAD1] text-[#2D2D2D] font-mono-financial placeholder-[#9A9A9A] text-xs rounded-lg p-2.5 focus:outline-none focus:border-[#E8694A]"
              />
              <input
                type="text"
                placeholder="Optional note or reason..."
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="sm:col-span-2 bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-lg p-2.5 focus:outline-none focus:border-[#E8694A]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 rounded-lg bg-white hover:bg-[#FAFAF8] text-[#2D2D2D] font-medium text-xs flex items-center justify-center gap-1.5 transition border border-[#E0DAD1] shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4 text-[#E8694A]" />
              <span>Add to Shopping List</span>
            </button>
          </form>

          {/* Shopping Items List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-[#2D2D2D]">
                Shopping Items ({poolShoppingItems.length})
              </span>
              {poolShoppingItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] font-medium text-[#C9553D] hover:underline flex items-center gap-1 cursor-pointer"
                  title="Remove all items from this shopping list"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Clear List</span>
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {poolShoppingItems.length === 0 ? (
                <div className="text-center py-8 text-[#6B6B6B] text-xs bg-[#FAFAF8] border border-dashed border-[#E0DAD1] rounded-xl p-6">
                  No items in shopping list. Add items above or click 'Generate Restock List' to evaluate inventory.
                </div>
              ) : (
                poolShoppingItems.map((item) => (
                  <div
                    key={item.id}
                    data-testid={`shopping-item-${item.id}`}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                      item.purchased
                        ? 'bg-[#EDF5EF] border-[#5A9A6B]/30 opacity-85'
                        : 'bg-white border-[#E0DAD1] shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onTogglePurchased(item.id)}
                        className={`h-5 w-5 rounded-md border flex items-center justify-center transition cursor-pointer ${
                          item.purchased
                            ? 'bg-[#5A9A6B] border-[#5A9A6B] text-white'
                            : 'border-[#E0DAD1] hover:border-[#E8694A] text-transparent'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                      </button>

                      <div>
                        <div className={`text-xs font-medium ${item.purchased ? 'line-through text-[#9A9A9A]' : 'text-[#2D2D2D]'}`}>
                          {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.itemName || (item as any).name}
                        </div>
                        {item.reason && (
                          <div className="text-[11px] text-[#6B6B6B]">{item.reason}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono-financial font-semibold text-xs text-[#5A9A6B]">
                        {pool.currency}{((Number(item.estimatedCost) || 0) * (Number(item.quantity) || 1)).toFixed(2)}
                      </span>
                      <button
                        onClick={() => onDeleteShoppingItem(item.id)}
                        className="text-[#9A9A9A] hover:text-[#C9553D] p-1 transition cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Sticky Footer */}
        <div className="px-5 py-3.5 border-t border-[#EDE8E0] bg-[#FAFAF8] flex items-center justify-between gap-3 shrink-0">
          <div>
            <span className="text-[11px] text-[#6B6B6B] block font-medium">Est. Total Cost</span>
            <span className="text-base sm:text-lg font-semibold font-mono-financial text-[#2D2D2D]">
              {pool.currency}{totalEstimatedCost.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-full bg-white hover:bg-[#F0EBE3] text-[#2D2D2D] border border-[#E0DAD1] text-xs font-medium transition cursor-pointer"
            >
              Close
            </button>

            <button
              onClick={handleRestockPurchased}
              disabled={!poolShoppingItems.some((i) => i.purchased)}
              className="px-4 py-2 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs flex items-center gap-2 shadow-xs transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ShoppingCart className="h-4 w-4" />
              <span>Restock Checked</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
