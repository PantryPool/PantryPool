-- Migration 0001: Initial Core Schema for PantryPool

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  apple_id TEXT UNIQUE,
  system_role TEXT DEFAULT 'user',
  token_version INTEGER DEFAULT 1,
  venmo_handle TEXT,
  cashapp_handle TEXT,
  paypal_handle TEXT,
  zelle_identifier TEXT,
  apple_pay_handle TEXT,
  preferred_payment_method TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT DEFAULT 'free',
  ai_scan_monthly_quota INTEGER DEFAULT 10,
  ai_scan_count_current_period INTEGER DEFAULT 0,
  ai_quota_reset_date DATE,
  scim_enabled INTEGER DEFAULT 0,
  scim_api_token_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pools (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  currency TEXT DEFAULT '$',
  description TEXT,
  kiosk_pin TEXT DEFAULT '1234',
  qr_code_key TEXT,
  venmo_handle TEXT,
  cashapp_handle TEXT,
  paypal_handle TEXT,
  zelle_identifier TEXT,
  apple_pay_handle TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pool_members (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  balance REAL DEFAULT 0.00,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(pool_id, user_id),
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  cost_per_unit REAL NOT NULL DEFAULT 0.00,
  cost_per_unit_cents INTEGER NOT NULL DEFAULT 0,
  unit_name TEXT DEFAULT 'unit',
  image_url TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT,
  item_name TEXT,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  estimated_cost REAL DEFAULT 0.00,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  title TEXT NOT NULL,
  options_json TEXT NOT NULL,
  created_by TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'in_app',
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  low_stock_email INTEGER DEFAULT 1,
  low_stock_sms INTEGER DEFAULT 0,
  weekly_digest_email INTEGER DEFAULT 1,
  phone_number TEXT DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pool_webhooks (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  channel_name TEXT DEFAULT '',
  enabled_events TEXT DEFAULT 'low_stock,restock',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sso_configurations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  idp_entity_id TEXT,
  sso_url TEXT NOT NULL,
  certificate TEXT,
  protocol TEXT DEFAULT 'saml2',
  client_id TEXT,
  client_secret TEXT,
  jit_provisioning INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edge_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cached_barcodes (
  barcode TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT DEFAULT 'Snacks',
  image_url TEXT,
  serving_size TEXT,
  metadata_json TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);
