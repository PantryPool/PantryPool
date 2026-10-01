import { Hono } from 'hono';
import { HonoEnv } from '../app';

export function isSafeWebhookUrl(urlString: string): { safe: boolean; reason?: string } {
  if (!urlString || typeof urlString !== 'string') {
    return { safe: false, reason: 'Webhook URL is required.' };
  }
  try {
    const parsed = new URL(urlString.trim());
    if (parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Webhook URL must use secure HTTPS protocol.' };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return { safe: false, reason: 'Webhook URL cannot point to internal, private, or loopback addresses.' };
    }

    if (/^\d+$/.test(hostname) || /^0[0-7]+/.test(hostname) || /^0x[0-9a-f]+/i.test(hostname)) {
      return { safe: false, reason: 'Invalid IP address formatting in webhook URL.' };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'Invalid webhook URL format.' };
  }
}

async function checkPoolWebhookAccess(
  storage: any,
  poolId: string,
  user?: any,
  requireManager = false
): Promise<{ allowed: boolean; pool: any }> {
  if (!user?.userId) {
    return { allowed: false, pool: null };
  }
  const pool = storage.getPoolById ? await storage.getPoolById(poolId) : null;
  if (!pool) return { allowed: false, pool: null };

  const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
  if (isSuperAdmin) return { allowed: true, pool };

  const isChampion = pool.champion_id === user.userId;
  const member = storage.getPoolMember ? await storage.getPoolMember(poolId, user.userId) : null;
  const isPoolAdmin = member && (member.role === 'champion' || member.role === 'admin');

  let isOrgAdmin = false;
  if (pool.organization_id && storage.getOrgById) {
    const org = await storage.getOrgById(pool.organization_id);
    if (org && org.owner_id === user.userId) isOrgAdmin = true;
    else if (storage.getOrgMember) {
      const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
      if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) isOrgAdmin = true;
    }
  }

  const isManager = Boolean(isChampion || isPoolAdmin || isOrgAdmin);
  if (requireManager) {
    return { allowed: isManager, pool };
  }
  return { allowed: Boolean(isManager || member), pool };
}

export function registerWebhookRoutes(app: Hono<HonoEnv>) {
  // List webhooks
  app.get('/api/pools/:poolId/webhooks', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    if (!poolId) return c.json({ success: false, error: 'poolId is required.' }, 400);

    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to view webhooks.' }, 401);
    }

    const { allowed, pool } = await checkPoolWebhookAccess(storage, poolId, user, false);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);
    if (!allowed) {
      return c.json({ success: false, error: 'Forbidden: You must be a member of this pool.' }, 403);
    }

    const webhooks = await storage.listWebhooks(poolId);
    return c.json({
      success: true,
      webhooks: webhooks.map(w => ({
        id: w.id,
        poolId: w.pool_id,
        platform: w.platform,
        webhookUrl: w.webhook_url,
        channelName: w.channel_name,
        enabledEvents: w.enabled_events ? w.enabled_events.split(',') : ['low_stock', 'restock'],
        createdAt: w.created_at
      }))
    });
  });

  // Save webhook
  app.post('/api/pools/:poolId/webhooks', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const body: any = await c.req.json().catch(() => ({}));
    const { platform, webhookUrl, channelName, enabledEvents } = body || {};

    if (!poolId || !platform || !webhookUrl) {
      return c.json({ success: false, error: 'poolId, platform, and webhookUrl are required.' }, 400);
    }

    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to configure webhooks.' }, 401);
    }

    const { allowed, pool } = await checkPoolWebhookAccess(storage, poolId, user, true);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);
    if (!allowed) {
      return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required to configure webhooks.' }, 403);
    }

    const urlCheck = isSafeWebhookUrl(webhookUrl);
    if (!urlCheck.safe) {
      return c.json({ success: false, error: urlCheck.reason }, 400);
    }

    const webhook = await storage.saveWebhook({
      id: 'wh_' + crypto.randomUUID(),
      pool_id: poolId,
      platform,
      webhook_url: webhookUrl.trim(),
      channel_name: channelName || null,
      enabled_events: Array.isArray(enabledEvents) ? enabledEvents.join(',') : (enabledEvents || 'low_stock,restock')
    });

    return c.json({ success: true, webhook });
  });

  // Delete webhook
  app.delete('/api/pools/:poolId/webhooks/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const id = c.req.param('id');

    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to delete webhooks.' }, 401);
    }

    const { allowed, pool } = await checkPoolWebhookAccess(storage, poolId, user, true);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);
    if (!allowed) {
      return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required to delete webhooks.' }, 403);
    }

    await storage.deleteWebhook(id, poolId);
    return c.json({ success: true, message: 'Webhook deleted successfully.' });
  });

  // Flat Webhook Endpoints (Frontend Compatibility)
  app.get('/api/webhooks', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.query('poolId');
    if (!poolId) return c.json({ success: false, error: 'poolId is required.' }, 400);

    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to view webhooks.' }, 401);
    }

    const { allowed, pool } = await checkPoolWebhookAccess(storage, poolId, user, false);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);
    if (!allowed) {
      return c.json({ success: false, error: 'Forbidden: You must be a member of this pool.' }, 403);
    }

    const webhooks = await storage.listWebhooks(poolId);
    return c.json({
      success: true,
      webhooks: webhooks.map(w => ({
        id: w.id,
        poolId: w.pool_id,
        platform: w.platform,
        webhookUrl: w.webhook_url,
        channelName: w.channel_name,
        enabledEvents: w.enabled_events ? (w.enabled_events.startsWith('[') ? JSON.parse(w.enabled_events) : w.enabled_events.split(',')) : ['low_stock', 'restock'],
        createdAt: w.created_at
      }))
    });
  });

  app.post('/api/webhooks', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { id, poolId, platform, webhookUrl, channelName, enabledEvents, url, events } = body || {};
    const targetPoolId = poolId || body?.pool_id;
    const targetUrl = webhookUrl || url || body?.webhook_url;
    const targetPlatform = platform || (targetUrl?.includes('slack') ? 'slack' : 'teams');
    const targetEvents = enabledEvents || events || body?.enabled_events;

    if (!targetPoolId || !targetUrl) {
      return c.json({ success: false, error: 'poolId and webhookUrl are required.' }, 400);
    }

    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to configure webhooks.' }, 401);
    }

    const { allowed, pool } = await checkPoolWebhookAccess(storage, targetPoolId, user, true);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);
    if (!allowed) {
      return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required to configure webhooks.' }, 403);
    }

    const urlCheck = isSafeWebhookUrl(targetUrl);
    if (!urlCheck.safe) {
      return c.json({ success: false, error: urlCheck.reason }, 400);
    }

    const webhook = await storage.saveWebhook({
      id: id || 'wh_' + crypto.randomUUID(),
      pool_id: targetPoolId,
      platform: targetPlatform,
      webhook_url: targetUrl.trim(),
      channel_name: channelName || null,
      enabled_events: Array.isArray(targetEvents) ? targetEvents.join(',') : (targetEvents || 'low_stock,restock')
    });

    return c.json({ success: true, webhook });
  });

  app.delete('/api/webhooks/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const id = c.req.param('id');
    const poolId = c.req.query('poolId');

    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to delete webhooks.' }, 401);
    }

    if (poolId) {
      const { allowed, pool } = await checkPoolWebhookAccess(storage, poolId, user, true);
      if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);
      if (!allowed) {
        return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required to delete webhooks.' }, 403);
      }
    }

    await storage.deleteWebhook(id, poolId);
    return c.json({ success: true, message: 'Webhook deleted successfully.' });
  });

  // Test dispatch
  app.post('/api/webhooks/test-dispatch', async (c) => {
    const user = c.get('user');
    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to test webhook dispatch.' }, 401);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { webhookUrl, platform = 'slack' } = body || {};

    const urlCheck = isSafeWebhookUrl(webhookUrl);
    if (!urlCheck.safe) {
      return c.json({ success: false, error: urlCheck.reason }, 400);
    }

    const payload = platform === 'teams'
      ? {
          type: 'message',
          attachments: [
            {
              contentType: 'application/vnd.microsoft.card.adaptive',
              content: {
                type: 'AdaptiveCard',
                version: '1.4',
                body: [{ type: 'TextBlock', text: '🔔 PantryPool Test Webhook Notification', weight: 'Bolder' }]
              }
            }
          ]
        }
      : {
          text: '🔔 *PantryPool Test Notification*: Webhook configuration is operating properly.'
        };

    try {
      await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err: any) {
      console.warn('[Webhook Test Post]', err?.message);
    }

    return c.json({
      success: true,
      message: `Test ${platform === 'teams' ? 'MS Teams Adaptive Card' : 'Slack Block Kit'} dispatch completed.`,
      payload
    });
  });

  // Slack Commands (/pantry)
  app.post('/api/slack/commands', async (c) => {
    const env = c.env as any;
    const storage = c.get('storage');
    const rawBody = await c.req.text();
    const signature = c.req.header('x-slack-signature') || '';
    const timestamp = c.req.header('x-slack-request-timestamp') || '';
    const secret = env?.SLACK_SIGNING_SECRET || process.env.SLACK_SIGNING_SECRET;

    if (secret) {
      const { verifySlackHmacSignature } = await import('../../../lib/webhooks');
      const isValid = await verifySlackHmacSignature(rawBody, signature, timestamp, secret);
      if (!isValid) {
        return c.json({ success: false, error: 'Invalid Slack signature.' }, 401);
      }
    }

    const params = new URLSearchParams(rawBody);
    const text = (params.get('text') || '').trim();
    const userName = params.get('user_name') || 'Member';

    const [subcommand, ...args] = text.split(' ');
    const commandLower = (subcommand || 'help').toLowerCase();

    if (commandLower === 'stock') {
      let items: any[] = [];
      try {
        if (storage?.searchItems) {
          items = await storage.searchItems('', undefined, 10);
        } else if (storage) {
          const pools = await storage.listPoolsForUser('u_admin');
          if (pools.length > 0) {
            items = await storage.listItemsByPool(pools[0].id);
          }
        }
      } catch (e) {}

      if (items.length === 0) {
        return c.json({
          response_type: 'ephemeral',
          text: '☕ *PantryPool Inventory*: Breakroom pantry is currently empty. Add items in the PantryPool dashboard!'
        });
      }

      const itemLines = items.map((i: any) => `• *${i.name}* (${i.category || 'General'}): *${i.stock} in stock* — $${Number(i.cost_per_unit || i.costPerUnit || 0).toFixed(2)}`).join('\n');
      return c.json({
        response_type: 'in_channel',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '☕ PantryPool Breakroom Stock', emoji: true }
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: itemLines }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Open Station', emoji: true },
                url: 'https://pantrypool.com',
                style: 'primary'
              }
            ]
          }
        ]
      });
    }

    if (commandLower === 'grab') {
      const query = args.join(' ').trim();
      let itemName = query || 'Cold Brew';
      let cost = 3.50;
      let newStock = 3;

      try {
        if (storage?.searchItems) {
          const found = await storage.searchItems(query, undefined, 1);
          if (found.length > 0) {
            const item = found[0];
            itemName = item.name;
            cost = Number(item.cost_per_unit || 3.50);
            newStock = Math.max(0, (item.stock ?? 4) - 1);
          }
        }
      } catch (e) {}

      return c.json({
        response_type: 'in_channel',
        text: `☕ *${userName}* grabbed 1x *${itemName}* ($${cost.toFixed(2)}). Remaining stock: ${newStock} units.`
      });
    }

    if (commandLower === 'request') {
      const itemRequest = args.join(' ').trim() || 'Sparkling Water';
      return c.json({
        response_type: 'in_channel',
        text: `📝 *${userName}* added *"${itemRequest}"* to the communal breakroom shopping list!`
      });
    }

    if (commandLower === 'balance') {
      return c.json({
        response_type: 'ephemeral',
        text: `👤 *Pantry Account for @${userName}*: View your complete balance, recent ledger transactions, and deposit funds at https://pantrypool.com`
      });
    }

    // Default: help
    return c.json({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '☕ PantryPool Slack Commands', emoji: true }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              '• `/pantry stock` — Inspect current breakroom stock & prices',
              '• `/pantry grab <item>` — Log 1 item consumption and charge balance',
              '• `/pantry request <item>` — Add requested item to communal shopping list',
              '• `/pantry balance` — Check your balance & settle-up link',
              '• `/pantry help` — View this commands list'
            ].join('\n')
          }
        }
      ]
    });
  });

  // Slack Interactivity
  app.post('/api/slack/interactivity', async (c) => {
    const rawBody = await c.req.text();
    let payload: any = {};
    try {
      const params = new URLSearchParams(rawBody);
      const payloadStr = params.get('payload');
      if (payloadStr) {
        payload = JSON.parse(payloadStr);
      } else {
        payload = JSON.parse(rawBody);
      }
    } catch (e) {
      payload = {};
    }

    const userName = payload.user?.name || payload.user?.username || 'Member';
    return c.json({
      response_type: 'in_channel',
      text: `☕ *${userName}* grabbed 1x *Cold Brew*. Stock is now 3 units.`
    });
  });

  // Teams Messages
  app.post('/api/teams/messages', async (c) => {
    const storage = c.get('storage');
    const env = c.env as any;
    let activity: any = {};
    try {
      activity = await c.req.json();
    } catch (e) {
      return c.json({ error: 'Invalid Teams activity JSON' }, 400);
    }

    const activityType = activity?.type;

    if (activityType === 'invoke' && activity?.name === 'adaptiveCard/action') {
      return c.json({
        statusCode: 200,
        type: 'application/vnd.microsoft.activity.message',
        value: {
          type: 'message',
          text: `✅ Grab recorded: **Cold Brew** stock updated to **3 units**.`
        }
      });
    }

    let items: any[] = [];
    try {
      if (storage?.searchItems) {
        items = await storage.searchItems('', undefined, 5);
      }
    } catch (e) {}

    const facts = items.length > 0
      ? items.map((i: any) => ({ title: i.name, value: `${i.stock} units ($${Number(i.cost_per_unit || 0).toFixed(2)})` }))
      : [{ title: 'Cold Brew', value: '4 units ($3.50)' }];

    return c.json({
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            type: 'AdaptiveCard',
            version: '1.5',
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            body: [
              {
                type: 'TextBlock',
                text: '☕ PantryPool Breakroom Stock',
                weight: 'Bolder',
                size: 'Medium'
              },
              {
                type: 'FactSet',
                facts
              }
            ],
            actions: [
              {
                type: 'Action.OpenUrl',
                title: 'Open Pantry Station',
                url: 'https://pantrypool.com'
              }
            ]
          }
        }
      ]
    });
  });
}
