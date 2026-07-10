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

/** 本部標準 v1 — 見積計算に必要な fareRules の完全定義（seed 唯一の正本） */
export function buildHeadquartersFareRules(){
  const meter = buildMeterRules();
  const bf = meter.basicFare;
  const tm = meter.timeMeter;
  const mt = meter.meterTimeFare;
  return {
    enabled: true,
    version: 1,
    fareMasterVersion: FARE_MASTER_VERSION,
    fareMasterId: FARE_MASTER_ID,
    fareMode: "distance_time",
    fareModeOptions: [
      { id: "time", label: "時間制運賃", enabled: true },
      { id: "distance", label: "距離制運賃", enabled: true },
      { id: "distance_time", label: "距離＋予定時間加算（概算）", enabled: true },
      { id: "pre_fixed_fare", label: "事前確定運賃", enabled: true },
    ],
    basicFees: {
      baseFare: { id: "baseFare", label: "基本運賃", amount: 0, visible: false, order: 1 },
      pickupFee: { id: "pickupFee", label: "迎車料金", amount: 800, visible: true, order: 2, lpVisible: true, estimateVisible: true, showTilde: true },
      specialVehicleFee: { id: "specialVehicleFee", label: "特殊車両使用料", amount: 1000, visible: true, order: 3, lpVisible: true, estimateVisible: true, showTilde: true },
    },
    distancePricing: {
      mode: "patternA",
      patternA: {
        initialDistanceKm: bf.initialDistanceKm,
        initialFare: bf.initialFareYen,
        incrementDistanceKm: bf.additionalDistanceKm,
        incrementFare: bf.additionalFareYen,
      },
      patternB: { perKmRate: 450 },
    },
    fareComponents: {
      time: [
        { key: "timeBaseFare", label: "時間制運賃", calculator: "time_block", params: { baseMinutes: tm.baseMinutes, baseAmount: tm.baseAmountYen, perBlockMinutes: tm.perBlockMinutes, perBlockAmount: tm.perBlockAmountYen } },
        { key: "pickupFee", label: "迎車料金", calculator: "fixed_fee_ref", feeRef: "pickupFee" },
        { key: "specialVehicleFee", label: "特殊車両使用料", calculator: "fixed_fee_ref", feeRef: "specialVehicleFee" },
      ],
      distance: [
        { key: "pickupFee", label: "迎車料金", calculator: "fixed_fee_ref", feeRef: "pickupFee" },
        { key: "specialVehicleFee", label: "特殊車両使用料", calculator: "fixed_fee_ref", feeRef: "specialVehicleFee" },
        { key: "distanceFare", label: "距離運賃", calculator: "distance_pricing_ref", pricingRef: "distancePricing" },
      ],
      distance_time: [
        { key: "pickupFee", label: "迎車料金", calculator: "fixed_fee_ref", feeRef: "pickupFee" },
        { key: "specialVehicleFee", label: "特殊車両使用料", calculator: "fixed_fee_ref", feeRef: "specialVehicleFee" },
        { key: "distanceFare", label: "距離運賃", calculator: "distance_pricing_ref", pricingRef: "distancePricing" },
        { key: "timeAdjustment", label: "予定時間加算（概算）", calculator: "time_block", params: { baseMinutes: 20, baseAmount: 0, perBlockMinutes: 10, perBlockAmount: 300 } },
      ],
      pre_fixed_fare: [
        { key: "pickupFee", label: "迎車料金", calculator: "fixed_fee_ref", feeRef: "pickupFee" },
        { key: "specialVehicleFee", label: "特殊車両使用料", calculator: "fixed_fee_ref", feeRef: "specialVehicleFee" },
        { key: "distanceFare", label: "距離運賃", calculator: "distance_pricing_ref", pricingRef: "distancePricing" },
        { key: "timeAdjustment", label: "予定時間加算（概算）", calculator: "time_block", params: { baseMinutes: 20, baseAmount: 0, perBlockMinutes: 10, perBlockAmount: 300 } },
      ],
    },
    categories: {
      mobility: {
        label: "移動方法",
        items: [
          { id: "free-wheelchair", label: "標準車いす", description: "当社の標準車いすを無料でご利用いただけます。", amount: 0, visible: true, order: 1 },
          { id: "own-wheelchair", label: "ご自身の車いす", description: "普段ご利用されている車いすのままご乗車いただけます。", amount: 0, visible: true, order: 2 },
          { id: "reclining-wheelchair", label: "リクライニング車いす", description: "長時間の移動向けのリクライニング式車いすです。", amount: 2500, visible: true, order: 3 },
          { id: "stretcher", label: "ストレッチャー", description: "寝たままの状態で搬送できる設備です。", amount: 4000, visible: true, order: 4 },
          { id: "cane-walk", label: "杖・歩行器", description: "杖や歩行器での移動に対応します。", amount: 0, visible: true, order: 5 },
        ],
      },
      assistance: {
        label: "介助内容",
        items: [
          { id: "watch-assist", label: "見守り介助", description: "転倒防止のため付き添いながら移動を見守ります。", amount: 0, visible: true, order: 1 },
          { id: "boarding-assist", label: "乗降介助", description: "車への乗り降りをお手伝いします。", amount: 1100, visible: true, order: 2 },
          { id: "body-assist", label: "身体介助", description: "お部屋から車いすへの移乗介助などを行います。", amount: 1600, visible: true, order: 3 },
        ],
      },
      stairAssist: {
        label: "階段介助",
        items: [
          { id: "stair-none", label: "階段介助なし", description: "", amount: 0, visible: true, order: 1 },
          { id: "stair-watch", label: "見守り介助", description: "階段移動時の見守りです。", amount: 0, visible: true, order: 2 },
          { id: "stair-floor2", label: "2階移動", description: "2階での階段介助です。", amount: 3000, visible: true, order: 3 },
          { id: "stair-floor3", label: "3階移動", description: "3階での階段介助です。", amount: 5000, visible: true, order: 4 },
          { id: "stair-floor4", label: "4階移動", description: "4階での階段介助です。", amount: 7000, visible: true, order: 5 },
          { id: "stair-floor5", label: "5階以上", description: "5階以上での階段介助です。", amount: 10000, visible: true, order: 6 },
        ],
      },
      tripType: {
        label: "送迎方法",
        items: [
          { id: "one-way", label: "片道", description: "片道の送迎です。", amount: 0, visible: true, order: 1, distanceMultiplier: 1, waitingFeeRef: "", escortFeeRef: "", showInSelector: true },
          { id: "round-trip", label: "往復", description: "往復の送迎です。", amount: 0, visible: true, order: 2, distanceMultiplier: 2, waitingFeeRef: "", escortFeeRef: "", showInSelector: true },
        ],
      },
      roundTripAddon: {
        label: "待機・付き添い",
        items: [
          { id: "addon-waiting", label: "待機（30分）", description: "30分単位の待機サービスです。", amount: 0, visible: true, order: 1, waitingFeeRef: "waiting30min", escortFeeRef: "", distanceMultiplier: 1 },
          { id: "addon-escort", label: "付き添い（30分）", description: "30分単位の付き添いサービスです。", amount: 0, visible: true, order: 2, waitingFeeRef: "", escortFeeRef: "escort30min", distanceMultiplier: 1 },
        ],
      },
    },
    waitingFees: {
      waiting30min: { id: "waiting30min", label: "待機（30分）", amount: 800, visible: true, order: 1 },
      escort30min: { id: "escort30min", label: "付き添い（30分）", amount: 1600, visible: true, order: 2 },
    },
    preFixedFare: { trafficZoneId: "chiba" },
    trafficZones: {
      items: [
        { id: "chiba", label: "千葉交通圏", coefficient: 1.18, order: 1 },
        { id: "keiyo", label: "京葉交通圏", coefficient: 1.2, order: 2 }
      ]
    },
    mappings: {
      mobilityAssistance: {
        "cane-walk": { mode: "select", assistanceIds: ["watch-assist", "boarding-assist", "body-assist"], assistanceId: "watch-assist" },
        "own-wheelchair": { mode: "required", assistanceIds: ["boarding-assist", "body-assist"], assistanceId: "watch-assist" },
        "free-wheelchair": { mode: "required", assistanceIds: ["boarding-assist", "body-assist"], assistanceId: "watch-assist" },
        "reclining-wheelchair": { mode: "required", assistanceIds: ["boarding-assist", "body-assist"], assistanceId: "watch-assist" },
        stretcher: { mode: "fixed", assistanceIds: [], assistanceId: "body-assist" },
      },
    },
    resultLabels: {
      baseFare: "基本運賃",
      pickupFee: "迎車料金",
      specialVehicleFee: "特殊車両使用料",
      distanceFare: "距離運賃",
      wheelchairFee: "車いす料金",
      assistanceFee: "介助料金",
      stairFee: "階段介助料金",
      waitingFee: "待機料金",
      escortFee: "付き添い料金",
      total: "概算料金",
    },
    meterTimeFare: {
      lowSpeedThresholdKmh: mt.lowSpeedThresholdKmh,
      unitSeconds: mt.unitSeconds,
      unitFareYen: mt.unitFareYen,
    },
  };
}

export function buildFareRulesFromEstimateConfig(baseEstimateConfig){
  if(!baseEstimateConfig || !Object.keys(baseEstimateConfig).length){
    return buildHeadquartersFareRules();
  }
  const config = JSON.parse(JSON.stringify(baseEstimateConfig));
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

export function buildHeadquartersV1Record(){
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
    fareRules: buildHeadquartersFareRules(),
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
    buildHeadquartersFareRules,
    buildFareRulesFromEstimateConfig,
    buildHeadquartersV1Record,
  };
}
