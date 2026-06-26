import { hashSnapshot } from "./snapshot-hash.js";

const DRIVER_RESERVATIONS_PREFIX = "/api/driver/reservations/";

export function parseDriverReservationIdFromPath(pathname) {
  if (!String(pathname || "").startsWith(DRIVER_RESERVATIONS_PREFIX)) {
    return "";
  }
  const raw = decodeURIComponent(pathname.slice(DRIVER_RESERVATIONS_PREFIX.length)).trim();
  if (!raw || raw.includes("/")) {
    return "";
  }
  return raw;
}

export function parseDriverReservationActionPath(pathname) {
  if (!String(pathname || "").startsWith(DRIVER_RESERVATIONS_PREFIX)) {
    return { reservationId: "", action: "" };
  }
  const raw = decodeURIComponent(pathname.slice(DRIVER_RESERVATIONS_PREFIX.length)).trim();
  const slashIndex = raw.indexOf("/");
  if (slashIndex < 0) {
    return { reservationId: "", action: "" };
  }
  const reservationId = raw.slice(0, slashIndex).trim();
  const action = raw.slice(slashIndex + 1).trim();
  if (!reservationId || !action || raw.includes("/", slashIndex + 1)) {
    return { reservationId: "", action: "" };
  }
  return { reservationId, action };
}

function resolveMeterRunStatus(source) {
  if (!source) {
    return "not_started";
  }
  if ("meter_run_status" in source) {
    const joinedStatus = String(source.meter_run_status || "").trim();
    if (joinedStatus === "in_progress") {
      return "in_progress";
    }
    if (joinedStatus === "completed") {
      return "completed";
    }
    return "not_started";
  }
  const status = String(source.status || "").trim();
  if (status === "in_progress") {
    return "in_progress";
  }
  if (status === "completed") {
    return "completed";
  }
  return "not_started";
}

function buildFixedFareRunResponse(runRow) {
  const status = String(runRow.status || "").trim();
  const completionFields = buildFixedFareCompletionFields(runRow);
  return {
    reservationId: String(runRow.reservation_id || ""),
    status,
    meterRunStatus: resolveMeterRunStatus(runRow),
    confirmedFareYen: Number(runRow.confirmed_fare_yen) || 0,
    snapshotHash: String(runRow.snapshot_hash || "").trim() || null,
    startedAt: String(runRow.started_at || "").trim() || null,
    completedAt: String(runRow.completed_at || "").trim() || null,
    ...completionFields,
  };
}

function normalizeOptionalCoordinate(value) {
  if (value == null || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizePreFixedFareException(raw, fallbackConfirmedFareYen = 0) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const type = String(raw.type || "").trim();
  if (type !== "passenger_requested_change") {
    return null;
  }

  const endedLocationRaw =
    raw.endedLocation && typeof raw.endedLocation === "object" ? raw.endedLocation : {};

  return {
    type: "passenger_requested_change",
    reasonLabel:
      String(raw.reasonLabel || "旅客都合によるルート変更・立ち寄り追加").trim() ||
      "旅客都合によるルート変更・立ち寄り追加",
    endedAt: String(raw.endedAt || new Date().toISOString()).trim(),
    endedLocation: {
      lat: normalizeOptionalCoordinate(endedLocationRaw.lat),
      lng: normalizeOptionalCoordinate(endedLocationRaw.lng),
      accuracy: normalizeOptionalCoordinate(endedLocationRaw.accuracy),
    },
    originalFixedFareYen: Math.max(
      Math.round(Number(raw.originalFixedFareYen) || fallbackConfirmedFareYen || 0),
      0,
    ),
    fareModeBeforeEnd: "pre_fixed_fare",
    nextOperationRequired: "start_new_meter_trip",
    note: String(raw.note || "").trim(),
  };
}

export function parseCompleteFixedFareOptions(body, confirmedFareYen = 0) {
  if (body == null || typeof body !== "object" || Object.keys(body).length === 0) {
    return {
      completionStatus: "completed",
      completionReason: "normal_completed",
      preFixedFareException: null,
      preFixedFareExceptionJson: null,
    };
  }

  const completionStatusRaw = String(body.completionStatus || "").trim();
  const completionReasonRaw = String(body.completionReason || "").trim();
  const preFixedFareException = normalizePreFixedFareException(
    body.preFixedFareException,
    confirmedFareYen,
  );

  const isPassengerChange =
    completionStatusRaw === "completed_with_passenger_change" ||
    completionReasonRaw === "passenger_requested_route_change" ||
    Boolean(preFixedFareException);

  if (isPassengerChange) {
    const resolvedException =
      preFixedFareException ||
      normalizePreFixedFareException(
        {
          type: "passenger_requested_change",
          originalFixedFareYen: confirmedFareYen,
        },
        confirmedFareYen,
      );

    return {
      completionStatus: "completed_with_passenger_change",
      completionReason: "passenger_requested_route_change",
      preFixedFareException: resolvedException,
      preFixedFareExceptionJson: JSON.stringify(resolvedException),
    };
  }

  return {
    completionStatus: "completed",
    completionReason:
      completionReasonRaw === "normal_completed" ? "normal_completed" : "normal_completed",
    preFixedFareException: null,
    preFixedFareExceptionJson: null,
  };
}

function buildFixedFareCompletionFields(runRow) {
  if (!runRow) {
    return {
      fixedFareCompletionStatus: null,
      fixedFareCompletionReason: null,
      preFixedFareException: null,
    };
  }

  const runStatus = String(runRow.status || "").trim();
  if (runStatus !== "completed") {
    return {
      fixedFareCompletionStatus: null,
      fixedFareCompletionReason: null,
      preFixedFareException: null,
    };
  }

  const fixedFareCompletionStatus =
    String(runRow.completion_status || "").trim() || "completed";
  const fixedFareCompletionReason =
    String(runRow.completion_reason || "").trim() ||
    (fixedFareCompletionStatus === "completed_with_passenger_change"
      ? "passenger_requested_route_change"
      : "normal_completed");
  const preFixedFareException = parseStoredJson(runRow.pre_fixed_fare_exception_json);

  return {
    fixedFareCompletionStatus,
    fixedFareCompletionReason,
    preFixedFareException,
  };
}

export function isDriverFixedFareReservation(row) {
  if (!row) {
    return false;
  }
  if (Number(row.confirmed_fare) > 0) {
    return true;
  }
  if (String(row.fare_type || "").trim() === "fixed") {
    return true;
  }
  return Boolean(String(row.quote_snapshot_hash || "").trim());
}

function parseStoredJson(text) {
  if (!String(text || "").trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sumServiceFeesForTotal(serviceFees) {
  return (Array.isArray(serviceFees) ? serviceFees : []).reduce((sum, row) => {
    if (row?.key === "specialVehicleFee") {
      return sum;
    }
    return sum + (Number(row?.amount) || 0);
  }, 0);
}

export function calculateTotalFromSnapshot(snapshot) {
  const fixedTotal = Number(snapshot?.fixedFareTotal) || 0;
  const derived = fixedTotal + sumServiceFeesForTotal(snapshot?.serviceFees);
  const explicit = Number(snapshot?.total) || 0;
  if (derived > 0) {
    return derived;
  }
  if (explicit > 0) {
    return explicit;
  }
  return 0;
}

function buildScheduledAt(date, time) {
  const normalizedDate = String(date || "").trim();
  const normalizedTime = String(time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || !/^\d{2}:\d{2}$/.test(normalizedTime)) {
    return null;
  }
  return `${normalizedDate}T${normalizedTime}:00+09:00`;
}

function parseEstimateConsent(raw) {
  if (raw == null || raw === "") {
    return null;
  }
  if (typeof raw === "object") {
    return raw;
  }
  return parseStoredJson(raw);
}

function buildConsentSummary(row, consentRow) {
  const inlineConsent = parseEstimateConsent(row?.estimate_consent);
  const consentAt =
    String(row?.consent_at || "").trim() ||
    String(inlineConsent?.consentAt || inlineConsent?.agreedAt || "").trim() ||
    String(consentRow?.consent_at || "").trim() ||
    null;

  if (!consentAt && !inlineConsent && !consentRow) {
    return null;
  }

  const snapshotHash =
    String(inlineConsent?.snapshotHash || "").trim() ||
    String(row?.quote_snapshot_hash || "").trim() ||
    String(consentRow?.snapshot_hash || "").trim() ||
    "";

  return {
    consentAt,
    consentTextVersion:
      String(inlineConsent?.consentTextVersion || consentRow?.consent_text_version || "").trim() ||
      null,
    snapshotHash: snapshotHash || null,
    quotedFareYen:
      Number(inlineConsent?.quotedFare) ||
      Number(row?.confirmed_fare) ||
      Number(consentRow?.quoted_fare) ||
      0,
    source: consentRow ? "quote_consents" : inlineConsent ? "reservation" : "reservation_columns",
  };
}

export async function buildReservationIntegrity(row, snapshot, consentRow) {
  const storedHash = String(row?.quote_snapshot_hash || "").trim();
  const computedHash = snapshot ? await hashSnapshot(snapshot) : "";
  const snapshotHashVerified = Boolean(
    storedHash && computedHash && storedHash === computedHash,
  );

  const confirmedFareYen = Number(row?.confirmed_fare) || 0;
  const derivedTotal = snapshot ? calculateTotalFromSnapshot(snapshot) : 0;
  const confirmedFareMatchesSnapshot = Boolean(
    confirmedFareYen > 0 &&
      derivedTotal > 0 &&
      Math.abs(confirmedFareYen - derivedTotal) <= 1,
  );

  const consentStoredHash = String(consentRow?.snapshot_hash || "").trim();
  const consentSnapshotHashMatches = consentStoredHash
    ? consentStoredHash === storedHash
    : null;

  return {
    snapshotHash: storedHash || null,
    computedSnapshotHash: computedHash || null,
    snapshotHashVerified,
    confirmedFareMatchesSnapshot,
    consentSnapshotHashMatches,
  };
}

function buildDriverReservationListItem(row) {
  const snapshotHash = String(row.quote_snapshot_hash || "").trim();
  const consentAt = String(row.consent_at || "").trim() || null;

  return {
    reservationId: String(row.id || ""),
    estimateNo: String(row.estimate_no || "").trim() || null,
    status: String(row.status || "active"),
    meterRunStatus: resolveMeterRunStatus(row),
    scheduledAt: buildScheduledAt(row.date, row.time),
    date: String(row.date || ""),
    time: String(row.time || ""),
    customerName: String(row.name || ""),
    customerPhone: String(row.phone || ""),
    pickupAddress: String(row.pickup || ""),
    destinationAddress: String(row.destination || ""),
    confirmedFareYen: Number(row.confirmed_fare) || 0,
    fixedFareTotalYen: Number(row.fixed_fare_total) || 0,
    fareType: String(row.fare_type || "").trim() || null,
    preFixedFareConfirmable: Number(row.pre_fixed_fare_confirmable) === 1,
    useToll: Number(row.use_toll) === 1,
    selectedRouteId: String(row.selected_route_id || "").trim() || null,
    consentAt,
    snapshotHash: snapshotHash || null,
    franchiseeId: String(row.franchisee_id || "").trim() || null,
    storeId: String(row.store_id || "").trim() || null,
  };
}

function buildDriverReservationDetail(row, consentRow, integrity, runRow) {
  const quoteSnapshot = parseStoredJson(row.quote_snapshot);
  const routePlan = parseStoredJson(row.route_plan);
  const usageSummary = parseStoredJson(row.usage_summary);
  const consent = buildConsentSummary(row, consentRow);

  return {
    reservationId: String(row.id || ""),
    estimateNo: String(row.estimate_no || "").trim() || null,
    status: String(row.status || "active"),
    meterRunStatus: resolveMeterRunStatus(runRow),
    scheduledAt: buildScheduledAt(row.date, row.time),
    customer: {
      name: String(row.name || ""),
      kana: String(row.kana || row.name || ""),
      phone: String(row.phone || ""),
      email: String(row.email || ""),
    },
    trip: {
      date: String(row.date || ""),
      time: String(row.time || ""),
      pickupAddress: String(row.pickup || ""),
      destinationAddress: String(row.destination || ""),
      vehicle: String(row.vehicle || ""),
      usageSummary: Array.isArray(usageSummary) ? usageSummary : [],
      notes: String(row.notes || ""),
    },
    fixedFare: {
      confirmedFareYen: Number(row.confirmed_fare) || 0,
      fixedFareTotalYen: Number(row.fixed_fare_total) || 0,
      fareType: String(row.fare_type || "").trim() || null,
      fareLockedAt: String(row.fare_locked_at || "").trim() || null,
      selectedRouteId: String(row.selected_route_id || "").trim() || null,
      selectedOverallRouteId: String(row.selected_overall_route_id || "").trim() || null,
      useToll: Number(row.use_toll) === 1,
      preFixedFareConfirmable: Number(row.pre_fixed_fare_confirmable) === 1,
    },
    consent,
    quoteSnapshot,
    routePlan,
    integrity,
    franchiseeId: String(row.franchisee_id || "").trim() || null,
    storeId: String(row.store_id || "").trim() || null,
    ...buildFixedFareCompletionFields(runRow),
  };
}

function buildDriverReservationQuery(tenant) {
  const franchiseeId = String(tenant?.franchiseeId || "").trim();
  const storeId = String(tenant?.storeId || "").trim();
  const sql = `SELECT r.*, m.status AS meter_run_status
    FROM reservations r
    LEFT JOIN meter_fixed_fare_runs m ON m.reservation_id = r.id
    WHERE COALESCE(r.is_visible, 1) != 0
      AND COALESCE(r.status, 'active') != 'cancel'
      AND r.date = ?
      AND (
        COALESCE(r.confirmed_fare, 0) > 0
        OR COALESCE(r.fare_type, '') = 'fixed'
        OR COALESCE(r.quote_snapshot_hash, '') != ''
      )
      AND (? = '' OR COALESCE(r.franchisee_id, '') = ?)
      AND (? = '' OR COALESCE(r.store_id, '') = ?)
    ORDER BY r.time ASC, r.id ASC`;
  return {
    sql,
    binds: [franchiseeId, franchiseeId, storeId, storeId],
  };
}

export async function listDriverReservations(db, { date, franchiseeId = "", storeId = "" } = {}) {
  const query = buildDriverReservationQuery({ franchiseeId, storeId });
  const rows = await db
    .prepare(query.sql)
    .bind(date, ...query.binds)
    .all();

  return (rows.results || [])
    .filter(isDriverFixedFareReservation)
    .map(buildDriverReservationListItem);
}

async function fetchLatestQuoteConsent(db, reservationId) {
  return db
    .prepare(
      `SELECT consent_at, consent_text_version, snapshot_hash
       FROM quote_consents
       WHERE reservation_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .bind(reservationId)
    .first();
}

async function fetchFixedFareRun(db, reservationId) {
  return db
    .prepare(`SELECT * FROM meter_fixed_fare_runs WHERE reservation_id = ? LIMIT 1`)
    .bind(reservationId)
    .first();
}

async function loadDriverFixedFareReservation(db, reservationId, tenant = {}) {
  const row = await db
    .prepare(`SELECT * FROM reservations WHERE id = ? LIMIT 1`)
    .bind(reservationId)
    .first();

  if (!row) {
    return { ok: false, status: 404, message: "予約が見つかりません" };
  }
  if (Number(row.is_visible) === 0) {
    return { ok: false, status: 404, message: "予約が見つかりません" };
  }
  if (String(row.status || "") === "cancel") {
    return { ok: false, status: 404, message: "予約が見つかりません" };
  }
  if (!isDriverFixedFareReservation(row)) {
    return { ok: false, status: 404, message: "事前確定運賃の予約ではありません" };
  }

  const franchiseeId = String(tenant.franchiseeId || "").trim();
  const storeId = String(tenant.storeId || "").trim();
  if (franchiseeId && String(row.franchisee_id || "").trim() !== franchiseeId) {
    return { ok: false, status: 404, message: "予約が見つかりません" };
  }
  if (storeId && String(row.store_id || "").trim() !== storeId) {
    return { ok: false, status: 404, message: "予約が見つかりません" };
  }

  return { ok: true, row };
}

export async function getDriverReservationDetail(db, reservationId, tenant = {}) {
  const loaded = await loadDriverFixedFareReservation(db, reservationId, tenant);
  if (!loaded.ok) {
    return loaded;
  }

  const consentRow = await fetchLatestQuoteConsent(db, reservationId);
  const quoteSnapshot = parseStoredJson(loaded.row.quote_snapshot);
  const integrity = await buildReservationIntegrity(loaded.row, quoteSnapshot, consentRow);
  const runRow = await fetchFixedFareRun(db, reservationId);

  return {
    ok: true,
    reservation: buildDriverReservationDetail(loaded.row, consentRow, integrity, runRow),
  };
}

export async function startFixedFareRun(db, reservationId, tenant = {}, _options = {}) {
  const loaded = await loadDriverFixedFareReservation(db, reservationId, tenant);
  if (!loaded.ok) {
    return loaded;
  }

  const consentRow = await fetchLatestQuoteConsent(db, reservationId);
  const quoteSnapshot = parseStoredJson(loaded.row.quote_snapshot);
  const integrity = await buildReservationIntegrity(loaded.row, quoteSnapshot, consentRow);
  if (!integrity.snapshotHashVerified || !integrity.confirmedFareMatchesSnapshot) {
    return { ok: false, status: 422, message: "予約の整合性検証に失敗しました" };
  }

  const existingRun = await fetchFixedFareRun(db, reservationId);
  if (existingRun) {
    const status = String(existingRun.status || "").trim();
    if (status === "in_progress") {
      return { ok: false, status: 409, message: "すでに運行中です" };
    }
    if (status === "completed") {
      return { ok: false, status: 409, message: "すでに完了しています" };
    }
  }

  const now = new Date().toISOString();
  const confirmedFareYen = Number(loaded.row.confirmed_fare) || 0;
  const snapshotHash = String(loaded.row.quote_snapshot_hash || "").trim();
  const franchiseeId = String(loaded.row.franchisee_id || "").trim() || null;
  const storeId = String(loaded.row.store_id || "").trim() || null;

  await db
    .prepare(
      `INSERT INTO meter_fixed_fare_runs (
        reservation_id, status, confirmed_fare_yen, snapshot_hash,
        started_at, completed_at, franchisee_id, store_id, created_at, updated_at
      ) VALUES (?, 'in_progress', ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    .bind(reservationId, confirmedFareYen, snapshotHash, now, franchiseeId, storeId, now, now)
    .run();

  const runRow = await fetchFixedFareRun(db, reservationId);
  return { ok: true, run: buildFixedFareRunResponse(runRow) };
}

export async function completeFixedFareRun(db, reservationId, tenant = {}, options = {}) {
  const loaded = await loadDriverFixedFareReservation(db, reservationId, tenant);
  if (!loaded.ok) {
    return loaded;
  }

  const existingRun = await fetchFixedFareRun(db, reservationId);
  if (!existingRun) {
    return { ok: false, status: 409, message: "運行が開始されていません" };
  }
  if (String(existingRun.status || "").trim() === "completed") {
    return { ok: false, status: 409, message: "すでに完了しています" };
  }

  const confirmedFareYen = Number(existingRun.confirmed_fare_yen) || 0;
  const completion = parseCompleteFixedFareOptions(options, confirmedFareYen);
  const now = new Date().toISOString();
  const updateResult = await db
    .prepare(
      `UPDATE meter_fixed_fare_runs
       SET status = 'completed',
           completed_at = ?,
           updated_at = ?,
           completion_status = ?,
           completion_reason = ?,
           pre_fixed_fare_exception_json = ?
       WHERE reservation_id = ? AND status = 'in_progress'`,
    )
    .bind(
      now,
      now,
      completion.completionStatus,
      completion.completionReason,
      completion.preFixedFareExceptionJson,
      reservationId,
    )
    .run();

  if (!updateResult.meta?.changes) {
    const latestRun = await fetchFixedFareRun(db, reservationId);
    if (!latestRun) {
      return { ok: false, status: 409, message: "運行が開始されていません" };
    }
    if (String(latestRun.status || "").trim() === "completed") {
      return { ok: false, status: 409, message: "すでに完了しています" };
    }
    return { ok: false, status: 409, message: "運行を完了できません" };
  }

  const runRow = await fetchFixedFareRun(db, reservationId);
  return { ok: true, run: buildFixedFareRunResponse(runRow) };
}
