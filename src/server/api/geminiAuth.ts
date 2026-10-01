/**
 * ⚡ Universal Google Gemini & Enterprise Agent Platform Authenticator
 *
 * Provides cross-runtime authentication for Gemini models across both
 * Cloudflare Pages Functions (Edge V8 isolates) and Node.js (Linux VM).
 *
 * Supported Auth Modes:
 * 1. Enterprise ADC / Service Account (OAuth 2.0 JWT bearer exchange via native Web Crypto)
 * 2. Developer / Studio API Key (generativelanguage.googleapis.com)
 */

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface GeminiEndpointConfig {
  mode: 'enterprise' | 'studio';
  url: (model: string) => string;
  headers: Record<string, string>;
  model: string;
  projectId?: string;
  location?: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

export function resetGeminiAuthCache(): void {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

function base64url(buffer: Uint8Array | string): string {
  const bytes = typeof buffer === 'string' ? new TextEncoder().encode(buffer) : buffer;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToBinary(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^\n]+-----/g, '').replace(/\s+/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64');
  }
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function getGoogleEnterpriseAccessToken(sa: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && tokenExpiresAt > now + 60) {
    return cachedAccessToken;
  }

  const binaryKey = pemToBinary(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey as any,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform'
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, dataToSign);
  const encodedSignature = base64url(new Uint8Array(signature));
  const assertion = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth2 assertion failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600);
  return cachedAccessToken;
}

export async function resolveGeminiEndpointConfig(env?: any): Promise<GeminiEndpointConfig | null> {
  const configuredModel =
    env?.GEMINI_OCR_MODEL ||
    (typeof process !== 'undefined' ? process.env.GEMINI_OCR_MODEL : undefined) ||
    'gemini-2.5-flash-lite';

  // 1. Check for Enterprise Service Account in Cloudflare or Process env
  let saCreds: ServiceAccountCredentials | null = null;

  if (env?.GCP_SERVICE_ACCOUNT_KEY) {
    try {
      saCreds =
        typeof env.GCP_SERVICE_ACCOUNT_KEY === 'string'
          ? JSON.parse(env.GCP_SERVICE_ACCOUNT_KEY)
          : env.GCP_SERVICE_ACCOUNT_KEY;
    } catch {
      // Invalid JSON
    }
  } else if (env?.GCP_CLIENT_EMAIL && env?.GCP_PRIVATE_KEY) {
    saCreds = {
      client_email: env.GCP_CLIENT_EMAIL,
      private_key: env.GCP_PRIVATE_KEY,
      project_id: env.GCP_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT
    };
  } else if (typeof process !== 'undefined' && process.env) {
    if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
      try {
        saCreds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
      } catch {}
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const fs = await import('node:fs');
        const raw = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
        saCreds = JSON.parse(raw);
      } catch {}
    }
  }

  if (saCreds?.client_email && saCreds?.private_key) {
    try {
      const token = await getGoogleEnterpriseAccessToken(saCreds);
      const projectId =
        env?.GOOGLE_CLOUD_PROJECT ||
        env?.GCP_PROJECT_ID ||
        (typeof process !== 'undefined'
          ? process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID
          : undefined) ||
        saCreds.project_id;
      const location =
        env?.GOOGLE_CLOUD_LOCATION ||
        env?.GCP_LOCATION ||
        (typeof process !== 'undefined'
          ? process.env.GOOGLE_CLOUD_LOCATION || process.env.GCP_LOCATION
          : undefined) ||
        'global';

      if (projectId) {
        const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
        return {
          mode: 'enterprise',
          url: (model: string) =>
            `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          model: configuredModel,
          projectId,
          location
        };
      }
    } catch (err) {
      console.error('[Gemini Enterprise Auth Error]:', err);
    }
  }

  // 2. Fall back to Gemini API Key (AI Studio / Generative Language API)
  const apiKey =
    env?.GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined);
  if (
    apiKey &&
    !apiKey.includes('PLACEHOLDER') &&
    !apiKey.includes('TEST_KEY') &&
    apiKey !== 'MY_GEMINI_API_KEY'
  ) {
    return {
      mode: 'studio',
      url: (model: string) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`,
      headers: {
        'Content-Type': 'application/json'
      },
      model: configuredModel
    };
  }

  return null;
}
