/**
 * Phase 4: Driver read API (list/detail + integrity).
 * Run: node scripts/phase4-driver-api-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "url";
import path from "path";
import { createMiniflareWorkerOptions, seedTestPublicReservationSettings } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LP_ORIGIN = "https://infochibafukushi-dotcom.github.io";
const DRIVER_TOKEN = "phase4-driver-token";
const ESTIMATE_NO = "EST-PHASE4-DRIVER-001";
const RESERVATION_DATE = "2099-10-15";
const RESERVATION_TIME = "10:30";

const quoteSnapshot = {
  fixedFareTotal: 10000,
  fixedFareBreakdown: [
    { key: "pickupFee", label: "迎車料金", amount: 2000 },
    { key: "distanceFare", label: "距離運賃", amount: 8000 },
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
};

const CONSENT_TEXT = `見積番号 ${ESTIMATE_NO} の確定運賃 12,000円 および上記見積内容に同意して予約する`;

function driverHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${DRIVER_TOKEN}`,
    ...extra,
  };
}

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
    ...createMiniflareWorkerOptions(root),
    bindings: {
      LP_REGISTER_TOKEN: "",
      METER_DRIVER_TOKEN: DRIVER_TOKEN,
    },
    d1Databases: { DB: "phase4-driver-db" },
    log: new Log(LogLevel.ERROR),
  });

  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`)
    .bind(LP_ORIGIN)
    .run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('fixed_fare_enabled', 'true')`)
    .run();
  await mf.dispatchFetch("http://localhost/api/bootstrap");
  await seedTestPublicReservationSettings(db);

  const results = [];
  const record = (id, pass, detail) => results.push({ id, pass, detail });

  try {
    let res = await mf.dispatchFetch("http://localhost/api/driver/reservations?date=2099-10-15");
    let out = await jsonRes(res);
    record("P4-1-unauthorized", res.status === 401, `status=${res.status}`);

    res = await mf.dispatchFetch("http://localhost/api/driver/reservations", {
      headers: driverHeaders(),
    });
    out = await jsonRes(res);
    record("P4-2-missing-date", res.status === 400, `status=${res.status}`);

    res = await mf.dispatchFetch("http://localhost/api/bootstrap");
    out = await jsonRes(res);
    record("P4-3-bootstrap", res.status === 200 && out.data?.success, `status=${res.status}`);

    res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: LP_ORIGIN },
      body: JSON.stringify({
        estimateNo: ESTIMATE_NO,
        total: 12000,
        fareType: "fixed",
        quoteSnapshot,
        routePlan: { pickup: "千葉駅", destination: "東京駅", selectedRouteId: "route_0" },
        usageSummary: [{ label: "移動方法", value: "車いす" }],
        handoffSource: "lp-site-estimate",
        dtoVersion: 2,
      }),
    });
    out = await jsonRes(res);
    const snapshotHash = out.data?.snapshotHash || "";
    record(
      "P4-4-register",
      res.status === 200 && out.data?.success && snapshotHash,
      `status=${res.status}`,
    );

    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Phase4Test/1.0" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "ドライバーAPI太郎",
        phone: "09011112222",
        email: "phase4@example.com",
        date: RESERVATION_DATE,
        time: RESERVATION_TIME,
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimate: "12,000円",
        estimateNo: ESTIMATE_NO,
        estimateConsent: {
          estimateNo: ESTIMATE_NO,
          quotedFare: 12000,
          consentText: CONSENT_TEXT,
          consentTextVersion: "2026-06-01-v1",
          snapshotHash,
        },
      }),
    });
    out = await jsonRes(res);
    const reservationId = out.data?.id || "";
    record(
      "P4-5-create-fixed",
      res.status === 200 && reservationId,
      `status=${res.status} id=${reservationId}`,
    );

    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "レガシー次郎",
        phone: "09033334444",
        email: "legacy@example.com",
        date: RESERVATION_DATE,
        time: "14:00",
        pickup: "千葉駅",
        destination: "船橋駅",
        vehicle: "車いす",
        estimate: "5,000円～",
      }),
    });
    out = await jsonRes(res);
    record("P4-6-legacy-create", res.status === 200 && out.data?.success, `status=${res.status}`);

    res = await mf.dispatchFetch(
      `http://localhost/api/driver/reservations?date=${RESERVATION_DATE}`,
      { headers: driverHeaders() },
    );
    out = await jsonRes(res);
    const listIds = (out.data?.reservations || []).map((row) => row.reservationId);
    const legacyId = out.data?.legacyId;
    const legacyRes = await db
      .prepare(`SELECT id FROM reservations WHERE name=? LIMIT 1`)
      .bind("レガシー次郎")
      .first();
    const legacyReservationId = legacyRes?.id || "";
    record(
      "P4-7-list",
      res.status === 200 &&
        out.data?.success &&
        listIds.includes(reservationId) &&
        (!legacyReservationId || !listIds.includes(legacyReservationId)),
      `status=${res.status} count=${listIds.length} ids=${listIds.join(",")}`,
    );

    res = await mf.dispatchFetch(`http://localhost/api/driver/reservations/${reservationId}`, {
      headers: driverHeaders(),
    });
    out = await jsonRes(res);
    const integrity = out.data?.reservation?.integrity;
    record(
      "P4-8-detail-integrity",
      res.status === 200 &&
        out.data?.success &&
        out.data?.reservation?.quoteSnapshot?.fixedFareTotal === 10000 &&
        integrity?.snapshotHashVerified === true &&
        integrity?.confirmedFareMatchesSnapshot === true,
      `status=${res.status} verified=${integrity?.snapshotHashVerified} fareMatch=${integrity?.confirmedFareMatchesSnapshot}`,
    );

    res = await mf.dispatchFetch("http://localhost/api/driver/reservations/not-found-id", {
      headers: driverHeaders(),
    });
    out = await jsonRes(res);
    record("P4-9-not-found", res.status === 404, `status=${res.status}`);

    const failed = results.filter((row) => !row.pass);
    console.log("\nPhase 4 driver API test report:");
    for (const row of results) {
      console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id}: ${row.detail}`);
    }
    if (failed.length) {
      process.exit(1);
    }
  } finally {
    await mf.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
