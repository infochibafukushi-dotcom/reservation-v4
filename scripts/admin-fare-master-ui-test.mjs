/**
 * 料金マスター管理画面（admin-fare-master.js）の静的検証
 * Run: node scripts/admin-fare-master-ui-test.mjs
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { buildHeadquartersV1Record } from "../shared/fare-master-v1.js";
import { buildFareMasterEditForm } from "../shared/fare-master-core.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function assert(cond, msg){
  if(!cond) throw new Error(msg);
}

const source = readFileSync(path.join(root, "admin-fare-master.js"), "utf8");

assert(!source.includes('sessionStorage.getItem("adminToken")'), "must not use wrong adminToken key");
assert(!source.includes("window.API"), "must not use undefined window.API");
assert(source.includes("getAdminToken"), "must use getAdminToken from index.api.js");
assert(source.includes("apiUrl("), "must use apiUrl for API base");
assert(source.includes("formatFareMasterError"), "must define formatFareMasterError");
assert(source.includes("renderActiveBoxError"), "must render error state");
assert(source.includes("401：管理者ログイン"), "must show 401 re-login message");
assert(source.includes("refreshFareMasterPanel"), "must expose refreshFareMasterPanel");

const hq = buildHeadquartersV1Record();
const form = buildFareMasterEditForm(hq);
assert(form.initialDistanceKm === 1.06, "initialDistanceKm 1.06");
assert(form.initialFare === 520, "initialFare 520");
assert(form.incrementDistanceKm === 0.212, "incrementDistanceKm 0.212");
assert(form.incrementFare === 100, "incrementFare 100");
assert(form.timeBaseMinutes === 30 && form.timeBaseAmountYen === 4180, "time 30min 4180");
assert(form.pickupFee === 800, "pickup 800");
assert(form.specialVehicleFee === 1000, "special 1000");
assert(form.boardingAssist === 1100, "boarding 1100");
assert(form.bodyAssist === 1600, "body 1600");
assert(form.stairFloor2 === 3000, "stair2 3000");
assert(form.stairFloor3 === 5000, "stair3 5000");
assert(form.stairFloor4 === 7000, "stair4 7000");
assert(form.stairFloor5 === 10000, "stair5 10000");
assert(form.waitingUnitFareYen === 800, "waiting 800");
assert(form.escortUnitFareYen === 1600, "escort 1600");
assert(form.standardWheelchair === 0, "standard wheelchair 0");
assert(form.recliningWheelchair === 2500, "reclining 2500");
assert(form.stretcher === 4000, "stretcher 4000");
assert(form.nightSurchargeRate === 0.2, "night 20%");
assert(form.disabilityDiscountRate === 0.1, "disability 10%");

const sandbox = {
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
    readyState: "complete",
    addEventListener: () => {},
  },
  window: {},
  apiUrl: (p) => `https://example.test${p}`,
  fetchWithRetry: async () => ({ ok: false, status: 401, text: async () => '{"success":false,"message":"Unauthorized"}' }),
  authHeaders: () => ({}),
  getAdminToken: () => "token",
  escapeHtml: (v) => String(v),
  toast: () => {},
  clearAdminSession: () => {},
};
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox);
assert(typeof sandbox.window.FareMasterAdmin?.formatFareMasterError === "function", "FareMasterAdmin exported");
assert(
  sandbox.window.FareMasterAdmin.formatFareMasterError(401, {}, "") === "401：管理者ログインの有効期限が切れています。再ログインしてください。",
  "401 message",
);
assert(
  sandbox.window.FareMasterAdmin.formatFareMasterError(500, { message: "boom" }, "") === "500：サーバーエラーが発生しました。（boom）",
  "500 message",
);

console.log("admin-fare-master-ui-test: ALL PASSED (" + new Date().toISOString() + ")");
