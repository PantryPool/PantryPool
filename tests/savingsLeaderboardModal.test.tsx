import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavingsLeaderboardModal } from '../src/components/SavingsLeaderboardModal';
import { Pool, User } from '../src/types';
import * as api from '../src/lib/api';

vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api')>('../src/lib/api');
  return {
    ...actual,
    fetchPoolSavingsSummary: vi.fn().mockResolvedValue({
      totalSavingsCents: 0,
      savingsEnabled: true,
      metroTier: 'baseline',
      topItems: [],
    }),
    fetchGlobalSavingsLeaderboard: vi.fn().mockResolvedValue({
      entries: [],
      networkTotalSavingsCents: 0,
    }),
  };
});

const mockUser: User = {
  id: 'u1',
  name: 'Alex Tester',
  email: 'alex@example.com',
  balance: 25,
  role: 'member',
  avatar: '',
  joinedAt: '2026-01-01',
};

const mockPool: Pool = {
  id: 'pool1',
  name: 'Engineering Lounge',
  description: 'Snacks & drinks',
  category: 'Office',
  currency: '$',
  code: 'ENG123',
  championId: 'u1',
  createdAt: '2026-01-01',
  members: [],
};

describe('SavingsLeaderboardModal Component - Kiosk Feature Flag Visibility', () => {
  it('renders "or kiosk" in empty state when kioskModeEnabled is true or omitted', async () => {
    const { rerender } = render(
      <SavingsLeaderboardModal
        pool={mockPool}
        activeUser={mockUser}
        onClose={vi.fn()}
        kioskModeEnabled={true}
      />
    );

    expect(await screen.findByText(/Grab items from the catalog or kiosk/i)).toBeInTheDocument();

    rerender(
      <SavingsLeaderboardModal
        pool={mockPool}
        activeUser={mockUser}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText(/Grab items from the catalog or kiosk/i)).toBeInTheDocument();
  });

  it('HIDES "or kiosk" in empty state when kioskModeEnabled is false', async () => {
    render(
      <SavingsLeaderboardModal
        pool={mockPool}
        activeUser={mockUser}
        onClose={vi.fn()}
        kioskModeEnabled={false}
      />
    );

    expect(await screen.findByText(/Grab items from the catalog to watch your collective savings tally grow!/i)).toBeInTheDocument();
    expect(screen.queryByText(/or kiosk/i)).not.toBeInTheDocument();
  });
});
