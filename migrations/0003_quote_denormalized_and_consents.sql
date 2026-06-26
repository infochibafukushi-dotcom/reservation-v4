-- Phase 3: quotes 検索用列・quote_consents ・reservations 見積証跡列
-- 本番は ensureSchema() でも追加される

ALTER TABLE quotes ADD COLUMN selected_route_id TEXT;
ALTER TABLE quotes ADD COLUMN selected_overall_route_id TEXT;
ALTER TABLE quotes ADD COLUMN pre_fixed_fare_confirmable INTEGER DEFAULT 0;
ALTER TABLE quotes ADD COLUMN fallback_reason TEXT;
ALTER TABLE quotes ADD COLUMN use_toll INTEGER DEFAULT 0;
ALTER TABLE quotes ADD COLUMN distance_meters INTEGER;
ALTER TABLE quotes ADD COLUMN duration_seconds INTEGER;
ALTER TABLE quotes ADD COLUMN fixed_fare_total INTEGER;

ALTER TABLE reservations ADD COLUMN pre_fixed_fare_confirmable INTEGER DEFAULT 0;
ALTER TABLE reservations ADD COLUMN selected_route_id TEXT;
ALTER TABLE reservations ADD COLUMN selected_overall_route_id TEXT;
ALTER TABLE reservations ADD COLUMN use_toll INTEGER DEFAULT 0;
ALTER TABLE reservations ADD COLUMN consent_at TEXT;
ALTER TABLE reservations ADD COLUMN fixed_fare_total INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS quote_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_no TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  consent_text_version TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quote_consents_estimate_no ON quote_consents(estimate_no);
CREATE INDEX IF NOT EXISTS idx_quote_consents_reservation_id ON quote_consents(reservation_id);
