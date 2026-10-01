import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function getPoolConfig(): mysql.PoolOptions {
  dotenv.config({ path: path.join(process.cwd(), '.env'), override: false });

  let host = process.env.DB_HOST || 'localhost';
  let port = Number(process.env.DB_PORT) || 3306;
  let user = process.env.DB_USER || 'pantry_user';
  let password = process.env.DB_PASS || '';
  let database = process.env.DB_NAME || 'pantrypool';

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const match = dbUrl.match(/^mysql:\/\/(.*?):(.*?)@([^:\/]+)(?::(\d+))?\/(.+)$/);
    if (match) {
      user = decodeURIComponent(match[1]) || user;
      password = decodeURIComponent(match[2]) || password;
      host = match[3] || host;
      port = Number(match[4]) || port;
      database = match[5] || database;
    }
  }

  // Environment variables override defaults
  if (process.env.DB_HOST) host = process.env.DB_HOST;
  if (process.env.DB_PORT) port = Number(process.env.DB_PORT);
  if (process.env.DB_USER) user = process.env.DB_USER;
  if (process.env.DB_PASS) password = process.env.DB_PASS;
  if (process.env.DB_NAME) database = process.env.DB_NAME;

  return {
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}

let activeConfig = getPoolConfig();
let activePoolInstance = mysql.createPool(activeConfig);
export { activePoolInstance as dbPool };

export function getDbConfigInfo() {
  const passStr = String(activeConfig.password || '');
  return {
    host: activeConfig.host,
    user: activeConfig.user,
    database: activeConfig.database,
    hasPassword: passStr.length > 0,
    hasEnvUrl: !!process.env.DATABASE_URL,
    hasDbPassEnv: !!process.env.DB_PASS,
  };
}

export function reconnectDbPool(customConfig?: mysql.PoolOptions) {
  try {
    activePoolInstance.end();
  } catch (e) {}

  activeConfig = customConfig || getPoolConfig();
  activePoolInstance = mysql.createPool(activeConfig);
  return getDbConfigInfo();
}

export function getPool(): mysql.Pool {
  return activePoolInstance;
}

// SQL Query helper
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await activePoolInstance.execute(sql, params);
  return rows as T[];
}

// SQL Execute helper
export async function execute(sql: string, params: any[] = []): Promise<mysql.ResultSetHeader> {
  const [result] = await activePoolInstance.execute(sql, params);
  return result as mysql.ResultSetHeader;
}

// Database Initialization & Migration Pipeline
export async function initDatabase(): Promise<void> {
  console.log(`[DB] Initializing MySQL Schema on ${activeConfig.host}/${activeConfig.database} as ${activeConfig.user}...`);

  try {
    // 1. Users Table
    await execute(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(512),
        password_hash VARCHAR(255),
        google_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Organizations Table
    await execute(`
      CREATE TABLE IF NOT EXISTS organizations (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        owner_id VARCHAR(64) NOT NULL,
        tier VARCHAR(32) DEFAULT 'starter',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Pools Table
    await execute(`
      CREATE TABLE IF NOT EXISTS pools (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64),
        name VARCHAR(255) NOT NULL,
        category VARCHAR(64) NOT NULL,
        currency VARCHAR(8) DEFAULT '$',
        qr_code_key VARCHAR(128),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. Pool Members Table
    await execute(`
      CREATE TABLE IF NOT EXISTS pool_members (
        id VARCHAR(64) PRIMARY KEY,
        pool_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        role VARCHAR(32) DEFAULT 'member',
        balance DECIMAL(10, 2) DEFAULT 0.00,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_pool_user (pool_id, user_id),
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. Inventory Items Table
    await execute(`
      CREATE TABLE IF NOT EXISTS items (
        id VARCHAR(64) PRIMARY KEY,
        pool_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(64) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        min_stock INT NOT NULL DEFAULT 5,
        cost_per_unit DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        unit_name VARCHAR(64) DEFAULT 'unit',
        image_url VARCHAR(512),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 6. Transactions Table
    await execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(64) PRIMARY KEY,
        pool_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        item_id VARCHAR(64),
        item_name VARCHAR(255),
        type VARCHAR(32) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        quantity INT DEFAULT 1,
        description VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 7. Shopping List Items Table
    await execute(`
      CREATE TABLE IF NOT EXISTS shopping_items (
        id VARCHAR(64) PRIMARY KEY,
        pool_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(64) NOT NULL,
        quantity INT DEFAULT 1,
        status VARCHAR(32) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8. Polls Table
    await execute(`
      CREATE TABLE IF NOT EXISTS polls (
        id VARCHAR(64) PRIMARY KEY,
        pool_id VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        options_json JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 9. Notifications Table
    await execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        pool_id VARCHAR(64),
        type VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        channel VARCHAR(32) DEFAULT 'in_app',
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 10. Notification Preferences Table
    await execute(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id VARCHAR(64) PRIMARY KEY,
        low_stock_email BOOLEAN DEFAULT TRUE,
        low_stock_sms BOOLEAN DEFAULT FALSE,
        weekly_digest_email BOOLEAN DEFAULT TRUE,
        phone_number VARCHAR(32),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 11. Pool Webhooks Table (Slack & MS Teams)
    await execute(`
      CREATE TABLE IF NOT EXISTS pool_webhooks (
        id VARCHAR(64) PRIMARY KEY,
        pool_id VARCHAR(64) NOT NULL,
        platform VARCHAR(32) NOT NULL,
        webhook_url VARCHAR(1024) NOT NULL,
        channel_name VARCHAR(128),
        enabled_events VARCHAR(512) DEFAULT 'low_stock,restock',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 12. Corporate SSO Configurations Table
    await execute(`
      CREATE TABLE IF NOT EXISTS sso_configurations (
        id VARCHAR(64) PRIMARY KEY,
        organization_id VARCHAR(64) NOT NULL,
        domain VARCHAR(255) UNIQUE NOT NULL,
        idp_entity_id VARCHAR(512),
        sso_url VARCHAR(1024) NOT NULL,
        certificate TEXT,
        protocol VARCHAR(32) DEFAULT 'saml2',
        client_id VARCHAR(255),
        client_secret VARCHAR(255),
        jit_provisioning BOOLEAN DEFAULT TRUE,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // System Settings Table
    await execute(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // AI Usage Logs Table
    await execute(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64),
        user_email VARCHAR(255),
        pool_id VARCHAR(64),
        model VARCHAR(64) NOT NULL,
        activity VARCHAR(64) NOT NULL,
        prompt_tokens INT DEFAULT 0,
        completion_tokens INT DEFAULT 0,
        total_tokens INT DEFAULT 0,
        estimated_cost_usd DECIMAL(10, 6) DEFAULT 0.000000,
        status VARCHAR(32) DEFAULT 'success',
        parsed_items_json TEXT,
        applied_items_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Telemetry Events Table
    await execute(`
      CREATE TABLE IF NOT EXISTS telemetry_events (
        id VARCHAR(64) PRIMARY KEY,
        event_name VARCHAR(128) NOT NULL,
        category VARCHAR(64) NOT NULL,
        session_id VARCHAR(64),
        user_id VARCHAR(64),
        pool_id VARCHAR(64),
        properties_json TEXT,
        path VARCHAR(255),
        client_timestamp VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Password Reset Tokens Table
    await execute(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token_hash (token_hash),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Affiliate Products Table
    await execute(`
      CREATE TABLE IF NOT EXISTS affiliate_products (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(128) DEFAULT 'Pantry & Fridge Organizers',
        image_url TEXT,
        affiliate_url TEXT NOT NULL,
        badge VARCHAR(64) DEFAULT 'Staff Pick',
        price_estimate DECIMAL(10, 2) DEFAULT 0.00,
        click_count INT DEFAULT 0,
        display_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Affiliate Clicks Table
    await execute(`
      CREATE TABLE IF NOT EXISTS affiliate_clicks (
        id VARCHAR(64) PRIMARY KEY,
        product_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64),
        source VARCHAR(64) DEFAULT 'marketing',
        referrer TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES affiliate_products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Affiliate Images Table (Uploaded Product Photos)
    await execute(`
      CREATE TABLE IF NOT EXISTS affiliate_images (
        id VARCHAR(64) PRIMARY KEY,
        mime_type VARCHAR(64) NOT NULL,
        data LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // User Profile Avatar Images Table (Uploaded Profile Icons)
    await execute(`
      CREATE TABLE IF NOT EXISTS user_avatars (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        mime_type VARCHAR(64) NOT NULL,
        data LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_avatars_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);


    // Passkey / WebAuthn Credentials Table
    await execute(`
      CREATE TABLE IF NOT EXISTS passkey_credentials (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        public_key TEXT NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        device_type VARCHAR(32),
        backed_up TINYINT(1) NOT NULL DEFAULT 0,
        transports VARCHAR(255),
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP NULL,
        INDEX idx_passkey_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Email Delivery Logs Table (Outbound Tracking & Support Audit Trail)
    await execute(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64),
        recipient_email VARCHAR(255) NOT NULL,
        email_type VARCHAR(64) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL,
        message_id VARCHAR(255),
        error_message TEXT,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email_logs_recipient (recipient_email),
        INDEX idx_email_logs_user (user_id),
        INDEX idx_email_logs_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Try adding system_role to users table
    try {
      await execute("ALTER TABLE users ADD COLUMN system_role VARCHAR(32) DEFAULT 'user'");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Try adding apple_id to users table
    try {
      await execute("ALTER TABLE users ADD COLUMN apple_id VARCHAR(255) UNIQUE");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Try adding P2P payment handles to users table
    try {
      await execute("ALTER TABLE users ADD COLUMN venmo_handle VARCHAR(128)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE users ADD COLUMN cashapp_handle VARCHAR(128)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE users ADD COLUMN paypal_handle VARCHAR(128)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE users ADD COLUMN zelle_identifier VARCHAR(128)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE users ADD COLUMN apple_pay_handle VARCHAR(128)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE users ADD COLUMN preferred_payment_method VARCHAR(32)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Try adding description and kiosk_pin to pools table
    try {
      await execute("ALTER TABLE pools ADD COLUMN description TEXT");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE pools ADD COLUMN kiosk_pin VARCHAR(32) DEFAULT '1234'");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE pools ADD COLUMN qr_code_key VARCHAR(128)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Try adding estimated_cost and reason to shopping_items table
    try {
      await execute("ALTER TABLE shopping_items ADD COLUMN estimated_cost DECIMAL(10, 2) DEFAULT 0.00");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE shopping_items ADD COLUMN reason VARCHAR(255)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Try adding created_by to polls table
    try {
      await execute("ALTER TABLE polls ADD COLUMN created_by VARCHAR(255)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Try adding item_name to transactions table
    try {
      await execute("ALTER TABLE transactions ADD COLUMN item_name VARCHAR(255)");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Try adding unit_name to items table
    try {
      await execute("ALTER TABLE items ADD COLUMN unit_name VARCHAR(64) DEFAULT 'unit'");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Integer Cents Ledger Columns (Sprint 2 / N7)
    try {
      await execute("ALTER TABLE pool_members ADD COLUMN balance_cents INT DEFAULT 0");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE transactions ADD COLUMN amount_cents INT DEFAULT 0");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE items ADD COLUMN cost_per_unit_cents INT DEFAULT 0");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }
    try {
      await execute("ALTER TABLE shopping_items ADD COLUMN estimated_cost_cents INT DEFAULT 0");
    } catch (e: any) {
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    // Add Schema Indexes for Performance (Item 18.36)
    const schemaIndexes = [
      "CREATE INDEX idx_pool_members_user ON pool_members(user_id)",
      "CREATE INDEX idx_pool_members_pool ON pool_members(pool_id)",
      "CREATE INDEX idx_items_pool ON items(pool_id)",
      "CREATE INDEX idx_transactions_pool ON transactions(pool_id)",
      "CREATE INDEX idx_transactions_user ON transactions(user_id)",
      "CREATE INDEX idx_notifications_user ON notifications(user_id)",
      "CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read)"
    ];
    for (const idxSql of schemaIndexes) {
      try {
        await execute(idxSql);
      } catch (e: any) {
        if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_FIELDNAME') {
          // ignore duplicate index errors safely
        }
      }
    }

    // Seed default system settings
    await execute(`
      INSERT INTO system_settings (setting_key, setting_value) VALUES
      ('registration_enabled', 'true'),
      ('maintenance_mode', 'false'),
      ('apple_login_enabled', 'false'),
      ('kiosk_mode_enabled', 'true'),
      ('system_notice', 'Welcome to PantryPool Platform!')
      ON DUPLICATE KEY UPDATE setting_key=setting_key;
    `);

    console.log('[DB] Schema and migration setup completed successfully.');

  } catch (error: any) {
    console.warn('[DB Error] Could not initialize database schema on startup (server will run in setup mode):', error.message || error);
  }
}

