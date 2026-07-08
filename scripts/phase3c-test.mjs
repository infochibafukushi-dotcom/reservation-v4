/**
 * Phase3-C admin quote audit API tests
 * Run: node scripts/phase3c-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "url";
import path from "path";
import { createMiniflareWorkerOptions, seedTestPublicReservationSettings } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LP_ORIGIN = "https://infochibafukushi-dotcom.github.io";
const ESTIMATE_ACTIVE = "EST-PHASE3C-ACTIVE";
const ESTIMATE_CONSUMED = "EST-PHASE3C-CONSUMED";

const sampleSnapshot = {
  fixedFareTotal: 10000,
  total: 12000,
  fixedFareBreakdown: [
    { key: "pickupFee", label: "迎車料金", amount: 2000 },
    { key: "distanceFare", label: "距離運賃", amount: 8000 }
  ],
  serviceFees: [{ key: "assistanceFee", label: "介助料金", amount: 2000 }],
  fareMode: "distance",
  fareVersion: "v1",
  quoteVersion: 1
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function jsonRes(res) {
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text), text };
  } catch {
    return { status: res.status, data: null, text };
  }
}

function quoteStatusLabel(status) {
  return ({ active: "有効", consumed: "使用済み", expired: "期限切れ" }[String(status || "").trim()] || String(status || "").trim() || "データなし");
}

function renderSnapshotHashMatchLabel(reservationHash, quoteHash) {
  const a = String(reservationHash || "").trim();
  const b = String(quoteHash || "").trim();
  if (!a || !b) return "データなし";
  return a === b ? "✅ 一致" : "⚠ 不一致";
}

async function adminLogin(mf) {
  const res = await mf.dispatchFetch("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "1234" })
  });
  const out = await jsonRes(res);
  assert(res.status === 200 && out.data?.success && out.data?.token, `admin login failed: ${out.text}`);
  return out.data.token;
}

async function registerQuote(mf, estimateNo) {
  const res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: LP_ORIGIN },
    body: JSON.stringify({
      estimateNo,
      total: 12000,
      fareType: "fixed",
      quoteSnapshot: sampleSnapshot,
      routePlan: { pickup: "A", destination: "B" },
      usageSummary: [{ label: "移動方法", value: "車いす" }],
      handoffSource: "lp-site-estimate",
      dtoVersion: 2
    })
  });
  const out = await jsonRes(res);
  assert(res.status === 200 && out.data?.success === true, `register failed: ${out.text}`);
  return out.data.snapshotHash;
}

async function setFixedFareEnabled(db, enabled) {
  await db
    .prepare(`INSERT INTO settings (key, value) VALUES ('fixed_fare_enabled', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .bind(enabled ? "true" : "false")
    .run();
}

async function main() {
  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "phase3c-test-db" },
    log: new Log(LogLevel.ERROR)
  });

  const db = await mf.getD1Database("DB");
  await mf.dispatchFetch("http://localhost/api/bootstrap");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`).bind(LP_ORIGIN).run();
  await setFixedFareEnabled(db, true);
  await mf.dispatchFetch("http://localhost/api/bootstrap");
  await seedTestPublicReservationSettings(db);

  const token = await adminLogin(mf);
  const auth = { Authorization: `Bearer ${token}` };
  const results = [];
  const record = (id, pass, detail) => results.push({ id, pass, detail });

  try {
    // Unauthorized
    let res = await mf.dispatchFetch(`http://localhost/api/admin/quotes/${encodeURIComponent(ESTIMATE_ACTIVE)}`);
    let out = await jsonRes(res);
    record("C3-0", res.status === 401, `unauthorized status=${res.status}`);

    // Case 1: active quote
    const activeHash = await registerQuote(mf, ESTIMATE_ACTIVE);
    res = await mf.dispatchFetch(`http://localhost/api/admin/quotes/${encodeURIComponent(ESTIMATE_ACTIVE)}`, { headers: auth });
    out = await jsonRes(res);
    const activeQuote = out.data?.quote;
    record(
      "C3-1",
      res.status === 200 &&
        out.data?.success === true &&
        activeQuote?.status === "active" &&
        quoteStatusLabel(activeQuote?.status) === "有効" &&
        !activeQuote?.reservation_id &&
        !activeQuote?.consumed_at,
      `active quote status=${activeQuote?.status} reservation_id=${activeQuote?.reservation_id}`
    );

    // Case 2: consumed quote
    const consumedHash = await registerQuote(mf, ESTIMATE_CONSUMED);
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "監査テスト",
        phone: "09055556666",
        email: "audit@example.com",
        date: "2099-09-01",
        time: "10:00",
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimate: "12,000円",
        estimateNo: ESTIMATE_CONSUMED,
        quoteSnapshot: sampleSnapshot,
        usageSummary: [{ label: "移動方法", value: "車いす" }],
        handoffSource: "lp-site-estimate",
        dtoVersion: 2,
        estimateConsent: {
          estimateNo: ESTIMATE_CONSUMED,
          quotedFare: 12000,
          fareMode: "distance",
          fareVersion: "v1",
          quoteVersion: 1,
          consentType: "estimate_booking"
        }
      })
    });
    out = await jsonRes(res);
    const reservationId = out.data?.id;
    assert(res.status === 200 && reservationId, `fixed reservation failed: ${out.text}`);

    res = await mf.dispatchFetch(`http://localhost/api/admin/quotes/${encodeURIComponent(ESTIMATE_CONSUMED)}`, { headers: auth });
    out = await jsonRes(res);
    const consumedQuote = out.data?.quote;
    record(
      "C3-2",
      res.status === 200 &&
        consumedQuote?.status === "consumed" &&
        quoteStatusLabel(consumedQuote?.status) === "使用済み" &&
        String(consumedQuote?.reservation_id) === String(reservationId) &&
        String(consumedQuote?.consumed_at || "").length > 0,
      `consumed quote status=${consumedQuote?.status} reservation_id=${consumedQuote?.reservation_id}`
    );

    // Case 3: hash match
    const reservationRow = await db
      .prepare(`SELECT quote_snapshot_hash FROM reservations WHERE id=?`)
      .bind(reservationId)
      .first();
    record(
      "C3-3",
      renderSnapshotHashMatchLabel(reservationRow?.quote_snapshot_hash, consumedQuote?.snapshot_hash) === "✅ 一致" &&
        reservationRow?.quote_snapshot_hash === consumedHash,
      `hash match reservation=${reservationRow?.quote_snapshot_hash} quote=${consumedQuote?.snapshot_hash}`
    );

    // Case 4: hash mismatch
    record(
      "C3-4",
      renderSnapshotHashMatchLabel("abc123", consumedHash) === "⚠ 不一致",
      "hash mismatch label"
    );

    // Invalid estimate no
    res = await mf.dispatchFetch("http://localhost/api/admin/quotes/INVALID", { headers: auth });
    out = await jsonRes(res);
    record("C3-5", res.status === 400, `invalid estimate status=${res.status}`);

    // Response fields
    record(
      "C3-6",
      activeQuote?.estimate_no === ESTIMATE_ACTIVE &&
        activeQuote?.snapshot_hash === activeHash &&
        Number(activeQuote?.total_amount) === 12000 &&
        activeQuote?.fare_type === "fixed" &&
        String(activeQuote?.created_at || "").length > 0,
      `response fields estimate_no=${activeQuote?.estimate_no}`
    );
  } finally {
    await mf.dispose();
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log("\n=== Phase3-C Test Results ===\n");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
  }
  console.log(`\nTotal: ${results.length}, Passed: ${passed}, Failed: ${failed}\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
