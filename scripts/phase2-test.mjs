/**
 * Phase 2 integration tests (fixed_fare_enabled + consume).
 * Run: node scripts/phase2-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "url";
import path from "path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LP_ORIGIN = "https://infochibafukushi-dotcom.github.io";
const ESTIMATE_A = "EST-PHASE2-TEST-A01";
const ESTIMATE_B = "EST-PHASE2-TEST-B01";
const ESTIMATE_C = "EST-PHASE2-TEST-C01";
const ESTIMATE_D = "EST-PHASE2-TEST-D01";

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

function buildRegisterBody(estimateNo) {
  return {
    estimateNo,
    total: 12000,
    fareType: "fixed",
    quoteSnapshot: sampleSnapshot,
    routePlan: { pickup: "A", destination: "B" },
    usageSummary: [{ label: "移動方法", value: "車いす" }],
    handoffSource: "lp-site-estimate",
    dtoVersion: 2
  };
}

function buildReservationBody(overrides = {}) {
  return {
    usageType: "初めて",
    name: "テストタロウ",
    phone: "09012345678",
    email: "phase2@example.com",
    date: "2099-08-01",
    time: "10:00",
    pickup: "千葉駅",
    destination: "東京駅",
    vehicle: "車いす",
    estimate: "12,000円",
    estimateNo: ESTIMATE_A,
    quoteSnapshot: sampleSnapshot,
    usageSummary: [{ label: "移動方法", value: "車いす" }],
    handoffSource: "lp-site-estimate",
    dtoVersion: 2,
    estimateConsent: {
      estimateNo: ESTIMATE_A,
      quotedFare: 12000,
      fareMode: "distance",
      fareVersion: "v1",
      quoteVersion: 1,
      consentType: "estimate_booking"
    },
    ...overrides
  };
}

async function registerQuote(mf, estimateNo) {
  const res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: LP_ORIGIN },
    body: JSON.stringify(buildRegisterBody(estimateNo))
  });
  const out = await jsonRes(res);
  assert(res.status === 200 && out.data?.success === true, `register failed ${estimateNo}: ${out.text}`);
}

async function setFixedFareEnabled(db, enabled) {
  await db
    .prepare(`INSERT INTO settings (key, value) VALUES ('fixed_fare_enabled', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .bind(enabled ? "true" : "false")
    .run();
}

async function main() {
  const mf = new Miniflare({
    modules: [{ type: "ESModule", path: path.join(root, "worker.js") }],
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "phase2-test-db" },
    log: new Log(LogLevel.ERROR)
  });

  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`)
    .bind(LP_ORIGIN)
    .run();
  await setFixedFareEnabled(db, false);

  const results = [];
  const record = (id, pass, detail) => results.push({ id, pass, detail });

  try {
    // --- fixed_fare_enabled=false regression ---
    await registerQuote(mf, ESTIMATE_B);
    let res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildReservationBody({ estimateNo: ESTIMATE_B, date: "2099-08-02", time: "11:00", phone: "09011112222" }))
    });
    let out = await jsonRes(res);
    record("R2-1", res.status === 200 && out.data?.success === true, `legacy estimate status=${res.status}`);

    res = await mf.dispatchFetch(`http://localhost/api/quotes/${encodeURIComponent(ESTIMATE_B)}`);
    out = await jsonRes(res);
    record("R2-2", res.status === 200 && out.data?.status === "active", `legacy no consume status=${out.data?.status}`);

    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "通常タロウ",
        phone: "09033334444",
        email: "normal@example.com",
        date: "2099-08-03",
        time: "12:00",
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimate: "5,000円～"
      })
    });
    out = await jsonRes(res);
    record("R2-3", res.status === 200 && out.data?.success === true, `normal reservation status=${res.status}`);

    // --- fixed_fare_enabled=true ---
    await setFixedFareEnabled(db, true);
    await registerQuote(mf, ESTIMATE_A);

    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildReservationBody())
    });
    out = await jsonRes(res);
    const reservationId = out.data?.id || "";
    record(
      "P2-1",
      res.status === 200 && out.data?.success === true && out.data?.confirmedFare === 12000,
      `fixed fare reservation status=${res.status} confirmedFare=${out.data?.confirmedFare}`
    );

    res = await mf.dispatchFetch(`http://localhost/api/quotes/${encodeURIComponent(ESTIMATE_A)}`);
    out = await jsonRes(res);
    record("P2-2", res.status === 410, `consumed quote status=${res.status}`);

    const quoteRow = await db.prepare(`SELECT status,reservation_id FROM quotes WHERE estimate_no=?`).bind(ESTIMATE_A).first();
    record(
      "P2-3",
      String(quoteRow?.status) === "consumed" && String(quoteRow?.reservation_id) === String(reservationId),
      `quote row status=${quoteRow?.status} reservation_id=${quoteRow?.reservation_id}`
    );

    const reservationRow = await db
      .prepare(`SELECT confirmed_fare, fare_type, quote_snapshot_hash, fare_locked_at, estimate FROM reservations WHERE id=?`)
      .bind(reservationId)
      .first();
    record(
      "P2-4",
      Number(reservationRow?.confirmed_fare) === 12000 &&
        String(reservationRow?.fare_type) === "fixed" &&
        String(reservationRow?.quote_snapshot_hash || "").length > 0 &&
        String(reservationRow?.fare_locked_at || "").length > 0 &&
        String(reservationRow?.estimate) === "12,000円",
      `reservation confirmed_fare=${reservationRow?.confirmed_fare} estimate=${reservationRow?.estimate}`
    );

    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildReservationBody({ date: "2099-08-04", time: "13:00", phone: "09055556666" }))
    });
    out = await jsonRes(res);
    record("P2-5", res.status === 410 || res.status === 409, `duplicate estimate status=${res.status}`);

    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildReservationBody({
          estimateNo: "EST-PHASE2-NOTFOUND",
          date: "2099-08-08",
          time: "10:00",
          phone: "09010101010",
          estimateConsent: { estimateNo: "EST-PHASE2-NOTFOUND", quotedFare: 12000 }
        })
      )
    });
    out = await jsonRes(res);
    record("P2-6", res.status === 404, `missing quote status=${res.status}`);

    await registerQuote(mf, ESTIMATE_D);
    const bodyNoConsent = buildReservationBody({
      estimateNo: ESTIMATE_D,
      date: "2099-08-09",
      time: "11:00",
      phone: "09020202020"
    });
    delete bodyNoConsent.estimateConsent;
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyNoConsent)
    });
    out = await jsonRes(res);
    record("P2-7", res.status === 400, `missing consent status=${res.status}`);

    await registerQuote(mf, ESTIMATE_C);
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildReservationBody({
          estimateNo: ESTIMATE_C,
          date: "2099-08-05",
          time: "14:00",
          phone: "09077778888",
          estimateConsent: { estimateNo: ESTIMATE_C, quotedFare: 9999 }
        })
      )
    });
    out = await jsonRes(res);
    record("P2-8", res.status === 400, `consent mismatch status=${res.status}`);

    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "通常ハナコ",
        phone: "09099990000",
        email: "normal2@example.com",
        date: "2099-08-06",
        time: "15:00",
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimate: "5,000円～"
      })
    });
    out = await jsonRes(res);
    record("P2-9", res.status === 200 && out.data?.success === true, `normal with flag true status=${res.status}`);

    res = await mf.dispatchFetch("http://localhost/api/bootstrap");
    out = await jsonRes(res);
    record(
      "P2-10",
      res.status === 200 && String(out.data?.settings?.fixed_fare_enabled) === "true",
      `bootstrap fixed_fare_enabled=${out.data?.settings?.fixed_fare_enabled}`
    );

    // flag rollback
    await setFixedFareEnabled(db, false);
    await registerQuote(mf, "EST-PHASE2-ROLLBACK-01");
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildReservationBody({
          estimateNo: "EST-PHASE2-ROLLBACK-01",
          date: "2099-08-07",
          time: "16:00",
          phone: "09012121212",
          estimateConsent: { estimateNo: "EST-PHASE2-ROLLBACK-01", quotedFare: 12000 }
        })
      )
    });
    out = await jsonRes(res);
    record("P2-11", res.status === 200 && out.data?.success === true, `rollback legacy path status=${res.status}`);

    const failed = results.filter((r) => !r.pass);
    console.log("\n=== Phase 2 Test Results ===\n");
    for (const r of results) {
      console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
    }
    console.log(`\nTotal: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
    if (failed.length) process.exit(1);
  } finally {
    await mf.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
