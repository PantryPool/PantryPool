import { describe, it, expect, vi } from 'vitest';
import { 
  distributeReceiptTax, 
  extractLineTaxFlag, 
  evaluateTaxFlag,
  inferCategoryTaxability 
} from '../src/shared/receiptTaxUtils';
import { parseNaturalLanguageHaul } from '../src/server/api/routes/ai';
import { resolveItemTaxabilityWithTypeSafe } from '../src/server/services/typesafeService';

describe('🧾 Receipt Tax Handling & Proportional Tax Splitting Suite', () => {
  describe('1. Tax Flag & Line Extraction', () => {
    it('evaluates standard retail receipt flags correctly', () => {
      // Taxable flags
      expect(evaluateTaxFlag('T')).toBe(true);
      expect(evaluateTaxFlag('TX')).toBe(true);
      expect(evaluateTaxFlag('TAX')).toBe(true);
      expect(evaluateTaxFlag('X')).toBe(true);
      expect(evaluateTaxFlag('Y')).toBe(true);

      // Exempt / food flags
      expect(evaluateTaxFlag('N')).toBe(false);
      expect(evaluateTaxFlag('NT')).toBe(false);
      expect(evaluateTaxFlag('NON')).toBe(false);
      expect(evaluateTaxFlag('F')).toBe(false); // Food Stamp / SNAP exempt
      expect(evaluateTaxFlag('O')).toBe(false);

      // Unknown / empty
      expect(evaluateTaxFlag('')).toBeUndefined();
      expect(evaluateTaxFlag(null)).toBeUndefined();
    });

    it('extracts trailing and descriptive tax flags from receipt lines', () => {
      const line1 = extractLineTaxFlag('DR PEPPER 12PK 5.98 T');
      expect(line1.isTaxed).toBe(true);
      expect(line1.taxFlag).toBe('T');
      expect(line1.cleanedLine).toBe('DR PEPPER 12PK 5.98');

      const line2 = extractLineTaxFlag('ORGANIC BANANAS 1.98 F');
      expect(line2.isTaxed).toBe(false);
      expect(line2.taxFlag).toBe('F');
      expect(line2.cleanedLine).toBe('ORGANIC BANANAS 1.98');

      const line3 = extractLineTaxFlag('WHOLE MILK (not taxed) $3.50');
      expect(line3.isTaxed).toBe(false);
      expect(line3.cleanedLine.replace(/\s+/g, ' ')).toBe('WHOLE MILK $3.50');

      const line4 = extractLineTaxFlag('PAPER TOWELS (taxed) $12.00');
      expect(line4.isTaxed).toBe(true);
      expect(line4.cleanedLine.replace(/\s+/g, ' ')).toBe('PAPER TOWELS $12.00');
    });

    it('infers taxability based on breakroom pantry categories when flags are absent', () => {
      expect(inferCategoryTaxability('Household', 'Paper Towels')).toBe(true);
      expect(inferCategoryTaxability('Household', 'Trash Bags')).toBe(true);
      expect(inferCategoryTaxability('Pantry & Fresh', 'Bananas')).toBe(false);
      expect(inferCategoryTaxability('Pantry & Fresh', 'Whole Milk')).toBe(false);
    });
  });

  describe('2. Proportional Tax Splitting (distributeReceiptTax)', () => {
    it('splits tax among taxed items and exempts non-taxed items completely', () => {
      const items = [
        { name: 'Dr Pepper 6-Pack', quantity: 6, totalCost: 10.0, costPerUnit: 1.67, isTaxed: true },
        { name: 'Paper Towels', quantity: 2, totalCost: 10.0, costPerUnit: 5.0, isTaxed: true },
        { name: 'Honeycrisp Apples', quantity: 5, totalCost: 5.0, costPerUnit: 1.0, isTaxed: false },
      ];
      const taxAmount = 1.60; // 8% sales tax on $20 of taxable items

      const result = distributeReceiptTax(items, taxAmount);

      expect(result.length).toBe(3);

      // Dr Pepper ($10 out of $20 taxable = 50% of tax = $0.80)
      const drPepper = result.find(i => i.name.includes('Dr Pepper'))!;
      expect(drPepper.taxShare).toBe(0.80);
      expect(drPepper.totalCost).toBe(10.80);
      expect(drPepper.costPerUnit).toBe(1.80); // 10.80 / 6 = 1.80

      // Paper Towels ($10 out of $20 taxable = 50% of tax = $0.80)
      const paperTowels = result.find(i => i.name.includes('Paper Towels'))!;
      expect(paperTowels.taxShare).toBe(0.80);
      expect(paperTowels.totalCost).toBe(10.80);
      expect(paperTowels.costPerUnit).toBe(5.40); // 10.80 / 2 = 5.40

      // Apples (non-taxed item must receive 0 tax!)
      const apples = result.find(i => i.name.includes('Apples'))!;
      expect(apples.taxShare).toBe(0);
      expect(apples.totalCost).toBe(5.00);
      expect(apples.costPerUnit).toBe(1.00);

      // Sum of item total costs must match pre-tax total + tax
      const totalItemCosts = result.reduce((sum, it) => sum + it.totalCost, 0);
      expect(Number(totalItemCosts.toFixed(2))).toBe(26.60);
    });

    it('handles penny rounding without losing or gaining a cent', () => {
      // 3 items at $10 each, tax is $1.00 (1.00 / 3 = 0.333...)
      const items = [
        { name: 'Item A', quantity: 1, totalCost: 10.0, costPerUnit: 10.0, isTaxed: true },
        { name: 'Item B', quantity: 1, totalCost: 10.0, costPerUnit: 10.0, isTaxed: true },
        { name: 'Item C', quantity: 1, totalCost: 10.0, costPerUnit: 10.0, isTaxed: true },
        { name: 'Item D (Exempt)', quantity: 1, totalCost: 10.0, costPerUnit: 10.0, isTaxed: false },
      ];
      const taxAmount = 1.00;

      const result = distributeReceiptTax(items, taxAmount);

      const totalTaxDistributed = result.reduce((sum, it) => sum + (it.taxShare || 0), 0);
      expect(Number(totalTaxDistributed.toFixed(2))).toBe(1.00);

      const exemptItem = result.find(i => i.name.includes('Exempt'))!;
      expect(exemptItem.taxShare).toBe(0);
      expect(exemptItem.totalCost).toBe(10.00);

      const totalSum = result.reduce((sum, it) => sum + it.totalCost, 0);
      expect(Number(totalSum.toFixed(2))).toBe(41.00);
    });

    it('handles zero tax cleanly', () => {
      const items = [
        { name: 'Item A', quantity: 1, totalCost: 10.0, costPerUnit: 10.0, isTaxed: true },
      ];
      const result = distributeReceiptTax(items, 0);
      expect(result[0].taxShare).toBe(0);
      expect(result[0].totalCost).toBe(10.0);
    });
  });

  describe('3. Natural Language & Receipt Text Haul Parsing with Tax', () => {
    it('parses receipt with subtotal, tax, and per-item tax flags, splitting tax accurately', () => {
      const receipt = `
        TARGET STORE #1234
        09/20/26 15:40:12

        DR PEPPER 12PK CANS 6.00 T
        BOUNTY PAPER TOWEL 14.00 T
        ORGANIC FUJI APPLES 5.00 N

        SUBTOTAL 25.00
        TAX 1.60
        TOTAL 26.60
      `;

      const parsed = parseNaturalLanguageHaul(receipt);

      expect(parsed.taxAmount).toBe(1.60);
      expect(parsed.totalAmount).toBe(26.60);
      expect(parsed.items.length).toBe(3);

      const drPepper = parsed.items.find(i => i.name.toLowerCase().includes('dr pepper'))!;
      const paperTowel = parsed.items.find(i => i.name.toLowerCase().includes('bounty'))!;
      const apples = parsed.items.find(i => i.name.toLowerCase().includes('apples'))!;

      // Dr Pepper: $6 pre-tax out of $20 taxable = 30% of $1.60 = $0.48
      expect(drPepper.isTaxed).toBe(true);
      expect(drPepper.taxShare).toBe(0.48);
      expect(drPepper.totalCost).toBe(6.48);

      // Bounty: $14 pre-tax out of $20 taxable = 70% of $1.60 = $1.12
      expect(paperTowel.isTaxed).toBe(true);
      expect(paperTowel.taxShare).toBe(1.12);
      expect(paperTowel.totalCost).toBe(15.12);

      // Apples: untaxed (N flag), taxShare = 0
      expect(apples.isTaxed).toBe(false);
      expect(apples.taxShare).toBe(0);
      expect(apples.totalCost).toBe(5.00);

      // Sum of item total costs equals the receipt total: 6.48 + 15.12 + 5.00 = 26.60
      const sumItems = parsed.items.reduce((s, it) => s + it.totalCost, 0);
      expect(Number(sumItems.toFixed(2))).toBe(26.60);
    });

    it('parses natural language haul describing taxed and untaxed items with tax amount', () => {
      const haulText = "Spent $21.20 at Target on 2 packs paper towels ($10, taxed) and 5 bags apples ($10, not taxed), sales tax was $1.20";

      const parsed = parseNaturalLanguageHaul(haulText);

      expect(parsed.taxAmount).toBe(1.20);
      expect(parsed.totalAmount).toBe(21.20);
      expect(parsed.items.length).toBe(2);

      const towels = parsed.items.find(i => i.name.toLowerCase().includes('paper towels'))!;
      const apples = parsed.items.find(i => i.name.toLowerCase().includes('apples'))!;

      expect(towels.isTaxed).toBe(true);
      expect(towels.taxShare).toBe(1.20); // 100% of taxable items
      expect(towels.totalCost).toBe(11.20);

      expect(apples.isTaxed).toBe(false);
      expect(apples.taxShare).toBe(0);
      expect(apples.totalCost).toBe(10.00);
    });
  });

  describe('4. TypeSafe System One Taxability Resolution', () => {
    it('uses TypeSafe System One to classify taxability of unflagged items', async () => {
      // Mock fetch for TypeSafe System One
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        if (url.includes('api.typesafe.ai')) {
          return {
            ok: true,
            json: async () => ({
              model: 'jev-latest',
              answers: {
                tax_0: { type: 'choice', choice: 'taxed', confidence: 0.95 },
                tax_1: { type: 'choice', choice: 'exempt', confidence: 0.98 },
              }
            })
          };
        }
        return originalFetch(url, opts);
      });

      const unflaggedItems = [
        { name: 'Cleaning Wipes', category: 'Household', costPerUnit: 5.0, totalCost: 5.0, quantity: 1 },
        { name: 'Bananas', category: 'Pantry & Fresh', costPerUnit: 3.0, totalCost: 3.0, quantity: 1 },
      ];

      const res = await resolveItemTaxabilityWithTypeSafe(unflaggedItems, 'apikey_mock_typesafe_secret');
      expect(res.usedTypeSafe).toBe(true);
      expect(res.items[0].isTaxed).toBe(true);
      expect(res.items[1].isTaxed).toBe(false);

      // Now distribute tax based on TypeSafe classifications
      const distributed = distributeReceiptTax(res.items, 0.40);
      expect(distributed[0].taxShare).toBe(0.40);
      expect(distributed[0].totalCost).toBe(5.40);
      expect(distributed[1].taxShare).toBe(0);
      expect(distributed[1].totalCost).toBe(3.00);

      globalThis.fetch = originalFetch;
    });
  });
});
