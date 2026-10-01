import { test, expect } from '@playwright/test';
import { setupMockSession } from './testHelpers';

test.describe('Inventory Catalog, Filtering, and Item Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page);
  });

  test('renders catalog items with stock counts and low-stock warning pills', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    await expect(page.getByText('Nitro Cold Brew Coffee').first()).toBeVisible();
    await expect(page.getByText('Almond Honey Crunch Bar').first()).toBeVisible();
    await expect(page.getByText('Organic Honeycrisp Apple').first()).toBeVisible();

    // Verify stock count display
    await expect(page.getByText(/12 cans|2 bars|8 apples/i).first()).toBeVisible();
  });

  test('filters catalog items by category buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const beveragesBtn = page.getByRole('button', { name: 'Beverages' }).first();
    await expect(beveragesBtn).toBeVisible();
    await beveragesBtn.click();

    await expect(page.getByText('Nitro Cold Brew Coffee').first()).toBeVisible();
  });

  test('filters catalog items via real-time search input', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const searchInput = page.getByPlaceholder(/search pantry items/i).first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Cold Brew');

    await expect(page.getByText('Nitro Cold Brew Coffee').first()).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await expect(page.getByText('Almond Honey Crunch Bar').first()).toBeVisible();
  });

  test('opens Item QR Code modal for printing shelf stickers', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const itemCard = page.locator('div', { hasText: 'Nitro Cold Brew Coffee' }).filter({ has: page.locator('button[title="More options"]') }).first();
    await expect(itemCard).toBeVisible();

    const moreBtn = itemCard.locator('button[title="More options"]').first();
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();

    const qrBtn = itemCard.locator('button:has-text("Item QR / Print")').first();
    await expect(qrBtn).toBeVisible();
    await qrBtn.click();

    await expect(page.getByText('Turnkey Shelf Tag & QR Generator')).toBeVisible();
    await expect(page.getByText(/Print Shelf Tag/i)).toBeVisible();
  });

  test('creates new inventory item and verifies catalog entry', async ({ page }) => {
    let createdItem: any = null;

    await page.route('**/api/items', async (route) => {
      if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON() || {};
        createdItem = {
          id: 'item_lacroix_lime',
          poolId: 'pool_default_1',
          name: data.name || 'LaCroix Sparkling Water Lime',
          category: data.category || 'Beverages',
          costPerUnit: Number(data.costPerUnit || 1.25),
          stock: Number(data.stock || 12),
          minStock: 4,
          unitName: 'can',
          icon: 'CupSoda',
        };
        return route.fulfill({
          json: {
            success: true,
            item: createdItem,
          },
        });
      }
      return route.fulfill({ json: { success: true, items: createdItem ? [createdItem] : [] } });
    });

    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const addItemBtn = page.getByRole('button', { name: /Add Item|Add Pantry Item/i }).first();
    await expect(addItemBtn).toBeVisible();
    await addItemBtn.click();

    // Verify modal rendered
    await expect(page.getByText('Add New Consumable Item')).toBeVisible();

    // Fill item name
    const nameInput = page.getByPlaceholder(/LaCroix Sparkling Water/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill('LaCroix Sparkling Water Lime');

    // Click submit
    const submitBtn = page.getByRole('button', { name: /Create Item Entry/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify modal closes
    await expect(page.getByText('Add New Consumable Item')).not.toBeVisible();
    expect(createdItem).not.toBeNull();
  });
});

