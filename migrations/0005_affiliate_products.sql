-- Migration 0005: Affiliate Products and Click Tracking for Pantry Organization Gear
-- Purpose: Enable curated Amazon affiliate breakroom products and click tracking

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

CREATE INDEX IF NOT EXISTS idx_affiliate_products_active ON affiliate_products(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_product ON affiliate_clicks(product_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_source ON affiliate_clicks(source);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created ON affiliate_clicks(created_at);

-- Initial seed with the user's primary Amazon affiliate product and breakroom organizing staples
INSERT OR IGNORE INTO affiliate_products (id, title, description, category, image_url, affiliate_url, badge, price_estimate, display_order, is_active)
VALUES (
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
);

INSERT OR IGNORE INTO affiliate_products (id, title, description, category, image_url, affiliate_url, badge, price_estimate, display_order, is_active)
VALUES (
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
);

INSERT OR IGNORE INTO affiliate_products (id, title, description, category, image_url, affiliate_url, badge, price_estimate, display_order, is_active)
VALUES (
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
);
