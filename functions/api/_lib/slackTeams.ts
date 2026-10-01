import { D1Database, AuthUser } from '../_types';

export async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    if (!sigHeader || !secret) return false;
    const parts = sigHeader.split(',');
    let timestamp = '';
    const signatures: string[] = [];
    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      if (key === 't') timestamp = value;
      if (key === 'v1') signatures.push(value);
    }
    if (!timestamp || signatures.length === 0) return false;
    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(timestampNum) || Math.abs(now - timestampNum) > 300) {
      return false;
    }
    const signedPayload = `${timestamp}.${rawBody}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
    const expectedSigHex = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    // Constant-time comparison to prevent timing attacks
    const enc2 = new TextEncoder();
    for (const sig of signatures) {
      if (sig.length !== expectedSigHex.length) continue;
      const a = enc2.encode(sig);
      const b = enc2.encode(expectedSigHex);
      let diff = 0;
      for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
      }
      if (diff === 0) return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

export async function verifySlackSignature(rawBody: string, signature: string, timestamp: string, signingSecret: string): Promise<boolean> {
  try {
    if (!signature || !timestamp || !signingSecret) return false;
    const timestampNum = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(timestampNum) || Math.abs(now - timestampNum) > 300) {
      return false;
    }
    const sigBasestring = `v0:${timestamp}:${rawBody}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(sigBasestring));
    const expectedHex = 'v0=' + Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return signature === expectedHex;
  } catch (err) {
    return false;
  }
}

export async function checkPoolAdminAuthorization(db: D1Database, poolId: string, authUser: AuthUser | null): Promise<boolean> {
  if (!authUser) return false;
  if (authUser.systemRole === 'superadmin' || authUser.systemRole === 'admin') return true;

  try {
    const pool: any = await db.prepare("SELECT organization_id, champion_id FROM pools WHERE id = ?").bind(poolId).first();
    if (pool?.champion_id === authUser.id) return true;
    if (pool?.organization_id) {
      const org: any = await db.prepare("SELECT owner_id FROM organizations WHERE id = ?").bind(pool.organization_id).first();
      if (org?.owner_id === authUser.id) return true;
    }

    const member: any = await db.prepare("SELECT role FROM pool_members WHERE pool_id = ? AND user_id = ?").bind(poolId, authUser.id).first();
    if (member && (member.role === 'champion' || member.role === 'admin' || member.role === 'manager')) {
      return true;
    }
  } catch (e) {}

  return false;
}
