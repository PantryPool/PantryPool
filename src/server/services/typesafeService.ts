/**
 * Lightweight TypeSafe AI Client & Service
 * 
 * Interacts with TypeSafe's System One API (flagship model Jev) using standard web-fetch.
 * Fully compatible with Node.js and Cloudflare Workers / Pages edge runtimes with zero external dependencies.
 * 
 * Docs: https://docs.typesafe.ai
 */

export interface TypeSafeAnswerChoice {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface TypeSafeAnswerNoul {
  type: 'noul';
  noul: number;
}

export interface TypeSafeAnswerScore {
  type: 'score';
  score: number;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export type TypeSafeAnswer = TypeSafeAnswerChoice | TypeSafeAnswerNoul | TypeSafeAnswerScore;

export interface TypeSafeResponse {
  model: string;
  answers: Record<string, TypeSafeAnswer>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface SystemOneCallOptions {
  apiKey: string;
  state: any;
  questions: Record<string, any>;
  model?: string;
  timeoutMs?: number;
}

const DEFAULT_MODEL = 'jev-latest';
const DEFAULT_TIMEOUT_MS = 4000;
const TYPESAFE_API_URL = 'https://api.typesafe.ai/v1/systemone';

/**
 * Execute a low-level call to TypeSafe System One evaluation endpoint.
 * Returns null if the call fails, times out, or encounters an error.
 */
export async function callTypeSafeSystemOne(options: SystemOneCallOptions): Promise<TypeSafeResponse | null> {
  const { apiKey, state, questions, model = DEFAULT_MODEL, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  if (!apiKey || apiKey.includes('PLACEHOLDER') || !apiKey.startsWith('apikey_')) {
    return null;
  }

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    const res = await fetch(TYPESAFE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        state,
        questions
      }),
      signal: controller?.signal
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[TypeSafe API] HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }

    const data: TypeSafeResponse = await res.json();
    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn(`[TypeSafe API] Request timed out after ${timeoutMs}ms.`);
    } else {
      console.warn('[TypeSafe API] Error calling System One:', err?.message || err);
    }
    return null;
  }
}

export interface TypeSafeUsage {
  input_tokens: number;
  output_tokens: number;
}

export const TYPESAFE_COST_PER_INPUT_TOKEN = 0.000000042; // $42 per billion tokens ($0.042/Mtok)

export function calculateTypeSafeCost(inputTokens: number): number {
  return Number((Math.max(0, inputTokens) * TYPESAFE_COST_PER_INPUT_TOKEN).toFixed(6));
}

export interface ParsedHaulItem {
  name: string;
  category: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  confidence?: number;
}

/**
 * Classify and verify grocery haul items using TypeSafe System One.
 * Evaluates multiple items in parallel in a single HTTP request as per TypeSafe best practices.
 */
export async function classifyGroceryItemsWithTypeSafe(
  items: ParsedHaulItem[],
  apiKey: string
): Promise<{ items: ParsedHaulItem[]; usedTypeSafe: boolean; usage?: TypeSafeUsage; model?: string }> {
  if (!items || items.length === 0) {
    return { items: [], usedTypeSafe: false };
  }

  // Construct batch questions for each item
  const questions: Record<string, any> = {};
  items.forEach((item, idx) => {
    questions[`cat_${idx}`] = {
      type: 'choice',
      instructions: `Which grocery/pantry category does "${item.name}" belong to?`,
      criteria: {
        'Beverages': 'Cold drinks, sodas, seltzers, sparkling water, energy drinks, kombucha, fruit juices, bottled water',
        'Coffee & Tea': 'Coffee beans, grounds, cold brew, espresso, tea bags, matcha, chai, coffee creamers, milk substitutes for coffee',
        'Snacks': 'Chips, pretzels, popcorn, protein bars, granola bars, nuts, dried fruits, candy, cookies, chocolates',
        'Pantry & Fresh': 'Fresh fruit, bread, bagels, cream cheese, yogurt, dairy milk, condiments, instant noodles, oatmeal, sandwiches, fresh food',
        'Household': 'Paper towels, napkins, disposable cups, plates, forks, spoons, trash bags, dish soap, sponges, cleaning wipes'
      }
    };
    questions[`is_item_${idx}`] = {
      type: 'noul',
      instructions: `Is "${item.name}" an edible grocery product or breakroom consumable supply?`,
      criteria: {
        'true': 'A purchasable grocery item, food, beverage, snack, or pantry supply',
        'false': 'Sales tax line, bottle deposit fee, receipt subtotal, coupons/discounts, or store metadata'
      }
    };
  });

  const response = await callTypeSafeSystemOne({
    apiKey,
    state: {
      source: 'grocery_restock_haul',
      item_count: items.length,
      item_names: items.map(i => i.name)
    },
    questions
  });

  if (!response || !response.answers) {
    return { items, usedTypeSafe: false };
  }

  const enhancedItems: ParsedHaulItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = { ...items[i] };
    const catAnswer = response.answers[`cat_${i}`] as TypeSafeAnswerChoice | undefined;
    const isItemAnswer = response.answers[`is_item_${i}`] as TypeSafeAnswerNoul | undefined;

    // Filter out non-grocery lines if probability is clearly low (< 0.2)
    if (isItemAnswer && typeof isItemAnswer.noul === 'number' && isItemAnswer.noul < 0.2) {
      continue;
    }

    if (catAnswer && catAnswer.type === 'choice' && catAnswer.choice) {
      item.category = catAnswer.choice;
      item.confidence = catAnswer.confidence;
    }

    enhancedItems.push(item);
  }

  return {
    items: enhancedItems.length > 0 ? enhancedItems : items,
    usedTypeSafe: true,
    usage: response.usage,
    model: response.model
  };
}

/**
 * Match a candidate item name against existing pantry inventory to prevent duplicate items.
 * Uses TypeSafe choice primitive with an escape hatch ("NONE").
 */
export async function matchCatalogItemWithTypeSafe(
  candidateName: string,
  existingItems: Array<{ id: string; name: string; category?: string }>,
  apiKey: string
): Promise<{ matchedItemId: string | null; confidence: number; usage?: TypeSafeUsage; model?: string }> {
  if (!existingItems || existingItems.length === 0 || !candidateName.trim()) {
    return { matchedItemId: null, confidence: 0 };
  }

  // Cap candidates to the 20 closest matches to stay within prompt efficiency
  const topCandidates = existingItems.slice(0, 25);
  const criteria: Record<string, string | null> = {
    'none': 'None of the existing pantry items match this product; it is a new or distinct SKU.'
  };

  topCandidates.forEach(cand => {
    criteria[cand.id] = `Item: "${cand.name}" (Category: ${cand.category || 'General'})`;
  });

  const response = await callTypeSafeSystemOne({
    apiKey,
    state: {
      candidateRestockItem: candidateName
    },
    questions: {
      match: {
        type: 'choice',
        instructions: `Does the restock item "${candidateName}" refer to the same grocery item as any existing pantry item? Choose "none" if different.`,
        criteria
      }
    }
  });

  if (!response || !response.answers || !response.answers.match) {
    return { matchedItemId: null, confidence: 0, usage: response?.usage, model: response?.model };
  }

  const matchAnswer = response.answers.match as TypeSafeAnswerChoice;
  if (matchAnswer.type === 'choice' && matchAnswer.choice && matchAnswer.choice !== 'none') {
    return {
      matchedItemId: matchAnswer.choice,
      confidence: matchAnswer.confidence || 0,
      usage: response.usage,
      model: response.model
    };
  }

  return { matchedItemId: null, confidence: matchAnswer.confidence || 0, usage: response.usage, model: response.model };
}

/**
 * Uses TypeSafe System One to intelligently determine whether items from receipts
 * are multi-packs (e.g. 6-packs, 12-packs) and what their individual consumable unit is.
 */
export async function resolveReceiptPackAndCategoryWithTypeSafe(
  items: Array<{
    name: string;
    category?: string;
    costPerUnit: number;
    totalCost: number;
    quantity: number;
    unitName?: string;
    isPack?: boolean;
    packQuantity?: number;
    upc?: string | null;
  }>,
  apiKey: string
): Promise<{ items: any[]; usedTypeSafe: boolean; usage?: TypeSafeUsage; model?: string }> {
  if (!items || items.length === 0) {
    return { items: [], usedTypeSafe: false };
  }

  const questions: Record<string, any> = {};
  items.forEach((item, idx) => {
    questions[`pack_${idx}`] = {
      type: 'choice',
      instructions: `Is the grocery item "${item.name}" (price $${item.totalCost}) a multi-pack or individual item?`,
      criteria: {
        'single': 'A single individual bottle, can, snack, or supply (quantity 1)',
        'pack_6': 'A 6-pack (contains 6 individual consumable bottles or cans)',
        'pack_12': 'A 12-pack (contains 12 individual consumable cans or items)',
        'pack_24': 'A 24-pack or case (contains 24 individual consumable bottles or cans)',
        'pack_4': 'A 4-pack (contains 4 individual items)',
        'pack_8': 'An 8-pack (contains 8 individual cans/bottles)',
        'other': 'Other quantity'
      }
    };
    questions[`unit_${idx}`] = {
      type: 'choice',
      instructions: `What is the single consumable unit type for "${item.name}"?`,
      criteria: {
        'bottle': 'Bottle (water, soda, juice, tea, cold brew)',
        'can': 'Can (soda, seltzer, sparkling water, energy drink)',
        'bar': 'Bar (granola, protein, candy)',
        'bag': 'Bag (chips, pretzels, popcorn)',
        'box': 'Box (crackers, cookies)',
        'carton': 'Carton (milk, creamer, juice)',
        'unit': 'General item'
      }
    };
  });

  const response = await callTypeSafeSystemOne({
    apiKey,
    state: {
      source: 'receipt_pack_resolution',
      items: items.map(i => ({ name: i.name, totalCost: i.totalCost, quantity: i.quantity, upc: i.upc }))
    },
    questions
  });

  if (!response || !response.answers) {
    return { items, usedTypeSafe: false, usage: response?.usage, model: response?.model };
  }

  const resolved = items.map((item, idx) => {
    const packAns = response.answers[`pack_${idx}`] as TypeSafeAnswerChoice | undefined;
    const unitAns = response.answers[`unit_${idx}`] as TypeSafeAnswerChoice | undefined;

    let qty = item.quantity;
    let isPack = item.isPack || false;
    let packQuantity = item.packQuantity || (isPack ? qty : 1);
    let unitName = item.unitName || 'unit';
    let costPerUnit = item.costPerUnit;

    if (unitAns && unitAns.type === 'choice' && unitAns.choice && unitName === 'unit') {
      unitName = unitAns.choice;
    }

    if (packAns && packAns.type === 'choice' && packAns.choice && packAns.confidence > 0.5) {
      if (packAns.choice === 'pack_6' && (qty === 1 || qty === 5 || qty === 7)) {
        qty = 6;
        packQuantity = 6;
        isPack = true;
        if (unitName === 'unit') unitName = 'bottle';
        if (item.totalCost > 0) costPerUnit = Number((item.totalCost / 6).toFixed(2));
      } else if (packAns.choice === 'pack_12' && (qty === 1 || (qty >= 9 && qty <= 14))) {
        qty = 12;
        packQuantity = 12;
        isPack = true;
        if (unitName === 'unit') unitName = 'can';
        if (item.totalCost > 0) costPerUnit = Number((item.totalCost / 12).toFixed(2));
      } else if (packAns.choice === 'pack_24' && (qty === 1 || (qty >= 20 && qty <= 26))) {
        qty = 24;
        packQuantity = 24;
        isPack = true;
        if (unitName === 'unit') unitName = 'bottle';
        if (item.totalCost > 0) costPerUnit = Number((item.totalCost / 24).toFixed(2));
      } else if (packAns.choice === 'pack_4' && (qty === 1 || qty === 3)) {
        qty = 4;
        packQuantity = 4;
        isPack = true;
        if (item.totalCost > 0) costPerUnit = Number((item.totalCost / 4).toFixed(2));
      } else if (packAns.choice === 'pack_8' && (qty === 1 || qty === 7)) {
        qty = 8;
        packQuantity = 8;
        isPack = true;
        if (unitName === 'unit') unitName = 'can';
        if (item.totalCost > 0) costPerUnit = Number((item.totalCost / 8).toFixed(2));
      }
    }

    return {
      ...item,
      quantity: qty,
      isPack,
      packQuantity,
      unitName,
      costPerUnit
    };
  });

  return { items: resolved, usedTypeSafe: true, usage: response.usage, model: response.model };
}

/**
 * Uses TypeSafe System One to intelligently classify whether items are taxable or tax-exempt.
 * Used when receipt tax flags are absent or ambiguous, providing typed semantic judgments.
 */
export async function resolveItemTaxabilityWithTypeSafe(
  items: Array<{
    name: string;
    category?: string;
    costPerUnit: number;
    totalCost: number;
    quantity: number;
    isTaxed?: boolean;
    taxFlag?: string | null;
  }>,
  apiKey: string
): Promise<{ items: any[]; usedTypeSafe: boolean; usage?: TypeSafeUsage; model?: string }> {
  if (!items || items.length === 0) {
    return { items: [], usedTypeSafe: false };
  }

  // Only query TypeSafe for items whose taxability is not already explicitly known
  const questions: Record<string, any> = {};
  items.forEach((item, idx) => {
    if (item.isTaxed === undefined) {
      questions[`tax_${idx}`] = {
        type: 'choice',
        instructions: `Is the retail breakroom/grocery item "${item.name}" typically subject to sales tax or exempt as a grocery staple?`,
        criteria: {
          'taxed': 'Taxable retail item (household supplies, paper towels, disposable cutlery/plates/cups, trash bags, candy/confections, alcoholic beverages, or taxed prepared foods)',
          'exempt': 'Tax-exempt grocery staple (fresh produce, whole fruit, vegetables, raw ingredients, dairy milk, eggs, bread, pantry basics)'
        }
      };
    }
  });

  if (Object.keys(questions).length === 0) {
    return { items, usedTypeSafe: false };
  }

  const response = await callTypeSafeSystemOne({
    apiKey,
    state: {
      source: 'receipt_item_taxability',
      items: items.map(i => ({ name: i.name, category: i.category, totalCost: i.totalCost }))
    },
    questions
  });

  if (!response || !response.answers) {
    return { items, usedTypeSafe: false, usage: response?.usage, model: response?.model };
  }

  const updatedItems = items.map((item, idx) => {
    const taxAns = response.answers[`tax_${idx}`] as TypeSafeAnswerChoice | undefined;
    if (taxAns && taxAns.type === 'choice' && taxAns.choice) {
      return {
        ...item,
        isTaxed: taxAns.choice === 'taxed'
      };
    }
    return item;
  });

  return { items: updatedItems, usedTypeSafe: true, usage: response.usage, model: response.model };
}
