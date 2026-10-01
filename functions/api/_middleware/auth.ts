import { Env, AuthUser } from '../_types';
import { verifySignedToken } from '../_lib/crypto';
import { jsonResponse } from '../_lib/cors';

const TOKEN_VERSION_CACHE = new Map<string, { version: number; expiresAt: number }>();

export function invalidateTokenVersionCache(userId: string) {
  TOKEN_VERSION_CACHE.delete(userId);
}

export function getCachedTokenVersion(userId: string): number | null {
  const cached = TOKEN_VERSION_CACHE.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.version;
  }
  return null;
}

export function setCachedTokenVersion(userId: string, version: number) {
  TOKEN_VERSION_CACHE.set(userId, { version, expiresAt: Date.now() + 60000 });
}

export async function authenticateRequest(
  request: Request,
  env: Env,
  requireDbCheck = false
): Promise<AuthUser | null> {
  const authHeader = request.headers.get('Authorization') || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) token = match[1];
  }
  if (!token) return null;

  const payload = await verifySignedToken(token, env);
  const userId = payload?.id || payload?.userId;
  if (!payload || !userId) {
    return null;
  }

  const tokenVersionInJwt = Number(payload.tokenVersion !== undefined ? payload.tokenVersion : 1);

  if (env.pantrypool_db) {
    let currentDbVersion = getCachedTokenVersion(userId);

    if (requireDbCheck || currentDbVersion === null) {
      try {
        const dbUser: any = await env.pantrypool_db.prepare("SELECT token_version, system_role, email, name, avatar_url FROM users WHERE id = ?").bind(userId).first();
        if (dbUser) {
          if (dbUser.token_version !== null && dbUser.token_version !== undefined) {
            currentDbVersion = Number(dbUser.token_version);
            setCachedTokenVersion(userId, currentDbVersion);
          }
          if (dbUser.system_role) {
            payload.systemRole = dbUser.system_role;
          }
          if (dbUser.email) {
            payload.email = dbUser.email;
          }
          if (dbUser.name) {
            payload.name = dbUser.name;
          }
          if (dbUser.avatar_url) {
            payload.avatarUrl = dbUser.avatar_url;
          }
        }
      } catch (e) {
        if (requireDbCheck) {
          return null;
        }
      }
    }

    if (currentDbVersion !== null && tokenVersionInJwt !== currentDbVersion) {
      return null;
    }
  }

  return {
    id: userId,
    email: payload.email || '',
    name: payload.name || '',
    avatarUrl: payload.avatarUrl || '',
    systemRole: payload.systemRole || 'user',
    tokenVersion: payload.tokenVersion
  };
}

export async function requireSuperAdmin(
  request: Request,
  env: Env
): Promise<{ authUser: AuthUser | null; errorResponse: Response | null }> {
  const auth = await authenticateRequest(request, env, true);
  if (!auth) {
    return {
      authUser: null,
      errorResponse: jsonResponse({ success: false, error: 'Authentication required. No valid token provided.' }, 401, request, env)
    };
  }
  const isSuper = auth.systemRole === 'superadmin' || 
                  auth.systemRole === 'admin' || 
                  Boolean(env.INITIAL_ADMIN_EMAIL && auth.email && auth.email.toLowerCase().trim() === env.INITIAL_ADMIN_EMAIL.toLowerCase().trim());
  if (!isSuper) {
    return {
      authUser: auth,
      errorResponse: jsonResponse({ success: false, error: 'Forbidden: Superadmin privileges required.' }, 403, request, env)
    };
  }
  return { authUser: auth, errorResponse: null };
}
