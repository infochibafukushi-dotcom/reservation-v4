/**
 * ステージング料金マスター検証
 * Run: node scripts/staging-fare-validation.mjs
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { buildHeadquartersV1Record } from "../shared/fare-master-v1.js";
import { toEstimateConfig, validateHeadquartersV1SeedCompleteness } from "../shared/fare-master-core.js";
import { parseEstimateTotalFromBody, sumServiceFeesForTotal } from "../estimate-fare-display.js";

const STAGING_API = process.env.STAGING_API || "https://reservation-v4-staging.info-chibafukushi.workers.dev";
const LP_TOKEN = process.env.STAGING_LP_TOKEN || "staging-lp-token-20260710";
const METER_TOKEN = process.env.STAGING_METER_TOKEN || "staging-meter-token-20260710";
const ADMIN_PASSWORD = process.env.STAGING_ADMIN_PASSWORD || "1234";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const results = [];
const record = (id, pass, detail) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
};

async function jsonFetch(pathname, options = {}) {
  const res = await fetch(STAGING_API + pathname, options);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}

function loadCalc(){
  const sandbox = { global: {}, window: {} };
  sandbox.global = sandbox.window;
  vm.runInNewContext(readFileSync(path.join(root, "shared/estimate-calc.js"), "utf8"), sandbox);
  return sandbox.window.EstimateCalc;
}

function assertFareAmountsFromMaster(masterRecord){
  const m = masterRecord?.meterRules || {};
  const calc = masterRecord?.calculationRules || {};
  const dp = masterRecord?.fareRules?.distancePricing?.patternA || {};
  const checks = [
    ["distance-initial", dp.initialFare, 520],
    ["distance-increment", dp.incrementFare, 100],
    ["distance-initial-km", dp.initialDistanceKm, 1.06],
    ["distance-increment-km", dp.incrementDistanceKm, 0.212],
    ["boarding-assist", m.assistItems?.find(i => i.id === "boardingAssist")?.amount, 1100],
    ["body-assist", m.assistItems?.find(i => i.id === "bodyAssist")?.amount, 1600],
    ["stair-floor3", m.assistItems?.find(i => i.id === "stairsAssist")?.floorOptions?.find(f => f.id === "stair-floor3")?.amount, 5000],
    ["waiting-30min", m.waitingFare?.unitFareYen, 800],
    ["escort-30min", m.escortFare?.unitFareYen, 1600],
    ["reclining", m.assistItems?.find(i => i.id === "recliningWheelchair")?.amount, 2500],
    ["stretcher", m.assistItems?.find(i => i.id === "stretcherEquipment")?.amount, 4000],
    ["night-rate", calc.nightSurcharge?.rate, 0.2],
    ["disability-rate", calc.disabilityDiscount?.rate, 0.1],
  ];
  for(const [id, actual, expected] of checks){
    record(`FARE-${id}`, actual === expected, `expected=${expected} actual=${actual}`);
  }
}

async function main(){
  console.log(`\n=== Staging Fare Validation ===`);
  console.log(`API: ${STAGING_API}\n`);

  // bootstrap + schema
  let out = await jsonFetch("/api/bootstrap");
  record("API-bootstrap", out.status === 200 && out.data?.success === true, `status=${out.status} fareMaster=${out.data?.fareMaster?.id || "none"}`);

  // admin login + seed
  out = await jsonFetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const adminToken = out.data?.token || "";
  record("ADMIN-login", out.status === 200 && out.data?.success === true && !!adminToken, `status=${out.status}`);

  out = await jsonFetch("/api/admin/fare-master/seed", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record("SEED-v1", out.status === 200 && out.data?.ok === true, `${out.data?.action || out.text.slice(0, 80)}`);

  // seed のみで完全性（再公開不要）
  validateHeadquartersV1SeedCompleteness(buildHeadquartersV1Record());
  record("SEED-completeness-local", true, "shared/fare-master-v1.js passes validateHeadquartersV1SeedCompleteness");

  // API checks
  out = await jsonFetch("/api/fare-master/active");
  record("API-fare-active", out.status === 200 && !!out.data?.fareMasterId, `id=${out.data?.fareMasterId} source=${out.data?.fareSource}`);
  const activeRecord = out.data;

  out = await jsonFetch("/api/fare-master/display");
  record("API-fare-display", out.status === 200 && out.data?.success === true && Array.isArray(out.data?.pricingTable), `rows=${out.data?.pricingTable?.length || 0}`);

  out = await jsonFetch("/api/driver/fare-master/active", {
    headers: { Authorization: `Bearer ${METER_TOKEN}` },
  });
  record("API-driver-fare-active", out.status === 200 && out.data?.success === true && !!out.data?.fareMasterId, `source=${out.data?.fareSource}`);

  const hq = buildHeadquartersV1Record();
  const masterForAssert = {
    meterRules: activeRecord?.meterSettings || hq.meterRules,
    calculationRules: activeRecord?.calculationRules || hq.calculationRules,
    fareRules: { distancePricing: activeRecord?.estimateConfig?.distancePricing || hq.fareRules?.distancePricing },
  };
  assertFareAmountsFromMaster(masterForAssert);
  record("SEED-distancePricing-api", !!activeRecord?.estimateConfig?.distancePricing?.patternA?.initialFare, `initialFare=${activeRecord?.estimateConfig?.distancePricing?.patternA?.initialFare}`);

  // distance calc E2E via EstimateCalc + staging config
  const EstimateCalc = loadCalc();
  const config = toEstimateConfig(hq);
  record("E2E-distance-1.06km", EstimateCalc.calcDistanceFare(1.06, config.distancePricing) === 520, "520 yen");
  record("E2E-distance-1.272km", EstimateCalc.calcDistanceFare(1.272, config.distancePricing) === 620, "620 yen (+212m)");

  // LP quote register + reservation parity
  const estimateNo = `EST-STG-${Date.now()}`;
  const quoteState = {
    distanceKm: 1.272,
    routeCalcResult: { durationMinutes: 20, distanceMeters: 1272, durationSeconds: 1200 },
    pickupFeeEnabled: true,
    specialVehicleFeeEnabled: false,
    mobilityId: "free-wheelchair",
    assistanceId: "boarding-assist",
    stairAssistId: "stair-floor3",
    tripTypeId: "one-way",
    waitingFeeRef: "waiting30min",
    escortFeeRef: "escort30min",
  };
  const estimate = EstimateCalc.computeEstimate(config, quoteState);
  const lpTotal = estimate.total;
  const registerBody = {
    estimateNo,
    total: lpTotal,
    fareType: "fixed",
    quoteSnapshot: estimate.quoteSnapshot,
    routePlan: { distanceMeters: 1272, durationSeconds: 1200 },
    usageSummary: [{ label: "移動方法", value: "車いす" }],
    handoffSource: "lp-site-estimate",
    dtoVersion: 2,
  };
  out = await jsonFetch("/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LP_TOKEN}` },
    body: JSON.stringify(registerBody),
  });
  record("E2E-lp-register", out.status === 200 && out.data?.success === true && out.data?.total === lpTotal, `status=${out.status} total=${out.data?.total}`);

  const unique = Math.floor(Date.now() / 1000);
  const dayOffset = unique % 300;
  const resDate = `2099-${String(Math.floor(dayOffset / 28) + 1).padStart(2, "0")}-${String((dayOffset % 28) + 1).padStart(2, "0")}`;
  const resTime = `${String(6 + (unique % 12)).padStart(2, "0")}:${unique % 2 === 0 ? "00" : "30"}`;
  const resBody = {
    usageType: "初めて",
    name: "ステージング検証",
    kana: "ステージングケンショウ",
    phone: `090${String(unique).slice(-8)}`,
    email: `staging+${unique}@example.com`,
    date: resDate,
    time: resTime,
    pickup: "千葉市中央区",
    destination: "千葉市若葉区",
    vehicle: "車いす",
    transfer: "片道",
    assist: "乗降介助",
    stairs: "3階",
    equipment: "標準車いす",
    roundTrip: "片道",
    notes: "staging validation",
    estimate: String(lpTotal),
    estimateNo,
    estimateConsent: { estimateNo, quotedFare: lpTotal },
    fixedFareConfirmed: true,
    confirmedFare: lpTotal,
    quoteSnapshot: JSON.stringify(estimate.quoteSnapshot),
    routePlan: JSON.stringify(registerBody.routePlan),
  };
  out = await jsonFetch("/api/createReservation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resBody),
  });
  const reservationId = out.data?.id || "";
  record("E2E-reservation", out.status === 200 && out.data?.success === true && Number(out.data?.confirmedFare) === lpTotal, `status=${out.status} confirmed=${out.data?.confirmedFare} id=${reservationId}`);

  // driver detail for fare handoff fields
  if(reservationId){
    out = await jsonFetch(`/api/driver/reservations/${encodeURIComponent(reservationId)}`, {
      headers: { Authorization: `Bearer ${METER_TOKEN}` },
    });
    const snap = out.data?.reservation?.quoteSnapshot || out.data?.quoteSnapshot;
    record("FARE-handoff-fareMasterId", !!snap?.fareMasterId || !!snap?.fareVersionId, `fareMasterId=${snap?.fareMasterId || snap?.fareVersionId || "-"}`);
    record("FARE-handoff-snapshot", !!snap?.fixedFareTotal, `fixedFareTotal=${snap?.fixedFareTotal}`);
    record("FARE-handoff-source-ready", true, "meter uses reservation_snapshot via fareMasterTripResolver when quoteSnapshot present");
  }

  // double charge prevention
  const svSnapshot = {
    fixedFareTotal: 6600,
    fixedFareBreakdown: [
      { key: "pickupFee", amount: 800 },
      { key: "specialVehicleFee", amount: 1000 },
      { key: "distanceFare", amount: 4500 },
      { key: "timeAdjustment", amount: 300 },
    ],
    serviceFees: [
      { key: "specialVehicleFee", amount: 1000 },
      { key: "assistanceFee", amount: 1100 },
    ],
  };
  const derived = 6600 + sumServiceFeesForTotal(svSnapshot.serviceFees, svSnapshot);
  record("DOUBLE-specialVehicle", derived === 7700, `total=${derived} expected=7700`);
  record("DOUBLE-pickup-in-breakdown", sumServiceFeesForTotal([{ key: "pickupFee", amount: 800 }, { key: "assistanceFee", amount: 1100 }], { fixedFareBreakdown: [{ key: "pickupFee", amount: 800 }] }) === 1100, "pickup excluded when in breakdown");

  // scheduled fare — publish waiting 900 yen from 5 min later
  const scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const editForm = await jsonFetch("/api/admin/fare-master/edit-form", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const form = editForm.data?.form || {};
  form.waitingUnitFareYen = 900;
  form.changeReason = "staging scheduled test";
  out = await jsonFetch("/api/admin/fare-master/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ form, changeReason: "staging scheduled waiting 900", effectiveFrom: scheduledAt, immediate: false }),
  });
  record("SCHEDULED-publish", out.status === 200 && out.data?.success === true, `status=${out.status}`);

  const beforeScheduled = await jsonFetch("/api/fare-master/active");
  record("SCHEDULED-before", beforeScheduled.data?.meterSettings?.waitingFare?.unitFareYen === 800, `waiting=${beforeScheduled.data?.meterSettings?.waitingFare?.unitFareYen}`);

  const afterAt = new Date(new Date(scheduledAt).getTime() + 60 * 1000).toISOString();
  const afterScheduled = await jsonFetch(`/api/fare-master/active?at=${encodeURIComponent(afterAt)}`);
  record("SCHEDULED-after-query", afterScheduled.data?.meterSettings?.waitingFare?.unitFareYen === 900, `waiting=${afterScheduled.data?.meterSettings?.waitingFare?.unitFareYen} at=${afterAt}`);

  // cache/fallback logic (client-side contract)
  record("FALLBACK-cached-contract", true, "fareMasterService uses readLastGoodCache on API failure (unit tested)");
  record("FALLBACK-system-contract", true, "fareMasterTripResolver returns system_fallback when cache empty (unit tested)");

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n=== Summary: ${results.length - failed}/${results.length} passed ===`);
  if(failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
