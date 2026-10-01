import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit, resetRateLimitCacheForTesting, RATE_LIMITS } from '../functions/api/_middleware/rateLimit';

describe('⚡ Edge In-Memory Rate Limiting Suite', () => {
  const fakeEnv = {} as any;

  beforeEach(() => {
    resetRateLimitCacheForTesting();
    vi.restoreAllMocks();
  });

  it('allows requests within limit', async () => {
    const request = new Request('https://pantrypool.com/api/auth/login', {
      headers: { 'CF-Connecting-IP': '192.168.1.50' }
    });

    for (let i = 0; i < RATE_LIMITS.auth.max; i++) {
      const result = await checkRateLimit(request, fakeEnv, 'auth');
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks requests exceeding limit with 429 and retryAfter', async () => {
    const request = new Request('https://pantrypool.com/api/auth/login', {
      headers: { 'CF-Connecting-IP': '192.168.1.55' }
    });

    for (let i = 0; i < RATE_LIMITS.auth.max; i++) {
      await checkRateLimit(request, fakeEnv, 'auth');
    }

    const blocked = await checkRateLimit(request, fakeEnv, 'auth');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it('isolates limits across different IP addresses', async () => {
    const req1 = new Request('https://pantrypool.com/api/ai-scan', {
      headers: { 'CF-Connecting-IP': '10.0.0.1' }
    });
    const req2 = new Request('https://pantrypool.com/api/ai-scan', {
      headers: { 'CF-Connecting-IP': '10.0.0.2' }
    });

    for (let i = 0; i < RATE_LIMITS.ai.max; i++) {
      await checkRateLimit(req1, fakeEnv, 'ai');
    }

    // req1 is now blocked
    const res1 = await checkRateLimit(req1, fakeEnv, 'ai');
    expect(res1.allowed).toBe(false);

    // req2 is from a different IP and should still be allowed
    const res2 = await checkRateLimit(req2, fakeEnv, 'ai');
    expect(res2.allowed).toBe(true);
  });

  it('isolates limits across different categories for the same IP', async () => {
    const req = new Request('https://pantrypool.com/api/items', {
      headers: { 'CF-Connecting-IP': '10.0.0.3' }
    });

    // Exhaust AI category
    for (let i = 0; i < RATE_LIMITS.ai.max; i++) {
      await checkRateLimit(req, fakeEnv, 'ai');
    }
    const aiBlocked = await checkRateLimit(req, fakeEnv, 'ai');
    expect(aiBlocked.allowed).toBe(false);

    // General category for the same IP should still be allowed
    const generalAllowed = await checkRateLimit(req, fakeEnv, 'general');
    expect(generalAllowed.allowed).toBe(true);
  });
});
