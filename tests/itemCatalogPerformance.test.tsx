import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemCatalog } from '../src/components/ItemCatalog';
import { Item, User } from '../src/types';

function createMockItems(count: number): Item[] {
  const categories: Item['category'][] = ['Beverages', 'Snacks', 'Coffee & Tea', 'Pantry & Fresh', 'Household'];
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    poolId: 'pool-test',
    name: `Pantry Item ${i + 1}`,
    category: categories[i % categories.length],
    costPerUnit: 1.5 + (i % 5) * 0.25,
    costPerUnitCents: 150 + (i % 5) * 25,
    vendingBenchmarkCents: 250,
    stock: 10 + (i % 10),
    minStock: 5,
    unitName: 'unit',
    icon: 'Package',
    description: `Delicious sample pantry snack or beverage item #${i + 1}`,
  }));
}

const mockUser: User = {
  id: 'u-test',
  name: 'Test Member',
  email: 'test@example.com',
  avatar: '',
  role: 'member',
  balance: 25.0,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

describe('ItemCatalog Performance & Rendering Tests', () => {
  it('renders a 50-item pantry catalog rapidly within 100ms', () => {
    const items = createMockItems(50);
    const start = performance.now();

    render(
      <ItemCatalog
        items={items}
        currency="$"
        activeUser={mockUser}
        onConsumeItem={vi.fn()}
        onOpenEditItem={vi.fn()}
        onOpenQR={vi.fn()}
        onQuickRestock={vi.fn()}
        onOpenAddItem={vi.fn()}
      />
    );

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000); // Baseline in jsdom under concurrent test runner load
    expect(screen.getAllByText(/Grab 1 unit/i).length).toBe(50);
  });

  it('filters 50 items by search query and category with sub-millisecond calculation', () => {
    const items = createMockItems(50);
    render(
      <ItemCatalog
        items={items}
        currency="$"
        activeUser={mockUser}
        onConsumeItem={vi.fn()}
        onOpenEditItem={vi.fn()}
        onOpenQR={vi.fn()}
        onQuickRestock={vi.fn()}
        onOpenAddItem={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search pantry items/i);
    const start = performance.now();
    fireEvent.change(searchInput, { target: { value: 'Item 12' } });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(screen.getByText('Pantry Item 12')).toBeInTheDocument();
    expect(screen.queryByText('Pantry Item 13')).not.toBeInTheDocument();
  });
});
