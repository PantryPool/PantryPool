import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { InMemoryStorageAdapter } from '../src/server/storage/inMemoryAdapter';
import { D1StorageAdapter } from '../src/server/storage/d1Adapter';
import { sendEmail, resetMailTransporter } from '../src/server/services/emailService';
import { createUniversalToken } from '../src/server/api/authUtils';
import { resetInquiryRateLimitsForTesting } from '../src/server/api/routes/contact';

describe('📧 Outbound Email Delivery Tracking & Support Audit Suite', () => {
  const JWT_SECRET = 'test-jwt-secret-email-tracking-2026';
  let storage: InMemoryStorageAdapter;
  let app: ReturnType<typeof createUniversalApi>;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    app = createUniversalApi(storage, JWT_SECRET);
    resetMailTransporter();
    resetInquiryRateLimitsForTesting();
  });

  describe('1. StorageAdapter Parity & CRUD', () => {
    it('creates and lists email logs in InMemoryStorageAdapter', async () => {
      const log1 = await storage.createEmailLog({
        id: 'elog_1',
        user_id: 'u_alice',
        recipient_email: 'alice@example.com',
        email_type: 'password_reset',
        subject: 'Reset Password',
        status: 'simulated',
        message_id: 'sim_1',
        created_at: '2026-09-25T10:00:00Z',
      });

      const log2 = await storage.createEmailLog({
        id: 'elog_2',
        user_id: 'u_bob',
        recipient_email: 'bob@example.com',
        email_type: 'low_stock_alert',
        subject: 'Low Stock Alert',
        status: 'sent',
        message_id: 'msg_2',
        created_at: '2026-09-25T11:00:00Z',
      });

      expect(log1.id).toBe('elog_1');
      expect(log2.id).toBe('elog_2');

      // List all
      const all = await storage.listEmailLogs();
      expect(all.total).toBe(2);
      expect(all.logs[0].id).toBe('elog_2'); // Descending order by created_at

      // Filter by recipient email
      const byEmail = await storage.listEmailLogs({ recipientEmail: 'alice@example.com' });
      expect(byEmail.total).toBe(1);
      expect(byEmail.logs[0].user_id).toBe('u_alice');

      // Filter by type
      const byType = await storage.listEmailLogs({ emailType: 'low_stock_alert' });
      expect(byType.total).toBe(1);
      expect(byType.logs[0].recipient_email).toBe('bob@example.com');

      // Get by ID
      const single = await storage.getEmailLogById('elog_1');
      expect(single).not.toBeNull();
      expect(single?.recipient_email).toBe('alice@example.com');
    });

    it('D1StorageAdapter executes expected SQL for email logs with parity', async () => {
      const executedQueries: { sql: string; params: any[] }[] = [];
      const mockD1 = {
        prepare: (sql: string) => {
          let boundParams: any[] = [];
          return {
            bind: (...args: any[]) => {
              boundParams = args;
              return {
                run: async () => {
                  executedQueries.push({ sql, params: boundParams });
                  return { success: true };
                },
                first: async () => {
                  executedQueries.push({ sql, params: boundParams });
                  if (sql.includes('COUNT(*)')) return { count: 1 };
                  return { id: 'elog_d1', recipient_email: 'test@d1.com', status: 'sent' };
                },
                all: async () => {
                  executedQueries.push({ sql, params: boundParams });
                  return { results: [{ id: 'elog_d1', recipient_email: 'test@d1.com', status: 'sent' }] };
                }
              };
            },
            run: async () => {
              executedQueries.push({ sql, params: [] });
              return { success: true };
            }
          };
        }
      };

      const d1Adapter = new D1StorageAdapter(mockD1 as any);
      await d1Adapter.createEmailLog({
        id: 'elog_d1',
        recipient_email: 'test@d1.com',
        email_type: 'weekly_digest',
        subject: 'Weekly Digest',
        status: 'sent',
        message_id: 'msg_d1',
      });

      expect(executedQueries.some(q => q.sql.includes('INSERT INTO email_logs'))).toBe(true);

      const listResult = await d1Adapter.listEmailLogs({ recipientEmail: 'test@d1.com' });
      expect(listResult.total).toBe(1);
      expect(listResult.logs[0].id).toBe('elog_d1');
    });
  });

  describe('2. Automated Dispatch Tracking in sendEmail', () => {
    it('automatically records simulated email dispatches when SMTP is not configured', async () => {
      const res = await sendEmail({
        to: 'customer@inquiry.com',
        subject: 'Welcome to PantryPool',
        html: '<p>Hello!</p>',
        emailType: 'welcome',
        userId: 'u_cust_1',
        metadata: { source: 'landing_signup' },
        storage,
      }, { SMTP_PASS: '' });

      expect(res.success).toBe(true);
      expect(res.messageId).toMatch(/^simulated_/);

      const logs = await storage.listEmailLogs({ recipientEmail: 'customer@inquiry.com' });
      expect(logs.total).toBe(1);
      expect(logs.logs[0].status).toBe('simulated');
      expect(logs.logs[0].email_type).toBe('welcome');
      expect(logs.logs[0].subject).toBe('Welcome to PantryPool');
      expect(logs.logs[0].metadata_json).toContain('landing_signup');
    });
  });

  describe('3. Route-Level Integration Dispatches', () => {
    it('records email log when password reset is requested (/api/auth/forgot-password)', async () => {
      // Create user first
      await storage.createUser({
        id: 'u_reset_target',
        email: 'resetme@company.com',
        name: 'Reset Requester',
        system_role: 'user',
        token_version: 1,
      });

      const res = await app.request('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'resetme@company.com' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const emailLogs = await storage.listEmailLogs({ recipientEmail: 'resetme@company.com' });
      expect(emailLogs.total).toBe(1);
      expect(emailLogs.logs[0].email_type).toBe('password_reset');
      expect(emailLogs.logs[0].subject).toContain('Reset Your PantryPool Password');
      expect(emailLogs.logs[0].user_id).toBe('u_reset_target');
    });

    it('records email log when low-stock alerts are triggered (/api/notifications/trigger-low-stock-check)', async () => {
      // Seed user with email
      await storage.createUser({
        id: 'u_stock_champ',
        email: 'champ@pantry.internal',
        name: 'Pantry Champion',
        system_role: 'user',
        token_version: 1,
      });

      const token = await createUniversalToken({
        userId: 'u_stock_champ',
        email: 'champ@pantry.internal',
        name: 'Pantry Champion',
        systemRole: 'user',
        tokenVersion: 1
      }, JWT_SECRET);

      const res = await app.request('/api/notifications/trigger-low-stock-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          poolId: 'pool_hq',
          items: [
            { id: 'item_coffee', name: 'Cold Brew Roast', stock: 1, minStock: 5, poolId: 'pool_hq' }
          ]
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.alerts.length).toBe(1);

      const emailLogs = await storage.listEmailLogs({ recipientEmail: 'champ@pantry.internal' });
      expect(emailLogs.total).toBe(1);
      expect(emailLogs.logs[0].email_type).toBe('low_stock_alert');
      expect(emailLogs.logs[0].subject).toContain('Low Stock Alert');
    });

    it('records both internal inquiry and customer autoresponder logs on enterprise contact', async () => {
      const res = await app.request('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.99',
        },
        body: JSON.stringify({
          company: 'Globex Corp',
          email: 'hank@globex.internal',
          name: 'Hank Scorpio',
          teamSize: '500+',
          pantryCount: '12',
          requirements: 'Full pantry stocking automation'
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Customer autoresponder log
      const customerLogs = await storage.listEmailLogs({ recipientEmail: 'hank@globex.internal' });
      expect(customerLogs.total).toBe(1);
      expect(customerLogs.logs[0].email_type).toBe('enterprise_autoresponder');

      // Internal sales notification log
      const salesLogs = await storage.listEmailLogs({ emailType: 'enterprise_inquiry' });
      expect(salesLogs.total).toBe(1);
      expect(salesLogs.logs[0].subject).toContain('Globex Corp');
    });
  });

  describe('4. Support & Admin Query Endpoint (GET /api/admin/email-logs)', () => {
    beforeEach(async () => {
      await storage.createEmailLog({
        id: 'elog_audit_1',
        recipient_email: 'inquiry@target.org',
        email_type: 'password_reset',
        subject: 'Reset Password Target',
        status: 'sent',
      });
      await storage.createEmailLog({
        id: 'elog_audit_2',
        recipient_email: 'other@target.org',
        email_type: 'low_stock_alert',
        subject: 'Low Stock Notice',
        status: 'simulated',
      });
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await app.request('/api/admin/email-logs');
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('forbids regular users with 403', async () => {
      const regularToken = await createUniversalToken({
        userId: 'u_regular',
        email: 'regular@user.com',
        name: 'Regular User',
        systemRole: 'user',
        tokenVersion: 1
      }, JWT_SECRET);

      const res = await app.request('/api/admin/email-logs', {
        headers: { 'Authorization': `Bearer ${regularToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Forbidden');
    });

    it('allows superadmin to retrieve email logs with filtering and pagination', async () => {
      const adminToken = await createUniversalToken({
        userId: 'u_admin',
        email: 'admin@pantrypool.com',
        name: 'Super Admin',
        systemRole: 'superadmin',
        tokenVersion: 1
      }, JWT_SECRET);

      // List all
      const resAll = await app.request('/api/admin/email-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      expect(resAll.status).toBe(200);
      const dataAll = await resAll.json();
      expect(dataAll.success).toBe(true);
      expect(dataAll.total).toBe(2);

      // Filter by email
      const resFiltered = await app.request('/api/admin/email-logs?email=inquiry@target.org', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      expect(resFiltered.status).toBe(200);
      const dataFiltered = await resFiltered.json();
      expect(dataFiltered.success).toBe(true);
      expect(dataFiltered.total).toBe(1);
      expect(dataFiltered.logs[0].id).toBe('elog_audit_1');

      // Filter by type
      const resType = await app.request('/api/admin/email-logs?emailType=low_stock_alert', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      expect(resType.status).toBe(200);
      const dataType = await resType.json();
      expect(dataType.total).toBe(1);
      expect(dataType.logs[0].id).toBe('elog_audit_2');
    });
  });
});
