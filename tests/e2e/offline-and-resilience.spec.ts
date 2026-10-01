import { test, expect } from '@playwright/test';
import { setupMockSession } from './testHelpers';

test.describe('Offline Resilience & Local State Persistence', () => {
  test('hydrates UI immediately from local storage cache with offline fallback resilience', async ({ page }) => {
    // Pre-populate storage and mock APIs
    await setupMockSession(page);

    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Verify catalog items render immediately from hydrated state
    await expect(page.getByText('Nitro Cold Brew Coffee').first()).toBeVisible();
    await expect(page.getByText('Almond Honey Crunch Bar').first()).toBeVisible();
    await expect(page.getByText('Organic Honeycrisp Apple').first()).toBeVisible();
  });

  test('handles item API failure gracefully by falling back to local storage cache', async ({ page }) => {
    await setupMockSession(page);
    // Abort backend items API to simulate catalog sync failure while user is authenticated
    await page.route('**/api/items**', (route) => route.abort('failed'));

    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Verify catalog items still render immediately from local storage cache
    await expect(page.getByText('Nitro Cold Brew Coffee').first()).toBeVisible();
    await expect(page.getByText('Almond Honey Crunch Bar').first()).toBeVisible();
    await expect(page.getByText('Organic Honeycrisp Apple').first()).toBeVisible();
  });
});
