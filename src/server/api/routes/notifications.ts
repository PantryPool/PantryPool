import { Hono } from 'hono';
import { HonoEnv } from '../app';
import { timingSafeEqualStr } from '../authUtils';

export function registerNotificationRoutes(app: Hono<HonoEnv>) {
  // Get Notifications
  app.get('/api/notifications', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const notifications = await storage.listNotifications(user.userId, 50);
    return c.json({
      success: true,
      notifications: notifications.map(n => ({
        id: n.id,
        userId: n.user_id,
        poolId: n.pool_id,
        type: n.type,
        title: n.title,
        message: n.message,
        channel: n.channel || 'in_app',
        isRead: Boolean(n.is_read),
        createdAt: n.created_at
      }))
    });
  });

  // Mark Read
  const handleMarkRead = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { notificationId, markAll } = body || {};

    await storage.markNotificationsRead(user.userId, markAll ? undefined : notificationId);
    return c.json({ success: true });
  };

  app.post('/api/notifications/read', handleMarkRead);
  app.post('/api/notifications/mark-read', handleMarkRead);

  // Delete Notification
  app.delete('/api/notifications/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const id = c.req.param('id');
    if (storage.deleteNotification) {
      await storage.deleteNotification(id, user.userId);
    }
    return c.json({ success: true, message: 'Notification deleted successfully.' });
  });

  // Trigger Low Stock Check
  app.post('/api/notifications/trigger-low-stock-check', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to trigger low-stock audits.' }, 401);
    }
    const body: any = await c.req.json().catch(() => ({}));
    const { poolId, items: clientItems } = body || {};
    const targetUserId = user.userId;

    let candidateItems: any[] = [];
    if (Array.isArray(clientItems) && clientItems.length > 0) {
      candidateItems = clientItems;
    } else if (poolId) {
      candidateItems = await storage.listItemsByPool(poolId);
    }

    const lowStockItems = candidateItems.filter((item: any) => {
      const stock = Number(item.stock ?? 0);
      const minStock = Number(item.minStock ?? item.min_stock ?? 0);
      return stock <= minStock;
    });

    const createdAlerts: any[] = [];
    const env = c.env as any;
    const recipientUser = await storage.getUserById(targetUserId);

    for (const item of lowStockItems) {
      const stock = Number(item.stock ?? 0);
      const minStock = Number(item.minStock ?? item.min_stock ?? 0);
      const alertId = 'notif_' + crypto.randomUUID();
      const newAlert = {
        id: alertId,
        userId: targetUserId,
        poolId: item.poolId || item.pool_id || poolId || 'pool1',
        type: 'low_stock',
        title: `⚠️ Low Stock: ${item.name}`,
        message: `${item.name} is down to ${stock} in stock (minimum threshold: ${minStock}). Restock recommended!`,
        channel: 'in_app',
        isRead: false,
        createdAt: new Date().toISOString()
      };

      await storage.createNotification({
        id: newAlert.id,
        user_id: newAlert.userId,
        pool_id: newAlert.poolId,
        type: newAlert.type,
        title: newAlert.title,
        message: newAlert.message,
        channel: newAlert.channel,
        is_read: false
      }).catch(() => {});

      createdAlerts.push(newAlert);
    }

    // If candidate items were low and user has email, send low stock alert email
    if (createdAlerts.length > 0 && recipientUser?.email) {
      try {
        const { sendEmail, renderEmailTemplate } = await import('../../services/emailService');
        const itemListHtml = createdAlerts.map(a => `<li>${a.message}</li>`).join('');
        const emailHtml = renderEmailTemplate({
          headline: 'Low Stock Alert for Your Pantry Pool',
          intro: `Hello ${recipientUser.name || 'Champion'},`,
          mainContent: `
            <p>One or more items in your pantry pool have fallen to or below minimum inventory levels:</p>
            <ul>${itemListHtml}</ul>
            <p>Please consider restocking to keep the breakroom supplied!</p>
          `,
          ctaText: 'Open PantryPool Catalog',
          ctaUrl: (env?.APP_URL || process.env.APP_URL || 'https://pantrypool.com'),
        });
        await sendEmail({
          to: recipientUser.email,
          subject: `⚠️ Low Stock Alert: ${createdAlerts.length} item(s) need restocking`,
          html: emailHtml,
          userId: targetUserId,
          emailType: 'low_stock_alert',
          metadata: { poolId, count: createdAlerts.length },
          storage,
        }, env);
      } catch (err) {
        console.warn('[Notification Route] Low stock email delivery error:', err);
      }
    }

    return c.json({
      success: true,
      message: `Audit complete: ${createdAlerts.length} low-stock item(s) alerted.`,
      alerts: createdAlerts,
      totalChecked: candidateItems.length
    });
  });

  // Trigger Weekly Digest (Tier-Gated to Hosted Plus & Enterprise)
  app.post('/api/notifications/trigger-weekly-digest', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { poolId, poolName, userId } = body || {};
    const targetUserId = user?.userId || userId || 'u1';
    const env = c.env as any;

    if (!poolId) {
      return c.json({ success: false, error: 'Missing required poolId parameter' }, 400);
    }

    const pool = await storage.getPoolById(poolId);
    if (!pool) {
      return c.json({ success: false, error: 'Pool not found' }, 404);
    }

    // Check Organization Tier
    const { isWeeklyDigestEligible, normalizeTier } = await import('../tierLimits');
    let orgTier = 'community';
    if (pool.organization_id) {
      const org = await storage.getOrgById(pool.organization_id);
      if (org?.tier) orgTier = normalizeTier(org.tier);
    }

    const isSuperAdmin = user?.systemRole === 'superadmin';
    const isEligible = isWeeklyDigestEligible(orgTier) || isSuperAdmin;

    if (!isEligible) {
      return c.json(
        {
          success: false,
          requiresUpgrade: true,
          requiredTier: 'plus',
          currentTier: orgTier,
          error: 'Weekly email summary digests are exclusively available on Hosted Plus ($12/mo) and Enterprise plans. Please upgrade your workspace to enable automated weekly digests.',
        },
        403
      );
    }

    const { dispatchWeeklyDigestForPool } = await import('../../services/digestService');
    const result = await dispatchWeeklyDigestForPool(poolId, storage, env, {
      specificUserId: targetUserId,
      force: isSuperAdmin,
    });

    if (!result.success) {
      return c.json({ success: false, error: result.error || 'Failed to generate weekly digest' }, 400);
    }

    const digestNotif = {
      id: 'digest_' + crypto.randomUUID(),
      userId: targetUserId,
      poolId: pool.id,
      type: 'weekly_digest',
      title: `📊 Weekly Summary Digest: ${pool.name}`,
      message: result.metrics?.summaryText || `Weekly digest generated for "${pool.name}".`,
      channel: 'email',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    return c.json({
      success: true,
      message: `Weekly balance summary digest generated for "${pool.name}".`,
      digest: digestNotif,
      metrics: result.metrics,
      emailsSent: result.emailsSent,
    });
  });

  // Send Test In-App & Email Notification
  const handleTestNotification = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const targetUserId = user?.userId || body?.userId || 'u1';
    const poolId = body?.poolId || 'pool1';
    const env = c.env as any;

    const testAlert = {
      id: 'notif_test_' + crypto.randomUUID(),
      userId: targetUserId,
      poolId,
      type: 'system',
      title: '🧪 Integration Test Alert',
      message: 'Test notification and email channel verified successfully!',
      channel: 'in_app',
      isRead: false,
      createdAt: new Date().toISOString()
    };

    await storage.createNotification({
      id: testAlert.id,
      user_id: testAlert.userId,
      pool_id: testAlert.poolId,
      type: testAlert.type,
      title: testAlert.title,
      message: testAlert.message,
      channel: testAlert.channel,
      is_read: false
    }).catch(() => {});

    let emailSent = false;
    const recipientUser = await storage.getUserById(targetUserId);
    if (recipientUser?.email) {
      try {
        const { sendEmail, renderEmailTemplate } = await import('../../services/emailService');
        const emailHtml = renderEmailTemplate({
          headline: 'PantryPool Test Notification',
          intro: `Hello ${recipientUser.name || 'User'},`,
          mainContent: `
            <p>This is a test notification confirming that the PantryPool email notification channel is fully operational!</p>
            <p>You will receive timely updates for low-stock alerts, weekly digests, and account security notices.</p>
          `,
          ctaText: 'Visit PantryPool',
          ctaUrl: (env?.APP_URL || process.env.APP_URL || 'https://pantrypool.com'),
        });
        const sendRes = await sendEmail({
          to: recipientUser.email,
          subject: '🧪 PantryPool Notification Test',
          html: emailHtml,
          userId: targetUserId,
          emailType: 'test_notification',
          storage,
        }, env);
        emailSent = sendRes.success;
      } catch (err) {
        console.warn('[Notification Route] Test email error:', err);
      }
    }

    return c.json({
      success: true,
      message: emailSent 
        ? `Test notification dispatched to your inbox and emailed to ${recipientUser?.email}!`
        : 'Test notification dispatched to your inbox.',
      alert: testAlert,
      emailSent
    });
  };

  app.post('/api/notifications/test-notification', handleTestNotification);
  app.post('/api/notifications/test-alert', handleTestNotification);

  // Get Notification Preferences
  app.get('/api/notifications/preferences', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const userId = user?.userId || c.req.query('userId') || 'u1';

    const saved = storage.getNotificationPreferences ? await storage.getNotificationPreferences(userId) : null;
    return c.json({
      success: true,
      preferences: {
        userId,
        lowStockEmail: saved ? Boolean(saved.low_stock_email) : true,
        lowStockSms: saved ? Boolean(saved.low_stock_sms) : false,
        weeklyDigestEmail: saved ? Boolean(saved.weekly_digest_email) : true,
        phoneNumber: saved?.phone_number || '',
      },
    });
  });

  // Save Notification Preferences
  app.post('/api/notifications/preferences', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { lowStockEmail, lowStockSms, weeklyDigestEmail, phoneNumber, userId } = body || {};
    const cleanUserId = user?.userId || userId || 'u1';

    const saved = storage.saveNotificationPreferences
      ? await storage.saveNotificationPreferences(cleanUserId, {
          low_stock_email: lowStockEmail !== undefined ? Boolean(lowStockEmail) : undefined,
          low_stock_sms: lowStockSms !== undefined ? Boolean(lowStockSms) : undefined,
          weekly_digest_email: weeklyDigestEmail !== undefined ? Boolean(weeklyDigestEmail) : undefined,
          phone_number: phoneNumber !== undefined ? String(phoneNumber) : undefined,
        })
      : null;

    return c.json({
      success: true,
      message: 'Notification preferences updated successfully.',
      preferences: {
        userId: cleanUserId,
        lowStockEmail: saved ? Boolean(saved.low_stock_email) : Boolean(lowStockEmail ?? true),
        lowStockSms: saved ? Boolean(saved.low_stock_sms) : Boolean(lowStockSms ?? false),
        weeklyDigestEmail: saved ? Boolean(saved.weekly_digest_email) : Boolean(weeklyDigestEmail ?? true),
        phoneNumber: saved ? (saved.phone_number || '') : (phoneNumber || ''),
      },
    });
  });

  // Internal Authenticated Email Relay
  // Allows edge environments (e.g. Cloudflare Pages) or microservices to route outbound email via this Node.js instance
  app.post('/api/internal/send-email', async (c) => {
    const secretHeader = c.req.header('x-relay-secret') || c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
    const env = c.env as any;
    const expectedSecret = env?.EMAIL_RELAY_SECRET || process.env.EMAIL_RELAY_SECRET;

    if (!expectedSecret || !secretHeader || !timingSafeEqualStr(secretHeader, expectedSecret)) {
      return c.json({ success: false, error: 'Unauthorized relay access' }, 401);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { to, subject, html, text, from } = body || {};

    if (!to || !subject || !html) {
      return c.json({ success: false, error: 'Missing required parameters: to, subject, or html' }, 400);
    }

    try {
      const storage = c.get('storage');
      const { sendEmail } = await import('../../services/emailService');
      const result = await sendEmail({ to, subject, html, text, from, emailType: 'internal_relay', storage }, env);
      return c.json(result, result.success ? 200 : 500);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || 'Email delivery failed' }, 500);
    }
  });

  // Internal Scheduled Weekly Digest Sweep (Triggered every Monday morning via cron/workflow)
  app.post('/api/internal/dispatch-weekly-digest', async (c) => {
    const secretHeader =
      c.req.header('x-cron-secret') ||
      c.req.header('x-relay-secret') ||
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
    const env = c.env as any;
    const expectedSecret =
      env?.CRON_SECRET || process.env.CRON_SECRET || env?.EMAIL_RELAY_SECRET || process.env.EMAIL_RELAY_SECRET;

    if (!expectedSecret || !secretHeader || !timingSafeEqualStr(secretHeader, expectedSecret)) {
      return c.json({ success: false, error: 'Unauthorized cron dispatch access' }, 401);
    }

    try {
      const storage = c.get('storage');
      const { dispatchWeeklyDigestsAllPools } = await import('../../services/digestService');
      const summary = await dispatchWeeklyDigestsAllPools(storage, env);
      return c.json({
        success: true,
        message: `Weekly digest sweep completed. Dispatched to ${summary.eligiblePoolsCount} eligible pools (${summary.totalEmailsSent} emails sent).`,
        summary,
      });
    } catch (err: any) {
      console.error('[Notification Route] Internal weekly digest dispatch failed:', err);
      return c.json({ success: false, error: err?.message || 'Digest sweep execution failed' }, 500);
    }
  });
}

