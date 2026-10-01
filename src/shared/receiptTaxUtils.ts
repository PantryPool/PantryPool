/**
 * Shared Receipt Tax Utilities & Proportional Tax Distribution
 *
 * Handles detection of receipt tax flags (e.g. T, TX, X, Y vs exempt F, N, O, NT),
 * extraction of receipt subtotals/taxes/totals from text/OCR, and fair proportional
 * distribution of sales tax across taxable items while strictly exempting untaxed items.
 */

export interface ReceiptItemTaxCandidate {
  name: string;
  category?: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  unitName?: string;
  upc?: string | null;
  barcode?: string | null;
  isPack?: boolean;
  packQuantity?: number;
  isTaxed?: boolean;
  taxFlag?: string | null;
  taxShare?: number;
  preTaxCost?: number;
  existingItemId?: string;
  [key: string]: any;
}

export interface ParseReceiptTaxResult {
  taxAmount: number;
  subtotal?: number;
  totalAmount?: number;
  items: ReceiptItemTaxCandidate[];
}

/**
 * Checks if an item or line flag represents a taxable vs tax-exempt item.
 *
 * In standard US grocery receipts (Walmart, Target, HEB, Kroger, etc.):
 * - T, TX, TAX, X, Y, A, B: Taxable (standard retail sales tax applied)
 * - N, NT, NON, F, O: Non-taxable (grocery food exempt, SNAP/EBT eligible)
 */
export function evaluateTaxFlag(flag?: string | null): boolean | undefined {
  if (!flag) return undefined;
  const cleaned = flag.trim().toUpperCase();
  if (/^(?:T|TX|TAX|X|Y)$/i.test(cleaned)) {
    return true;
  }
  if (/^(?:N|NT|NON|F|O)$/i.test(cleaned)) {
    return false;
  }
  return undefined;
}

/**
 * Parses trailing or isolated receipt tax flags from an item line.
 * E.g. "DR PEPPER 3.98 T" -> flag: "T", isTaxed: true, clean: "DR PEPPER 3.98"
 * E.g. "GREAT VALUE CHIPS F 1.98 O" -> flag: "O", isTaxed: false
 */
export function extractLineTaxFlag(line: string): {
  isTaxed?: boolean;
  taxFlag?: string;
  cleanedLine: string;
} {
  let cleaned = line.trim();
  let isTaxed: boolean | undefined = undefined;
  let taxFlag: string | undefined = undefined;

  // Check for explicit descriptive tags like (taxed), (not taxed), (tax-exempt), (taxable) or within parentheses e.g. ($10, taxed)
  if (/\b(?:not\s*taxed|non[\s\-]taxable|tax[\s\-]exempt|no\s*tax)\b/i.test(cleaned) || (/\bexempt\b/i.test(cleaned) && !/tax\b/i.test(cleaned))) {
    isTaxed = false;
    taxFlag = 'EXEMPT';
    cleaned = cleaned.replace(/\s*\(\s*(?:not\s*taxed|non[\s\-]taxable|tax[\s\-]exempt|no\s*tax|exempt)\s*\)/gi, '');
    cleaned = cleaned.replace(/,?\s*(?:not\s*taxed|non[\s\-]taxable|tax[\s\-]exempt|no\s*tax|exempt)\b/gi, '').trim();
  } else if (/\b(?:taxed|taxable)\b/i.test(cleaned)) {
    isTaxed = true;
    taxFlag = 'TAX';
    cleaned = cleaned.replace(/\s*\(\s*(?:taxed|taxable)\s*\)/gi, '');
    cleaned = cleaned.replace(/,?\s*(?:taxed|taxable)\b/gi, '').trim();
  }
  cleaned = cleaned.replace(/\(\s*\)/g, '').trim();

  // Check for trailing receipt tax code flags (e.g. " 3.98 T", " 1.98 F", " 4.50 TX")
  const trailingFlagMatch = cleaned.match(/\s+([FOXTNAB]|TX|NT)\s*$/i);
  if (trailingFlagMatch) {
    const rawFlag = trailingFlagMatch[1].toUpperCase();
    taxFlag = rawFlag;
    const evaluated = evaluateTaxFlag(rawFlag);
    if (evaluated !== undefined && isTaxed === undefined) {
      isTaxed = evaluated;
    }
    cleaned = cleaned.replace(/\s+([FOXTNAB]|TX|NT)\s*$/i, '').trim();
  }

  // Check for mid-line flag before price (e.g. "DR PEPPER 007800008246 F 3.98")
  const prePriceFlagMatch = cleaned.match(/\s+([FOXTNAB]|TX|NT)\s+(\$?\d+(?:\.\d{1,2})?)\s*$/i);
  if (prePriceFlagMatch) {
    const rawFlag = prePriceFlagMatch[1].toUpperCase();
    if (!taxFlag) taxFlag = rawFlag;
    const evaluated = evaluateTaxFlag(rawFlag);
    if (evaluated !== undefined && isTaxed === undefined) {
      isTaxed = evaluated;
    }
    cleaned = cleaned.replace(new RegExp(`\\s+${prePriceFlagMatch[1]}\\s+(\\$?\\d+(?:\\.\\d{1,2})?)\\s*$`, 'i'), ' $1').trim();
  }

  return { isTaxed, taxFlag, cleanedLine: cleaned };
}

/**
 * Heuristically determines item taxability if receipt did not provide explicit tax flags.
 * Uses known retail category conventions:
 * - Household supplies (paper towels, cups, cleaners, utensils) -> taxable (true)
 * - Fresh grocery produce / staples (Pantry & Fresh: fruit, milk, bread) -> exempt (false)
 */
export function inferCategoryTaxability(category?: string, name?: string): boolean | undefined {
  if (category === 'Household') {
    return true;
  }
  if (category === 'Pantry & Fresh') {
    return false;
  }

  const lowerName = (name || '').toLowerCase();
  if (/\b(?:paper\s*towel|napkin|cup|plate|fork|spoon|knife|soap|sponge|trash\s*bag|wipe|detergent|bleach|cleaner)\b/i.test(lowerName)) {
    return true;
  }
  if (/\b(?:apple|banana|orange|berries|milk|bread|bagel|egg|cheese|produce|fruit|fresh)\b/i.test(lowerName)) {
    return false;
  }

  return undefined;
}

/**
 * Splits receipt sales tax among line items:
 * - Items marked `isTaxed === false` are NEVER taxed and receive $0.00 tax.
 * - Taxable items (`isTaxed !== false`) receive a proportional split of `taxAmount` based on their pre-tax cost.
 * - Handles cent-rounding so sum of tax shares strictly matches `taxAmount` without penny drift.
 * - Updates `totalCost` and `costPerUnit` on taxable items.
 */
export function distributeReceiptTax<T extends ReceiptItemTaxCandidate>(
  items: T[],
  taxAmount: number
): (T & { preTaxCost: number; taxShare: number; isTaxed: boolean })[] {
  if (!items || items.length === 0) return [];
  const normalizedTax = Number((Math.max(0, taxAmount) || 0).toFixed(2));

  // If no tax was paid, preserve existing costs and record taxShare = 0
  if (normalizedTax <= 0) {
    return items.map(item => ({
      ...item,
      preTaxCost: item.preTaxCost !== undefined ? item.preTaxCost : item.totalCost,
      taxShare: 0,
      isTaxed: item.isTaxed ?? false
    }));
  }

  // 1. Determine taxability for each item if not explicitly flagged
  const preparedItems = items.map(item => {
    let isTaxed = item.isTaxed;
    if (isTaxed === undefined) {
      isTaxed = inferCategoryTaxability(item.category, item.name);
    }
    const preTaxCost = typeof item.preTaxCost === 'number'
      ? item.preTaxCost
      : (typeof item.totalCost === 'number' ? item.totalCost : parseFloat(item.totalCost as any) || 0);

    return {
      ...item,
      preTaxCost: Number(preTaxCost.toFixed(2)),
      isTaxed
    };
  });

  // 2. Identify taxable items
  // If some items are explicitly marked false (non-taxed), only items with isTaxed !== false receive tax.
  // If NO items are marked false, all items are taxable candidates.
  const hasExplicitExemptions = preparedItems.some(i => i.isTaxed === false);
  const taxableIndices: number[] = [];

  preparedItems.forEach((item, idx) => {
    if (hasExplicitExemptions) {
      if (item.isTaxed !== false) {
        taxableIndices.push(idx);
      }
    } else {
      // If none explicitly exempt, all items share tax unless category was strictly exempt
      if (item.isTaxed !== false) {
        taxableIndices.push(idx);
      }
    }
  });

  // Fallback: If all items were marked exempt but tax exists on receipt, distribute across all items
  const activeTaxableIndices = taxableIndices.length > 0
    ? taxableIndices
    : preparedItems.map((_, idx) => idx);

  // 3. Compute taxable pre-tax cost sum
  const taxablePreTaxTotal = activeTaxableIndices.reduce(
    (sum, idx) => sum + Math.max(0, preparedItems[idx].preTaxCost),
    0
  );

  const taxShares: number[] = new Array(preparedItems.length).fill(0);

  if (taxablePreTaxTotal > 0) {
    let allocatedCents = 0;
    const totalTaxCents = Math.round(normalizedTax * 100);

    // Initial proportional split in cents with fractional remainders
    const taxableSharesInCents = activeTaxableIndices.map(idx => {
      const itemCost = Math.max(0, preparedItems[idx].preTaxCost);
      const exactCents = (itemCost / taxablePreTaxTotal) * totalTaxCents;
      const shareCents = Math.floor(exactCents);
      const fraction = exactCents - shareCents;
      allocatedCents += shareCents;
      return { idx, shareCents, fraction, cost: itemCost };
    });

    // Distribute remaining cents using the Largest Remainder Method (Hare-Niemeyer)
    let remainderCents = totalTaxCents - allocatedCents;
    taxableSharesInCents.sort((a, b) => b.fraction - a.fraction || b.cost - a.cost);

    let i = 0;
    while (remainderCents > 0 && taxableSharesInCents.length > 0) {
      taxableSharesInCents[i % taxableSharesInCents.length].shareCents += 1;
      remainderCents -= 1;
      i++;
    }

    taxableSharesInCents.forEach(s => {
      taxShares[s.idx] = Number((s.shareCents / 100).toFixed(2));
    });
  } else {
    // Equal distribution if taxablePreTaxTotal is 0
    const totalTaxCents = Math.round(normalizedTax * 100);
    const count = activeTaxableIndices.length;
    const baseCents = Math.floor(totalTaxCents / count);
    let remCents = totalTaxCents % count;

    activeTaxableIndices.forEach(idx => {
      const extra = remCents > 0 ? 1 : 0;
      if (remCents > 0) remCents--;
      taxShares[idx] = Number(((baseCents + extra) / 100).toFixed(2));
    });
  }

  // 4. Update totalCost and costPerUnit
  return preparedItems.map((item, idx) => {
    const isTaxed = activeTaxableIndices.includes(idx);
    const share = taxShares[idx] || 0;
    const preTax = item.preTaxCost;
    const newTotalCost = Number((preTax + share).toFixed(2));
    const qty = Math.max(1, parseInt(item.quantity as any, 10) || 1);
    const newCpu = Number((newTotalCost / qty).toFixed(2));

    return {
      ...item,
      isTaxed,
      preTaxCost: preTax,
      taxShare: share,
      totalCost: newTotalCost,
      costPerUnit: newCpu
    };
  });
}
