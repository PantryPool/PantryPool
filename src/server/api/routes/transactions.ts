import { Hono } from 'hono';
import { HonoEnv } from '../app';
import { logSecurityEvent } from '../auditLogger';

async function enrichTransaction(t: any, storage: any) {
  let userName = t.user_name;
  let userAvatar = t.user_avatar;

  if (!userName && t.user_id && storage?.getUserById) {
    try {
      const u = await storage.getUserById(t.user_id);
      if (u) {
        userName = u.name;
        userAvatar = u.avatar_url;
      }
    } catch {}
  }

  const creatorName = userName || 'Pool Member';
  const creatorAvatar = userAvatar || `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(creatorName)}&backgroundColor=f0ebe3,faede8,e8ded4,e3ebe6,fdf4e8`;
  const timestamp = t.created_at || t.timestamp || new Date().toISOString();

  return {
    ...t,
    poolId: t.pool_id || t.poolId,
    userId: t.user_id || t.userId,
    userName: creatorName,
    userAvatar: creatorAvatar,
    createdByName: creatorName,
    createdByAvatar: creatorAvatar,
    itemId: t.item_id || t.itemId,
    itemName: t.item_name || t.itemName || (t.type === 'deposit' ? 'Balance Deposit' : 'Item'),
    type: t.type,
    amount: Number(t.amount || 0),
    amountCents: t.amount_cents !== undefined ? Number(t.amount_cents) : (t.amountCents !== undefined ? Number(t.amountCents) : Math.round(Number(t.amount || 0) * 100)),
    savingsCents: t.savings_cents !== undefined ? Number(t.savings_cents) : (t.savingsCents !== undefined ? Number(t.savingsCents) : 0),
    quantity: Number(t.quantity || 1),
    description: t.description,
    timestamp,
    createdAt: timestamp,
    resultingBalance: Number(t.resultingBalance ?? 0)
  };
}

export function registerTransactionRoutes(app: Hono<HonoEnv>) {
  // List transactions
  app.get('/api/transactions', async (c) => {
    c.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    c.header('Vary', 'Authorization');
    const user = c.get('user');
    const storage = c.get('storage');
    const poolId = c.req.query('poolId');
    const limit = parseInt(c.req.query('limit') || '50', 10);

    if (!poolId) return c.json({ success: false, error: 'poolId is required.' }, 400);

    const pool = storage.getPoolById ? await storage.getPoolById(poolId) : null;
    if (pool && (pool.organization_id || pool.champion_id)) {
      if (!user?.userId) {
        return c.json({ success: false, error: 'Authentication required to view transactions.' }, 401);
      }
      const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';
      const isChampion = pool.champion_id === user.userId;
      let member: any = null;
      try { member = await storage.getPoolMember(poolId, user.userId); } catch {}
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
        return c.json({ success: false, error: 'Forbidden: You do not have permission to view transactions for this pool.' }, 403);
      }
    }

    const txs = await storage.listTransactionsByPool(poolId, limit);

    const enriched = await Promise.all(txs.map((t: any) => enrichTransaction(t, storage)));
    return c.json({ success: true, transactions: enriched });
  });

  // Deposit funds into pool ledger
  app.post('/api/transactions/deposit', async (c) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const { poolId, amount, userId, description } = body || {};

    // SEC-A01-02: Always require an authenticated session for ledger deposits.
    if (!user || !user.userId) {
      return c.json({ success: false, error: 'Authentication required to deposit funds.' }, 401);
    }

    const parsedAmount = parseFloat(amount);
    if (!poolId || isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000) {
      return c.json({ success: false, error: 'Valid positive deposit amount (max $10,000) and poolId are required.' }, 400);
    }

    // Target userId: members may only deposit to themselves; managers may credit others.
    const targetUserId = userId || user.userId;
    const isSuperAdmin = user.systemRole === 'superadmin' || user.systemRole === 'admin';

    const pool = await storage.getPoolById(poolId);
    if (pool) {
      const isChampion = pool.champion_id === user.userId;
      const callerMember = await storage.getPoolMember(poolId, user.userId);
      const isManager = callerMember && (callerMember.role === 'champion' || callerMember.role === 'admin');
      let isOrgAdmin = false;
      if (pool.organization_id && storage.getOrgById) {
        const org = await storage.getOrgById(pool.organization_id);
        if (org && org.owner_id === user.userId) isOrgAdmin = true;
        else if (storage.getOrgMember) {
          const orgMember = await storage.getOrgMember(pool.organization_id, user.userId);
          if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) isOrgAdmin = true;
        }
      }
      // Members can only deposit for themselves; privileged roles can deposit for others.
      if (targetUserId !== user.userId && !isSuperAdmin && !isChampion && !isManager && !isOrgAdmin) {
        logSecurityEvent(c, {
          action: 'ACCESS_DENIED',
          targetResource: `/api/transactions/deposit:${poolId}`,
          status: 'FAILURE',
          metadata: { reason: 'cross_member_deposit_forbidden', targetUserId, actorUserId: user.userId, poolId }
        });
        return c.json({ success: false, error: 'Forbidden: You cannot credit balances for other members.' }, 403);
      }
      if (!isSuperAdmin && !isChampion && !callerMember && !isOrgAdmin) {
        logSecurityEvent(c, {
          action: 'ACCESS_DENIED',
          targetResource: `/api/transactions/deposit:${poolId}`,
          status: 'FAILURE',
          metadata: { reason: 'non_member_deposit_forbidden', targetUserId, actorUserId: user.userId, poolId }
        });
        return c.json({ success: false, error: 'Forbidden: You are not a member of this pool.' }, 403);
      }
    }

    const actingUserId = targetUserId;

    const amountCents = Math.round(parsedAmount * 100);

    await storage.adjustMemberBalance(poolId, actingUserId, parsedAmount, amountCents);

    const tx = await storage.createTransaction({
      id: 'tx_' + crypto.randomUUID(),
      pool_id: poolId,
      user_id: actingUserId,
      type: 'deposit',
      amount: parsedAmount,
      amount_cents: amountCents,
      quantity: 1,
      description: description || `Deposit into balance (${parsedAmount.toFixed(2)})`
    });

    const enriched = await enrichTransaction(tx, storage);
    return c.json({ success: true, transactionId: tx.id, transaction: enriched });
  });

  // Refund transaction (Supports POST /api/transactions/:id/refund and POST /api/transactions/refund)
  const handleRefund = async (c: any) => {
    const user = c.get('user');
    const storage = c.get('storage');
    const body: any = await c.req.json().catch(() => ({}));
    const transactionId = c.req.param('id') || body?.transactionId;
    const { poolId } = body || {};

    if (!transactionId) {
      return c.json({ success: false, error: 'transactionId is required.' }, 400);
    }

    const tx = await storage.getTransactionById(transactionId);
    if (!tx || (poolId && tx.pool_id !== poolId)) {
      return c.json({ success: false, error: 'Transaction not found.' }, 404);
    }

    const effectivePoolId = tx.pool_id || poolId;

    // Check authorization: acting user must be superadmin, champion/admin of pool, or the transaction owner
    if (!user) {
      return c.json({ success: false, error: 'Authentication required.' }, 401);
    }

    const member = await storage.getPoolMember(effectivePoolId, user.userId);
    const isAuthorized =
      user.systemRole === 'superadmin' ||
      user.systemRole === 'admin' ||
      tx.user_id === user.userId ||
      (member && (member.role === 'champion' || member.role === 'admin'));

    if (!isAuthorized) {
      return c.json({ success: false, error: 'Forbidden: Pool administrator privileges required to refund transactions.' }, 403);
    }

    // Guard against refunding a refund or duplicate refund
    if (tx.type === 'refund') {
      return c.json({ success: false, error: 'Cannot refund a refund transaction.' }, 400);
    }

    const existingRefunds = await storage.listTransactionsByPool(effectivePoolId, 200);
    const alreadyRefunded = existingRefunds.some(
      (t: any) => t.type === 'refund' && t.description?.includes(tx.id)
    );
    if (alreadyRefunded) {
      return c.json({ success: false, error: 'This transaction has already been refunded.' }, 409);
    }

    // Revert balance: if tx was negative (consume), credit back positive; if positive (deposit), debit back
    const refundAmount = -tx.amount;
    const refundAmountCents = -tx.amount_cents;

    await storage.adjustMemberBalance(effectivePoolId, tx.user_id, refundAmount, refundAmountCents);

    // If consume item, restore stock
    if (tx.item_id && tx.quantity > 0) {
      await storage.adjustItemStock(tx.item_id, tx.quantity);
    }

    const refundTxId = 'tx_' + crypto.randomUUID();
    const refundTx = await storage.createTransaction({
      id: refundTxId,
      pool_id: effectivePoolId,
      user_id: tx.user_id,
      item_id: tx.item_id,
      item_name: tx.item_name,
      type: 'refund',
      amount: refundAmount,
      amount_cents: refundAmountCents,
      quantity: tx.quantity,
      description: `Refund: Reversal of ${tx.id} (${tx.description || 'Transaction'})`
    });

    const enriched = await enrichTransaction(refundTx, storage);

    return c.json({
      success: true,
      transactionId: refundTxId,
      refundTransactionId: refundTxId,
      originalTransactionId: tx.id,
      transaction: enriched
    });
  };

  app.post('/api/transactions/refund', handleRefund);
  app.post('/api/transactions/:id/refund', handleRefund);
}
