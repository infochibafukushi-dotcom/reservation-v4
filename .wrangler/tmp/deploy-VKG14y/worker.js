var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var worker_default = {
  async fetch(request, env) {
    const headers = await buildCorsHeaders(request, env.DB);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    try {
      if (!env.DB) return json({ success: false, message: "DB_BINDING_MISSING" }, 500, headers);
      await ensureSchema(env.DB);
      await cleanupStaleAutoBlocks(env.DB);
      const url = new URL(request.url), path = url.pathname;
      if (path === "/") return new Response("OK");
      if (path === "/api/bootstrap") {
        return json({ success: true, settings: await getSettingsObject(env.DB), uiTexts: await getUiTexts(env.DB), menu: await getMenu(env.DB), baseFees: await getBaseFees(env.DB) }, 200, headers);
      }
      if (path === "/api/rangeData") {
        const start = url.searchParams.get("start") || "", end = url.searchParams.get("end") || "";
        const blocks = await env.DB.prepare(`SELECT id,date,time,type,reservation_id FROM blocks WHERE date>=? AND date<=? ORDER BY date,time`).bind(start, end).all();
        return json({ success: true, blocks: blocks.results || [], settings: await getSameDaySettings(env.DB) }, 200, headers);
      }
      if (path === "/api/getBlocks") {
        const blocks = await env.DB.prepare(`SELECT id,date,time,type,reservation_id FROM blocks ORDER BY date,time`).all();
        return json({ success: true, blocks: blocks.results || [] }, 200, headers);
      }
      if (path === "/api/getReservations") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const rows = await env.DB.prepare(`SELECT * FROM reservations WHERE is_visible != 0 ORDER BY created_at DESC,id DESC`).all();
        return json(rows.results || [], 200, headers);
      }
      if (path === "/api/menu") return json(await getMenu(env.DB), 200, headers);
      if (path === "/api/baseFees") return json({ baseFees: await getBaseFees(env.DB) }, 200, headers);
      if (path === "/api/uiTexts") return json({ success: true, uiTexts: await getUiTexts(env.DB) }, 200, headers);
      if (path === "/api/admin/login" && request.method === "POST") {
        const body = await safeJson(request);
        const password = String(body.password || "");
        const verified = await verifyAdminPassword(env.DB, password);
        const lockRemainingMs = await getLoginLockRemainingMs(env.DB);
        if (lockRemainingMs > 0 && !verified) return json({ success: false, message: `\u30ED\u30B0\u30A4\u30F3\u8A66\u884C\u56DE\u6570\u304C\u4E0A\u9650\u306B\u9054\u3057\u307E\u3057\u305F\u3002\u7D04${Math.ceil(lockRemainingMs / 6e4)}\u5206\u5F8C\u306B\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002` }, 429, headers);
        if (!verified) {
          await recordFailedLogin(env.DB);
          return json({ success: false, message: "\u8A8D\u8A3C\u306B\u5931\u6557\u3057\u307E\u3057\u305F" }, 200, headers);
        }
        await clearFailedLogin(env.DB);
        const token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
        const expiresAt = Date.now() + 12 * 60 * 60 * 1e3;
        await setSetting(env.DB, "admin_session_token_hash", await sha256(token));
        await setSetting(env.DB, "admin_session_expires_at", String(expiresAt));
        await setSetting(env.DB, "admin_session_token", "");
        return json({ success: true, token, expiresAt }, 200, headers);
      }
      if (path === "/api/admin/logout" && request.method === "POST") {
        if (await isAdminAuthorized(request, env.DB)) {
          await setSetting(env.DB, "admin_session_token", "");
          await setSetting(env.DB, "admin_session_token_hash", "");
          await setSetting(env.DB, "admin_session_expires_at", "0");
        }
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/quotes/register" && request.method === "POST") {
        if (!await isLpRegisterAuthorized(request, env, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        const result = await registerQuote(env.DB, body);
        if (!result.ok) return json({ success: false, message: result.message }, result.status, headers);
        return json({ success: true, estimateNo: result.estimateNo, snapshotHash: result.snapshotHash, status: result.status, total: result.total, expiresAt: result.expiresAt || null }, 200, headers);
      }
      if (path.startsWith("/api/quotes/") && request.method === "GET") {
        const estimateNo = parseQuoteEstimateNoFromPath(path);
        if (!estimateNo) return json({ success: false, message: "\u898B\u7A4D\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059" }, 400, headers);
        const result = await getQuoteByEstimateNo(env.DB, estimateNo);
        if (!result.ok) return json({ success: false, message: result.message }, result.status, headers);
        return json({ success: true, ...result.data }, 200, headers);
      }
      if (path === "/api/createReservation" && request.method === "POST") {
        return handleCreateReservation(request, env, headers);
      }
      if (path === "/api/cancelReservation" && request.method === "POST") {
        const body = await safeJson(request);
        const id = String(body.id || "");
        if (!id) return json({ success: false, message: "id required" }, 400, headers);
        await env.DB.prepare(`DELETE FROM blocks WHERE reservation_id=? AND type='auto'`).bind(id).run();
        await env.DB.prepare(`UPDATE reservations SET status='cancel' WHERE id=?`).bind(id).run();
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/reservations/update" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        await env.DB.prepare(`UPDATE reservations SET status=? WHERE id=?`).bind(String(body.status || "active"), String(body.id || "")).run();
        if (String(body.status) === "cancel") await env.DB.prepare(`DELETE FROM blocks WHERE reservation_id=? AND type='auto'`).bind(String(body.id || "")).run();
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/reservations/hide" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        await env.DB.prepare(`UPDATE reservations SET is_visible=0 WHERE id=?`).bind(String(body.id || "")).run();
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/reservations/delete" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        const id = String(body.id || "");
        if (!id) return json({ success: false, message: "id required" }, 400, headers);
        await env.DB.prepare(`DELETE FROM blocks WHERE reservation_id=?`).bind(id).run();
        await env.DB.prepare(`DELETE FROM reservations WHERE id=?`).bind(id).run();
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/reservations/csv") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const rows = await env.DB.prepare(`SELECT * FROM reservations ORDER BY created_at DESC`).all();
        return new Response(toCsv(rows.results || []), { headers: { "Content-Type": "text/csv; charset=UTF-8", "Content-Disposition": "attachment; filename=reservations.csv", "Access-Control-Allow-Origin": headers["Access-Control-Allow-Origin"], "Vary": "Origin" } });
      }
      if (path.startsWith("/api/admin/quotes/") && request.method === "GET") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const estimateNo = parseAdminQuoteEstimateNoFromPath(path);
        if (!estimateNo) return json({ success: false, message: "\u898B\u7A4D\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059" }, 400, headers);
        const result = await getAdminQuoteByEstimateNo(env.DB, estimateNo);
        if (!result.ok) return json({ success: false, message: result.message }, result.status, headers);
        return json({ success: true, quote: result.quote }, 200, headers);
      }
      if (path === "/api/admin/settings") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        return json({ success: true, settings: await getSettingsObject(env.DB) }, 200, headers);
      }
      if (path === "/api/admin/settings/save" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        for (const [k, v] of Object.entries(body)) {
          if (k !== "new_password") await setSetting(env.DB, k, String(v ?? ""));
        }
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/email/logs") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const rows = await env.DB.prepare(`SELECT id,created_at,kind,reservation_id,to_email,from_email,subject,status,provider_id,error_message FROM email_logs ORDER BY id DESC LIMIT 100`).all();
        return json({ success: true, logs: rows.results || [] }, 200, headers);
      }
      if (path === "/api/admin/email/test" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        const to = String(body.to || "").trim();
        if (!validEmail(to)) return json({ success: false, message: "\u9001\u4FE1\u5148\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u304C\u4E0D\u6B63\u3067\u3059" }, 400, headers);
        const from = await getSetting(env.DB, "email_from", DEFAULT_EMAIL_FROM);
        const result = await sendResendEmail(env, env.DB, { kind: "test", to, from, subject: "\u3010\u4ECB\u8B77\u30BF\u30AF\u30B7\u30FC\u3011\u30E1\u30FC\u30EB\u9001\u4FE1\u30C6\u30B9\u30C8", text: "\u3053\u308C\u306F\u7BA1\u7406\u753B\u9762\u304B\u3089\u306E\u30C6\u30B9\u30C8\u9001\u4FE1\u3067\u3059\u3002\n\n\u3053\u306E\u30E1\u30FC\u30EB\u304C\u5C4A\u3044\u3066\u3044\u308C\u3070\u3001Resend \u9023\u643A\u306F\u6B63\u5E38\u306B\u52D5\u4F5C\u3057\u3066\u3044\u307E\u3059\u3002" });
        if (result.skipped) return json({ success: false, message: result.error_message || "\u9001\u4FE1\u3092\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3057\u305F" }, 400, headers);
        if (!result.ok) return json({ success: false, message: result.error_message || "\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F" }, 500, headers);
        return json({ success: true, providerId: result.provider_id || "" }, 200, headers);
      }
      if (path === "/api/admin/password/change" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        if (!await verifyAdminPassword(env.DB, String(body.current || ""))) return json({ success: false, message: "\u73FE\u5728PW\u304C\u9055\u3044\u307E\u3059" }, 403, headers);
        if (!String(body.next || "").trim()) return json({ success: false, message: "\u65B0PW\u304C\u7A7A\u3067\u3059" }, 400, headers);
        await saveAdminPassword(env.DB, String(body.next));
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/menu/save" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        await setSetting(env.DB, "menu_items", JSON.stringify(body.items || []));
        await setSetting(env.DB, "menu_groups", JSON.stringify(body.groups || []));
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/baseFees/save" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        await setSetting(env.DB, "base_fees", JSON.stringify(body.items || defaultBaseFees().items));
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/uiTexts/save" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        await setSetting(env.DB, "ui_texts", JSON.stringify(body.uiTexts || {}));
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/logo/upload" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        await setSetting(env.DB, "logo_url", String(body.dataUrl || ""));
        return json({ success: true, url: String(body.dataUrl || "") }, 200, headers);
      }
      if (path === "/api/admin/blocks/slot" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        const date = normalizeDate(body.date), time = normalizeTime(body.time), mode = String(body.mode || "block");
        if (!date || !time) return json({ success: false, message: "\u65E5\u6642\u304C\u4E0D\u6B63\u3067\u3059" }, 400, headers);
        if (mode === "unblock") await env.DB.prepare(`DELETE FROM blocks WHERE date=? AND time=? AND type='manual'`).bind(date, time).run();
        else await env.DB.prepare(`INSERT OR IGNORE INTO blocks (date,time,type,reservation_id,created_at) VALUES (?,?,'manual','',?)`).bind(date, time, (/* @__PURE__ */ new Date()).toISOString()).run();
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/blocks/day" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        const date = normalizeDate(body.date), scope = String(body.scope || "day");
        if (!date) return json({ success: false, message: "\u65E5\u4ED8\u304C\u4E0D\u6B63\u3067\u3059" }, 400, headers);
        const times = scopeTimes(scope);
        if (!times.length) return json({ success: false, message: "\u7BC4\u56F2\u304C\u4E0D\u6B63\u3067\u3059" }, 400, headers);
        const placeholders = times.map(() => "?").join(",");
        const manual = await env.DB.prepare(`SELECT COUNT(*) AS c FROM blocks WHERE date=? AND type='manual' AND time IN (${placeholders})`).bind(date, ...times).first();
        const shouldUnblock = String(body.mode || "") === "unblock" || String(body.mode || "") === "toggle" && Number(manual?.c || 0) > 0;
        if (shouldUnblock) {
          await env.DB.prepare(`DELETE FROM blocks WHERE date=? AND type='manual' AND time IN (${placeholders})`).bind(date, ...times).run();
        } else {
          for (const time of times) await env.DB.prepare(`INSERT OR IGNORE INTO blocks (date,time,type,reservation_id,created_at) VALUES (?,?,'manual','',?)`).bind(date, time, (/* @__PURE__ */ new Date()).toISOString()).run();
        }
        return json({ success: true }, 200, headers);
      }
      if (path === "/api/admin/blocks/timeRange" && request.method === "POST") {
        if (!await isAdminAuthorized(request, env.DB)) return json({ success: false, message: "Unauthorized" }, 401, headers);
        const body = await safeJson(request);
        const date = normalizeDate(body.date), start = normalizeTime(body.start), end = normalizeTime(body.end), mode = String(body.mode || "block");
        if (!date || !start || !end) return json({ success: false, message: "\u6307\u5B9A\u304C\u4E0D\u6B63\u3067\u3059" }, 400, headers);
        for (const time of buildRangeTimes(start, end)) {
          if (mode === "unblock") await env.DB.prepare(`DELETE FROM blocks WHERE date=? AND time=? AND type='manual'`).bind(date, time).run();
          else await env.DB.prepare(`INSERT OR IGNORE INTO blocks (date,time,type,reservation_id,created_at) VALUES (?,?,'manual','',?)`).bind(date, time, (/* @__PURE__ */ new Date()).toISOString()).run();
        }
        return json({ success: true }, 200, headers);
      }
      return json({ success: false, message: "Not Found" }, 404, headers);
    } catch (e) {
      return json({ success: false, message: `ERROR: ${e.message}` }, 500, headers);
    }
  }
};
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers });
}
__name(json, "json");
async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
__name(safeJson, "safeJson");
async function buildCorsHeaders(request, db) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (await getSetting(db, "allowed_origins", "")).split(",").map((v) => v.trim()).filter(Boolean);
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || "*";
  return { "Content-Type": "application/json; charset=UTF-8", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
}
__name(buildCorsHeaders, "buildCorsHeaders");
function bearerToken(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}
__name(bearerToken, "bearerToken");
async function isAdminAuthorized(request, db) {
  const token = bearerToken(request);
  if (!token) return false;
  const hashed = await sha256(token), savedHash = await getSetting(db, "admin_session_token_hash", ""), savedPlain = await getSetting(db, "admin_session_token", ""), exp = Number(await getSetting(db, "admin_session_expires_at", "0") || 0);
  if (exp <= Date.now()) return false;
  if (savedHash) return hashed === savedHash;
  if (savedPlain) return token === savedPlain;
  return false;
}
__name(isAdminAuthorized, "isAdminAuthorized");
async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT)`).run();
  await db.prepare(`INSERT OR IGNORE INTO settings (key,value) VALUES ('admin_password','1234')`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY)`).run();
  for (const [c, t] of Object.entries({ usageType: "TEXT", name: "TEXT", kana: "TEXT", phone: "TEXT", email: "TEXT", date: "TEXT", time: "TEXT", pickup: "TEXT", destination: "TEXT", vehicle: "TEXT", transfer: "TEXT", assist: "TEXT", stairs: "TEXT", equipment: "TEXT", roundTrip: "TEXT", notes: "TEXT", estimate: "TEXT", baseFeeTotal: "INTEGER DEFAULT 0", serviceFeeTotal: "INTEGER DEFAULT 0", block_count: "INTEGER DEFAULT 2", status: "TEXT DEFAULT 'active'", is_visible: "INTEGER DEFAULT 1", created_at: "TEXT", estimate_no: "TEXT", quote_snapshot: "TEXT", route_plan: "TEXT", usage_summary: "TEXT", handoff_source: "TEXT", dto_version: "INTEGER DEFAULT 0", franchisee_id: "TEXT", store_id: "TEXT", estimate_consent: "TEXT", fare_type: "TEXT", confirmed_fare: "INTEGER DEFAULT 0", quote_snapshot_hash: "TEXT", fare_locked_at: "TEXT" })) await addColumnIfMissing(db, "reservations", c, t);
  await db.prepare(`CREATE TABLE IF NOT EXISTS blocks (id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT,time TEXT,type TEXT,reservation_id TEXT,created_at TEXT)`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_unique ON blocks(date,time)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS email_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT,kind TEXT,reservation_id TEXT,to_email TEXT,from_email TEXT,subject TEXT,status TEXT,provider_id TEXT,error_message TEXT)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS quotes (estimate_no TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'active',total_amount INTEGER NOT NULL,fare_type TEXT NOT NULL DEFAULT 'fixed',quote_snapshot TEXT NOT NULL,route_plan TEXT,usage_summary TEXT,fare_mode TEXT,fare_version TEXT,quote_version INTEGER DEFAULT 1,snapshot_hash TEXT NOT NULL,handoff_source TEXT DEFAULT 'lp-site-estimate',dto_version INTEGER DEFAULT 1,franchisee_id TEXT,store_id TEXT,expires_at TEXT,created_at TEXT NOT NULL,consumed_at TEXT,reservation_id TEXT,registered_by TEXT DEFAULT 'lp')`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_quotes_reservation_id ON quotes(reservation_id)`).run();
  for (const [c, t] of Object.entries({ selected_route_id: "TEXT", selected_overall_route_id: "TEXT", pre_fixed_fare_confirmable: "INTEGER DEFAULT 0", fallback_reason: "TEXT", use_toll: "INTEGER DEFAULT 0", distance_meters: "INTEGER", duration_seconds: "INTEGER", fixed_fare_total: "INTEGER" })) await addColumnIfMissing(db, "quotes", c, t);
  for (const [c, t] of Object.entries({ pre_fixed_fare_confirmable: "INTEGER DEFAULT 0", selected_route_id: "TEXT", selected_overall_route_id: "TEXT", use_toll: "INTEGER DEFAULT 0", consent_at: "TEXT", fixed_fare_total: "INTEGER DEFAULT 0" })) await addColumnIfMissing(db, "reservations", c, t);
  await db.prepare(`CREATE TABLE IF NOT EXISTS quote_consents (id INTEGER PRIMARY KEY AUTOINCREMENT,estimate_no TEXT NOT NULL,reservation_id TEXT NOT NULL,consent_at TEXT NOT NULL,consent_text TEXT NOT NULL,consent_text_version TEXT NOT NULL,snapshot_hash TEXT NOT NULL,user_agent TEXT,ip_hash TEXT,created_at TEXT NOT NULL)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_quote_consents_estimate_no ON quote_consents(estimate_no)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_quote_consents_reservation_id ON quote_consents(reservation_id)`).run();
  await setSetting(db, "fixed_fare_enabled", await getSetting(db, "fixed_fare_enabled", "false"));
  if (!(await getSetting(db, "allowed_origins", "")).trim()) await setSetting(db, "allowed_origins", "https://infochibafukushi-dotcom.github.io");
  await setSetting(db, "login_lock_minutes", await getSetting(db, "login_lock_minutes", "10"));
  await setSetting(db, "max_login_attempts", await getSetting(db, "max_login_attempts", "5"));
  await setSetting(db, "email_from", await getSetting(db, "email_from", DEFAULT_EMAIL_FROM));
  await setSetting(db, "email_admin_to", await getSetting(db, "email_admin_to", ""));
}
__name(ensureSchema, "ensureSchema");
async function sha256(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
async function saveAdminPassword(db, password) {
  const salt = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
  const hash = await sha256(`${salt}:${password}`);
  await setSetting(db, "admin_password_hash", `v1:${salt}:${hash}`);
  await setSetting(db, "admin_password", "");
}
__name(saveAdminPassword, "saveAdminPassword");
async function verifyAdminPassword(db, input) {
  const savedHash = await getSetting(db, "admin_password_hash", "");
  if (savedHash.startsWith("v1:")) {
    const [, salt, hash] = savedHash.split(":");
    return hash === await sha256(`${salt}:${input}`);
  }
  const legacy = await getSetting(db, "admin_password", "1234");
  const ok = String(input) === String(legacy);
  if (ok) await saveAdminPassword(db, String(legacy));
  return ok;
}
__name(verifyAdminPassword, "verifyAdminPassword");
async function getLoginLockRemainingMs(db) {
  const failCount = Number(await getSetting(db, "admin_login_fail_count", "0") || 0), lastFailedAt = Number(await getSetting(db, "admin_login_last_failed_at", "0") || 0), maxAttempts = Math.max(1, Number(await getSetting(db, "max_login_attempts", "5") || 5)), lockMinutes = Math.max(1, Number(await getSetting(db, "login_lock_minutes", "10") || 10));
  if (failCount < maxAttempts) return 0;
  const remaining = lastFailedAt + lockMinutes * 60 * 1e3 - Date.now();
  return Math.max(0, remaining);
}
__name(getLoginLockRemainingMs, "getLoginLockRemainingMs");
async function recordFailedLogin(db) {
  const count = Number(await getSetting(db, "admin_login_fail_count", "0") || 0) + 1;
  await setSetting(db, "admin_login_fail_count", String(count));
  await setSetting(db, "admin_login_last_failed_at", String(Date.now()));
}
__name(recordFailedLogin, "recordFailedLogin");
async function clearFailedLogin(db) {
  await setSetting(db, "admin_login_fail_count", "0");
  await setSetting(db, "admin_login_last_failed_at", "0");
}
__name(clearFailedLogin, "clearFailedLogin");
async function cleanupStaleAutoBlocks(db) {
  await db.prepare(`DELETE FROM blocks WHERE type='auto' AND (reservation_id IS NULL OR reservation_id='' OR NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id=blocks.reservation_id AND COALESCE(r.status,'active')!='cancel' AND COALESCE(r.is_visible,1)!=0))`).run();
}
__name(cleanupStaleAutoBlocks, "cleanupStaleAutoBlocks");
async function addColumnIfMissing(db, table, column, type) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all();
  if (!(info.results || []).some((r) => r.name === column)) await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
}
__name(addColumnIfMissing, "addColumnIfMissing");
async function getSetting(db, key, fallback) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key=? LIMIT 1`).bind(key).first();
  return row ? row.value : fallback;
}
__name(getSetting, "getSetting");
async function setSetting(db, key, value) {
  await db.prepare(`INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(key, value).run();
}
__name(setSetting, "setSetting");
async function getSettingsObject(db) {
  const keys = ["notify_webhook_url", "assist_limit_moves", "assist_allowed_items", "auto_body_assist_moves", "phone_link", "line_url", "logo_text", "logo_subtext", "logo_url", "github_user", "github_repo", "github_branch", "github_path", "github_pat", "same_day_enabled", "min_hours", "email_from", "email_admin_to", "fixed_fare_enabled"];
  const obj = {};
  for (const k of keys) obj[k] = await getSetting(db, k, k === "same_day_enabled" ? "true" : k === "min_hours" ? "3" : k === "email_from" ? DEFAULT_EMAIL_FROM : k === "fixed_fare_enabled" ? "false" : "");
  return obj;
}
__name(getSettingsObject, "getSettingsObject");
async function getSameDaySettings(db) {
  return { same_day_enabled: await getSetting(db, "same_day_enabled", "true"), min_hours: await getSetting(db, "min_hours", "3") };
}
__name(getSameDaySettings, "getSameDaySettings");
function defaultBaseFees() {
  return { items: [{ id: "pickup", label: "\u8FCE\u8ECA\u6599\u91D1", price: 800, visible: true }, { id: "special", label: "\u7279\u6B8A\u8ECA\u4E21\u4F7F\u7528\u6599", price: 1e3, visible: true }] };
}
__name(defaultBaseFees, "defaultBaseFees");
async function getBaseFees(db) {
  const saved = await getSetting(db, "base_fees", "");
  if (saved) {
    try {
      return { items: JSON.parse(saved) };
    } catch {
    }
  }
  return defaultBaseFees();
}
__name(getBaseFees, "getBaseFees");
async function getUiTexts(db) {
  const saved = await getSetting(db, "ui_texts", "");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
    }
  }
  return {};
}
__name(getUiTexts, "getUiTexts");
function normalizeDate(v) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
__name(normalizeDate, "normalizeDate");
function normalizeTime(v) {
  const s = String(v || "").trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  return "";
}
__name(normalizeTime, "normalizeTime");
async function nextReservationId(db, date, time) {
  const base = `${String(date).replace(/-/g, "")}${String(time).replace(/:/g, "")}`;
  let id = base, seq = 1;
  while (await db.prepare(`SELECT id FROM reservations WHERE id=? LIMIT 1`).bind(id).first()) {
    seq += 1;
    id = `${base}-${String(seq).padStart(2, "0")}`;
  }
  return id;
}
__name(nextReservationId, "nextReservationId");
function getBlockCount(roundTrip) {
  const v = String(roundTrip || "");
  if (["\u5F80\u5FA9", "\u5F85\u6A5F", "\u4ED8\u304D\u6DFB\u3044", "\u75C5\u9662\u4ED8\u304D\u6DFB\u3044"].some((x) => v.includes(x))) return 4;
  return 2;
}
__name(getBlockCount, "getBlockCount");
function makeSlots(date, time, count) {
  const [y, m, d] = String(date).split("-").map(Number), [h, min] = String(time).split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(h) || Number.isNaN(min)) return [];
  const start = h * 60 + min, slots = [];
  for (let i = 0; i < count; i++) {
    const total = start + i * 30, dayOffset = Math.floor(total / 1440), minuteOfDay = (total % 1440 + 1440) % 1440;
    const slotDate = new Date(y, m - 1, d);
    slotDate.setDate(slotDate.getDate() + dayOffset);
    slots.push({
      date: `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, "0")}-${String(slotDate.getDate()).padStart(2, "0")}`,
      time: `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`
    });
  }
  return slots;
}
__name(makeSlots, "makeSlots");
function buildAllTimes() {
  const out = [];
  for (let h = 0; h <= 23; h++) for (let m = 0; m < 60; m += 30) out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return out;
}
__name(buildAllTimes, "buildAllTimes");
function buildNormalTimes() {
  const out = [];
  for (let h = 6; h <= 21; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 21 && m > 0) continue;
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}
__name(buildNormalTimes, "buildNormalTimes");
function buildRangeTimes(start, end) {
  const out = [];
  let [sh, sm] = start.split(":").map(Number), [eh, em] = end.split(":").map(Number);
  let s = sh * 60 + sm, e = eh * 60 + em;
  for (let t = s; t < e; t += 30) out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  return out;
}
__name(buildRangeTimes, "buildRangeTimes");
function buildNightTimes() {
  return [...buildRangeTimes("00:00", "06:00"), ...buildRangeTimes("21:30", "24:00")];
}
__name(buildNightTimes, "buildNightTimes");
function scopeTimes(scope) {
  if (scope === "all") return buildAllTimes();
  if (scope === "night") return buildNightTimes();
  return buildNormalTimes();
}
__name(scopeTimes, "scopeTimes");
function inferLegacyGroup(name) {
  const n = String(name || "");
  if (["\u7121\u6599\u8ECA\u3044\u3059", "\u3054\u81EA\u8EAB\u306E\u8ECA\u3044\u3059", "\u8ECA\u3044\u3059", "\u30B9\u30C8\u30EC\u30C3\u30C1\u30E3\u30FC", "\u30EA\u30AF\u30E9\u30A4\u30CB\u30F3\u30B0\u8ECA\u3044\u3059", "\u6756\u30FB\u6B69\u884C\u5668"].includes(n)) return "move_type";
  if (["\u4E57\u964D\u4ECB\u52A9", "\u8EAB\u4F53\u4ECB\u52A9", "\u4ECB\u52A9\u4E0D\u8981"].includes(n)) return "assist";
  if (["\u968E\u6BB5\u4ECB\u52A9\u306A\u3057", "\u898B\u5B88\u308A\u4ECB\u52A9", "2\u968E\u79FB\u52D5", "3\u968E\u79FB\u52D5", "4\u968E\u79FB\u52D5", "5\u968E\u79FB\u52D5"].includes(n)) return "stairs";
  if (["\u30EC\u30F3\u30BF\u30EB\u306A\u3057", "\u8ECA\u3044\u3059\u30EC\u30F3\u30BF\u30EB"].includes(n)) return "equipment";
  if (["\u7247\u9053", "\u5F80\u5FA9", "\u5F85\u6A5F", "\u4ED8\u304D\u6DFB\u3044", "\u75C5\u9662\u4ED8\u304D\u6DFB\u3044"].includes(n)) return "round";
  return "custom";
}
__name(inferLegacyGroup, "inferLegacyGroup");
async function getMenu(db) {
  const saved = await getSetting(db, "menu_items", "");
  const groupSaved = await getSetting(db, "menu_groups", "");
  let groups = [];
  try {
    groups = groupSaved ? JSON.parse(groupSaved) : [];
  } catch {
  }
  if (saved) {
    try {
      const items = JSON.parse(saved), grouped = { move_type: [], assist: [], stairs: [], equipment: [], round: [], round_addon: [], custom: [], groups };
      items.forEach((i) => {
        const raw = i.group || "custom";
        const g = raw === "custom" || !raw ? inferLegacyGroup(i.name) : raw;
        if (grouped[g]) grouped[g].push({ ...i, group: g });
        else grouped.custom.push({ ...i, group: g });
      });
      return grouped;
    } catch {
    }
  }
  return { groups, move_type: [{ name: "\u7121\u6599\u8ECA\u3044\u3059", price: 0, visible: true, description: "\u6A19\u6E96\u7684\u306A\u8ECA\u3044\u3059\u3092\u7121\u6599\u3067\u3054\u5229\u7528\u3044\u305F\u3060\u3051\u307E\u3059\u3002\u901A\u9662\u3084\u304A\u8CB7\u3044\u7269\u306A\u3069\u5E45\u5E83\u3044\u7528\u9014\u3067\u3054\u5229\u7528\u53EF\u80FD\u3067\u3059\u3002", assist_allowed_items: "\u4E57\u964D\u4ECB\u52A9,\u8EAB\u4F53\u4ECB\u52A9" }, { name: "\u3054\u81EA\u8EAB\u306E\u8ECA\u3044\u3059", price: 0, visible: true, description: "\u666E\u6BB5\u304A\u4F7F\u3044\u306E\u8ECA\u3044\u3059\u306E\u307E\u307E\u3054\u4E57\u8ECA\u3044\u305F\u3060\u3051\u307E\u3059\u3002", assist_allowed_items: "\u4E57\u964D\u4ECB\u52A9,\u8EAB\u4F53\u4ECB\u52A9" }, { name: "\u30EA\u30AF\u30E9\u30A4\u30CB\u30F3\u30B0\u8ECA\u3044\u3059", price: 2500, visible: true, description: "\u80CC\u3082\u305F\u308C\u3092\u5012\u3057\u3066\u697D\u306A\u59FF\u52E2\u3067\u79FB\u52D5\u3067\u304D\u308B\u8ECA\u3044\u3059\u3067\u3059\u3002", assist_allowed_items: "\u4E57\u964D\u4ECB\u52A9,\u8EAB\u4F53\u4ECB\u52A9" }, { name: "\u30B9\u30C8\u30EC\u30C3\u30C1\u30E3\u30FC", price: 4e3, visible: true, description: "\u5BDD\u305F\u307E\u307E\u306E\u72B6\u614B\u3067\u642C\u9001\u3067\u304D\u308B\u8A2D\u5099\u3067\u3059\u3002", assist_allowed_items: "\u8EAB\u4F53\u4ECB\u52A9" }], assist: [{ name: "\u898B\u5B88\u308A\u4ECB\u52A9", price: 0, visible: true, description: "\u8EE2\u5012\u9632\u6B62\u306E\u305F\u3081\u4ED8\u304D\u6DFB\u3044\u306A\u304C\u3089\u79FB\u52D5\u3092\u898B\u5B88\u308A\u307E\u3059\u3002" }, { name: "\u4E57\u964D\u4ECB\u52A9", price: 1100, visible: true, description: "\u8ECA\u3044\u3059\u306E\u56FA\u5B9A\u3084\u30EA\u30D5\u30C8\u64CD\u4F5C\u3001\u8ECA\u3078\u306E\u4E57\u308A\u964D\u308A\u3092\u304A\u624B\u4F1D\u3044\u3057\u307E\u3059\u3002" }, { name: "\u8EAB\u4F53\u4ECB\u52A9", price: 1600, visible: true, description: "\u304A\u90E8\u5C4B\u304B\u3089\u8ECA\u3044\u3059\u3078\u306E\u79FB\u4E57\u3001\u8ECA\u4E21\u3078\u306E\u4E57\u964D\u3001\u8ECA\u3044\u3059\u56FA\u5B9A\u306A\u3069\u3092\u884C\u3044\u307E\u3059\u3002" }], stairs: [{ name: "\u968E\u6BB5\u4ECB\u52A9\u306A\u3057", price: 0, visible: true, force_body_assist: "false", description: "\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC\u3084\u30B9\u30ED\u30FC\u30D7\u306A\u3069\u3001\u968E\u6BB5\u3092\u4F7F\u308F\u305A\u306B\u79FB\u52D5\u3067\u304D\u308B\u5834\u5408\u306B\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, { name: "\u898B\u5B88\u308A\u4ECB\u52A9", price: 0, visible: true, force_body_assist: "false", description: "\u968E\u6BB5\u3084\u79FB\u52D5\u6642\u306B\u8EE2\u5012\u9632\u6B62\u306E\u305F\u3081\u4ED8\u304D\u6DFB\u3044\u3001\u5B89\u5168\u78BA\u8A8D\u3092\u884C\u3044\u307E\u3059\u3002" }, { name: "2\u968E\u79FB\u52D5", price: 3e3, visible: true, force_body_assist: "true", description: "\u968E\u6BB5\u3092\u5229\u7528\u3057\u30662\u968E\u307E\u3067\u79FB\u52D5\u3059\u308B\u969B\u306E\u4ECB\u52A9\u3067\u3059\u3002" }, { name: "3\u968E\u79FB\u52D5", price: 5e3, visible: true, force_body_assist: "true", description: "\u968E\u6BB5\u3092\u5229\u7528\u3057\u30663\u968E\u307E\u3067\u79FB\u52D5\u3059\u308B\u969B\u306E\u4ECB\u52A9\u3067\u3059\u3002" }], equipment: [{ name: "\u30EC\u30F3\u30BF\u30EB\u306A\u3057", price: 0, visible: true, description: "\u6A5F\u6750\u306E\u30EC\u30F3\u30BF\u30EB\u306F\u4E0D\u8981\u306A\u5834\u5408\u306B\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }, { name: "\u8ECA\u3044\u3059\u30EC\u30F3\u30BF\u30EB", price: 500, visible: true, description: "\u8ECA\u3044\u3059\u3092\u30EC\u30F3\u30BF\u30EB\u3057\u3066\u3054\u5229\u7528\u3044\u305F\u3060\u3051\u307E\u3059\u3002" }, { name: "\u30B9\u30C8\u30EC\u30C3\u30C1\u30E3\u30FC", price: 4e3, visible: true, description: "\u5BDD\u305F\u307E\u307E\u642C\u9001\u7528\u306E\u30B9\u30C8\u30EC\u30C3\u30C1\u30E3\u30FC\u3092\u30EC\u30F3\u30BF\u30EB\u3057\u307E\u3059\u3002" }], round: [{ name: "\u7247\u9053", price: 0, multiplier: 1, visible: true, description: "\u304A\u8FCE\u3048\u304B\u3089\u76EE\u7684\u5730\u307E\u3067\u3001\u7247\u9053\u306E\u307F\u306E\u9001\u8FCE\u3067\u3059\u3002" }, { name: "\u5F80\u5FA9", price: 0, multiplier: 2, visible: true, description: "\u5F80\u5FA9\u9001\u8FCE\u3067\u3059\u3002\u8DDD\u96E2\u904B\u8CC3\u306F2\u500D\u3067\u8A08\u7B97\u3055\u308C\u307E\u3059\u3002" }, { name: "\u5F85\u6A5F", price: 800, multiplier: 1, visible: true, description: "\u901A\u9662\u3084\u304A\u8CB7\u3044\u7269\u306A\u3069\u306E\u9593\u3001\u8ECA\u4E21\u3068\u4E57\u52D9\u54E1\u304C\u5F85\u6A5F\u3059\u308B\u30B5\u30FC\u30D3\u30B9\u3067\u3059\u3002" }, { name: "\u75C5\u9662\u4ED8\u304D\u6DFB\u3044", price: 1600, multiplier: 1, visible: true, description: "\u53D7\u4ED8\u3001\u65BD\u8A2D\u5185\u79FB\u52D5\u3001\u4F1A\u8A08\u306A\u3069\u3092\u304A\u624B\u4F1D\u3044\u3057\u307E\u3059\u3002" }] };
}
__name(getMenu, "getMenu");
function toCsv(rows) {
  const cols = ["id", "usageType", "name", "kana", "phone", "date", "time", "pickup", "destination", "vehicle", "transfer", "assist", "stairs", "equipment", "roundTrip", "estimate", "baseFeeTotal", "serviceFeeTotal", "status", "is_visible", "created_at", "estimate_no", "confirmed_fare", "fare_type", "fare_locked_at", "quote_snapshot_hash"];
  const esc = /* @__PURE__ */ __name((v) => `"${String(v ?? "").replace(/"/g, '""')}"`, "esc");
  return "\uFEFF" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
__name(toCsv, "toCsv");
function serializeJsonField(body, key, maxLen = 0) {
  const v = body?.[key];
  if (v == null || v === "") return "";
  let s = "";
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return "";
  }
  if (maxLen > 0 && s.length > maxLen) {
    try {
      const obj = typeof v === "object" && v ? { ...v } : JSON.parse(s);
      if (obj && obj.encodedPolyline) {
        const slim = { ...obj, encodedPolyline: "" };
        s = JSON.stringify(slim);
      }
    } catch {
    }
    if (s.length > maxLen) s = s.slice(0, maxLen);
  }
  return s;
}
__name(serializeJsonField, "serializeJsonField");
function parseQuoteSnapshotFromBody(body) {
  const raw = body?.quoteSnapshot ?? body?.quote_snapshot;
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}
__name(parseQuoteSnapshotFromBody, "parseQuoteSnapshotFromBody");
function parseYenAmountFromText(text) {
  const m = String(text || "").replace(/[,，]/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}
__name(parseYenAmountFromText, "parseYenAmountFromText");
function buildEstimateConsentForSave(body, estimateNo, reservationId, request, snapshotHash) {
  if (!String(estimateNo || "").trim()) return { value: "", skipped: true, reason: "no_estimate_no" };
  const raw = body?.estimateConsent ?? body?.estimate_consent;
  if (!raw || typeof raw !== "object") return { value: "", skipped: true, reason: "no_consent_payload" };
  const consentEstimateNo = String(raw.estimateNo || "").trim();
  if (consentEstimateNo && consentEstimateNo !== estimateNo) return { value: "", skipped: true, reason: "estimate_no_mismatch" };
  const quotedFare = Number(raw.quotedFare) || 0;
  const snapshot = parseQuoteSnapshotFromBody(body);
  const snapshotTotal = Number(snapshot?.total) || 0;
  const estimateTextFare = parseYenAmountFromText(body?.estimate);
  const fareCandidates = [snapshotTotal, estimateTextFare].filter((n) => n > 0);
  if (quotedFare > 0 && fareCandidates.length > 0 && !fareCandidates.some((n) => Math.abs(n - quotedFare) <= 1)) return { value: "", skipped: true, reason: "quoted_fare_mismatch" };
  const userAgent = String(request?.headers?.get?.("User-Agent") || raw.userAgent || "").trim();
  const agreedAt = (/* @__PURE__ */ new Date()).toISOString();
  const record = { schemaVersion: 2, agreedAt, consentAt: agreedAt, estimateNo, quotedFare: quotedFare || estimateTextFare || snapshotTotal || 0, fareMode: raw.fareMode ?? snapshot?.fareMode ?? null, fareVersion: raw.fareVersion ?? snapshot?.fareVersion ?? null, quoteVersion: Number(raw.quoteVersion ?? snapshot?.quoteVersion ?? 1) || 1, userAgent, consentType: String(raw.consentType || "estimate_booking"), consentText: String(raw.consentText || "").trim(), consentTextVersion: String(raw.consentTextVersion || DEFAULT_CONSENT_TEXT_VERSION).trim(), snapshotHash: String(raw.snapshotHash || snapshotHash || "").trim(), reservationId: String(reservationId || ""), clientIp: null, clientIpCapturedAt: null, ipHash: null };
  return { value: JSON.stringify(record), skipped: false, record };
}
__name(buildEstimateConsentForSave, "buildEstimateConsentForSave");
async function buildFixedFareEstimateConsent(body, estimateNo, reservationId, request, serverTotal, snapshot, snapshotHash) {
  if (!String(estimateNo || "").trim()) return { ok: false, status: 400, message: "\u898B\u7A4D\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059" };
  const raw = body?.estimateConsent ?? body?.estimate_consent;
  if (!raw || typeof raw !== "object") return { ok: false, status: 400, message: "\u898B\u7A4D\u5185\u5BB9\u3078\u306E\u540C\u610F\u304C\u5FC5\u8981\u3067\u3059" };
  const consentEstimateNo = String(raw.estimateNo || "").trim();
  if (consentEstimateNo && consentEstimateNo !== estimateNo) return { ok: false, status: 400, message: "\u898B\u7A4D\u756A\u53F7\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093" };
  const quotedFare = Number(raw.quotedFare) || 0, total = Number(serverTotal) || 0;
  if (!total) return { ok: false, status: 400, message: "\u898B\u7A4D\u91D1\u984D\u304C\u4E0D\u6B63\u3067\u3059" };
  if (!quotedFare || Math.abs(quotedFare - total) > 1) return { ok: false, status: 400, message: "\u540C\u610F\u91D1\u984D\u304C\u898B\u7A4D\u3068\u4E00\u81F4\u3057\u307E\u305B\u3093" };
  const userAgent = String(request?.headers?.get?.("User-Agent") || raw.userAgent || "").trim(), ipHash = await hashClientIp(request), agreedAt = (/* @__PURE__ */ new Date()).toISOString();
  const record = { schemaVersion: 2, agreedAt, consentAt: agreedAt, estimateNo, quotedFare: total, fareMode: raw.fareMode ?? snapshot?.fareMode ?? null, fareVersion: raw.fareVersion ?? snapshot?.fareVersion ?? null, quoteVersion: Number(raw.quoteVersion ?? snapshot?.quoteVersion ?? 1) || 1, userAgent, consentType: String(raw.consentType || "estimate_booking"), consentText: String(raw.consentText || "").trim(), consentTextVersion: String(raw.consentTextVersion || DEFAULT_CONSENT_TEXT_VERSION).trim(), snapshotHash: String(raw.snapshotHash || snapshotHash || "").trim(), reservationId: String(reservationId || ""), clientIp: null, clientIpCapturedAt: null, ipHash };
  return { ok: true, value: JSON.stringify(record), record };
}
__name(buildFixedFareEstimateConsent, "buildFixedFareEstimateConsent");
function formatConfirmedFareYen(amount) {
  return `${Number(amount || 0).toLocaleString("ja-JP")}\u5186`;
}
__name(formatConfirmedFareYen, "formatConfirmedFareYen");
async function isFixedFareEnabled(db) {
  return String(await getSetting(db, "fixed_fare_enabled", "false")).toLowerCase() === "true";
}
__name(isFixedFareEnabled, "isFixedFareEnabled");
async function validateCreateReservationBasics(body) {
  for (const key of ["usageType", "name", "phone", "date", "time", "pickup", "vehicle"]) {
    if (!String(body[key] || "").trim()) return { ok: false, status: 400, message: "\u5FC5\u9808\u9805\u76EE\u304C\u672A\u5165\u529B\u3067\u3059" };
  }
  const email = String(body.email || "").trim();
  if (email && !validEmail(email)) return { ok: false, status: 400, message: "\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093" };
  const date = normalizeDate(body.date), time = normalizeTime(body.time);
  if (!date || !time) return { ok: false, status: 400, message: "\u65E5\u6642\u304C\u4E0D\u6B63\u3067\u3059" };
  const blockCount = getBlockCount(body.roundTrip), slots = makeSlots(date, time, blockCount);
  return { ok: true, email, date, time, blockCount, slots };
}
__name(validateCreateReservationBasics, "validateCreateReservationBasics");
async function assertSlotsAvailable(db, slots) {
  for (const slot of slots) {
    const exists = await db.prepare(`SELECT id FROM blocks WHERE date=? AND time=? LIMIT 1`).bind(slot.date, slot.time).first();
    if (exists) return { ok: false, status: 409, message: "\u3053\u306E\u67A0\u306F\u4E88\u7D04\u3067\u304D\u307E\u305B\u3093" };
  }
  return { ok: true };
}
__name(assertSlotsAvailable, "assertSlotsAvailable");
function reservationInsertSql() {
  return `INSERT INTO reservations (id,usageType,name,kana,phone,email,date,time,pickup,destination,vehicle,transfer,assist,stairs,equipment,roundTrip,notes,estimate,baseFeeTotal,serviceFeeTotal,block_count,status,is_visible,created_at,estimate_no,quote_snapshot,route_plan,usage_summary,handoff_source,dto_version,franchisee_id,store_id,estimate_consent,fare_type,confirmed_fare,quote_snapshot_hash,fare_locked_at,pre_fixed_fare_confirmable,selected_route_id,selected_overall_route_id,use_toll,consent_at,fixed_fare_total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
}
__name(reservationInsertSql, "reservationInsertSql");
function reservationQuoteBindExtras(snapshot, snapshotHash, consentRecord) {
  const meta = extractQuoteSnapshotMeta(snapshot);
  const consentAt = String(consentRecord?.consentAt || consentRecord?.agreedAt || "").trim() || null;
  return [meta.preFixedFareConfirmable, meta.selectedRouteId, meta.selectedOverallRouteId, meta.useToll, consentAt, meta.fixedFareTotal];
}
__name(reservationQuoteBindExtras, "reservationQuoteBindExtras");
async function createReservationLegacy(env, headers, body, ctx) {
  const id = await nextReservationId(env.DB, ctx.date, ctx.time), estimateNo = String(body.estimateNo || body.estimate_no || "").trim(), parsedSnapshot = parseQuoteSnapshotFromBody(body), quoteSnapshot = serializeJsonField(body, "quoteSnapshot"), routePlan = serializeJsonField(body, "routePlan", 5e4), usageSummary = serializeJsonField(body, "usageSummary"), handoffSource = String(body.handoffSource || body.handoff_source || "").trim(), dtoVersion = Number(body.dtoVersion || body.dto_version || 0) || 0, franchiseeId = String(body.franchiseeId || body.franchisee_id || "").trim(), storeId = String(body.storeId || body.store_id || "").trim(), snapshotHash = parsedSnapshot ? await hashSnapshot(parsedSnapshot) : "", estimateConsentResult = buildEstimateConsentForSave(body, estimateNo, id, ctx.request, snapshotHash), estimateConsent = estimateConsentResult.value || "", consentRecord = estimateConsentResult.record || null, quoteExtras = reservationQuoteBindExtras(parsedSnapshot, snapshotHash, consentRecord), createdAt = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.prepare(reservationInsertSql()).bind(id, String(body.usageType || ""), String(body.name || ""), String(body.kana || body.name || ""), String(body.phone || ""), ctx.email, ctx.date, ctx.time, String(body.pickup || ""), String(body.destination || ""), String(body.vehicle || ""), String(body.transfer || ""), String(body.assist || ""), String(body.stairs || ""), String(body.equipment || ""), String(body.roundTrip || ""), String(body.notes || ""), String(body.estimate || ""), Number(body.baseFeeTotal || 0), Number(body.serviceFeeTotal || 0), ctx.blockCount, "active", 1, createdAt, estimateNo, quoteSnapshot, routePlan, usageSummary, handoffSource, dtoVersion, franchiseeId, storeId, estimateConsent, "", 0, snapshotHash || "", "", ...quoteExtras).run();
  if (consentRecord?.consentText) await insertQuoteConsent(env.DB, { estimateNo, reservationId: id, consentAt: consentRecord.consentAt, consentText: consentRecord.consentText, consentTextVersion: consentRecord.consentTextVersion, snapshotHash: consentRecord.snapshotHash || snapshotHash, userAgent: consentRecord.userAgent, ipHash: consentRecord.ipHash });
  for (const slot of ctx.slots) {
    await env.DB.prepare(`INSERT OR IGNORE INTO blocks (date,time,type,reservation_id,created_at) VALUES (?,?,?,?,?)`).bind(slot.date, slot.time, "auto", id, createdAt).run();
  }
  await notify(env.DB, body, id);
  await sendReservationEmails(env, env.DB, id, { ...body, email: ctx.email, date: ctx.date, time: ctx.time }, estimateNo);
  return json({ success: true, id }, 200, headers);
}
__name(createReservationLegacy, "createReservationLegacy");
async function getQuoteRowForConsume(db, estimateNo) {
  const row = await db.prepare(`SELECT * FROM quotes WHERE estimate_no=? LIMIT 1`).bind(estimateNo).first();
  if (!row) return { ok: false, status: 404, message: "\u898B\u7A4D\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" };
  const status = String(row.status || "");
  if (status === "consumed") return { ok: false, status: 410, message: "\u898B\u7A4D\u306F\u4F7F\u7528\u6E08\u307F\u3067\u3059" };
  if (status === "expired" || status === "canceled") return { ok: false, status: 409, message: "\u898B\u7A4D\u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093" };
  if (status !== "active") return { ok: false, status: 409, message: "\u898B\u7A4D\u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093" };
  const expiresAt = String(row.expires_at || "").trim();
  if (expiresAt) {
    const expMs = Date.parse(expiresAt);
    if (!Number.isNaN(expMs) && expMs < Date.now()) return { ok: false, status: 410, message: "\u898B\u7A4D\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u3066\u3044\u307E\u3059" };
  }
  return { ok: true, row };
}
__name(getQuoteRowForConsume, "getQuoteRowForConsume");
async function createReservationFixedFare(env, headers, body, ctx, estimateNo) {
  if (!isValidEstimateNo(estimateNo)) return json({ success: false, message: "\u898B\u7A4D\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059" }, 400, headers);
  const quoteResult = await getQuoteRowForConsume(env.DB, estimateNo);
  if (!quoteResult.ok) return json({ success: false, message: quoteResult.message }, quoteResult.status, headers);
  const quoteRow = quoteResult.row, serverTotal = Number(quoteRow.total_amount) || 0, serverSnapshot = parseStoredQuoteJson(quoteRow.quote_snapshot);
  if (!serverSnapshot || serverTotal <= 0) return json({ success: false, message: "\u898B\u7A4D\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059" }, 409, headers);
  const id = await nextReservationId(env.DB, ctx.date, ctx.time), snapshotHash = String(quoteRow.snapshot_hash || ""), consentResult = await buildFixedFareEstimateConsent(body, estimateNo, id, ctx.request, serverTotal, serverSnapshot, snapshotHash);
  if (!consentResult.ok) return json({ success: false, message: consentResult.message }, consentResult.status, headers);
  const createdAt = (/* @__PURE__ */ new Date()).toISOString(), quoteSnapshotText = String(quoteRow.quote_snapshot || ""), routePlanText = String(quoteRow.route_plan || ""), usageSummaryText = String(quoteRow.usage_summary || ""), estimateText = formatConfirmedFareYen(serverTotal), quoteExtras = reservationQuoteBindExtras(serverSnapshot, snapshotHash, consentResult.record), emailBody = { ...body, email: ctx.email, date: ctx.date, time: ctx.time, estimate: estimateText, quoteSnapshot: serverSnapshot, routePlan: parseStoredQuoteJson(quoteRow.route_plan), usageSummary: parseStoredQuoteJson(quoteRow.usage_summary), usage_summary: parseStoredQuoteJson(quoteRow.usage_summary), confirmedFare: serverTotal, fixedFareConfirmed: true }, stmts = [env.DB.prepare(`UPDATE quotes SET status='consumed', consumed_at=?, reservation_id=? WHERE estimate_no=? AND status='active'`).bind(createdAt, id, estimateNo), env.DB.prepare(reservationInsertSql()).bind(id, String(body.usageType || ""), String(body.name || ""), String(body.kana || body.name || ""), String(body.phone || ""), ctx.email, ctx.date, ctx.time, String(body.pickup || ""), String(body.destination || ""), String(body.vehicle || ""), String(body.transfer || ""), String(body.assist || ""), String(body.stairs || ""), String(body.equipment || ""), String(body.roundTrip || ""), String(body.notes || ""), estimateText, 0, 0, ctx.blockCount, "active", 1, createdAt, estimateNo, quoteSnapshotText, routePlanText, usageSummaryText, String(quoteRow.handoff_source || body.handoffSource || body.handoff_source || "lp-site-estimate").trim(), Number(quoteRow.dto_version || body.dtoVersion || body.dto_version || 1) || 1, String(quoteRow.franchisee_id || body.franchiseeId || body.franchisee_id || "").trim(), String(quoteRow.store_id || body.storeId || body.store_id || "").trim(), consentResult.value, String(quoteRow.fare_type || "fixed"), serverTotal, snapshotHash, createdAt, ...quoteExtras)];
  for (const slot of ctx.slots) {
    stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO blocks (date,time,type,reservation_id,created_at) VALUES (?,?,?,?,?)`).bind(slot.date, slot.time, "auto", id, createdAt));
  }
  const results = await env.DB.batch(stmts);
  if (!Number(results?.[0]?.meta?.changes || 0)) return json({ success: false, message: "\u898B\u7A4D\u306F\u4F7F\u7528\u6E08\u307F\u3067\u3059" }, 409, headers);
  if (consentResult.record?.consentText) await insertQuoteConsent(env.DB, { estimateNo, reservationId: id, consentAt: consentResult.record.consentAt, consentText: consentResult.record.consentText, consentTextVersion: consentResult.record.consentTextVersion, snapshotHash: consentResult.record.snapshotHash || snapshotHash, userAgent: consentResult.record.userAgent, ipHash: consentResult.record.ipHash });
  await notify(env.DB, emailBody, id);
  await sendReservationEmails(env, env.DB, id, emailBody, estimateNo);
  return json({ success: true, id, confirmedFare: serverTotal }, 200, headers);
}
__name(createReservationFixedFare, "createReservationFixedFare");
async function handleCreateReservation(request, env, headers) {
  const body = await safeJson(request), basics = await validateCreateReservationBasics(body);
  if (!basics.ok) return json({ success: false, message: basics.message }, basics.status, headers);
  const estimateNo = String(body.estimateNo || body.estimate_no || "").trim(), fixedFare = await isFixedFareEnabled(env.DB);
  if (fixedFare && estimateNo) {
    if (!isValidEstimateNo(estimateNo)) return json({ success: false, message: "\u898B\u7A4D\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059" }, 400, headers);
    const quoteProbe = await getQuoteRowForConsume(env.DB, estimateNo);
    if (!quoteProbe.ok) return json({ success: false, message: quoteProbe.message }, quoteProbe.status, headers);
  }
  const slotCheck = await assertSlotsAvailable(env.DB, basics.slots);
  if (!slotCheck.ok) return json({ success: false, message: slotCheck.message }, slotCheck.status, headers);
  const ctx = { request, email: basics.email, date: basics.date, time: basics.time, blockCount: basics.blockCount, slots: basics.slots };
  if (fixedFare && estimateNo) return createReservationFixedFare(env, headers, body, ctx, estimateNo);
  return createReservationLegacy(env, headers, body, ctx);
}
__name(handleCreateReservation, "handleCreateReservation");
async function notify(db, body, id) {
  const url = await getSetting(db, "notify_webhook_url", "");
  if (!url) {
    await logEmail(db, { kind: "webhook", reservation_id: id, subject: "reservation_created", status: "skipped", error_message: "webhook_url_empty" });
    return;
  }
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "reservation_created", id, body }) });
    if (!res.ok) {
      await logEmail(db, { kind: "webhook", reservation_id: id, to_email: url, subject: "reservation_created", status: "failed", error_message: `HTTP ${res.status}` });
      return;
    }
    await logEmail(db, { kind: "webhook", reservation_id: id, to_email: url, subject: "reservation_created", status: "sent" });
  } catch (e) {
    await logEmail(db, { kind: "webhook", reservation_id: id, to_email: url, subject: "reservation_created", status: "failed", error_message: String(e?.message || e).slice(0, 500) });
  }
}
__name(notify, "notify");
var DEFAULT_EMAIL_FROM = "\u4ECB\u8B77\u30BF\u30AF\u30B7\u30FC\u4E88\u7D04 <info@chibacaretaxi.com>";
var CONFIRMATION_EMAIL_SUBJECT = "\u3010\u4ECB\u8B77\u30BF\u30AF\u30B7\u30FC\u3011\u3054\u4E88\u7D04\u5185\u5BB9\u306E\u78BA\u8A8D";
var ADMIN_NOTIFICATION_SUBJECT = "\u3010\u4ECB\u8B77\u30BF\u30AF\u30B7\u30FC\u3011\u65B0\u898F\u4E88\u7D04\u901A\u77E5";
var EMAIL_PRICE_NOTICE = "\u3054\u4E88\u7D04\u5185\u5BB9\u3092\u3082\u3068\u306B\u7B97\u51FA\u3057\u305F\u6599\u91D1\u3067\u3059\u3002\u5F53\u65E5\u306E\u8FFD\u52A0\u4ECB\u52A9\u3001\u5F85\u6A5F\u6642\u9593\u3001\u4ED8\u304D\u6DFB\u3044\u5BFE\u5FDC\u7B49\u304C\u767A\u751F\u3057\u305F\u5834\u5408\u306F\u5225\u9014\u6599\u91D1\u304C\u52A0\u7B97\u3055\u308C\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059\u3002\u6599\u91D1\u5909\u66F4\u304C\u5FC5\u8981\u306A\u5834\u5408\u306F\u4E8B\u524D\u306B\u3054\u8AAC\u660E\u3044\u305F\u3057\u307E\u3059\u3002";
var EMAIL_PRICE_NOTICE_FIXED = "\u672C\u30E1\u30FC\u30EB\u8A18\u8F09\u306E\u904B\u8CC3\u306F\u4E88\u7D04\u6642\u306B\u78BA\u5B9A\u3057\u305F\u904B\u8CC3\u3067\u3059\u3002\n\n\u304A\u5BA2\u69D8\u90FD\u5408\u306B\u3088\u308B\u884C\u5148\u5909\u66F4\u30FB\u5F85\u6A5F\u8FFD\u52A0\u30FB\u4ECB\u52A9\u8FFD\u52A0\u7B49\u304C\u767A\u751F\u3057\u305F\u5834\u5408\u3092\u9664\u304D\u3001\n\u4E88\u7D04\u6642\u306E\u904B\u8CC3\u304C\u9069\u7528\u3055\u308C\u307E\u3059\u3002";
var CONTACT_PHONE_DISPLAY = "090-6331-4289";
var CONTACT_HOMEPAGE_URL = "https://chibacaretaxi.com";
var ESTIMATE_USAGE_EMAIL_LABELS = ["\u79FB\u52D5\u65B9\u6CD5", "\u4ECB\u52A9\u5185\u5BB9", "\u968E\u6BB5\u4ECB\u52A9", "\u9001\u8FCE\u65B9\u6CD5", "\u5F85\u6A5F\u30FB\u4ED8\u304D\u6DFB\u3044"];
function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}
__name(validEmail, "validEmail");
function extractEmailAddress(from) {
  const s = String(from || "").trim();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}
__name(extractEmailAddress, "extractEmailAddress");
function isValidEmailFrom(from) {
  return validEmail(extractEmailAddress(from));
}
__name(isValidEmailFrom, "isValidEmailFrom");
function normalizeEmailFrom(from) {
  const s = String(from || "").trim();
  if (!s) return DEFAULT_EMAIL_FROM;
  if (s.includes("<") && s.includes(">")) return s;
  if (validEmail(s)) return `\u4ECB\u8B77\u30BF\u30AF\u30B7\u30FC\u4E88\u7D04 <${s}>`;
  return DEFAULT_EMAIL_FROM;
}
__name(normalizeEmailFrom, "normalizeEmailFrom");
async function logEmail(db, row) {
  await db.prepare(`INSERT INTO email_logs (created_at,kind,reservation_id,to_email,from_email,subject,status,provider_id,error_message) VALUES (?,?,?,?,?,?,?,?,?)`).bind(row.created_at || (/* @__PURE__ */ new Date()).toISOString(), String(row.kind || ""), String(row.reservation_id || ""), String(row.to_email || ""), String(row.from_email || ""), String(row.subject || ""), String(row.status || ""), String(row.provider_id || ""), String(row.error_message || "").slice(0, 500)).run();
}
__name(logEmail, "logEmail");
async function sendResendEmail(env, db, opts) {
  const to = String(opts.to || "").trim(), from = normalizeEmailFrom(opts.from || await getSetting(db, "email_from", DEFAULT_EMAIL_FROM)), subject = String(opts.subject || ""), text = String(opts.text || ""), kind = String(opts.kind || "customer"), reservationId = String(opts.reservationId || opts.reservation_id || ""), logBase = { kind, reservation_id: reservationId, to_email: to, from_email: from, subject };
  if (!to || !validEmail(to)) {
    await logEmail(db, { ...logBase, status: "skipped", error_message: "invalid_to" });
    return { ok: false, skipped: true, error_message: "\u5B9B\u5148\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u304C\u4E0D\u6B63\u3067\u3059" };
  }
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    await logEmail(db, { ...logBase, status: "skipped", error_message: "RESEND_API_KEY_missing" });
    return { ok: false, skipped: true, error_message: "RESEND_API_KEY \u304C\u672A\u8A2D\u5B9A\u3067\u3059" };
  }
  if (!isValidEmailFrom(from)) {
    await logEmail(db, { ...logBase, status: "skipped", error_message: "invalid_from" });
    return { ok: false, skipped: true, error_message: "\u9001\u4FE1\u5143\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u304C\u4E0D\u6B63\u3067\u3059" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, text }) });
    const raw = await res.text();
    if (!res.ok) {
      await logEmail(db, { ...logBase, status: "failed", error_message: raw.slice(0, 500) });
      return { ok: false, error_message: raw.slice(0, 200) };
    }
    let providerId = "";
    try {
      providerId = JSON.parse(raw)?.id || "";
    } catch {
    }
    await logEmail(db, { ...logBase, status: "sent", provider_id: providerId });
    return { ok: true, provider_id: providerId };
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 500);
    await logEmail(db, { ...logBase, status: "failed", error_message: msg });
    return { ok: false, error_message: msg };
  }
}
__name(sendResendEmail, "sendResendEmail");
function buildUsageContent(body) {
  const parts = [];
  for (const [label, key] of [["\u79FB\u52D5\u65B9\u6CD5", "vehicle"], ["\u4ECB\u52A9", "assist"], ["\u968E\u6BB5\u4ECB\u52A9", "stairs"], ["\u6A5F\u6750\u30EC\u30F3\u30BF\u30EB", "equipment"], ["\u5F80\u5FA9\u9001\u8FCE", "roundTrip"]]) {
    const s = String(body[key] || "").trim();
    if (s) parts.push(`${label}: ${s}`);
  }
  return parts.length ? parts.join("\n") : "\uFF08\u672A\u8A2D\u5B9A\uFF09";
}
__name(buildUsageContent, "buildUsageContent");
function parseUsageSummary(body) {
  const raw = body?.usageSummary ?? body?.usage_summary;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
__name(parseUsageSummary, "parseUsageSummary");
function isEstimateLinkedReservation(body, estimateNo) {
  if (String(estimateNo || "").trim()) return true;
  if (String(body?.handoffSource || body?.handoff_source || "").trim()) return true;
  return parseUsageSummary(body).length > 0;
}
__name(isEstimateLinkedReservation, "isEstimateLinkedReservation");
function buildEstimateUsageContent(body) {
  const labelSet = new Set(ESTIMATE_USAGE_EMAIL_LABELS), parts = [];
  for (const row of parseUsageSummary(body)) {
    const label = String(row?.label || "").trim(), value = String(row?.value || "").trim();
    if (!label || !value || !labelSet.has(label)) continue;
    parts.push(`${label}: ${value}`);
  }
  const equipment = String(body?.equipment || "").trim();
  if (equipment) parts.push(`\u6A5F\u6750\u30EC\u30F3\u30BF\u30EB: ${equipment}`);
  return parts.length ? parts.join("\n") : buildUsageContent(body);
}
__name(buildEstimateUsageContent, "buildEstimateUsageContent");
function buildCustomerUsageContent(body, estimateNo) {
  return isEstimateLinkedReservation(body, estimateNo) ? buildEstimateUsageContent(body) : buildUsageContent(body);
}
__name(buildCustomerUsageContent, "buildCustomerUsageContent");
function formatYen(amount) {
  return `${Number(amount || 0).toLocaleString("ja-JP")}\u5186`;
}
__name(formatYen, "formatYen");
function getPrimaryRoute(routePlan) {
  if (!routePlan) return null;
  if (Array.isArray(routePlan.routes) && routePlan.routes.length) {
    const selectedId = String(routePlan.selectedRouteId || "");
    const selected = routePlan.routes.find((route) => String(route?.routeId || route?.id || "") === selectedId);
    return selected || routePlan.routes[0];
  }
  return { distanceMeters: Number(routePlan.distanceMeters) || 0, durationSeconds: Number(routePlan.durationSeconds) || 0 };
}
__name(getPrimaryRoute, "getPrimaryRoute");
function formatDistanceKm(snapshot, routePlan) {
  const meters = Number(snapshot?.distanceMeters) || 0;
  if (meters > 0) return `${(meters / 1e3).toFixed(1)}km`;
  const km = Number(snapshot?.distanceKm) || 0;
  if (km > 0) return `${km.toFixed(1)}km`;
  const primary = getPrimaryRoute(routePlan);
  if (primary && Number(primary.distanceMeters) > 0) return `${(Number(primary.distanceMeters) / 1e3).toFixed(1)}km`;
  return "-";
}
__name(formatDistanceKm, "formatDistanceKm");
function formatDurationMinutes(snapshot, routePlan) {
  const seconds = Number(snapshot?.durationSeconds) || 0;
  if (seconds > 0) return `${Math.max(1, Math.round(seconds / 60))}\u5206`;
  const primary = getPrimaryRoute(routePlan);
  if (primary && Number(primary.durationSeconds) > 0) return `${Math.max(1, Math.round(Number(primary.durationSeconds) / 60))}\u5206`;
  return "-";
}
__name(formatDurationMinutes, "formatDurationMinutes");
function getRouteProviderLabel(provider) {
  if (provider === "google_routes") return "Google Maps Platform Routes API";
  if (provider === "manual_distance") return "\u8DDD\u96E2\u624B\u5165\u529B";
  return String(provider || "-");
}
__name(getRouteProviderLabel, "getRouteProviderLabel");
function getBreakdownAmount(rows, key) {
  const row = (Array.isArray(rows) ? rows : []).find((item) => item?.key === key);
  return Number(row?.amount) || 0;
}
__name(getBreakdownAmount, "getBreakdownAmount");
function getServiceFeeAmount(serviceFees, keys) {
  const keySet = new Set(keys);
  return (Array.isArray(serviceFees) ? serviceFees : []).reduce((sum, row) => keySet.has(row?.key) ? sum + (Number(row.amount) || 0) : sum, 0);
}
__name(getServiceFeeAmount, "getServiceFeeAmount");
function fareModeEmailLabel(mode) {
  const key = String(mode || "").trim();
  return { distance: "\u8DDD\u96E2\u5B9A\u984D", time: "\u6642\u9593\u5B9A\u984D", distance_time: "\u8DDD\u96E2\u6642\u9593\u4F75\u7528" }[key] || key || "-";
}
__name(fareModeEmailLabel, "fareModeEmailLabel");
function buildFareCalculationLines(options = {}) {
  const snapshot = options.quoteSnapshot || {}, breakdown = options.breakdown || {}, total = Number(options.total) || Number(snapshot.fixedFareTotal) || 0, routePlan = options.routePlan || null, fixed = !!options.fixedFareConfirmed, totalLabel = String(options.totalLabel || (fixed ? "\u78BA\u5B9A\u904B\u8CC3" : "\u6982\u7B97\u6599\u91D1")), totalSuffix = fixed ? "" : "\uFF5E";
  const pickupFee = getBreakdownAmount(snapshot.fixedFareBreakdown, "pickupFee") || Number(breakdown.pickupFee) || 0, distanceFare = getBreakdownAmount(snapshot.fixedFareBreakdown, "distanceFare") || Number(breakdown.distanceFare) || 0, timeAdjustment = getBreakdownAmount(snapshot.fixedFareBreakdown, "timeAdjustment") || 0, assistanceFee = getServiceFeeAmount(snapshot.serviceFees, ["assistanceFee"]) || Number(breakdown.assistanceFee) || 0, stairFee = getServiceFeeAmount(snapshot.serviceFees, ["stairFee"]) || Number(breakdown.stairFee) || 0, waitingEscortFee = getServiceFeeAmount(snapshot.serviceFees, ["waitingFee", "escortFee"]) || (Number(breakdown.waitingFee) || 0) + (Number(breakdown.escortFee) || 0), routeLabel = String(options.routeLabel || "\u30EB\u30FC\u30C8\u7B97\u51FA");
  return [{ label: "\u4E88\u5B9A\u8DDD\u96E2", value: formatDistanceKm(snapshot, routePlan) }, { label: "\u4E88\u5B9A\u6642\u9593", value: formatDurationMinutes(snapshot, routePlan) }, { label: routeLabel, value: getRouteProviderLabel(snapshot.routeProvider) }, { label: "\u8FCE\u8ECA\u6599\u91D1", value: formatYen(pickupFee) }, { label: "\u8DDD\u96E2\u904B\u8CC3", value: formatYen(distanceFare) }, { label: "\u6642\u9593\u52A0\u7B97", value: formatYen(timeAdjustment) }, { label: "\u4ECB\u52A9\u6599\u91D1", value: formatYen(assistanceFee + stairFee) }, { label: "\u5F85\u6A5F\u30FB\u4ED8\u304D\u6DFB\u3044\u6599\u91D1", value: formatYen(waitingEscortFee) }, { label: totalLabel, value: `${formatYen(total)}${totalSuffix}` }];
}
__name(buildFareCalculationLines, "buildFareCalculationLines");
function buildFareCalculationEmailText(options = {}) {
  if (!options.quoteSnapshot) return "";
  const lines = buildFareCalculationLines(options);
  const body = lines.map((line) => `${line.label}\uFF1A${line.value}`);
  if (options.fixedFareConfirmed) {
    return ["\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u25A0 \u6599\u91D1\u8A08\u7B97\u60C5\u5831", "", body.join("\n"), "", "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u672C\u904B\u8CC3\u306F\u4E88\u7D04\u6642\u306B\u78BA\u5B9A\u3057\u305F\u904B\u8CC3\u3067\u3059\u3002"].join("\n");
  }
  return ["\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u25A0 \u6599\u91D1\u8A08\u7B97\u60C5\u5831", "", body.join("\n"), "", "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u203B\u8868\u793A\u306F\u4E88\u7D04\u6642\u70B9\u306E\u6599\u91D1\u76EE\u5B89\u3067\u3059\u3002", "\u5B9F\u969B\u306E\u6599\u91D1\u306F\u4ECB\u52A9\u5185\u5BB9\u30FB\u5F85\u6A5F\u6642\u9593\u30FB\u4EA4\u901A\u72B6\u6CC1\u7B49\u306B\u3088\u308A\u5909\u52D5\u3059\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059\u3002"].join("\n");
}
__name(buildFareCalculationEmailText, "buildFareCalculationEmailText");
function parseRoutePlanFromBody(body) {
  const raw = body?.routePlan ?? body?.route_plan;
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}
__name(parseRoutePlanFromBody, "parseRoutePlanFromBody");
function sumServiceFeesForTotal(serviceFees) {
  return (Array.isArray(serviceFees) ? serviceFees : []).reduce((sum, row) => row?.key === "specialVehicleFee" ? sum : sum + (Number(row?.amount) || 0), 0);
}
__name(sumServiceFeesForTotal, "sumServiceFeesForTotal");
function parseEstimateTotalFromBody(body) {
  const text = String(body?.estimate || "").replace(/[^\d]/g, "");
  const parsed = Number(text);
  if (parsed > 0) return parsed;
  const snapshot = parseQuoteSnapshotFromBody(body);
  const fixedTotal = Number(snapshot?.fixedFareTotal) || 0;
  return fixedTotal + sumServiceFeesForTotal(snapshot?.serviceFees);
}
__name(parseEstimateTotalFromBody, "parseEstimateTotalFromBody");
function buildEstimateFareCalculationEmailSection(body, estimateNo) {
  if (!estimateNo) return "";
  const snapshot = parseQuoteSnapshotFromBody(body);
  if (!snapshot) return "";
  const routePlan = parseRoutePlanFromBody(body), fixed = !!body?.fixedFareConfirmed;
  return buildFareCalculationEmailText({ quoteSnapshot: snapshot, routePlan, total: fixed ? Number(body.confirmedFare) || parseEstimateTotalFromBody(body) : parseEstimateTotalFromBody(body), fixedFareConfirmed: fixed });
}
__name(buildEstimateFareCalculationEmailSection, "buildEstimateFareCalculationEmailSection");
function buildAdminFareCalculationEmailSection(body, estimateNo) {
  if (!body?.fixedFareConfirmed || !estimateNo) return "";
  const snapshot = parseQuoteSnapshotFromBody(body);
  if (!snapshot) return "";
  const routePlan = parseRoutePlanFromBody(body), total = Number(body.confirmedFare) || parseEstimateTotalFromBody(body), calcLines = buildFareCalculationLines({ quoteSnapshot: snapshot, routePlan, total, fixedFareConfirmed: true }), rows = [`\u904B\u8CC3\u65B9\u5F0F\uFF1A${fareModeEmailLabel(snapshot.fareMode)}`, `\u898B\u7A4D\u756A\u53F7\uFF1A${estimateNo}`, ...calcLines.map((line) => `${line.label}\uFF1A${line.value}`)];
  return ["\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u25A0 \u6599\u91D1\u8A08\u7B97\u60C5\u5831", "", rows.join("\n"), "", "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u672C\u904B\u8CC3\u306F\u4E88\u7D04\u6642\u306B\u78BA\u5B9A\u3057\u305F\u904B\u8CC3\u3067\u3059\u3002"].join("\n");
}
__name(buildAdminFareCalculationEmailSection, "buildAdminFareCalculationEmailSection");
function buildConfirmationContactFooter(lineUrl) {
  const parts = ["\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u3053\u306E\u30E1\u30FC\u30EB\u306F\u9001\u4FE1\u5C02\u7528\u3067\u3059\u3002", "\u3054\u4E88\u7D04\u306E\u5909\u66F4\u30FB\u30AD\u30E3\u30F3\u30BB\u30EB\u30FB\u305D\u306E\u4ED6\u304A\u554F\u3044\u5408\u308F\u305B\u306F\u3001\u4E0B\u8A18\u3088\u308A\u3054\u9023\u7D61\u304F\u3060\u3055\u3044\u3002", "", "\u25A0 \u304A\u96FB\u8A71", CONTACT_PHONE_DISPLAY];
  const url = String(lineUrl || "").trim();
  if (url) parts.push("", "\u25A0 \u516C\u5F0FLINE", url);
  parts.push("", "\u25A0 \u30DB\u30FC\u30E0\u30DA\u30FC\u30B8", CONTACT_HOMEPAGE_URL, "", "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u3061\u3070\u30B1\u30A2\u30BF\u30AF\u30B7\u30FC", "\u79FB\u52D5\u306E\u4E0D\u5B89\u3092\u5B89\u5FC3\u306B\u5909\u3048\u308B");
  return parts.join("\n");
}
__name(buildConfirmationContactFooter, "buildConfirmationContactFooter");
function buildConfirmationEmailText(id, body, estimateNo, lineUrl) {
  const dest = String(body.destination || "").trim() || "\uFF08\u672A\u5165\u529B\uFF09", fixed = !!body?.fixedFareConfirmed, fareLabel = fixed ? "\u78BA\u5B9A\u904B\u8CC3" : "\u6982\u7B97\u6599\u91D1";
  const lines = [`${String(body.name || "").trim()} \u69D8`, "", "\u3053\u306E\u5EA6\u306F\u3054\u4E88\u7D04\u3044\u305F\u3060\u304D\u3001\u8AA0\u306B\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\u3002", "\u4EE5\u4E0B\u306E\u5185\u5BB9\u3067\u627F\u308A\u307E\u3057\u305F\u3002\u3054\u4E88\u7D04\u5185\u5BB9\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002", "", "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "\u25A0 \u4E88\u7D04\u756A\u53F7", String(id), "", "\u25A0 \u5229\u7528\u65E5\u6642", `${body.date} ${body.time}`, "", "\u25A0 \u304A\u540D\u524D", String(body.name || ""), "", "\u25A0 \u96FB\u8A71\u756A\u53F7", String(body.phone || ""), "", "\u25A0 \u51FA\u767A\u5730", String(body.pickup || ""), "", "\u25A0 \u76EE\u7684\u5730", dest, "", "\u25A0 \u5229\u7528\u5185\u5BB9", buildCustomerUsageContent(body, estimateNo), "", `\u25A0 ${fareLabel}`, String(body.estimate || "")];
  if (estimateNo) {
    lines.push("", "\u25A0 \u898B\u7A4D\u756A\u53F7", estimateNo);
  }
  const fareCalcSection = buildEstimateFareCalculationEmailSection(body, estimateNo);
  if (fareCalcSection) {
    lines.push("", fareCalcSection);
  }
  if (fixed) {
    lines.push("", "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u3010\u4E8B\u524D\u78BA\u5B9A\u904B\u8CC3\u306B\u3064\u3044\u3066\u3011", EMAIL_PRICE_NOTICE_FIXED, "", buildConfirmationContactFooter(lineUrl));
  } else {
    lines.push("", "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", "", "\u3010\u6599\u91D1\u306B\u3064\u3044\u3066\u3011", EMAIL_PRICE_NOTICE, "", buildConfirmationContactFooter(lineUrl));
  }
  return lines.join("\n");
}
__name(buildConfirmationEmailText, "buildConfirmationEmailText");
function buildAdminNotificationText(id, body, estimateNo) {
  const dest = String(body.destination || "").trim() || "\uFF08\u672A\u5165\u529B\uFF09", fixed = !!body?.fixedFareConfirmed, fareLabel = fixed ? "\u78BA\u5B9A\u904B\u8CC3" : "\u6982\u7B97\u6599\u91D1";
  const lines = ["\u65B0\u898F\u4E88\u7D04\u3092\u53D7\u3051\u4ED8\u3051\u307E\u3057\u305F\u3002", "", "\u25A0 \u4E88\u7D04\u756A\u53F7", String(id), "", "\u25A0 \u5229\u7528\u65E5\u6642", `${body.date} ${body.time}`, "", "\u25A0 \u304A\u540D\u524D", String(body.name || ""), "", "\u25A0 \u96FB\u8A71\u756A\u53F7", String(body.phone || ""), "", "\u25A0 \u30E1\u30FC\u30EB", String(body.email || "\uFF08\u672A\u5165\u529B\uFF09"), "", "\u25A0 \u51FA\u767A\u5730", String(body.pickup || ""), "", "\u25A0 \u76EE\u7684\u5730", dest, "", "\u25A0 \u5229\u7528\u5185\u5BB9", buildUsageContent(body), "", `\u25A0 ${fareLabel}`, String(body.estimate || "")];
  if (estimateNo) {
    lines.push("", "\u25A0 \u898B\u7A4D\u756A\u53F7", estimateNo);
  }
  const adminFareCalcSection = buildAdminFareCalculationEmailSection(body, estimateNo);
  if (adminFareCalcSection) {
    lines.push("", adminFareCalcSection);
  }
  if (String(body.notes || "").trim()) {
    lines.push("", "\u25A0 \u5099\u8003", String(body.notes || ""));
  }
  return lines.join("\n");
}
__name(buildAdminNotificationText, "buildAdminNotificationText");
async function sendReservationEmails(env, db, id, body, estimateNo) {
  const from = await getSetting(db, "email_from", DEFAULT_EMAIL_FROM), lineUrl = await getSetting(db, "line_url", "");
  const customerTo = String(body.email || "").trim();
  if (customerTo) {
    await sendResendEmail(env, db, { kind: "customer", reservationId: id, to: customerTo, from, subject: CONFIRMATION_EMAIL_SUBJECT, text: buildConfirmationEmailText(id, body, estimateNo, lineUrl) });
  } else {
    await logEmail(db, { kind: "customer", reservation_id: id, subject: CONFIRMATION_EMAIL_SUBJECT, status: "skipped", error_message: "customer_email_empty" });
  }
  const adminTo = String(await getSetting(db, "email_admin_to", "")).trim();
  if (adminTo) {
    await sendResendEmail(env, db, { kind: "admin", reservationId: id, to: adminTo, from, subject: ADMIN_NOTIFICATION_SUBJECT, text: buildAdminNotificationText(id, body, estimateNo) });
  }
}
__name(sendReservationEmails, "sendReservationEmails");
var QUOTE_JSON_MAX_LEN = 5e4;
var DEFAULT_LP_REGISTER_ORIGINS = ["https://infochibafukushi-dotcom.github.io"];
async function getLpRegisterAllowedOrigins(db) {
  const raw = await getSetting(db, "allowed_origins", "");
  const list = String(raw || "").split(",").map((v) => v.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_LP_REGISTER_ORIGINS;
}
__name(getLpRegisterAllowedOrigins, "getLpRegisterAllowedOrigins");
async function isLpRegisterAuthorized(request, env, db) {
  const expected = String(env.LP_REGISTER_TOKEN || "").trim(), token = bearerToken(request);
  if (expected && token && token === expected) return true;
  const origin = String(request.headers.get("Origin") || "").trim();
  if (!origin) return false;
  const allowed = await getLpRegisterAllowedOrigins(db);
  return allowed.includes(origin);
}
__name(isLpRegisterAuthorized, "isLpRegisterAuthorized");
function isValidEstimateNo(no) {
  return /^EST-/.test(String(no || "").trim());
}
__name(isValidEstimateNo, "isValidEstimateNo");
function parseQuoteEstimateNoFromPath(pathname) {
  const prefix = "/api/quotes/";
  if (!String(pathname || "").startsWith(prefix)) return "";
  const raw = decodeURIComponent(pathname.slice(prefix.length)).trim();
  if (!raw || raw.includes("/")) return "";
  return isValidEstimateNo(raw) ? raw : "";
}
__name(parseQuoteEstimateNoFromPath, "parseQuoteEstimateNoFromPath");
function parseAdminQuoteEstimateNoFromPath(pathname) {
  const prefix = "/api/admin/quotes/";
  if (!String(pathname || "").startsWith(prefix)) return "";
  const raw = decodeURIComponent(pathname.slice(prefix.length)).trim();
  if (!raw || raw.includes("/")) return "";
  return isValidEstimateNo(raw) ? raw : "";
}
__name(parseAdminQuoteEstimateNoFromPath, "parseAdminQuoteEstimateNoFromPath");
function canonicalizeForHash(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalizeForHash);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonicalizeForHash(value[key]);
  return out;
}
__name(canonicalizeForHash, "canonicalizeForHash");
var DEFAULT_CONSENT_TEXT_VERSION = "2026-06-01-v1";
var DEFAULT_QUOTE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
function extractQuoteSnapshotMeta(snapshot) {
  const s = snapshot && typeof snapshot === "object" ? snapshot : {};
  const overall = s.overallRouteSelection && typeof s.overallRouteSelection === "object" ? s.overallRouteSelection : {};
  const useToll = s.selectedUsesToll === true || String(s.roadType || "") === "toll" || String(s.usesToll || "") === "true";
  const distanceMeters = Number(s.distanceMeters || s.totalDistanceMeters) || 0;
  const durationSeconds = Number(s.durationSeconds || s.totalDurationSeconds) || 0;
  const fixedFareTotal = Number(s.fixedFareTotal) || 0;
  return { selectedRouteId: String(s.selectedRouteId || overall.fixedOutboundRouteId || "").trim() || null, selectedOverallRouteId: String(s.selectedOverallRouteId || overall.selectedOverallRouteId || "").trim() || null, preFixedFareConfirmable: s.preFixedFareConfirmable === true ? 1 : 0, fallbackReason: String(s.fallbackReason || overall.fallbackReason || "").trim() || null, useToll: useToll ? 1 : 0, distanceMeters: distanceMeters > 0 ? distanceMeters : null, durationSeconds: durationSeconds > 0 ? durationSeconds : null, fixedFareTotal: fixedFareTotal > 0 ? fixedFareTotal : null };
}
__name(extractQuoteSnapshotMeta, "extractQuoteSnapshotMeta");
async function hashClientIp(request) {
  const ip = String(request?.headers?.get?.("CF-Connecting-IP") || request?.headers?.get?.("X-Forwarded-For") || "").split(",")[0].trim();
  if (!ip) return null;
  return sha256(`ip:${ip}`);
}
__name(hashClientIp, "hashClientIp");
async function insertQuoteConsent(db, row) {
  if (!row?.estimateNo || !row?.reservationId || !row?.consentAt || !row?.consentText || !row?.snapshotHash) return;
  await db.prepare(`INSERT INTO quote_consents (estimate_no,reservation_id,consent_at,consent_text,consent_text_version,snapshot_hash,user_agent,ip_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(row.estimateNo, row.reservationId, row.consentAt, row.consentText, String(row.consentTextVersion || DEFAULT_CONSENT_TEXT_VERSION), row.snapshotHash, row.userAgent || null, row.ipHash || null, (/* @__PURE__ */ new Date()).toISOString()).run();
}
__name(insertQuoteConsent, "insertQuoteConsent");
async function hashSnapshot(snapshot) {
  return sha256(JSON.stringify(canonicalizeForHash(snapshot)));
}
__name(hashSnapshot, "hashSnapshot");
function calculateTotalFromSnapshot(snapshot) {
  const fixedTotal = Number(snapshot?.fixedFareTotal) || 0;
  const derived = fixedTotal + sumServiceFeesForTotal(snapshot?.serviceFees);
  const explicit = Number(snapshot?.total) || 0;
  if (derived > 0) return derived;
  if (explicit > 0) return explicit;
  return 0;
}
__name(calculateTotalFromSnapshot, "calculateTotalFromSnapshot");
function serializeQuoteJsonValue(v, maxLen = 0) {
  if (v == null || v === "") return "";
  let s = "";
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return null;
  }
  if (maxLen > 0 && s.length > maxLen) return null;
  return s;
}
__name(serializeQuoteJsonValue, "serializeQuoteJsonValue");
function parseQuoteJsonField(body, key) {
  const altKey = key === "routePlan" ? "route_plan" : key === "usageSummary" ? "usage_summary" : key === "quoteSnapshot" ? "quote_snapshot" : key;
  const raw = body?.[key] ?? body?.[altKey];
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}
__name(parseQuoteJsonField, "parseQuoteJsonField");
function validateRegisterPayload(body) {
  const estimateNo = String(body?.estimateNo || body?.estimate_number || "").trim();
  if (!isValidEstimateNo(estimateNo)) return { ok: false, status: 400, message: "\u898B\u7A4D\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059" };
  const total = Number(body?.total);
  if (!Number.isFinite(total) || total <= 0 || Math.floor(total) !== total) return { ok: false, status: 400, message: "\u5408\u8A08\u91D1\u984D\u304C\u4E0D\u6B63\u3067\u3059" };
  const snapshot = parseQuoteJsonField(body, "quoteSnapshot");
  if (!snapshot || typeof snapshot !== "object") return { ok: false, status: 400, message: "quoteSnapshot \u304C\u4E0D\u6B63\u3067\u3059" };
  const snapshotText = serializeQuoteJsonValue(snapshot, QUOTE_JSON_MAX_LEN);
  if (!snapshotText) return { ok: false, status: 400, message: "quoteSnapshot \u306E\u30B5\u30A4\u30BA\u304C\u4E0A\u9650\u3092\u8D85\u3048\u3066\u3044\u307E\u3059" };
  const derivedTotal = calculateTotalFromSnapshot(snapshot);
  if (derivedTotal > 0 && Math.abs(derivedTotal - total) > 1) return { ok: false, status: 400, message: "\u5408\u8A08\u91D1\u984D\u3068\u5185\u8A33\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093" };
  const routePlan = parseQuoteJsonField(body, "routePlan");
  const routePlanText = routePlan ? serializeQuoteJsonValue(routePlan, QUOTE_JSON_MAX_LEN) : null;
  if (routePlan && routePlanText === null) return { ok: false, status: 400, message: "routePlan \u306E\u30B5\u30A4\u30BA\u304C\u4E0A\u9650\u3092\u8D85\u3048\u3066\u3044\u307E\u3059" };
  const usageSummary = parseQuoteJsonField(body, "usageSummary");
  const usageSummaryText = usageSummary ? serializeQuoteJsonValue(usageSummary, QUOTE_JSON_MAX_LEN) : null;
  if (usageSummary && usageSummaryText === null) return { ok: false, status: 400, message: "usageSummary \u306E\u30B5\u30A4\u30BA\u304C\u4E0A\u9650\u3092\u8D85\u3048\u3066\u3044\u307E\u3059" };
  return { ok: true, estimateNo, total, snapshot, snapshotText, routePlanText: routePlanText || "", usageSummaryText: usageSummaryText || "", fareType: String(body?.fareType || body?.fare_type || "fixed").trim() || "fixed", handoffSource: String(body?.handoffSource || body?.handoff_source || "lp-site-estimate").trim() || "lp-site-estimate", dtoVersion: Number(body?.dtoVersion || body?.dto_version || 1) || 1, franchiseeId: String(body?.franchiseeId || body?.franchisee_id || "").trim(), storeId: String(body?.storeId || body?.store_id || "").trim(), expiresAt: String(body?.expiresAt || body?.expires_at || "").trim() };
}
__name(validateRegisterPayload, "validateRegisterPayload");
async function registerQuote(db, body) {
  const validated = validateRegisterPayload(body);
  if (!validated.ok) return validated;
  const existing = await db.prepare(`SELECT estimate_no,status FROM quotes WHERE estimate_no=? LIMIT 1`).bind(validated.estimateNo).first();
  if (existing) {
    if (String(existing.status || "") === "consumed") return { ok: false, status: 410, message: "\u898B\u7A4D\u306F\u4F7F\u7528\u6E08\u307F\u3067\u3059" };
    return { ok: false, status: 409, message: "\u898B\u7A4D\u756A\u53F7\u306F\u65E2\u306B\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u3059" };
  }
  const snapshotHash = await hashSnapshot(validated.snapshot), createdAt = (/* @__PURE__ */ new Date()).toISOString(), expiresAt = validated.expiresAt || new Date(Date.now() + DEFAULT_QUOTE_TTL_MS).toISOString(), meta = extractQuoteSnapshotMeta(validated.snapshot);
  await db.prepare(`INSERT INTO quotes (estimate_no,status,total_amount,fare_type,quote_snapshot,route_plan,usage_summary,fare_mode,fare_version,quote_version,snapshot_hash,handoff_source,dto_version,franchisee_id,store_id,expires_at,created_at,consumed_at,reservation_id,registered_by,selected_route_id,selected_overall_route_id,pre_fixed_fare_confirmable,fallback_reason,use_toll,distance_meters,duration_seconds,fixed_fare_total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(validated.estimateNo, "active", validated.total, validated.fareType, validated.snapshotText, validated.routePlanText, validated.usageSummaryText, String(validated.snapshot.fareMode || "").trim() || null, String(validated.snapshot.fareVersion || "").trim() || null, Number(validated.snapshot.quoteVersion) || 1, snapshotHash, validated.handoffSource, validated.dtoVersion, validated.franchiseeId || null, validated.storeId || null, expiresAt, createdAt, null, null, "lp", meta.selectedRouteId, meta.selectedOverallRouteId, meta.preFixedFareConfirmable, meta.fallbackReason, meta.useToll, meta.distanceMeters, meta.durationSeconds, meta.fixedFareTotal).run();
  return { ok: true, estimateNo: validated.estimateNo, snapshotHash, status: "active", total: validated.total, expiresAt };
}
__name(registerQuote, "registerQuote");
function parseStoredQuoteJson(text) {
  if (!String(text || "").trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
__name(parseStoredQuoteJson, "parseStoredQuoteJson");
function buildQuoteGetResponse(row) {
  const snapshot = parseStoredQuoteJson(row.quote_snapshot), meta = extractQuoteSnapshotMeta(snapshot);
  return { estimateNo: String(row.estimate_no || ""), status: String(row.status || ""), total: Number(row.total_amount) || 0, fareType: String(row.fare_type || "fixed"), quoteSnapshot: snapshot, routePlan: parseStoredQuoteJson(row.route_plan), usageSummary: parseStoredQuoteJson(row.usage_summary), snapshotHash: String(row.snapshot_hash || ""), selectedRouteId: row.selected_route_id || meta.selectedRouteId, selectedOverallRouteId: row.selected_overall_route_id || meta.selectedOverallRouteId, preFixedFareConfirmable: Number(row.pre_fixed_fare_confirmable ?? meta.preFixedFareConfirmable) === 1, useToll: Number(row.use_toll ?? meta.useToll) === 1, fixedFareTotal: Number(row.fixed_fare_total ?? meta.fixedFareTotal) || 0, dtoVersion: Number(row.dto_version) || 1, handoffSource: String(row.handoff_source || ""), fareMode: row.fare_mode || null, fareVersion: row.fare_version || null, quoteVersion: Number(row.quote_version) || 1, expiresAt: row.expires_at || null, createdAt: row.created_at || null };
}
__name(buildQuoteGetResponse, "buildQuoteGetResponse");
async function getQuoteByEstimateNo(db, estimateNo) {
  const row = await db.prepare(`SELECT * FROM quotes WHERE estimate_no=? LIMIT 1`).bind(estimateNo).first();
  if (!row) return { ok: false, status: 404, message: "\u898B\u7A4D\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" };
  const status = String(row.status || "");
  if (status === "consumed") return { ok: false, status: 410, message: "\u898B\u7A4D\u306F\u4F7F\u7528\u6E08\u307F\u3067\u3059" };
  if (status === "expired" || status === "canceled") return { ok: false, status: 409, message: "\u898B\u7A4D\u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093" };
  if (status !== "active") return { ok: false, status: 409, message: "\u898B\u7A4D\u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093" };
  const expiresAt = String(row.expires_at || "").trim();
  if (expiresAt) {
    const expMs = Date.parse(expiresAt);
    if (!Number.isNaN(expMs) && expMs < Date.now()) return { ok: false, status: 410, message: "\u898B\u7A4D\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u3066\u3044\u307E\u3059" };
  }
  return { ok: true, data: buildQuoteGetResponse(row) };
}
__name(getQuoteByEstimateNo, "getQuoteByEstimateNo");
function buildAdminQuoteResponse(row) {
  return { estimate_no: String(row.estimate_no || ""), status: String(row.status || ""), total_amount: Number(row.total_amount) || 0, fare_type: String(row.fare_type || ""), snapshot_hash: String(row.snapshot_hash || ""), created_at: row.created_at || null, consumed_at: row.consumed_at || null, reservation_id: row.reservation_id || null };
}
__name(buildAdminQuoteResponse, "buildAdminQuoteResponse");
async function getAdminQuoteByEstimateNo(db, estimateNo) {
  const row = await db.prepare(`SELECT estimate_no,status,total_amount,fare_type,snapshot_hash,created_at,consumed_at,reservation_id FROM quotes WHERE estimate_no=? LIMIT 1`).bind(estimateNo).first();
  if (!row) return { ok: false, status: 404, message: "\u898B\u7A4D\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" };
  return { ok: true, quote: buildAdminQuoteResponse(row) };
}
__name(getAdminQuoteByEstimateNo, "getAdminQuoteByEstimateNo");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
