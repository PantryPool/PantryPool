import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthModal } from '../src/components/AuthModal';
import * as api from '../src/lib/api';

vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual('../src/lib/api');
  return {
    ...actual,
    loginUserApi: vi.fn(),
    registerUserApi: vi.fn(),
    googleLoginApi: vi.fn(),
  };
});

describe('AuthModal Form Submissions (src/components/AuthModal.tsx)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should trigger loginUserApi on sign in submit', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    vi.mocked(api.loginUserApi).mockResolvedValue({
      success: true,
      token: 'jwt-123',
      user: { id: 'u1', email: 'user@pantry.com', name: 'User' }
    });

    render(<AuthModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    const emailInput = screen.getByPlaceholderText(/name@company.com/i);
    const passInput = screen.getByPlaceholderText(/••••••••/i);

    fireEvent.change(emailInput, { target: { value: 'user@pantry.com' } });
    fireEvent.change(passInput, { target: { value: 'pass123456' } });

    // Submit form
    const form = emailInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(api.loginUserApi).toHaveBeenCalledWith('user@pantry.com', 'pass123456');
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('should trigger googleLoginApi on Google Sign-In button click', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    (window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }: any) => {
            return {
              requestAccessToken: () => {
                callback({ access_token: 'mock-google-access-token' });
              }
            };
          }
        }
      }
    };

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('googleapis.com')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ email: 'guser@gmail.com', name: 'Google User', sub: 'u_g1', picture: 'https://avatar.url' })
        });
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ appleLoginEnabled: false })
      });
    }) as any;

    vi.mocked(api.googleLoginApi).mockResolvedValue({
      success: true,
      token: 'jwt-google-123',
      user: { id: 'u_g1', email: 'guser@gmail.com', name: 'Google User' }
    });

    render(<AuthModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    const googleBtn = screen.getByRole('button', { name: /Sign in with Google/i });
    fireEvent.click(googleBtn);

    await waitFor(() => {
      expect(api.googleLoginApi).toHaveBeenCalledWith({
        credential: 'mock-google-access-token',
        accessToken: 'mock-google-access-token',
        googleId: 'u_g1',
        email: 'guser@gmail.com',
        name: 'Google User',
        avatarUrl: 'https://avatar.url'
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    global.fetch = origFetch;
  });
});
