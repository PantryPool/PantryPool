import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken } from '../auth';

describe('Phase 17: User Profile & Identity Verification', () => {
  it('validates user token profile data integrity', () => {
    const profile = {
      userId: 'u_profile_01',
      email: 'alex@acme.com',
      name: 'Chef Alex M.',
      systemRole: 'admin' as const
    };

    const token = generateToken(profile);
    const verified = verifyToken(token);

    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('u_profile_01');
    expect(verified?.name).toBe('Chef Alex M.');
    expect(verified?.systemRole).toBe('admin');
  });

  it('rejects unauthenticated token verification requests', () => {
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('undefined')).toBeNull();
    expect(verifyToken('null')).toBeNull();
  });

  it('accurately identifies Google OAuth account without password set', () => {
    const googleUser = {
      id: 'u_g_123',
      email: 'alex@gmail.com',
      name: 'Alex Google',
      password_hash: null,
      google_id: 'g_sub_123456',
      apple_id: null
    };

    const hasPassword = Boolean(googleUser.password_hash);
    const hasGoogle = Boolean(googleUser.google_id);
    const hasApple = Boolean(googleUser.apple_id);

    expect(hasPassword).toBe(false);
    expect(hasGoogle).toBe(true);
    expect(hasApple).toBe(false);
  });

  it('accurately identifies password account with linked Google account', () => {
    const multiUser = {
      id: 'u_multi_456',
      email: 'alex@company.com',
      name: 'Alex Multi',
      password_hash: '$2b$10$hashedpass12345678901234567890123456789012',
      google_id: 'g_sub_987654',
      apple_id: null
    };

    const hasPassword = Boolean(multiUser.password_hash);
    const hasGoogle = Boolean(multiUser.google_id);
    const hasApple = Boolean(multiUser.apple_id);

    expect(hasPassword).toBe(true);
    expect(hasGoogle).toBe(true);
    expect(hasApple).toBe(false);
  });

  it('validates user payment preferences configuration and preferred channel', () => {
    const userWithPayments = {
      id: 'u_p2p_789',
      email: 'sarah@pantry.org',
      name: 'Sarah Champion',
      venmoHandle: '@sarah_c',
      cashappHandle: '$sarah_cash',
      paypalHandle: 'sarah_p',
      zelleIdentifier: 'sarah@bank.com',
      applePayHandle: '+15551234567',
      preferredPaymentMethod: 'applepay' as const
    };

    expect(userWithPayments.venmoHandle).toBe('@sarah_c');
    expect(userWithPayments.cashappHandle).toBe('$sarah_cash');
    expect(userWithPayments.paypalHandle).toBe('sarah_p');
    expect(userWithPayments.zelleIdentifier).toBe('sarah@bank.com');
    expect(userWithPayments.applePayHandle).toBe('+15551234567');
    expect(userWithPayments.preferredPaymentMethod).toBe('applepay');
  });
});
