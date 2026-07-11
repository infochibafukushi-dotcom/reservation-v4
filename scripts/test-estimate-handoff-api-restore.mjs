/**
 * Cross-origin estimate handoff + fareMode preservation tests.
 * Run: node scripts/test-estimate-handoff-api-restore.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lpRoot = path.resolve(root, "..", "lp-site");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadHandoffModule(search) {
  const code = fs.readFileSync(path.join(root, "estimate-handoff.js"), "utf8");
  const store = new Map();
  const sandbox = {
    window: {},
    URLSearchParams,
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    location: { search: search || "" }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return { api: sandbox.EstimateBookingHandoff, store };
}

function loadFareMasterClient(fromLp) {
  const file = fromLp
    ? path.join(lpRoot, "shared", "fare-master-client.js")
    : path.join(root, "shared", "fare-master-client.js");
  const code = fs.readFileSync(file, "utf8");
  const sandbox = { window: {}, localStorage: { getItem: () => null, setItem: () => {} } };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox.FareMasterClient;
}

function sampleQuote(overrides = {}) {
  return {
    success: true,
    estimateNo: "EST-20260711-7059",
    status: "active",
    total: 4810,
    fareMode: "pre_fixed_fare",
    selectedRouteId: "route_0",
    snapshotHash: "abc",
    expiresAt: "2026-07-18T00:00:00.000Z",
    createdAt: "2026-07-11T00:00:00.000Z",
    handoffSource: "lp-site-estimate",
    dtoVersion: 2,
    usageSummary: [
      { label: "移動方法", value: "標準車いす" },
      { label: "介助内容", value: "乗降介助" },
      { label: "運賃方式", value: "事前確定運賃" }
    ],
    routePlan: {
      pickup: { address: "出洲港" },
      destination: { address: "千葉メディカルセンター" },
      selectedRouteId: "route_0",
      distanceMeters: 3344,
      durationSeconds: 558,
      roadType: "general"
    },
    quoteSnapshot: {
      fareMode: "pre_fixed_fare",
      preFixedFareMode: true,
      selectedRouteId: "route_0",
      baseDistanceFareAmount: 1620,
      trafficZoneCoefficient: 1.18,
      adjustedDistanceFareAmount: 1910,
      scheduledDurationSurcharge: 0,
      preFixedFareAmount: 1910,
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
      ]
    },
    ...overrides
  };
}

function main() {
  // A. URL-only handoff (empty sessionStorage)
  {
    const { api, store } = loadHandoffModule("?source=estimate&estimateNo=EST-20260711-7059");
    assert(store.size === 0, "sessionStorage starts empty");
    const state = api.initEstimateBookingMode();
    assert(state.active === true, "URL estimateNo activates estimate mode");
    assert(state.estimateNo === "EST-20260711-7059", "estimateNo from URL");
    assert(state.degraded === false, "no degraded without sessionStorage");
    assert(state.pendingApi === true, "pendingApi when no cache");
    assert(state.handoff === null, "handoff null without sessionStorage");

    const handoff = api.buildHandoffFromQuoteResponse(sampleQuote());
    assert(handoff.estimateNumber === "EST-20260711-7059", "handoff estimateNumber");
    assert(handoff.total === 4810, "handoff total from server");
    assert(handoff.quoteSnapshot.fareMode === "pre_fixed_fare", "snapshot fareMode");
    assert(handoff.quoteSnapshot.preFixedFareMode === true, "preFixedFareMode true");
    assert(handoff.selectedRouteId === "route_0", "selectedRouteId");
    assert(handoff.quoteSnapshot.baseDistanceFareAmount === 1620, "baseDistance unchanged");
    assert(handoff.quoteSnapshot.adjustedDistanceFareAmount === 1910, "adjusted unchanged");
    assert(handoff.quoteSnapshot.preFixedFareAmount === 1910, "preFixed unchanged");
    assert(handoff.quoteSnapshot.totalAmount === 4810, "totalAmount unchanged");
    assert(handoff.quoteSnapshot.scheduledDurationSurcharge === 0, "surcharge 0");
    assert(handoff.quoteSnapshot.trafficZoneCoefficient === 1.18, "coefficient 1.18");

    api.saveHandoffRecord(handoff);
    assert(store.has(api.HANDOFF_STORAGE_KEY), "optional sessionStorage cache write");
    assert(api.isValidEstimateNo("EST-1") === true, "valid estimate no");
    assert(api.isValidEstimateNo("BAD") === false, "invalid estimate no");

    const degraded = api.markEstimateDegraded("見積が見つかりませんでした。", "EST-MISSING");
    assert(degraded.active === false, "degraded inactive");
    assert(degraded.degraded === true, "degraded flag");
  }

  // Invalid estimateNo
  {
    const { api } = loadHandoffModule("?source=estimate&estimateNo=INVALID");
    const state = api.initEstimateBookingMode();
    assert(state.degraded === true, "invalid estimateNo degrades");
    assert(state.active === false, "invalid estimateNo not active");
  }

  // B. fareMode preservation in mergeEstimateConfig
  for (const fromLp of [true, false]) {
    const label = fromLp ? "lp" : "rv4";
    const client = loadFareMasterClient(fromLp);
    const staticConfig = { fareMode: "pre_fixed_fare", basicFees: { pickupFee: { amount: 800 } } };
    const masterPayload = {
      fareMasterId: "fmv-headquarters-v1",
      fareVersionId: "fmv-headquarters-v1",
      fareVersion: "v1",
      fareSource: "active_master",
      estimateConfig: {
        fareMode: "distance_time",
        basicFees: { pickupFee: { amount: 800 }, specialVehicleFee: { amount: 1000 } }
      }
    };
    const merged = client.mergeEstimateConfig(staticConfig, masterPayload);
    assert(merged.fareMode === "pre_fixed_fare", `${label} merge preserves fareMode`);
    assert(merged.basicFees.specialVehicleFee.amount === 1000, `${label} merge keeps master fees`);
    assert(merged.fareMasterId === "fmv-headquarters-v1", `${label} merge keeps master id`);
  }

  // Amounts invariant on handoff build (no recalculation)
  {
    const { api } = loadHandoffModule("");
    const quote = sampleQuote();
    const handoff = api.buildHandoffFromQuoteResponse(quote);
    assert(handoff.total === quote.total, "no client total overwrite");
    assert(handoff.quoteSnapshot === quote.quoteSnapshot, "snapshot object reused from server");
  }

  console.log("estimate handoff API restore + fareMode preservation tests passed");
}

main();
