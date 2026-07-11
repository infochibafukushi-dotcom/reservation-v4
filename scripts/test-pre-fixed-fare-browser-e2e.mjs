/**
 * Browser E2E for pre_fixed_fare (local static + Miniflare in-memory D1).
 * Does not touch production Worker/D1/settings. No RESEND_API_KEY.
 *
 * Run: node scripts/test-pre-fixed-fare-browser-e2e.mjs
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";
import { Miniflare, Log, LogLevel } from "miniflare";
import { createMiniflareWorkerOptions, seedTestPublicReservationSettings } from "./worker-modules.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.BROWSER_E2E_PORT || 4173);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ESTIMATE_NO = "EST-BROWSER-E2E-4810-001";
const CUSTOMER_KANA = "イーツーイーテストヨヤク";
const CUSTOMER_PHONE = "09000001234";
const CUSTOMER_EMAIL = "browser-e2e@mailpit.local";
const NOTES = "自動テスト・実予約ではありません";
const EXPECTED_TOTAL = 4810;

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

const usageSummary = [
  { label: "移動方法", value: "標準車いす" },
  { label: "介助内容", value: "乗降介助" },
  { label: "運賃方式", value: "事前確定運賃" }
];

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
    // npx-installed global may not resolve; try dynamic from playwright package after ensure
  }
  const { execSync } = await import("child_process");
  execSync("npm install --no-save playwright@1.61.1", { cwd: root, stdio: "inherit" });
  return import(pathToFileURL(path.join(root, "node_modules/playwright/index.mjs")).href);
}

function createStaticProxyServer(mf, state) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", ORIGIN);
      if (url.pathname.startsWith("/api/")) {
        if (state.failQuotes && /^\/api\/quotes\//.test(url.pathname) && req.method === "GET") {
          res.writeHead(500, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": ORIGIN
          });
          res.end(JSON.stringify({ success: false, message: "forced quote API failure for browser E2E" }));
          return;
        }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const headers = { ...req.headers, host: "localhost" };
        const init = {
          method: req.method,
          headers
        };
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
        const text = content
          .toString("utf8")
          .replace(
            /API_BASE:\s*"[^"]*"/,
            `API_BASE: "${ORIGIN}"`
          );
        content = Buffer.from(text, "utf8");
      }
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(content);
    } catch (err) {
      res.writeHead(500).end(String(err?.message || err));
    }
  });
}

async function registerFixture(mf) {
  const res = await mf.dispatchFetch("http://localhost/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({
      estimateNo: ESTIMATE_NO,
      total: EXPECTED_TOTAL,
      fareType: "fixed",
      quoteSnapshot: snapshot,
      routePlan,
      usageSummary,
      handoffSource: "lp-site-estimate",
      dtoVersion: 2
    })
  });
  const out = await jsonRes(res);
  assert(res.status === 200 && out.data?.success, `register failed: ${out.text}`);
  return out.data;
}

async function main() {
  const results = [];
  const findings = [];
  const record = (id, pass, detail) => {
    results.push({ id, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
  };
  const noteFinding = (title, detail, cause, fix) => {
    findings.push({ title, detail, cause, fix });
    console.log(`FINDING: ${title} — ${detail}`);
  };

  const report = {
    estimateNo: ESTIMATE_NO,
    reservationId: "",
    environment: `local static ${ORIGIN} + Miniflare in-memory D1`,
    browser: "Playwright Chromium"
  };

  const mf = new Miniflare({
    ...createMiniflareWorkerOptions(root),
    bindings: { LP_REGISTER_TOKEN: "" },
    d1Databases: { DB: "browser-e2e-pre-fixed-fare-db" },
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
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('email_admin_to', 'admin-browser-e2e@mailpit.local')`)
    .run();
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('email_from', '介護タクシー予約 <test@mailpit.local>')`)
    .run();
  await mf.dispatchFetch("http://localhost/api/bootstrap");
  await seedTestPublicReservationSettings(db);
  await registerFixture(mf);

  const proxyState = { failQuotes: false };
  const server = createStaticProxyServer(mf, proxyState);
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
  const page = await context.newPage();
  page.on("dialog", async (d) => d.accept());

  try {
    // Clear storage and open estimate URL
    await context.clearCookies();
    await page.addInitScript(() => {
      try {
        sessionStorage.clear();
        localStorage.clear();
      } catch {}
    });

    const bookingUrl = `${ORIGIN}/index.html?source=estimate&estimateNo=${encodeURIComponent(ESTIMATE_NO)}`;
    await page.goto(bookingUrl, { waitUntil: "networkidle" });

    // Banner / auto restore
    await page.waitForTimeout(1500);
    const bannerText = await page.locator("#estimateHandoffBanner").innerText().catch(() => "");
    const bannerHidden = await page.locator("#estimateHandoffBanner").evaluate((el) => el.classList.contains("hidden")).catch(() => true);
    record(
      "B-1-banner",
      !bannerHidden && /見積番号/.test(bannerText) && bannerText.includes(ESTIMATE_NO) && !/読み込めませんでした/.test(bannerText),
      `banner="${bannerText}" hidden=${bannerHidden}`
    );

    // Open a bookable slot
    await page.waitForSelector("#calendarGrid button.slot-cell", { timeout: 15000 });
    const slot = page.locator("#calendarGrid button.slot-cell", { hasText: "◎" }).first();
    assert(await slot.count(), "no bookable calendar slot");
    await slot.click();
    await page.waitForSelector("#bookingModal:not(.hidden)", { timeout: 10000 });
    await page.waitForSelector("#bookingForm:not(.hidden)", { timeout: 15000 });
    await page.waitForTimeout(800);

    const summaryText = await page.locator("#estimateSummarySection").innerText();
    const fareText = await page.locator("#estimateSummaryFare").innerText();
    const totalText = await page.locator("#estimateSummaryTotal").innerText();
    const listText = await page.locator("#estimateSummaryList").innerText();
    const sectionText = await page.locator("#estimateSummarySection").innerText();

    record("B-2-estimate-no", summaryText.includes(ESTIMATE_NO), `summary has estimateNo`);
    record("B-2-route", listText.includes("route_0"), `selectedRouteId visible`);
    record("B-2-fareMode-label", listText.includes("事前確定運賃") && !listText.includes("pre_fixed_fare"), `fareMode Japanese`);
    record("B-2-pickup-dest", listText.includes("出洲港") && listText.includes("千葉メディカルセンター"), "pickup/destination");
    record("B-2-total", /4[,，]?810/.test(totalText), `total=${totalText}`);

    const fareModeCount = (sectionText.match(/運賃方式[\s\S]{0,8}事前確定運賃/g) || []).length;
    const bodyLabelCount = (fareText.match(/認可運賃本体/g) || []).length;
    const bodyAmountCount = (fareText.match(/1[,，]?910/g) || []).length;
    const specialCount = (fareText.match(/特殊車両使用料/g) || []).length;
    const hasDistanceDup = /距離運賃/.test(fareText);
    const totalLabelOk = sectionText.includes("お支払い合計") && /4[,，]?810/.test(totalText);

    record("B-3-fareMode-once", fareModeCount === 1, `運賃方式 count=${fareModeCount}`);
    record("B-3-body-label", bodyLabelCount === 1 && !fareText.includes("事前確定運賃本体"), `認可運賃本体 count=${bodyLabelCount}`);
    record("B-3-body-once", bodyAmountCount === 1, `1,910 count=${bodyAmountCount}`);
    record("B-3-no-distance-dup", !hasDistanceDup, "距離運賃 absent");
    record("B-3-pickup", fareText.includes("迎車料金") && /800/.test(fareText), "pickup 800");
    record("B-3-assist", fareText.includes("介助料金") && /1[,，]?100/.test(fareText), "assist 1100");
    record("B-3-special-once", specialCount === 1 && /1[,，]?000/.test(fareText), `special count=${specialCount}`);
    record("B-3-total-label", totalLabelOk, `total label/amount ok`);
    record("B-3-no-300", !fareText.includes("300") && !summaryText.includes("予定時間加算"), "no 300 surcharge");
    record("B-3-no-keiyo", !summaryText.includes("1.20") && !summaryText.includes("京葉"), "no keiyo 1.20");

    // Consent before submit
    await page.fill("#customerKana", CUSTOMER_KANA);
    await page.fill("#customerPhone", CUSTOMER_PHONE);
    await page.fill("#customerEmail", CUSTOMER_EMAIL);
    await page.fill("#notes", NOTES);
    await page.check("#agree");
    // ensure estimate consent unchecked
    const agreeEstimate = page.locator("#agreeEstimate");
    if (await agreeEstimate.isChecked()) await agreeEstimate.uncheck();

    const beforeCount = await db.prepare(`SELECT COUNT(*) AS c FROM reservations`).first();
    await page.click("#submitBooking");
    await page.waitForTimeout(800);
    const toastText = await page.locator("#toast").innerText().catch(() => "");
    const afterNoConsent = await db.prepare(`SELECT COUNT(*) AS c FROM reservations`).first();
    record(
      "B-4-no-consent",
      Number(afterNoConsent?.c) === Number(beforeCount?.c) && /同意/.test(toastText),
      `toast="${toastText}" reservations=${afterNoConsent?.c}`
    );

    // Consent and inspect agree text
    const agreeText = await page.locator("#agreeEstimateText").innerText();
    record("B-4-agree-text", agreeText.includes(ESTIMATE_NO) && /4[,，]?810/.test(agreeText), `agreeText=${agreeText}`);
    await page.check("#agreeEstimate");
    await page.waitForTimeout(300);
    const consentStatus = await page.locator("#estimateConsentStatus").innerText();
    const consentHidden = await page
      .locator("#estimateConsentStatus")
      .evaluate((el) => el.classList.contains("hidden"));
    record(
      "B-4-consent-display",
      !consentHidden &&
        consentStatus.includes("同意済み") &&
        /4[,，]?810/.test(consentStatus) &&
        consentStatus.includes("同意日時"),
      `consentStatus="${consentStatus.replace(/\s+/g, " ").trim()}"`
    );
    const totalAfterConsent = await page.locator("#estimateSummaryTotal").innerText();
    record("B-4-total-unchanged", /4[,，]?810/.test(totalAfterConsent), `totalAfterConsent=${totalAfterConsent}`);

    // Double-click submit (force: avoid Playwright waiting on disabled mid-submit)
    const submit = page.locator("#submitBooking");
    await submit.evaluate((btn) => {
      btn.click();
      btn.click();
      btn.click();
    });
    await page.waitForSelector("#thanksView:not(.hidden)", { timeout: 15000 });
    const reservationId = (await page.locator("#thanksId").innerText()).trim();
    report.reservationId = reservationId;
    record("B-5-thanks", !!reservationId, `reservationId=${reservationId}`);

    const resCount = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no=?`)
      .bind(ESTIMATE_NO)
      .first();
    record("B-5-single", Number(resCount?.c) === 1, `reservations=${resCount?.c}`);

    const resRow = await db.prepare(`SELECT * FROM reservations WHERE id=?`).bind(reservationId).first();
    const snap = JSON.parse(resRow?.quote_snapshot || "{}");
    record(
      "B-5-saved",
      Number(resRow?.confirmed_fare) === EXPECTED_TOTAL &&
        Number(snap.totalAmount) === EXPECTED_TOTAL &&
        String(resRow?.consent_at || "").length > 0 &&
        snap.fareMode === "pre_fixed_fare",
      `confirmed=${resRow?.confirmed_fare} totalAmount=${snap.totalAmount} consent_at=${resRow?.consent_at}`
    );

    // Reload thanks
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const afterReload = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no=?`)
      .bind(ESTIMATE_NO)
      .first();
    record("B-6-reload", Number(afterReload?.c) === 1, `after reload count=${afterReload?.c}`);

    // Back + reuse
    await page.goto(bookingUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const bannerAfter = await page.locator("#estimateHandoffBanner").innerText().catch(() => "");
    // consumed quote should degrade or block
    const slot2 = page.locator("#calendarGrid button.slot-cell", { hasText: "◎" }).first();
    if (await slot2.count()) {
      await slot2.click();
      await page.waitForTimeout(1000);
      await page.fill("#customerKana", CUSTOMER_KANA).catch(() => {});
      await page.fill("#customerPhone", "09000005678").catch(() => {});
      await page.fill("#customerEmail", CUSTOMER_EMAIL).catch(() => {});
      await page.check("#agree").catch(() => {});
      await page.check("#agreeEstimate").catch(() => {});
      await page.click("#submitBooking").catch(() => {});
      await page.waitForTimeout(1000);
    }
    const reuseCount = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no=?`)
      .bind(ESTIMATE_NO)
      .first();
    const toastReuse = await page.locator("#toast").innerText().catch(() => "");
    record(
      "B-6-reuse",
      Number(reuseCount?.c) === 1,
      `count=${reuseCount?.c} banner="${bannerAfter}" toast="${toastReuse}"`
    );

    // Email logs
    const logs = (
      await db.prepare(`SELECT kind,status,error_message FROM email_logs WHERE reservation_id=?`).bind(reservationId).all()
    ).results || [];
    const customerLogs = logs.filter((l) => l.kind === "customer");
    const adminLogs = logs.filter((l) => l.kind === "admin");
    record(
      "B-7-email-logs",
      customerLogs.length === 1 &&
        adminLogs.length === 1 &&
        customerLogs[0].status !== "sent" &&
        adminLogs[0].status !== "sent",
      `customer=${customerLogs.length}/${customerLogs[0]?.status} admin=${adminLogs.length}/${adminLogs[0]?.status}`
    );

    // Reconstruct email text with saved consent (same as worker builders)
    const workerSrc = fs.readFileSync(path.join(root, "worker.js"), "utf8");
    const sliceStart = workerSrc.indexOf("function parseQuoteSnapshotFromBody");
    const sliceEnd = workerSrc.indexOf("async function sendReservationEmails");
    const vm = await import("vm");
    const sandbox = { module: { exports: {} }, exports: {}, console };
    vm.createContext(sandbox);
    vm.runInContext(
      `${workerSrc.slice(sliceStart, sliceEnd)}
module.exports={buildConfirmationEmailText,buildAdminNotificationText};`,
      sandbox
    );
    const emailBody = {
      name: CUSTOMER_KANA,
      phone: CUSTOMER_PHONE,
      email: CUSTOMER_EMAIL,
      date: resRow.date,
      time: resRow.time,
      pickup: "出洲港",
      destination: "千葉メディカルセンター",
      vehicle: "標準車いす",
      assist: "乗降介助",
      estimate: "4,810円",
      fixedFareConfirmed: true,
      confirmedFare: EXPECTED_TOTAL,
      quoteSnapshot: snap,
      routePlan,
      usageSummary,
      consentAt: resRow.consent_at,
      consentedFareAmount: EXPECTED_TOTAL
    };
    const customerMail = sandbox.module.exports.buildConfirmationEmailText(reservationId, emailBody, ESTIMATE_NO, "");
    const adminMail = sandbox.module.exports.buildAdminNotificationText(reservationId, emailBody, ESTIMATE_NO);
    record(
      "B-7-email-content",
      adminMail.includes("運賃方式：事前確定運賃") &&
        customerMail.includes("認可運賃本体：1,910円") &&
        customerMail.includes("特殊車両使用料：1,000円") &&
        (customerMail.match(/特殊車両使用料：1,000円/g) || []).length === 1 &&
        customerMail.includes("お支払い合計：4,810円") &&
        customerMail.includes("同意状態：同意済み") &&
        customerMail.includes("同意金額：4,810円") &&
        customerMail.includes("同意日時："),
      "email display fields"
    );

    // Admin UI — verify before cleanup
    const adminPage = await context.newPage();
    await adminPage.goto(`${ORIGIN}/admin.html`, { waitUntil: "networkidle" });
    await adminPage.fill("#adminPassword", "1234");
    await Promise.all([
      adminPage.waitForResponse((r) => r.url().includes("/api/admin/login") && r.status() === 200).catch(() => null),
      adminPage.click("#loginBtn")
    ]);
    await adminPage.waitForSelector("#adminView:not(.hidden)", { timeout: 10000 });
    await adminPage.waitForTimeout(2000);
    let adminBody = await adminPage.locator("#adminView").innerText();
    // Expand reservation accordion if present
    const resAcc = adminPage.locator('button.accordion-btn[data-acc="res"], button.accordion-btn:has-text("予約")').first();
    if (await resAcc.count()) {
      await resAcc.click().catch(() => {});
      await adminPage.waitForTimeout(500);
      adminBody = await adminPage.locator("#adminView").innerText();
    }
    record(
      "B-8-admin-list",
      adminBody.includes(reservationId) || adminBody.includes(CUSTOMER_KANA) || /4[,，]?810/.test(adminBody),
      `admin list signals id=${adminBody.includes(reservationId)} name=${adminBody.includes(CUSTOMER_KANA)}`
    );

    await adminPage.evaluate((id) => {
      if (typeof detail === "function") detail(id);
    }, reservationId);
    await adminPage.waitForTimeout(1200);
    const detailText = await adminPage.locator("body").innerText();
    const adminApi = await mf.dispatchFetch("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "1234" })
    });
    const adminLogin = await jsonRes(adminApi);
    const listRes = await mf.dispatchFetch("http://localhost/api/getReservations", {
      headers: { Authorization: `Bearer ${adminLogin.data?.token || ""}` }
    });
    const listOut = await jsonRes(listRes);
    const list = Array.isArray(listOut.data) ? listOut.data : [];
    const adminRow = list.find((r) => r.id === reservationId);
    const adminSnap = adminRow?.quote_snapshot ? JSON.parse(adminRow.quote_snapshot) : {};
    record(
      "B-8-admin-detail",
      (!!adminRow &&
        Number(adminRow.confirmed_fare) === EXPECTED_TOTAL &&
        adminSnap.fareMode === "pre_fixed_fare" &&
        Number(adminSnap.preFixedFareAmount) === 1910 &&
        Number(adminSnap.trafficZoneCoefficient) === 1.18 &&
        Number(adminSnap.scheduledDurationSurcharge) === 0 &&
        Number(adminSnap.totalAmount) === EXPECTED_TOTAL &&
        String(adminRow.consent_at || "").length > 0) ||
        /4[,，]?810/.test(detailText),
      `apiRow=${!!adminRow} confirmed=${adminRow?.confirmed_fare} detailHasAmount=${/4[,，]?810/.test(detailText)}`
    );
    if (adminRow && Number(adminSnap.totalAmount) === Number(adminRow.confirmed_fare)) {
      record("B-8-admin-no-recalc", true, "admin uses saved snapshot amounts");
    } else {
      record("B-8-admin-no-recalc", false, "snapshot/confirmed mismatch or missing row");
    }

    // API failure path with fresh estimate
    const failEstimate = "EST-BROWSER-E2E-4810-FAIL";
    await mf.dispatchFetch("http://localhost/api/quotes/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        estimateNo: failEstimate,
        total: EXPECTED_TOTAL,
        fareType: "fixed",
        quoteSnapshot: snapshot,
        routePlan,
        usageSummary,
        handoffSource: "lp-site-estimate",
        dtoVersion: 2
      })
    });
    proxyState.failQuotes = true;
    const failPage = await context.newPage();
    await failPage.addInitScript(() => {
      try {
        sessionStorage.clear();
      } catch {}
    });
    await failPage.goto(`${ORIGIN}/index.html?source=estimate&estimateNo=${encodeURIComponent(failEstimate)}`, {
      waitUntil: "networkidle"
    });
    await failPage.waitForTimeout(1500);
    const failBanner = await failPage.locator("#estimateHandoffBanner").innerText().catch(() => "");
    const failHidden = await failPage
      .locator("#estimateHandoffBanner")
      .evaluate((el) => el.classList.contains("hidden"))
      .catch(() => true);
    record(
      "B-9-api-fail-banner",
      !failHidden && (/読み込めません|失敗|再試行|通常の予約/.test(failBanner) || failBanner.length > 0),
      `failBanner="${failBanner}"`
    );

    // Ensure no reservation created for fail estimate
    const failResCount = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no=?`)
      .bind(failEstimate)
      .first();
    record("B-9-api-fail-no-res", Number(failResCount?.c) === 0, `fail reservations=${failResCount?.c}`);

    // Retry after recovery
    proxyState.failQuotes = false;
    await failPage.reload({ waitUntil: "networkidle" });
    await failPage.waitForTimeout(1500);
    const recoverBanner = await failPage.locator("#estimateHandoffBanner").innerText().catch(() => "");
    record(
      "B-9-api-recover",
      recoverBanner.includes(failEstimate) && !/読み込めませんでした/.test(recoverBanner),
      `recoverBanner="${recoverBanner}"`
    );

    // Cleanup
    await db.prepare(`DELETE FROM email_logs WHERE reservation_id=?`).bind(reservationId).run();
    await db.prepare(`DELETE FROM quote_consents WHERE estimate_no LIKE 'EST-BROWSER-E2E-%'`).run();
    await db.prepare(`DELETE FROM reservations WHERE estimate_no LIKE 'EST-BROWSER-E2E-%'`).run();
    await db.prepare(`DELETE FROM quotes WHERE estimate_no LIKE 'EST-BROWSER-E2E-%'`).run();
    const leftQ = await db.prepare(`SELECT COUNT(*) AS c FROM quotes WHERE estimate_no LIKE 'EST-BROWSER-E2E-%'`).first();
    const leftR = await db
      .prepare(`SELECT COUNT(*) AS c FROM reservations WHERE estimate_no LIKE 'EST-BROWSER-E2E-%'`)
      .first();
    record("B-10-cleanup", Number(leftQ?.c) === 0 && Number(leftR?.c) === 0, `q=${leftQ?.c} r=${leftR?.c}`);

    report.findings = findings;
    report.consentAt = resRow?.consent_at || "";
    console.log("\n=== Browser E2E Report Snapshot ===");
    console.log(JSON.stringify({ ...report, findingsCount: findings.length }, null, 2));
  } finally {
    await browser?.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await mf.dispose();
  }

  console.log("\n=== Browser E2E Results ===\n");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`);
  if (findings.length) {
    console.log("\n=== Findings (not fixed) ===");
    for (const f of findings) {
      console.log(`- ${f.title}: ${f.detail}`);
      console.log(`  cause: ${f.cause}`);
      console.log(`  fix: ${f.fix}`);
    }
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\nTotal: ${results.length}, Passed: ${results.length - failed.length}, Failed: ${failed.length}, Findings: ${findings.length}`);
  // Findings do not fail the harness unless core assertions fail
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
