import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthUser, fetchCurrentUserApi, setAuthToken, removeAuthToken, getAuthToken, updateUserProfileApi } from '../lib/api';
import { saveActiveUserId, loadActiveUserId, clearUserData } from '../lib/storage';

export interface AuthContextType {
  authUser: AuthUser | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  updateProfile: (updates: {
    name?: string;
    avatarUrl?: string;
    venmoHandle?: string;
    cashappHandle?: string;
    paypalHandle?: string;
    zelleIdentifier?: string;
    applePayHandle?: string;
    preferredPaymentMethod?: 'venmo' | 'cashapp' | 'paypal' | 'zelle' | 'applepay';
  }) => Promise<{ success: boolean; error?: string }>;
  refreshAuth: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshAuth = useCallback(async (): Promise<AuthUser | null> => {
    const token = getAuthToken();
    if (!token) {
      setAuthUser(null);
      setIsLoading(false);
      return null;
    }

    try {
      const user = await fetchCurrentUserApi();
      if (user && user.id) {
        setAuthUser(user);
        saveActiveUserId(user.id);
        setIsLoading(false);
        return user;
      } else {
        removeAuthToken();
        setAuthUser(null);
        setIsLoading(false);
        return null;
      }
    } catch (e) {
      // In offline scenario retain active user id
      setIsLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const login = useCallback((token: string, user: AuthUser) => {
    setAuthToken(token);
    setAuthUser(user);
    saveActiveUserId(user.id);
  }, []);

  const logout = useCallback(() => {
    removeAuthToken();
    clearUserData();
    setAuthUser(null);
  }, []);

  const updateProfile = useCallback(async (updates: {
    name?: string;
    avatarUrl?: string;
    venmoHandle?: string;
    cashappHandle?: string;
    paypalHandle?: string;
    zelleIdentifier?: string;
    applePayHandle?: string;
    preferredPaymentMethod?: 'venmo' | 'cashapp' | 'paypal' | 'zelle' | 'applepay';
  }) => {
    const res = await updateUserProfileApi(updates);
    if (res.success && res.user) {
      setAuthUser(res.user);
      return { success: true };
    }
    return { success: false, error: res.error || 'Failed to update profile' };
  }, []);

  return (
    <AuthContext.Provider value={{ authUser, isLoading, login, logout, updateProfile, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
