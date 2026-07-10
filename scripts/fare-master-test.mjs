/**
 * 料金マスター v1.0 自動テスト
 * Run: node scripts/fare-master-test.mjs
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { buildHeadquartersV1Record, buildMeterRules, buildCalculationRules } from "../shared/fare-master-v1.js";
import { toEstimateConfig, shouldExcludeServiceFeeFromMeterReadd, resolveActiveFareMaster, isVersionApplicable, sumServiceFeesForTotal, parseFareMasterAtQuery, validateHeadquartersV1SeedCompleteness } from "../shared/fare-master-core.js";

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

const hqRecord = buildHeadquartersV1Record();
validateHeadquartersV1SeedCompleteness(hqRecord);
const config = toEstimateConfig(hqRecord);
const EstimateCalc = loadCalc();
const meter = buildMeterRules();
const calcRules = buildCalculationRules();

// 距離制
assert(EstimateCalc.calcDistanceFare(1.06, config.distancePricing) === 520, "1.06km = 520");
assert(EstimateCalc.calcDistanceFare(1.272, config.distancePricing) === 620, "1.272km = 620 (212m加算)");
assert(EstimateCalc.calcDistanceFare(1.06 + 0.212 * 2 + 0.001, config.distancePricing) === 820, "distance ceil");
assert(EstimateCalc.calcDistanceFare(1.0, config.distancePricing) === 520, "1.00km = 520");
assert(EstimateCalc.calcDistanceFare(1.061, config.distancePricing) === 620, "1.061km = 620");
assert(EstimateCalc.calcDistanceFare(1.273, config.distancePricing) === 720, "1.273km = 720");
assert(EstimateCalc.calcDistanceFare(8.5, config.distancePricing) === 4120, "8.5km = 4120");

const lpParityState = {
  distanceKm: 8.5,
  routeCalcResult: { durationMinutes: 25 },
  mobilityId: "own-wheelchair",
  assistanceId: "boarding-assist",
  stairId: "stair-none",
  tripTypeId: "one-way",
};

function assertModeParity(label, estimateConfig){
  const dt = EstimateCalc.computeEstimate(Object.assign({}, estimateConfig, { fareMode: "distance_time" }), lpParityState);
  const pf = EstimateCalc.computeEstimate(Object.assign({}, estimateConfig, { fareMode: "pre_fixed_fare" }), lpParityState);
  // 申請資料: 4120×1.18→4862 + 迎車800 + 特殊車両1000 + 乗降介助1100 = 7762
  assert(dt.total === 7762, label + " distance_time total 7762 got " + dt.total);
  assert(pf.total === 7762, label + " pre_fixed_fare total 7762 got " + pf.total);
  assert(dt.total === pf.total, label + " mode totals match");
  assert(dt.quoteSnapshot.fixedFareTotal === pf.quoteSnapshot.fixedFareTotal, label + " fixedFareTotal match");
  assert(Number(pf.quoteSnapshot.preFixedFareAmount) === Number(dt.quoteSnapshot.preFixedFareAmount), label + " preFixedFareAmount match");
  const dtDist = dt.quoteSnapshot.fixedFareBreakdown.find((r) => r.key === "distanceFare")?.amount;
  const pfDist = pf.quoteSnapshot.fixedFareBreakdown.find((r) => r.key === "distanceFare")?.amount;
  assert(dtDist === 4862 && pfDist === 4862, label + " adjusted distanceFare 4862 both modes");
  assert(Number(pf.quoteSnapshot.trafficZoneCoefficient) === 1.18, label + " coefficient 1.18");
  assert(String(pf.quoteSnapshot.trafficZoneId || pf.quoteSnapshot.selectedTrafficZoneId) === "chiba", label + " zone chiba");
  assert((Number(pf.quoteSnapshot.scheduledDurationSurcharge) || 0) === 0, label + " surcharge 0");
  const notices = pf.quoteSnapshot.fareBasis?.notices || [];
  assert(notices.some((n) => String(n).includes("平準化係数")), label + " coefficient notice present");
}

assertModeParity("hq-seed", config);

const configWithZones = JSON.parse(readFileSync(path.join(root, "data/estimate-config.json"), "utf8"));
assert(Array.isArray(configWithZones.trafficZones?.items) && configWithZones.trafficZones.items.length > 0, "estimate-config has trafficZones");
assertModeParity("estimate-config-with-zones", configWithZones);

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

// atIso パース — タイムゾーン・不正値
const tzUrl = new URL("http://localhost/api/fare-master/active?at=2026-07-15T00:00:00%2B09:00");
const tzParsed = parseFareMasterAtQuery(tzUrl);
assert(tzParsed.ok && tzParsed.atIso.includes("2026-07-14"), "JST midnight maps to UTC previous day");
const invalidUrl = new URL("http://localhost/api/fare-master/active?at=not-a-date");
assert(parseFareMasterAtQuery(invalidUrl).ok === false, "invalid at returns error");
const nowUrl = new URL("http://localhost/api/fare-master/active");
assert(parseFareMasterAtQuery(nowUrl).source === "now", "missing at uses now");

// 階層解決 + atIso 維持
const hqAtPast = { ...hqRecord, id: "hq-past", effectiveFrom: "2020-01-01T00:00:00.000Z", meterRules: { ...meter, waitingFare: { unitSeconds: 1800, unitFareYen: 700 } } };
const storeAtPast = { ...hqRecord, id: "store-past", scopeType: "store", storeId: "s1", effectiveFrom: "2020-06-01T00:00:00.000Z", meterRules: { ...meter, waitingFare: { unitSeconds: 1800, unitFareYen: 750 } } };
const hierarchyPast = resolveActiveFareMaster([hqAtPast, storeAtPast], { atIso: "2021-01-01T00:00:00.000Z" });
assert(hierarchyPast.record.id === "store-past", "store wins at past time");
assert(hierarchyPast.record.meterRules.waitingFare.unitFareYen === 750, "store fare at past atIso");

// seed 完全性（distancePricing 等）
assert(config.distancePricing?.patternA?.initialFare === 520, "seed distancePricing initialFare");
assert(config.fareComponents?.distance_time?.length >= 3, "seed fareComponents");
assert(hqRecord.displayRules?.faqAmounts?.initialFare === 520, "seed faq initialFare");
assert(hqRecord.calculationRules?.nightSurcharge?.rate === 0.2, "seed night surcharge");

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
