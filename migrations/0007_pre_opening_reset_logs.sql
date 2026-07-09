-- Pre-opening reset audit log (admin-only bulk delete by franchisee/store scope)
CREATE TABLE IF NOT EXISTS pre_opening_reset_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  franchisee_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  executed_by TEXT NOT NULL,
  executed_at TEXT NOT NULL,
  targets_json TEXT NOT NULL,
  deleted_json TEXT NOT NULL,
  failed_json TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_pre_opening_reset_logs_executed_at
  ON pre_opening_reset_logs(executed_at);
