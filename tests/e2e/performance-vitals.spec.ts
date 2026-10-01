import { test, expect } from '@playwright/test';
import { setupMockSession } from './testHelpers';

test.describe('Automated Core Web Vitals & Performance Budgets', () => {
  test.beforeEach(async ({ page }) => {
    // Quick warm-up visit to ensure Vite modules are compiled in memory
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
  });

  test('measures and asserts frontend Core Web Vitals within SLA budgets on Landing Page', async ({ page }) => {
    await page.reload();
    await expect(page.locator('#root')).toBeVisible();

    // Extract performance timing metrics
    const metrics = await page.evaluate(() => {
      const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint')?.startTime || 0;
      
      return {
        fcp,
        domContentLoaded: navTiming ? navTiming.domContentLoadedEventEnd - navTiming.startTime : 0,
        loadTime: navTiming ? navTiming.loadEventEnd - navTiming.startTime : 0,
        transferSize: navTiming ? navTiming.transferSize : 0,
      };
    });

    console.log('[Landing Performance Metrics]', metrics);

    // Performance Budgets for warmed SPA navigation
    if (metrics.fcp > 0) {
      expect(metrics.fcp).toBeLessThan(2500);
    }
    if (metrics.domContentLoaded > 0) {
      expect(metrics.domContentLoaded).toBeLessThan(2000);
    }
  });

  test('measures and asserts frontend Core Web Vitals on Authenticated Dashboard', async ({ page }) => {
    await setupMockSession(page);
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.getByText('Nitro Cold Brew Coffee').first()).toBeVisible();

    const metrics = await page.evaluate(() => {
      const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find((e) => e.name === 'first-contentful-paint')?.startTime || 0;

      return {
        fcp,
        domContentLoaded: navTiming ? navTiming.domContentLoadedEventEnd - navTiming.startTime : 0,
        loadTime: navTiming ? navTiming.loadEventEnd - navTiming.startTime : 0,
      };
    });

    console.log('[Dashboard Performance Metrics]', metrics);

    if (metrics.fcp > 0) {
      expect(metrics.fcp).toBeLessThan(2500);
    }
    if (metrics.domContentLoaded > 0) {
      expect(metrics.domContentLoaded).toBeLessThan(2000);
    }
  });
});
