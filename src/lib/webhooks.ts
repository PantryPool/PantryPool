export function formatSlackBlockKitPayload(item: any, poolName: string) {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `⚠️ Low Stock Warning: ${item.name}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${item.name}* in *${poolName}* has fallen below the minimum stock threshold.`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Current Stock:*\n${item.stock} units` },
          { type: 'mrkdwn', text: `*Minimum Threshold:*\n${item.minStock || item.min_stock || 5} units` },
          { type: 'mrkdwn', text: `*Category:*\n${item.category || 'General'}` },
          { type: 'mrkdwn', text: `*Cost per Unit:*\n$${Number(item.costPerUnit || item.cost_per_unit || 0).toFixed(2)}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'quick_restock',
            text: {
              type: 'plain_text',
              text: '🛒 Restock Item',
              emoji: true,
            },
            value: JSON.stringify({ itemId: item.id, poolId: item.poolId || item.pool_id }),
            url: `https://pantrypool.com/?item=${item.id}&pool=${item.poolId || item.pool_id || 'pool1'}`,
            style: 'primary',
          },
          {
            type: 'button',
            action_id: 'quick_consume',
            text: {
              type: 'plain_text',
              text: '☕ 1-Tap Grab',
              emoji: true,
            },
            value: JSON.stringify({ itemId: item.id, poolId: item.poolId || item.pool_id }),
            url: `https://pantrypool.com/?item=${item.id}&pool=${item.poolId || item.pool_id || 'pool1'}`,
          },
        ],
      },
    ],
  };
}

export function formatSlackSettlementDigestPayload(poolName: string, negativeMembers: Array<{ name: string; balance: number }>) {
  const memberLines = negativeMembers
    .map((m) => `• *${m.name}*: -$${Math.abs(m.balance).toFixed(2)}`)
    .join('\n');

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 Friday Breakroom Balance Digest — ${poolName}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Here is the current weekly expense balance report for *${poolName}*. Please take a moment to settle up your tab before the weekend restock!`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: memberLines || '_All pool members are settled up! 🎉_',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '⚡ 1-Click Settle Up',
              emoji: true,
            },
            url: `https://pantrypool.com/?view=settle`,
            style: 'primary',
          },
        ],
      },
    ],
  };
}

export function formatTeamsAdaptiveCardPayload(item: any, poolName: string) {
  return {
    type: 'AdaptiveCard',
    version: '1.5',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body: [
      {
        type: 'Container',
        style: 'warning',
        items: [
          {
            type: 'ColumnSet',
            columns: [
              {
                type: 'Column',
                width: 'auto',
                items: [
                  {
                    type: 'Image',
                    url: item.imageUrl || 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=150',
                    size: 'Small',
                    style: 'Person',
                  },
                ],
              },
              {
                type: 'Column',
                width: 'stretch',
                items: [
                  {
                    type: 'TextBlock',
                    text: `⚠️ Low-Stock Alert: ${item.name}`,
                    weight: 'Bolder',
                    size: 'Medium',
                    color: 'Attention',
                  },
                  {
                    type: 'TextBlock',
                    text: `Breakroom Pool: ${poolName}`,
                    isSubtle: true,
                    spacing: 'None',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Remaining Stock:', value: `${item.stock} units` },
          { title: 'Min Threshold:', value: `${item.minStock || item.min_stock || 5} units` },
          { title: 'Category:', value: item.category || 'General' },
          { title: 'Cost per Unit:', value: `$${Number(item.costPerUnit || item.cost_per_unit || 0).toFixed(2)}` },
        ],
      },
    ],
    actions: [
      {
        type: 'Action.Execute',
        title: '☕ 1-Click Grab',
        verb: 'quick_grab',
        data: { itemId: item.id, poolId: item.poolId || item.pool_id || 'pool1' },
      },
      {
        type: 'Action.Execute',
        title: '🛒 Mark Restocked',
        verb: 'quick_restock',
        data: { itemId: item.id, poolId: item.poolId || item.pool_id || 'pool1' },
      },
      {
        type: 'Action.OpenUrl',
        title: 'Open Pantry Station',
        url: `https://pantrypool.com/?item=${item.id}&pool=${item.poolId || item.pool_id || 'pool1'}`,
      },
    ],
  };
}

export function formatTeamsMessageCardPayload(item: any, poolName: string) {
  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'FF9900',
    summary: `Low-Stock Warning: ${item.name}`,
    sections: [
      {
        activityTitle: `⚠️ Low-Stock Alert: ${item.name}`,
        activitySubtitle: `Breakroom Pool: ${poolName}`,
        activityImage: item.imageUrl || 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=150',
        facts: [
          { name: 'Current Stock:', value: `${item.stock} units` },
          { name: 'Min Threshold:', value: `${item.minStock || item.min_stock || 5} units` },
          { name: 'Category:', value: item.category || 'General' },
        ],
        markdown: true,
      },
    ],
    potentialAction: [
      {
        '@type': 'OpenUri',
        name: '🛒 Open PantryPool Station',
        targets: [{ os: 'default', uri: `https://pantrypool.com/?item=${item.id}&pool=${item.poolId || item.pool_id || 'pool1'}` }],
      },
    ],
  };
}

export function formatSlackRestockPayload(itemName: string, quantity: number, restockerName: string, poolName: string) {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🎉 Breakroom Restocked: ${itemName}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${restockerName}* just restocked *+${quantity}* units of *${itemName}* in *${poolName}*. Enjoy! ☕`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '👀 View Breakroom Inventory',
              emoji: true,
            },
            url: 'https://pantrypool.com',
            style: 'primary',
          },
        ],
      },
    ],
  };
}

export function formatTeamsRestockPayload(itemName: string, quantity: number, restockerName: string, poolName: string) {
  return {
    type: 'AdaptiveCard',
    version: '1.5',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    body: [
      {
        type: 'Container',
        style: 'good',
        items: [
          {
            type: 'TextBlock',
            text: `🎉 Fresh Restock Alert: ${itemName}`,
            weight: 'Bolder',
            size: 'Medium',
            color: 'Good',
          },
          {
            type: 'TextBlock',
            text: `**${restockerName}** added **+${quantity} units** to **${poolName}**. Grab one whenever you're ready!`,
            wrap: true,
          },
        ],
      },
    ],
    actions: [
      {
        type: 'Action.OpenUrl',
        title: 'Open Pantry Station',
        url: 'https://pantrypool.com',
      },
    ],
  };
}

export async function verifySlackHmacSignature(rawBody: string, signature: string, timestamp: string, signingSecret: string): Promise<boolean> {
  try {
    if (!signature || !timestamp || !signingSecret) return false;
    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(timestampNum) || Math.abs(now - timestampNum) > 300) {
      return false;
    }
    const sigBasestring = `v0:${timestamp}:${rawBody}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(sigBasestring));
    const expectedHex = 'v0=' + Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return signature === expectedHex;
  } catch (e) {
    return false;
  }
}

export async function verifyStripeHmacSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    if (!sigHeader || !secret) return false;
    const parts = sigHeader.split(',');
    let timestamp = '';
    const signatures: string[] = [];
    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      if (key === 't') timestamp = value;
      if (key === 'v1') signatures.push(value);
    }
    if (!timestamp || signatures.length === 0) return false;
    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(timestampNum) || Math.abs(now - timestampNum) > 300) {
      return false;
    }
    const signedPayload = `${timestamp}.${rawBody}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
    const expectedSigHex = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return signatures.some((sig) => sig === expectedSigHex);
  } catch (e) {
    return false;
  }
}


