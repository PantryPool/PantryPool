import { Env } from '../_types';
import { base64UrlEncode } from './crypto';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

let cachedToken: { accessToken: string; expiresAt: number; projectId?: string } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleanPem = pem
    .replace(/-----BEGIN[ A-Z0-9_-]+-----/g, '')
    .replace(/-----END[ A-Z0-9_-]+-----/g, '')
    .replace(/[\r\n\s]/g, '');
  
  const binary = atob(cleanPem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function parseServiceAccount(env: Env): ServiceAccountCredentials | null {
  const rawKey = env.GCP_SERVICE_ACCOUNT_KEY || (typeof process !== 'undefined' && process.env ? process.env.GCP_SERVICE_ACCOUNT_KEY : undefined);
  if (rawKey && rawKey.trim()) {
    try {
      let jsonStr = rawKey.trim();
      // Support base64-encoded JSON if passed
      if (!jsonStr.startsWith('{')) {
        try {
          jsonStr = atob(jsonStr);
        } catch {
          // not base64, proceed
        }
      }
      const parsed = JSON.parse(jsonStr);
      if (parsed.client_email && parsed.private_key) {
        const fallbackProject = parsed.client_email.includes('@') ? parsed.client_email.split('@')[1]?.split('.')[0] : undefined;
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
          project_id: parsed.project_id || env.GCP_PROJECT_ID || fallbackProject
        };
      }
    } catch (e) {
      console.error('[GoogleAuth] Failed to parse GCP_SERVICE_ACCOUNT_KEY JSON:', e);
    }
  }

  const clientEmail = env.GCP_CLIENT_EMAIL || (typeof process !== 'undefined' && process.env ? process.env.GCP_CLIENT_EMAIL : undefined);
  const privateKey = env.GCP_PRIVATE_KEY || (typeof process !== 'undefined' && process.env ? process.env.GCP_PRIVATE_KEY : undefined);
  const projectId = env.GCP_PROJECT_ID || (typeof process !== 'undefined' && process.env ? process.env.GCP_PROJECT_ID : undefined);

  if (clientEmail && privateKey) {
    const fallbackProject = clientEmail.includes('@') ? clientEmail.split('@')[1]?.split('.')[0] : undefined;
    return {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
      project_id: projectId || fallbackProject
    };
  }

  return null;
}

export async function getGoogleServiceAccountAccessToken(env: Env): Promise<{ accessToken: string; projectId?: string } | null> {
  const creds = parseServiceAccount(env);
  if (!creds) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return { accessToken: cachedToken.accessToken, projectId: cachedToken.projectId || creds.project_id };
  }

  try {
    const keyBuffer = pemToArrayBuffer(creds.private_key);
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyBuffer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );

    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/generative-language',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedClaims = base64UrlEncode(JSON.stringify(claims));
    const unsignedJwt = `${encodedHeader}.${encodedClaims}`;
    
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(unsignedJwt)
    );

    const signedJwt = `${unsignedJwt}.${base64UrlEncode(new Uint8Array(signature))}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedJwt
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[GoogleAuth] OAuth token exchange failed:', tokenRes.status, errText);
      throw new Error(`Google OAuth token exchange failed (${tokenRes.status}): ${errText}`);
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const expiresIn = Number(tokenData.expires_in) || 3600;

    cachedToken = {
      accessToken,
      expiresAt: now + expiresIn,
      projectId: creds.project_id
    };

    return { accessToken, projectId: creds.project_id };
  } catch (err) {
    console.error('[GoogleAuth] Error generating service account token:', err);
    throw err;
  }
}
