import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LegalModal } from '../src/components/LegalModal';
import { CookieConsentBanner } from '../src/components/CookieConsentBanner';
import { saveConsent, getStoredConsent, trackEvent, trackPageView, CONSENT_STORAGE_KEY } from '../src/lib/analytics';

describe('Legal & Consent Compliance System', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('LegalModal Component (src/components/LegalModal.tsx)', () => {
    it('should not render when isOpen is false', () => {
      const { container } = render(<LegalModal isOpen={false} onClose={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('should render Terms of Service by default', () => {
      render(<LegalModal isOpen={true} onClose={vi.fn()} initialTab="terms" />);
      expect(screen.getByText(/PantryPool Terms of Service/i)).toBeInTheDocument();
      expect(screen.getByText(/Billing, Cancellation, and Refund Policy/i)).toBeInTheDocument();
      expect(screen.getByText(/14-Day Refund Window/i)).toBeInTheDocument();
      expect(screen.getByText(/Cancellation Terms/i)).toBeInTheDocument();
      expect(screen.getByText(/Texas/i)).toBeInTheDocument();
    });

    it('should switch between tabs: User Agreement, Privacy Policy, Cookie Policy and invoke onTabChange', () => {
      const onTabChange = vi.fn();
      render(<LegalModal isOpen={true} onClose={vi.fn()} initialTab="terms" onTabChange={onTabChange} />);

      // Switch to User Agreement
      fireEvent.click(screen.getByRole('button', { name: /User Agreement/i }));
      expect(screen.getByText(/Community Trust & Fairness Standard/i)).toBeInTheDocument();
      expect(onTabChange).toHaveBeenCalledWith('user-agreement');

      // Switch to Privacy Policy
      fireEvent.click(screen.getByRole('button', { name: /Privacy Policy/i }));
      expect(screen.getByText(/GDPR & CCPA Compliant/i)).toBeInTheDocument();
      expect(screen.getByText(/Google Analytics & Performance/i)).toBeInTheDocument();
      expect(onTabChange).toHaveBeenCalledWith('privacy');

      // Switch to Cookie Policy
      fireEvent.click(screen.getByRole('button', { name: /Cookie Policy/i }));
      expect(screen.getByText(/Essential & Strictly Necessary Storage/i)).toBeInTheDocument();
      expect(screen.getByText(/Managing Your Cookie Preferences/i)).toBeInTheDocument();
      expect(onTabChange).toHaveBeenCalledWith('cookies');
    });

    it('should copy shareable link to clipboard when clicking Share button', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(<LegalModal isOpen={true} onClose={vi.fn()} initialTab="privacy" />);
      const shareButton = screen.getByRole('button', { name: /Share/i });
      expect(shareButton).toBeInTheDocument();

      fireEvent.click(shareButton);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('/privacy'));
        expect(screen.getByText(/Copied!/i)).toBeInTheDocument();
      });
    });

    it('should trigger onClose when clicking acknowledge button', () => {
      const onClose = vi.fn();
      render(<LegalModal isOpen={true} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /I Understand & Acknowledge/i }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('CookieConsentBanner Component (src/components/CookieConsentBanner.tsx)', () => {
    it('should show consent banner if no preference is stored', () => {
      const onOpenLegal = vi.fn();
      render(<CookieConsentBanner onOpenLegal={onOpenLegal} />);
      expect(screen.getByText(/Cookie & Privacy Preferences/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Accept All/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Essential Only/i })).toBeInTheDocument();
    });

    it('should save analytics consent when clicking Accept All', async () => {
      const onOpenLegal = vi.fn();
      render(<CookieConsentBanner onOpenLegal={onOpenLegal} />);

      fireEvent.click(screen.getByRole('button', { name: /Accept All/i }));

      await waitFor(() => {
        const stored = getStoredConsent();
        expect(stored).not.toBeNull();
        expect(stored?.analytics).toBe(true);
        expect(stored?.necessary).toBe(true);
      });
    });

    it('should save denied analytics when clicking Essential Only', async () => {
      const onOpenLegal = vi.fn();
      render(<CookieConsentBanner onOpenLegal={onOpenLegal} />);

      fireEvent.click(screen.getByRole('button', { name: /Essential Only/i }));

      await waitFor(() => {
        const stored = getStoredConsent();
        expect(stored).not.toBeNull();
        expect(stored?.analytics).toBe(false);
        expect(stored?.necessary).toBe(true);
      });
    });

    it('should open customization drawer and allow granular toggling', async () => {
      const onOpenLegal = vi.fn();
      render(<CookieConsentBanner onOpenLegal={onOpenLegal} />);

      fireEvent.click(screen.getByRole('button', { name: /Customize Preferences/i }));
      expect(screen.getByText(/Customize Cookie & Data Preferences/i)).toBeInTheDocument();

      const analyticsToggle = document.getElementById('consent_analytics_toggle') as HTMLInputElement;
      expect(analyticsToggle).toBeInTheDocument();
      fireEvent.click(analyticsToggle); // Toggle off

      fireEvent.click(screen.getByRole('button', { name: /Save Preferences/i }));

      await waitFor(() => {
        const stored = getStoredConsent();
        expect(stored?.analytics).toBe(false);
      });
    });
  });

  describe('Analytics Utility (src/lib/analytics.ts)', () => {
    it('should properly update gtag consent state', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;

      saveConsent({ analytics: true, functional: true });

      expect(mockGtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({
        analytics_storage: 'granted',
        ad_storage: 'denied'
      }));

      saveConsent({ analytics: false, functional: true });

      expect(mockGtag).toHaveBeenCalledWith('consent', 'update', expect.objectContaining({
        analytics_storage: 'denied'
      }));
    });

    it('should send page_view event with title and path in trackPageView when consented', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      saveConsent({ analytics: true });
      mockGtag.mockClear();

      trackPageView('Catalog — Snack Haven', '/catalog');

      expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({
        page_title: 'Catalog — Snack Haven',
        page_path: '/catalog'
      }));
      expect(document.title).toBe('Catalog — Snack Haven');
    });

    it('should correctly derive path from hash or URL in trackPageView', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      saveConsent({ analytics: true });
      mockGtag.mockClear();

      trackPageView('Expense Ledger', 'https://pantrypool.com/#ledger');

      expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({
        page_title: 'Expense Ledger',
        page_path: '/ledger',
        page_location: 'https://pantrypool.com/#ledger'
      }));
    });

    it('should suppress trackPageView and trackEvent when user has not consented (strict opt-in)', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      localStorage.clear();

      trackPageView('Admin Console', '/admin');
      expect(mockGtag).not.toHaveBeenCalled();

      trackEvent('select_content', { content_type: 'tab' });
      expect(mockGtag).not.toHaveBeenCalled();
    });

    it('should suppress trackPageView and trackEvent when user explicitly chose Essential Only', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;

      saveConsent({ analytics: false });
      mockGtag.mockClear();

      trackPageView('Admin Console', '/admin');
      expect(mockGtag).not.toHaveBeenCalled();

      trackEvent('select_content', { content_type: 'tab' });
      expect(mockGtag).not.toHaveBeenCalled();
    });

    it('should dispatch custom events in trackEvent when consented', () => {
      const mockGtag = vi.fn();
      (window as any).gtag = mockGtag;
      saveConsent({ analytics: true });
      mockGtag.mockClear();

      trackEvent('consume_item', { item_name: 'Almond Milk', amount: 3.5 });

      expect(mockGtag).toHaveBeenCalledWith('event', 'consume_item', {
        item_name: 'Almond Milk',
        amount: 3.5
      });
    });
  });
});
