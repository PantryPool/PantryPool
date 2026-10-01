-- Cloudflare D1 Database Schema for PantryPool

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
  is_archived INTEGER DEFAULT 0,
  archived_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  invite_code TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT DEFAULT 'free',
  ai_scan_monthly_quota INTEGER DEFAULT 10,
  ai_scan_count_current_period INTEGER DEFAULT 0,
  ai_quota_reset_date DATE,
  scim_enabled INTEGER DEFAULT 0,
  scim_api_token_hash TEXT,
  is_archived INTEGER DEFAULT 0,
  archived_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  invited_by TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pools (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  currency TEXT DEFAULT '$',
  description TEXT,
  kiosk_pin TEXT,
  qr_code_key TEXT,
  venmo_handle TEXT,
  cashapp_handle TEXT,
  paypal_handle TEXT,
  zelle_identifier TEXT,
  apple_pay_handle TEXT,
  champion_id TEXT,
  initial_reserve_fund REAL DEFAULT 0.00,
  initial_reserve_fund_cents INTEGER NOT NULL DEFAULT 0,
  max_deficit REAL DEFAULT 10.00,
  max_deficit_cents INTEGER NOT NULL DEFAULT 1000,
  savings_enabled INTEGER NOT NULL DEFAULT 1,
  savings_leaderboard_opt_in INTEGER NOT NULL DEFAULT 0,
  leaderboard_alias TEXT,
  metro_tier TEXT NOT NULL DEFAULT 'standard',
  is_archived INTEGER NOT NULL DEFAULT 0,
  archived_at DATETIME,
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
  vending_benchmark_cents INTEGER NOT NULL DEFAULT 0,
  unit_name TEXT DEFAULT 'unit',
  icon TEXT DEFAULT 'package',
  image_url TEXT,
  description TEXT,
  barcode TEXT,
  last_restocked_at DATETIME,
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
  savings_cents INTEGER NOT NULL DEFAULT 0,
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
  suggested_by TEXT DEFAULT 'Member',
  purchased INTEGER DEFAULT 0,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL,
  title TEXT NOT NULL,
  options TEXT,
  options_json TEXT NOT NULL,
  votes TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  active INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  allow_write_in INTEGER DEFAULT 1,
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
  low_stock_in_app INTEGER DEFAULT 1,
  weekly_digest_email INTEGER DEFAULT 1,
  weekly_digest_in_app INTEGER DEFAULT 1,
  deposit_in_app INTEGER DEFAULT 1,
  phone_number TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

-- Default System Settings
INSERT INTO system_settings (setting_key, setting_value) VALUES
('registration_enabled', 'true'),
('maintenance_mode', 'false'),
('apple_login_enabled', 'false'),
('kiosk_mode_enabled', 'true'),
('system_notice', 'Welcome to PantryPool Platform!')
ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value;

-- Edge Rate Limiting Cache
CREATE TABLE IF NOT EXISTS edge_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  reset_at INTEGER NOT NULL
);

-- Global Barcode Cache
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

-- Operational & Product Health Telemetry Events
CREATE TABLE IF NOT EXISTS telemetry_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  category TEXT NOT NULL,
  session_id TEXT,
  user_id TEXT,
  pool_id TEXT,
  properties_json TEXT,
  path TEXT,
  client_timestamp TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Affiliate Products & Breakroom Supplies (Amazon Associates)
CREATE TABLE IF NOT EXISTS affiliate_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Pantry & Fridge Organizers',
  image_url TEXT,
  affiliate_url TEXT NOT NULL,
  badge TEXT DEFAULT 'Staff Pick',
  price_estimate REAL DEFAULT 0.00,
  click_count INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Affiliate Click Logs
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  user_id TEXT,
  source TEXT DEFAULT 'marketing',
  referrer TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES affiliate_products(id) ON DELETE CASCADE
);

-- AI Usage Logs Table
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_email TEXT,
  pool_id TEXT,
  model TEXT NOT NULL,
  activity TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost_usd REAL DEFAULT 0.0,
  status TEXT DEFAULT 'success',
  parsed_items_json TEXT,
  applied_items_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Affiliate Images Table
CREATE TABLE IF NOT EXISTS affiliate_images (
  id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Profile Avatar Images Table
CREATE TABLE IF NOT EXISTS user_avatars (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Passkey Credentials Table
CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Email Delivery & Outbound Notification Logs Table
CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  error_message TEXT,
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_pool_members_user ON pool_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pool_members_pool ON pool_members(pool_id);
CREATE INDEX IF NOT EXISTS idx_items_pool ON items(pool_id);
CREATE INDEX IF NOT EXISTS idx_transactions_pool ON transactions(pool_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_reset ON edge_rate_limits(reset_at);
CREATE INDEX IF NOT EXISTS idx_cached_barcodes_expires ON cached_barcodes(expires_at);
CREATE INDEX IF NOT EXISTS idx_pools_org ON pools(organization_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_name ON telemetry_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_category ON telemetry_events(category, created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_events(session_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_products_active ON affiliate_products(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_product ON affiliate_clicks(product_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_source ON affiliate_clicks(source);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created ON affiliate_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON passkey_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_users_archived ON users(is_archived);
CREATE INDEX IF NOT EXISTS idx_organizations_archived ON organizations(is_archived);
CREATE INDEX IF NOT EXISTS idx_pools_archived ON pools(is_archived);


