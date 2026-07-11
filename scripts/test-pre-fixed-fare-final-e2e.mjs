/**
 * Final safe E2E: pre_fixed_fare quote → consent → reservation → admin → email logs.
 * Uses Miniflare in-memory D1 only. No RESEND_API_KEY → no real email.
 * Does not touch production settings / D1.
 *
 * Run: node scripts/test-pre-fixed-fare-final-e2e.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import vm from "vm";
import { createMiniflareWorkerOptions, seedTestPublicReservationSettings } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LP_ORIGIN = "https://www.chibacaretaxi.com";
const BOOKING_ORIGIN = "https://infochibafukushi-dotcom.github.io";
const ESTIMATE_NO = "EST-E2E-FINAL-4810-001";
const ESTIMATE_DUP = "EST-E2E-FINAL-4810-DUP";
const ESTIMATE_EXPIRED = "EST-E2E-FINAL-4810-EXP";
const ESTIMATE_EMPTY_SNAP = "EST-E2E-FINAL-4810-NOSNAP";
const CUSTOMER_NAME = "E2Eテスト予約";
const CUSTOMER_PHONE = "09000001111";
const CUSTOMER_EMAIL = "e2e-final@mailpit.local";
const NOTES = "【自動テスト・実予約ではありません】";
const EXPECTED_TOTAL = 4810;
const EXPECTED_BODY = 1910;

const snapshot = {
  fareMode: "pre_fixed_fare",
  preFixedFareMode: true,
  selectedRouteId: "route_0",
  baseDistanceFareAmount: 1620,
  trafficZoneId: "chiba",
  trafficZoneCoefficient: 1.18,
  adjustedDistanceFareAmount: 1910,
  scheduledDurationSurcharge: 0,
  preFixedFareAmount: 1910,
  pickupFee: 800,
  specialVehicleFee: 1000,
  serviceFeeTotal: 1100,
  totalAmount: 4810,
  total: 4810,
  distanceKm: 3.3,
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
  fareVersion: "v1",
  quoteVersion: 1
};

const routePlan = {
  pickup: { address: "出洲港" },
  destination: { address: "千葉メディカルセンター" },
  selectedRouteId: "route_0",
  distanceMeters: 3344,
  durationSeconds: 558
};

const usageSummary = [
  { label: "移動方法", value: "標準車いす" },
  { label: "介助内容", value: "乗降介助" },
  { label: "運賃方式", value: "事前確定運賃" }
];

const CONSENT_TEXT = `見積番号 ${ESTIMATE_NO} の確定運賃 4,810円 および上記見積内容に同意して予約する`;
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

function loadHandoffApi() {
  const code = fs.readFileSync(path.join(root, "estimate-handoff.js"), "utf8");
  const sandbox = {
    window: {},
    URLSearchParams,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { search: `?source=estimate&estimateNo=${ESTIMATE_NO}` }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox.EstimateBookingHandoff;
}

function loadEmailBuilders() {
  const workerSrc = fs.readFileSync(path.join(root, "worker.js"), "utf8");
  const sliceStart = workerSrc.indexOf("function parseQuoteSnapshotFromBody");
  const sliceEnd = workerSrc.indexOf("async function sendReservationEmails");
  const emailBlock = workerSrc.slice(sliceStart, sliceEnd);
  const sandbox = { module: { exports: {} }, exports: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(
    `${emailBlock}
module.exports = {
  buildConfirmationEmailText,
  buildAdminNotificationText,
  fareModeEmailLabel,
  buildConsentEmailSection
};`,
    sandbox
  );
  return sandbox.module.exports;
}

function loadConsentApi() {
  const code = fs.readFileSync(path.join(root, "estimate-consent.js"), "utf8");
  const sandbox = { window: {}, navigator: { userAgent: "FinalE2E/1.0" } };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox.EstimateConsent || sandbox.window.EstimateConsent;
}

async function adminLogin(mf) {
  const res = await mf.dispatchFetch("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "1234" })
  });
  const out = await jsonRes(res);
  assert(res.status === 200 && out.data?.token, `admin login failed: ${out.text}`);
  return out.data.token;
}

async function registerQuote(mf, estimateNo, overrides = {}) {
  const body = {
    estimateNo,
    total: EXPECTED_TOTAL,
    fareType: "fixed",
    quoteSnapshot: snapshot,
    routePlan,
    usageSummary,
    handoffSource: "lp-site-estimate",
    dtoVersion: 2,
    ...overrides
  };
  const res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: LP_ORIGIN },
    body: JSON.stringify(body)
  });
  return jsonRes(res);
}

function buildReservationBody(estimateNo, snapshotHash, overrides = {}) {
  return {
    usageType: "初めて",
    name: CUSTOMER_NAME,
    kana: CUSTOMER_NAME,
    phone: CUSTOMER_PHONE,
    email: CUSTOMER_EMAIL,
    date: "2099-12-15",
    time: "10:30",
    pickup: "出洲港",
    destination: "千葉メディカルセンター",
    vehicle: "標準車いす",
    assist: "乗降介助",
    stairs: "なし",
    equipment: "レンタルなし",
    roundTrip: "片道",
    notes: NOTES,
    estimate: "4,810円",
    estimateNo,
    quoteSnapshot: snapshot,
    routePlan,
    usageSummary,
    handoffSource: "lp-site-estimate",
    dtoVersion: 2,
    estimateConsent: {
      estimateNo,
      quotedFare: EXPECTED_TOTAL,
      fareMode: "pre_fixed_fare",
      fareVersion: "v1",
      quoteVersion: 1,
      consentType: "estimate_booking",
      consentText: CONSENT_TEXT.replace(ESTIMATE_NO, estimateNo),
      consentTextVersion: CONSENT_VERSION,
      snapshotHash
    },
    ...overrides
  };
}

async function main() {
  const results = [];
  const record = (id, pass, detail) => {
    results.push({ id, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
  };

  const report = {
    estimateNo: ESTIMATE_NO,
    reservationId: "",
    environment: "Miniflare in-memory D1 (reservation-v4 local)",
    cleanup: "mf.dispose() — ephemeral DB discarded",
    productionImpact: "none"
  };

  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "final-e2e-pre-fixed-fare-db" },
    log: new Log(LogLevel.ERROR)
  });

  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`)
    .bind(`${LP_ORIGIN},${BOOKING_ORIGIN}`)
    .run();
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('fixed_fare_enabled', 'true')`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('email_admin_to', 'admin-e2e@mailpit.local')`)
    .run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('email_from', '介護タクシー予約 <test@mailpit.local>')`)
    .run();
  await mf.dispatchFetch("http://localhost/api/bootstrap");
  await seedTestPublicReservationSettings(db);

  try {
    // --- 1. Register fixture quote ---
    let out = await registerQuote(mf, ESTIMATE_NO);
    const snapshotHash = out.data?.snapshotHash || "";
    record(
      "E2E-1-register",
      out.status === 200 && out.data?.success === true && out.data?.total === EXPECTED_TOTAL && snapshotHash,
      `register status=${out.status} total=${out.data?.total} hash=${snapshotHash.slice(0, 12)}...`
    );

    // --- 2. API restore (sessionStorage empty) ---
    let res = await mf.dispatchFetch(`http://localhost/api/quotes/${ESTIMATE_NO}`, {
      headers: { Origin: BOOKING_ORIGIN }
    });
    out = await jsonRes(res);
    const quote = out.data;
    const qs = quote?.quoteSnapshot || {};
    record(
      "E2E-2-api-restore",
      out.status === 200 &&
        quote?.success === true &&
        (quote.fareMode === "pre_fixed_fare" || qs.fareMode === "pre_fixed_fare") &&
        qs.preFixedFareMode === true &&
        (quote.selectedRouteId === "route_0" || qs.selectedRouteId === "route_0") &&
        Number(quote.total) === EXPECTED_TOTAL &&
        Number(qs.preFixedFareAmount) === EXPECTED_BODY &&
        Number(qs.trafficZoneCoefficient) === 1.18 &&
        Number(qs.scheduledDurationSurcharge) === 0 &&
        qs.trafficZoneId === "chiba",
      `fareMode=${quote?.fareMode || qs.fareMode} total=${quote?.total} body=${qs.preFixedFareAmount} coef=${qs.trafficZoneCoefficient}`
    );

    const handoffApi = loadHandoffApi();
    const pending = handoffApi.initEstimateBookingMode();
    const handoff = handoffApi.buildHandoffFromQuoteResponse(quote);
    record(
      "E2E-2b-handoff",
      pending.active === true &&
        pending.pendingApi === true &&
        Number(handoff.total) === EXPECTED_TOTAL &&
        handoff.quoteSnapshot?.fareMode === "pre_fixed_fare" &&
        handoff.quoteSnapshot?.preFixedFareMode === true,
      `pendingApi=${pending.pendingApi} handoff.total=${handoff.total}`
    );

    // --- 3. Consent wording (client helpers) ---
    const consentApi = loadConsentApi();
    const consentPayload = consentApi.buildEstimateConsent(
      { ...handoff, total: EXPECTED_TOTAL },
      ESTIMATE_NO,
      { consentText: CONSENT_TEXT, snapshotHash }
    );
    record(
      "E2E-3-consent-text",
      /EST-E2E-FINAL-4810-001/.test(CONSENT_TEXT) &&
        /4,810/.test(CONSENT_TEXT) &&
        Number(consentPayload.quotedFare) === EXPECTED_TOTAL &&
        consentPayload.fareMode === "pre_fixed_fare",
      `consentText ok quotedFare=${consentPayload.quotedFare}`
    );
    // Without consent, createReservation must fail
    const noConsentBody = { ...buildReservationBody(ESTIMATE_NO, snapshotHash) };
    delete noConsentBody.estimateConsent;
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "FinalE2E/1.0" },
      body: JSON.stringify(noConsentBody)
    });
    out = await jsonRes(res);
    record("E2E-3b-no-consent", out.status === 400, `no consent status=${out.status} msg=${out.data?.message || ""}`);

    // --- 4. Create reservation once ---
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.90",
        "User-Agent": "FinalE2E/1.0"
      },
      body: JSON.stringify(buildReservationBody(ESTIMATE_NO, snapshotHash))
    });
    out = await jsonRes(res);
    const reservationId = out.data?.id || "";
    report.reservationId = reservationId;
    record(
      "E2E-4-create",
      out.status === 200 && out.data?.success === true && out.data?.confirmedFare === EXPECTED_TOTAL && reservationId,
      `id=${reservationId} confirmedFare=${out.data?.confirmedFare}`
    );

    // --- 5. Persist checks ---
    const quoteRow = await db.prepare(`SELECT * FROM quotes WHERE estimate_no=?`).bind(ESTIMATE_NO).first();
    const quoteSnap = JSON.parse(quoteRow?.quote_snapshot || "{}");
    record(
      "E2E-5-quotes",
      quoteRow?.status === "consumed" &&
        Number(quoteRow?.total_amount) === EXPECTED_TOTAL &&
        String(quoteRow?.fare_mode) === "pre_fixed_fare" &&
        String(quoteRow?.selected_route_id) === "route_0" &&
        Number(quoteSnap.preFixedFareAmount) === EXPECTED_BODY &&
        Number(quoteSnap.totalAmount) === EXPECTED_TOTAL &&
        Number(quoteSnap.trafficZoneCoefficient) === 1.18 &&
        Number(quoteSnap.scheduledDurationSurcharge) === 0,
      `status=${quoteRow?.status} total=${quoteRow?.total_amount} fare_mode=${quoteRow?.fare_mode}`
    );

    const resRow = await db.prepare(`SELECT * FROM reservations WHERE id=?`).bind(reservationId).first();
    const resSnap = JSON.parse(resRow?.quote_snapshot || "{}");
    const consentJson = resRow?.estimate_consent ? JSON.parse(resRow.estimate_consent) : null;
    record(
      "E2E-5-reservations",
      Number(resRow?.confirmed_fare) === EXPECTED_TOTAL &&
        String(resRow?.fare_type) === "fixed" &&
        String(resRow?.selected_route_id) === "route_0" &&
        String(resRow?.estimate_no) === ESTIMATE_NO &&
        String(resRow?.consent_at || "").length > 0 &&
        consentJson?.quotedFare === EXPECTED_TOTAL &&
        Number(resSnap.preFixedFareAmount) === EXPECTED_BODY &&
        Number(resSnap.totalAmount) === EXPECTED_TOTAL &&
        Number(resSnap.trafficZoneCoefficient) === 1.18 &&
        Number(resSnap.scheduledDurationSurcharge) === 0 &&
        resSnap.fareMode === "pre_fixed_fare" &&
        String(resRow?.pickup) === "出洲港" &&
        String(resRow?.destination) === "千葉メディカルセンター" &&
        String(resRow?.name) === CUSTOMER_NAME,
      `confirmed=${resRow?.confirmed_fare} consent_at=${resRow?.consent_at} route=${resRow?.selected_route_id}`
    );

    // Amount parity across surfaces (API/DB values; UI uses same numbers)
    const amounts = {
      lp: EXPECTED_TOTAL,
      consent: EXPECTED_TOTAL,
      confirm: EXPECTED_TOTAL,
      quotes: Number(quoteRow?.total_amount),
      snapshot: Number(resSnap.totalAmount),
      confirmed: Number(resRow?.confirmed_fare),
      complete: Number(out.data?.confirmedFare),
      admin: null,
      email: null
    };

    // --- 6. Double submit / reuse ---
    const raceBodies = [
      buildReservationBody(ESTIMATE_NO, snapshotHash, { phone: "09000002222", date: "2099-12-16" }),
      buildReservationBody(ESTIMATE_NO, snapshotHash, { phone: "09000003333", date: "2099-12-17" })
    ];
    // Sequential reuse after consume
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(raceBodies[0])
    });
    out = await jsonRes(res);
    record("E2E-6-reuse", out.status === 410 || out.status === 409, `reuse status=${out.status}`);

    // Parallel race on a fresh quote
    out = await registerQuote(mf, ESTIMATE_DUP);
    const dupHash = out.data?.snapshotHash || "";
    const [r1, r2] = await Promise.all([
      mf.dispatchFetch("http://localhost/api/createReservation", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "FinalE2E-race-1" },
        body: JSON.stringify(buildReservationBody(ESTIMATE_DUP, dupHash, { phone: "09000004444", date: "2099-12-18" }))
      }),
      mf.dispatchFetch("http://localhost/api/createReservation", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "FinalE2E-race-2" },
        body: JSON.stringify(buildReservationBody(ESTIMATE_DUP, dupHash, { phone: "09000005555", date: "2099-12-19" }))
      })
    ]);
    const o1 = await jsonRes(r1);
    const o2 = await jsonRes(r2);
    const successes = [o1, o2].filter((x) => x.status === 200 && x.data?.success);
    const failures = [o1, o2].filter((x) => x.status !== 200);
    const dupCount = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no=?`)
      .bind(ESTIMATE_DUP)
      .first();
    record(
      "E2E-6-race",
      successes.length === 1 && failures.length === 1 && Number(dupCount?.c) === 1,
      `successes=${successes.length} failures=${failures.length} rows=${dupCount?.c} statuses=${o1.status}/${o2.status}`
    );

    const mainCount = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no=?`)
      .bind(ESTIMATE_NO)
      .first();
    record("E2E-6-single", Number(mainCount?.c) === 1, `main estimate reservations=${mainCount?.c}`);

    // Zero-yen must not be created on mismatch
    out = await registerQuote(mf, "EST-E2E-FINAL-4810-MISMATCH");
    const mismHash = out.data?.snapshotHash || "";
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildReservationBody("EST-E2E-FINAL-4810-MISMATCH", mismHash, {
          phone: "09000006666",
          date: "2099-12-20",
          estimateConsent: {
            estimateNo: "EST-E2E-FINAL-4810-MISMATCH",
            quotedFare: 9999,
            fareMode: "pre_fixed_fare",
            consentType: "estimate_booking",
            consentText: CONSENT_TEXT,
            consentTextVersion: CONSENT_VERSION,
            snapshotHash: mismHash
          }
        })
      )
    });
    out = await jsonRes(res);
    const zeroRows = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no=? OR confirmed_fare=0`)
      .bind("EST-E2E-FINAL-4810-MISMATCH")
      .first();
    // confirmed_fare=0 count may include unrelated; check this estimate specifically
    const mismRes = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no=?`)
      .bind("EST-E2E-FINAL-4810-MISMATCH")
      .first();
    record(
      "E2E-6-mismatch-no-zero",
      out.status === 400 && Number(mismRes?.c) === 0,
      `mismatch status=${out.status} rows=${mismRes?.c}`
    );

    // --- 7. Admin ---
    const token = await adminLogin(mf);
    const auth = { Authorization: `Bearer ${token}` };
    res = await mf.dispatchFetch("http://localhost/api/getReservations", { headers: auth });
    out = await jsonRes(res);
    const list = Array.isArray(out.data) ? out.data : [];
    const adminRow = list.find((r) => r.id === reservationId);
    amounts.admin = Number(adminRow?.confirmed_fare);
    const adminSnap = adminRow?.quote_snapshot ? JSON.parse(adminRow.quote_snapshot) : {};
    record(
      "E2E-7-admin-list",
      !!adminRow &&
        Number(adminRow.confirmed_fare) === EXPECTED_TOTAL &&
        String(adminRow.estimate_no) === ESTIMATE_NO &&
        String(adminRow.name) === CUSTOMER_NAME &&
        String(adminRow.fare_type) === "fixed" &&
        String(adminRow.selected_route_id) === "route_0" &&
        adminSnap.fareMode === "pre_fixed_fare" &&
        Number(adminSnap.preFixedFareAmount) === EXPECTED_BODY &&
        Number(adminSnap.trafficZoneCoefficient) === 1.18 &&
        Number(adminSnap.scheduledDurationSurcharge) === 0 &&
        Number(adminSnap.totalAmount) === EXPECTED_TOTAL &&
        String(adminRow.consent_at || "").length > 0,
      `found=${!!adminRow} confirmed=${adminRow?.confirmed_fare} fareMode=${adminSnap.fareMode}`
    );

    res = await mf.dispatchFetch(`http://localhost/api/admin/quotes/${ESTIMATE_NO}`, { headers: auth });
    out = await jsonRes(res);
    record(
      "E2E-7-admin-quote",
      out.status === 200 &&
        out.data?.quote?.status === "consumed" &&
        String(out.data?.quote?.reservation_id) === reservationId,
      `quote status=${out.data?.quote?.status} reservation_id=${out.data?.quote?.reservation_id}`
    );

    // Admin must display stored snapshot (not recompute) — values match saved JSON
    record(
      "E2E-7-no-recalc",
      Number(adminSnap.preFixedFareAmount) === Number(quoteSnap.preFixedFareAmount) &&
        Number(adminSnap.totalAmount) === Number(quoteSnap.totalAmount) &&
        Number(adminSnap.trafficZoneCoefficient) === Number(quoteSnap.trafficZoneCoefficient),
      "admin snapshot equals quotes.quote_snapshot"
    );

    // --- 8. Email logs + content ---
    const emailLogs = await db
      .prepare(`SELECT * FROM email_logs WHERE reservation_id=? ORDER BY id`)
      .bind(reservationId)
      .all();
    const logs = emailLogs.results || [];
    const customerLogs = logs.filter((l) => l.kind === "customer");
    const adminLogs = logs.filter((l) => l.kind === "admin");
    const customerLog = customerLogs[0];
    const adminLog = adminLogs[0];
    record(
      "E2E-8-email-logs",
      customerLogs.length === 1 &&
        adminLogs.length === 1 &&
        // No RESEND_API_KEY → skipped log, not real send
        String(customerLog.status) !== "sent" &&
        String(adminLog.status) !== "sent" &&
        String(customerLog.error_message || "").includes("RESEND_API_KEY_missing") &&
        String(adminLog.error_message || "").includes("RESEND_API_KEY_missing"),
      `kinds=${logs.map((l) => l.kind).join(",")} customer=${customerLog?.status} admin=${adminLog?.status}`
    );

    // Exactly one customer + one admin (webhook may also log once; that is not email duplication)
    record(
      "E2E-8-no-dup-email",
      customerLogs.length === 1 && adminLogs.length === 1,
      `customer=${customerLogs.length} admin=${adminLogs.length} total_logs=${logs.length}`
    );

    const emailBuilders = loadEmailBuilders();
    const consentAtIso = String(resRow?.consent_at || "");
    const emailBody = {
      name: CUSTOMER_NAME,
      phone: CUSTOMER_PHONE,
      email: CUSTOMER_EMAIL,
      date: "2099-12-15",
      time: "10:30",
      pickup: "出洲港",
      destination: "千葉メディカルセンター",
      vehicle: "標準車いす",
      assist: "乗降介助",
      estimate: "4,810円",
      fixedFareConfirmed: true,
      confirmedFare: EXPECTED_TOTAL,
      quoteSnapshot: snapshot,
      routePlan,
      usageSummary,
      consentAt: consentAtIso,
      consentedFareAmount: EXPECTED_TOTAL,
      estimateConsent: consentJson
    };
    const customerMail = emailBuilders.buildConfirmationEmailText(reservationId, emailBody, ESTIMATE_NO, "");
    const adminMail = emailBuilders.buildAdminNotificationText(reservationId, emailBody, ESTIMATE_NO);
    amounts.email = EXPECTED_TOTAL;
    const mailOk =
      customerMail.includes(reservationId) &&
      customerMail.includes(ESTIMATE_NO) &&
      customerMail.includes("出洲港") &&
      customerMail.includes("千葉メディカルセンター") &&
      customerMail.includes("4,810") &&
      customerMail.includes("【事前確定運賃について】") &&
      customerMail.includes("確定運賃") &&
      !customerMail.includes("予定時間加算（概算）") &&
      !customerMail.includes("1.20") &&
      !customerMail.includes("京葉") &&
      !customerMail.includes("300円") &&
      adminMail.includes(reservationId) &&
      adminMail.includes(ESTIMATE_NO) &&
      adminMail.includes("4,810") &&
      adminMail.includes("■ 料金計算情報");
    record("E2E-8-email-content", mailOk, "customer+admin wording/amounts");

    const fareModeLabel = emailBuilders.fareModeEmailLabel("pre_fixed_fare");
    record(
      "E2E-8-fareMode-label",
      fareModeLabel === "事前確定運賃",
      `fareModeEmailLabel("pre_fixed_fare")="${fareModeLabel}"`
    );

    const displayChecks = [
      ["運賃方式：事前確定運賃", adminMail.includes("運賃方式：事前確定運賃")],
      ["認可運賃本体：1,910円", customerMail.includes("認可運賃本体：1,910円") && adminMail.includes("認可運賃本体：1,910円")],
      ["迎車料金：800円", customerMail.includes("迎車料金：800円")],
      ["特殊車両使用料：1,000円", customerMail.includes("特殊車両使用料：1,000円") && adminMail.includes("特殊車両使用料：1,000円")],
      ["介助料金：1,100円", customerMail.includes("介助料金：1,100円")],
      ["お支払い合計：4,810円", customerMail.includes("お支払い合計：4,810円") && adminMail.includes("お支払い合計：4,810円")],
      ["同意状態：同意済み", customerMail.includes("同意状態：同意済み") && adminMail.includes("同意状態：同意済み")],
      ["同意金額：4,810円", customerMail.includes("同意金額：4,810円") && adminMail.includes("同意金額：4,810円")]
    ];
    for (const [label, ok] of displayChecks) {
      record(`E2E-8-display-${label.split("：")[0]}`, ok, label);
    }

    record(
      "E2E-8-consent-at-display",
      consentAtIso.length > 0 &&
        customerMail.includes("同意日時：") &&
        adminMail.includes("同意日時：") &&
        !customerMail.includes("同意日時：-"),
      `consent_at=${consentAtIso}`
    );

    const specialCount = (customerMail.match(/特殊車両使用料：1,000円/g) || []).length;
    record("E2E-8-special-once", specialCount === 1, `specialVehicle lines=${specialCount}`);

    record(
      "E2E-8-consent-saved",
      consentAtIso.length > 0 && Number(consentJson?.quotedFare) === EXPECTED_TOTAL,
      `consent_at=${consentAtIso} quotedFare=${consentJson?.quotedFare}`
    );

    // --- 9. Abnormal cases ---
    res = await mf.dispatchFetch("http://localhost/api/quotes/EST-DOES-NOT-EXIST");
    record("E2E-9-missing-quote", res.status === 404, `missing GET status=${res.status}`);

    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildReservationBody("EST-DOES-NOT-EXIST", "x", {
          phone: "09000007777",
          date: "2099-12-21",
          estimateConsent: { estimateNo: "EST-DOES-NOT-EXIST", quotedFare: EXPECTED_TOTAL }
        })
      )
    });
    out = await jsonRes(res);
    record("E2E-9-missing-create", out.status === 404, `missing create status=${out.status}`);

    out = await registerQuote(mf, ESTIMATE_EXPIRED);
    await db
      .prepare(`UPDATE quotes SET expires_at=? WHERE estimate_no=?`)
      .bind(new Date(Date.now() - 60_000).toISOString(), ESTIMATE_EXPIRED)
      .run();
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildReservationBody(ESTIMATE_EXPIRED, out.data?.snapshotHash || "x", {
          phone: "09000008888",
          date: "2099-12-22"
        })
      )
    });
    out = await jsonRes(res);
    record("E2E-9-expired", out.status === 410 || out.status === 409, `expired status=${out.status}`);

    // Empty / invalid snapshot → must not proceed at 0 yen
    await db
      .prepare(
        `INSERT INTO quotes (estimate_no,status,total_amount,fare_type,quote_snapshot,snapshot_hash,expires_at,created_at,fare_mode,selected_route_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        ESTIMATE_EMPTY_SNAP,
        "active",
        0,
        "fixed",
        "{}",
        "emptyhash",
        new Date(Date.now() + 86400000).toISOString(),
        new Date().toISOString(),
        "pre_fixed_fare",
        "route_0"
      )
      .run();
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildReservationBody(ESTIMATE_EMPTY_SNAP, "emptyhash", {
          phone: "09000009999",
          date: "2099-12-23",
          estimateConsent: {
            estimateNo: ESTIMATE_EMPTY_SNAP,
            quotedFare: 0,
            consentType: "estimate_booking",
            consentText: "x",
            consentTextVersion: CONSENT_VERSION,
            snapshotHash: "emptyhash"
          }
        })
      )
    });
    out = await jsonRes(res);
    const emptySnapRes = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no=?`)
      .bind(ESTIMATE_EMPTY_SNAP)
      .first();
    record(
      "E2E-9-empty-snapshot",
      out.status >= 400 && Number(emptySnapRes?.c) === 0,
      `empty snap status=${out.status} rows=${emptySnapRes?.c}`
    );

    // Amount parity summary
    const amountValues = Object.values(amounts).filter((v) => v != null);
    const amountDiff = Math.max(...amountValues) - Math.min(...amountValues);
    record(
      "E2E-10-amount-parity",
      amountDiff === 0 && amountValues.every((v) => v === EXPECTED_TOTAL),
      `amounts=${JSON.stringify(amounts)} diff=${amountDiff}`
    );

    // Cleanup within ephemeral DB (also deleted on dispose)
    await db.prepare(`DELETE FROM email_logs WHERE reservation_id=?`).bind(reservationId).run();
    await db.prepare(`DELETE FROM quote_consents WHERE estimate_no LIKE 'EST-E2E-FINAL-%'`).run();
    await db.prepare(`DELETE FROM reservations WHERE estimate_no LIKE 'EST-E2E-FINAL-%'`).run();
    await db.prepare(`DELETE FROM quotes WHERE estimate_no LIKE 'EST-E2E-FINAL-%'`).run();
    const leftQ = await db.prepare(`SELECT COUNT(*) AS c FROM quotes WHERE estimate_no LIKE 'EST-E2E-FINAL-%'`).first();
    const leftR = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no LIKE 'EST-E2E-FINAL-%'`)
      .first();
    record(
      "E2E-11-cleanup",
      Number(leftQ?.c) === 0 && Number(leftR?.c) === 0,
      `remaining quotes=${leftQ?.c} reservations=${leftR?.c}`
    );

    report.fareModeLabel = fareModeLabel;
    report.amounts = amounts;
    report.consentAt = resRow?.consent_at || "";
    report.consent = true;

    console.log("\n=== Final E2E Report Snapshot ===");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mf.dispose();
  }

  console.log("\n=== Final pre_fixed_fare E2E Results ===\n");
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\nTotal: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
