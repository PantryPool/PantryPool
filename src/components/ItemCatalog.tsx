import React, { useState, useMemo, useDeferredValue, useCallback } from 'react';
import { Item, ItemCategory, User } from '../types';
import { ItemCard } from './ItemCard';
import { Search, Filter, Plus, PackageX, Sparkles, Receipt } from 'lucide-react';

interface ItemCatalogProps {
  items: Item[];
  currency: string;
  activeUser: User;
  onConsumeItem: (item: Item) => void;
  onOpenEditItem: (item: Item) => void;
  onOpenQR: (item: Item) => void;
  onQuickRestock: (item: Item, addCount: number) => void;
  onOpenRestockItem?: (item: Item) => void;
  onOpenAddItem: () => void;
  onOpenReceiptScanner?: () => void;
  onDeleteItem?: (itemId: string) => void;
  onReportDiscrepancy?: (item: Item) => void;
  onOpenSettleUp?: () => void;
  isManager?: boolean;
}

const CATEGORIES: (ItemCategory | 'All')[] = [
  'All',
  'Beverages',
  'Snacks',
  'Coffee & Tea',
  'Pantry & Fresh',
  'Household',
];

export const ItemCatalog = React.memo<ItemCatalogProps>(({
  items,
  currency,
  activeUser,
  onConsumeItem,
  onOpenEditItem,
  onOpenQR,
  onQuickRestock,
  onOpenRestockItem,
  onOpenAddItem,
  onOpenReceiptScanner,
  onDeleteItem,
  onReportDiscrepancy,
  isManager = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);

  // Defer search term to keep keystrokes at 60fps without freezing input
  const deferredSearch = useDeferredValue(searchQuery);

  const showFilterToolbar = items.length >= 3;

  // Single-pass O(N) category count memoization
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: items.length };
    for (let i = 0; i < items.length; i++) {
      const cat = items[i].category;
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [items]);

  // Memoized filter items to prevent recomputing on unrelated parent re-renders
  const filteredItems = useMemo(() => {
    if (!showFilterToolbar) return items;
    const q = deferredSearch.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch = !q ||
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q));
      const matchesLowStock = !lowStockFilter || item.stock <= item.minStock;

      return matchesCategory && matchesSearch && matchesLowStock;
    });
  }, [items, showFilterToolbar, selectedCategory, deferredSearch, lowStockFilter]);

  // Stable delete handler to preserve ItemCard memoization
  const handleDeleteItemStable = useCallback((item: Item) => {
    if (onDeleteItem) onDeleteItem(item.id);
  }, [onDeleteItem]);

  return (
    <div className="space-y-4">
      
      {/* Search and Category Filters Header (Only shown when 3 or more items exist) */}
      {showFilterToolbar && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-xl p-2 sm:p-2.5 shadow-xs">
          
          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5 min-w-0 flex-1">
            {CATEGORIES.map((cat) => {
              const count = categoryCounts[cat] || 0;

              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                    selectedCategory === cat
                      ? 'bg-[#E8694A] text-white shadow-xs'
                      : 'bg-white text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9] border border-[#E0DAD1]'
                  }`}
                >
                  <span>{cat}</span>
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      selectedCategory === cat ? 'bg-white/20 text-white' : 'bg-[#F0EBE3] text-[#6B6B6B]'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search & Low Stock Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            
            <div className="relative flex-1 sm:w-44 md:w-52">
              <Search className="h-3.5 w-3.5 text-[#9A9A9A] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search pantry items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#E0DAD1] text-[#2D2D2D] placeholder-[#9A9A9A] text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A]"
              />
            </div>

            <button
              onClick={() => setLowStockFilter(!lowStockFilter)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
                lowStockFilter
                  ? 'bg-[#FFF8EB] text-[#D4870E] border-[#D4870E]/50 font-semibold'
                  : 'bg-white text-[#6B6B6B] border-[#E0DAD1] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
              }`}
              title="Filter by low stock"
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Low Stock</span>
            </button>

            <button
              onClick={onOpenAddItem}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white hover:bg-[#FAFAF8] text-[#E8694A] border border-[#E8694A]/30 text-xs font-medium shadow-xs transition cursor-pointer shrink-0"
              title="Add new pantry item"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Item</span>
            </button>

          </div>
        </div>
      )}

      {/* Small Catalog Action Bar (When < 3 items exist) */}
      {!showFilterToolbar && items.length > 0 && (
        <div className="flex items-center justify-end">
          <button
            onClick={onOpenAddItem}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-medium shadow-xs transition cursor-pointer"
            title="Add new pantry item"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Pantry Item</span>
          </button>
        </div>
      )}

      {/* Grid of Items */}
      {filteredItems.length === 0 ? (
        <div className="bg-white border border-[#E0DAD1] rounded-xl p-10 sm:p-12 text-center text-[#6B6B6B] space-y-3 shadow-xs">
          <div className="h-12 w-12 rounded-xl bg-[#F0EBE3] flex items-center justify-center mx-auto text-[#6B6B6B]">
            <PackageX className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-[#2D2D2D]">No items match your filter</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm mx-auto">
            {searchQuery || lowStockFilter || selectedCategory !== 'All'
              ? 'Try resetting your search query or category filter.'
              : 'This pantry pool is empty. Add your first item or scan a grocery receipt to start tracking!'}
          </p>
          {isManager && (
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                onClick={onOpenAddItem}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium text-xs shadow-xs transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Add Item</span>
              </button>
              {items.length === 0 && onOpenReceiptScanner && (
                <button
                  onClick={onOpenReceiptScanner}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-[#FAF8F5] border border-[#E0DAD1] text-[#2D2D2D] font-medium text-xs shadow-xs transition cursor-pointer"
                >
                  <Receipt className="h-4 w-4 text-[#E8694A]" />
                  <span>Scan Grocery Receipt</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
          {filteredItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              currency={currency}
              activeUser={activeUser}
              onConsume={onConsumeItem}
              onOpenEdit={isManager ? onOpenEditItem : undefined}
              onOpenQR={onOpenQR}
              onQuickRestock={onQuickRestock}
              onOpenRestock={onOpenRestockItem}
              onDelete={isManager && onDeleteItem ? handleDeleteItemStable : undefined}
              onReportDiscrepancy={onReportDiscrepancy}
            />
          ))}
        </div>
      )}

    </div>
  );
});

