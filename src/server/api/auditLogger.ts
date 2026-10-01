import { Context } from 'hono';

export type SecurityAuditAction =
  | 'AUTH_FAILURE'
  | 'AUTH_SUCCESS'
  | 'ROLE_CHANGE'
  | 'LIMIT_OVERRIDE'
  | 'DISCREPANCY_CALIBRATION'
  | 'ACCESS_DENIED';

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  actorId?: string;
  action: SecurityAuditAction;
  targetResource: string;
  ipAddress: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILURE';
  metadata?: Record<string, any>;
}

const AUDIT_EVENT_BUFFER: SecurityAuditEvent[] = [];
const MAX_AUDIT_BUFFER_SIZE = 500;

export function getSecurityAuditEvents(): SecurityAuditEvent[] {
  return [...AUDIT_EVENT_BUFFER];
}

export function clearSecurityAuditEventsForTesting(): void {
  AUDIT_EVENT_BUFFER.length = 0;
}

/**
 * Logs a high-integrity security audit event with correlation metadata.
 * SEC-A09-01: Centralized Security Audit Logging.
 */
export function logSecurityEvent(
  c: Context,
  params: Omit<SecurityAuditEvent, 'id' | 'timestamp' | 'ipAddress' | 'userAgent'> &
    Partial<Pick<SecurityAuditEvent, 'ipAddress' | 'userAgent'>>
): SecurityAuditEvent {
  const ipHeader = params.ipAddress ||
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for') ||
    '127.0.0.1';
  const ip = ipHeader.split(',')[0].trim();
  const userAgent = params.userAgent || c.req.header('user-agent') || 'Unknown User-Agent';

  const user = c.get('user');
  const actorId = params.actorId || user?.userId || 'anonymous';

  const event: SecurityAuditEvent = {
    id: 'audit_' + crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actorId,
    action: params.action,
    targetResource: params.targetResource,
    ipAddress: ip,
    userAgent,
    status: params.status,
    metadata: params.metadata || {}
  };

  // Buffer recent events
  AUDIT_EVENT_BUFFER.push(event);
  if (AUDIT_EVENT_BUFFER.length > MAX_AUDIT_BUFFER_SIZE) {
    AUDIT_EVENT_BUFFER.shift();
  }

  // Structured stdout log for ingestion by SIEM/Datadog/CloudWatch
  console.info('[SECURITY_AUDIT]', JSON.stringify(event));

  return event;
}
