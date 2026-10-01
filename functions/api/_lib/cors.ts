import { Env } from '../_types';

export const ALLOWED_ORIGINS = new Set([
  'https://pantrypool.com',
  'https://www.pantrypool.com',
]);

let activeEnv: Env | null = null;

export function setActiveEnv(env: Env) {
  activeEnv = env;
}

export function getCorsHeaders(request?: Request, env?: Env): Record<string, string> {
  const currentEnv = env || activeEnv;
  let originHeader = 'https://pantrypool.com';
  if (request) {
    const origin = request.headers.get('Origin');
    if (origin) {
      let isDevEnv = currentEnv?.ENVIRONMENT === 'development';
      try {
        const url = new URL(request.url);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          isDevEnv = true;
        }
      } catch (e) {}

      if (ALLOWED_ORIGINS.has(origin)) {
        originHeader = origin;
      } else if (/^https:\/\/[a-f0-9]+\.pantrypool\.pages\.dev$/.test(origin)) {
        originHeader = origin;
      } else if (
        isDevEnv &&
        (origin === 'http://localhost:3000' || origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:3000' || origin === 'http://127.0.0.1:5173')
      ) {
        originHeader = origin;
      }
    }
  }
  return {
    'Access-Control-Allow-Origin': originHeader,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Slack-Signature, X-Slack-Request-Timestamp',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export function jsonResponse(
  data: any,
  status = 200,
  request?: Request,
  env?: Env,
  customHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request, env),
      ...(customHeaders || {}),
    },
  });
}
