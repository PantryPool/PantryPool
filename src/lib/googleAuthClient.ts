/**
 * High-Performance Google Identity Services (GIS) Client Configuration
 * 
 * Provides validated Google Client ID resolution for OAuth2 token flows,
 * avoiding unnecessary cross-origin iframe rendering and FedCM/ITP stalls on iOS Safari.
 */

export const DEFAULT_GOOGLE_CLIENT_ID = '';

export function isValidGoogleClientId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  return /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(trimmed);
}

export function getGoogleClientId(): string {
  const rawClientId =
    (typeof window !== 'undefined' && (window as any).GOOGLE_CLIENT_ID) ||
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    DEFAULT_GOOGLE_CLIENT_ID;
  return rawClientId && isValidGoogleClientId(rawClientId)
    ? rawClientId.trim()
    : DEFAULT_GOOGLE_CLIENT_ID;
}

/**
 * Detects whether the current device is an iPad running iPadOS.
 * (iPadOS Safari reports a desktop Macintosh user agent by default,
 * but exposes touch screen support: navigator.maxTouchPoints > 1).
 */
export function isIPadOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

/**
 * Detects whether the current device is running iOS (iPhone, iPod, or iPad).
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

/**
 * Launches full-page Google OAuth redirect flow (eliminating popup windows completely on iOS / iPadOS).
 */
export function launchGoogleOAuthRedirect(options: { prompt?: string; returnTo?: string } = {}): void {
  if (typeof window === 'undefined') return;

  const clientId = getGoogleClientId();
  // The authorized redirect URI registered in Google Cloud Console
  const redirectUri = window.location.origin.includes('pantrypool.com')
    ? 'https://pantrypool.com/api/auth/google/callback'
    : window.location.origin + '/api/auth/google/callback';

  const nonce = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const stateObj = {
    returnTo: options.returnTo || window.location.href,
    timestamp: Date.now()
  };

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token id_token',
    scope: 'openid email profile',
    prompt: options.prompt || 'select_account',
    nonce,
    state: JSON.stringify(stateObj)
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Optimizes window.open specifically for iPadOS Safari.
 * iPadOS Safari treats window.open with desktop geometry features (width=..., height=...)
 * as unsupported floating popups, causing SpringBoard window-manager pauses and 2-4s "about:blank" stalls.
 * Stripping features for Google OAuth calls allows iPadOS Safari to immediately open a smooth, zero-delay tab.
 */
export function setupIPadOAuthFix(): void {
  if (typeof window === 'undefined') return;
  if (!isIPadOS()) return;

  const w = window as any;
  if (w.__pp_ipad_oauth_fixed) return;
  w.__pp_ipad_oauth_fixed = true;

  const originalOpen = window.open;
  window.open = function (url?: string | URL, target?: string, features?: string) {
    return originalOpen.call(window, url || '', target || '_blank');
  };
}

let gisLoadPromise: Promise<void> | null = null;

/**
 * Dynamically loads Google Identity Services (GSI) script on-demand
 * to prevent ~100KiB of unused JavaScript and render delay on initial page load.
 */
export function ensureGoogleIdentityLoaded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as any;
  if (w.google?.accounts?.oauth2) return Promise.resolve();

  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      if (w.google?.accounts?.oauth2) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => resolve());
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (e) => {
      console.warn('[GIS] Failed to load Google Identity script:', e);
      resolve();
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

