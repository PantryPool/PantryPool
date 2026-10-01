import { Hono } from 'hono';
import { HonoEnv } from '../app';

export function registerSyncRoutes(app: Hono<HonoEnv>) {
  app.post('/api/sync/offline-batch', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');

    // SEC-A08-02: Always require authentication for offline batch sync.
    if (!user || !user.userId) {
      return c.json({ success: false, error: 'Authentication required for offline sync.' }, 401);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { actions } = body || {};

    if (!Array.isArray(actions)) {
      return c.json({ success: false, error: 'actions array is required.' }, 400);
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const item of actions) {
      const { id, action, payload } = item || {};
      const actionId = id || crypto.randomUUID();

      try {
        if (action === 'consume_item') {
          const { poolId, itemId: stockItemId, quantity } = payload || {};
          // SEC-A08-02: Always derive actingUserId from the verified token — never from payload.
          const actingUserId = user.userId;
          const txId = id || ('tx_' + crypto.randomUUID());

          if (!poolId) {
            results.push({ id: actionId, success: false, error: 'poolId required' });
            continue;
          }

          const pool = await storage.getPoolById(poolId);
          if (pool) {
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
            if (!isSuperAdmin && !isChampion && !member && !isOrgAdmin) {
              results.push({ id: actionId, success: false, error: 'Forbidden: Not a member of this workspace pool' });
              continue;
            }
          }

          const existingTx = await storage.getTransactionById(txId);
          if (!existingTx) {
            const numQty = Number(quantity);
            if (!Number.isInteger(numQty) || numQty <= 0 || numQty > 1000) {
              results.push({ id: actionId, success: false, error: 'Quantity must be a positive integer between 1 and 1000' });
              continue;
            }

            const prodItem = stockItemId ? await storage.getItemById(stockItemId) : null;
            let existingMember = await storage.getPoolMember(poolId, actingUserId);
            if (!existingMember) {
              await storage.upsertPoolMember({
                id: 'pm_' + crypto.randomUUID(),
                pool_id: poolId,
                user_id: actingUserId,
                role: 'member',
                balance: 0,
                balance_cents: 0
              });
              existingMember = await storage.getPoolMember(poolId, actingUserId);
            }

            const unitCost = prodItem ? Number(prodItem.cost_per_unit || 1.50) : 1.50;
            const unitCostCents = prodItem ? prodItem.cost_per_unit_cents : Math.round(unitCost * 100);
            const totalCost = unitCost * numQty;
            const totalCostCents = unitCostCents * numQty;

            // Enforce deficit pre-flight check
            let pool: any = null;
            try { pool = await storage.getPoolById(poolId); } catch {}
            const maxDeficitCents = pool?.max_deficit_cents !== undefined && pool?.max_deficit_cents !== null
              ? Number(pool.max_deficit_cents)
              : (pool?.max_deficit !== undefined && pool?.max_deficit !== null ? Math.round(Number(pool.max_deficit) * 100) : 1000);

            const currentBalanceCents = existingMember?.balance_cents !== undefined && existingMember?.balance_cents !== null
              ? Number(existingMember.balance_cents)
              : Math.round(Number(existingMember?.balance || 0) * 100);

            const prospectiveBalanceCents = currentBalanceCents - totalCostCents;
            if (maxDeficitCents >= 0 && prospectiveBalanceCents < -maxDeficitCents) {
              results.push({ id: actionId, success: false, error: 'Spending limit reached (deficit ceiling breach)' });
              continue;
            }

            if (prodItem) {
              await storage.adjustItemStock(stockItemId, -numQty);
            }

            await storage.adjustMemberBalance(poolId, actingUserId, -totalCost, -totalCostCents);

            await storage.createTransaction({
              id: txId,
              pool_id: poolId,
              user_id: actingUserId,
              item_id: stockItemId || null,
              item_name: prodItem?.name || 'Item',
              type: 'consume',
              amount: -totalCost,
              amount_cents: -totalCostCents,
              quantity: numQty,
              description: `Offline take: ${prodItem?.name || 'Item'}`
            });
          }

          results.push({ id: actionId, success: true });
        } else if (action === 'deposit') {
          const { poolId, amount, description } = payload || {};
          // SEC-A08-02: Always derive actingUserId from verified token — never from payload.
          const actingUserId = user.userId;
          const txId = id || ('tx_' + crypto.randomUUID());

          const depositAmount = parseFloat(amount);
          if (!poolId || isNaN(depositAmount) || depositAmount <= 0 || depositAmount > 10000) {
            results.push({ id: actionId, success: false, error: 'poolId and valid positive deposit amount (max $10,000) required' });
            continue;
          }

          const pool = await storage.getPoolById(poolId);
          if (pool) {
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
            if (!isSuperAdmin && !isChampion && !member && !isOrgAdmin) {
              results.push({ id: actionId, success: false, error: 'Forbidden: Not a member of this workspace pool' });
              continue;
            }
          }

          const existingTx = await storage.getTransactionById(txId);
          if (!existingTx) {
            const depositCents = Math.round(depositAmount * 100);

            await storage.adjustMemberBalance(poolId, actingUserId, depositAmount, depositCents);

            await storage.createTransaction({
              id: txId,
              pool_id: poolId,
              user_id: actingUserId,
              type: 'deposit',
              amount: depositAmount,
              amount_cents: depositCents,
              quantity: 1,
              description: description || 'Offline balance deposit'
            });
          }

          results.push({ id: actionId, success: true });
        } else {
          results.push({ id: actionId, success: true });
        }
      } catch (err: any) {
        results.push({ id: actionId, success: false, error: err?.message || 'Processing error' });
      }
    }

    return c.json({ success: true, processed: results.length, results });
  });
}
