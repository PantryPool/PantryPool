import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemQRCodeModal } from '../src/components/ItemQRCodeModal';
import { Item, Pool } from '../src/types';

describe('ItemQRCodeModal Shelf Tag & Poster Generator', () => {
  const mockClose = vi.fn();
  const mockPrint = vi.fn();

  const mockItem: Item = {
    id: 'item-espresso-123',
    poolId: 'pool-tech-hq',
    name: 'Nitro Cold Brew Espresso',
    category: 'Beverages',
    costPerUnit: 3.5,
    unitName: 'can',
    stock: 12,
    minStock: 4,
    icon: 'coffee',
  };

  const mockPool: Pool = {
    id: 'pool-tech-hq',
    name: 'Tech Haven Breakroom',
    description: 'Breakroom pool',
    code: 'HAVEN123',
    currency: '$',
    createdAt: new Date().toISOString(),
    championId: 'user-admin',
    category: 'Office',
    members: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.print = mockPrint;
  });

  it('renders modal with poster-aligned header, badge, item title, unit pill, and 3-step guide without hardcoded fluctuating prices', () => {
    render(
      <ItemQRCodeModal
        item={mockItem}
        pool={mockPool}
        onClose={mockClose}
      />
    );

    expect(screen.getByText(/Turnkey Shelf Tag & QR Generator/i)).toBeInTheDocument();
    expect(screen.getByText(/PantryPool Shelf QR Tag • Tech Haven Breakroom/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Nitro Cold Brew Espresso/i })).toBeInTheDocument();
    expect(screen.getByText(/Unit: can/i)).toBeInTheDocument();
    expect(screen.getByText(/Dynamic Price on Scan/i)).toBeInTheDocument();
    expect(screen.getByText(/SCAN & INSTANT LOG/i)).toBeInTheDocument();
    expect(screen.getByText(/How to Log in 3 Steps:/i)).toBeInTheDocument();
    expect(screen.getByText(/PantryPool • Communal Breakroom & Household Ledger Platform/i)).toBeInTheDocument();
  });

  it('toggles customizer drawer and allows editing item title and unit description', () => {
    render(
      <ItemQRCodeModal
        item={mockItem}
        pool={mockPool}
        onClose={mockClose}
      />
    );

    // Open Customizer
    const customizerBtn = screen.getByText(/⚙️ Customize Format/i);
    fireEvent.click(customizerBtn);

    expect(screen.getByText(/Printable Shelf Hardware & Label Presets/i)).toBeInTheDocument();

    // Edit Title
    const titleInput = screen.getByDisplayValue('Nitro Cold Brew Espresso');
    fireEvent.change(titleInput, { target: { value: 'Organic Nitro Cold Brew 12oz' } });

    // Edit Unit
    const unitInput = screen.getByDisplayValue('can');
    fireEvent.change(unitInput, { target: { value: 'bottle' } });

    // Verify updated title and unit in poster preview
    expect(screen.getByRole('heading', { name: /Organic Nitro Cold Brew 12oz/i })).toBeInTheDocument();
    expect(screen.getByText(/Unit: bottle/i)).toBeInTheDocument();
  });

  it('switches between format presets: Shelf Channel Tag and Multi-Tag Sheet', () => {
    render(
      <ItemQRCodeModal
        item={mockItem}
        pool={mockPool}
        onClose={mockClose}
      />
    );

    fireEvent.click(screen.getByText(/⚙️ Customize Format/i));
    const formatSelect = screen.getByDisplayValue(/Acrylic Stand/i);

    // Switch to Shelf Channel Tag
    fireEvent.change(formatSelect, { target: { value: 'shelf_tag_single' } });
    expect(screen.getByText(/Tech Haven Breakroom Shelf Tag/i)).toBeInTheDocument();
    expect(screen.getByText(/Scan QR code with phone camera or app scanner to log consumption/i)).toBeInTheDocument();

    // Switch to 6-up Sheet
    fireEvent.change(formatSelect, { target: { value: 'sheet_6up' } });
    expect(screen.getByText(/Multi-Tag Shelf Sheet \(6-up Grid\)/i)).toBeInTheDocument();
    // 6-up sheet shows item category (not cryptic TAG # numbers)
    expect(screen.getAllByText(mockItem.category).length).toBeGreaterThanOrEqual(6);
  });

  it('triggers window.print when clicking Print Shelf Tag button', () => {
    render(
      <ItemQRCodeModal
        item={mockItem}
        pool={mockPool}
        onClose={mockClose}
      />
    );

    const printButton = screen.getByRole('button', { name: /Print Shelf Tag/i });
    fireEvent.click(printButton);

    expect(mockPrint).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking close button', () => {
    render(
      <ItemQRCodeModal
        item={mockItem}
        pool={mockPool}
        onClose={mockClose}
      />
    );

    const closeButton = screen.getByTitle(/Close modal/i);
    fireEvent.click(closeButton);

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
