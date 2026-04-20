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

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // ===== ブロック一覧（軽量） =====
    if (path === "/api/getBlocks") {
      const blocks = await env.DB.prepare("SELECT date, time FROM blocks").all();
      return new Response(JSON.stringify({ blocks: blocks.results || [] }), { headers });
    }

    // ===== 初期データ =====
    if (path === "/api/getInitData") {
      const reservations = await env.DB.prepare("SELECT * FROM reservations ORDER BY reservation_datetime ASC").all();
      const blocks = await env.DB.prepare("SELECT * FROM blocks").all();
      const config = await env.DB.prepare("SELECT * FROM config").all();
      const menu = await env.DB.prepare("SELECT * FROM menu ORDER BY id ASC").all();

      return new Response(JSON.stringify({
        reservations: reservations.results || [],
        blocks: blocks.results || [],
        config: config.results || [],
        menu: menu.results || []
      }), { headers });
    }

    // ===== メニュー（追加） =====
    if (path === "/api/menu") {

      const result = await env.DB.prepare(
        "SELECT id, name, price, category FROM menu ORDER BY id ASC"
      ).all();

      const grouped = {
        vehicle: [],
        assist: [],
        stairs: [],
        round: []
      };

      (result.results || []).forEach(r => {
        const key = String(r.category || "").trim();
        if (grouped[key]) {
          grouped[key].push(r);
        }
      });

      return new Response(JSON.stringify(grouped), { headers });
    }

    // ===== 予約一覧 =====
    if (path === "/api/getReservations") {
      const reservations = await env.DB.prepare("SELECT * FROM reservations ORDER BY reservation_datetime ASC").all();
      return new Response(JSON.stringify(reservations.results || []), { headers });
    }

    // ===== 予約作成 =====
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
        return new Response(JSON.stringify({
          success: false,
          message: "必須項目が未入力です"
        }), { headers });
      }

      const reservationDatetime = `${date} ${time}`;

      let blockCount = 2;
      if (["往復", "待機", "付き添い", "病院付き添い"].includes(roundTrip)) {
        blockCount = 4;
      }

      const slotList = [];
      const base = new Date(`${date}T${time}:00`);

      for (let i = 0; i < blockCount; i++) {
        const d = new Date(base.getTime() + (i * 30 * 60 * 1000));

        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");

        slotList.push({
          date: `${yyyy}-${mm}-${dd}`,
          time: `${hh}:${mi}`
        });
      }

      // 重複チェック
      for (const slot of slotList) {
        const exists = await env.DB.prepare(
          "SELECT id FROM blocks WHERE date = ? AND time = ? LIMIT 1"
        ).bind(slot.date, slot.time).first();

        if (exists) {
          return new Response(JSON.stringify({
            success: false,
            message: "予約枠が埋まっています"
          }), { headers });
        }
      }

      const reservationId = String(Date.now());

      await env.DB.prepare(`
        INSERT INTO reservations (
          id,
          reservation_datetime,
          customer_name,
          phone_number,
          pickup_location,
          destination,
          assistance_type,
          stair_assistance,
          equipment_rental,
          round_trip,
          total_price,
          status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        reservationId,
        reservationDatetime,
        name,
        phone,
        pickup,
        destination,
        assist,
        stairs,
        vehicle,
        roundTrip,
        0,
        "未対応",
        new Date().toISOString()
      ).run();

      // ブロック登録
      for (const slot of slotList) {
        await env.DB.prepare(
          "INSERT INTO blocks (date, time, type) VALUES (?, ?, ?)"
        ).bind(slot.date, slot.time, "auto").run();
      }

      return new Response(JSON.stringify({
        success: true,
        id: reservationId
      }), { headers });
    }

    // ===== 予約削除 =====
    if (path === "/api/deleteReservation" && request.method === "POST") {

      const body = await request.json();
      const id = String(body.id || "").trim();

      if (!id) {
        return new Response(JSON.stringify({ success: false }), { headers });
      }

      const reservation = await env.DB.prepare(
        "SELECT * FROM reservations WHERE id = ? LIMIT 1"
      ).bind(id).first();

      if (!reservation) {
        return new Response(JSON.stringify({ success: false }), { headers });
      }

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

        await env.DB.prepare(
          "DELETE FROM blocks WHERE date = ? AND time = ? AND type = ?"
        ).bind(`${yyyy}-${mm}-${dd}`, `${hh}:${mi}`, "auto").run();
      }

      await env.DB.prepare("DELETE FROM reservations WHERE id = ?").bind(id).run();

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // ===== 404 =====
    return new Response(JSON.stringify({
      success: false,
      message: "Not Found"
    }), { status: 404, headers });
  }
};
