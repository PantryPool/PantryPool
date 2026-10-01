import { serve } from '@hono/node-server';
import { createUniversalApi } from '../src/server/api/app';
import { InMemoryStorageAdapter } from '../src/server/storage/inMemoryAdapter';

const PORT = Number(process.env.LIVE_SERVER_PORT) || 3099;
const JWT_SECRET = process.env.JWT_SECRET || 'live-e2e-test-jwt-secret-token-key-2026';

export const testStorage = new InMemoryStorageAdapter();
export const app = createUniversalApi(testStorage, JWT_SECRET);

// Health check endpoint for readiness probes
app.get('/api/health', (c) => c.json({ success: true, mode: 'in-memory-test-server', timestamp: new Date().toISOString() }));

// Reset state endpoint for test isolation
app.post('/api/test/reset', async (c) => {
  testStorage.clear();
  return c.json({ success: true, message: 'Storage cleared' });
});

export const server = serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`🚀 [Live Test Server] Running at http://localhost:${info.port} with InMemoryStorageAdapter`);
  }
);

function shutdown() {
  console.log('🛑 [Live Test Server] Shutting down...');
  server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
