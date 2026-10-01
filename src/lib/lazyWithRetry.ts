import React, { ComponentType, lazy, LazyExoticComponent } from 'react';

/**
 * Checks if an error is caused by deployment chunk skew,
 * such as a deleted chunk returning HTML 200 (MIME type mismatch)
 * or a 404 network failure on a stale chunk bundle.
 */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = ((err as any)?.message || String(err)).toLowerCase();
  const name = ((err as any)?.name || '').toLowerCase();

  return (
    name === 'chunkloaderror' ||
    msg.includes('mime type') ||
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('failed to load module script') ||
    msg.includes('importing a module script failed')
  );
}

export const CHUNK_RELOAD_STORAGE_KEY = 'pp_chunk_reload_ts';
const COOLDOWN_MS = 10000; // 10-second cooldown to avoid infinite reload loops

/**
 * Attempts to automatically reload the page once if a chunk load error occurs,
 * bypassing cached HTML/chunks to fetch the latest deployment assets.
 * Returns true if a reload was initiated, false if suppressed by cooldown.
 */
export function triggerChunkReload(err?: unknown): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const lastReload = sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY);
    const now = Date.now();

    if (!lastReload || now - Number(lastReload) > COOLDOWN_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
      console.warn('[PantryPool] Stale chunk / MIME mismatch detected after deployment. Auto-reloading latest version...', err);
      window.location.reload();
      return true;
    }
  } catch {
    // sessionStorage might throw in restrictive iframe/private browsing modes
    window.location.reload();
    return true;
  }

  return false;
}

/**
 * Resilient React.lazy wrapper that intercepts deployment chunk skew and
 * automatically reloads the page to acquire the latest bundle manifest.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: unknown) {
      if (isChunkLoadError(err)) {
        const reloaded = triggerChunkReload(err);
        if (reloaded) {
          // Return a hanging promise while page reloads so React Suspense
          // keeps displaying fallback UI instead of crashing the ErrorBoundary
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw err;
    }
  });
}
