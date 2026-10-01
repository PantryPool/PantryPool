import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  callTypeSafeSystemOne,
  classifyGroceryItemsWithTypeSafe,
  matchCatalogItemWithTypeSafe,
  resolveItemTaxabilityWithTypeSafe
} from '../src/server/services/typesafeService';

describe('TypeSafe AI System One Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null immediately when API key is missing or invalid placeholder', async () => {
    const res1 = await callTypeSafeSystemOne({
      apiKey: '',
      state: 'test',
      questions: {}
    });
    expect(res1).toBeNull();

    const res2 = await callTypeSafeSystemOne({
      apiKey: 'PLACEHOLDER_KEY',
      state: 'test',
      questions: {}
    });
    expect(res2).toBeNull();
  });

  it('correctly executes System One API call and returns typed answers', async () => {
    const mockResponse = {
      model: 'jev-1.13.0',
      answers: {
        cat_0: {
          type: 'choice',
          choice: 'Beverages',
          confidence: 0.98,
          probabilities: { Beverages: 0.98, Snacks: 0.02 }
        },
        is_item_0: {
          type: 'noul',
          noul: 0.95
        }
      },
      usage: { input_tokens: 150, output_tokens: 30 }
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as any);

    const items = [
      { name: 'San Pellegrino Sparkling Water', category: 'General', quantity: 6, costPerUnit: 1.5, totalCost: 9 }
    ];

    const result = await classifyGroceryItemsWithTypeSafe(items, 'apikey_valid_test_key_1234567890');
    expect(result.usedTypeSafe).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].category).toBe('Beverages');
    expect(result.items[0].confidence).toBe(0.98);
  });

  it('filters out non-grocery lines such as sales tax or bottle deposit fees', async () => {
    const mockResponse = {
      model: 'jev-1.13.0',
      answers: {
        cat_0: { type: 'choice', choice: 'Snacks', confidence: 0.9 },
        is_item_0: { type: 'noul', noul: 0.95 },
        cat_1: { type: 'choice', choice: 'Household', confidence: 0.4 },
        is_item_1: { type: 'noul', noul: 0.05 } // Not a grocery item (e.g. bottle deposit or tax)
      }
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as any);

    const items = [
      { name: 'Kettle Cooked Jalapeno Chips', category: 'Snacks', quantity: 2, costPerUnit: 3.5, totalCost: 7 },
      { name: 'CRV Bottle Deposit Fee', category: 'General', quantity: 1, costPerUnit: 0.5, totalCost: 0.5 }
    ];

    const result = await classifyGroceryItemsWithTypeSafe(items, 'apikey_valid_test_key_1234567890');
    expect(result.usedTypeSafe).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe('Kettle Cooked Jalapeno Chips');
  });

  it('matches restock item against existing pantry catalog items', async () => {
    const mockResponse = {
      model: 'jev-1.13.0',
      answers: {
        match: {
          type: 'choice',
          choice: 'item_coke_zero_12',
          confidence: 0.94,
          probabilities: { item_coke_zero_12: 0.94, none: 0.06 }
        }
      }
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as any);

    const existingItems = [
      { id: 'item_cold_brew', name: 'Stumptown Cold Brew', category: 'Coffee & Tea' },
      { id: 'item_coke_zero_12', name: 'Coca-Cola Zero Sugar 12oz Cans', category: 'Beverages' },
      { id: 'item_almonds', name: 'Blue Diamond Roasted Almonds', category: 'Snacks' }
    ];

    const match = await matchCatalogItemWithTypeSafe(
      'Coke Zero 12-pack cans',
      existingItems,
      'apikey_valid_test_key_1234567890'
    );

    expect(match.matchedItemId).toBe('item_coke_zero_12');
    expect(match.confidence).toBe(0.94);
  });

  it('gracefully returns fallback on network timeout or failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network connection timeout'));

    const items = [
      { name: 'Granola Bars', category: 'Snacks', quantity: 5, costPerUnit: 1, totalCost: 5 }
    ];

    const result = await classifyGroceryItemsWithTypeSafe(items, 'apikey_valid_test_key_1234567890');
    expect(result.usedTypeSafe).toBe(false);
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe('Granola Bars');
  });

  it('determines item taxability using TypeSafe choice evaluation', async () => {
    const mockResponse = {
      model: 'jev-1.13.0',
      answers: {
        tax_0: {
          type: 'choice',
          choice: 'taxed',
          confidence: 0.96
        },
        tax_1: {
          type: 'choice',
          choice: 'exempt',
          confidence: 0.99
        }
      }
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as any);

    const items = [
      { name: 'Disinfectant Wipes', category: 'Household', quantity: 2, costPerUnit: 4.5, totalCost: 9.0 },
      { name: 'Organic Gala Apples', category: 'Pantry & Fresh', quantity: 6, costPerUnit: 1.0, totalCost: 6.0 }
    ];

    const result = await resolveItemTaxabilityWithTypeSafe(items, 'apikey_valid_test_key_1234567890');
    expect(result.usedTypeSafe).toBe(true);
    expect(result.items[0].isTaxed).toBe(true);
    expect(result.items[1].isTaxed).toBe(false);
  });
});
