/**
 * D1 migration 再実行安全性テスト（ローカル in-memory D1）
 * Run: node scripts/d1-migration-idempotent-test.mjs
 *
 * wrangler は適用済み migration を追跡するため本番では ALTER の二重実行は起きない。
 * 本テストは CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE の安全性を検証する。
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createMiniflareWorkerOptions } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(root, "migrations");

async function runStatement(db, stmt) {
  try {
    await db.prepare(stmt).run();
    return { ok: true };
  } catch (e) {
    const msg = String(e?.message || e);
    if (/duplicate column name/i.test(msg)) return { ok: true, skipped: "duplicate-column" };
    return { ok: false, error: msg };
  }
}

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

async function applyMigrations(db, label) {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(path.join(migrationsDir, file), "utf8"));
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      const result = await runStatement(db, stmt);
      if (!result.ok) throw new Error(`${label} ${file}: ${result.error}\nSQL: ${stmt.slice(0, 120)}`);
    }
  }
  console.log(`${label}: applied ${files.length} migration files`);
}

async function main() {
  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    d1Databases: { DB: "migration-idempotent-db" },
    log: new Log(LogLevel.ERROR),
  });
  const db = await mf.getD1Database("DB");

  await applyMigrations(db, "run-1");
  const settings1 = await db.prepare(`SELECT key FROM settings WHERE key='admin_password'`).first();
  if (!settings1) throw new Error("settings missing after first run");

  await applyMigrations(db, "run-2");
  const settings2 = await db.prepare(`SELECT COUNT(*) AS c FROM settings`).first();
  if (Number(settings2?.c || 0) < 1) throw new Error("settings lost after second run");

  const quotes = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='quotes'`).first();
  if (!quotes) throw new Error("quotes table missing");

  const fareMaster = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='fare_master_versions'`).first();
  if (!fareMaster) throw new Error("fare_master_versions table missing");

  console.log("d1-migration-idempotent-test: ALL PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
