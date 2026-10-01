import React, { useState, useEffect, Suspense } from 'react';
import { AuthUser, fetchCurrentUserApi, setAuthToken, removeAuthToken, getAuthToken, apiFetch, isOrganizationsEnabled } from './lib/api';
import { loadCachedAuthUser, saveCachedAuthUser, saveActiveUserId, clearUserData, isSoundEnabled, saveSoundEnabled } from './lib/storage';
import { Header } from './components/Header';
import { LandingPage, SignupIntent } from './components/LandingPage';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { LegalTabType } from './components/LegalModal';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { resolvePoolCode } from './lib/poolUtils';

import { ModalProvider, useModals } from './contexts/ModalContext';

export { resolvePoolCode };

// Code-split Authenticated Workspace so unauthenticated visitors (and PageSpeed) load 0 bytes of dashboard logic
const AuthenticatedWorkspace = lazyWithRetry(() =>
  import('./components/AuthenticatedWorkspace').then((m) => ({ default: m.AuthenticatedWorkspace }))
);

const AuthModal = lazyWithRetry(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);

const LegalModal = lazyWithRetry(() =>
  import('./components/LegalModal').then((m) => ({ default: m.LegalModal }))
);

function AppContent() {
  // Synchronously consume incoming session token from OAuth redirect before initial render
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const incomingToken = urlParams.get('auth_token') || urlParams.get('token');
    if (incomingToken) {
      if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9-_+/=]+)?$/.test(incomingToken) && incomingToken.length <= 4096) {
        setAuthToken(incomingToken);
      }
      urlParams.delete('auth_token');
      urlParams.delete('token');
      const cleanSearch = urlParams.toString() ? `?${urlParams.toString()}` : '';
      window.history.replaceState({}, '', window.location.pathname + cleanSearch + window.location.hash);
    }
  }

  // Authentication State (Hydrated instantly from local cache)
  const [authUser, setAuthUser] = useState<AuthUser | null>(loadCachedAuthUser);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(isSoundEnabled);

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [signupIntent, setSignupIntent] = useState<SignupIntent | null>(null);
  const [initialLaunchOnboarding, setInitialLaunchOnboarding] = useState(false);
  const [pendingSignupIntent, setPendingSignupIntent] = useState<SignupIntent | null>(null);
  const modals = useModals();

  const handleOpenAuth = (mode: 'login' | 'register' = 'login', intent?: SignupIntent) => {
    if (intent) {
      setSignupIntent(intent);
      setPendingSignupIntent(intent);
    } else {
      setSignupIntent(null);
    }
    setAuthModalMode(mode);
    setIsAuthOpen(true);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${mode}`);
      document.title = `${mode === 'register' ? 'Register' : 'Sign In'} | PantryPool`;
    }
  };

  const handleCloseAuth = () => {
    setIsAuthOpen(false);
    setSignupIntent(null);
    if (typeof window !== 'undefined') {
      const currentHash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (['login', 'register', 'signin', 'signup'].includes(currentHash)) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  };

  // Intercept QR code scan deep links (?action=consume, ?join=, ?item=) for unauthenticated visitors
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const itemId = urlParams.get('item');
    const joinCode = urlParams.get('join');
    const poolId = urlParams.get('pool');

    if (!authUser) {
      if (action === 'consume' && itemId) {
        localStorage.setItem('pantrypool_pending_consume', JSON.stringify({ itemId, poolId, joinCode }));
        if (joinCode) {
          localStorage.setItem('pantrypool_pending_join', joinCode);
        }
        handleOpenAuth('register');
      } else if (joinCode) {
        localStorage.setItem('pantrypool_pending_join', joinCode);
        handleOpenAuth('register');
      }
    }
  }, [authUser]);

  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTabType>('terms');

  // Listen to modals triggered when in visitor mode
  useEffect(() => {
    if (!modals.activeModal) return;
    if (modals.activeModal === 'legal') {
      handleOpenLegal(modals.modalPayload?.tab || 'terms');
      modals.closeModal('legal');
    } else if (modals.activeModal === 'auth') {
      handleOpenAuth(modals.modalPayload?.mode || 'login', modals.modalPayload?.intent);
      modals.closeModal('auth');
    }
  }, [modals.activeModal, modals.modalPayload]);


  const syncCanonicalAndMeta = (path: string) => {
    if (typeof document === 'undefined') return;
    const cleanPath = path === '/' ? '/' : path.replace(/\/+$/, '') || '/';
    const canonicalUrl = `https://pantrypool.com${cleanPath}`;

    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonicalUrl);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      ogUrl.setAttribute('content', canonicalUrl);
    }
  };

  const handleOpenLegal = (tab: LegalTabType = 'terms') => {
    setLegalTab(tab);
    setIsLegalOpen(true);
    if (typeof window !== 'undefined') {
      const tabPath = `/${tab}`;
      window.history.replaceState(null, '', tabPath);
      syncCanonicalAndMeta(tabPath);
      const titleMap: Record<LegalTabType, string> = {
        terms: 'Terms of Service — PantryPool',
        privacy: 'Privacy Policy — PantryPool',
        'user-agreement': 'User Agreement & Acceptable Use Policy — PantryPool',
        cookies: 'Cookie Policy — PantryPool',
      };
      if (titleMap[tab]) {
        document.title = titleMap[tab];
      }
    }
  };

  const handleCloseLegal = () => {
    setIsLegalOpen(false);
    if (typeof window !== 'undefined') {
      const currentPath = (window.location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
      const legalPaths = ['/privacy', '/terms', '/user-agreement', '/cookies', '/legal'];
      if (legalPaths.includes(currentPath)) {
        window.history.replaceState(null, '', '/');
        syncCanonicalAndMeta('/');
        document.title = 'PantryPool — Smart Communal Pantry & Office Breakroom Food Ledger';
      } else {
        const currentHash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
        if (['privacy', 'terms', 'user-agreement', 'cookies', 'legal'].includes(currentHash)) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    }
  };

  const handleToggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      saveSoundEnabled(next);
      return next;
    });
  };

  const handleLogout = () => {
    const token = getAuthToken();
    if (token) {
      apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
    removeAuthToken();
    clearUserData();
    setAuthUser(null);
  };

  // Synchronize URL hash with AuthModal visibility and mode
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentHash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    if (isAuthOpen) {
      const targetHash = authModalMode === 'register' ? 'register' : 'login';
      if (currentHash !== targetHash) {
        window.history.replaceState(null, '', `#${targetHash}`);
      }
      document.title = `${authModalMode === 'register' ? 'Register' : 'Sign In'} | PantryPool`;
    } else if (['login', 'register', 'signin', 'signup'].includes(currentHash)) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [isAuthOpen, authModalMode]);

  // Support deep-linking and browser back/forward buttons via URL hash and pathname
  useEffect(() => {
    const handleRouteSync = () => {
      const path = (window.location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = (searchParams.get('tab') || searchParams.get('page') || searchParams.get('legal') || '').toLowerCase();

      if (path === '/login' || hash === 'login' || path === '/signin' || hash === 'signin' || tabParam === 'login') {
        handleOpenAuth('login');
        return;
      }
      if (path === '/register' || hash === 'register' || path === '/signup' || hash === 'signup' || tabParam === 'register') {
        handleOpenAuth('register');
        return;
      }
      if (path === '/privacy' || hash === 'privacy' || tabParam === 'privacy') {
        handleOpenLegal('privacy');
        syncCanonicalAndMeta('/privacy');
        return;
      }
      if (path === '/terms' || hash === 'terms' || tabParam === 'terms' || path === '/tos' || hash === 'tos') {
        handleOpenLegal('terms');
        syncCanonicalAndMeta('/terms');
        return;
      }
      if (path === '/user-agreement' || hash === 'user-agreement' || tabParam === 'user-agreement') {
        handleOpenLegal('user-agreement');
        syncCanonicalAndMeta('/user-agreement');
        return;
      }
      if (path === '/cookies' || hash === 'cookies' || tabParam === 'cookies') {
        handleOpenLegal('cookies');
        syncCanonicalAndMeta('/cookies');
        return;
      }
      if (path === '/legal' || hash === 'legal' || tabParam === 'legal') {
        handleOpenLegal('terms');
        syncCanonicalAndMeta('/terms');
        return;
      }
      if (path === '/pricing' || hash === 'pricing') {
        syncCanonicalAndMeta('/pricing');
        document.title = 'Pricing Plans — PantryPool';
        const pricingEl = document.getElementById('pricing');
        if (pricingEl) {
          pricingEl.scrollIntoView({ behavior: 'smooth' });
        }
        return;
      }

      syncCanonicalAndMeta(path);
    };

    handleRouteSync();
    window.addEventListener('popstate', handleRouteSync);
    window.addEventListener('hashchange', handleRouteSync);
    return () => {
      window.removeEventListener('popstate', handleRouteSync);
      window.removeEventListener('hashchange', handleRouteSync);
    };
  }, []);

  // Preload AuthModal on unauthenticated marketing visits so sign-in click has 0ms delay
  useEffect(() => {
    if (!authUser) {
      const preloadTimer = setTimeout(() => {
        import('./components/AuthModal').catch(() => {});
      }, 500);
      return () => clearTimeout(preloadTimer);
    }
  }, [authUser]);

  // Preload AuthenticatedWorkspace when auth session exists or when auth modal opens
  useEffect(() => {
    if (authUser || isAuthOpen) {
      import('./components/AuthenticatedWorkspace').catch(() => {});
    }
  }, [authUser, isAuthOpen]);

  // Load current user profile if session token exists
  useEffect(() => {
    async function checkAuth() {
      try {
        const user = await fetchCurrentUserApi();
        if (user) {
          setAuthUser(user);
        } else if (!loadCachedAuthUser()) {
          setAuthUser(null);
        }
      } catch (e) {
        console.warn('[API] Auth check error:', e);
      }
    }
    checkAuth();
  }, []);

  // If user is authenticated, render the full Workspace
  if (authUser) {
    return (
      <Suspense fallback={<DashboardSkeleton />}>
        <AuthenticatedWorkspace
          key={authUser.id}
          authUser={authUser}
          setAuthUser={setAuthUser}
          initialLaunchOnboarding={initialLaunchOnboarding}
          initialSignupIntent={pendingSignupIntent}
          onOpenLegal={handleOpenLegal}
          onLogout={handleLogout}
        />
      </Suspense>
    );
  }

  // Otherwise, render the ultra-lightweight Visitor Marketing Experience
  const visitorUser = {
    id: 'u_visitor',
    name: 'Visitor',
    email: '',
    avatar: '',
    balance: 0,
    role: 'contributor' as const,
    joinedAt: new Date().toISOString(),
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#2D2D2D] flex flex-col font-sans selection:bg-[#FDF0EC] selection:text-[#E8694A]">
      <Header
        pools={[]}
        activeUser={visitorUser}
        authUser={null}
        onOpenAuthModal={() => handleOpenAuth('login')}
        onLogout={() => {}}
        onSelectPool={() => {}}
        onSelectUser={() => {}}
        onOpenCreatePool={() => handleOpenAuth('register')}
        onOpenKiosk={() => {}}
        onOpenReceiptScanner={() => {}}
        onOpenQRScanner={() => {}}
        onOpenPoster={() => {}}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenUserProfile={() => {}}
        onOpenLegal={handleOpenLegal}
      />

      <LandingPage
        onOpenAuthModal={(mode, intent) => handleOpenAuth(mode || 'register', intent)}
        onOpenLegal={handleOpenLegal}
      />

      <CookieConsentBanner onOpenLegal={handleOpenLegal} />

      {/* Lazy Modals loaded on-demand */}
      <Suspense fallback={null}>
        {isAuthOpen && (
          <AuthModal
            isOpen={isAuthOpen}
            onClose={handleCloseAuth}
            initialMode={authModalMode}
            onModeChange={(newMode) => {
              if (newMode === 'login' || newMode === 'register') {
                setAuthModalMode(newMode);
              }
            }}
            onSuccess={(user, intent, token, modeUsed) => {
              clearUserData({ preserveAuthTokens: true });
              if (token) {
                setAuthToken(token);
              }
              saveCachedAuthUser(user);
              saveActiveUserId(user.id);
              if (typeof window !== 'undefined') {
                const currentHash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
                if (['login', 'register', 'signin', 'signup'].includes(currentHash)) {
                  window.history.replaceState(null, '', window.location.pathname);
                }
              }
              const effectiveMode = modeUsed || authModalMode;
              const hasPendingJoin = Boolean(
                typeof window !== 'undefined' &&
                (localStorage.getItem('pantrypool_pending_join') || localStorage.getItem('pantrypool_pending_org_join'))
              );
              if (effectiveMode === 'register' && !hasPendingJoin) {
                setInitialLaunchOnboarding(true);
                if (intent || signupIntent) {
                  setPendingSignupIntent(intent || signupIntent);
                }
              }
              setAuthUser(user);
              setIsAuthOpen(false);
              setSignupIntent(null);
            }}
            signupIntent={signupIntent}
          />
        )}

        {isLegalOpen && (
          <LegalModal
            isOpen={isLegalOpen}
            onClose={handleCloseLegal}
            initialTab={legalTab}
          />
        )}
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <ModalProvider>
      <AppContent />
    </ModalProvider>
  );
}

