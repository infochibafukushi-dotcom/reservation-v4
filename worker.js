async function ensureSettingsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT
    )
  `).run();
}

async function getSetting(db, key, fallback = null) {
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = ? LIMIT 1").bind(key).first();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

async function setSetting(db, key, value) {
  await db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).bind(key, JSON.stringify(value), new Date().toISOString()).run();
}

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function cancelReservationAndBlocks(db, id) {
  const reservation = await db.prepare(
    "SELECT * FROM reservations WHERE id = ? LIMIT 1"
  ).bind(id).first();

  if (!reservation) return false;

  const roundTrip = String(reservation.round_trip || "").trim();
  let blockCount = 2;
  if (["往復", "待機", "付き添い", "病院付き添い"].includes(roundTrip)) {
    blockCount = 4;
  }

  const [datePart, timePart] = reservation.reservation_datetime.split(" ");
  const base = new Date(`${datePart}T${timePart}:00`);

  for (let i = 0; i < blockCount; i++) {
    const d = new Date(base.getTime() + (i * 30 * 60 * 1000));

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");

    await db.prepare(
      "DELETE FROM blocks WHERE date = ? AND time = ? AND type = ?"
    ).bind(`${yyyy}-${mm}-${dd}`, `${hh}:${mi}`, "auto").run();
  }

  await db.prepare("DELETE FROM reservations WHERE id = ?").bind(id).run();
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers });

    await ensureSettingsTable(env.DB);

    if (path === "/api/getBlocks") {
      const blocks = await env.DB.prepare("SELECT date, time FROM blocks").all();
      return json({ blocks: blocks.results || [] }, headers);
    }

    if (path === "/api/getUITexts") {
      const uiTexts = await getSetting(env.DB, "ui_texts", {});
      return json({ uiTexts }, headers);
    }

    if (path === "/api/admin/setUITexts" && request.method === "POST") {
      const body = await request.json();
      await setSetting(env.DB, "ui_texts", body.uiTexts || {});
      return json({ success: true }, headers);
    }


    if (path === "/api/admin/getPassword") {
      const password = await getSetting(env.DB, "admin_password", "1234");
      return json({ password }, headers);
    }

    if (path === "/api/admin/setPassword" && request.method === "POST") {
      const body = await request.json();
      const password = String(body.password || "").trim();
      if (!password) return json({ success: false, message: "password required" }, headers, 400);
      await setSetting(env.DB, "admin_password", password);
      return json({ success: true }, headers);
    }

    if (path === "/api/baseFees" && request.method === "GET") {
      const baseFees = await getSetting(env.DB, "base_fees", {
        baseFare: 2000,
        dispatchFee: 500,
        specialFee: 1000,
        note: "走行距離・待機時間・追加介助により最終金額は変動する場合があります。"
      });
      return json({ baseFees }, headers);
    }

    if (path === "/api/baseFees" && request.method === "POST") {
      const body = await request.json();
      await setSetting(env.DB, "base_fees", body.baseFees || {});
      return json({ success: true }, headers);
    }

    if (path === "/api/admin/menu/create" && request.method === "POST") {
      const body = await request.json();
      await env.DB.prepare(
        "INSERT INTO menu (name, price, category) VALUES (?, ?, ?)"
      ).bind(String(body.name || ""), Number(body.price || 0), String(body.category || "vehicle")).run();
      return json({ success: true }, headers);
    }

    if (path === "/api/admin/menu/update" && request.method === "POST") {
      const body = await request.json();
      await env.DB.prepare(
        "UPDATE menu SET name = ?, price = ?, category = ? WHERE id = ?"
      ).bind(String(body.name || ""), Number(body.price || 0), String(body.category || "vehicle"), Number(body.id)).run();
      return json({ success: true }, headers);
    }

    if (path === "/api/admin/menu/delete" && request.method === "POST") {
      const body = await request.json();
      await env.DB.prepare("DELETE FROM menu WHERE id = ?").bind(Number(body.id)).run();
      return json({ success: true }, headers);
    }

    if (path === "/api/admin/menu/toggleHidden" && request.method === "POST") {
      const body = await request.json();
      const hiddenIds = await getSetting(env.DB, "menu_hidden_ids", []);
      const id = Number(body.id);
      const exists = hiddenIds.includes(id);
      const next = exists ? hiddenIds.filter(x => x !== id) : hiddenIds.concat(id);
      await setSetting(env.DB, "menu_hidden_ids", next);
      return json({ success: true, hiddenIds: next }, headers);
    }

    if (path === "/api/menu") {
      const result = await env.DB.prepare(
        "SELECT id, name, price, category FROM menu ORDER BY id ASC"
      ).all();

      const hiddenIds = await getSetting(env.DB, "menu_hidden_ids", []);

      const grouped = { vehicle: [], assist: [], stairs: [], round: [] };
      (result.results || []).forEach(r => {
        if (hiddenIds.includes(Number(r.id))) return;
        const key = String(r.category || "").trim();
        if (grouped[key]) grouped[key].push(r);
      });

      return json(grouped, headers);
    }

    if (path === "/api/admin/blocks/day" && request.method === "POST") {
      const body = await request.json();
      const date = String(body.date || "").trim();
      const mode = String(body.mode || "block").trim();

      for (let h = 0; h <= 23; h++) {
        for (let m = 0; m <= 30; m += 30) {
          const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          if (mode === "block") {
            await env.DB.prepare("INSERT OR IGNORE INTO blocks (date, time, type) VALUES (?, ?, ?)").bind(date, time, "manual").run();
          } else {
            await env.DB.prepare("DELETE FROM blocks WHERE date = ? AND time = ? AND type = ?").bind(date, time, "manual").run();
          }
        }
      }
      return json({ success: true }, headers);
    }

    if (path === "/api/admin/blocks/slot" && request.method === "POST") {
      const body = await request.json();
      const date = String(body.date || "").trim();
      const time = String(body.time || "").trim();
      const mode = String(body.mode || "block").trim();

      if (mode === "block") {
        await env.DB.prepare("INSERT OR IGNORE INTO blocks (date, time, type) VALUES (?, ?, ?)").bind(date, time, "manual").run();
      } else {
        await env.DB.prepare("DELETE FROM blocks WHERE date = ? AND time = ? AND type = ?").bind(date, time, "manual").run();
      }
      return json({ success: true }, headers);
    }

    if (path === "/api/getReservations") {
      const reservations = await env.DB.prepare("SELECT * FROM reservations ORDER BY reservation_datetime ASC").all();
      return json(reservations.results || [], headers);
    }

    if (path === "/api/cancelReservation" && request.method === "POST") {
      const body = await request.json();
      const id = String(body.id || "").trim();
      if (!id) return json({ success: false }, headers);
      const ok = await cancelReservationAndBlocks(env.DB, id);
      return json({ success: ok }, headers);
    }

    if (path === "/api/getInitData") {
      const reservations = await env.DB.prepare("SELECT * FROM reservations ORDER BY reservation_datetime ASC").all();
      const blocks = await env.DB.prepare("SELECT * FROM blocks").all();
      const config = await env.DB.prepare("SELECT * FROM config").all();
      const menu = await env.DB.prepare("SELECT * FROM menu ORDER BY id ASC").all();

      return json({
        reservations: reservations.results || [],
        blocks: blocks.results || [],
        config: config.results || [],
        menu: menu.results || []
      }, headers);
    }

    if (path === "/api/createReservation" && request.method === "POST") {
      const body = await request.json();

      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      const date = String(body.date || "").trim();
      const time = String(body.time || "").trim();
      const pickup = String(body.pickup || "").trim();
      const destination = String(body.destination || "").trim();
      const notes = String(body.notes || "").trim();
      const vehicle = String(body.vehicle || "").trim();
      const assist = String(body.assist || "").trim();
      const stairs = String(body.stairs || "").trim();
      const roundTrip = String(body.roundTrip || "").trim();

      if (!name || !phone || !date || !time || !pickup) {
        return json({ success: false, message: "必須項目が未入力です" }, headers);
      }

      const reservationDatetime = `${date} ${time}`;
      let blockCount = 2;
      if (["往復", "待機", "付き添い", "病院付き添い"].includes(roundTrip)) blockCount = 4;

      const slotList = [];
      const base = new Date(`${date}T${time}:00`);
      for (let i = 0; i < blockCount; i++) {
        const d = new Date(base.getTime() + (i * 30 * 60 * 1000));
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        slotList.push({ date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` });
      }

      for (const slot of slotList) {
        const exists = await env.DB.prepare("SELECT id FROM blocks WHERE date = ? AND time = ? LIMIT 1").bind(slot.date, slot.time).first();
        if (exists) return json({ success: false, message: "予約枠が埋まっています" }, headers);
      }

      const reservationId = String(Date.now());
      await env.DB.prepare(`
        INSERT INTO reservations (
          id, reservation_datetime, customer_name, phone_number,
          pickup_location, destination, assistance_type, stair_assistance,
          equipment_rental, round_trip, total_price, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        reservationId, reservationDatetime, name, phone, pickup, destination,
        assist, stairs, vehicle, roundTrip, 0, "未対応", new Date().toISOString()
      ).run();

      for (const slot of slotList) {
        await env.DB.prepare("INSERT INTO blocks (date, time, type) VALUES (?, ?, ?)").bind(slot.date, slot.time, "auto").run();
      }

      return json({ success: true, id: reservationId }, headers);
    }

    if (path === "/api/deleteReservation" && request.method === "POST") {
      const body = await request.json();
      const id = String(body.id || "").trim();
      if (!id) return json({ success: false }, headers);
      const ok = await cancelReservationAndBlocks(env.DB, id);
      return json({ success: ok }, headers);
    }

    return json({ success: false, message: "Not Found" }, headers, 404);
  }
};
