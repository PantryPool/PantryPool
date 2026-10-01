import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUniversalApi } from '../src/server/api/app';
import { resetInquiryRateLimitsForTesting } from '../src/server/api/routes/contact';
import * as emailService from '../src/server/services/emailService';

vi.mock('../src/server/services/emailService', async () => {
  const actual = await vi.importActual('../src/server/services/emailService');
  return {
    ...actual,
    sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'msg_test_123' }),
    renderEmailTemplate: vi.fn().mockReturnValue('<html>Mock Autoresponder</html>'),
    getSmtpConfig: vi.fn().mockReturnValue({
      host: 'localhost',
      port: 465,
      secure: true,
      user: 'sales@pantrypool.com',
      pass: 'testpass',
      fromEmail: 'sales@pantrypool.com',
      fromName: 'PantryPool Sales',
    }),
  };
});

describe('Enterprise Contact & Inquiry API Suite (POST /api/contact)', () => {
  let app: ReturnType<typeof createUniversalApi>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetInquiryRateLimitsForTesting();
    app = createUniversalApi();
  });

  it('successfully accepts valid enterprise inquiry and sends internal email and autoresponder', async () => {
    const payload = {
      company: 'Acme Corp',
      email: 'facilities@acme.com',
      teamSize: '500-2000',
      pantryCount: '30-50',
      requirements: 'Okta SAML 2.0 and custom billing',
    };

    const res = await app.request('/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.1',
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('received');

    // Verify internal notification email
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'sales@pantrypool.com',
        subject: expect.stringContaining('Acme Corp'),
        replyTo: 'facilities@acme.com',
        html: expect.stringContaining('Acme Corp'),
      }),
      undefined
    );

    // Verify customer autoresponder confirmation email
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'facilities@acme.com',
        subject: expect.stringContaining('PantryPool Enterprise Inquiry Received'),
        html: expect.stringContaining('Mock Autoresponder'),
      }),
      undefined
    );
  });

  it('rejects invalid or missing email addresses', async () => {
    const res = await app.request('/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.2',
      },
      body: JSON.stringify({
        company: 'Acme Corp',
        email: 'invalid-email',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('valid work email');
  });

  it('rejects empty company information', async () => {
    const res = await app.request('/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.3',
      },
      body: JSON.stringify({
        company: '',
        email: 'facilities@acme.com',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('company');
  });

  it('enforces rate limit after multiple consecutive requests from the same IP', async () => {
    const payload = {
      company: 'Spam Corp',
      email: 'bot@spam.com',
    };

    // 5 allowed requests
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.99',
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
    }

    // 6th request should be blocked with 429
    const blockedRes = await app.request('/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.99',
      },
      body: JSON.stringify(payload),
    });

    expect(blockedRes.status).toBe(429);
    const data = await blockedRes.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Too many requests');
  });
});
