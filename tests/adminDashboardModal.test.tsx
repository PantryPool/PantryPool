import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminDashboardModal } from '../src/components/AdminDashboardModal';

vi.mock('../src/lib/api', () => ({
  getAuthToken: vi.fn(() => 'mock-token'),
  isOrganizationsEnabled: true,
}));

describe('AdminDashboardModal - Tablet & iPad Portrait Responsiveness & Editability', () => {
  const mockAuthUser = {
    id: 'u_super',
    name: 'Super Admin',
    email: 'admin@pantrypool.com',
    systemRole: 'superadmin' as const
  };

  beforeEach(() => {
    vi.clearAllMocks();

    global.fetch = vi.fn((url: any) => {
      const u = typeof url === 'string' ? url : url.url;
      if (u.includes('/api/admin/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, stats: { totalUsers: 5, totalOrganizations: 2, totalPools: 3 } })
        } as any);
      }
      if (u.includes('/api/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ok', latencyMs: 12, checks: { database: { latencyMs: 10 } } })
        } as any);
      }
      if (u.includes('/api/admin/users')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            users: [
              { id: 'u1', name: 'Alice Smith', email: 'alice@example.com', systemRole: 'user', poolCount: 2, createdAt: '2026-01-01' }
            ]
          })
        } as any);
      }
      if (u.includes('/api/admin/organizations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            organizations: [
              { id: 'org1', name: 'Acme Corp', ownerName: 'Alice Smith', ownerEmail: 'alice@example.com', poolsCount: 2, tier: 'community' }
            ]
          })
        } as any);
      }
      if (u.includes('/api/admin/pools')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            pools: [
              { id: 'p1', name: 'Design Team Pantry', category: 'Office', currency: '$', description: 'Design snacks', memberCount: 8, itemCount: 15, orgName: 'Acme Corp' }
            ]
          })
        } as any);
      }
      if (u.includes('/api/admin/settings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            settings: { registration_enabled: 'true', maintenance_mode: 'false', system_notice: 'Notice' }
          })
        } as any);
      }
      if (u.includes('/api/admin/ai-usage')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { stats: {}, recentLogs: [] } })
        } as any);
      }
      if (u.includes('/api/admin/telemetry')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, telemetry: { recentEvents: [] } })
        } as any);
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      } as any);
    });
  });

  it('renders responsive layout container with tablet horizontal tab bar classes', async () => {
    const { container } = render(
      <AdminDashboardModal isOpen={true} onClose={vi.fn()} authUser={mockAuthUser} />
    );

    await waitFor(() => {
      expect(screen.getByText('Platform Admin Console')).toBeInTheDocument();
    });

    // Check that layout switches to flex-row at lg: and uses lg:hidden for horizontal scrollable tab bar
    const aside = container.querySelector('aside');
    expect(aside).toHaveClass('w-full');
    expect(aside).toHaveClass('lg:w-64');

    const mobileTabContainer = container.querySelector('.lg\\:hidden');
    expect(mobileTabContainer).toBeInTheDocument();
    expect(mobileTabContainer).toHaveClass('overflow-x-auto');
  });

  it('allows editing users on Users panel with overflow-x-auto and responsive modal', async () => {
    const { container } = render(
      <AdminDashboardModal isOpen={true} onClose={vi.fn()} authUser={mockAuthUser} />
    );

    await waitFor(() => {
      expect(screen.getByText('Platform Admin Console')).toBeInTheDocument();
    });

    // Switch to Users tab
    const userTabs = screen.getAllByRole('button', { name: /users/i });
    fireEvent.click(userTabs[0]);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Verify table has overflow-x-auto wrapper
    const table = container.querySelector('table');
    expect(table?.parentElement).toHaveClass('overflow-x-auto');

    // Click Edit User
    const editBtn = screen.getByTitle('Edit User Profile & Credentials');
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);

    // Verify Edit User Modal opens and has max-h-[90vh] responsive containment
    expect(screen.getByText('Edit User Account')).toBeInTheDocument();
    const modalContent = screen.getByText('Edit User Account').closest('.relative');
    expect(modalContent).toHaveClass('max-h-[90vh]');
    expect(modalContent).toHaveClass('flex-col');
  });

  it('allows editing organizations on Orgs panel with overflow-x-auto and dedicated edit modal', async () => {
    const { container } = render(
      <AdminDashboardModal isOpen={true} onClose={vi.fn()} authUser={mockAuthUser} />
    );

    await waitFor(() => {
      expect(screen.getByText('Platform Admin Console')).toBeInTheDocument();
    });

    // Switch to Orgs tab
    const orgTabs = screen.getAllByRole('button', { name: /orgs|organizations/i });
    fireEvent.click(orgTabs[0]);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    // Verify table has overflow-x-auto wrapper
    const table = container.querySelector('table');
    expect(table?.parentElement).toHaveClass('overflow-x-auto');

    // Click Edit Organization
    const editOrgBtn = screen.getByTitle('Edit Organization Workspace');
    expect(editOrgBtn).toBeInTheDocument();
    fireEvent.click(editOrgBtn);

    // Verify Edit Organization Modal opens and has max-h-[90vh] responsive containment
    expect(screen.getByText('Edit Organization Workspace')).toBeInTheDocument();
    const modalContent = screen.getByText('Edit Organization Workspace').closest('.relative');
    expect(modalContent).toHaveClass('max-h-[90vh]');
    expect(modalContent).toHaveClass('flex-col');

    // Check form fields
    expect(screen.getByDisplayValue('Acme Corp')).toBeInTheDocument();
    expect(modalContent?.querySelector('select')).toHaveValue('community');
  });

  it('allows editing pools on Pools panel with overflow-x-auto and responsive edit modal', async () => {
    const { container } = render(
      <AdminDashboardModal isOpen={true} onClose={vi.fn()} authUser={mockAuthUser} />
    );

    await waitFor(() => {
      expect(screen.getByText('Platform Admin Console')).toBeInTheDocument();
    });

    // Switch to Pools tab
    const poolTabs = screen.getAllByRole('button', { name: /pools/i });
    fireEvent.click(poolTabs[0]);

    await waitFor(() => {
      expect(screen.getByText('Design Team Pantry')).toBeInTheDocument();
    });

    // Verify table has overflow-x-auto wrapper
    const table = container.querySelector('table');
    expect(table?.parentElement).toHaveClass('overflow-x-auto');

    // Click Edit Pool
    const editPoolBtn = screen.getByTitle('Edit Pantry Pool');
    expect(editPoolBtn).toBeInTheDocument();
    fireEvent.click(editPoolBtn);

    // Verify Edit Pool Modal opens and has max-h-[90vh] responsive containment
    expect(screen.getByText('Edit Pantry Pool')).toBeInTheDocument();
    const modalContent = screen.getByText('Edit Pantry Pool').closest('.relative');
    expect(modalContent).toHaveClass('max-h-[90vh]');
    expect(modalContent).toHaveClass('flex-col');

    // Check form fields
    expect(screen.getByDisplayValue('Design Team Pantry')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Design snacks')).toBeInTheDocument();
  });


});
