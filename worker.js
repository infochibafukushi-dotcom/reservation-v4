export default {
  async fetch(request, env) {
    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {
      if (!env.DB) {
        return json({ success: false, message: "DB_BINDING_MISSING" }, 500, headers);
      }

      await ensureSchema(env.DB);

      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/") {
        return new Response("OK");
      }

      if (path === "/api/getBlocks") {
        const blocks = await env.DB.prepare(`
          SELECT id, date, time, type FROM blocks
          ORDER BY date, time
        `).all();
        return json({ success: true, blocks: blocks.results || [] }, 200, headers);
      }

      if (path === "/api/getReservations") {
        const rows = await env.DB.prepare(`
          SELECT * FROM reservations
          ORDER BY created_at DESC, id DESC
        `).all();
        return json(rows.results || [], 200, headers);
      }

      if (path === "/api/menu") {
        return json(defaultMenu(), 200, headers);
      }

      if (path === "/api/getUITexts") {
        return json({
          uiTexts: {
            index_title: "介護タクシー予約",
            index_subtitle: "丁寧・安全な送迎をご提供します",
            calendar_loading: "空き枠を読み込み中...",
            calendar_note: "◎を押すと予約フォームが開きます。"
          }
        }, 200, headers);
      }

      if (path === "/api/baseFees") {
        return json({
          baseFees: {
            items: [
              { id: "base", label: "基本運賃", price: 2000, visible: true },
              { id: "dispatch", label: "予約配車料", price: 500, visible: true }
            ],
            note: "走行距離・待機時間・追加介助により最終金額は変動する場合があります。"
          }
        }, 200, headers);
      }

      if (path === "/api/admin/login" && request.method === "POST") {
        const body = await safeJson(request);
        const saved = await getSetting(env.DB, "admin_password", "1234");
        return json({ success: String(body.password || "") === String(saved) }, 200, headers);
      }

      if (path === "/api/createReservation" && request.method === "POST") {
        const body = await safeJson(request);

        const required = ["name", "phone", "date", "time", "pickup"];
        for (const key of required) {
          if (!String(body[key] || "").trim()) {
            return json({ success: false, message: "必須項目が未入力です" }, 400, headers);
          }
        }

        const date = normalizeDate(body.date);
        const time = normalizeTime(body.time);
        if (!date || !time) {
          return json({ success: false, message: "日時が不正です" }, 400, headers);
        }

        const blockCount = getBlockCount(body.roundTrip);
        const slots = makeSlots(date, time, blockCount);

        for (const slot of slots) {
          const exists = await env.DB.prepare(`
            SELECT id FROM blocks WHERE date = ? AND time = ? LIMIT 1
          `).bind(slot.date, slot.time).first();
          if (exists) {
            return json({ success: false, message: "この枠は予約できません" }, 409, headers);
          }
        }

        const id = Date.now().toString();

        await env.DB.prepare(`
          INSERT INTO reservations (
            id, name, phone, date, time, pickup, destination,
            vehicle, assist, stairs, roundTrip, notes, estimate,
            block_count, status, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          String(body.name || ""),
          String(body.phone || ""),
          date,
          time,
          String(body.pickup || ""),
          String(body.destination || ""),
          String(body.vehicle || ""),
          String(body.assist || ""),
          String(body.stairs || ""),
          String(body.roundTrip || ""),
          String(body.notes || ""),
          String(body.estimate || ""),
          blockCount,
          "active",
          new Date().toISOString()
        ).run();

        for (const slot of slots) {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO blocks (date, time, type, reservation_id, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).bind(slot.date, slot.time, "auto", id, new Date().toISOString()).run();
        }

        return json({ success: true, id }, 200, headers);
      }

      if (path === "/api/cancelReservation" && request.method === "POST") {
        const body = await safeJson(request);
        const id = String(body.id || "");
        if (!id) return json({ success: false, message: "id required" }, 400, headers);

        await env.DB.prepare(`DELETE FROM blocks WHERE reservation_id = ? AND type = 'auto'`).bind(id).run();
        await env.DB.prepare(`DELETE FROM reservations WHERE id = ?`).bind(id).run();

        return json({ success: true }, 200, headers);
      }

      if (path === "/api/admin/blocks/slot" && request.method === "POST") {
        const body = await safeJson(request);
        const date = normalizeDate(body.date);
        const time = normalizeTime(body.time);
        const mode = String(body.mode || "block");

        if (!date || !time) return json({ success: false, message: "日時が不正です" }, 400, headers);

        if (mode === "unblock") {
          await env.DB.prepare(`DELETE FROM blocks WHERE date = ? AND time = ? AND type = 'manual'`).bind(date, time).run();
        } else {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO blocks (date, time, type, reservation_id, created_at)
            VALUES (?, ?, 'manual', '', ?)
          `).bind(date, time, new Date().toISOString()).run();
        }

        return json({ success: true }, 200, headers);
      }

      if (path === "/api/admin/blocks/day" && request.method === "POST") {
        const body = await safeJson(request);
        const date = normalizeDate(body.date);
        if (!date) return json({ success: false, message: "日付が不正です" }, 400, headers);

        const times = buildNormalTimes();
        const manual = await env.DB.prepare(`
          SELECT COUNT(*) AS c FROM blocks WHERE date = ? AND type = 'manual'
        `).bind(date).first();

        const shouldUnblock = String(body.mode || "") === "unblock" || (String(body.mode || "") === "toggle" && Number(manual?.c || 0) >= times.length);

        if (shouldUnblock) {
          await env.DB.prepare(`DELETE FROM blocks WHERE date = ? AND type = 'manual'`).bind(date).run();
        } else {
          for (const time of times) {
            await env.DB.prepare(`
              INSERT OR IGNORE INTO blocks (date, time, type, reservation_id, created_at)
              VALUES (?, ?, 'manual', '', ?)
            `).bind(date, time, new Date().toISOString()).run();
          }
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

async function safeJson(request) {
  try { return await request.json(); } catch { return {}; }
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `).run();

  await db.prepare(`
    INSERT OR IGNORE INTO settings (key, value)
    VALUES ('admin_password', '1234')
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY
    )
  `).run();

  await addColumnIfMissing(db, "reservations", "name", "TEXT");
  await addColumnIfMissing(db, "reservations", "phone", "TEXT");
  await addColumnIfMissing(db, "reservations", "date", "TEXT");
  await addColumnIfMissing(db, "reservations", "time", "TEXT");
  await addColumnIfMissing(db, "reservations", "pickup", "TEXT");
  await addColumnIfMissing(db, "reservations", "destination", "TEXT");
  await addColumnIfMissing(db, "reservations", "vehicle", "TEXT");
  await addColumnIfMissing(db, "reservations", "assist", "TEXT");
  await addColumnIfMissing(db, "reservations", "stairs", "TEXT");
  await addColumnIfMissing(db, "reservations", "roundTrip", "TEXT");
  await addColumnIfMissing(db, "reservations", "notes", "TEXT");
  await addColumnIfMissing(db, "reservations", "estimate", "TEXT");
  await addColumnIfMissing(db, "reservations", "block_count", "INTEGER DEFAULT 2");
  await addColumnIfMissing(db, "reservations", "status", "TEXT DEFAULT 'active'");
  await addColumnIfMissing(db, "reservations", "created_at", "TEXT");

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      time TEXT,
      type TEXT,
      reservation_id TEXT,
      created_at TEXT
    )
  `).run();

  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_unique
    ON blocks(date, time)
  `).run();
}

async function addColumnIfMissing(db, table, column, type) {
  const info = await db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = (info.results || []).some(row => row.name === column);
  if (!exists) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  }
}

async function getSetting(db, key, fallback) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = ? LIMIT 1`).bind(key).first();
  return row ? row.value : fallback;
}

function normalizeDate(v) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function normalizeTime(v) {
  const s = String(v || "").trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  return "";
}

function getBlockCount(roundTrip) {
  const v = String(roundTrip || "");
  if (["往復", "待機", "付き添い", "病院付き添い"].some(x => v.includes(x))) return 4;
  return 2;
}

function makeSlots(date, time, count) {
  const base = new Date(`${date}T${time}:00+09:00`);
  const slots = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getTime() + i * 30 * 60 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    slots.push({ date: `${y}-${m}-${day}`, time: `${hh}:${mm}` });
  }
  return slots;
}

function buildNormalTimes() {
  const out = [];
  for (let h = 6; h <= 21; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 21 && m > 0) continue;
      out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    }
  }
  return out;
}

function defaultMenu() {
  return {
    vehicle: [
      { name: "車いす", price: 0 },
      { name: "ストレッチャー", price: 4000 },
      { name: "ご自身の車いす", price: 0 }
    ],
    assist: [
      { name: "乗降介助", price: 1500 },
      { name: "身体介助", price: 3000 },
      { name: "介助不要", price: 0 }
    ],
    stairs: [
      { name: "不要", price: 0 },
      { name: "見守り介助", price: 0 },
      { name: "2階移動", price: 3000 },
      { name: "3階移動", price: 5000 }
    ],
    round: [
      { name: "片道", price: 0 },
      { name: "往復", price: 0 },
      { name: "待機", price: 1000 },
      { name: "病院付き添い", price: 1500 }
    ]
  };
}
