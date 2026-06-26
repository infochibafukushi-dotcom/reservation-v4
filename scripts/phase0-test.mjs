/**
 * Phase 0 local integration tests (Miniflare in-memory D1).
 * Run: node scripts/phase0-test.mjs
 */
import { Miniflare, Log, LogLevel } from "miniflare";
import { fileURLToPath } from "url";
import path from "path";
import { createMiniflareWorkerOptions } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LP_TOKEN = "test-lp-token-phase0";
const ESTIMATE_NO = "EST-PHASE0-TEST-001";

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

const reservationBody = {
  usageType: "初めて",
  name: "テストタロウ",
  phone: "09012345678",
  email: "test@example.com",
  date: "2099-12-31",
  time: "10:00",
  pickup: "千葉駅",
  destination: "東京駅",
  vehicle: "車いす",
  estimate: "12,000円～",
  estimateNo: ESTIMATE_NO,
  quoteSnapshot: sampleSnapshot
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

async function main() {
  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    bindings: { LP_REGISTER_TOKEN: LP_TOKEN },
    d1Databases: { DB: "phase0-test-db" },
    log: new Log(LogLevel.ERROR)
  });

  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`)
    .bind("https://infochibafukushi-dotcom.github.io")
    .run();

  const results = [];
  const record = (id, pass, detail) => results.push({ id, pass, detail });

  try {
    // N-1 register success
    let res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LP_TOKEN}`
      },
      body: JSON.stringify(registerBody)
    });
    let out = await jsonRes(res);
    record("N-1", res.status === 200 && out.data?.success === true, `status=${res.status} ${out.text.slice(0, 120)}`);

    // N-2 no auth
    res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody)
    });
    out = await jsonRes(res);
    record("N-2", res.status === 401, `status=${res.status}`);

    // N-3 invalid estimate no
    res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LP_TOKEN}`
      },
      body: JSON.stringify({ ...registerBody, estimateNo: "INVALID-001" })
    });
    out = await jsonRes(res);
    record("N-3", res.status === 400, `status=${res.status}`);

    // N-5 duplicate register
    res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LP_TOKEN}`
      },
      body: JSON.stringify(registerBody)
    });
    out = await jsonRes(res);
    record("N-5", res.status === 409, `status=${res.status}`);

    // N-6 GET active
    res = await mf.dispatchFetch(`http://localhost/api/quotes/${encodeURIComponent(ESTIMATE_NO)}`);
    out = await jsonRes(res);
    record(
      "N-6",
      res.status === 200 && out.data?.total === 12000 && out.data?.status === "active",
      `status=${res.status} total=${out.data?.total}`
    );

    // N-7 GET not found
    res = await mf.dispatchFetch("http://localhost/api/quotes/EST-NOT-FOUND-999");
    out = await jsonRes(res);
    record("N-7", res.status === 404, `status=${res.status}`);

    // R-1 bootstrap
    res = await mf.dispatchFetch("http://localhost/api/bootstrap");
    out = await jsonRes(res);
    record("R-1", res.status === 200 && out.data?.success === true, `status=${res.status}`);

    // R-2 normal reservation (required fields only - may 409 if slot blocked, 200 if ok)
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "ヤマダタロウ",
        phone: "09011112222",
        email: "regression@example.com",
        date: "2099-06-15",
        time: "14:00",
        pickup: "千葉駅",
        vehicle: "車いす",
        destination: "東京駅",
        estimate: "5,000円～"
      })
    });
    out = await jsonRes(res);
    record("R-2", res.status === 200 && out.data?.success === true, `status=${res.status} id=${out.data?.id || ""}`);

    // R-2b estimate-linked reservation (unchanged flow)
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reservationBody)
    });
    out = await jsonRes(res);
    record("R-2b", res.status === 200 && out.data?.success === true, `status=${res.status} id=${out.data?.id || ""}`);

    // R-3 missing required field
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usageType: "初めて", name: "テスト" })
    });
    out = await jsonRes(res);
    record("R-3", res.status === 400, `status=${res.status}`);

    // R-5 menu
    res = await mf.dispatchFetch("http://localhost/api/menu");
    out = await jsonRes(res);
    record("R-5", res.status === 200 && Array.isArray(out.data?.move_type), `status=${res.status}`);

    // R-6 cancel (use last reservation id if created)
    const cancelId = out.data?.id;
    res = await mf.dispatchFetch("http://localhost/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...reservationBody,
        date: "2099-06-16",
        time: "15:00",
        phone: "09033334444"
      })
    });
    out = await jsonRes(res);
    const cancelTarget = out.data?.id;
    if (cancelTarget) {
      res = await mf.dispatchFetch("http://localhost/api/cancelReservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cancelTarget })
      });
      out = await jsonRes(res);
      record("R-6", res.status === 200 && out.data?.success === true, `status=${res.status}`);
    } else {
      record("R-6", false, "cancel target not created");
    }

    // Verify quotes unaffected by reservation
    res = await mf.dispatchFetch(`http://localhost/api/quotes/${encodeURIComponent(ESTIMATE_NO)}`);
    out = await jsonRes(res);
    record("R-quotes", res.status === 200 && out.data?.status === "active", `quotes still active after reservation`);

    const failed = results.filter((r) => !r.pass);
    console.log("\n=== Phase 0 Test Results ===\n");
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
