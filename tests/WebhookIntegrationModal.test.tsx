import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhookIntegrationModal } from '../src/components/WebhookIntegrationModal';
import { WebhookConfig } from '../src/types';

describe('WebhookIntegrationModal & Workspace Integrations Hub', () => {
  const mockSaveWebhook = vi.fn();
  const mockDeleteWebhook = vi.fn();
  const mockTestDispatch = vi.fn().mockResolvedValue({
    message: 'Test alert successfully sent to #breakroom!',
    payload: { text: 'Test payload' }
  });
  const mockClose = vi.fn();

  const mockWebhooks: WebhookConfig[] = [
    {
      id: 'wh-1',
      poolId: 'pool-1',
      platform: 'slack',
      webhookUrl: 'https://hooks.slack.com/services/T00/B00/ABC',
      channelName: '#general',
      enabledEvents: 'low_stock,restock'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders modal with title, active webhooks, and all three navigation tabs', () => {
    render(
      <WebhookIntegrationModal
        isOpen={true}
        onClose={mockClose}
        poolId="pool-1"
        poolName="HQ Snack Station"
        webhooks={mockWebhooks}
        onSaveWebhook={mockSaveWebhook}
        onDeleteWebhook={mockDeleteWebhook}
        onTestDispatch={mockTestDispatch}
      />
    );

    expect(screen.getByText(/Slack & Microsoft Teams Workspace Integrations/i)).toBeInTheDocument();
    expect(screen.getByText(/Incoming Webhooks \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Slack App \(Manifest & Bot\)/i)).toBeInTheDocument();
    expect(screen.getByText(/MS Teams App \(Adaptive Cards\)/i)).toBeInTheDocument();
    expect(screen.getByText(/#general/i)).toBeInTheDocument();
  });

  it('switches to Slack App tab, shows slash commands directory and copies manifest JSON', () => {
    render(
      <WebhookIntegrationModal
        isOpen={true}
        onClose={mockClose}
        poolId="pool-1"
        poolName="HQ Snack Station"
        webhooks={mockWebhooks}
        onSaveWebhook={mockSaveWebhook}
        onDeleteWebhook={mockDeleteWebhook}
        onTestDispatch={mockTestDispatch}
      />
    );

    // Click Slack App tab
    fireEvent.click(screen.getByText(/Slack App \(Manifest & Bot\)/i));

    expect(screen.getByText(/Production Slack App \(Phase 31 Bi-Directional\)/i)).toBeInTheDocument();
    expect(screen.getByText(/\/pantry stock/i)).toBeInTheDocument();
    expect(screen.getByText(/\/pantry grab <item>/i)).toBeInTheDocument();
    expect(screen.getByText(/\/pantry balance/i)).toBeInTheDocument();

    // Click Copy Manifest button
    const copyButtons = screen.getAllByText(/Copy Manifest JSON/i);
    fireEvent.click(copyButtons[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('switches to Microsoft Teams tab and shows deployment guide & Adaptive Cards info', () => {
    render(
      <WebhookIntegrationModal
        isOpen={true}
        onClose={mockClose}
        poolId="pool-1"
        poolName="HQ Snack Station"
        webhooks={mockWebhooks}
        onSaveWebhook={mockSaveWebhook}
        onDeleteWebhook={mockDeleteWebhook}
        onTestDispatch={mockTestDispatch}
      />
    );

    // Click MS Teams App tab
    fireEvent.click(screen.getByText(/MS Teams App \(Adaptive Cards\)/i));

    expect(screen.getByText(/Microsoft Teams App \(Adaptive Cards v1.5 & Bot\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Universal Actions \(`Action.Execute`\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Compose Box & Channel Tabs/i)).toBeInTheDocument();

    // Click Copy Teams Manifest
    const copyButtons = screen.getAllByText(/Copy Manifest JSON/i);
    fireEvent.click(copyButtons[0]);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('submits a new webhook with granular event subscriptions', () => {
    render(
      <WebhookIntegrationModal
        isOpen={true}
        onClose={mockClose}
        poolId="pool-1"
        poolName="HQ Snack Station"
        webhooks={mockWebhooks}
        onSaveWebhook={mockSaveWebhook}
        onDeleteWebhook={mockDeleteWebhook}
        onTestDispatch={mockTestDispatch}
      />
    );

    // Fill in URL
    const urlInput = screen.getByPlaceholderText(/https:\/\/hooks\.slack\.com/i);
    fireEvent.change(urlInput, { target: { value: 'https://hooks.slack.com/services/T99/B99/XYZ' } });

    // Toggle event
    fireEvent.click(screen.getByText(/Friday Balance Digest/i));

    // Submit
    fireEvent.click(screen.getByText(/Save Webhook Integration/i));

    expect(mockSaveWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        poolId: 'pool-1',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T99/B99/XYZ',
        enabledEvents: expect.stringContaining('digest')
      })
    );
  });

  it('triggers test dispatch payload and displays formatted response', async () => {
    render(
      <WebhookIntegrationModal
        isOpen={true}
        onClose={mockClose}
        poolId="pool-1"
        poolName="HQ Snack Station"
        webhooks={mockWebhooks}
        onSaveWebhook={mockSaveWebhook}
        onDeleteWebhook={mockDeleteWebhook}
        onTestDispatch={mockTestDispatch}
      />
    );

    const urlInput = screen.getByPlaceholderText(/https:\/\/hooks\.slack\.com/i);
    fireEvent.change(urlInput, { target: { value: 'https://hooks.slack.com/services/T99/B99/XYZ' } });

    const channelInput = screen.getByPlaceholderText(/#breakroom-pantry/i);
    fireEvent.change(channelInput, { target: { value: '#breakroom-pantry' } });

    fireEvent.click(screen.getByText(/Test Dispatch Payload/i));

    expect(mockTestDispatch).toHaveBeenCalledWith(
      'slack',
      'https://hooks.slack.com/services/T99/B99/XYZ',
      '#breakroom-pantry'
    );

    const confirmation = await screen.findByText(/Test alert successfully sent to #breakroom!/i);
    expect(confirmation).toBeInTheDocument();
  });
});
