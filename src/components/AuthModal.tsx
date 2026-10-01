import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, Lock, User, LogIn, UserPlus, AlertCircle, KeyRound, ArrowLeft, CheckCircle2, Sparkles, Fingerprint } from 'lucide-react';
import { registerUserApi, loginUserApi, forgotPasswordApi, resetPasswordApi, googleLoginApi, appleLoginApi, fetchPublicSettingsApi, getPasskeyAuthOptionsApi, verifyPasskeyAuthApi, AuthUser, setAuthToken } from '../lib/api';
import { PantryPoolIcon } from './Logo';
import { getGoogleClientId, setupIPadOAuthFix, isIPadOS, isIOS, launchGoogleOAuthRedirect, ensureGoogleIdentityLoaded } from '../lib/googleAuthClient';

import { LegalTabType } from './LegalModal';
import { SignupIntent } from './LandingPage';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  signupIntent?: SignupIntent | null;
  onClose: () => void;
  onSuccess: (user: AuthUser, intent?: SignupIntent | null, token?: string, mode?: 'login' | 'register' | 'forgot' | 'reset') => void;
  onModeChange?: (mode: 'login' | 'register' | 'forgot' | 'reset') => void;
  onOpenLegal?: (tab: LegalTabType) => void;
  initialResetToken?: string | null;
  initialResetEmail?: string | null;
}

const DEFAULT_GOOGLE_CLIENT_ID = '';

function isValidGoogleClientId(clientId: string | undefined): boolean {
  if (!clientId || typeof clientId !== 'string') return false;
  const trimmed = clientId.trim();
  if (!trimmed || trimmed.includes('YOUR_GOOGLE_CLIENT_ID') || trimmed.startsWith('YOUR_')) {
    return false;
  }
  return /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(trimmed);
}

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  initialMode = 'login',
  signupIntent = null,
  onClose, 
  onSuccess, 
  onModeChange,
  onOpenLegal,
  initialResetToken,
  initialResetEmail
}) => {
  const [mode, setModeState] = useState<'login' | 'register' | 'forgot' | 'reset'>(initialMode || 'login');

  const setMode = (newMode: 'login' | 'register' | 'forgot' | 'reset') => {
    setModeState(newMode);
    onModeChange?.(newMode);
  };

  useEffect(() => {
    if (isOpen && initialMode) {
      setModeState(initialMode);
    }
  }, [isOpen, initialMode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [appleLoginEnabled, setAppleLoginEnabled] = useState(false);
  const tokenClientRef = useRef<any>(null);

  const handleOAuthTokenResponse = async (tokenResponse: any) => {
    if (tokenResponse?.error) {
      setLoading(false);
      if (tokenResponse.error !== 'access_denied') {
        setError(tokenResponse.error_description || tokenResponse.error || 'Google sign-in was cancelled or failed.');
      }
      return;
    }

    const rawToken = tokenResponse?.access_token || tokenResponse?.credential || tokenResponse?.id_token;
    if (rawToken) {
      try {
        let userinfo: any = null;
        if (tokenResponse.access_token) {
          try {
            const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
            });
            if (userinfoRes.ok) {
              userinfo = await userinfoRes.json();
            }
          } catch (e) {
            console.warn('[GIS OAuth2] Userinfo fetch warning:', e);
          }
        }

        const res = await googleLoginApi({
          credential: tokenResponse.credential || tokenResponse.id_token || tokenResponse.access_token,
          accessToken: tokenResponse.access_token,
          googleId: userinfo?.sub,
          email: userinfo?.email,
          name: userinfo?.name || (userinfo?.email ? userinfo.email.split('@')[0] : undefined),
          avatarUrl: userinfo?.picture,
        });

        if (res.success && res.user) {
          onSuccess(res.user, signupIntent, res.token);
          onClose();
          return;
        } else {
          setError(res.error || 'Google authentication failed.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to complete Google authentication.');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  };

  const handleOAuthError = (err: any) => {
    console.warn('[GIS OAuth2] Error callback:', err);
    setLoading(false);
    setError('Google sign-in popup window closed or cancelled.');
  };

  useEffect(() => {
    setupIPadOAuthFix();
    if (!isOpen) return;
    let isMounted = true;

    // Pre-initialize Google OAuth token client on-demand so user click fires synchronously
    ensureGoogleIdentityLoaded().then(() => {
      if (!isMounted) return;
      const google = typeof window !== 'undefined' && (window as any).google;
      if (google?.accounts?.oauth2) {
        try {
          tokenClientRef.current = google.accounts.oauth2.initTokenClient({
            client_id: getGoogleClientId(),
            scope: 'email profile openid',
            prompt: 'select_account',
            callback: handleOAuthTokenResponse,
            error_callback: handleOAuthError,
          });
        } catch (e) {
          console.warn('[GIS OAuth2] Pre-init error:', e);
        }
      }
    });

    fetchPublicSettingsApi().then((s) => {
      if (!isMounted || !s) return;
      if (typeof s.appleLoginEnabled === 'boolean') {
        setAppleLoginEnabled(s.appleLoginEnabled);
      }
    });

    if (initialResetToken) {
      setMode('reset');
      setResetToken(initialResetToken);
      if (initialResetEmail) {
        setEmail(initialResetEmail);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialResetToken, initialResetEmail]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!name.trim()) {
          setError('Please enter your full name');
          setLoading(false);
          return;
        }
        const res = await registerUserApi(email, password, name);
        if (res.success && res.user) {
          onSuccess(res.user, signupIntent, res.token, 'register');
          onClose();
        } else {
          setError(res.error || 'Registration failed.');
        }
      } else if (mode === 'login') {
        const res = await loginUserApi(email, password);
        if (res.success && res.user) {
          onSuccess(res.user, signupIntent, res.token, 'login');
          onClose();
        } else {
          setError(res.error || 'Login failed.');
        }
      } else if (mode === 'forgot') {
        if (!email.trim() || !email.includes('@')) {
          setError('Please enter a valid email address.');
          setLoading(false);
          return;
        }
        const res = await forgotPasswordApi(email.trim());
        if (res.success) {
          setSuccessMessage(res.message || 'If an account exists, a reset link has been dispatched to your email.');
        } else {
          setError(res.error || 'Failed to process password reset request.');
        }
      } else if (mode === 'reset') {
        if (!password || password.length < 8) {
          setError('Password must be at least 8 characters long.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        const res = await resetPasswordApi(resetToken, password);
        if (res.success) {
          setSuccessMessage('Password reset successfully! You can now sign in.');
          setTimeout(() => {
            setMode('login');
            setPassword('');
            setConfirmPassword('');
            setResetToken('');
            setSuccessMessage(null);
          }, 2000);
        } else {
          setError(res.error || 'Failed to reset password. Link may be expired.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };


  const handleAppleSignInClick = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter your Apple ID email address above to sign in.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const targetName = name.trim() || cleanEmail.split('@')[0];
      const res = await appleLoginApi({
        appleSub: 'apple_sub_' + Math.random().toString(36).substring(2, 8),
        email: cleanEmail,
        name: targetName
      });
      if (res.success && res.user) {
        onSuccess(res.user, signupIntent, res.token);
        onClose();
      } else {
        setError(res.error || 'Apple ID Sign In failed.');
      }
    } catch (err: any) {
      setError(err.message || 'Apple ID authentication error.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignInClick = () => {
    setError(null);
    setLoading(true);

    // On iPadOS & iOS, bypass popup windows completely using full-page OAuth redirect
    if (isIPadOS() || isIOS()) {
      launchGoogleOAuthRedirect({ prompt: 'select_account' });
      return;
    }

    setupIPadOAuthFix();
    const google = typeof window !== 'undefined' && (window as any).google;

    // 1. Fast-track: Fire pre-warmed token client synchronously on line 1 of user touch
    if (tokenClientRef.current) {
      try {
        tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err: any) {
        console.warn('[GIS OAuth2] Pre-warmed launch error:', err);
      }
    }

    // 2. Direct fallback: Initialize and fire synchronously
    if (google?.accounts?.oauth2) {
      try {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: getGoogleClientId(),
          scope: 'email profile openid',
          prompt: 'select_account',
          callback: handleOAuthTokenResponse,
          error_callback: handleOAuthError,
        });
        tokenClientRef.current = client;
        client.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err: any) {
        console.warn('[GIS OAuth2] Direct init error:', err);
      }
    }

    setLoading(false);
    setError('Google Sign-In is connecting. Please check your network and try again.');
  };

  const handlePasskeySignInClick = async () => {
    setError(null);
    setLoading(true);
    try {
      const { browserSupportsWebAuthn, startAuthentication } = await import('@simplewebauthn/browser');
      if (!browserSupportsWebAuthn()) {
        setError('Passkeys are not supported on this browser or device.');
        setLoading(false);
        return;
      }

      const optRes = await getPasskeyAuthOptionsApi(email?.trim() || undefined);
      if (!optRes.success || !optRes.options) {
        setError(optRes.error || 'Failed to start passkey sign-in.');
        setLoading(false);
        return;
      }

      const authResult = await startAuthentication({ optionsJSON: optRes.options });

      const verifyRes = await verifyPasskeyAuthApi({
        response: authResult,
        challengeToken: optRes.challengeToken,
      });

      if (verifyRes.success && verifyRes.user) {
        onSuccess(verifyRes.user, signupIntent, verifyRes.token);
        onClose();
      } else {
        setError(verifyRes.error || 'Passkey authentication failed.');
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError(null);
      } else {
        setError(err.message || 'Passkey authentication cancelled or failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2D2D]/40 animate-fadeIn">
      <div className="relative w-full max-w-md bg-white border border-[#E0DAD1] rounded-xl shadow-xl overflow-hidden p-6 text-[#2D2D2D]">
        
        {/* Header Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#6B6B6B] hover:text-[#2D2D2D] p-1.5 rounded-md hover:bg-[#F0EBE3] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title / Hero Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-3">
            <img
              src="/PantryPoolLogo.jpg"
              alt="PantryPool Application Logo"
              className="w-12 h-12 rounded-xl object-contain shadow-xs border border-[#E0DAD1] bg-white p-0.5"
            />
          </div>
          <h2 className="text-xl font-semibold text-[#2D2D2D]">
            {mode === 'login' && 'Welcome back to PantryPool'}
            {mode === 'register' && 'Create your PantryPool account'}
            {mode === 'forgot' && 'Reset Your Password'}
            {mode === 'reset' && 'Set New Password'}
          </h2>
          <p className="text-xs text-[#6B6B6B] mt-1">
            {mode === 'login' && 'Sign in to access your shared pools and balances'}
            {mode === 'register' && 'Join communal pantry pools with transparent ledger tracking'}
            {mode === 'forgot' && 'Enter your email address to receive password reset instructions'}
            {mode === 'reset' && 'Choose a strong password with at least 8 characters'}
          </p>

          {signupIntent?.tier && (mode === 'register' || mode === 'login') && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EDF5EF] border border-[#D5E8D9] text-[#2C6E3B] text-[11px] font-medium">
              <Sparkles className="w-3.5 h-3.5 text-[#5A9A6B]" />
              <span>
                Selected Plan: {
                  signupIntent.tier === 'plus'
                    ? (signupIntent.billingCycle === 'yearly' ? 'Hosted Plus ($119/yr)' : 'Hosted Plus ($12/mo)')
                    : signupIntent.tier === 'standard'
                    ? (signupIntent.billingCycle === 'yearly' ? 'Hosted Standard ($49/yr)' : 'Hosted Standard ($5/mo)')
                    : 'Community Edition (Free)'
                }
              </span>
            </div>
          )}
        </div>

        {/* Mode Tab Switcher (Only visible for Login / Register) */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex bg-[#F0EBE3] p-1 rounded-lg border border-[#E0DAD1] mb-5">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
                mode === 'login'
                  ? 'bg-[#E8694A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 ${
                mode === 'register'
                  ? 'bg-[#E8694A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Create Account
            </button>
          </div>
        )}

        {/* Back to Login Button for Forgot / Reset */}
        {(mode === 'forgot' || mode === 'reset') && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
              className="inline-flex items-center gap-1.5 text-xs text-[#6B6B6B] hover:text-[#E8694A] transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-4 p-3 rounded-md bg-[#EDF5EF] border border-[#5A9A6B]/30 text-[#5A9A6B] text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-md bg-[#FDF0EC] border border-[#C9553D]/30 text-[#C9553D] text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                <input
                  type="text"
                  required
                  placeholder="Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] rounded-md py-2 pl-9 pr-3 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] outline-none transition"
                />
              </div>
            </div>
          )}

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] rounded-md py-2 pl-9 pr-3 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] outline-none transition"
                />
              </div>
            </div>
          )}

          {mode === 'reset' && (
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Reset Verification Token
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                <input
                  type="text"
                  required
                  placeholder="Paste token from email link"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] rounded-md py-2 pl-9 pr-3 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] outline-none transition"
                />
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-[#2D2D2D]">
                  {mode === 'reset' ? 'New Password' : 'Password'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); setSuccessMessage(null); }}
                    className="text-[11px] text-[#E8694A] hover:underline font-medium"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                <input
                  type="password"
                  required
                  minLength={mode === 'reset' ? 8 : 6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] rounded-md py-2 pl-9 pr-3 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] outline-none transition"
                />
              </div>
            </div>
          )}

          {mode === 'reset' && (
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white border border-[#E0DAD1] focus:border-[#E8694A] focus:ring-1 focus:ring-[#E8694A] rounded-md py-2 pl-9 pr-3 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] outline-none transition"
                />
              </div>
            </div>
          )}

          {/* Legal Agreement Notice */}
          {mode === 'register' && (
            <p className="text-[11px] text-[#6B6B6B] leading-normal px-0.5">
              By creating an account, you agree to PantryPool&apos;s{' '}
              <a
                href="/terms"
                onClick={(e) => {
                  if (onOpenLegal) {
                    e.preventDefault();
                    onOpenLegal('terms');
                  }
                }}
                className="text-[#E8694A] hover:underline font-medium"
              >
                Terms of Service
              </a>
              ,{' '}
              <a
                href="/user-agreement"
                onClick={(e) => {
                  if (onOpenLegal) {
                    e.preventDefault();
                    onOpenLegal('user-agreement');
                  }
                }}
                className="text-[#E8694A] hover:underline font-medium"
              >
                User Agreement
              </a>
              , and acknowledge our{' '}
              <a
                href="/privacy"
                onClick={(e) => {
                  if (onOpenLegal) {
                    e.preventDefault();
                    onOpenLegal('privacy');
                  }
                }}
                className="text-[#E8694A] hover:underline font-medium"
              >
                Privacy Policy
              </a>
              .
            </p>
          )}

          {mode === 'login' && (
            <p className="text-[11px] text-[#6B6B6B] leading-normal text-center px-0.5">
              By signing in, you agree to our{' '}
              <a
                href="/terms"
                onClick={(e) => {
                  if (onOpenLegal) {
                    e.preventDefault();
                    onOpenLegal('terms');
                  }
                }}
                className="text-[#E8694A] hover:underline font-medium"
              >
                Terms of Service
              </a>{' '}
              and acknowledge our{' '}
              <a
                href="/privacy"
                onClick={(e) => {
                  if (onOpenLegal) {
                    e.preventDefault();
                    onOpenLegal('privacy');
                  }
                }}
                className="text-[#E8694A] hover:underline font-medium"
              >
                Privacy Policy
              </a>
              .
            </p>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium rounded-full shadow-xs transition flex items-center justify-center gap-2 text-xs disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : mode === 'login' ? (
              <>
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </>
            ) : mode === 'register' ? (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                Create Account
              </>
            ) : mode === 'forgot' ? (
              <>
                <Mail className="w-3.5 h-3.5" />
                Send Reset Instructions
              </>
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5" />
                Set New Password
              </>
            )}
          </button>
        </form>

        {/* Social & OAuth Sign-In Buttons (Only for login / register) */}
        {(mode === 'login' || mode === 'register') && (
          <>
            {/* Divider */}
            <div className="relative my-5 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#EDE8E0]" />
              </div>
              <span className="relative px-3 bg-white text-[11px] font-medium text-[#9A9A9A]">
                or continue with
              </span>
            </div>

            <div className="space-y-2">
              {/* Passkey Sign-In Button */}
              <button
                type="button"
                onClick={handlePasskeySignInClick}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#F8F6F2] hover:bg-[#EFEAE2] border border-[#E0DAD1] text-[#2D2D2D] font-medium rounded-full transition flex items-center justify-center gap-2 text-xs shadow-xs active:scale-[0.99] disabled:opacity-50"
              >
                <Fingerprint className="w-4 h-4 text-[#E8694A]" />
                <span>Sign in with Passkey</span>
              </button>

              {/* Custom-Styled Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignInClick}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-white hover:bg-[#F0EBE3] border border-[#E0DAD1] text-[#2D2D2D] font-medium rounded-full transition flex items-center justify-center gap-2.5 text-xs shadow-xs active:scale-[0.99] disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12 0 12.3c0 2.6.7 4.9 1.9 7.3l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>

          {/* Sign in with Apple Button (Feature Flagged) */}
          {appleLoginEnabled && (
            <button
              type="button"
              onClick={handleAppleSignInClick}
              disabled={loading}
              className="w-full py-2 px-4 bg-black hover:bg-neutral-900 text-white font-medium rounded-full transition flex items-center justify-center gap-2 text-xs shadow-xs active:scale-[0.99] disabled:opacity-50"
            >
              <svg className="w-4 h-4 fill-current text-white mb-0.5" viewBox="0 0 170 170">
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.16-1.9-14.48-6.1-3.23-2.63-7.14-7.27-11.73-13.91-6.1-8.85-11.05-18.73-14.85-29.64-3.8-10.91-5.7-21.57-5.7-31.97 0-15.08 3.82-27.42 11.46-37.03 7.64-9.61 17.5-14.54 29.58-14.79 4.83 0 10.05 1.18 15.66 3.54 5.61 2.36 9.49 3.59 11.64 3.7 2.02 0 6.01-1.31 11.96-3.93 5.95-2.62 10.97-3.82 15.07-3.6 11.18.52 20.3 4.54 27.36 12.06-23.77 14.4-23.36 37.91 1.25 49.33-5.24 13.08-12.28 26.04-21.13 38.88zm-22.39-97.16c0 7.21-2.63 14.07-7.89 20.58-6.42 7.84-14.18 12.35-22.84 11.76-.14-1.05-.21-2.02-.21-2.92 0-7.07 2.82-14.06 8.46-20.97 5.64-6.91 13.32-11.13 23.04-12.66.14 1.4.21 2.76.21 4.09z"/>
              </svg>
              <span>Sign in with Apple</span>
            </button>
          )}

        </div>
      </>
    )}

      </div>
    </div>
  );
};
