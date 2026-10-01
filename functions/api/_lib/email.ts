/**
 * 📧 PantryPool Cloudflare Edge SMTP Delivery Engine
 *
 * Implements SMTPS (SSL/TLS port 465) directly on Cloudflare Workers / Pages Functions
 * using the Cloudflare `cloudflare:sockets` TCP socket API.
 */

import { Env } from '../_types';
import { connect } from 'cloudflare:sockets';

export interface EdgeEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

class SmtpSession {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer: string = '';
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  constructor(private socket: any) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  async readResponse(): Promise<{ code: number; lines: string[] }> {
    const lines: string[] = [];
    while (true) {
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        const rawLine = this.buffer.substring(0, newlineIndex);
        this.buffer = this.buffer.substring(newlineIndex + 1);
        const line = rawLine.replace(/\r$/, '');
        lines.push(line);

        // Completion indicator: 3 digits followed by space (e.g. "250 ")
        if (/^\d{3} /.test(line)) {
          const code = parseInt(line.substring(0, 3), 10);
          return { code, lines };
        }
      } else {
        const { value, done } = await this.reader.read();
        if (done) {
          if (this.buffer.trim().length > 0) {
            lines.push(this.buffer.trim());
          }
          const code = lines.length > 0 ? parseInt(lines[lines.length - 1].substring(0, 3), 10) : 0;
          return { code, lines };
        }
        this.buffer += this.decoder.decode(value, { stream: true });
      }
    }
  }

  async sendCommand(cmd: string): Promise<{ code: number; lines: string[] }> {
    await this.writer.write(this.encoder.encode(cmd + '\r\n'));
    return await this.readResponse();
  }

  async close(): Promise<void> {
    try { this.reader.releaseLock(); } catch (e) {}
    try { this.writer.releaseLock(); } catch (e) {}
    try { await this.socket.close(); } catch (e) {}
  }
}

/**
 * Dispatch an email directly from Cloudflare Edge over TLS 465
 */
export async function sendEdgeEmail(
  options: EdgeEmailOptions,
  env: Env
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const host = env.SMTP_HOST || '';
  const port = parseInt(String(env.SMTP_PORT || '465'), 10);
  const user = env.SMTP_USER || '';
  const pass = env.SMTP_PASS || '';
  const fromEmail = env.SMTP_FROM_EMAIL || user || 'noreply@pantrypool.com';
  const fromName = env.SMTP_FROM_NAME || 'PantryPool';

  // 1. If an HTTP email relay is configured (e.g. Node.js on cPanel/Phusion Passenger),
  // route through HTTP relay to bypass datacenter IP firewall restrictions on port 465
  const relayUrl = env.EMAIL_RELAY_URL || undefined;
  const relaySecret = env.EMAIL_RELAY_SECRET;

  if (relayUrl && relaySecret) {
    try {
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
          from: options.from,
        }),
      });

      const data: any = await resp.json().catch(() => ({}));
      if (resp.ok && data?.success) {
        return {
          success: true,
          messageId: data.messageId || 'relay_' + crypto.randomUUID(),
        };
      }
      console.warn(`[Edge Email] Relay returned error (${resp.status}):`, data?.error || 'Unknown error');
    } catch (relayErr: any) {
      console.warn('[Edge Email] Relay connection failed, attempting direct SMTPS socket fallback:', relayErr?.message || relayErr);
    }
  }

  if (!pass) {
    console.warn(`[Edge Email] SMTP_PASS not set and no relay succeeded. Simulated dispatch to ${options.to}`);
    return {
      success: true,
      messageId: 'simulated_edge_' + crypto.randomUUID(),
    };
  }

  let session: SmtpSession | null = null;
  try {
    const socket = connect(
      { hostname: host, port },
      { secureTransport: port === 465 ? 'on' : 'off', allowHalfOpen: false }
    );

    session = new SmtpSession(socket);

    // 1. Initial 220 Greeting
    const greeting = await session.readResponse();
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting failed: ${greeting.lines.join(' ')}`);
    }

    // 2. EHLO
    const ehlo = await session.sendCommand('EHLO pantrypool.com');
    if (ehlo.code !== 250) {
      throw new Error(`EHLO failed: ${ehlo.lines.join(' ')}`);
    }

    // 3. AUTH LOGIN
    const authReq = await session.sendCommand('AUTH LOGIN');
    if (authReq.code !== 334) {
      throw new Error(`AUTH LOGIN rejected: ${authReq.lines.join(' ')}`);
    }

    // 4. Send Base64 Username
    const userRes = await session.sendCommand(toBase64Utf8(user));
    if (userRes.code !== 334) {
      throw new Error(`Username rejected: ${userRes.lines.join(' ')}`);
    }

    // 5. Send Base64 Password
    const passRes = await session.sendCommand(toBase64Utf8(pass));
    if (passRes.code !== 235) {
      throw new Error(`Authentication failed: ${passRes.lines.join(' ')}`);
    }

    // 6. MAIL FROM
    const mailFrom = await session.sendCommand(`MAIL FROM:<${fromEmail}>`);
    if (mailFrom.code !== 250) {
      throw new Error(`MAIL FROM rejected: ${mailFrom.lines.join(' ')}`);
    }

    // 7. RCPT TO
    const rcptTo = await session.sendCommand(`RCPT TO:<${options.to}>`);
    if (rcptTo.code !== 250 && rcptTo.code !== 251) {
      throw new Error(`RCPT TO rejected: ${rcptTo.lines.join(' ')}`);
    }

    // 8. DATA
    const dataInit = await session.sendCommand('DATA');
    if (dataInit.code !== 354) {
      throw new Error(`DATA initiation rejected: ${dataInit.lines.join(' ')}`);
    }

    // 9. Send MIME Payload (RFC 2045 / RFC 5321 compliant with 76-char line length limits)
    const messageId = `<${crypto.randomUUID()}@pantrypool.com>`;
    const encodedSubject = encodeSubjectHeader(options.subject);
    const encodedBody = wrapBase64(toBase64Utf8(options.html));

    const mimeMessage = [
      `From: "${fromName}" <${fromEmail}>`,
      `To: <${options.to}>`,
      `Subject: ${encodedSubject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      encodedBody,
      '.'
    ].join('\r\n');

    const dataRes = await session.sendCommand(mimeMessage);
    if (dataRes.code !== 250) {
      throw new Error(`Message delivery rejected: ${dataRes.lines.join(' ')}`);
    }

    // 10. QUIT
    await session.sendCommand('QUIT').catch(() => {});
    await session.close();

    return { success: true, messageId };
  } catch (err: any) {
    if (session) {
      await session.close().catch(() => {});
    }
    console.error(`[Edge Email Error] Failed to send email to ${options.to}:`, err.message || err);
    return {
      success: false,
      error: err.message || 'Edge SMTP delivery failed',
    };
  }
}

/**
 * Standard branded HTML email template for Cloudflare Edge
 */
export function renderEdgeEmailTemplate({
  headline,
  intro,
  mainContent,
  ctaText,
  ctaUrl,
  footerNote,
  appUrl = 'https://pantrypool.com',
}: {
  headline: string;
  intro?: string;
  mainContent: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
  appUrl?: string;
}): string {
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
