import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupBarcode } from '../src/lib/barcodeLookup';

describe('🔍 Global Barcode Lookup Engine (Phase 34)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null for invalid or too-short barcodes', async () => {
    const res = await lookupBarcode('123');
    expect(res).toBeNull();
  });

  it('should resolve and normalize product from Edge API endpoint', async () => {
    const mockProduct = {
      name: 'LaCroix Sparkling Water Lime (LaCroix)',
      brand: 'LaCroix',
      category: 'Beverages',
      imageUrl: 'https://images.openfoodfacts.org/lime.jpg',
      servingSize: '355ml',
      isGlutenFree: true,
      isVegan: true,
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        found: true,
        product: mockProduct,
      }),
    } as any);

    const result = await lookupBarcode('012000001291');
    expect(result).not.toBeNull();
    expect(result?.name).toContain('LaCroix');
    expect(result?.category).toBe('Beverages');
    expect(result?.isGlutenFree).toBe(true);
  });

  it('should fallback to Open Food Facts v2 API if Edge endpoint fails', async () => {
    // 1st call (Edge API) fails
    // 2nd call (Open Food Facts v2) succeeds
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Edge lookup 404'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: 'Dark Chocolate Almonds',
            brands: "Trader Joe's",
            categories_tags: ['en:snacks', 'en:chocolates'],
            labels_tags: ['en:vegan', 'en:gluten-free'],
            serving_size: '30g',
          },
        }),
      } as any);

    const result = await lookupBarcode('009988776655');
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Dark Chocolate Almonds (Trader Joe's)");
    expect(result?.category).toBe('Snacks');
    expect(result?.isVegan).toBe(true);
  });

  it('should infer appropriate unit and icon based on product title and category', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Edge lookup 404'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: 'Sparkling Water Lime Can',
            brands: 'Bubly',
            categories_tags: ['en:beverages', 'en:waters', 'en:sodas'],
            packaging: '12 can pack',
            serving_size: '355 ml',
          },
        }),
      } as any);

    const result = await lookupBarcode('012000162541');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Sparkling Water Lime Can (Bubly)');
    expect(result?.category).toBe('Beverages');
    expect(result?.suggestedUnit).toBe('can');
    expect(result?.suggestedIcon).toBe('CupSoda');
  });

  it('should fallback to 13-digit EAN if 12-digit UPC is not found directly', async () => {
    // 1st call: Edge API -> fails
    // 2nd call: 12-digit direct OFF -> status 0 (not found)
    // 3rd call: 13-digit with leading 0 OFF -> status 1 (found)
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Edge lookup 404'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 0 }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 1,
          product: {
            product_name: 'Classic Potato Chips',
            brands: "Lay's",
            categories_tags: ['en:snacks', 'en:chips'],
            serving_size: '28g',
          },
        }),
      } as any);

    const result = await lookupBarcode('028400043809');
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Classic Potato Chips (Lay's)");
    expect(result?.suggestedUnit).toBe('bag');
    expect(result?.category).toBe('Snacks');
  });
});

