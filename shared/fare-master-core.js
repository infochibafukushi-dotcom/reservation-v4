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

export function isVersionEffective(record, atIso){
  if(!record) return false;
  const at = atIso ? Date.parse(atIso) : Date.now();
  const from = Date.parse(record.effectiveFrom || "");
  if(Number.isFinite(from) && at < from) return false;
  if(record.effectiveTo){
    const to = Date.parse(record.effectiveTo);
    if(Number.isFinite(to) && at >= to) return false;
  }
  return record.status === "active" || record.status === "scheduled";
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
    if(!isVersionEffective(record, atIso)) continue;
    const key = record.scopeType;
    if(!byScope[key] || Date.parse(record.effectiveFrom) > Date.parse(byScope[key].effectiveFrom)){
      byScope[key] = record;
    }
  }
  for(const scope of FARE_SCOPE_PRIORITY){
    if(byScope[scope]) return { record: byScope[scope], fareSource: "active_master", scopeType: scope };
  }
  return null;
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
