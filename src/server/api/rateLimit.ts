import { Context, MiddlewareHandler } from 'hono';

export interface RateLimitConfig {
  max: number;
  windowSeconds: number;
}

export type RateCategory = 'auth' | 'refresh' | 'ai' | 'general';

export const RATE_LIMITS: Record<RateCategory, RateLimitConfig> = {
  auth: { max: 30, windowSeconds: 60 },         // 30 requests / min
  refresh: { max: 120, windowSeconds: 60 },     // 120 requests / min
  ai: { max: 10, windowSeconds: 60 },           // 10 requests / min
  general: { max: 240, windowSeconds: 60 },     // 240 requests / min
};

interface RateCacheEntry {
  count: number;
  resetAt: number; // timestamp in ms
}

const UNIVERSAL_RATE_CACHE = new Map<string, RateCacheEntry>();
const MAX_CACHE_ENTRIES = 5000;

function cleanupExpiredEntries(now: number) {
  if (UNIVERSAL_RATE_CACHE.size > MAX_CACHE_ENTRIES) {
    for (const [key, entry] of UNIVERSAL_RATE_CACHE.entries()) {
      if (entry.resetAt <= now) {
        UNIVERSAL_RATE_CACHE.delete(key);
      }
    }
  }
}

export function resetRateLimitCacheForTesting(): void {
  UNIVERSAL_RATE_CACHE.clear();
}

/**
 * Universal In-Memory Rate Limiter
 * Enforces rate limits across Node and Edge environments.
 * Supports both signatures:
 *   checkRateLimit(request, category, env?)
 *   checkRateLimit(request, env, category)
 */
export async function checkRateLimit(
  request: Request | { headers: { get: (name: string) => string | null } },
  arg2?: any,
  arg3?: any
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const category: RateCategory = (
    typeof arg2 === 'string' && arg2 in RATE_LIMITS
      ? arg2
      : typeof arg3 === 'string' && arg3 in RATE_LIMITS
      ? arg3
      : 'general'
  ) as RateCategory;

  const config = RATE_LIMITS[category] || RATE_LIMITS.general;
  const ipHeader = request.headers.get('CF-Connecting-IP') ||
                   request.headers.get('cf-connecting-ip') ||
                   request.headers.get('x-forwarded-for') ||
                   request.headers.get('X-Forwarded-For') ||
                   '127.0.0.1';
  const ip = ipHeader.split(',')[0].trim();
  const key = `${category}:${ip}`;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  cleanupExpiredEntries(now);

  const entry = UNIVERSAL_RATE_CACHE.get(key);

  if (entry && entry.resetAt > now) {
    entry.count++;
    if (entry.count > config.max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      return { allowed: false, retryAfter };
    }
    return { allowed: true };
  }

  // Create new window
  UNIVERSAL_RATE_CACHE.set(key, {
    count: 1,
    resetAt: now + windowMs,
  });

  return { allowed: true };
}

/**
 * Universal Hono Rate Limiting Middleware
 * SEC-A07-02: Missing Rate Limiting and Brute-Force Protection
 */
export function rateLimitMiddleware(category?: RateCategory): MiddlewareHandler {
  return async (c: Context, next) => {
    // If request was already checked at edge wrapper level, avoid double-counting
    const env = c.env as any;
    if (env?.__edgeRateLimited) {
      await next();
      return;
    }

    const path = c.req.path;
    // Health check and probe endpoints are exempt from rate limiting
    if (path === '/api/health' || path === '/.well-known/ai-catalog.json' || path === '/.well-known/ard.json') {
      await next();
      return;
    }

    // Determine category
    let cat: RateCategory = category || 'general';
    if (!category) {
      if (path === '/api/auth/refresh') {
        cat = 'refresh';
      } else if (
        path === '/api/auth/login' ||
        path === '/api/auth/register' ||
        path === '/api/auth/reset-password' ||
        path === '/api/auth/google' ||
        path === '/api/auth/apple'
      ) {
        cat = 'auth';
      } else if (path.startsWith('/api/ai-') || path === '/api/parse-receipt') {
        cat = 'ai';
      }
    }

    const { allowed, retryAfter } = await checkRateLimit(c.req.raw, cat, c.env);
    if (!allowed) {
      c.header('Retry-After', String(retryAfter || 60));
      return c.json({
        success: false,
        error: 'Too many requests. Please slow down and try again shortly.',
        retryAfter: retryAfter || 60
      }, 429);
    }

    await next();
  };
}
