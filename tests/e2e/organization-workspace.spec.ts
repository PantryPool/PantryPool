import { test, expect } from '@playwright/test';
import { setupMockSession } from './testHelpers';

test.describe('Organization & Company Workspace Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page);
  });

  async function openWorkspaceModal(page: any) {
    const createPoolBtn = page.getByRole('button', { name: /Create or Join Pool/i }).first();
    if (await createPoolBtn.isVisible()) {
      await createPoolBtn.click();
      const newCompanyBtn = page.getByRole('button', { name: /New Company/i }).first();
      await expect(newCompanyBtn).toBeVisible({ timeout: 5000 });
      await newCompanyBtn.click();
    } else {
      const toolsBtn = page.getByRole('button', { name: /More Tools & Settings/i }).first();
      await expect(toolsBtn).toBeVisible({ timeout: 5000 });
      await toolsBtn.click();
      const newCompanyBtn = page.getByRole('button', { name: /New Company Workspace/i }).first();
      await expect(newCompanyBtn).toBeVisible({ timeout: 5000 });
      await newCompanyBtn.click();
    }
  }

  test('opens Create/Join Workspace modal and switches between tabs', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    await openWorkspaceModal(page);

    // Verify modal is visible
    const modalHeading = page.getByRole('heading', { name: /Company Workspace/i });
    await expect(modalHeading).toBeVisible();

    // Switch to Join tab
    const joinTab = page.getByRole('button', { name: 'Join with Invite Code' });
    if (await joinTab.isVisible()) {
      await joinTab.click();
      await expect(page.getByPlaceholder(/ORG_ABC123 or invite link/i)).toBeVisible();
    }
  });

  test('joins organization using valid workspace invite code', async ({ page }) => {
    const mockOrg = {
      id: 'org_acme_joined',
      name: 'Acme Global Breakrooms',
      tier: 'standard',
      ownerId: 'u_acme_owner',
      inviteCode: 'ACME2026',
    };

    await page.route('**/api/organizations/join', (route) =>
      route.fulfill({
        json: {
          success: true,
          organization: mockOrg,
        },
      })
    );

    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    await openWorkspaceModal(page);

    // Switch to Join tab
    const joinTab = page.getByRole('button', { name: 'Join with Invite Code' });
    if (await joinTab.isVisible()) {
      await joinTab.click();

      // Fill join code
      const codeInput = page.getByPlaceholder(/acme-corp or invite link/i);
      await codeInput.fill('ACME2026');

      // Submit join
      const joinBtn = page.getByRole('button', { name: /^Join Workspace$/i });
      await joinBtn.click();

      // Verify modal closes
      await expect(page.getByRole('button', { name: /^Join Workspace$/i })).not.toBeVisible();
    }
  });

  test('activates workspace on Stripe checkout success callback (?billing=success)', async ({ page }) => {
    const mockOrg = {
      id: 'org_pro_activated',
      name: 'Pied Piper Tech',
      tier: 'standard',
      ownerId: 'u_default_tester',
    };

    await page.route('**/api/stripe/verify-session', (route) =>
      route.fulfill({
        json: {
          success: true,
          organization: mockOrg,
          pool: {
            id: 'pool_pied_piper_1',
            name: 'Pied Piper Kitchen',
            currency: '$',
          },
        },
      })
    );

    // Navigate with billing query params
    await page.goto('/?billing=success&session_id=sess_test_live_e2e_123');
    await expect(page.locator('#root')).toBeVisible();

    // Verify activation alert dialog appears
    await expect(page.getByText('Workspace Live & Activated!')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Pied Piper Tech/i)).toBeVisible();
  });
});
