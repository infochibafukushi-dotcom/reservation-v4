/**
 * 料金マスター — 階層解決・estimate-config / meter 変換
 */
import { buildHeadquartersV1Record } from "./fare-master-v1.js";

export const FARE_MASTER_STATUSES = ["draft", "scheduled", "active", "expired", "cancelled"];
export const FARE_SCOPE_PRIORITY = ["store", "franchisee", "headquarters"];

export function parseFareMasterRow(row){
  if(!row) return null;
  return {
    id: String(row.id || ""),
    version: String(row.version || ""),
    tenantId: row.tenant_id || null,
    franchiseeId: row.franchisee_id || null,
    storeId: row.store_id || null,
    scopeType: String(row.scope_type || "headquarters"),
    parentVersionId: row.parent_version_id || null,
    status: String(row.status || ""),
    effectiveFrom: String(row.effective_from || ""),
    effectiveTo: row.effective_to || null,
    fareRules: safeParseJson(row.fare_rules, {}),
    displayRules: safeParseJson(row.display_rules, {}),
    calculationRules: safeParseJson(row.calculation_rules, {}),
    meterRules: safeParseJson(row.meter_rules, {}),
    createdAt: row.created_at || null,
    createdBy: row.created_by || null,
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    publishedAt: row.published_at || null,
    publishedBy: row.published_by || null,
    changeReason: row.change_reason || "",
  };
}

export function safeParseJson(text, fallback){
  if(!text) return fallback;
  try{
    return typeof text === "object" ? text : JSON.parse(text);
  }catch{
    return fallback;
  }
}

export function isVersionApplicable(record, atIso){
  if(!record) return false;
  const at = atIso ? Date.parse(atIso) : Date.now();
  const from = Date.parse(record.effectiveFrom || "");
  if(Number.isFinite(from) && at < from) return false;
  if(record.effectiveTo){
    const to = Date.parse(record.effectiveTo);
    if(Number.isFinite(to) && at >= to) return false;
  }
  if(record.status === "cancelled" || record.status === "expired" || record.status === "draft") return false;
  return record.status === "active" || record.status === "scheduled";
}

/** @deprecated use isVersionApplicable */
export function isVersionEffective(record, atIso){
  return isVersionApplicable(record, atIso);
}

export function buildScopeCandidates({ tenantId, franchiseeId, storeId }){
  const scopes = [];
  if(storeId){
    scopes.push({ scopeType: "store", tenantId: tenantId || null, franchiseeId: franchiseeId || null, storeId });
  }
  if(franchiseeId){
    scopes.push({ scopeType: "franchisee", tenantId: tenantId || null, franchiseeId, storeId: null });
  }
  scopes.push({ scopeType: "headquarters", tenantId: null, franchiseeId: null, storeId: null });
  return scopes;
}

/**
 * 複数スコープの active レコードから最優先を選択
 */
export function resolveActiveFareMaster(records, { atIso } = {}){
  const byScope = {};
  for(const record of records || []){
    if(!isVersionApplicable(record, atIso)) continue;
    const key = record.scopeType;
    const current = byScope[key];
    const recordFrom = Date.parse(record.effectiveFrom || "");
    const currentFrom = current ? Date.parse(current.effectiveFrom || "") : 0;
    if(!current || recordFrom > currentFrom){
      byScope[key] = record;
    }
  }
  for(const scope of FARE_SCOPE_PRIORITY){
    if(byScope[scope]){
      const record = byScope[scope];
      const fareSource = record.status === "scheduled" && Date.parse(record.effectiveFrom || "") > Date.now()
        ? "active_master"
        : "active_master";
      return { record, fareSource, scopeType: scope };
    }
  }
  return null;
}

/** serviceFees 合計（fixedFareTotal / fixedFareBreakdown と重複する項目は除外） */
export function sumServiceFeesForTotal(serviceFees, options = {}){
  const breakdown = options.fixedFareBreakdown || options.breakdown;
  const breakdownKeys = new Set(
    (Array.isArray(breakdown) ? breakdown : []).map((row) => row?.key).filter(Boolean),
  );
  const alwaysExclude = new Set(["pickupFee", "specialVehicleFee"]);
  return (Array.isArray(serviceFees) ? serviceFees : []).reduce((sum, row) => {
    const key = String(row?.key || "");
    if(alwaysExclude.has(key)) return sum;
    if(breakdownKeys.has(key)) return sum;
    return sum + (Number(row?.amount) || 0);
  }, 0);
}

export function buildFareMasterEditForm(record){
  const rules = record?.fareRules || {};
  const meter = record?.meterRules || {};
  const calc = record?.calculationRules || {};
  const display = record?.displayRules || {};
  const dp = rules.distancePricing?.patternA || {};
  const mt = meter.meterTimeFare || {};
  const tm = meter.timeMeter || {};
  const stairs = (meter.assistItems || []).find(i => i.id === "stairsAssist")?.floorOptions || [];
  return {
    scopeType: record?.scopeType || "headquarters",
    franchiseeId: record?.franchiseeId || "",
    storeId: record?.storeId || "",
    initialDistanceKm: dp.initialDistanceKm ?? 1.06,
    initialFare: dp.initialFare ?? 520,
    incrementDistanceKm: dp.incrementDistanceKm ?? 0.212,
    incrementFare: dp.incrementFare ?? 100,
    lowSpeedThresholdKmh: mt.lowSpeedThresholdKmh ?? 10,
    lowSpeedUnitSeconds: mt.unitSeconds ?? 80,
    lowSpeedUnitFareYen: mt.unitFareYen ?? 100,
    timeBaseMinutes: tm.baseMinutes ?? 30,
    timeBaseAmountYen: tm.baseAmountYen ?? 4180,
    timeBlockMinutes: tm.perBlockMinutes ?? 30,
    timeBlockAmountYen: tm.perBlockAmountYen ?? 4180,
    pickupFee: rules.basicFees?.pickupFee?.amount ?? 800,
    specialVehicleFee: rules.basicFees?.specialVehicleFee?.amount ?? 1000,
    boardingAssist: meter.assistItems?.find(i => i.id === "boardingAssist")?.amount ?? 1100,
    bodyAssist: meter.assistItems?.find(i => i.id === "bodyAssist")?.amount ?? 1600,
    stairFloor2: stairs.find(s => s.id === "stair-floor2")?.amount ?? 3000,
    stairFloor3: stairs.find(s => s.id === "stair-floor3")?.amount ?? 5000,
    stairFloor4: stairs.find(s => s.id === "stair-floor4")?.amount ?? 7000,
    stairFloor5: stairs.find(s => s.id === "stair-floor5")?.amount ?? 10000,
    waitingUnitSeconds: meter.waitingFare?.unitSeconds ?? 1800,
    waitingUnitFareYen: meter.waitingFare?.unitFareYen ?? 800,
    escortUnitSeconds: meter.escortFare?.unitSeconds ?? 1800,
    escortUnitFareYen: meter.escortFare?.unitFareYen ?? 1600,
    standardWheelchair: 0,
    recliningWheelchair: meter.assistItems?.find(i => i.id === "recliningWheelchair")?.amount ?? 2500,
    stretcher: meter.assistItems?.find(i => i.id === "stretcherEquipment")?.amount ?? 4000,
    nightStartHour: calc.nightSurcharge?.startHour ?? 22,
    nightEndHour: calc.nightSurcharge?.endHour ?? 5,
    nightSurchargeRate: calc.nightSurcharge?.rate ?? 0.2,
    disabilityDiscountRate: calc.disabilityDiscount?.rate ?? 0.1,
    pickupDisplayName: rules.basicFees?.pickupFee?.label || "迎車料金",
    pickupLpVisible: rules.basicFees?.pickupFee?.lpVisible !== false,
    pickupEstimateVisible: rules.basicFees?.pickupFee?.estimateVisible !== false,
    pickupShowTilde: rules.basicFees?.pickupFee?.showTilde !== false,
    specialDisplayName: rules.basicFees?.specialVehicleFee?.label || "特殊車両使用料",
    specialLpVisible: rules.basicFees?.specialVehicleFee?.lpVisible !== false,
    specialEstimateVisible: rules.basicFees?.specialVehicleFee?.estimateVisible !== false,
    specialShowTilde: rules.basicFees?.specialVehicleFee?.showTilde !== false,
    pricingTable: display.pricingTable || [],
  };
}

export function applyFareMasterEditForm(baseRecord, form){
  const record = JSON.parse(JSON.stringify(baseRecord || {}));
  record.fareRules = record.fareRules || {};
  record.fareRules.basicFees = record.fareRules.basicFees || {};
  record.fareRules.basicFees.pickupFee = Object.assign({}, record.fareRules.basicFees.pickupFee || { id: "pickupFee", label: "迎車料金" }, {
    amount: Number(form.pickupFee) || 0,
    label: String(form.pickupDisplayName || record.fareRules.basicFees.pickupFee?.label || "迎車料金"),
    lpVisible: form.pickupLpVisible !== false,
    estimateVisible: form.pickupEstimateVisible !== false,
    showTilde: form.pickupShowTilde !== false,
  });
  record.fareRules.basicFees.specialVehicleFee = Object.assign({}, record.fareRules.basicFees.specialVehicleFee || { id: "specialVehicleFee", label: "特殊車両使用料" }, {
    amount: Number(form.specialVehicleFee) || 0,
    label: String(form.specialDisplayName || record.fareRules.basicFees.specialVehicleFee?.label || "特殊車両使用料"),
    lpVisible: form.specialLpVisible !== false,
    estimateVisible: form.specialEstimateVisible !== false,
    showTilde: form.specialShowTilde !== false,
  });
  record.fareRules.distancePricing = record.fareRules.distancePricing || { mode: "patternA", patternA: {} };
  record.fareRules.distancePricing.patternA = {
    initialDistanceKm: Number(form.initialDistanceKm) || 1.06,
    initialFare: Number(form.initialFare) || 520,
    incrementDistanceKm: Number(form.incrementDistanceKm) || 0.212,
    incrementFare: Number(form.incrementFare) || 100,
  };
  record.meterRules = record.meterRules || {};
  record.meterRules.basicFare = {
    initialDistanceKm: Number(form.initialDistanceKm) || 1.06,
    initialFareYen: Number(form.initialFare) || 520,
    additionalDistanceKm: Number(form.incrementDistanceKm) || 0.212,
    additionalFareYen: Number(form.incrementFare) || 100,
  };
  record.meterRules.meterTimeFare = {
    lowSpeedThresholdKmh: Number(form.lowSpeedThresholdKmh) || 10,
    unitSeconds: Number(form.lowSpeedUnitSeconds) || 80,
    unitFareYen: Number(form.lowSpeedUnitFareYen) || 100,
  };
  record.meterRules.timeMeter = {
    baseMinutes: Number(form.timeBaseMinutes) || 30,
    baseAmountYen: Number(form.timeBaseAmountYen) || 4180,
    perBlockMinutes: Number(form.timeBlockMinutes) || 30,
    perBlockAmountYen: Number(form.timeBlockAmountYen) || 4180,
  };
  record.meterRules.waitingFare = { unitSeconds: Number(form.waitingUnitSeconds) || 1800, unitFareYen: Number(form.waitingUnitFareYen) || 800 };
  record.meterRules.escortFare = { unitSeconds: Number(form.escortUnitSeconds) || 1800, unitFareYen: Number(form.escortUnitFareYen) || 1600 };
  const assistItems = record.meterRules.assistItems || [];
  const setAssist = (id, patch) => {
    const idx = assistItems.findIndex(i => i.id === id);
    if(idx >= 0) assistItems[idx] = Object.assign({}, assistItems[idx], patch);
    else assistItems.push({ id, enabled: true, sortOrder: assistItems.length + 1, ...patch });
  };
  setAssist("boardingAssist", { name: "乗降介助", amount: Number(form.boardingAssist) || 1100 });
  setAssist("bodyAssist", { name: "身体介助", amount: Number(form.bodyAssist) || 1600 });
  setAssist("recliningWheelchair", { name: "リクライニング車いす", amount: Number(form.recliningWheelchair) || 2500 });
  setAssist("stretcherEquipment", { name: "ストレッチャー", amount: Number(form.stretcher) || 4000 });
  setAssist("standardWheelchair", { name: "標準車いす", amount: 0, displayLabel: "標準車いす 無料" });
  const stairsIdx = assistItems.findIndex(i => i.id === "stairsAssist");
  const floorOptions = [
    { id: "stair-floor2", label: "2階", amount: Number(form.stairFloor2) || 3000 },
    { id: "stair-floor3", label: "3階", amount: Number(form.stairFloor3) || 5000 },
    { id: "stair-floor4", label: "4階", amount: Number(form.stairFloor4) || 7000 },
    { id: "stair-floor5", label: "5階以上", amount: Number(form.stairFloor5) || 10000 },
  ];
  if(stairsIdx >= 0){
    assistItems[stairsIdx] = Object.assign({}, assistItems[stairsIdx], { name: "階段介助", amount: 0, floorOptions });
  } else {
    assistItems.push({ id: "stairsAssist", name: "階段介助", amount: 0, enabled: true, sortOrder: 3, floorOptions });
  }
  record.meterRules.assistItems = assistItems;
  record.calculationRules = record.calculationRules || {};
  record.calculationRules.nightSurcharge = Object.assign({}, record.calculationRules.nightSurcharge || {}, {
    startHour: Number(form.nightStartHour) ?? 22,
    endHour: Number(form.nightEndHour) ?? 5,
    rate: Number(form.nightSurchargeRate) ?? 0.2,
  });
  record.calculationRules.disabilityDiscount = Object.assign({}, record.calculationRules.disabilityDiscount || {}, {
    rate: Number(form.disabilityDiscountRate) ?? 0.1,
  });
  if(form.categories){
    record.fareRules.categories = form.categories;
  }
  return record;
}

export function getSystemFallbackFareMaster(baseEstimateConfig){
  const record = buildHeadquartersV1Record(baseEstimateConfig);
  return { record, fareSource: "system_fallback", scopeType: "headquarters", fallbackReason: "fare_master_unavailable" };
}

export function toEstimateConfig(fareMasterRecord){
  const rules = fareMasterRecord?.fareRules || {};
  return {
    ...rules,
    fareMasterId: fareMasterRecord?.id || null,
    fareVersionId: fareMasterRecord?.id || null,
    fareVersion: fareMasterRecord?.version || null,
    displayRules: fareMasterRecord?.displayRules || {},
    calculationRules: fareMasterRecord?.calculationRules || {},
    meterRules: fareMasterRecord?.meterRules || {},
  };
}

export function toMeterSettingsPayload(fareMasterRecord){
  const m = fareMasterRecord?.meterRules || {};
  const calc = fareMasterRecord?.calculationRules || {};
  return {
    fareMasterId: fareMasterRecord?.id || null,
    fareVersionId: fareMasterRecord?.id || null,
    fareVersion: fareMasterRecord?.version || null,
    basicFare: m.basicFare || {},
    meterTimeFare: m.meterTimeFare || {},
    waitingFare: m.waitingFare || {},
    escortFare: m.escortFare || {},
    timeMeter: m.timeMeter || {},
    dispatchMenuItems: m.dispatchMenuItems || [],
    specialVehicleMenuItems: m.specialVehicleMenuItems || [],
    assistItems: m.assistItems || [],
    discount: m.discount || {},
    expensePresets: m.expensePresets || [],
    nightSurcharge: calc.nightSurcharge || {},
    disabilityDiscount: calc.disabilityDiscount || {},
    preFixedFare: calc.preFixedFare || {},
  };
}

export function buildFareSnapshot(fareMasterRecord){
  return {
    fareMasterId: fareMasterRecord?.id || null,
    fareVersionId: fareMasterRecord?.id || null,
    fareVersion: fareMasterRecord?.version || null,
    scopeType: fareMasterRecord?.scopeType || null,
    tenantId: fareMasterRecord?.tenantId || null,
    franchiseeId: fareMasterRecord?.franchiseeId || null,
    storeId: fareMasterRecord?.storeId || null,
    effectiveFrom: fareMasterRecord?.effectiveFrom || null,
    fareRules: fareMasterRecord?.fareRules || {},
    displayRules: fareMasterRecord?.displayRules || {},
    calculationRules: fareMasterRecord?.calculationRules || {},
    meterRules: fareMasterRecord?.meterRules || {},
    capturedAt: new Date().toISOString(),
  };
}

export function fareMasterToMenu(fareMasterRecord){
  const rules = fareMasterRecord?.fareRules || {};
  const categories = rules.categories || {};
  const toMenuItem = (item, group) => ({
    name: item.label || item.id,
    price: Number(item.amount) || 0,
    visible: item.visible !== false,
    description: item.description || "",
    group,
    id: item.id,
  });
  return {
    move_type: (categories.mobility?.items || []).map(i => toMenuItem(i, "move_type")),
    assist: (categories.assistance?.items || []).map(i => toMenuItem(i, "assist")),
    stairs: (categories.stairAssist?.items || []).map(i => toMenuItem(i, "stairs")),
    round_addon: (categories.roundTripAddon?.items || []).map(i => toMenuItem(i, "round_addon")),
    round: (categories.tripType?.items || []).filter(i => i.showInSelector !== false).map(i => toMenuItem(i, "round")),
  };
}

export function fareMasterToBaseFees(fareMasterRecord){
  const basic = fareMasterRecord?.fareRules?.basicFees || {};
  const items = [];
  if(basic.pickupFee){
    items.push({ id: "pickup", label: basic.pickupFee.label || "迎車料金", price: Number(basic.pickupFee.amount) || 0, visible: basic.pickupFee.visible !== false });
  }
  if(basic.specialVehicleFee){
    items.push({ id: "special", label: basic.specialVehicleFee.label || "特殊車両使用料", price: Number(basic.specialVehicleFee.amount) || 0, visible: basic.specialVehicleFee.visible !== false });
  }
  return { items };
}

export function shouldExcludeServiceFeeFromMeterReadd(feeKey, calculationRules){
  const excluded = calculationRules?.preFixedFare?.excludedFromMeterReadd;
  if(Array.isArray(excluded)) return excluded.includes(feeKey);
  return ["pickupFee", "specialVehicleFee", "waitingFee", "escortFee", "waiting30min", "escort30min"].includes(feeKey);
}

export function resolveLegacyAssistLabel(label){
  const aliases = { "基本介助": "乗降介助", "室内介助": "身体介助" };
  return aliases[label] || label;
}

export function diffFareMasterRecords(before, after){
  const rows = [];
  const pairs = [
    ["迎車料金", before?.fareRules?.basicFees?.pickupFee?.amount, after?.fareRules?.basicFees?.pickupFee?.amount],
    ["特殊車両料金", before?.fareRules?.basicFees?.specialVehicleFee?.amount, after?.fareRules?.basicFees?.specialVehicleFee?.amount],
    ["待機料金(30分)", before?.meterRules?.waitingFare?.unitFareYen, after?.meterRules?.waitingFare?.unitFareYen],
    ["付き添い(30分)", before?.meterRules?.escortFare?.unitFareYen, after?.meterRules?.escortFare?.unitFareYen],
    ["時間制(30分)", before?.meterRules?.timeMeter?.baseAmountYen, after?.meterRules?.timeMeter?.baseAmountYen],
  ];
  for(const [label, b, a] of pairs){
    if(b !== a) rows.push({ item: label, before: b, after: a });
  }
  return rows;
}
