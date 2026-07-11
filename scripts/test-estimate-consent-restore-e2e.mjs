/**
 * Local consent-flow restore E2E (no production reservation).
 * Registers a pre_fixed_fare quote via Miniflare and verifies API restore fields
 * used by the booking consent UI.
 *
 * Run: node scripts/test-estimate-consent-restore-e2e.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import path from "path";
import { fileURLToPath } from "url";
import { createMiniflareWorkerOptions, seedTestPublicReservationSettings } from "./worker-modules.mjs";
import fs from "fs";
import vm from "vm";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LP_ORIGIN = "https://www.chibacaretaxi.com";
const ESTIMATE_NO = "EST-CONSENT-RESTORE-001";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadHandoff() {
  const code = fs.readFileSync(path.join(root, "estimate-handoff.js"), "utf8");
  const sandbox = {
    window: {},
    URLSearchParams,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { search: `?source=estimate&estimateNo=${ESTIMATE_NO}` }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox.EstimateBookingHandoff;
}

const snapshot = {
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
};

async function main() {
  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "consent-restore-db" },
    log: new Log(LogLevel.ERROR)
  });
  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`)
    .bind(`${LP_ORIGIN},https://infochibafukushi-dotcom.github.io`)
    .run();
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('fixed_fare_enabled', 'true')`).run();
  await mf.dispatchFetch("http://localhost/api/bootstrap");
  await seedTestPublicReservationSettings(db);

  const registerBody = {
    estimateNo: ESTIMATE_NO,
    total: 4810,
    fareType: "fixed",
    quoteSnapshot: snapshot,
    routePlan: {
      pickup: { address: "出洲港" },
      destination: { address: "千葉メディカルセンター" },
      selectedRouteId: "route_0",
      distanceMeters: 3344,
      durationSeconds: 558
    },
    usageSummary: [
      { label: "移動方法", value: "標準車いす" },
      { label: "介助内容", value: "乗降介助" },
      { label: "運賃方式", value: "事前確定運賃" }
    ],
    handoffSource: "lp-site-estimate",
    dtoVersion: 2
  };

  let res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: LP_ORIGIN },
    body: JSON.stringify(registerBody)
  });
  let out = await res.json();
  assert(res.status === 200 && out.success === true, `register failed: ${res.status}`);

  res = await mf.dispatchFetch(`http://localhost/api/quotes/${ESTIMATE_NO}`, {
    headers: { Origin: "https://infochibafukushi-dotcom.github.io" }
  });
  out = await res.json();
  assert(res.status === 200 && out.success === true, "GET quote failed");
  assert(out.fareMode === "pre_fixed_fare" || out.quoteSnapshot?.fareMode === "pre_fixed_fare", "fareMode pre_fixed_fare");
  assert(out.quoteSnapshot.preFixedFareMode === true, "preFixedFareMode true");
  assert(out.selectedRouteId === "route_0" || out.quoteSnapshot.selectedRouteId === "route_0", "route_0");
  assert(out.total === 4810, "total 4810");
  assert(out.quoteSnapshot.baseDistanceFareAmount === 1620, "base 1620");
  assert(out.quoteSnapshot.adjustedDistanceFareAmount === 1910, "adjusted 1910");
  assert(out.quoteSnapshot.preFixedFareAmount === 1910, "body 1910");
  assert(out.quoteSnapshot.scheduledDurationSurcharge === 0, "surcharge 0");

  const api = loadHandoff();
  const state = api.initEstimateBookingMode();
  assert(state.active === true && state.pendingApi === true, "url-only pending restore");
  const handoff = api.buildHandoffFromQuoteResponse(out);
  assert(handoff.total === 4810, "consent handoff total");
  assert(handoff.quoteSnapshot.fareMode === "pre_fixed_fare", "consent fareMode");
  assert(handoff.quoteSnapshot.preFixedFareMode === true, "consent preFixedFareMode");
  const consentText = `見積番号 ${handoff.estimateNumber} の確定運賃 ${handoff.total.toLocaleString("ja-JP")}円 および上記見積内容に同意して予約する`;
  assert(/EST-CONSENT-RESTORE-001/.test(consentText), "consent shows estimate no");
  assert(/4,810/.test(consentText), "consent shows total");

  // error cases
  res = await mf.dispatchFetch("http://localhost/api/quotes/EST-DOES-NOT-EXIST");
  assert(res.status === 404, "missing quote 404");
  res = await mf.dispatchFetch("http://localhost/api/quotes/BAD");
  assert(res.status === 400, "bad estimateNo 400");

  console.log("estimate consent restore e2e passed");
  await mf.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
