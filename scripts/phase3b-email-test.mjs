/**
 * Phase3-B email wording tests
 * Run: node scripts/phase3b-email-test.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import vm from "vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workerSrc = readFileSync(join(root, "worker.js"), "utf8");

const sliceStart = workerSrc.indexOf("function parseQuoteSnapshotFromBody");
const sliceEnd = workerSrc.indexOf("async function sendReservationEmails");
const emailBlock = workerSrc.slice(sliceStart, sliceEnd);

const sandbox = {
  module: { exports: {} },
  exports: {},
  console,
};
vm.createContext(sandbox);
vm.runInContext(
  `${emailBlock}
module.exports = {
  buildConfirmationEmailText,
  buildAdminNotificationText,
  buildEstimateFareCalculationEmailSection,
  buildAdminFareCalculationEmailSection,
  EMAIL_PRICE_NOTICE,
  EMAIL_PRICE_NOTICE_FIXED,
};`,
  sandbox
);

const {
  buildConfirmationEmailText,
  buildAdminNotificationText,
  buildEstimateFareCalculationEmailSection,
  buildAdminFareCalculationEmailSection,
  EMAIL_PRICE_NOTICE,
  EMAIL_PRICE_NOTICE_FIXED,
} = sandbox.module.exports;

const sampleSnapshot = {
  fixedFareTotal: 10000,
  total: 12000,
  fixedFareBreakdown: [
    { key: "pickupFee", label: "迎車料金", amount: 2000 },
    { key: "distanceFare", label: "距離運賃", amount: 8000 },
  ],
  serviceFees: [{ key: "assistanceFee", label: "介助料金", amount: 2000 }],
  fareMode: "distance",
  fareVersion: "v1",
  quoteVersion: 1,
  distanceKm: 8.5,
  durationSeconds: 1200,
};

const fixedBody = {
  name: "山田太郎",
  phone: "090-1234-5678",
  email: "test@example.com",
  date: "2026-06-26",
  time: "10:00",
  pickup: "千葉市",
  destination: "病院",
  vehicle: "車いす",
  estimate: "12,000円",
  fixedFareConfirmed: true,
  confirmedFare: 12000,
  quoteSnapshot: sampleSnapshot,
  routePlan: { distanceMeters: 8500, durationSeconds: 1200 },
  usageSummary: [{ label: "移動方法", value: "車いす" }],
};

const legacyBody = {
  name: "佐藤花子",
  phone: "080-9876-5432",
  email: "legacy@example.com",
  date: "2026-06-27",
  time: "11:00",
  pickup: "船橋市",
  destination: "東京駅",
  vehicle: "歩行",
  estimate: "8,500円～",
  quoteSnapshot: sampleSnapshot,
  routePlan: { distanceMeters: 12000, durationSeconds: 1800 },
};

const estimateNo = "EST-PHASE3B-001";
let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  OK: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

function mustNotInclude(text, word, label) {
  check(!text.includes(word), `${label}: must not include "${word}"`);
}

function mustInclude(text, word, label) {
  check(text.includes(word), `${label}: must include "${word}"`);
}

console.log("=== A: fixed fare customer email ===\n");
const fixedCustomer = buildConfirmationEmailText("R-FIXED", fixedBody, estimateNo, "");
mustInclude(fixedCustomer, "■ 確定運賃", "customer header");
mustNotInclude(fixedCustomer, "■ 確定料金", "customer header");
mustNotInclude(fixedCustomer, "概算料金", "customer");
mustNotInclude(fixedCustomer, "料金目安", "customer");
mustNotInclude(fixedCustomer, "円～", "customer");
mustNotInclude(fixedCustomer, "変動する場合があります", "customer");
mustInclude(fixedCustomer, "【事前確定運賃について】", "customer notice heading");
mustInclude(fixedCustomer, EMAIL_PRICE_NOTICE_FIXED.trim().split("\n")[0], "customer fixed notice");
mustNotInclude(fixedCustomer, "【料金について】", "customer legacy notice heading");
mustInclude(fixedCustomer, "本運賃は予約時に確定した運賃です。", "customer breakdown footer");

console.log("\n=== A: fixed fare admin email ===\n");
const fixedAdmin = buildAdminNotificationText("R-FIXED", fixedBody, estimateNo);
mustInclude(fixedAdmin, "■ 確定運賃", "admin header");
mustNotInclude(fixedAdmin, "■ 概算料金", "admin header");
mustNotInclude(fixedAdmin, "概算料金", "admin");
mustInclude(fixedAdmin, "■ 料金計算情報", "admin breakdown");
mustInclude(fixedAdmin, "運賃方式：距離定額", "admin fare mode");
mustInclude(fixedAdmin, `見積番号：${estimateNo}`, "admin estimate in breakdown");

console.log("\n=== B: legacy customer email ===\n");
const legacyCustomer = buildConfirmationEmailText("R-LEGACY", legacyBody, estimateNo, "");
mustInclude(legacyCustomer, "■ 概算料金", "legacy customer header");
mustNotInclude(legacyCustomer, "■ 確定運賃", "legacy customer header");
mustInclude(legacyCustomer, "8,500円～", "legacy estimate with tilde");
mustInclude(legacyCustomer, "※表示は予約時点の料金目安です。", "legacy breakdown disclaimer");
mustInclude(legacyCustomer, "実際の料金は介助内容・待機時間・交通状況等により変動する場合があります。", "legacy breakdown disclaimer");
mustInclude(legacyCustomer, "【料金について】", "legacy notice heading");
mustInclude(legacyCustomer, EMAIL_PRICE_NOTICE, "legacy notice body");
mustNotInclude(legacyCustomer, "【事前確定運賃について】", "legacy customer");

console.log("\n=== B: legacy admin email ===\n");
const legacyAdmin = buildAdminNotificationText("R-LEGACY", legacyBody, estimateNo);
mustInclude(legacyAdmin, "■ 概算料金", "legacy admin header");
mustNotInclude(legacyAdmin, "■ 確定運賃", "legacy admin header");
mustNotInclude(legacyAdmin, "■ 料金計算情報", "legacy admin breakdown");

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);

if (failed === 0) {
  console.log("--- fixed fare customer email (full) ---\n");
  console.log(fixedCustomer);
  console.log("\n--- legacy customer email (full) ---\n");
  console.log(legacyCustomer);
}

process.exit(failed > 0 ? 1 : 0);
