/**
 * Phase 6: Pre-opening reset admin API tests.
 * Run: node scripts/phase6-pre-opening-reset-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "url";
import path from "path";
import { createMiniflareWorkerOptions, seedTestPublicReservationSettings } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TARGET_FRANCHISEE = "franchisee-target";
const TARGET_STORE = "store-target";
const OTHER_FRANCHISEE = "franchisee-other";
const OTHER_STORE = "store-other";
const EXECUTED_BY = "admin-uid-phase6";

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

async function adminLogin(mf) {
  const res = await mf.dispatchFetch("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "1234" }),
  });
  const out = await jsonRes(res);
  assert(res.status === 200 && out.data?.success && out.data?.token, `admin login failed: ${out.text}`);
  return out.data.token;
}

async function seedScopedReservationData(db, {
  reservationId,
  estimateNo,
  franchiseeId,
  storeId,
  status = "active",
  isTest = 0,
  source = "",
  note = "",
  fareType = "",
  date = "2099-01-01",
  time = "10:00",
  withBlock = true,
  withConsent = true,
  withMeterRun = true,
}) {
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO reservations (
        id, usageType, name, phone, date, time, pickup, destination, vehicle,
        status, is_visible, created_at, estimate_no, franchisee_id, store_id,
        fare_type, confirmed_fare, quote_snapshot_hash, is_test, source, note
      ) VALUES (?, '初めて', 'テスト', '09000000000', ?, ?, 'A', 'B', '車いす',
        ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      reservationId,
      date,
      time,
      status,
      createdAt,
      estimateNo,
      franchiseeId,
      storeId,
      fareType,
      fareType === "fixed" ? 12000 : 0,
      estimateNo ? `hash-${estimateNo}` : "",
      isTest,
      source,
      note
    )
    .run();

  if (withBlock) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO blocks (date, time, type, reservation_id, created_at)
         VALUES (?, ?, 'auto', ?, ?)`
      )
      .bind(date, time, reservationId, createdAt)
      .run();
  }

  if (estimateNo) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO quotes (
          estimate_no, status, total_amount, fare_type, quote_snapshot, snapshot_hash,
          franchisee_id, store_id, created_at, reservation_id
        ) VALUES (?, 'consumed', 12000, 'fixed', '{}', ?, ?, ?, ?, ?)`
      )
      .bind(estimateNo, `hash-${estimateNo}`, franchiseeId, storeId, createdAt, reservationId)
      .run();
  }

  if (withConsent && estimateNo) {
    await db
      .prepare(
        `INSERT INTO quote_consents (
          estimate_no, reservation_id, consent_at, consent_text, consent_text_version,
          snapshot_hash, created_at
        ) VALUES (?, ?, ?, '同意文', 'v1', ?, ?)`
      )
      .bind(estimateNo, reservationId, createdAt, `hash-${estimateNo}`, createdAt)
      .run();
  }

  if (withMeterRun) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO meter_fixed_fare_runs (
          reservation_id, status, confirmed_fare_yen, snapshot_hash,
          started_at, franchisee_id, store_id, created_at, updated_at
        ) VALUES (?, 'in_progress', 12000, ?, ?, ?, ?, ?, ?)`
      )
      .bind(reservationId, `hash-${estimateNo || reservationId}`, createdAt, franchiseeId, storeId, createdAt, createdAt)
      .run();
  }
}

async function countTable(db, table) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first();
  return Number(row?.c || 0);
}

async function main() {
  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "phase6-pre-opening-reset-db" },
    log: new Log(LogLevel.ERROR),
  });

  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await mf.dispatchFetch("http://localhost/api/bootstrap");
  await seedTestPublicReservationSettings(db);

  const token = await adminLogin(mf);
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  await seedScopedReservationData(db, {
    reservationId: "RES-TARGET-ACTIVE",
    estimateNo: "EST-TARGET-ACTIVE",
    franchiseeId: TARGET_FRANCHISEE,
    storeId: TARGET_STORE,
    status: "active",
    time: "10:00",
  });
  await seedScopedReservationData(db, {
    reservationId: "RES-TARGET-TEST",
    estimateNo: "EST-TARGET-TEST",
    franchiseeId: TARGET_FRANCHISEE,
    storeId: TARGET_STORE,
    status: "test",
    isTest: 1,
    source: "prelaunch-test",
    note: "開業前テスト予約",
    time: "10:30",
  });
  await seedScopedReservationData(db, {
    reservationId: "RES-TARGET-CANCEL",
    estimateNo: "EST-TARGET-CANCEL",
    franchiseeId: TARGET_FRANCHISEE,
    storeId: TARGET_STORE,
    status: "cancel",
    time: "11:00",
  });
  await seedScopedReservationData(db, {
    reservationId: "RES-TARGET-FIXED",
    estimateNo: "EST-TARGET-FIXED",
    franchiseeId: TARGET_FRANCHISEE,
    storeId: TARGET_STORE,
    status: "active",
    fareType: "fixed",
    time: "11:30",
  });
  await db
    .prepare(
      `INSERT OR REPLACE INTO quotes (
        estimate_no, status, total_amount, fare_type, quote_snapshot, snapshot_hash,
        franchisee_id, store_id, created_at
      ) VALUES ('EST-TARGET-ORPHAN', 'active', 8000, 'fixed', '{}', 'hash-orphan', ?, ?, ?)`
    )
    .bind(TARGET_FRANCHISEE, TARGET_STORE, new Date().toISOString())
    .run();
  await db
    .prepare(
      `INSERT INTO email_logs (
        created_at, kind, reservation_id, to_email, from_email, subject, status, provider_id, error_message
      ) VALUES (?, 'customer', 'RES-TARGET-ACTIVE', 'test@example.com', 'from@example.com', 'test', 'sent', '', '')`
    )
    .bind(new Date().toISOString())
    .run();
  await db
    .prepare(
      `INSERT INTO pre_opening_reset_logs (
        franchisee_id, store_id, executed_by, executed_at, targets_json, deleted_json, failed_json, success
      ) VALUES (?, ?, 'seed', ?, '{}', '{}', '{}', 1)`
    )
    .bind(TARGET_FRANCHISEE, TARGET_STORE, new Date().toISOString())
    .run();

  await seedScopedReservationData(db, {
    reservationId: "RES-OTHER-KEEP",
    estimateNo: "EST-OTHER-KEEP",
    franchiseeId: OTHER_FRANCHISEE,
    storeId: OTHER_STORE,
    status: "active",
  });

  const results = [];
  const record = (id, pass, detail) => results.push({ id, pass, detail });

  try {
    let res = await mf.dispatchFetch(
      "http://localhost/api/admin/reservations/pre-opening-reset/capability"
    );
    let out = await jsonRes(res);
    record(
      "P6-1-unauthorized",
      res.status === 401,
      `status=${res.status} ${out.text.slice(0, 120)}`
    );

    res = await mf.dispatchFetch(
      "http://localhost/api/admin/reservations/pre-opening-reset/capability",
      { headers: authHeaders }
    );
    out = await jsonRes(res);
    record(
      "P6-2-capability-supported",
      res.status === 200 && out.data?.supported === true,
      `status=${res.status} supported=${out.data?.supported}`
    );

    res = await mf.dispatchFetch(
      `http://localhost/api/admin/reservations/pre-opening-reset/capability?franchiseeId=${TARGET_FRANCHISEE}&storeId=${TARGET_STORE}`,
      { headers: authHeaders }
    );
    out = await jsonRes(res);
    record(
      "P6-3-capability-targets",
      res.status === 200 &&
        out.data?.supported === true &&
        out.data?.targets?.reservations === 4 &&
        out.data?.targets?.quotes === 5 &&
        out.data?.targets?.quote_consents === 4 &&
        out.data?.targets?.meter_fixed_fare_runs === 4 &&
        out.data?.targets?.blocks === 3 &&
        out.data?.targets?.email_logs === 1 &&
        out.data?.targets?.pre_opening_reset_logs === 1,
      `status=${res.status} targets=${JSON.stringify(out.data?.targets)}`
    );

    res = await mf.dispatchFetch("http://localhost/api/admin/reservations/pre-opening-reset", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        franchiseeId: TARGET_FRANCHISEE,
        storeId: TARGET_STORE,
        confirmText: "NOPE",
        executedBy: EXECUTED_BY,
      }),
    });
    out = await jsonRes(res);
    record(
      "P6-4-bad-confirm",
      res.status === 400 && out.data?.success === false,
      `status=${res.status} ${out.text.slice(0, 120)}`
    );

    res = await mf.dispatchFetch("http://localhost/api/admin/reservations/pre-opening-reset", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        franchiseeId: "",
        storeId: TARGET_STORE,
        confirmText: "RESET",
        executedBy: EXECUTED_BY,
      }),
    });
    out = await jsonRes(res);
    record(
      "P6-5-missing-scope",
      res.status === 400 && out.data?.success === false,
      `status=${res.status} ${out.text.slice(0, 120)}`
    );

    res = await mf.dispatchFetch("http://localhost/api/admin/reservations/pre-opening-reset", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        franchiseeId: TARGET_FRANCHISEE,
        storeId: TARGET_STORE,
        confirmText: "RESET",
        executedBy: EXECUTED_BY,
      }),
    });
    out = await jsonRes(res);
    record(
      "P6-6-reset-success",
      res.status === 200 &&
        out.data?.success === true &&
        out.data?.targets?.reservations === 4 &&
        out.data?.deleted?.reservations === 4 &&
        out.data?.deleted?.blocks === 3 &&
        out.data?.deleted?.email_logs === 1 &&
        out.data?.deleted?.pre_opening_reset_logs === 1 &&
        out.data?.failed?.reservations === 0 &&
        (out.data?.logId === null || out.data?.logId === 0),
      `status=${res.status} deleted=${JSON.stringify(out.data?.deleted)}`
    );

    const targetReservations = await db
      .prepare(
        `SELECT COUNT(*) AS c FROM reservations
         WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`
      )
      .bind(TARGET_FRANCHISEE, TARGET_STORE)
      .first();
    const otherReservations = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE id = 'RES-OTHER-KEEP'`)
      .first();
    const logCount = await countTable(db, "pre_opening_reset_logs");
    record(
      "P6-7-scope-preserved",
      Number(targetReservations?.c || 0) === 0 &&
        Number(otherReservations?.c || 0) === 1 &&
        logCount === 0,
      `target=${targetReservations?.c} other=${otherReservations?.c} logs=${logCount}`
    );

    const emailLogCount = await countTable(db, "email_logs");
    record(
      "P6-9-logs-cleared",
      emailLogCount === 0,
      `email_logs=${emailLogCount}`
    );

    const orphanQuote = await db
      .prepare(`SELECT estimate_no FROM quotes WHERE estimate_no = 'EST-TARGET-ORPHAN'`)
      .first();
    record(
      "P6-8-orphan-quote-deleted",
      !orphanQuote,
      `orphanQuote=${orphanQuote?.estimate_no || "deleted"}`
    );
  } catch (error) {
    record("P6-ERROR", false, String(error?.message || error));
  }

  const failed = results.filter((r) => !r.pass);
  console.log("Phase 6 pre-opening reset tests");
  for (const row of results) {
    console.log(`${row.pass ? "PASS" : "FAIL"} ${row.id}: ${row.detail}`);
  }
  if (failed.length) {
    process.exitCode = 1;
    throw new Error(`${failed.length} test(s) failed`);
  }
  console.log(`All ${results.length} tests passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
