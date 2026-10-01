import { Page } from '@playwright/test';
import { Pool, Item, Transaction, User, PollItem, ShoppingListItem } from '../../src/types';

export const defaultMockUser: User = {
  id: 'u_default_tester',
  name: 'Alex Tester',
  email: 'alex.tester@pantrypool.local',
  avatar: '',
  role: 'champion',
  balance: 25.0,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

export const defaultMockMember: User = {
  id: 'u_member_sam',
  name: 'Sam Contributor',
  email: 'sam@pantrypool.local',
  avatar: '',
  role: 'contributor',
  balance: 10.0,
  joinedAt: '2026-01-02T00:00:00.000Z',
};

export const defaultMockPool: Pool = {
  id: 'pool_default_1',
  name: 'Main Breakroom Pantry',
  description: 'Shared office consumables',
  code: 'MAIN99',
  currency: '$',
  category: 'Office',
  championId: 'u_default_tester',
  createdAt: '2026-01-01T00:00:00.000Z',
  savingsEnabled: true,
  savingsLeaderboardOptIn: true,
  leaderboardAlias: 'Main Breakroom Pantry',
  metroTier: 'standard',
  members: [defaultMockUser, defaultMockMember],
};

export const defaultMockItems: Item[] = [
  {
    id: 'item_cold_brew',
    poolId: 'pool_default_1',
    name: 'Nitro Cold Brew Coffee',
    category: 'Beverages',
    costPerUnit: 3.0,
    vendingBenchmarkCents: 450,
    stock: 12,
    minStock: 4,
    unitName: 'can',
    icon: 'Coffee',
  },
  {
    id: 'item_protein_bar',
    poolId: 'pool_default_1',
    name: 'Almond Honey Crunch Bar',
    category: 'Snacks',
    costPerUnit: 1.5,
    vendingBenchmarkCents: 250,
    stock: 2,
    minStock: 5,
    unitName: 'bar',
    icon: 'Cookie',
  },
  {
    id: 'item_fresh_apple',
    poolId: 'pool_default_1',
    name: 'Organic Honeycrisp Apple',
    category: 'Pantry & Fresh',
    costPerUnit: 1.0,
    stock: 8,
    minStock: 3,
    unitName: 'apple',
    icon: 'Apple',
  },
];

export const defaultMockTransactions: Transaction[] = [
  {
    id: 'tx_default_1',
    poolId: 'pool_default_1',
    userId: 'u_default_tester',
    type: 'contribution',
    amount: 25.0,
    timestamp: new Date().toISOString(),
    createdByName: 'Alex Tester',
    resultingBalance: 25.0,
    note: 'Initial Deposit via Card',
  },
];

export const defaultMockPolls: PollItem[] = [
  {
    id: 'poll_mock_1',
    poolId: 'pool_default_1',
    title: 'Which coffee beans should we stock next?',
    options: [
      { id: 'opt_dark', name: 'Dark Roast Columbian', votes: [] },
      { id: 'opt_light', name: 'Light Roast Ethiopian', votes: [] },
    ],
    createdBy: 'Alex Tester',
    createdAt: '2026-01-05T00:00:00.000Z',
    status: 'active',
    allowWriteIn: true,
  },
  {
    id: 'poll_mock_closed',
    poolId: 'pool_default_1',
    title: 'Spring Breakroom Snack Theme',
    options: [
      { id: 'opt_savory', name: 'Savory Pretzels & Nuts', votes: ['u_default_tester'] },
      { id: 'opt_sweet', name: 'Gourmet Chocolates', votes: [] },
    ],
    createdBy: 'Alex Tester',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'closed',
    allowWriteIn: false,
  },
];

export const defaultMockShoppingList: ShoppingListItem[] = [
  {
    id: 'shop_item_1',
    poolId: 'pool_default_1',
    itemName: 'Oat Milk Barista Blend',
    category: 'Beverages',
    estimatedCost: 4.50,
    quantity: 2,
    suggestedBy: 'Sam Contributor',
    purchased: false,
    createdAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'shop_item_2',
    poolId: 'pool_default_1',
    itemName: 'Recycled Paper Towels',
    category: 'Household',
    estimatedCost: 8.00,
    quantity: 1,
    suggestedBy: 'Alex Tester',
    purchased: true,
    createdAt: '2026-01-04T00:00:00.000Z',
  },
];

export interface MockSessionOptions {
  user?: User;
  pools?: Pool[];
  items?: Item[];
  transactions?: Transaction[];
  organizations?: any[];
  notifications?: any[];
  shoppingList?: ShoppingListItem[];
  polls?: PollItem[];
}

/**
 * Seeds localStorage and sets up route interceptions for all backend APIs.
 */
export async function setupMockSession(page: Page, options: MockSessionOptions = {}) {
  const user = options.user ?? defaultMockUser;
  const pools = options.pools ?? [defaultMockPool];
  const items = options.items ?? defaultMockItems;
  const transactions = options.transactions ?? defaultMockTransactions;
  const organizations = options.organizations ?? [];
  const notifications = options.notifications ?? [];
  const shoppingList = options.shoppingList ? [...options.shoppingList] : JSON.parse(JSON.stringify(defaultMockShoppingList));
  const polls = options.polls ? [...options.polls] : JSON.parse(JSON.stringify(defaultMockPolls));

  const authUserPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar,
    systemRole: (user as any).systemRole || 'user',
  };

  const cookieConsentPayload = JSON.stringify({
    necessary: true,
    analytics: true,
    marketing: false,
    functional: true,
    timestamp: new Date().toISOString(),
    version: '1.0',
  });

  await page.addInitScript(
    ({ authUserPayload, pools, items, transactions, organizations, shoppingList, polls, cookieConsentPayload }) => {
      localStorage.setItem('pantrypool_token', 'mock_jwt_token_for_playwright');
      localStorage.setItem('pantrypool_cached_auth_user_v1', JSON.stringify(authUserPayload));
      localStorage.setItem('pantrypool_pools_v1', JSON.stringify(pools));
      localStorage.setItem('pantrypool_active_pool_id_v1', JSON.stringify(pools[0]?.id || ''));
      localStorage.setItem('pantrypool_active_user_id_v1', JSON.stringify(authUserPayload.id));
      localStorage.setItem('pantrypool_items_v1', JSON.stringify(items));
      localStorage.setItem('pantrypool_transactions_v1', JSON.stringify(transactions));
      localStorage.setItem('pantrypool_cached_orgs_v1', JSON.stringify(organizations));
      localStorage.setItem('pantrypool_shopping_v1', JSON.stringify(shoppingList));
      localStorage.setItem('pantrypool_polls_v1', JSON.stringify(polls));
      localStorage.setItem('pantrypool_cookie_consent', cookieConsentPayload);
    },
    { authUserPayload, pools, items, transactions, organizations, shoppingList, polls, cookieConsentPayload }
  );

  // Intercept all API endpoints
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { success: true, user: authUserPayload } }));
  await page.route('**/api/pools', (route) => route.fulfill({ json: { success: true, pools } }));
  await page.route('**/api/pools?**', (route) => route.fulfill({ json: { success: true, pools } }));
  await page.route('**/api/items**', (route) => route.fulfill({ json: { success: true, items } }));
  await page.route('**/api/transactions**', (route) => route.fulfill({ json: { success: true, transactions } }));
  await page.route('**/api/organizations**', (route) => route.fulfill({ json: { success: true, organizations } }));
  await page.route(/.*\/api\/notifications(\?.*)?$/, (route) => route.fulfill({ json: { success: true, notifications } }));
  await page.route(/.*\/api\/notifications\/preferences.*/, (route) => route.fulfill({ json: { success: true, preferences: null } }));

  // Stateful Polls API Mock
  await page.route('**/api/pools/*/polls/*/vote', async (route) => {
    try {
      const postData = route.request().postDataJSON() || {};
      const url = route.request().url();
      const parts = url.split('/');
      const pollId = parts[parts.indexOf('polls') + 1];
      const target = polls.find((p: PollItem) => p.id === pollId);
      if (target) {
        const voter = postData.userId || user.id;
        target.options.forEach((o: any) => {
          o.votes = (o.votes || []).filter((v: string) => v !== voter);
        });
        const matchedOpt = target.options.find((o: any) => o.id === postData.optionId);
        if (matchedOpt) {
          matchedOpt.votes.push(voter);
        }
        return route.fulfill({ json: { success: true, poll: target } });
      }
      return route.fulfill({ json: { success: true } });
    } catch {
      return route.fulfill({ json: { success: true } });
    }
  });

  await page.route('**/api/pools/*/polls/*', async (route) => {
    if (route.request().method() === 'PUT') {
      const updates = route.request().postDataJSON() || {};
      const pathname = new URL(route.request().url()).pathname;
      const pollId = pathname.split('/').pop();
      const target = polls.find((p: PollItem) => p.id === pollId);
      if (target) {
        Object.assign(target, updates);
        return route.fulfill({ json: { success: true, poll: target } });
      }
      return route.fulfill({ json: { success: true, poll: { id: pollId, ...updates } } });
    }
    if (route.request().method() === 'DELETE') {
      const pathname = new URL(route.request().url()).pathname;
      const pollId = pathname.split('/').pop();
      const idx = polls.findIndex((p: PollItem) => p.id === pollId);
      if (idx !== -1) polls.splice(idx, 1);
      return route.fulfill({ json: { success: true } });
    }
    return route.continue();
  });

  await page.route('**/api/pools/*/polls', async (route) => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON() || {};
      const newPoll: PollItem = {
        id: `poll_${Date.now()}`,
        poolId: pools[0]?.id || 'pool_default_1',
        title: data.title || 'New Poll',
        options: (data.options || []).map((text: string, idx: number) => ({
          id: `opt_${Date.now()}_${idx}`,
          name: text,
          votes: [],
        })),
        createdBy: user.name,
        createdAt: new Date().toISOString(),
        status: 'active',
        allowWriteIn: data.allowWriteIn !== false,
      };
      polls.unshift(newPoll);
      return route.fulfill({ json: { success: true, poll: newPoll } });
    }
    return route.fulfill({ json: { success: true, polls } });
  });

  // Stateful Shopping List API Mock
  await page.route('**/api/pools/*/shopping-list/*', async (route) => {
    if (route.request().method() === 'PUT') {
      const updates = route.request().postDataJSON() || {};
      const pathname = new URL(route.request().url()).pathname;
      const itemId = pathname.split('/').pop();
      const item = shoppingList.find((s: ShoppingListItem) => s.id === itemId);
      if (item) {
        Object.assign(item, updates);
        return route.fulfill({ json: { success: true, item } });
      }
      return route.fulfill({ json: { success: true, item: { id: itemId, ...updates } } });
    }
    if (route.request().method() === 'DELETE') {
      const pathname = new URL(route.request().url()).pathname;
      const itemId = pathname.split('/').pop();
      const idx = shoppingList.findIndex((s: ShoppingListItem) => s.id === itemId);
      if (idx !== -1) shoppingList.splice(idx, 1);
      return route.fulfill({ json: { success: true } });
    }
    return route.continue();
  });

  await page.route('**/api/pools/*/shopping-list', async (route) => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON() || {};
      const newItem: ShoppingListItem = {
        id: `shop_${Date.now()}`,
        poolId: pools[0]?.id || 'pool_default_1',
        itemName: data.itemName || data.name || 'New Item',
        category: data.category || 'Beverages',
        estimatedCost: Number(data.estimatedCost || data.estCost || 0),
        quantity: Number(data.quantity || 1),
        suggestedBy: user.name,
        purchased: false,
        createdAt: new Date().toISOString(),
      };
      shoppingList.push(newItem);
      return route.fulfill({ json: { success: true, item: newItem } });
    }
    return route.fulfill({ json: { success: true, shoppingList } });
  });

  await page.route('**/api/webhooks**', (route) => route.fulfill({ json: { success: true, webhooks: [] } }));
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
  await page.route(/.*\/api\/(admin\/)?affiliate.*/, (route) => route.fulfill({ json: { success: true, products: [], stats: { totalProducts: 0, activeProducts: 0, totalClicks: 0, clicksBySource: [], topProducts: [] } } }));

  // Savings & Leaderboard Endpoints
  await page.route('**/api/pools/*/savings', (route) => {
    const url = route.request().url();
    const poolId = url.split('/api/pools/')[1]?.split('/savings')[0] || pools[0]?.id || 'pool_default_1';
    return route.fulfill({
      json: {
        success: true,
        poolId,
        savingsEnabled: true,
        savingsLeaderboardOptIn: true,
        leaderboardAlias: 'Main Breakroom Pantry',
        metroTier: 'standard',
        summary: {
          totalSavingsCents: 4500,
          totalSavings: 45.0,
          itemsConsumedCount: 30,
          topSavedItems: [
            { itemId: 'item_cold_brew', itemName: 'Nitro Cold Brew Coffee', totalSavingsCents: 1800, quantity: 12 },
            { itemId: 'item_protein_bar', itemName: 'Almond Honey Crunch Bar', totalSavingsCents: 1500, quantity: 10 },
            { itemId: 'item_fresh_apple', itemName: 'Organic Honeycrisp Apple', totalSavingsCents: 1200, quantity: 8 },
          ]
        }
      }
    });
  });

  await page.route('**/api/leaderboard/savings**', (route) =>
    route.fulfill({
      json: {
        success: true,
        pools: [
          { rank: 1, poolId: 'pool_default_1', displayName: 'Main Breakroom Pantry', category: 'Office', memberCount: 2, totalSavingsCents: 4500, totalSavings: 45.0 },
          { rank: 2, poolId: 'pool_other_2', displayName: 'Engineering Lab Snacks', category: 'Tech', memberCount: 15, totalSavingsCents: 3200, totalSavings: 32.0 },
        ],
        networkTotalSavingsCents: 7700,
        networkTotalSavings: 77.0
      }
    })
  );
}
