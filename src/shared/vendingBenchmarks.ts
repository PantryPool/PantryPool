export type MetroTier = 'baseline' | 'standard' | 'high';

export interface VendingBenchmarkItem {
  category: string;
  name: string;
  keywords: string[];
  benchmarks: {
    baseline: number; // in cents (e.g. 175 = $1.75)
    standard: number; // in cents (e.g. 200 = $2.00)
    high: number;     // in cents (e.g. 250 = $2.50)
  };
}

export interface MetroTierInfo {
  id: MetroTier;
  label: string;
  description: string;
  examples: string;
  samplePrices: {
    soda: number;       // e.g. 175
    candyBar: number;   // e.g. 200
    energyDrink: number;// e.g. 375
    chips: number;      // e.g. 185
  };
}

export const METRO_TIERS: Record<MetroTier, MetroTierInfo> = {
  baseline: {
    id: 'baseline',
    label: 'National Baseline / Small Town',
    description: 'Affordable or rural vending rates and institutional breakrooms',
    examples: 'Rural areas, small towns, community centers',
    samplePrices: {
      soda: 150,
      candyBar: 175,
      energyDrink: 300,
      chips: 150,
    }
  },
  standard: {
    id: 'standard',
    label: 'Standard Metro / Suburban (Most Common)',
    description: 'Typical corporate breakroom or commercial office building vending machines',
    examples: 'Dallas, Atlanta, Denver, Phoenix, suburbs, mid-sized cities',
    samplePrices: {
      soda: 175,
      candyBar: 200,
      energyDrink: 375,
      chips: 185,
    }
  },
  high: {
    id: 'high',
    label: 'High-Cost Metro / Tech Hub',
    description: 'Premium downtown commercial high-rises, airports, and major urban centers',
    examples: 'New York City, San Francisco, Seattle, Boston, Los Angeles',
    samplePrices: {
      soda: 225,
      candyBar: 250,
      energyDrink: 450,
      chips: 225,
    }
  }
};

export const CATEGORY_DEFAULT_BENCHMARKS: Record<string, Record<MetroTier, number>> = {
  'Beverages': { baseline: 175, standard: 200, high: 250 },
  'Snacks': { baseline: 165, standard: 195, high: 240 },
  'Coffee & Tea': { baseline: 150, standard: 200, high: 275 },
  'Pantry & Fresh': { baseline: 200, standard: 250, high: 325 },
  'Household': { baseline: 150, standard: 200, high: 250 },
};

export const VENDING_BENCHMARK_CATALOG: VendingBenchmarkItem[] = [
  // Energy Drinks
  {
    category: 'Beverages',
    name: 'Energy Drink (16oz)',
    keywords: ['monster', 'red bull', 'celsius', 'rockstar', 'reign', 'ghost', 'alani', 'c4', 'bang', 'energy'],
    benchmarks: { baseline: 300, standard: 375, high: 450 }
  },
  // Bottled Drinks & Iced Teas
  {
    category: 'Beverages',
    name: 'Bottled Soda / Iced Tea (20oz)',
    keywords: ['bottle', '20oz', 'snapple', 'arizona', 'gold peak', 'pure leaf', 'gatorade', 'powerade'],
    benchmarks: { baseline: 225, standard: 275, high: 325 }
  },
  // Canned Sodas
  {
    category: 'Beverages',
    name: 'Canned Soda (12oz)',
    keywords: ['coke', 'pepsi', 'sprite', 'dr pepper', 'mountain dew', 'cola', 'fanta', 'can', 'soda', 'ginger ale', 'root beer'],
    benchmarks: { baseline: 150, standard: 175, high: 225 }
  },
  // Sparkling Waters
  {
    category: 'Beverages',
    name: 'Sparkling Water / Seltzer (12oz)',
    keywords: ['lacroix', 'spindrift', 'bubly', 'polar', 'waterloo', 'sparkling', 'seltzer', 'liquid death'],
    benchmarks: { baseline: 150, standard: 175, high: 225 }
  },
  // Bottled Water
  {
    category: 'Beverages',
    name: 'Bottled Spring Water (16.9oz)',
    keywords: ['water', 'aquafina', 'dasani', 'poland spring', 'smartwater', 'fiji', 'evian'],
    benchmarks: { baseline: 125, standard: 175, high: 225 }
  },
  // Candy Bars & Chocolates
  {
    category: 'Snacks',
    name: 'Candy Bar (Standard Size)',
    keywords: ['snickers', 'twix', 'kit kat', 'reese', 'm&m', 'hershey', 'milky way', 'skittles', 'starburst', 'butterfinger', 'crunch', 'candy', 'chocolate'],
    benchmarks: { baseline: 175, standard: 200, high: 250 }
  },
  // Chips & Savory Snacks
  {
    category: 'Snacks',
    name: 'Chips & Pretzels (1.5-2oz Bag)',
    keywords: ['chips', 'doritos', 'lays', 'cheetos', 'fritos', 'ruffles', 'pretzels', 'popcorn', 'sun chips', 'smartfood', 'pirate bootie', 'pringles'],
    benchmarks: { baseline: 150, standard: 185, high: 225 }
  },
  // Protein & Nutritional Bars
  {
    category: 'Snacks',
    name: 'Protein / Nutrition Bar',
    keywords: ['protein', 'clif', 'kind', 'quest', 'rxbar', 'granola bar', 'nature valley', 'one bar', 'think!', 'bar'],
    benchmarks: { baseline: 225, standard: 275, high: 350 }
  },
  // Jerky & Meat Sticks
  {
    category: 'Snacks',
    name: 'Beef Jerky & Meat Snacks',
    keywords: ['jerky', 'slim jim', 'chomps', 'jack link', 'meat stick', 'beef'],
    benchmarks: { baseline: 275, standard: 350, high: 450 }
  },
  // Cookies & Pastries
  {
    category: 'Snacks',
    name: 'Pastries & Cookies',
    keywords: ['pop-tart', 'poptart', 'cookie', 'cookies', 'oreo', 'brownie', 'grandma', 'pastry', 'donut', 'honey bun'],
    benchmarks: { baseline: 175, standard: 200, high: 250 }
  },
  // Nuts & Trail Mix
  {
    category: 'Snacks',
    name: 'Nuts & Trail Mix',
    keywords: ['almonds', 'peanuts', 'cashews', 'trail mix', 'pistachios', 'nuts', 'planters'],
    benchmarks: { baseline: 185, standard: 225, high: 285 }
  },
  // Single Serve Coffee Pods
  {
    category: 'Coffee & Tea',
    name: 'Single-Serve Coffee Pod',
    keywords: ['k-cup', 'kcup', 'keurig', 'nespresso', 'pod', 'espresso', 'tea bag'],
    benchmarks: { baseline: 150, standard: 200, high: 275 }
  },
  // Instant Meals & Soups
  {
    category: 'Pantry & Fresh',
    name: 'Instant Noodles / Cup Soup',
    keywords: ['ramen', 'cup noodles', 'noodles', 'soup', 'mac & cheese', 'macaroni', 'oatmeal'],
    benchmarks: { baseline: 175, standard: 225, high: 300 }
  },
  // Fresh / Refrigerated Snacks
  {
    category: 'Pantry & Fresh',
    name: 'Yogurt & Cheese Sticks',
    keywords: ['yogurt', 'chobani', 'string cheese', 'cheese', 'hummus'],
    benchmarks: { baseline: 175, standard: 225, high: 285 }
  }
];

/**
 * Resolves an auto-suggested vending machine benchmark cost in cents for a product.
 * Heuristic inspects item name keywords, matching specific products before falling back to category defaults.
 */
export function resolveSuggestedVendingBenchmark(
  itemName: string,
  category: string = 'Snacks',
  metroTier: MetroTier = 'standard'
): number {
  const normalizedTier = (metroTier in METRO_TIERS) ? metroTier : 'standard';
  const cleanName = (itemName || '').toLowerCase().trim();

  // Try matching keyword catalog
  for (const entry of VENDING_BENCHMARK_CATALOG) {
    for (const keyword of entry.keywords) {
      if (cleanName.includes(keyword)) {
        return entry.benchmarks[normalizedTier];
      }
    }
  }

  // Fallback to category default
  const catDefaults = CATEGORY_DEFAULT_BENCHMARKS[category] || CATEGORY_DEFAULT_BENCHMARKS['Snacks'];
  return catDefaults[normalizedTier] || 200;
}
