/**
 * Phase 3: quote_consents / denormalized columns / handoff fields verification.
 * Run: node scripts/phase3-consent-persistence-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "url";
import path from "path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LP_ORIGIN = "https://infochibafukushi-dotcom.github.io";
const ESTIMATE_NO = "EST-PHASE3-CONSENT-001";

const quoteSnapshot = {
  fixedFareTotal: 10000,
  fixedFareBreakdown: [
    { key: "pickupFee", label: "迎車料金", amount: 2000 },
    { key: "distanceFare", label: "距離運賃", amount: 8000 }
  ],
  serviceFees: [{ key: "assistanceFee", label: "介助料金", amount: 2000 }],
  fareMode: "distance",
  fareVersion: "v1",
  quoteVersion: 1,
  selectedRouteId: "route_0",
  selectedUsesToll: true,
  roadType: "toll",
  distanceMeters: 12500,
  durationSeconds: 1800,
  preFixedFareConfirmable: true,
  overallRouteSelection: { selectedOverallRouteId: "overall_1" }
};

const CONSENT_TEXT = `見積番号 ${ESTIMATE_NO} の確定運賃 12,000円 および上記見積内容に同意して予約する`;
const CONSENT_VERSION = "2026-06-01-v1";

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

async function main() {
  const mf = new Miniflare({
    modules: [{ type: "ESModule", path: path.join(root, "worker.js") }],
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "phase3-consent-db" },
    log: new Log(LogLevel.ERROR)
  });

  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`)
    .bind(LP_ORIGIN)
    .run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('fixed_fare_enabled', 'false')`)
    .run();

  const results = [];
  const record = (id, pass, detail) => results.push({ id, pass, detail });

  try {
    await mf.dispatchFetch("http://localhost/api/bootstrap");

    // Register quote (LP flow)
    let res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: LP_ORIGIN
      },
      body: JSON.stringify({
        estimateNo: ESTIMATE_NO,
        total: 12000,
        fareType: "fixed",
        quoteSnapshot,
        routePlan: { pickup: "千葉駅", destination: "東京駅", selectedRouteId: "route_0" },
        usageSummary: [{ label: "移動方法", value: "車いす" }],
        handoffSource: "lp-site-estimate",
        dtoVersion: 2
      })
    });
    let out = await jsonRes(res);
    const snapshotHash = out.data?.snapshotHash || "";
    const expiresAt = out.data?.expiresAt || "";
    record(
      "P3-1",
      res.status === 200 && out.data?.success && snapshotHash && expiresAt,
      `register status=${res.status} hash=${snapshotHash.slice(0, 16)}... expiresAt=${expiresAt}`
    );

    // Enable fixed fare
    await db
      .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('fixed_fare_enabled', 'true')`)
      .run();

    // Create reservation with consent
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.50",
        "User-Agent": "Phase3Test/1.0"
      },
      body: JSON.stringify({
        usageType: "初めて",
        name: "テストタロウ",
        phone: "09012345678",
        email: "phase3@example.com",
        date: "2099-09-01",
        time: "11:00",
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimate: "12,000円",
        estimateNo: ESTIMATE_NO,
        handoffSource: "lp-site-estimate",
        dtoVersion: 2,
        estimateConsent: {
          estimateNo: ESTIMATE_NO,
          quotedFare: 12000,
          fareMode: "distance",
          fareVersion: "v1",
          quoteVersion: 1,
          consentType: "estimate_booking",
          consentText: CONSENT_TEXT,
          consentTextVersion: CONSENT_VERSION,
          snapshotHash
        }
      })
    });
    out = await jsonRes(res);
    const reservationId = out.data?.id || "";
    record("P3-2", res.status === 200 && reservationId, `reservation status=${res.status} id=${reservationId}`);

    // Duplicate should 410
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "テストジロウ",
        phone: "09087654321",
        email: "dup@example.com",
        date: "2099-09-01",
        time: "11:30",
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimateNo: ESTIMATE_NO,
        estimateConsent: { estimateNo: ESTIMATE_NO, quotedFare: 12000, consentText: CONSENT_TEXT, consentTextVersion: CONSENT_VERSION, snapshotHash }
      })
    });
    out = await jsonRes(res);
    record("P3-3", res.status === 410, `duplicate status=${res.status}`);

    const quoteRow = await db.prepare(`SELECT * FROM quotes WHERE estimate_no=?`).bind(ESTIMATE_NO).first();
    record(
      "P3-4-quotes",
      quoteRow?.status === "consumed" &&
        quoteRow?.selected_route_id === "route_0" &&
        Number(quoteRow?.use_toll) === 1 &&
        Number(quoteRow?.fixed_fare_total) === 10000 &&
        String(quoteRow?.snapshot_hash) === snapshotHash,
      `quotes status=${quoteRow?.status} route=${quoteRow?.selected_route_id} toll=${quoteRow?.use_toll} fare=${quoteRow?.fixed_fare_total}`
    );

    const resRow = await db.prepare(`SELECT * FROM reservations WHERE id=?`).bind(reservationId).first();
    const consentJson = resRow?.estimate_consent ? JSON.parse(resRow.estimate_consent) : null;
    record(
      "P3-5-reservations",
      String(resRow?.estimate_no) === ESTIMATE_NO &&
        Number(resRow?.confirmed_fare) === 12000 &&
        String(resRow?.quote_snapshot_hash) === snapshotHash &&
        consentJson?.consentText === CONSENT_TEXT &&
        consentJson?.consentTextVersion === CONSENT_VERSION,
      `res estimate_no=${resRow?.estimate_no} confirmed=${resRow?.confirmed_fare} consentAt=${resRow?.consent_at || consentJson?.consentAt}`
    );

    const consentRow = await db
      .prepare(`SELECT * FROM quote_consents WHERE reservation_id=? ORDER BY id DESC LIMIT 1`)
      .bind(reservationId)
      .first();
    record(
      "P3-6-quote_consents",
      consentRow &&
        consentRow.consent_text === CONSENT_TEXT &&
        consentRow.consent_text_version === CONSENT_VERSION &&
        consentRow.snapshot_hash === snapshotHash &&
        String(consentRow.ip_hash || "").length === 64,
      `consent estimate=${consentRow?.estimate_no} ipHash=${String(consentRow?.ip_hash || "").slice(0, 16)}...`
    );

    // Legacy path: fixed_fare_enabled=false, normal form only
    await db
      .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('fixed_fare_enabled', 'false')`)
      .run();
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "ヤマダタロウ",
        phone: "09011112222",
        email: "legacy@example.com",
        date: "2099-09-02",
        time: "14:00",
        pickup: "千葉駅",
        vehicle: "車いす",
        destination: "東京駅",
        estimate: "5,000円～"
      })
    });
    out = await jsonRes(res);
    record("P3-7-legacy", res.status === 200 && out.data?.success, `legacy-only status=${res.status} id=${out.data?.id || ""}`);

    console.log("\n=== Phase 3 Consent Persistence Test ===\n");
    for (const r of results) {
      console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
    }
    const failed = results.filter((r) => !r.pass);
    console.log(`\nTotal: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
    if (failed.length) process.exit(1);

    console.log("\n--- D1 sample (for report) ---");
    console.log("estimateNo:", ESTIMATE_NO);
    console.log("reservationId:", reservationId);
    console.log("snapshotHash:", snapshotHash);
    console.log("quoteExpiresAt:", expiresAt);
  } finally {
    await mf.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
