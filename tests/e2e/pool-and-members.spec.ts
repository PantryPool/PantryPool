import { test, expect } from '@playwright/test';
import { setupMockSession, defaultMockPool } from './testHelpers';

test.describe('Pool & Communal Workspace Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page);
  });

  test('displays active pool header, switchers, and balance indicator', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Pool name heading
    await expect(page.getByRole('heading', { name: defaultMockPool.name }).first()).toBeVisible();

    // User balance pill
    await expect(page.getByText(/\$25\.00/i).first()).toBeVisible();
  });

  test('opens Share Pool Modal with invite QR code and copyable join code', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const shareBtn = page.getByRole('button', { name: /Invite & Share/i }).first();
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    // Check modal rendered
    await expect(page.getByText('Share & Invite')).toBeVisible();
    await expect(page.locator(`input[value*="${defaultMockPool.code}"]`).first()).toBeVisible();
  });

  test('opens Manage Pool settings and displays pool configuration', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const settingsBtn = page.locator('button[title="Pool Settings"]').first();
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    await expect(page.getByText('Pool Settings')).toBeVisible();
    await expect(page.locator(`input[value="${defaultMockPool.name}"]`).first()).toBeVisible();
  });

  test('switches to Members tab and displays member list with roles', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Switch to members tab
    const membersTab = page.locator('[data-testid="tab-members"]:visible').first();
    await expect(membersTab).toBeVisible();
    await membersTab.click();

    const alexCard = page.locator('[data-testid="member-card-u_default_tester"]').first();
    await expect(alexCard).toBeVisible();
    await expect(alexCard.getByText('Alex Tester')).toBeVisible();

    const samCard = page.locator('[data-testid="member-card-u_member_sam"]').first();
    await expect(samCard).toBeVisible();
    await expect(samCard.getByText('Sam Contributor')).toBeVisible();
  });
});

