import { describe, it, expect } from 'vitest';
import {
  formatSlackBlockKitPayload,
  formatTeamsAdaptiveCardPayload,
  formatTeamsMessageCardPayload,
} from '../src/lib/webhooks';
import { WebhookConfig } from '../src/types';

describe('Phase 14: Slack & MS Teams Webhook & Bot Integration', () => {
  const sampleItem = {
    id: 'i-test-101',
    name: 'Nitro Cold Brew Cans 4pk',
    stock: 1,
    minStock: 4,
    category: 'Coffee & Tea',
    costPerUnit: 3.50,
    imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=150',
    poolId: 'pool-eng-3'
  };

  const poolName = 'Engineering Snack Pantry';

  it('formats Slack Block Kit payload with correct structure and interactive buttons', () => {
    const payload = formatSlackBlockKitPayload(sampleItem, poolName);

    expect(payload).toHaveProperty('blocks');
    expect(Array.isArray(payload.blocks)).toBe(true);

    const headerBlock = payload.blocks.find((b: any) => b.type === 'header');
    expect(headerBlock).toBeDefined();
    expect(headerBlock?.text?.text).toContain('Low Stock Warning: Nitro Cold Brew Cans 4pk');

    const actionsBlock = payload.blocks.find((b: any) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock?.elements?.[0]?.url).toContain('https://pantrypool.com/?item=i-test-101&pool=pool-eng-3');
  });

  it('formats MS Teams Adaptive Card / MessageCard payload correctly', () => {
    const payload = formatTeamsMessageCardPayload(sampleItem, poolName);

    expect(payload['@type']).toBe('MessageCard');
    expect(payload.themeColor).toBe('FF9900');
    expect(payload.summary).toContain('Nitro Cold Brew Cans 4pk');

    const section = payload.sections[0];
    expect(section.activityTitle).toContain('Low-Stock Alert: Nitro Cold Brew Cans 4pk');
    expect(section.activitySubtitle).toContain('Engineering Snack Pantry');

    const facts = section.facts;
    expect(facts.find((f: any) => f.name === 'Current Stock:')?.value).toBe('1 units');
    expect(facts.find((f: any) => f.name === 'Min Threshold:')?.value).toBe('4 units');

    const action = payload.potentialAction[0];
    expect(action.targets[0].uri).toContain('https://pantrypool.com/?item=i-test-101&pool=pool-eng-3');
  });

  it('manages webhook configuration objects properly', () => {
    const webhooks: WebhookConfig[] = [
      {
        id: 'wh-slack-1',
        poolId: 'pool1',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX',
        channelName: '#breakroom',
        enabledEvents: 'low_stock,restock'
      }
    ];

    expect(webhooks.length).toBe(1);
    expect(webhooks[0].platform).toBe('slack');

    // Add Teams webhook
    const newTeamsWh: WebhookConfig = {
      id: 'wh-teams-2',
      poolId: 'pool1',
      platform: 'teams',
      webhookUrl: 'https://acme.webhook.office.com/webhookb2/YYY',
      channelName: 'Breakroom Station',
      enabledEvents: 'low_stock'
    };

    const updatedList = [newTeamsWh, ...webhooks];
    expect(updatedList.length).toBe(2);
    expect(updatedList[0].platform).toBe('teams');

    // Remove Slack webhook
    const filtered = updatedList.filter(w => w.id !== 'wh-slack-1');
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('wh-teams-2');
  });
});
