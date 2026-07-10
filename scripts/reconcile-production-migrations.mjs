#!/usr/bin/env node
/**
 * 本番 D1 migration 競合整理 — 0002〜0007 スキーマ照合 + d1_migrations 記録
 *
 * Usage:
 *   node scripts/reconcile-production-migrations.mjs            # dry-run (default)
 *   node scripts/reconcile-production-migrations.mjs --apply      # write d1_migrations only
 *
 * Requirements:
 * - wrangler.toml の reservation-db (production ID) のみ対象
 * - staging D1 では実行不可
 * - 0002〜0007 の実スキーマ完全一致時のみ記録
 * - Wrangler 互換 INSERT: INSERT INTO "d1_migrations" (name) values ('...');
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadWranglerProdConfig,
  PROD_DATABASE_NAME,
  reconcileProductionMigrations,
} from "./lib/production-migration-reconcile.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apply = process.argv.includes("--apply");
const dryRun = !apply;

function runWranglerQuery(sql, { json = true } = {}) {
  const args = [
    "/c",
    "npx",
    "wrangler",
    "d1",
    "execute",
    configRef.databaseName,
    "--remote",
  ];
  if (json) args.push("--json");
  args.push(`--command=${JSON.stringify(sql)}`);

  const result = spawnSync("cmd.exe", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "wrangler d1 execute failed");
  }

  if (!json) return result.stdout;

  const trimmed = result.stdout.trim();
  const jsonStart = trimmed.indexOf("[");
  const jsonEnd = trimmed.lastIndexOf("]");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error(`Unexpected wrangler output:\n${trimmed.slice(0, 500)}`);
  }
  return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
}

let configRef = { databaseName: PROD_DATABASE_NAME };

async function createWranglerExecutors(config) {
  configRef = config;

  async function executeQuery(sql) {
    const payload = runWranglerQuery(sql, { json: true });
    const block = Array.isArray(payload) ? payload[0] : payload;
    if (!block?.success) {
      throw new Error(`Query failed: ${sql.slice(0, 120)}`);
    }
    return block.results || [];
  }

  async function executeWrite(sql) {
    runWranglerQuery(sql, { json: false });
  }

  return { executeQuery, executeWrite };
}

function printComparisonTable(rows) {
  console.log("\n| migration | 期待変更 | 本番状態 | 一致 | 備考 |");
  console.log("|---|---|---|---|---|");
  for (const row of rows) {
    console.log(`| ${row.migration} | ${row.expected} | ${row.production} | ${row.match} | ${row.notes} |`);
  }
}

async function main() {
  console.log("=== Production Migration Reconciliation ===");
  console.log(`Mode: ${dryRun ? "DRY-RUN (no writes)" : "APPLY (d1_migrations insert only)"}\n`);

  const config = loadWranglerProdConfig();
  console.log(`Worker: ${config.workerName}`);
  console.log(`D1: ${config.databaseName} (${config.databaseId})\n`);

  const { executeQuery, executeWrite } = await createWranglerExecutors(config);

  const result = await reconcileProductionMigrations({
    executeQuery,
    executeWrite,
    dryRun,
    remote: true,
    config,
  });

  console.log("--- Current d1_migrations ---");
  for (const row of result.before.migrations) {
    console.log(`  id=${row.id} name=${row.name} applied_at=${row.applied_at}`);
  }

  console.log("\n--- Business data counts (before) ---");
  console.log(`  reservations=${result.before.counts.reservations}`);
  console.log(`  quotes=${result.before.counts.quotes}`);
  console.log(`  settings=${result.before.counts.settings}`);

  printComparisonTable(result.comparisonRows);

  if (result.failed.length) {
    console.error("\nSTOP: schema mismatch detected.");
    for (const row of result.failed) {
      console.error(`  ${row.migration}: ${row.notes}`);
    }
    process.exit(1);
  }

  console.log("\n--- All 0002-0007 schema checks: PASS ---");

  if (result.toRecord.length === 0) {
    console.log("\nNo new migration records needed.");
  } else if (dryRun) {
    console.log(`\nDry-run: would INSERT ${result.toRecord.length} row(s) into d1_migrations:`);
    for (const name of result.toRecord) {
      console.log(`  - ${name}`);
    }
    for (const sql of result.plannedInserts || []) {
      console.log(`    SQL: ${sql}`);
    }
  } else {
    console.log(`\nApplied migration records: ${result.writes.join(", ")}`);
    console.log("\n--- d1_migrations (after) ---");
    for (const row of result.after.migrations) {
      console.log(`  id=${row.id} name=${row.name} applied_at=${row.applied_at}`);
    }
    console.log("\n--- Business data counts (after) ---");
    console.log(`  reservations=${result.after.counts.reservations}`);
    console.log(`  quotes=${result.after.counts.quotes}`);
    console.log(`  settings=${result.after.counts.settings}`);
    const unchanged =
      result.before.counts.reservations === result.after.counts.reservations &&
      result.before.counts.quotes === result.after.counts.quotes &&
      result.before.counts.settings === result.after.counts.settings;
    console.log(`  counts unchanged: ${unchanged ? "YES" : "NO"}`);
    if (!unchanged) {
      console.error("STOP: business data counts changed unexpectedly.");
      process.exit(1);
    }
  }

  console.log("\n--- 0008 apply readiness (projected) ---");
  console.log(`  projected pending: ${result.projectedPending.join(", ") || "(none)"}`);
  console.log(`  fare_master tables absent: ${result.fareMasterMissing ? "YES" : "NO"}`);

  const pendingOk =
    result.projectedPending.length === 1 && result.projectedPending[0] === "0008_fare_master.sql" && result.fareMasterMissing;
  console.log(`  0008-only pending after reconcile: ${pendingOk ? "YES" : "NO"}`);

  if (!pendingOk) {
    console.warn("WARNING: projected pending migrations are not exactly 0008 only.");
  }

  console.log("\nNext step (after --apply confirmation):");
  console.log("  npx wrangler d1 migrations list reservation-db --remote");
  console.log("  npx wrangler d1 migrations apply reservation-db --remote   # applies 0008 only");
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
