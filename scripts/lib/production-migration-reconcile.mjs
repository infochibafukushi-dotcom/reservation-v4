/**
 * Production D1 migration reconciliation — schema verification + d1_migrations recording.
 * Wrangler records applied migrations via:
 *   INSERT INTO "d1_migrations" (name) values ('<filename>');
 * (see cloudflare/workers-sdk packages/wrangler/src/d1/migrations/helpers.ts buildMigrationQuery)
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export const PROD_DATABASE_NAME = "reservation-db";
export const PROD_DATABASE_ID = "fe47867f-6b81-4818-9a09-4fe4546cbe66";
export const STAGING_DATABASE_ID = "abe53a55-5802-4546-a126-52a05d3df5c0";
export const MIGRATIONS_TABLE = "d1_migrations";
export const RECONCILE_TARGET_MIGRATIONS = [
  "0002_reservations_fixed_fare.sql",
  "0003_quote_denormalized_and_consents.sql",
  "0004_meter_fixed_fare_runs.sql",
  "0005_meter_fixed_fare_run_completion_meta.sql",
  "0006_meter_fixed_fare_run_reset_meta.sql",
  "0007_pre_opening_reset_logs.sql",
];

/** @typedef {{ table: string, name: string, type: string, notnull?: boolean, default?: string|null, pk?: boolean }} ColumnSpec */
/** @typedef {{ name: string, table: string, columns: string[], unique?: boolean }} IndexSpec */
/** @typedef {{ columns?: ColumnSpec[], indexes?: IndexSpec[], tables?: { name: string, columns: ColumnSpec[], indexes?: IndexSpec[] }[] }} MigrationSpec */

/** @type {Record<string, MigrationSpec>} */
export const MIGRATION_SPECS = {
  "0002_reservations_fixed_fare.sql": {
    columns: [
      col("reservations", "fare_type", "TEXT"),
      col("reservations", "confirmed_fare", "INTEGER", { default: "0" }),
      col("reservations", "quote_snapshot_hash", "TEXT"),
      col("reservations", "fare_locked_at", "TEXT"),
    ],
  },
  "0003_quote_denormalized_and_consents.sql": {
    columns: [
      col("quotes", "selected_route_id", "TEXT"),
      col("quotes", "selected_overall_route_id", "TEXT"),
      col("quotes", "pre_fixed_fare_confirmable", "INTEGER", { default: "0" }),
      col("quotes", "fallback_reason", "TEXT"),
      col("quotes", "use_toll", "INTEGER", { default: "0" }),
      col("quotes", "distance_meters", "INTEGER"),
      col("quotes", "duration_seconds", "INTEGER"),
      col("quotes", "fixed_fare_total", "INTEGER"),
      col("reservations", "pre_fixed_fare_confirmable", "INTEGER", { default: "0" }),
      col("reservations", "selected_route_id", "TEXT"),
      col("reservations", "selected_overall_route_id", "TEXT"),
      col("reservations", "use_toll", "INTEGER", { default: "0" }),
      col("reservations", "consent_at", "TEXT"),
      col("reservations", "fixed_fare_total", "INTEGER", { default: "0" }),
    ],
    tables: [
      {
        name: "quote_consents",
        columns: [
          col("quote_consents", "id", "INTEGER", { pk: true }),
          col("quote_consents", "estimate_no", "TEXT", { notnull: true }),
          col("quote_consents", "reservation_id", "TEXT", { notnull: true }),
          col("quote_consents", "consent_at", "TEXT", { notnull: true }),
          col("quote_consents", "consent_text", "TEXT", { notnull: true }),
          col("quote_consents", "consent_text_version", "TEXT", { notnull: true }),
          col("quote_consents", "snapshot_hash", "TEXT", { notnull: true }),
          col("quote_consents", "user_agent", "TEXT"),
          col("quote_consents", "ip_hash", "TEXT"),
          col("quote_consents", "created_at", "TEXT", { notnull: true }),
        ],
        indexes: [
          idx("idx_quote_consents_estimate_no", "quote_consents", ["estimate_no"]),
          idx("idx_quote_consents_reservation_id", "quote_consents", ["reservation_id"]),
        ],
      },
    ],
  },
  "0004_meter_fixed_fare_runs.sql": {
    tables: [
      {
        name: "meter_fixed_fare_runs",
        columns: [
          col("meter_fixed_fare_runs", "reservation_id", "TEXT", { pk: true }),
          col("meter_fixed_fare_runs", "status", "TEXT", { notnull: true }),
          col("meter_fixed_fare_runs", "confirmed_fare_yen", "INTEGER", { notnull: true }),
          col("meter_fixed_fare_runs", "snapshot_hash", "TEXT", { notnull: true }),
          col("meter_fixed_fare_runs", "started_at", "TEXT", { notnull: true }),
          col("meter_fixed_fare_runs", "completed_at", "TEXT"),
          col("meter_fixed_fare_runs", "franchisee_id", "TEXT"),
          col("meter_fixed_fare_runs", "store_id", "TEXT"),
          col("meter_fixed_fare_runs", "created_at", "TEXT", { notnull: true }),
          col("meter_fixed_fare_runs", "updated_at", "TEXT", { notnull: true }),
        ],
        indexes: [
          idx("idx_meter_fixed_fare_runs_status", "meter_fixed_fare_runs", ["status"]),
        ],
      },
    ],
  },
  "0005_meter_fixed_fare_run_completion_meta.sql": {
    columns: [
      col("meter_fixed_fare_runs", "completion_status", "TEXT"),
      col("meter_fixed_fare_runs", "completion_reason", "TEXT"),
      col("meter_fixed_fare_runs", "pre_fixed_fare_exception_json", "TEXT"),
    ],
  },
  "0006_meter_fixed_fare_run_reset_meta.sql": {
    columns: [
      col("meter_fixed_fare_runs", "meter_run_status_reset_at", "TEXT"),
      col("meter_fixed_fare_runs", "meter_run_status_reset_by", "TEXT"),
      col("meter_fixed_fare_runs", "meter_run_status_reset_reason", "TEXT"),
      col("meter_fixed_fare_runs", "previous_meter_run_status", "TEXT"),
    ],
  },
  "0007_pre_opening_reset_logs.sql": {
    tables: [
      {
        name: "pre_opening_reset_logs",
        columns: [
          col("pre_opening_reset_logs", "id", "INTEGER", { pk: true }),
          col("pre_opening_reset_logs", "franchisee_id", "TEXT", { notnull: true }),
          col("pre_opening_reset_logs", "store_id", "TEXT", { notnull: true }),
          col("pre_opening_reset_logs", "executed_by", "TEXT", { notnull: true }),
          col("pre_opening_reset_logs", "executed_at", "TEXT", { notnull: true }),
          col("pre_opening_reset_logs", "targets_json", "TEXT", { notnull: true }),
          col("pre_opening_reset_logs", "deleted_json", "TEXT", { notnull: true }),
          col("pre_opening_reset_logs", "failed_json", "TEXT", { notnull: true }),
          col("pre_opening_reset_logs", "success", "INTEGER", { notnull: true, default: "1" }),
          col("pre_opening_reset_logs", "error_message", "TEXT"),
        ],
        indexes: [
          idx("idx_pre_opening_reset_logs_executed_at", "pre_opening_reset_logs", ["executed_at"]),
        ],
      },
    ],
  },
};

function col(table, name, type, opts = {}) {
  return {
    table,
    name,
    type,
    notnull: opts.notnull ?? false,
    default: opts.default ?? null,
    pk: opts.pk ?? false,
  };
}

function idx(name, table, columns, unique = false) {
  return { name, table, columns, unique };
}

export function normalizeType(type) {
  return String(type || "").trim().toUpperCase();
}

export function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "''" || s === '""') return null;
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  return s;
}

export function normalizeIndexSql(sql) {
  if (!sql) return "";
  return sql
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/"/g, "")
    .replace(/`/g, "");
}

export function buildWranglerMigrationInsert(name, tableName = MIGRATIONS_TABLE) {
  const escapedTable = `"${tableName.replace(/"/g, '""')}"`;
  const escapedName = name.replace(/'/g, "''");
  return `INSERT INTO ${escapedTable} (name) values ('${escapedName}');`;
}

export function loadWranglerProdConfig(configPath = path.join(root, "wrangler.toml")) {
  const text = readFileSync(configPath, "utf8");
  const nameMatch = text.match(/^name\s*=\s*"([^"]+)"/m);
  const dbNameMatch = text.match(/database_name\s*=\s*"([^"]+)"/);
  const dbIdMatch = text.match(/database_id\s*=\s*"([^"]+)"/);
  return {
    workerName: nameMatch?.[1] || "",
    databaseName: dbNameMatch?.[1] || "",
    databaseId: dbIdMatch?.[1] || "",
  };
}

export function assertProductionTarget(config, { allowLocal = false, remote = true } = {}) {
  if (!allowLocal && !remote) {
    throw new Error("Production reconciliation requires --remote (local mode is test-only).");
  }
  if (config.databaseName !== PROD_DATABASE_NAME) {
    throw new Error(`Refusing: database_name=${config.databaseName} (expected ${PROD_DATABASE_NAME})`);
  }
  if (config.databaseId !== PROD_DATABASE_ID) {
    throw new Error(`Refusing: database_id=${config.databaseId} (expected production ${PROD_DATABASE_ID})`);
  }
  if (config.databaseId === STAGING_DATABASE_ID) {
    throw new Error("Refusing: target is staging D1");
  }
}

export function listProjectMigrationFiles(migrationsDir = path.join(root, "migrations")) {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

export function computePendingMigrations(appliedNames, allFiles) {
  return allFiles.filter((name) => !appliedNames.includes(name));
}

function compareColumn(actual, expected) {
  const issues = [];
  if (!actual) {
    issues.push(`missing column ${expected.table}.${expected.name}`);
    return issues;
  }
  if (normalizeType(actual.type) !== normalizeType(expected.type)) {
    issues.push(`${expected.table}.${expected.name}: type expected ${expected.type}, got ${actual.type}`);
  }
  const actualNotnull = Number(actual.notnull) === 1;
  if (actualNotnull !== Boolean(expected.notnull)) {
    issues.push(`${expected.table}.${expected.name}: notnull expected ${expected.notnull}, got ${actualNotnull}`);
  }
  const actualDefault = normalizeDefault(actual.dflt_value);
  const expectedDefault = normalizeDefault(expected.default);
  if (actualDefault !== expectedDefault) {
    issues.push(`${expected.table}.${expected.name}: default expected ${expectedDefault}, got ${actualDefault}`);
  }
  if (expected.pk && Number(actual.pk) !== 1) {
    issues.push(`${expected.table}.${expected.name}: expected PRIMARY KEY`);
  }
  return issues;
}

function compareIndex(actualByName, expected) {
  const issues = [];
  const actual = actualByName[expected.name];
  if (!actual) {
    issues.push(`missing index ${expected.name}`);
    return issues;
  }
  const normalizedActual = normalizeIndexSql(actual.sql);
  const expectedSql = normalizeIndexSql(
    `CREATE${expected.unique ? " UNIQUE" : ""} INDEX ${expected.name} ON ${expected.table}(${expected.columns.join(", ")})`,
  );
  if (!normalizedActual.includes(`on ${expected.table}`.toLowerCase())) {
    issues.push(`index ${expected.name}: table mismatch (${actual.sql})`);
  }
  for (const colName of expected.columns) {
    if (!normalizedActual.includes(colName.toLowerCase())) {
      issues.push(`index ${expected.name}: missing column ${colName}`);
    }
  }
  if (expected.unique && !normalizedActual.includes("unique index")) {
    issues.push(`index ${expected.name}: expected UNIQUE`);
  }
  return issues;
}

export async function fetchSchemaSnapshot(executeQuery) {
  const tableNames = [
    "reservations",
    "quotes",
    "settings",
    "quote_consents",
    "meter_fixed_fare_runs",
    "pre_opening_reset_logs",
    "d1_migrations",
    "fare_master_versions",
    "fare_master_changes",
    "fare_master_permissions",
  ];

  const tables = {};
  const indexes = {};

  for (const tableName of tableNames) {
    const existsRows = await executeQuery(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
    );
    if (!existsRows.length) {
      tables[tableName] = null;
      continue;
    }
    tables[tableName] = await executeQuery(`PRAGMA table_info(${tableName})`);
    const indexRows = await executeQuery(
      `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='${tableName}' AND sql IS NOT NULL`,
    );
    for (const row of indexRows) {
      indexes[row.name] = row;
    }
  }

  const triggers = await executeQuery(`SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name`);
  const migrations = await executeQuery(`SELECT id, name, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY id`);
  const counts = {
    reservations: Number((await executeQuery("SELECT COUNT(*) AS c FROM reservations"))[0]?.c || 0),
    quotes: Number((await executeQuery("SELECT COUNT(*) AS c FROM quotes"))[0]?.c || 0),
    settings: Number((await executeQuery("SELECT COUNT(*) AS c FROM settings"))[0]?.c || 0),
  };

  return { tables, indexes, triggers, migrations, counts };
}

export function parseBatchedSchemaResults(blocks, tableNames) {
  const tables = {};
  const indexes = {};
  let blockIdx = 0;

  for (const tableName of tableNames) {
    const existsRows = blocks[blockIdx++]?.results || [];
    const pragmaRows = blocks[blockIdx++]?.results || [];
    const indexRows = blocks[blockIdx++]?.results || [];
    if (!existsRows.length) {
      tables[tableName] = null;
      continue;
    }
    tables[tableName] = pragmaRows;
    for (const row of indexRows) {
      indexes[row.name] = row;
    }
  }

  const triggers = blocks[blockIdx++]?.results || [];
  const migrations = blocks[blockIdx++]?.results || [];
  const counts = {
    reservations: Number(blocks[blockIdx++]?.results?.[0]?.c || 0),
    quotes: Number(blocks[blockIdx++]?.results?.[0]?.c || 0),
    settings: Number(blocks[blockIdx++]?.results?.[0]?.c || 0),
  };

  return { tables, indexes, triggers, migrations, counts };
}

export function buildSchemaSnapshotSql(tableNames) {
  const parts = [];
  for (const tableName of tableNames) {
    parts.push(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';`);
    parts.push(`PRAGMA table_info(${tableName});`);
    parts.push(
      `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='${tableName}' AND sql IS NOT NULL;`,
    );
  }
  parts.push(`SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name;`);
  parts.push(`SELECT id, name, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY id;`);
  parts.push(`SELECT COUNT(*) AS c FROM reservations;`);
  parts.push(`SELECT COUNT(*) AS c FROM quotes;`);
  parts.push(`SELECT COUNT(*) AS c FROM settings;`);
  return parts.join("\n");
}

export function verifyMigrationSpec(spec, schema) {
  const issues = [];
  const columnMap = (tableName) => {
    const rows = schema.tables[tableName];
    if (!rows) return {};
    return Object.fromEntries(rows.map((r) => [r.name, r]));
  };

  for (const expectedCol of spec.columns || []) {
    issues.push(...compareColumn(columnMap(expectedCol.table)[expectedCol.name], expectedCol));
  }

  for (const tableSpec of spec.tables || []) {
    if (!schema.tables[tableSpec.name]) {
      issues.push(`missing table ${tableSpec.name}`);
      continue;
    }
    const map = columnMap(tableSpec.name);
    for (const expectedCol of tableSpec.columns) {
      issues.push(...compareColumn(map[expectedCol.name], expectedCol));
    }
    for (const expectedIdx of tableSpec.indexes || []) {
      issues.push(...compareIndex(schema.indexes, expectedIdx));
    }
  }

  return issues;
}

export function buildComparisonRows(schema) {
  return RECONCILE_TARGET_MIGRATIONS.map((migrationName) => {
    const spec = MIGRATION_SPECS[migrationName];
    const issues = verifyMigrationSpec(spec, schema);
    const summary = summarizeMigrationExpectation(migrationName, spec);
    return {
      migration: migrationName,
      expected: summary,
      production: issues.length ? "partial/mismatch" : "matches",
      match: issues.length === 0 ? "Yes" : "No",
      notes: issues.length ? issues.join("; ") : "type/default/index verified",
    };
  });
}

function summarizeMigrationExpectation(migrationName, spec) {
  const parts = [];
  if (spec.columns?.length) parts.push(`${spec.columns.length} column(s)`);
  for (const t of spec.tables || []) {
    parts.push(`table ${t.name}`);
    if (t.indexes?.length) parts.push(`${t.indexes.length} index(es)`);
  }
  return parts.join(", ") || migrationName;
}

export async function reconcileProductionMigrations({
  executeQuery,
  executeWrite,
  dryRun = true,
  allowLocal = false,
  remote = true,
  config,
}) {
  assertProductionTarget(config, { allowLocal, remote });

  const before = await fetchSchemaSnapshot(executeQuery);
  const comparisonRows = buildComparisonRows(before);
  const failed = comparisonRows.filter((r) => r.match !== "Yes");

  const appliedNames = before.migrations.map((m) => m.name);
  const toRecord = RECONCILE_TARGET_MIGRATIONS.filter((name) => !appliedNames.includes(name));

  const allMigrationFiles = listProjectMigrationFiles();
  const projectedApplied = [...new Set([...appliedNames, ...RECONCILE_TARGET_MIGRATIONS])];
  const projectedPending = computePendingMigrations(projectedApplied, allMigrationFiles);

  const fareMasterMissing = ["fare_master_versions", "fare_master_changes", "fare_master_permissions"].every(
    (t) => before.tables[t] === null,
  );

  const result = {
    dryRun,
    before,
    comparisonRows,
    failed,
    appliedNames,
    toRecord,
    projectedPending,
    fareMasterMissing,
    writes: [],
    after: null,
  };

  if (failed.length) {
    result.error = `Schema verification failed for: ${failed.map((f) => f.migration).join(", ")}`;
    return result;
  }

  if (toRecord.length === 0) {
    result.message = "All target migrations already recorded in d1_migrations";
    return result;
  }

  if (dryRun) {
    result.message = `Dry-run: would record ${toRecord.length} migration(s) in ${MIGRATIONS_TABLE}`;
    result.plannedInserts = toRecord.map((name) => buildWranglerMigrationInsert(name));
    return result;
  }

  for (const name of toRecord) {
    const sql = buildWranglerMigrationInsert(name);
    await executeWrite(sql);
    result.writes.push(name);
  }

  result.after = await fetchSchemaSnapshot(executeQuery);
  return result;
}
