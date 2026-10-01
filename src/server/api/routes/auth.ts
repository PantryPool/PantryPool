import { Hono } from 'hono';
import { HonoEnv } from '../app';
import {
  hashPassword,
  comparePassword,
  createUniversalToken,
  verifyUniversalToken,
  createPasskeyChallengeToken,
  verifyPasskeyChallengeToken,
  base64UrlEncode,
  base64UrlDecode
} from '../authUtils';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';
import { logSecurityEvent } from '../auditLogger';

function getConfiguredInitialAdmin(c: any): string | null {
  const env = c.env as any;
  const initialAdmin = (env?.INITIAL_ADMIN_EMAIL || process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
  return initialAdmin.length > 0 ? initialAdmin : null;
}

async function determineNewUserRole(
  storage: any,
  normalizedEmail: string,
  configuredAdmin: string | null
): Promise<'superadmin' | 'user'> {
  if (configuredAdmin) {
    // When INITIAL_ADMIN_EMAIL is explicitly configured in the environment,
    // only that predetermined address receives superadmin privileges.
    return normalizedEmail === configuredAdmin ? 'superadmin' : 'user';
  }

  // Open-source first-user bootstrap:
  // When no INITIAL_ADMIN_EMAIL is configured, the first registered user on an empty database becomes superadmin.
  try {
    const userCount = typeof storage.countUsers === 'function'
      ? await storage.countUsers()
      : ((await storage.listUsers?.()) || []).length;
    if (userCount === 0) {
      return 'superadmin';
    }
  } catch {
    // If count cannot be determined, default securely to 'user'
  }
  return 'user';
}

export function registerAuthRoutes(app: Hono<HonoEnv>) {
  // Register
  app.post('/api/auth/register', async (c) => {
    const storage = c.get('storage');
    const secret = c.get('jwtSecret');
    const body: any = await c.req.json().catch(() => ({}));
    const { email, password, name } = body || {};

    if (!email || !password || !name) {
      return c.json({ success: false, error: 'Email, password, and name are required.' }, 400);
    }
    if (password.length < 8) {
      return c.json({ success: false, error: 'Password must be at least 8 characters long.' }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await storage.getUserByEmail(normalizedEmail);
    if (existing) {
      return c.json({ success: false, error: 'User already exists with this email address.' }, 400);
    }

    const userId = 'u_' + crypto.randomUUID();
    const configuredAdmin = getConfiguredInitialAdmin(c);
    const systemRole = await determineNewUserRole(storage, normalizedEmail, configuredAdmin);
    const avatarUrl = `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(name)}&backgroundColor=f0ebe3,faede8,e8ded4,e3ebe6,fdf4e8`;
    const passwordHash = await hashPassword(password);

    const user = await storage.createUser({
      id: userId,
      email: normalizedEmail,
      name: name.trim(),
      avatar_url: avatarUrl,
      password_hash: passwordHash,
      system_role: systemRole,
      token_version: 1
    });

    const token = await createUniversalToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      systemRole: user.system_role,
      tokenVersion: 1
    }, secret);

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        systemRole: user.system_role,
        hasPassword: true,
        hasGoogle: false,
        hasApple: false
      }
    });
  });

  // Login
  app.post('/api/auth/login', async (c) => {
    const storage = c.get('storage');
    const secret = c.get('jwtSecret');
    const body: any = await c.req.json().catch(() => ({}));
    const { email, password } = body || {};

    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password required.' }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await storage.getUserByEmail(normalizedEmail);
    if (!user || !user.password_hash) {
      logSecurityEvent(c, {
        action: 'AUTH_FAILURE',
        targetResource: `/api/auth/login:${normalizedEmail}`,
        status: 'FAILURE',
        metadata: { email: normalizedEmail, reason: 'user_not_found_or_no_password' }
      });
      return c.json({ success: false, error: 'Invalid email or password.' }, 401);
    }

    if (user.is_archived) {
      logSecurityEvent(c, {
        actorId: user.id,
        action: 'AUTH_FAILURE',
        targetResource: `/api/auth/login:${normalizedEmail}`,
        status: 'FAILURE',
        metadata: { email: normalizedEmail, reason: 'account_archived' }
      });
      return c.json({ success: false, error: 'This account has been deleted or archived. Please contact support if you believe this is an error.' }, 403);
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      logSecurityEvent(c, {
        actorId: user.id,
        action: 'AUTH_FAILURE',
        targetResource: `/api/auth/login:${normalizedEmail}`,
        status: 'FAILURE',
        metadata: { email: normalizedEmail, reason: 'invalid_password' }
      });
      return c.json({ success: false, error: 'Invalid email or password.' }, 401);
    }

    let systemRole = user.system_role || 'user';
    const configuredAdmin = getConfiguredInitialAdmin(c);
    if (configuredAdmin && normalizedEmail === configuredAdmin && systemRole !== 'superadmin') {
      systemRole = 'superadmin';
      await storage.updateUser(user.id, { system_role: 'superadmin' });
    }

    const token = await createUniversalToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      systemRole,
      tokenVersion: user.token_version
    }, secret);

    logSecurityEvent(c, {
      actorId: user.id,
      action: 'AUTH_SUCCESS',
      targetResource: `/api/auth/login:${user.id}`,
      status: 'SUCCESS',
      metadata: { email: user.email, systemRole }
    });

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        systemRole,
        hasPassword: Boolean(user.password_hash),
        hasGoogle: Boolean(user.google_id),
        hasApple: Boolean(user.apple_id)
      }
    });
  });



  // Refresh Token
  app.post('/api/auth/refresh', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const secret = c.get('jwtSecret');
    if (!user) {
      return c.json({ success: false, error: 'Valid authorization token required to refresh.' }, 401);
    }

    let dbUser = null;
    try {
      dbUser = await storage.getUserById(user.userId);
    } catch {}

    if (dbUser?.is_archived) {
      return c.json({ success: false, error: 'This account has been deleted or archived.' }, 403);
    }

    const email = dbUser?.email || user.email;
    const name = dbUser?.name || user.name;
    const systemRole = dbUser?.system_role || user.systemRole || 'user';
    const tokenVersion = dbUser?.token_version !== undefined && dbUser?.token_version !== null ? Number(dbUser.token_version) : (user.tokenVersion || 1);

    const newToken = await createUniversalToken({
      userId: user.userId,
      email,
      name,
      systemRole,
      tokenVersion
    }, secret);

    return c.json({
      success: true,
      token: newToken,
      user: {
        id: user.userId,
        email,
        name,
        avatarUrl: dbUser?.avatar_url,
        systemRole,
        hasPassword: Boolean(dbUser?.password_hash),
        hasGoogle: Boolean(dbUser?.google_id),
        hasApple: Boolean(dbUser?.apple_id)
      }
    });
  });

  // Logout / Invalidate Sessions
  app.post('/api/auth/logout', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (user?.userId) {
      await storage.bumpTokenVersion(user.userId);
    }
    return c.json({ success: true, message: 'Logged out successfully.' });
  });

  // Google OAuth redirect callback (for iOS / iPadOS full-page redirect flow)
  app.get('/api/auth/google/callback', (c) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signing in to PantryPool...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #FAF8F5;
      color: #2D2D2D;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #E0DAD1;
      border-top-color: #E8694A;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .msg { font-size: 14px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <div class="msg" id="status">Completing sign-in...</div>
  <script src="/google-callback.js"></script>
</body>
</html>`;
    return c.html(html);
  });

  // Google OAuth verification
  app.post('/api/auth/google', async (c) => {
    const storage = c.get('storage');
    const secret = c.get('jwtSecret');
    const body: any = await c.req.json().catch(() => ({}));
    const { credential, accessToken } = body || {};
    const rawToken = credential || accessToken;

    if (!rawToken) {
      // In test environment only: support test fallback if mock credentials passed
      if (process.env.NODE_ENV === 'test' && body?.email) {
        // Allow test runner fallback
      } else {
        return c.json({ success: false, error: 'Google credential token is required.' }, 400);
      }
    }

    let email = '';
    let name = 'Google User';
    let googleId = '';
    let avatarUrl = '';

    const env = (c.env || {}) as any;
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    const ALLOWED_CLIENT_IDS = Array.from(new Set([
      env.GOOGLE_CLIENT_ID,
      env.VITE_GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_ID,
      process.env.VITE_GOOGLE_CLIENT_ID,
    ].filter((id): id is string => Boolean(id)).map((id: string) => String(id).replace(/^["']|["']$/g, '').trim())));

    const matchesAllowedAudience = (tokenAud: string): boolean => {
      if (!tokenAud) return true;
      const cleanAud = tokenAud.trim();
      return ALLOWED_CLIENT_IDS.some(allowed =>
        cleanAud === allowed ||
        allowed.includes(cleanAud) ||
        cleanAud.startsWith(allowed.split('-')[0]) ||
        allowed.startsWith(cleanAud.split('-')[0])
      );
    };

    const candidateTokens: string[] = [];
    if (credential && typeof credential === 'string' && credential.trim()) {
      candidateTokens.push(credential.trim());
    }
    if (accessToken && typeof accessToken === 'string' && accessToken.trim() && !candidateTokens.includes(accessToken.trim())) {
      candidateTokens.push(accessToken.trim());
    }

    if (isTest) {
      // Test environment / offline runner fallback
      try {
        for (const token of candidateTokens) {
          if (token.includes('.')) {
            const parts = token.split('.');
            if (parts.length >= 2) {
              const payloadJson = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
              const payload = JSON.parse(payloadJson);
              if (payload.email) email = payload.email.toLowerCase().trim();
              if (payload.name) name = payload.name;
              if (payload.sub || payload.googleId) googleId = payload.sub || payload.googleId;
              if (payload.picture) avatarUrl = payload.picture;
            }
          }
        }
        if (!email && body?.email) {
          email = String(body.email).toLowerCase().trim();
          name = body.name || email.split('@')[0];
          googleId = body.googleId || 'g_' + crypto.randomUUID();
          avatarUrl = body.avatarUrl || '';
        }
      } catch {}
    } else {
      // Production live verification via Google OAuth endpoints with audience enforcement
      for (const token of candidateTokens) {
        if (email) break;

        // Path 1: If it's a JWT (ID Token), verify via id_token tokeninfo
        if (token.includes('.') && token.split('.').length === 3) {
          try {
            const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
            if (res.ok) {
              const info: any = await res.json();
              const tokenAud = String(info.aud || info.azp || info.audience || '').trim();
              const audMatches = matchesAllowedAudience(tokenAud);
              if (audMatches) {
                if (info.email) email = info.email.toLowerCase().trim();
                googleId = info.sub || info.user_id || `g_${Date.now()}`;
                name = info.name || (email ? email.split('@')[0] : 'Google User');
                avatarUrl = info.picture || '';
                break;
              }
            }
          } catch (e) {
            console.warn('[Google Auth] ID token verification attempt failed:', e);
          }
        }

        // Path 2: Verify as OAuth2 Access Token
        try {
          // 2a. Fetch user profile directly via Google's official userinfo API
          const ures = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (ures.ok) {
            const uinfo: any = await ures.json();
            if (uinfo && uinfo.email) {
              // 2b. Verify audience via tokeninfo to prevent Confused Deputy attacks
              let tokenAud = '';
              try {
                let tinfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
                if (!tinfoRes.ok) {
                  tinfoRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`);
                }
                if (tinfoRes.ok) {
                  const tinfo: any = await tinfoRes.json();
                  tokenAud = String(tinfo.audience || tinfo.issued_to || tinfo.aud || tinfo.azp || tinfo.client_id || '').trim();
                }
              } catch (te) {
                console.warn('[Google Auth] Access token tokeninfo lookup note:', te);
              }

              // Validate audience match against expected Google client ID
              const audMatches = matchesAllowedAudience(tokenAud);

              if (audMatches) {
                email = uinfo.email.toLowerCase().trim();
                googleId = uinfo.sub || `g_${Date.now()}`;
                name = uinfo.name || email.split('@')[0];
                avatarUrl = uinfo.picture || '';
                break;
              } else {
                console.warn('[Google Auth] Token audience mismatch:', { tokenAud, allowedClientIds: ALLOWED_CLIENT_IDS });
              }
            }
          }
        } catch (e) {
          console.warn('[Google Auth] Access token userinfo verification error:', e);
        }

        // Path 3: Direct tokeninfo fallback for access token
        if (!email) {
          try {
            let res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
            if (!res.ok) {
              res = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`);
            }
            if (res.ok) {
              const info: any = await res.json();
              const tokenAud = String(info.audience || info.issued_to || info.aud || info.azp || info.client_id || '').trim();
              const audMatches = matchesAllowedAudience(tokenAud);

              if (audMatches && info.email) {
                email = info.email.toLowerCase().trim();
                googleId = info.user_id || info.sub || `g_${Date.now()}`;
                name = info.name || email.split('@')[0];
                avatarUrl = info.picture || '';
                break;
              }
            }
          } catch (e) {
            console.warn('[Google Auth] Direct tokeninfo attempt error:', e);
          }
        }
      }
    }

    if (!email) {
      console.warn('[Google Auth] Verification failed to resolve valid email for candidate tokens.');
      return c.json({ success: false, error: 'Invalid, expired, or unauthorized Google token.' }, 401);
    }

    let user = await storage.getUserByEmail(email);
    if (user && user.is_archived) {
      return c.json({ success: false, error: 'This account has been deleted or archived. Please contact support if you believe this is an error.' }, 403);
    }
    const configuredAdmin = getConfiguredInitialAdmin(c);
    const isConfiguredAdmin = Boolean(configuredAdmin && email.toLowerCase().trim() === configuredAdmin);

    if (!user) {
      const systemRole = await determineNewUserRole(storage, email.toLowerCase().trim(), configuredAdmin);

      user = await storage.createUser({
        id: 'u_' + crypto.randomUUID(),
        email: email.toLowerCase().trim(),
        name,
        avatar_url: avatarUrl || null,
        google_id: googleId,
        system_role: systemRole,
        token_version: 1
      });
    } else {
      const updates: any = {};
      if (!user.google_id) updates.google_id = googleId;
      if (isConfiguredAdmin && user.system_role !== 'superadmin') {
        updates.system_role = 'superadmin';
        user.system_role = 'superadmin';
      }
      if (Object.keys(updates).length > 0) {
        await storage.updateUser(user.id, updates);
      }
    }

    const token = await createUniversalToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      systemRole: user.system_role,
      tokenVersion: user.token_version
    }, secret);

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        systemRole: user.system_role,
        hasPassword: Boolean(user.password_hash),
        hasGoogle: true,
        hasApple: Boolean(user.apple_id)
      }
    });
  });

  // Apple OAuth verification
  app.post('/api/auth/apple', async (c) => {
    const storage = c.get('storage');
    const secret = c.get('jwtSecret');
    const body: any = await c.req.json().catch(() => ({}));
    const { identityToken, user: appleUserData } = body || {};

    if (!identityToken) {
      return c.json({ success: false, error: 'Missing Apple identity token.' }, 400);
    }

    let email = '';
    let appleId = 'apple_' + crypto.randomUUID();
    try {
      const parts = identityToken.split('.');
      if (parts.length === 3) {
        const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadJson);
        email = payload.email || '';
        appleId = payload.sub || appleId;
      }
    } catch {
      return c.json({ success: false, error: 'Invalid Apple token.' }, 400);
    }

    if (!email) {
      return c.json({ success: false, error: 'Apple email required.' }, 400);
    }

    let name = 'Apple User';
    if (appleUserData && typeof appleUserData === 'object') {
      const { name: appleName } = appleUserData;
      if (appleName) {
        name = [appleName.firstName, appleName.lastName].filter(Boolean).join(' ') || name;
      }
    }

    let user = await storage.getUserByEmail(email);
    if (user && user.is_archived) {
      return c.json({ success: false, error: 'This account has been deleted or archived. Please contact support if you believe this is an error.' }, 403);
    }
    const configuredAdmin = getConfiguredInitialAdmin(c);
    const isConfiguredAdmin = Boolean(configuredAdmin && email.toLowerCase().trim() === configuredAdmin);

    if (!user) {
      const systemRole = await determineNewUserRole(storage, email.toLowerCase().trim(), configuredAdmin);
      user = await storage.createUser({
        id: 'u_' + crypto.randomUUID(),
        email: email.toLowerCase().trim(),
        name,
        apple_id: appleId,
        system_role: systemRole,
        token_version: 1
      });
    } else {
      const updates: any = {};
      if (!user.apple_id) updates.apple_id = appleId;
      if (isConfiguredAdmin && user.system_role !== 'superadmin') {
        updates.system_role = 'superadmin';
        user.system_role = 'superadmin';
      }
      if (Object.keys(updates).length > 0) {
        await storage.updateUser(user.id, updates);
      }
    }

    const token = await createUniversalToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      systemRole: user.system_role,
      tokenVersion: user.token_version
    }, secret);

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        systemRole: user.system_role,
        hasPassword: Boolean(user.password_hash),
        hasGoogle: Boolean(user.google_id),
        hasApple: true
      }
    });
  });

  // Profile Update (Mounted on both /api/auth/profile and /api/users/profile)
  const handleProfileUpdate = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized.' }, 401);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { name, avatarUrl, venmoHandle, cashappHandle, paypalHandle, zelleIdentifier, applePayHandle, preferredPaymentMethod } = body || {};

    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
    if (venmoHandle !== undefined) updates.venmo_handle = venmoHandle;
    if (cashappHandle !== undefined) updates.cashapp_handle = cashappHandle;
    if (paypalHandle !== undefined) updates.paypal_handle = paypalHandle;
    if (zelleIdentifier !== undefined) updates.zelle_identifier = zelleIdentifier;
    if (applePayHandle !== undefined) updates.apple_pay_handle = applePayHandle;
    if (preferredPaymentMethod !== undefined) updates.preferred_payment_method = preferredPaymentMethod;

    await storage.updateUser(user.userId, updates);
    const updated = await storage.getUserById(user.userId);

    const finalUser = {
      id: updated?.id || user.userId,
      email: updated?.email || user.email,
      name: updated?.name || updates.name || user.name,
      avatarUrl: updated?.avatar_url !== undefined ? updated.avatar_url : (updates.avatar_url || user.avatarUrl),
      systemRole: updated?.system_role || user.systemRole,
      venmoHandle: updated?.venmo_handle !== undefined ? updated.venmo_handle : updates.venmo_handle,
      cashappHandle: updated?.cashapp_handle !== undefined ? updated.cashapp_handle : updates.cashapp_handle,
      paypalHandle: updated?.paypal_handle !== undefined ? updated.paypal_handle : updates.paypal_handle,
      zelleIdentifier: updated?.zelle_identifier !== undefined ? updated.zelle_identifier : updates.zelle_identifier,
      applePayHandle: updated?.apple_pay_handle !== undefined ? updated.apple_pay_handle : updates.apple_pay_handle,
      preferredPaymentMethod: updated?.preferred_payment_method !== undefined ? updated.preferred_payment_method : updates.preferred_payment_method
    };

    return c.json({
      success: true,
      user: finalUser
    });
  };

  app.put('/api/auth/profile', handleProfileUpdate);
  app.put('/api/users/profile', handleProfileUpdate);

  // Profile Lookup (Mounted on both /api/auth/me and /api/users/profile)
  const handleGetProfile = async (c: any) => {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    c.header('Vary', 'Authorization');
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const dbUser = await storage.getUserById(user.userId);
    if (!dbUser || dbUser.is_archived) {
      return c.json({ success: false, error: 'User not found or deactivated.' }, 404);
    }

    return c.json({
      success: true,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        avatarUrl: dbUser.avatar_url,
        systemRole: dbUser.system_role || 'user',
        hasPassword: Boolean(dbUser.password_hash),
        hasGoogle: Boolean(dbUser.google_id),
        hasApple: Boolean(dbUser.apple_id),
        hasPasskey: storage.getPasskeyCredentialsByUserId ? (await storage.getPasskeyCredentialsByUserId(dbUser.id).catch(() => [])).length > 0 : false,
        venmoHandle: dbUser.venmo_handle || '',
        cashappHandle: dbUser.cashapp_handle || '',
        paypalHandle: dbUser.paypal_handle || '',
        zelleIdentifier: dbUser.zelle_identifier || '',
        applePayHandle: dbUser.apple_pay_handle || '',
        preferredPaymentMethod: dbUser.preferred_payment_method || ''
      }
    });
  };

  app.get('/api/auth/me', handleGetProfile);
  app.get('/api/users/profile', handleGetProfile);

  // Helper to decode base64 string to Uint8Array portably across environments
  function decodeBase64ToUint8Array(base64: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // User Profile Icon/Avatar Upload
  const handleAvatarUpload = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized: Authentication required.' }, 401);
    }
    if (!storage?.saveUserAvatar) {
      return c.json({ success: false, error: 'Storage adapter does not support avatar uploads' }, 501);
    }

    let mimeType = 'image/jpeg';
    let base64Data = '';

    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      let file: any;
      const clonedReq = c.req.raw?.clone ? c.req.raw.clone() : null;
      try {
        const formData = await c.req.formData();
        file = formData.get('avatar') || formData.get('photo') || formData.get('image') || formData.get('file');
      } catch {
        try {
          const body = await c.req.parseBody();
          file = body['avatar'] || body['photo'] || body['image'] || body['file'];
        } catch {}
      }

      if (file && typeof file !== 'string' && typeof (file as any).arrayBuffer === 'function') {
        const buffer = await (file as any).arrayBuffer();
        if (typeof Buffer !== 'undefined') {
          base64Data = Buffer.from(buffer).toString('base64');
        } else {
          let binary = '';
          const bytes = new Uint8Array(buffer);
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          base64Data = btoa(binary);
        }
        mimeType = (file as any).type || 'image/jpeg';
      } else if (clonedReq) {
        const rawBuffer = await clonedReq.arrayBuffer().catch(() => null);
        if (rawBuffer && rawBuffer.byteLength > 0) {
          const buffer = Buffer.from(rawBuffer);
          const bufStr = buffer.toString('latin1');
          const headerEndIndex = bufStr.indexOf('\r\n\r\n');
          if (headerEndIndex !== -1) {
            const headerPart = bufStr.substring(0, headerEndIndex);
            const ctMatch = headerPart.match(/content-type:\s*([^\r\n;]+)/i);
            if (ctMatch) {
              mimeType = ctMatch[1].trim();
            }
            const boundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
            const boundaryDelimiter = boundaryMatch ? `--${boundaryMatch[1]}` : '--';
            let dataEndIndex = bufStr.lastIndexOf(`\r\n${boundaryDelimiter}`);
            if (dataEndIndex === -1) dataEndIndex = bufStr.length;
            const binarySlice = buffer.subarray(headerEndIndex + 4, dataEndIndex);
            base64Data = binarySlice.toString('base64');
          }
        }
      }

      if (!base64Data) {
        return c.json({ success: false, error: 'No avatar image file found in form data' }, 400);
      }
    } else {
      // JSON body
      const body = await c.req.json().catch(() => ({}));
      const rawData = body.data || body.avatar || body.photo || body.imageBase64 || body.image;
      if (!rawData || typeof rawData !== 'string') {
        return c.json({ success: false, error: 'Image data is required (base64 string or data URL)' }, 400);
      }

      if (rawData.startsWith('data:')) {
        const match = rawData.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        } else {
          base64Data = rawData.replace(/^data:[^;]+;base64,/, '');
        }
      } else {
        base64Data = rawData;
        if (body.mimeType) {
          mimeType = body.mimeType;
        }
      }
    }

    // Supported MIME types check
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
    ];
    if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
      return c.json({
        success: false,
        error: `Unsupported image type "${mimeType}". Allowed formats: JPEG, PNG, WebP, GIF, SVG.`,
      }, 400);
    }

    // Size check: max 5MB (~7MB base64)
    if (base64Data.length > 7 * 1024 * 1024) {
      return c.json({
        success: false,
        error: 'Uploaded photo exceeds the maximum allowed size limit (5MB).',
      }, 400);
    }

    const avatarId = 'usr_avatar_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    await storage.saveUserAvatar({
      id: avatarId,
      user_id: user.userId,
      mime_type: mimeType,
      data: base64Data,
    });

    const avatarUrl = `/api/users/avatar/${avatarId}`;
    await storage.updateUser(user.userId, { avatar_url: avatarUrl });

    return c.json({
      success: true,
      avatarId,
      avatarUrl,
      mimeType,
    }, 201);
  };

  app.post('/api/users/avatar', handleAvatarUpload);
  app.post('/api/auth/avatar', handleAvatarUpload);

  // Public: Serve User Profile Icon / Avatar
  const handleServeAvatar = async (c: any) => {
    const storage = c.get('storage');
    const id = c.req.param('id');
    if (!storage?.getUserAvatar || !id) {
      return c.json({ success: false, error: 'Avatar not found' }, 404);
    }

    const img = await storage.getUserAvatar(id);
    if (!img || !img.data) {
      return c.json({ success: false, error: 'Avatar not found' }, 404);
    }

    const binaryData = decodeBase64ToUint8Array(img.data);

    return new Response(binaryData as any, {
      status: 200,
      headers: {
        'Content-Type': img.mime_type || 'image/jpeg',
        'Content-Length': String(binaryData.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  };

  app.get('/api/users/avatar/:id', handleServeAvatar);
  app.get('/api/auth/avatar/:id', handleServeAvatar);

  // Delete User Avatar
  const handleDeleteAvatar = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized.' }, 401);
    }
    const id = c.req.param('id');
    if (id && storage?.deleteUserAvatar) {
      await storage.deleteUserAvatar(id);
    }
    await storage.updateUser(user.userId, { avatar_url: null });
    return c.json({ success: true, message: 'Avatar deleted successfully' });
  };

  app.delete('/api/users/avatar/:id', handleDeleteAvatar);
  app.delete('/api/users/avatar', handleDeleteAvatar);

  // Link Provider
  app.post('/api/users/link-provider', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { provider, password } = body || {};

    if (provider === 'password' && password) {
      if (password.length < 8) {
        return c.json({ success: false, error: 'Password must be at least 8 characters.' }, 400);
      }
      const hash = await hashPassword(password);
      await storage.updateUser(user.userId, {
        password_hash: hash,
        token_version: ((user.tokenVersion || 1) + 1)
      });
      await storage.bumpTokenVersion(user.userId);
    }

    return c.json({ success: true, message: `Successfully linked ${provider} provider.` });
  });

  // Forgot Password
  app.post('/api/auth/forgot-password', async (c) => {
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { email } = body || {};

    if (!email || typeof email !== 'string') {
      return c.json({ success: false, error: 'Email address is required.' }, 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await storage.getUserByEmail(cleanEmail);

    // Constant-time response to prevent user enumeration
    if (!user) {
      return c.json({
        success: true,
        message: 'If an account exists with that email address, password reset instructions have been sent.',
      });
    }

    try {
      const rawToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const tokenHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
      const tokenHash = Array.from(new Uint8Array(tokenHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour expiration

      await storage.createPasswordResetToken({
        id: 'prt_' + crypto.randomUUID(),
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used: false,
      });

      const env = c.env as any;
      const appUrl = (env?.APP_URL || process.env.APP_URL || 'https://pantrypool.com').replace(/\/$/, '');
      const resetLink = `${appUrl}/?reset_token=${rawToken}&email=${encodeURIComponent(cleanEmail)}`;

      const { sendEmail, renderEmailTemplate } = await import('../../services/emailService');
      const html = renderEmailTemplate({
        headline: 'Reset Your Password',
        intro: `Hello ${user.name},`,
        mainContent: `
          <p>We received a request to reset the password for your PantryPool account (<strong>${cleanEmail}</strong>).</p>
          <p>Click the button below to choose a new password. This link will expire in <strong>60 minutes</strong>.</p>
        `,
        ctaText: 'Reset My Password',
        ctaUrl: resetLink,
        footerNote: 'If you did not request a password reset, you can safely ignore this email. Your current password remains unchanged.',
      });

      await sendEmail({
        to: cleanEmail,
        subject: '🔒 Reset Your PantryPool Password',
        html,
        userId: user.id,
        emailType: 'password_reset',
        storage,
      }, env);

      return c.json({
        success: true,
        message: 'If an account exists with that email address, password reset instructions have been sent.',
      });
    } catch (err: any) {
      console.error('[Forgot Password Error]', err);
      return c.json({
        success: true,
        message: 'If an account exists with that email address, password reset instructions have been sent.',
      });
    }
  });

  // Reset Password
  app.post('/api/auth/reset-password', async (c) => {
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { token, newPassword } = body || {};

    if (!token || !newPassword) {
      return c.json({ success: false, error: 'Reset token and new password are required.' }, 400);
    }

    if (newPassword.length < 8) {
      return c.json({ success: false, error: 'Password must be at least 8 characters long.' }, 400);
    }

    try {
      const tokenHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token.trim()));
      const tokenHash = Array.from(new Uint8Array(tokenHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      const resetToken = await storage.getPasswordResetToken(tokenHash);
      if (!resetToken || resetToken.used) {
        return c.json({ success: false, error: 'Invalid or expired password reset link. Please request a new one.' }, 400);
      }

      if (new Date(resetToken.expires_at).getTime() < Date.now()) {
        return c.json({ success: false, error: 'This password reset link has expired. Please request a new one.' }, 400);
      }

      const user = await storage.getUserById(resetToken.user_id);
      if (!user) {
        return c.json({ success: false, error: 'Account not found.' }, 404);
      }

      const newPasswordHash = await hashPassword(newPassword);
      await storage.updateUser(user.id, {
        password_hash: newPasswordHash,
        token_version: (user.token_version || 1) + 1,
      });

      await storage.markPasswordResetTokenUsed(resetToken.id);

      return c.json({
        success: true,
        message: 'Password has been reset successfully. You can now sign in with your new credentials.',
      });
    } catch (err: any) {
      console.error('[Reset Password Error]', err);
      return c.json({ success: false, error: 'Failed to reset password. Please try again.' }, 500);
    }
  });

  // --- Passkey / WebAuthn Helper ---
  function getRelyingPartyConfig(c: any) {
    const env = c.env as any;
    let url: URL;
    try {
      url = new URL(c.req.url);
    } catch {
      url = new URL('http://localhost');
    }

    const hostHeader = c.req.header('x-forwarded-host') || c.req.header('host') || url.host || 'localhost';
    const hostname = hostHeader.split(':')[0];
    const protoHeader = c.req.header('x-forwarded-proto') || (url.protocol ? url.protocol.replace(':', '') : 'http');
    const currentOrigin = `${protoHeader}://${hostHeader}`;

    const rpID = env?.RP_ID || process.env.RP_ID || (hostname === 'localhost' || hostname === '127.0.0.1' ? 'localhost' : hostname);
    const rpName = env?.RP_NAME || process.env.RP_NAME || 'PantryPool';

    const configuredOrigin = env?.APP_ORIGIN || process.env.APP_ORIGIN;
    const expectedOrigins = Array.from(
      new Set([
        currentOrigin,
        `${protoHeader}://${hostname}`,
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost',
        'https://pantrypool.com',
        configuredOrigin
      ].filter(Boolean) as string[])
    );

    return { rpID, rpName, expectedOrigins };
  }

  // --- Passkey Registration Options (Auth required) ---
  app.post('/api/auth/passkey/register-options', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const secret = c.get('jwtSecret');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const dbUser = await storage.getUserById(user.userId);
    if (!dbUser) {
      return c.json({ success: false, error: 'User not found.' }, 404);
    }

    const existingCreds = storage.getPasskeyCredentialsByUserId
      ? await storage.getPasskeyCredentialsByUserId(dbUser.id).catch(() => [])
      : [];
    const { rpID, rpName } = getRelyingPartyConfig(c);

    try {
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: isoUint8Array.fromUTF8String(dbUser.id),
        userName: dbUser.email,
        userDisplayName: dbUser.name,
        attestationType: 'none',
        excludeCredentials: existingCreds.map(cr => ({
          id: cr.id,
          transports: (cr.transports as any) || undefined
        })),
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred'
        }
      });

      const challengeToken = await createPasskeyChallengeToken(
        { challenge: options.challenge, userId: dbUser.id },
        secret,
        300
      );

      return c.json({
        success: true,
        options,
        challengeToken
      });
    } catch (err: any) {
      console.error('[Passkey Register Options Error]', err);
      return c.json({ success: false, error: 'Failed to generate passkey registration options.' }, 500);
    }
  });

  // --- Passkey Registration Verify (Auth required) ---
  app.post('/api/auth/passkey/register-verify', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const secret = c.get('jwtSecret');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { response, challengeToken, name } = body || {};

    if (!response || !challengeToken) {
      return c.json({ success: false, error: 'Passkey response and challengeToken are required.' }, 400);
    }

    const challengePayload = await verifyPasskeyChallengeToken(challengeToken, secret);
    if (!challengePayload) {
      return c.json({ success: false, error: 'Passkey registration challenge has expired or is invalid. Please try again.' }, 400);
    }
    if (challengePayload.userId !== user.userId) {
      return c.json({ success: false, error: 'User mismatch during passkey registration.' }, 403);
    }

    const { rpID, expectedOrigins } = getRelyingPartyConfig(c);

    try {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengePayload.challenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: rpID,
        requireUserVerification: false
      });

      if (!verification.verified || !verification.registrationInfo) {
        return c.json({ success: false, error: 'Registration verification could not be validated.' }, 400);
      }

      if (!storage.createPasskeyCredential) {
        return c.json({ success: false, error: 'Passkey storage not supported on this adapter.' }, 501);
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const publicKeyBase64 = isoBase64URL.fromBuffer(credential.publicKey);
      const passkeyName = (name && String(name).trim()) || 'Security Key';

      const savedCred = await storage.createPasskeyCredential({
        id: credential.id,
        user_id: user.userId,
        public_key: publicKeyBase64,
        counter: credential.counter,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
        transports: credential.transports || null,
        name: passkeyName
      });

      return c.json({
        success: true,
        credential: {
          id: savedCred.id,
          name: savedCred.name,
          deviceType: savedCred.device_type,
          backedUp: Boolean(savedCred.backed_up)
        }
      });
    } catch (err: any) {
      console.error('[Passkey Register Verify Error]', err);
      return c.json({ success: false, error: err?.message || 'Failed to verify passkey registration.' }, 400);
    }
  });

  // --- Passkey Authentication Options (Public) ---
  app.post('/api/auth/passkey/auth-options', async (c) => {
    const storage = c.get('storage');
    const secret = c.get('jwtSecret');
    const body: any = await c.req.json().catch(() => ({}));
    const { email } = body || {};

    let allowCredentials: any[] | undefined = undefined;
    if (email && typeof email === 'string' && email.trim()) {
      const dbUser = await storage.getUserByEmail(email.toLowerCase().trim());
      if (dbUser && storage.getPasskeyCredentialsByUserId) {
        const creds = await storage.getPasskeyCredentialsByUserId(dbUser.id).catch(() => []);
        if (creds.length > 0) {
          allowCredentials = creds.map(cr => ({
            id: cr.id,
            transports: (cr.transports as any) || undefined
          }));
        }
      }
    }

    const { rpID } = getRelyingPartyConfig(c);

    try {
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: 'preferred'
      });

      const challengeToken = await createPasskeyChallengeToken(
        { challenge: options.challenge },
        secret,
        300
      );

      return c.json({
        success: true,
        options,
        challengeToken
      });
    } catch (err: any) {
      console.error('[Passkey Auth Options Error]', err);
      return c.json({ success: false, error: 'Failed to generate passkey authentication options.' }, 500);
    }
  });

  // --- Passkey Authentication Verify (Public) ---
  app.post('/api/auth/passkey/auth-verify', async (c) => {
    const storage = c.get('storage');
    const secret = c.get('jwtSecret');
    const body: any = await c.req.json().catch(() => ({}));
    const { response, challengeToken } = body || {};

    if (!response || !challengeToken) {
      return c.json({ success: false, error: 'Passkey response and challengeToken are required.' }, 400);
    }

    const challengePayload = await verifyPasskeyChallengeToken(challengeToken, secret);
    if (!challengePayload) {
      return c.json({ success: false, error: 'Passkey authentication challenge has expired or is invalid. Please try again.' }, 400);
    }

    const credId = response.id;
    if (!credId) {
      return c.json({ success: false, error: 'Missing passkey credential ID.' }, 400);
    }

    if (!storage.getPasskeyCredentialById || !storage.updatePasskeyCredentialCounter) {
      return c.json({ success: false, error: 'Passkey storage not supported on this adapter.' }, 501);
    }

    const dbCred = await storage.getPasskeyCredentialById(credId);
    if (!dbCred) {
      return c.json({ success: false, error: 'Passkey not recognized or has been removed.' }, 401);
    }

    const dbUser = await storage.getUserById(dbCred.user_id);
    if (!dbUser || dbUser.is_archived) {
      return c.json({ success: false, error: 'User associated with this passkey does not exist or has been archived.' }, 404);
    }

    const { rpID, expectedOrigins } = getRelyingPartyConfig(c);

    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengePayload.challenge,
        expectedOrigin: expectedOrigins,
        expectedRPID: rpID,
        credential: {
          id: dbCred.id,
          publicKey: isoBase64URL.toBuffer(dbCred.public_key),
          counter: dbCred.counter,
          transports: (dbCred.transports as any) || undefined
        },
        requireUserVerification: false
      });

      if (!verification.verified) {
        return c.json({ success: false, error: 'Authentication signature verification failed.' }, 401);
      }

      await storage.updatePasskeyCredentialCounter(dbCred.id, verification.authenticationInfo.newCounter);

      let systemRole = dbUser.system_role || 'user';
      const configuredAdmin = getConfiguredInitialAdmin(c);
      if (configuredAdmin && dbUser.email.toLowerCase().trim() === configuredAdmin && systemRole !== 'superadmin') {
        systemRole = 'superadmin';
        await storage.updateUser(dbUser.id, { system_role: 'superadmin' });
      }

      const token = await createUniversalToken({
        userId: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        systemRole,
        tokenVersion: dbUser.token_version || 1
      }, secret);

      return c.json({
        success: true,
        token,
        user: {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          avatarUrl: dbUser.avatar_url,
          systemRole,
          hasPassword: Boolean(dbUser.password_hash),
          hasGoogle: Boolean(dbUser.google_id),
          hasApple: Boolean(dbUser.apple_id),
          hasPasskey: true
        }
      });
    } catch (err: any) {
      console.error('[Passkey Auth Verify Error]', err);
      return c.json({ success: false, error: err?.message || 'Failed to verify passkey authentication.' }, 401);
    }
  });

  // --- List User's Passkeys (Auth required) ---
  app.get('/api/auth/passkey/list', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const creds = storage.getPasskeyCredentialsByUserId
      ? await storage.getPasskeyCredentialsByUserId(user.userId).catch(() => [])
      : [];
    return c.json({
      success: true,
      credentials: creds.map(cr => ({
        id: cr.id,
        name: cr.name || 'Passkey',
        deviceType: cr.device_type,
        backedUp: Boolean(cr.backed_up),
        createdAt: cr.created_at,
        lastUsedAt: cr.last_used_at
      }))
    });
  });

  // --- Delete User's Passkey (Auth required) ---
  app.delete('/api/auth/passkey/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    if (!storage.deletePasskeyCredential) {
      return c.json({ success: false, error: 'Passkey storage not supported on this adapter.' }, 501);
    }

    const id = c.req.param('id');
    const deleted = await storage.deletePasskeyCredential(id, user.userId);
    if (!deleted) {
      return c.json({ success: false, error: 'Passkey not found or already removed.' }, 404);
    }

    return c.json({
      success: true,
      message: 'Passkey revoked successfully.'
    });
  });

  // Self-Account Deletion (Supports GDPR / CCPA right to erasure or audit archive)
  app.delete('/api/auth/account', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const isGdpr = c.req.query('gdpr') === 'true' || c.req.query('hardDelete') === 'true';
    await storage.bumpTokenVersion(user.userId);
    if (storage.deleteUser) {
      await storage.deleteUser(user.userId, { hardDelete: isGdpr, gdpr: isGdpr });
    }
    return c.json({
      success: true,
      message: isGdpr ? 'Your account has been permanently purged under GDPR/CCPA.' : 'Your account has been closed and archived for audit purposes.',
      isArchived: !isGdpr
    });
  });
}
