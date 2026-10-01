declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    [key: string]: any;
  }
}

export function initClientBootstrap(): void {
  if (typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  const dataLayer = window.dataLayer;
  const gtag: (...args: any[]) => void = (...args: any[]) => {
    dataLayer.push(args);
  };
  window.gtag = gtag;

  const isLighthouse =
    typeof navigator !== 'undefined' &&
    /Lighthouse|Google-PageSpeed/i.test(navigator.userAgent);
  const isProdSite =
    (window.location.hostname === 'pantrypool.com' ||
      window.location.hostname === 'www.pantrypool.com') &&
    !window.navigator.webdriver &&
    !window.__PLAYWRIGHT__ &&
    !isLighthouse;

  const gaMeasurementId = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GA_MEASUREMENT_ID) || '';

  if (!isProdSite && gaMeasurementId) {
    window[`ga-disable-${gaMeasurementId}`] = true;
  }

  let consentGranted = false;
  try {
    const saved = localStorage.getItem('pantrypool_cookie_consent');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.analytics === true) {
        consentGranted = true;
      }
    }
  } catch (e) {}

  gtag('consent', 'default', {
    analytics_storage: isProdSite && consentGranted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });

  if (isProdSite && gaMeasurementId) {
    gtag('js', new Date());
    gtag('config', gaMeasurementId, {
      anonymize_ip: true,
      send_page_view: false,
    });

    let gtagLoaded = false;
    const removeListeners = () => {
      events.forEach((e) => {
        window.removeEventListener(e, loadGtag, { capture: true });
      });
    };
    const loadGtag = () => {
      if (gtagLoaded) return;
      gtagLoaded = true;
      removeListeners();
      if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) return;
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
      document.head.appendChild(s);
    };

    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];

    events.forEach((e) => {
      window.addEventListener(e, loadGtag, { capture: true, passive: true, once: true });
    });
  }

  // iPadOS Safari OAuth popup optimizer:
  // iPadOS Safari reports a desktop Mac user agent, causing Google GIS to pass desktop window
  // geometry features (width=500,height=550...) to window.open. Because iPadOS lacks floating
  // desktop windows, WebKit pauses on about:blank while evaluating SpringBoard presentation constraints.
  // Stripping features allows iPadOS Safari to open an immediate tab/window without delay.
  if (typeof navigator !== 'undefined') {
    const isIPad =
      /iPad/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (navigator.userAgent.indexOf('Macintosh') !== -1 && navigator.maxTouchPoints > 1);

    if (isIPad && !window.__pp_ipad_oauth_fixed) {
      window.__pp_ipad_oauth_fixed = true;
      const origOpen = window.open;
      window.open = function (url?: string | URL, target?: string, features?: string) {
        return origOpen.call(window, url || '', target || '_blank');
      };
    }
  }
}
