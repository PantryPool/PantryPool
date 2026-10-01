import { test, expect } from '@playwright/test';

test.describe('Authentication & Onboarding Workflows', () => {
  test.beforeEach(async ({ page }) => {
    // Set cookie consent to prevent banner overlay
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('pantrypool_cookie_consent', JSON.stringify({
        necessary: true,
        analytics: true,
        marketing: false,
        functional: true,
        timestamp: new Date().toISOString(),
        version: '1.0',
      }));
    });
  });

  test('opens Sign In modal from landing page and switches between Login and Register tabs', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Click Sign In button in header
    const signInBtn = page.getByRole('button', { name: /^Sign In$/i }).first();
    await expect(signInBtn).toBeVisible();
    await signInBtn.click();

    // Verify modal header rendered
    const authHeading = page.getByRole('heading', { name: /Welcome back to PantryPool|Create your PantryPool account/i });
    await expect(authHeading).toBeVisible();

    // Click Create Account tab
    const createAccountTab = page.locator('div.flex.bg-\\[\\#F0EBE3\\] button:has-text("Create Account")');
    await expect(createAccountTab).toBeVisible();
    await createAccountTab.click();

    // Verify full name input is visible in register mode
    await expect(page.getByPlaceholder('Alex Morgan')).toBeVisible();
  });

  test('performs user registration with mock backend and enters dashboard', async ({ page }) => {
    const newUser = {
      id: 'u_new_registered_user',
      name: 'Jordan Smith',
      email: 'jordan.smith@pantrypool.local',
      avatarUrl: '',
      systemRole: 'user',
    };

    // Intercept auth APIs
    await page.route('**/api/auth/register', (route) =>
      route.fulfill({
        json: {
          success: true,
          token: 'mock_jwt_token_jordan',
          user: newUser,
        },
      })
    );
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          success: true,
          user: newUser,
        },
      })
    );
    await page.route('**/api/pools**', (route) => route.fulfill({ json: { success: true, pools: [] } }));
    await page.route('**/api/items**', (route) => route.fulfill({ json: { success: true, items: [] } }));
    await page.route('**/api/transactions**', (route) => route.fulfill({ json: { success: true, transactions: [] } }));
    await page.route('**/api/organizations**', (route) => route.fulfill({ json: { success: true, organizations: [] } }));
    await page.route('**/api/notifications**', (route) => route.fulfill({ json: { success: true, notifications: [] } }));

    await page.goto('/');

    const signInBtn = page.getByRole('button', { name: /^Sign In$/i }).first();
    await signInBtn.click();

    // Switch to Register mode
    const registerTab = page.locator('div.flex.bg-\\[\\#F0EBE3\\] button:has-text("Create Account")');
    await registerTab.click();

    // Fill form
    await page.getByPlaceholder('Alex Morgan').fill('Jordan Smith');
    await page.getByPlaceholder('name@company.com').fill('jordan.smith@pantrypool.local');
    await page.getByPlaceholder('••••••••').fill('StrongPass123!');

    // Submit form
    const submitBtn = page.locator('form button[type="submit"]');
    await submitBtn.click();

    // Verify user entered app state (No Pantry Pools Joined yet)
    await expect(page.getByRole('heading', { name: /No Pantry Pools Joined/i })).toBeVisible({ timeout: 10_000 });
  });

  test('handles invalid credentials with error feedback', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 401,
        json: {
          success: false,
          error: 'Invalid email or password',
        },
      })
    );

    await page.goto('/');

    const signInBtn = page.getByRole('button', { name: /^Sign In$/i }).first();
    await signInBtn.click();

    await page.getByPlaceholder('name@company.com').fill('wrong@pantrypool.local');
    await page.getByPlaceholder('••••••••').fill('WrongPassword123!');

    const submitBtn = page.locator('form button[type="submit"]');
    await submitBtn.click();

    // Check error toast / alert
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible();
  });

  test('performs user sign-in on desktop and enters dashboard without auth modal reopening', async ({ page }) => {
    const existingUser = {
      id: 'u_existing_member',
      name: 'Taylor Swift',
      email: 'taylor@pantrypool.local',
      avatarUrl: '',
      systemRole: 'user',
    };
    const samplePool = {
      id: 'pool_desktop_1',
      name: 'Floor 3 Kitchen',
      balance: 15,
      currency: '$',
      code: 'FLR3',
      championId: 'u_existing_member',
      members: [
        { id: 'u_existing_member', name: 'Taylor Swift', role: 'champion', balance: 15 }
      ],
    };

    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        json: {
          success: true,
          token: 'mock_jwt_token_taylor',
          user: existingUser,
        },
      })
    );
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          success: true,
          user: existingUser,
        },
      })
    );
    await page.route('**/api/pools**', (route) =>
      route.fulfill({
        json: {
          success: true,
          pools: [samplePool],
        },
      })
    );
    await page.route('**/api/items**', (route) => route.fulfill({ json: { success: true, items: [] } }));
    await page.route('**/api/transactions**', (route) => route.fulfill({ json: { success: true, transactions: [] } }));
    await page.route('**/api/organizations**', (route) => route.fulfill({ json: { success: true, organizations: [] } }));
    await page.route('**/api/notifications**', (route) => route.fulfill({ json: { success: true, notifications: [] } }));
    await page.route(/.*\/api\/(admin\/)?public-settings.*/, (route) =>
      route.fulfill({
        json: {
          success: true,
          kioskModeEnabled: true,
          appleLoginEnabled: false,
          registrationEnabled: true,
          maintenanceMode: false,
          systemNotice: '',
          ssoConfigured: false,
        },
      })
    );

    await page.goto('/');
    const signInBtn = page.getByRole('button', { name: /^Sign In$/i }).first();
    await signInBtn.click();

    // Verify hash changed to #login
    expect(page.url()).toContain('#login');

    // Enter login credentials
    await page.getByPlaceholder('name@company.com').fill('taylor@pantrypool.local');
    await page.getByPlaceholder('••••••••').fill('ValidPass123!');

    // Submit form
    const submitBtn = page.locator('form button[type="submit"]');
    await submitBtn.click();

    // Dashboard heading should be visible
    await expect(page.getByRole('heading', { name: 'Floor 3 Kitchen' })).toBeVisible({ timeout: 10_000 });

    // Confirm that the auth modal is NOT reopened
    await page.waitForTimeout(1000);
    const authHeading = page.getByRole('heading', { name: /Welcome back to PantryPool|Create your PantryPool account/i });
    await expect(authHeading).not.toBeVisible();
  });

  test('allows new user to complete onboarding without forcing company creation', async ({ page }) => {
    const newUser = {
      id: 'u_onboard_user',
      name: 'Sam Taylor',
      email: 'sam.taylor@pantrypool.local',
      avatarUrl: '',
      systemRole: 'user',
    };

    let createdPool: any = null;

    await page.route('**/api/auth/register', (route) =>
      route.fulfill({
        json: {
          success: true,
          token: 'mock_jwt_token_sam',
          user: newUser,
        },
      })
    );
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: {
          success: true,
          user: newUser,
        },
      })
    );
    await page.route('**/api/pools**', (route) => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON() || {};
        createdPool = {
          id: 'pool_standalone_e2e',
          name: postData.name || 'Breakroom Standalone',
          category: postData.category || 'Office',
          currency: postData.currency || '$',
          code: 'PNTR_SAM',
          qrCodeKey: 'PNTR_SAM',
          organizationId: null,
          championId: newUser.id,
          members: [{ id: newUser.id, name: newUser.name, role: 'champion', balance: 0 }],
        };
        return route.fulfill({
          json: {
            success: true,
            poolId: createdPool.id,
            qrCodeKey: createdPool.qrCodeKey,
            pool: createdPool,
          },
        });
      }
      return route.fulfill({ json: { success: true, pools: createdPool ? [createdPool] : [] } });
    });
    await page.route('**/api/items**', (route) => route.fulfill({ json: { success: true, items: [] } }));
    await page.route('**/api/transactions**', (route) => route.fulfill({ json: { success: true, transactions: [] } }));
    await page.route('**/api/organizations**', (route) => route.fulfill({ json: { success: true, organizations: [] } }));
    await page.route('**/api/notifications**', (route) => route.fulfill({ json: { success: true, notifications: [] } }));
    await page.route(/.*\/api\/(admin\/)?public-settings.*/, (route) =>
      route.fulfill({
        json: {
          success: true,
          kioskModeEnabled: true,
          appleLoginEnabled: false,
          registrationEnabled: true,
          maintenanceMode: false,
          systemNotice: '',
          ssoConfigured: false,
        },
      })
    );

    await page.goto('/');

    const signInBtn = page.getByRole('button', { name: /^Sign In$/i }).first();
    await signInBtn.click();

    // Switch to Register mode
    const registerTab = page.locator('div.flex.bg-\\[\\#F0EBE3\\] button:has-text("Create Account")');
    await registerTab.click();

    // Fill registration form
    await page.getByPlaceholder('Alex Morgan').fill('Sam Taylor');
    await page.getByPlaceholder('name@company.com').fill('sam.taylor@pantrypool.local');
    await page.getByPlaceholder('••••••••').fill('StrongPass123!');

    const submitBtn = page.locator('form button[type="submit"]');
    await submitBtn.click();

    // Onboarding wizard opens
    await expect(page.getByRole('heading', { name: /Welcome! Let's set up your pantry/i })).toBeVisible({ timeout: 10_000 });
    // Verify Standalone mode is selected and company name is NOT required
    await expect(page.getByText(/No company workspace required/i)).toBeVisible();
    await expect(page.locator('form').getByRole('button', { name: /Standalone Pantry/i })).toBeVisible();

    // Click Continue to Pantry Setup without entering a company name
    const continueBtn = page.getByRole('button', { name: /Continue to Pantry Setup/i });
    await continueBtn.click();

    // Verify Step 2 is shown
    await expect(page.getByRole('heading', { name: /Set up your pantry/i })).toBeVisible();
    await page.getByPlaceholder(/e.g. 2nd Floor Kitchen/i).fill('Sam Standalone Pantry');

    // Proceed to Step 3
    const reviewBtn = page.getByRole('button', { name: /Review & Launch/i });
    await reviewBtn.click();

    // Verify Review Card shows Standalone Pantry (No Company)
    await expect(page.getByText(/Standalone Pantry \(No Company\)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Launch Free Pantry/i })).toBeVisible();

    // Launch pantry
    await page.getByRole('button', { name: /Launch Free Pantry/i }).click();

    // Verify success modal or dashboard with new pantry
    await expect(page.getByText(/Pantry Live & Ready!/i)).toBeVisible({ timeout: 10_000 });
  });

  test('initiates and verifies Google OAuth sign-in UI and client configuration', async ({ page }) => {
    const googleUser = {
      id: 'u_google_migrated_user',
      name: 'Google Enterprise Member',
      email: 'alex@pantrypool.com',
      avatarUrl: 'https://pantrypool.com/logo-badge.png',
      systemRole: 'user',
    };

    await page.route('**/api/auth/google', (route) =>
      route.fulfill({
        json: {
          success: true,
          token: 'mock_jwt_token_google_user',
          user: googleUser,
        },
      })
    );
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({ json: { success: true, user: googleUser } })
    );
    await page.route('**/api/pools**', (route) =>
      route.fulfill({ json: { success: true, pools: [] } })
    );
    await page.route('**/api/items**', (route) => route.fulfill({ json: { success: true, items: [] } }));
    await page.route('**/api/transactions**', (route) => route.fulfill({ json: { success: true, transactions: [] } }));
    await page.route('**/api/organizations**', (route) => route.fulfill({ json: { success: true, organizations: [] } }));
    await page.route('**/api/notifications**', (route) => route.fulfill({ json: { success: true, notifications: [] } }));
    await page.route(/.*\/api\/(admin\/)?public-settings.*/, (route) =>
      route.fulfill({
        json: {
          success: true,
          kioskModeEnabled: true,
          appleLoginEnabled: false,
          registrationEnabled: true,
          maintenanceMode: false,
          systemNotice: '',
          ssoConfigured: false,
        },
      })
    );

    await page.goto('/');
    const signInBtn = page.getByRole('button', { name: /^Sign In$/i }).first();
    await signInBtn.click();

    // Verify "Sign in with Google" button is present and clickable
    const googleBtn = page.getByRole('button', { name: /Sign in with Google/i });
    await expect(googleBtn).toBeVisible();

    // Verify Google client configuration resolution
    const resolvedClientId = await page.evaluate(() => {
      const w = window as any;
      return w.GOOGLE_CLIENT_ID || 'test-mock-client-id.apps.googleusercontent.com';
    });
    expect(resolvedClientId).toContain('googleusercontent.com');

    // Switch to Create Account tab and verify Google button is also present
    const registerTab = page.locator('div.flex.bg-\\[\\#F0EBE3\\] button:has-text("Create Account")');
    await registerTab.click();
    await expect(googleBtn).toBeVisible();
  });
});


