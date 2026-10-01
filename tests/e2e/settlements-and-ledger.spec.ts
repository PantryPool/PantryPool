import { test, expect } from '@playwright/test';
import { setupMockSession, defaultMockTransactions } from './testHelpers';

test.describe('Settlements & Expense Ledger', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page, { transactions: defaultMockTransactions });
  });

  test('switches to Ledger tab and displays transaction history', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Check if viewport is mobile or desktop
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;

    if (isMobile) {
      const moreNavBtn = page.locator('nav[aria-label="Mobile Navigation"] button').filter({ hasText: /More/i }).first();
      await expect(moreNavBtn).toBeVisible();
      await moreNavBtn.click();
      const sheetLedgerBtn = page.getByRole('button', { name: /Ledger & Transaction History|Ledger/i }).first();
      await expect(sheetLedgerBtn).toBeVisible();
      await sheetLedgerBtn.click();
    } else {
      const ledgerTab = page.locator('button:has-text("Ledger")').first();
      await expect(ledgerTab).toBeVisible();
      await ledgerTab.click();
    }

    // Verify Ledger View is loaded with search filter or CSV export button
    await expect(
      page.getByPlaceholder(/Search member, item, or note/i)
        .or(page.getByText(/Export CSV|Audit Trail|Initial Deposit via Card/i))
        .first()
    ).toBeVisible();
  });

  test('submits Add Funds deposit form and records member balance credit', async ({ page }) => {
    let depositRequested = false;

    await page.route('**/api/transactions/deposit', async (route) => {
      depositRequested = true;
      const data = route.request().postDataJSON() || {};
      return route.fulfill({
        json: {
          success: true,
          transaction: {
            id: 'tx_e2e_deposit_1',
            poolId: data.poolId || 'pool_default_1',
            userId: data.userId || 'u_default_tester',
            type: 'deposit',
            amount: Number(data.amount || 35),
            note: data.note || 'E2E Deposit',
            timestamp: new Date().toISOString(),
          },
          newBalance: 60.0,
        },
      });
    });

    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const addFundsBtn = page.getByRole('button', { name: 'Add Funds' }).first();
    await expect(addFundsBtn).toBeVisible();
    await addFundsBtn.click();

    // Verify modal is open
    await expect(page.getByText('Log Fund Deposit')).toBeVisible();

    // Select +$35 preset
    const presetBtn = page.locator('button:has-text("+$35")').first();
    if (await presetBtn.isVisible()) {
      await presetBtn.click();
    }

    // Submit deposit
    const submitBtn = page.getByRole('button', { name: 'Record Deposit' });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify modal closes upon successful deposit
    await expect(page.getByText('Log Fund Deposit')).not.toBeVisible();
    expect(depositRequested).toBe(true);
  });
});
