import { test, expect, Page } from '@playwright/test';
import { setupMockSession } from './testHelpers';

async function openPollsModal(page: Page) {
  const pollsBtn = page.locator('button:has(svg.lucide-vote), button:has-text("Polls")').first();
  if (await pollsBtn.isVisible()) {
    await pollsBtn.click();
  } else {
    await page.evaluate(() => { window.location.hash = 'polls'; });
  }
  await expect(page.getByText('Consumables Team Polls')).toBeVisible();
}

async function openShoppingModal(page: Page) {
  const shoppingBtn = page.locator('button:has(svg.lucide-shopping-bag), button:has-text("Shopping")').first();
  if (await shoppingBtn.isVisible()) {
    await shoppingBtn.click();
  } else {
    await page.evaluate(() => { window.location.hash = 'shopping-list'; });
  }
  await expect(page.getByText('Pantry Restock List')).toBeVisible();
}

test.describe('Shopping List & Communal Demand Polls E2E', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockSession(page);
  });

  test('casts vote on an active poll, verifies selection saves, and allows switching votes', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Open Polls modal
    await openPollsModal(page);
    await expect(page.getByText('Which coffee beans should we stock next?')).toBeVisible();

    // Target the first option "Dark Roast Columbian"
    const darkRoastBtn = page.locator('button', { hasText: 'Dark Roast Columbian' }).first();
    await expect(darkRoastBtn).toBeVisible();
    await expect(darkRoastBtn).toContainText('0 votes');

    // Click to vote for Dark Roast Columbian
    await darkRoastBtn.click();

    // Verify selection is recorded, vote count increments to 1, and 100% is displayed
    await expect(darkRoastBtn).toContainText('1 vote');
    await expect(darkRoastBtn).toContainText('(100%)');
    await expect(darkRoastBtn.locator('svg.lucide-check')).toBeVisible();

    // Now switch vote to second option "Light Roast Ethiopian"
    const lightRoastBtn = page.locator('button', { hasText: 'Light Roast Ethiopian' }).first();
    await expect(lightRoastBtn).toBeVisible();
    await lightRoastBtn.click();

    // Verify Light Roast is now selected (1 vote / 100%) and Dark Roast is unselected (0 votes / 0%)
    await expect(lightRoastBtn).toContainText('1 vote');
    await expect(lightRoastBtn).toContainText('(100%)');
    await expect(lightRoastBtn.locator('svg.lucide-check')).toBeVisible();
    await expect(darkRoastBtn).toContainText('0 votes');
    await expect(darkRoastBtn).toContainText('(0%)');
  });

  test('closes voting to freeze poll and allows reopening voting', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Open Polls modal
    await openPollsModal(page);

    const activePollCard = page.locator('[data-testid^="poll-card-"]').filter({ hasText: 'Which coffee beans should we stock next?' }).first();
    await expect(activePollCard).toBeVisible();

    // Check "Close voting" button
    const closeVotingBtn = activePollCard.getByRole('button', { name: /Close voting|Close poll/i }).first();
    await expect(closeVotingBtn).toBeVisible();
    await closeVotingBtn.click();

    // Verify poll status is now Closed
    await expect(activePollCard.getByText('Closed').first()).toBeVisible();

    // Verify voting options are now disabled
    const optionBtn = activePollCard.locator('button', { hasText: 'Dark Roast Columbian' }).first();
    await expect(optionBtn).toBeDisabled();

    // Reopen the poll
    const reopenBtn = activePollCard.getByRole('button', { name: /Reopen/i }).first();
    await expect(reopenBtn).toBeVisible();
    await reopenBtn.click();

    // Verify status returns to Active and options are enabled
    await expect(activePollCard.getByText('Active').first()).toBeVisible();
    await expect(optionBtn).toBeEnabled();
  });

  test('creates a new communal item poll with custom options', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    await openPollsModal(page);

    // Click "Create New Item Poll"
    const createPollBtn = page.getByRole('button', { name: 'Create New Item Poll' });
    await expect(createPollBtn).toBeVisible();
    await createPollBtn.click();

    // Fill in poll question
    const titleInput = page.getByPlaceholder(/Poll Question e\.g\./i);
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Favorite sparkling water brand?');

    // Add options
    const optionInputs = page.locator('input[placeholder*="Option"]');
    await optionInputs.nth(0).fill('LaCroix Lime');
    await optionInputs.nth(1).fill('Spindrift Grapefruit');

    // Submit poll
    const submitBtn = page.getByRole('button', { name: 'Launch Poll' });
    await submitBtn.click();

    // Verify newly created poll appears in the list
    await expect(page.getByText('Favorite sparkling water brand?')).toBeVisible();
    await expect(page.getByText('LaCroix Lime')).toBeVisible();
    await expect(page.getByText('Spindrift Grapefruit')).toBeVisible();
  });

  test('manages shopping list: adds item, toggles purchased, and deletes item', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();

    // Open Shopping List modal
    await openShoppingModal(page);

    await expect(page.getByText('Pantry Restock List')).toBeVisible();
    await expect(page.getByText('Oat Milk Barista Blend')).toBeVisible();

    // Add new item
    const itemNameInput = page.getByPlaceholder('Enter item name...');
    await expect(itemNameInput).toBeVisible();
    await itemNameInput.fill('San Pellegrino Sparkling Water');

    const addBtn = page.getByRole('button', { name: 'Add to Shopping List' });
    await addBtn.click();

    // Verify newly added item appears in the list
    const itemRow = page.locator('[data-testid^="shopping-item-"]').filter({ hasText: 'San Pellegrino Sparkling Water' }).first();
    await expect(itemRow).toBeVisible();

    // Toggle purchased status
    const checkboxBtn = itemRow.locator('button').first();
    await checkboxBtn.click();
    await expect(itemRow).toHaveClass(/bg-\[#EDF5EF\]/);

    // Delete an item
    const deleteBtn = itemRow.locator('button[title="Remove item"]').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await expect(page.locator('[data-testid^="shopping-item-"]').filter({ hasText: 'San Pellegrino Sparkling Water' })).toHaveCount(0);
  });
});
