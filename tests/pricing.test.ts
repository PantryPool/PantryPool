import { describe, it, expect } from 'vitest';
import { calculateMovingAveragePrice } from '../src/lib/pricing';

describe('Inventory Weighted Moving Average Pricing', () => {
  it('correctly blends existing inventory with a new restock haul', () => {
    // Example: 4 cans in fridge valued at $0.75 ($3.00), user brings in 6-pack for $6.00 ($1.00/ea).
    // Total value = $3.00 + $6.00 = $9.00. Total units = 10.
    // Blended price = $9.00 / 10 = $0.90 / can.
    const blended = calculateMovingAveragePrice(4, 0.75, 6, 1.00);
    expect(blended).toBe(0.90);
  });

  it('handles empty/depleted stock by adopting the new purchase price directly', () => {
    // 0 cans in stock, bringing in 12 cans @ $1.25/ea
    const price = calculateMovingAveragePrice(0, 0.75, 12, 1.25);
    expect(price).toBe(1.25);
  });

  it('preserves existing price when added quantity is 0', () => {
    const price = calculateMovingAveragePrice(10, 1.50, 0, 2.00);
    expect(price).toBe(1.50);
  });

  it('preserves existing price when purchase price is 0 (e.g. promotional gift/donation)', () => {
    const price = calculateMovingAveragePrice(5, 2.00, 5, 0.00);
    expect(price).toBe(2.00);
  });

  it('rounds accurately to 2 decimal places on fractional repeating values', () => {
    // 2 units @ $1.00 ($2.00) + 1 unit @ $2.00 ($2.00) = $4.00 / 3 units = $1.3333... -> $1.33
    const price = calculateMovingAveragePrice(2, 1.00, 1, 2.00);
    expect(price).toBe(1.33);
  });
});
