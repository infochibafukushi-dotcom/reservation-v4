/**
 * UI review screenshots (local static server + mocked API).
 * Run: node scripts/capture-ui-review.mjs
 */
import { chromium, devices } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "screenshots", "ui-review-20260625");

const mockMenu = {
  groups: [
    { key: "move_type", label: "移動方法", visible: true, required: true },
    { key: "assist", label: "介助内容", visible: true, required: true },
    { key: "stairs", label: "階段介助", visible: true, required: true },
    { key: "equipment", label: "機材レンタル", visible: true, required: true },
    { key: "round", label: "送迎方法", visible: true, required: true },
    { key: "round_addon", label: "待機・付き添い", visible: true, required: false }
  ],
  move_type: [
    { name: "無料車いす", price: 0, description: "標準的な車いすを無料でご利用いただけます。", visible: true, assist_allowed_items: "乗降介助,身体介助" },
    { name: "その他（杖歩行など）", price: 0, description: "テスト5", visible: true, assist_allowed_items: "見守り介助,乗降介助,身体介助" }
  ],
  assist: [
    { name: "見守り介助", price: 0, description: "転倒防止のため付き添いながら移動を見守ります。", visible: true },
    { name: "乗降介助", price: 1100, description: "車への乗り降りをお手伝いします。", visible: true }
  ],
  stairs: [{ name: "階段介助なし", price: 0, description: "階段を使わない場合。", visible: true, force_body_assist: "false" }],
  equipment: [{ name: "レンタルなし", price: 0, description: "レンタル不要。", visible: true }],
  round: [
    { name: "片道", price: 0, description: "片道の送迎です。", visible: true, multiplier: 1 },
    { name: "往復", price: 0, description: "往復の送迎です。", visible: true, multiplier: 2 },
    { name: "待機", price: 800, description: "待機サービスです。", visible: true, multiplier: 1 },
    { name: "病院付き添い", price: 1600, description: "付き添いサービスです。", visible: true, multiplier: 1 }
  ]
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
      const filePath = path.join(root, rel);
      if (!filePath.startsWith(root) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function setupApiMocks(page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/menu")) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(mockMenu) });
    }
    if (url.includes("/api/bootstrap")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true, settings: { fixed_fare_enabled: "false" }, uiTexts: {} })
      });
    }
    if (url.includes("/api/baseFees")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          baseFees: {
            items: [
              { id: "pickup", label: "迎車料金", price: 800, visible: true },
              { id: "special", label: "特殊車両使用料", price: 1000, visible: true }
            ]
          }
        })
      });
    }
    if (url.includes("/api/rangeData")) {
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true, blocks: [], settings: {}, start: date, end: date })
      });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, blocks: [] }) });
  });
}

async function openBookingModal(page) {
  await page.waitForSelector(".slot-cell:not(.ng):not(.reserved)", { timeout: 20000 });
  await page.locator(".slot-cell:not(.ng):not(.reserved)").first().click();
  await page.waitForSelector("#bookingModal:not(.hidden)", { timeout: 10000 });
  await page.waitForFunction(() => (document.getElementById("tripType")?.options?.length || 0) > 0);
}

async function assertAddonOptions(page) {
  const options = await page.locator("#roundTripAddon option").allTextContents();
  const hasNone = options.some((t) => t.includes("なし"));
  if (hasNone) throw new Error(`「なし」が表示されています: ${options.join(", ")}`);
}

async function assertEstimateTotal(page, expectedYen) {
  await page.locator("#feeHeading").scrollIntoViewIfNeeded();
  await page.waitForFunction(
    (expected) => {
      const text = document.getElementById("estimateTotal")?.textContent || "";
      return text.replace(/\s/g, "").includes(`${expected.toLocaleString("ja-JP")}円`);
    },
    expectedYen,
    { timeout: 5000 }
  );
  const total = await page.locator("#estimateTotal").textContent();
  if (!total?.includes(`${expectedYen.toLocaleString("ja-JP")}`)) {
    throw new Error(`概算合計が不正: expected ${expectedYen}円, got ${total}`);
  }
}

async function setupBasicFareExample(page) {
  await page.evaluate(() => {
    document.getElementById("moveType").value = "無料車いす";
    document.getElementById("moveType").dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const assist = document.getElementById("assistanceType");
    for (let i = 0; i < assist.options.length; i++) {
      if (assist.options[i].value === "乗降介助") {
        assist.selectedIndex = i;
        break;
      }
    }
    assist.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("stairAssistance").value = "階段介助なし";
    document.getElementById("equipmentRental").value = "レンタルなし";
    document.getElementById("tripType").value = "片道";
    document.getElementById("tripType").dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const { server, baseUrl } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const pc = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pcPage = await pc.newPage();
    await setupApiMocks(pcPage);
    await pcPage.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    await openBookingModal(pcPage);

    await pcPage.selectOption("#tripType", "往復");
    await pcPage.waitForSelector("#roundTripAddonLabel:not(.hidden)");
    await assertAddonOptions(pcPage);
    const requiredAttr = await pcPage.locator("#roundTripAddon").evaluate((el) => el.required);
    if (!requiredAttr) throw new Error("往復時に roundTripAddon が required ではありません");
    await pcPage.screenshot({ path: path.join(outDir, "pc-round-trip-addon.png"), fullPage: true });

    // 未選択で予約送信 → バリデーションでブロック
    await pcPage.evaluate(() => {
      document.getElementById("usageType").value = "初めて";
      document.getElementById("moveType").value = "無料車いす";
      document.getElementById("moveType").dispatchEvent(new Event("change", { bubbles: true }));
    });
    await pcPage.waitForTimeout(200);
    await pcPage.evaluate(() => {
      const assist = document.getElementById("assistanceType");
      if (assist && assist.options.length > 1) assist.selectedIndex = 1;
      document.getElementById("stairAssistance").value = "階段介助なし";
      document.getElementById("equipmentRental").value = "レンタルなし";
      document.getElementById("customerKana").value = "ヤマダ タロウ";
      document.getElementById("customerPhone").value = "09012345678";
      document.getElementById("customerEmail").value = "test@example.com";
      document.getElementById("pickupLocation").value = "千葉市中央区";
      document.getElementById("agree").checked = true;
      document.getElementById("tripType").value = "往復";
      document.getElementById("tripType").dispatchEvent(new Event("change", { bubbles: true }));
      document.getElementById("roundTripAddon").value = "";
    });
    await pcPage.waitForTimeout(200);
    await pcPage.click("#submitBooking");
    await pcPage.waitForFunction(() => {
      const t = document.getElementById("toast");
      return t && t.style.display === "block" && t.textContent.includes("待機または病院付き添い");
    }, null, { timeout: 5000 });

    await pcPage.selectOption("#tripType", "片道");
    await pcPage.waitForFunction(() => document.getElementById("roundTripAddonLabel")?.classList.contains("hidden"));
    await pcPage.screenshot({ path: path.join(outDir, "pc-one-way-no-step5.png"), fullPage: true });

    await pcPage.selectOption("#moveType", "その他（杖歩行など）");
    await pcPage.waitForTimeout(300);
    const desc = await pcPage.locator("#moveTypeDesc").textContent();
    if (!desc || desc.includes("テスト5")) throw new Error(`説明文が未修正: ${desc}`);
    await pcPage.screenshot({ path: path.join(outDir, "pc-cane-walk-description.png"), fullPage: true });

    await pcPage.locator("#feeHeading").scrollIntoViewIfNeeded();
    const baseFare = await pcPage.locator(".base-fare-block").textContent();
    if (!baseFare?.includes("基本運賃") || !baseFare.includes("1.06kmまで500円")) {
      throw new Error(`基本運賃表示が不正: ${baseFare}`);
    }
    await pcPage.screenshot({ path: path.join(outDir, "pc-fare-section.png"), fullPage: false });

    await setupBasicFareExample(pcPage);
    await assertEstimateTotal(pcPage, 3400);
    const baseFeeRows = await pcPage.locator("#baseFeeList .fee-row").allTextContents();
    const hasBasicAmount = baseFeeRows.some((t) => t.includes("基本運賃") && t.includes("500"));
    if (!hasBasicAmount) throw new Error(`基本運賃500円行が見つかりません: ${baseFeeRows.join(" | ")}`);
    await pcPage.locator("#estimateTotal").scrollIntoViewIfNeeded();
    await pcPage.screenshot({ path: path.join(outDir, "pc-basic-fare-total-3400.png"), fullPage: false });
    await pc.close();

    const iPhone = devices["iPhone 13"];
    const mobile = await browser.newContext({ ...iPhone });
    const mobilePage = await mobile.newPage();
    await setupApiMocks(mobilePage);
    await mobilePage.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    await openBookingModal(mobilePage);
    await setupBasicFareExample(mobilePage);
    await assertEstimateTotal(mobilePage, 3400);
    await mobilePage.locator("#estimateTotal").scrollIntoViewIfNeeded();
    await mobilePage.screenshot({ path: path.join(outDir, "mobile-basic-fare-total-3400.png"), fullPage: true });
    await mobilePage.selectOption("#tripType", "往復");
    await mobilePage.waitForSelector("#roundTripAddonLabel:not(.hidden)");
    await assertAddonOptions(mobilePage);
    await mobilePage.screenshot({ path: path.join(outDir, "mobile-round-trip-addon.png"), fullPage: true });
    await mobile.close();

    console.log("Screenshots saved to:", outDir);
    console.log("Verification: OK");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
