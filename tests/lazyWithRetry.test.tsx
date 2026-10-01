import React, { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  isChunkLoadError,
  triggerChunkReload,
  lazyWithRetry,
  CHUNK_RELOAD_STORAGE_KEY,
} from '../src/lib/lazyWithRetry';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { telemetry } from '../src/lib/telemetry';

describe('🛡️ Resilient Dynamic Import & Chunk Recovery (lazyWithRetry & ErrorBoundary)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();

    // Mock window.location.reload
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalLocation,
        reload: vi.fn(),
        href: 'https://pantrypool.com/',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  describe('isChunkLoadError', () => {
    it('should identify MIME type mismatch errors', () => {
      expect(isChunkLoadError(new TypeError("'text/html' is not a valid JavaScript MIME type."))).toBe(true);
      expect(isChunkLoadError(new Error("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\"."))).toBe(true);
    });

    it('should identify dynamic import fetch errors', () => {
      expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://pantrypool.com/assets/AuthModal-old.js"))).toBe(true);
      expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    });

    it('should identify ChunkLoadError and loading chunk errors', () => {
      const chunkErr = new Error('Loading chunk 42 failed.');
      chunkErr.name = 'ChunkLoadError';
      expect(isChunkLoadError(chunkErr)).toBe(true);
    });

    it('should return false for regular application runtime errors', () => {
      expect(isChunkLoadError(new Error('Cannot read properties of undefined (reading "name")'))).toBe(false);
      expect(isChunkLoadError(new Error('Network error: status 500'))).toBe(false);
      expect(isChunkLoadError(null)).toBe(false);
    });
  });

  describe('triggerChunkReload', () => {
    it('should trigger window.location.reload and record timestamp in sessionStorage', () => {
      const reloaded = triggerChunkReload(new Error("'text/html' is not a valid JavaScript MIME type."));
      expect(reloaded).toBe(true);
      expect(window.location.reload).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)).not.toBeNull();
    });

    it('should honor cooldown to prevent infinite reload loop', () => {
      // First reload succeeds
      const first = triggerChunkReload(new Error('MIME type mismatch'));
      expect(first).toBe(true);
      expect(window.location.reload).toHaveBeenCalledTimes(1);

      // Immediate second call within cooldown should return false and not reload again
      const second = triggerChunkReload(new Error('MIME type mismatch'));
      expect(second).toBe(false);
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });
  });

  describe('lazyWithRetry', () => {
    it('should load component normally on success', async () => {
      const MockComponent = () => <div>Loaded Component</div>;
      const LazyComp = lazyWithRetry(async () => ({ default: MockComponent }));

      render(
        <Suspense fallback={<div>Loading...</div>}>
          <LazyComp />
        </Suspense>
      );

      expect(await screen.findByText('Loaded Component')).toBeTruthy();
    });

    it('should intercept chunk MIME error and trigger reload', async () => {
      const mimeError = new TypeError("'text/html' is not a valid JavaScript MIME type.");
      const LazyComp = lazyWithRetry(async () => {
        throw mimeError;
      });

      render(
        <Suspense fallback={<div>Loading Skeleton...</div>}>
          <LazyComp />
        </Suspense>
      );

      // Suspense fallback remains rendered while reload happens
      expect(screen.getByText('Loading Skeleton...')).toBeTruthy();
      await vi.waitFor(() => {
        expect(window.location.reload).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('ErrorBoundary chunk recovery', () => {
    it('renders "Update Available" UI when chunk error occurs and suppresses error telemetry', () => {
      // Simulate that a reload already occurred within cooldown
      sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(Date.now()));
      const trackErrorSpy = vi.spyOn(telemetry, 'trackError').mockImplementation(() => {});

      const ThrowingComponent = () => {
        throw new TypeError("'text/html' is not a valid JavaScript MIME type.");
      };

      // Suppress console.error in test output for intentional error boundary catch
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Update Available')).toBeTruthy();
      expect(
        screen.getByText(/A new version of PantryPool was just deployed/i)
      ).toBeTruthy();
      expect(screen.getByText('Update & Reload')).toBeTruthy();

      // Chunk skew after deployment is normal operational turnover and must not be logged to error telemetry
      expect(trackErrorSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('renders generic fallback and tracks telemetry for non-chunk errors', () => {
      const trackErrorSpy = vi.spyOn(telemetry, 'trackError').mockImplementation(() => {});
      const GenericThrowingComponent = () => {
        throw new Error('Database connection failed');
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <GenericThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeTruthy();
      expect(screen.getByText('Database connection failed')).toBeTruthy();
      expect(screen.getByText('Reload App')).toBeTruthy();

      // Genuine runtime crashes must still be reported to telemetry
      expect(trackErrorSpy).toHaveBeenCalledWith(
        'react_render_crash',
        expect.any(Error),
        expect.objectContaining({
          location: 'https://pantrypool.com/',
        })
      );

      consoleSpy.mockRestore();
    });
  });
});
