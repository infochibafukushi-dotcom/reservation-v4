/**
 * Phase 5: Driver fixed-fare run start/complete API.
 * Run: node scripts/phase5-driver-fixed-fare-run-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "url";
import path from "path";
import { createMiniflareWorkerOptions } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LP_ORIGIN = "https://infochibafukushi-dotcom.github.io";
const DRIVER_TOKEN = "phase5-driver-token";
const ESTIMATE_NO = "EST-PHASE5-DRIVER-001";
const RESERVATION_DATE = "2099-11-20";
const RESERVATION_TIME = "09:00";

const quoteSnapshot = {
  fixedFareTotal: 10000,
  serviceFees: [{ key: "assistanceFee", label: "介助料金", amount: 2000 }],
  fareMode: "distance",
  fareVersion: "v1",
  quoteVersion: 1,
  selectedRouteId: "route_0",
  selectedUsesToll: true,
  preFixedFareConfirmable: true,
};

function buildConsentText(estimateNo) {
  return `見積番号 ${estimateNo} の確定運賃 12,000円 および上記見積内容に同意して予約する`;
}

function driverHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${DRIVER_TOKEN}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function jsonRes(res) {
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text), text };
  } catch {
    return { status: res.status, data: null, text };
  };
}

async function createFixedReservation(mf, { estimateNo = ESTIMATE_NO, time = RESERVATION_TIME } = {}) {
  let res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: LP_ORIGIN },
    body: JSON.stringify({
      estimateNo,
      total: 12000,
      fareType: "fixed",
      quoteSnapshot,
      routePlan: { pickup: "千葉駅", destination: "東京駅", selectedRouteId: "route_0" },
      usageSummary: [{ label: "移動方法", value: "車いす" }],
      handoffSource: "lp-site-estimate",
      dtoVersion: 2,
    }),
  });
  let out = await jsonRes(res);
  const snapshotHash = out.data?.snapshotHash || "";
  if (!snapshotHash) {
    throw new Error(`quote register failed: ${out.text}`);
  }

  res = await mf.dispatchFetch("http://localhost/api/createReservation", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Phase5Test/1.0" },
    body: JSON.stringify({
      usageType: "初めて",
      name: `Phase5固定-${estimateNo}`,
      phone: "09055556666",
      email: `${estimateNo}@example.com`,
      date: RESERVATION_DATE,
      time,
      pickup: "千葉駅",
      destination: "東京駅",
      vehicle: "車いす",
      estimate: "12,000円",
      estimateNo,
      estimateConsent: {
        estimateNo,
        quotedFare: 12000,
        consentText: buildConsentText(estimateNo),
        consentTextVersion: "2026-06-01-v1",
        snapshotHash,
      },
    }),
  });
  out = await jsonRes(res);
  const reservationId = out.data?.id || "";
  if (!reservationId) {
    throw new Error(`createReservation failed: ${out.text}`);
  }
  return reservationId;
}

async function createLegacyReservation(mf) {
  const res = await mf.dispatchFetch("http://localhost/api/createReservation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usageType: "初めて",
      name: "Phase5レガシー次郎",
      phone: "09077778888",
      email: "legacy-phase5@example.com",
      date: RESERVATION_DATE,
      time: "11:00",
      pickup: "千葉駅",
      destination: "船橋駅",
      vehicle: "車いす",
      estimate: "5,000円～",
    }),
  });
  const out = await jsonRes(res);
  const reservationId = out.data?.id || "";
  if (!reservationId) {
    throw new Error(`legacy createReservation failed: ${out.text}`);
  }
  return reservationId;
}

async function main() {
  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    bindings: {
      LP_REGISTER_TOKEN: "",
      METER_DRIVER_TOKEN: DRIVER_TOKEN,
    },
    d1Databases: { DB: "phase5-driver-db" },
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

  const results = [];
  const record = (id, pass, detail) => results.push({ id, pass, detail });

  try {
    const reservationId = await createFixedReservation(mf);
    const legacyReservationId = await createLegacyReservation(mf);
    const startUrl = `http://localhost/api/driver/reservations/${reservationId}/start-fixed-fare`;
    const completeUrl = `http://localhost/api/driver/reservations/${reservationId}/complete-fixed-fare`;

    let res = await mf.dispatchFetch(startUrl, { method: "POST" });
    let out = await jsonRes(res);
    record("P5-1-unauthorized", res.status === 401, `status=${res.status}`);

    res = await mf.dispatchFetch(
      `http://localhost/api/driver/reservations/not-found-id/start-fixed-fare`,
      { method: "POST", headers: driverHeaders(), body: "{}" },
    );
    out = await jsonRes(res);
    record("P5-2-not-found", res.status === 404, `status=${res.status}`);

    res = await mf.dispatchFetch(
      `http://localhost/api/driver/reservations/${legacyReservationId}/start-fixed-fare`,
      { method: "POST", headers: driverHeaders(), body: "{}" },
    );
    out = await jsonRes(res);
    record(
      "P5-3-non-fixed",
      res.status === 404,
      `status=${res.status} message=${out.data?.message || ""}`,
    );

    res = await mf.dispatchFetch(startUrl, {
      method: "POST",
      headers: driverHeaders(),
      body: JSON.stringify({ clientStartedAt: "2099-01-01T00:00:00.000Z" }),
    });
    out = await jsonRes(res);
    const startedAt = out.data?.run?.startedAt || "";
    record(
      "P5-4-start-ok",
      res.status === 200 &&
        out.data?.success &&
        out.data?.run?.status === "in_progress" &&
        out.data?.run?.meterRunStatus === "in_progress" &&
        startedAt &&
        startedAt !== "2099-01-01T00:00:00.000Z",
      `status=${res.status} startedAt=${startedAt}`,
    );

    res = await mf.dispatchFetch(startUrl, {
      method: "POST",
      headers: driverHeaders(),
      body: "{}",
    });
    out = await jsonRes(res);
    record("P5-5-double-start", res.status === 409, `status=${res.status}`);

    res = await mf.dispatchFetch(
      `http://localhost/api/driver/reservations?date=${RESERVATION_DATE}`,
      { headers: driverHeaders() },
    );
    out = await jsonRes(res);
    const listRow = (out.data?.reservations || []).find((row) => row.reservationId === reservationId);
    record(
      "P5-6-list-in-progress",
      res.status === 200 && listRow?.meterRunStatus === "in_progress",
      `status=${res.status} meterRunStatus=${listRow?.meterRunStatus || ""}`,
    );

    res = await mf.dispatchFetch(`http://localhost/api/driver/reservations/${reservationId}`, {
      headers: driverHeaders(),
    });
    out = await jsonRes(res);
    record(
      "P5-7-detail-in-progress",
      res.status === 200 && out.data?.reservation?.meterRunStatus === "in_progress",
      `status=${res.status} meterRunStatus=${out.data?.reservation?.meterRunStatus || ""}`,
    );

    res = await mf.dispatchFetch(completeUrl, {
      method: "POST",
      headers: driverHeaders(),
      body: "{}",
    });
    out = await jsonRes(res);
    const completedAt = out.data?.run?.completedAt || "";
    record(
      "P5-8-complete-ok",
      res.status === 200 &&
        out.data?.success &&
        out.data?.run?.status === "completed" &&
        out.data?.run?.meterRunStatus === "completed" &&
        completedAt,
      `status=${res.status} completedAt=${completedAt}`,
    );

    res = await mf.dispatchFetch(completeUrl, {
      method: "POST",
      headers: driverHeaders(),
      body: "{}",
    });
    out = await jsonRes(res);
    record("P5-9-double-complete", res.status === 409, `status=${res.status}`);

    res = await mf.dispatchFetch(
      `http://localhost/api/driver/reservations?date=${RESERVATION_DATE}`,
      { headers: driverHeaders() },
    );
    out = await jsonRes(res);
    const completedListRow = (out.data?.reservations || []).find(
      (row) => row.reservationId === reservationId,
    );
    record(
      "P5-10-list-completed",
      res.status === 200 && completedListRow?.meterRunStatus === "completed",
      `status=${res.status} meterRunStatus=${completedListRow?.meterRunStatus || ""}`,
    );

    res = await mf.dispatchFetch(`http://localhost/api/driver/reservations/${reservationId}`, {
      headers: driverHeaders(),
    });
    out = await jsonRes(res);
    record(
      "P5-11-detail-completed",
      res.status === 200 && out.data?.reservation?.meterRunStatus === "completed",
      `status=${res.status} meterRunStatus=${out.data?.reservation?.meterRunStatus || ""}`,
    );

    const freshReservationId = await createFixedReservation(mf, {
      estimateNo: "EST-PHASE5-DRIVER-002",
      time: "13:00",
    });
    res = await mf.dispatchFetch(
      `http://localhost/api/driver/reservations/${freshReservationId}/complete-fixed-fare`,
      { method: "POST", headers: driverHeaders(), body: "{}" },
    );
    out = await jsonRes(res);
    record("P5-12-complete-before-start", res.status === 409, `status=${res.status}`);

    const failed = results.filter((row) => !row.pass);
    console.log("\nPhase 5 driver fixed-fare run test report:");
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
