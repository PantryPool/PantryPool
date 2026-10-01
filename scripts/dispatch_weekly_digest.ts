/**
 * 📊 PantryPool Weekly Email Digest Dispatcher CLI & Cron Entrypoint
 * 
 * Executes the trailing 7-day summary digest calculation and email delivery
 * for all eligible Hosted Plus and Enterprise pantry pools.
 * 
 * Usage:
 *   npx tsx scripts/dispatch_weekly_digest.ts
 *   npx tsx scripts/dispatch_weekly_digest.ts --dry-run
 *   npx tsx scripts/dispatch_weekly_digest.ts --pool=<poolId>
 */

import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  const poolArg = process.argv.find((a) => a.startsWith('--pool='));
  const targetPoolId = poolArg ? poolArg.split('=')[1] : undefined;

  const appUrl = (process.env.APP_URL || 'https://pantrypool.com').replace(/\/+$/, '');
  const cronSecret = process.env.CRON_SECRET || process.env.EMAIL_RELAY_SECRET;

  console.log(`\n======================================================`);
  console.log(`📊 PantryPool Weekly Digest Dispatcher`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Target: ${targetPoolId ? `Pool ${targetPoolId}` : 'All Active Pools'}`);
  console.log(`Dry Run: ${isDryRun ? 'YES (Simulated)' : 'NO (Live)'}`);
  console.log(`======================================================\n`);

  // If remote APP_URL and CRON_SECRET are provided, trigger via internal API
  if (cronSecret && !targetPoolId) {
    console.log(`📡 Triggering via HTTP endpoint: ${appUrl}/api/internal/dispatch-weekly-digest`);
    try {
      const response = await fetch(`${appUrl}/api/internal/dispatch-weekly-digest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': cronSecret,
        },
      });

      const data: any = await response.json();
      if (!response.ok || !data.success) {
        console.error(`❌ HTTP Error (${response.status}):`, data.error || data);
        process.exit(1);
      }

      console.log(`✅ Success: ${data.message}`);
      if (data.summary) {
        console.log(`   Checked: ${data.summary.totalPoolsChecked} pool(s)`);
        console.log(`   Eligible (Plus/Enterprise): ${data.summary.eligiblePoolsCount} pool(s)`);
        console.log(`   Skipped (Community/Standard): ${data.summary.skippedTierCount} pool(s)`);
        console.log(`   Emails Sent: ${data.summary.totalEmailsSent}`);
        console.log(`   In-App Notifications: ${data.summary.totalInAppAlertsCreated}`);
      }
      process.exit(0);
    } catch (err: any) {
      console.warn(`⚠️ HTTP dispatch failed (${err.message}). Falling back to local storage adapter...`);
    }
  }

  // Fallback to local storage execution (Node + MySQL)
  try {
    const { MySqlStorageAdapter } = await import('../src/server/storage/mysqlAdapter');
    const { dispatchWeeklyDigestsAllPools, dispatchWeeklyDigestForPool, computeWeeklyDigestMetrics } = await import(
      '../src/server/services/digestService'
    );

    const storage = new MySqlStorageAdapter();

    if (targetPoolId) {
      console.log(`🔍 Inspecting target pool: ${targetPoolId}`);
      const metrics = await computeWeeklyDigestMetrics(targetPoolId, storage);
      if (!metrics) {
        console.error(`❌ Pool "${targetPoolId}" not found or archived.`);
        process.exit(1);
      }

      console.log(`Pool Name: ${metrics.poolName}`);
      console.log(`Org Tier: ${metrics.orgTier} (Eligible: ${metrics.isEligible})`);
      console.log(`Summary: ${metrics.summaryText}`);
      console.log(`Consumed: ${metrics.totalConsumedUnits} units (${metrics.currency}${(metrics.totalConsumedCents / 100).toFixed(2)})`);
      console.log(`Restocked: ${metrics.totalRestockEvents} events (${metrics.currency}${(metrics.totalRestockedCents / 100).toFixed(2)})`);
      console.log(`Members in Deficit: ${metrics.membersInDeficitCount}`);

      if (!isDryRun) {
        const res = await dispatchWeeklyDigestForPool(targetPoolId, storage, process.env, { force: true });
        console.log(`\n📬 Dispatch Result:`, res);
      } else {
        console.log(`\n[Dry Run] Skipped live email dispatch.`);
      }
    } else {
      console.log(`🚀 Executing full weekly sweep across all pools...`);
      const summary = await dispatchWeeklyDigestsAllPools(storage, process.env);
      console.log(`\n======================================================`);
      console.log(`✅ Sweep Complete!`);
      console.log(`   Total Pools Checked: ${summary.totalPoolsChecked}`);
      console.log(`   Eligible (Plus/Enterprise): ${summary.eligiblePoolsCount}`);
      console.log(`   Skipped (Community/Standard): ${summary.skippedTierCount}`);
      console.log(`   Emails Sent: ${summary.totalEmailsSent}`);
      console.log(`   In-App Notifications: ${summary.totalInAppAlertsCreated}`);
      console.log(`======================================================\n`);
    }

    process.exit(0);
  } catch (err: any) {
    console.error(`❌ Execution error:`, err);
    process.exit(1);
  }
}

run();
