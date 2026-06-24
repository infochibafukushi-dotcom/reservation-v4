-- Phase 2: reservations 固定運賃列（ensureSchema でも追加される）
ALTER TABLE reservations ADD COLUMN fare_type TEXT;
ALTER TABLE reservations ADD COLUMN confirmed_fare INTEGER DEFAULT 0;
ALTER TABLE reservations ADD COLUMN quote_snapshot_hash TEXT;
ALTER TABLE reservations ADD COLUMN fare_locked_at TEXT;
