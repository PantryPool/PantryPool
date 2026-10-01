/**
 * Money and exact integer-cents arithmetic utilities for PantryPool.
 * Eliminates IEEE-754 floating-point drift across ledgers, transactions, and balances.
 */

/**
 * Converts a dollar/float currency amount to exact integer cents.
 * Handles precision rounding up to 4 decimal places before integer conversion.
 */
export function toCents(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined) return 0;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || !isFinite(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Converts integer cents back to dollar representation (2 decimal float).
 */
export function toDollars(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || isNaN(cents)) return 0.00;
  return Number((cents / 100).toFixed(2));
}

/**
 * Formats integer cents as a human-readable currency string.
 */
export function formatCents(
  cents: number | null | undefined,
  currencySymbol = '$',
  showPositiveSign = false
): string {
  const dollars = toDollars(cents);
  const sign = dollars > 0 && showPositiveSign ? '+' : '';
  return `${sign}${currencySymbol}${dollars.toFixed(2)}`;
}

/**
 * Performs exact integer addition across multiple currency values.
 */
export function addMoney(...amounts: (number | string)[]): number {
  return amounts.reduce<number>((acc, curr) => acc + toCents(curr), 0);
}

/**
 * Multiplies unit cost (in cents or dollars) by integer quantity.
 */
export function multiplyMoney(unitAmount: number | string, quantity: number): number {
  const unitCents = toCents(unitAmount);
  const qty = Number.isInteger(quantity) ? quantity : Math.round(quantity);
  return unitCents * qty;
}

/**
 * Verifies that a ledger balance change preserves the zero-sum invariant.
 */
export function verifyZeroSumInvariant(
  startingTotalCents: number,
  creditsCents: number,
  debitsCents: number,
  endingTotalCents: number
): boolean {
  return startingTotalCents + creditsCents - debitsCents === endingTotalCents;
}
