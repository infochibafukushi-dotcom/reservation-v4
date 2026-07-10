-- Phase 0: quotes テーブル（settings は 0000_core_settings.sql で作成済み）
CREATE TABLE IF NOT EXISTS quotes (
  estimate_no       TEXT PRIMARY KEY,
  status            TEXT NOT NULL DEFAULT 'active',
  total_amount      INTEGER NOT NULL,
  fare_type         TEXT NOT NULL DEFAULT 'fixed',
  quote_snapshot    TEXT NOT NULL,
  route_plan        TEXT,
  usage_summary     TEXT,
  fare_mode         TEXT,
  fare_version      TEXT,
  quote_version     INTEGER DEFAULT 1,
  snapshot_hash     TEXT NOT NULL,
  handoff_source    TEXT DEFAULT 'lp-site-estimate',
  dto_version       INTEGER DEFAULT 1,
  franchisee_id     TEXT,
  store_id          TEXT,
  expires_at        TEXT,
  created_at        TEXT NOT NULL,
  consumed_at       TEXT,
  reservation_id    TEXT,
  registered_by     TEXT DEFAULT 'lp'
);

CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_reservation_id ON quotes(reservation_id);

INSERT OR IGNORE INTO settings (key, value) VALUES ('fixed_fare_enabled', 'false');
