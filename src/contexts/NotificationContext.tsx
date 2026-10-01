import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AppNotification, NotificationPreferences } from '../types';
import { 
  fetchNotificationsApi, 
  markNotificationsReadApi, 
  deleteNotificationApi, 
  fetchNotificationPreferencesApi, 
  saveNotificationPreferencesApi 
} from '../lib/api';

export interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  preferences: NotificationPreferences | null;
  refreshNotifications: () => Promise<void>;
  markAsRead: (ids?: string[]) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  savePreferences: (prefs: NotificationPreferences) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  const refreshNotifications = useCallback(async () => {
    try {
      const serverNotes = await fetchNotificationsApi();
      if (Array.isArray(serverNotes)) {
        setNotifications(serverNotes);
      }
      const prefs = await fetchNotificationPreferencesApi();
      if (prefs) {
        setPreferences(prefs);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const markAsRead = useCallback(async (ids?: string[]) => {
    if (ids && ids.length === 1) {
      await markNotificationsReadApi(ids[0]);
    } else {
      await markNotificationsReadApi(undefined, true);
    }
    setNotifications((prev) =>
      prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, isRead: true } : n))
    );
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    await deleteNotificationApi(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const savePreferences = useCallback(async (prefs: NotificationPreferences): Promise<boolean> => {
    const res = await saveNotificationPreferencesApi(prefs);
    if (res.success) {
      setPreferences(prefs);
      return true;
    }
    return false;
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        preferences,
        refreshNotifications,
        markAsRead,
        deleteNotification,
        savePreferences,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
