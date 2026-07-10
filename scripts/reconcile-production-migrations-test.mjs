/**
 * reconcile-production-migrations ローカルテスト
 * Run: node scripts/reconcile-production-migrations-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, readdirSync } from "fs";
import { createMiniflareWorkerOptions } from "./worker-modules.mjs";
import {
  MIGRATION_SPECS,
  RECONCILE_TARGET_MIGRATIONS,
  buildWranglerMigrationInsert,
  computePendingMigrations,
  fetchSchemaSnapshot,
  listProjectMigrationFiles,
  reconcileProductionMigrations,
  verifyMigrationSpec,
} from "./lib/production-migration-reconcile.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(root, "migrations");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function stripSqlComments(sql) {
  return sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
}

async function applyAllMigrations(db) {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (file === "0008_fare_master.sql") continue;
    const sql = stripSqlComments(readFileSync(path.join(migrationsDir, file), "utf8"));
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      try {
        await db.prepare(stmt).run();
      } catch (e) {
        if (/duplicate column name/i.test(String(e.message))) continue;
        throw new Error(`${file}: ${e.message}`);
      }
    }
  }
}

async function createDbHarness(mf) {
  const db = await mf.getD1Database("DB");
  return {
    async executeQuery(sql) {
      const result = await db.prepare(sql).all();
      return result.results || [];
    },
    async executeWrite(sql) {
      await db.prepare(sql).run();
    },
    db,
  };
}

async function main() {
  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    d1Databases: { DB: "reconcile-test-db" },
    log: new Log(LogLevel.ERROR),
  });
  const harness = await createDbHarness(mf);

  await harness.db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await harness.db.prepare(`INSERT INTO settings (key,value) VALUES ('x','1')`).run();
  await harness.db.prepare(`CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY)`).run();
  await harness.db.prepare(`CREATE TABLE IF NOT EXISTS quotes (
    estimate_no TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    total_amount INTEGER NOT NULL,
    fare_type TEXT NOT NULL DEFAULT 'fixed',
    quote_snapshot TEXT NOT NULL,
    route_plan TEXT,
    usage_summary TEXT,
    fare_mode TEXT,
    fare_version TEXT,
    quote_version INTEGER DEFAULT 1,
    snapshot_hash TEXT NOT NULL,
    handoff_source TEXT DEFAULT 'lp-site-estimate',
    dto_version INTEGER DEFAULT 1,
    franchisee_id TEXT,
    store_id TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    consumed_at TEXT,
    reservation_id TEXT,
    registered_by TEXT DEFAULT 'lp'
  )`).run();
  await applyAllMigrations(harness.db);

  await harness.db.prepare(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`).run();
  await harness.db.prepare(`INSERT INTO d1_migrations (name) VALUES ('0000_core_settings.sql')`).run();
  await harness.db.prepare(`INSERT INTO d1_migrations (name) VALUES ('0001_quotes.sql')`).run();

  const schema = await fetchSchemaSnapshot(harness.executeQuery.bind(harness));
  for (const migrationName of RECONCILE_TARGET_MIGRATIONS) {
    const issues = verifyMigrationSpec(MIGRATION_SPECS[migrationName], schema);
    assert(issues.length === 0, `${migrationName} should match locally: ${issues.join("; ")}`);
  }

  const prodConfig = {
    workerName: "test-worker",
    databaseName: "reservation-db",
    databaseId: "fe47867f-6b81-4818-9a09-4fe4546cbe66",
  };

  const dry = await reconcileProductionMigrations({
    executeQuery: harness.executeQuery.bind(harness),
    executeWrite: harness.executeWrite.bind(harness),
    dryRun: true,
    allowLocal: true,
    remote: false,
    config: prodConfig,
  });
  assert(dry.failed.length === 0, "dry-run should pass schema checks");
  assert(dry.toRecord.length === RECONCILE_TARGET_MIGRATIONS.length, "should plan 6 inserts");
  assert(dry.plannedInserts[0].includes('INSERT INTO "d1_migrations" (name)'), "wrangler-compatible insert");

  const countsBefore = { ...(await fetchSchemaSnapshot(harness.executeQuery.bind(harness))).counts };
  const applied = await reconcileProductionMigrations({
    executeQuery: harness.executeQuery.bind(harness),
    executeWrite: harness.executeWrite.bind(harness),
    dryRun: false,
    allowLocal: true,
    remote: false,
    config: prodConfig,
  });
  assert(applied.failed.length === 0, "apply should succeed");
  assert(applied.writes.length === 6, "should write 6 migration records");

  const countsAfter = (await fetchSchemaSnapshot(harness.executeQuery.bind(harness))).counts;
  assert(countsBefore.reservations === countsAfter.reservations, "reservations count unchanged");
  assert(countsBefore.quotes === countsAfter.quotes, "quotes count unchanged");
  assert(countsBefore.settings === countsAfter.settings, "settings count unchanged");

  const reapply = await reconcileProductionMigrations({
    executeQuery: harness.executeQuery.bind(harness),
    executeWrite: harness.executeWrite.bind(harness),
    dryRun: false,
    allowLocal: true,
    remote: false,
    config: prodConfig,
  });
  assert(reapply.toRecord.length === 0, "already recorded should skip");

  const mismatchSchema = await fetchSchemaSnapshot(harness.executeQuery.bind(harness));
  const fakeSchema = {
    tables: { ...mismatchSchema.tables, reservations: mismatchSchema.tables.reservations.filter((c) => c.name !== "fare_type") },
    indexes: mismatchSchema.indexes,
  };
  const forcedIssues = verifyMigrationSpec(MIGRATION_SPECS["0002_reservations_fixed_fare.sql"], fakeSchema);
  assert(forcedIssues.length > 0, "missing column should fail verification");

  const allFiles = listProjectMigrationFiles();
  const appliedNames = (await harness.executeQuery(`SELECT name FROM d1_migrations ORDER BY id`)).map((r) => r.name);
  const pending = computePendingMigrations(appliedNames, allFiles);
  assert(pending.length === 1 && pending[0] === "0008_fare_master.sql", `expected 0008 only pending, got ${pending.join(",")}`);

  assert(
    buildWranglerMigrationInsert("0002_reservations_fixed_fare.sql") ===
      `INSERT INTO "d1_migrations" (name) values ('0002_reservations_fixed_fare.sql');`,
    "insert format matches wrangler",
  );

  console.log("reconcile-production-migrations-test: ALL PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
