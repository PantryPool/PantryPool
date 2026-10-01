export interface RetailPackProduct {
  barcode: string;
  name: string;
  brand?: string;
  category: 'Beverages' | 'Snacks' | 'Coffee & Tea' | 'Pantry & Fresh' | 'Household';
  isPack: boolean;
  packQuantity: number;
  suggestedUnit: string;
  suggestedIcon: string;
  packDescription?: string;
}

/**
 * Computes standard UPC-A modulo 10 check digit for an 11-digit code.
 */
export function calculateUpcCheckDigit(upc11: string): number {
  const clean = upc11.replace(/[^0-9]/g, '');
  if (clean.length !== 11) return 0;
  let oddSum = 0;
  let evenSum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(clean[i], 10);
    if (i % 2 === 0) oddSum += digit;
    else evenSum += digit;
  }
  const total = oddSum * 3 + evenSum;
  return (10 - (total % 10)) % 10;
}

/**
 * Returns an array of normalized candidate UPC / EAN variants for a given barcode string.
 * Especially handles Walmart & POS receipt formats:
 * - 12-digit receipt format with leading 00 (e.g. '007800008246') -> '07800008246' (11 digits) -> '078000082463' (UPC-A with check digit)
 * - 11-digit UPC without check digit -> computes check digit -> 12-digit UPC-A
 * - 12-digit standard UPC-A -> 13-digit EAN with leading 0
 * - 13-digit EAN -> 12-digit without leading 0
 */
export function getUpcCandidates(input: string): string[] {
  if (!input) return [];
  const clean = input.trim().replace(/[^0-9]/g, '');
  if (!clean || clean.length < 6) return [];

  const candidates = new Set<string>([clean]);

  // Walmart format: 12 digits starting with '00' (e.g. 007800008246)
  if (clean.length === 12 && clean.startsWith('00')) {
    const upc11 = clean.slice(1); // 07800008246
    candidates.add(upc11);
    const cd = calculateUpcCheckDigit(upc11);
    candidates.add(upc11 + cd); // 078000082463
    candidates.add('0' + upc11 + cd); // 0078000082463
    candidates.add(clean.slice(2)); // 7800008246
  }

  // 11 digits (e.g. 07800008246 or 07800011505)
  if (clean.length === 11) {
    const cd = calculateUpcCheckDigit(clean);
    candidates.add(clean + cd);
    candidates.add('0' + clean);
  }

  // 12 digits standard UPC-A (e.g. 078000082463)
  if (clean.length === 12) {
    candidates.add('0' + clean); // EAN-13
    const prefix11 = clean.slice(0, 11);
    candidates.add(prefix11); // 11-digit Walmart POS format
    candidates.add('0' + prefix11); // 12-digit Walmart format (leading 00)
  }

  // 13 digits EAN-13 (e.g. 0078000082463)
  if (clean.length === 13 && clean.startsWith('0')) {
    const withoutZero = clean.slice(1);
    candidates.add(withoutZero);
    if (withoutZero.length === 12) {
      candidates.add(withoutZero.slice(0, 11));
      candidates.add('0' + withoutZero.slice(0, 11));
    }
  }

  return Array.from(candidates);
}

/**
 * Checks whether two barcodes match under any normalized representation.
 */
export function areBarcodesMatching(codeA?: string | null, codeB?: string | null): boolean {
  if (!codeA || !codeB) return false;
  const cleanA = codeA.trim().replace(/[^0-9]/g, '');
  const cleanB = codeB.trim().replace(/[^0-9]/g, '');
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;

  const candidatesA = new Set(getUpcCandidates(cleanA));
  const candidatesB = getUpcCandidates(cleanB);

  for (const b of candidatesB) {
    if (candidatesA.has(b)) return true;
  }

  // Substring match for 10+ digits
  if (cleanA.length >= 10 && cleanB.length >= 10) {
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
  }

  return false;
}

/**
 * Parse pack quantity, unit type, and icon from text descriptions and packaging info.
 */
export function parsePackAndUnitInfo(
  text: string,
  packaging = '',
  quantityStr = ''
): {
  isPack: boolean;
  packQuantity: number;
  unitName: string;
  suggestedIcon: string;
  packDescription?: string;
} {
  const combined = [text, packaging, quantityStr].filter(Boolean).join(' ').toLowerCase();

  let packQuantity = 1;
  let isPack = false;

  // 1. Check NxM pattern: e.g. "6 x 16.9 fl oz", "6x0.5L", "12 x 12 fl oz", "6 x 500 ml"
  const multMatch = combined.match(/\b(\d+)\s*x\s*[\d\.]+\s*(?:fl\s*oz|oz|ml|l|ltr|ct|g)?\b/i);
  if (multMatch) {
    const qty = parseInt(multMatch[1], 10);
    if (qty > 1 && qty <= 100) {
      packQuantity = qty;
      isPack = true;
    }
  }

  // 2. Check N-pack / Npk / N ct / pack of N: e.g. "6-pack", "6pk", "12pk", "24ct", "pack of 6", "box of 12"
  if (!isPack) {
    const packMatch = combined.match(/\b(\d+)\s*[-\s]?(?:pack|pk|ct|count|cans?|bottles?|boxes?|bags?)\b/i)
      || combined.match(/\b(?:pack|box|case)\s+of\s+(\d+)\b/i);
    if (packMatch) {
      const qty = parseInt(packMatch[1], 10);
      if (qty > 1 && qty <= 100) {
        packQuantity = qty;
        isPack = true;
      }
    }
  }

  // 3. Six pack / dozen phrase detection
  if (!isPack) {
    if (/\b(?:six[-\s]?pack|6[-\s]?pack|6pk)\b/i.test(combined)) {
      packQuantity = 6;
      isPack = true;
    } else if (/\bdozen\b/i.test(combined)) {
      packQuantity = 12;
      isPack = true;
    }
  }

  // Determine individual unit name
  let unitName = 'unit';
  if (/\b(?:bottle|bottles|btl|16\.9\s*oz|20\s*oz|0\.5\s*l|500\s*ml|710\s*ml|1\s*l|2\s*l)\b/i.test(combined)) {
    unitName = 'bottle';
  } else if (/\b(?:can|cans|12\s*oz|355\s*ml|aluminium-can)\b/i.test(combined)) {
    unitName = 'can';
  } else if (/\b(?:bar|bars|protein|granola)\b/i.test(combined)) {
    unitName = 'bar';
  } else if (/\b(?:bag|bags|chips?|popcorn|pretzel)\b/i.test(combined)) {
    unitName = 'bag';
  } else if (/\b(?:box|boxes|cookie|cracker)\b/i.test(combined)) {
    unitName = 'box';
  } else if (/\b(?:carton|oatmilk|creamer|milk)\b/i.test(combined)) {
    unitName = 'carton';
  } else if (/\b(?:pod|k-cup|capsule)\b/i.test(combined)) {
    unitName = 'pod';
  } else if (isPack) {
    // If it is a pack and beverages (soda/pop/seltzer/tea/water):
    // water packs are bottles; standard soda 6-packs are bottles; 12-packs are cans
    if (/\b(?:water|purified|spring|aquafina|dasani)\b/i.test(combined)) {
      unitName = 'bottle';
    } else if (/pepper|coke|pepsi|sprite|soda|pop|seltzer|lacroix|drink|tea/i.test(combined)) {
      unitName = packQuantity === 6 ? 'bottle' : (packQuantity >= 12 ? 'can' : 'bottle');
    } else {
      unitName = 'unit';
    }
  }

  // Suggested Icon
  let suggestedIcon = 'Package';
  if (/pepper|coke|pepsi|sprite|soda|pop|water|lacroix|seltzer|gatorade|drink|juice/i.test(combined)) {
    suggestedIcon = 'CupSoda';
  } else if (/coffee|tea|latte|espresso|brew/i.test(combined)) {
    suggestedIcon = 'Coffee';
  } else if (/chip|cookie|cracker|snack|bar|popcorn/i.test(combined)) {
    suggestedIcon = combined.includes('popcorn') ? 'Popcorn' : 'Cookie';
  } else if (/milk|dairy|fruit|fresh|apple|banana/i.test(combined)) {
    suggestedIcon = (combined.includes('milk') || combined.includes('dairy')) ? 'Milk' : 'Apple';
  }

  const packDescription = isPack ? `${packQuantity}-pack (${unitName}s)` : undefined;

  return {
    isPack,
    packQuantity,
    unitName,
    suggestedIcon,
    packDescription,
  };
}

/**
 * Snaps an estimated or calculated pack size ratio to real-world commercial retail packaging.
 * In particular, sodas and beverages are never produced in 5-packs or 7-packs.
 * Price swings ($3.49 sale or $4.69 markup vs $0.66 base unit cost) naturally round to 5 or 7.
 * This snaps them to 6 (or standard multi-pack increments like 12, 18, 24).
 */
export function snapToCommercialPackSize(rawQty: number, category = 'Beverages', itemName = ''): number {
  if (rawQty <= 1) return 1;

  const combined = `${category} ${itemName}`.toLowerCase();
  const isBeverage = category === 'Beverages' || /pepper|coke|pepsi|sprite|soda|pop|water|lacroix|seltzer|gatorade|red bull|monster|juice|drink|tea|coffee|beer/i.test(combined);

  if (isBeverage) {
    // 3, 5, 7 -> snap to 4 or 6
    if (rawQty === 3) return 4;
    if (rawQty === 5 || rawQty === 7) return 6;
    // 9, 11, 13, 14 -> snap to 12 (10-packs exist for mini cans)
    if (rawQty >= 9 && rawQty <= 14 && rawQty !== 10) return 12;
    // 16, 17, 19, 20 -> snap to 18
    if (rawQty >= 16 && rawQty <= 20 && rawQty !== 18) return 18;
    // 21 through 26 -> snap to 24
    if (rawQty >= 21 && rawQty <= 26) return 24;
    // 28 through 34 -> snap to 30 or 32
    if (rawQty >= 28 && rawQty <= 34 && rawQty !== 30 && rawQty !== 32) return 30;
    // 35 through 38 -> snap to 36
    if (rawQty >= 35 && rawQty <= 38) return 36;
  } else {
    // General food/snacks: 7 is almost always 6
    if (rawQty === 7) return 6;
  }

  return rawQty;
}

/**
 * Built-in registry of common retail & breakroom products (especially Walmart & grocery UPCs)
 * for rapid offline lookup and 100% reliable matching.
 */
export const KNOWN_RETAIL_PRODUCTS: RetailPackProduct[] = [
  // Dr Pepper 6-pack 16.9oz Bottles (Walmart & US Grocery UPCs)
  {
    barcode: '007800008246',
    name: 'Dr Pepper (6-Pack Bottles)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 16.9 fl oz bottles',
  },
  {
    barcode: '078000082463',
    name: 'Dr Pepper (6-Pack Bottles)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 16.9 fl oz bottles',
  },
  {
    barcode: '007800011505',
    name: 'Dr Pepper (6-Pack 0.5L Bottles)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 0.5L bottles',
  },
  {
    barcode: '078000115055',
    name: 'Dr Pepper (6-Pack 0.5L Bottles)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 0.5L bottles',
  },
  // Dr Pepper 6-pack 12oz Cans
  {
    barcode: '007800008212',
    name: 'Dr Pepper (6-Pack Cans)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 12 fl oz cans',
  },
  {
    barcode: '078000082128',
    name: 'Dr Pepper (6-Pack Cans)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 12 fl oz cans',
  },
  // Dr Pepper 6-pack 7.5oz Mini Cans
  {
    barcode: '007800001099',
    name: 'Dr Pepper (6-Pack Mini Cans)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 7.5 fl oz mini cans',
  },
  {
    barcode: '078000001099',
    name: 'Dr Pepper (6-Pack Mini Cans)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 7.5 fl oz mini cans',
  },
  // Dr Pepper Zero Sugar 6-pack 16.9oz Bottles
  {
    barcode: '007800035414',
    name: 'Dr Pepper Zero Sugar (6-Pack Bottles)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 16.9 fl oz bottles',
  },
  {
    barcode: '078000035414',
    name: 'Dr Pepper Zero Sugar (6-Pack Bottles)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 16.9 fl oz bottles',
  },
  // Diet Dr Pepper 6-pack 16.9oz Bottles
  {
    barcode: '007800083460',
    name: 'Diet Dr Pepper (6-Pack Bottles)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 16.9 fl oz bottles',
  },
  {
    barcode: '078000834604',
    name: 'Diet Dr Pepper (6-Pack Bottles)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 16.9 fl oz bottles',
  },
  // Diet Dr Pepper 6-pack 12oz Cans
  {
    barcode: '007800083125',
    name: 'Diet Dr Pepper (6-Pack Cans)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 12 fl oz cans',
  },
  {
    barcode: '078000831252',
    name: 'Diet Dr Pepper (6-Pack Cans)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 6,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '6-pack of 12 fl oz cans',
  },
  // Dr Pepper 12-pack Cans
  {
    barcode: '078000082166',
    name: 'Dr Pepper Soda (12-Pack Cans)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 12,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '12-pack of 12 fl oz cans',
  },
  {
    barcode: '007800008216',
    name: 'Dr Pepper Soda (12-Pack Cans)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 12,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '12-pack of 12 fl oz cans',
  },
  // Dr Pepper Cherry 12-pack
  {
    barcode: '078000034417',
    name: 'Dr Pepper Cherry (12-Pack Cans)',
    brand: 'Dr Pepper',
    category: 'Beverages',
    isPack: true,
    packQuantity: 12,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '12-pack of 12 fl oz cans',
  },
  // Coca-Cola 12-pack Cans
  {
    barcode: '049000028904',
    name: 'Coca-Cola Original Taste (12-Pack Cans)',
    brand: 'Coca-Cola',
    category: 'Beverages',
    isPack: true,
    packQuantity: 12,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '12-pack of 12 fl oz cans',
  },
  {
    barcode: '004900002890',
    name: 'Coca-Cola Original Taste (12-Pack Cans)',
    brand: 'Coca-Cola',
    category: 'Beverages',
    isPack: true,
    packQuantity: 12,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '12-pack of 12 fl oz cans',
  },
  // Diet Coke 12-pack Cans
  {
    barcode: '049000028911',
    name: 'Diet Coke (12-Pack Cans)',
    brand: 'Coca-Cola',
    category: 'Beverages',
    isPack: true,
    packQuantity: 12,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '12-pack of 12 fl oz cans',
  },
  // Sprite 12-pack Cans
  {
    barcode: '049000028928',
    name: 'Sprite (12-Pack Cans)',
    brand: 'Sprite',
    category: 'Beverages',
    isPack: true,
    packQuantity: 12,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '12-pack of 12 fl oz cans',
  },
  // Pepsi 12-pack Cans
  {
    barcode: '012000001291',
    name: 'Pepsi Cola (12-Pack Cans)',
    brand: 'Pepsi',
    category: 'Beverages',
    isPack: true,
    packQuantity: 12,
    suggestedUnit: 'can',
    suggestedIcon: 'CupSoda',
    packDescription: '12-pack of 12 fl oz cans',
  },
  // Great Value Purified Water 24-pack
  {
    barcode: '007874235191',
    name: 'Great Value Purified Water (24-Pack)',
    brand: 'Great Value',
    category: 'Beverages',
    isPack: true,
    packQuantity: 24,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '24-pack of 16.9 fl oz water bottles',
  },
  {
    barcode: '078742351914',
    name: 'Great Value Purified Water (24-Pack)',
    brand: 'Great Value',
    category: 'Beverages',
    isPack: true,
    packQuantity: 24,
    suggestedUnit: 'bottle',
    suggestedIcon: 'CupSoda',
    packDescription: '24-pack of 16.9 fl oz water bottles',
  },
  // Lay's Classic Potato Chips
  {
    barcode: '002840004380',
    name: "Lay's Classic Potato Chips",
    brand: "Lay's",
    category: 'Snacks',
    isPack: false,
    packQuantity: 1,
    suggestedUnit: 'bag',
    suggestedIcon: 'Cookie',
  },
];

/**
 * Searches the built-in retail registry for a product by barcode across all candidate variants.
 */
export function lookupRetailProductByBarcode(barcode: string): RetailPackProduct | null {
  const candidates = getUpcCandidates(barcode);
  for (const c of candidates) {
    const found = KNOWN_RETAIL_PRODUCTS.find((p) => areBarcodesMatching(p.barcode, c));
    if (found) return found;
  }
  return null;
}
