import { describe, it, expect } from 'vitest';
import {
  formatSlackBlockKitPayload,
  formatSlackSettlementDigestPayload,
  formatTeamsAdaptiveCardPayload,
} from '../src/lib/webhooks';

describe('💬 Slack & Microsoft Teams Webhook & Bot Card Generation (Phases 31 & 32)', () => {
  const sampleItem = {
    id: 'item-101',
    name: 'Nitro Cold Brew Can',
    category: 'Coffee & Tea',
    stock: 1,
    minStock: 4,
    costPerUnit: 3.5,
    poolId: 'pool-main',
  };

  it('formatSlackBlockKitPayload should render valid Block Kit structure with interactive restock & grab buttons', () => {
    const payload = formatSlackBlockKitPayload(sampleItem, '3rd Floor Breakroom');
    expect(payload.blocks).toBeDefined();
    expect(payload.blocks.length).toBeGreaterThanOrEqual(3);

    const header = payload.blocks[0];
    expect(header.type).toBe('header');
    expect((header as any).text.text).toContain('Nitro Cold Brew Can');

    const actionsBlock = payload.blocks.find((b: any) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    expect((actionsBlock as any).elements.length).toBe(2);
  });

  it('formatSlackSettlementDigestPayload should render Friday balance digest card with negative member list', () => {
    const negativeMembers = [
      { name: 'Alex Johnson', balance: -12.5 },
      { name: 'David Smith', balance: -4.0 },
    ];

    const payload = formatSlackSettlementDigestPayload('Engineering Pantry', negativeMembers);
    expect(payload.blocks).toBeDefined();
    const sectionWithMembers = payload.blocks.find((b: any) =>
      (b as any).text?.text?.includes('Alex Johnson')
    );
    expect(sectionWithMembers).toBeDefined();
    expect((sectionWithMembers as any).text.text).toContain('-$12.50');
  });

  it('formatTeamsAdaptiveCardPayload should render Adaptive Card v1.5 with Action.Execute verbs', () => {
    const payload = formatTeamsAdaptiveCardPayload(sampleItem, 'Executive Lounge');
    expect(payload.type).toBe('AdaptiveCard');
    expect(payload.version).toBe('1.5');
    expect(payload.actions).toBeDefined();

    const quickGrab = payload.actions.find((a: any) => a.verb === 'quick_grab');
    expect(quickGrab).toBeDefined();
    expect(quickGrab?.type).toBe('Action.Execute');
    expect(quickGrab?.data?.itemId).toBe('item-101');
  });
});
