export interface D1Result<T = any> {
  results?: T[];
  success: boolean;
  meta: any;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  all<T = any>(): Promise<D1Result<T>>;
  first<T = any>(column?: string): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch?(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Env {
  pantrypool_db: D1Database;
  JWT_SECRET?: string;
  GEMINI_API_KEY?: string;
  GEMINI_OCR_MODEL?: string;
  GCP_SERVICE_ACCOUNT_KEY?: string;
  GCP_CLIENT_EMAIL?: string;
  GCP_PRIVATE_KEY?: string;
  GCP_PROJECT_ID?: string;
  GCP_LOCATION?: string;
  GOOGLE_CLOUD_PROJECT?: string;
  GOOGLE_CLOUD_LOCATION?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  SLACK_SIGNING_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  APPLE_CLIENT_ID?: string;
  INITIAL_ADMIN_EMAIL?: string;
  ENVIRONMENT?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string | number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM_EMAIL?: string;
  SMTP_FROM_NAME?: string;
  EMAIL_RELAY_URL?: string;
  EMAIL_RELAY_SECRET?: string;
  sendEdgeEmail?: (options: any, env: any) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  SRE_ALERT_WEBHOOK_URL?: string;
  ALERT_WEBHOOK_URL?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  systemRole?: 'superadmin' | 'admin' | 'user';
  tokenVersion?: number;
}

export interface RouteContext {
  request: Request;
  env: Env;
  url: URL;
  path: string;
  params: Record<string, string>;
}

export type RouteHandler = (ctx: RouteContext) => Promise<Response | null | void>;
