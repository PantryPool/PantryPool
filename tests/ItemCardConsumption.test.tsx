import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemCard } from '../src/components/ItemCard';
import { PoolSummaryCard } from '../src/components/PoolSummaryCard';
import { Item, User, Pool } from '../src/types';

const mockUser: User = {
  id: 'u-alex',
  name: 'Alex Morgan',
  email: 'alex@example.com',
  avatar: '',
  role: 'member',
  balance: 20.0,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

const baseItem: Item = {
  id: 'item-coldbrew',
  poolId: 'pool-1',
  name: 'Nitro Cold Brew',
  category: 'Beverages',
  costPerUnit: 3.0,
  stock: 10,
  minStock: 2,
  unitName: 'bottle',
  icon: 'Coffee',
};

describe('ItemCard Consumption Behavior (src/components/ItemCard.tsx)', () => {
  it('passes unmodified item to onConsume so parent state controls the single decrement', () => {
    const onConsume = vi.fn();

    render(
      <ItemCard
        item={baseItem}
        currency="$"
        activeUser={mockUser}
        onConsume={onConsume}
        onOpenQR={vi.fn()}
        onQuickRestock={vi.fn()}
      />
    );

    expect(screen.getByText('10 bottles')).toBeInTheDocument();
    const grabBtn = screen.getByRole('button', { name: /grab 1 bottle/i });
    expect(grabBtn).toBeInTheDocument();

    fireEvent.click(grabBtn);

    // Verify onConsume was called with the actual item (stock: 10), NOT double-decremented (stock: 9)
    expect(onConsume).toHaveBeenCalledTimes(1);
    expect(onConsume).toHaveBeenCalledWith(baseItem);
    expect(onConsume.mock.calls[0][0].stock).toBe(10);
  });

  it('drops stock by exactly 1 when parent component updates item state without jumping', () => {
    const ParentComponent = () => {
      const [item, setItem] = useState<Item>(baseItem);
      const handleConsume = (targetItem: Item) => {
        setItem((prev) => ({ ...prev, stock: Math.max(0, prev.stock - 1) }));
      };

      return (
        <ItemCard
          item={item}
          currency="$"
          activeUser={mockUser}
          onConsume={handleConsume}
          onOpenQR={vi.fn()}
          onQuickRestock={vi.fn()}
        />
      );
    };

    render(<ParentComponent />);

    // Initially 10 bottles
    expect(screen.getByText('10 bottles')).toBeInTheDocument();
    expect(screen.queryByText('8 bottles')).not.toBeInTheDocument();
    expect(screen.queryByText('9 bottles')).not.toBeInTheDocument();

    // Click Grab 1 bottle
    const grabBtn = screen.getByRole('button', { name: /grab 1 bottle/i });
    fireEvent.click(grabBtn);

    // Stock should immediately and stably be 9 bottles (dropped by exactly 1, not 2)
    expect(screen.getByText('9 bottles')).toBeInTheDocument();
    expect(screen.queryByText('8 bottles')).not.toBeInTheDocument();
    expect(screen.queryByText('10 bottles')).not.toBeInTheDocument();
  });

  it('allows consuming the last remaining unit without falsely triggering out-of-stock pre-flight check', () => {
    const lastItem: Item = {
      ...baseItem,
      stock: 1,
    };
    const onConsume = vi.fn();

    render(
      <ItemCard
        item={lastItem}
        currency="$"
        activeUser={mockUser}
        onConsume={onConsume}
        onOpenQR={vi.fn()}
        onQuickRestock={vi.fn()}
      />
    );

    expect(screen.getByText('1 left (Low)')).toBeInTheDocument();
    const grabBtn = screen.getByRole('button', { name: /grab 1 bottle/i });
    fireEvent.click(grabBtn);

    expect(onConsume).toHaveBeenCalledTimes(1);
    // Verified stock passed to handler is 1, not 0
    expect(onConsume.mock.calls[0][0].stock).toBe(1);
  });

  it('updates product remaining count, wallet balance, and pool reserve simultaneously when consuming an item', () => {
    const mockPool: Pool = {
      id: 'pool-1',
      name: 'Office Pantry',
      description: 'Main breakroom pantry',
      category: 'Office',
      currency: '$',
      championId: 'u-champion',
      members: [
        {
          id: 'u-alex',
          name: 'Alex Morgan',
          email: 'alex@example.com',
          avatar: '',
          role: 'member',
          balance: 20.0,
          joinedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      code: 'TEST12',
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    const IntegratedWorkspace = () => {
      const [pool, setPool] = useState<Pool>(mockPool);
      const [item, setItem] = useState<Item>(baseItem);
      const [activeUser, setActiveUser] = useState<User>(mockUser);

      const handleConsume = (targetItem: Item) => {
        // Optimistic simultaneous updates:
        setItem((prev) => ({ ...prev, stock: prev.stock - 1 }));
        setPool((prevPool) => ({
          ...prevPool,
          members: prevPool.members.map((m) =>
            m.id === activeUser.id ? { ...m, balance: m.balance - targetItem.costPerUnit } : m
          ),
        }));
        setActiveUser((prev) => ({ ...prev, balance: prev.balance - targetItem.costPerUnit }));
      };

      const totalPoolFund = pool.members.reduce((acc, m) => acc + m.balance, 0);

      return (
        <div>
          <PoolSummaryCard
            pool={pool}
            activeUser={activeUser}
            items={[item]}
            transactions={[]}
            onOpenDeposit={vi.fn()}
            onOpenSettleUp={vi.fn()}
            onOpenReceiptScanner={vi.fn()}
            onOpenShoppingList={vi.fn()}
            onOpenAddItem={vi.fn()}
            onOpenManagePool={vi.fn()}
          />
          <ItemCard
            item={item}
            currency="$"
            activeUser={activeUser}
            onConsume={handleConsume}
            onOpenQR={vi.fn()}
            onQuickRestock={vi.fn()}
          />
        </div>
      );
    };

    render(<IntegratedWorkspace />);

    // Initial state before grab:
    expect(screen.getByText('10 bottles')).toBeInTheDocument();
    expect(screen.getByText('+$20.00')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();

    // Click Grab 1 bottle
    const grabBtn = screen.getByRole('button', { name: /grab 1 bottle/i });
    fireEvent.click(grabBtn);

    // Simultaneous updates in exact same render frame:
    // Remaining stock: 10 -> 9 bottles
    expect(screen.getByText('9 bottles')).toBeInTheDocument();
    // User wallet balance: 20.00 -> 17.00
    expect(screen.getByText('+$17.00')).toBeInTheDocument();
    // Total pool reserve: 20.00 -> 17.00
    expect(screen.getByText('$17.00')).toBeInTheDocument();
  });
});
