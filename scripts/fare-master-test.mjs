/**
 * 料金マスター v1.0 自動テスト
 * Run: node scripts/fare-master-test.mjs
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { buildHeadquartersV1Record, buildMeterRules, buildCalculationRules } from "../shared/fare-master-v1.js";
import { toEstimateConfig, shouldExcludeServiceFeeFromMeterReadd, resolveActiveFareMaster, isVersionApplicable, sumServiceFeesForTotal } from "../shared/fare-master-core.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function assert(cond, msg){
  if(!cond) throw new Error(msg);
}

function loadCalc(){
  const sandbox = { global: {}, window: {} };
  sandbox.global = sandbox.window;
  vm.runInNewContext(readFileSync(path.join(root, "shared/estimate-calc.js"), "utf8"), sandbox);
  return sandbox.window.EstimateCalc;
}

const estimateConfigRaw = JSON.parse(readFileSync(path.join(root, "data/estimate-config.json"), "utf8"));
const hqRecord = buildHeadquartersV1Record(estimateConfigRaw);
const config = toEstimateConfig(hqRecord);
const EstimateCalc = loadCalc();
const meter = buildMeterRules();
const calcRules = buildCalculationRules();

// 距離制
assert(EstimateCalc.calcDistanceFare(1.06, config.distancePricing) === 520, "1.06km = 520");
assert(EstimateCalc.calcDistanceFare(1.272, config.distancePricing) === 620, "1.272km = 620 (212m加算)");
assert(EstimateCalc.calcDistanceFare(1.06 + 0.212 * 2 + 0.001, config.distancePricing) === 820, "distance ceil");

// 時間制
const timeResult = EstimateCalc.computeEstimate(Object.assign({}, config, { fareMode: "time" }), {
  distanceKm: 0,
  routeCalcResult: { durationMinutes: 30 },
  pickupFeeEnabled: true,
  specialVehicleFeeEnabled: true,
  mobilityId: "free-wheelchair",
  assistanceId: "watch-assist",
  stairAssistId: "stair-none",
  tripTypeId: "one-way",
});
assert(timeResult.total >= 4180 + 800 + 1000, "time 30min base");

const time31 = EstimateCalc.computeEstimate(Object.assign({}, config, { fareMode: "time" }), {
  distanceKm: 0,
  routeCalcResult: { durationMinutes: 31 },
  pickupFeeEnabled: false,
  specialVehicleFeeEnabled: false,
  mobilityId: "free-wheelchair",
  assistanceId: "watch-assist",
  stairAssistId: "stair-none",
  tripTypeId: "one-way",
});
const time31Breakdown = time31.quoteSnapshot.fixedFareBreakdown || [];
const time31Base = time31Breakdown.find(r => r.key === "timeBaseFare")?.amount || 0;
assert(time31Base === 8360, "time 31min base fare = 8360 got " + time31Base);

// 階段介助
const stairState = {
  distanceKm: 5,
  pickupFeeEnabled: false,
  specialVehicleFeeEnabled: false,
  mobilityId: "free-wheelchair",
  assistanceId: "boarding-assist",
  stairId: "stair-floor3",
  tripTypeId: "one-way",
};
const stairResult = EstimateCalc.computeEstimate(config, stairState);
assert(stairResult.quoteSnapshot.serviceFees.some(r => r.key === "stairFee" && r.amount === 5000), "stair floor3 5000");

// メーター正式料金
assert(meter.waitingFare.unitFareYen === 800, "waiting 800");
assert(meter.escortFare.unitFareYen === 1600, "escort 1600");
assert(meter.timeMeter.baseAmountYen === 4180, "timeM 4180");
assert(meter.assistItems.find(i => i.id === "recliningWheelchair").amount === 2500, "reclining 2500");
assert(meter.assistItems.find(i => i.id === "stretcherEquipment").amount === 4000, "stretcher 4000");

// 二重加算防止キー
assert(shouldExcludeServiceFeeFromMeterReadd("waitingFee", calcRules), "waiting excluded");
assert(shouldExcludeServiceFeeFromMeterReadd("boarding-assist", calcRules) === false, "assist not excluded");

// 階層解決
const storeRecord = { ...hqRecord, id: "store-1", scopeType: "store", storeId: "s1", effectiveFrom: "2026-06-01T00:00:00.000Z" };
const resolved = resolveActiveFareMaster([hqRecord, storeRecord]);
assert(resolved.record.id === "store-1", "store priority");

// scheduled 料金 — API取得時 effectiveFrom 判定（Cron不要）
const oldActive = { ...hqRecord, id: "fm-old", status: "active", effectiveFrom: "2026-01-01T00:00:00.000Z", meterRules: { ...meter, waitingFare: { unitSeconds: 1800, unitFareYen: 800 } } };
const futureScheduled = { ...hqRecord, id: "fm-new", status: "scheduled", effectiveFrom: "2026-07-15T00:00:00.000Z", meterRules: { ...meter, waitingFare: { unitSeconds: 1800, unitFareYen: 900 } } };
const beforeSwitch = resolveActiveFareMaster([oldActive, futureScheduled], { atIso: "2026-07-10T12:00:00.000Z" });
assert(beforeSwitch.record.id === "fm-old", "before scheduled effectiveFrom uses old fare");
const afterSwitch = resolveActiveFareMaster([oldActive, futureScheduled], { atIso: "2026-07-15T12:00:00.000Z" });
assert(afterSwitch.record.id === "fm-new", "after scheduled effectiveFrom uses new fare");
assert(isVersionApplicable(futureScheduled, "2026-07-14T23:59:59.000Z") === false, "scheduled not applicable before from");
assert(isVersionApplicable(futureScheduled, "2026-07-15T00:00:00.000Z") === true, "scheduled applicable at from");

// 二重加算防止（LP 7700円ケース）
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
assert(sumServiceFeesForTotal(svSnapshot.serviceFees, svSnapshot) === 1100, "specialVehicle excluded from service sum");
assert(6600 + sumServiceFeesForTotal(svSnapshot.serviceFees, svSnapshot) === 7700, "LP 7700 total");

const pickupDupSnapshot = {
  fixedFareTotal: 5000,
  fixedFareBreakdown: [{ key: "pickupFee", amount: 800 }, { key: "distanceFare", amount: 4200 }],
  serviceFees: [{ key: "pickupFee", amount: 800 }, { key: "assistanceFee", amount: 1100 }],
};
assert(sumServiceFeesForTotal(pickupDupSnapshot.serviceFees, pickupDupSnapshot) === 1100, "pickup duplicate excluded");

const waitingDupSnapshot = {
  fixedFareTotal: 6000,
  fixedFareBreakdown: [{ key: "distanceFare", amount: 5200 }, { key: "waitingFee", amount: 800 }],
  serviceFees: [{ key: "waitingFee", amount: 800 }, { key: "escortFee", amount: 1600 }],
};
assert(sumServiceFeesForTotal(waitingDupSnapshot.serviceFees, waitingDupSnapshot) === 1600, "waiting in breakdown excluded, escort added");

// estimate-fare-display モジュール
const { parseEstimateTotalFromBody } = await import("../estimate-fare-display.js");
const displayTotal = parseEstimateTotalFromBody({
  quoteSnapshot: svSnapshot,
});
assert(displayTotal === 7700, "parseEstimateTotalFromBody 7700");

// 権限 — レコードなし=オーナー全権限
const { hasFareMasterPermission, PRICING_PERMISSIONS } = await import("../shared/fare-master-permissions.js");
const mockDbEmpty = {
  prepare(){ return { bind(){ return { async all(){ return { results: [] }; } }; } }; },
};
assert(await hasFareMasterPermission(mockDbEmpty, { permission: PRICING_PERMISSIONS.UPDATE }) === true, "owner default update");
const mockDbStaff = {
  prepare(){ return { bind(){ return { async all(){ return { results: [{ permission_key: "pricing.read" }] }; } }; } }; },
};
assert(await hasFareMasterPermission(mockDbStaff, { permission: PRICING_PERMISSIONS.UPDATE }) === false, "staff cannot update");

console.log("fare-master-test: ALL PASSED (" + new Date().toISOString() + ")");
