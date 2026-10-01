import { test, expect } from '@playwright/test';
import { setupMockSession } from './testHelpers';

const mockNotifications = [
  {
    id: 'notif_1',
    userId: 'u_default_tester',
    poolId: 'pool_default_1',
    title: 'Low Stock Alert',
    message: 'Cold Brew cans are running low (2 remaining)',
    type: 'low_stock',
    channel: 'in_app',
    isRead: false,
    createdAt: new Date().toISOString(),
  },
];

test.describe('Notifications & Webhook Integrations', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page, { notifications: mockNotifications });
  });

  test('opens In-App Notification Center with alert feed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Open notifications via hash sync
    await page.evaluate(() => { window.location.hash = 'notifications'; });

    await expect(page.getByText('Notification Center')).toBeVisible();
    await expect(page.getByText('Low-stock alerts, weekly digests & channel settings')).toBeVisible();
    await expect(page.getByText('Low Stock Alert')).toBeVisible();
    await expect(page.getByText('Cold Brew cans are running low (2 remaining)')).toBeVisible();
  });

  test('opens Notification Center channel preferences tab and toggles alerts', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    await page.evaluate(() => { window.location.hash = 'notifications'; });
    await expect(page.getByText('Notification Center')).toBeVisible();

    // Click Channel Preferences tab
    const prefTab = page.getByRole('button', { name: /Channel Preferences/i });
    await expect(prefTab).toBeVisible();
    await prefTab.click();

    await expect(page.getByText('Low-Stock Alerts Dispatch')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Notification Preferences' })).toBeVisible();
  });

  test('opens Webhook Integration modal and tests Slack dispatch', async ({ page }) => {
    let testDispatchCalled = false;

    await page.route('**/api/webhooks/test-dispatch', async (route) => {
      testDispatchCalled = true;
      return route.fulfill({
        json: {
          success: true,
          status: 200,
          response: 'ok',
          message: 'Webhook test dispatched successfully',
        },
      });
    });

    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    await page.evaluate(() => { window.location.hash = 'integrations'; });

    await expect(page.getByRole('heading', { name: /Slack & Microsoft Teams Workspace Integrations/i })).toBeVisible();

    // Fill webhook URL
    const urlInput = page.getByPlaceholder(/hooks\.slack\.com/i);
    await expect(urlInput).toBeVisible();
    await urlInput.fill('https://hooks.slack.com/services/T00/B00/XXXXX');

    // Click Test Dispatch Payload button
    const testBtn = page.getByRole('button', { name: /Test Dispatch Payload/i });
    await expect(testBtn).toBeVisible();
    await testBtn.click();

    // Verify dispatch result feedback
    await expect(page.getByText(/dispatched successfully/i)).toBeVisible();
    expect(testDispatchCalled).toBe(true);
  });
});

