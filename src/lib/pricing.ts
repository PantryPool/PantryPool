/**
 * Inventory Pricing & Cost Accounting Utilities
 * Implements Weighted Moving Average (Blended Cost) for communal pantry pools.
 */

/**
 * Calculates the weighted moving average cost per unit for an inventory item.
 * 
 * Formula:
 * New Price = ((Existing Stock * Current Price) + (Added Qty * Purchase Price)) / (Existing Stock + Added Qty)
 * 
 * Rules:
 * 1. If existing stock <= 0, new price is the purchase price.
 * 2. If purchase price <= 0, existing price is preserved.
 * 3. Results are rounded to 2 decimal currency places.
 */
export function calculateMovingAveragePrice(
  currentStock: number,
  currentPrice: number,
  addedQuantity: number,
  purchasePrice: number
): number {
  const safeCurrentStock = Math.max(0, currentStock);
  const safeCurrentPrice = Math.max(0, currentPrice);
  const safeAddedQty = Math.max(0, addedQuantity);
  const safePurchasePrice = Math.max(0, purchasePrice);

  if (safeAddedQty === 0) return safeCurrentPrice;
  if (safePurchasePrice === 0) return safeCurrentPrice;
  if (safeCurrentStock === 0) return Number(safePurchasePrice.toFixed(2));

  const totalExistingValue = safeCurrentStock * safeCurrentPrice;
  const totalAddedValue = safeAddedQty * safePurchasePrice;
  const totalUnits = safeCurrentStock + safeAddedQty;

  if (totalUnits === 0) return safePurchasePrice;

  return Number(((totalExistingValue + totalAddedValue) / totalUnits).toFixed(2));
}
