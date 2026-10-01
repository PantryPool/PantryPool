import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../server';
import { onRequest as cloudflareMiddleware } from '../functions/_middleware';
import { getMarkdownForPath, estimateTokens } from '../src/server/content/siteMarkdown';

describe('🤖 Markdown Content Negotiation for AI Agents', () => {
  describe('Node.js Server Content Negotiation', () => {
    it('GET / with Accept: text/markdown returns markdown with tokens and Vary header', async () => {
      const res = await request(app)
        .get('/')
        .set('Accept', 'text/markdown');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['x-markdown-tokens']).toBeDefined();
      expect(Number(res.headers['x-markdown-tokens'])).toBeGreaterThan(50);
      expect(res.headers['vary']).toContain('Accept');
      expect(res.text).toContain('# PantryPool');
      expect(res.text).toContain('Smart Office Snack Club');
    });

    it('GET / without Accept: text/markdown returns standard HTML by default', async () => {
      const res = await request(app)
        .get('/')
        .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['vary']).toContain('Accept');
    });

    it('GET /organize with Accept: text/markdown returns pantry organizer catalog', async () => {
      const res = await request(app)
        .get('/organize')
        .set('Accept', 'text/markdown');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['x-markdown-tokens']).toBeDefined();
      expect(res.text).toContain('# Pantry Organization Products');
      expect(res.text).toContain('Airtight Food Storage');
    });

    it('GET /pricing with Accept: text/markdown returns pricing breakdown', async () => {
      const res = await request(app)
        .get('/pricing')
        .set('Accept', 'text/markdown');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.text).toContain('# PantryPool Pricing');
      expect(res.text).toContain('Hosted Standard — $5 / month');
    });

    it('GET /privacy with Accept: text/markdown returns privacy policy', async () => {
      const res = await request(app)
        .get('/privacy')
        .set('Accept', 'text/markdown');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['x-markdown-tokens']).toBeDefined();
      expect(res.text).toContain('# PantryPool Privacy Policy');
      expect(res.text).toContain('GDPR & CCPA Compliant');
    });

    it('GET /terms with Accept: text/markdown returns terms of service', async () => {
      const res = await request(app)
        .get('/terms')
        .set('Accept', 'text/markdown');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['x-markdown-tokens']).toBeDefined();
      expect(res.text).toContain('# PantryPool Terms of Service');
      expect(res.text).toContain('Billing, Cancellation, and Refund Policy');
      expect(res.text).toContain('14-Day Refund Window');
    });

    it('GET /llms.txt serves standard LLM discovery context', async () => {
      const res = await request(app).get('/llms.txt');

      expect(res.status).toBe(200);
      expect(res.text).toContain('# PantryPool');
      expect(res.text).toContain('/index.md');
      expect(res.text).toContain('/organize');
    });

    it('GET /index.md serves direct markdown representation', async () => {
      const res = await request(app).get('/index.md');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['x-markdown-tokens']).toBeDefined();
      expect(res.text).toContain('# PantryPool — The Smart Office Snack Club App & Breakroom Food Ledger');
    });

    it('API endpoints (/api/health) are untouched by markdown negotiation', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Accept', 'text/markdown');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.service).toContain('PantryPool');
    });

    it('301 redirects www.pantrypool.com to pantrypool.com apex domain on Node.js server', async () => {
      const res = await request(app)
        .get('/user-agreement')
        .set('Host', 'www.pantrypool.com');

      expect(res.status).toBe(301);
      expect(res.headers['location']).toBe('https://pantrypool.com/user-agreement');
    });

    it('301 redirects trailing slash paths to canonical URL on Node.js server', async () => {
      const res = await request(app).get('/pricing/');

      expect(res.status).toBe(301);
      expect(res.headers['location']).toBe('/pricing');
    });

    it('injects dynamic canonical URL for subpaths on Node.js server', async () => {
      const res = await request(app).get('/user-agreement');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<link rel="canonical" href="https://pantrypool.com/user-agreement" />');
      expect(res.text).toContain('<meta property="og:url" content="https://pantrypool.com/user-agreement" />');
    });
  });

  describe('Cloudflare Pages Middleware (_middleware.ts)', () => {
    it('intercepts requests with Accept: text/markdown and returns markdown response', async () => {
      const requestObj = new Request('https://pantrypool.com/', {
        headers: {
          Accept: 'text/markdown',
        },
      });

      const nextMock = vi.fn();
      const context: any = {
        request: requestObj,
        next: nextMock,
      };

      const response = await cloudflareMiddleware(context);

      expect(nextMock).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
      expect(response.headers.get('x-markdown-tokens')).toBeDefined();
      expect(response.headers.get('Vary')).toBe('Accept');
      const text = await response.text();
      expect(text).toContain('# PantryPool');
    });

    it('passes through standard HTML requests and appends Vary: Accept', async () => {
      const requestObj = new Request('https://pantrypool.com/app', {
        headers: {
          Accept: 'text/html',
        },
      });

      const fakeHtmlResponse = new Response('<!DOCTYPE html><html><body>App</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

      const nextMock = vi.fn().mockResolvedValue(fakeHtmlResponse);
      const context: any = {
        request: requestObj,
        next: nextMock,
      };

      const response = await cloudflareMiddleware(context);

      expect(nextMock).toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.headers.get('Vary')).toContain('Accept');
      const text = await response.text();
      expect(text).toContain('App');
    });

    it('bypasses /api/ routes completely even when Accept: text/markdown is present', async () => {
      const requestObj = new Request('https://pantrypool.com/api/health', {
        headers: {
          Accept: 'text/markdown',
        },
      });

      const fakeApiResponse = new Response(JSON.stringify({ status: 'healthy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const nextMock = vi.fn().mockResolvedValue(fakeApiResponse);
      const context: any = {
        request: requestObj,
        next: nextMock,
      };

      const response = await cloudflareMiddleware(context);

      expect(nextMock).toHaveBeenCalled();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('healthy');
    });

    it('returns 404 when an /assets/ request falls back to HTML 200 (deployment chunk skew)', async () => {
      const requestObj = new Request('https://pantrypool.com/assets/stale-chunk-abc.js');
      const fakeSpaHtmlFallback = new Response('<!doctype html><html>...</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });

      const nextMock = vi.fn().mockResolvedValue(fakeSpaHtmlFallback);
      const context: any = {
        request: requestObj,
        next: nextMock,
      };

      const response = await cloudflareMiddleware(context);

      expect(nextMock).toHaveBeenCalled();
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toContain('text/plain');
      expect(await response.text()).toBe('Asset not found');
    });

    it('returns 404 when a /.well-known/ request falls back to HTML 200', async () => {
      const requestObj = new Request('https://pantrypool.com/.well-known/unknown.json', {
        headers: { Accept: 'application/json' },
      });
      const fakeSpaHtmlFallback = new Response('<!doctype html><html>...</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });

      const nextMock = vi.fn().mockResolvedValue(fakeSpaHtmlFallback);
      const context: any = {
        request: requestObj,
        next: nextMock,
      };

      const response = await cloudflareMiddleware(context);

      expect(nextMock).toHaveBeenCalled();
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toContain('text/plain');
      expect(await response.text()).toBe('Not found');
    });

    it('301 permanently redirects www.pantrypool.com requests to pantrypool.com apex domain', async () => {
      const requestObj = new Request('https://www.pantrypool.com/user-agreement');
      const nextMock = vi.fn();
      const context: any = {
        request: requestObj,
        next: nextMock,
      };

      const response = await cloudflareMiddleware(context);

      expect(nextMock).not.toHaveBeenCalled();
      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe('https://pantrypool.com/user-agreement');
    });

    it('301 redirects trailing slash paths to canonical non-trailing slash URL', async () => {
      const requestObj = new Request('https://pantrypool.com/pricing/');
      const nextMock = vi.fn();
      const context: any = {
        request: requestObj,
        next: nextMock,
      };

      const response = await cloudflareMiddleware(context);

      expect(nextMock).not.toHaveBeenCalled();
      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe('https://pantrypool.com/pricing');
    });

    it('dynamically rewrites canonical and og:url tags for subpages like /user-agreement', async () => {
      const requestObj = new Request('https://pantrypool.com/user-agreement');
      const mockRawHtml = `<!doctype html>
<html>
  <head>
    <link rel="canonical" href="https://pantrypool.com/" />
    <meta property="og:url" content="https://pantrypool.com/" />
  </head>
  <body><div id="root"></div></body>
</html>`;

      const fakeResponse = new Response(mockRawHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });

      const nextMock = vi.fn().mockResolvedValue(fakeResponse);
      const context: any = {
        request: requestObj,
        next: nextMock,
      };

      const response = await cloudflareMiddleware(context);
      expect(response.status).toBe(200);

      const html = await response.text();
      expect(html).toContain('<link rel="canonical" href="https://pantrypool.com/user-agreement" />');
      expect(html).toContain('<meta property="og:url" content="https://pantrypool.com/user-agreement" />');
    });
  });

  describe('Markdown Generator & Token Estimation Unit Logic', () => {
    it('estimates tokens accurately (~4 chars per token)', () => {
      const sample = '12345678';
      expect(estimateTokens(sample)).toBe(2);
      expect(estimateTokens('123456789')).toBe(3);
    });

    it('resolves distinct route markdown representations', () => {
      const home = getMarkdownForPath('/');
      const organize = getMarkdownForPath('/organize');
      const pricing = getMarkdownForPath('/pricing');

      expect(home.markdown).toContain('# PantryPool');
      expect(organize.markdown).toContain('Airtight Food Storage');
      expect(pricing.markdown).toContain('Hosted Standard');
    });
  });
});
