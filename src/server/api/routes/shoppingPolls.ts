import { Hono } from 'hono';
import { HonoEnv } from '../app';

async function checkPoolAccess(storage: any, poolId: string, user?: any) {
  const pool = storage.getPoolById ? await storage.getPoolById(poolId) : null;

  // If pool has an organization or explicit champion, enforce strict authentication & membership
  if (pool && (pool.organization_id || pool.champion_id)) {
    if (!user || !user.userId) {
      return { allowed: false, isManager: false, pool };
    }
    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isChampion = pool.champion_id === user.userId;
    const member = await storage.getPoolMember(poolId, user.userId);
    let isOrgAdmin = false;
    if (pool.organization_id && storage.getOrgById) {
      const org = await storage.getOrgById(pool.organization_id);
      if (org && org.owner_id === user.userId) isOrgAdmin = true;
      else if (storage.getOrgMember) {
        const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
        if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) isOrgAdmin = true;
      }
    }
    const isManager = Boolean(isSuperAdmin || isChampion || isOrgAdmin || (member && (member.role === 'champion' || member.role === 'admin')));
    const allowed = Boolean(isSuperAdmin || isChampion || isOrgAdmin || member);
    return { allowed, isManager, pool };
  }

  // If user is authenticated, permit access and check manager rights
  if (user) {
    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const member = storage.getPoolMember ? await storage.getPoolMember(poolId, user.userId) : null;
    const isManager = Boolean(isSuperAdmin || (member && (member.role === 'champion' || member.role === 'admin')));
    return { allowed: true, isManager, pool };
  }

  // Open communal pantries (no org / no champion) or unmocked test endpoints
  return { allowed: !pool, isManager: false, pool: null };
}

export function registerShoppingPollRoutes(app: Hono<HonoEnv>) {
  // -------------------------------------------------------------
  // SHOPPING LIST ROUTES
  // -------------------------------------------------------------

  // Get shopping list (supports /api/pools/:poolId/shopping-list and /api/shopping-list?poolId=...)
  const handleGetShoppingList = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId') || c.req.query('poolId');
    if (!poolId) return c.json({ success: false, error: 'poolId is required.' }, 400);

    const { allowed } = await checkPoolAccess(storage, poolId, user);
    if (!allowed) return c.json({ success: false, error: 'Forbidden: You do not have access to this pool.' }, 403);

    const shoppingList = await storage.listShoppingItems(poolId);
    return c.json({
      success: true,
      shoppingList: shoppingList.map((s: any) => ({
        id: s.id,
        poolId: s.pool_id,
        name: s.name,
        itemName: s.name,
        category: s.category,
        quantity: Number(s.quantity || 1),
        estimatedCost: Number(s.estimated_cost || 0),
        estimatedCostCents: s.estimated_cost_cents,
        suggestedBy: s.suggested_by,
        purchased: Boolean(s.purchased),
        reason: s.reason,
        createdAt: s.created_at
      }))
    });
  };

  app.get('/api/pools/:poolId/shopping-list', handleGetShoppingList);
  app.get('/api/shopping-list', handleGetShoppingList);

  // Add shopping item (supports /api/pools/:poolId/shopping-list and /api/shopping-list with poolId in body)
  const handlePostShoppingList = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const poolId = c.req.param('poolId') || body?.poolId;
    const { name, itemName, category, quantity, estimatedCost, reason } = body || {};
    const effectiveName = name || itemName;

    if (!poolId || !effectiveName) {
      return c.json({ success: false, error: 'poolId and name are required.' }, 400);
    }

    const { allowed } = await checkPoolAccess(storage, poolId, user);
    if (!allowed) return c.json({ success: false, error: 'Forbidden: You do not have access to this pool.' }, 403);

    const cost = parseFloat(estimatedCost) || 0;
    const item = await storage.createShoppingItem({
      id: 'shop_' + crypto.randomUUID(),
      pool_id: poolId,
      name: effectiveName.trim(),
      category: category || 'Snacks',
      quantity: parseInt(quantity, 10) || 1,
      estimated_cost: cost,
      estimated_cost_cents: Math.round(cost * 100),
      suggested_by: user?.name || 'Communal Member',
      purchased: false,
      reason: reason || null
    });

    return c.json({ success: true, item });
  };

  app.post('/api/pools/:poolId/shopping-list', handlePostShoppingList);
  app.post('/api/shopping-list', handlePostShoppingList);

  // Update shopping item status
  app.put('/api/pools/:poolId/shopping-list/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const id = c.req.param('id');

    const { allowed } = await checkPoolAccess(storage, poolId, user);
    if (!allowed) return c.json({ success: false, error: 'Forbidden: You do not have access to this pool.' }, 403);

    const body: any = await c.req.json().catch(() => ({}));
    const { purchased } = body || {};

    await storage.updateShoppingItemStatus(id, poolId, Boolean(purchased));
    return c.json({ success: true, message: 'Shopping item updated.' });
  });

  // Delete shopping item
  app.delete('/api/pools/:poolId/shopping-list/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const id = c.req.param('id');

    const { allowed } = await checkPoolAccess(storage, poolId, user);
    if (!allowed) return c.json({ success: false, error: 'Forbidden: You do not have access to this pool.' }, 403);

    await storage.deleteShoppingItem(id, poolId);
    return c.json({ success: true, message: 'Shopping item deleted.' });
  });

  // -------------------------------------------------------------
  // COMMUNAL POLLS ROUTES
  // -------------------------------------------------------------

  // List polls (supports /api/pools/:poolId/polls and /api/polls?poolId=...)
  const handleGetPolls = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId') || c.req.query('poolId');
    if (!poolId) return c.json({ success: false, error: 'poolId is required.' }, 400);

    const { allowed } = await checkPoolAccess(storage, poolId, user);
    if (!allowed) return c.json({ success: false, error: 'Forbidden: You do not have access to this pool.' }, 403);

    const rawPolls = await storage.listPolls(poolId);
    const polls = rawPolls.map((p: any) => {
      let options = [];
      try {
        options = JSON.parse(p.options_json || '[]');
      } catch {}
      return {
        id: p.id,
        poolId: p.pool_id,
        title: p.title,
        options,
        createdBy: p.created_by,
        status: p.status,
        allowWriteIn: (p as any).allow_write_in !== 0,
        createdAt: p.created_at
      };
    });

    return c.json({ success: true, polls });
  };

  app.get('/api/pools/:poolId/polls', handleGetPolls);
  app.get('/api/polls', handleGetPolls);

  // Create poll (supports /api/pools/:poolId/polls and /api/polls with poolId in body)
  const handleCreatePoll = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const poolId = c.req.param('poolId') || body?.poolId;
    const { title, options, allowWriteIn = true } = body || {};

    if (!poolId || !title || !Array.isArray(options) || options.length < 2) {
      return c.json({ success: false, error: 'Title and at least 2 poll options are required.' }, 400);
    }

    const { allowed } = await checkPoolAccess(storage, poolId, user);
    if (!allowed) return c.json({ success: false, error: 'Forbidden: You do not have access to this pool.' }, 403);

    const formattedOptions = options.map((opt: any, idx: number) => {
      const name = typeof opt === 'string' ? opt.trim() : (opt.name || opt.text || `Option ${idx + 1}`);
      return {
        id: opt.id || `opt_${idx + 1}`,
        name,
        text: name,
        votes: Array.isArray(opt.votes) ? opt.votes : [],
        isWriteIn: Boolean(opt.isWriteIn)
      };
    });

    const poll = await storage.createPoll({
      id: 'poll_' + crypto.randomUUID(),
      pool_id: poolId,
      title: title.trim(),
      options_json: JSON.stringify(formattedOptions),
      created_by: user?.name || 'Communal Member',
      status: 'active'
    });

    return c.json({
      success: true,
      poll: {
        id: poll.id,
        poolId: poll.pool_id || poolId,
        title: poll.title,
        status: poll.status || 'active',
        options: formattedOptions,
        createdBy: poll.created_by || 'Communal Member',
        createdAt: poll.created_at || new Date().toISOString(),
        allowWriteIn: Boolean(allowWriteIn)
      }
    });
  };

  app.post('/api/pools/:poolId/polls', handleCreatePoll);
  app.post('/api/polls', handleCreatePoll);

  // Vote on poll or submit write-in
  const handleVotePoll = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const id = c.req.param('pollId') || c.req.param('id');
    const body: any = await c.req.json().catch(() => ({}));
    const { optionId, writeInOption, userId } = body || {};

    if (!optionId && !writeInOption?.trim()) return c.json({ success: false, error: 'optionId or writeInOption is required.' }, 400);

    const targetPoll = (storage.getPollById ? await storage.getPollById(id, poolId) : null) || (await storage.listPolls(poolId)).find((p: any) => p.id === id);
    if (!targetPoll) return c.json({ success: false, error: 'Poll not found.' }, 404);

    const pool = storage.getPoolById ? await storage.getPoolById(poolId) : null;
    if (pool && pool.organization_id) {
      const { allowed } = await checkPoolAccess(storage, poolId, user);
      if (!allowed) return c.json({ success: false, error: 'Forbidden: You do not have access to this pool.' }, 403);
    }

    let options: any[] = [];
    try {
      options = JSON.parse(targetPoll.options_json || '[]');
    } catch {}

    const voterId = userId || user?.userId || (user as any)?.id || 'u_anon_' + crypto.randomUUID().substring(0, 6);

    let targetOptionId = optionId;
    if (writeInOption && writeInOption.trim()) {
      const cleanWriteIn = writeInOption.trim();
      const existing = options.find((opt: any) => (opt.name || opt.text || '').toLowerCase() === cleanWriteIn.toLowerCase());
      if (existing) {
        targetOptionId = existing.id;
      } else {
        targetOptionId = `opt_writein_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        options.push({
          id: targetOptionId,
          name: cleanWriteIn,
          text: cleanWriteIn,
          votes: [],
          isWriteIn: true
        });
      }
    }

    // Remove voter from other options if single choice, add to target option
    options.forEach(opt => {
      if (!Array.isArray(opt.votes)) opt.votes = [];
      opt.votes = opt.votes.filter((v: any) => String(v) !== String(voterId));
      if (opt.id === targetOptionId) {
        opt.votes.push(String(voterId));
      }
    });

    await storage.updatePoll(id, poolId, { options_json: JSON.stringify(options) });
    return c.json({ success: true, options });
  };

  app.post('/api/pools/:poolId/polls/:pollId/vote', handleVotePoll);
  app.post('/api/pools/:poolId/polls/:id/vote', handleVotePoll);

  // Update poll
  const handleUpdatePoll = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const pollId = c.req.param('pollId') || c.req.param('id');
    const body: any = await c.req.json().catch(() => ({}));
    const { title, status, options } = body || {};

    const targetPoll = (storage.getPollById ? await storage.getPollById(pollId, poolId) : null) || (await storage.listPolls(poolId)).find((p: any) => p.id === pollId);
    if (!targetPoll) return c.json({ success: false, error: 'Poll not found.' }, 404);

    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const pm = await storage.getPoolMember(poolId, user.userId);
    const pool = await storage.getPoolById(poolId);
    const role = pm?.role || 'member';
    const isPoolChampion = pool?.champion_id === user.userId;
    const isSuperadmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isCreator = targetPoll.created_by === user.name || targetPoll.created_by === user.userId;

    if (title || options) {
      if (!isCreator && !isPoolChampion && role !== 'champion' && role !== 'admin' && !isSuperadmin) {
        return c.json({ success: false, error: 'Only poll creators or pool admins may edit poll titles and options.' }, 403);
      }
    } else {
      if (!isCreator && !isPoolChampion && !pm && !isSuperadmin) {
        return c.json({ success: false, error: 'Only pool members may close or reopen polls.' }, 403);
      }
    }

    const updates: Partial<any> = {};
    if (title) updates.title = title.trim();
    if (status) updates.status = status;
    if (options) updates.options_json = JSON.stringify(options);

    await storage.updatePoll(pollId, poolId, updates);
    const updatedPolls = await storage.listPolls(poolId);
    const updated = updatedPolls.find((p: any) => p.id === pollId) || { ...targetPoll, ...updates };

    let parsedOpts = [];
    try {
      parsedOpts = typeof updated.options_json === 'string' ? JSON.parse(updated.options_json) : (updated.options_json || []);
    } catch {
      parsedOpts = [];
    }

    return c.json({
      success: true,
      poll: {
        id: updated.id,
        poolId: updated.pool_id || poolId,
        title: updated.title,
        status: updated.status,
        createdBy: updated.created_by,
        createdAt: updated.created_at,
        options: parsedOpts,
        allowWriteIn: updated.allow_write_in !== 0
      },
      message: 'Poll updated successfully.'
    });
  };

  app.put('/api/pools/:poolId/polls/:pollId', handleUpdatePoll);
  app.put('/api/pools/:poolId/polls/:id', handleUpdatePoll);

  // Delete poll
  const handleDeletePoll = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.param('poolId');
    const pollId = c.req.param('pollId') || c.req.param('id');

    const targetPoll = (storage.getPollById ? await storage.getPollById(pollId, poolId) : null) || (await storage.listPolls(poolId)).find((p: any) => p.id === pollId);
    if (!targetPoll) return c.json({ success: false, error: 'Poll not found.' }, 404);

    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const pm = await storage.getPoolMember(poolId, user.userId);
    const pool = await storage.getPoolById(poolId);
    const role = pm?.role || 'member';
    const isPoolChampion = pool?.champion_id === user.userId;
    const isSuperadmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const isCreator = targetPoll.created_by === user.name || targetPoll.created_by === user.userId;
    if (!isCreator && !isPoolChampion && role !== 'champion' && role !== 'admin' && !isSuperadmin) {
      return c.json({ success: false, error: 'Only poll creators or pool admins may delete polls.' }, 403);
    }

    await storage.deletePoll(pollId, poolId);
    return c.json({ success: true, message: 'Poll deleted.' });
  };

  app.delete('/api/pools/:poolId/polls/:pollId', handleDeletePoll);
  app.delete('/api/pools/:poolId/polls/:id', handleDeletePoll);
}
