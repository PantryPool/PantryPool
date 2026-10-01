import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { renderEmailTemplate, sendEmail, resetMailTransporter, wrapBase64, encodeSubjectHeader, toBase64Utf8 } from '../src/server/services/emailService';
import { createUniversalApi } from '../src/server/api/app';
import { StorageAdapter } from '../src/server/storage/types';
import { hashPassword, generateToken } from '../auth';

class MockStorageAdapter implements StorageAdapter {
  users: Map<string, any> = new Map();
  pools: Map<string, any> = new Map();
  members: Map<string, any> = new Map();
  items: Map<string, any> = new Map();
  transactions: Map<string, any> = new Map();
  shoppingItems: Map<string, any> = new Map();
  polls: Map<string, any> = new Map();
  notifications: Map<string, any> = new Map();
  webhooks: Map<string, any> = new Map();
  sso: Map<string, any> = new Map();
  settings: Record<string, any> = {};

  async getUserById(id: string) { return this.users.get(id) || null; }
  async getUserByEmail(email: string) {
    return Array.from(this.users.values()).find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }
  async createUser(user: any) {
    const u = { ...user, token_version: 1 };
    this.users.set(user.id, u);
    return u;
  }
  async updateUser(id: string, updates: any) {
    const u = this.users.get(id);
    if (u) this.users.set(id, { ...u, ...updates });
  }
  async listUsers() { return Array.from(this.users.values()); }
  async bumpTokenVersion(id: string) {
    const u = this.users.get(id);
    if (u) { u.token_version = (u.token_version || 1) + 1; }
    return u?.token_version || 1;
  }

  async getOrgById(id: string) { return null; }
  async listOrgsByOwner(ownerId: string) { return []; }
  async createOrg(org: any) { return org; }
  async updateOrgTier(id: string, tier: any) {}

  async getPoolById(id: string) { return this.pools.get(id) || null; }
  async listPoolsForUser(userId: string) { return Array.from(this.pools.values()); }
  async createPool(pool: any) { this.pools.set(pool.id, pool); return pool; }
  async updatePool(id: string, updates: any) {
    const p = this.pools.get(id);
    if (p) this.pools.set(id, { ...p, ...updates });
  }
  async deletePool(id: string) { this.pools.delete(id); }
  async getPoolMember(poolId: string, userId: string) { return this.members.get(`${poolId}_${userId}`) || null; }
  async listPoolMembers(poolId: string) { return Array.from(this.members.values()).filter(m => m.pool_id === poolId); }
  async upsertPoolMember(member: any) { this.members.set(`${member.pool_id}_${member.user_id}`, member); }
  async updateMemberRole(poolId: string, userId: string, role: string) {
    const m = this.members.get(`${poolId}_${userId}`);
    if (m) m.role = role;
  }
  async removePoolMember(poolId: string, userId: string) { this.members.delete(`${poolId}_${userId}`); }
  async countPoolsByOrg(orgId: string) { return Array.from(this.pools.values()).filter(p => p.organization_id === orgId).length; }
  async countPersonalPools(userId: string) { return Array.from(this.pools.values()).filter(p => !p.organization_id && p.champion_id === userId).length; }
  async adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number) {
    const m = this.members.get(`${poolId}_${userId}`) || { id: 'm1', pool_id: poolId, user_id: userId, balance: 0, balance_cents: 0 };
    m.balance += deltaAmount;
    m.balance_cents += deltaCents;
    this.members.set(`${poolId}_${userId}`, m);
  }

  async getItemById(id: string) { return this.items.get(id) || null; }
  async listItemsByPool(poolId: string) { return Array.from(this.items.values()).filter(i => i.pool_id === poolId); }
  async saveItem(item: any) { this.items.set(item.id, item); return item; }
  async deleteItem(id: string) { this.items.delete(id); }
  async adjustItemStock(id: string, deltaQty: number) {
    const item = this.items.get(id);
    if (item) item.stock = Math.max(0, item.stock + deltaQty);
  }

  async getTransactionById(id: string) { return this.transactions.get(id) || null; }
  async listTransactionsByPool(poolId: string, limit?: number) { return Array.from(this.transactions.values()).filter(t => t.pool_id === poolId); }
  async createTransaction(tx: any) { this.transactions.set(tx.id, tx); return tx; }

  async listShoppingItems(poolId: string) { return Array.from(this.shoppingItems.values()).filter(s => s.pool_id === poolId); }
  async createShoppingItem(item: any) { this.shoppingItems.set(item.id, item); return item; }
  async updateShoppingItemStatus(id: string, poolId: string, purchased: boolean) {
    const item = this.shoppingItems.get(id);
    if (item) item.purchased = purchased;
  }
  async deleteShoppingItem(id: string, poolId: string) { this.shoppingItems.delete(id); }

  async listPolls(poolId: string) { return Array.from(this.polls.values()).filter(p => p.pool_id === poolId); }
  async createPoll(poll: any) { this.polls.set(poll.id, poll); return poll; }
  async updatePoll(id: string, poolId: string, updates: any) {
    const poll = this.polls.get(id);
    if (poll) this.polls.set(id, { ...poll, ...updates });
  }
  async deletePoll(id: string, poolId: string) { this.polls.delete(id); }

  async listNotifications(userId: string) { return Array.from(this.notifications.values()).filter(n => n.user_id === userId); }
  async createNotification(notif: any) { this.notifications.set(notif.id, notif); return notif; }
  async markNotificationsRead(userId: string, notifId?: string) {
    for (const n of this.notifications.values()) {
      if (n.user_id === userId && (!notifId || n.id === notifId)) n.is_read = true;
    }
  }

  async listWebhooks(poolId: string) { return Array.from(this.webhooks.values()).filter(w => w.pool_id === poolId); }
  async saveWebhook(webhook: any) { this.webhooks.set(webhook.id, webhook); return webhook; }
  async deleteWebhook(id: string, poolId: string) { this.webhooks.delete(id); }

  async getSsoConfigByDomain(domain: string) { return this.sso.get(domain) || null; }
  async getSsoConfigByOrg(orgId: string) { return null; }
  async saveSsoConfig(config: any) { this.sso.set(config.domain, config); return config; }

  async getSystemSettings() { return this.settings; }
  async saveSystemSettings(s: any) { this.settings = { ...this.settings, ...s }; }
  async getPlatformStats() {
    return {
      totalUsers: this.users.size,
      totalPools: this.pools.size,
      totalTransactions: this.transactions.size,
      totalVolume: Array.from(this.transactions.values()).reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
    };
  }

  telemetryEvents: any[] = [];
  async recordTelemetryEvents(events: any[]) { this.telemetryEvents.push(...events); }
  async getTelemetryStats(days = 7) {
    return {
      periodDays: days,
      totalEvents: this.telemetryEvents.length,
      topFeatures: [],
      errorSummary: [],
      funnelBreakdown: [],
      activityByDay: [],
      recentEvents: this.telemetryEvents,
    };
  }

  resetTokens: Map<string, any> = new Map();
  async createPasswordResetToken(token: any) { this.resetTokens.set(token.token_hash, token); }
  async getPasswordResetToken(tokenHash: string) { return this.resetTokens.get(tokenHash) || null; }
  async markPasswordResetTokenUsed(id: string) {
    for (const [k, v] of this.resetTokens.entries()) {
      if (v.id === id) {
        this.resetTokens.set(k, { ...v, used: true });
      }
    }
  }
}

describe('📧 Email & Password Reset Suite', () => {
  let globalOriginalSmtpPass: string | undefined;

  beforeAll(() => {
    globalOriginalSmtpPass = process.env.SMTP_PASS;
    delete process.env.SMTP_PASS;
    resetMailTransporter();
  });

  afterAll(() => {
    if (globalOriginalSmtpPass !== undefined) {
      process.env.SMTP_PASS = globalOriginalSmtpPass;
    } else {
      delete process.env.SMTP_PASS;
    }
    resetMailTransporter();
  });

  beforeEach(() => {
    resetMailTransporter();
  });

  describe('Template & Email Rendering', () => {
    it('renders branded HTML template with all components', () => {
      const html = renderEmailTemplate({
        headline: 'Password Reset Request',
        intro: 'Hello John,',
        mainContent: '<p>Please click below to reset your password.</p>',
        ctaText: 'Reset Password',
        ctaUrl: 'https://pantrypool.com/?reset_token=abc123xyz',
        footerNote: 'Ignore this if you did not request a reset.',
      });

      expect(html).toContain('PantryPool');
      expect(html).toContain('logo-badge.png');
      expect(html).not.toContain('🥫');
      expect(html).toContain('Password Reset Request');
      expect(html).toContain('Hello John,');
      expect(html).toContain('Please click below to reset your password.');
      expect(html).toContain('Reset Password');
      expect(html).toContain('https://pantrypool.com/?reset_token=abc123xyz');
      expect(html).toContain('Ignore this if you did not request a reset.');
      expect(html).toContain('#E8694A'); // PantryPool primary color
    });

    it('falls back to simulation when SMTP password is empty', async () => {
      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
      }, { SMTP_PASS: '' });

      expect(result.success).toBe(true);
      expect(result.messageId).toContain('simulated_');
    });

    it('wraps base64 payloads to at most 76 characters per line preventing SMTP transport failures', () => {
      const longHtml = renderEmailTemplate({
        headline: 'Reset Your Password',
        intro: 'Hello Member,',
        mainContent: '<p>We received a request to reset your password. Click the link to proceed.</p>',
        ctaText: 'Reset Password',
        ctaUrl: 'https://pantrypool.com/?reset_token=abcdef1234567890&email=member%40example.com',
        footerNote: 'If you did not request this, please ignore.',
      });

      const rawBase64 = toBase64Utf8(longHtml);
      // Raw Base64 of our HTML template is several thousand characters on a single line (> 4096)
      expect(rawBase64.length).toBeGreaterThan(4000);

      const wrapped = wrapBase64(rawBase64, 76);
      const lines = wrapped.split('\r\n');
      expect(lines.length).toBeGreaterThan(50);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(76);
      }

      // Verify wrapped content decodes back to identical original HTML
      const unwrappedB64 = lines.join('');
      expect(unwrappedB64).toBe(rawBase64);
    });

    it('folds long subject lines into RFC 2047 compliant words under 76 chars', () => {
      const longSubject = '⚠️ Very Long Urgent PantryPool Notification Subject With Unicode Details 🌟'.repeat(2);
      const encoded = encodeSubjectHeader(longSubject);
      const headerLines = encoded.split('\r\n ');
      for (const hl of headerLines) {
        expect(hl.length).toBeLessThanOrEqual(76);
      }
    });
  });

  describe('Forgot Password API Endpoint', () => {
    let storage: MockStorageAdapter;
    let app: ReturnType<typeof createUniversalApi>;

    beforeEach(async () => {
      storage = new MockStorageAdapter();
      app = createUniversalApi(storage);

      const passwordHash = await hashPassword('CurrentPassword123!');
      await storage.createUser({
        id: 'u_user_1',
        email: 'alice@example.com',
        name: 'Alice Cooper',
        password_hash: passwordHash,
        system_role: 'member',
        token_version: 1,
      });
    });

    it('rejects missing or invalid email address', async () => {
      const res = await app.request('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Email address is required');
    });

    it('returns generic success message for non-existent user to avoid enumeration', async () => {
      const res = await app.request('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@example.com' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('If an account exists');
      expect(storage.resetTokens.size).toBe(0);
    });

    it('creates reset token in storage and returns success for valid user', async () => {
      const res = await app.request('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('instructions have been sent');

      expect(storage.resetTokens.size).toBe(1);
      const token = Array.from(storage.resetTokens.values())[0];
      expect(token.user_id).toBe('u_user_1');
      expect(token.used).toBe(false);
      expect(new Date(token.expires_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Reset Password API Endpoint', () => {
    let storage: MockStorageAdapter;
    let app: ReturnType<typeof createUniversalApi>;
    let validTokenRaw: string;
    let validTokenHash: string;

    beforeEach(async () => {
      storage = new MockStorageAdapter();
      app = createUniversalApi(storage);

      const passwordHash = await hashPassword('OldPassword123!');
      await storage.createUser({
        id: 'u_user_2',
        email: 'bob@example.com',
        name: 'Bob Marley',
        password_hash: passwordHash,
        system_role: 'member',
        token_version: 1,
      });

      validTokenRaw = 'abcdef1234567890abcdef1234567890';
      const tokenHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(validTokenRaw));
      validTokenHash = Array.from(new Uint8Array(tokenHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      await storage.createPasswordResetToken({
        id: 'prt_valid_1',
        user_id: 'u_user_2',
        token_hash: validTokenHash,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        used: false,
      });
    });

    it('rejects missing token or new password', async () => {
      const res = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: '', newPassword: '' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('required');
    });

    it('rejects passwords shorter than 8 characters', async () => {
      const res = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: validTokenRaw, newPassword: 'short' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('at least 8 characters');
    });

    it('rejects unknown or invalid token', async () => {
      const res = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'wrong_token_value', newPassword: 'NewBrandNewPassword123!' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid or expired');
    });

    it('rejects expired tokens', async () => {
      const expiredRaw = 'expired1234567890abcdef12345678';
      const expiredBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expiredRaw));
      const expiredHash = Array.from(new Uint8Array(expiredBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      await storage.createPasswordResetToken({
        id: 'prt_expired',
        user_id: 'u_user_2',
        token_hash: expiredHash,
        expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
        used: false,
      });

      const res = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: expiredRaw, newPassword: 'NewBrandNewPassword123!' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('expired');
    });

    it('resets password successfully and invalidates token', async () => {
      const res = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: validTokenRaw, newPassword: 'BrandNewSecurePassword2026!' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('Password has been reset successfully');

      // Verify token marked used
      const storedToken = await storage.getPasswordResetToken(validTokenHash);
      expect(storedToken?.used).toBe(true);

      // Verify user token_version incremented
      const updatedUser = await storage.getUserById('u_user_2');
      expect(updatedUser?.token_version).toBe(2);

      // Verify login with old password fails
      const loginOld = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@example.com', password: 'OldPassword123!' }),
      });
      const loginOldData = await loginOld.json();
      expect(loginOldData.success).toBe(false);

      // Verify login with new password succeeds
      const loginNew = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@example.com', password: 'BrandNewSecurePassword2026!' }),
      });
      const loginNewData = await loginNew.json();
      expect(loginNewData.success).toBe(true);
      expect(loginNewData.user.email).toBe('bob@example.com');

      // Re-using the same reset token must fail
      const reuseRes = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: validTokenRaw, newPassword: 'YetAnotherPassword123!' }),
      });
      expect(reuseRes.status).toBe(400);
    });
  });

  describe('Notification Dispatch Endpoint', () => {
    let storage: MockStorageAdapter;
    let app: ReturnType<typeof createUniversalApi>;
    let authToken: string;

    beforeEach(async () => {
      storage = new MockStorageAdapter();
      app = createUniversalApi(storage);

      const user = await storage.createUser({
        id: 'u_user_notify',
        email: 'charlie@example.com',
        name: 'Charlie Brown',
        system_role: 'member',
        token_version: 1,
      });

      authToken = generateToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        systemRole: user.system_role,
        tokenVersion: user.token_version,
      });
    });

    it('dispatches test notification alert successfully', async () => {
      const res = await app.request('/api/notifications/test-alert', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.message).toContain('Test notification dispatched');
    });
  });

  describe('Internal Email Relay Endpoint', () => {
    let storage: MockStorageAdapter;
    let app: ReturnType<typeof createUniversalApi>;
    const RELAY_SECRET = 'test-internal-secret-xyz-123';
    let originalSmtpPass: string | undefined;

    beforeEach(() => {
      storage = new MockStorageAdapter();
      app = createUniversalApi(storage);
      originalSmtpPass = process.env.SMTP_PASS;
      delete process.env.SMTP_PASS;
      process.env.EMAIL_RELAY_SECRET = RELAY_SECRET;
      resetMailTransporter();
    });

    afterEach(() => {
      if (originalSmtpPass !== undefined) {
        process.env.SMTP_PASS = originalSmtpPass;
      } else {
        delete process.env.SMTP_PASS;
      }
      delete process.env.EMAIL_RELAY_SECRET;
      resetMailTransporter();
    });

    it('rejects unauthenticated requests without secret header', async () => {
      const res = await app.request('/api/internal/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'test@example.com',
          subject: 'Hello',
          html: '<p>World</p>',
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized relay access');
    });

    it('rejects requests with invalid secret header', async () => {
      const res = await app.request('/api/internal/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Secret': 'wrong-secret',
        },
        body: JSON.stringify({
          to: 'test@example.com',
          subject: 'Hello',
          html: '<p>World</p>',
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('rejects requests with missing required fields', async () => {
      const res = await app.request('/api/internal/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Secret': RELAY_SECRET,
        },
        body: JSON.stringify({
          to: 'test@example.com',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required parameters');
    });

    it('successfully processes valid email relay request', async () => {
      const res = await app.request('/api/internal/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Secret': RELAY_SECRET,
        },
        body: JSON.stringify({
          to: 'recipient@example.com',
          subject: 'Test Internal Relay',
          html: '<p>Internal Relay Working!</p>',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.messageId).toBeDefined();
    });
  });

  describe('Outbound Email Relay & Edge Routing Strategy', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('routes outbound email via HTTPS relay when EMAIL_RELAY_URL and EMAIL_RELAY_SECRET are present', async () => {
      let fetchCalled = false;
      let capturedUrl = '';
      let capturedHeaders: any = {};
      let capturedBody: any = {};

      globalThis.fetch = (async (url: any, init: any) => {
        fetchCalled = true;
        capturedUrl = String(url);
        capturedHeaders = init?.headers || {};
        capturedBody = JSON.parse(init?.body || '{}');
        return new Response(JSON.stringify({ success: true, messageId: 'relay_msg_98765' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any;

      const result = await sendEmail({
        to: 'external@example.com',
        subject: 'Hello From Edge',
        html: '<p>Relayed content</p>',
      }, {
        EMAIL_RELAY_URL: 'https://relay.pantrypool.com/api/internal/send-email',
        EMAIL_RELAY_SECRET: 'super-secret-relay-key',
      });

      expect(fetchCalled).toBe(true);
      expect(capturedUrl).toBe('https://relay.pantrypool.com/api/internal/send-email');
      expect(capturedHeaders['X-Relay-Secret']).toBe('super-secret-relay-key');
      expect(capturedBody.to).toBe('external@example.com');
      expect(capturedBody.subject).toBe('Hello From Edge');
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('relay_msg_98765');
    });

    it('routes to sendEdgeEmail when ENABLE_EDGE_SOCKETS is true and relay is omitted', async () => {
      let edgeEmailCalled = false;
      let capturedOptions: any = null;

      const mockSendEdgeEmail = async (opts: any) => {
        edgeEmailCalled = true;
        capturedOptions = opts;
        return { success: true, messageId: 'edge_socket_msg_123' };
      };

      const result = await sendEmail({
        to: 'edge-user@example.com',
        subject: 'Direct Socket Test',
        html: '<p>Direct SMTPS</p>',
      }, {
        ENABLE_EDGE_SOCKETS: true,
        sendEdgeEmail: mockSendEdgeEmail,
      });

      expect(edgeEmailCalled).toBe(true);
      expect(capturedOptions.to).toBe('edge-user@example.com');
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('edge_socket_msg_123');
    });

    it('skips sendEdgeEmail when ENABLE_EDGE_SOCKETS is omitted (default disabled for free tier)', async () => {
      let edgeEmailCalled = false;

      const mockSendEdgeEmail = async () => {
        edgeEmailCalled = true;
        return { success: true, messageId: 'edge_socket_msg_123' };
      };

      const result = await sendEmail({
        to: 'edge-user@example.com',
        subject: 'Direct Socket Test',
        html: '<p>Direct SMTPS</p>',
      }, {
        sendEdgeEmail: mockSendEdgeEmail,
        // ENABLE_EDGE_SOCKETS omitted
      });

      expect(edgeEmailCalled).toBe(false);
      expect(result.success).toBe(true);
      expect(result.messageId).toContain('simulated_');
    });
  });
});

