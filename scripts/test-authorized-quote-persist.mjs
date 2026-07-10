/**
 * 認可試算→quoteSnapshot→登録正規化の保存整合テスト（8.5km基準）。
 * 根拠: 4120×1.18=4861.6 → 4860 / 合計 7760
 * Run: node scripts/test-authorized-quote-persist.mjs
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { buildHeadquartersV1Record } from "../shared/fare-master-v1.js";
import { toEstimateConfig } from "../shared/fare-master-core.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function assertEqual(actual, expected, label){
  if(actual !== expected){
    throw new Error(label + ": expected " + expected + ", got " + actual);
  }
}

function loadCalc(){
  const sandbox = { global: {}, window: {} };
  sandbox.global = sandbox.window;
  vm.runInNewContext(readFileSync(path.join(root, "shared/estimate-calc.js"), "utf8"), sandbox);
  return sandbox.window.EstimateCalc;
}

function isAuthorizedFareMode(fareMode){
  const mode = String(fareMode || "").trim();
  return mode === "distance_time" || mode === "pre_fixed_fare";
}

function roundDownToTenYen(amountYen){
  return Math.floor(Math.max(Number(amountYen) || 0, 0) / 10) * 10;
}

function sumServiceFeesForTotal(serviceFees, snapshot){
  const breakdown = snapshot?.fixedFareBreakdown || snapshot?.breakdown;
  const breakdownKeys = new Set((Array.isArray(breakdown) ? breakdown : []).map((row) => row?.key).filter(Boolean));
  const alwaysExclude = new Set(["pickupFee", "specialVehicleFee"]);
  return (Array.isArray(serviceFees) ? serviceFees : []).reduce((sum, row) => {
    const key = String(row?.key || "");
    if(alwaysExclude.has(key)) return sum;
    if(breakdownKeys.has(key)) return sum;
    return sum + (Number(row?.amount) || 0);
  }, 0);
}

function calculateTotalFromSnapshot(snapshot){
  const fixedTotal = Number(snapshot?.fixedFareTotal) || 0;
  const derived = fixedTotal + sumServiceFeesForTotal(snapshot?.serviceFees, snapshot);
  const explicit = Number(snapshot?.totalAmount ?? snapshot?.total) || 0;
  if(derived > 0) return derived;
  if(explicit > 0) return explicit;
  return 0;
}

function normalizeQuoteSnapshotFares(snapshot){
  if(!snapshot || typeof snapshot !== "object") return snapshot;
  const normalized = { ...snapshot };
  normalized.fixedFareTotal = isAuthorizedFareMode(normalized.fareMode)
    ? Math.max(0, Math.round(Number(normalized.fixedFareTotal) || 0))
    : roundDownToTenYen(normalized.fixedFareTotal);
  const derivedTotal = calculateTotalFromSnapshot(normalized);
  if(derivedTotal > 0){
    normalized.total = derivedTotal;
    normalized.totalAmount = derivedTotal;
  }
  return normalized;
}

const EstimateCalc = loadCalc();
const config = toEstimateConfig(buildHeadquartersV1Record());
const state = {
  distanceKm: 8.5,
  routeCalcResult: { durationMinutes: 25 },
  mobilityId: "own-wheelchair",
  assistanceId: "boarding-assist",
  stairId: "stair-none",
  tripTypeId: "one-way",
  roadType: "general",
  consent: true,
  consentAt: "2026-07-11T00:00:00.000Z"
};

const estimate = EstimateCalc.computeEstimate(Object.assign({}, config, { fareMode: "pre_fixed_fare" }), state);
const snap = estimate.quoteSnapshot;

assertEqual(Number(estimate.total), 7760, "estimate screen total");
assertEqual(Number(snap.preFixedFareAmount), 4860, "preFixedFareAmount");
assertEqual(Number(snap.totalAmount), 7760, "quoteSnapshot.totalAmount");
assertEqual(Number(snap.baseDistanceFareAmount), 4120, "baseDistanceFareAmount");
assertEqual(Number(snap.trafficZoneCoefficient), 1.18, "trafficZoneCoefficient");
assertEqual(Number(snap.adjustedDistanceFareAmount), 4860, "adjustedDistanceFareAmount");
assertEqual(Number(snap.scheduledDurationSurcharge), 0, "scheduledDurationSurcharge");
assertEqual(snap.consent, true, "consent");
assertEqual(String(snap.consentAt), "2026-07-11T00:00:00.000Z", "consentAt");

const normalized = normalizeQuoteSnapshotFares(JSON.parse(JSON.stringify(snap)));
assertEqual(Number(normalized.fixedFareTotal), Number(snap.fixedFareTotal), "register keeps authorized precision");
assertEqual(Number(normalized.totalAmount), 7760, "quotes.total_amount candidate");
assertEqual(Number(normalized.total), 7760, "confirmed_fare candidate");

// 過去データ互換: 係数 null のスナップショットも読める（4860+800+1000=6660 + 1100）
const legacy = normalizeQuoteSnapshotFares({
  fareMode: "pre_fixed_fare",
  fixedFareTotal: 6660,
  trafficZoneCoefficient: null,
  adjustedDistanceFareAmount: null,
  serviceFees: [{ key: "assistanceFee", amount: 1100 }]
});
assertEqual(Number(legacy.total), 7760, "legacy null-coefficient snapshot readable");

console.log("authorized quote persist tests passed");
