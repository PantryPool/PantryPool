import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingWizardModal } from '../src/components/OnboardingWizardModal';
import * as api from '../src/lib/api';

describe('OnboardingWizardModal - Optional Company Creation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to standalone pantry mode for free/community tier without forcing company name', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <OnboardingWizardModal
        isOpen={true}
        ownerId="u_test_owner"
        initialTier="community"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    // Should indicate standalone pantry
    expect(screen.getByText(/Standalone Pantry/i)).toBeInTheDocument();
    expect(screen.getByText(/No company workspace required/i)).toBeInTheDocument();

    // Company name input should NOT be present in standalone mode
    expect(screen.queryByPlaceholderText(/e.g. Acme Studio/i)).not.toBeInTheDocument();

    // Advancing to step 2 does NOT require company name
    const continueBtn = screen.getByRole('button', { name: /Continue to Pantry Setup/i });
    fireEvent.click(continueBtn);

    expect(await screen.findByText(/Set up your pantry/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. 2nd Floor Kitchen/i)).toBeInTheDocument();
  });

  it('allows user to switch to company workspace and provides "Skip company setup" option', async () => {
    render(
      <OnboardingWizardModal
        isOpen={true}
        ownerId="u_test_owner"
        initialTier="community"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // Switch to Company Workspace
    const companyModeBtn = screen.getByRole('button', { name: /Company Workspace/i });
    fireEvent.click(companyModeBtn);

    // Company input is now visible
    expect(screen.getByPlaceholderText(/e.g. Acme Studio/i)).toBeInTheDocument();

    // "Skip company setup" action is clearly visible
    const skipCompanyBtn = screen.getByRole('button', { name: /Skip company setup/i });
    expect(skipCompanyBtn).toBeInTheDocument();

    // Verify company workspace does NOT offer a free/community tier
    expect(screen.queryByRole('button', { name: /Free • 1 Pool/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Standard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Plus/i })).toBeInTheDocument();

    // Clicking "Skip company setup" switches back to standalone pantry
    fireEvent.click(skipCompanyBtn);
    expect(screen.getByText(/No company workspace required/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/e.g. Acme Studio/i)).not.toBeInTheDocument();
  });

  it('strictly restricts company workspace to paid plans and disallows free community tier', async () => {
    render(
      <OnboardingWizardModal
        isOpen={true}
        ownerId="u_test_owner"
        initialTier="standard"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // Should default to company mode when initialTier is standard
    expect(screen.getByPlaceholderText(/e.g. Acme Studio/i)).toBeInTheDocument();

    // Verify no Community or Free tier button in Company Workspace setup
    expect(screen.queryByText(/Community Edition \(\$0 Free Forever\)/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Free • 1 Pool/i })).not.toBeInTheDocument();

    // Only paid plans exist
    expect(screen.getByRole('button', { name: /Standard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Plus/i })).toBeInTheDocument();
  });

  it('completes standalone onboarding by calling createPoolApi without organizationId', async () => {
    const mockCreatedPool = {
      id: 'pool_standalone_123',
      name: 'Coffee Club Pantry',
      category: 'Club / Group',
      currency: '$',
      qrCodeKey: 'PNTR_COFFEE',
      organizationId: null,
      championId: 'u_test_owner',
    };

    const createPoolSpy = vi.spyOn(api, 'createPoolApi').mockResolvedValue({
      success: true,
      poolId: mockCreatedPool.id,
      qrCodeKey: mockCreatedPool.qrCodeKey,
      pool: mockCreatedPool,
    } as any);

    const saveItemSpy = vi.spyOn(api, 'saveItemApi').mockResolvedValue({
      success: true,
    } as any);

    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <OnboardingWizardModal
        isOpen={true}
        ownerId="u_test_owner"
        initialTier="community"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    // Step 1: Standalone Pantry -> Continue
    fireEvent.click(screen.getByRole('button', { name: /Continue to Pantry Setup/i }));

    // Step 2: Name pantry
    const nameInput = await screen.findByPlaceholderText(/e.g. 2nd Floor Kitchen/i);
    fireEvent.change(nameInput, { target: { value: 'Coffee Club Pantry' } });

    fireEvent.click(screen.getByRole('button', { name: /Review & Launch/i }));

    // Step 3: Review summary
    expect(await screen.findByText(/Standalone Pantry \(No Company\)/i)).toBeInTheDocument();
    expect(screen.getByText('Coffee Club Pantry')).toBeInTheDocument();
    expect(screen.getByText(/Community Edition \(Unlimited\)/i)).toBeInTheDocument();

    // Launch standalone pantry
    const launchBtn = screen.getByRole('button', { name: /Launch Free Pantry/i });
    fireEvent.click(launchBtn);

    await waitFor(() => {
      expect(createPoolSpy).toHaveBeenCalledWith(
        'Coffee Club Pantry',
        expect.any(String),
        '$',
        null,
        'Primary supply pantry',
        'u_test_owner'
      );
      expect(handleSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: null,
          pool: expect.objectContaining({ id: 'pool_standalone_123' }),
        })
      );
      expect(handleClose).toHaveBeenCalled();
    });

    // Should seed starter items
    expect(saveItemSpy).toHaveBeenCalled();
  });

  it('allows dismissing the modal with Skip setup for now', () => {
    const handleClose = vi.fn();

    render(
      <OnboardingWizardModal
        isOpen={true}
        ownerId="u_test_owner"
        onClose={handleClose}
        onSuccess={vi.fn()}
      />
    );

    const skipBtn = screen.getAllByRole('button', { name: /Skip setup for now/i })[0];
    fireEvent.click(skipBtn);
    expect(handleClose).toHaveBeenCalled();
  });
});
