-- Core settings table (required before 0001_quotes.sql INSERT)
-- Safe to re-run: CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', '1234');

-- 0002 以降の ALTER TABLE が新規 D1 で失敗しないよう最小スキーマ
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY
);
