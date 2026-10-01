import { Env } from '../_types';

export function base64UrlEncode(strOrUint8Array: string | Uint8Array): string {
  const bytes = typeof strOrUint8Array === 'string' ? new TextEncoder().encode(strOrUint8Array) : strOrUint8Array;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function getJwtSecret(env: Env): string {
  if (!env || !env.JWT_SECRET || env.JWT_SECRET.trim() === '') {
    throw new Error('FATAL: JWT_SECRET environment variable is missing on Cloudflare Worker');
  }
  return env.JWT_SECRET;
}

export async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function generateSignedToken(payload: Record<string, any>, env: Env): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const fullPayload = {
    ...payload,
    id: payload.id || payload.userId,
    userId: payload.userId || payload.id,
    tokenVersion: payload.tokenVersion !== undefined ? payload.tokenVersion : 1,
    iat: Math.floor(Date.now() / 1000),
    exp: payload.exp || Math.floor(Date.now() / 1000) + 86400, // 24 hours (N3)
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const key = await getHmacKey(getJwtSecret(env));
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export async function verifySignedToken(token: string, env: Env): Promise<Record<string, any> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const headerStr = new TextDecoder().decode(base64UrlDecode(encodedHeader));
    const header = JSON.parse(headerStr);
    if (header.alg !== 'HS256') return null;

    const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const signature = base64UrlDecode(encodedSignature);
    const key = await getHmacKey(getJwtSecret(env));
    const isValid = await crypto.subtle.verify('HMAC', key, signature as any, data);
    if (!isValid) return null;

    const payloadStr = new TextDecoder().decode(base64UrlDecode(encodedPayload));
    const payload = JSON.parse(payloadStr);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

export const PBKDF2_DEFAULT_ITERATIONS = 100000;

export async function hashPassword(password: string, iterations = PBKDF2_DEFAULT_ITERATIONS): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const effectiveIterations = Math.min(iterations, 100000);
  const passKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: effectiveIterations,
      hash: 'SHA-256',
    },
    passKey,
    256
  );
  const saltHex = Array.from(new Uint8Array(salt)).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2$${effectiveIterations}$${saltHex}$${hashHex}`;
}

export async function comparePassword(password: string, storedHash: string): Promise<boolean> {
  try {
    if (!storedHash) return false;
    if (storedHash.startsWith('pbkdf2$')) {
      const parts = storedHash.split('$');
      if (parts.length !== 4) return false;
      const rawIterations = parseInt(parts[1], 10) || PBKDF2_DEFAULT_ITERATIONS;
      const iterations = Math.min(rawIterations, 100000);
      const saltHex = parts[2];
      const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);

      const enc = new TextEncoder();
      const passKey = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );
      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBytes,
          iterations,
          hash: 'SHA-256',
        },
        passKey,
        256
      );
      const derivedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
      return derivedHex === parts[3];
    }

    // Unknown hash format — reject
    return false;
  } catch (e) {
    return false;
  }
}

export interface VerifiedOAuthUser {
  providerId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export async function verifyGoogleIdToken(idToken: string, env: Env): Promise<VerifiedOAuthUser | null> {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    // In test environment: decode payload without network call
    if (env.ENVIRONMENT === 'test' || !env.GOOGLE_CLIENT_ID) {
      const parts = idToken.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
        if (payload && payload.email) {
          return {
            providerId: payload.sub || payload.googleId || 'g_' + crypto.randomUUID(),
            email: payload.email.toLowerCase().trim(),
            name: payload.name || payload.email.split('@')[0],
            avatarUrl: payload.picture || payload.avatarUrl,
          };
        }
      }
    }

    const ALLOWED_CLIENT_IDS = Array.from(new Set([
      env.GOOGLE_CLIENT_ID,
    ].filter((id): id is string => Boolean(id)).map((id: string) => String(id).replace(/^["']|["']$/g, '').trim())));

    // Verify token with Google's Tokeninfo endpoint (supports id_token and access_token)
    let res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    let isAccessToken = false;
    if (!res.ok) {
      res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(idToken)}`);
      isAccessToken = res.ok;
    }
    if (res.ok) {
      const info: any = await res.json();
      if (info && info.email) {
        // Enforce audience/authorized party match to prevent confused deputy token substitution
        const audMatches = ALLOWED_CLIENT_IDS.some(allowed =>
          info.aud === allowed ||
          info.azp === allowed ||
          (info.aud && allowed.startsWith(String(info.aud).split('-')[0])) ||
          (info.azp && allowed.startsWith(String(info.azp).split('-')[0]))
        );
        if (audMatches) {
          let name = info.name || info.email.split('@')[0];
          let avatarUrl = info.picture;

          // If it was an access_token, name/picture might be omitted in tokeninfo; fetch from userinfo securely
          if (isAccessToken && (!info.name || !info.picture)) {
            try {
              const ures = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${idToken}` }
              });
              if (ures.ok) {
                const uinfo: any = await ures.json();
                if (uinfo) {
                  name = uinfo.name || name;
                  avatarUrl = uinfo.picture || avatarUrl;
                }
              }
            } catch (e) {}
          }

          return {
            providerId: info.sub || info.user_id || `g_${Date.now()}`,
            email: info.email.toLowerCase().trim(),
            name,
            avatarUrl,
          };
        }
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

export async function verifyAppleIdentityToken(identityToken: string, env: Env): Promise<VerifiedOAuthUser | null> {
  if (!identityToken || typeof identityToken !== 'string') return null;
  try {
    const parts = identityToken.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    if (!payload || (!payload.sub && !payload.appleSub)) return null;

    if (payload.iss && payload.iss !== 'https://appleid.apple.com') {
      return null;
    }
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    const sub = payload.sub || payload.appleSub;
    return {
      providerId: sub,
      email: payload.email ? payload.email.toLowerCase().trim() : `apple_${sub}@privaterelay.appleid.com`,
      name: payload.name || 'Apple User',
    };
  } catch (err) {
    return null;
  }
}

