import { test, expect } from '@playwright/test';

test.describe('Tier B: Full-Stack Live Golden Journey (Unmocked)', () => {
  test.beforeEach(async ({ page, request }) => {
    // Reset live server in-memory storage to clean state via test isolation endpoint
    const res = await request.post('http://localhost:3099/api/test/reset');
    expect(res.ok()).toBeTruthy();

    // Pre-acknowledge cookie consent so banner does not overlay modal actions
    await page.addInitScript(() => {
      localStorage.setItem(
        'pantrypool_cookie_consent',
        JSON.stringify({
          necessary: true,
          analytics: true,
          marketing: false,
          functional: true,
          timestamp: new Date().toISOString(),
          version: '1.0',
        })
      );
    });
  });

  test('completes unmocked full-stack golden path: register -> onboarding wizard -> grab item -> add custom item -> ledger verification', async ({ page }) => {
    // Note: Absolutely zero page.route() mocks are used in this test.
    // Every network call traverses Vite proxy -> Hono Universal API -> InMemoryStorageAdapter.

    // 1. Visit homepage
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // 2. Open Auth Modal & Switch to Register
    const signInBtn = page.getByRole('button', { name: /Sign in|Log in/i }).first();
    await expect(signInBtn).toBeVisible();
    await signInBtn.click();

    const createAccountTab = page.getByRole('button', { name: 'Create Account' });
    await expect(createAccountTab).toBeVisible();
    await createAccountTab.click();

    // 3. Fill registration form
    const nameInput = page.getByPlaceholder('Alex Morgan');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Jordan Fullstack');

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('jordan.fullstack@pantrypool.local');

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill('SecurePass123!');

    // Submit registration
    const submitBtn = page.getByRole('button', { name: 'Create Account' }).last();
    await submitBtn.click();

    // 4. Verify user authenticated and workspace loaded
    await expect(page.getByText('Jordan Fullstack').first()).toBeVisible({ timeout: 15_000 });

    // 5. Complete 3-Step Onboarding Wizard
    // Step 1: Pantry Type
    const continueToPantrySetupBtn = page.getByRole('button', { name: 'Continue to Pantry Setup' });
    await expect(continueToPantrySetupBtn).toBeVisible({ timeout: 10_000 });
    await continueToPantrySetupBtn.click();

    // Step 2: First Pantry Details
    const poolNameInput = page.getByPlaceholder(/2nd Floor Kitchen or Coffee Bar/i);
    await expect(poolNameInput).toBeVisible({ timeout: 5_000 });
    await poolNameInput.fill('Engineering Breakroom Live');

    const reviewAndLaunchBtn = page.getByRole('button', { name: 'Review & Launch' });
    await expect(reviewAndLaunchBtn).toBeVisible();
    await reviewAndLaunchBtn.click();

    // Step 3: Launch Free Pantry
    const launchFreePantryBtn = page.getByRole('button', { name: 'Launch Free Pantry' });
    await expect(launchFreePantryBtn).toBeVisible({ timeout: 5_000 });
    await launchFreePantryBtn.click();

    // Verify wizard closes and active pool heading is live
    await expect(page.getByText('Engineering Breakroom Live').first()).toBeVisible({ timeout: 15_000 });

    // Dismiss "Pantry Live & Ready!" alert dialog
    const okBtn = page.getByRole('button', { name: 'OK', exact: true });
    await expect(okBtn).toBeVisible({ timeout: 10_000 });
    await okBtn.click();
    await expect(okBtn).not.toBeVisible();

    // 6. Verify starter items were automatically seeded into the database
    await expect(page.getByText('Sparkling Water (Can)').first()).toBeVisible({ timeout: 10_000 });

    // 7. Consume / Grab 1 Unit of Sparkling Water (cost $1.25 within $10 credit ceiling)
    const grabCanBtn = page.getByRole('button', { name: 'Grab 1 can' });
    await expect(grabCanBtn).toBeVisible({ timeout: 10_000 });
    await grabCanBtn.click();

    // Dismiss consumption confirmation dialog ("Got It")
    const gotItBtn = page.getByRole('button', { name: 'Got It' });
    await expect(gotItBtn).toBeVisible({ timeout: 8_000 });
    await gotItBtn.click();
    await expect(gotItBtn).not.toBeVisible();

    // 8. Add a Custom Inventory Item to verify POST /api/items in live server
    const addItemBtn = page.getByRole('button', { name: /Add Item|Add Pantry Item/i }).first();
    await expect(addItemBtn).toBeVisible();
    await addItemBtn.click();

    // Fill item form
    const itemNameInput = page.getByPlaceholder(/LaCroix Sparkling Water/i);
    await expect(itemNameInput).toBeVisible();
    await itemNameInput.fill('Live Nitro Cold Brew');

    const submitItemBtn = page.getByRole('button', { name: /Create Item Entry/i });
    await expect(submitItemBtn).toBeVisible();
    await submitItemBtn.click();

    // Verify custom item renders in catalog
    await expect(page.getByText('Live Nitro Cold Brew').first()).toBeVisible({ timeout: 10_000 });

    // 9. Verify Ledger records the consumption transaction
    const ledgerTab = page.getByRole('button', { name: /Ledger/i }).first();
    await expect(ledgerTab).toBeVisible();
    await ledgerTab.click();

    // Verify the transaction appears in the live ledger with the consumed item name
    await expect(page.getByText('Sparkling Water (Can)').first()).toBeVisible({ timeout: 8_000 });
  });
});
