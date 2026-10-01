import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateOrganizationModal } from '../src/components/CreateOrganizationModal';
import * as api from '../src/lib/api';

vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual('../src/lib/api');
  return {
    ...actual,
    createOrganizationApi: vi.fn(),
    joinOrganizationApi: vi.fn(),
  };
});

describe('CreateOrganizationModal - Open Core Workspace Creation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders workspace creation form with tier options', () => {
    const { container } = render(
      <CreateOrganizationModal
        isOpen={true}
        ownerId="u_test_owner"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('Company Workspace')).toBeInTheDocument();
    expect(screen.getByText(/Manage floor & breakroom pools under one shared team organization/i)).toBeInTheDocument();

    // Verify Standard & Plus tier selectors are present
    expect(screen.getByRole('button', { name: /Standard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Plus/i })).toBeInTheDocument();

    // Verify submit button is direct creation
    const submitBtn = container.querySelector('button[type="submit"]');
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).toHaveTextContent(/Create Workspace/i);
  });

  it('allows selecting Standard or Plus tier and creating workspace directly via createOrganizationApi', async () => {
    const mockOrg: api.ApiOrganization = {
      id: 'org_test_123',
      name: 'Acme Studio HQ',
      ownerId: 'u_test_owner',
      tier: 'plus',
      inviteCode: 'ORG_ACME123',
      createdAt: new Date().toISOString(),
    };

    const createOrgSpy = vi.mocked(api.createOrganizationApi).mockResolvedValue({
      success: true,
      organization: mockOrg,
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    const { container } = render(
      <CreateOrganizationModal
        isOpen={true}
        ownerId="u_test_owner"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Fill organization name
    const input = screen.getByPlaceholderText('Acme Corp HQ');
    fireEvent.change(input, { target: { value: 'Acme Studio HQ' } });

    // Switch to Plus tier
    const plusBtn = screen.getByRole('button', { name: /Plus/i });
    fireEvent.click(plusBtn);

    // Click submit
    const submitBtn = container.querySelector('button[type="submit"]')!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createOrgSpy).toHaveBeenCalledWith('Acme Studio HQ', 'u_test_owner', 'plus');
      expect(onSuccess).toHaveBeenCalledWith(mockOrg);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('switches to join tab and allows joining workspace via invite code', async () => {
    const mockOrg: api.ApiOrganization = {
      id: 'org_joined_456',
      name: 'Partner Org',
      ownerId: 'u_other_owner',
      tier: 'standard',
      inviteCode: 'ORG_PARTNER',
      createdAt: new Date().toISOString(),
    };

    const joinOrgSpy = vi.mocked(api.joinOrganizationApi).mockResolvedValue({
      success: true,
      organization: mockOrg,
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <CreateOrganizationModal
        isOpen={true}
        ownerId="u_test_owner"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Switch to Join tab
    fireEvent.click(screen.getByRole('button', { name: /Join with Invite Code/i }));

    const inviteInput = screen.getByPlaceholderText(/e\.g\. ORG_ABC123 or invite link/i);
    fireEvent.change(inviteInput, { target: { value: 'ORG_PARTNER' } });

    fireEvent.click(screen.getByRole('button', { name: /Join Workspace/i }));

    await waitFor(() => {
      expect(joinOrgSpy).toHaveBeenCalledWith('ORG_PARTNER');
      expect(onSuccess).toHaveBeenCalledWith(mockOrg);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
