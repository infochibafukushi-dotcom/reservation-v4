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
    meterRunStatus: "not_started",
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

function buildDriverReservationDetail(row, consentRow, integrity) {
  const quoteSnapshot = parseStoredJson(row.quote_snapshot);
  const routePlan = parseStoredJson(row.route_plan);
  const usageSummary = parseStoredJson(row.usage_summary);
  const consent = buildConsentSummary(row, consentRow);

  return {
    reservationId: String(row.id || ""),
    estimateNo: String(row.estimate_no || "").trim() || null,
    status: String(row.status || "active"),
    meterRunStatus: "not_started",
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
  };
}

function buildDriverReservationQuery(tenant) {
  const franchiseeId = String(tenant?.franchiseeId || "").trim();
  const storeId = String(tenant?.storeId || "").trim();
  const sql = `SELECT *
    FROM reservations
    WHERE COALESCE(is_visible, 1) != 0
      AND COALESCE(status, 'active') != 'cancel'
      AND date = ?
      AND (
        COALESCE(confirmed_fare, 0) > 0
        OR COALESCE(fare_type, '') = 'fixed'
        OR COALESCE(quote_snapshot_hash, '') != ''
      )
      AND (? = '' OR COALESCE(franchisee_id, '') = ?)
      AND (? = '' OR COALESCE(store_id, '') = ?)
    ORDER BY time ASC, id ASC`;
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

export async function getDriverReservationDetail(db, reservationId, tenant = {}) {
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

  const consentRow = await fetchLatestQuoteConsent(db, reservationId);
  const quoteSnapshot = parseStoredJson(row.quote_snapshot);
  const integrity = await buildReservationIntegrity(row, quoteSnapshot, consentRow);

  return {
    ok: true,
    reservation: buildDriverReservationDetail(row, consentRow, integrity),
  };
}
