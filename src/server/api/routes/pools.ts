import { Hono } from 'hono';
import { HonoEnv } from '../app';
import { getTierLimits } from '../tierLimits';
import { extractJoinCode } from '../../../lib/joinCode';
import { logSecurityEvent } from '../auditLogger';

export function generatePoolJoinCode(): string {
  // Generate a clean, short 6-character code (PP + 4 chars, e.g. PP7M3X)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `PP${suffix}`;
}

export async function generateUniquePoolJoinCode(storage: any, maxAttempts = 10): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generatePoolJoinCode();
    const existing = storage?.getPoolByCode ? await storage.getPoolByCode(candidate) : null;
    if (!existing) {
      return candidate;
    }
  }
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let extra = '';
  for (let i = 0; i < 4; i++) {
    extra += chars[Math.floor(Math.random() * chars.length)];
  }
  return `PP${extra}`;
}

export function resolvePoolCode(pool: any): string {
  if (!pool) return '';
  if (pool.qr_code_key) return pool.qr_code_key;
  if (pool.qrCodeKey) return pool.qrCodeKey;
  if (pool.code) return pool.code;
  if (typeof pool.id === 'string' && pool.id.startsWith('pool_') && pool.id.length > 10) {
    return pool.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
  }
  return pool.id || '';
}

export function registerPoolRoutes(app: Hono<HonoEnv>) {
  // List Pools
  app.get('/api/pools', async (c) => {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    c.header('Vary', 'Authorization');
    const user = c.get('user');
    const storage = c.get('storage');
    const userId = user?.userId || c.req.query('userId') || 'u_guest';
    const orgId = c.req.query('orgId');

    let pools: any[] = [];

    try {
      if (orgId) {
        if (storage.getPoolsByOrg) {
          pools = await storage.getPoolsByOrg(orgId);
        } else {
          const userPools = await storage.listPoolsForUser(userId);
          pools = userPools.filter((p: any) => p.organization_id === orgId);
        }
        const userOrgs = user?.userId
          ? (storage.listOrgsForUser ? await storage.listOrgsForUser(user.userId) : await storage.listOrgsByOwner(user.userId))
          : [];
        const hasAccess = userOrgs.some((o: any) => o.id === orgId) || (user?.userId ? pools.some((p: any) => p.champion_id === user.userId) : false);
        if (!hasAccess) {
          const memberPools = await storage.listPoolsForUser(userId);
          pools = pools.filter(p => memberPools.some(mp => mp.id === p.id));
        }
      } else {
        pools = await storage.listPoolsForUser(userId);
      }
    } catch (err: any) {
      console.error('[API] Error querying pools in /api/pools:', err);
      if (orgId) {
        try {
          pools = await storage.listPoolsForUser(userId);
        } catch {
          pools = [];
        }
      } else {
        pools = [];
      }
    }

    const isCallerSuperAdmin = user?.systemRole === 'superadmin' || user?.systemRole === 'admin';

    for (const pool of pools) {
      try {
        const members = await storage.listPoolMembers(pool.id);
        const callerIsMemberOfPool = Boolean(user?.userId && (
          isCallerSuperAdmin ||
          pool.champion_id === user.userId ||
          members.some(m => (m.user_id || (m as any).userId) === user.userId)
        ));

        const enrichedMembers = await Promise.all(
          members.map(async (m) => {
            const uId = m.user_id || (m as any).userId || m.id;
            const u = storage.getUserById ? await storage.getUserById(uId) : null;
            return {
              id: uId,
              memberId: m.id,
              userId: uId,
              user_id: uId,
              poolId: m.pool_id,
              pool_id: m.pool_id,
              role: m.role,
              balance: m.balance,
              balanceCents: m.balance_cents,
              name: u?.name || (m as any).name || 'Member',
              email: callerIsMemberOfPool ? (u?.email || (m as any).email || '') : undefined,
              avatar: u?.avatar_url || (m as any).avatar || (m as any).avatarUrl || null,
              avatarUrl: u?.avatar_url || (m as any).avatarUrl || (m as any).avatar || null,
              joinedAt: m.joined_at,
              venmoHandle: callerIsMemberOfPool ? u?.venmo_handle : undefined,
              cashappHandle: callerIsMemberOfPool ? u?.cashapp_handle : undefined,
              paypalHandle: callerIsMemberOfPool ? u?.paypal_handle : undefined,
              zelleIdentifier: callerIsMemberOfPool ? u?.zelle_identifier : undefined,
              applePayHandle: callerIsMemberOfPool ? u?.apple_pay_handle : undefined,
              preferredPaymentMethod: callerIsMemberOfPool ? u?.preferred_payment_method : undefined
            };
          })
        );
        (pool as any).members = enrichedMembers;
      } catch {
        (pool as any).members = [];
      }
      (pool as any).maxDeficit = pool.max_deficit !== undefined && pool.max_deficit !== null ? Number(pool.max_deficit) : 10.00;
      (pool as any).maxDeficitCents = pool.max_deficit_cents !== undefined && pool.max_deficit_cents !== null ? Number(pool.max_deficit_cents) : Math.round(((pool as any).maxDeficit || 10) * 100);
      (pool as any).savingsEnabled = pool.savings_enabled !== undefined && pool.savings_enabled !== null ? Boolean(pool.savings_enabled) : true;
      (pool as any).savingsLeaderboardOptIn = Boolean(pool.savings_leaderboard_opt_in);
      (pool as any).leaderboardAlias = pool.leaderboard_alias || null;
      (pool as any).metroTier = pool.metro_tier || 'standard';
      const resolvedCode = resolvePoolCode(pool);
      (pool as any).code = resolvedCode;
      (pool as any).qrCodeKey = resolvedCode;
    }

    const sanitizedPools = pools.map((p) => {
      const isPrivileged = user?.systemRole === 'superadmin' || user?.systemRole === 'admin' || p.champion_id === user?.userId;
      if (!isPrivileged) {
        delete (p as any).kiosk_pin;
        delete (p as any).kioskPin;
      }
      return p;
    });
    return c.json({ success: true, pools: sanitizedPools });
  });

  // Create Pool
  app.post('/api/pools', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { name, category, currency, description, kioskPin, organizationId, maxDeficit, max_deficit, savingsEnabled, savings_enabled, savingsLeaderboardOptIn, savings_leaderboard_opt_in, leaderboardAlias, leaderboard_alias, metroTier, metro_tier } = body || {};

    if (!name) return c.json({ success: false, error: 'Pool name is required.' }, 400);

    const isSuperAdmin = user?.systemRole === 'superadmin' || user?.systemRole === 'admin';
    if (organizationId) {
      const org = await storage.getOrgById(organizationId);
      if (!org) return c.json({ success: false, error: 'Organization not found.' }, 404);

      const isOwner = Boolean(user?.userId && org.owner_id && org.owner_id === user.userId);
      let isOrgAdmin = false;
      if (org.owner_id && !isOwner && user?.userId && storage.getOrgMember) {
        const orgMember = await storage.getOrgMember(organizationId, user.userId);
        if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) {
          isOrgAdmin = true;
        }
      }

      if (org.owner_id && !isSuperAdmin && !isOwner && !isOrgAdmin) {
        return c.json({ success: false, error: 'Forbidden: You do not have permission to create pools in this workspace.' }, 403);
      }

      const orgTier = org?.tier || 'starter';
      const limits = getTierLimits(orgTier);
      if (limits.maxPools !== null) {
        const orgPools = storage.getPoolsByOrg ? await storage.getPoolsByOrg(organizationId) : [];
        const poolsCount = orgPools.length;
        if (poolsCount >= limits.maxPools) {
          const errorMsg = orgTier === 'plus'
            ? `Pool limit reached (${poolsCount}/${limits.maxPools}) for Hosted Plus. Contact us for an Enterprise workspace for unlimited pools.`
            : `Pool limit reached (${poolsCount}/${limits.maxPools}) for tier '${orgTier}'. Upgrade to Pro for up to 5 pools or Enterprise for unlimited pools.`;
          return c.json({
            success: false,
            upgradeRequired: true,
            tier: orgTier,
            limit: limits.maxPools,
            error: errorMsg
          }, 403);
        }
      }
    } else if (user?.userId && !isSuperAdmin) {
      const personalPoolsCount = storage.countPersonalPools ? await storage.countPersonalPools(user.userId) : 0;
      if (personalPoolsCount >= 1) {
        return c.json({
          success: false,
          upgradeRequired: true,
          limit: 1,
          error: `Free plan limit reached (${personalPoolsCount}/1 pool). Upgrade to a Pro workspace to create up to 5 pools.`
        }, 403);
      }
    }

    const poolId = 'pool_' + crypto.randomUUID();
    let qrCodeKey: string;
    const requestedCode = (body?.code || body?.qrCodeKey || '').trim().toUpperCase();
    if (requestedCode) {
      const existing = storage?.getPoolByCode ? await storage.getPoolByCode(requestedCode) : null;
      if (existing) {
        return c.json({ success: false, error: `The join code "${requestedCode}" is already in use by another pool. Please choose a different code.` }, 400);
      }
      qrCodeKey = requestedCode;
    } else {
      qrCodeKey = await generateUniquePoolJoinCode(storage);
    }
    const parsedDeficit = maxDeficit !== undefined ? Number(maxDeficit) : (max_deficit !== undefined ? Number(max_deficit) : 10.00);
    const parsedDeficitCents = Math.round(parsedDeficit * 100);

    const isSavingsEnabled = savingsEnabled !== undefined ? Boolean(savingsEnabled) : (savings_enabled !== undefined ? Boolean(savings_enabled) : true);
    const isLeaderboardOptIn = savingsLeaderboardOptIn !== undefined ? Boolean(savingsLeaderboardOptIn) : (savings_leaderboard_opt_in !== undefined ? Boolean(savings_leaderboard_opt_in) : false);
    const resolvedAlias = leaderboardAlias !== undefined ? leaderboardAlias : (leaderboard_alias !== undefined ? leaderboard_alias : null);
    const resolvedTier = metroTier || metro_tier || 'standard';

    const pool = await storage.createPool({
      id: poolId,
      organization_id: organizationId || null,
      name: name.trim(),
      category: category || 'Office',
      currency: currency || '$',
      qr_code_key: qrCodeKey,
      description: description || null,
      kiosk_pin: kioskPin || String(Math.floor(100000 + Math.random() * 900000)),
      champion_id: user?.userId || null,
      max_deficit: parsedDeficit,
      max_deficit_cents: parsedDeficitCents,
      savings_enabled: isSavingsEnabled,
      savings_leaderboard_opt_in: isLeaderboardOptIn,
      leaderboard_alias: resolvedAlias ? resolvedAlias.trim() : null,
      metro_tier: resolvedTier
    });

    if (user?.userId) {
      await storage.upsertPoolMember({
        id: 'pm_' + crypto.randomUUID(),
        pool_id: poolId,
        user_id: user.userId,
        role: 'champion',
        balance: 0,
        balance_cents: 0
      });
    }

    const resolvedCode = resolvePoolCode(pool) || qrCodeKey;
    (pool as any).code = resolvedCode;
    (pool as any).qrCodeKey = resolvedCode;
    (pool as any).savingsEnabled = isSavingsEnabled;

    return c.json({
      success: true,
      poolId,
      qrCodeKey: resolvedCode,
      code: resolvedCode,
      pool: {
        ...pool,
        code: resolvedCode,
        qrCodeKey: resolvedCode,
        savingsEnabled: isSavingsEnabled,
        savings_enabled: isSavingsEnabled
      }
    });
  });

  // Get Single Pool
  app.get('/api/pools/:poolId', async (c) => {
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const pool = await storage.getPoolById(poolId);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);

    (pool as any).savingsEnabled = pool.savings_enabled !== undefined && pool.savings_enabled !== null ? Boolean(pool.savings_enabled) : true;
    (pool as any).savingsLeaderboardOptIn = Boolean(pool.savings_leaderboard_opt_in);
    (pool as any).leaderboardAlias = pool.leaderboard_alias || null;
    (pool as any).metroTier = pool.metro_tier || 'standard';
    const resolvedCode = resolvePoolCode(pool);
    (pool as any).code = resolvedCode;
    (pool as any).qrCodeKey = resolvedCode;
    const user = c.get('user');
    const isPrivileged = user?.systemRole === 'superadmin' || user?.systemRole === 'admin' || pool.champion_id === user?.userId;
    if (!isPrivileged) {
      delete (pool as any).kiosk_pin;
      delete (pool as any).kioskPin;
    }

    return c.json({ success: true, pool });
  });

  // Update Pool
  app.put('/api/pools/:poolId', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const pool = await storage.getPoolById(poolId);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);
    if (pool.is_archived) return c.json({ success: false, error: 'Cannot update an archived pantry pool.' }, 400);

    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const member = await storage.getPoolMember(poolId, user.userId);
    const isSuperOrAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isChampion = pool.champion_id === user.userId;
    const isManager = member && (member.role === 'champion' || member.role === 'admin');

    let isOrgAdmin = false;
    if (pool.organization_id) {
      const org = storage.getOrgById ? await storage.getOrgById(pool.organization_id) : null;
      if (org && org.owner_id === user.userId) {
        isOrgAdmin = true;
      } else if (storage.getOrgMember) {
        const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
        if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) {
          isOrgAdmin = true;
        }
      }
    }

    if (!isSuperOrAdmin && !isChampion && !isManager && !isOrgAdmin) {
      return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required.' }, 403);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { name, category, currency, description, kioskPin, maxDeficit, max_deficit, savingsEnabled, savings_enabled, savingsLeaderboardOptIn, savings_leaderboard_opt_in, leaderboardAlias, leaderboard_alias, metroTier, metro_tier } = body || {};

    const updates: any = {};
    if (name) updates.name = name.trim();
    if (category) updates.category = category;
    if (currency) updates.currency = currency;
    if (description !== undefined) updates.description = description !== null ? String(description).trim() : '';
    if (kioskPin !== undefined) updates.kiosk_pin = kioskPin;
    const newCode = (body?.code || body?.qrCodeKey || body?.qr_code_key || '').trim().toUpperCase();
    if (newCode) {
      const existing = storage?.getPoolByCode ? await storage.getPoolByCode(newCode) : null;
      if (existing && existing.id !== poolId) {
        return c.json({ success: false, error: `The join code "${newCode}" is already in use by another pool. Please choose a different code.` }, 400);
      }
      updates.qr_code_key = newCode;
    }
    if (maxDeficit !== undefined || max_deficit !== undefined) {
      const defVal = maxDeficit !== undefined ? Number(maxDeficit) : Number(max_deficit);
      updates.max_deficit = defVal;
      updates.max_deficit_cents = Math.round(defVal * 100);
      logSecurityEvent(c, {
        action: 'LIMIT_OVERRIDE',
        targetResource: `/api/pools/${poolId}`,
        status: 'SUCCESS',
        metadata: {
          previousDeficitCents: pool.max_deficit_cents,
          newDeficitCents: updates.max_deficit_cents,
          poolId
        }
      });
    }
    if (savingsEnabled !== undefined || savings_enabled !== undefined) {
      updates.savings_enabled = savingsEnabled !== undefined ? Boolean(savingsEnabled) : Boolean(savings_enabled);
    }
    if (savingsLeaderboardOptIn !== undefined || savings_leaderboard_opt_in !== undefined) {
      updates.savings_leaderboard_opt_in = savingsLeaderboardOptIn !== undefined ? Boolean(savingsLeaderboardOptIn) : Boolean(savings_leaderboard_opt_in);
    }
    if (leaderboardAlias !== undefined || leaderboard_alias !== undefined) {
      const aliasVal = leaderboardAlias !== undefined ? leaderboardAlias : leaderboard_alias;
      updates.leaderboard_alias = aliasVal ? String(aliasVal).trim() : null;
    }
    if (metroTier !== undefined || metro_tier !== undefined) {
      updates.metro_tier = metroTier || metro_tier || 'standard';
    }

    await storage.updatePool(poolId, updates);
    const updated = await storage.getPoolById(poolId);
    if (updated) {
      const resolvedUpdatedCode = resolvePoolCode(updated);
      (updated as any).code = resolvedUpdatedCode;
      (updated as any).qrCodeKey = resolvedUpdatedCode;
    }
    return c.json({ success: true, pool: updated });
  });

  // Delete Pool
  app.delete('/api/pools/:poolId', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const pool = await storage.getPoolById(poolId);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);

    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const isSuperOrAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isChampion = pool.champion_id === user.userId;
    const member = await storage.getPoolMember(poolId, user.userId);
    const isManager = member && (member.role === 'champion' || member.role === 'admin');

    let isOrgAdmin = false;
    if (pool.organization_id) {
      const org = storage.getOrgById ? await storage.getOrgById(pool.organization_id) : null;
      if (org && org.owner_id === user.userId) {
        isOrgAdmin = true;
      } else if (storage.getOrgMember) {
        const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
        if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) {
          isOrgAdmin = true;
        }
      }
    }

    if (!isSuperOrAdmin && !isChampion && !isManager && !isOrgAdmin) {
      return c.json({ success: false, error: 'Forbidden: Only pool managers may delete pools.' }, 403);
    }

    const isGdpr = c.req.query('gdpr') === 'true' || c.req.query('hardDelete') === 'true';
    await storage.deletePool(poolId, { hardDelete: isGdpr, gdpr: isGdpr });
    return c.json({
      success: true,
      message: isGdpr ? 'Pool permanently deleted.' : 'Pool deleted successfully.',
      isArchived: !isGdpr
    });
  });

  // List Pool Members
  app.get('/api/pools/:poolId/members', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const pool = await storage.getPoolById(poolId);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);

    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to inspect pool members.' }, 401);
    }

    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isChampion = pool.champion_id === user.userId;
    const callerMember = await storage.getPoolMember(poolId, user.userId);
    let isOrgAdmin = false;
    if (pool.organization_id && storage.getOrgById) {
      const org = await storage.getOrgById(pool.organization_id);
      if (org && org.owner_id === user.userId) isOrgAdmin = true;
      else if (storage.getOrgMember) {
        const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
        if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) isOrgAdmin = true;
      }
    }
    if (!isSuperAdmin && !isChampion && !callerMember && !isOrgAdmin) {
      return c.json({ success: false, error: 'Forbidden: You do not have permission to inspect members of this pool.' }, 403);
    }

    const members = await storage.listPoolMembers(poolId);
    const enriched = await Promise.all(
      members.map(async (m) => {
        const uId = m.user_id || (m as any).userId || m.id;
        const u = storage.getUserById ? await storage.getUserById(uId) : null;
        return {
          id: uId,
          memberId: m.id,
          poolId: m.pool_id,
          pool_id: m.pool_id,
          userId: uId,
          user_id: uId,
          role: m.role,
          balance: m.balance,
          balanceCents: m.balance_cents,
          name: u?.name || (m as any).name || 'Member',
          email: u?.email || (m as any).email || '',
          avatar: u?.avatar_url || (m as any).avatar || (m as any).avatarUrl || null,
          avatarUrl: u?.avatar_url || (m as any).avatarUrl || (m as any).avatar || null,
          joinedAt: m.joined_at,
          venmoHandle: u?.venmo_handle,
          cashappHandle: u?.cashapp_handle,
          paypalHandle: u?.paypal_handle,
          zelleIdentifier: u?.zelle_identifier,
          applePayHandle: u?.apple_pay_handle,
          preferredPaymentMethod: u?.preferred_payment_method
        };
      })
    );

    return c.json({ success: true, members: enriched });
  });

  // Add Member
  app.post('/api/pools/:poolId/members', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');

    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const pool = await storage.getPoolById(poolId);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);

    const isSuperOrAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isChampion = pool.champion_id === user.userId;
    const callerMember = await storage.getPoolMember(poolId, user.userId);
    const isManager = callerMember && (callerMember.role === 'champion' || callerMember.role === 'admin');

    let isOrgAdmin = false;
    if (pool.organization_id) {
      const org = storage.getOrgById ? await storage.getOrgById(pool.organization_id) : null;
      if (org && org.owner_id === user.userId) {
        isOrgAdmin = true;
      } else if (storage.getOrgMember) {
        const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
        if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) {
          isOrgAdmin = true;
        }
      }
    }

    if (!isSuperOrAdmin && !isChampion && !isManager && !isOrgAdmin) {
      return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required to add members.' }, 403);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { email, userId, role = 'member' } = body || {};

    let targetUserId = userId;
    if (!targetUserId && email) {
      const u = await storage.getUserByEmail(email.toLowerCase().trim());
      if (u) targetUserId = u.id;
    }

    if (!targetUserId) {
      return c.json({ success: false, error: 'User could not be found to add as member.' }, 404);
    }

    const existing = await storage.getPoolMember(poolId, targetUserId);
    if (existing) {
      return c.json({ success: false, error: 'User is already a member of this pool.' }, 400);
    }

    let poolTier = 'community';
    if (pool.organization_id && storage.getOrgById) {
      const org = await storage.getOrgById(pool.organization_id);
      if (org) poolTier = org.tier || 'community';
    }
    const memberLimits = getTierLimits(poolTier);
    if (memberLimits.maxMembersPerPool) {
      const currentMembers = await storage.listPoolMembers(poolId);
      if (currentMembers.length >= memberLimits.maxMembersPerPool) {
        return c.json({
          success: false,
          upgradeRequired: true,
          tier: poolTier,
          limit: memberLimits.maxMembersPerPool,
          error: `Member limit reached (${currentMembers.length}/${memberLimits.maxMembersPerPool}) for this pantry. ${poolTier === 'plus' ? 'Contact us for an Enterprise workspace for unlimited members.' : 'Upgrade your workspace for higher member capacity.'}`
        }, 403);
      }
    }

    await storage.upsertPoolMember({
      id: 'pm_' + crypto.randomUUID(),
      pool_id: poolId,
      user_id: targetUserId,
      role,
      balance: 0,
      balance_cents: 0
    });

    return c.json({ success: true, message: 'Member added successfully.' });
  });

  // Remove Member
  app.delete('/api/pools/:poolId/members/:userId', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const targetUserId = c.req.param('userId');

    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const isSelf = user.userId === targetUserId;
    const isSuperOrAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const pool = await storage.getPoolById(poolId);
    const isChampion = pool?.champion_id === user.userId;
    const callerMember = await storage.getPoolMember(poolId, user.userId);
    const isManager = callerMember && (callerMember.role === 'champion' || callerMember.role === 'admin');

    if (!isSelf && !isSuperOrAdmin && !isChampion && !isManager) {
      return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required to remove members.' }, 403);
    }

    await storage.removePoolMember(poolId, targetUserId);
    return c.json({ success: true, message: 'Member removed from pool.' });
  });

  // Update Member Role
  const handleUpdateMemberRole = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const targetUserId = c.req.param('userId');

    const pool = await storage.getPoolById(poolId);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);

    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const isSuperOrAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isChampion = pool.champion_id === user.userId;
    const callerMember = await storage.getPoolMember(poolId, user.userId);
    const isManager = callerMember && (callerMember.role === 'champion' || callerMember.role === 'admin');
    if (!isSuperOrAdmin && !isChampion && !isManager) {
      logSecurityEvent(c, {
        action: 'ACCESS_DENIED',
        targetResource: `/api/pools/${poolId}/members/${targetUserId}/role`,
        status: 'FAILURE',
        metadata: { reason: 'insufficient_privileges', poolId, targetUserId, callerUserId: user.userId }
      });
      return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required.' }, 403);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const role = body?.role || body?.systemRole;
    if (!role || !['champion', 'admin', 'member'].includes(role)) {
      return c.json({ success: false, error: 'Valid role (champion, admin, member) is required.' }, 400);
    }

    await storage.updateMemberRole(poolId, targetUserId, role);
    logSecurityEvent(c, {
      action: 'ROLE_CHANGE',
      targetResource: `/api/pools/${poolId}/members/${targetUserId}/role`,
      status: 'SUCCESS',
      metadata: { targetUserId, newRole: role, poolId, actorUserId: user.userId }
    });
    return c.json({ success: true, message: `Member role updated to ${role}.` });
  };

  app.put('/api/pools/:poolId/members/:userId/role', handleUpdateMemberRole);
  app.put('/api/pools/:poolId/members/:userId', handleUpdateMemberRole);

  // Join Pool via Invite Code
  app.post('/api/pools/join', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) {
      return c.json({ success: false, error: 'Must be logged in to join pool.' }, 401);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const rawCode = (body?.code || body?.inviteCode || body?.qrCodeKey || '').trim();
    if (!rawCode) {
      return c.json({ success: false, error: 'Invite code is required.' }, 400);
    }
    const code = extractJoinCode(rawCode);
    if (!code) {
      return c.json({ success: false, error: 'Invalid pool invite code format.' }, 400);
    }

    let pool = storage.getPoolByCode ? await storage.getPoolByCode(code) : null;
    if (!pool) {
      pool = await storage.getPoolById(code);
    }
    if (!pool && code.length >= 6) {
      const stripped = code.replace(/^(PANTRY[-_]|PNTR[-_])/i, '');
      if (storage.getPoolByCode) {
        pool = await storage.getPoolByCode(stripped);
      }
    }

    if (!pool) {
      return c.json({ success: false, error: 'Invalid pool invite code.' }, 404);
    }
    if (pool.is_archived) {
      return c.json({ success: false, error: 'This pantry has been archived and is not accepting new members.' }, 400);
    }

    const existing = await storage.getPoolMember(pool.id, user.userId);
    if (!existing) {
      let poolTier = 'community';
      if (pool.organization_id && storage.getOrgById) {
        const org = await storage.getOrgById(pool.organization_id);
        if (org) poolTier = org.tier || 'community';
      }
      const memberLimits = getTierLimits(poolTier);
      if (memberLimits.maxMembersPerPool) {
        const currentMembers = await storage.listPoolMembers(pool.id);
        if (currentMembers.length >= memberLimits.maxMembersPerPool) {
          return c.json({
            success: false,
            upgradeRequired: true,
            tier: poolTier,
            limit: memberLimits.maxMembersPerPool,
            error: `Member limit reached (${currentMembers.length}/${memberLimits.maxMembersPerPool}) for this pantry. ${poolTier === 'plus' ? 'Contact us for an Enterprise workspace for unlimited members.' : 'Upgrade workspace plan to allow more members.'}`
          }, 403);
        }
      }

      await storage.upsertPoolMember({
        id: 'pm_' + crypto.randomUUID(),
        pool_id: pool.id,
        user_id: user.userId,
        role: 'member',
        balance: 0,
        balance_cents: 0
      });
    }

    const resolvedCode = resolvePoolCode(pool);
    (pool as any).code = resolvedCode;
    (pool as any).qrCodeKey = resolvedCode;

    return c.json({
      success: true,
      poolId: pool.id,
      pool,
      code: resolvedCode,
      qrCodeKey: resolvedCode,
      name: pool.name,
      message: 'Successfully joined pantry pool.'
    });
  });

  // Join Pool via QR Key
  app.post('/api/pools/:poolId/join', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const body: any = await c.req.json().catch(() => ({}));
    const { qrCodeKey } = body || {};

    const pool = await storage.getPoolById(poolId);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);

    if (pool.qr_code_key && qrCodeKey && pool.qr_code_key !== qrCodeKey) {
      return c.json({ success: false, error: 'Invalid QR access key.' }, 403);
    }

    if (!user) {
      return c.json({ success: false, error: 'Must be logged in to join pool.' }, 401);
    }

    const existing = await storage.getPoolMember(poolId, user.userId);
    if (!existing) {
      let poolTier = 'community';
      if (pool.organization_id && storage.getOrgById) {
        const org = await storage.getOrgById(pool.organization_id);
        if (org) poolTier = org.tier || 'community';
      }
      const memberLimits = getTierLimits(poolTier);
      if (memberLimits.maxMembersPerPool) {
        const currentMembers = await storage.listPoolMembers(poolId);
        if (currentMembers.length >= memberLimits.maxMembersPerPool) {
          return c.json({
            success: false,
            upgradeRequired: true,
            tier: poolTier,
            limit: memberLimits.maxMembersPerPool,
            error: `Member limit reached (${currentMembers.length}/${memberLimits.maxMembersPerPool}) for this pantry. ${poolTier === 'plus' ? 'Contact us for an Enterprise workspace for unlimited members.' : 'Upgrade workspace plan to allow more members.'}`
          }, 403);
        }
      }

      await storage.upsertPoolMember({
        id: 'pm_' + crypto.randomUUID(),
        pool_id: poolId,
        user_id: user.userId,
        role: 'member',
        balance: 0,
        balance_cents: 0
      });
    }

    return c.json({ success: true, pool, message: 'Successfully joined pantry pool.' });
  });

  // Nudge Member
  app.post('/api/pools/:poolId/nudge', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const body: any = await c.req.json().catch(() => ({}));
    const { userId: targetUserId } = body || {};

    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    if (!targetUserId) {
      return c.json({ success: false, error: 'Target userId is required.' }, 400);
    }

    const pool = await storage.getPoolById(poolId);
    if (!pool) {
      return c.json({ success: false, error: 'Pool not found.' }, 404);
    }

    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isChampion = pool.champion_id === user.userId;
    const callerMember = await storage.getPoolMember(poolId, user.userId);
    let isOrgAdmin = false;
    if (pool.organization_id && storage.getOrgById) {
      const org = await storage.getOrgById(pool.organization_id);
      if (org && org.owner_id === user.userId) isOrgAdmin = true;
      else if (storage.getOrgMember) {
        const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
        if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) isOrgAdmin = true;
      }
    }
    if (!isSuperAdmin && !isChampion && !callerMember && !isOrgAdmin) {
      return c.json({ success: false, error: 'Forbidden: You must be a member of this pool to send balance reminders.' }, 403);
    }

    const member = await storage.getPoolMember(poolId, targetUserId);
    if (!member) {
      return c.json({ success: false, error: 'Member not found in pool.' }, 404);
    }

    const balance = member.balance;

    await storage.createNotification({
      id: 'notif_' + crypto.randomUUID(),
      user_id: targetUserId,
      pool_id: poolId,
      type: 'balance_nudge',
      title: 'Friendly Balance Reminder',
      message: `Your balance in ${pool?.name || 'the pool'} is currently ${balance < 0 ? '-' : ''}${pool?.currency || '$'}${Math.abs(balance).toFixed(2)}. Please settle up when you get a chance!`,
      channel: 'in_app',
      is_read: false
    });

    return c.json({ success: true, message: 'Nudge notification sent to member.' });
  });

  // Verify Kiosk PIN
  app.post('/api/pools/:poolId/verify-kiosk-pin', async (c) => {
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const body: any = await c.req.json().catch(() => ({}));
    const { pin } = body || {};

    const pool = await storage.getPoolById(poolId);
    if (!pool) {
      return c.json({ success: false, verified: false, error: 'Pool not found.' }, 404);
    }

    const storedPin = pool.kiosk_pin;
    if (!storedPin) {
      return c.json({ success: false, verified: false, error: 'Kiosk PIN not configured for this pool.' }, 400);
    }

    if (pin !== undefined && pin !== null && String(pin).trim() === String(storedPin).trim()) {
      return c.json({ success: true, verified: true });
    }
    return c.json({ success: false, verified: false, error: 'Incorrect Kiosk Admin PIN.' }, 400);
  });

  // Get Pool Savings Summary
  app.get('/api/pools/:poolId/savings', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const pool = await storage.getPoolById(poolId);
    if (!pool) return c.json({ success: false, error: 'Pool not found.' }, 404);

    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to view savings for this pool.' }, 401);
    }

    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isChampion = pool.champion_id === user.userId;
    const callerMember = await storage.getPoolMember(poolId, user.userId);
    let isOrgAdmin = false;
    if (pool.organization_id && storage.getOrgById) {
      const org = await storage.getOrgById(pool.organization_id);
      if (org && org.owner_id === user.userId) isOrgAdmin = true;
      else if (storage.getOrgMember) {
        const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
        if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) isOrgAdmin = true;
      }
    }
    if (!isSuperAdmin && !isChampion && !callerMember && !isOrgAdmin) {
      return c.json({ success: false, error: 'Forbidden: You do not have permission to view savings for this pool.' }, 403);
    }

    const summary = storage.getPoolSavingsSummary
      ? await storage.getPoolSavingsSummary(poolId)
      : { totalSavingsCents: 0, totalSavings: 0, itemsConsumedCount: 0, topSavedItems: [] };

    return c.json({
      success: true,
      poolId,
      savingsEnabled: Boolean(pool.savings_enabled),
      savingsLeaderboardOptIn: Boolean(pool.savings_leaderboard_opt_in),
      leaderboardAlias: pool.leaderboard_alias,
      metroTier: pool.metro_tier || 'standard',
      summary
    });
  });

  // Global Cross-Pool Savings Leaderboard (Opt-In Pools Only)
  app.get('/api/leaderboard/savings', async (c) => {
    const storage = c.get('storage');
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '25', 10)));
    const leaderboard = storage.getGlobalSavingsLeaderboard
      ? await storage.getGlobalSavingsLeaderboard(limit)
      : { pools: [], leaderboard: [], totalOptedInPools: 0, networkTotalSavingsCents: 0, networkTotalSavings: 0 };

    return c.json({
      success: true,
      ...leaderboard
    });
  });
}
