// Google Analytics and Consent Management Utility
export const GA_MEASUREMENT_ID = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GA_MEASUREMENT_ID) || '';
export const CONSENT_STORAGE_KEY = 'pantrypool_cookie_consent';

export interface CookieConsentPreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
  timestamp: string;
  version: string;
}

const DEFAULT_CONSENT: CookieConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  functional: true,
  timestamp: '',
  version: '1.0'
};

export function getStoredConsent(): CookieConsentPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveConsent(preferences: Partial<CookieConsentPreferences>): CookieConsentPreferences {
  const updated: CookieConsentPreferences = {
    ...DEFAULT_CONSENT,
    ...preferences,
    necessary: true, // Strictly necessary is always true
    timestamp: new Date().toISOString(),
    version: '1.0'
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[Analytics] Failed to save cookie consent to localStorage', e);
    }

    // Update Google Consent Mode v2
    if (typeof (window as any).gtag === 'function') {
      (window as any).gtag('consent', 'update', {
        analytics_storage: updated.analytics ? 'granted' : 'denied',
        ad_storage: updated.marketing ? 'granted' : 'denied',
        ad_user_data: updated.marketing ? 'granted' : 'denied',
        ad_personalization: updated.marketing ? 'granted' : 'denied'
      });

      if (updated.analytics) {
        (window as any).gtag('event', 'consent_granted', {
          event_category: 'legal_compliance',
          event_label: 'analytics_allowed'
        });
        trackPageView();
      }
    }
  }

  return updated;
}

export function trackEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
    const consent = getStoredConsent();
    // Strict Opt-In (GDPR / ePrivacy): only track if user affirmatively consented
    if (!consent || !consent.analytics) {
      return;
    }
    (window as any).gtag('event', eventName, params);
  }
}

/**
 * Tracks a virtual page view in Google Analytics 4 (GA4) with custom title, path, and location.
 *
 * Supports flexible parameters:
 * - trackPageView('Title', '/path')
 * - trackPageView('Title', 'https://example.com/#path')
 * - trackPageView('Title', '/path', 'https://example.com/#path')
 */
export function trackPageView(pageTitle?: string, pagePathOrLocation?: string, pageLocation?: string) {
  if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
    const consent = getStoredConsent();
    // Strict Opt-In (GDPR / ePrivacy): only track if user affirmatively consented
    if (!consent || !consent.analytics) {
      return;
    }

    const title = pageTitle || (typeof document !== 'undefined' ? document.title : 'PantryPool');
    let path = '/';
    let loc = typeof window !== 'undefined' ? window.location.href : '/';

    if (pagePathOrLocation) {
      if (pagePathOrLocation.startsWith('http://') || pagePathOrLocation.startsWith('https://')) {
        loc = pagePathOrLocation;
        try {
          const u = new URL(pagePathOrLocation);
          path = (u.pathname === '/' && u.hash) ? '/' + u.hash.replace(/^#\/?/, '') : (u.pathname || '/');
        } catch {
          path = typeof window !== 'undefined' ? window.location.pathname || '/' : '/';
        }
      } else {
        path = pagePathOrLocation.replace(/^#\/?/, '');
        if (!path.startsWith('/')) path = '/' + path;
        loc = pageLocation || (typeof window !== 'undefined' ? `${window.location.origin}${path}` : path);
      }
    } else if (typeof window !== 'undefined') {
      if (window.location.hash) {
        path = '/' + window.location.hash.replace(/^#\/?/, '');
      } else {
        path = window.location.pathname || '/';
      }
      loc = pageLocation || `${window.location.origin}${path}`;
    }

    // Keep document.title synchronized for tabs/screens
    if (pageTitle && typeof document !== 'undefined') {
      document.title = pageTitle;
    }

    (window as any).gtag('event', 'page_view', {
      page_title: title,
      page_location: loc,
      page_path: path
    });
  }
}

