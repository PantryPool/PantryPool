import { Env } from './_types';
import { ensureD1Schema } from './_lib/db';
import { checkRateLimit } from './_middleware/rateLimit';
import { createUniversalApi } from '../../src/server/api/app';
import { sendEdgeEmail } from './_lib/email';

// Universal Hono API engine (single source of truth for all routes across Node and Edge)
const app = createUniversalApi();

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  // 1. Sliding Window Edge Rate Limiting (pre-flight DDoS and abuse protection)
  try {
    const url = new URL(request.url);
    const path = url.pathname;

    let rateCategory: 'auth' | 'refresh' | 'ai' | 'general' = 'general';
    if (path === '/api/auth/refresh') {
      rateCategory = 'refresh';
    } else if (
      path === '/api/auth/login' ||
      path === '/api/auth/register' ||
      path === '/api/auth/reset-password' ||
      path === '/api/auth/google' ||
      path === '/api/auth/apple'
    ) {
      rateCategory = 'auth';
    } else if (path.startsWith('/api/ai-') || path === '/api/parse-receipt') {
      rateCategory = 'ai';
    }

    if (path !== '/api/health') {
      const { allowed, retryAfter } = await checkRateLimit(request, env, rateCategory);
      if (!allowed) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Too many requests. Please slow down and try again shortly.',
          retryAfter: retryAfter || 60
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter || 60)
          }
        });
      }
    }

    // 2. Ensure D1 schema initialization (guarded isolate-wide)
    if (env.pantrypool_db) {
      await ensureD1Schema(env.pantrypool_db, env);
    }

    // 3. Forward request directly to Universal Hono API Engine
    return await app.fetch(request, { ...env, __edgeRateLimited: true, sendEdgeEmail } as any, context as any);

  } catch (error: any) {
    console.error('[Edge API Error]:', error);
    return new Response(JSON.stringify({
      success: false,
      error: `Internal Server Error: ${error?.message || 'Unexpected server error'}`
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
