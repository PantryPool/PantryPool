import React, { useState, useEffect } from 'react';
import { AppNotification, NotificationPreferences } from '../types';
import { 
  Bell, 
  CheckCheck, 
  AlertTriangle, 
  Mail, 
  Smartphone, 
  FileText, 
  Settings, 
  X, 
  RefreshCw, 
  Send, 
  CheckCircle2, 
  ShieldAlert,
  Trash2,
  Sparkles,
  Info,
  Lock,
} from 'lucide-react';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  preferences: NotificationPreferences;
  currentOrgTier?: string;
  isPlusOrEnterprise?: boolean;
  onUpgradeTier?: () => void;
  onMarkAsRead: (notificationId?: string, markAll?: boolean) => void;
  onDeleteNotification?: (notificationId: string) => void;
  onSavePreferences: (prefs: NotificationPreferences) => void;
  onTriggerLowStockCheck: () => Promise<string | void> | void;
  onTriggerWeeklyDigest: () => Promise<string | void> | void;
  onSendTestAlert?: () => Promise<void> | void;
  onNavigateToRestock?: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  preferences,
  currentOrgTier,
  isPlusOrEnterprise = false,
  onUpgradeTier,
  onMarkAsRead,
  onDeleteNotification,
  onSavePreferences,
  onTriggerLowStockCheck,
  onTriggerWeeklyDigest,
  onSendTestAlert,
  onNavigateToRestock,
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'settings'>('inbox');
  const [filterType, setFilterType] = useState<'all' | 'low_stock' | 'weekly_digest'>('all');
  
  // Local state for notification preferences form
  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences>({ ...preferences });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isGeneratingDigest, setIsGeneratingDigest] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);

  // Sync preferences when parent loads from backend
  useEffect(() => {
    if (preferences) {
      setLocalPrefs({ ...preferences });
    }
  }, [preferences]);

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const filteredNotifications = notifications.filter(n => {
    if (filterType === 'all') return true;
    return n.type === filterType;
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSavePreferences(localPrefs);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleRunScan = async () => {
    setIsScanning(true);
    setStatusBanner(null);
    try {
      const msg = await onTriggerLowStockCheck();
      if (typeof msg === 'string') {
        setStatusBanner({ type: msg.includes('0') || msg.includes('All') ? 'info' : 'warning', text: msg });
      } else {
        setStatusBanner({ type: 'info', text: 'Stock audit complete.' });
      }
    } catch (e) {
      setStatusBanner({ type: 'warning', text: 'Stock check completed.' });
    } finally {
      setIsScanning(false);
      setTimeout(() => setStatusBanner(null), 5000);
    }
  };

  const handleGenerateDigest = async () => {
    if (!isPlusOrEnterprise) {
      setStatusBanner({ 
        type: 'warning', 
        text: 'Weekly summary digests are exclusively available on Hosted Plus ($12/mo) and Enterprise plans.' 
      });
      setTimeout(() => setStatusBanner(null), 5000);
      return;
    }

    setIsGeneratingDigest(true);
    setStatusBanner(null);
    try {
      const msg = await onTriggerWeeklyDigest();
      setStatusBanner({ 
        type: 'success', 
        text: typeof msg === 'string' ? msg : 'Weekly balance summary digest generated.' 
      });
    } catch (e: any) {
      setStatusBanner({ type: 'warning', text: e?.message || 'Failed to generate weekly digest.' });
    } finally {
      setIsGeneratingDigest(false);
      setTimeout(() => setStatusBanner(null), 5000);
    }
  };

  const handleSendTest = async () => {
    if (!onSendTestAlert) return;
    setIsSendingTest(true);
    try {
      await onSendTestAlert();
      setStatusBanner({ type: 'success', text: '🧪 Test notification dispatched to your inbox!' });
      setActiveTab('inbox');
    } catch (e) {}
    finally {
      setIsSendingTest(false);
      setTimeout(() => setStatusBanner(null), 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2D2D]/40 animate-fade-in">
      <div className="bg-white border border-[#E0DAD1] rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#2D2D2D]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EDE8E0] flex items-center justify-between bg-[#FAFAF8]">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#FDF0EC] text-[#E8694A] rounded-lg">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2D2D2D] flex items-center gap-2">
                Notification Center
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/30 rounded-full font-mono-financial">
                    {unreadCount} new
                  </span>
                )}
              </h2>
              <p className="text-xs text-[#6B6B6B]">Low-stock alerts, weekly digests & channel settings</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#E0DAD1] bg-[#F0EBE3] px-6 pt-2">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`pb-2.5 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'inbox'
                ? 'border-[#E8694A] text-[#E8694A] font-semibold'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Bell className="w-4 h-4" />
            Alert Inbox ({notifications.length})
          </button>
          
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-[#E8694A] text-[#E8694A] font-semibold'
                : 'border-transparent text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            <Settings className="w-4 h-4" />
            Channel Preferences
          </button>
        </div>

        {/* Status Toast Banner */}
        {statusBanner && (
          <div className={`px-6 py-2.5 text-xs font-medium flex items-center gap-2 border-b animate-fadeIn ${
            statusBanner.type === 'success'
              ? 'bg-[#EDF5EF] text-[#5A9A6B] border-[#5A9A6B]/30'
              : statusBanner.type === 'warning'
              ? 'bg-[#FFF8EB] text-[#D4870E] border-[#D4870E]/30'
              : 'bg-[#EDF4FA] text-[#8FB8DE] border-[#8FB8DE]/30'
          }`}>
            {statusBanner.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <Info className="w-4 h-4 flex-shrink-0" />}
            <span>{statusBanner.text}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'inbox' && (
            <div>
              {/* Inbox Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-[#EDE8E0]">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      filterType === 'all'
                        ? 'bg-[#E8694A] text-white shadow-xs'
                        : 'bg-[#F0EBE3] text-[#6B6B6B] hover:text-[#2D2D2D]'
                    }`}
                  >
                    All Alerts
                  </button>
                  <button
                    onClick={() => setFilterType('low_stock')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${
                      filterType === 'low_stock'
                        ? 'bg-[#E8694A] text-white shadow-xs'
                        : 'bg-[#F0EBE3] text-[#6B6B6B] hover:text-[#2D2D2D]'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Low Stock
                  </button>
                  <button
                    onClick={() => setFilterType('weekly_digest')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${
                      filterType === 'weekly_digest'
                        ? 'bg-[#E8694A] text-white shadow-xs'
                        : 'bg-[#F0EBE3] text-[#6B6B6B] hover:text-[#2D2D2D]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Weekly Digest
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunScan}
                    disabled={isScanning}
                    className="px-3 py-1.5 text-xs font-medium bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] rounded-full border border-[#E0DAD1] transition-colors flex items-center gap-1.5 shadow-xs"
                    title="Audit inventory stock thresholds now"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    Audit Stock
                  </button>
                  <button
                    onClick={handleGenerateDigest}
                    disabled={isGeneratingDigest}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex items-center gap-1.5 shadow-xs ${
                      isPlusOrEnterprise
                        ? 'bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border-[#E0DAD1]'
                        : 'bg-[#F0EBE3]/70 hover:bg-[#E8E2D9] text-[#6B6B6B] border-[#E0DAD1]'
                    }`}
                    title={
                      isPlusOrEnterprise
                        ? 'Generate balance summary digest'
                        : 'Weekly summary digests require Hosted Plus ($12/mo) or Enterprise'
                    }
                  >
                    {isPlusOrEnterprise ? (
                      <Send className={`w-3.5 h-3.5 ${isGeneratingDigest ? 'animate-pulse' : ''}`} />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#E8694A]" />
                    )}
                    Send Digest
                  </button>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => onMarkAsRead(undefined, true)}
                      className="px-3 py-1.5 text-xs font-medium bg-[#EDF5EF] hover:bg-[#EDF5EF]/80 text-[#5A9A6B] border border-[#5A9A6B]/30 rounded-full transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              {/* Notification Cards List */}
              {filteredNotifications.length === 0 ? (
                <div className="py-12 text-center text-[#6B6B6B]">
                  <Bell className="w-10 h-10 mx-auto mb-2 text-[#9A9A9A] opacity-60" />
                  <p className="text-sm font-medium text-[#2D2D2D]">No notifications in this view.</p>
                  <p className="text-xs text-[#6B6B6B] mt-1">Stock thresholds and balance reports are up to date.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-4 rounded-lg border transition-all ${
                        notif.isRead
                          ? 'bg-[#FAFAF8] border-[#E0DAD1] opacity-75'
                          : 'bg-white border-[#E0DAD1] shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-md mt-0.5 ${
                            notif.type === 'low_stock'
                              ? 'bg-[#FFF8EB] text-[#D4870E]'
                              : notif.type === 'weekly_digest'
                              ? 'bg-[#EDF5EF] text-[#5A9A6B]'
                              : 'bg-[#EDF4FA] text-[#8FB8DE]'
                          }`}>
                            {notif.type === 'low_stock' ? (
                              <AlertTriangle className="w-4 h-4" />
                            ) : notif.type === 'weekly_digest' ? (
                              <FileText className="w-4 h-4" />
                            ) : (
                              <Bell className="w-4 h-4" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-medium text-[#2D2D2D]">{notif.title}</h4>
                              {!notif.isRead && (
                                <span className="w-2 h-2 rounded-full bg-[#E8694A]"></span>
                              )}
                            </div>
                            <p className="text-xs text-[#6B6B6B] mt-1 leading-relaxed">{notif.message}</p>
                            
                            <div className="flex items-center gap-3 mt-2 text-[11px] text-[#9A9A9A]">
                              <span className="font-mono-financial">{new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                {notif.channel === 'email' ? <Mail className="w-3 h-3 text-[#5A9A6B]" /> : null}
                                {notif.channel === 'sms' ? <Smartphone className="w-3 h-3 text-[#D4870E]" /> : null}
                                {notif.channel === 'in_app' ? <Bell className="w-3 h-3 text-[#8FB8DE]" /> : null}
                                {notif.channel === 'email' ? 'Email Digest' : notif.channel === 'sms' ? 'SMS Alert' : 'In-App'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {notif.type === 'low_stock' && onNavigateToRestock && (
                            <button
                              onClick={() => {
                                onMarkAsRead(notif.id);
                                onClose();
                                onNavigateToRestock();
                              }}
                              className="px-2.5 py-1 text-xs font-medium bg-[#FFF8EB] hover:bg-[#FFF8EB]/80 text-[#D4870E] border border-[#D4870E]/30 rounded-full transition-colors"
                              title="View item in inventory catalog"
                            >
                              View in Catalog
                            </button>
                          )}
                          {!notif.isRead && (
                            <button
                              onClick={() => onMarkAsRead(notif.id)}
                              className="p-1.5 text-[#6B6B6B] hover:text-[#5A9A6B] hover:bg-[#F0EBE3] rounded-md transition-colors"
                              title="Mark as read"
                            >
                              <CheckCheck className="w-4 h-4" />
                            </button>
                          )}
                          {onDeleteNotification && (
                            <button
                              onClick={() => onDeleteNotification(notif.id)}
                              className="p-1.5 text-[#6B6B6B] hover:text-[#C9553D] hover:bg-[#FDF0EC] rounded-md transition-colors"
                              title="Dismiss notification"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <form onSubmit={handleSave} className="space-y-6">
              {saveSuccess && (
                <div className="p-3 bg-[#EDF5EF] border border-[#5A9A6B]/30 rounded-md text-[#5A9A6B] text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Notification channel settings saved successfully!</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#D4870E]" />
                    Low-Stock Alerts Dispatch
                  </h3>
                  {onSendTestAlert && (
                    <button
                      type="button"
                      onClick={handleSendTest}
                      disabled={isSendingTest}
                      className="px-3 py-1 text-xs font-medium bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] rounded-full transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      <Sparkles className="w-3 h-3 text-[#E8694A]" />
                      {isSendingTest ? 'Sending...' : 'Send Test Alert'}
                    </button>
                  )}
                </div>

                <div className="p-4 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg space-y-3">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <Mail className="w-4 h-4 text-[#6B6B6B]" />
                      <div>
                        <div className="text-sm font-medium text-[#2D2D2D]">Email Low-Stock Alerts</div>
                        <div className="text-xs text-[#6B6B6B]">Receive instant email when item inventory drops below min threshold</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(localPrefs.lowStockEmail)}
                      onChange={(e) => setLocalPrefs({ ...localPrefs, lowStockEmail: e.target.checked })}
                      className="w-4 h-4 rounded border-[#E0DAD1] text-[#E8694A] accent-[#E8694A]"
                    />
                  </label>

                  <div className="border-t border-[#E0DAD1] pt-3 opacity-75">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Smartphone className="w-4 h-4 text-[#9A9A9A]" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#2D2D2D]">SMS Low-Stock Alerts</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#EDE8E0] text-[#6B6B6B] border border-[#D5CEC4] rounded-full px-2 py-0.5">
                              Coming Soon
                            </span>
                          </div>
                          <div className="text-xs text-[#6B6B6B]">Urgent mobile text alerts for champions (carrier integration under development)</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        disabled
                        checked={false}
                        aria-disabled="true"
                        className="w-4 h-4 rounded border-[#D5CEC4] text-[#9A9A9A] cursor-not-allowed bg-[#E8E2D9] opacity-50"
                        title="SMS notifications coming soon"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#5A9A6B]" />
                    Weekly Balance & Inventory Summary
                  </h3>
                  {!isPlusOrEnterprise && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E8694A]/10 text-[#E8694A] border border-[#E8694A]/30">
                      <Sparkles className="w-3 h-3" /> Hosted Plus
                    </span>
                  )}
                </div>

                <div className={`p-4 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg ${!isPlusOrEnterprise ? 'opacity-90' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <Mail className="w-4 h-4 text-[#6B6B6B] mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-[#2D2D2D]">Weekly Email Summary Digest</div>
                          {!isPlusOrEnterprise && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                              Plus & Enterprise
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#6B6B6B] mt-0.5">
                          Receive a weekly breakdown of pool consumption, restocks, and member balances every Monday morning
                        </div>
                        {!isPlusOrEnterprise && (
                          <div className="mt-2.5 text-xs text-[#6B6B6B] flex items-center gap-2">
                            <span>Available on Hosted Plus ($12/mo) and Enterprise plans.</span>
                            {onUpgradeTier && (
                              <button
                                type="button"
                                onClick={onUpgradeTier}
                                className="font-semibold text-[#E8694A] hover:underline cursor-pointer"
                              >
                                Upgrade Plan &rarr;
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {isPlusOrEnterprise ? (
                      <input
                        type="checkbox"
                        checked={Boolean(localPrefs.weeklyDigestEmail)}
                        onChange={(e) => setLocalPrefs({ ...localPrefs, weeklyDigestEmail: e.target.checked })}
                        className="w-4 h-4 rounded border-[#E0DAD1] text-[#E8694A] accent-[#E8694A] cursor-pointer"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-[#8A8A8A] shrink-0 font-medium pt-0.5">
                        <Lock className="w-3.5 h-3.5 text-[#E8694A]" />
                        <span className="text-[11px] text-[#6B6B6B]">Locked</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-medium bg-[#E8694A] hover:bg-[#D45A3D] text-white rounded-full transition-colors shadow-xs"
                >
                  Save Notification Preferences
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
