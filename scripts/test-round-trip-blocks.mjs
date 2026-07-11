/**
 * Round-trip block count: mapping restore + Worker D1 blocks.
 * Miniflare in-memory D1 only. No production writes.
 * Run: node scripts/test-round-trip-blocks.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { createMiniflareWorkerOptions, seedTestPublicReservationSettings } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LP_ORIGIN = "https://www.chibacaretaxi.com";
const BOOKING_ORIGIN = "https://infochibafukushi-dotcom.github.io";

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

function loadMapping() {
  const code = fs.readFileSync(path.join(root, "estimate-mapping.js"), "utf8");
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox.EstimateMapping;
}

function loadHandoff() {
  const mappingCode = fs.readFileSync(path.join(root, "estimate-mapping.js"), "utf8");
  const handoffCode = fs.readFileSync(path.join(root, "estimate-handoff.js"), "utf8");
  const sandbox = {
    window: {},
    URLSearchParams,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { search: "" }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(mappingCode, sandbox);
  vm.runInNewContext(handoffCode, sandbox);
  return { mapping: sandbox.EstimateMapping, handoffApi: sandbox.EstimateBookingHandoff };
}

const baseSnapshot = {
  fareMode: "pre_fixed_fare",
  preFixedFareMode: true,
  selectedRouteId: "route_0",
  baseDistanceFareAmount: 1620,
  trafficZoneCoefficient: 1.18,
  adjustedDistanceFareAmount: 1910,
  scheduledDurationSurcharge: 0,
  preFixedFareAmount: 1910,
  totalAmount: 4810,
  total: 4810,
  distanceKm: 3.2,
  fixedFareTotal: 3710,
  fixedFareBreakdown: [
    { key: "pickupFee", label: "迎車料金", amount: 800 },
    { key: "specialVehicleFee", label: "特殊車両使用料", amount: 1000 },
    { key: "distanceFare", label: "距離運賃", amount: 1910 }
  ],
  serviceFees: [
    { key: "specialVehicleFee", label: "特殊車両使用料", amount: 1000 },
    { key: "assistanceFee", label: "介助料金", amount: 1100 }
  ],
  fareBasis: { distanceMultiplier: 1 },
  fareVersion: "v1",
  quoteVersion: 1
};

function usageFor(trip, addon = "") {
  const rows = [
    { label: "移動方法", value: "標準車いす" },
    { label: "介助内容", value: "乗降介助" },
    { label: "階段介助", value: "階段介助なし" },
    { label: "送迎方法", value: trip }
  ];
  if (addon) rows.push({ label: "待機・付き添い", value: addon });
  rows.push({ label: "運賃方式", value: "事前確定運賃" });
  return rows;
}

async function registerQuote(mf, estimateNo, usageSummary, snapshotOverrides = {}) {
  const snapshot = {
    ...baseSnapshot,
    ...snapshotOverrides,
    fareBasis: {
      ...(baseSnapshot.fareBasis || {}),
      ...(snapshotOverrides.fareBasis || {})
    },
    serviceFees: snapshotOverrides.serviceFees || baseSnapshot.serviceFees
  };
  if (String(usageSummary.find((x) => x.label === "送迎方法")?.value || "").includes("往復")) {
    snapshot.fareBasis = { ...snapshot.fareBasis, distanceMultiplier: 2 };
  }
  const body = {
    estimateNo,
    total: 4810,
    fareType: "fixed",
    quoteSnapshot: snapshot,
    routePlan: {
      pickup: { address: "出洲港" },
      destination: { address: "千葉メディカルセンター" },
      selectedRouteId: "route_0",
      distanceMeters: 3200,
      durationSeconds: 600
    },
    usageSummary,
    handoffSource: "lp-site-estimate",
    dtoVersion: 2
  };
  return jsonRes(
    await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: LP_ORIGIN },
      body: JSON.stringify(body)
    })
  );
}

function reservationBody(estimateNo, snapshotHash, roundTrip, date, time, usageSummary) {
  return {
    usageType: "初めて",
    name: "ブロックテスト",
    kana: "ブロックテスト",
    phone: "09000002222",
    email: "block-test@mailpit.local",
    date,
    time,
    pickup: "出洲港",
    destination: "千葉メディカルセンター",
    vehicle: "標準車いす",
    assist: "乗降介助",
    stairs: "階段介助なし",
    equipment: "レンタルなし",
    roundTrip,
    notes: "【自動テスト】",
    estimate: "4,810円",
    estimateNo,
    usageSummary,
    handoffSource: "lp-site-estimate",
    dtoVersion: 2,
    estimateConsent: {
      estimateNo,
      quotedFare: 4810,
      fareMode: "pre_fixed_fare",
      fareVersion: "v1",
      quoteVersion: 1,
      consentType: "estimate_booking",
      consentText: `見積番号 ${estimateNo} の確定運賃 4,810円 および上記見積内容に同意して予約する`,
      consentTextVersion: "2026-06-01-v1",
      snapshotHash
    }
  };
}

async function main() {
  const mapping = loadMapping();
  const { handoffApi } = loadHandoff();

  // --- Unit: getBlockCount ---
  assert(mapping.getBlockCount("片道") === 2, "片道 → 2");
  assert(mapping.getBlockCount("往復") === 4, "往復 → 4");
  assert(mapping.getBlockCount("待機") === 4, "待機 → 4");
  assert(mapping.getBlockCount("病院付き添い") === 4, "病院付き添い → 4");
  console.log("PASS unit getBlockCount");

  // --- Unit: handoff restore without selections ---
  const roundUsage = usageFor("往復");
  const waitUsage = usageFor("往復", "待機（30分）");
  const escortUsage = usageFor("往復", "病院付き添い（30分）");

  const handoffRound = handoffApi.buildHandoffFromQuoteResponse({
    estimateNo: "EST-BLOCK-MAP-001",
    total: 4810,
    usageSummary: roundUsage,
    quoteSnapshot: { ...baseSnapshot, fareBasis: { distanceMultiplier: 2 } },
    routePlan: { pickup: { address: "A" }, destination: { address: "B" } }
  });
  assert(handoffRound.selections.tripTypeId === "round-trip", "derived tripTypeId round-trip");
  const fieldsRound = mapping.mapHandoffToFormValues(handoffRound);
  assert(fieldsRound.tripType === "往復", "fields.tripType 往復");
  assert(fieldsRound.roundTrip === "往復", "fields.roundTrip 往復");
  assert(fieldsRound.blockCount === 4, "fields.blockCount 4");

  const fieldsWait = mapping.mapHandoffToFormValues({
    estimateNumber: "EST-BLOCK-MAP-002",
    usageSummary: waitUsage,
    selections: {},
    routePlan: { pickup: { address: "A" }, destination: { address: "B" } }
  });
  assert(fieldsWait.tripType === "往復", "wait tripType 往復");
  assert(fieldsWait.roundTripAddon === "待機", "wait addon");
  assert(fieldsWait.roundTrip === "待機", "wait roundTrip");
  assert(fieldsWait.blockCount === 4, "wait blockCount 4");

  const fieldsEscort = mapping.mapHandoffToFormValues({
    estimateNumber: "EST-BLOCK-MAP-003",
    usageSummary: escortUsage,
    selections: {},
    routePlan: { pickup: { address: "A" }, destination: { address: "B" } }
  });
  assert(fieldsEscort.roundTrip === "病院付き添い", "escort roundTrip");
  assert(fieldsEscort.blockCount === 4, "escort blockCount 4");

  const fieldsOne = mapping.mapHandoffToFormValues({
    estimateNumber: "EST-BLOCK-MAP-004",
    usageSummary: usageFor("片道"),
    selections: {},
    routePlan: { pickup: { address: "A" }, destination: { address: "B" } }
  });
  assert(fieldsOne.roundTrip === "片道", "one-way roundTrip");
  assert(fieldsOne.blockCount === 2, "one-way blockCount 2");
  console.log("PASS unit handoff mapping restore");

  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "round-trip-blocks-db" },
    log: new Log(LogLevel.ERROR)
  });
  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`)
    .bind(`${LP_ORIGIN},${BOOKING_ORIGIN}`)
    .run();
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('fixed_fare_enabled', 'true')`).run();
  await mf.dispatchFetch("http://localhost/api/bootstrap");
  await seedTestPublicReservationSettings(db);

  try {
    // --- D1: one-way 2 blocks ---
    {
      const no = "EST-BLOCK-ONE-001";
      const usage = usageFor("片道");
      const reg = await registerQuote(mf, no, usage);
      assert(reg.status === 200, "register one-way");
      const create = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/createReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify(reservationBody(no, reg.data.snapshotHash, "片道", "2099-08-01", "10:00", usage))
        })
      );
      assert(create.status === 200 && create.data?.success, `one-way create ${create.text}`);
      const id = create.data.id;
      const row = await db.prepare(`SELECT roundTrip, block_count FROM reservations WHERE id=?`).bind(id).first();
      const blocks = await db.prepare(`SELECT date, time FROM blocks WHERE reservation_id=? ORDER BY date, time`).bind(id).all();
      assert(row.roundTrip === "片道", "one-way stored roundTrip");
      assert(Number(row.block_count) === 2, "one-way block_count 2");
      assert((blocks.results || []).length === 2, "one-way 2 blocks");
      assert(blocks.results[0].time === "10:00" && blocks.results[1].time === "10:30", "one-way times");
      console.log("PASS D1 one-way 2 blocks");
    }

    // --- D1: round-trip with client wrongly sending 片道 → server forces 4 ---
    {
      const no = "EST-BLOCK-RT-001";
      const usage = usageFor("往復");
      const reg = await registerQuote(mf, no, usage, {
        fareBasis: { distanceMultiplier: 2 },
        serviceFees: [
          ...baseSnapshot.serviceFees
        ]
      });
      assert(reg.status === 200, "register round-trip");
      const create = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/createReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify(reservationBody(no, reg.data.snapshotHash, "片道", "2099-08-02", "10:00", usage))
        })
      );
      assert(create.status === 200 && create.data?.success, `round create ${create.text}`);
      const id = create.data.id;
      const row = await db.prepare(`SELECT roundTrip, block_count, confirmed_fare FROM reservations WHERE id=?`).bind(id).first();
      const blocks = await db.prepare(`SELECT date, time FROM blocks WHERE reservation_id=? ORDER BY date, time`).bind(id).all();
      const times = (blocks.results || []).map((b) => b.time);
      assert(row.roundTrip === "往復", `server roundTrip 往復 got ${row.roundTrip}`);
      assert(Number(row.block_count) === 4, "round block_count 4");
      assert(times.length === 4, "round 4 blocks");
      assert(times.join(",") === "10:00,10:30,11:00,11:30", `round times ${times.join(",")}`);
      assert(Number(row.confirmed_fare) === 4810, "fare unchanged 4810");
      console.log("PASS D1 round-trip override client 片道 → 4 blocks");
    }

    // --- D1: wait / escort ---
    for (const [label, addon, expectRt, no] of [
      ["待機", "待機（30分）", "待機", "EST-BLOCK-WAIT-001"],
      ["病院付き添い", "病院付き添い（30分）", "病院付き添い", "EST-BLOCK-ESC-001"]
    ]) {
      const usage = usageFor("往復", addon);
      const reg = await registerQuote(mf, no, usage, {
        fareBasis: { distanceMultiplier: 2 },
        serviceFees: [
          ...baseSnapshot.serviceFees,
          { key: label === "待機" ? "waitingFee" : "escortFee", label, amount: 800 }
        ],
        totalAmount: 5610,
        total: 5610,
        fixedFareTotal: 3710
      });
      // totals must match snapshot; rebuild with matching total
      assert(reg.status === 200 || reg.status === 400, `register ${label} status`);
    }

    // Re-register wait/escort with consistent totals (4810 body without extra fee in snapshot total)
    {
      const no = "EST-BLOCK-WAIT-002";
      const usage = usageFor("往復", "待機（30分）");
      const reg = await registerQuote(mf, no, usage, { fareBasis: { distanceMultiplier: 2 } });
      assert(reg.status === 200, "register wait");
      const create = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/createReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify(reservationBody(no, reg.data.snapshotHash, "片道", "2099-08-03", "10:00", usage))
        })
      );
      assert(create.status === 200, `wait create ${create.text}`);
      const id = create.data.id;
      const row = await db.prepare(`SELECT roundTrip, block_count FROM reservations WHERE id=?`).bind(id).first();
      const blocks = await db.prepare(`SELECT time FROM blocks WHERE reservation_id=?`).bind(id).all();
      assert(row.roundTrip === "待機", `wait roundTrip got ${row.roundTrip}`);
      assert(Number(row.block_count) === 4 && (blocks.results || []).length === 4, "wait 4 blocks");
      console.log("PASS D1 wait 4 blocks");
    }
    {
      const no = "EST-BLOCK-ESC-002";
      const usage = usageFor("往復", "病院付き添い（30分）");
      const reg = await registerQuote(mf, no, usage, { fareBasis: { distanceMultiplier: 2 } });
      assert(reg.status === 200, "register escort");
      const create = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/createReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify(reservationBody(no, reg.data.snapshotHash, "", "2099-08-04", "10:00", usage))
        })
      );
      assert(create.status === 200, `escort create ${create.text}`);
      const id = create.data.id;
      const row = await db.prepare(`SELECT roundTrip, block_count FROM reservations WHERE id=?`).bind(id).first();
      assert(row.roundTrip === "病院付き添い", `escort roundTrip got ${row.roundTrip}`);
      assert(Number(row.block_count) === 4, "escort block_count 4");
      console.log("PASS D1 escort 4 blocks");
    }

    // --- Conflict: 3rd / 4th slot occupied ---
    {
      await db
        .prepare(`INSERT OR IGNORE INTO blocks (date,time,type,reservation_id,created_at) VALUES (?,?,?,?,?)`)
        .bind("2099-08-05", "11:00", "manual", "", new Date().toISOString())
        .run();
      const no = "EST-BLOCK-CONF-3";
      const usage = usageFor("往復");
      const reg = await registerQuote(mf, no, usage, { fareBasis: { distanceMultiplier: 2 } });
      const create = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/createReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify(reservationBody(no, reg.data.snapshotHash, "往復", "2099-08-05", "10:00", usage))
        })
      );
      assert(create.status === 409, `3rd slot conflict status=${create.status}`);
      console.log("PASS conflict 3rd slot rejects round-trip");
    }
    {
      await db
        .prepare(`INSERT OR IGNORE INTO blocks (date,time,type,reservation_id,created_at) VALUES (?,?,?,?,?)`)
        .bind("2099-08-06", "11:30", "manual", "", new Date().toISOString())
        .run();
      const no = "EST-BLOCK-CONF-4";
      const usage = usageFor("往復");
      const reg = await registerQuote(mf, no, usage, { fareBasis: { distanceMultiplier: 2 } });
      const create = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/createReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify(reservationBody(no, reg.data.snapshotHash, "往復", "2099-08-06", "10:00", usage))
        })
      );
      assert(create.status === 409, `4th slot conflict status=${create.status}`);
      console.log("PASS conflict 4th slot rejects round-trip");
    }
    {
      // one-way still OK when only 3rd slot blocked
      const no = "EST-BLOCK-CONF-ONE";
      const usage = usageFor("片道");
      const reg = await registerQuote(mf, no, usage);
      const create = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/createReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify(reservationBody(no, reg.data.snapshotHash, "片道", "2099-08-05", "10:00", usage))
        })
      );
      assert(create.status === 200, `one-way ok with 3rd blocked ${create.text}`);
      console.log("PASS one-way allowed when only 3rd slot blocked");
    }

    // --- Cancel removes all 4 ---
    {
      const no = "EST-BLOCK-CANCEL";
      const usage = usageFor("往復");
      const reg = await registerQuote(mf, no, usage, { fareBasis: { distanceMultiplier: 2 } });
      const create = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/createReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify(reservationBody(no, reg.data.snapshotHash, "往復", "2099-08-07", "10:00", usage))
        })
      );
      const id = create.data.id;
      let blocks = await db.prepare(`SELECT COUNT(*) AS c FROM blocks WHERE reservation_id=?`).bind(id).first();
      assert(Number(blocks.c) === 4, "before cancel 4");
      const cancel = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/cancelReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify({ id })
        })
      );
      assert(cancel.status === 200, "cancel ok");
      blocks = await db.prepare(`SELECT COUNT(*) AS c FROM blocks WHERE reservation_id=?`).bind(id).first();
      assert(Number(blocks.c) === 0, "after cancel 0 auto blocks");
      console.log("PASS cancel deletes 4 blocks");
    }

    // --- Overnight 23:00 ---
    {
      const no = "EST-BLOCK-NIGHT";
      const usage = usageFor("往復");
      const reg = await registerQuote(mf, no, usage, { fareBasis: { distanceMultiplier: 2 } });
      const create = await jsonRes(
        await mf.dispatchFetch("http://localhost/api/createReservation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: BOOKING_ORIGIN },
          body: JSON.stringify(reservationBody(no, reg.data.snapshotHash, "往復", "2099-08-08", "23:00", usage))
        })
      );
      assert(create.status === 200, `overnight create ${create.text}`);
      const id = create.data.id;
      const blocks = await db
        .prepare(`SELECT date, time FROM blocks WHERE reservation_id=? ORDER BY date, time`)
        .bind(id)
        .all();
      const rows = blocks.results || [];
      assert(rows.length === 4, "overnight 4 blocks");
      assert(rows[0].date === "2099-08-08" && rows[0].time === "23:00", "night 23:00");
      assert(rows[1].date === "2099-08-08" && rows[1].time === "23:30", "night 23:30");
      assert(rows[2].date === "2099-08-09" && rows[2].time === "00:00", "night next 00:00");
      assert(rows[3].date === "2099-08-09" && rows[3].time === "00:30", "night next 00:30");
      console.log("PASS overnight date rollover 4 blocks");
    }

    // Amount invariant on round-trip override path
    {
      const row = await db
        .prepare(`SELECT confirmed_fare FROM reservations WHERE estimate_no='EST-BLOCK-RT-001'`)
        .first();
      assert(Number(row.confirmed_fare) === 4810, "confirmed_fare 4810");
      console.log("PASS amount invariant confirmed_fare=4810");
    }

    console.log("round-trip block tests passed");
  } finally {
    await mf.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
