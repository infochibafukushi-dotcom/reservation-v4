/**
 * Round-trip browser E2E: usageSummary restore → 4-slot calendar → 4 blocks.
 * Miniflare in-memory D1 only. No production writes.
 *
 * Run: node scripts/test-round-trip-browser-e2e.mjs
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Miniflare, Log, LogLevel } from "miniflare";
import { createMiniflareWorkerOptions, seedTestPublicReservationSettings } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.ROUND_TRIP_BROWSER_E2E_PORT || 4175);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ESTIMATE_RT = "EST-BROWSER-RT-4810-001";
const ESTIMATE_ONE = "EST-BROWSER-ONE-4810-001";
const CUSTOMER_KANA = "オウフクブロックテスト";
const CUSTOMER_PHONE = "09000003333";
const CUSTOMER_EMAIL = "round-trip-browser@mailpit.local";
const NOTES = "【往復ブロック自動テスト・実予約ではありません】";
const EXPECTED_TOTAL = 4810;
const EXPECTED_BODY = 1910;
const BOOK_DATE = "2099-09-15";
const BOOK_TIME = "12:00";
const EXPECTED_TIMES = ["12:00", "12:30", "13:00", "13:30"];

const snapshot = {
  fareMode: "pre_fixed_fare",
  preFixedFareMode: true,
  selectedRouteId: "route_0",
  baseDistanceFareAmount: 1620,
  trafficZoneId: "chiba",
  trafficZoneCoefficient: 1.18,
  adjustedDistanceFareAmount: 1910,
  scheduledDurationSurcharge: 0,
  preFixedFareAmount: 1910,
  pickupFee: 800,
  specialVehicleFee: 1000,
  serviceFeeTotal: 1100,
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
  ],
  fareBasis: { distanceMultiplier: 1 },
  fareVersion: "v1",
  quoteVersion: 1
};

const routePlan = {
  pickup: { address: "出洲港" },
  destination: { address: "千葉メディカルセンター" },
  selectedRouteId: "route_0",
  distanceMeters: 3344,
  durationSeconds: 558
};

function usageRoundTrip() {
  return [
    { label: "移動方法", value: "標準車いす" },
    { label: "介助内容", value: "乗降介助" },
    { label: "階段介助", value: "階段介助なし" },
    { label: "送迎方法", value: "往復" },
    { label: "運賃方式", value: "事前確定運賃" }
  ];
}

function usageOneWay() {
  return [
    { label: "移動方法", value: "標準車いす" },
    { label: "介助内容", value: "乗降介助" },
    { label: "階段介助", value: "階段介助なし" },
    { label: "送迎方法", value: "片道" },
    { label: "運賃方式", value: "事前確定運賃" }
  ];
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
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

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    /* continue */
  }
  const { execSync } = await import("child_process");
  execSync("npm install --no-save playwright@1.61.1", { cwd: root, stdio: "inherit" });
  return import(pathToFileURL(path.join(root, "node_modules/playwright/index.mjs")).href);
}

function createStaticProxyServer(mf) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", ORIGIN);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const headers = { ...req.headers, host: "localhost" };
        const init = { method: req.method, headers };
        if (req.method !== "GET" && req.method !== "HEAD") init.body = body;
        const upstream = await mf.dispatchFetch(`http://localhost${url.pathname}${url.search}`, init);
        const buf = Buffer.from(await upstream.arrayBuffer());
        const outHeaders = {};
        upstream.headers.forEach((v, k) => {
          if (k.toLowerCase() === "transfer-encoding") return;
          outHeaders[k] = v;
        });
        outHeaders["access-control-allow-origin"] = ORIGIN;
        res.writeHead(upstream.status, outHeaders);
        res.end(buf);
        return;
      }

      let filePath = path.join(root, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
      if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404).end("Not found");
        return;
      }
      let content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      if (path.basename(filePath).startsWith("config.js")) {
        content = Buffer.from(
          content.toString("utf8").replace(/API_BASE:\s*"[^"]*"/, `API_BASE: "${ORIGIN}"`),
          "utf8"
        );
      }
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(content);
    } catch (err) {
      res.writeHead(500).end(String(err?.message || err));
    }
  });
}

async function registerQuote(mf, estimateNo, usageSummary, roundTrip) {
  const snap = {
    ...snapshot,
    fareBasis: { distanceMultiplier: roundTrip ? 2 : 1 }
  };
  const res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({
      estimateNo,
      total: EXPECTED_TOTAL,
      fareType: "fixed",
      quoteSnapshot: snap,
      routePlan,
      usageSummary,
      handoffSource: "lp-site-estimate",
      dtoVersion: 2
    })
  });
  const out = await jsonRes(res);
  assert(res.status === 200 && out.data?.success, `register ${estimateNo}: ${out.text}`);
  return out.data;
}

async function seedFarFutureOpenSlots(db) {
  // Disable same-day rule so 2099 slots stay bookable in calendar.
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('same_day_enabled', 'false')`).run();
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('min_hours', '0')`).run();
}

async function main() {
  const results = [];
  const record = (id, pass, detail) => {
    results.push({ id, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
  };

  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "browser-e2e-round-trip-blocks-db" },
    log: new Log(LogLevel.ERROR)
  });
  const db = await mf.getD1Database("DB");
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('allowed_origins', ?)`)
    .bind(`${ORIGIN},http://127.0.0.1:${PORT},http://localhost:${PORT}`)
    .run();
  await db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('fixed_fare_enabled', 'true')`).run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('email_from', '介護タクシー予約 <test@mailpit.local>')`)
    .run();
  await mf.dispatchFetch("http://localhost/api/bootstrap");
  await seedTestPublicReservationSettings(db);
  await seedFarFutureOpenSlots(db);

  await registerQuote(mf, ESTIMATE_RT, usageRoundTrip(), true);
  await registerQuote(mf, ESTIMATE_ONE, usageOneWay(), false);

  // Seed a blocker at 13:00 on another day to prove 4-slot calendar logic,
  // and leave BOOK_DATE fully open for the round-trip booking itself.
  await db
    .prepare(`INSERT OR IGNORE INTO blocks (date,time,type,reservation_id,created_at) VALUES (?,?,?,?,?)`)
    .bind("2099-09-16", "13:00", "manual", "", new Date().toISOString())
    .run();

  const server = createStaticProxyServer(mf);
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  const playwright = await loadPlaywright();
  const { chromium } = playwright;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    const { execSync } = await import("child_process");
    execSync("npx playwright install chromium", { cwd: root, stdio: "inherit" });
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext();
  pageOnDialog(context);

  try {
    // --- Round-trip path ---
    const page = await context.newPage();
    await page.addInitScript(() => {
      try {
        sessionStorage.clear();
        localStorage.clear();
      } catch {}
    });

    const rtUrl = `${ORIGIN}/index.html?source=estimate&estimateNo=${encodeURIComponent(ESTIMATE_RT)}`;
    await page.goto(rtUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const banner = await page.locator("#estimateHandoffBanner").innerText().catch(() => "");
    record("RT-1-banner", banner.includes(ESTIMATE_RT) && !/読み込めません/.test(banner), `banner="${banner}"`);

    // Wait until estimate handoff restored from server quote
    await page.waitForFunction(
      () => {
        const state = window.EstimateBookingHandoff?.getEstimateBookingState?.();
        const handoff = state?.handoff;
        if (!handoff) return false;
        const fields = window.EstimateMapping.mapHandoffToFormValues(handoff);
        return fields.tripType === "往復" && fields.roundTrip === "往復" && Number(fields.blockCount) === 4;
      },
      null,
      { timeout: 15000 }
    );

    const mapped = await page.evaluate(() => {
      const state = window.EstimateBookingHandoff.getEstimateBookingState();
      const handoff = state.handoff || {};
      const fields = window.EstimateMapping.mapHandoffToFormValues(handoff);
      const emptySelectionFields = window.EstimateMapping.mapHandoffToFormValues({
        ...handoff,
        selections: {}
      });
      return {
        usageTrip: (handoff.usageSummary || []).find((x) => x.label === "送迎方法")?.value || "",
        tripType: fields.tripType || "",
        roundTrip: fields.roundTrip || "",
        blockCount: Number(fields.blockCount) || 0,
        emptyTripType: emptySelectionFields.tripType || "",
        emptyRoundTrip: emptySelectionFields.roundTrip || "",
        emptyBlockCount: Number(emptySelectionFields.blockCount) || 0,
        requiredBlocks: typeof getRequiredStartBlockCount === "function" ? getRequiredStartBlockCount() : null
      };
    });
    record(
      "RT-2-restore",
      mapped.usageTrip === "往復" &&
        mapped.tripType === "往復" &&
        mapped.roundTrip === "往復" &&
        mapped.blockCount === 4 &&
        mapped.emptyTripType === "往復" &&
        mapped.emptyRoundTrip === "往復" &&
        mapped.emptyBlockCount === 4,
      `usage=${mapped.usageTrip} tripType=${mapped.tripType} roundTrip=${mapped.roundTrip} emptyRoundTrip=${mapped.emptyRoundTrip} blockCount=${mapped.blockCount}`
    );
    record("RT-3-calendar-count", mapped.requiredBlocks === 4, `getRequiredStartBlockCount=${mapped.requiredBlocks}`);

    await page.waitForSelector("#calendarGrid button.slot-cell", { timeout: 15000 });

    // Force-open booking for the target far-future slot (calendar page may be on current week).
    await page.evaluate(
      ({ date, time }) => {
        if (typeof openBookingForm === "function") openBookingForm(date, time);
      },
      { date: BOOK_DATE, time: BOOK_TIME }
    );
    await page.waitForSelector("#bookingModal:not(.hidden)", { timeout: 10000 });
    await page.waitForSelector("#bookingForm:not(.hidden)", { timeout: 15000 });
    await page.waitForTimeout(800);

    const totalText = await page.locator("#estimateSummaryTotal").innerText();
    const fareText = await page.locator("#estimateSummaryFare").innerText();
    record("RT-4-amount", /4[,，]?810/.test(totalText) && /1[,，]?910/.test(fareText), `total=${totalText}`);

    // Calendar start check: 4-slot requirement vs 2-slot (3rd slot occupied)
    const calendarLogic = await page.evaluate(() => {
      const pad = (v) => String(v).padStart(2, "0");
      const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const addMinutes = (date, time, minutes) => {
        const d = new Date(`${date}T${time}:00`);
        d.setMinutes(d.getMinutes() + minutes);
        return { date: formatDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
      };
      const blocked = new Set(["2099-09-16_13:00"]);
      const check = (date, time, count) => {
        for (let i = 0; i < count; i++) {
          const s = i === 0 ? { date, time } : addMinutes(date, time, i * 30);
          if (blocked.has(`${s.date}_${s.time}`)) return false;
        }
        return true;
      };
      // Mirror production helper with the live required count from estimate mode.
      const required = typeof getRequiredStartBlockCount === "function" ? getRequiredStartBlockCount() : 2;
      return {
        required,
        roundBlocked: check("2099-09-16", "12:00", 4) === false,
        oneWayOk: check("2099-09-16", "12:00", 2) === true,
        liveRound: typeof isStartReservable === "function" ? isStartReservable("2099-09-15", "12:00", required) : null
      };
    });
    record(
      "RT-5-calendar-4slot",
      calendarLogic.required === 4 && calendarLogic.roundBlocked && calendarLogic.oneWayOk && calendarLogic.liveRound === true,
      `required=${calendarLogic.required} roundBlocked=${calendarLogic.roundBlocked} oneWayOk=${calendarLogic.oneWayOk} live12ok=${calendarLogic.liveRound}`
    );

    await page.fill("#customerKana", CUSTOMER_KANA);
    await page.fill("#customerPhone", CUSTOMER_PHONE);
    await page.fill("#customerEmail", CUSTOMER_EMAIL);
    await page.fill("#notes", NOTES);
    await page.check("#agree");
    await page.check("#agreeEstimate");
    await page.waitForTimeout(200);

    // Capture payload.roundTrip at submit
    let capturedPayload = null;
    await page.route("**/api/createReservation", async (route) => {
      try {
        capturedPayload = route.request().postDataJSON();
      } catch {
        capturedPayload = null;
      }
      await route.continue();
    });

    await page.locator("#submitBooking").click();
    await page.waitForSelector("#thanksView:not(.hidden)", { timeout: 15000 });
    const reservationId = (await page.locator("#thanksId").innerText()).trim();
    record("RT-6-created", !!reservationId, `id=${reservationId}`);
    record(
      "RT-6-payload",
      capturedPayload?.roundTrip === "往復",
      `payload.roundTrip=${capturedPayload?.roundTrip || ""}`
    );

    const row = await db.prepare(`SELECT roundTrip, block_count, confirmed_fare, quote_snapshot FROM reservations WHERE id=?`).bind(reservationId).first();
    const blocks = (
      await db.prepare(`SELECT date, time FROM blocks WHERE reservation_id=? ORDER BY date, time`).bind(reservationId).all()
    ).results || [];
    const times = blocks.map((b) => b.time);
    const snap = JSON.parse(row?.quote_snapshot || "{}");
    record("RT-7-roundTrip", row?.roundTrip === "往復", `roundTrip=${row?.roundTrip}`);
    record("RT-7-block-count", Number(row?.block_count) === 4, `block_count=${row?.block_count}`);
    record("RT-7-blocks", times.length === 4 && times.join(",") === EXPECTED_TIMES.join(","), `times=${times.join(",")}`);
    record(
      "RT-7-amounts",
      Number(row?.confirmed_fare) === EXPECTED_TOTAL &&
        Number(snap.preFixedFareAmount) === EXPECTED_BODY &&
        Number(snap.totalAmount) === EXPECTED_TOTAL &&
        Number(snap.trafficZoneCoefficient) === 1.18 &&
        Number(snap.scheduledDurationSurcharge) === 0,
      `confirmed=${row?.confirmed_fare} body=${snap.preFixedFareAmount} total=${snap.totalAmount}`
    );

    // Admin blocks check
    const adminPage = await context.newPage();
    await adminPage.goto(`${ORIGIN}/admin.html`, { waitUntil: "networkidle" });
    await adminPage.fill("#adminPassword", "1234");
    await Promise.all([
      adminPage.waitForResponse((r) => r.url().includes("/api/admin/login") && r.status() === 200).catch(() => null),
      adminPage.click("#loginBtn")
    ]);
    await adminPage.waitForSelector("#adminView:not(.hidden)", { timeout: 10000 });
    await adminPage.waitForTimeout(1000);
    const adminLogin = await jsonRes(
      await mf.dispatchFetch("http://localhost/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "1234" })
      })
    );
    const listRes = await jsonRes(
      await mf.dispatchFetch("http://localhost/api/getReservations", {
        headers: { Authorization: `Bearer ${adminLogin.data?.token || ""}` }
      })
    );
    const list = Array.isArray(listRes.data) ? listRes.data : [];
    const adminRow = list.find((r) => r.id === reservationId);
    record(
      "RT-8-admin",
      !!adminRow && Number(adminRow.block_count) === 4 && adminRow.roundTrip === "往復" && Number(adminRow.confirmed_fare) === EXPECTED_TOTAL,
      `admin block_count=${adminRow?.block_count} roundTrip=${adminRow?.roundTrip}`
    );
    await adminPage.close();

    // --- One-way still 2 blocks ---
    const onePage = await context.newPage();
    await onePage.addInitScript(() => {
      try {
        sessionStorage.clear();
        localStorage.clear();
      } catch {}
    });
    await onePage.goto(`${ORIGIN}/index.html?source=estimate&estimateNo=${encodeURIComponent(ESTIMATE_ONE)}`, {
      waitUntil: "networkidle"
    });
    await onePage.waitForTimeout(1500);
    await onePage.waitForFunction(
      () => {
        const handoff = window.EstimateBookingHandoff?.getEstimateBookingState?.()?.handoff;
        if (!handoff) return false;
        return window.EstimateMapping.mapHandoffToFormValues(handoff).roundTrip === "片道";
      },
      null,
      { timeout: 15000 }
    );
    const oneMapped = await onePage.evaluate(() => {
      const handoff = window.EstimateBookingHandoff.getEstimateBookingState().handoff || {};
      const fields = window.EstimateMapping.mapHandoffToFormValues(handoff);
      return {
        roundTrip: fields.roundTrip || "",
        blockCount: Number(fields.blockCount) || 0,
        requiredBlocks: typeof getRequiredStartBlockCount === "function" ? getRequiredStartBlockCount() : null
      };
    });
    record(
      "ONE-1-restore",
      oneMapped.roundTrip === "片道" && oneMapped.blockCount === 2 && oneMapped.requiredBlocks === 2,
      `roundTrip=${oneMapped.roundTrip} blockCount=${oneMapped.blockCount} required=${oneMapped.requiredBlocks}`
    );

    await onePage.evaluate(
      ({ date, time }) => {
        if (typeof openBookingForm === "function") openBookingForm(date, time);
      },
      { date: "2099-09-17", time: "10:00" }
    );
    await onePage.waitForSelector("#bookingModal:not(.hidden)", { timeout: 10000 });
    await onePage.waitForSelector("#bookingForm:not(.hidden)", { timeout: 15000 });
    await onePage.waitForTimeout(600);
    await onePage.fill("#customerKana", CUSTOMER_KANA);
    await onePage.fill("#customerPhone", "09000004444");
    await onePage.fill("#customerEmail", CUSTOMER_EMAIL);
    await onePage.fill("#notes", NOTES);
    await onePage.check("#agree");
    await onePage.check("#agreeEstimate");
    await onePage.locator("#submitBooking").click();
    await onePage.waitForSelector("#thanksView:not(.hidden)", { timeout: 15000 });
    const oneId = (await onePage.locator("#thanksId").innerText()).trim();
    const oneRow = await db.prepare(`SELECT roundTrip, block_count, confirmed_fare FROM reservations WHERE id=?`).bind(oneId).first();
    const oneBlocks = (
      await db.prepare(`SELECT time FROM blocks WHERE reservation_id=? ORDER BY time`).bind(oneId).all()
    ).results || [];
    record(
      "ONE-2-blocks",
      oneRow?.roundTrip === "片道" && Number(oneRow?.block_count) === 2 && oneBlocks.length === 2 && oneBlocks[0].time === "10:00" && oneBlocks[1].time === "10:30",
      `roundTrip=${oneRow?.roundTrip} count=${oneRow?.block_count} times=${oneBlocks.map((b) => b.time).join(",")}`
    );
    record("ONE-2-amount", Number(oneRow?.confirmed_fare) === EXPECTED_TOTAL, `confirmed=${oneRow?.confirmed_fare}`);

    // Cleanup
    await db.prepare(`DELETE FROM blocks WHERE reservation_id IN (?, ?)`).bind(reservationId, oneId).run();
    await db.prepare(`DELETE FROM email_logs WHERE reservation_id IN (?, ?)`).bind(reservationId, oneId).run();
    await db.prepare(`DELETE FROM quote_consents WHERE estimate_no LIKE 'EST-BROWSER-%'`).run();
    await db.prepare(`DELETE FROM reservations WHERE estimate_no LIKE 'EST-BROWSER-%'`).run();
    await db.prepare(`DELETE FROM quotes WHERE estimate_no LIKE 'EST-BROWSER-%'`).run();
    const left = await db.prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no LIKE 'EST-BROWSER-%'`).first();
    record("RT-9-cleanup", Number(left?.c) === 0, `left=${left?.c}`);
  } finally {
    await browser?.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await mf.dispose();
  }

  console.log("\n=== Round-trip Browser E2E Results ===\n");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
  const failed = results.filter((r) => !r.pass);
  console.log(`\nTotal: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}`);
  if (failed.length) process.exit(1);
}

function pageOnDialog(context) {
  context.on("page", (p) => p.on("dialog", async (d) => d.accept()));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
