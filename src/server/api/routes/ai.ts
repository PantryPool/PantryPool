import { Hono } from 'hono';
import { HonoEnv } from '../app';
import { resolveGeminiEndpointConfig } from '../geminiAuth';
import { 
  classifyGroceryItemsWithTypeSafe, 
  resolveReceiptPackAndCategoryWithTypeSafe,
  resolveItemTaxabilityWithTypeSafe,
  calculateTypeSafeCost
} from '../../services/typesafeService';
import { 
  lookupRetailProductByBarcode, 
  parsePackAndUnitInfo, 
  areBarcodesMatching,
  snapToCommercialPackSize
} from '../../../shared/barcodeUtils';
import { 
  distributeReceiptTax, 
  extractLineTaxFlag, 
  inferCategoryTaxability 
} from '../../../shared/receiptTaxUtils';

export function parseNaturalLanguageHaul(textInput: string): {
  storeName: string;
  totalAmount: number;
  subtotal?: number;
  taxAmount?: number;
  items: { 
    name: string; 
    category: string; 
    costPerUnit: number; 
    quantity: number; 
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
  }[];
} {
  let storeName = "Pantry Restock";
  const storeMatch = textInput.match(/(?:at|from|in)\s+([A-Z][a-zA-Z0-9'\s]{2,25}?)(?:\s+(?:on|for|spent|\$|\n|,|;)|$)/i);
  if (storeMatch && storeMatch[1]) {
    storeName = storeMatch[1].trim();
  } else if (/walmart/i.test(textInput)) {
    storeName = 'Walmart';
  } else if (/target/i.test(textInput)) {
    storeName = 'Target';
  }

  let parsedTaxAmount = 0;
  let parsedSubtotal: number | null = null;
  let parsedTotal: number | null = null;

  // Capture total if specified upfront, e.g. "Spent $21.20 at Target..."
  const spentTotalMatch = textInput.match(/^(?:I\s+)?(?:spent|total)\s*(?:of)?\s*\$?(\d+(?:\.\d{1,2})?)/i);
  if (spentTotalMatch) {
    parsedTotal = parseFloat(spentTotalMatch[1]) || null;
  }

  // Check for inline tax mention in natural language: e.g. "sales tax was $1.20" or "tax of $1.50"
  const inlineTaxMatch = textInput.match(/(?:sales\s*tax|taxes|tax)\s*(?:was|is|of|[:\-])?\s*\$?(\d+(?:\.\d{1,2})?)/i);
  if (inlineTaxMatch) {
    parsedTaxAmount = parseFloat(inlineTaxMatch[1]) || 0;
  }

  const cleaned = textInput
    .replace(/^(?:I\s+)?(?:spent|total)\s*(?:of)?\s*\$?\d+(?:\.\d{1,2})?\s*(?:at|from)\s+[A-Za-z0-9'\s]{2,25}?\s+(?:on|for)\s+/i, '')
    .replace(/(?:I\s+)?(?:brought\s+in|bought|purchased|restocked|got|grabbed|picked\s+up)\s+(?:a\s+haul\s+of\s+|some\s+items\s+from\s+[A-Za-z0-9'\s]{2,25}?\s+(?:on|for)\s+)?/gi, '')
    .replace(/^(?:at|from)\s+[A-Za-z0-9'\s]{2,25}?\s*:\s*/i, '');

  // Protect commas and separators inside parentheses, e.g. "($10, taxed)"
  const protectedText = cleaned.replace(/\(([^)]+)\)/g, (_, inner) => '(' + inner.replace(/[,;]/g, '@@') + ')');
  const lines = protectedText.split(/[\n,;]+|\band\b/i).map(l => l.replace(/@@/g, ',').trim()).filter(Boolean);
  const parsedItems: any[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.length < 2) continue;

    // 1. Check for standalone tax line: e.g. TAX 1.60, SALES TAX $1.60, TAX: $1.60, sales tax was $1.20
    const taxLineMatch = trimmedLine.match(/^(?:sales\s*tax|taxes?\b)(?:\s+[\d\.]+%?)?\s*(?:was|is|of|[:\-])?\s*\$?(\d+(?:\.\d{1,2})?)/i)
      || trimmedLine.match(/^tax\s*\d*\s*(?:was|is|of|[:\-])?\s*\$?(\d+(?:\.\d{1,2})?)/i);
    if (taxLineMatch) {
      parsedTaxAmount = parseFloat(taxLineMatch[1]) || parsedTaxAmount;
      continue;
    }

    // 2. Check for subtotal line: e.g. SUBTOTAL 25.00
    const subtotalLineMatch = trimmedLine.match(/^subtotal\s*(?:was|is|of|[:\-])?\s*\$?(\d+(?:\.\d{1,2})?)/i);
    if (subtotalLineMatch) {
      parsedSubtotal = parseFloat(subtotalLineMatch[1]) || null;
      continue;
    }

    // 3. Check for total line: e.g. TOTAL 26.60
    const totalLineMatch = trimmedLine.match(/^(?:total|balance|amount\s*due)\s*(?:was|is|of|[:\-])?\s*\$?(\d+(?:\.\d{1,2})?)/i);
    if (totalLineMatch) {
      parsedTotal = parseFloat(totalLineMatch[1]) || null;
      continue;
    }

    // Skip receipt metadata, headers, totals, tax, timestamps, and tender lines
    if (/^(?:subtotal|total|tax|sales\s*tax|taxes|balance|cash|credit|debit|visa|mastercard|amex|change|tender|manager|store|walmart|target|costco|trader\s*joe|kroger|safeway|heb|publix|aldi|receipt|thank\s*you|customer|terminal|date|time)\b/i.test(trimmedLine)) {
      continue;
    }
    // Skip date / timestamp lines: e.g. 09/19/26 14:32:10 or 2026-09-19
    if (/^\d{1,4}[\/:\-\.]\d{1,2}[\/:\-\.]\d{1,4}/.test(trimmedLine)) {
      continue;
    }

    // Extract item tax flags before parsing item price and UPC
    const flagInfo = extractLineTaxFlag(trimmedLine);
    let isTaxed = flagInfo.isTaxed;
    let taxFlag = flagInfo.taxFlag;
    let workingLine = flagInfo.cleanedLine;

    let qty = 1;
    let name = workingLine;
    let cost = 0;
    let detectedUpc: string | null = null;
    let unitName = 'unit';
    let isPack = false;
    let packQuantity = 1;

    // 1. Check for UPC / Barcode (10 to 14 digits, e.g. Walmart's 007800008246)
    const upcMatch = name.match(/\b(\d{10,14})\b/);
    if (upcMatch) {
      detectedUpc = upcMatch[1];
      name = name.replace(upcMatch[0], ' ').trim();
    }

    // 2. Extract price ($X.XX or just X.XX with optional receipt flags like F, O, X, T, N)
    const priceMatch = name.match(/(?:\(?\s*\$|\bfor\s+\$|\bat\s+\$|\bcosting\s+\$|\bcost\s+\$|\b–\s*\$|\b-\s*\$)\s*(\d+(?:\.\d{1,2})?)\s*\)?/i)
      || name.match(/\$(\d+(?:\.\d{1,2})?)/)
      || name.match(/(?:^|\s)(\d+\.\d{2})(?:\s+[A-Z])?(?:$|\s)/);

    if (priceMatch) {
      cost = parseFloat(priceMatch[1]) || 0;
      name = name.replace(priceMatch[0], ' ').trim();
    }

    // Secondary check for trailing flags if still attached to name
    const secondaryFlag = extractLineTaxFlag(name);
    if (secondaryFlag.taxFlag && taxFlag === undefined) {
      taxFlag = secondaryFlag.taxFlag;
      isTaxed = secondaryFlag.isTaxed;
      name = secondaryFlag.cleanedLine;
    } else {
      name = name.replace(/\s+[FOXTNAB]\s*$/i, '').trim();
    }

    // 3. Retail product registry lookup for UPC
    let retailProduct = null;
    if (detectedUpc) {
      retailProduct = lookupRetailProductByBarcode(detectedUpc);
      if (retailProduct) {
        if (retailProduct.isPack) {
          isPack = true;
          packQuantity = retailProduct.packQuantity;
          qty = packQuantity;
          unitName = retailProduct.suggestedUnit;
        } else {
          unitName = retailProduct.suggestedUnit;
        }
      }
    }

    // 4. Pack and Unit parsing from name / description
    const packInfo = parsePackAndUnitInfo(name);
    if (packInfo.isPack) {
      isPack = true;
      packQuantity = packInfo.packQuantity;
      qty = packQuantity;
      unitName = packInfo.unitName;
    } else if (unitName === 'unit' && packInfo.unitName !== 'unit') {
      unitName = packInfo.unitName;
    }

    // 5. Classic quantity prefixes (e.g. '12 cans', '2 bags', 'a 6 pack of')
    const qtyMatch = name.match(/^(?:a\s+)?(\d+)\s*(?:-|–|\s*)?(?:pack|pk|count|ct|cans|bottles|boxes|bags|x)?\s+(?:of\s+)?/i)
      || name.match(/\b(\d+)\s*(?:pack|pk|count|ct|cans|bottles|boxes|bags)\b/i);

    if (qtyMatch) {
      const parsedLeadingQty = parseInt(qtyMatch[1], 10) || 1;
      name = name.replace(qtyMatch[0], ' ').trim();
      if (!isPack) {
        qty = parsedLeadingQty;
      } else if (parsedLeadingQty > 1 && parsedLeadingQty !== packQuantity) {
        // e.g. 2 packs of 6 = 12 units
        qty = parsedLeadingQty * packQuantity;
      }
    } else if (/\b(?:a\s+)?dozen\b/i.test(name)) {
      qty = 12;
      isPack = true;
      packQuantity = 12;
      name = name.replace(/\b(?:a\s+)?dozen\b\s*(?:of\s+)?/i, ' ').trim();
    } else if (/\b(?:a\s+)?six[-\s]?pack\b/i.test(name)) {
      qty = 6;
      isPack = true;
      packQuantity = 6;
      name = name.replace(/\b(?:a\s+)?six[-\s]?pack\b\s*(?:of\s+)?/i, ' ').trim();
    } else if (/^(?:a|an|one)\s+(?:pack|bottle|can|box|bag)\s+(?:of\s+)?/i.test(name)) {
      if (!isPack) qty = 1;
      name = name.replace(/^(?:a|an|one)\s+(?:pack|bottle|can|box|bag)\s+(?:of\s+)?/i, ' ').trim();
    }

    name = name
      .replace(/^[\s\-–—:;,\(\)\$0-9]+/g, '')
      .replace(/[\s\-–—:;,\(\)\$0-9]+$/g, '')
      .replace(/\b(?:of|for|at|with)\b$/i, '')
      .trim();

    if (!name || name.length < 2) {
      if (retailProduct) {
        name = retailProduct.name;
      } else {
        continue;
      }
    }

    name = name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    let unitCost = 0;
    let lineTotal = 0;
    if (cost > 0) {
      if (isPack || (cost >= qty && cost > 5 && qty > 1)) {
        lineTotal = cost;
        unitCost = Number((cost / qty).toFixed(2));
      } else if (cost < qty && qty > 1) {
        unitCost = cost;
        lineTotal = Number((cost * qty).toFixed(2));
      } else {
        lineTotal = cost;
        unitCost = Number((cost / qty).toFixed(2));
      }
    }

    let category = retailProduct ? retailProduct.category : 'Snacks';
    const lower = name.toLowerCase();
    if (/pepper|coke|pepsi|sprite|soda|pop|water|lacroix|seltzer|gatorade|red bull|monster|juice|drink|tea|kombucha|bottles|cans|fizz|lemonade/i.test(lower)) {
      category = /coffee|tea|brew|latte|espresso|chai|matcha/i.test(lower) ? 'Coffee & Tea' : 'Beverages';
    } else if (/coffee|espresso|latte|cappuccino|k-cup|nespresso|creamer|oat milk|almond milk|chai|matcha|brew/i.test(lower)) {
      category = 'Coffee & Tea';
    } else if (/fruit|apple|banana|orange|berries|milk|yogurt|bread|bagel|egg|butter|cheese|avocado|sandwich|lunch|meal|fresh/i.test(lower)) {
      category = 'Pantry & Fresh';
    } else if (/paper|towel|napkin|fork|spoon|knife|cup|plate|soap|sponge|trash|wipe|clean|detergent|bleach/i.test(lower)) {
      category = 'Household';
    }

    parsedItems.push({
      name,
      category,
      costPerUnit: unitCost,
      quantity: qty,
      totalCost: lineTotal,
      preTaxCost: lineTotal,
      unitName,
      upc: detectedUpc,
      barcode: detectedUpc,
      isPack,
      packQuantity,
      isTaxed,
      taxFlag
    });
  }

  const rawSubtotal = Number(parsedItems.reduce((sum, it) => sum + (it.totalCost || 0), 0).toFixed(2));

  // If receipt gave a total that exceeds raw subtotal, and tax line was omitted, infer missing tax
  if (parsedTaxAmount === 0 && parsedTotal !== null && parsedTotal > rawSubtotal && (parsedTotal - rawSubtotal) <= (rawSubtotal * 0.35)) {
    parsedTaxAmount = Number((parsedTotal - rawSubtotal).toFixed(2));
  }

  // Distribute tax proportionally across taxable items (leaving untaxed items strictly exempt)
  const finalItems = parsedTaxAmount > 0
    ? distributeReceiptTax(parsedItems, parsedTaxAmount)
    : parsedItems.map(it => ({ ...it, taxShare: 0, preTaxCost: it.totalCost }));

  const finalTotalAmount = parsedTotal !== null && Math.abs(parsedTotal - (rawSubtotal + parsedTaxAmount)) < 0.05
    ? parsedTotal
    : Number((rawSubtotal + parsedTaxAmount).toFixed(2));

  return {
    storeName,
    subtotal: parsedSubtotal ?? rawSubtotal,
    taxAmount: parsedTaxAmount > 0 ? parsedTaxAmount : undefined,
    totalAmount: finalTotalAmount,
    items: finalItems
  };
}

export async function validateAndEnrichReceiptItems(
  items: any[],
  poolId?: string,
  storage?: any
): Promise<any[]> {
  let poolItems: any[] = [];
  if (poolId) {
    try {
      if (storage?.listItemsByPool) {
        poolItems = (await storage.listItemsByPool(poolId)) || [];
      } else if (storage?.getItemsByPoolId) {
        poolItems = (await storage.getItemsByPoolId(poolId)) || [];
      }
    } catch {}
  }

  return items.map((item) => {
    let rawName = (item.name || '').trim();
    let upc = (item.upc || item.barcode || '').trim().replace(/[^0-9]/g, '') || null;
    let totalCost = typeof item.totalCost === 'number' ? item.totalCost : parseFloat(item.totalCost) || 0;
    let qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    let unitCost = typeof item.costPerUnit === 'number' ? item.costPerUnit : parseFloat(item.costPerUnit) || 0;
    let category = item.category || 'Beverages';
    let unitName = item.unitName || 'unit';
    let isPack = Boolean(item.isPack);
    let packQuantity = item.packQuantity || (isPack ? qty : 1);
    let packConfidence: 'verified' | 'inferred' | undefined = item.packConfidence || undefined;
    let existingItemId: string | undefined = item.existingItemId || undefined;

    // If UPC not provided, check if 10-14 digit UPC appears in rawName
    if (!upc) {
      const upcMatch = rawName.match(/\b(\d{10,14})\b/);
      if (upcMatch) {
        upc = upcMatch[1];
        rawName = rawName.replace(upcMatch[0], '').trim();
      }
    }

    // 1. Try matching against existing pool items by UPC first!
    if (upc && poolItems.length > 0) {
      const matched = poolItems.find(p => p.barcode && areBarcodesMatching(p.barcode, upc));
      if (matched) {
        existingItemId = matched.id;
        rawName = matched.name;
        category = matched.category || category;
        unitName = matched.unit_name || unitName;

        // Check if existing item is priced as individual consumable (e.g. $0.66)
        // but the receipt line cost is a multi-pack price (e.g. $3.98)
        if (matched.cost_per_unit > 0 && totalCost > 0) {
          const ratio = totalCost / matched.cost_per_unit;
          let roundedRatio = Math.round(ratio);

          // Snap ratio to commercial pack sizes for beverages and common breakroom consumables
          // Prevents 5-packs or 7-packs of soda when price fluctuates ($3.49 sale or $4.68 markup vs $0.66 base)
          roundedRatio = snapToCommercialPackSize(roundedRatio, category, rawName);

          if (roundedRatio >= 2 && Math.abs((matched.cost_per_unit * roundedRatio) - totalCost) < 2.0) {
            isPack = true;
            packQuantity = roundedRatio;
            qty = roundedRatio;
            unitCost = Number((totalCost / roundedRatio).toFixed(2));
            packConfidence = 'inferred';
          }
        }
      }
    }

    // 2. Try matching against local retail registry
    if (upc) {
      const retailMatch = lookupRetailProductByBarcode(upc);
      if (retailMatch) {
        if (!existingItemId && (rawName.length <= 4 || /^[A-Z0-9\s]+$/.test(rawName) || rawName.toLowerCase().includes(retailMatch.brand?.toLowerCase() || ''))) {
          rawName = retailMatch.name;
        }
        category = retailMatch.category;
        if (retailMatch.isPack) {
          isPack = true;
          packQuantity = retailMatch.packQuantity;
          unitName = retailMatch.suggestedUnit;
          packConfidence = 'verified';
          if (qty === 1 || !item.isPack || qty === 5 || qty === 7) {
            qty = retailMatch.packQuantity;
            if (totalCost > 0) {
              unitCost = Number((totalCost / qty).toFixed(2));
            }
          }
        } else {
          unitName = retailMatch.suggestedUnit;
        }
      }
    }

    // 3. Check for pack info in name or text description
    const packInfo = parsePackAndUnitInfo(rawName);
    if (packInfo.isPack && (qty === 1 || !isPack || qty === 5 || qty === 7)) {
      isPack = true;
      packQuantity = packInfo.packQuantity;
      qty = packQuantity;
      unitName = packInfo.unitName;
      if (totalCost > 0) {
        unitCost = Number((totalCost / qty).toFixed(2));
      }
    } else if (unitName === 'unit' && packInfo.unitName !== 'unit') {
      unitName = packInfo.unitName;
    }

    // 4. Snap any non-standard beverage quantities (e.g. 5 or 7 from LLM hallucination or sale price ratio)
    if (category === 'Beverages' || /pepper|coke|pepsi|sprite|soda|pop|water|lacroix|seltzer|gatorade|drink/i.test(rawName)) {
      if (isPack && (packQuantity === 5 || packQuantity === 7)) {
        packQuantity = 6;
        qty = 6;
        if (totalCost > 0) {
          unitCost = Number((totalCost / 6).toFixed(2));
        }
      } else if (!isPack && (qty === 5 || qty === 7) && totalCost > 2.50) {
        isPack = true;
        packQuantity = 6;
        qty = 6;
        if (totalCost > 0) {
          unitCost = Number((totalCost / 6).toFixed(2));
        }
      }
    }

    // Final calculations
    if (totalCost > 0 && unitCost === 0) {
      unitCost = Number((totalCost / qty).toFixed(2));
    } else if (totalCost === 0 && unitCost > 0) {
      totalCost = Number((unitCost * qty).toFixed(2));
    }

    return {
      name: rawName,
      category,
      quantity: qty,
      costPerUnit: unitCost,
      totalCost,
      preTaxCost: item.preTaxCost !== undefined ? item.preTaxCost : (item.taxShare ? Number((totalCost - item.taxShare).toFixed(2)) : totalCost),
      taxShare: item.taxShare ?? 0,
      isTaxed: item.isTaxed,
      taxFlag: item.taxFlag,
      unitName,
      upc: upc || undefined,
      barcode: upc || undefined,
      isPack,
      packQuantity,
      packConfidence,
      isBarcodeVerified: packConfidence === 'verified',
      existingItemId
    };
  });
}

async function isTypeSafeActive(storage: any, env: any): Promise<{ active: boolean; apiKey: string }> {
  const apiKey = env?.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY || '';
  if (!apiKey || apiKey.includes('PLACEHOLDER') || !apiKey.startsWith('apikey_')) {
    return { active: false, apiKey: '' };
  }
  if (storage?.getSystemSettings) {
    try {
      const settings = await storage.getSystemSettings();
      if (settings.typesafe_ai_enabled === 'false' || settings.typesafe_ai_enabled === false) {
        return { active: false, apiKey };
      }
    } catch {}
  }
  return { active: true, apiKey };
}

// SEC-A05-01: Runtime schema validation & numeric bounding for LLM receipt output
export function sanitizeLlmReceiptOutput(raw: any): {
  storeName: string;
  date: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  items: any[];
} {
  const safeItems: any[] = [];
  const tax = Math.max(0, Math.min(10000, Number(raw?.taxAmount) || 0));

  if (Array.isArray(raw?.items)) {
    for (const item of raw.items.slice(0, 100)) {
      if (!item || typeof item !== 'object') continue;
      const rawName = String(item.name || 'Pantry Item').trim().slice(0, 100);
      const allowedCategories = ['Beverages', 'Snacks', 'Coffee & Tea', 'Pantry & Fresh', 'Household'];
      const category = allowedCategories.includes(item.category) ? item.category : 'Snacks';
      let qty = Math.max(1, Math.min(500, Math.floor(Number(item.quantity) || 1)));
      let packQuantity = Math.max(1, Math.min(500, Math.floor(Number(item.packQuantity) || qty)));
      let isPack = Boolean(item.isPack || packQuantity > 1);

      // Snap non-standard beverage quantities (e.g. 5 or 7 from LLM guessing)
      if (category === 'Beverages' || /pepper|coke|pepsi|sprite|soda|pop|water|lacroix|seltzer|gatorade|drink/i.test(rawName)) {
        qty = snapToCommercialPackSize(qty, category, rawName);
        packQuantity = snapToCommercialPackSize(packQuantity, category, rawName);
        if (packQuantity > 1) isPack = true;
      }

      const unitCost = Math.max(0, Math.min(10000, Number(item.costPerUnit) || 0));
      const totalCost = Math.max(0, Math.min(50000, Number(item.totalCost) || (qty * unitCost)));

      safeItems.push({
        ...item,
        name: rawName,
        category,
        quantity: qty,
        packQuantity,
        isPack,
        costPerUnit: Number(unitCost.toFixed(2)),
        totalCost: Number(totalCost.toFixed(2)),
        isTaxed: Boolean(item.isTaxed),
        upc: typeof item.upc === 'string' && /^\d{8,14}$/.test(item.upc) ? item.upc : null,
        unitName: typeof item.unitName === 'string' ? item.unitName.trim().slice(0, 30) : 'unit'
      });
    }
  }

  const cleanStoreName = typeof raw?.storeName === 'string' ? raw.storeName.trim().slice(0, 100) : 'Pantry Restock';
  const cleanDate = typeof raw?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.date) ? raw.date.slice(0, 10) : new Date().toISOString().split('T')[0];
  const calculatedTotal = Number(safeItems.reduce((sum, it) => sum + (it.totalCost || 0), 0).toFixed(2));

  return {
    storeName: cleanStoreName,
    date: cleanDate,
    subtotal: raw?.subtotal ? Math.max(0, Math.min(50000, Number(raw.subtotal) || calculatedTotal)) : calculatedTotal,
    taxAmount: Number(tax.toFixed(2)),
    totalAmount: raw?.totalAmount ? Math.max(0, Math.min(50000, Number(raw.totalAmount) || calculatedTotal + tax)) : calculatedTotal + tax,
    items: safeItems
  };
}

export function registerAiRoutes(app: Hono<HonoEnv>) {
  // Parse Receipt / Haul OCR
  app.post('/api/parse-receipt', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const env = c.env as any;
    const body: any = await c.req.json().catch(() => ({}));
    const { imageBase64, textInput, poolId } = body || {};

    if (!imageBase64 && !textInput) {
      return c.json({ success: false, error: 'Either imageBase64 or textInput is required.' }, 400);
    }

    // SEC-A05-02: Enforce 5MB limit on imageBase64 upload payload
    if (imageBase64 && typeof imageBase64 === 'string') {
      if (imageBase64.length > 7 * 1024 * 1024) {
        return c.json({ success: false, error: 'Image payload exceeds 5MB size limit.' }, 413);
      }
    }

    // If natural language text provided without image
    if (textInput && !imageBase64) {
      const parsed = parseNaturalLanguageHaul(textInput);
      parsed.items = await validateAndEnrichReceiptItems(parsed.items, poolId, storage);
      let aiSource = 'regex';
      const scanLogId = `ai-${Date.now()}-${crypto.randomUUID().substring(0, 6)}`;
      let tsInputTokens = 0;
      let tsOutputTokens = 0;

      const { active: typesafeActive, apiKey: tsKey } = await isTypeSafeActive(storage, env);
      if (typesafeActive && parsed.items.length > 0) {
        const classified = await classifyGroceryItemsWithTypeSafe(parsed.items, tsKey);
        if (classified.usedTypeSafe && classified.items.length > 0) {
          parsed.items = classified.items;
          aiSource = 'typesafe';
        }
        if (classified.usage) {
          tsInputTokens += Number(classified.usage.input_tokens || 0);
          tsOutputTokens += Number(classified.usage.output_tokens || 0);
        }

        const packResolved = await resolveReceiptPackAndCategoryWithTypeSafe(parsed.items, tsKey);
        if (packResolved.usedTypeSafe && packResolved.items.length > 0) {
          parsed.items = packResolved.items;
          aiSource = 'typesafe';
        }
        if (packResolved.usage) {
          tsInputTokens += Number(packResolved.usage.input_tokens || 0);
          tsOutputTokens += Number(packResolved.usage.output_tokens || 0);
        }

        if (parsed.taxAmount && parsed.taxAmount > 0) {
          const taxResolved = await resolveItemTaxabilityWithTypeSafe(parsed.items, tsKey);
          if (taxResolved.usedTypeSafe && taxResolved.items.length > 0) {
            parsed.items = distributeReceiptTax(taxResolved.items, parsed.taxAmount);
            aiSource = 'typesafe';
          }
          if (taxResolved.usage) {
            tsInputTokens += Number(taxResolved.usage.input_tokens || 0);
            tsOutputTokens += Number(taxResolved.usage.output_tokens || 0);
          }
        }

        parsed.totalAmount = Number(parsed.items.reduce((sum, it) => sum + (it.totalCost || 0), 0).toFixed(2));
      }

      const estimatedCostUsd = calculateTypeSafeCost(tsInputTokens);

      if (storage?.logAiUsage) {
        await storage.logAiUsage({
          id: scanLogId,
          user_id: user?.userId || null,
          user_email: user?.email || null,
          pool_id: poolId || null,
          model: aiSource === 'typesafe' ? 'jev-latest' : 'regex',
          activity: 'receipt_text_parse',
          prompt_tokens: tsInputTokens,
          completion_tokens: tsOutputTokens,
          total_tokens: tsInputTokens + tsOutputTokens,
          estimated_cost_usd: estimatedCostUsd,
          status: 'success',
          parsed_items_json: JSON.stringify(parsed.items)
        });
      }

      return c.json({
        success: true,
        scanLogId,
        aiSource,
        storeName: parsed.storeName,
        totalAmount: parsed.totalAmount,
        subtotal: parsed.subtotal,
        taxAmount: parsed.taxAmount,
        date: new Date().toISOString().split('T')[0],
        items: parsed.items,
        receipt: {
          storeName: parsed.storeName,
          totalAmount: parsed.totalAmount,
          subtotal: parsed.subtotal,
          taxAmount: parsed.taxAmount,
          date: new Date().toISOString().split('T')[0],
          items: parsed.items
        },
        aiUsage: {
          scanLogId,
          model: aiSource === 'typesafe' ? 'jev-latest' : 'regex',
          promptTokens: tsInputTokens,
          completionTokens: tsOutputTokens,
          totalTokens: tsInputTokens + tsOutputTokens,
          estimatedCostUsd
        }
      });
    }

    const apiKey = env?.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    // If textInput is provided and Gemini key is not configured, use natural language haul parser
    if (textInput && textInput.trim()) {
      const parsed = parseNaturalLanguageHaul(textInput.trim());
      parsed.items = await validateAndEnrichReceiptItems(parsed.items, poolId, storage);
      let aiSource = 'regex';
      const scanLogId = `ai-${Date.now()}-${crypto.randomUUID().substring(0, 6)}`;
      let tsInputTokens = 0;
      let tsOutputTokens = 0;

      const { active: typesafeActive, apiKey: tsKey } = await isTypeSafeActive(storage, env);
      if (typesafeActive && parsed.items.length > 0) {
        const classified = await classifyGroceryItemsWithTypeSafe(parsed.items, tsKey);
        if (classified.usedTypeSafe && classified.items.length > 0) {
          parsed.items = classified.items;
          aiSource = 'typesafe';
        }
        if (classified.usage) {
          tsInputTokens += Number(classified.usage.input_tokens || 0);
          tsOutputTokens += Number(classified.usage.output_tokens || 0);
        }

        const packResolved = await resolveReceiptPackAndCategoryWithTypeSafe(parsed.items, tsKey);
        if (packResolved.usedTypeSafe && packResolved.items.length > 0) {
          parsed.items = packResolved.items;
          aiSource = 'typesafe';
        }
        if (packResolved.usage) {
          tsInputTokens += Number(packResolved.usage.input_tokens || 0);
          tsOutputTokens += Number(packResolved.usage.output_tokens || 0);
        }

        if (parsed.taxAmount && parsed.taxAmount > 0) {
          const taxResolved = await resolveItemTaxabilityWithTypeSafe(parsed.items, tsKey);
          if (taxResolved.usedTypeSafe && taxResolved.items.length > 0) {
            parsed.items = distributeReceiptTax(taxResolved.items, parsed.taxAmount);
            aiSource = 'typesafe';
          }
          if (taxResolved.usage) {
            tsInputTokens += Number(taxResolved.usage.input_tokens || 0);
            tsOutputTokens += Number(taxResolved.usage.output_tokens || 0);
          }
        }

        parsed.totalAmount = Number(parsed.items.reduce((sum, it) => sum + (it.totalCost || 0), 0).toFixed(2));
      }

      const estimatedCostUsd = calculateTypeSafeCost(tsInputTokens);

      if (parsed.items.length > 0) {
        if (storage?.logAiUsage) {
          await storage.logAiUsage({
            id: scanLogId,
            user_id: user?.userId || null,
            user_email: user?.email || null,
            pool_id: poolId || null,
            model: aiSource === 'typesafe' ? 'jev-latest' : 'regex',
            activity: 'receipt_text_parse',
            prompt_tokens: tsInputTokens,
            completion_tokens: tsOutputTokens,
            total_tokens: tsInputTokens + tsOutputTokens,
            estimated_cost_usd: estimatedCostUsd,
            status: 'success',
            parsed_items_json: JSON.stringify(parsed.items)
          });
        }

        return c.json({
          success: true,
          scanLogId,
          aiSource,
          storeName: parsed.storeName,
          date: new Date().toISOString().split("T")[0],
          totalAmount: parsed.totalAmount,
          subtotal: parsed.subtotal,
          taxAmount: parsed.taxAmount,
          items: parsed.items,
          receipt: parsed,
          isFallback: false,
          aiUsage: {
            scanLogId,
            model: aiSource === 'typesafe' ? 'jev-latest' : 'regex',
            promptTokens: tsInputTokens,
            completionTokens: tsOutputTokens,
            totalTokens: tsInputTokens + tsOutputTokens,
            estimatedCostUsd
          }
        });
      }
    }

    const geminiConfig = await resolveGeminiEndpointConfig(env);
    if (!geminiConfig) {
      // SEC-A10-01: In production environments, fail closed without returning synthetic mock items
      const isProd = (env?.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production');
      if (isProd) {
        return c.json({
          success: false,
          error: 'Receipt OCR service is temporarily unavailable. Please enter items manually or retry in a few moments.'
        }, 503);
      }

      // Offline fallback mock parser
      const scanLogId = `ai-mock-${Date.now()}-${crypto.randomUUID().substring(0, 6)}`;
      const fallbackItems = [
        { name: "Cold Brew Coffee 12oz", category: "Beverages", quantity: 6, costPerUnit: 2.25, totalCost: 13.50, unitName: "can", isPack: true, packQuantity: 6, isTaxed: true },
        { name: "Sea Salt Almonds", category: "Snacks", quantity: 2, costPerUnit: 2.50, totalCost: 5.00, unitName: "bag", isPack: false, packQuantity: 1, isTaxed: false }
      ];
      const enrichedFallback = await validateAndEnrichReceiptItems(fallbackItems, poolId, storage);
      return c.json({
        success: true,
        scanLogId,
        isFallback: true,
        storeName: "Local Grocery Market",
        totalAmount: 18.50,
        subtotal: 18.50,
        taxAmount: 0,
        date: new Date().toISOString().split('T')[0],
        items: enrichedFallback,
        receipt: {
          storeName: "Local Grocery Market",
          totalAmount: 18.50,
          subtotal: 18.50,
          taxAmount: 0,
          date: new Date().toISOString().split('T')[0],
          items: enrichedFallback
        }
      });
    }

    // Real Gemini Flash / Enterprise Platform call
    try {
      const configuredModel = geminiConfig.model;
      const candidateModels = Array.from(new Set([
        configuredModel,
        'gemini-2.5-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-2.5-flash'
      ].filter((m): m is string => Boolean(m))));

      const contents: any[] = [];
      if (textInput) contents.push({ text: textInput });
      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        contents.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: cleanBase64
          }
        });
      }

      const systemPrompt = `You are a grocery receipt and inventory OCR parser for office/breakroom pantries.
Receipts (especially Walmart, Target, and supermarkets) often print a 10-14 digit UPC / barcode / item code next to or under line items (e.g. '007800008246').
Items are frequently purchased as multi-packs (e.g. 6-pack, 12-pack, 24-pack, 6PK, 12PK, 4PK).
For breakroom inventory, we track individual consumable units (e.g. a 6-pack of Dr Pepper contains 6 individual bottles/cans).

IMPORTANT MULTI-PACK CONSTRAINTS:
- Commercial beverage multi-packs (soda, pop, sparkling water, energy drinks, bottled water, iced tea) strictly follow standard retail pack sizes: 4, 6, 8, 10, 12, 15, 18, 24, 30, or 36.
- Sodas (such as Dr Pepper, Coca-Cola, Pepsi, Sprite) are NEVER sold in 5-packs or 7-packs. NEVER output quantity or packQuantity as 5 or 7 for sodas or beverages.
- When a receipt line item says "DR PEPPER" or similar soda without explicit pack text, and the price is ~$3.00-$6.00, it is standardly a 6-pack of bottles or cans (quantity: 6, packQuantity: 6, isPack: true). For $6.50-$12.00 it is typically a 12-pack. For $1.80-$2.70 it is a single 20oz bottle.
- If an item is a single bottle or can, output quantity: 1, packQuantity: 1, isPack: false.

Extract JSON matching this schema:
{
  "storeName": string,
  "subtotal": number (receipt subtotal before sales tax),
  "taxAmount": number (total sales tax amount on receipt, 0 if no tax),
  "totalAmount": number (final total receipt charge including sales tax),
  "date": "YYYY-MM-DD",
  "items": [
    {
      "name": string (clean product name, e.g. "Dr Pepper"),
      "category": "Beverages" | "Snacks" | "Coffee & Tea" | "Pantry & Fresh" | "Household",
      "upc": string or null (the 10-14 digit barcode/UPC if printed on receipt),
      "quantity": number (total individual consumable units, e.g. 6 for a 6-pack, 12 for a 12-pack),
      "packQuantity": number (units per pack, e.g. 6 for 6-pack, 1 if single),
      "isPack": boolean (true if multi-pack),
      "unitName": string ("bottle"|"can"|"bar"|"bag"|"box"|"pack"|"unit"),
      "costPerUnit": number (pre-tax price / quantity),
      "totalCost": number (pre-tax price paid for this line item),
      "isTaxed": boolean (true if item is taxable/subject to sales tax or has tax flag like T/X; false if tax-exempt grocery food like F/N/O),
      "taxFlag": string or null (e.g. "T", "F", "N", "X", "O")
    }
  ]
}
Return ONLY valid JSON.`;

      for (const model of candidateModels) {
        const url = geminiConfig.url(model);
        const genConfig: any = {
          responseMimeType: "application/json"
        };
        const supportsThinking = !model.includes('lite') && !model.includes('flash-8b');
        if (supportsThinking && geminiConfig.mode === 'studio') {
          genConfig.thinkingConfig = { thinkingBudget: 0 };
        }

        let geminiRes = await fetch(url, {
          method: 'POST',
          headers: geminiConfig.headers,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: contents }],
            generationConfig: genConfig,
            systemInstruction: { parts: [{ text: systemPrompt }] }
          })
        });

        if (!geminiRes.ok && geminiRes.status === 400 && genConfig.thinkingConfig) {
          delete genConfig.thinkingConfig;
          geminiRes = await fetch(url, {
            method: 'POST',
            headers: geminiConfig.headers,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: contents }],
              generationConfig: genConfig,
              systemInstruction: { parts: [{ text: systemPrompt }] }
            })
          });
        }

        if (geminiRes.ok) {
          const geminiData: any = await geminiRes.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            let rawParsed: any;
            try {
              rawParsed = JSON.parse(rawText);
            } catch {
              continue;
            }
            const parsed = sanitizeLlmReceiptOutput(rawParsed);
            const geminiTax = parsed.taxAmount;

            // Extract token usage metrics and compute Gemini cost
            const usage = geminiData.usageMetadata || {};
            const promptTokens = Number(usage.promptTokenCount || 0);
            const completionTokens = Number(usage.candidatesTokenCount || 0);
            const totalTokens = Number(usage.totalTokenCount || (promptTokens + completionTokens));
            const promptCost = promptTokens * 0.000000075;
            const completionCost = completionTokens * 0.00000030;
            const geminiCostUsd = Number((promptCost + completionCost).toFixed(6));

            const scanLogId = `ai-${Date.now()}-${crypto.randomUUID().substring(0, 6)}`;
            let tsInputTokens = 0;
            let tsOutputTokens = 0;

            // Split tax among taxable items initially
            if (geminiTax > 0 && Array.isArray(parsed.items) && parsed.items.length > 0) {
              parsed.items = distributeReceiptTax(parsed.items, geminiTax);
            }

            const { active: typesafeActive, apiKey: tsKey } = await isTypeSafeActive(storage, env);
            if (typesafeActive && Array.isArray(parsed.items) && parsed.items.length > 0) {
              const verified = await classifyGroceryItemsWithTypeSafe(parsed.items, tsKey);
              if (verified.usedTypeSafe && verified.items.length > 0) {
                parsed.items = verified.items;
              }
              if (verified.usage) {
                tsInputTokens += Number(verified.usage.input_tokens || 0);
                tsOutputTokens += Number(verified.usage.output_tokens || 0);
              }

              const packResolved = await resolveReceiptPackAndCategoryWithTypeSafe(parsed.items, tsKey);
              if (packResolved.usedTypeSafe && packResolved.items.length > 0) {
                parsed.items = packResolved.items;
              }
              if (packResolved.usage) {
                tsInputTokens += Number(packResolved.usage.input_tokens || 0);
                tsOutputTokens += Number(packResolved.usage.output_tokens || 0);
              }

              if (geminiTax > 0) {
                const taxResolved = await resolveItemTaxabilityWithTypeSafe(parsed.items, tsKey);
                if (taxResolved.usedTypeSafe && taxResolved.items.length > 0) {
                  parsed.items = distributeReceiptTax(taxResolved.items, geminiTax);
                }
                if (taxResolved.usage) {
                  tsInputTokens += Number(taxResolved.usage.input_tokens || 0);
                  tsOutputTokens += Number(taxResolved.usage.output_tokens || 0);
                }
              }

              parsed.totalAmount = Number(parsed.items.reduce((sum: number, it: any) => sum + (it.totalCost || 0), 0).toFixed(2));
            }

            // Enrich and validate items with UPC registry and existing pool items
            if (Array.isArray(parsed.items) && parsed.items.length > 0) {
              parsed.items = await validateAndEnrichReceiptItems(parsed.items, poolId, storage);
            }

            const tsCostUsd = calculateTypeSafeCost(tsInputTokens);

            if (storage?.logAiUsage) {
              await storage.logAiUsage({
                id: scanLogId,
                user_id: user?.userId || null,
                user_email: user?.email || null,
                pool_id: poolId || null,
                model,
                activity: 'receipt_ocr',
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: totalTokens,
                estimated_cost_usd: geminiCostUsd,
                status: 'success',
                parsed_items_json: JSON.stringify(parsed.items)
              });

              if (tsInputTokens > 0) {
                await storage.logAiUsage({
                  id: `ts-${scanLogId}`,
                  user_id: user?.userId || null,
                  user_email: user?.email || null,
                  pool_id: poolId || null,
                  model: 'jev-latest',
                  activity: 'typesafe_haul_enrichment',
                  prompt_tokens: tsInputTokens,
                  completion_tokens: tsOutputTokens,
                  total_tokens: tsInputTokens + tsOutputTokens,
                  estimated_cost_usd: tsCostUsd,
                  status: 'success',
                  parsed_items_json: JSON.stringify(parsed.items)
                });
              }
            }

            return c.json({
              success: true,
              scanLogId,
              storeName: parsed.storeName,
              date: parsed.date,
              subtotal: parsed.subtotal,
              taxAmount: geminiTax > 0 ? geminiTax : undefined,
              totalAmount: parsed.totalAmount,
              items: parsed.items,
              receipt: parsed,
              aiUsage: {
                scanLogId,
                model,
                promptTokens,
                completionTokens,
                totalTokens,
                estimatedCostUsd: geminiCostUsd,
                typesafe: tsInputTokens > 0 ? {
                  model: 'jev-latest',
                  promptTokens: tsInputTokens,
                  completionTokens: tsOutputTokens,
                  totalTokens: tsInputTokens + tsOutputTokens,
                  estimatedCostUsd: tsCostUsd
                } : undefined
              }
            });
          }
        } else if (geminiRes.status === 429 || geminiRes.status === 401 || geminiRes.status === 403) {
          // Break immediately on rate limit or auth errors
          break;
        }
      }
    } catch (e) {
      console.warn('[Gemini API Fallback]', e);
    }

    // SEC-A10-01: In production environments, fail closed without returning synthetic mock items
    const isProd = (env?.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production');
    if (isProd) {
      return c.json({
        success: false,
        error: 'Receipt OCR service is temporarily unavailable. Please enter items manually or retry in a few moments.'
      }, 503);
    }

    // Graceful non-production fallback
    const scanLogId = `ai-mock-${Date.now()}-${crypto.randomUUID().substring(0, 6)}`;
    const defaultItems = [
      { name: "Assorted Seltzers", category: "Beverages", quantity: 8, costPerUnit: 1.50, totalCost: 12.00, unitName: "can", isPack: true, packQuantity: 8 }
    ];
    const enrichedDefault = await validateAndEnrichReceiptItems(defaultItems, poolId, storage);
    return c.json({
      success: true,
      scanLogId,
      storeName: "Pantry Restock",
      totalAmount: 12.00,
      date: new Date().toISOString().split('T')[0],
      items: enrichedDefault,
      receipt: {
        storeName: "Pantry Restock",
        totalAmount: 12.00,
        date: new Date().toISOString().split('T')[0],
        items: enrichedDefault
      }
    });
  });

  // AI Suggest Restock
  app.post('/api/ai-suggest-restock', async (c) => {
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { poolId, items: clientItems, poolName } = body || {};

    let candidateItems: any[] = [];
    if (Array.isArray(clientItems) && clientItems.length > 0) {
      candidateItems = clientItems.map((i: any) => ({
        id: i.id || 'item_' + crypto.randomUUID().substring(0, 6),
        name: i.name,
        category: i.category || 'General',
        stock: Number(i.stock ?? 0),
        min_stock: Number(i.minStock ?? i.min_stock ?? 5),
        cost_per_unit: Number(i.costPerUnit ?? i.cost_per_unit ?? 0)
      }));
    } else if (poolId) {
      candidateItems = await storage.listItemsByPool(poolId);
    }

    const lowStock = candidateItems.filter((i: any) => i.stock <= i.min_stock);

    const suggestions = lowStock.map((i: any) => ({
      itemId: i.id,
      name: i.name,
      category: i.category,
      currentStock: i.stock,
      recommendedQuantity: Math.max(1, ((i.min_stock || 5) * 2) - (i.stock || 0)),
      estimatedUnitPrice: Number(i.cost_per_unit || 0),
      reason: `Current stock (${i.stock}) is below minimum alert threshold (${i.min_stock}).`
    }));

    return c.json({
      success: true,
      summary: lowStock.length > 0
        ? `Analyzed ${candidateItems.length} items for ${poolName || "your pool"}. Found ${lowStock.length} items needing priority restock.`
        : `Analyzed ${candidateItems.length} items for ${poolName || "your pool"}. All items are currently well-stocked.`,
      suggestions,
      isFallback: true
    });
  });

  // Log confirmed applied items to audit parsed-vs-actual inventory additions
  app.post('/api/ai-log-applied', async (c) => {
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { scanLogId, appliedItems, storeName, totalAmount } = body || {};

    if (!scanLogId) {
      return c.json({ success: true });
    }

    const appliedJson = JSON.stringify({
      storeName: storeName || 'Store Restock',
      totalAmount: Number(totalAmount || 0),
      items: Array.isArray(appliedItems) ? appliedItems : []
    });

    if (storage?.logAiAppliedItems) {
      await storage.logAiAppliedItems(scanLogId, appliedJson);
    }

    return c.json({ success: true });
  });
}
