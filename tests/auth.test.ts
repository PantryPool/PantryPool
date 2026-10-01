import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword, generateToken, verifyToken, verifyGoogleToken } from '../auth';
import jwt from 'jsonwebtoken';

describe('Authentication & Security Suite (auth.ts)', () => {
  it('should hash password and verify matching hash', async () => {
    const rawPass = 'PantrySecret2026!';
    const hashed = await hashPassword(rawPass);

    expect(hashed).not.toEqual(rawPass);
    expect(hashed.length).toBeGreaterThan(20);

    const isMatch = await comparePassword(rawPass, hashed);
    expect(isMatch).toBe(true);

    const isWrongMatch = await comparePassword('WrongPassword', hashed);
    expect(isWrongMatch).toBe(false);
  }, 15000);

  it('should generate valid JWT tokens with systemRole and decode correctly', () => {
    const payload = {
      userId: 'u_test_99',
      email: 'test@pantrypool.com',
      name: 'Test Member',
      systemRole: 'superadmin',
    };

    const token = generateToken(payload);
    expect(typeof token).toBe('string');

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(payload.userId);
    expect(decoded?.systemRole).toBe('superadmin');
  });

  it('should verify and decode Google ID tokens in fallback mode', async () => {
    const googlePayload = {
      sub: 'google_123456789',
      email: 'alex@pantrypool.com',
      name: 'Alex Morgan',
      picture: 'https://pantrypool.com/avatar.jpg'
    };
    const mockIdToken = jwt.sign(googlePayload, 'dummy-secret');
    const result = await verifyGoogleToken(mockIdToken);

    expect(result).not.toBeNull();
    expect(result?.googleId).toBe('google_123456789');
    expect(result?.email).toBe('alex@pantrypool.com');
    expect(result?.name).toBe('Alex Morgan');
    expect(result?.avatarUrl).toBe('https://pantrypool.com/avatar.jpg');
  });

  it('should return null when verifyGoogleToken fails on garbage string', async () => {
    const result = await verifyGoogleToken('not-a-token');
    expect(result).toBeNull();
  });
});


