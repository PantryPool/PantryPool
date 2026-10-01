import { getMarkdownForPath } from './_lib/markdownContent';
import { applySecurityHeaders } from '../src/server/securityHeaders';

/**
 * Cloudflare Pages Functions Middleware
 * Intercepts incoming requests to implement Markdown Content Negotiation for AI Agents.
 * 
 * Complies with isitagentready.com and Cloudflare Markdown for Agents specifications:
 * - Returns clean markdown when Accept: text/markdown is present
 * - Sets Content-Type: text/markdown; charset=utf-8
 * - Sets x-markdown-tokens with token estimate
 * - Sets Vary: Accept
 * - Leaves standard HTML requests untouched
 */
export interface MiddlewareContext {
  request: Request;
  env?: any;
  next: () => Promise<Response>;
}

export const onRequest = async (context: MiddlewareContext): Promise<Response> => {
  const { request, next } = context;
  const accept = request.headers.get('Accept') || '';
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. Enforce canonical apex domain: 301 redirect www.pantrypool.com -> pantrypool.com
  if (url.hostname === 'www.pantrypool.com') {
    url.hostname = 'pantrypool.com';
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }

  // 2. Normalize trailing slashes on subpaths (301 redirect /pricing/ -> /pricing) to match canonical sitemap
  if (path.length > 1 && path.endsWith('/') && !path.startsWith('/api/')) {
    url.pathname = path.replace(/\/+$/, '');
    return Response.redirect(url.toString(), 301);
  }

  const isApi = path.startsWith('/api/');
  const isStaticAsset = /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|json|woff2?|ttf|eot|webmanifest|txt|xml)$/i.test(path);

  // If the agent requests text/markdown and it's not an API or binary asset route
  if (accept.includes('text/markdown') && !isApi && !isStaticAsset) {
    const { markdown, tokens } = getMarkdownForPath(path);
    return new Response(markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'x-markdown-tokens': tokens.toString(),
        'Vary': 'Accept',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // SEC-A02-01: Stamp shared security headers (CSP, COOP, HSTS) onto every response that
  // transits the edge. Wrapping next() rather than returning early keeps the markdown
  // negotiation, canonical rewriting, and missing-asset guards below intact.
  const securedNext = async (): Promise<Response> => {
    const res = await next();
    if (!res.headers.has('Content-Security-Policy')) {
      const secured = new Headers(res.headers);
      applySecurityHeaders(secured, url.protocol === 'https:');
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: secured,
      });
    }
    return res;
  };

  const response = await securedNext();

  // Guard against missing static assets or missing well-known manifests falling back to HTML 200 via SPA routing
  // (Prevents browser "'text/html' is not a valid JavaScript MIME type" errors and agentic schema audit failures)
  if ((path.startsWith('/assets/') || path.startsWith('/.well-known/')) && response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const errorMsg = path.startsWith('/assets/') ? 'Asset not found' : 'Not found';
      return new Response(errorMsg, {
        status: 404,
        statusText: 'Not Found',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }
  }

  // For non-API HTML responses, ensure Vary: Accept is present and canonical/OG tags match requested path
  if (!isApi && !isStaticAsset && response) {
    const newHeaders = new Headers(response.headers);
    const existingVary = newHeaders.get('Vary');
    if (!existingVary) {
      newHeaders.set('Vary', 'Accept');
    } else if (!existingVary.includes('Accept')) {
      newHeaders.set('Vary', `${existingVary}, Accept`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const cleanPath = path === '/' ? '/' : path.replace(/\/+$/, '') || '/';
      const canonicalUrl = `https://pantrypool.com${cleanPath}`;

      const HTMLRewriterClass = (globalThis as any).HTMLRewriter;
      if (typeof HTMLRewriterClass !== 'undefined') {
        return new HTMLRewriterClass()
          .on('link[rel="canonical"]', {
            element(el: any) {
              el.setAttribute('href', canonicalUrl);
            },
          })
          .on('meta[property="og:url"]', {
            element(el: any) {
              el.setAttribute('content', canonicalUrl);
            },
          })
          .transform(new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          }));
      }

      // Fallback for non-HTMLRewriter environments (e.g. Node.js unit tests)
      const htmlText = await response.text();
      const rewrittenHtml = htmlText
        .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*\/?>/i, `<link rel="canonical" href="${canonicalUrl}" />`)
        .replace(/<meta\s+[^>]*property=["']og:url["'][^>]*\/?>/i, `<meta property="og:url" content="${canonicalUrl}" />`);

      return new Response(rewrittenHtml, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  return response;
};
