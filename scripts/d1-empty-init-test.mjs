/**
 * 空 D1 初期化テスト — settings 未作成でも Worker が起動する
 * Run: node scripts/d1-empty-init-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import path from "path";
import { fileURLToPath } from "url";
import { createMiniflareWorkerOptions } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function jsonRes(res) {
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text), text };
  } catch {
    return { status: res.status, data: null, text };
  }
}

async function main() {
  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    d1Databases: { DB: "empty-init-test-db" },
    log: new Log(LogLevel.ERROR),
  });

  // Intentionally NO settings table — ensureSchema must create it
  const boot = await jsonRes(await mf.dispatchFetch("http://localhost/api/bootstrap"));
  if (boot.status !== 200 || !boot.data?.success) {
    throw new Error(`bootstrap failed: status=${boot.status} body=${boot.text?.slice(0, 200)}`);
  }

  const db = await mf.getD1Database("DB");
  const settings = await db.prepare(`SELECT COUNT(*) AS c FROM settings`).first();
  if (Number(settings?.c || 0) < 1) {
    throw new Error("settings table not initialized");
  }

  const active = await jsonRes(await mf.dispatchFetch("http://localhost/api/fare-master/active"));
  if (active.status !== 200 || !active.data?.success) {
    throw new Error(`fare-master/active failed: ${active.text?.slice(0, 200)}`);
  }
  if (!active.data?.estimateConfig?.distancePricing?.patternA) {
    throw new Error("fallback fare missing distancePricing (system_fallback should be complete)");
  }

  console.log("d1-empty-init-test: ALL PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
