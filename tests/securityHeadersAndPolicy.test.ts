import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { onRequest as cloudflareMiddleware } from '../functions/_middleware';
import { createUniversalApi } from '../src/server/api/app';
import { CONTENT_SECURITY_POLICY } from '../src/server/securityHeaders';
import { InMemoryStorageAdapter } from '../src/server/storage/inMemoryAdapter';

const rootDir = path.resolve(__dirname, '..');
const readFile = (p: string) => fs.readFileSync(path.join(rootDir, p), 'utf8');

const REQUIRED_SECURITY_HEADERS = [
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
];

/**
 * Strict-Transport-Security is deliberately gated behind production so local HTTP
 * development is not pinned to TLS, so it is asserted separately.
 */
const PROD_ONLY_SECURITY_HEADERS = ['strict-transport-security'];

/** Extracts the CSP literal from a Cloudflare Pages `_headers` file. */
function extractCsp(content: string): string {
  const match = content.match(/Content-Security-Policy:\s*(.+)/);
  expect(match, 'Content-Security-Policy directive should be present').toBeTruthy();
  return (match as RegExpMatchArray)[1].trim().replace(/"$/, '');
}

/** Extracts the CSP literal from an Apache `.htaccess` `Header always set` directive. */
function extractHtaccessCsp(content: string): string {
  const match = content.match(/Header\s+always\s+set\s+Content-Security-Policy\s+"([^"]+)"/);
  expect(match, '.htaccess Content-Security-Policy directive should be present').toBeTruthy();
  return (match as RegExpMatchArray)[1].trim();
}

describe('🛡️ Security Headers & Responsible Disclosure Compliance', () => {
  describe('1. CSP policy definition (src/server/securityHeaders.ts)', () => {
    it('never allows unsafe-inline or unsafe-eval in script-src', () => {
      const scriptSrc = CONTENT_SECURITY_POLICY.split(';').map(s => s.trim()).find(s => s.startsWith('script-src'));
      expect(scriptSrc).toBeTruthy();
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
      expect(scriptSrc).toContain("'self'");
    });

    it('locks down object-src and base-uri', () => {
      expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
      expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
      expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    });

    it('allowlists only the third-party origins the client actually loads', () => {
      // Google Identity Services, gtag.js, Google Fonts
      expect(CONTENT_SECURITY_POLICY).toContain('https://accounts.google.com');
      expect(CONTENT_SECURITY_POLICY).toContain('https://apis.google.com');
      expect(CONTENT_SECURITY_POLICY).toContain('https://www.googletagmanager.com');
      expect(CONTENT_SECURITY_POLICY).toContain('https://fonts.googleapis.com');
      expect(CONTENT_SECURITY_POLICY).toContain('https://fonts.gstatic.com');
      // GA4 beacons and the client-side Open Food Facts barcode lookup
      expect(CONTENT_SECURITY_POLICY).toContain('https://www.google-analytics.com');
      expect(CONTENT_SECURITY_POLICY).toContain('https://world.openfoodfacts.org');
      // Google userinfo endpoint used by the OAuth callback script
      expect(CONTENT_SECURITY_POLICY).toContain('https://www.googleapis.com');
    });

    it('does not allowlist Stripe or Turnstile, which this edition does not load', () => {
      expect(CONTENT_SECURITY_POLICY).not.toContain('js.stripe.com');
      expect(CONTENT_SECURITY_POLICY).not.toContain('challenges.cloudflare.com');
    });
  });

  describe('2. Policy parity across every deployment target', () => {
    it('public/_headers carries an identical CSP', () => {
      const content = readFile('public/_headers');
      expect(extractCsp(content)).toBe(CONTENT_SECURITY_POLICY);
    });

    it('.htaccess carries an identical CSP (cPanel / Apache target)', () => {
      const content = readFile('.htaccess');
      expect(extractHtaccessCsp(content)).toBe(CONTENT_SECURITY_POLICY);
    });

    it('.htaccess denies framing consistently with the other targets', () => {
      const content = readFile('.htaccess');
      expect(content).toContain('X-Frame-Options "DENY"');
      expect(content).not.toContain('SAMEORIGIN');
      expect(content).toContain('Cross-Origin-Opener-Policy "same-origin-allow-popups"');
      expect(content).toContain('Permissions-Policy "camera=(self), microphone=(), geolocation=()"');
      expect(content).toContain('Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"');
    });

    it('public/_headers applies security headers to all routes (/*)', () => {
      const content = readFile('public/_headers');
      expect(content).toContain('/*');
      expect(content).toContain('X-Content-Type-Options: nosniff');
      expect(content).toContain('X-Frame-Options: DENY');
      expect(content).toContain('Referrer-Policy: strict-origin-when-cross-origin');
      expect(content).toContain('Permissions-Policy: camera=(self), microphone=(), geolocation=()');
      expect(content).toContain('Cross-Origin-Opener-Policy: same-origin-allow-popups');
      expect(content).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');
      expect(content).toMatch(/script-src\s+'self'(?!\s+'unsafe-inline')/);
    });

    it('retains the .well-known CORS rules consumed by agentic discovery', () => {
      const content = readFile('public/_headers');
      expect(content).toContain('/.well-known/security.txt');
      expect(content).toContain('/.well-known/*');
      expect(content).toContain('Access-Control-Allow-Origin: *');
    });
  });

  describe('3. Zero executable inline scripts', () => {
    it('index.html contains no executable inline <script> blocks', () => {
      const content = readFile('index.html');
      const scriptTags = content.match(/<script\b[^>]*>/g) || [];
      const executable = scriptTags.filter(tag => {
        if (/type=["'](application\/ld\+json|application\/json|importmap)["']/i.test(tag)) return false;
        if (/\bsrc=/i.test(tag)) return false;
        return true;
      });
      expect(executable).toEqual([]);
      // Only the module entrypoint and the JSON-LD data block should remain.
      expect(scriptTags).toHaveLength(2);
    });

    it('Google OAuth callback loads its handler from a same-origin external script', async () => {
      const app = createUniversalApi(new InMemoryStorageAdapter(), 'test-jwt-secret');
      const res = await app.request('/api/auth/google/callback');
      const html = await res.text();

      expect(html).toContain('<script src="/google-callback.js"></script>');
      const inlineBodies = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g) || [];
      expect(inlineBodies).toEqual([]);
    });

    it('public/google-callback.js exists and is a real static asset', () => {
      const jsPath = path.join(rootDir, 'public/google-callback.js');
      expect(fs.existsSync(jsPath)).toBe(true);
      const content = fs.readFileSync(jsPath, 'utf8');
      expect(content).toContain('/api/auth/google');
      expect(content).toContain('id_token');
    });
  });

  describe('4. RFC 9116 security.txt', () => {
    it('is published at both the canonical and legacy paths', () => {
      for (const p of ['public/.well-known/security.txt', 'public/security.txt']) {
        expect(fs.existsSync(path.join(rootDir, p)), `${p} should exist`).toBe(true);
      }
      expect(readFile('public/security.txt')).toBe(readFile('public/.well-known/security.txt'));
    });

    it('carries the fields RFC 9116 requires', () => {
      const content = readFile('public/.well-known/security.txt');
      expect(content).toContain('Contact: mailto:security@pantrypool.com');
      expect(content).toContain('Expires:');
      expect(content).toContain('Canonical: https://pantrypool.com/.well-known/security.txt');
      expect(content).toContain('Preferred-Languages: en');
    });

    it('has an Expires value in the future', () => {
      const content = readFile('public/.well-known/security.txt');
      const expires = content.match(/Expires:\s*(.+)/)?.[1]?.trim();
      expect(expires).toBeTruthy();
      expect(new Date(expires as string).getTime()).toBeGreaterThan(Date.now());
    });

    it('is served as text/plain with permissive CORS', async () => {
      const nextMock = async () => new Response('Contact: mailto:security@pantrypool.com', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });

      const res = await cloudflareMiddleware({
        request: new Request('https://pantrypool.com/.well-known/security.txt'),
        next: nextMock,
      } as any);
      expect(res.headers.get('content-type')).toContain('text/plain');

      const legacy = await cloudflareMiddleware({
        request: new Request('https://pantrypool.com/security.txt'),
        next: nextMock,
      } as any);
      expect(legacy.status).toBe(200);
      expect(legacy.headers.get('content-type')).toContain('text/plain');
    });
  });

  describe('5. Runtime header enforcement', () => {
    it('Universal API stamps every security header on API responses', async () => {
      const app = createUniversalApi(new InMemoryStorageAdapter(), 'test-jwt-secret');
      const res = await app.request('/api/pools');

      for (const header of REQUIRED_SECURITY_HEADERS) {
        expect(res.headers.get(header), `${header} should be set`).toBeTruthy();
      }
      // HSTS is production-gated; the test environment runs over plain HTTP.
      for (const header of PROD_ONLY_SECURITY_HEADERS) {
        expect(res.headers.get(header), `${header} should be absent outside production`).toBeNull();
      }
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
      expect(res.headers.get('content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
    });

    it('Cloudflare Pages middleware stamps the CSP on HTML responses', async () => {
      const res = await cloudflareMiddleware({
        request: new Request('https://pantrypool.com/', { headers: { Accept: 'text/html' } }),
        next: async () => new Response('<!DOCTYPE html><html><head></head><body></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      } as any);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
      expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
    });

    it('Cloudflare Pages middleware stamps the CSP on static asset responses', async () => {
      const res = await cloudflareMiddleware({
        request: new Request('https://pantrypool.com/assets/index-abc123.js'),
        next: async () => new Response('export const x = 1;', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript' },
        }),
      } as any);

      expect(res.headers.get('content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('does not clobber headers already set upstream', async () => {
      const res = await cloudflareMiddleware({
        request: new Request('https://pantrypool.com/api/health'),
        next: async () => new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      } as any);

      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });
});
