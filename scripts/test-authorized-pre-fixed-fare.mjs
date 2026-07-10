/**
 * 正式認可ロジック（申請資料準拠）の検証。
 *
 * 根拠: 距離制 × 1.18 の後、1円の位を四捨五入し10円単位。
 * 8.5km: 4120×1.18=4861.6 → 4860 / 合計 7760
 *
 * Run: node scripts/test-authorized-pre-fixed-fare.mjs
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

function getBreakdownAmount(rows, key){
  const row = (Array.isArray(rows) ? rows : []).find((item) => item?.key === key);
  return Number(row?.amount) || 0;
}

const EstimateCalc = loadCalc();
const hqConfig = toEstimateConfig(buildHeadquartersV1Record());
const fileConfig = JSON.parse(readFileSync(path.join(root, "data/estimate-config.json"), "utf8"));

function baseState(durationMinutes){
  return {
    distanceKm: 8.5,
    routeCalcResult: { durationMinutes: Number(durationMinutes) },
    mobilityId: "own-wheelchair",
    assistanceId: "boarding-assist",
    stairId: "stair-none",
    tripTypeId: "one-way",
    roadType: "general"
  };
}

function computeMode(estimateConfig, fareMode, durationMinutes){
  return EstimateCalc.computeEstimate(
    Object.assign({}, estimateConfig, { fareMode: fareMode }),
    baseState(durationMinutes)
  );
}

console.log("=== 端数処理境界値（1円の位四捨五入→10円単位） ===");
assertEqual(EstimateCalc.applyTrafficZoneCoefficient(4120, 1.18), 4860, "4120*1.18 -> 4860 not 4862");
assertEqual(EstimateCalc.applyTrafficZoneCoefficient(4864, 1), 4860, "4864 -> 4860");
assertEqual(EstimateCalc.applyTrafficZoneCoefficient(4865, 1), 4870, "4865 -> 4870");
assertEqual(EstimateCalc.applyTrafficZoneCoefficient(4866, 1), 4870, "4866 -> 4870");

function assertAuthorizedCase(label, estimateConfig){
  console.log("=== " + label + " ===");
  assertEqual(EstimateCalc.calcDistanceFare(8.5, estimateConfig.distancePricing), 4120, label + " base 4120");

  const pf = computeMode(estimateConfig, "pre_fixed_fare", 25);
  const dt = computeMode(estimateConfig, "distance_time", 25);
  const snap = pf.quoteSnapshot || {};

  assertEqual(Number(snap.baseDistanceFareAmount), 4120, label + " baseDistanceFareAmount");
  assertEqual(Number(snap.trafficZoneCoefficient), 1.18, label + " coefficient 1.18");
  assertEqual(String(snap.trafficZoneId || snap.selectedTrafficZoneId), "chiba", label + " zone chiba");
  assertEqual(Number(snap.adjustedDistanceFareAmount), 4860, label + " adjusted 4860");
  assertEqual(Number(snap.preFixedFareAmount), 4860, label + " preFixedFareAmount");
  assertEqual(Number(snap.scheduledDurationSurcharge) || 0, 0, label + " surcharge 0");
  assertEqual(getBreakdownAmount(snap.fixedFareBreakdown, "timeAdjustment"), 0, label + " no timeAdjustment");
  assertEqual(Number(pf.total), 7760, label + " pre_fixed total 7760");
  assertEqual(Number(dt.total), 7760, label + " distance_time total 7760");
  assertEqual(Number(pf.total), Number(dt.total), label + " mode totals match");
  assertEqual(
    Number(pf.quoteSnapshot?.preFixedFareAmount),
    Number(dt.quoteSnapshot?.preFixedFareAmount),
    label + " preFixedFareAmount match"
  );

  [10, 25, 60, 120].forEach(function(minutes){
    const result = computeMode(estimateConfig, "pre_fixed_fare", minutes);
    assertEqual(Number(result.total), 7760, label + " duration " + minutes + "m");
  });

  const keiyoConfig = JSON.parse(JSON.stringify(estimateConfig));
  keiyoConfig.preFixedFare = { trafficZoneId: "keiyo" };
  if(!keiyoConfig.trafficZones){
    keiyoConfig.trafficZones = { items: [] };
  }
  keiyoConfig.trafficZones.items = (keiyoConfig.trafficZones.items || []).concat([
    { id: "keiyo", label: "京葉交通圏", coefficient: 1.2 }
  ]);
  const keiyoResult = computeMode(keiyoConfig, "pre_fixed_fare", 25);
  assertEqual(Number(keiyoResult.total), 7760, label + " keiyo must not apply");
  assertEqual(Number(keiyoResult.quoteSnapshot?.trafficZoneCoefficient), 1.18, label + " still 1.18");
}

assertAuthorizedCase("hq-seed", hqConfig);
assertAuthorizedCase("estimate-config.json", fileConfig);

console.log("\nAll authorized pre-fixed-fare tests passed.");
