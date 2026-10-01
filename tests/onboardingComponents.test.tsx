import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingChecklist } from '../src/components/OnboardingChecklist';
import { MemberWelcomeBanner } from '../src/components/MemberWelcomeBanner';
import { HelpGuideModal } from '../src/components/HelpGuideModal';
import { ItemCatalog } from '../src/components/ItemCatalog';
import { Pool, User } from '../src/types';

const mockPool: Pool = {
  id: 'pool_test_123',
  name: 'Engineering Breakroom',
  description: 'Engineering breakroom pantry',
  category: 'Office',
  currency: '$',
  code: 'ENG123',
  championId: 'user_champ',
  createdAt: '2026-01-01T00:00:00Z',
  savingsEnabled: true,
  members: [
    { id: 'user_champ', name: 'Alice Champion', email: 'alice@example.com', avatar: '', role: 'champion', balance: 0, joinedAt: '2026-01-01T00:00:00Z' }
  ]
};

const mockActiveUser: User = {
  id: 'user_member',
  name: 'Bob Coworker',
  email: 'bob@example.com',
  avatar: '',
  role: 'member',
  balance: 0,
  joinedAt: '2026-01-01T00:00:00Z'
};

describe('OnboardingChecklist Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders correctly for pool champions with initial progress', () => {
    const onOpenAddItem = vi.fn();
    const onOpenReceiptScanner = vi.fn();
    const onOpenPrintPoster = vi.fn();
    const onOpenSharePool = vi.fn();

    render(
      <OnboardingChecklist
        pool={mockPool}
        items={[]}
        isManager={true}
        onOpenAddItem={onOpenAddItem}
        onOpenReceiptScanner={onOpenReceiptScanner}
        onOpenPrintPoster={onOpenPrintPoster}
        onOpenSharePool={onOpenSharePool}
      />
    );

    expect(screen.getByText(/Breakroom Launch Guide/i)).toBeInTheDocument();
    expect(screen.getByText(/1 of 4 completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Stock your pantry shelves \(0 items\)/i)).toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: /Add Item/i });
    fireEvent.click(addBtn);
    expect(onOpenAddItem).toHaveBeenCalledTimes(1);

    const scanBtn = screen.getByRole('button', { name: /Scan Receipt/i });
    fireEvent.click(scanBtn);
    expect(onOpenReceiptScanner).toHaveBeenCalledTimes(1);

    const posterBtn = screen.getByRole('button', { name: /Print Poster/i });
    fireEvent.click(posterBtn);
    expect(onOpenPrintPoster).toHaveBeenCalledTimes(1);

    const shareBtn = screen.getByRole('button', { name: /Share Invite Link/i });
    fireEvent.click(shareBtn);
    expect(onOpenSharePool).toHaveBeenCalledTimes(1);
  });

  it('does not render for regular non-manager members', () => {
    const { container } = render(
      <OnboardingChecklist
        pool={mockPool}
        items={[]}
        isManager={false}
        onOpenAddItem={vi.fn()}
        onOpenReceiptScanner={vi.fn()}
        onOpenPrintPoster={vi.fn()}
        onOpenSharePool={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('dismisses and persists in localStorage when dismissed', () => {
    const { unmount } = render(
      <OnboardingChecklist
        pool={mockPool}
        items={[]}
        isManager={true}
        onOpenAddItem={vi.fn()}
        onOpenReceiptScanner={vi.fn()}
        onOpenPrintPoster={vi.fn()}
        onOpenSharePool={vi.fn()}
      />
    );

    const dismissBtn = screen.getByRole('button', { name: /Dismiss launch guide/i });
    fireEvent.click(dismissBtn);

    expect(localStorage.getItem('pantrypool_checklist_dismissed_pool_test_123')).toBe('true');

    unmount();

    const { container } = render(
      <OnboardingChecklist
        pool={mockPool}
        items={[]}
        isManager={true}
        onOpenAddItem={vi.fn()}
        onOpenReceiptScanner={vi.fn()}
        onOpenPrintPoster={vi.fn()}
        onOpenSharePool={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('completes the guide when the last step is taken and closes it out', () => {
    localStorage.setItem('pantrypool_poster_printed_pool_test_123', 'true');
    const onOpenSharePool = vi.fn();

    const mockItem = {
      id: 'item_1',
      poolId: 'pool_test_123',
      name: 'Cold Brew',
      category: 'Beverages' as const,
      costPerUnit: 2.5,
      costPerUnitCents: 250,
      stock: 12,
      minStock: 2,
      unitName: 'can',
      icon: 'Coffee',
    };

    render(
      <OnboardingChecklist
        pool={mockPool}
        items={[mockItem]}
        isManager={true}
        onOpenAddItem={vi.fn()}
        onOpenReceiptScanner={vi.fn()}
        onOpenPrintPoster={vi.fn()}
        onOpenSharePool={onOpenSharePool}
      />
    );

    // Initial state: steps 1, 2, 3 complete, step 4 not complete
    expect(screen.getByText(/3 of 4 completed \(75%\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/All launch steps complete! 🎉/i)).not.toBeInTheDocument();

    // Hit the last step
    const shareBtn = screen.getByRole('button', { name: /Share Invite Link/i });
    fireEvent.click(shareBtn);

    // Assert step 4 marked complete in localStorage and modal opened
    expect(onOpenSharePool).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pantrypool_invite_shared_pool_test_123')).toBe('true');

    // Guide now shows all 4 steps complete with celebration banner and complete button
    expect(screen.getByText(/All 4 steps complete! 🎉/i)).toBeInTheDocument();
    expect(screen.getByText(/All launch steps complete! 🎉/i)).toBeInTheDocument();
    const completeBtn = screen.getByRole('button', { name: /Complete & Close Guide/i });
    expect(completeBtn).toBeInTheDocument();

    // Click Complete & Close Guide
    fireEvent.click(completeBtn);

    // Assert guide is dismissed and persisted in localStorage
    expect(localStorage.getItem('pantrypool_checklist_dismissed_pool_test_123')).toBe('true');
    expect(screen.queryByText(/Breakroom Launch Guide/i)).not.toBeInTheDocument();
  });
});

describe('MemberWelcomeBanner Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders 3-step explanation for new non-manager members', () => {
    render(
      <MemberWelcomeBanner
        pool={mockPool}
        activeUser={mockActiveUser}
        isManager={false}
      />
    );

    expect(screen.getByText(/Welcome to Engineering Breakroom!/i)).toBeInTheDocument();
    expect(screen.getByText(/Grab & Tap/i)).toBeInTheDocument();
    expect(screen.getByText(/Running Tab/i)).toBeInTheDocument();
    expect(screen.getByText(/Square Up Anytime/i)).toBeInTheDocument();

    const gotItBtn = screen.getByRole('button', { name: /Got it, let's grab a drink!/i });
    fireEvent.click(gotItBtn);

    expect(localStorage.getItem('pantrypool_welcome_dismissed_pool_test_123_user_member')).toBe('true');
  });

  it('does not render for managers', () => {
    const { container } = render(
      <MemberWelcomeBanner
        pool={mockPool}
        activeUser={mockActiveUser}
        isManager={true}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('HelpGuideModal Component', () => {
  it('renders tabs and allows switching content', () => {
    const onClose = vi.fn();
    render(
      <HelpGuideModal
        isOpen={true}
        onClose={onClose}
        initialTab="members"
      />
    );

    expect(screen.getByText('PantryPool Quick Guide')).toBeInTheDocument();
    expect(screen.getByText(/How to log a drink or snack/i)).toBeInTheDocument();

    const managerTab = screen.getByRole('button', { name: /For Managers & Buyers/i });
    fireEvent.click(managerTab);
    expect(screen.getByText(/Restocking with Multimodal AI Receipt Scanning/i)).toBeInTheDocument();

    const faqTab = screen.getByRole('button', { name: /FAQ & Tips/i });
    fireEvent.click(faqTab);
    expect(screen.getByText(/What if I accidentally tap an item I didn't take\?/i)).toBeInTheDocument();

    const closeBtn = screen.getByText('Close Guide');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders Kiosk Mode guide section when kioskModeEnabled is true or omitted', () => {
    const { rerender } = render(
      <HelpGuideModal
        isOpen={true}
        onClose={vi.fn()}
        initialTab="managers"
        kioskModeEnabled={true}
      />
    );

    expect(screen.getByText(/Breakroom Tablet Kiosk Mode/i)).toBeInTheDocument();

    rerender(
      <HelpGuideModal
        isOpen={true}
        onClose={vi.fn()}
        initialTab="managers"
      />
    );
    expect(screen.getByText(/Breakroom Tablet Kiosk Mode/i)).toBeInTheDocument();
  });

  it('HIDES Kiosk Mode guide section when kioskModeEnabled is false', () => {
    render(
      <HelpGuideModal
        isOpen={true}
        onClose={vi.fn()}
        initialTab="managers"
        kioskModeEnabled={false}
      />
    );

    expect(screen.queryByText(/Breakroom Tablet Kiosk Mode/i)).not.toBeInTheDocument();
  });
});

describe('ItemCatalog Empty State Enhancement', () => {
  it('displays empty state with both Add Item and Scan Receipt buttons', () => {
    const onOpenAddItem = vi.fn();
    const onOpenReceiptScanner = vi.fn();

    render(
      <ItemCatalog
        items={[]}
        currency="$"
        activeUser={mockActiveUser}
        onConsumeItem={vi.fn()}
        onOpenEditItem={vi.fn()}
        onOpenQR={vi.fn()}
        onQuickRestock={vi.fn()}
        onOpenAddItem={onOpenAddItem}
        onOpenReceiptScanner={onOpenReceiptScanner}
        isManager={true}
      />
    );

    expect(screen.getByText(/No items match your filter/i)).toBeInTheDocument();
    expect(screen.getByText(/This pantry pool is empty/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Scan Grocery Receipt/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Scan Grocery Receipt/i }));
    expect(onOpenReceiptScanner).toHaveBeenCalledTimes(1);
  });
});
