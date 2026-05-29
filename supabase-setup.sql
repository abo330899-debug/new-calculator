-- =============================================
-- حاسبة الرسوم الكمركية العراقية — إعداد قاعدة البيانات
-- شغّل هذا الكود في Supabase SQL Editor
-- =============================================

-- جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

-- جدول نقاط التفتيش
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- جدول رسوم نقاط التفتيش
CREATE TABLE IF NOT EXISTS checkpoint_fees (
  id SERIAL PRIMARY KEY,
  checkpoint_id TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT,
  amount_iqd REAL NOT NULL DEFAULT 0
);

-- جدول المنتجات
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  hs_code TEXT NOT NULL,
  cst_code TEXT,
  description TEXT,
  unit TEXT,
  weight REAL,
  unit_price REAL,
  is_protected BOOLEAN DEFAULT FALSE,
  protection_level TEXT,
  protection_percentage REAL,
  decision_action TEXT,
  decision_risk TEXT,
  decision_reason TEXT,
  min_value REAL,
  avg_value REAL,
  max_value REAL,
  duty_rate REAL,
  currency TEXT DEFAULT 'IQD',
  source_page INTEGER,
  raw_json TEXT
);

-- الفهارس لتسريع البحث
CREATE INDEX IF NOT EXISTS idx_products_hs ON products(hs_code);
CREATE INDEX IF NOT EXISTS idx_products_desc ON products(description);

-- جدول الجلسات (مطلوب لتسجيل الدخول)
CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

-- =============================================
-- بيانات نقاط التفتيش الأولية
-- =============================================
INSERT INTO checkpoints (id, name) VALUES
  ('umkasr', 'منفذ أم قصر'),
  ('shalamja', 'منفذ شلمجة'),
  ('mandali', 'منفذ منذلي'),
  ('trebil', 'منفذ طريبيل'),
  ('fishkhabur', 'منفذ فيشخابور'),
  ('ibrahim_khalil', 'منفذ إبراهيم الخليل'),
  ('rabiya', 'منفذ ربيعة'),
  ('zurbatia', 'منفذ زرباطية')
ON CONFLICT (id) DO NOTHING;
