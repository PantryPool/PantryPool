import type { StorageAdapter, StoragePool, StoragePoolMember, StorageTransaction, StorageItem } from '../storage/types';
import { isWeeklyDigestEligible, normalizeTier } from '../api/tierLimits';
import { sendEmail, renderEmailTemplate } from './emailService';

export interface WeeklyDigestMetrics {
  poolId: string;
  poolName: string;
  currency: string;
  orgTier: string;
  isEligible: boolean;
  startDate: string;
  endDate: string;
  // Consumption breakdown
  totalConsumedUnits: number;
  totalConsumedCents: number;
  topConsumedItems: Array<{ name: string; quantity: number; totalCents: number }>;
  // Restocks
  totalRestockEvents: number;
  totalRestockedCents: number;
  // Member balances
  totalMembers: number;
  membersInDeficitCount: number;
  totalDeficitCents: number;
  // Low stock inventory
  lowStockItems: Array<{ name: string; stock: number; minStock: number }>;
  summaryText: string;
  htmlContent: string;
}

export interface DigestDispatchResult {
  success: boolean;
  poolId: string;
  poolName: string;
  isEligible: boolean;
  tier: string;
  recipientsCount: number;
  emailsSent: number;
  inAppAlertsCreated: number;
  error?: string;
  metrics?: WeeklyDigestMetrics;
}

/**
 * Aggregates consumption, restock, and member balance metrics over the last 7 days.
 */
export async function computeWeeklyDigestMetrics(
  poolId: string,
  storage: StorageAdapter,
  daysBack: number = 7
): Promise<WeeklyDigestMetrics | null> {
  const pool = await storage.getPoolById(poolId);
  if (!pool || pool.is_archived) return null;

  let orgTier = 'community';
  if (pool.organization_id) {
    const org = await storage.getOrgById(pool.organization_id);
    if (org?.tier) {
      orgTier = normalizeTier(org.tier);
    }
  }

  const isEligible = isWeeklyDigestEligible(orgTier);
  const now = new Date();
  const startTime = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const currency = pool.currency || '$';

  // 1. Transactions over the trailing window
  const allTxs = (await storage.listTransactionsByPool(poolId, 500)) || [];
  const windowTxs = allTxs.filter((t) => {
    const rawDate = (t as any).timestamp || t.created_at;
    if (!rawDate) return false;
    const txDate = new Date(rawDate);
    return txDate >= startTime && txDate <= now;
  });

  // Consumption
  const consumptionTxs = windowTxs.filter((t) => t.type === 'consume' || (t.type as string) === 'consumption');
  let totalConsumedUnits = 0;
  let totalConsumedCents = 0;
  const itemMap = new Map<string, { name: string; quantity: number; totalCents: number }>();

  for (const tx of consumptionTxs) {
    const qty = Number(tx.quantity ?? 1);
    const cents = Number(tx.amount_cents ?? Math.round(Number(tx.amount || 0) * 100));
    totalConsumedUnits += qty;
    totalConsumedCents += cents;

    const itemName = tx.item_name || 'Item';
    const existing = itemMap.get(itemName) || { name: itemName, quantity: 0, totalCents: 0 };
    existing.quantity += qty;
    existing.totalCents += cents;
    itemMap.set(itemName, existing);
  }

  const topConsumedItems = Array.from(itemMap.values())
    .sort((a, b) => b.quantity - a.quantity || b.totalCents - a.totalCents)
    .slice(0, 5);

  // Restocks & Contributions
  const restockTxs = windowTxs.filter((t) => t.type === 'deposit' || (t.type as string) === 'contribution' || (t.type as string) === 'restock');
  let totalRestockedCents = 0;
  for (const tx of restockTxs) {
    totalRestockedCents += Number(tx.amount_cents ?? Math.round(Number(tx.amount || 0) * 100));
  }
  const totalRestockEvents = restockTxs.length;

  // 2. Member Balances
  const members = (await storage.listPoolMembers(poolId)) || [];
  let membersInDeficitCount = 0;
  let totalDeficitCents = 0;

  for (const m of members) {
    const balCents = m.balance_cents !== undefined ? Number(m.balance_cents) : Math.round(Number(m.balance || 0) * 100);
    if (balCents < 0) {
      membersInDeficitCount++;
      totalDeficitCents += Math.abs(balCents);
    }
  }

  // 3. Low Stock Items
  const items = (await storage.listItemsByPool(poolId)) || [];
  const lowStockItems = items
    .filter((i) => Number(i.stock ?? 0) <= Number(i.min_stock ?? 0))
    .map((i) => ({
      name: i.name,
      stock: Number(i.stock ?? 0),
      minStock: Number(i.min_stock ?? 0),
    }));

  const formattedConsumed = `${currency}${(totalConsumedCents / 100).toFixed(2)}`;
  const formattedRestocked = `${currency}${(totalRestockedCents / 100).toFixed(2)}`;
  const formattedDeficit = `${currency}${(totalDeficitCents / 100).toFixed(2)}`;

  const summaryText = `Weekly Digest for "${pool.name}": ${totalConsumedUnits} items consumed (${formattedConsumed}), ${totalRestockEvents} restock/deposits (${formattedRestocked}). ${
    membersInDeficitCount > 0 ? `${membersInDeficitCount} member(s) in deficit (${formattedDeficit} total).` : 'All member balances in good standing.'
  }`;

  // Rich HTML content block for email
  const topItemsHtml =
    topConsumedItems.length > 0
      ? topConsumedItems
          .map(
            (item) =>
              `<li style="margin-bottom: 4px;"><strong>${item.name}</strong>: ${item.quantity} consumed (${currency}${(item.totalCents / 100).toFixed(2)})</li>`
          )
          .join('')
      : '<li style="color: #6B6B6B;">No items logged this week.</li>';

  const lowStockHtml =
    lowStockItems.length > 0
      ? `
      <div style="margin-top: 16px; padding: 12px 16px; background-color: #FFF6F0; border-left: 4px solid #E8694A; border-radius: 6px;">
        <h4 style="margin: 0 0 6px 0; color: #D46238; font-size: 13px; font-weight: 700;">⚠️ Restock Needed (${lowStockItems.length} item${lowStockItems.length === 1 ? '' : 's'})</h4>
        <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #555;">
          ${lowStockItems.slice(0, 5).map((i) => `<li>${i.name} (only ${i.stock} left, min: ${i.minStock})</li>`).join('')}
        </ul>
      </div>
    `
      : '';

  const htmlContent = `
    <p>Here is your weekly summary of activity, pantry consumption, and balances for <strong>${pool.name}</strong> over the past 7 days:</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border-collapse: separate; border-spacing: 12px 0;">
      <tr>
        <td style="background-color: #F8F6F0; padding: 16px; border-radius: 8px; border: 1px solid #E0DAD1; text-align: center; width: 33%;">
          <div style="font-size: 11px; text-transform: uppercase; color: #6B6B6B; font-weight: 700; letter-spacing: 0.5px;">Consumption</div>
          <div style="font-size: 20px; font-weight: 800; color: #2D2D2D; margin-top: 4px;">${formattedConsumed}</div>
          <div style="font-size: 12px; color: #6B6B6B; margin-top: 2px;">${totalConsumedUnits} item${totalConsumedUnits === 1 ? '' : 's'}</div>
        </td>
        <td style="background-color: #F8F6F0; padding: 16px; border-radius: 8px; border: 1px solid #E0DAD1; text-align: center; width: 33%;">
          <div style="font-size: 11px; text-transform: uppercase; color: #6B6B6B; font-weight: 700; letter-spacing: 0.5px;">Restocked</div>
          <div style="font-size: 20px; font-weight: 800; color: #5A9A6B; margin-top: 4px;">${formattedRestocked}</div>
          <div style="font-size: 12px; color: #6B6B6B; margin-top: 2px;">${totalRestockEvents} contribution${totalRestockEvents === 1 ? '' : 's'}</div>
        </td>
        <td style="background-color: #F8F6F0; padding: 16px; border-radius: 8px; border: 1px solid #E0DAD1; text-align: center; width: 33%;">
          <div style="font-size: 11px; text-transform: uppercase; color: #6B6B6B; font-weight: 700; letter-spacing: 0.5px;">Deficits</div>
          <div style="font-size: 20px; font-weight: 800; color: ${membersInDeficitCount > 0 ? '#E8694A' : '#2D2D2D'}; margin-top: 4px;">${membersInDeficitCount > 0 ? formattedDeficit : '$0.00'}</div>
          <div style="font-size: 12px; color: #6B6B6B; margin-top: 2px;">${membersInDeficitCount} member${membersInDeficitCount === 1 ? '' : 's'}</div>
        </td>
      </tr>
    </table>

    <div style="margin-top: 20px;">
      <h3 style="font-size: 14px; font-weight: 700; color: #2D2D2D; margin: 0 0 8px 0;">Top Consumed Items</h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #444;">
        ${topItemsHtml}
      </ul>
    </div>

    ${lowStockHtml}
  `;

  return {
    poolId,
    poolName: pool.name,
    currency,
    orgTier,
    isEligible,
    startDate: startTime.toISOString(),
    endDate: now.toISOString(),
    totalConsumedUnits,
    totalConsumedCents,
    topConsumedItems,
    totalRestockEvents,
    totalRestockedCents,
    totalMembers: members.length,
    membersInDeficitCount,
    totalDeficitCents,
    lowStockItems,
    summaryText,
    htmlContent,
  };
}

/**
 * Dispatches the weekly summary digest to pool members.
 * Supports restricting to a single user (for manual preview/test) or all opted-in members.
 */
export async function dispatchWeeklyDigestForPool(
  poolId: string,
  storage: StorageAdapter,
  env?: any,
  options?: {
    force?: boolean;
    specificUserId?: string;
  }
): Promise<DigestDispatchResult> {
  const pool = await storage.getPoolById(poolId);
  if (!pool || pool.is_archived) {
    return {
      success: false,
      poolId,
      poolName: 'Unknown',
      isEligible: false,
      tier: 'unknown',
      recipientsCount: 0,
      emailsSent: 0,
      inAppAlertsCreated: 0,
      error: 'Pool not found or archived',
    };
  }

  const metrics = await computeWeeklyDigestMetrics(poolId, storage);
  if (!metrics) {
    return {
      success: false,
      poolId,
      poolName: pool.name,
      isEligible: false,
      tier: 'unknown',
      recipientsCount: 0,
      emailsSent: 0,
      inAppAlertsCreated: 0,
      error: 'Failed to compute pool metrics',
    };
  }

  // Tier gating: Hosted Plus or Enterprise only (unless force is requested, e.g. for superadmin testing)
  if (!metrics.isEligible && !options?.force) {
    return {
      success: false,
      poolId,
      poolName: pool.name,
      isEligible: false,
      tier: metrics.orgTier,
      recipientsCount: 0,
      emailsSent: 0,
      inAppAlertsCreated: 0,
      error: 'Weekly summary digest is exclusively available on Hosted Plus ($12/mo) and Enterprise workspaces.',
      metrics,
    };
  }

  const allMembers = (await storage.listPoolMembers(poolId)) || [];
  const targetMembers = options?.specificUserId
    ? allMembers.filter((m) => m.user_id === options.specificUserId)
    : allMembers;

  const appUrl = env?.APP_URL || process.env.APP_URL || 'https://pantrypool.com';
  let emailsSent = 0;
  let inAppAlertsCreated = 0;

  for (const member of targetMembers) {
    const userId = member.user_id;

    // Check user's notification preferences
    const prefs = storage.getNotificationPreferences ? await storage.getNotificationPreferences(userId) : null;
    const wantsEmail = prefs ? Boolean(prefs.weekly_digest_email) : true;
    const wantsInApp = prefs?.weekly_digest_in_app !== undefined ? Boolean(prefs.weekly_digest_in_app) : true;

    // 1. Create In-App Notification if enabled
    if (wantsInApp) {
      const alertId = 'digest_' + crypto.randomUUID();
      await storage
        .createNotification({
          id: alertId,
          user_id: userId,
          pool_id: poolId,
          type: 'weekly_digest',
          title: `📊 Weekly Summary Digest: ${pool.name}`,
          message: metrics.summaryText,
          channel: wantsEmail ? 'email' : 'in_app',
          is_read: false,
          created_at: new Date().toISOString(),
        })
        .catch(() => {});
      inAppAlertsCreated++;
    }

    // 2. Send Branded Email Digest if opted in
    if (wantsEmail) {
      const recipientUser = await storage.getUserById(userId);
      if (recipientUser?.email) {
        try {
          const emailHtml = renderEmailTemplate({
            headline: `Weekly Summary Digest: ${pool.name}`,
            intro: `Hello ${recipientUser.name || 'Member'},`,
            mainContent: metrics.htmlContent,
            ctaText: `Open ${pool.name} Breakroom`,
            ctaUrl: `${appUrl}/#pool=${pool.id}`,
            footerNote: 'You received this weekly digest because your notification preferences for this pantry pool are active. Manage your email preferences in the Notification Center.',
          });

          const result = await sendEmail(
            {
              to: recipientUser.email,
              subject: `📊 Weekly Digest: ${pool.name} (${metrics.totalConsumedUnits} consumed, ${metrics.membersInDeficitCount} in deficit)`,
              html: emailHtml,
              userId,
              emailType: 'weekly_digest',
              metadata: {
                poolId,
                poolName: pool.name,
                totalConsumedCents: metrics.totalConsumedCents,
                totalRestockedCents: metrics.totalRestockedCents,
              },
              storage,
            },
            env
          );

          if (result.success) {
            emailsSent++;
          }
        } catch (err) {
          console.warn(`[Digest Service] Failed sending email to ${recipientUser.email}:`, err);
        }
      }
    }
  }

  return {
    success: true,
    poolId,
    poolName: pool.name,
    isEligible: true,
    tier: metrics.orgTier,
    recipientsCount: targetMembers.length,
    emailsSent,
    inAppAlertsCreated,
    metrics,
  };
}

/**
 * Sweeps all active pools across the database and dispatches weekly digests for eligible tiers.
 * Used by scheduled Monday morning crons.
 */
export async function dispatchWeeklyDigestsAllPools(
  storage: StorageAdapter,
  env?: any
): Promise<{
  success: boolean;
  totalPoolsChecked: number;
  eligiblePoolsCount: number;
  skippedTierCount: number;
  totalEmailsSent: number;
  totalInAppAlertsCreated: number;
  results: DigestDispatchResult[];
}> {
  const pools = storage.getAllPools ? await storage.getAllPools() : [];
  const activePools = pools.filter((p) => !p.is_archived);

  let eligiblePoolsCount = 0;
  let skippedTierCount = 0;
  let totalEmailsSent = 0;
  let totalInAppAlertsCreated = 0;
  const results: DigestDispatchResult[] = [];

  for (const pool of activePools) {
    let orgTier = 'community';
    if (pool.organization_id) {
      const org = await storage.getOrgById(pool.organization_id);
      if (org?.tier) orgTier = normalizeTier(org.tier);
    }

    if (!isWeeklyDigestEligible(orgTier)) {
      skippedTierCount++;
      continue;
    }

    eligiblePoolsCount++;
    const res = await dispatchWeeklyDigestForPool(pool.id, storage, env);
    results.push(res);
    totalEmailsSent += res.emailsSent;
    totalInAppAlertsCreated += res.inAppAlertsCreated;
  }

  return {
    success: true,
    totalPoolsChecked: activePools.length,
    eligiblePoolsCount,
    skippedTierCount,
    totalEmailsSent,
    totalInAppAlertsCreated,
    results,
  };
}
