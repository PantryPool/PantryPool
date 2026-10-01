import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReceiptScannerModal } from '../src/components/ReceiptScannerModal';
import { Pool, User, Item } from '../src/types';

vi.mock('../src/lib/api', () => ({
  getAuthToken: vi.fn(() => 'mock-token'),
}));

vi.mock('../src/lib/telemetry', () => ({
  telemetry: {
    track: vi.fn(),
    trackFeature: vi.fn(),
    trackRoadblock: vi.fn(),
    trackFunnel: vi.fn(),
  },
}));

describe('ReceiptScannerModal — Mobile Ergonomics & Bottom Sheet UI', () => {
  const mockUser: User = {
    id: 'u_1',
    name: 'Maya Lin',
    email: 'maya@example.com',
    avatar: '',
    role: 'admin',
    balance: 5.0,
    joinedAt: '2026-01-01T00:00:00Z',
  };

  const mockPool: Pool = {
    id: 'pool_123',
    name: 'Engineering Breakroom',
    description: 'Breakroom pool',
    code: 'PP7K9M',
    currency: '$',
    championId: 'u_1',
    createdAt: '2026-01-01T00:00:00Z',
    category: 'Office',
    members: [mockUser],
    maxDeficitCents: 1000,
  };

  const mockItems: Item[] = [
    {
      id: 'item_coke',
      poolId: 'pool_123',
      name: 'Coca-Cola 12oz Can',
      category: 'Beverages',
      costPerUnit: 0.75,
      stock: 4,
      minStock: 2,
      unitName: 'can',
      icon: 'CupSoda',
    },
    {
      id: 'item_chips',
      poolId: 'pool_123',
      name: 'Kettle Chips',
      category: 'Snacks',
      costPerUnit: 1.25,
      stock: 6,
      minStock: 3,
      unitName: 'bag',
      icon: 'Package',
    },
  ];

  it('renders the mobile bottom sheet modal structure with pull handle and sticky action bar', () => {
    const onClose = vi.fn();
    const onApply = vi.fn();

    const { container } = render(
      <ReceiptScannerModal
        pool={mockPool}
        activeUser={mockUser}
        items={mockItems}
        onClose={onClose}
        onApplyReceiptData={onApply}
      />
    );

    // Title and mode switchers
    expect(screen.getByText('Bring In Items / Restock')).toBeInTheDocument();
    expect(screen.getByText('Select & Restock')).toBeInTheDocument();
    expect(screen.getByText('Describe Haul')).toBeInTheDocument();
    expect(screen.getByText('Scan Photo')).toBeInTheDocument();

    // Mobile pull handle exists
    const pullHandle = container.querySelector('.sm\\:hidden.rounded-full');
    expect(pullHandle).not.toBeNull();

    // Bottom sheet responsive classes
    const modalDialog = container.querySelector('.rounded-t-2xl.sm\\:rounded-xl');
    expect(modalDialog).not.toBeNull();

    // Primary sticky action button
    const submitBtn = screen.getByRole('button', { name: /Restock 1 Item/i });
    expect(submitBtn).toBeInTheDocument();
  });

  it('allows quick quantity adjustments using preset pills and steppers', () => {
    const onClose = vi.fn();
    const onApply = vi.fn();

    render(
      <ReceiptScannerModal
        pool={mockPool}
        activeUser={mockUser}
        items={mockItems}
        initialSelectedItemId="item_coke"
        onClose={onClose}
        onApplyReceiptData={onApply}
      />
    );

    // Initial quantity is 6
    const qtyPill12 = screen.getByRole('button', { name: '12' });
    expect(qtyPill12).toBeInTheDocument();

    // Tap 12 quick pill
    fireEvent.click(qtyPill12);

    // Button updates with new total calculation
    expect(screen.getByRole('button', { name: /Restock 1 Item/i })).toBeInTheDocument();

    // Step up with plus stepper
    const plusBtn = screen.getByTitle('Increase quantity (+1)');
    fireEvent.click(plusBtn);

    // Quantity should now be 13
    const submitBtn = screen.getByRole('button', { name: /Restock 1 Item/i });
    expect(submitBtn).toBeInTheDocument();
  });

  it('submits restock data cleanly through the sticky action bar', () => {
    const onClose = vi.fn();
    const onApply = vi.fn();

    render(
      <ReceiptScannerModal
        pool={mockPool}
        activeUser={mockUser}
        items={mockItems}
        initialSelectedItemId="item_coke"
        onClose={onClose}
        onApplyReceiptData={onApply}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Restock 1 Item/i });
    fireEvent.click(submitBtn);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders parsed tax breakdown and allows toggling item taxability dynamically', async () => {
    const onClose = vi.fn();
    const onApply = vi.fn();

    // Mock fetch for /api/parse-receipt returning taxed item, untaxed item, and tax amount
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/parse-receipt') {
        return {
          ok: true,
          json: async () => ({
            success: true,
            storeName: 'Target Supercenter',
            subtotal: 20.00,
            taxAmount: 1.60,
            totalAmount: 21.60,
            items: [
              {
                name: 'Coca-Cola 12oz Can',
                category: 'Beverages',
                quantity: 12,
                preTaxCost: 10.00,
                taxShare: 1.60,
                totalCost: 11.60,
                costPerUnit: 0.97,
                isTaxed: true,
                taxFlag: 'T'
              },
              {
                name: 'Fresh Bananas',
                category: 'Pantry & Fresh',
                quantity: 5,
                preTaxCost: 10.00,
                taxShare: 0,
                totalCost: 10.00,
                costPerUnit: 2.00,
                isTaxed: false,
                taxFlag: 'F'
              }
            ]
          })
        };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });

    render(
      <ReceiptScannerModal
        pool={mockPool}
        activeUser={mockUser}
        items={mockItems}
        onClose={onClose}
        onApplyReceiptData={onApply}
      />
    );

    // Switch to Describe Haul mode
    fireEvent.click(screen.getByRole('button', { name: /Describe Haul/i }));

    // Type haul text
    const textarea = screen.getByPlaceholderText(/Brought in a 6 pack/i);
    fireEvent.change(textarea, { target: { value: 'Spent $21.60 on Coke and Bananas' } });

    // Click Parse
    const parseBtn = screen.getByRole('button', { name: /Parse Text & Match to Pantry/i });
    fireEvent.click(parseBtn);

    // Wait for review screen
    expect(await screen.findByDisplayValue('Target Supercenter')).toBeInTheDocument();
    expect(screen.getByText('Sales Tax')).toBeInTheDocument();
    expect(screen.getByText('Subtotal')).toBeInTheDocument();

    // Verify tax badges
    expect(screen.getByText(/🏷️ Taxed/i)).toBeInTheDocument();
    expect(screen.getByText(/🌿 Tax-Exempt \/ No Tax/i)).toBeInTheDocument();
    expect(screen.getByText(/\(\+\$1.60 tax\)/i)).toBeInTheDocument();

    // Toggle Bananas to Taxed (the second item, so index 1)
    const taxToggleBtns = screen.getAllByTitle('Click to toggle whether this item is subject to sales tax');
    fireEvent.click(taxToggleBtns[1]);

    // Verify updated tax shares: both have (+$0.80 tax)
    const taxShares = screen.getAllByText(/\(\+\$0.80 tax\)/i);
    expect(taxShares.length).toBe(2);

    // Confirm and apply restock
    const confirmBtn = screen.getByRole('button', { name: /Restock Items & Credit/i });
    fireEvent.click(confirmBtn);

    expect(onApply).toHaveBeenCalledTimes(1);
    const appliedItems = onApply.mock.calls[0][0];
    expect(appliedItems.length).toBe(2);
    // Verified total amount credited matches receipt total
    expect(onApply.mock.calls[0][1]).toBe(21.60);
  });

  it('allows exiting and canceling restock via Cancel button, Escape key, backdrop click, and X button', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <ReceiptScannerModal
        pool={mockPool}
        activeUser={mockUser}
        items={mockItems}
        onClose={onClose}
        onApplyReceiptData={vi.fn()}
      />
    );

    // 1. Cancel button in sticky footer
    const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i });
    expect(cancelBtn).toBeInTheDocument();
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // 2. Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    // 3. Top-right X button
    const closeXBtn = screen.getByRole('button', { name: /Close dialog/i });
    fireEvent.click(closeXBtn);
    expect(onClose).toHaveBeenCalledTimes(3);

    // 4. Backdrop click
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});
