import { test, expect } from '@playwright/test';
import { setupMockSession } from './testHelpers';

test.describe('Consumption & Breakroom Tablet Kiosk Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page);

    // Mock consumption API
    await page.route('**/api/items/consume', (route) =>
      route.fulfill({
        json: {
          success: true,
          remainingStock: 11,
          cost: 3.0,
          newBalance: 22.0,
        },
      })
    );
  });

  test('performs 1-click self-serve consumption on item card', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const coldBrewCard = page.locator('div', { hasText: 'Nitro Cold Brew Coffee' }).filter({ has: page.locator('button:has-text("Grab 1")') }).first();
    await expect(coldBrewCard).toBeVisible();
    await expect(coldBrewCard.getByText('12 cans')).toBeVisible();

    const consumeBtn = coldBrewCard.locator('button:has-text("Grab 1")').first();
    await expect(consumeBtn).toBeVisible();
    await consumeBtn.click();

    // Verify stock decrements immediately on screen to 11 cans
    await expect(coldBrewCard.getByText('11 cans')).toBeVisible();
  });

  test('opens Breakroom Consumption Kiosk modal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Open via hash navigation
    await page.evaluate(() => { window.location.hash = 'kiosk'; });

    // Verify kiosk modal is visible with header and members list
    await expect(page.getByText('Breakroom Quick Kiosk')).toBeVisible();
    await expect(page.getByText(/Select Member/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Exit Kiosk/i })).toBeVisible();
  });

  test('opens Stock Discrepancy Reporting dialog for stock mismatch audits', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Locate the first item card and open its context menu
    const itemCard = page.locator('div', { hasText: 'Nitro Cold Brew Coffee' }).filter({ has: page.locator('button[title="More options"]') }).first();
    await expect(itemCard).toBeVisible();

    const moreBtn = itemCard.locator('button[title="More options"]').first();
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();

    // Click Audit / Discrepancy
    const discrepancyBtn = itemCard.locator('button:has-text("Audit / Discrepancy")').first();
    await expect(discrepancyBtn).toBeVisible();
    await discrepancyBtn.click();

    // Verify modal is open
    await expect(page.getByText('Report Stock Discrepancy')).toBeVisible();
    await expect(page.getByText('Recorded System Stock')).toBeVisible();
  });
});

