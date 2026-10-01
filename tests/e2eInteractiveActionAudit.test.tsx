import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../src/App';
import * as api from '../src/lib/api';
import { saveCachedAuthUser, savePools, saveActivePoolId } from '../src/lib/storage';

describe('End-to-End Interactive Action & Button Audit', { timeout: 15000 }, () => {
  const mockUser = {
    id: 'u-audit',
    name: 'Audit Manager',
    email: 'audit@pantrypool.com',
    role: 'champion' as const,
    balance: 50.0,
    avatar: '',
    joinedAt: new Date().toISOString(),
  };

  const mockAuthUser: api.AuthUser = {
    id: 'u-audit',
    name: 'Audit Manager',
    email: 'audit@pantrypool.com',
    systemRole: 'user',
  };

  const mockPool = {
    id: 'pool-audit-1',
    name: 'Headquarters Breakroom',
    category: 'Office' as const,
    currency: '$',
    code: 'PP-AUDIT-1',
    description: 'Headquarters breakroom pantry',
    championId: 'u-audit',
    members: [mockUser],
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');

    // Default mock APIs
    vi.spyOn(api, 'fetchShoppingListApi').mockResolvedValue({ success: true, shoppingList: [] });
    vi.spyOn(api, 'fetchPollsApi').mockResolvedValue({ success: true, polls: [] });
    vi.spyOn(api, 'fetchNotificationsApi').mockResolvedValue({ success: true, notifications: [] });
    vi.spyOn(api, 'fetchNotificationPreferencesApi').mockResolvedValue({ success: true, preferences: null as any });
    vi.spyOn(api, 'fetchPublicSettingsApi').mockResolvedValue({ kioskModeEnabled: true } as any);

  });

  describe('Active Pool: Header Actions and Navigation', () => {
    beforeEach(() => {
      api.setAuthToken('mock-audit-token');
      saveCachedAuthUser(mockAuthUser);
      savePools([mockPool]);
      saveActivePoolId(mockPool.id);
      vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue(mockAuthUser);
      vi.spyOn(api, 'fetchPools').mockResolvedValue([mockPool]);
      vi.spyOn(api, 'fetchItems').mockResolvedValue([]);
      vi.spyOn(api, 'fetchTransactions').mockResolvedValue([]);
      vi.spyOn(api, 'fetchOrganizationsApi').mockResolvedValue([]);
    });



    it('triggers AI Receipt Scanner modal from Header dropdown', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const wrenchButton = screen.getByTitle('More Tools & Settings');
      fireEvent.click(wrenchButton);
      expect(screen.getByText('AI Receipt Scanner')).toBeInTheDocument();

      fireEvent.click(screen.getByText('AI Receipt Scanner'));
      await waitFor(() => {
        expect(screen.getByText(/Bring In Items \/ Restock/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('triggers Print Fridge Poster modal from Header dropdown', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const wrenchButton = screen.getByTitle('More Tools & Settings');
      fireEvent.click(wrenchButton);
      expect(screen.getByText('Print Fridge Poster')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Print Fridge Poster'));
      await waitFor(() => {
        expect(screen.getByText(/Communal Refrigerator & Countertop Poster/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('triggers NFC Tag Setup & Hub modal from Header dropdown', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const wrenchButton = screen.getByTitle('More Tools & Settings');
      fireEvent.click(wrenchButton);
      expect(screen.getByText(/NFC Tag Setup & Hub/i)).toBeInTheDocument();

      fireEvent.click(screen.getByText(/NFC Tag Setup & Hub/i));
      await waitFor(() => {
        expect(screen.getByText(/NFC Tag Automation & Setup Hub/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('triggers Quick Guide & Help modal from Header dropdown', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const wrenchButton = screen.getByTitle('More Tools & Settings');
      fireEvent.click(wrenchButton);
      expect(screen.getByText('Quick Guide & Help')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Quick Guide & Help'));
      await waitFor(() => {
        expect(screen.getByText(/PantryPool Quick Guide/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('triggers QR Scanner from Header action button', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const scanQrBtn = screen.getByTitle('Scan Fridge or Item QR Code');
      fireEvent.click(scanQrBtn);
      await waitFor(() => {
        expect(screen.getByText(/Fridge & Pantry Scanner/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('triggers Quick Help from Header icon button', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const helpIconBtn = screen.getByTitle('PantryPool Quick Guide & Help');
      fireEvent.click(helpIconBtn);
      await waitFor(() => {
        expect(screen.getByText(/PantryPool Quick Guide/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('triggers User Profile modal from Header avatar button', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const profileBtn = screen.getByTitle('Profile & Connected Accounts');
      fireEvent.click(profileBtn);
      await waitFor(() => {
        expect(screen.getByText(/Profile Settings & Login Connections/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });
  });

  describe('Mobile Navigation: Action Sheet & Bottom Tabs', () => {
    beforeEach(() => {
      api.setAuthToken('mock-audit-token');
      saveCachedAuthUser(mockAuthUser);
      savePools([mockPool]);
      saveActivePoolId(mockPool.id);
      vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue(mockAuthUser);
      vi.spyOn(api, 'fetchPools').mockResolvedValue([mockPool]);
      vi.spyOn(api, 'fetchItems').mockResolvedValue([]);
      vi.spyOn(api, 'fetchTransactions').mockResolvedValue([]);
      vi.spyOn(api, 'fetchOrganizationsApi').mockResolvedValue([]);
    });



    it('triggers Share & Invite modal from mobile action sheet', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const moreBtn = screen.getByRole('button', { name: /open quick actions and pantry tools/i });
      fireEvent.click(moreBtn);

      const shareBtn = screen.getByText('Share & Invite');
      fireEvent.click(shareBtn);

      await waitFor(() => {
        expect(screen.getByText(/Share & Invite/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('triggers Item Polls & Voting modal from mobile action sheet', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const moreBtn = screen.getByRole('button', { name: /open quick actions and pantry tools/i });
      fireEvent.click(moreBtn);

      const pollsBtn = screen.getByText('Item Polls & Voting');
      fireEvent.click(pollsBtn);

      await waitFor(() => {
        expect(screen.getByText(/Consumables Team Polls/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('triggers Pantry & Pool Settings from mobile action sheet', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const moreBtn = screen.getByRole('button', { name: /open quick actions and pantry tools/i });
      fireEvent.click(moreBtn);

      const settingsBtn = screen.getByText('Pantry & Pool Settings');
      fireEvent.click(settingsBtn);

      await waitFor(() => {
        expect(screen.getByText(/Pool Settings/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('triggers Legal Terms modal from mobile action sheet', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getAllByText(/Headquarters Breakroom/i).length).toBeGreaterThan(0);
      }, { timeout: 6000 });

      const moreBtn = screen.getByRole('button', { name: /open quick actions and pantry tools/i });
      fireEvent.click(moreBtn);

      const termsBtn = screen.getByText('Terms');
      fireEvent.click(termsBtn);

      await waitFor(() => {
        expect(screen.getByText('PantryPool Terms of Service')).toBeInTheDocument();
      }, { timeout: 6000 });
    });
  });

  describe('Zero-Pool Pre-flight Guardrails (No Active Pool)', () => {
    beforeEach(() => {
      api.setAuthToken('mock-audit-token');
      saveCachedAuthUser(mockAuthUser);
      savePools([]);
      saveActivePoolId('');
      vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue(mockAuthUser);
      vi.spyOn(api, 'fetchPools').mockResolvedValue([]);
      vi.spyOn(api, 'fetchOrganizationsApi').mockResolvedValue([]);
    });

    it('presents informative pre-flight alert dialog instead of silent failure when no pool exists', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/No Pantry Pools Joined/i)).toBeInTheDocument();
      }, { timeout: 6000 });

      // Click tools dropdown
      const wrenchButton = screen.getByTitle('More Tools & Settings');
      fireEvent.click(wrenchButton);

      // Click "AI Receipt Scanner" when 0 pools exist
      const receiptBtn = screen.getByText('AI Receipt Scanner');
      fireEvent.click(receiptBtn);

      // Verify Alert Dialog appears with explanation
      await waitFor(() => {
        expect(screen.getByText('No Active Pantry')).toBeInTheDocument();
        expect(screen.getByText(/Please create or join a pantry pool before scanning receipts/i)).toBeInTheDocument();
      }, { timeout: 6000 });

      // Confirm button in alert dialog should offer to create pool
      const createPoolConfirmBtn = screen.getByRole('button', { name: /Create Pool/i });
      fireEvent.click(createPoolConfirmBtn);

      // Create Pool Modal should now open!
      await waitFor(() => {
        expect(screen.getByText(/Create New Pool/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });

    it('allows opening Create Pool modal directly from empty state banner', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/No Pantry Pools Joined/i)).toBeInTheDocument();
      }, { timeout: 6000 });

      const createPoolBtn = screen.getByRole('button', { name: 'Create Standalone Pantry' });
      fireEvent.click(createPoolBtn);

      await waitFor(() => {
        expect(screen.getByText(/Create New Pool/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });
  });

  describe('Visitor Marketing Experience', () => {
    beforeEach(() => {
      api.removeAuthToken();
      saveCachedAuthUser(null);
      savePools([]);
      saveActivePoolId('');
      vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue(null);
    });



    it('opens AuthModal when clicking Sign In from header', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/Keep The Cold Brew Flowing|Community pantries/i)).toBeInTheDocument();
      }, { timeout: 6000 });

      const signInBtn = screen.getAllByRole('button', { name: /sign in/i })[0];
      fireEvent.click(signInBtn);

      await waitFor(() => {
        expect(screen.getByText(/Welcome Back to PantryPool/i)).toBeInTheDocument();
      }, { timeout: 6000 });
    });
  });
});
