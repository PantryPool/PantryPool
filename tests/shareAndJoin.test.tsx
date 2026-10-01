import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { extractJoinCode } from '../src/lib/joinCode';
import { CreatePoolModal } from '../src/components/CreatePoolModal';
import { SharePoolModal } from '../src/components/SharePoolModal';
import { PoolSummaryCard } from '../src/components/PoolSummaryCard';
import { MembersBalanceList } from '../src/components/MembersBalanceList';
import { Pool, User } from '../src/types';
import { generatePoolJoinCode, generateUniquePoolJoinCode, resolvePoolCode as resolveServerPoolCode } from '../src/server/api/routes/pools';
import { resolvePoolCode as resolveClientPoolCode } from '../src/App';

const mockUser: User = {
  id: 'u1',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  balance: 20,
  role: 'champion',
  avatar: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Alex',
  joinedAt: '2026-01-01',
};

const mockPool: Pool = {
  id: 'pool_abc123',
  name: 'Engineering Breakroom',
  description: 'Snacks & Drinks',
  category: 'Office',
  currency: '$',
  code: 'PANTRY-ENG123',
  championId: 'u1',
  createdAt: '2026-01-01',
  initialReserveFund: 50,
  members: [
    {
      ...mockUser,
      role: 'champion',
      balance: 20,
    },
  ],
};

describe('Pool Sharing & Joining Engine', () => {
  describe('extractJoinCode Helper', () => {
    it('returns clean uppercase code from raw input', () => {
      expect(extractJoinCode('PANTRY-ABC123')).toBe('PANTRY-ABC123');
      expect(extractJoinCode('pantry-abc123')).toBe('PANTRY-ABC123');
      expect(extractJoinCode('  pntr4f  ')).toBe('PNTR4F');
    });

    it('extracts join code from query params in full URLs', () => {
      expect(extractJoinCode('https://pantrypool.com/?join=PANTRY-XYZ789')).toBe('PANTRY-XYZ789');
      expect(extractJoinCode('http://localhost:3000/?pool=PANTRY-123456')).toBe('PANTRY-123456');
      expect(extractJoinCode('pantrypool.com/?code=pantry-test1')).toBe('PANTRY-TEST1');
    });

    it('extracts join code from URL path segments', () => {
      expect(extractJoinCode('https://pantrypool.com/join/PANTRY-999AAA')).toBe('PANTRY-999AAA');
    });

    it('returns empty string on falsy input', () => {
      expect(extractJoinCode('')).toBe('');
    });
  });

  describe('SharePoolModal Component', () => {
    it('renders pool share modal with direct invite link, manual code, and tabs', () => {
      const handleClose = vi.fn();
      render(
        <SharePoolModal
          pool={mockPool}
          onClose={handleClose}
        />
      );

      expect(screen.getByText(/Share & Invite/i)).toBeInTheDocument();
      expect(screen.getByText(/Engineering Breakroom/i)).toBeInTheDocument();
      expect(screen.getByText('Direct Link & Code')).toBeInTheDocument();
      expect(screen.getByText('Social & Messaging')).toBeInTheDocument();
      expect(screen.getByText('PANTRY-ENG123')).toBeInTheDocument();
    });

    it('switches to Social & Messaging tab and displays channel options', () => {
      render(
        <SharePoolModal
          pool={mockPool}
          onClose={vi.fn()}
        />
      );

      fireEvent.click(screen.getByText('Social & Messaging'));
      expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      expect(screen.getByText('Slack / Teams')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Messages')).toBeInTheDocument();
    });

    it('invokes onOpenPoster when clicking breakroom poster button', () => {
      const handleOpenPoster = vi.fn();
      render(
        <SharePoolModal
          pool={mockPool}
          onClose={vi.fn()}
          onOpenPoster={handleOpenPoster}
        />
      );

      const posterBtn = screen.getByText(/Printable Breakroom Poster & QR Stand/i);
      fireEvent.click(posterBtn);
      expect(handleOpenPoster).toHaveBeenCalledTimes(1);
    });
  });

  describe('CreatePoolModal Join Tab', () => {
    it('allows joining with long codes and full URLs without 6-char truncation', () => {
      const handleJoin = vi.fn();
      render(
        <CreatePoolModal
          activeUser={mockUser}
          onClose={vi.fn()}
          onCreatePool={vi.fn()}
          onJoinPool={handleJoin}
        />
      );

      // Switch to Join tab
      fireEvent.click(screen.getByText('Join with Code'));

      const input = screen.getByPlaceholderText(/e\.g\. PANTRY-4K9L2P or https:\/\/pantrypool\.com/i);
      expect(input).toBeInTheDocument();

      // Paste a full invite URL with 13+ characters
      fireEvent.change(input, { target: { value: 'https://pantrypool.com/?join=PANTRY-ROOM99' } });
      fireEvent.click(screen.getByText('Join Team Pool'));

      expect(handleJoin).toHaveBeenCalledWith('PANTRY-ROOM99');
    });

    it('defaults initial reserve to 0 when creating a new pool', () => {
      const handleCreate = vi.fn();
      render(
        <CreatePoolModal
          activeUser={mockUser}
          onClose={vi.fn()}
          onCreatePool={handleCreate}
          onJoinPool={vi.fn()}
        />
      );

      const poolNameInput = screen.getByPlaceholderText(/e\.g\. 5th Floor Soda & Cold Brew Pool/i);
      expect(poolNameInput).toBeInTheDocument();
      fireEvent.change(poolNameInput, { target: { value: 'Zero Reserve Pantry' } });

      const reserveInput = screen.getByDisplayValue('0');
      expect(reserveInput).toBeInTheDocument();

      fireEvent.click(screen.getByText('Initialize New Pool'));
      expect(handleCreate).toHaveBeenCalledWith(
        'Zero Reserve Pantry',
        expect.any(String),
        'Office',
        '$',
        0,
        null
      );
    });
  });

  describe('PoolSummaryCard Share CTA', () => {
    it('triggers onOpenSharePool when Invite & Share is clicked', () => {
      const handleShare = vi.fn();
      render(
        <PoolSummaryCard
          pool={mockPool}
          activeUser={mockUser}
          items={[]}
          transactions={[]}
          onOpenDeposit={vi.fn()}
          onOpenReceiptScanner={vi.fn()}
          onOpenShoppingList={vi.fn()}
          onOpenAddItem={vi.fn()}
          onOpenManagePool={vi.fn()}
          onOpenSharePool={handleShare}
        />
      );

      const shareBtn = screen.getByText('Invite & Share');
      fireEvent.click(shareBtn);
      expect(handleShare).toHaveBeenCalledTimes(1);
    });

    it('HIDES Pool Settings gear button when user is a regular member', () => {
      const mockMember: User = {
        id: 'u_regular',
        name: 'Member Person',
        email: 'member@test.com',
        avatar: '',
        role: 'member',
        balance: 0,
        joinedAt: '2026-01-01',
      };
      render(
        <PoolSummaryCard
          pool={mockPool}
          activeUser={mockMember}
          items={[]}
          transactions={[]}
          onOpenDeposit={vi.fn()}
          onOpenReceiptScanner={vi.fn()}
          onOpenShoppingList={vi.fn()}
          onOpenAddItem={vi.fn()}
          onOpenManagePool={vi.fn()}
          isManager={false}
        />
      );

      expect(screen.queryByTitle('Pool Settings')).not.toBeInTheDocument();
    });

    it('RENDERS Pool Settings gear button when user is a pool manager', () => {
      render(
        <PoolSummaryCard
          pool={mockPool}
          activeUser={mockUser}
          items={[]}
          transactions={[]}
          onOpenDeposit={vi.fn()}
          onOpenReceiptScanner={vi.fn()}
          onOpenShoppingList={vi.fn()}
          onOpenAddItem={vi.fn()}
          onOpenManagePool={vi.fn()}
          isManager={true}
        />
      );

      expect(screen.getByTitle('Pool Settings')).toBeInTheDocument();
    });
  });

  describe('MembersBalanceList Share CTA', () => {
    it('triggers onOpenSharePool when Invite & Share Pool is clicked', () => {
      const handleShare = vi.fn();
      render(
        <MembersBalanceList
          pool={mockPool}
          activeUser={mockUser}
          onOpenDepositForUser={vi.fn()}
          onOpenSharePool={handleShare}
        />
      );

      const shareBtn = screen.getByText('Invite & Share Pool');
      fireEvent.click(shareBtn);
      expect(handleShare).toHaveBeenCalledTimes(1);
    });
  });

  describe('Short Pool Join Code Optimization', () => {
    it('generates clean 6-character pool codes with PP+4 pattern', () => {
      for (let i = 0; i < 20; i++) {
        const code = generatePoolJoinCode();
        expect(code).toHaveLength(6);
        expect(code).toMatch(/^PP[2-9A-Z]{4}$/);
      }
    });

    it('retries on code collision and returns unique code', async () => {
      let callCount = 0;
      const mockStorage = {
        getPoolByCode: vi.fn(async (_c: string) => {
          callCount++;
          // Simulate first 2 attempts colliding with existing pools
          if (callCount <= 2) return { id: 'pool_collided' };
          return null;
        })
      };

      const code = await generateUniquePoolJoinCode(mockStorage);
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^PP[2-9A-Z]{4}$/);
      expect(callCount).toBe(3);
    });

    it('resolves short 6-char code instead of 41-char UUID when pool only has a UUID id', () => {
      const longUuidPool = {
        id: 'pool_01234567-89ab-cdef-0123-456789abcdef',
        name: 'Tech Pantry'
      };

      const serverCode = resolveServerPoolCode(longUuidPool);
      expect(serverCode).toHaveLength(6);
      expect(serverCode).toBe('012345');

      const clientCode = resolveClientPoolCode(longUuidPool);
      expect(clientCode).toHaveLength(6);
      expect(clientCode).toBe('012345');
    });

    it('SharePoolModal displays short code and not a 41-character UUID when pool.code is missing', () => {
      const poolWithoutCode: any = {
        id: 'pool_a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        name: 'Short Code Pool',
        description: 'Testing short codes',
        category: 'Office',
        currency: '$',
        championId: 'u1',
        createdAt: '2026-01-01',
        members: []
      };

      render(
        <SharePoolModal
          pool={poolWithoutCode}
          onClose={vi.fn()}
        />
      );

      // The modal should display the 6-character derived short code A1B2C3, NOT the 41-char UUID
      expect(screen.getByText('A1B2C3')).toBeInTheDocument();
      expect(screen.queryByText('pool_a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d')).not.toBeInTheDocument();
    });
  });
});
