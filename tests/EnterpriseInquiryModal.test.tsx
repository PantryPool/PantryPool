import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnterpriseInquiryModal } from '../src/components/EnterpriseInquiryModal';
import * as api from '../src/lib/api';

vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual('../src/lib/api');
  return {
    ...actual,
    submitEnterpriseInquiryApi: vi.fn(),
  };
});

describe('EnterpriseInquiryModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits inquiry internally via API and does NOT open mailto client popup', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.mocked(api.submitEnterpriseInquiryApi).mockResolvedValue({
      success: true,
      message: 'Inquiry received',
    });

    render(<EnterpriseInquiryModal isOpen={true} onClose={vi.fn()} />);

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/Acme Global Inc/i), {
      target: { value: 'Stark Industries' },
    });
    fireEvent.change(screen.getByPlaceholderText(/facilities@acme.com/i), {
      target: { value: 'tony@stark.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Okta SAML/i), {
      target: { value: 'Custom SSO and 50 pantries' },
    });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Submit Enterprise Inquiry/i });
    fireEvent.click(submitBtn);

    // Assert API called
    await waitFor(() => {
      expect(api.submitEnterpriseInquiryApi).toHaveBeenCalledWith({
        company: 'Stark Industries',
        email: 'tony@stark.com',
        teamSize: '250-500',
        pantryCount: '15-30',
        requirements: 'Custom SSO and 50 pantries',
      });
    });

    // Assert mailto was NOT triggered
    expect(windowOpenSpy).not.toHaveBeenCalled();

    // Assert in-app confirmation screen is displayed
    await waitFor(() => {
      expect(screen.getByText(/Inquiry Received!/i)).toBeInTheDocument();
      expect(screen.getAllByText(/tony@stark.com/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Stark Industries/i)).toBeInTheDocument();
    });

    windowOpenSpy.mockRestore();
  });

  it('shows error banner when API returns error', async () => {
    vi.mocked(api.submitEnterpriseInquiryApi).mockResolvedValue({
      success: false,
      error: 'Work email domain not recognized.',
    });

    render(<EnterpriseInquiryModal isOpen={true} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/Acme Global Inc/i), {
      target: { value: 'Wayne Enterprises' },
    });
    fireEvent.change(screen.getByPlaceholderText(/facilities@acme.com/i), {
      target: { value: 'bruce@wayne.com' },
    });

    const submitBtn = screen.getByRole('button', { name: /Submit Enterprise Inquiry/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Work email domain not recognized/i)).toBeInTheDocument();
    });
  });
});
