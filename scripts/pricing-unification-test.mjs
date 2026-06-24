/**
 * Pricing unification smoke test
 * Run: node scripts/pricing-unification-test.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import vm from "vm";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadCalc() {
  const sandbox = { global: {}, window: {} };
  sandbox.global = sandbox.window;
  vm.runInNewContext(readFileSync(path.join(root, "shared/estimate-calc.js"), "utf8"), sandbox);
  return sandbox.window.EstimateCalc;
}

function loadPricing() {
  const sandbox = { global: {}, window: {} };
  sandbox.global = sandbox.window;
  vm.runInNewContext(readFileSync(path.join(root, "reservation-pricing.js"), "utf8"), sandbox);
  return sandbox.window.ReservationPricing;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const config = JSON.parse(readFileSync(path.join(root, "data/estimate-config.json"), "utf8"));
const EstimateCalc = loadCalc();
const ReservationPricing = loadPricing();
globalThis.EstimateCalc = EstimateCalc;

const form = {
  moveType: "無料車いす",
  assistType: "乗降介助",
  stairType: "階段介助なし",
  tripType: "往復",
  roundTripAddon: "待機",
  distanceKm: 0
};

const state = ReservationPricing.mapFormToEstimateState(form);
assert(state.tripTypeId === "round-trip", "tripTypeId should be round-trip");
assert(state.roundTripAddonId === "addon-waiting", "roundTripAddonId should be addon-waiting");

const result = EstimateCalc.computeEstimate(config, state);
assert(result.total === 1800 + 1100 + 800, `expected 3700 got ${result.total}`);
assert(
  ReservationPricing.resolveRoundTripValue("往復", "待機") === "待機",
  "resolveRoundTripValue waiting"
);
assert(
  ReservationPricing.resolveRoundTripValue("往復", "なし") === "往復",
  "resolveRoundTripValue round only"
);
assert(
  ReservationPricing.resolveRoundTripValue("片道", "なし") === "片道",
  "resolveRoundTripValue one-way"
);

console.log("pricing-unification-test: OK");
console.log("  total (no distance):", result.total, "yen");
console.log("  breakdown service fees:", result.quoteSnapshot?.serviceFees?.map((r) => `${r.label}:${r.amount}`).join(", "));
