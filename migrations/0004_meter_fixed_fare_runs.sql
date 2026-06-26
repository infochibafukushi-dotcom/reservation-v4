-- Phase 5: 事前確定M 運行開始・完了
CREATE TABLE IF NOT EXISTS meter_fixed_fare_runs (
  reservation_id      TEXT PRIMARY KEY,
  status              TEXT NOT NULL,
  confirmed_fare_yen  INTEGER NOT NULL,
  snapshot_hash       TEXT NOT NULL,
  started_at          TEXT NOT NULL,
  completed_at        TEXT,
  franchisee_id       TEXT,
  store_id            TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meter_fixed_fare_runs_status
  ON meter_fixed_fare_runs(status);
