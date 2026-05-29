CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoint_fees (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checkpoint_id TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT,
  amount_iqd REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_products_hs ON products(hs_code);
CREATE INDEX IF NOT EXISTS idx_products_desc ON products(description);

CREATE TABLE IF NOT EXISTS session (
  sid TEXT NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

INSERT INTO checkpoints (id, name) VALUES
  ('umkasr', 'Um Qasr'),
  ('shalamja', 'Shalamja'),
  ('mandali', 'Mandali'),
  ('trebil', 'Trebil'),
  ('fishkhabur', 'Fish Khabur'),
  ('ibrahim_khalil', 'Ibrahim Khalil'),
  ('rabiya', 'Rabiya'),
  ('zurbatia', 'Zurbatia')
ON CONFLICT (id) DO NOTHING;
