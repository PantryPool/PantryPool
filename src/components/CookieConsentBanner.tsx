import React, { useState, useEffect } from 'react';
import { Cookie, Shield, X, Sliders, CheckCircle2 } from 'lucide-react';
import { getStoredConsent, saveConsent } from '../lib/analytics';
import { LegalTabType } from './LegalModal';

interface CookieConsentBannerProps {
  onOpenLegal: (tab: LegalTabType) => void;
  forceOpen?: boolean;
  onCloseSettings?: () => void;
}

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({
  onOpenLegal,
  forceOpen = false,
  onCloseSettings
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [functionalEnabled, setFunctionalEnabled] = useState(true);

  useEffect(() => {
    const existing = getStoredConsent();
    if (!existing) {
      // First time visitor: show banner
      setIsVisible(true);
    } else if (forceOpen) {
      setIsVisible(true);
      setShowCustomize(true);
      setAnalyticsEnabled(existing.analytics);
      setFunctionalEnabled(existing.functional);
    } else {
      setIsVisible(false);
    }
  }, [forceOpen]);

  // Listen for global custom event to reopen preferences
  useEffect(() => {
    const handleReopen = () => {
      const existing = getStoredConsent();
      if (existing) {
        setAnalyticsEnabled(existing.analytics);
        setFunctionalEnabled(existing.functional);
      }
      setIsVisible(true);
      setShowCustomize(true);
    };

    window.addEventListener('open_cookie_preferences', handleReopen);
    return () => window.removeEventListener('open_cookie_preferences', handleReopen);
  }, []);

  const handleAcceptAll = () => {
    saveConsent({
      necessary: true,
      analytics: true,
      functional: true,
      marketing: false
    });
    setIsVisible(false);
    setShowCustomize(false);
    if (onCloseSettings) onCloseSettings();
  };

  const handleEssentialOnly = () => {
    saveConsent({
      necessary: true,
      analytics: false,
      functional: false,
      marketing: false
    });
    setIsVisible(false);
    setShowCustomize(false);
    if (onCloseSettings) onCloseSettings();
  };

  const handleSaveCustom = () => {
    saveConsent({
      necessary: true,
      analytics: analyticsEnabled,
      functional: functionalEnabled,
      marketing: false
    });
    setIsVisible(false);
    setShowCustomize(false);
    if (onCloseSettings) onCloseSettings();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 pointer-events-none flex justify-center animate-fadeIn">
      <div className="pointer-events-auto w-full max-w-3xl bg-white border border-[#E0DAD1] rounded-xl shadow-xl p-5 sm:p-6 text-[#2D2D2D]">
        
        {/* Banner Main View */}
        {!showCustomize ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#FDF0EC] border border-[#E0DAD1] flex items-center justify-center text-[#E8694A] shrink-0">
                  <Cookie className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-[#2D2D2D] flex items-center gap-2">
                    Cookie & Privacy Preferences
                  </h3>
                  <p className="text-xs text-[#6B6B6B] mt-0.5">
                    We use cookies and aggregated analytics to ensure secure sessions and improve breakroom features.
                  </p>
                </div>
              </div>

              <button
                onClick={handleEssentialOnly}
                className="text-[#6B6B6B] hover:text-[#2D2D2D] p-1 rounded-md hover:bg-[#F0EBE3] transition"
                title="Reject non-essential cookies"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#6B6B6B] leading-relaxed">
              By clicking &quot;Accept All&quot;, you consent to our use of analytics cookies for anonymous performance telemetry. You can customize your preferences or read our{' '}
              <button
                onClick={() => onOpenLegal('cookies')}
                className="text-[#C2410C] hover:text-[#9A3412] hover:underline font-semibold"
              >
                Cookie Policy
              </button>{' '}
              and{' '}
              <button
                onClick={() => onOpenLegal('privacy')}
                className="text-[#C2410C] hover:text-[#9A3412] hover:underline font-semibold"
              >
                Privacy Policy
              </button>.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#EDE8E0]">
              <button
                type="button"
                onClick={() => setShowCustomize(true)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] rounded-full transition flex items-center justify-center gap-2"
              >
                <Sliders className="w-3.5 h-3.5" />
                Customize Preferences
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleEssentialOnly}
                  className="flex-1 sm:flex-none px-4 py-2 bg-transparent hover:bg-[#F0EBE3] text-[#2D2D2D] text-xs font-medium rounded-full transition border border-[#E0DAD1]"
                >
                  Essential Only
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="flex-1 sm:flex-none px-5 py-2 bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold text-xs rounded-full shadow-xs transition"
                >
                  Accept All
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Granular Preferences Settings Drawer */
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#E8694A]" />
                <h3 className="text-sm sm:text-base font-semibold text-[#2D2D2D]">Customize Cookie & Data Preferences</h3>
              </div>
              <button
                onClick={() => setShowCustomize(false)}
                className="text-xs text-[#6B6B6B] hover:text-[#2D2D2D]"
              >
                Back
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {/* Essential */}
              <div className="p-3 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#5A9A6B]" />
                    <span className="text-xs font-semibold text-[#2D2D2D]">Strictly Necessary Cookies</span>
                    <span className="text-[10px] bg-[#EDF5EF] text-[#5A9A6B] font-medium px-2 py-0.5 rounded-full border border-[#5A9A6B]/30">
                      Always Active
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B6B6B]">
                    Required for user sessions, authentication security tokens, active pool selection, and CSRF protection.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="w-4 h-4 rounded accent-[#5A9A6B] cursor-not-allowed mt-1"
                />
              </div>

              {/* Analytics */}
              <div className="p-3 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Cookie className="w-4 h-4 text-[#8FB8DE]" />
                    <span className="text-xs font-semibold text-[#2D2D2D]">Analytics & Performance</span>
                    <span className="text-[10px] bg-[#EDF4FA] text-[#8FB8DE] font-medium px-2 py-0.5 rounded-full border border-[#8FB8DE]/30">
                      Optional
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B6B6B]">
                    Collects anonymized statistics on page visits, breakroom kiosk navigation, and app latency.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="consent_analytics_toggle"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#E8694A] cursor-pointer mt-1"
                />
              </div>

              {/* Functional */}
              <div className="p-3 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#D4870E]" />
                    <span className="text-xs font-semibold text-[#2D2D2D]">Functional & Sound Preferences</span>
                  </div>
                  <p className="text-[11px] text-[#6B6B6B]">
                    Saves UI sound chime toggles, theme preferences, and kiosk display customizations.
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="consent_functional_toggle"
                  checked={functionalEnabled}
                  onChange={(e) => setFunctionalEnabled(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#E8694A] cursor-pointer mt-1"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#EDE8E0]">
              <div className="text-[11px] text-[#6B6B6B] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#5A9A6B]" />
                <span>Preferences stored securely</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleEssentialOnly}
                  className="flex-1 sm:flex-none px-4 py-2 bg-transparent hover:bg-[#F0EBE3] text-[#2D2D2D] text-xs font-medium rounded-full transition border border-[#E0DAD1]"
                >
                  Reject Optional
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustom}
                  className="flex-1 sm:flex-none px-5 py-2 bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold text-xs rounded-full shadow-xs transition"
                >
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
