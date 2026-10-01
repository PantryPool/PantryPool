import { Context } from 'hono';

export interface SreAlertPayload {
  level?: 'critical' | 'warning' | 'info';
  source?: string;
  error?: Error | string | any;
  context?: Record<string, any>;
  route?: string;
  method?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Non-blocking edge dispatcher for critical runtime errors and anomalies.
 * Transmits structured real-time alerts to Telegram and SRE Webhooks directly from the Edge runtime.
 */
export function dispatchEdgeErrorAlert(c: Context<any>, payload: SreAlertPayload): void {
  const env = c.env as any;
  const telegramBotToken = env?.TELEGRAM_BOT_TOKEN || (typeof process !== 'undefined' ? process.env?.TELEGRAM_BOT_TOKEN : undefined);
  const telegramChatId = env?.TELEGRAM_CHAT_ID || (typeof process !== 'undefined' ? process.env?.TELEGRAM_CHAT_ID : undefined);
  const webhookUrl = env?.SRE_ALERT_WEBHOOK_URL || 
                     env?.ALERT_WEBHOOK_URL || 
                     (typeof process !== 'undefined' ? (process.env?.SRE_ALERT_WEBHOOK_URL || process.env?.ALERT_WEBHOOK_URL) : undefined);

  if (!telegramBotToken && !webhookUrl) {
    return;
  }

  const promise = (async () => {
    try {
      const timestamp = new Date().toISOString();
      const method = payload.method || c.req?.method || 'UNKNOWN';
      const route = payload.route || (c.req?.url ? new URL(c.req.url).pathname : 'UNKNOWN');
      const err = payload.error;
      const errorMessage = typeof err === 'string' 
        ? err 
        : (err?.message || (err ? String(err) : 'Unknown exception'));
      
      const stack = (typeof err === 'object' && err?.stack) 
        ? String(err.stack).split('\n').slice(0, 6).join('\n') 
        : '';
      const level = payload.level || 'critical';
      const icon = level === 'critical' ? '🔴' : (level === 'warning' ? '⚠️' : 'ℹ️');

      const tasks: Promise<any>[] = [];

      // 1. Dispatch to Telegram (HTML mode for parse safety)
      if (telegramBotToken && telegramChatId) {
        const htmlParts = [
          `<b>${icon} [PantryPool Edge SRE Alert]</b>`,
          `<b>Level:</b> ${escapeHtml(level.toUpperCase())}`,
          `<b>Route:</b> <code>${escapeHtml(method)} ${escapeHtml(route)}</code>`,
          `<b>Timestamp:</b> <code>${escapeHtml(timestamp)}</code>`,
          `<b>Error:</b> <code>${escapeHtml(errorMessage)}</code>`,
        ];

        if (payload.source) {
          htmlParts.push(`<b>Source:</b> <code>${escapeHtml(payload.source)}</code>`);
        }

        if (payload.context && Object.keys(payload.context).length > 0) {
          try {
            const contextStr = JSON.stringify(payload.context);
            htmlParts.push(`<b>Context:</b> <code>${escapeHtml(contextStr.substring(0, 300))}</code>`);
          } catch {
            // ignore context serialization error
          }
        }

        if (stack) {
          htmlParts.push(`<b>Stack Trace:</b>\n<pre>${escapeHtml(stack)}</pre>`);
        }

        const telegramPayload = {
          chat_id: telegramChatId,
          text: htmlParts.join('\n'),
          parse_mode: 'HTML',
          disable_web_page_preview: true
        };

        tasks.push(
          fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(telegramPayload)
          }).catch(err => {
            console.warn('[SRE Telegram Alert Warning]', err?.message || err);
          })
        );
      }

      // 2. Dispatch to SRE Webhook (Slack / Discord / Teams)
      if (webhookUrl) {
        const webhookPayload = {
          text: `${icon} [PantryPool Edge SRE] ${level.toUpperCase()}: ${method} ${route} - ${errorMessage}`,
          attachments: [
            {
              color: level === 'critical' ? '#e53e3e' : '#dd6b20',
              title: `${method} ${route}`,
              text: `${errorMessage}\n${stack ? `\`\`\`\n${stack}\n\`\`\`` : ''}`,
              ts: Math.floor(Date.now() / 1000)
            }
          ]
        };

        tasks.push(
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
          }).catch(err => {
            console.warn('[SRE Webhook Alert Warning]', err?.message || err);
          })
        );
      }

      await Promise.allSettled(tasks);
    } catch (e) {
      console.warn('[SRE Alert Dispatch Failure]', e);
    }
  })();

  // In Cloudflare Workers / Pages Functions, safely use executionCtx.waitUntil to avoid terminating early
  try {
    const ec = c.executionCtx;
    if (ec && typeof ec.waitUntil === 'function') {
      ec.waitUntil(promise);
      return;
    }
  } catch {
    // No execution context present (e.g. Node.js or test runner)
  }

  promise.catch(() => {});
}
