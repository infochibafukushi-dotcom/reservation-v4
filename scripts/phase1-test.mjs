/**
 * Phase 1 integration tests (Origin auth + LP register contract).
 * Run: node scripts/phase1-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import vm from "vm";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lpRoot = path.resolve(root, "..", "lp-site");
const LP_ORIGIN = "https://infochibafukushi-dotcom.github.io";
const ESTIMATE_NO = "EST-PHASE1-ORIGIN-001";

const sampleSnapshot = {
  fixedFareTotal: 10000,
  total: 12000,
  fixedFareBreakdown: [
    { key: "pickupFee", label: "迎車料金", amount: 2000 },
    { key: "distanceFare", label: "距離運賃", amount: 8000 }
  ],
  serviceFees: [{ key: "assistanceFee", label: "介助料金", amount: 2000 }],
  fareMode: "distance",
  fareVersion: "v1",
  quoteVersion: 1
};

const registerBody = {
  estimateNo: ESTIMATE_NO,
  total: 12000,
  fareType: "fixed",
  quoteSnapshot: sampleSnapshot,
  routePlan: { pickup: "A", destination: "B" },
  usageSummary: [{ label: "移動方法", value: "車いす" }],
  handoffSource: "lp-site-estimate",
  dtoVersion: 2
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function jsonRes(res) {
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text), text };
  } catch {
    return { status: res.status, data: null, text };
  }
}

function loadLpRegisterModule() {
  const configPath = path.join(lpRoot, "shared", "estimate-quote-config.js");
  const registerPath = path.join(lpRoot, "shared", "estimate-quote-register.js");
  assert(fs.existsSync(configPath), `missing ${configPath}`);
  assert(fs.existsSync(registerPath), `missing ${registerPath}`);

  const sandbox = { global: {}, window: {}, TenantDefaults: {} };
  sandbox.global = sandbox.window;
  vm.runInNewContext(fs.readFileSync(configPath, "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(registerPath, "utf8"), sandbox);
  return sandbox.window.EstimateQuoteRegister;
}

async function main() {
  const mf = new Miniflare({
    modules: [
      { type: "ESModule", path: path.join(root, "worker.js") }
    ],
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "phase1-test-db" },
    log: new Log(LogLevel.ERROR)
  });

  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`)
    .bind(LP_ORIGIN)
    .run();

  const results = [];
  const record = (id, pass, detail) => results.push({ id, pass, detail });

  try {
    // S-1 worker startup
    let res = await mf.dispatchFetch("http://localhost/");
    const startupText = await res.text();
    record("S-1", res.status === 200 && startupText === "OK", `GET / status=${res.status} body=${startupText}`);

    // P1-1 Origin auth register (Phase 1 primary path, no Bearer)
    res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: LP_ORIGIN
      },
      body: JSON.stringify(registerBody)
    });
    let out = await jsonRes(res);
    record(
      "P1-1",
      res.status === 200 && out.data?.success === true,
      `Origin register status=${res.status}`
    );

    // P1-2 wrong origin rejected
    res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example.com"
      },
      body: JSON.stringify({ ...registerBody, estimateNo: "EST-PHASE1-WRONG-ORIGIN" })
    });
    out = await jsonRes(res);
    record("P1-2", res.status === 401, `wrong origin status=${res.status}`);

    // P1-3 no auth rejected
    res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...registerBody, estimateNo: "EST-PHASE1-NO-AUTH" })
    });
    out = await jsonRes(res);
    record("P1-3", res.status === 401, `no auth status=${res.status}`);

    // P1-4 duplicate via Origin (LP treats 409 as ok)
    res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: LP_ORIGIN
      },
      body: JSON.stringify(registerBody)
    });
    out = await jsonRes(res);
    record("P1-4", res.status === 409, `duplicate status=${res.status}`);

    // P1-5 fixed_fare_enabled remains false
    res = await mf.dispatchFetch("http://localhost/api/bootstrap");
    out = await jsonRes(res);
    const fixedFare = await db
      .prepare(`SELECT value FROM settings WHERE key='fixed_fare_enabled' LIMIT 1`)
      .first();
    record(
      "P1-5",
      res.status === 200 && String(fixedFare?.value || "false") === "false",
      `fixed_fare_enabled=${fixedFare?.value ?? "(unset)"}`
    );

    // P1-6 createReservation unchanged (handoff fields accepted, no quote authority)
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "フェーズイチ",
        phone: "09055556666",
        email: "phase1@example.com",
        date: "2099-07-01",
        time: "11:00",
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimate: "12,000円～",
        estimateNo: ESTIMATE_NO,
        quoteSnapshot: sampleSnapshot
      })
    });
    out = await jsonRes(res);
    record("P1-6", res.status === 200 && out.data?.success === true, `createReservation status=${res.status}`);

    // P1-7 quote still active after reservation (Phase 2 not enabled)
    res = await mf.dispatchFetch(`http://localhost/api/quotes/${encodeURIComponent(ESTIMATE_NO)}`);
    out = await jsonRes(res);
    record("P1-7", res.status === 200 && out.data?.status === "active", `quote status=${out.data?.status}`);

    // P1-8 LP register payload builder
    const EstimateQuoteRegister = loadLpRegisterModule();
    const handoff = {
      estimateNumber: ESTIMATE_NO,
      total: 12000,
      quoteSnapshot: sampleSnapshot,
      routePlan: { pickup: "A", destination: "B" },
      usageSummary: [{ label: "移動方法", value: "車いす" }],
      handoffSource: "lp-site-estimate",
      dtoVersion: 2
    };
    const payload = EstimateQuoteRegister.buildRegisterPayload(handoff);
    record(
      "P1-8",
      payload.estimateNo === ESTIMATE_NO &&
        payload.total === 12000 &&
        payload.handoffSource === "lp-site-estimate" &&
        payload.dtoVersion === 2,
      `payload estimateNo=${payload.estimateNo} total=${payload.total}`
    );

    const failed = results.filter((r) => !r.pass);
    console.log("\n=== Phase 1 Test Results ===\n");
    for (const r of results) {
      console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
    }
    console.log(`\nTotal: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
    if (failed.length) process.exit(1);
  } finally {
    await mf.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
