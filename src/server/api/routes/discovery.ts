import { Hono } from 'hono';
import { HonoEnv } from '../app';
import { AI_CATALOG_MANIFEST } from '../../content/aiCatalog';

export function registerDiscoveryRoutes(app: Hono<HonoEnv>) {
  const handler = (c: any) => {
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=3600');
    c.header('Access-Control-Allow-Origin', '*');
    return c.json(AI_CATALOG_MANIFEST);
  };

  app.get('/.well-known/ai-catalog.json', handler);
  app.get('/.well-known/ard.json', handler);
}
