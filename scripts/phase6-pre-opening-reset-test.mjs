/**
 * Phase 6: Pre-opening reset admin API tests.
 * Run: node scripts/phase6-pre-opening-reset-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "url";
import path from "path";
import { createMiniflareWorkerOptions } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TARGET_FRANCHISEE = "franchisee-target";
const TARGET_STORE = "store-target";
const OTHER_FRANCHISEE = "franchisee-other";
const OTHER_STORE = "store-other";
const EXECUTED_BY = "admin-uid-phase6";
const PUBLIC_START_AT = "2027-04-01T00:00:00+09:00";

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

async function seedPrelaunchSettings(db) {
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('reservation_public_start_at', ?)`)
    .bind(PUBLIC_START_AT)
    .run();
}

async function seedScopedReservationData(db, {
  reservationId,
  estimateNo = "",
  franchiseeId = "",
  storeId = "",
  status = "active",
  isTest = 0,
  source = "",
  note = "",
  fareType = "",
  date = "2099-01-01",
  time = "10:00",
  createdAt = "2026-01-15T10:00:00.000Z",
  withBlock = true,
  withConsent = false,
  withMeterRun = false,
}) {
  await db
    .prepare(
      `INSERT OR REPLACE INTO reservations (
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
        `INSERT OR REPLACE INTO quote_consents (
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
      .bind(
        reservationId,
        `hash-${estimateNo || reservationId}`,
        createdAt,
        franchiseeId,
        storeId,
        createdAt,
        createdAt
      )
      .run();
  }
}

async function countTable(db, table) {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first();
  return Number(row?.c || 0);
}

async function seedLegacyPreOpeningBatch(db, count = 13) {
  for (let i = 1; i <= count; i += 1) {
    const hh = String(9 + Math.floor((i - 1) / 2)).padStart(2, "0");
    const mm = (i - 1) % 2 === 0 ? "00" : "30";
    const reservationId = `RES-LEGACY-${String(i).padStart(2, "0")}`;
    await seedScopedReservationData(db, {
      reservationId,
      estimateNo: i <= 5 ? `EST-LEGACY-${String(i).padStart(2, "0")}` : "",
      franchiseeId: "",
      storeId: "",
      createdAt: `2026-02-${String(Math.min(i, 28)).padStart(2, "0")}T10:00:00.000Z`,
      time: `${hh}:${mm}`,
      withConsent: i <= 5,
    });
    if (i <= 5) {
      await db
        .prepare(
          `INSERT INTO email_logs (
            created_at, kind, reservation_id, to_email, from_email, subject, status, provider_id, error_message
          ) VALUES (?, 'customer', ?, 'test@example.com', 'from@example.com', 'test', 'sent', '', '')`
        )
        .bind(`2026-02-${String(Math.min(i, 28)).padStart(2, "0")}T10:00:00.000Z`, reservationId)
        .run();
    }
  }
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
  await seedPrelaunchSettings(db);
  for (const table of [
    "email_logs",
    "quote_consents",
    "blocks",
    "meter_fixed_fare_runs",
    "quotes",
    "reservations",
    "pre_opening_reset_logs",
  ]) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }

  const token = await adminLogin(mf);
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  await seedLegacyPreOpeningBatch(db, 13);

  const results = [];
  const record = (id, pass, detail) => results.push({ id, pass, detail });

  try {
    let res = await mf.dispatchFetch(
      "http://localhost/api/admin/reservations/pre-opening-reset/capability?franchiseeId=&storeId=&scope=reservations",
      { headers: authHeaders }
    );
    let out = await jsonRes(res);
    record(
      "P6-legacy-capability-aligned",
      res.status === 200 &&
        out.data?.legacyAdminScope === true &&
        out.data?.dashboard?.totalReservations === 13 &&
        out.data?.targets?.reservations === 13 &&
        out.data?.countsAligned === true,
      `status=${res.status} dashboard=${JSON.stringify(out.data?.dashboard)} targets=${JSON.stringify(out.data?.targets)} aligned=${out.data?.countsAligned}`
    );

    res = await mf.dispatchFetch("http://localhost/api/admin/reservations/pre-opening-reset", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        franchiseeId: "",
        storeId: "",
        confirmText: "RESET",
        executedBy: EXECUTED_BY,
        scope: "reservations",
      }),
    });
    out = await jsonRes(res);
    record(
      "P6-legacy-reset-clears-13",
      res.status === 200 &&
        out.data?.success === true &&
        out.data?.deleted?.reservations === 13 &&
        out.data?.deleted?.blocks === 0,
      `status=${res.status} deleted=${JSON.stringify(out.data?.deleted)}`
    );

    const legacyRemaining = await db
      .prepare(
        `SELECT COUNT(*) AS c FROM reservations
         WHERE COALESCE(is_test, 0) != 1
           AND LOWER(COALESCE(status, '')) != 'test'`
      )
      .first();
    record("P6-legacy-all-cleared", Number(legacyRemaining?.c || 0) === 0, `remaining=${legacyRemaining?.c}`);

    await seedScopedReservationData(db, {
      reservationId: "RES-LEGACY-PRODUCTION",
      estimateNo: "EST-LEGACY-PRODUCTION",
      franchiseeId: "",
      storeId: "",
      createdAt: "2028-01-01T10:00:00.000Z",
      time: "18:00",
      withConsent: true,
    });
    await seedLegacyPreOpeningBatch(db, 3);

    res = await mf.dispatchFetch(
      "http://localhost/api/admin/reservations/pre-opening-reset/capability?franchiseeId=&storeId=&scope=reservations",
      { headers: authHeaders }
    );
    out = await jsonRes(res);
    record(
      "P6-legacy-mismatch-with-production",
      res.status === 200 &&
        out.data?.dashboard?.totalReservations === 4 &&
        out.data?.targets?.reservations === 3 &&
        out.data?.countsAligned === false,
      `status=${res.status} dashboard=${JSON.stringify(out.data?.dashboard)} targets=${JSON.stringify(out.data?.targets)}`
    );

    res = await mf.dispatchFetch("http://localhost/api/admin/reservations/pre-opening-reset", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        franchiseeId: "",
        storeId: "",
        confirmText: "RESET",
        executedBy: EXECUTED_BY,
        scope: "reservations",
      }),
    });
    out = await jsonRes(res);
    record(
      "P6-legacy-reset-rejected-when-mismatch",
      res.status === 409 && out.data?.success === false,
      `status=${res.status} ${out.text.slice(0, 160)}`
    );

    await seedScopedReservationData(db, {
      reservationId: "RES-TARGET-PRE-1",
      estimateNo: "EST-TARGET-PRE-1",
      franchiseeId: TARGET_FRANCHISEE,
      storeId: TARGET_STORE,
      date: "2098-06-01",
      createdAt: "2026-02-01T10:00:00.000Z",
      time: "10:00",
      withConsent: true,
      withMeterRun: true,
    });
    await seedScopedReservationData(db, {
      reservationId: "RES-TARGET-PRE-2",
      estimateNo: "EST-TARGET-PRE-2",
      franchiseeId: TARGET_FRANCHISEE,
      storeId: TARGET_STORE,
      date: "2098-06-02",
      status: "cancel",
      createdAt: "2026-02-03T10:00:00.000Z",
      time: "11:00",
      withConsent: true,
      withMeterRun: true,
    });
    await seedScopedReservationData(db, {
      reservationId: "RES-TARGET-PRODUCTION",
      estimateNo: "EST-TARGET-PRODUCTION",
      franchiseeId: TARGET_FRANCHISEE,
      storeId: TARGET_STORE,
      date: "2098-06-03",
      createdAt: "2028-01-01T10:00:00.000Z",
      time: "12:00",
      withConsent: true,
      withMeterRun: true,
    });
    await seedScopedReservationData(db, {
      reservationId: "RES-OTHER-KEEP",
      estimateNo: "EST-OTHER-KEEP",
      franchiseeId: OTHER_FRANCHISEE,
      storeId: OTHER_STORE,
      createdAt: "2026-02-01T10:00:00.000Z",
    });

    res = await mf.dispatchFetch(
      `http://localhost/api/admin/reservations/pre-opening-reset/capability?franchiseeId=${TARGET_FRANCHISEE}&storeId=${TARGET_STORE}&scope=reservations`,
      { headers: authHeaders }
    );
    out = await jsonRes(res);
    record(
      "P6-tenant-mismatch-blocked",
      res.status === 200 &&
        out.data?.legacyAdminScope === false &&
        out.data?.dashboard?.totalReservations === 3 &&
        out.data?.targets?.reservations === 2 &&
        out.data?.countsAligned === false,
      `status=${res.status} dashboard=${JSON.stringify(out.data?.dashboard)} targets=${JSON.stringify(out.data?.targets)}`
    );

    res = await mf.dispatchFetch(
      `http://localhost/api/admin/reservations/pre-opening-reset/capability?franchiseeId=${TARGET_FRANCHISEE}&storeId=${TARGET_STORE}&scope=full`,
      { headers: authHeaders }
    );
    out = await jsonRes(res);
    record(
      "P6-full-scope-targets",
      res.status === 200 &&
        out.data?.targets?.blocks >= 1 &&
        out.data?.targets?.meter_fixed_fare_runs === 2,
      `status=${res.status} targets=${JSON.stringify(out.data?.targets)}`
    );

    await db.prepare(`DELETE FROM reservations WHERE id = 'RES-TARGET-PRODUCTION'`).run();

    res = await mf.dispatchFetch(
      `http://localhost/api/admin/reservations/pre-opening-reset/capability?franchiseeId=${TARGET_FRANCHISEE}&storeId=${TARGET_STORE}&scope=reservations`,
      { headers: authHeaders }
    );
    out = await jsonRes(res);
    record(
      "P6-tenant-capability-aligned",
      res.status === 200 &&
        out.data?.dashboard?.totalReservations === 2 &&
        out.data?.targets?.reservations === 2 &&
        out.data?.countsAligned === true,
      `status=${res.status} dashboard=${JSON.stringify(out.data?.dashboard)} targets=${JSON.stringify(out.data?.targets)}`
    );

    res = await mf.dispatchFetch("http://localhost/api/admin/reservations/pre-opening-reset", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        franchiseeId: TARGET_FRANCHISEE,
        storeId: TARGET_STORE,
        confirmText: "RESET",
        executedBy: EXECUTED_BY,
        scope: "reservations",
      }),
    });
    out = await jsonRes(res);
    const targetRemaining = await db
      .prepare(
        `SELECT COUNT(*) AS c FROM reservations
         WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`
      )
      .bind(TARGET_FRANCHISEE, TARGET_STORE)
      .first();
    const otherRemaining = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE id = 'RES-OTHER-KEEP'`)
      .first();
    record(
      "P6-tenant-reset-success",
      res.status === 200 &&
        out.data?.success === true &&
        out.data?.deleted?.reservations === 2 &&
        Number(targetRemaining?.c || 0) === 0 &&
        Number(otherRemaining?.c || 0) === 1,
      `status=${res.status} targetRemaining=${targetRemaining?.c} other=${otherRemaining?.c}`
    );

    res = await mf.dispatchFetch("http://localhost/api/admin/reservations/pre-opening-reset", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        franchiseeId: TARGET_FRANCHISEE,
        storeId: TARGET_STORE,
        confirmText: "NOPE",
        executedBy: EXECUTED_BY,
        scope: "reservations",
      }),
    });
    out = await jsonRes(res);
    record(
      "P6-bad-confirm",
      res.status === 400 && out.data?.success === false,
      `status=${res.status} ${out.text.slice(0, 120)}`
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
