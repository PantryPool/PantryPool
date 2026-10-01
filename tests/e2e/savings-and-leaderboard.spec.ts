import { test, expect } from '@playwright/test';
import { setupMockSession } from './testHelpers';

test.describe('🥤 Breakroom Vending Savings & Cross-Pool Leaderboard E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page);
  });

  test('displays vending savings badge on item cards and pool summary card', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // 1. Verify item card savings badge
    // Cold Brew: cost $3.00, benchmark $4.50 -> Save $1.50 vs vending
    const coldBrewCard = page.locator('div', { hasText: 'Nitro Cold Brew Coffee' }).filter({ hasText: 'vs vending' }).first();
    await expect(coldBrewCard).toBeVisible();
    await expect(coldBrewCard.getByText(/Save \$1\.50 vs vending/i)).toBeVisible();

    // 2. Verify Pool Executive Summary Card displays the clickable Saved pill
    const savingsPill = page.locator('button', { hasText: /Saved/i }).first();
    await expect(savingsPill).toBeVisible();
  });

  test('opens Savings & Community Leaderboard modal and navigates tabs', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Open via clicking the Saved pill on PoolSummaryCard
    const savingsPill = page.locator('button', { hasText: /Saved/i }).first();
    await expect(savingsPill).toBeVisible();
    await savingsPill.click();

    // Verify modal header is visible
    const modal = page.locator('div[role="dialog"], .fixed').filter({ hasText: 'Vending Machine Savings' }).first();
    await expect(modal).toBeVisible();

    // Verify Collective Impact Tab Content
    await expect(modal.getByText(/Barista drinks avoided/i)).toBeVisible();
    await expect(modal.getByText(/Team Lunches/i)).toBeVisible();
    await expect(modal.getByText(/Top Money-Saving Snacks/i)).toBeVisible();
    await expect(modal.getByText('Nitro Cold Brew Coffee')).toBeVisible();

    // Switch to Cross-Pool Community Leaderboard Tab
    const leaderboardTab = modal.getByRole('button', { name: /Community Leaderboard/i });
    await expect(leaderboardTab).toBeVisible();
    await leaderboardTab.click();

    // Verify leaderboard entries are rendered
    await expect(modal.getByText('Engineering Lab Snacks')).toBeVisible();
    await expect(modal.getByText('Main Breakroom Pantry').first()).toBeVisible();
    await expect(modal.getByText(/Platform Network Savings/i)).toBeVisible();

    // Close modal
    const closeBtn = modal.locator('button').filter({ has: page.locator('svg.lucide-x') }).first();
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });

  test('configures metro tier with live sample prices and calibration drawer in pool settings', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Open Manage Pool Settings via hash navigation
    await page.evaluate(() => { window.location.hash = 'settings'; });

    const settingsModal = page.locator('div[role="dialog"], .fixed').filter({ hasText: /Pool Settings/i }).first();
    await expect(settingsModal).toBeVisible();

    // Verify Vending Machine Savings Section
    await expect(settingsModal.getByText('Vending Machine Savings')).toBeVisible();

    // Locate Metro Tier Select
    const metroSelect = settingsModal.locator('select').filter({ hasText: /Standard Metro|High-Cost|Baseline/i }).first();
    await expect(metroSelect).toBeVisible();

    // Change to High-Cost Metro
    await metroSelect.selectOption('high');

    // Verify live sample prices preview card updates to high-cost sample rates
    // High cost soda is $2.25, energy drink is $4.50
    await expect(settingsModal.getByText(/\$2\.25/).first()).toBeVisible();
    await expect(settingsModal.getByText(/\$4\.50/).first()).toBeVisible();

    // Verify Custom Leaderboard Alias field is visible
    const aliasInput = settingsModal.locator('input[placeholder*="Main Breakroom Pantry"]').first();
    await expect(aliasInput).toBeVisible();

    // Open Batch Item Calibration Drawer
    const calibrateBtn = settingsModal.getByRole('button', { name: /Review & Calibrate Item Vending Prices/i });
    await expect(calibrateBtn).toBeVisible();
    await calibrateBtn.click();

    // Verify drawer displays items with benchmark inputs
    await expect(settingsModal.getByText('Nitro Cold Brew Coffee')).toBeVisible();
    await expect(settingsModal.getByText(/Vending: \$/i).first()).toBeVisible();

    // Toggle calibration drawer closed
    await calibrateBtn.click();
  });

  test('celebrates vending savings on consumption in Breakroom Quick Kiosk', async ({ page }) => {
    // Mock consumption API returning savings telemetry
    await page.route('**/api/items/consume', (route) =>
      route.fulfill({
        json: {
          success: true,
          remainingStock: 11,
          cost: 3.0,
          newBalance: 22.0,
          savingsCents: 150,
          savings: 1.50,
          savingsFormatted: '1.50',
        },
      })
    );

    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Open Kiosk mode
    await page.evaluate(() => { window.location.hash = 'kiosk'; });

    const kioskModal = page.locator('div[role="dialog"], .fixed').filter({ hasText: 'Breakroom Quick Kiosk' }).first();
    await expect(kioskModal).toBeVisible();

    // Select a member to view snack grid
    const memberBtn = kioskModal.locator('button', { hasText: 'Alex Tester' }).first();
    await expect(memberBtn).toBeVisible();
    await memberBtn.click();

    // Tap on cold brew to consume
    const coldBrewSnackBtn = kioskModal.locator('button', { hasText: 'Nitro Cold Brew Coffee' }).first();
    await expect(coldBrewSnackBtn).toBeVisible();
    await coldBrewSnackBtn.click();

    // Verify celebratory toast includes savings text
    await expect(kioskModal.getByText(/Saved \$1\.50 vs vending!/i)).toBeVisible();
  });
});
