function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

function ok(data) {
  return jsonResponse({ isOk: true, data });
}

function ng(message, status = 500) {
  return jsonResponse({ isOk: false, error: String(message || 'Internal Error') }, status);
}

function parseReservationDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const normalized = raw.replace('T', ' ').replace(/\//g, '-');
  const m = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  if ([y, mo, d, h, mi].some(Number.isNaN)) return null;

  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function slotKeyFromDate(date) {
  return `${ymdLocal(date)}-${date.getHours()}-${date.getMinutes()}`;
}

function reservationBlockSlots(roundTrip) {
  const rt = String(roundTrip || '').trim();
  if (rt === '待機' || rt === '病院付き添い') return 4;
  return 2;
}

function buildBlockedSlotKeysFromReservations(reservations, range) {
  const start = String(range && range.start || '').trim();
  const end = String(range && range.end || '').trim();
  const set = new Set();

  (reservations || []).forEach(row => {
    const status = String(row && row.status || '').trim();
    if (status === 'キャンセル') return;

    const dt = parseReservationDateTime(row && row.reservation_datetime);
    if (!dt) return;

    const slots = reservationBlockSlots(row && row.round_trip);
    for (let i = 0; i < slots; i++) {
      const current = new Date(dt.getTime() + i * 30 * 60 * 1000);
      const key = slotKeyFromDate(current);
      const ymd = ymdLocal(current);

      if (start && ymd < start) continue;
      if (end && ymd > end) continue;

      set.add(key);
    }
  });

  return Array.from(set).sort();
}

async function selectReservations(env, range) {
  const start = String(range && range.start || '').trim();
  const end = String(range && range.end || '').trim();

  if (start && end) {
    return await env.DB.prepare(`
      SELECT
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
      FROM reservations
      WHERE substr(reservation_datetime, 1, 10) BETWEEN ?1 AND ?2
      ORDER BY reservation_datetime ASC
    `).bind(start, end).all();
  }

  return await env.DB.prepare(`
    SELECT
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
    FROM reservations
    ORDER BY reservation_datetime ASC
    LIMIT 500
  `).all();
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
          }
        });
      }

      if (request.method === 'GET' && path === '/init') {
        const range = {
          start: String(url.searchParams.get('start') || '').trim(),
          end: String(url.searchParams.get('end') || '').trim()
        };

        const result = await selectReservations(env, range);
        const reservations = Array.isArray(result && result.results) ? result.results : [];
        const slotKeys = buildBlockedSlotKeysFromReservations(reservations, range);

        return ok({
          config: {},
          reservations,
          blocks: [],
          menu_master: [],
          menu_key_catalog: [],
          menu_group_catalog: [],
          auto_rule_catalog: [],
          start: range.start,
          end: range.end,
          slot_keys: slotKeys,
          keys: slotKeys
        });
      }

      if (request.method === 'GET' && path === '/blocked') {
        const range = {
          start: String(url.searchParams.get('start') || '').trim(),
          end: String(url.searchParams.get('end') || '').trim()
        };

        const result = await selectReservations(env, range);
        const reservations = Array.isArray(result && result.results) ? result.results : [];
        const slotKeys = buildBlockedSlotKeysFromReservations(reservations, range);

        return ok({
          start: range.start,
          end: range.end,
          slot_keys: slotKeys,
          keys: slotKeys
        });
      }

      if (request.method === 'POST' && path === '/create') {
        const body = await request.json();

        const id = String(body && (body.id || body.reservation_id) || crypto.randomUUID()).trim();
        const reservationDatetime = String(body && body.reservation_datetime || '').trim();
        const customerName = String(body && (body.customer_name || body.name) || '').trim();
        const phoneNumber = String(body && (body.phone_number || body.phone) || '').trim();
        const pickupLocation = String(body && (body.pickup_location || body.pickup) || '').trim();
        const destination = String(body && body.destination || '').trim();
        const assistanceType = String(body && body.assistance_type || '').trim();
        const stairAssistance = String(body && body.stair_assistance || '').trim();
        const equipmentRental = String(body && body.equipment_rental || '').trim();
        const roundTrip = String(body && body.round_trip || '').trim();
        const totalPrice = Number(body && body.total_price || 0);
        const status = String(body && body.status || '未対応').trim();
        const createdAt = new Date().toISOString();

        if (!reservationDatetime) return ng('reservation_datetime is required', 400);
        if (!customerName) return ng('customer_name is required', 400);

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
          id,
          reservationDatetime,
          customerName,
          phoneNumber,
          pickupLocation,
          destination,
          assistanceType,
          stairAssistance,
          equipmentRental,
          roundTrip,
          Number.isFinite(totalPrice) ? Math.round(totalPrice) : 0,
          status,
          createdAt
        ).run();

        return ok({
          id,
          reservation_id: id,
          created_at: createdAt
        });
      }

      return ng('Not Found', 404);
    } catch (e) {
      return ng(e && e.message ? e.message : 'Internal Error', 500);
    }
  }
};
