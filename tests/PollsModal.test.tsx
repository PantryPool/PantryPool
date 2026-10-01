import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PollsModal } from '../src/components/PollsModal';
import { Pool, PollItem, User } from '../src/types';

describe('PollsModal Component (src/components/PollsModal.tsx)', () => {
  const mockPool: Pool = {
    id: 'pool_test',
    name: 'Marketing Kitchen',
    category: 'Office',
    description: 'Shared kitchen for marketing team',
    code: 'MK123',
    championId: 'u_1',
    createdAt: '2026-01-01',
    currency: '$',
    initialReserveFund: 100,
    members: [
      { id: 'u_1', name: 'Alice Member', role: 'champion', balance: 50, email: 'alice@example.com', avatar: '', joinedAt: '2026-01-01' },
      { id: 'u_2', name: 'Bob Member', role: 'contributor', balance: 25, email: 'bob@example.com', avatar: '', joinedAt: '2026-01-01' },
    ],
  };

  const mockUser: User = {
    id: 'u_1',
    name: 'Alice Member',
    role: 'champion',
    balance: 50,
    email: 'alice@example.com',
    avatar: '',
    joinedAt: '2026-01-01',
  };

  const mockPolls: PollItem[] = [
    {
      id: 'poll_1',
      poolId: 'pool_test',
      title: 'Which coffee beans next?',
      options: [
        { id: 'opt_1', name: 'Ethiopian Yirgacheffe', votes: ['u_2'] },
        { id: 'opt_2', name: 'Colombian Supremo', votes: [] },
      ],
      status: 'active',
      createdBy: 'Alice Member',
      createdAt: new Date().toISOString(),
      allowWriteIn: true,
    },
  ];

  it('renders poll question and options correctly', () => {
    render(
      <PollsModal
        pool={mockPool}
        polls={mockPolls}
        activeUser={mockUser}
        onClose={vi.fn()}
        onVote={vi.fn()}
        onCreatePoll={vi.fn()}
      />
    );

    expect(screen.getByText(/Consumables Team Polls/i)).toBeInTheDocument();
    expect(screen.getByText(/Which coffee beans next\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Ethiopian Yirgacheffe/i)).toBeInTheDocument();
    expect(screen.getByText(/Colombian Supremo/i)).toBeInTheDocument();
    expect(screen.getByText(/Suggest write-in option.../i)).toBeInTheDocument();
  });

  it('allows voting on an existing option', () => {
    const onVote = vi.fn();
    render(
      <PollsModal
        pool={mockPool}
        polls={mockPolls}
        activeUser={mockUser}
        onClose={vi.fn()}
        onVote={onVote}
        onCreatePoll={vi.fn()}
      />
    );

    const optionBtn = screen.getByRole('button', { name: /Colombian Supremo/i });
    fireEvent.click(optionBtn);

    expect(onVote).toHaveBeenCalledWith('poll_1', 'opt_2', 'u_1');
  });

  it('opens write-in form and submits a write-in choice', () => {
    const onVote = vi.fn();
    render(
      <PollsModal
        pool={mockPool}
        polls={mockPolls}
        activeUser={mockUser}
        onClose={vi.fn()}
        onVote={onVote}
        onCreatePoll={vi.fn()}
      />
    );

    const suggestBtn = screen.getByText(/Suggest write-in option.../i);
    fireEvent.click(suggestBtn);

    const writeInInput = screen.getByPlaceholderText(/Type your custom option.../i);
    fireEvent.change(writeInInput, { target: { value: 'Guatemalan Dark Roast' } });

    const voteBtn = screen.getByRole('button', { name: /^Vote$/i });
    fireEvent.click(voteBtn);

    expect(onVote).toHaveBeenCalledWith('poll_1', undefined, 'u_1', 'Guatemalan Dark Roast');
  });

  it('creates a new poll with options and write-in toggle', () => {
    const onCreatePoll = vi.fn();
    render(
      <PollsModal
        pool={mockPool}
        polls={mockPolls}
        activeUser={mockUser}
        onClose={vi.fn()}
        onVote={vi.fn()}
        onCreatePoll={onCreatePoll}
      />
    );

    const createBtn = screen.getByRole('button', { name: /Create New Item Poll/i });
    fireEvent.click(createBtn);

    expect(screen.getByText(/Create New Team Poll/i)).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText(/Poll Question/i);
    fireEvent.change(titleInput, { target: { value: 'Best sparkling water?' } });

    const opt1Input = screen.getByPlaceholderText(/Option 1/i);
    fireEvent.change(opt1Input, { target: { value: 'LaCroix Limoncello' } });

    const opt2Input = screen.getByPlaceholderText(/Option 2/i);
    fireEvent.change(opt2Input, { target: { value: 'Spindrift Grapefruit' } });

    const launchBtn = screen.getByRole('button', { name: /Launch Poll/i });
    fireEvent.click(launchBtn);

    expect(onCreatePoll).toHaveBeenCalledWith(
      'Best sparkling water?',
      ['LaCroix Limoncello', 'Spindrift Grapefruit'],
      true
    );
  });

  it('toggles poll lock/close status without throwing', () => {
    const onUpdatePoll = vi.fn();
    render(
      <PollsModal
        pool={mockPool}
        polls={mockPolls}
        activeUser={mockUser}
        onClose={vi.fn()}
        onVote={vi.fn()}
        onCreatePoll={vi.fn()}
        onUpdatePoll={onUpdatePoll}
      />
    );

    const lockBtn = screen.getByTitle('Close poll');
    fireEvent.click(lockBtn);

    expect(onUpdatePoll).toHaveBeenCalledWith('poll_1', { status: 'closed' });
  });

  it('renders pool name without Scoped to terminology', () => {
    render(
      <PollsModal
        pool={mockPool}
        polls={mockPolls}
        activeUser={mockUser}
        onClose={vi.fn()}
        onVote={vi.fn()}
        onCreatePoll={vi.fn()}
      />
    );

    expect(screen.getByText('Marketing Kitchen')).toBeInTheDocument();
    expect(screen.queryByText(/Scoped to/i)).toBeNull();
  });

  it('allows reopening a closed poll', () => {
    const onUpdatePoll = vi.fn();
    const closedPoll: PollItem = {
      ...mockPolls[0],
      id: 'poll_closed_1',
      status: 'closed',
    };

    render(
      <PollsModal
        pool={mockPool}
        polls={[closedPoll]}
        activeUser={mockUser}
        onClose={vi.fn()}
        onVote={vi.fn()}
        onCreatePoll={vi.fn()}
        onUpdatePoll={onUpdatePoll}
      />
    );

    const unlockBtn = screen.getByTitle('Reopen poll');
    fireEvent.click(unlockBtn);

    expect(onUpdatePoll).toHaveBeenCalledWith('poll_closed_1', { status: 'active' });
  });

  it('safely renders even if poll.options is undefined or malformed', () => {
    const malformedPoll: any = {
      id: 'poll_bad',
      poolId: 'pool_test',
      title: 'Poll with missing options',
      status: 'active',
      createdBy: 'Alice Member',
      createdAt: new Date().toISOString(),
    };

    expect(() => {
      render(
        <PollsModal
          pool={mockPool}
          polls={[malformedPoll]}
          activeUser={mockUser}
          onClose={vi.fn()}
          onVote={vi.fn()}
          onCreatePoll={vi.fn()}
        />
      );
    }).not.toThrow();

    expect(screen.getByText(/Poll with missing options/i)).toBeInTheDocument();
  });

  it('displays selected option with checkmark and active style for active user', () => {
    const pollWithVote: PollItem = {
      id: 'poll_voted',
      poolId: 'pool_test',
      title: 'Snack of the week?',
      options: [
        { id: 'opt_1', name: 'Almonds', votes: ['u_1'] },
        { id: 'opt_2', name: 'Pretzels', votes: [] },
      ],
      status: 'active',
      createdBy: 'Alice Member',
      createdAt: new Date().toISOString(),
      allowWriteIn: true,
    };

    render(
      <PollsModal
        pool={mockPool}
        polls={[pollWithVote]}
        activeUser={mockUser}
        onClose={vi.fn()}
        onVote={vi.fn()}
        onCreatePoll={vi.fn()}
      />
    );

    const almondsBtn = screen.getByRole('button', { name: /Almonds/i });
    expect(almondsBtn.className).toContain('border-[#E8694A]');
  });

  it('parses serialized JSON string options and displays selection properly', () => {
    const pollWithStringOpts: any = {
      id: 'poll_str',
      poolId: 'pool_test',
      title: 'Beverage choice?',
      options: JSON.stringify([
        { id: 'opt_a', name: 'Kombucha', votes: ['u_1'] },
        { id: 'opt_b', name: 'Matcha', votes: [] },
      ]),
      status: 'active',
      createdBy: 'Alice Member',
      createdAt: new Date().toISOString(),
      allowWriteIn: true,
    };

    render(
      <PollsModal
        pool={mockPool}
        polls={[pollWithStringOpts]}
        activeUser={mockUser}
        onClose={vi.fn()}
        onVote={vi.fn()}
        onCreatePoll={vi.fn()}
      />
    );

    expect(screen.getByText(/Kombucha/i)).toBeInTheDocument();
    expect(screen.getByText(/Matcha/i)).toBeInTheDocument();
    const kombuchaBtn = screen.getByRole('button', { name: /Kombucha/i });
    expect(kombuchaBtn.className).toContain('border-[#E8694A]');
  });
});
