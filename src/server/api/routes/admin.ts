import { Hono } from 'hono';
import { HonoEnv } from '../app';

export function registerAdminRoutes(app: Hono<HonoEnv>) {
  // Public System Settings
  const handlePublicSettings = async (c: any) => {
    const storage = c.get('storage');
    const settings = await storage.getSystemSettings().catch(() => ({}));

    const isTrue = (val: any) => val === true || val === 'true';
    const isNotFalse = (val: any) => val !== false && val !== 'false';

    return c.json({
      success: true,
      settings: {
        appleLoginEnabled: isTrue(settings.apple_login_enabled),
        registrationEnabled: isNotFalse(settings.registration_enabled),
        maintenanceMode: isTrue(settings.maintenance_mode),
        kioskModeEnabled: isNotFalse(settings.kiosk_mode_enabled),
        systemNotice: settings.system_notice || '',
        ssoConfigured: true
      },
      registrationEnabled: isNotFalse(settings.registration_enabled),
      maintenanceMode: isTrue(settings.maintenance_mode),
      appleLoginEnabled: isTrue(settings.apple_login_enabled),
      kioskModeEnabled: isNotFalse(settings.kiosk_mode_enabled),
      systemNotice: settings.system_notice || 'Welcome to PantryPool!'
    });
  };

  app.get('/api/settings/public', handlePublicSettings);
  app.get('/api/admin/public-settings', handlePublicSettings);
  app.get('/api/public-settings', handlePublicSettings);

  // Admin Platform Stats
  app.get('/api/admin/stats', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }
    if (user.systemRole !== 'superadmin') {
      return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);
    }

    const stats = await storage.getPlatformStats();
    return c.json({
      success: true,
      stats: {
        totalUsers: stats.totalUsers,
        totalPools: stats.totalPools,
        totalTransactions: stats.totalTransactions,
        totalVolume: stats.totalVolume.toFixed(2)
      }
    });
  });

  // Admin User List
  app.get('/api/admin/users', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }
    if (user.systemRole !== 'superadmin') {
      return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);
    }

    if (storage.listAllUsersForAdmin) {
      const users = await storage.listAllUsersForAdmin();
      return c.json({
        success: true,
        users
      });
    }

    const users = await storage.listUsers();
    const usersWithPools = await Promise.all(
      users.map(async (u) => {
        let poolCount = 0;
        if (storage.listPoolsForUser) {
          try {
            const pools = await storage.listPoolsForUser(u.id);
            poolCount = pools.length;
          } catch {
            poolCount = 0;
          }
        }
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          avatarUrl: u.avatar_url || null,
          systemRole: u.system_role,
          poolCount,
          createdAt: u.created_at
        };
      })
    );

    return c.json({
      success: true,
      users: usersWithPools
    });
  });

  // Update User Role
  const handleUpdateUserRole = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user || user.systemRole !== 'superadmin') {
      return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);
    }

    const targetUserId = c.req.param('id');
    const body: any = await c.req.json().catch(() => ({}));
    const role = body?.role || body?.systemRole;

    if (!['superadmin', 'admin', 'user'].includes(role)) {
      return c.json({ success: false, error: 'Invalid system role.' }, 400);
    }

    await storage.updateUser(targetUserId, { system_role: role });
    return c.json({ success: true, message: `User role updated to ${role}.` });
  };

  app.post('/api/admin/users/:id/role', handleUpdateUserRole);
  app.put('/api/admin/users/:id/role', handleUpdateUserRole);

  // Admin Organizations List (GET /api/admin/organizations)
  app.get('/api/admin/organizations', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const env = c.env as any;
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const orgs = storage.listAllOrgsForAdmin ? await storage.listAllOrgsForAdmin() : [];
    return c.json({ success: true, organizations: orgs });
  });

  // Admin Pools Directory (GET /api/admin/pools)
  app.get('/api/admin/pools', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const pools = storage.listAllPoolsForAdmin ? await storage.listAllPoolsForAdmin() : [];
    return c.json({ success: true, pools });
  });

  // Admin Update Org (PUT /api/admin/organizations/:id)
  app.put('/api/admin/organizations/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const orgId = c.req.param('id');
    const body: any = await c.req.json().catch(() => ({}));
    const { name, tier } = body || {};

    const updates: any = {};
    if (name && typeof name === 'string' && name.trim()) {
      updates.name = name.trim();
    }
    if (tier && typeof tier === 'string') {
      updates.tier = tier;
    }

    if (storage.updateOrg) {
      await storage.updateOrg(orgId, updates);
    } else if (updates.tier) {
      await storage.updateOrgTier(orgId, updates.tier);
    }

    return c.json({ success: true, message: 'Organization updated successfully.' });
  });

  // Admin Update Org Tier (PUT /api/admin/organizations/:id/tier)
  app.put('/api/admin/organizations/:id/tier', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const orgId = c.req.param('id');
    const body: any = await c.req.json().catch(() => ({}));
    const { tier } = body || {};
    if (!tier) return c.json({ success: false, error: 'Tier is required.' }, 400);

    await storage.updateOrgTier(orgId, tier);
    return c.json({ success: true, message: 'Organization tier updated.' });
  });

  // Admin Delete Organization (DELETE /api/admin/organizations/:id)
  app.delete('/api/admin/organizations/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const orgId = c.req.param('id');
    const isGdpr = c.req.query('gdpr') === 'true' || c.req.query('hardDelete') === 'true';
    if (storage.deleteOrg) {
      await storage.deleteOrg(orgId, { hardDelete: isGdpr, gdpr: isGdpr });
    }
    return c.json({
      success: true,
      message: isGdpr ? 'Organization permanently deleted for GDPR compliance.' : 'Organization deleted and record archived for audit purposes.',
      isArchived: !isGdpr
    });
  });

  // Admin Restore Organization (POST /api/admin/organizations/:id/restore)
  app.post('/api/admin/organizations/:id/restore', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const orgId = c.req.param('id');
    if (storage.restoreOrg) {
      await storage.restoreOrg(orgId);
    }
    return c.json({ success: true, message: 'Organization workspace restored successfully.' });
  });

  // Admin Update User (PUT /api/admin/users/:id)
  app.put('/api/admin/users/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const targetUserId = c.req.param('id');
    const body: any = await c.req.json().catch(() => ({}));
    const { name, email, systemRole, password } = body || {};

    const updates: any = {};
    if (name) updates.name = name.trim();
    if (email) updates.email = email.toLowerCase().trim();
    if (systemRole) updates.system_role = systemRole;
    if (password) {
      const { hashPassword } = await import('../authUtils');
      updates.password_hash = await hashPassword(password);
      updates.token_version = 1;
    }

    await storage.updateUser(targetUserId, updates);
    return c.json({ success: true, message: 'User details updated successfully.' });
  });

  // Admin Delete User (DELETE /api/admin/users/:id)
  app.delete('/api/admin/users/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const targetUserId = c.req.param('id');
    const isGdpr = c.req.query('gdpr') === 'true' || c.req.query('hardDelete') === 'true';
    await storage.bumpTokenVersion(targetUserId);
    if (storage.deleteUser) {
      await storage.deleteUser(targetUserId, { hardDelete: isGdpr, gdpr: isGdpr });
    }
    if (storage.saveSystemSettings) {
      const current = await storage.getSystemSettings().catch(() => ({}));
      await storage.saveSystemSettings({ ...current, admin_seeded: 'true' }).catch(() => {});
    }
    return c.json({
      success: true,
      message: isGdpr ? 'User permanently purged for GDPR compliance.' : 'User deleted and record archived for audit purposes.',
      isArchived: !isGdpr
    });
  });

  // Admin Restore User (POST /api/admin/users/:id/restore)
  app.post('/api/admin/users/:id/restore', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const targetUserId = c.req.param('id');
    if (storage.restoreUser) {
      await storage.restoreUser(targetUserId);
    }
    return c.json({ success: true, message: 'User account restored successfully.' });
  });

  // Admin Update Pool (PUT /api/admin/pools/:id)
  app.put('/api/admin/pools/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const poolId = c.req.param('id');
    const body: any = await c.req.json().catch(() => ({}));
    await storage.updatePool(poolId, body);
    return c.json({ success: true, message: 'Pool updated successfully.' });
  });

  // Admin Delete Pool (DELETE /api/admin/pools/:id)
  app.delete('/api/admin/pools/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const poolId = c.req.param('id');
    const isGdpr = c.req.query('gdpr') === 'true' || c.req.query('hardDelete') === 'true';
    await storage.deletePool(poolId, { hardDelete: isGdpr, gdpr: isGdpr });
    return c.json({
      success: true,
      message: isGdpr ? 'Pool and associated resources permanently deleted.' : 'Pool and associated resources deleted successfully.',
      isArchived: !isGdpr
    });
  });

  // Admin Restore Pool (POST /api/admin/pools/:id/restore)
  app.post('/api/admin/pools/:id/restore', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const poolId = c.req.param('id');
    if (storage.restorePool) {
      await storage.restorePool(poolId);
    }
    return c.json({ success: true, message: 'Pool restored successfully.' });
  });

  // Admin Settings (GET & POST /api/admin/settings)
  app.get('/api/admin/settings', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const settings = await storage.getSystemSettings();
    const env = c.env as any;
    const typesafeKey = env?.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY || '';
    const typesafeConfigured = Boolean(typesafeKey && !typesafeKey.includes('PLACEHOLDER') && typesafeKey.startsWith('apikey_'));
    return c.json({
      success: true,
      settings: {
        typesafe_ai_enabled: 'true',
        ...settings
      },
      typesafe: {
        configured: typesafeConfigured,
        enabled: (settings.typesafe_ai_enabled !== 'false' && settings.typesafe_ai_enabled !== false) && typesafeConfigured,
        model: 'jev-latest'
      }
    });
  });

  app.post('/api/admin/settings', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    const body: any = await c.req.json().catch(() => ({}));
    const settings = body?.settings || {};
    await storage.saveSystemSettings(settings);
    return c.json({ success: true, message: 'Settings saved.' });
  });

  // DB Status (GET /api/db/status)
  app.get('/api/db/status', async (c) => {
    const user = c.get('user');
    const env = c.env as any;
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin') return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);

    return c.json({
      success: true,
      provider: env?.pantrypool_db ? 'Cloudflare D1 SQLite Edge Engine' : 'Node.js MySQL Engine',
      d1Configured: Boolean(env?.pantrypool_db)
    });
  });

  // SCIM 2.0 Directory Sync Endpoints (RFC 7643 / RFC 7644)
  app.get('/api/scim/v2/Users', async (c) => {
    const storage = c.get('storage');
    const users = await storage.listUsers();
    return c.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: users.length,
      Resources: users.map(u => ({
        id: u.id,
        userName: u.email,
        displayName: u.name,
        active: true
      }))
    });
  });

  app.post('/api/scim/v2/Users', async (c) => {
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const email = body.userName || body.emails?.[0]?.value;
    const name = body.displayName || body.name?.formatted || email.split('@')[0];

    if (!email) return c.json({ error: 'userName / email required' }, 400);

    const user = await storage.createUser({
      id: 'u_' + crypto.randomUUID(),
      email: email.toLowerCase().trim(),
      name,
      system_role: 'user',
      token_version: 1
    });

    return c.json({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      userName: user.email,
      displayName: user.name,
      active: true
    }, 201);
  });

  // Admin AI Usage & Cost Telemetry (GET /api/admin/ai-usage)
  app.get('/api/admin/ai-usage', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const env = c.env as any;
    if (!user) return c.json({ success: false, error: 'Authentication required.' }, 401);
    if (user.systemRole !== 'superadmin' && user.systemRole !== 'admin') {
      return c.json({ success: false, error: 'Forbidden: Admin access required.' }, 403);
    }

    const model = env?.GEMINI_OCR_MODEL || 'gemini-2.5-flash-lite';
    const typesafeKey = env?.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY || '';
    const typesafeConfigured = Boolean(typesafeKey && !typesafeKey.includes('PLACEHOLDER') && typesafeKey.startsWith('apikey_'));
    const currentSettings: Record<string, any> = await storage.getSystemSettings().catch(() => ({}));
    const typesafeActive = (currentSettings.typesafe_ai_enabled !== 'false' && currentSettings.typesafe_ai_enabled !== false) && typesafeConfigured;

    const typesafeMetadata = {
      configured: typesafeConfigured,
      enabled: typesafeActive,
      model: 'jev-latest',
      features: ['semantic_haul_parsing', 'item_categorization', 'catalog_deduplication']
    };

    if (storage?.getAiUsageStats) {
      const stats = await storage.getAiUsageStats(model);
      return c.json({ success: true, ...stats, typesafe: typesafeMetadata });
    }

    return c.json({
      success: true,
      summary: {
        totalScans: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        totalEstimatedCostUsd: 0,
        avgCostPerScanUsd: 0.00017,
        activePrimaryModel: model
      },
      modelBreakdown: [],
      recentLogs: [],
      typesafe: typesafeMetadata
    });
  });

  // Support & Admin Email Delivery Logs (GET /api/admin/email-logs)
  app.get('/api/admin/email-logs', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }
    if (user.systemRole !== 'superadmin' && user.systemRole !== 'admin') {
      return c.json({ success: false, error: 'Forbidden: Admin access required.' }, 403);
    }

    const recipientEmail = c.req.query('email') || c.req.query('recipientEmail');
    const userId = c.req.query('userId');
    const emailType = c.req.query('emailType') || c.req.query('type');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    if (storage?.listEmailLogs) {
      const result = await storage.listEmailLogs({
        recipientEmail,
        userId,
        emailType,
        limit,
        offset,
      });
      return c.json({
        success: true,
        logs: result.logs,
        total: result.total,
      });
    }

    return c.json({
      success: true,
      logs: [],
      total: 0,
    });
  });
}
