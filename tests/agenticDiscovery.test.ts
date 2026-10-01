import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createUniversalApi } from '../src/server/api/app';
import { AI_CATALOG_MANIFEST } from '../src/server/content/aiCatalog';

describe('Agentic Resource Discovery (ARD) Manifest & Schema Verification', () => {
  const rootDir = path.resolve(__dirname, '..');
  const aiCatalogPath = path.join(rootDir, 'public/.well-known/ai-catalog.json');
  const ardPath = path.join(rootDir, 'public/.well-known/ard.json');
  const redirectsPath = path.join(rootDir, 'public/_redirects');
  const headersPath = path.join(rootDir, 'public/_headers');
  const indexPath = path.join(rootDir, 'index.html');
  const middlewarePath = path.join(rootDir, 'functions/_middleware.ts');

  it('ensures public/.well-known/ai-catalog.json exists and is valid JSON', () => {
    expect(fs.existsSync(aiCatalogPath)).toBe(true);
    const content = fs.readFileSync(aiCatalogPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(AI_CATALOG_MANIFEST);
  });

  it('ensures public/.well-known/ard.json exists and matches ai-catalog.json', () => {
    expect(fs.existsSync(ardPath)).toBe(true);
    const content = fs.readFileSync(ardPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(AI_CATALOG_MANIFEST);
  });

  it('strictly validates schema compliance of AI_CATALOG_MANIFEST', () => {
    expect(AI_CATALOG_MANIFEST.specVersion).toBe('1.0');
    expect(AI_CATALOG_MANIFEST.host).toBeDefined();
    expect(AI_CATALOG_MANIFEST.host.displayName).toBe('PantryPool');
    expect(AI_CATALOG_MANIFEST.host.identifier).toBe('did:web:pantrypool.com');
    expect(AI_CATALOG_MANIFEST.host.documentationUrl).toMatch(/^https?:\/\//);
    expect(AI_CATALOG_MANIFEST.host.logoUrl).toMatch(/^https?:\/\//);

    expect(Array.isArray(AI_CATALOG_MANIFEST.entries)).toBe(true);
    expect(AI_CATALOG_MANIFEST.entries.length).toBeGreaterThan(0);

    for (const entry of AI_CATALOG_MANIFEST.entries) {
      // URN pattern: ^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$
      expect(entry.identifier).toMatch(/^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.type).toBe('application/json');
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.description.length).toBeGreaterThan(10);
      expect(Array.isArray(entry.tags)).toBe(true);
      expect(Array.isArray(entry.capabilities)).toBe(true);
      
      // ARD schema specifies minItems: 2, maxItems: 5 for representativeQueries
      expect(Array.isArray(entry.representativeQueries)).toBe(true);
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(entry.representativeQueries.length).toBeLessThanOrEqual(5);

      expect(entry.version).toBe('1.0.0');
      expect(Number.isNaN(Date.parse(entry.updatedAt))).toBe(false);
    }
  });

  it('verifies public/_redirects explicitly routes missing .well-known routes to 404', () => {
    expect(fs.existsSync(redirectsPath)).toBe(true);
    const content = fs.readFileSync(redirectsPath, 'utf-8');
    expect(content).toContain('/.well-known/*  /404  404');
  });

  it('verifies public/_headers sets CORS and application/json headers for .well-known/*', () => {
    expect(fs.existsSync(headersPath)).toBe(true);
    const content = fs.readFileSync(headersPath, 'utf-8');
    expect(content).toContain('/.well-known/*');
    expect(content).toContain('Access-Control-Allow-Origin: *');
    expect(content).toContain('Content-Type: application/json; charset=utf-8');
  });

  it('verifies index.html advertises ai-catalog and ard link headers', () => {
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain('<link rel="ai-catalog" type="application/json" href="/.well-known/ai-catalog.json" />');
    expect(content).toContain('<link rel="ard" type="application/json" href="/.well-known/ard.json" />');
  });

  it('verifies functions/_middleware.ts guards /.well-known/ from HTML 200 fallback', () => {
    const content = fs.readFileSync(middlewarePath, 'utf-8');
    expect(content).toContain("path.startsWith('/.well-known/')");
  });

  it('serves ai-catalog.json and ard.json via Universal Hono router', async () => {
    const app = createUniversalApi();

    const resCatalog = await app.request('/.well-known/ai-catalog.json');
    expect(resCatalog.status).toBe(200);
    expect(resCatalog.headers.get('content-type')).toContain('application/json');
    const bodyCatalog = await resCatalog.json();
    expect(bodyCatalog.specVersion).toBe('1.0');
    expect(bodyCatalog.host.displayName).toBe('PantryPool');

    const resArd = await app.request('/.well-known/ard.json');
    expect(resArd.status).toBe(200);
    expect(resArd.headers.get('content-type')).toContain('application/json');
    const bodyArd = await resArd.json();
    expect(bodyArd.specVersion).toBe('1.0');
    expect(bodyArd.host.displayName).toBe('PantryPool');
  });
});
