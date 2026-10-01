import { Hono } from 'hono';
import { HonoEnv } from '../app';

// In-memory rate limiter: max 5 inquiries per 5 minutes per IP
const inquiryRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkInquiryRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const maxRequests = 5;

  const entry = inquiryRateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    inquiryRateLimits.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function resetInquiryRateLimitsForTesting() {
  inquiryRateLimits.clear();
}

function escapeHtml(str: string): string {
  return String(str).replace(/[&<>'"]/g, (tag) => {
    return (
      {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      }[tag] || tag
    );
  });
}

export function registerContactRoutes(app: Hono<HonoEnv>) {
  app.post('/api/contact', async (c) => {
    const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
    
    if (!checkInquiryRateLimit(clientIp)) {
      return c.json({
        success: false,
        error: 'Too many requests. Please wait a few minutes before submitting another inquiry.',
      }, 429);
    }

    const body: any = await c.req.json().catch(() => ({}));
    const { company, email, teamSize, pantryCount, requirements, name, message } = body || {};

    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanCompany = typeof company === 'string' ? company.trim() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanTeamSize = typeof teamSize === 'string' ? teamSize.trim() : 'Not specified';
    const cleanPantryCount = typeof pantryCount === 'string' ? pantryCount.trim() : 'Not specified';
    const cleanRequirements = typeof requirements === 'string' ? requirements.trim() : (typeof message === 'string' ? message.trim() : '');

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return c.json({
        success: false,
        error: 'Please provide a valid work email address.',
      }, 400);
    }

    if (!cleanCompany && !cleanName && !cleanRequirements) {
      return c.json({
        success: false,
        error: 'Please provide your company or organization name.',
      }, 400);
    }

    try {
      const storage = c.get('storage');
      const { sendEmail, renderEmailTemplate, getSmtpConfig } = await import('../../services/emailService');
      const env = c.env as any;
      const smtpCfg = getSmtpConfig(env);
      const destinationEmail = env?.SALES_EMAIL || process.env.SALES_EMAIL || smtpCfg.fromEmail || 'sales@pantrypool.com';

      const subject = `[Enterprise Inquiry] ${cleanCompany || cleanName || 'New Inquiry'} (${cleanTeamSize} members)`;
      const internalHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #2D2D2D; background: #FAF9F5; border: 1px solid #E0DAD1; border-radius: 12px;">
          <h2 style="color: #E8694A; margin-top: 0; border-bottom: 2px solid #E0DAD1; padding-bottom: 12px; font-size: 20px;">
            🏢 New Enterprise Workspace Inquiry
          </h2>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
            <tr><td style="padding: 8px 0; color: #6B6B6B; width: 160px;"><strong>Company:</strong></td><td>${escapeHtml(cleanCompany || 'N/A')}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B6B6B;"><strong>Work Email:</strong></td><td><a href="mailto:${escapeHtml(cleanEmail)}" style="color: #E8694A; text-decoration: underline;">${escapeHtml(cleanEmail)}</a></td></tr>
            ${cleanName ? `<tr><td style="padding: 8px 0; color: #6B6B6B;"><strong>Contact Name:</strong></td><td>${escapeHtml(cleanName)}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #6B6B6B;"><strong>Estimated Pantries:</strong></td><td>${escapeHtml(cleanPantryCount)}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B6B6B;"><strong>Team Size:</strong></td><td>${escapeHtml(cleanTeamSize)}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B6B6B; vertical-align: top;"><strong>Requirements:</strong></td><td>${escapeHtml(cleanRequirements || 'None specified')}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B6B6B;"><strong>Client IP:</strong></td><td>${escapeHtml(clientIp)}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B6B6B;"><strong>Received At:</strong></td><td>${new Date().toISOString()}</td></tr>
          </table>
        </div>
      `;

      // 1. Dispatch internal notification email to sales/operations
      await sendEmail({
        to: destinationEmail,
        subject,
        html: internalHtml,
        text: `Enterprise Workspace Inquiry\nCompany: ${cleanCompany}\nEmail: ${cleanEmail}\nTeam Size: ${cleanTeamSize}\nPantries: ${cleanPantryCount}\nRequirements: ${cleanRequirements}\n`,
        replyTo: cleanEmail,
        emailType: 'enterprise_inquiry',
        metadata: { company: cleanCompany, teamSize: cleanTeamSize, pantryCount: cleanPantryCount, email: cleanEmail },
        storage,
      }, env);

      // 2. Dispatch polite autoresponder confirmation to the requester
      const autoresponderHtml = renderEmailTemplate({
        headline: 'Thank You for Contacting PantryPool',
        intro: `Hi ${escapeHtml(cleanName || cleanCompany || 'there')}, we received your Enterprise inquiry!`,
        mainContent: `Our enterprise solutions team has received your request for <strong>${escapeHtml(cleanCompany || 'your workspace')}</strong>. We are reviewing your requirements and will follow up with you at <strong>${escapeHtml(cleanEmail)}</strong> shortly with customized pricing and deployment details.<br/><br/>If you have any questions or need to add more details in the meantime, feel free to reply directly to this email.`,
        footerNote: 'PantryPool Enterprise Team',
      });

      await sendEmail({
        to: cleanEmail,
        subject: `PantryPool Enterprise Inquiry Received — ${cleanCompany || 'Custom Workspace'}`,
        html: autoresponderHtml,
        text: `Thank you for contacting PantryPool Enterprise. We have received your inquiry for ${cleanCompany || 'your workspace'} and will follow up shortly.`,
        emailType: 'enterprise_autoresponder',
        metadata: { company: cleanCompany },
        storage,
      }, env).catch((err) => {
        console.warn('[Contact Route] Autoresponder non-fatal error:', err);
      });

      return c.json({
        success: true,
        message: 'Your enterprise inquiry has been received. Our team will follow up shortly.',
      });
    } catch (err: any) {
      console.error('[Contact Route] Failed to process inquiry:', err);
      return c.json({
        success: false,
        error: 'Unable to process inquiry at this moment. Please try again later.',
      }, 500);
    }
  });
}
