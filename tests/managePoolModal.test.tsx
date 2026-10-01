import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManagePoolModal } from '../src/components/ManagePoolModal';
import { Pool, User } from '../src/types';

const mockUser: User = {
  id: 'u1',
  name: 'Admin User',
  email: 'admin@pantrypool.com',
  balance: 50,
  role: 'admin',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100',
  joinedAt: '2026-01-01',
};

const mockPool: Pool & { kioskPin?: string } = {
  id: 'pool1',
  name: 'Breakroom Pool',
  description: 'Main breakroom pantry',
  category: 'Office',
  currency: '$',
  code: 'BREAK123',
  championId: 'u1',
  createdAt: '2026-01-01',
  members: [],
  kioskPin: '4321',
};

describe('ManagePoolModal Component - Kiosk Feature Flag Visibility', () => {
  it('renders Kiosk PIN field when kioskModeEnabled is true', () => {
    render(
      <ManagePoolModal
        pool={mockPool}
        activeUser={mockUser}
        onClose={vi.fn()}
        onUpdatePool={vi.fn()}
        kioskModeEnabled={true}
      />
    );

    expect(screen.getByText(/Breakroom Kiosk Exit PIN/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('1234')).toBeInTheDocument();
  });

  it('renders Kiosk PIN field by default when kioskModeEnabled is omitted', () => {
    render(
      <ManagePoolModal
        pool={mockPool}
        activeUser={mockUser}
        onClose={vi.fn()}
        onUpdatePool={vi.fn()}
      />
    );

    expect(screen.getByText(/Breakroom Kiosk Exit PIN/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('1234')).toBeInTheDocument();
  });

  it('HIDES Kiosk PIN field when kioskModeEnabled is false', () => {
    render(
      <ManagePoolModal
        pool={mockPool}
        activeUser={mockUser}
        onClose={vi.fn()}
        onUpdatePool={vi.fn()}
        kioskModeEnabled={false}
      />
    );

    expect(screen.queryByText(/Breakroom Kiosk Exit PIN/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('1234')).not.toBeInTheDocument();
  });

  it('renders editable shareable join code field with current code and warning notice', () => {
    const handleUpdate = vi.fn();
    render(
      <ManagePoolModal
        pool={mockPool}
        activeUser={mockUser}
        onClose={vi.fn()}
        onUpdatePool={handleUpdate}
      />
    );

    expect(screen.getByText(/Shareable Join Code/i)).toBeInTheDocument();
    const codeInput = screen.getByDisplayValue('BREAK123');
    expect(codeInput).toBeInTheDocument();
    expect(screen.getByText(/Changing this code will invalidate previously printed physical QR posters/i)).toBeInTheDocument();
  });

  it('falls back to pool.id if code is empty and allows custom code update', () => {
    const handleUpdate = vi.fn();
    const poolWithoutCode: any = { ...mockPool, code: undefined, qrCodeKey: undefined };
    render(
      <ManagePoolModal
        pool={poolWithoutCode}
        activeUser={mockUser}
        onClose={vi.fn()}
        onUpdatePool={handleUpdate}
      />
    );

    const codeInput = screen.getByDisplayValue('pool1');
    expect(codeInput).toBeInTheDocument();
  });
});

describe('ManagePoolModal Component - Delete Pool Manager Role Enforcement', () => {
  const mockMemberUser: User = {
    id: 'u_member',
    name: 'Standard Member',
    email: 'member@example.com',
    balance: 0,
    role: 'member',
    avatar: '',
    joinedAt: '2026-02-01',
  };

  it('DOES NOT RENDER ManagePoolModal when activeUser is a regular member', () => {
    const handleDelete = vi.fn();
    render(
      <ManagePoolModal
        pool={mockPool}
        activeUser={mockMemberUser}
        onClose={vi.fn()}
        onUpdatePool={vi.fn()}
        onDeletePool={handleDelete}
      />
    );

    expect(screen.queryByText(/Pool Settings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Shareable Join Code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Delete Pool/i)).not.toBeInTheDocument();
  });

  it('DOES NOT RENDER ManagePoolModal when isManager is explicitly false', () => {
    const handleDelete = vi.fn();
    render(
      <ManagePoolModal
        pool={mockPool}
        activeUser={mockUser}
        isManager={false}
        onClose={vi.fn()}
        onUpdatePool={vi.fn()}
        onDeletePool={handleDelete}
      />
    );

    expect(screen.queryByText(/Pool Settings/i)).not.toBeInTheDocument();
  });

  it('RENDERS Delete Pool button when activeUser is the pool champion / manager', () => {
    const handleDelete = vi.fn();
    render(
      <ManagePoolModal
        pool={mockPool}
        activeUser={mockUser}
        onClose={vi.fn()}
        onUpdatePool={vi.fn()}
        onDeletePool={handleDelete}
      />
    );

    expect(screen.getByText('Delete Pool')).toBeInTheDocument();
  });

  it('requires two clicks to confirm deletion and then calls onDeletePool', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const handleDelete = vi.fn();
    const handleClose = vi.fn();

    render(
      <ManagePoolModal
        pool={mockPool}
        activeUser={mockUser}
        onClose={handleClose}
        onUpdatePool={vi.fn()}
        onDeletePool={handleDelete}
      />
    );

    const deleteBtn = screen.getByText('Delete Pool');
    fireEvent.click(deleteBtn);

    // After first click, should prompt with warning confirmation
    expect(screen.getByText(/⚠️ Click again to permanently delete this pool/i)).toBeInTheDocument();
    expect(handleDelete).not.toHaveBeenCalled();

    // After second click, should execute deletion and close
    fireEvent.click(screen.getByText(/⚠️ Click again to permanently delete this pool/i));
    expect(handleDelete).toHaveBeenCalledWith('pool1');
    expect(handleClose).toHaveBeenCalled();
  });
});
