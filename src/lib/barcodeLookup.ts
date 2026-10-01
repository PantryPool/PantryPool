import { 
  getUpcCandidates, 
  lookupRetailProductByBarcode, 
  parsePackAndUnitInfo 
} from '../shared/barcodeUtils';

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand?: string;
  category: 'Beverages' | 'Snacks' | 'Coffee & Tea' | 'Pantry & Fresh' | 'Household';
  imageUrl?: string;
  servingSize?: string;
  isGlutenFree?: boolean;
  isVegan?: boolean;
  suggestedUnit?: string;
  suggestedIcon?: string;
  isPack?: boolean;
  packQuantity?: number;
  packDescription?: string;
}

// In-memory client cache
const barcodeMemoryCache = new Map<string, BarcodeProduct>();

function mapCategory(categoriesTags: string[] = [], categoryName = ''): BarcodeProduct['category'] {
  const combined = (categoriesTags.join(' ') + ' ' + categoryName).toLowerCase();
  
  if (combined.includes('beverage') || combined.includes('drink') || combined.includes('soda') || combined.includes('water') || combined.includes('juice') || combined.includes('seltzer')) {
    return 'Beverages';
  }
  if (combined.includes('coffee') || combined.includes('tea') || combined.includes('espresso') || combined.includes('matcha')) {
    return 'Coffee & Tea';
  }
  if (combined.includes('fruit') || combined.includes('fresh') || combined.includes('milk') || combined.includes('yogurt') || combined.includes('cheese') || combined.includes('bread') || combined.includes('dairy')) {
    return 'Pantry & Fresh';
  }
  if (combined.includes('snack') || combined.includes('chip') || combined.includes('cookie') || combined.includes('bar') || combined.includes('chocolate') || combined.includes('candy') || combined.includes('nut') || combined.includes('popcorn')) {
    return 'Snacks';
  }
  return 'Snacks';
}

export function inferUnitAndIcon(name: string, category: string, packaging = ''): { unit: string; icon: string } {
  const packInfo = parsePackAndUnitInfo(name, packaging);
  return { unit: packInfo.unitName, icon: packInfo.suggestedIcon };
}

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  const cleanBarcode = barcode.trim().replace(/[^0-9]/g, '');
  if (!cleanBarcode || cleanBarcode.length < 6) {
    return null;
  }

  // 1. Check client memory cache
  if (barcodeMemoryCache.has(cleanBarcode)) {
    return barcodeMemoryCache.get(cleanBarcode)!;
  }

  // 2. Try Edge API endpoint first
  try {
    const edgeRes = await fetch(`/api/barcodes/lookup?upc=${encodeURIComponent(cleanBarcode)}`);
    if (edgeRes.ok) {
      const data = await edgeRes.json();
      if (data && data.success && data.product) {
        const prod: BarcodeProduct = {
          barcode: cleanBarcode,
          name: data.product.name || 'Unknown Item',
          brand: data.product.brand,
          category: data.product.category || 'Snacks',
          suggestedUnit: data.product.suggestedUnit,
          suggestedIcon: data.product.suggestedIcon,
          isPack: data.product.isPack,
          packQuantity: data.product.packQuantity,
          packDescription: data.product.packDescription,
          imageUrl: data.product.imageUrl,
          servingSize: data.product.servingSize,
          isGlutenFree: data.product.isGlutenFree,
          isVegan: data.product.isVegan,
        };
        barcodeMemoryCache.set(cleanBarcode, prod);
        return prod;
      }
    }
  } catch (err) {
    // Edge API unavailable; fallback to offline registry and Open Food Facts v2
  }

  // 3. Fallback direct query to Open Food Facts API v2
  try {
    const fetchDirect = async (code: string) => {
      const fields = 'code,product_name,product_name_en,generic_name,brands,brand_owner,categories,categories_tags,packaging,packagings,quantity,product_quantity,serving_size,image_url,image_front_url,labels_tags';
      const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`, {
        headers: {
          'User-Agent': 'PantryPool/2.0 (Web/Linux; +https://pantrypool.com; contact@pantrypool.com)',
        },
      });
      if (!offRes.ok) return null;
      const offData = await offRes.json();
      return (offData && offData.status === 1 && offData.product) ? offData.product : null;
    };

    const candidates = getUpcCandidates(cleanBarcode);
    let p: any = null;
    for (const cand of candidates) {
      p = await fetchDirect(cand);
      if (p) break;
    }

    if (p) {
      const name = p.product_name || p.product_name_en || p.generic_name || 'Scanned Retail Item';
      const brand = p.brands || p.brand_owner || '';
      const category = mapCategory(p.categories_tags, p.categories);
      const imageUrl = p.image_front_url || p.image_url || undefined;
      const servingSize = p.serving_size || p.quantity || undefined;
      
      const labels = (p.labels_tags || []).join(' ').toLowerCase();
      const isGlutenFree = labels.includes('gluten-free');
      const isVegan = labels.includes('vegan');

      const packInfo = parsePackAndUnitInfo(
        brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
        p.packaging || '',
        p.quantity || ''
      );

      const product: BarcodeProduct = {
        barcode: cleanBarcode,
        name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
        brand,
        category,
        suggestedUnit: packInfo.unitName,
        suggestedIcon: packInfo.suggestedIcon,
        isPack: packInfo.isPack,
        packQuantity: packInfo.packQuantity,
        packDescription: packInfo.packDescription,
        imageUrl,
        servingSize,
        isGlutenFree,
        isVegan,
      };

      barcodeMemoryCache.set(cleanBarcode, product);
      return product;
    }
  } catch (directErr) {
    console.warn('[Barcode Lookup Error]', directErr);
  }

  // 4. Check local retail registry (offline fallback)
  const retailMatch = lookupRetailProductByBarcode(cleanBarcode);
  if (retailMatch) {
    const prod: BarcodeProduct = {
      barcode: cleanBarcode,
      name: retailMatch.name,
      brand: retailMatch.brand,
      category: retailMatch.category,
      suggestedUnit: retailMatch.suggestedUnit,
      suggestedIcon: retailMatch.suggestedIcon,
      isPack: retailMatch.isPack,
      packQuantity: retailMatch.packQuantity,
      packDescription: retailMatch.packDescription,
    };
    barcodeMemoryCache.set(cleanBarcode, prod);
    return prod;
  }

  return null;
}
