import { Hono } from 'hono';
import { HonoEnv } from '../app';
import { normalizeTier, getTierLimits } from '../tierLimits';

export function registerOrganizationRoutes(app: Hono<HonoEnv>) {
  app.get('/api/organizations', async (c) => {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    c.header('Vary', 'Authorization');
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Unauthorized.' }, 401);

    const orgs = storage.listOrgsForUser ? await storage.listOrgsForUser(user.userId) : await storage.listOrgsByOwner(user.userId);
    return c.json({
      success: true,
      organizations: orgs.map(o => ({
        id: o.id,
        name: o.name,
        ownerId: o.owner_id,
        tier: normalizeTier(o.tier),
        inviteCode: o.invite_code,
        role: o.role || (o.owner_id === user.userId ? 'owner' : 'member'),
        stripeCustomerId: o.stripe_customer_id,
        stripeSubscriptionId: o.stripe_subscription_id,
        createdAt: o.created_at
      }))
    });
  });

  app.post('/api/organizations', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Unauthorized.' }, 401);

    const body: any = await c.req.json().catch(() => ({}));
    const { name, tier } = body || {};
    if (!name || !name.trim()) return c.json({ success: false, error: 'Organization name is required.' }, 400);

    const cleanName = name.trim();
    if (storage.getOrgByNameAndOwner) {
      const existing = await storage.getOrgByNameAndOwner(cleanName, user.userId);
      if (existing) {
        return c.json({
          success: false,
          error: `You already have an organization named "${cleanName}". Workspace names must be unique to your account.`
        }, 400);
      }
    }

    const requestedTier = tier ? normalizeTier(tier) : 'community';
    const orgId = 'org_' + crypto.randomUUID();
    const inviteCode = 'ORG_' + crypto.randomUUID().substring(0, 6).toUpperCase();

    const created = await storage.createOrg({
      id: orgId,
      name: cleanName,
      owner_id: user.userId,
      tier: requestedTier,
      invite_code: inviteCode
    });

    if (storage.addOrgMember) {
      await storage.addOrgMember({
        id: 'om_' + crypto.randomUUID(),
        organization_id: orgId,
        user_id: user.userId,
        role: 'owner',
        invited_by: null
      });
    }

    return c.json({
      success: true,
      organization: {
        id: created.id,
        name: created.name,
        ownerId: created.owner_id,
        tier: created.tier,
        inviteCode: created.invite_code || inviteCode,
        role: 'owner'
      }
    });
  });

  // Atomic Onboarding: creates Workspace + Initial Pool + Starter Items in 1 step
  app.post('/api/organizations/onboard', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Unauthorized.' }, 401);

    const body: any = await c.req.json().catch(() => ({}));
    const { orgName, poolName, category, currency, tier, starterItems } = body || {};
    if (!orgName || !orgName.trim()) {
      return c.json({ success: false, error: 'Organization name is required.' }, 400);
    }

    const cleanOrgName = orgName.trim();
    if (storage.getOrgByNameAndOwner) {
      const existing = await storage.getOrgByNameAndOwner(cleanOrgName, user.userId);
      if (existing) {
        return c.json({
          success: false,
          error: `You already have an organization named "${cleanOrgName}". Workspace names must be unique to your account.`
        }, 400);
      }
    }

    const requestedTier = tier ? normalizeTier(tier) : 'community';
    const orgId = 'org_' + crypto.randomUUID();
    const inviteCode = 'ORG_' + crypto.randomUUID().substring(0, 6).toUpperCase();

    const createdOrg = await storage.createOrg({
      id: orgId,
      name: cleanOrgName,
      owner_id: user.userId,
      tier: requestedTier,
      invite_code: inviteCode
    });

    if (storage.addOrgMember) {
      await storage.addOrgMember({
        id: 'om_' + crypto.randomUUID(),
        organization_id: orgId,
        user_id: user.userId,
        role: 'owner',
        invited_by: null
      });
    }

    const finalPoolName = (poolName && poolName.trim()) ? poolName.trim() : `${cleanOrgName} Pantry`;
    const poolId = 'pool_' + crypto.randomUUID();
    const qrCodeKey = 'PNTR_' + crypto.randomUUID().substring(0, 6).toUpperCase();

    const createdPool = await storage.createPool({
      id: poolId,
      organization_id: orgId,
      name: finalPoolName,
      category: category || 'Office',
      currency: currency || '$',
      qr_code_key: qrCodeKey,
      champion_id: user.userId,
      description: `Primary supply pantry for ${cleanOrgName}`
    });

    // Add creator as champion member
    await storage.upsertPoolMember({
      id: 'pm_' + crypto.randomUUID(),
      pool_id: poolId,
      user_id: user.userId,
      role: 'champion',
      balance: 0,
      balance_cents: 0
    });

    // Optional starter items
    if (starterItems) {
      const defaultItems = [
        { name: 'Coffee Beans (1kg bag)', category: 'Drinks & Coffee', cost: 14.50, stock: 3, minStock: 1, unit: 'bag' },
        { name: 'Oat Milk (Barista)', category: 'Drinks & Coffee', cost: 3.75, stock: 6, minStock: 2, unit: 'carton' },
        { name: 'Sparkling Water (Can)', category: 'Drinks & Coffee', cost: 1.25, stock: 12, minStock: 4, unit: 'can' },
        { name: 'Protein Bars (Box)', category: 'Snacks', cost: 2.00, stock: 15, minStock: 5, unit: 'bar' }
      ];

      for (const item of defaultItems) {
        try {
          await storage.saveItem({
            id: 'item_' + crypto.randomUUID(),
            pool_id: poolId,
            name: item.name,
            category: item.category,
            stock: item.stock,
            min_stock: item.minStock,
            cost_per_unit: item.cost,
            unit_name: item.unit
          });
        } catch (err) {
          console.warn('[Onboard Starter Items Warning]', err);
        }
      }
    }

    return c.json({
      success: true,
      organization: {
        id: createdOrg.id,
        name: createdOrg.name,
        ownerId: createdOrg.owner_id,
        tier: createdOrg.tier,
        inviteCode: createdOrg.invite_code || inviteCode,
        role: 'owner',
        createdAt: createdOrg.created_at
      },
      pool: {
        id: createdPool.id,
        organizationId: orgId,
        name: createdPool.name,
        category: createdPool.category,
        currency: createdPool.currency,
        qrCodeKey: createdPool.qr_code_key,
        code: createdPool.qr_code_key || createdPool.id
      }
    });
  });

  // Join Organization via Invite Code
  app.post('/api/organizations/join', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Authentication required to join organization.' }, 401);

    const body: any = await c.req.json().catch(() => ({}));
    const code = (body?.inviteCode || body?.code || '').trim().toUpperCase();
    if (!code) return c.json({ success: false, error: 'Organization invite code is required.' }, 400);

    if (!storage.getOrgByInviteCode) {
      return c.json({ success: false, error: 'Organization invites not supported.' }, 500);
    }

    const org = await storage.getOrgByInviteCode(code);
    if (!org) return c.json({ success: false, error: 'Invalid organization invite code.' }, 404);
    if (org.is_archived) return c.json({ success: false, error: 'This organization has been archived and is not accepting new members.' }, 400);

    if (org.owner_id === user.userId) {
      return c.json({ success: true, organization: org, message: 'You are the owner of this workspace.' });
    }

    const existingMember = storage.getOrgMember ? await storage.getOrgMember(org.id, user.userId) : null;
    if (existingMember) {
      return c.json({ success: true, organization: org, message: 'You are already a member of this workspace.' });
    }

    const orgTier = org.tier || 'community';
    const limits = getTierLimits(orgTier);
    if (limits.maxMembersPerPool && storage.listOrgMembers) {
      const currentOrgMembers = await storage.listOrgMembers(org.id);
      if (currentOrgMembers.length >= limits.maxMembersPerPool) {
        return c.json({
          success: false,
          upgradeRequired: true,
          tier: orgTier,
          limit: limits.maxMembersPerPool,
          error: `Workspace member limit reached (${currentOrgMembers.length}/${limits.maxMembersPerPool}). ${orgTier === 'plus' ? 'Contact us for an Enterprise workspace for unlimited members.' : 'Upgrade your workspace plan for more members.'}`
        }, 403);
      }
    }

    if (storage.addOrgMember) {
      await storage.addOrgMember({
        id: 'om_' + crypto.randomUUID(),
        organization_id: org.id,
        user_id: user.userId,
        role: 'member',
        invited_by: org.owner_id
      });
    }

    // Automatically add user to pools in this org so they can access breakrooms
    if (storage.getPoolsByOrg) {
      const pools = await storage.getPoolsByOrg(org.id);
      for (const p of pools) {
        try {
          const existingPoolMember = await storage.getPoolMember(p.id, user.userId);
          if (!existingPoolMember) {
            await storage.upsertPoolMember({
              id: 'pm_' + crypto.randomUUID(),
              pool_id: p.id,
              user_id: user.userId,
              role: 'member',
              balance: 0,
              balance_cents: 0
            });
          }
        } catch {}
      }
    }

    return c.json({
      success: true,
      organization: {
        id: org.id,
        name: org.name,
        ownerId: org.owner_id,
        tier: normalizeTier(org.tier),
        inviteCode: org.invite_code,
        role: 'member',
        createdAt: org.created_at
      },
      message: `Successfully joined workspace ${org.name}!`
    });
  });

  // Organization Members
  app.get('/api/organizations/:id/members', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Unauthorized.' }, 401);

    const orgId = c.req.param('id');
    const org = await storage.getOrgById(orgId);
    if (!org) return c.json({ success: false, error: 'Organization not found.' }, 404);

    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isOwner = org.owner_id === user.userId;
    const isMember = storage.getOrgMember ? Boolean(await storage.getOrgMember(orgId, user.userId)) : false;

    if (!isSuperAdmin && !isOwner && !isMember) {
      return c.json({ success: false, error: 'Forbidden: You must be a member of this workspace.' }, 403);
    }

    const rawMembers = storage.listOrgMembers ? await storage.listOrgMembers(orgId) : [];
    const members = rawMembers.map((m: any) => ({
      id: m.id,
      organizationId: m.organization_id || m.organizationId,
      organization_id: m.organization_id || m.organizationId,
      userId: m.user_id || m.userId,
      user_id: m.user_id || m.userId,
      role: m.role,
      invitedBy: m.invited_by || m.invitedBy || null,
      joinedAt: m.joined_at || m.joinedAt,
      name: m.user_name || m.name || 'Member',
      email: m.user_email || m.email || '',
      userName: m.user_name || m.name || 'Member',
      userEmail: m.user_email || m.email || '',
      avatarUrl: m.avatar_url || m.avatarUrl || null
    }));
    return c.json({ success: true, members });
  });

  // Remove Organization Member
  app.delete('/api/organizations/:id/members/:memberUserId', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Unauthorized.' }, 401);

    const orgId = c.req.param('id');
    const memberUserId = c.req.param('memberUserId');
    const org = await storage.getOrgById(orgId);
    if (!org) return c.json({ success: false, error: 'Organization not found.' }, 404);

    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isOwner = org.owner_id === user.userId;

    if (!isSuperAdmin && !isOwner) {
      return c.json({ success: false, error: 'Forbidden: Only workspace owner or platform admin can remove members.' }, 403);
    }

    if (memberUserId === org.owner_id) {
      return c.json({ success: false, error: 'Cannot remove organization owner.' }, 400);
    }

    if (storage.removeOrgMember) {
      await storage.removeOrgMember(orgId, memberUserId);
    }

    return c.json({ success: true, message: 'Member removed from organization.' });
  });

  app.get('/api/organizations/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Unauthorized.' }, 401);

    const orgId = c.req.param('id');
    const org = await storage.getOrgById(orgId);
    if (!org) return c.json({ success: false, error: 'Organization not found.' }, 404);

    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isOwner = org.owner_id === user.userId;
    const isMember = storage.getOrgMember ? Boolean(await storage.getOrgMember(orgId, user.userId)) : false;

    if (!isSuperAdmin && !isOwner && !isMember) {
      return c.json({ success: false, error: 'Forbidden: You do not have access to this workspace.' }, 403);
    }

    return c.json({
      success: true,
      organization: {
        id: org.id,
        name: org.name,
        ownerId: org.owner_id,
        tier: normalizeTier(org.tier),
        inviteCode: org.invite_code,
        role: org.owner_id === user.userId ? 'owner' : 'member',
        stripeCustomerId: org.stripe_customer_id,
        stripeSubscriptionId: org.stripe_subscription_id,
        createdAt: org.created_at
      }
    });
  });

  app.put('/api/organizations/:id/tier', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user || user.systemRole !== 'superadmin') {
      return c.json({ success: false, error: 'Forbidden: Superadmin access required.' }, 403);
    }

    const orgId = c.req.param('id');
    const body: any = await c.req.json().catch(() => ({}));
    const { tier } = body || {};
    if (!['community', 'standard', 'plus', 'starter', 'pro', 'enterprise'].includes(tier)) {
      return c.json({ success: false, error: 'Invalid tier specified.' }, 400);
    }

    const normalized = normalizeTier(tier);
    await storage.updateOrgTier(orgId, normalized);
    return c.json({ success: true, message: `Organization updated to ${normalized} tier.` });
  });

  app.delete('/api/organizations/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    if (!user) return c.json({ success: false, error: 'Unauthorized.' }, 401);

    const orgId = c.req.param('id');
    const org = await storage.getOrgById(orgId);
    if (!org) return c.json({ success: false, error: 'Organization not found.' }, 404);

    if (org.owner_id !== user.userId && user.systemRole !== 'superadmin' && user.systemRole !== 'admin') {
      return c.json({ success: false, error: 'Permission denied: only organization owner or platform admin can delete this workspace.' }, 403);
    }

    const isGdpr = c.req.query('gdpr') === 'true' || c.req.query('hardDelete') === 'true';
    if (storage.deleteOrg) {
      await storage.deleteOrg(orgId, { hardDelete: isGdpr, gdpr: isGdpr });
    }
    return c.json({
      success: true,
      message: isGdpr ? 'Organization workspace permanently erased.' : 'Organization workspace deleted successfully.',
      isArchived: !isGdpr
    });
  });
}

