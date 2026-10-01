import { D1Database, Env } from '../_types';
import { hashPassword } from './crypto';

export async function insertTransactionSafe(
  db: D1Database,
  id: string,
  poolId: string,
  userId: string,
  itemId: string | null,
  itemName: string,
  type: string,
  amount: number,
  quantity: number = 1,
  description: string = '',
  amountCents?: number
) {
  const cents = amountCents !== undefined ? amountCents : Math.round(amount * 100);
  try {
    await db.prepare(
      `INSERT INTO transactions (id, pool_id, user_id, item_id, item_name, type, amount, amount_cents, quantity, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, poolId, userId, itemId, itemName, type, amount, cents, quantity, description).run();
  } catch (e: any) {
    try {
      await db.prepare(
        `INSERT INTO transactions (id, pool_id, user_id, item_id, item_name, type, amount, quantity, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(id, poolId, userId, itemId, itemName, type, amount, quantity, description).run();
    } catch (e2: any) {
      await db.prepare(
        `INSERT INTO transactions (id, pool_id, user_id, item_id, type, amount, quantity, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(id, poolId, userId, itemId, type, amount, quantity, description).run();
    }
  }
}

let d1SchemaInitialized = false;

export async function ensureD1Schema(db: D1Database, env: Env) {
  if (d1SchemaInitialized) return;
  try {
    await db.prepare(`
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
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        invite_code TEXT,
        tier TEXT DEFAULT 'starter',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    try {
      await db.prepare("ALTER TABLE organizations ADD COLUMN invite_code TEXT").run();
    } catch {}

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS organization_members (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        invited_by TEXT,
        joined_at TEXT DEFAULT (datetime('now')),
        UNIQUE(organization_id, user_id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pools (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        currency TEXT DEFAULT '$',
        qr_code_key TEXT,
        description TEXT,
        kiosk_pin TEXT,
        initial_reserve_fund REAL DEFAULT 0.00,
        initial_reserve_fund_cents INTEGER DEFAULT 0,
        champion_id TEXT,
        max_deficit REAL DEFAULT 10.00,
        max_deficit_cents INTEGER DEFAULT 1000,
        savings_enabled INTEGER DEFAULT 1,
        savings_leaderboard_opt_in INTEGER DEFAULT 0,
        leaderboard_alias TEXT,
        metro_tier TEXT DEFAULT 'standard',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `).run();

    // Migrate pools table columns if missing in legacy databases
    try {
      await db.prepare("ALTER TABLE pools ADD COLUMN champion_id TEXT").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE pools ADD COLUMN max_deficit REAL DEFAULT 10.00").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE pools ADD COLUMN max_deficit_cents INTEGER DEFAULT 1000").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE pools ADD COLUMN initial_reserve_fund REAL DEFAULT 0.00").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE pools ADD COLUMN initial_reserve_fund_cents INTEGER DEFAULT 0").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE pools ADD COLUMN savings_enabled INTEGER DEFAULT 1").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE pools ADD COLUMN savings_leaderboard_opt_in INTEGER DEFAULT 0").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE pools ADD COLUMN leaderboard_alias TEXT").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE pools ADD COLUMN metro_tier TEXT DEFAULT 'standard'").run();
    } catch {}

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pool_members (
        id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        balance REAL DEFAULT 0.00,
        balance_cents INTEGER DEFAULT 0,
        joined_at TEXT DEFAULT (datetime('now')),
        UNIQUE(pool_id, user_id),
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    try {
      await db.prepare("ALTER TABLE pool_members ADD COLUMN balance_cents INTEGER DEFAULT 0").run();
    } catch {}

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        min_stock INTEGER NOT NULL DEFAULT 5,
        cost_per_unit REAL NOT NULL DEFAULT 0.00,
        cost_per_unit_cents INTEGER DEFAULT 0,
        vending_benchmark_cents INTEGER DEFAULT 0,
        unit_name TEXT DEFAULT 'unit',
        icon TEXT DEFAULT 'package',
        image_url TEXT,
        description TEXT,
        barcode TEXT,
        last_restocked_at TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
      )
    `).run();

    try {
      await db.prepare("ALTER TABLE items ADD COLUMN cost_per_unit_cents INTEGER DEFAULT 0").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE items ADD COLUMN vending_benchmark_cents INTEGER DEFAULT 0").run();
    } catch {}

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        item_id TEXT,
        item_name TEXT,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        amount_cents INTEGER DEFAULT 0,
        savings_cents INTEGER DEFAULT 0,
        quantity INTEGER DEFAULT 1,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    try {
      await db.prepare("ALTER TABLE transactions ADD COLUMN amount_cents INTEGER DEFAULT 0").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE transactions ADD COLUMN savings_cents INTEGER DEFAULT 0").run();
    } catch {}

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS shopping_items (
        id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        estimated_cost REAL DEFAULT 0.00,
        estimated_cost_cents INTEGER DEFAULT 0,
        suggested_by TEXT NOT NULL,
        purchased INTEGER DEFAULT 0,
        reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
      )
    `).run();

    try {
      await db.prepare("ALTER TABLE shopping_items ADD COLUMN estimated_cost_cents INTEGER DEFAULT 0").run();
    } catch {}

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        title TEXT NOT NULL,
        options TEXT,
        options_json TEXT,
        votes TEXT NOT NULL DEFAULT '{}',
        created_by TEXT,
        active INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        allow_write_in INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
      )
    `).run();

    // Migrate legacy polls schema columns safely if present
    try {
      await db.prepare("ALTER TABLE polls DROP COLUMN item_name").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE polls DROP COLUMN category").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE polls DROP COLUMN requested_by").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE polls ADD COLUMN options_json TEXT").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE polls ADD COLUMN options TEXT").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE polls ADD COLUMN status TEXT DEFAULT 'active'").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE polls ADD COLUMN active INTEGER DEFAULT 1").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE polls ADD COLUMN allow_write_in INTEGER DEFAULT 1").run();
    } catch {}

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        pool_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id TEXT PRIMARY KEY,
        low_stock_email INTEGER DEFAULT 1,
        low_stock_in_app INTEGER DEFAULT 1,
        weekly_digest_email INTEGER DEFAULT 1,
        weekly_digest_in_app INTEGER DEFAULT 1,
        deposit_in_app INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS pool_webhooks (
        id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        webhook_url TEXT NOT NULL,
        channel_name TEXT,
        enabled_events TEXT DEFAULT 'low_stock,restock',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
      )
    `).run();

    await db.prepare(`
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
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS cached_barcodes (
        barcode TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        brand TEXT,
        image_url TEXT,
        source TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    await db.prepare(`
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
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    // Migrate existing ai_usage_logs table if columns don't exist yet
    try {
      await db.prepare("ALTER TABLE ai_usage_logs ADD COLUMN parsed_items_json TEXT").run();
    } catch {}
    try {
      await db.prepare("ALTER TABLE ai_usage_logs ADD COLUMN applied_items_json TEXT").run();
    } catch {}

    // Telemetry Events Table
    await db.prepare(`
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
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    try {
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_telemetry_event_name ON telemetry_events(event_name, created_at)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_telemetry_category ON telemetry_events(category, created_at)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_events(session_id)").run();
    } catch {}

    // Password Reset Tokens Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    try {
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token_hash)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id)").run();
    } catch {}

    // Affiliate Products & Clicks (Amazon Associates)
    await db.prepare(`
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
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS affiliate_clicks (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        user_id TEXT,
        source TEXT DEFAULT 'marketing',
        referrer TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES affiliate_products(id) ON DELETE CASCADE
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS affiliate_images (
        id TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS user_avatars (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    try {
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_user_avatars_user ON user_avatars(user_id)").run();
    } catch {}


    try {
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_aff_prod_active ON affiliate_products(is_active, display_order)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_aff_clicks_prod ON affiliate_clicks(product_id)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_aff_clicks_src ON affiliate_clicks(source)").run();
    } catch {}

    // Passkey / WebAuthn Credentials Table
    await db.prepare(`
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
      )
    `).run();

    try {
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON passkey_credentials(user_id)").run();
    } catch {}

    // Email Delivery Logs Table (Outbound Tracking & Support Audit Trail)
    await db.prepare(`
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
      )
    `).run();

    try {
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at)").run();
    } catch {}

    // Seed default affiliate products if table is empty
    try {
      const existingProduct = await db.prepare("SELECT id FROM affiliate_products LIMIT 1").first();
      if (!existingProduct) {
        await db.prepare(`
          INSERT INTO affiliate_products (id, title, description, category, image_url, affiliate_url, badge, price_estimate, display_order, is_active)
          VALUES 
          (
            'aff_drink_glide_15',
            'Drink Organizer for Fridge with Spring Pusher Glide (15 Cans)',
            'Spring-loaded glide dispenser that automatically pushes cans forward as drinks are grabbed. Adjustable width fits standard sodas, sparkling water, seltzers, and energy drink cans.',
            'Drink & Can Organizers',
            'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&w=800&q=80',
            'https://amzn.to/4xHZdHR',
            'Breakroom Essential',
            24.99,
            1,
            1
          ),
          (
            'aff_clear_bins_6pack',
            'Clear Stackable Pantry & Fridge Storage Bins with Handles (6-Pack)',
            'Durable shatterproof transparent organizer bins to group snack bars, chip bags, tea bags, and condiment packs for instant inventory visibility.',
            'Storage Bins & Baskets',
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
            'https://amzn.to/4xHZdHR',
            'Staff Pick',
            29.99,
            2,
            1
          ),
          (
            'aff_3tier_bamboo_rack',
            '3-Tier Expandable Bamboo Shelf & Snack Riser',
            'Tiered counter and cabinet organizer rack that elevates snacks and drink syrups for effortless grab-and-go visibility in shared kitchenettes.',
            'Racks & Shelving',
            'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=800&q=80',
            'https://amzn.to/4xHZdHR',
            'Top Rated',
            19.99,
            3,
            1
          )
        `).run();
      }
    } catch {}

    // Default system settings
    await db.prepare(`
      INSERT OR IGNORE INTO system_settings (setting_key, setting_value)
      VALUES ('registration_enabled', 'true'),
             ('maintenance_mode', 'false'),
             ('apple_login_enabled', 'false'),
             ('kiosk_mode_enabled', 'true'),
             ('system_notice', 'Welcome to PantryPool Platform!')
    `).run();

    // Seed default admin ONLY on initial setup when INITIAL_ADMIN_EMAIL is configured and NO superadmin exists in the database
    const adminSeedRecord: any = await db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_seeded'").first().catch(() => null);
    const superadminUser: any = await db.prepare("SELECT id FROM users WHERE system_role = 'superadmin' LIMIT 1").first().catch(() => null);

    if (!adminSeedRecord && !superadminUser) {
      const adminEmail = (env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
      if (adminEmail) {
        const existingAdmin = await db.prepare("SELECT id FROM users WHERE email = ?").bind(adminEmail).first().catch(() => null);
        if (!existingAdmin) {
          const adminId = 'u_admin_init';
          const defaultPass = (env as any).INITIAL_ADMIN_PASSWORD || crypto.randomUUID();
          const hash = await hashPassword(defaultPass);
          await db.prepare(`
            INSERT INTO users (id, email, name, password_hash, system_role)
            VALUES (?, ?, 'Platform Superadmin', ?, 'superadmin')
          `).bind(adminId, adminEmail, hash).run();
        }
      }
      await db.prepare("INSERT OR REPLACE INTO system_settings (setting_key, setting_value) VALUES ('admin_seeded', 'true')").run().catch(() => {});
    }
    d1SchemaInitialized = true;
  } catch (e: any) {
    // Ignore schema init errors safely
  }
}
