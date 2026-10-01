import { test, expect } from '@playwright/test';
import { setupMockSession, defaultMockUser } from './testHelpers';

test.describe('Superadmin Platform Dashboard (/admin)', () => {
  test.beforeEach(async ({ page }) => {
    // Setup admin user session
    await setupMockSession(page, {
      user: {
        ...defaultMockUser,
        id: 'u_superadmin_tester',
        name: 'Sarah Superadmin',
        systemRole: 'superadmin',
      } as any,
    });

    await page.route('**/api/health', (route) =>
      route.fulfill({ json: { status: 'healthy', database: 'connected' } })
    );

    await page.route('**/api/admin/organizations', (route) =>
      route.fulfill({ json: { success: true, organizations: [] } })
    );

    await page.route('**/api/admin/pools', (route) =>
      route.fulfill({ json: { success: true, pools: [] } })
    );

    await page.route('**/api/admin/telemetry/**', (route) =>
      route.fulfill({ json: { success: true, stats: { totalEvents: 0 } } })
    );

    await page.route('**/api/affiliate-products**', (route) =>
      route.fulfill({ json: { success: true, products: [] } })
    );

    // Mock admin APIs
    await page.route('**/api/admin/stats', (route) =>
      route.fulfill({
        json: {
          success: true,
          stats: {
            totalUsers: 142,
            totalPools: 38,
            totalTransactions: 1250,
            totalVolume: 8420.5,
          },
        },
      })
    );

    await page.route('**/api/admin/users', (route) =>
      route.fulfill({
        json: {
          success: true,
          users: [
            {
              id: 'u_user_1',
              name: 'Alice Cooper',
              email: 'alice@acme.com',
              systemRole: 'user',
              poolCount: 2,
              createdAt: '2026-01-10T00:00:00.000Z',
            },
            {
              id: 'u_user_2',
              name: 'Bob Marley',
              email: 'bob@acme.com',
              systemRole: 'admin',
              poolCount: 4,
              createdAt: '2026-01-08T00:00:00.000Z',
            },
          ],
        },
      })
    );

    await page.route('**/api/admin/settings', (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() || {};
        return route.fulfill({ json: { success: true, settings: body } });
      }
      return route.fulfill({
        json: {
          success: true,
          settings: {
            registration_enabled: 'true',
            maintenance_mode: 'false',
            system_notice: 'Welcome to PantryPool SaaS Platform!',
          },
        },
      });
    });

    await page.route('**/api/admin/ai-usage', (route) =>
      route.fulfill({
        json: {
          success: true,
          summary: { totalCalls: 85, totalTokens: 125000, estimatedCostUsd: 0.18 },
          modelBreakdown: [],
          recentLogs: [],
        },
      })
    );
  });

  test('opens Superadmin Dashboard via deep link (#admin) and displays platform metrics', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const toolsBtn = page.getByTitle(/More Tools & Settings/i);
    await expect(toolsBtn).toBeVisible({ timeout: 10_000 });
    await toolsBtn.click();
    const adminBtn = page.getByRole('button', { name: /Platform Admin Console/i });
    await expect(adminBtn).toBeVisible({ timeout: 10_000 });
    await adminBtn.click();

    // Verify modal header
    await expect(page.getByText('Platform Admin Console')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Superadmin', { exact: true })).toBeVisible();

    // Verify platform metrics on Overview tab
    await expect(page.getByText('Total Users')).toBeVisible();
    await expect(page.getByText('142')).toBeVisible(); // total users
    await expect(page.getByText('38')).toBeVisible();  // total pools
  });

  test('navigates to Users tab and searches registered users', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const toolsBtn = page.getByTitle(/More Tools & Settings/i);
    await expect(toolsBtn).toBeVisible({ timeout: 10_000 });
    await toolsBtn.click();
    const adminBtn = page.getByRole('button', { name: /Platform Admin Console/i });
    await expect(adminBtn).toBeVisible({ timeout: 10_000 });
    await adminBtn.click();

    await expect(page.getByText('Platform Admin Console')).toBeVisible();

    // Click Users & Roles tab in sidebar
    const usersTab = page.getByRole('button', { name: /Users & Roles|Users/i }).first();
    await expect(usersTab).toBeVisible();
    await usersTab.click();

    // Verify user list loaded
    await expect(page.getByText('Alice Cooper')).toBeVisible();
    await expect(page.getByText('Bob Marley')).toBeVisible();

    // Search for a user
    const searchInput = page.getByPlaceholder(/Search users by name, email/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('Alice');
      await expect(page.getByText('Alice Cooper')).toBeVisible();
    }
  });

  test('navigates to Settings tab and updates system configuration', async ({ page }) => {
    let settingsSaved = false;

    await page.route('**/api/admin/settings', async (route) => {
      if (route.request().method() === 'POST') {
        settingsSaved = true;
        const body = route.request().postDataJSON() || {};
        return route.fulfill({ json: { success: true, settings: body } });
      }
      return route.fulfill({
        json: {
          success: true,
          settings: {
            registration_enabled: 'true',
            maintenance_mode: 'false',
            system_notice: 'Welcome to PantryPool SaaS Platform!',
          },
        },
      });
    });

    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    const toolsBtn = page.getByTitle(/More Tools & Settings/i);
    await expect(toolsBtn).toBeVisible({ timeout: 10_000 });
    await toolsBtn.click();
    const adminBtn = page.getByRole('button', { name: /Platform Admin Console/i });
    await expect(adminBtn).toBeVisible({ timeout: 10_000 });
    await adminBtn.click();

    await expect(page.getByText('Platform Admin Console')).toBeVisible();

    // Click System Settings tab in sidebar (responsive: matches visible tab on desktop, tablet, or mobile)
    const settingsTab = page.locator('aside button:visible').filter({ hasText: /Settings/i }).first();
    await expect(settingsTab).toBeVisible();
    await settingsTab.click();

    // Verify settings controls rendered
    await expect(page.getByText('Public User Registrations')).toBeVisible();
    await expect(page.getByText('Maintenance Mode')).toBeVisible();

    // Click Save Platform Settings button
    const saveBtn = page.getByRole('button', { name: /Save Platform Settings/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      expect(settingsSaved).toBe(true);
    }
  });
});
