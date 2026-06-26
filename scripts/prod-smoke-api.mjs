/**
 * 本番 API スモークテスト（デプロイ後）
 * Run: node scripts/prod-smoke-api.mjs
 */
const API = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";
const LP_ORIGIN = "https://infochibafukushi-dotcom.github.io";

async function jsonFetch(path, options = {}) {
  const res = await fetch(API + path, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, text };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const results = [];
  const record = (id, pass, detail) => {
    results.push({ id, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
  };

  const boot = await jsonFetch("/api/bootstrap");
  const fixedFare = String(boot.data?.settings?.fixed_fare_enabled || "");
  record("BOOT", boot.status === 200, `fixed_fare_enabled=${fixedFare}`);

  const legacy = await jsonFetch("/api/createReservation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usageType: "初めて",
      name: "スモークタロウ",
      phone: "09099998888",
      email: "smoke-test@example.com",
      date: "2099-12-01",
      time: "10:00",
      pickup: "千葉駅",
      destination: "東京駅",
      vehicle: "車いす",
      estimate: "5,000円～"
    })
  });
  record(
    "LEGACY-RESERVATION",
    legacy.status === 200 && legacy.data?.success,
    `status=${legacy.status} id=${legacy.data?.id || ""}`
  );

  const estimateNo = `EST-PROD-SMOKE-${Date.now().toString().slice(-4)}`;
  const snapshot = {
    fixedFareTotal: 10000,
    serviceFees: [{ key: "assistanceFee", label: "介助料金", amount: 2000 }],
    fareMode: "distance",
    selectedRouteId: "route_0",
    selectedUsesToll: true,
    distanceMeters: 12000,
    durationSeconds: 1500,
    preFixedFareConfirmable: true
  };
  const reg = await jsonFetch("/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: LP_ORIGIN },
    body: JSON.stringify({
      estimateNo,
      total: 12000,
      fareType: "fixed",
      quoteSnapshot: snapshot,
      handoffSource: "lp-site-estimate",
      dtoVersion: 2
    })
  });
  const snapshotHash = reg.data?.snapshotHash || "";
  record(
    "QUOTE-REGISTER",
    reg.status === 200 && reg.data?.success && snapshotHash,
    `estimateNo=${estimateNo} hash=${snapshotHash.slice(0, 16)}... expiresAt=${reg.data?.expiresAt || ""}`
  );

  if (fixedFare === "true" && snapshotHash) {
    const consentText = `見積番号 ${estimateNo} の確定運賃 12,000円 および上記見積内容に同意して予約する`;
    const fixed = await jsonFetch("/api/createReservation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.99"
      },
      body: JSON.stringify({
        usageType: "初めて",
        name: "スモークジロウ",
        phone: "09088887777",
        email: "smoke-fixed@example.com",
        date: "2099-12-02",
        time: "11:00",
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimate: "12,000円",
        estimateNo,
        estimateConsent: {
          estimateNo,
          quotedFare: 12000,
          consentText,
          consentTextVersion: "2026-06-01-v1",
          snapshotHash
        }
      })
    });
    record(
      "FIXED-RESERVATION",
      fixed.status === 200 && fixed.data?.success,
      `status=${fixed.status} id=${fixed.data?.id || ""} confirmedFare=${fixed.data?.confirmedFare || ""}`
    );

    const dup = await jsonFetch("/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "スモークサブロウ",
        phone: "09077776666",
        email: "smoke-dup@example.com",
        date: "2099-12-02",
        time: "11:30",
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimateNo,
        estimateConsent: { estimateNo, quotedFare: 12000, consentText, consentTextVersion: "2026-06-01-v1", snapshotHash }
      })
    });
    record("DUPLICATE-410", dup.status === 410, `status=${dup.status}`);

    console.log("\n--- report ids ---");
    console.log("estimateNo:", estimateNo);
    console.log("reservationId:", fixed.data?.id || "");
    console.log("snapshotHash:", snapshotHash);
  } else {
    record("FIXED-RESERVATION", true, "skipped (fixed_fare_enabled!=true)");
    record("DUPLICATE-410", true, "skipped");
  }

  const failed = results.filter((r) => !r.pass);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
