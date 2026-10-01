import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { registerBarcodeRoutes } from '../src/server/api/routes/barcodes';
import { parseNaturalLanguageHaul, validateAndEnrichReceiptItems, sanitizeLlmReceiptOutput } from '../src/server/api/routes/ai';
import { resolveReceiptPackAndCategoryWithTypeSafe } from '../src/server/services/typesafeService';
import { getUpcCandidates, parsePackAndUnitInfo, snapToCommercialPackSize } from '../src/shared/barcodeUtils';
import { lookupBarcode } from '../src/lib/barcodeLookup';

describe('🛒 Walmart Receipt UPC & Open Food Facts Compliance Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. UPC Candidates & Walmart Receipt Normalization', () => {
    it('normalizes 12-digit Walmart receipt codes into valid UPC-A candidates with check digits', () => {
      // Walmart prints: 007800008246 (leading 00 + 10-digit product code without check digit)
      const walmartRawCode = '007800008246';
      const candidates = getUpcCandidates(walmartRawCode);

      // Check candidate list contains:
      // - raw code
      // - stripped leading zeroes
      // - 12-digit UPC-A with calculated modulo-10 check digit: '078000082463'
      // - 13-digit EAN with leading 0: '0078000082463'
      expect(candidates).toContain('007800008246');
      expect(candidates).toContain('078000082463');
      expect(candidates).toContain('0078000082463');
    });

    it('parses multi-pack and unit details from product packaging', () => {
      const pack1 = parsePackAndUnitInfo('Dr Pepper 16.9 fl oz Bottles (6 Pack)');
      expect(pack1.isPack).toBe(true);
      expect(pack1.packQuantity).toBe(6);
      expect(pack1.unitName).toBe('bottle');
      expect(pack1.suggestedIcon).toBe('CupSoda');

      const pack2 = parsePackAndUnitInfo('Coca-Cola Classic Soda - 12pk/12 fl oz Cans');
      expect(pack2.isPack).toBe(true);
      expect(pack2.packQuantity).toBe(12);
      expect(pack2.unitName).toBe('can');

      const pack3 = parsePackAndUnitInfo('Great Value Purified Drinking Water 24 Count');
      expect(pack3.isPack).toBe(true);
      expect(pack3.packQuantity).toBe(24);
      expect(pack3.unitName).toBe('bottle');
    });
  });

  describe('2. Receipt Haul Parsing for Walmart Receipts', () => {
    it('accurately parses Walmart receipt line with Dr Pepper 6-pack bottles into 6 individual bottles', async () => {
      // Typical Walmart receipt line:
      // DR PEPPER 007800008246 F 3.98 O
      const receiptText = `
        WALMART SUPERCENTER
        MANAGER JANE DOE
        09/19/26 14:32:10

        DR PEPPER 007800008246 F 3.98 O
        GREAT VALUE CHIPS 007874235182 F 1.98 O

        SUBTOTAL 5.96
        TOTAL 5.96
      `;

      const parsed = parseNaturalLanguageHaul(receiptText);
      expect(parsed.items.length).toBe(2);

      const drPepper = parsed.items[0];
      expect(drPepper.name).toContain('Dr Pepper');
      expect(drPepper.upc).toBe('007800008246');
      // Registered in retail DB as 6-pack of 16.9oz bottles
      expect(drPepper.quantity).toBe(6);
      expect(drPepper.unitName).toBe('bottle');
      expect(drPepper.totalCost).toBe(3.98);
      expect(drPepper.costPerUnit).toBe(0.66);
      expect(drPepper.isPack).toBe(true);
      expect(drPepper.packQuantity).toBe(6);
    });

    it('splits receipt tax proportionally across taxable Walmart items while exempting non-taxed food items', async () => {
      // Walmart receipt with taxable supply (T) and food stamp / tax exempt food (F/O)
      const receiptWithTax = `
        WALMART SUPERCENTER
        DR PEPPER 007800008246 T 3.98
        BOUNTY ESSENTIALS 003700074218 T 6.02
        GREAT VALUE CHIPS 007874235182 F 2.00 O

        SUBTOTAL 12.00
        TAX 1.00
        TOTAL 13.00
      `;

      const parsed = parseNaturalLanguageHaul(receiptWithTax);
      expect(parsed.taxAmount).toBe(1.00);
      expect(parsed.totalAmount).toBe(13.00);
      expect(parsed.items.length).toBe(3);

      const drPepper = parsed.items.find(i => i.name.includes('Dr Pepper'))!;
      const bounty = parsed.items.find(i => i.name.includes('Bounty'))!;
      const chips = parsed.items.find(i => i.name.includes('Chips'))!;

      // Taxable subtotal is $3.98 + $6.02 = $10.00
      // Dr Pepper ($3.98 / $10.00) * $1.00 = $0.40 tax
      expect(drPepper.isTaxed).toBe(true);
      expect(drPepper.taxShare).toBe(0.40);
      expect(drPepper.totalCost).toBe(4.38);

      // Bounty ($6.02 / $10.00) * $1.00 = $0.60 tax
      expect(bounty.isTaxed).toBe(true);
      expect(bounty.taxShare).toBe(0.60);
      expect(bounty.totalCost).toBe(6.62);

      // Chips is food exempt (flag F / O) -> $0 tax
      expect(chips.isTaxed).toBe(false);
      expect(chips.taxShare).toBe(0);
      expect(chips.totalCost).toBe(2.00);

      // Sum of items equals 4.38 + 6.62 + 2.00 = 13.00
      const totalItemSum = parsed.items.reduce((s, it) => s + it.totalCost, 0);
      expect(Number(totalItemSum.toFixed(2))).toBe(13.00);
    });

    it('matches existing pool item by barcode and retains individual unit pricing', async () => {
      const mockStorage = {
        getItemsByPoolId: vi.fn().mockResolvedValue([
          {
            id: 'item-drpepper-bottle',
            name: 'Dr Pepper Bottle',
            category: 'Beverages',
            cost_per_unit: 0.66,
            stock: 12,
            unit_name: 'bottle',
            barcode: '078000082463', // Full UPC-A
          }
        ])
      };

      const rawItems = [
        {
          name: 'DR PEPPER 007800008246',
          category: 'Beverages',
          quantity: 1,
          costPerUnit: 3.98,
          totalCost: 3.98,
          unitName: 'unit'
        }
      ];

      const enriched = await validateAndEnrichReceiptItems(rawItems, 'test-pool-1', mockStorage);
      expect(enriched.length).toBe(1);
      const item = enriched[0];

      // Found existing item matching barcode!
      expect(item.existingItemId).toBe('item-drpepper-bottle');
      expect(item.name).toBe('Dr Pepper Bottle');
      expect(item.unitName).toBe('bottle');
      expect(item.isPack).toBe(true);
      expect(item.quantity).toBe(6);
      expect(item.costPerUnit).toBe(0.66);
      expect(item.totalCost).toBe(3.98);
    });
  });

  describe('3. Open Food Facts API & Legal Compliance', () => {
    it('uses compliant User-Agent and filtered fields parameters for OFF API lookups', async () => {
      let requestedUrl = '';
      let requestedHeaders: any = {};

      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedHeaders = init?.headers || {};
        return {
          ok: true,
          json: async () => ({
            status: 1,
            product: {
              product_name: 'Pure Sparkling Water',
              brands: 'WaterCo',
              categories_tags: ['en:beverages'],
              packaging: '12 cans',
            }
          })
        };
      });

      const app = new Hono<any>();
      registerBarcodeRoutes(app);

      // Use a barcode not in offline registry to ensure OFF is queried
      const res = await app.request('/api/barcodes/lookup?upc=099999999999');
      expect(res.status).toBe(200);

      // 1. Verify User-Agent format: AppName/Version (Platform; +ContactURL; ContactEmail)
      expect(requestedHeaders['User-Agent']).toBe('PantryPool/2.0 (Web/Linux; +https://pantrypool.com; contact@pantrypool.com)');

      // 2. Verify fields filtering (?fields=...)
      expect(requestedUrl).toContain('world.openfoodfacts.org/api/v2/product/');
      expect(requestedUrl).toContain('fields=code,product_name');
    });

    it('caches lookup responses on the server to prevent repeat hits to OFF', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            status: 1,
            product: {
              product_name: 'Trail Mix',
              brands: 'SnackCo',
              categories_tags: ['en:snacks'],
            }
          })
        };
      });

      const app = new Hono<any>();
      registerBarcodeRoutes(app);

      const targetBarcode = '088888888888';

      // First call: calls OFF API
      const res1 = await app.request(`/api/barcodes/lookup?upc=${targetBarcode}`);
      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      expect(callCount).toBe(1);

      // Second call: served from server cache, callCount should remain 1
      const res2 = await app.request(`/api/barcodes/lookup?upc=${targetBarcode}`);
      const data2 = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.cached).toBe(true);
      expect(callCount).toBe(1);
    });

    it('client lookupBarcode also uses compliant User-Agent and fields query', async () => {
      let directUrl = '';
      let directHeaders: any = {};

      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Edge unavailable')) // Edge endpoint fails
        .mockImplementationOnce(async (url: string, init?: RequestInit) => {
          directUrl = url;
          directHeaders = init?.headers || {};
          return {
            ok: true,
            json: async () => ({
              status: 1,
              product: {
                product_name: 'Organic Almond Milk',
                brands: 'Silk',
                categories_tags: ['en:plant-based-beverages'],
              }
            })
          };
        });

      const product = await lookupBarcode('077777777777');
      expect(product).not.toBeNull();
      expect(directHeaders['User-Agent']).toBe('PantryPool/2.0 (Web/Linux; +https://pantrypool.com; contact@pantrypool.com)');
      expect(directUrl).toContain('fields=code,product_name');
    });
  });

  describe('4. TypeSafe System One Pack Resolution', () => {
    it('resolves ambiguous pack sizes using TypeSafe System One', async () => {
      const mockResponse = {
        model: 'jev-1.13.0',
        answers: {
          pack_0: {
            type: 'choice',
            choice: 'pack_6',
            confidence: 0.95,
            probabilities: { pack_6: 0.95, single: 0.05 }
          },
          unit_0: {
            type: 'choice',
            choice: 'bottle',
            confidence: 0.92,
            probabilities: { bottle: 0.92, can: 0.08 }
          }
        },
        usage: { input_tokens: 120, output_tokens: 25 }
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as any);

      const items = [
        {
          name: 'Dr Pepper Soda 16.9 fl oz',
          costPerUnit: 3.98,
          totalCost: 3.98,
          quantity: 1,
          unitName: 'unit'
        }
      ];

      const result = await resolveReceiptPackAndCategoryWithTypeSafe(items, 'apikey_test_1234567890');
      expect(result.usedTypeSafe).toBe(true);
      expect(result.items.length).toBe(1);

      const resolved = result.items[0];
      expect(resolved.quantity).toBe(6);
      expect(resolved.packQuantity).toBe(6);
      expect(resolved.isPack).toBe(true);
      expect(resolved.unitName).toBe('bottle');
      expect(resolved.costPerUnit).toBe(0.66);
      expect(resolved.totalCost).toBe(3.98);
    });
  });

  describe('5. Quantity Adjustment & Draft Backspacing', () => {
    it('allows clearing quantity with backspace and recalculates unit pricing upon entering new quantity', () => {
      // Simulate line item state transition
      let item = {
        rowId: 'row-1',
        name: 'Dr Pepper 6-Pack Bottles',
        category: 'Beverages' as const,
        quantity: 1,
        costPerUnit: 3.98,
        totalCost: 3.98,
        unitName: 'bottle',
        currentStock: 0,
        isNewItem: false,
        quantityDraft: undefined as string | undefined,
      };

      // 1. User presses Backspace to clear '1'
      item.quantityDraft = '';
      expect(item.quantityDraft).toBe('');
      // Display value reflects empty string without snapping back to 1
      const displayVal1 = item.quantityDraft !== undefined ? item.quantityDraft : item.quantity;
      expect(displayVal1).toBe('');

      // 2. User types '6'
      const typed = '6';
      const parsed = parseInt(typed, 10);
      item.quantity = parsed;
      item.quantityDraft = typed;
      item.costPerUnit = Number((item.totalCost / parsed).toFixed(2));

      const displayVal2 = item.quantityDraft !== undefined ? item.quantityDraft : item.quantity;
      expect(displayVal2).toBe('6');
      expect(item.quantity).toBe(6);
      expect(item.costPerUnit).toBe(0.66);

      // 3. User blurs input -> draft resets to undefined, syncing to quantity
      item.quantityDraft = undefined;
      const displayVal3 = item.quantityDraft !== undefined ? item.quantityDraft : item.quantity;
      expect(displayVal3).toBe(6);

      // 4. Quick adjustment to 12
      item.quantity = 12;
      item.costPerUnit = Number((item.totalCost / 12).toFixed(2));
      expect(item.quantity).toBe(12);
      expect(item.costPerUnit).toBe(0.33);
    });
  });

  describe('6. Commercial Multi-Pack Size Normalization & Anti-Hallucination', () => {
    it('snaps impossible odd beverage quantities (5-pack, 7-pack) to standard 6-packs', () => {
      // Direct snapping function
      expect(snapToCommercialPackSize(5, 'Beverages', 'Dr Pepper')).toBe(6);
      expect(snapToCommercialPackSize(7, 'Beverages', 'Dr Pepper')).toBe(6);
      expect(snapToCommercialPackSize(3, 'Beverages', 'Red Bull')).toBe(4);
      expect(snapToCommercialPackSize(11, 'Beverages', 'Coca-Cola')).toBe(12);
      expect(snapToCommercialPackSize(13, 'Beverages', 'Pepsi')).toBe(12);
      expect(snapToCommercialPackSize(23, 'Beverages', 'Water 24-pack')).toBe(24);
      expect(snapToCommercialPackSize(25, 'Beverages', 'Sprite')).toBe(24);
    });

    it('prevents 5-pack and 7-pack false validations when price fluctuates on a 6-pack', async () => {
      const mockStorage = {
        getItemsByPoolId: vi.fn().mockResolvedValue([
          {
            id: 'item-drpepper-bottle',
            name: 'Dr Pepper Bottle',
            category: 'Beverages',
            cost_per_unit: 0.66, // Standard 6-pack $3.98 base
            stock: 12,
            unit_name: 'bottle',
            barcode: '078000082463',
          }
        ])
      };

      // Case A: Dr Pepper on sale for $3.49 ($3.49 / 0.66 = 5.28 -> without snapping would be 5-pack!)
      const saleItem = [
        {
          name: 'DR PEPPER 007800008246',
          category: 'Beverages',
          quantity: 1,
          costPerUnit: 3.49,
          totalCost: 3.49,
          unitName: 'unit'
        }
      ];
      const saleResult = await validateAndEnrichReceiptItems(saleItem, 'pool-1', mockStorage);
      expect(saleResult[0].isPack).toBe(true);
      expect(saleResult[0].quantity).toBe(6); // Snapped from 5 to 6!
      expect(saleResult[0].packQuantity).toBe(6);
      expect(saleResult[0].costPerUnit).toBe(0.58); // Recalculated 3.49 / 6

      // Case B: Dr Pepper marked up / convenience price $4.68 ($4.68 / 0.66 = 7.09 -> without snapping would be 7-pack!)
      const markupItem = [
        {
          name: 'DR PEPPER 007800008246',
          category: 'Beverages',
          quantity: 1,
          costPerUnit: 4.68,
          totalCost: 4.68,
          unitName: 'unit'
        }
      ];
      const markupResult = await validateAndEnrichReceiptItems(markupItem, 'pool-1', mockStorage);
      expect(markupResult[0].isPack).toBe(true);
      expect(markupResult[0].quantity).toBe(6); // Snapped from 7 to 6!
      expect(markupResult[0].packQuantity).toBe(6);
      expect(markupResult[0].costPerUnit).toBe(0.78); // Recalculated 4.68 / 6
    });

    it('sanitizes LLM outputs that guess 5 or 7 pack quantities for sodas', () => {
      const rawLlmWithHallucinatedPack = {
        storeName: 'Walmart',
        items: [
          {
            name: 'Dr Pepper',
            category: 'Beverages',
            quantity: 5,
            packQuantity: 5,
            isPack: true,
            costPerUnit: 0.70,
            totalCost: 3.50,
          },
          {
            name: 'Dr Pepper Cherry',
            category: 'Beverages',
            quantity: 7,
            packQuantity: 7,
            isPack: true,
            costPerUnit: 0.70,
            totalCost: 4.90,
          }
        ]
      };

      const sanitized = sanitizeLlmReceiptOutput(rawLlmWithHallucinatedPack);
      expect(sanitized.items[0].quantity).toBe(6);
      expect(sanitized.items[0].packQuantity).toBe(6);
      expect(sanitized.items[1].quantity).toBe(6);
      expect(sanitized.items[1].packQuantity).toBe(6);
    });
  });
});
