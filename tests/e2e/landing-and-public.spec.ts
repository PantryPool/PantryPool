import { test, expect } from '@playwright/test';

test.describe('Visitor Landing Page & Public Information', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Intercept public APIs to avoid 404 console warnings in tests
    await page.route('**/api/public-settings**', (route) =>
      route.fulfill({
        json: {
          success: true,
          appleLoginEnabled: false,
          registrationEnabled: true,
          maintenanceMode: false,
          systemNotice: '',
          ssoConfigured: false,
        },
      })
    );
    await page.route('**/api/affiliate-products**', (route) =>
      route.fulfill({ json: { success: true, products: [] } })
    );
    await page.route('**/api/organizations**', (route) =>
      route.fulfill({ json: { success: true, organizations: [] } })
    );

    // Suppress cookie banner for regular tests to avoid UI obstruction
    if (!testInfo.title.includes('Cookie Consent')) {
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
    }
  });

  test('renders hero, branding, and value proposition correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Verify Brand Hero & Tagline
    await expect(page.getByText(/The Breakroom Honor System Is Broken/i)).toBeVisible();
    await expect(page.getByText(/PantryPool is the smart office snack club app|Turn shared snack cabinets/i)).toBeVisible();

    // Verify CTA Buttons
    const getStartedBtns = page.getByRole('button', { name: /create your pantry pool free|create free pantry pool/i });
    expect(await getStartedBtns.count()).toBeGreaterThan(0);
  });

  test('toggles monthly and yearly pricing calculator options', async ({ page }) => {
    await page.goto('/');

    // Locate pricing switch
    const monthlyBtn = page.getByRole('button', { name: /monthly/i }).first();
    const annualBtn = page.getByRole('button', { name: /yearly|annual/i }).first();

    if (await monthlyBtn.isVisible() && await annualBtn.isVisible()) {
      // Toggle Monthly
      await monthlyBtn.click();
      await expect(page.getByText('$5')).toBeVisible();

      // Toggle Annual
      await annualBtn.click();
      await expect(page.getByText('$49')).toBeVisible();
    }
  });

  test('interacts with FAQ accordion items', async ({ page }) => {
    await page.goto('/');

    // Scroll to FAQ section
    const faqHeading = page.getByText(/Frequently Asked Questions/i);
    await faqHeading.scrollIntoViewIfNeeded();

    // Verify first answer is visible (expanded by default in hero FAQ state)
    await expect(page.getByText(/When someone scans your fridge poster with their phone camera/i)).toBeVisible();

    // Click free tier FAQ button to toggle it
    const freeTierFaqBtn = page.getByRole('button', { name: /Is it really free for small teams and households\?/i });
    await expect(freeTierFaqBtn).toBeVisible();
    await freeTierFaqBtn.click();

    // Verify answer becomes visible
    await expect(page.getByText(/PantryPool Community Edition is 100% free forever/i)).toBeVisible();
  });

  test('opens and navigates Legal Modal (Terms of Service & Privacy Policy)', async ({ page }) => {
    await page.goto('/');

    // Click Terms in footer
    const footerTermsBtn = page.locator('footer').getByRole('link', { name: /Terms of Service/i });
    await expect(footerTermsBtn).toBeVisible();
    await footerTermsBtn.click();

    // Check modal rendered
    const legalCenter = page.getByText(/Legal & Compliance Center/i);
    await expect(legalCenter).toBeVisible({ timeout: 10_000 });

    // Switch to Privacy Policy tab inside the modal
    const privacyTab = page.locator('div[role="dialog"]').getByRole('button', { name: /^Privacy Policy$/i }).first();
    if (await privacyTab.isVisible()) {
      await privacyTab.click();
      await expect(page.getByText(/PantryPool Privacy Policy/i)).toBeVisible();
    }

    // Close modal
    const closeBtn = page.locator('button:has(svg.lucide-x)').last();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });

  test('renders and accepts Cookie Consent banner', async ({ page }) => {
    await page.goto('/');

    const cookieBanner = page.getByRole('heading', { name: /Cookie & Privacy Preferences/i });
    await expect(cookieBanner).toBeVisible();

    const acceptBtn = page.getByRole('button', { name: /^Accept All$/i });
    await acceptBtn.click();

    await expect(cookieBanner).not.toBeVisible();

    // Verify localStorage was updated with valid JSON consent object
    const consentVal = await page.evaluate(() => localStorage.getItem('pantrypool_cookie_consent'));
    const parsed = JSON.parse(consentVal || '{}');
    expect(parsed.necessary).toBe(true);
  });
});
