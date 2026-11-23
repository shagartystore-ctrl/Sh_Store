ALTER TABLE products ADD COLUMN gallery_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN quantity_offers TEXT NOT NULL DEFAULT '{}';
ALTER TABLE orders ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_orders_duplicate_check ON orders(user_id, phone, created_at);
INSERT OR IGNORE INTO store_settings (key,value) VALUES ('free_shipping_threshold','1000');
INSERT OR IGNORE INTO store_settings (key,value) VALUES ('seasonal_active','0');
INSERT OR IGNORE INTO store_settings (key,value) VALUES ('seasonal_title','عرض موسمي من شجرتي');
INSERT OR IGNORE INTO store_settings (key,value) VALUES ('seasonal_text','اكتشف عروض الموسم لفترة محدودة');