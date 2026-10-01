import { StorageAdapter } from "../storage/types";

export interface TokenPayload {
  userId: string;
  email: string;
  name: string;
  systemRole: 'superadmin' | 'admin' | 'user';
  tokenVersion?: number;
  exp?: number;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createUniversalToken(payload: TokenPayload, secret: string, expiresInSec = 86400 * 7): Promise<string> {
  if (!secret || secret.trim() === '') {
    throw new Error('FATAL: JWT_SECRET environment variable is missing on Cloudflare Worker');
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const fullPayload = { ...payload, exp };

  const enc = new TextEncoder();
  const headerPart = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadPart = base64UrlEncode(enc.encode(JSON.stringify(fullPayload)));
  const message = `${headerPart}.${payloadPart}`;

  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const signaturePart = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${message}.${signaturePart}`;
}

export async function verifyUniversalToken(token: string, secret: string, storage?: StorageAdapter): Promise<TokenPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts;
    const message = `${headerPart}.${payloadPart}`;

    const enc = new TextEncoder();
    const key = await getHmacKey(secret);
    const signatureBytes = base64UrlDecode(signaturePart);

    const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes as BufferSource, enc.encode(message));
    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadPart));
    const payload: TokenPayload = JSON.parse(payloadJson);

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (storage && storage.getUserById && payload.userId && payload.tokenVersion !== undefined) {
      const user = await storage.getUserById(payload.userId);
      if (user && user.token_version !== undefined && user.token_version !== payload.tokenVersion) {
        return null;
      }
    }

    return payload;
  } catch {
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

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

export async function comparePassword(password: string, storedHash: string): Promise<boolean> {
  try {
    if (!storedHash) return false;
    if (storedHash.startsWith('pbkdf2$')) {
      const parts = storedHash.split('$');
      if (parts.length !== 4) return false;
      const iterations = parseInt(parts[1], 10);
      const saltBytes = new Uint8Array(parts[2].match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
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
      return timingSafeEqualStr(derivedHex, parts[3]);
    }

    if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
      try {
        const bcrypt = await import('bcryptjs');
        return bcrypt.default.compare(password, storedHash);
      } catch {
        return false;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export interface PasskeyChallengePayload {
  challenge: string;
  userId?: string;
  exp: number;
}

export async function createPasskeyChallengeToken(
  payload: { challenge: string; userId?: string },
  secret: string,
  expiresInSec = 300
): Promise<string> {
  if (!secret || secret.trim() === '') {
    throw new Error('FATAL: JWT_SECRET environment variable is missing');
  }
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const fullPayload: PasskeyChallengePayload = { ...payload, exp };
  const enc = new TextEncoder();
  const headerPart = base64UrlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'CHALLENGE' })));
  const payloadPart = base64UrlEncode(enc.encode(JSON.stringify(fullPayload)));
  const message = `${headerPart}.${payloadPart}`;

  const key = await getHmacKey(secret);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const signaturePart = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${message}.${signaturePart}`;
}

export async function verifyPasskeyChallengeToken(
  token: string,
  secret: string
): Promise<PasskeyChallengePayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerPart, payloadPart, signaturePart] = parts;
    const message = `${headerPart}.${payloadPart}`;

    const enc = new TextEncoder();
    const key = await getHmacKey(secret);
    const signatureBytes = base64UrlDecode(signaturePart);

    const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes as BufferSource, enc.encode(message));
    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadPart));
    const payload: PasskeyChallengePayload = JSON.parse(payloadJson);

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
