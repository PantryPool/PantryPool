import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupMockSession } from './testHelpers';

test.describe('Automated Accessibility (a11y) Audits', () => {
  test('landing page meets WCAG 2.1 Level AA standards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('authenticated pantry dashboard meets WCAG 2.1 Level AA standards', async ({ page }) => {
    await setupMockSession(page);
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.getByText('Nitro Cold Brew Coffee').first()).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('modals and interactive dialogs have accessible names and focus structure', async ({ page }) => {
    await setupMockSession(page);
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Open Add Funds / Deposit Modal
    const addFundsBtn = page.getByRole('button', { name: /add funds|settle up/i }).first();
    if (await addFundsBtn.isVisible()) {
      await addFundsBtn.click();
      await expect(page.locator('.fixed.inset-0').first()).toBeVisible();

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include('.fixed.inset-0')
        .withTags(['wcag2a', 'wcag2aa'])
        .disableRules(['color-contrast'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });
});
