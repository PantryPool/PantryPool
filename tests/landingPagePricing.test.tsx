import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LandingPage } from '../src/components/LandingPage';

describe('LandingPage Pricing & Plan Selection Component', () => {
  const onOpenAuthModal = vi.fn();
  const onOpenLegal = vi.fn();
  const onOpenAffiliates = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes yearly billingCycle when clicking standard plan on default yearly selection', () => {
    render(
      <LandingPage
        onOpenAuthModal={onOpenAuthModal}
        onOpenLegal={onOpenLegal}
        onOpenAffiliates={onOpenAffiliates}
      />
    );

    const standardButton = screen.getByRole('button', { name: /Get Started with Standard/i });
    fireEvent.click(standardButton);

    expect(onOpenAuthModal).toHaveBeenCalledWith('register', {
      tier: 'standard',
      billingCycle: 'yearly',
    });
  });

  it('passes monthly billingCycle when monthly billing is toggled', () => {
    render(
      <LandingPage
        onOpenAuthModal={onOpenAuthModal}
        onOpenLegal={onOpenLegal}
        onOpenAffiliates={onOpenAffiliates}
      />
    );

    const monthlyToggle = screen.getByRole('button', { name: /Monthly billing/i });
    fireEvent.click(monthlyToggle);

    const standardButton = screen.getByRole('button', { name: /Get Started with Standard/i });
    fireEvent.click(standardButton);

    expect(onOpenAuthModal).toHaveBeenCalledWith('register', {
      tier: 'standard',
      billingCycle: 'monthly',
    });
  });

  it('passes yearly billingCycle when clicking plus plan on yearly selection', () => {
    render(
      <LandingPage
        onOpenAuthModal={onOpenAuthModal}
        onOpenLegal={onOpenLegal}
        onOpenAffiliates={onOpenAffiliates}
      />
    );

    const plusButton = screen.getByRole('button', { name: /Get Started with Plus/i });
    fireEvent.click(plusButton);

    expect(onOpenAuthModal).toHaveBeenCalledWith('register', {
      tier: 'plus',
      billingCycle: 'yearly',
    });
  });

  it('renders enterprise panel as a bar without dedicated account manager & SLA', () => {
    render(
      <LandingPage
        onOpenAuthModal={onOpenAuthModal}
        onOpenLegal={onOpenLegal}
        onOpenAffiliates={onOpenAffiliates}
      />
    );

    expect(screen.getByText(/Custom Quote/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Contact Us/i })).toBeInTheDocument();

    // Verify "Dedicated account manager & SLA" has been removed
    expect(screen.queryByText(/Dedicated account manager/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bSLA\b/)).not.toBeInTheDocument();
  });
});
