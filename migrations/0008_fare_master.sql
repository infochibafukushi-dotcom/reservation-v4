-- 料金マスター v1.0: バージョン管理・変更履歴・権限
CREATE TABLE IF NOT EXISTS fare_master_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  tenant_id TEXT,
  franchisee_id TEXT,
  store_id TEXT,
  scope_type TEXT NOT NULL DEFAULT 'headquarters',
  parent_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  fare_rules TEXT NOT NULL,
  display_rules TEXT NOT NULL DEFAULT '{}',
  calculation_rules TEXT NOT NULL DEFAULT '{}',
  meter_rules TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system',
  published_at TEXT,
  published_by TEXT,
  change_reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_fmv_scope_status ON fare_master_versions(scope_type, status);
CREATE INDEX IF NOT EXISTS idx_fmv_franchisee ON fare_master_versions(franchisee_id, status);
CREATE INDEX IF NOT EXISTS idx_fmv_store ON fare_master_versions(store_id, status);
CREATE INDEX IF NOT EXISTS idx_fmv_effective ON fare_master_versions(effective_from, effective_to);

CREATE TABLE IF NOT EXISTS fare_master_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id TEXT NOT NULL,
  tenant_id TEXT,
  franchisee_id TEXT,
  store_id TEXT,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  change_reason TEXT NOT NULL DEFAULT '',
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  change_type TEXT NOT NULL DEFAULT 'publish',
  source TEXT NOT NULL DEFAULT 'admin'
);

CREATE INDEX IF NOT EXISTS idx_fmc_version ON fare_master_changes(version_id);
CREATE INDEX IF NOT EXISTS idx_fmc_changed_at ON fare_master_changes(changed_at);

CREATE TABLE IF NOT EXISTS fare_master_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  franchisee_id TEXT,
  store_id TEXT,
  user_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  UNIQUE(user_id, permission_key, franchisee_id, store_id)
);
