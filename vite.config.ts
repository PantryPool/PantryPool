import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(
        process.env.VITE_GOOGLE_CLIENT_ID ||
        process.env.GOOGLE_CLIENT_ID ||
        ''
      ),
      'import.meta.env.VITE_ENABLE_ORGANIZATIONS': JSON.stringify(
        process.env.VITE_ENABLE_ORGANIZATIONS || 'true'
      ),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        'cloudflare:sockets': path.resolve(import.meta.dirname, 'src/test/mocks/cloudflareSockets.ts'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/') || id.includes('/use-sync-external-store/')) {
                return 'vendor-react';
              }
              if (id.includes('framer-motion') || id.includes('/motion/') || id.includes('/motion-dom/') || id.includes('/motion-utils/')) {
                return 'vendor-motion';
              }
              if (id.includes('qrcode') || id.includes('jsqr')) {
                return 'vendor-qr';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
            }
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: process.env.VITE_API_PROXY ? {
        '/api': {
          target: process.env.VITE_API_PROXY,
          changeOrigin: true,
        },
      } : undefined,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
      benchmark: {
        enabled: false,
        suppressExportGetterWarnings: false,
      } as any,
    },
  };
});
