/**
 * 料金マスター仕様書 v1.0 — 本部標準料金（初期バージョン）
 */
export const FARE_MASTER_VERSION = "v1";
export const FARE_MASTER_ID = "fmv-headquarters-v1";

export const SERVICE_FEE_KEYS = {
  PICKUP: "pickupFee",
  SPECIAL_VEHICLE: "specialVehicleFee",
  BOARDING_ASSIST: "boarding-assist",
  BODY_ASSIST: "body-assist",
  STAIR_FLOOR2: "stair-floor2",
  STAIR_FLOOR3: "stair-floor3",
  STAIR_FLOOR4: "stair-floor4",
  STAIR_FLOOR5: "stair-floor5",
  WAITING: "waitingFee",
  ESCORT: "escortFee",
  RECLINING: "reclining-wheelchair",
  STRETCHER: "stretcher",
  FREE_WHEELCHAIR: "free-wheelchair",
};

export const SERVICE_FEE_KEYS_EXCLUDED_FROM_METER_READD = new Set([
  "pickupFee",
  "specialVehicleFee",
  "waitingFee",
  "escortFee",
  "waiting30min",
  "escort30min",
]);

export const LEGACY_LABEL_ALIASES = {
  "基本介助": "乗降介助",
  "室内介助": "身体介助",
  basicAssist: "boarding-assist",
  indoorAssist: "body-assist",
};

export function buildDisplayRules(){
  return {
    pricingTable: [
      { id: "distanceFare", name: "距離制運賃", price: "1.06kmまで520円、以後212mごとに100円", order: 1 },
      { id: "timeDistance", name: "時間距離併用", price: "時速10km以下の時間について80秒ごとに100円", order: 2 },
      { id: "timeFare", name: "時間制運賃", price: "30分4,180円～", order: 3 },
      { id: "pickupFee", name: "迎車料金", price: "800円～", order: 4 },
      { id: "specialVehicleFee", name: "特殊車両料金", price: "1,000円～", order: 5 },
      { id: "boardingAssist", name: "乗降介助", price: "1,100円～", order: 6 },
      { id: "bodyAssist", name: "身体介助", price: "1,600円～", order: 7 },
      { id: "stairAssist", name: "階段介助", price: "3,000円～", order: 8 },
      { id: "waitingFee", name: "待機料金", price: "30分800円～", order: 9 },
      { id: "escortFee", name: "付き添い料金", price: "30分1,600円～", order: 10 },
      { id: "standardWheelchair", name: "標準車いす", price: "無料", order: 11 },
      { id: "recliningWheelchair", name: "リクライニング車いす", price: "2,500円～", order: 12 },
      { id: "stretcher", name: "ストレッチャー", price: "4,000円～", order: 13 },
      { id: "nightSurcharge", name: "深夜早朝割増", price: "22:00～翌5:00は20％割増", order: 14 },
      { id: "disabilityDiscount", name: "障害者割引", price: "10％割引", order: 15 },
      { id: "expenses", name: "高速道路・駐車料金", price: "実費", order: 16 },
    ],
    faqAmounts: {
      initialFare: 520,
      pickupFee: 800,
      boardingAssist: 1100,
      bodyAssist: 1600,
      waiting30min: 800,
      escort30min: 1600,
      stairFrom: 3000,
      timeBlock: 4180,
    },
  };
}

export function buildCalculationRules(){
  return {
    nightSurcharge: {
      enabled: true,
      startHour: 22,
      endHour: 5,
      rate: 0.2,
      appliesTo: ["basicFareYen", "meterTimeFareYen", "timeFareYen"],
    },
    disabilityDiscount: {
      enabled: true,
      rate: 0.1,
      method: "percentage",
      roundDownToTenYen: true,
      appliesTo: ["basicFareYen", "meterTimeFareYen", "timeFareYen"],
    },
    preFixedFare: {
      excludedFromMeterReadd: Array.from(SERVICE_FEE_KEYS_EXCLUDED_FROM_METER_READD),
      excludeReservedWaitingEscortFromTimer: true,
    },
    rounding: { estimateTotalFloorTenYen: true },
  };
}

export function buildMeterRules(){
  return {
    basicFare: {
      initialDistanceKm: 1.06,
      initialFareYen: 520,
      additionalDistanceKm: 0.212,
      additionalFareYen: 100,
    },
    meterTimeFare: { lowSpeedThresholdKmh: 10, unitSeconds: 80, unitFareYen: 100 },
    waitingFare: { unitSeconds: 1800, unitFareYen: 800 },
    escortFare: { unitSeconds: 1800, unitFareYen: 1600 },
    timeMeter: {
      baseMinutes: 30,
      baseAmountYen: 4180,
      perBlockMinutes: 30,
      perBlockAmountYen: 4180,
    },
    dispatchMenuItems: [
      { id: "reservedPickup", name: "予約迎車", amount: 800, enabled: true, sortOrder: 1 },
    ],
    specialVehicleMenuItems: [
      { id: "oneBoxLift", name: "1BOXリフト車両", amount: 1000, enabled: true, sortOrder: 1 },
    ],
    assistItems: [
      { id: "boardingAssist", name: "乗降介助", amount: 1100, enabled: true, sortOrder: 1, legacyIds: ["basicAssist"] },
      { id: "bodyAssist", name: "身体介助", amount: 1600, enabled: true, sortOrder: 2, legacyIds: ["indoorAssist"] },
      {
        id: "stairsAssist",
        name: "階段介助",
        amount: 0,
        enabled: true,
        sortOrder: 3,
        floorOptions: [
          { id: "stair-floor2", label: "2階", amount: 3000 },
          { id: "stair-floor3", label: "3階", amount: 5000 },
          { id: "stair-floor4", label: "4階", amount: 7000 },
          { id: "stair-floor5", label: "5階以上", amount: 10000 },
        ],
      },
      { id: "standardWheelchair", name: "標準車いす", amount: 0, enabled: true, sortOrder: 4, displayLabel: "標準車いす 無料" },
      { id: "recliningWheelchair", name: "リクライニング車いす", amount: 2500, enabled: true, sortOrder: 5, legacyIds: ["recliningAssist"] },
      { id: "stretcherEquipment", name: "ストレッチャー", amount: 4000, enabled: true, sortOrder: 6, legacyIds: ["stretcherAssist"] },
    ],
    discount: { name: "障害者割引", method: "percentage", value: 10 },
    expensePresets: [
      { id: "expressway", name: "高速道路料金", defaultAmountYen: 0 },
      { id: "parking", name: "駐車料金", defaultAmountYen: 0 },
    ],
    deprecatedAssistItems: [
      { id: "basicAssist", name: "基本介助", amount: 500 },
      { id: "indoorAssist", name: "室内介助", amount: 500 },
    ],
  };
}

export function buildFareRulesFromEstimateConfig(baseEstimateConfig){
  const config = JSON.parse(JSON.stringify(baseEstimateConfig || {}));
  config.version = 1;
  config.fareMasterVersion = FARE_MASTER_VERSION;
  config.fareMasterId = FARE_MASTER_ID;
  if(config.categories?.assistance?.items){
    config.categories.assistance.items.forEach((item) => {
      if(item.id === "boarding-assist") item.label = "乗降介助";
      if(item.id === "body-assist") item.label = "身体介助";
    });
  }
  if(config.categories?.mobility?.items){
    config.categories.mobility.items.forEach((item) => {
      if(item.id === "free-wheelchair") item.label = "標準車いす";
    });
  }
  return config;
}

export function buildHeadquartersV1Record(baseEstimateConfig){
  const now = new Date().toISOString();
  return {
    id: FARE_MASTER_ID,
    version: FARE_MASTER_VERSION,
    tenantId: null,
    franchiseeId: null,
    storeId: null,
    scopeType: "headquarters",
    parentVersionId: null,
    status: "active",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    fareRules: buildFareRulesFromEstimateConfig(baseEstimateConfig),
    displayRules: buildDisplayRules(),
    calculationRules: buildCalculationRules(),
    meterRules: buildMeterRules(),
    createdAt: now,
    createdBy: "system",
    updatedAt: now,
    updatedBy: "system",
    publishedAt: now,
    publishedBy: "system",
    changeReason: "料金マスター仕様書 v1.0 本部標準料金 初回登録",
  };
}

/** ブラウザ（LP・管理画面）向け */
if(typeof globalThis !== "undefined"){
  globalThis.FareMasterV1 = {
    FARE_MASTER_VERSION,
    FARE_MASTER_ID,
    SERVICE_FEE_KEYS,
    SERVICE_FEE_KEYS_EXCLUDED_FROM_METER_READD,
    LEGACY_LABEL_ALIASES,
    buildDisplayRules,
    buildCalculationRules,
    buildMeterRules,
    buildFareRulesFromEstimateConfig,
    buildHeadquartersV1Record,
  };
}
