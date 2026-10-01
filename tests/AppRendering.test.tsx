import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../src/App';
import * as api from '../src/lib/api';

describe('App Component Rendering', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(api, 'fetchShoppingListApi').mockResolvedValue({ success: true, shoppingList: [] });
    vi.spyOn(api, 'fetchPollsApi').mockResolvedValue({ success: true, polls: [] });
    vi.spyOn(api, 'fetchNotificationsApi').mockResolvedValue({ success: true, notifications: [] });
    vi.spyOn(api, 'fetchNotificationPreferencesApi').mockResolvedValue({ success: true, preferences: null as any });
  });

  it('renders landing page for visitor without crashing', async () => {
    localStorage.clear();
    const { container } = render(<App />);
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText(/Keep The Cold Brew Flowing|Community pantries/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Create Your Pantry Pool Free|Get started free/i).length).toBeGreaterThan(0);
  });

  it('allows unauthenticated visitors to open the AuthModal without errors', async () => {
    render(<App />);
    const signInBtn = screen.getAllByRole('button', { name: /sign in/i })[0];
    fireEvent.click(signInBtn);

    expect(await screen.findByText(/Welcome Back to PantryPool/i, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('renders empty pool onboarding when authenticated user has no pools', async () => {
    vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue({
      id: 'u-new',
      email: 'newuser@example.com',
      name: 'New User',
      systemRole: 'user',
    });
    vi.spyOn(api, 'fetchPools').mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/No Pantry Pools Joined/i)).toBeInTheDocument();
    });
  });

  it('renders full pool workspace when authenticated user has a pool with empty inventory', async () => {
    vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue({
      id: 'u-sarah',
      email: 'sarah@example.com',
      name: 'Sarah C.',
      systemRole: 'user',
    });
    vi.spyOn(api, 'fetchPools').mockResolvedValue([
      {
        id: 'pool-test',
        name: 'Test Office Pool',
        category: 'Office',
        currency: '$',
        members: [
          {
            id: 'u-sarah',
            name: 'Sarah C.',
            avatarUrl: '',
            role: 'champion',
            balance: 10.0,
          },
        ],
      },
    ]);
    vi.spyOn(api, 'fetchItems').mockResolvedValue([]);
    vi.spyOn(api, 'fetchTransactions').mockResolvedValue([]);

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText(/Test Office Pool/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/No items match your filter/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('allows initializing a new pool under a company workspace when organizations are present', async () => {
    vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue({
      id: 'u-sarah',
      email: 'sarah@example.com',
      name: 'Sarah C.',
      systemRole: 'user',
    });
    vi.spyOn(api, 'fetchOrganizationsApi').mockResolvedValue([
      { id: 'org-acme', name: 'Acme Corp', tier: 'pro', ownerId: 'u-sarah' }
    ]);
    vi.spyOn(api, 'fetchPools').mockResolvedValue([]);
    const createPoolSpy = vi.spyOn(api, 'createPoolApi').mockResolvedValue({
      success: true,
      poolId: 'pool-new-123',
      qrCodeKey: 'PNTR99'
    });

    render(<App />);

    // Wait for the empty state create button
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /create or join pool/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /create or join pool/i })[0]);

    // Verify modal is open and shows company / organization selector
    expect(await screen.findByText(/Company \/ Organization Workspace/i, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getAllByText(/Acme Corp/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/No Company \/ Personal Pool/i)).toBeInTheDocument();

    // Fill pool name
    const poolNameInput = await screen.findByPlaceholderText(/5th Floor Soda/i, {}, { timeout: 5000 });
    fireEvent.change(poolNameInput, { target: { value: 'Marketing Snack Stash' } });

    // Submit
    const submitBtn = await screen.findByRole('button', { name: /initialize new pool/i }, { timeout: 5000 });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createPoolSpy).toHaveBeenCalledWith(
        'Marketing Snack Stash',
        'Office',
        '$',
        'org-acme',
        'Shared consumables pool',
        'u-sarah'
      );
    });
  });

  it('allows initializing a new direct personal/communal pool when no organizations exist', async () => {
    vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue({
      id: 'u-sarah',
      email: 'sarah@example.com',
      name: 'Sarah C.',
      systemRole: 'user',
    });
    vi.spyOn(api, 'fetchOrganizationsApi').mockResolvedValue([]);
    vi.spyOn(api, 'fetchPools').mockResolvedValue([]);
    const createPoolSpy = vi.spyOn(api, 'createPoolApi').mockResolvedValue({
      success: true,
      poolId: 'pool-new-123',
      qrCodeKey: 'PNTR99'
    });

    render(<App />);

    // Wait for the empty state create button
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /create or join pool/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /create or join pool/i })[0]);

    // Fill pool name
    const poolNameInput = await screen.findByPlaceholderText(/5th Floor Soda/i, {}, { timeout: 5000 });
    fireEvent.change(poolNameInput, { target: { value: 'Household Pantry' } });

    // Submit
    const submitBtn = await screen.findByRole('button', { name: /initialize new pool/i }, { timeout: 5000 });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createPoolSpy).toHaveBeenCalledWith(
        'Household Pantry',
        'Office',
        '$',
        null,
        'Shared consumables pool',
        'u-sarah'
      );
    });
  });

  it('displays the "Enjoy your {item}!" confirmation dialog when grabbing an item from the catalog', async () => {
    vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue({
      id: 'u-sarah',
      email: 'sarah@example.com',
      name: 'Sarah C.',
      systemRole: 'user',
    });
    vi.spyOn(api, 'fetchPools').mockResolvedValue([
      {
        id: 'pool-test',
        name: 'Test Office Pool',
        category: 'Office',
        currency: '$',
        members: [
          {
            id: 'u-sarah',
            name: 'Sarah C.',
            avatarUrl: '',
            role: 'champion',
            balance: 10.0,
          },
        ],
      },
    ]);
    vi.spyOn(api, 'fetchItems').mockResolvedValue([
      {
        id: 'item-coldbrew',
        poolId: 'pool-test',
        name: 'Nitro Cold Brew',
        category: 'Beverages',
        costPerUnit: 2.5,
        stock: 5,
        minStock: 2,
        unitName: 'can',
        icon: 'coffee',
      },
    ]);
    vi.spyOn(api, 'fetchTransactions').mockResolvedValue([]);
    vi.spyOn(api, 'consumeItemApi').mockResolvedValue({
      success: true,
      remainingStock: 4,
      cost: 2.5,
      newBalance: 7.5,
    });

    render(<App />);

    // Wait for the item card to be visible
    const grabBtn = await screen.findByRole('button', { name: /grab 1 can/i });
    expect(grabBtn).toBeInTheDocument();

    fireEvent.click(grabBtn);

    // Verify the "Enjoy your Nitro Cold Brew! 🎉" popup appears
    expect(await screen.findByText(/Enjoy your Nitro Cold Brew! 🎉/i)).toBeInTheDocument();
    expect(screen.getByText(/Thanks for using PantryPool!/i)).toBeInTheDocument();

    // Confirm button dismisses dialog
    const gotItBtn = screen.getByRole('button', { name: /got it/i });
    fireEvent.click(gotItBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Enjoy your Nitro Cold Brew! 🎉/i)).not.toBeInTheDocument();
    });
  });

  it('silently consumes item on QR deep link scan without showing join error when already a member', async () => {
    localStorage.setItem('pantrypool_token', 'mock_jwt_token_123');
    window.history.pushState({}, '', '/?action=consume&item=item-101&pool=pool-existing-1&join=POOL-ABC');

    const joinPoolSpy = vi.spyOn(api, 'joinPoolApi');
    vi.spyOn(api, 'fetchCurrentUserApi').mockResolvedValue({
      id: 'user-789',
      name: 'Jane Doe',
      email: 'jane@example.com',
      systemRole: 'user',
    });

    vi.spyOn(api, 'fetchPools').mockResolvedValue([
      {
        id: 'pool-existing-1',
        name: 'Main Breakroom',
        code: 'POOL-ABC',
        category: 'Office',
        currency: 'USD',
        members: [
          {
            id: 'user-789',
            name: 'Jane Doe',
            role: 'member',
            balance: 10,
          },
        ],
      },
    ]);

    vi.spyOn(api, 'fetchItems').mockResolvedValue([
      {
        id: 'item-101',
        poolId: 'pool-existing-1',
        name: 'Sparkling Water',
        category: 'Beverages',
        costPerUnit: 1.0,
        stock: 12,
        minStock: 3,
        unitName: 'can',
        icon: 'drink',
      },
    ]);

    vi.spyOn(api, 'consumeItemApi').mockResolvedValue({
      success: true,
      remainingStock: 11,
      cost: 1.0,
      newBalance: 9.0,
    });

    render(<App />);

    // Verify joinPoolApi was NOT called because user is already a member
    expect(joinPoolSpy).not.toHaveBeenCalled();

    // Verify no "Unable to Join Pool" or "Pool Joined" alert dialog is shown
    expect(screen.queryByText(/Unable to Join Pool/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/🎉 Pool Joined!/i)).not.toBeInTheDocument();

    // Verify consumption modal appears smoothly
    expect(await screen.findByText(/Enjoy your Sparkling Water! 🎉/i)).toBeInTheDocument();

    // Clean up URL
    window.history.replaceState({}, '', '/');
  });
});

