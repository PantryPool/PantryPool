/**
 * Canonical browser security headers, shared by every deployment target:
 *   - src/server/api/app.ts        (Universal Hono API: Node + Cloudflare Pages Functions)
 *   - functions/_middleware.ts     (Cloudflare Pages edge middleware)
 *   - public/_headers              (static asset responses on Pages)
 *
 * Keep the Content-Security-Policy allowlists in sync with the third-party origins
 * the client actually loads. Adding a new external dependency means updating
 * CONTENT_SECURITY_POLICY here, not in each deployment file.
 *
 * Allowlist rationale (see src/bootstrap.ts and src/lib/googleAuthClient.ts):
 *   script-src  Google Identity Services (accounts/apis.google.com) + gtag.js
 *   connect-src Google userinfo/GSI + GA4 beacons + client-side OpenFoodFacts barcode lookups
 *   style-src   Google Fonts; 'unsafe-inline' retained for React inline styles
 *   img-src     avatars (api.dicebear.com) and CDN imagery over https
 *
 * NOTE: script-src intentionally omits 'unsafe-inline' and 'unsafe-eval'. Any new
 * executable inline <script> must be externalized (see public/google-callback.js)
 * or the browser will refuse to execute it.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://apis.google.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https://accounts.google.com https://apis.google.com https://www.googleapis.com https://www.google-analytics.com https://*.google-analytics.com https://world.openfoodfacts.org",
  "frame-src https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/**
 * Applies the shared security headers to an outgoing response.
 * `isProd` gates HSTS so local HTTP development is not pinned to TLS.
 */
export function applySecurityHeaders(headers: Headers, isProd: boolean): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  if (isProd) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}
