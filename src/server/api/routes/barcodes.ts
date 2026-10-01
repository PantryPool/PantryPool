import { Hono } from 'hono';
import { HonoEnv } from '../app';
import { 
  getUpcCandidates, 
  lookupRetailProductByBarcode, 
  parsePackAndUnitInfo 
} from '../../../shared/barcodeUtils';

// Server-side in-memory cache to respect OFF rate limits and cache requirements
const serverBarcodeCache = new Map<string, any>();

export function registerBarcodeRoutes(app: Hono<HonoEnv>) {
  app.get('/api/barcodes/lookup', async (c) => {
    const upc = c.req.query('upc') || c.req.query('barcode');
    if (!upc || upc.trim().length < 6) {
      return c.json({ success: false, error: 'Valid upc query parameter required.' }, 400);
    }

    const cleanUpc = upc.trim().replace(/[^0-9]/g, '');

    // 0. Check server-side cache first
    if (serverBarcodeCache.has(cleanUpc)) {
      return c.json({
        success: true,
        found: true,
        product: serverBarcodeCache.get(cleanUpc),
        cached: true,
      });
    }

    // 1. Check known retail database for instant matching (including Walmart receipts)
    const retailMatch = lookupRetailProductByBarcode(cleanUpc);
    if (retailMatch) {
      const product = {
        barcode: cleanUpc,
        name: retailMatch.name,
        brand: retailMatch.brand,
        category: retailMatch.category,
        suggestedUnit: retailMatch.suggestedUnit,
        suggestedIcon: retailMatch.suggestedIcon,
        isPack: retailMatch.isPack,
        packQuantity: retailMatch.packQuantity,
        packDescription: retailMatch.packDescription,
        isGlutenFree: false,
        isVegan: false,
      };
      if (serverBarcodeCache.size > 2000) serverBarcodeCache.clear();
      serverBarcodeCache.set(cleanUpc, product);

      return c.json({
        success: true,
        found: true,
        product
      });
    }

    // 2. Query Open Food Facts across UPC candidates
    try {
      const fetchProduct = async (code: string) => {
        const fields = 'code,product_name,product_name_en,generic_name,brands,brand_owner,categories,categories_tags,packaging,packagings,quantity,product_quantity,serving_size,image_url,image_front_url,labels_tags';
        const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`;
        const res = await fetch(offUrl, {
          headers: { 
            'User-Agent': 'PantryPool/2.0 (Web/Linux; +https://pantrypool.com; contact@pantrypool.com)' 
          }
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        return (data && data.status === 1 && data.product) ? data.product : null;
      };

      const candidates = getUpcCandidates(cleanUpc);
      let p: any = null;
      for (const cand of candidates) {
        p = await fetchProduct(cand);
        if (p) break;
      }

      if (p) {
        const categories = p.categories_tags || [];
        const rawName = p.product_name || p.product_name_en || p.generic_name || 'Unknown Item';
        const brand = p.brands || p.brand_owner || undefined;
        const fullName = brand && !rawName.toLowerCase().includes(brand.toLowerCase())
          ? `${rawName} (${brand})`
          : rawName;

        let category: 'Beverages' | 'Snacks' | 'Coffee & Tea' | 'Pantry & Fresh' | 'Household' = 'Snacks';
        const combinedCategories = (categories.join(' ') + ' ' + (p.categories || '') + ' ' + rawName).toLowerCase();
        if (combinedCategories.includes('beverage') || combinedCategories.includes('drink') || combinedCategories.includes('water') || combinedCategories.includes('soda') || combinedCategories.includes('juice') || combinedCategories.includes('seltzer')) {
          category = 'Beverages';
        } else if (combinedCategories.includes('coffee') || combinedCategories.includes('tea') || combinedCategories.includes('espresso') || combinedCategories.includes('matcha')) {
          category = 'Coffee & Tea';
        } else if (combinedCategories.includes('fresh') || combinedCategories.includes('fruit') || combinedCategories.includes('bread') || combinedCategories.includes('dairy') || combinedCategories.includes('yogurt') || combinedCategories.includes('milk')) {
          category = 'Pantry & Fresh';
        }

        // Infer unit name, icon, and pack info
        const packInfo = parsePackAndUnitInfo(fullName, p.packaging || '', p.quantity || '');

        const labels = (p.labels_tags || []).join(' ').toLowerCase();

        const product = {
          barcode: cleanUpc,
          name: fullName,
          brand,
          category,
          suggestedUnit: packInfo.unitName,
          suggestedIcon: packInfo.suggestedIcon,
          isPack: packInfo.isPack,
          packQuantity: packInfo.packQuantity,
          packDescription: packInfo.packDescription,
          imageUrl: p.image_url || p.image_front_url || undefined,
          servingSize: p.serving_size || p.quantity || undefined,
          isGlutenFree: labels.includes('gluten-free'),
          isVegan: labels.includes('vegan')
        };

        if (serverBarcodeCache.size > 2000) serverBarcodeCache.clear();
        serverBarcodeCache.set(cleanUpc, product);

        return c.json({
          success: true,
          found: true,
          product
        });
      }
    } catch {
      // Fall through to 404
    }

    return c.json({ success: false, found: false, error: 'Product not found in barcode registry.' }, 404);
  });
}
