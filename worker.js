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

const DEFAULT_CONFIG = {
  main_title: '介護タクシー予約',
  logo_text: '介護タクシー予約',
  logo_subtext: '丁寧・安全な送迎をご提供します',
  phone_notify_text: '090-6331-4289',
  admin_tap_count: '5',
  max_forward_days: '30',
  days_per_page: '7',
  extended_enabled: '1',
  same_day_enabled: '1',
  same_day_min_hours: '3',
  calendar_prefetch_next_page: '1',
  form_move_type_help_text: '最初に移動方法をお選びください',
  form_submit_button_text: '予約する',
  form_usage_type_placeholder: '選択してください',
  admin_password: ''
};

const DEFAULT_MENU_GROUP_CATALOG = [
  { key: 'price', label: '料金概算（基本料金）' },
  { key: 'move_type', label: '移動方法' },
  { key: 'assistance', label: '介助内容' },
  { key: 'stair', label: '階段介助' },
  { key: 'equipment', label: '機材レンタル' },
  { key: 'round_trip', label: '往復送迎' },
  { key: 'auto_set', label: '自動セット' },
  { key: 'custom', label: 'その他（表示先なし）' }
];

const DEFAULT_MENU_MASTER = [
  { key: 'BASE_FARE', label: '運賃', price: 730, menu_group: 'price', sort_order: 10, is_visible: true },
  { key: 'DISPATCH', label: '配車予約', price: 800, menu_group: 'price', sort_order: 20, is_visible: true },
  { key: 'SPECIAL_VEHICLE', label: '特殊車両使用料', price: 1000, menu_group: 'price', sort_order: 30, is_visible: true },

  { key: 'MOVE_WHEELCHAIR', label: '無料車いす', price: 0, menu_group: 'move_type', sort_order: 10, is_visible: true },
  { key: 'MOVE_OWN', label: 'ご自身の車いす', price: 0, menu_group: 'move_type', sort_order: 20, is_visible: true },
  { key: 'MOVE_RECLINING', label: 'リクライニング車いす', price: 0, menu_group: 'move_type', sort_order: 30, is_visible: true, auto_apply_group: 'equipment', auto_apply_key: 'EQUIP_RECLINING' },
  { key: 'MOVE_STRETCHER', label: 'ストレッチャー', price: 0, menu_group: 'move_type', sort_order: 40, is_visible: true, auto_apply_group: 'equipment', auto_apply_key: 'EQUIP_STRETCHER' },

  { key: 'BOARDING_ASSIST', label: '乗降介助', price: 1400, menu_group: 'assistance', sort_order: 10, is_visible: true },
  { key: 'BODY_ASSIST', label: '身体介助', price: 3000, menu_group: 'assistance', sort_order: 20, is_visible: true },
  { key: 'ASSIST_NONE', label: '介助不要', price: 0, menu_group: 'assistance', sort_order: 30, is_visible: true },

  { key: 'STAIR_NONE', label: 'なし', price: 0, menu_group: 'stair', sort_order: 10, is_visible: true },
  { key: 'STAIR_WATCH', label: '見守り介助', price: 0, menu_group: 'stair', sort_order: 20, is_visible: true },
  { key: 'STAIR_2F', label: '2階移動', price: 6000, menu_group: 'stair', sort_order: 30, is_visible: true, auto_apply_group: 'assistance', auto_apply_key: 'BODY_ASSIST' },
  { key: 'STAIR_3F', label: '3階移動', price: 9000, menu_group: 'stair', sort_order: 40, is_visible: true, auto_apply_group: 'assistance', auto_apply_key: 'BODY_ASSIST' },
  { key: 'STAIR_4F', label: '4階移動', price: 12000, menu_group: 'stair', sort_order: 50, is_visible: true, auto_apply_group: 'assistance', auto_apply_key: 'BODY_ASSIST' },
  { key: 'STAIR_5F', label: '5階移動', price: 15000, menu_group: 'stair', sort_order: 60, is_visible: true, auto_apply_group: 'assistance', auto_apply_key: 'BODY_ASSIST' },

  { key: 'EQUIP_NONE', label: 'なし', price: 0, menu_group: 'equipment', sort_order: 10, is_visible: true },
  { key: 'EQUIP_WHEELCHAIR', label: '車いすレンタル', price: 0, menu_group: 'equipment', sort_order: 20, is_visible: true },
  { key: 'EQUIP_OWN_WHEELCHAIR', label: 'ご自身車いす', price: 0, menu_group: 'equipment', sort_order: 30, is_visible: true },
  { key: 'EQUIP_RECLINING', label: 'リクライニング車いすレンタル', price: 2500, menu_group: 'equipment', sort_order: 40, is_visible: true },
  { key: 'EQUIP_STRETCHER', label: 'ストレッチャーレンタル', price: 5000, menu_group: 'equipment', sort_order: 50, is_visible: true, auto_apply_group: 'assistance', auto_apply_key: 'BODY_ASSIST', auto_apply_group_2: 'auto_set', auto_apply_key_2: 'EQUIP_STRETCHER_STAFF2' },
  { key: 'EQUIP_STRETCHER_STAFF2', label: 'ストレッチャー2名体制介助料', price: 5000, menu_group: 'auto_set', sort_order: 10, is_visible: true },

  { key: 'ROUND_NONE', label: 'なし', price: 0, menu_group: 'round_trip', sort_order: 10, is_visible: true },
  { key: 'ROUND_STANDBY', label: '待機', price: 800, menu_group: 'round_trip', sort_order: 20, is_visible: true },
  { key: 'ROUND_HOSPITAL', label: '病院付き添い', price: 1600, menu_group: 'round_trip', sort_order: 30, is_visible: true }
];

const DEFAULT_MENU_KEY_CATALOG = DEFAULT_MENU_MASTER.map((item, idx) => ({
  index: idx + 1,
  key: String(item.key || ''),
  key_jp: String(item.label || ''),
  default_label: String(item.label || ''),
  menu_group: String(item.menu_group || 'custom')
}));

const DEFAULT_AUTO_RULE_CATALOG = [
  { index: 1, enabled: true, target: 'stair', trigger_key: 'STAIR_2F', apply_group: 'assistance', apply_key: 'BODY_ASSIST' },
  { index: 2, enabled: true, target: 'stair', trigger_key: 'STAIR_3F', apply_group: 'assistance', apply_key: 'BODY_ASSIST' },
  { index: 3, enabled: true, target: 'stair', trigger_key: 'STAIR_4F', apply_group: 'assistance', apply_key: 'BODY_ASSIST' },
  { index: 4, enabled: true, target: 'stair', trigger_key: 'STAIR_5F', apply_group: 'assistance', apply_key: 'BODY_ASSIST' },
  { index: 5, enabled: true, target: 'equipment', trigger_key: 'EQUIP_STRETCHER', apply_group: 'assistance', apply_key: 'BODY_ASSIST' }
];

function getAdminPassword(env) {
  const fromEnv = String(env && env.ADMIN_PASSWORD || '').trim();
  if (fromEnv) return fromEnv;
  return '';
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

async function _tableExists(env, tableName) {
  try {
    const res = await env.DB.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type='table' AND name=?1
      LIMIT 1
    `).bind(String(tableName || '').trim()).first();
    return !!(res && res.name);
  } catch (_) {
    return false;
  }
}

async function loadConfigMap(env) {
  if (!await _tableExists(env, 'config')) return {};
  let rows = [];
  try {
    const res = await env.DB.prepare(`SELECT key, value FROM config`).all();
    rows = Array.isArray(res && res.results) ? res.results : [];
  } catch (_) {
    try {
      const res = await env.DB.prepare(`SELECT config_key AS key, config_value AS value FROM config`).all();
      rows = Array.isArray(res && res.results) ? res.results : [];
    } catch (__){
      rows = [];
    }
  }

  const map = {};
  rows.forEach(row => {
    const key = String(row && row.key || '').trim();
    if (!key) return;
    map[key] = row && row.value !== undefined && row.value !== null ? String(row.value) : '';
  });
  return map;
}

async function loadMenuMaster(env) {
  if (!await _tableExists(env, 'menu_master')) {
    return DEFAULT_MENU_MASTER.map(item => ({ ...item }));
  }
  try {
    const res = await env.DB.prepare(`
      SELECT
        key,
        key_jp,
        label,
        price,
        note,
        is_visible,
        sort_order,
        menu_group,
        required_flag,
        auto_apply_group,
        auto_apply_key,
        auto_apply_group_2,
        auto_apply_key_2
      FROM menu_master
      ORDER BY sort_order ASC, key ASC
    `).all();
    const rows = Array.isArray(res && res.results) ? res.results : [];
    if (!rows.length) return DEFAULT_MENU_MASTER.map(item => ({ ...item }));
    return rows.map(row => ({
      key: String(row.key || ''),
      key_jp: String(row.key_jp || ''),
      label: String(row.label || row.key || ''),
      price: Number(row.price || 0),
      note: String(row.note || ''),
      is_visible: !(row.is_visible === false || String(row.is_visible).toUpperCase() === 'FALSE' || String(row.is_visible) === '0'),
      sort_order: Number(row.sort_order || 9999),
      menu_group: String(row.menu_group || 'custom'),
      required_flag: row.required_flag === true || String(row.required_flag) === '1' || String(row.required_flag).toUpperCase() === 'TRUE',
      auto_apply_group: String(row.auto_apply_group || ''),
      auto_apply_key: String(row.auto_apply_key || ''),
      auto_apply_group_2: String(row.auto_apply_group_2 || ''),
      auto_apply_key_2: String(row.auto_apply_key_2 || '')
    }));
  } catch (_) {
    return DEFAULT_MENU_MASTER.map(item => ({ ...item }));
  }
}

async function loadMenuGroupCatalog(env) {
  if (!await _tableExists(env, 'menu_group_catalog')) {
    return DEFAULT_MENU_GROUP_CATALOG.map(item => ({ ...item }));
  }
  try {
    const res = await env.DB.prepare(`
      SELECT key, label
      FROM menu_group_catalog
      ORDER BY key ASC
    `).all();
    const rows = Array.isArray(res && res.results) ? res.results : [];
    if (!rows.length) return DEFAULT_MENU_GROUP_CATALOG.map(item => ({ ...item }));
    return rows.map(row => ({
      key: String(row.key || ''),
      label: String(row.label || row.key || '')
    })).filter(row => row.key);
  } catch (_) {
    return DEFAULT_MENU_GROUP_CATALOG.map(item => ({ ...item }));
  }
}

async function loadAutoRuleCatalog(env) {
  if (!await _tableExists(env, 'auto_rule_catalog')) {
    return DEFAULT_AUTO_RULE_CATALOG.map(item => ({ ...item }));
  }
  try {
    const res = await env.DB.prepare(`
      SELECT
        "index",
        enabled,
        target,
        trigger_key,
        apply_group,
        apply_key
      FROM auto_rule_catalog
      ORDER BY "index" ASC
    `).all();
    const rows = Array.isArray(res && res.results) ? res.results : [];
    if (!rows.length) return DEFAULT_AUTO_RULE_CATALOG.map(item => ({ ...item }));
    return rows.map(row => ({
      index: Number(row.index || 0),
      enabled: row.enabled === true || String(row.enabled) === '1' || String(row.enabled).toUpperCase() === 'TRUE',
      target: String(row.target || ''),
      trigger_key: String(row.trigger_key || ''),
      apply_group: String(row.apply_group || ''),
      apply_key: String(row.apply_key || '')
    }));
  } catch (_) {
    return DEFAULT_AUTO_RULE_CATALOG.map(item => ({ ...item }));
  }
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
        const dbConfig = await loadConfigMap(env);
        const menuMaster = await loadMenuMaster(env);
        const menuGroupCatalog = await loadMenuGroupCatalog(env);
        const autoRuleCatalog = await loadAutoRuleCatalog(env);

        const runtimeConfig = {
          ...DEFAULT_CONFIG,
          ...dbConfig,
          admin_password: getAdminPassword(env)
        };
        const menuKeyCatalog = DEFAULT_MENU_KEY_CATALOG.map(item => ({ ...item }))
          .map((base, idx) => {
            const found = menuMaster.find(row => String(row.key || '') === String(base.key || ''));
            if (found) {
              return {
                ...base,
                index: idx + 1,
                key_jp: String(found.key_jp || found.label || base.key_jp || ''),
                default_label: String(found.label || base.default_label || ''),
                menu_group: String(found.menu_group || base.menu_group || 'custom')
              };
            }
            return { ...base, index: idx + 1 };
          });
        menuMaster.forEach((row, idx) => {
          const key = String(row.key || '');
          if (!key) return;
          if (menuKeyCatalog.some(item => String(item.key || '') === key)) return;
          menuKeyCatalog.push({
            index: menuKeyCatalog.length + idx + 1,
            key,
            key_jp: String(row.key_jp || row.label || key),
            default_label: String(row.label || key),
            menu_group: String(row.menu_group || 'custom')
          });
        });

        return ok({
          config: runtimeConfig,
          reservations,
          blocks: [],
          menu_master: menuMaster,
          menu_key_catalog: menuKeyCatalog,
          menu_group_catalog: menuGroupCatalog,
          auto_rule_catalog: autoRuleCatalog,
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

      if (request.method === 'POST' && path === '/verify') {
        const body = await request.json();
        const input = String(body && body.password || '').trim();
        const expected = getAdminPassword(env);
        if (!input) {
          return ng('パスワードを入力してください', 400);
        }
        if (expected && input !== expected) {
          return ng('パスワードが正しくありません', 401);
        }

        return ok({
          admin_token: `admin-${Date.now()}-${Math.floor(Math.random() * 100000)}`
        });
      }

      return ng('Not Found', 404);
    } catch (e) {
      return ng(e && e.message ? e.message : 'Internal Error', 500);
    }
  }
};
