import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { generateToken, verifyToken, verifyAppleToken } from '../auth';

describe('Phase 16: Authentication Token & Provider Verification', () => {
  it('generates and verifies valid JWT payload with provider claims', () => {
    const payload = {
      userId: 'u_apple_123',
      email: 'user_001234@privaterelay.appleid.com',
      name: 'Elena Rostova',
      systemRole: 'user'
    };

    const token = generateToken(payload);
    expect(token).toBeTypeOf('string');

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(payload.userId);
    expect(decoded?.email).toBe(payload.email);
    expect(decoded?.name).toBe(payload.name);
    expect(decoded?.systemRole).toBe('user');
  });

  it('rejects tampered or malformed JWT tokens', () => {
    const validToken = generateToken({
      userId: 'u_99',
      email: 'alex@privaterelay.appleid.com',
      name: 'Alex'
    });

    const tamperedToken = validToken.slice(0, -5) + 'xxxxx';
    expect(verifyToken(tamperedToken)).toBeNull();
    expect(verifyToken('invalid.jwt.token')).toBeNull();
  });

  it('verifies valid Apple identity token payload', async () => {
    const applePayload = {
      sub: 'apple_001234.abcdef',
      email: 'elena@privaterelay.appleid.com',
      iss: 'https://appleid.apple.com'
    };
    const mockIdToken = jwt.sign(applePayload, 'test-secret');
    const result = await verifyAppleToken(mockIdToken);

    expect(result).not.toBeNull();
    expect(result?.appleSub).toBe('apple_001234.abcdef');
    expect(result?.email).toBe('elena@privaterelay.appleid.com');
  });

  it('rejects invalid or null Apple tokens', async () => {
    expect(await verifyAppleToken('')).toBeNull();
  });
});
