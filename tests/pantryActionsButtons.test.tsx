import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Header } from '../src/components/Header';
import { MobileBottomNav } from '../src/components/MobileBottomNav';
import { User, Pool } from '../src/types';
import { AuthUser } from '../src/lib/api';

describe('Pantry Actions Menu & Navigation Buttons', () => {
  const mockUser: User = {
    id: 'user_1',
    name: 'Alex Johnson',
    email: 'alex@example.com',
    avatar: '',
    role: 'champion',
    balance: 25.0,
    joinedAt: new Date().toISOString(),
  };

  const mockAuthUser: AuthUser = {
    id: 'user_1',
    name: 'Alex Johnson',
    email: 'alex@example.com',
    avatarUrl: '',
    systemRole: 'admin',
  };

  const mockPool: Pool = {
    id: 'pool_test_1',
    name: 'Kitchen Pantry',
    category: 'Office',
    currency: '$',
    code: 'PP1234',
    description: 'Test pantry pool',
    championId: 'user_1',
    createdAt: new Date().toISOString(),
    members: [mockUser],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header - Workspace Actions Dropdown', () => {


    it('triggers Kiosk, Receipt Scanner, Poster, and Help Guide from workspace actions menu', () => {
      const mockOpenKiosk = vi.fn();
      const mockOpenReceipt = vi.fn();
      const mockOpenPoster = vi.fn();
      const mockOpenHelp = vi.fn();

      render(
        <Header
          pools={[mockPool]}
          activePool={mockPool}
          activeUser={mockUser}
          authUser={mockAuthUser}
          onOpenAuthModal={vi.fn()}
          onLogout={vi.fn()}
          onSelectPool={vi.fn()}
          onSelectUser={vi.fn()}
          onOpenCreatePool={vi.fn()}
          onOpenKiosk={mockOpenKiosk}
          onOpenReceiptScanner={mockOpenReceipt}
          onOpenQRScanner={vi.fn()}
          onOpenPoster={mockOpenPoster}
          soundEnabled={true}
          onToggleSound={vi.fn()}
          onOpenHelpGuide={mockOpenHelp}
        />
      );

      const wrenchButton = screen.getByTitle('More Tools & Settings');

      // Test Kiosk Mode
      fireEvent.click(wrenchButton);
      fireEvent.click(screen.getByText('Kiosk Mode'));
      expect(mockOpenKiosk).toHaveBeenCalledTimes(1);

      // Test AI Receipt Scanner
      fireEvent.click(wrenchButton);
      fireEvent.click(screen.getByText('AI Receipt Scanner'));
      expect(mockOpenReceipt).toHaveBeenCalledTimes(1);

      // Test Print Fridge Poster
      fireEvent.click(wrenchButton);
      fireEvent.click(screen.getByText('Print Fridge Poster'));
      expect(mockOpenPoster).toHaveBeenCalledTimes(1);

      // Test Quick Guide & Help
      fireEvent.click(wrenchButton);
      fireEvent.click(screen.getByText('Quick Guide & Help'));
      expect(mockOpenHelp).toHaveBeenCalledTimes(1);
    });
  });

  describe('MobileBottomNav - More Action Sheet', () => {
    it('opens action sheet drawer and clicks Fridge Poster button calling onOpenPoster', () => {
      const mockOpenPoster = vi.fn();

      render(
        <MobileBottomNav
          activeTab="catalog"
          onTabChange={vi.fn()}
          onOpenQRScanner={vi.fn()}
          onOpenShoppingList={vi.fn()}
          shoppingListCount={0}
          onOpenPoster={mockOpenPoster}
        />
      );

      // More button to open mobile drawer
      const moreButton = screen.getByText('More');
      fireEvent.click(moreButton);

      // Find "Fridge Poster" in Hardware & Tools section
      const posterButton = screen.getByText('Fridge Poster');
      expect(posterButton).toBeInTheDocument();

      fireEvent.click(posterButton);
      expect(mockOpenPoster).toHaveBeenCalledTimes(1);
    });
  });
});
