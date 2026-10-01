import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { initClientBootstrap } from './bootstrap';
import App from './App.tsx';
import './index.css';
import { initPerformanceTracking } from './lib/performance';
import { telemetry } from './lib/telemetry';
import { ErrorBoundary } from './components/ErrorBoundary';

// Initialize early client bootstrap (Consent Mode v2 and iPadOS Safari OAuth popup patch)
initClientBootstrap();

// Initialize Core Web Vitals, TTFB, and Navigation tracking immediately
initPerformanceTracking();

// Initialize first-party telemetry and global unhandled error listeners
telemetry.init();

// Global listener for Vite dynamic import preload errors (deployment chunk skew)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[Vite] Preload error detected. Reloading for latest application bundle...', event);
    try {
      const lastReload = sessionStorage.getItem('pp_chunk_reload_ts');
      const now = Date.now();
      if (!lastReload || now - Number(lastReload) > 10000) {
        sessionStorage.setItem('pp_chunk_reload_ts', String(now));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

