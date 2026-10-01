import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { subscribeOfflineQueue, flushOfflineQueue, OfflineQueueItem } from '../lib/offlineQueue';

export const OfflineQueueBanner: React.FC = () => {
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeOfflineQueue((items) => {
      setQueue(items);
    });

    const handleOnline = () => {
      setIsOnline(true);
      handleSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const result = await flushOfflineQueue();
      if (result.succeeded > 0) {
        setSyncStatus({
          message: `Synced ${result.succeeded} queued action(s) successfully.`,
          type: 'success',
        });
        setTimeout(() => setSyncStatus(null), 4000);
      } else if (result.failed > 0) {
        setSyncStatus({
          message: `Sync failed for ${result.failed} action(s). Will retry automatically.`,
          type: 'error',
        });
      }
    } catch (err: any) {
      setSyncStatus({
        message: err.message || 'Sync failed. Will retry automatically.',
        type: 'error',
      });
    } finally {
      setSyncing(false);
    }
  };

  const pendingCount = queue.filter((i) => i.status === 'pending' || i.status === 'failed' || i.status === 'syncing').length;

  if (isOnline && pendingCount === 0 && !syncStatus) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 animate-slideUp">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#2D2D2D] text-white rounded-xl shadow-lg border border-[#3E3E3E] text-xs">
        {!isOnline ? (
          <div className="flex items-center gap-1.5 text-[#E8694A]">
            <WifiOff className="w-4 h-4 animate-pulse" />
            <span className="font-semibold">Offline Mode</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[#5A9A6B]">
            <span className="w-2 h-2 rounded-full bg-[#5A9A6B] animate-pulse"></span>
            <span className="font-semibold">Online</span>
          </div>
        )}

        {pendingCount > 0 && (
          <span className="text-[#A09D98]">
            {pendingCount} mutation{pendingCount > 1 ? 's' : ''} queued locally
          </span>
        )}

        {syncStatus && (
          <div className="flex items-center gap-1">
            {syncStatus.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-[#5A9A6B]" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-[#E8694A]" />
            )}
            <span className={syncStatus.type === 'success' ? 'text-[#5A9A6B]' : 'text-[#E8694A]'}>
              {syncStatus.message}
            </span>
          </div>
        )}

        {isOnline && pendingCount > 0 && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#E8694A] hover:bg-[#D4583B] text-white rounded-md font-medium transition-colors disabled:opacity-50 ml-1"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
