import { serve } from "@hono/node-server";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import http from "http";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

import { createUniversalApi, TIER_LIMITS, getTierLimits, normalizeTier } from "./src/server/api/app";
import { MySqlStorageAdapter } from "./src/server/storage/mysqlAdapter";
import { initDatabase, query } from "./db";
import { getMarkdownForPath } from "./src/server/content/siteMarkdown";

dotenv.config();

export { TIER_LIMITS, getTierLimits, normalizeTier };

const PORT = Number(process.env.PORT) || 3000;

// Create the universal Hono API instance with Node.js MySQL storage adapter
const honoApp = createUniversalApi(new MySqlStorageAdapter());

// 0. Enforce canonical apex domain & normalize trailing slashes
honoApp.use("*", async (c, next) => {
  const host = c.req.header("host") || "";
  if (host.startsWith("www.pantrypool.com")) {
    const url = new URL(c.req.url);
    url.hostname = "pantrypool.com";
    url.protocol = "https:";
    return c.redirect(url.toString(), 301);
  }
  const path = c.req.path;
  if (path.length > 1 && path.endsWith("/") && !path.startsWith("/api/")) {
    const cleanPath = path.replace(/\/+$/, "");
    const search = c.req.url.includes("?") ? `?${c.req.url.split("?")[1]}` : "";
    return c.redirect(`${cleanPath}${search}`, 301);
  }
  await next();
});

// Helper to inject self-referential canonical and OG URL tags for SEO
function injectCanonical(html: string, pathname: string): string {
  const cleanPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "") || "/";
  const canonicalUrl = `https://pantrypool.com${cleanPath}`;
  return html
    .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*\/?>/i, `<link rel="canonical" href="${canonicalUrl}" />`)
    .replace(/<meta\s+[^>]*property=["']og:url["'][^>]*\/?>/i, `<meta property="og:url" content="${canonicalUrl}" />`);
}

// 1. Markdown Content Negotiation for AI Agents (Accept: text/markdown)
honoApp.use("*", async (c, next) => {
  const accept = c.req.header("accept") || "";
  const requestPath = c.req.path;
  const isApi = requestPath.startsWith("/api/");
  const isStaticAsset = /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|map|json|woff2?|ttf|eot|webmanifest|txt|xml)$/i.test(requestPath);

  if (accept.includes("text/markdown") && !isApi && !isStaticAsset) {
    const { markdown, tokens } = getMarkdownForPath(requestPath);
    return c.text(markdown, 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "x-markdown-tokens": tokens.toString(),
      "Vary": "Accept",
      "Cache-Control": "public, max-age=3600",
    });
  }

  await next();

  if (!isApi && !isStaticAsset) {
    c.header("Vary", "Accept");
  }
});

// 2. Direct LLM Discovery Endpoints
honoApp.get("/llms.txt", (c) => {
  const llmsFilePath = path.join(process.cwd(), "public", "llms.txt");
  if (fs.existsSync(llmsFilePath)) {
    return c.text(fs.readFileSync(llmsFilePath, "utf8"), 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  }
  return c.text("# PantryPool\n> Smart collaborative grocery and pantry management.\n", 200);
});

honoApp.get("/index.md", (c) => {
  const { markdown, tokens } = getMarkdownForPath("/");
  return c.text(markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "x-markdown-tokens": tokens.toString(),
    "Vary": "Accept",
    "Cache-Control": "public, max-age=3600",
  });
});

// Static frontend serving in production / SPA fallback
const distDir = path.join(process.cwd(), "dist");
const hasDist = fs.existsSync(path.join(distDir, "index.html"));

if (hasDist) {
  // Serve static assets from dist
  honoApp.use("/*", serveStatic({ root: "./dist" }));
  // SPA fallback for HTML5 history API navigation with dynamic canonical URL
  honoApp.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) return c.notFound();
    const distIndexHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
    return c.html(injectCanonical(distIndexHtml, c.req.path), 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Vary": "Accept",
    });
  });
} else {
  // Fallback for development/testing when dist is not yet built
  const rootIndexHtml = path.join(process.cwd(), "index.html");
  const fallbackHtml = fs.existsSync(rootIndexHtml)
    ? fs.readFileSync(rootIndexHtml, "utf8")
    : '<!DOCTYPE html><html><head><title>PantryPool</title><link rel="canonical" href="https://pantrypool.com/" /></head><body><div id="root"></div></body></html>';

  honoApp.get("/", (c) => {
    return c.html(injectCanonical(fallbackHtml, "/"), 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Vary": "Accept",
    });
  });
  honoApp.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) return c.notFound();
    return c.html(injectCanonical(fallbackHtml, c.req.path), 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Vary": "Accept",
    });
  });
}

// Convert Hono app to standard Node.js request listener for Supertest & Node HTTP
const requestListener = getRequestListener(honoApp.fetch);

// Add Express-compatible .listen(...) method to listener
(requestListener as any).listen = function (...args: any[]) {
  const server = http.createServer(requestListener);
  return server.listen(...args);
};

// Expose Hono fetch and request on listener for universal compatibility
(requestListener as any).fetch = honoApp.fetch;
(requestListener as any).request = honoApp.request;

async function startServer() {
  const listenTarget: any = process.env.PORT || 3000;
  const server = http.createServer(requestListener);
  server.listen(listenTarget, () => {
    console.log(`🚀 PantryPool Server listening on ${listenTarget}`);
  });

  server.on("error", (err: any) => {
    console.error("[PantryPool Server Error]", err.message || err);
  });

  initDatabase().catch((dbErr: any) => {
    console.warn("[PantryPool Warning] Background MySQL DB setup note:", dbErr.message || dbErr);
  });
}

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  startServer();
}

export default requestListener;
