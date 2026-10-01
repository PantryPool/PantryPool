import React, { useState } from 'react';
import { WebhookConfig } from '../types';
import { 
  MessageSquare, 
  Send, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  X, 
  Bot, 
  Sparkles,
  Layers,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  FileCode,
  ShieldCheck,
  CheckSquare,
  Square,
  Zap,
  HelpCircle
} from 'lucide-react';

interface WebhookIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolId: string;
  poolName: string;
  webhooks: WebhookConfig[];
  onSaveWebhook: (webhook: Partial<WebhookConfig>) => void;
  onDeleteWebhook: (id: string) => void;
  onTestDispatch: (platform: 'slack' | 'teams', webhookUrl: string, channelName: string) => Promise<any>;
}

type TabType = 'webhooks' | 'slack_app' | 'teams_app';

const SLACK_MANIFEST_JSON = {
  display_information: {
    name: "PantryPool",
    description: "Communal breakroom inventory tracking, restock alerts, and expense ledger bot.",
    background_color: "#2D2D2D",
    long_description: "PantryPool integrates your office breakroom with Slack. Get automated low-stock warnings, celebrate restocks, log coffee/snack consumption with 1 click, and check your pool balance using /pantry commands."
  },
  features: {
    bot_user: {
      display_name: "PantryPool Bot",
      always_online: true
    },
    slash_commands: [
      {
        command: "/pantry",
        url: "https://pantrypool.com/api/slack/commands",
        description: "Inspect breakroom stock, log an item grab, check balance, or request items",
        usage_hint: "[stock | grab <item> | balance | request <item> | help]",
        should_escape: false
      }
    ],
    unfurl_domains: ["pantrypool.com"]
  },
  oauth_config: {
    redirect_urls: ["https://pantrypool.com/api/slack/oauth/callback"],
    scopes: {
      bot: [
        "incoming-webhook",
        "chat:write",
        "chat:write.public",
        "commands",
        "channels:read",
        "users:read",
        "users:read.email"
      ]
    }
  },
  settings: {
    interactivity: {
      is_enabled: true,
      request_url: "https://pantrypool.com/api/slack/interactivity"
    },
    org_deploy_enabled: false,
    socket_mode_enabled: false,
    token_rotation_enabled: false
  }
};

const TEAMS_MANIFEST_JSON = {
  "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
  manifestVersion: "1.17",
  version: "1.0.0",
  id: "pantrypool-teams-app-id",
  packageName: "com.pantrypool.teams",
  developer: {
    name: "PantryPool",
    websiteUrl: "https://pantrypool.com",
    privacyUrl: "https://pantrypool.com/privacy",
    termsOfUseUrl: "https://pantrypool.com/terms"
  },
  icons: {
    color: "color.png",
    outline: "outline.png"
  },
  name: {
    short: "PantryPool",
    full: "PantryPool Breakroom & Pantry Management"
  },
  description: {
    short: "Communal breakroom inventory, restock alerts, and expense ledger.",
    full: "PantryPool keeps your team's pantry stocked and transparent. Receive real-time low-stock alerts via Adaptive Cards, log coffee and snacks with 1 click, search inventory in compose box, and check your balance using @PantryPool commands."
  },
  accentColor: "#E8694A",
  bots: [
    {
      botId: "${MICROSOFT_APP_ID}",
      scopes: ["personal", "team", "groupchat"],
      commandLists: [
        {
          scopes: ["personal", "team", "groupchat"],
          commands: [
            { title: "stock", description: "Display available inventory in this breakroom" },
            { title: "grab", description: "Log consumption of a snack or beverage" },
            { title: "balance", description: "Check your current account balance and recent transactions" },
            { title: "request", description: "Add an item request to the communal shopping list" },
            { title: "help", description: "Display command help and breakroom link" }
          ]
        }
      ],
      supportsFiles: false,
      isNotificationOnly: false
    }
  ],
  composeExtensions: [
    {
      botId: "${MICROSOFT_APP_ID}",
      commands: [
        {
          id: "searchPantry",
          type: "query",
          title: "Search Breakroom Items",
          description: "Find items in your pantry pool and share live stock cards",
          initialRun: true,
          parameters: [
            {
              name: "searchQuery",
              title: "Item Name / Category",
              description: "Enter item name (e.g. Cold Brew, Oat Milk)",
              inputType: "text"
            }
          ]
        }
      ]
    }
  ],
  staticTabs: [
    {
      entityId: "pantryHome",
      name: "My Breakroom",
      contentUrl: "https://pantrypool.com/?teams=1",
      websiteUrl: "https://pantrypool.com",
      scopes: ["personal"]
    }
  ],
  configurableTabs: [
    {
      configurationUrl: "https://pantrypool.com/teams/config",
      canUpdateConfiguration: true,
      scopes: ["team", "groupchat"]
    }
  ],
  permissions: ["identity", "messageTeamMembers"],
  validDomains: ["pantrypool.com", "*.pantrypool.com"]
};

const AVAILABLE_EVENTS = [
  { id: 'low_stock', label: 'Low-Stock Warnings', desc: 'Alert when items fall below reorder thresholds' },
  { id: 'restock', label: 'Restock Confirmations', desc: 'Broadcast when items are restocked or receipts scanned' },
  { id: 'digest', label: 'Friday Balance Digest', desc: 'Weekly summary tab of unsettled balances before the weekend' },
  { id: 'polls', label: 'Restock & Snack Polls', desc: 'Notify members when new item voting polls are created' },
  { id: 'shopping', label: 'Shopping List Requests', desc: 'Broadcast when team members request new items' }
];

export const WebhookIntegrationModal: React.FC<WebhookIntegrationModalProps> = ({
  isOpen,
  onClose,
  poolId,
  poolName,
  webhooks,
  onSaveWebhook,
  onDeleteWebhook,
  onTestDispatch,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('webhooks');
  const [platform, setPlatform] = useState<'slack' | 'teams'>('slack');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['low_stock', 'restock']);

  const [testResult, setTestResult] = useState<{
    message: string;
    payload?: any;
  } | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [copiedManifest, setCopiedManifest] = useState<'slack' | 'teams' | null>(null);

  if (!isOpen) return null;

  const handleEdit = (wh: WebhookConfig) => {
    setEditingId(wh.id);
    setPlatform(wh.platform);
    setWebhookUrl(wh.webhookUrl);
    setChannelName(wh.channelName || '');
    if (wh.enabledEvents) {
      setSelectedEvents(wh.enabledEvents.split(',').map(e => e.trim()).filter(Boolean));
    } else {
      setSelectedEvents(['low_stock', 'restock']);
    }
  };

  const handleResetForm = () => {
    setEditingId(null);
    setWebhookUrl('');
    setChannelName('');
    setSelectedEvents(['low_stock', 'restock']);
  };

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev => 
      prev.includes(eventId)
        ? prev.filter(e => e !== eventId)
        : [...prev, eventId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim()) return;

    onSaveWebhook({
      id: editingId || undefined,
      poolId,
      platform,
      webhookUrl: webhookUrl.trim(),
      channelName: channelName.trim() || '',
      enabledEvents: selectedEvents.join(',') || 'low_stock,restock'
    });

    setSaveMessage(`${platform === 'slack' ? 'Slack' : 'MS Teams'} webhook saved successfully.`);
    setTimeout(() => setSaveMessage(null), 3000);
    handleResetForm();
  };

  const handleRunTest = async () => {
    if (!webhookUrl.trim()) {
      setTestResult({
        message: 'Please enter a valid incoming webhook URL before testing.'
      });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestDispatch(
        platform,
        webhookUrl.trim(),
        channelName.trim() || (platform === 'slack' ? '#general' : 'General')
      );
      setTestResult({
        message: res.message || 'Test dispatch payload sent successfully!',
        payload: res.payload
      });
    } catch (e: any) {
      setTestResult({ message: `Error: ${e.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyManifest = (type: 'slack' | 'teams') => {
    const jsonStr = JSON.stringify(type === 'slack' ? SLACK_MANIFEST_JSON : TEAMS_MANIFEST_JSON, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedManifest(type);
    setTimeout(() => setCopiedManifest(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2D2D]/40 animate-fade-in">
      <div className="bg-white border border-[#E0DAD1] rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-[#2D2D2D]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#EDE8E0] flex items-center justify-between bg-[#FAFAF8]">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#FDF0EC] text-[#E8694A] rounded-lg">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2D2D2D] flex items-center gap-2">
                Slack & Microsoft Teams Workspace Integrations
                <span className="px-2 py-0.5 text-xs font-semibold bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/30 rounded-full">
                  Pro / Enterprise
                </span>
              </h2>
              <p className="text-xs text-[#6B6B6B]">Automated low-stock alerts, 2-way bot commands & manifests for &quot;{poolName}&quot;</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#EDE8E0] bg-[#FAFAF8] px-6">
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`py-3 px-4 text-xs font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'webhooks'
                ? 'border-[#E8694A] text-[#E8694A]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Layers className="w-4 h-4" />
            Incoming Webhooks ({webhooks.length})
          </button>

          <button
            onClick={() => setActiveTab('slack_app')}
            className={`py-3 px-4 text-xs font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'slack_app'
                ? 'border-[#E8694A] text-[#E8694A]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-[#E8694A]" />
            Slack App (Manifest & Bot)
          </button>

          <button
            onClick={() => setActiveTab('teams_app')}
            className={`py-3 px-4 text-xs font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'teams_app'
                ? 'border-[#E8694A] text-[#E8694A]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Bot className="w-4 h-4 text-[#8FB8DE]" />
            MS Teams App (Adaptive Cards)
          </button>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {saveMessage && (
            <div className="p-3 bg-[#EDF5EF] border border-[#5A9A6B]/30 rounded-md text-[#5A9A6B] text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{saveMessage}</span>
            </div>
          )}

          {/* TAB 1: INCOMING WEBHOOKS */}
          {activeTab === 'webhooks' && (
            <>
              {/* Configured Webhooks Directory */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#E8694A]" />
                  Active Webhook Channels ({webhooks.length})
                </h3>

                {webhooks.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed border-[#E0DAD1] text-center text-[#6B6B6B] text-xs">
                    No webhooks configured yet for this pantry pool. Fill out the setup form below to connect Slack or Microsoft Teams.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {webhooks.map((wh) => (
                      <div
                        key={wh.id}
                        className="p-3.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg flex items-start justify-between gap-3 shadow-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${
                              wh.platform === 'slack'
                                ? 'bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/30'
                                : 'bg-[#EDF4FA] text-[#8FB8DE] border border-[#8FB8DE]/30'
                            }`}>
                              {wh.platform === 'slack' ? 'Slack Block Kit' : 'MS Teams Card'}
                            </span>
                            <span className="text-xs font-semibold text-[#2D2D2D]">{wh.channelName || 'Pantry Channel'}</span>
                          </div>
                          <p className="text-[11px] text-[#6B6B6B] truncate max-w-[220px]" title={wh.webhookUrl}>
                            {wh.webhookUrl}
                          </p>
                          {wh.enabledEvents && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {wh.enabledEvents.split(',').map((ev) => (
                                <span key={ev} className="px-1.5 py-0.2 text-[9px] bg-white border border-[#E0DAD1] rounded text-[#6B6B6B]">
                                  {ev.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEdit(wh)}
                            className="px-2 py-1 text-xs text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white rounded-md transition-colors"
                            title="Edit Webhook"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onDeleteWebhook(wh.id)}
                            className="p-1.5 text-xs text-[#9A9A9A] hover:text-[#C9553D] hover:bg-white rounded-md transition-colors"
                            title="Delete Webhook"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Webhook Configuration Form */}
              <form onSubmit={handleSubmit} className="p-4 bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[#E8694A]" />
                    {editingId ? 'Edit Webhook Integration' : 'Connect New Webhook Integration'}
                  </h3>
                  {editingId && (
                    <button
                      type="button"
                      onClick={handleResetForm}
                      className="text-xs text-[#6B6B6B] hover:text-[#2D2D2D]"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Platform Selector */}
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Target Platform</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPlatform('slack')}
                        className={`py-2 px-3 rounded-md text-xs font-medium border transition flex items-center justify-center gap-2 ${
                          platform === 'slack'
                            ? 'bg-[#E8694A] text-white border-[#E8694A] shadow-xs'
                            : 'bg-white text-[#6B6B6B] border-[#E0DAD1] hover:text-[#2D2D2D]'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Slack
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlatform('teams')}
                        className={`py-2 px-3 rounded-md text-xs font-medium border transition flex items-center justify-center gap-2 ${
                          platform === 'teams'
                            ? 'bg-[#E8694A] text-white border-[#E8694A] shadow-xs'
                            : 'bg-white text-[#6B6B6B] border-[#E0DAD1] hover:text-[#2D2D2D]'
                        }`}
                      >
                        <Bot className="w-3.5 h-3.5" />
                        MS Teams
                      </button>
                    </div>
                  </div>

                  {/* Channel Name */}
                  <div>
                    <label className="block text-xs font-medium text-[#2D2D2D] mb-1">Channel / Station Label</label>
                    <input
                      type="text"
                      value={channelName}
                      onChange={(e) => setChannelName(e.target.value)}
                      placeholder={platform === 'slack' ? '#breakroom-pantry' : 'HQ Breakroom Station'}
                      className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                    />
                  </div>
                </div>

                {/* Webhook URL Input */}
                <div>
                  <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                    Incoming Webhook URL <span className="text-[#C9553D]">*</span>
                  </label>
                  <input
                    type="url"
                    required
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder={
                      platform === 'slack'
                        ? 'https://hooks.slack.com/services/T00/B00/XXXXX'
                        : 'https://acme.webhook.office.com/webhookb2/...'
                    }
                    className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A] font-mono-financial"
                  />
                </div>

                {/* Event Subscription Checkboxes */}
                <div>
                  <label className="block text-xs font-medium text-[#2D2D2D] mb-2">
                    Event Triggers & Notification Channels
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-3 border border-[#E0DAD1] rounded-md">
                    {AVAILABLE_EVENTS.map(ev => {
                      const isSelected = selectedEvents.includes(ev.id);
                      return (
                        <div
                          key={ev.id}
                          onClick={() => toggleEvent(ev.id)}
                          className="flex items-start gap-2 p-1.5 rounded hover:bg-[#FAFAF8] cursor-pointer transition"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleEvent(ev.id);
                            }}
                            aria-label={`Toggle ${ev.label}`}
                            className="mt-0.5 text-[#E8694A]"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 fill-[#FDF0EC]" />
                            ) : (
                              <Square className="w-4 h-4 text-[#9A9A9A]" />
                            )}
                          </button>
                          <div>
                            <div className="text-xs font-medium text-[#2D2D2D]">{ev.label}</div>
                            <div className="text-[10px] text-[#6B6B6B]">{ev.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions & Test Button */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleRunTest}
                    disabled={isTesting}
                    className="px-3.5 py-1.5 text-xs font-medium bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] rounded-full border border-[#E0DAD1] transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <Send className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    Test Dispatch Payload
                  </button>

                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-medium bg-[#E8694A] hover:bg-[#D45A3D] text-white rounded-full transition-colors shadow-xs"
                  >
                    {editingId ? 'Update Webhook' : 'Save Webhook Integration'}
                  </button>
                </div>
              </form>

              {/* Test Dispatch Result Payload Modal/Preview */}
              {testResult && (
                <div className="p-4 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#5A9A6B] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {testResult.message}
                    </span>
                    <button onClick={() => setTestResult(null)} className="text-[11px] text-[#6B6B6B] hover:text-[#2D2D2D]">
                      Dismiss
                    </button>
                  </div>

                  {testResult.payload && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[#6B6B6B]">Generated JSON Payload Format:</div>
                      <pre className="p-3 bg-white border border-[#E0DAD1] rounded-md text-[10px] text-[#2D2D2D] overflow-x-auto max-h-48 font-mono-financial">
                        {JSON.stringify(testResult.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* TAB 2: SLACK APP (MANIFEST & BOT) */}
          {activeTab === 'slack_app' && (
            <div className="space-y-6">
              <div className="p-4 bg-[#FDF0EC] border border-[#E8694A]/30 rounded-lg flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#E8694A]" />
                    Production Slack App (Phase 31 Bi-Directional)
                  </h3>
                  <p className="text-xs text-[#6B6B6B]">
                    Enable interactive Block Kit buttons, `/pantry` slash commands, and automated breakroom inventory telemetry with your workspace.
                  </p>
                </div>
                <button
                  onClick={() => handleCopyManifest('slack')}
                  className="px-3 py-1.5 text-xs font-medium bg-[#E8694A] text-white hover:bg-[#D45A3D] rounded-full transition flex items-center gap-1.5 shadow-xs flex-shrink-0"
                >
                  {copiedManifest === 'slack' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied Manifest!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Manifest JSON
                    </>
                  )}
                </button>
              </div>

              {/* 60-Second Setup Guide */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-[#2D2D2D] uppercase tracking-wider">
                  60-Second Slack App Setup Guide
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg space-y-1">
                    <div className="w-5 h-5 rounded-full bg-[#E8694A] text-white text-[11px] font-bold flex items-center justify-center">1</div>
                    <div className="text-xs font-semibold text-[#2D2D2D]">Create App from Manifest</div>
                    <p className="text-[11px] text-[#6B6B6B]">
                      Open <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="text-[#E8694A] underline inline-flex items-center gap-0.5">api.slack.com/apps <ExternalLink className="w-2.5 h-2.5" /></a>, click &quot;Create New App&quot;, and select &quot;From an app manifest&quot;.
                    </p>
                  </div>
                  <div className="p-3 bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg space-y-1">
                    <div className="w-5 h-5 rounded-full bg-[#E8694A] text-white text-[11px] font-bold flex items-center justify-center">2</div>
                    <div className="text-xs font-semibold text-[#2D2D2D]">Paste Manifest JSON</div>
                    <p className="text-[11px] text-[#6B6B6B]">
                      Paste the copied manifest JSON below into the configuration box and click &quot;Create&quot;.
                    </p>
                  </div>
                  <div className="p-3 bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg space-y-1">
                    <div className="w-5 h-5 rounded-full bg-[#E8694A] text-white text-[11px] font-bold flex items-center justify-center">3</div>
                    <div className="text-xs font-semibold text-[#2D2D2D]">Install to Workspace</div>
                    <p className="text-[11px] text-[#6B6B6B]">
                      Click &quot;Install to Workspace&quot;, authorize the bot permissions, and pick your designated breakroom channel.
                    </p>
                  </div>
                </div>
              </div>

              {/* Slash Command Suite */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-[#2D2D2D] uppercase tracking-wider flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[#E8694A]" />
                  Slash Command Suite (`/pantry`)
                </h4>
                <div className="bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#EDE8E0] bg-[#F0EBE3] text-[#2D2D2D]">
                        <th className="p-2.5 font-semibold">Command</th>
                        <th className="p-2.5 font-semibold">Action Description</th>
                        <th className="p-2.5 font-semibold">Visibility</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDE8E0]">
                      <tr>
                        <td className="p-2.5 font-mono-financial text-[#E8694A] font-medium">/pantry stock</td>
                        <td className="p-2.5 text-[#6B6B6B]">Displays current breakroom items, prices, and low-stock indicators</td>
                        <td className="p-2.5 text-[#6B6B6B]">In-Channel / Ephemeral</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono-financial text-[#E8694A] font-medium">/pantry grab &lt;item&gt;</td>
                        <td className="p-2.5 text-[#6B6B6B]">1-Tap snack/beverage consumption logging and balance debit</td>
                        <td className="p-2.5 text-[#6B6B6B]">Ephemeral Card</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono-financial text-[#E8694A] font-medium">/pantry balance</td>
                        <td className="p-2.5 text-[#6B6B6B]">Queries personal balance snapshot and recent expense ledger items</td>
                        <td className="p-2.5 text-[#6B6B6B]">Private (Only You)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono-financial text-[#E8694A] font-medium">/pantry request &lt;item&gt;</td>
                        <td className="p-2.5 text-[#6B6B6B]">Adds suggested item directly to communal shopping list</td>
                        <td className="p-2.5 text-[#6B6B6B]">In-Channel Card</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-mono-financial text-[#E8694A] font-medium">/pantry help</td>
                        <td className="p-2.5 text-[#6B6B6B]">Displays interactive command guide and direct station QR link</td>
                        <td className="p-2.5 text-[#6B6B6B]">Private (Only You)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Slack Manifest Code Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-[#E8694A]" />
                    Standardized Slack App Manifest (`slack-app-manifest.json`)
                  </div>
                  <button
                    onClick={() => handleCopyManifest('slack')}
                    className="text-xs text-[#E8694A] hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Code
                  </button>
                </div>
                <pre className="p-3.5 bg-[#2D2D2D] text-[#F0EBE3] rounded-lg text-[11px] overflow-x-auto max-h-56 font-mono-financial">
                  {JSON.stringify(SLACK_MANIFEST_JSON, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: TEAMS APP (ADAPTIVE CARDS & APP) */}
          {activeTab === 'teams_app' && (
            <div className="space-y-6">
              <div className="p-4 bg-[#EDF4FA] border border-[#8FB8DE]/30 rounded-lg flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[#8FB8DE]" />
                    Microsoft Teams App (Adaptive Cards v1.5 & Bot)
                  </h3>
                  <p className="text-xs text-[#6B6B6B]">
                    Enterprise-ready Adaptive Cards with Universal Action Model (`Action.Execute`), Compose Extensions, and embedded Channel Tabs.
                  </p>
                </div>
                <button
                  onClick={() => handleCopyManifest('teams')}
                  className="px-3 py-1.5 text-xs font-medium bg-[#8FB8DE] text-white hover:bg-[#7AA6CE] rounded-full transition flex items-center gap-1.5 shadow-xs flex-shrink-0"
                >
                  {copiedManifest === 'teams' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied Manifest!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Manifest JSON
                    </>
                  )}
                </button>
              </div>

              {/* 3-Step Deployment Guide */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-[#2D2D2D] uppercase tracking-wider">
                  Microsoft Teams Deployment Guide
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg space-y-1">
                    <div className="w-5 h-5 rounded-full bg-[#8FB8DE] text-white text-[11px] font-bold flex items-center justify-center">1</div>
                    <div className="text-xs font-semibold text-[#2D2D2D]">Open Developer Portal</div>
                    <p className="text-[11px] text-[#6B6B6B]">
                      Access the Microsoft Teams Developer Portal / App Studio in Teams or browser.
                    </p>
                  </div>
                  <div className="p-3 bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg space-y-1">
                    <div className="w-5 h-5 rounded-full bg-[#8FB8DE] text-white text-[11px] font-bold flex items-center justify-center">2</div>
                    <div className="text-xs font-semibold text-[#2D2D2D]">Import App Package</div>
                    <p className="text-[11px] text-[#6B6B6B]">
                      Create a new app package using `teams-app-manifest.json` and configure bot IDs.
                    </p>
                  </div>
                  <div className="p-3 bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg space-y-1">
                    <div className="w-5 h-5 rounded-full bg-[#8FB8DE] text-white text-[11px] font-bold flex items-center justify-center">3</div>
                    <div className="text-xs font-semibold text-[#2D2D2D]">Deploy Tenant-Wide</div>
                    <p className="text-[11px] text-[#6B6B6B]">
                      Publish to Microsoft 365 Admin Center app catalog or sideload into your department team.
                    </p>
                  </div>
                </div>
              </div>

              {/* Teams Capabilities Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg space-y-1.5">
                  <div className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-[#8FB8DE]" />
                    Universal Actions (`Action.Execute`)
                  </div>
                  <p className="text-[11px] text-[#6B6B6B]">
                    Interactive buttons (*&quot;☕ 1-Click Grab&quot;*, *&quot;🛒 Mark Restocked&quot;*) refresh live balance and stock in-place directly on the card without reloading.
                  </p>
                </div>

                <div className="p-3.5 bg-[#FAFAF8] border border-[#E0DAD1] rounded-lg space-y-1.5">
                  <div className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#8FB8DE]" />
                    Compose Box & Channel Tabs
                  </div>
                  <p className="text-[11px] text-[#6B6B6B]">
                    Search pantry items directly from the Teams message composition bar and pin a live breakroom kiosk tab into any channel.
                  </p>
                </div>
              </div>

              {/* Teams Manifest Code Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5 text-[#8FB8DE]" />
                    Standardized Teams App Manifest (`teams-app-manifest.json`)
                  </div>
                  <button
                    onClick={() => handleCopyManifest('teams')}
                    className="text-xs text-[#8FB8DE] hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Code
                  </button>
                </div>
                <pre className="p-3.5 bg-[#2D2D2D] text-[#F0EBE3] rounded-lg text-[11px] overflow-x-auto max-h-56 font-mono-financial">
                  {JSON.stringify(TEAMS_MANIFEST_JSON, null, 2)}
                </pre>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
