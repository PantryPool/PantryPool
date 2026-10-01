import { Hono } from 'hono';
import { StorageAdapter } from '../storage/types';
import { D1StorageAdapter } from '../storage/d1Adapter';
import { verifyUniversalToken, TokenPayload } from './authUtils';
import { TIER_LIMITS, getTierLimits, normalizeTier } from './tierLimits';
import { applySecurityHeaders } from '../securityHeaders';
import { parseNaturalLanguageHaul } from './routes/ai';

// Modular Route Controllers
import { registerAuthRoutes } from './routes/auth';
import { registerOrganizationRoutes } from './routes/organizations';
import { registerPoolRoutes } from './routes/pools';
import { registerItemRoutes } from './routes/items';
import { registerTransactionRoutes } from './routes/transactions';
import { registerShoppingPollRoutes } from './routes/shoppingPolls';
import { registerNotificationRoutes } from './routes/notifications';
import { registerWebhookRoutes } from './routes/webhooks';
import { registerAiRoutes } from './routes/ai';
import { registerBarcodeRoutes } from './routes/barcodes';
import { registerAdminRoutes } from './routes/admin';
import { registerSyncRoutes } from './routes/sync';
import { registerTelemetryRoutes } from './routes/telemetry';
import { registerContactRoutes } from './routes/contact';
import { registerDiscoveryRoutes } from './routes/discovery';
import { dispatchEdgeErrorAlert } from './sreAlerts';
import { rateLimitMiddleware } from './rateLimit';

export { TIER_LIMITS, getTierLimits, normalizeTier, parseNaturalLanguageHaul, dispatchEdgeErrorAlert };

export type HonoEnv = {
  Variables: {
    storage: StorageAdapter;
    user?: TokenPayload;
    jwtSecret: string;
  };
  Bindings: {
    pantrypool_db?: any;
    JWT_SECRET?: string;
    ENVIRONMENT?: string;
    INITIAL_ADMIN_EMAIL?: string;
    GEMINI_API_KEY?: string;
    GEMINI_OCR_MODEL?: string;
    TYPESAFE_API_KEY?: string;
    GCP_SERVICE_ACCOUNT_KEY?: string;
    GCP_CLIENT_EMAIL?: string;
    GCP_PRIVATE_KEY?: string;
    GCP_PROJECT_ID?: string;
    GCP_LOCATION?: string;
    GOOGLE_CLOUD_PROJECT?: string;
    GOOGLE_CLOUD_LOCATION?: string;
    EMAIL_RELAY_SECRET?: string;
    EMAIL_RELAY_URL?: string;
    SLACK_SIGNING_SECRET?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    SRE_ALERT_WEBHOOK_URL?: string;
    ALERT_WEBHOOK_URL?: string;
  };
};

export function createUniversalApi(defaultStorage?: StorageAdapter, defaultSecret?: string) {
  const app = new Hono<HonoEnv>();

  // Global error handler ensuring JSON 500 responses and real-time SRE alert dispatch
  app.onError((err, c) => {
    console.error('[Universal API Error]:', err);

    dispatchEdgeErrorAlert(c, {
      level: 'critical',
      error: err,
      route: c.req?.path,
      method: c.req?.method
    });

    return c.json({
      success: false,
      error: `Internal Server Error: ${err?.message || 'Unexpected server error'}`
    }, 500);
  });

  // CORS middleware
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin') || '';
    const env = c.env as any;
    const isProd = (env?.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production');

    let allowedOrigin = 'https://pantrypool.com';
    if (!isProd) {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        allowedOrigin = origin;
      }
    } else {
      if (origin === 'https://pantrypool.com' || origin === 'http://pantrypool.com') {
        allowedOrigin = origin;
      }
    }

    c.header('Access-Control-Allow-Origin', allowedOrigin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Relay-Secret');
    c.header('Access-Control-Allow-Credentials', 'true');

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }
    await next();
  });

  // SEC-A02-01: Global Security Headers Middleware
  app.use('*', async (c, next) => {
    await next();
    const env = c.env as any;
    const isProd = (env?.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production');
    applySecurityHeaders(c.res.headers, isProd);
  });

  // SEC-A07-02: Universal In-Memory Rate Limiting Middleware
  app.use('*', rateLimitMiddleware());

  // Inject Storage & JWT Secret Middleware
  app.use('*', async (c, next) => {
    const env = c.env as any;
    const isEdge = Boolean(env && (env.pantrypool_db || env.JWT_SECRET !== undefined));
    const isProd = (env?.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production');

    // SEC-A02-02: In production, never permit the weak test fallback secret
    let secret = defaultSecret || (isEdge ? env?.JWT_SECRET : (env?.JWT_SECRET || process.env.JWT_SECRET));
    if (!secret && !isEdge && !isProd) {
      secret = 'test-only-secret-do-not-use-in-production';
    }
    if (isProd && (!secret || secret === 'test-only-secret-do-not-use-in-production')) {
      throw new Error('FATAL: JWT_SECRET environment variable is missing in production');
    }
    c.set('jwtSecret', secret);

    if (defaultStorage) {
      c.set('storage', defaultStorage);
    } else if (env?.pantrypool_db) {
      c.set('storage', new D1StorageAdapter(env.pantrypool_db));
    }

    // Parse Authorization header if present
    const authHeader = c.req.header('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const storage = c.get('storage');
      const user = await verifyUniversalToken(token, secret, storage);
      if (user) {
        c.set('user', user);
      }
    }

    await next();
  });

  // SRE Health Check
  app.get('/api/health', async (c) => {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    const storage = c.get('storage');
    const env = c.env as any;
    const isEdge = Boolean(env?.pantrypool_db);
    let dbStatus = 'connected';
    let dbError: string | undefined;
    const startDb = Date.now();
    let dbLatency = 0;

    try {
      if (isEdge) {
        await env.pantrypool_db.prepare("SELECT 1 as ping").first();
      } else if (storage) {
        await storage.getPlatformStats();
      }
      dbLatency = Date.now() - startDb;
    } catch (err: any) {
      dbStatus = 'disconnected';
      dbError = err?.message || 'Database connection timeout';
    }

    const healthy = dbStatus === 'connected';
    const httpStatus = isEdge ? (healthy ? 200 : 503) : 200;

    return c.json({
      success: isEdge ? healthy : true,
      status: healthy ? 'healthy' : 'degraded',
      service: isEdge ? 'PantryPool Edge API' : 'PantryPool Universal API',
      latencyMs: dbLatency,
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: dbStatus,
          error: healthy ? undefined : dbError
        },
        runtime: { status: 'operational' },
        ...(isEdge ? { edgeRuntime: { status: 'operational' } } : {})
      }
    }, httpStatus);
  });

  // Register All Modular Route Groups
  registerAuthRoutes(app);
  registerOrganizationRoutes(app);
  registerPoolRoutes(app);
  registerItemRoutes(app);
  registerTransactionRoutes(app);
  registerShoppingPollRoutes(app);
  registerNotificationRoutes(app);
  registerWebhookRoutes(app);
  registerAiRoutes(app);
  registerBarcodeRoutes(app);
  registerAdminRoutes(app);
  registerSyncRoutes(app);
  registerTelemetryRoutes(app);
  registerContactRoutes(app);
  registerDiscoveryRoutes(app);

  return app;
}
