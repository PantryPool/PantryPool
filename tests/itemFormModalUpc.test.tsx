import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ItemFormModal } from '../src/components/ItemFormModal';
import { Pool } from '../src/types';
import * as barcodeLib from '../src/lib/barcodeLookup';

const mockPool: Pool = {
  id: 'pool_test_1',
  name: 'Breakroom Pool',
  description: 'Main breakroom',
  category: 'Office',
  currency: '$',
  code: 'BREAK123',
  championId: 'u_test',
  createdAt: '2026-01-01',
  members: [],
  savingsEnabled: true,
  metroTier: 'standard',
};

describe('ItemFormModal - UPC Barcode Scanner & Auto-Lookup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders UPC Barcode option and Scan UPC button in consumable creation modal', () => {
    render(
      <ItemFormModal
        pool={mockPool}
        onClose={vi.fn()}
        onSaveItem={vi.fn()}
      />
    );

    // Label and placeholder
    expect(screen.getByText(/UPC Barcode \/ QR Code \(Optional\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. 012000001291/i)).toBeInTheDocument();

    // Scan UPC button
    const scanBtn = screen.getByRole('button', { name: /Scan UPC/i });
    expect(scanBtn).toBeInTheDocument();

    // Auto-Lookup button
    expect(screen.getByRole('button', { name: /Auto-Lookup/i })).toBeInTheDocument();
  });

  it('opens UpcScannerModal when Scan UPC button is clicked', async () => {
    render(
      <ItemFormModal
        pool={mockPool}
        onClose={vi.fn()}
        onSaveItem={vi.fn()}
      />
    );

    const scanBtn = screen.getByRole('button', { name: /Scan UPC/i });
    fireEvent.click(scanBtn);

    // Scanner modal header should appear
    expect(await screen.findByText(/Scan Product Barcode \/ UPC/i)).toBeInTheDocument();
    expect(screen.getByText(/Point camera at any retail UPC, barcode, or QR code/i)).toBeInTheDocument();

    // Quick test samples should be present
    expect(screen.getByText(/Quick Sample UPCs/i)).toBeInTheDocument();
    expect(screen.getByText(/049000028904/i)).toBeInTheDocument();
  });

  it('auto-fills item details when UPC is looked up', async () => {
    const lookupSpy = vi.spyOn(barcodeLib, 'lookupBarcode').mockResolvedValueOnce({
      barcode: '012000001291',
      name: 'LaCroix Sparkling Water Lime',
      brand: 'LaCroix',
      category: 'Beverages',
      suggestedUnit: 'can',
      suggestedIcon: 'CupSoda',
      servingSize: '12 fl oz',
    });

    render(
      <ItemFormModal
        pool={mockPool}
        onClose={vi.fn()}
        onSaveItem={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/e\.g\. 012000001291/i);
    fireEvent.change(input, { target: { value: '012000001291' } });

    const lookupBtn = screen.getByRole('button', { name: /Auto-Lookup/i });
    fireEvent.click(lookupBtn);

    await waitFor(() => {
      expect(lookupSpy).toHaveBeenCalledWith('012000001291');
      // Item Name input should be populated
      const nameInput = screen.getByPlaceholderText(/e\.g\. LaCroix Sparkling Water/i) as HTMLInputElement;
      expect(nameInput.value).toBe('LaCroix Sparkling Water Lime');
    });

    // Category should be Beverages
    const categorySelect = screen.getByDisplayValue('Beverages');
    expect(categorySelect).toBeInTheDocument();

    // Unit should be 'can'
    const unitInput = screen.getByDisplayValue('can');
    expect(unitInput).toBeInTheDocument();

    // Success banner
    expect(await screen.findByText(/Auto-populated details for/i)).toBeInTheDocument();
  });

  it('populates and saves item with barcode upon form submission', async () => {
    const handleSave = vi.fn();

    render(
      <ItemFormModal
        pool={mockPool}
        onClose={vi.fn()}
        onSaveItem={handleSave}
      />
    );

    // Enter barcode
    const barcodeInput = screen.getByPlaceholderText(/e\.g\. 012000001291/i);
    fireEvent.change(barcodeInput, { target: { value: '049000028904' } });

    // Enter name
    const nameInput = screen.getByPlaceholderText(/e\.g\. LaCroix Sparkling Water/i);
    fireEvent.change(nameInput, { target: { value: 'Coca-Cola Classic' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Create Item Entry/i });
    fireEvent.click(submitBtn);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Coca-Cola Classic',
        barcode: '049000028904',
      }),
      undefined,
      expect.any(Number)
    );
  });
});
