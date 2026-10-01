import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createUniversalApi } from '../src/server/api/app';

describe('Anti-Drift Architectural Guardrail: Single Source of Truth API', () => {
  const rootDir = path.resolve(__dirname, '..');
  const legacyRoutesDir = path.join(rootDir, 'functions/api/_routes');
  const legacyRouterFile = path.join(rootDir, 'functions/api/_router.ts');
  const edgeEntryPoint = path.join(rootDir, 'functions/api/[[path]].ts');
  const universalRoutesDir = path.join(rootDir, 'src/server/api/routes');

  it('permanently forbids legacy duplicate routes folder (functions/api/_routes)', () => {
    expect(
      fs.existsSync(legacyRoutesDir),
      'CRITICAL ARCHITECTURAL VIOLATION: functions/api/_routes MUST NOT exist. All API endpoints must be implemented in src/server/api/routes/.'
    ).toBe(false);
  });

  it('permanently forbids legacy EdgeRouter file (functions/api/_router.ts)', () => {
    expect(
      fs.existsSync(legacyRouterFile),
      'CRITICAL ARCHITECTURAL VIOLATION: functions/api/_router.ts MUST NOT exist. Cloudflare Pages Functions must delegate directly to Universal Hono.'
    ).toBe(false);
  });

  it('enforces that Cloudflare Pages Functions [[path]].ts delegates to createUniversalApi', () => {
    expect(fs.existsSync(edgeEntryPoint)).toBe(true);
    const content = fs.readFileSync(edgeEntryPoint, 'utf-8');
    expect(content).toContain("import { createUniversalApi } from '../../src/server/api/app';");
    expect(content).toMatch(/createUniversalApi\s*\(/);
    expect(content).toMatch(/app\.fetch\s*\(/);
  });

  it('verifies all expected modular route controllers exist in src/server/api/routes/', () => {
    const requiredRouteModules = [
      'admin.ts',
      'ai.ts',
      'auth.ts',
      'barcodes.ts',
      'items.ts',
      'notifications.ts',
      'organizations.ts',
      'pools.ts',
      'shoppingPolls.ts',
      'sync.ts',
      'telemetry.ts',
      'transactions.ts',
      'webhooks.ts'
    ];

    for (const mod of requiredRouteModules) {
      const fullPath = path.join(universalRoutesDir, mod);
      expect(
        fs.existsSync(fullPath),
        `Universal route module src/server/api/routes/${mod} is required for full API parity.`
      ).toBe(true);
    }
  });

  it('mounts Universal API instance with 100% route registration and no exceptions', () => {
    const app = createUniversalApi();
    expect(app).toBeDefined();

    // Inspect registered routes on Hono app instance
    const routes = app.routes.map(r => `${r.method} ${r.path}`);

    // Verify previously drifted or missing endpoints are registered
    expect(routes).toContain('POST /api/organizations/onboard');
    expect(routes).toContain('DELETE /api/organizations/:id');
    expect(routes).toContain('POST /api/slack/commands');
    expect(routes).toContain('POST /api/slack/interactivity');
    expect(routes).toContain('POST /api/teams/messages');
    expect(routes).toContain('GET /api/db/status');
    expect(routes).not.toContain('GET /api/auth/sso/status');
    expect(routes).toContain('POST /api/users/link-provider');
    expect(routes).toContain('GET /api/health');
    expect(routes).toContain('POST /api/auth/register');
    expect(routes).toContain('POST /api/auth/login');
    expect(routes).toContain('POST /api/auth/refresh');
    expect(routes).toContain('POST /api/pools/join');
    expect(routes).toContain('PUT /api/pools/:poolId/members/:userId/role');
    expect(routes).toContain('GET /api/webhooks');
    expect(routes).toContain('POST /api/webhooks');
    expect(routes).toContain('DELETE /api/webhooks/:id');
    expect(routes).not.toContain('POST /api/stripe/portal');
    expect(routes).not.toContain('GET /api/affiliate/products');
    expect(routes).toContain('DELETE /api/notifications/:id');
    expect(routes).toContain('GET /api/admin/ai-usage');
    expect(routes).toContain('GET /api/admin/email-logs');
    expect(routes).toContain('POST /api/ai-log-applied');
    expect(routes).toContain('PUT /api/admin/users/:id/role');
    expect(routes).toContain('POST /api/auth/passkey/register-options');
    expect(routes).toContain('POST /api/auth/passkey/register-verify');
    expect(routes).toContain('POST /api/auth/passkey/auth-options');
    expect(routes).toContain('POST /api/auth/passkey/auth-verify');
    expect(routes).toContain('GET /api/auth/passkey/list');
    expect(routes).toContain('DELETE /api/auth/passkey/:id');
    expect(routes).toContain('POST /api/pools/:poolId/verify-kiosk-pin');
    expect(routes).toContain('GET /api/shopping-list');
    expect(routes).toContain('POST /api/shopping-list');
    expect(routes).toContain('GET /api/polls');
    expect(routes).toContain('POST /api/polls');
  });

  it('permanently forbids API route tests from importing legacy Express server (server.ts)', () => {
    const testsDir = path.resolve(__dirname, '../tests');
    const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.ts') || f.endsWith('.test.tsx'));

    const allowedExpressFiles = new Set(['markdownNegotiation.test.ts']);

    for (const file of testFiles) {
      if (allowedExpressFiles.has(file)) continue;
      const content = fs.readFileSync(path.join(testsDir, file), 'utf-8');
      const importsServer = /from\s+['"][^'"]*\/server['"]/.test(content);
      expect(
        importsServer,
        `ARCHITECTURAL VIOLATION in ${file}: API tests must target createUniversalApi / app.request, never the legacy Express server.ts.`
      ).toBe(false);
    }
  });

  it('permanently forbids tests from combining legacy Express server imports with raw db mocks', () => {
    const testsDir = path.resolve(__dirname, '../tests');
    const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.ts') || f.endsWith('.test.tsx'));

    for (const file of testFiles) {
      const content = fs.readFileSync(path.join(testsDir, file), 'utf-8');
      const mocksDb = /vi\.mock\s*\(\s*['"][^'"]*\/db['"]/.test(content);
      const importsServer = /from\s+['"][^'"]*\/server['"]/.test(content);
      
      expect(
        mocksDb && importsServer,
        `ARCHITECTURAL VIOLATION in ${file}: Legacy Express app combined with mocked db queries violates AGENTS.md Rule 1 and Rule 5. API tests must target Universal Hono with StorageAdapter.`
      ).toBe(false);
    }
  });

  it('verifies shared test fixtures (InMemoryStorageAdapter, createTestApp) exist and are available', () => {
    const adapterPath = path.resolve(__dirname, '../src/test/InMemoryStorageAdapter.ts');
    const harnessPath = path.resolve(__dirname, '../src/test/createTestApp.ts');

    expect(fs.existsSync(adapterPath), 'InMemoryStorageAdapter.ts must exist as canonical test fixture').toBe(true);
    expect(fs.existsSync(harnessPath), 'createTestApp.ts must exist as canonical test fixture').toBe(true);
  });
});

