import { Hono } from 'hono';
import { HonoEnv } from '../app';
import { matchCatalogItemWithTypeSafe, calculateTypeSafeCost } from '../../services/typesafeService';
import { logSecurityEvent } from '../auditLogger';

export function registerItemRoutes(app: Hono<HonoEnv>) {
  // List items by pool with fresh stock validation
  app.get('/api/items', async (c) => {
    c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    const storage = c.get('storage');
    const poolId = c.req.query('poolId');
    if (!poolId) return c.json({ success: false, error: 'poolId is required.' }, 400);

    const rawItems = await storage.listItemsByPool(poolId);
    const items = (rawItems || []).map((i: any) => ({
      ...i,
      poolId: i.pool_id || i.poolId,
      minStock: i.min_stock ?? i.minStock ?? 5,
      costPerUnit: i.cost_per_unit ?? i.costPerUnit ?? 0,
      costPerUnitCents: i.cost_per_unit_cents ?? i.costPerUnitCents ?? Math.round((i.cost_per_unit ?? i.costPerUnit ?? 0) * 100),
      vendingBenchmarkCents: i.vending_benchmark_cents ?? i.vendingBenchmarkCents ?? 0,
      unitName: i.unit_name || i.unitName || i.unit || 'unit',
      imageUrl: i.image_url ?? i.imageUrl,
      lastRestockedAt: i.last_restocked_at ?? i.lastRestockedAt
    }));
    return c.json({ success: true, items });
  });

  // Create item
  app.post('/api/items', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { id, poolId, name, category, stock, minStock, costPerUnit, vendingBenchmarkCents, vending_benchmark_cents, vendingCost, unitName, unit_name, icon, imageUrl, image_url, description, barcode } = body || {};

    if (!poolId || !name) return c.json({ success: false, error: 'poolId and name are required.' }, 400);

    // SEC-A01-03: Always require authentication for item mutation.
    if (!user || !user.userId) {
      return c.json({ success: false, error: 'Authentication required to manage pantry items.' }, 401);
    }

    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const pool = storage.getPoolById ? await storage.getPoolById(poolId) : null;
    if (pool) {
      if (pool.is_archived) {
        return c.json({ success: false, error: 'Cannot add or modify items in an archived pantry.' }, 400);
      }
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
      if (!isSuperAdmin && !isChampion && !member && !isOrgAdmin) {
        return c.json({ success: false, error: 'Forbidden: You do not have permission to manage items in this pool.' }, 403);
      }
    }

    const itemId = id || ('item_' + crypto.randomUUID());
    const cost = parseFloat(costPerUnit) || 0;
    const resolvedBenchmarkCents = vendingBenchmarkCents !== undefined
      ? parseInt(vendingBenchmarkCents, 10)
      : (vending_benchmark_cents !== undefined
        ? parseInt(vending_benchmark_cents, 10)
        : (vendingCost !== undefined ? Math.round(parseFloat(vendingCost) * 100) : 0));

    const resolvedUnitName = (unitName !== undefined && unitName !== null && String(unitName).trim() !== '')
      ? String(unitName).trim()
      : ((unit_name !== undefined && unit_name !== null && String(unit_name).trim() !== '') ? String(unit_name).trim() : (body?.unit || 'unit'));

    const saved = await storage.saveItem({
      id: itemId,
      pool_id: poolId,
      name: name.trim(),
      category: category || 'Snacks',
      stock: parseInt(stock, 10) || 0,
      min_stock: parseInt(minStock, 10) || 5,
      cost_per_unit: cost,
      cost_per_unit_cents: Math.round(cost * 100),
      vending_benchmark_cents: isNaN(resolvedBenchmarkCents) ? 0 : Math.max(0, resolvedBenchmarkCents),
      unit_name: resolvedUnitName,
      icon: icon || 'package',
      image_url: imageUrl || image_url || null,
      description: description || null,
      barcode: barcode || null
    });

    return c.json({
      success: true,
      item: {
        ...saved,
        poolId: saved.pool_id,
        minStock: saved.min_stock,
        costPerUnit: saved.cost_per_unit,
        costPerUnitCents: saved.cost_per_unit_cents,
        vendingBenchmarkCents: saved.vending_benchmark_cents || 0,
        unitName: saved.unit_name,
        imageUrl: saved.image_url,
        lastRestockedAt: saved.last_restocked_at
      }
    });
  });

  // Update item
  app.put('/api/items/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const itemId = c.req.param('id');
    const existing = await storage.getItemById(itemId);
    if (!existing) return c.json({ success: false, error: 'Item not found.' }, 404);

    // SEC-A01-03: Always require authentication for item mutation.
    if (!user || !user.userId) {
      return c.json({ success: false, error: 'Authentication required to modify pantry items.' }, 401);
    }

    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
    const pool = storage.getPoolById ? await storage.getPoolById(existing.pool_id) : null;
    if (pool) {
      const isChampion = pool.champion_id === user.userId;
      const member = await storage.getPoolMember(existing.pool_id, user.userId);
      let isOrgAdmin = false;
      if (pool.organization_id && storage.getOrgById) {
        const org = await storage.getOrgById(pool.organization_id);
        if (org && org.owner_id === user.userId) isOrgAdmin = true;
        else if (storage.getOrgMember) {
          const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
          if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) isOrgAdmin = true;
        }
      }
      if (!isSuperAdmin && !isChampion && !member && !isOrgAdmin) {
        return c.json({ success: false, error: 'Forbidden: You do not have permission to modify items in this pool.' }, 403);
      }
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { name, category, stock, minStock, costPerUnit, vendingBenchmarkCents, vending_benchmark_cents, vendingCost, unitName, unit_name, icon, imageUrl, image_url, description, barcode } = body || {};

    const cost = costPerUnit !== undefined ? parseFloat(costPerUnit) : existing.cost_per_unit;
    const resolvedBenchmarkCents = vendingBenchmarkCents !== undefined
      ? parseInt(vendingBenchmarkCents, 10)
      : (vending_benchmark_cents !== undefined
        ? parseInt(vending_benchmark_cents, 10)
        : (vendingCost !== undefined ? Math.round(parseFloat(vendingCost) * 100) : existing.vending_benchmark_cents || 0));

    const resolvedUnitName = unitName !== undefined
      ? (String(unitName).trim() || 'unit')
      : (unit_name !== undefined ? (String(unit_name).trim() || 'unit') : existing.unit_name);

    const updated = await storage.saveItem({
      id: itemId,
      pool_id: existing.pool_id,
      name: name !== undefined ? name.trim() : existing.name,
      category: category !== undefined ? category : existing.category,
      stock: stock !== undefined ? parseInt(stock, 10) : existing.stock,
      min_stock: minStock !== undefined ? parseInt(minStock, 10) : existing.min_stock,
      cost_per_unit: cost,
      cost_per_unit_cents: Math.round(cost * 100),
      vending_benchmark_cents: isNaN(resolvedBenchmarkCents) ? 0 : Math.max(0, resolvedBenchmarkCents),
      unit_name: resolvedUnitName,
      icon: icon !== undefined ? icon : existing.icon,
      image_url: imageUrl !== undefined ? imageUrl : (image_url !== undefined ? image_url : existing.image_url),
      description: description !== undefined ? description : existing.description,
      barcode: barcode !== undefined ? barcode : existing.barcode
    });

    if (stock !== undefined && parseInt(stock, 10) !== existing.stock) {
      logSecurityEvent(c, {
        action: 'DISCREPANCY_CALIBRATION',
        targetResource: `/api/items/${itemId}`,
        status: 'SUCCESS',
        metadata: {
          previousStock: existing.stock,
          newStock: parseInt(stock, 10),
          delta: parseInt(stock, 10) - existing.stock,
          itemId,
          poolId: existing.pool_id
        }
      });
    }

    return c.json({
      success: true,
      item: {
        ...updated,
        poolId: updated.pool_id,
        minStock: updated.min_stock,
        costPerUnit: updated.cost_per_unit,
        costPerUnitCents: updated.cost_per_unit_cents,
        vendingBenchmarkCents: updated.vending_benchmark_cents || 0,
        unitName: updated.unit_name,
        imageUrl: updated.image_url,
        lastRestockedAt: updated.last_restocked_at
      }
    });
  });

  // Delete item
  app.delete('/api/items/:id', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const itemId = c.req.param('id');

    // SEC-A01-03: Always require authentication for item deletion.
    if (!user || !user.userId) {
      return c.json({ success: false, error: 'Authentication required to delete pantry items.' }, 401);
    }

    const existing = await storage.getItemById(itemId);
    if (existing) {
      const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
      const pool = await storage.getPoolById(existing.pool_id);
      if (pool) {
        const isChampion = pool.champion_id === user.userId;
        const member = await storage.getPoolMember(existing.pool_id, user.userId);
        const isManager = member && (member.role === 'champion' || member.role === 'admin');
        let isOrgAdmin = false;
        if (pool.organization_id && storage.getOrgById) {
          const org = await storage.getOrgById(pool.organization_id);
          if (org && org.owner_id === user.userId) isOrgAdmin = true;
          else if (storage.getOrgMember) {
            const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
            if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) isOrgAdmin = true;
          }
        }
        if (!isSuperAdmin && !isChampion && !isManager && !isOrgAdmin) {
          return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required to delete items.' }, 403);
        }
      }
    }

    await storage.deleteItem(itemId);
    return c.json({ success: true, message: 'Item deleted successfully.' });
  });

  // Consume item
  app.post('/api/items/consume', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { poolId = 'pool1', itemId, quantity = 1 } = body || {};

    // SEC-A01-01: Always require an authenticated session. Never trust client-supplied userId.
    if (!user || !user.userId) {
      return c.json({ success: false, error: 'Authentication required to consume items.' }, 401);
    }
    const actingUserId = user.userId;

    const numQty = Number(quantity);
    if (!Number.isInteger(numQty) || numQty <= 0 || numQty > 1000) {
      return c.json({ success: false, error: 'Quantity must be a positive integer between 1 and 1000.' }, 400);
    }

    if (!itemId) {
      return c.json({ success: false, error: 'itemId is required.' }, 400);
    }

    const item = await storage.getItemById(itemId);
    if (!item) return c.json({ success: false, error: 'Item not found.' }, 404);

    const costPerUnit = Number(item.cost_per_unit || 0);
    const totalCost = costPerUnit * numQty;
    const totalCostCents = Math.round(totalCost * 100);

    // Hard Spending Block / Credit Limit Enforcement
    let pool: any = null;
    try { pool = await storage.getPoolById(poolId); } catch {}
    if (pool?.is_archived) {
      return c.json({ success: false, error: 'Cannot consume items from an archived pantry.' }, 400);
    }
    const maxDeficitCents = pool?.max_deficit_cents !== undefined && pool?.max_deficit_cents !== null
      ? Number(pool.max_deficit_cents)
      : (pool?.max_deficit !== undefined && pool?.max_deficit !== null ? Math.round(Number(pool.max_deficit) * 100) : 1000);

    let member: any = null;
    try { member = await storage.getPoolMember(poolId, actingUserId); } catch {}

    // SEC-A01-01: Pool membership check always runs — not conditional on user presence.
    if (pool) {
      const isPoolChampion = pool.champion_id === actingUserId;
      const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
      if (!member && !isPoolChampion && !isSuperAdmin) {
        logSecurityEvent(c, {
          action: 'ACCESS_DENIED',
          targetResource: `/api/items/consume:${poolId}`,
          status: 'FAILURE',
          metadata: { reason: 'non_member', poolId, itemId, actingUserId }
        });
        return c.json({ success: false, error: 'Forbidden: You are not a member of this pool.' }, 403);
      }
    }

    const currentBalanceCents = member?.balance_cents !== undefined && member?.balance_cents !== null
      ? Number(member.balance_cents)
      : Math.round(Number(member?.balance || 0) * 100);

    const prospectiveBalanceCents = currentBalanceCents - totalCostCents;

    if (maxDeficitCents >= 0 && prospectiveBalanceCents < -maxDeficitCents) {
      const currencySymbol = pool?.currency || '$';
      const prospectiveDollars = (prospectiveBalanceCents / 100).toFixed(2);
      const limitDollars = (maxDeficitCents / 100).toFixed(2);
      const errorMsg = maxDeficitCents === 0
        ? `Spending limit reached. This pool operates in strict pre-paid mode (no negative balances allowed). Your balance would drop to ${currencySymbol}${prospectiveDollars}. Please add funds before consuming items.`
        : `Spending limit reached. Your balance would drop to ${currencySymbol}${prospectiveDollars}, exceeding the pool's credit ceiling of -${currencySymbol}${limitDollars}. Please settle up or add funds before consuming more items.`;
      logSecurityEvent(c, {
        action: 'ACCESS_DENIED',
        targetResource: `/api/items/consume:${itemId}`,
        status: 'FAILURE',
        metadata: {
          reason: 'credit_ceiling_exceeded',
          poolId,
          itemId,
          currentBalanceCents,
          prospectiveBalanceCents,
          maxDeficitCents
        }
      });
      return c.json({
        success: false,
        spendingBlocked: true,
        error: errorMsg,
        currentBalance: currentBalanceCents / 100,
        currentBalanceCents,
        maxDeficit: maxDeficitCents / 100,
        maxDeficitCents
      }, 403);
    }

    // Compute Vending Savings if pool has savings enabled
    let txSavingsCents = 0;
    if (pool?.savings_enabled) {
      const itemBenchmarkCents = Number(item.vending_benchmark_cents || 0);
      const itemCostCents = Number(item.cost_per_unit_cents || Math.round(costPerUnit * 100));
      if (itemBenchmarkCents > itemCostCents) {
        txSavingsCents = (itemBenchmarkCents - itemCostCents) * numQty;
      }
    }

    // SEC-A06-01: Compensating transactional rollback to maintain ledger and inventory atomicity
    await storage.adjustItemStock(itemId, -numQty);
    try {
      await storage.adjustMemberBalance(poolId, actingUserId, -totalCost, -totalCostCents);
    } catch (balanceErr: any) {
      await storage.adjustItemStock(itemId, numQty).catch(() => {});
      throw balanceErr;
    }

    let tx: any;
    try {
      tx = await storage.createTransaction({
        id: 'tx_' + crypto.randomUUID(),
        pool_id: poolId,
        user_id: actingUserId,
        item_id: itemId,
        item_name: item.name,
        type: 'consume',
        amount: -totalCost,
        amount_cents: -totalCostCents,
        savings_cents: txSavingsCents,
        quantity: numQty,
        description: `Grabbed ${numQty}x ${item.name}`
      });
    } catch (txErr: any) {
      await storage.adjustItemStock(itemId, numQty).catch(() => {});
      await storage.adjustMemberBalance(poolId, actingUserId, totalCost, totalCostCents).catch(() => {});
      throw txErr;
    }

    let userName = user?.userId === actingUserId ? user?.name : undefined;
    let userAvatar = user?.userId === actingUserId ? (user as any)?.avatarUrl : undefined;
    if (!userName && storage.getUserById) {
      try {
        const u = await storage.getUserById(actingUserId);
        if (u) {
          userName = u.name;
          userAvatar = u.avatar_url;
        }
      } catch {}
    }
    const creatorName = userName || 'Pool Member';
    const creatorAvatar = userAvatar || `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(creatorName)}&backgroundColor=f0ebe3,faede8,e8ded4,e3ebe6,fdf4e8`;
    const enrichedTx = {
      ...tx,
      poolId: tx.pool_id,
      userId: tx.user_id,
      userName: creatorName,
      userAvatar: creatorAvatar,
      createdByName: creatorName,
      createdByAvatar: creatorAvatar,
      itemId: tx.item_id,
      itemName: tx.item_name,
      timestamp: tx.created_at || new Date().toISOString(),
      createdAt: tx.created_at || new Date().toISOString()
    };

    return c.json({
      success: true,
      transactionId: tx.id,
      transaction: enrichedTx,
      newStock: item.stock - numQty,
      remainingStock: item.stock - numQty,
      newBalance: prospectiveBalanceCents / 100,
      remainingBalance: prospectiveBalanceCents / 100,
      newBalanceCents: prospectiveBalanceCents,
      totalCost,
      savingsCents: txSavingsCents,
      savings: txSavingsCents / 100,
      savingsFormatted: (txSavingsCents / 100).toFixed(2)
    });
  });

  // Inventory discrepancy calibration
  app.post('/api/items/discrepancy', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { poolId = 'pool1', itemId, actualStock, actualCount, reason = 'audit_recount', notes } = body || {};
    const stockVal = actualStock !== undefined ? actualStock : actualCount;

    if (!itemId || typeof stockVal !== 'number' || stockVal < 0) {
      return c.json({ success: false, error: 'itemId and valid non-negative actualStock are required.' }, 400);
    }

    const item = await storage.getItemById(itemId);
    if (!item) return c.json({ success: false, error: 'Item not found.' }, 404);

    if (!user?.userId) {
      return c.json({ success: false, error: 'Authentication required to calibrate inventory.' }, 401);
    }

    const effectivePoolId = item.pool_id || poolId;
    const pool = storage.getPoolById ? await storage.getPoolById(effectivePoolId) : null;
    if (pool) {
      const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
      const isChampion = pool.champion_id === user.userId;
      const member = storage.getPoolMember ? await storage.getPoolMember(effectivePoolId, user.userId) : null;
      let isOrgAdmin = false;
      if (pool.organization_id && storage.getOrgById) {
        const org = await storage.getOrgById(pool.organization_id);
        if (org && org.owner_id === user.userId) isOrgAdmin = true;
        else if (storage.getOrgMember) {
          const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
          if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) isOrgAdmin = true;
        }
      }
      if (!isSuperAdmin && !isChampion && !member && !isOrgAdmin) {
        return c.json({ success: false, error: 'Forbidden: You do not have permission to calibrate inventory in this pool.' }, 403);
      }
    }

    const previousStock = item.stock;
    const delta = stockVal - previousStock;

    await storage.adjustItemStock(itemId, delta);

    const reasonLabels: Record<string, string> = {
      forgot_to_log: "Forgot to Log (Unlogged Take)",
      visitor_take: "Visitor / Non-Member Take",
      damaged_expired: "Damaged / Expired Item",
      audit_recount: "Physical Count Recount",
      other: "Count Adjustment",
    };
    const reasonText = reasonLabels[reason] || reason;
    const noteText = notes ? ` - Note: "${notes}"` : "";
    const description = `Stock count adjusted from ${previousStock} to ${stockVal} (${delta >= 0 ? "+" : ""}${delta} ${item.unit_name || "units"}). Reason: ${reasonText}${noteText}`;

    const tx = await storage.createTransaction({
      id: 'tx_' + crypto.randomUUID(),
      pool_id: poolId,
      user_id: user.userId,
      item_id: itemId,
      item_name: item.name,
      type: 'adjustment',
      amount: 0,
      amount_cents: 0,
      quantity: delta,
      description
    });

    return c.json({
      success: true,
      transactionId: tx.id,
      previousStock,
      newStock: stockVal,
      delta,
      description,
      item: { ...item, stock: stockVal }
    });
  });

  // Match candidate restock item to existing pantry catalog to avoid duplicate SKUs
  app.post('/api/items/match-candidate', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const env = c.env as any;
    const body: any = await c.req.json().catch(() => ({}));
    const { poolId, candidateName } = body || {};

    if (!poolId || !candidateName || !String(candidateName).trim()) {
      return c.json({ success: false, error: 'poolId and candidateName are required.' }, 400);
    }

    const items = (await storage.listItemsByPool(poolId)) || [];
    if (items.length === 0) {
      return c.json({ success: true, matchedItem: null, confidence: 0 });
    }

    // 1. Direct exact case-insensitive match
    const exactMatch = items.find((i: any) => i.name.trim().toLowerCase() === candidateName.trim().toLowerCase());
    if (exactMatch) {
      return c.json({ success: true, matchedItem: exactMatch, confidence: 1.0, strategy: 'exact' });
    }

    // 2. TypeSafe AI Semantic Matching if enabled
    const apiKey = env?.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY || '';
    let typesafeActive = Boolean(apiKey && !apiKey.includes('PLACEHOLDER') && apiKey.startsWith('apikey_'));
    if (typesafeActive && storage?.getSystemSettings) {
      try {
        const settings = await storage.getSystemSettings();
        if (settings.typesafe_ai_enabled === 'false' || settings.typesafe_ai_enabled === false) {
          typesafeActive = false;
        }
      } catch {}
    }

    if (typesafeActive) {
      const matchResult = await matchCatalogItemWithTypeSafe(
        candidateName.trim(),
        items.map((i: any) => ({ id: i.id, name: i.name, category: i.category })),
        apiKey
      );

      if (storage?.logAiUsage && matchResult.usage) {
        const promptTok = Number(matchResult.usage.input_tokens || 0);
        const compTok = Number(matchResult.usage.output_tokens || 0);
        const cost = calculateTypeSafeCost(promptTok);
        const logId = `ts-match-${Date.now()}-${crypto.randomUUID().substring(0, 6)}`;
        await storage.logAiUsage({
          id: logId,
          user_id: user?.userId || null,
          user_email: user?.email || null,
          pool_id: poolId,
          model: matchResult.model || 'jev-latest',
          activity: 'catalog_deduplication',
          prompt_tokens: promptTok,
          completion_tokens: compTok,
          total_tokens: promptTok + compTok,
          estimated_cost_usd: cost,
          status: 'success',
          parsed_items_json: JSON.stringify({ candidateName, matchedItemId: matchResult.matchedItemId })
        }).catch((err: any) => console.warn('[TypeSafe Match Log Error]', err));
      }

      if (matchResult.matchedItemId) {
        const matched = items.find((i: any) => i.id === matchResult.matchedItemId);
        if (matched) {
          return c.json({
            success: true,
            matchedItem: matched,
            confidence: matchResult.confidence,
            strategy: 'typesafe'
          });
        }
      }
    }

    // 3. Simple substring fallback
    const substringMatch = items.find((i: any) =>
      i.name.toLowerCase().includes(candidateName.toLowerCase()) ||
      candidateName.toLowerCase().includes(i.name.toLowerCase())
    );

    return c.json({
      success: true,
      matchedItem: substringMatch || null,
      confidence: substringMatch ? 0.7 : 0,
      strategy: substringMatch ? 'fuzzy' : 'none'
    });
  });
}
