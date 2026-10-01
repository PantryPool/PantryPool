/**
 * 📧 PantryPool Email & Notification Delivery Service
 * 
 * Supports SMTP (SSL/TLS port 465) for self-hosted Node.js / cPanel environments
 * and gracefully falls back or logs in edge/testing environments.
 */

import nodemailer, { Transporter } from 'nodemailer';
import type { StorageAdapter } from '../storage/types';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  userId?: string | null;
  emailType?: string;
  metadata?: Record<string, any>;
  storage?: StorageAdapter;
  skipRelay?: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

/**
 * Converts a UTF-8 string to Base64 in Node/Edge environments
 */
export function toBase64Utf8(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Wraps Base64 string into RFC 2045 compliant 76-character lines separated by CRLF (\r\n)
 * to prevent SMTP transport rejections ("message has lines too long for transport").
 */
export function wrapBase64(b64: string, lineLength: number = 76): string {
  if (!b64) return '';
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += lineLength) {
    chunks.push(b64.substring(i, i + lineLength));
  }
  return chunks.join('\r\n');
}

/**
 * Encodes an email subject header according to RFC 2047, ensuring folded lines
 * do not exceed SMTP line length limits.
 */
export function encodeSubjectHeader(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject) && subject.length <= 75) {
    return subject;
  }
  const b64 = toBase64Utf8(subject);
  if (b64.length <= 60) {
    return `=?UTF-8?B?${b64}?=`;
  }
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += 48) {
    chunks.push(`=?UTF-8?B?${b64.substring(i, i + 48)}?=`);
  }
  return chunks.join('\r\n ');
}

export function getSmtpConfig(env?: any): SmtpConfig {
  const host = (env?.SMTP_HOST !== undefined ? env.SMTP_HOST : process.env.SMTP_HOST) || '';
  const rawPort = env?.SMTP_PORT !== undefined ? env.SMTP_PORT : process.env.SMTP_PORT;
  const port = parseInt(String(rawPort || '465'), 10);
  const secure = port === 465;
  const user = (env?.SMTP_USER !== undefined ? env.SMTP_USER : process.env.SMTP_USER) || '';
  const pass = env?.SMTP_PASS !== undefined ? env.SMTP_PASS : (process.env.SMTP_PASS || '');
  const fromEmail = (env?.SMTP_FROM_EMAIL !== undefined ? env.SMTP_FROM_EMAIL : process.env.SMTP_FROM_EMAIL) || user || 'noreply@pantrypool.com';
  const fromName = (env?.SMTP_FROM_NAME !== undefined ? env.SMTP_FROM_NAME : process.env.SMTP_FROM_NAME) || 'PantryPool';

  return { host, port, secure, user, pass, fromEmail, fromName };
}

let transporterInstance: Transporter | null = null;

export function resetMailTransporter(): void {
  transporterInstance = null;
}

export function getMailTransporter(config?: SmtpConfig): Transporter | null {
  const cfg = config || getSmtpConfig();
  if (!cfg.pass) {
    return null;
  }

  // nodemailer cannot establish raw TCP sockets on Cloudflare Workers isolate
  const isCloudflareWorkers = typeof navigator !== 'undefined' && /Cloudflare-Workers/i.test(navigator?.userAgent || '');
  if (isCloudflareWorkers) {
    return null;
  }

  if (!transporterInstance) {
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
    const transportOptions: any = {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
    };
    if (isNode) {
      transportOptions.tls = {
        rejectUnauthorized: false, // Compatibility for custom mail server certificates
      };
    }
    transporterInstance = nodemailer.createTransport(transportOptions);
  }

  return transporterInstance;
}

/**
 * Send an email using configured SMTP transporter.
 */
export async function sendEmail(
  options: EmailOptions,
  env?: any,
  storageOverride?: StorageAdapter
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const cfg = getSmtpConfig(env);
  const storage = options.storage || storageOverride || env?.storage;

  const logDispatch = async (status: 'sent' | 'simulated' | 'failed', messageId?: string, errorMessage?: string) => {
    if (storage?.createEmailLog) {
      try {
        const id = 'elog_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11));
        await storage.createEmailLog({
          id,
          user_id: options.userId || null,
          recipient_email: options.to,
          email_type: options.emailType || 'transactional',
          subject: options.subject,
          status,
          message_id: messageId || null,
          error_message: errorMessage || null,
          metadata_json: options.metadata ? JSON.stringify(options.metadata) : null,
          created_at: new Date().toISOString()
        });
      } catch (err: any) {
        console.warn('[Email Service] Failed to persist email dispatch log:', err?.message || err);
      }
    }
  };

  const isCloudflareWorkers = (typeof navigator !== 'undefined' && /Cloudflare-Workers/i.test(navigator?.userAgent || '')) ||
    Boolean(env && (env.pantrypool_db !== undefined || env.__edgeRateLimited));

  // 1. Authenticated HTTPS Email Relay
  // In serverless / Cloudflare Edge environments, route outbound emails through the dedicated HTTPS relay
  // on Node.js to bypass datacenter IP firewall restrictions on port 465 and avoid nodemailer runtime errors.
  const explicitRelayUrl = env?.EMAIL_RELAY_URL || (typeof process !== 'undefined' && process.env?.EMAIL_RELAY_URL);
  const relaySecret = env?.EMAIL_RELAY_SECRET || (typeof process !== 'undefined' && process.env?.EMAIL_RELAY_SECRET);
  const relayUrl = explicitRelayUrl || undefined;

  if (relayUrl && relaySecret && !options.skipRelay && options.emailType !== 'internal_relay') {
    try {
      const fromHeader = options.from || `"${cfg.fromName}" <${cfg.fromEmail}>`;
      const resp = await fetch(relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Secret': relaySecret,
        },
        body: JSON.stringify({
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          from: fromHeader,
        }),
      });

      const data: any = await resp.json().catch(() => ({}));
      if (resp.ok && data?.success) {
        const msgId = data.messageId || 'relay_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9));
        await logDispatch('sent', msgId);
        return {
          success: true,
          messageId: msgId,
        };
      }
      console.warn(`[Email Service] Relay returned error (${resp.status}):`, data?.error || 'Unknown error');
    } catch (relayErr: any) {
      console.warn('[Email Service] Relay request failed, attempting socket fallback:', relayErr?.message || relayErr);
    }
  }

  // 2. Direct Cloudflare Edge SMTPS Socket (Paid Cloudflare Workers feature — disabled by default)
  // To re-enable when on a paid Cloudflare Workers plan, set ENABLE_EDGE_SOCKETS="true" in Pages environment variables.
  const edgeSocketsEnabled = Boolean(
    env?.ENABLE_EDGE_SOCKETS === true ||
    env?.ENABLE_EDGE_SOCKETS === 'true' ||
    (typeof process !== 'undefined' && process.env?.ENABLE_EDGE_SOCKETS === 'true')
  );

  if (edgeSocketsEnabled && typeof env?.sendEdgeEmail === 'function') {
    try {
      const edgeRes = await env.sendEdgeEmail({
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        from: options.from || `"${cfg.fromName}" <${cfg.fromEmail}>`,
      }, env);
      if (edgeRes?.success) {
        await logDispatch('sent', edgeRes.messageId);
        return edgeRes;
      }
      console.warn('[Email Service] Edge socket delivery failed:', edgeRes?.error);
    } catch (edgeErr: any) {
      console.warn('[Email Service] Edge socket delivery exception:', edgeErr?.message || edgeErr);
    }
  }

  // 3. Fallback to simulation if no password configured
  if (!cfg.pass) {
    const simulatedId = 'simulated_' + Math.random().toString(36).substring(2, 9);
    console.warn(`[Email Service] SMTP password not configured. Simulated dispatch to ${options.to}: "${options.subject}"`);
    await logDispatch('simulated', simulatedId);
    return {
      success: true,
      messageId: simulatedId,
    };
  }

  // 4. Native Node.js SMTP Delivery via nodemailer
  try {
    const transporter = getMailTransporter(cfg);
    if (!transporter) {
      const failMsg = isCloudflareWorkers 
        ? 'SMTP delivery unavailable on Edge runtime without configured email relay' 
        : 'Failed to initialize mail transporter';
      await logDispatch('failed', undefined, failMsg);
      return {
        success: false,
        error: failMsg,
      };
    }

    const fromHeader = options.from || `"${cfg.fromName}" <${cfg.fromEmail}>`;
    const textContent = options.text || options.html.replace(/<[^>]+>/g, ' ').trim();

    const info = await transporter.sendMail({
      from: fromHeader,
      to: options.to,
      subject: options.subject,
      text: textContent,
      html: options.html,
      replyTo: options.replyTo,
    });

    await logDispatch('sent', info.messageId);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error(`[Email Service] Failed to send email to ${options.to}:`, err.message || err);
    await logDispatch('failed', undefined, err.message || 'SMTP delivery failed');
    return {
      success: false,
      error: err.message || 'SMTP delivery failed',
    };
  }
}

/**
 * Standard branded HTML email template generator
 */
export function renderEmailTemplate({
  headline,
  intro,
  mainContent,
  ctaText,
  ctaUrl,
  footerNote,
}: {
  headline: string;
  intro?: string;
  mainContent: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const appUrl = process.env.APP_URL || 'https://pantrypool.com';
  const actionButton = (ctaText && ctaUrl) ? `
    <div style="margin: 28px 0; text-align: center;">
      <a href="${ctaUrl}" style="background-color: #E8694A; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 9999px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(232, 105, 74, 0.2);">
        ${ctaText}
      </a>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8F6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D2D2D;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8F6F0; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border: 1px solid #E0DAD1; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px 16px 32px; border-bottom: 1px solid #EDE8E0; background-color: #FAFAF8;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <a href="${appUrl}" style="text-decoration: none; display: inline-block;">
                      <img src="${appUrl}/logo-badge.png" width="32" height="32" alt="PantryPool" style="display: block; width: 32px; height: 32px; border-radius: 8px; border: 0;" />
                    </a>
                  </td>
                  <td style="vertical-align: middle; padding-left: 10px;">
                    <a href="${appUrl}" style="text-decoration: none; font-size: 19px; font-weight: 800; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1;">
                      <span style="color: #232323;">Pantry</span><span style="color: #D46238;">Pool</span>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="font-size: 20px; font-weight: 700; color: #2D2D2D; margin: 0 0 16px 0; line-height: 1.3;">
                ${headline}
              </h1>

              ${intro ? `<p style="font-size: 14px; color: #6B6B6B; line-height: 1.6; margin: 0 0 20px 0;">${intro}</p>` : ''}

              <div style="font-size: 14px; color: #2D2D2D; line-height: 1.6;">
                ${mainContent}
              </div>

              ${actionButton}

              ${footerNote ? `
                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #EDE8E0; font-size: 12px; color: #9A9A9A; line-height: 1.5;">
                  ${footerNote}
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #F0EBE3; border-top: 1px solid #E0DAD1; text-align: center; font-size: 11px; color: #6B6B6B;">
              <p style="margin: 0 0 6px 0;">
                Sent from <a href="${appUrl}" style="color: #E8694A; text-decoration: none; font-weight: 500;">PantryPool</a> — Smart communal pantry ledger & tracking.
              </p>
              <p style="margin: 0; color: #9A9A9A;">
                If you did not request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
