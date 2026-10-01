import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthModal } from '../src/components/AuthModal';
import * as api from '../src/lib/api';

vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual('../src/lib/api');
  return {
    ...actual,
    fetchPublicSettingsApi: vi.fn().mockResolvedValue({
      appleLoginEnabled: false,
      registrationEnabled: true,
      maintenanceMode: false,
      systemNotice: '',
      ssoConfigured: false
    })
  };
});

describe('AuthModal Component (src/components/AuthModal.tsx)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should not render modal when isOpen is false', () => {
    const { container } = render(
      <AuthModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('should render modal elements when isOpen is true', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText(/Welcome Back to PantryPool/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/name@company.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign in with Google/i)).toBeInTheDocument();
  });

  it('should switch between Sign In and Create Account tabs', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const createAccountTab = screen.getByRole('button', { name: /Create Account/i });
    fireEvent.click(createAccountTab);

    expect(screen.getByText(/Create your PantryPool Account/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Alex Morgan/i)).toBeInTheDocument();
  });



  it('should display yearly pricing when signupIntent specifies yearly billingCycle', () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialMode="register"
        signupIntent={{ tier: 'standard', billingCycle: 'yearly' }}
      />
    );

    expect(screen.getByText(/Hosted Standard \(\$49\/yr\)/i)).toBeInTheDocument();
  });

  it('should display monthly pricing when signupIntent specifies monthly billingCycle', () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialMode="register"
        signupIntent={{ tier: 'standard', billingCycle: 'monthly' }}
      />
    );

    expect(screen.getByText(/Hosted Standard \(\$5\/mo\)/i)).toBeInTheDocument();
  });

  it('should display Hosted Plus yearly ($119/yr) and monthly ($12/mo) accurately', () => {
    const { rerender } = render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialMode="register"
        signupIntent={{ tier: 'plus', billingCycle: 'yearly' }}
      />
    );
    expect(screen.getByText(/Hosted Plus \(\$119\/yr\)/i)).toBeInTheDocument();

    rerender(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialMode="register"
        signupIntent={{ tier: 'plus', billingCycle: 'monthly' }}
      />
    );
    expect(screen.getByText(/Hosted Plus \(\$12\/mo\)/i)).toBeInTheDocument();
  });

  it('should render exactly one set of Privacy Policy and Terms of Service links in the signin dialog', () => {
    const onOpenLegal = vi.fn();
    render(
      <AuthModal
        isOpen={true}
        initialMode="login"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onOpenLegal={onOpenLegal}
      />
    );

    const privacyLinks = screen.getAllByRole('link', { name: /privacy policy/i });
    expect(privacyLinks).toHaveLength(1);

    const termsLinks = screen.getAllByRole('link', { name: /terms of service/i });
    expect(termsLinks).toHaveLength(1);

    fireEvent.click(privacyLinks[0]);
    expect(onOpenLegal).toHaveBeenCalledWith('privacy');

    fireEvent.click(termsLinks[0]);
    expect(onOpenLegal).toHaveBeenCalledWith('terms');
  });

  it('should render exactly one set of legal links in register mode', () => {
    const onOpenLegal = vi.fn();
    render(
      <AuthModal
        isOpen={true}
        initialMode="register"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onOpenLegal={onOpenLegal}
      />
    );

    const privacyLinks = screen.getAllByRole('link', { name: /privacy policy/i });
    expect(privacyLinks).toHaveLength(1);

    const termsLinks = screen.getAllByRole('link', { name: /terms of service/i });
    expect(termsLinks).toHaveLength(1);

    const userAgreementLinks = screen.getAllByRole('link', { name: /user agreement/i });
    expect(userAgreementLinks).toHaveLength(1);
  });
});

