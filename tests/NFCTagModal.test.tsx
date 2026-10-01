import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NFCTagModal } from '../src/components/NFCTagModal';
import { Item, Pool, User } from '../src/types';

describe('NFCTagModal Component', () => {
  const mockClose = vi.fn();
  const mockConsume = vi.fn();

  const mockPool: Pool = {
    id: 'pool-tech-hq',
    name: 'Tech Haven Breakroom',
    description: 'Breakroom pantry pool',
    code: 'HAVEN123',
    currency: '$',
    createdAt: new Date().toISOString(),
    championId: 'user-admin',
    category: 'Office',
    members: [],
  };

  const mockItems: Item[] = [
    {
      id: 'item-coldbrew',
      poolId: 'pool-tech-hq',
      name: 'Nitro Cold Brew Espresso',
      category: 'Beverages',
      costPerUnit: 3.5,
      stock: 12,
      minStock: 4,
      unitName: 'can',
      icon: 'coffee',
    },
    {
      id: 'item-protein',
      poolId: 'pool-tech-hq',
      name: 'Peanut Butter Protein Bar',
      category: 'Snacks',
      costPerUnit: 2.0,
      stock: 8,
      minStock: 2,
      unitName: 'bar',
      icon: 'cookie',
    }
  ];

  const mockUser: User = {
    id: 'u1',
    name: 'Donald Fellow',
    email: 'donald@example.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256',
    role: 'champion',
    balance: 50,
    joinedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders modal header, tabs, and default fridge door payload', () => {
    render(
      <NFCTagModal
        isOpen={true}
        onClose={mockClose}
        pool={mockPool}
        items={mockItems}
        activeUser={mockUser}
        onConsumeItem={mockConsume}
      />
    );

    expect(screen.getByText(/NFC Tag Automation & Setup Hub/i)).toBeInTheDocument();
    expect(screen.getByText(/Tag Payload Generator/i)).toBeInTheDocument();
    expect(screen.getByText(/NFC Tools Step-by-Step Guide/i)).toBeInTheDocument();
    expect(screen.getByText(/Direct In-Browser NFC/i)).toBeInTheDocument();
    expect(screen.getByText(/Fridge Door Badge/i)).toBeInTheDocument();
  });

  it('switches between Fridge Door, Kiosk Mode, and Item Micro-Tag payloads', () => {
    render(
      <NFCTagModal
        isOpen={true}
        onClose={mockClose}
        pool={mockPool}
        items={mockItems}
        activeUser={mockUser}
        onConsumeItem={mockConsume}
      />
    );

    // Switch to Kiosk
    const kioskBtn = screen.getByText(/Breakroom Kiosk Station/i);
    fireEvent.click(kioskBtn);
    const inputKiosk = screen.getByDisplayValue(/kiosk=1/i);
    expect(inputKiosk).toBeInTheDocument();

    // Switch to Item Micro-Tag
    const itemTagBtn = screen.getByText(/Shelf Item Micro-Tag/i);
    fireEvent.click(itemTagBtn);
    expect(screen.getByText(/Select Shelf Consumable/i)).toBeInTheDocument();
    const inputItem = screen.getByDisplayValue(/item=item-coldbrew/i);
    expect(inputItem).toBeInTheDocument();
  });

  it('HIDES Breakroom Kiosk Station when kioskModeEnabled is false', () => {
    render(
      <NFCTagModal
        isOpen={true}
        onClose={mockClose}
        pool={mockPool}
        items={mockItems}
        activeUser={mockUser}
        onConsumeItem={mockConsume}
        kioskModeEnabled={false}
      />
    );

    expect(screen.queryByText(/Breakroom Kiosk Station/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Fridge Door Badge/i)).toBeInTheDocument();
    expect(screen.getByText(/Shelf Item Micro-Tag/i)).toBeInTheDocument();
  });

  it('switches to NFC Tools Step-by-Step Guide tab', () => {
    render(
      <NFCTagModal
        isOpen={true}
        onClose={mockClose}
        pool={mockPool}
        items={mockItems}
        activeUser={mockUser}
        onConsumeItem={mockConsume}
      />
    );

    const guideTabBtn = screen.getByText(/NFC Tools Step-by-Step Guide/i);
    fireEvent.click(guideTabBtn);

    expect(screen.getByText(/Program Tags with the Free "NFC Tools" App/i)).toBeInTheDocument();
    expect(screen.getByText(/Copy Your Desired Pantry URL/i)).toBeInTheDocument();
    expect(screen.getByText(/Open NFC Tools & Tap "Write"/i)).toBeInTheDocument();
    expect(screen.getByText(/Tap "Write \/ \[X\] Bytes" & Touch the Tag/i)).toBeInTheDocument();
  });

  it('switches to Direct In-Browser NFC (Web NFC) tab', () => {
    render(
      <NFCTagModal
        isOpen={true}
        onClose={mockClose}
        pool={mockPool}
        items={mockItems}
        activeUser={mockUser}
        onConsumeItem={mockConsume}
      />
    );

    const webNfcTabBtn = screen.getByText(/Direct In-Browser NFC/i);
    fireEvent.click(webNfcTabBtn);

    expect(screen.getByText(/In-Browser Web NFC Programming/i)).toBeInTheDocument();
    expect(screen.getByText(/1-Click Write Active Tag/i)).toBeInTheDocument();
  });

  it('calls onClose when Done or close button is clicked', () => {
    render(
      <NFCTagModal
        isOpen={true}
        onClose={mockClose}
        pool={mockPool}
        items={mockItems}
        activeUser={mockUser}
        onConsumeItem={mockConsume}
      />
    );

    const doneBtn = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(doneBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
