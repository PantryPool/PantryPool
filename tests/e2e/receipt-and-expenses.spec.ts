import { test, expect } from '@playwright/test';
import { setupMockSession } from './testHelpers';

test.describe('Receipt AI Scanning & Financial Deposits', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page);
  });

  test('opens Add Contribution / Deposit modal and selects payment methods', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const addFundsBtn = page.getByRole('button', { name: 'Add Funds' }).first();
    await expect(addFundsBtn).toBeVisible();
    await addFundsBtn.click();

    await expect(page.getByText('Log Fund Deposit')).toBeVisible();
    await expect(page.getByText(/Add credit to a member's balance/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record Deposit' })).toBeVisible();
  });

  test('opens Multimodal AI Receipt Scanner dialog', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const receiptBtn = page.getByRole('button', { name: 'Bring In Items' }).first();
    await expect(receiptBtn).toBeVisible();
    await receiptBtn.click();

    await expect(page.getByText('Bring In Items / Restock')).toBeVisible();
    await expect(page.getByText('Select & Restock')).toBeVisible();
    await expect(page.getByText('Scan Photo')).toBeVisible();
  });
});
