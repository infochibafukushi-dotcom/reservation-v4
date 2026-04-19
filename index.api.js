const ADMIN_ICON_FILE_ID = '1a0QB8ei00w_lSfL4PnF_xuEFUC2JP6FW';
const GAS_URL = "https://script.google.com/macros/s/AKfycbyFKoCd64H2d5E8ExCrPRwG_g4shqlgHefgQYZrJ6HVOY5t5lwRVZ3UaXfYXIqNkCra/exec";
const ADMIN_PAGE_URL = "admin.html";

function toast(msg='通信エラー', ms=2200){
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=> el.style.display='none', ms);
}

let __loadingTimer = null;
function showLoading(show, text='読み込み中...'){
  const ov = document.getElementById('loadingOverlay');
  const tx = document.getElementById('loadingText');
  if (!ov || !tx) return;

  if (show){
    tx.textContent = text;
    clearTimeout(__loadingTimer);
    __loadingTimer = setTimeout(()=>{ ov.style.display = 'flex'; }, 180);
  } else {
    clearTimeout(__loadingTimer);
    ov.style.display = 'none';
  }
}

async function withLoading(fn, text){
  showLoading(true, text);
  try{
    return await fn();
  }finally{
    showLoading(false);
  }
}


function _appendCacheBust(url){
  const sep = String(url || '').includes('?') ? '&' : '?';
  return String(url || '') + sep + '_ts=' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
}

async function _fetchJsonGet(url, timeoutMs = 20000){
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(()=>{
    try{
      if (controller) controller.abort();
    }catch(_){ }
  }, timeoutMs);

  try{
    const res = await fetch(_appendCacheBust(url), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller ? controller.signal : undefined,
      credentials: 'omit'
    });

    if (!res.ok) {
      throw new Error('GET ' + res.status);
    }

    const text = await res.text();
    try{
      return JSON.parse(text);
    }catch(_){
      throw new Error('GET応答の解析に失敗しました');
    }
  }catch(err){
    if (String(err && err.name || '') === 'AbortError') {
      throw new Error('GET timeout');
    }
    throw err;
  }finally{
    clearTimeout(timer);
  }
}

function _jsonpCall(url, timeoutMs = 20000){
  return new Promise((resolve, reject)=>{
    const cbName = '__jsonp_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    const script = document.createElement('script');
    let done = false;

    function cleanup(){
      try{
        delete window[cbName];
      }catch(_){}
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    const timer = setTimeout(()=>{
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('JSONP timeout'));
    }, timeoutMs);

    window[cbName] = function(data){
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = function(){
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error('JSONP load error'));
    };

    const baseUrl = _appendCacheBust(url);
    const sep = baseUrl.includes('?') ? '&' : '?';
    script.src = baseUrl + sep + 'callback=' + encodeURIComponent(cbName);
    script.async = true;
    (document.head || document.body || document.documentElement).appendChild(script);
  });
}

async function _getJsonWithRetry(url, retryCount = 2, timeoutMs = 25000){
  let lastError = null;

  for (let i = 0; i <= retryCount; i++){
    try{
      return await _fetchJsonGet(url, timeoutMs);
    }catch(err){
      lastError = err;
      if (i < retryCount){
        await sleep(600 + (i * 500));
      }
    }
  }

  for (let i = 0; i <= retryCount; i++){
    try{
      return await _jsonpCall(url, timeoutMs);
    }catch(err){
      lastError = err;
      if (i < retryCount){
        await sleep(800 + (i * 700));
      }
    }
  }

  throw lastError || new Error('通信エラー');
}


async function _postJson(action, payload){
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: action,
      payload: payload || {}
    })
  });

  const text = await res.text();
  let data = null;

  try{
    data = JSON.parse(text);
  }catch(_){
    throw new Error('POST応答の解析に失敗しました');
  }

  return data;
}

const gsRun = async (func, ...args) => {
  try{
    let data;

    if (func === 'api_getConfig') {
      data = await _getJsonWithRetry(`${GAS_URL}?action=getConfig`, 1, 20000);
    } else if (func === 'api_getConfigPublic') {
      data = await _getJsonWithRetry(`${GAS_URL}?action=getConfigPublic`, 1, 20000);
    } else if (func === 'api_getPublicBootstrap') {
      data = await _getJsonWithRetry(`${GAS_URL}?action=getPublicBootstrap`, 1, 20000);
    } else if (func === 'api_getPublicBootstrapLite') {
      data = await _getJsonWithRetry(`${GAS_URL}?action=getPublicBootstrapLite`, 1, 15000);
    } else if (func === 'api_getPublicInitLite') {
      const range = args[0] || {};
      const start = encodeURIComponent(String(range.start || ''));
      const end = encodeURIComponent(String(range.end || ''));
      data = await _getJsonWithRetry(`${GAS_URL}?action=getPublicInitLite&start=${start}&end=${end}`, 1, 15000);
    } else if (func === 'api_getBlockedSlotKeys') {
      const range = args[0] || {};
      const start = encodeURIComponent(String(range.start || ''));
      const end = encodeURIComponent(String(range.end || ''));
      data = await _getJsonWithRetry(`${GAS_URL}?action=getBlockedSlotKeys&start=${start}&end=${end}`, 1, 20000);
    } else if (func === 'api_getInitData') {
      data = await _getJsonWithRetry(`${GAS_URL}?action=getInitData`, 1, 25000);
    } else if (func === 'api_getMenuMaster') {
      data = await _getJsonWithRetry(`${GAS_URL}?action=getMenuMaster`, 1, 20000);
    } else if (func === 'api_getMenuKeyCatalog') {
      data = await _getJsonWithRetry(`${GAS_URL}?action=getMenuKeyCatalog`, 1, 20000);
    } else if (func === 'api_getMenuGroupCatalog') {
      data = await _getJsonWithRetry(`${GAS_URL}?action=getMenuGroupCatalog`, 1, 20000);
    } else if (func === 'api_getAutoRuleCatalog') {
      data = await _getJsonWithRetry(`${GAS_URL}?action=getAutoRuleCatalog`, 1, 20000);
    } else if (func === 'api_getDriveImageDataUrl') {
      const fileId = args[0];
      data = await _getJsonWithRetry(`${GAS_URL}?action=getDriveImageDataUrl&fileId=${encodeURIComponent(fileId)}`, 1, 20000);
    } else if (func === 'api_createReservation') {
      data = await _postJson('createReservation', args[0]);
    } else if (func === 'api_verifyAdminPassword') {
      data = await _postJson('verifyAdminPassword', args[0]);
    } else {
      throw new Error(`未対応のAPIです: ${func}`);
    }

    if (data && data.isOk === false) {
      const msg = data.error || data.message || '通信エラー（isOk=false）';
      throw new Error(msg);
    }

    return data;
  }catch(e){
    throw new Error(e?.message || '通信エラー');
  }
};


const PUBLIC_BOOTSTRAP_CACHE_KEY = 'chiba_care_taxi_public_bootstrap_cache_v2';
const PUBLIC_BOOTSTRAP_LITE_CACHE_KEY = 'chiba_care_taxi_public_bootstrap_lite_cache_v1';
const PUBLIC_BLOCKED_CACHE_PREFIX = 'chiba_care_taxi_public_blocked_keys_v2__';
const PUBLIC_BOOTSTRAP_CACHE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_BLOCKED_CACHE_TTL_MS = 2 * 60 * 1000;

function _readLocalJson_(key){
  try{
    const raw = localStorage.getItem(String(key || ''));
    if (!raw) return null;
    return JSON.parse(raw);
  }catch(_){
    return null;
  }
}

function _writeLocalJson_(key, value){
  try{
    localStorage.setItem(String(key || ''), JSON.stringify(value));
  }catch(_){ }
}

function _isFreshCache_(entry, ttlMs){
  if (!entry || !entry.savedAt) return false;
  const age = Date.now() - Number(entry.savedAt || 0);
  return age >= 0 && age <= Number(ttlMs || 0);
}

function _applyBootstrapLiteData_(data){
  config = { ...defaultConfig, ...(data && data.config ? data.config : config || {}) };
  applyConfigToUI();
}

function _applyBootstrapData_(data){
  _applyBootstrapLiteData_(data || {});
  if (Array.isArray(data && data.menu_master)) {
    menuMaster = data.menu_master;
    if (typeof window !== 'undefined' && typeof window.invalidateMenuUiCaches === 'function') {
      window.invalidateMenuUiCaches();
    }
  }
  if (Array.isArray(data && data.menu_key_catalog)) {
    menuKeyCatalog = data.menu_key_catalog;
  }
  if (Array.isArray(data && data.menu_group_catalog) && data.menu_group_catalog.length) {
    menuGroupCatalog = data.menu_group_catalog;
  } else if (!Array.isArray(menuGroupCatalog) || !menuGroupCatalog.length) {
    menuGroupCatalog = defaultMenuGroupCatalog;
  }
  if (Array.isArray(data && data.auto_rule_catalog)) {
    autoRuleCatalog = data.auto_rule_catalog;
  }
  if (Array.isArray(menuMaster) && menuMaster.length) {
    renderServiceSelectors();
  }
}

function _saveBootstrapCache_(data){
  _writeLocalJson_(PUBLIC_BOOTSTRAP_CACHE_KEY, {
    savedAt: Date.now(),
    data: data || {}
  });
}

function _saveBootstrapLiteCache_(data){
  _writeLocalJson_(PUBLIC_BOOTSTRAP_LITE_CACHE_KEY, {
    savedAt: Date.now(),
    data: data || {}
  });
}

function _loadBootstrapCache_(){
  const entry = _readLocalJson_(PUBLIC_BOOTSTRAP_CACHE_KEY);
  if (!_isFreshCache_(entry, PUBLIC_BOOTSTRAP_CACHE_TTL_MS)) return false;
  if (!entry.data) return false;
  _applyBootstrapData_(entry.data);
  publicBootstrapLoaded = true;
  return true;
}

function _loadBootstrapLiteCache_(){
  const entry = _readLocalJson_(PUBLIC_BOOTSTRAP_LITE_CACHE_KEY);
  if (!_isFreshCache_(entry, PUBLIC_BOOTSTRAP_CACHE_TTL_MS)) return false;
  if (!entry.data) return false;
  _applyBootstrapLiteData_(entry.data);
  return true;
}

function _blockedCacheKey_(range){
  return PUBLIC_BLOCKED_CACHE_PREFIX + String(range.start || '') + '__' + String(range.end || '');
}

function _saveBlockedKeysCache_(range, keys){
  _writeLocalJson_(_blockedCacheKey_(range), {
    savedAt: Date.now(),
    range: range,
    keys: Array.isArray(keys) ? keys : []
  });
}

function _loadBlockedKeysCache_(range){
  const entry = _readLocalJson_(_blockedCacheKey_(range));
  if (!_isFreshCache_(entry, PUBLIC_BLOCKED_CACHE_TTL_MS)) return false;
  const keys = Array.isArray(entry.keys) ? entry.keys : [];
  blockedSlots = new Set(keys.map(v => String(v || '').trim()).filter(Boolean));
  reservedSlots = new Set();
  blockedRangeCacheKey = `${range.start}__${range.end}`;
  return true;
}

function hydratePublicCacheForFastPaint(){
  const bootLoaded = _loadBootstrapCache_() || _loadBootstrapLiteCache_();
  const range = getPublicCalendarRange();
  const blockedLoaded = _loadBlockedKeysCache_(range);
  return bootLoaded || blockedLoaded;
}

const TRIGGER_URL = 'https://script.google.com/macros/s/AKfycbxzM8EPlE-1hwHx6qwh4Q1jXgYa0nyc3_WtK0NYbYbcm5JExMJOi1zzjQocUhsoCuUQ/exec?secret=secret1';

function fireTrigger(payload){
  try{
    if (!TRIGGER_URL) return;
    const params = [];
    params.push('t=' + encodeURIComponent(String(Date.now())));
    Object.keys(payload || {}).forEach(key => {
      const val = payload[key] === undefined || payload[key] === null ? '' : String(payload[key]);
      params.push(encodeURIComponent(String(key)) + '=' + encodeURIComponent(val));
    });
    const url = TRIGGER_URL + (TRIGGER_URL.includes('?') ? '&' : '?') + params.join('&');
    try{
      fetch(url, { method:'GET', mode:'no-cors', cache:'no-store', keepalive:true }).catch(()=>{});
    }catch(_){ }
    try{
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    }catch(_){ }
  }catch(_){ }
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

let __publicCalendarRenderScheduled = false;
function schedulePublicCalendarRender(){
  if (__publicCalendarRenderScheduled) return;
  __publicCalendarRenderScheduled = true;

  const run = function(){
    __publicCalendarRenderScheduled = false;
    if (typeof renderCalendar !== 'function') return;
    try{ renderCalendar(); }catch(_){ }
  };

  if (typeof requestAnimationFrame === 'function'){
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

function ymdLocal(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function normalizeDateToYMD(v){
  if (!v && v !== 0) return '';
  if (v instanceof Date) return ymdLocal(v);

  const s = String(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);

  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m){
    const yy = m[1];
    const mm = String(Number(m[2])).padStart(2,'0');
    const dd = String(Number(m[3])).padStart(2,'0');
    return `${yy}-${mm}-${dd}`;
  }

  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return ymdLocal(dt);
  return s;
}

function formatDate(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['日','月','火','水','木','金','土'];
  return `${month}/${day}(${weekdays[date.getDay()]})`;
}

function formatDateForId(date, hour, minute) {
  const year = date.getFullYear();
  const month = String(date.getMonth()+1).padStart(2,'0');
  const day = String(date.getDate()).padStart(2,'0');
  const hourStr = String(hour).padStart(2,'0');
  const minuteStr = String(minute).padStart(2,'0');
  return `${year}${month}${day}${hourStr}${minuteStr}`;
}

function toLocalDateTime(dateStr, hour, minute){
  const [y,m,d] = String(dateStr).split('-').map(Number);
  return new Date(y, m-1, d, Number(hour), Number(minute||0), 0, 0);
}

function ceilToNext30Min(dt){
  const d = new Date(dt.getTime());
  d.setSeconds(0,0);
  const minute = d.getMinutes();
  if (minute === 0 || minute === 30) return d;
  if (minute < 30) {
    d.setMinutes(30, 0, 0);
    return d;
  }
  d.setHours(d.getHours() + 1);
  d.setMinutes(0, 0, 0);
  return d;
}

function escapeHtml(str){
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(fn, ms){
  let t = null;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), ms);
  };
}

let blockedSlots = new Set();
let reservedSlots = new Set();
let publicBootstrapLoaded = false;
let publicFullBootstrapPromise = null;
let blockedRangeCacheKey = '';
let selectedSlot = null;
let config = {};
let isExtendedView = false;
let menuMaster = [];
let menuKeyCatalog = [];
let menuGroupCatalog = [];
let autoRuleCatalog = [];
let calendarDates = [];
let hasBoundGridDelegation = false;

const defaultConfig = {
  main_title: '介護タクシー予約',
  logo_text: '介護タクシー予約',
  logo_subtext: '丁寧・安全な送迎をご提供します',
  logo_image_url: '',
  logo_drive_file_id: '',
  logo_use_drive_image: '0',
  logo_use_github_image: '1',
  logo_github_path: '',
  phone_notify_text: '090-6331-4289',
  same_day_enabled: '0',
  same_day_min_hours: '3',
  admin_tap_count: '5',
  max_forward_days: '30',
  extended_enabled: '1',
  form_modal_title: 'ご予約',
  form_privacy_text: 'ご入力いただいた個人情報は、ご予約の受付およびサービス提供に用いたします。同意の上チェックをお願いいたします。',
  form_basic_section_title: '基本情報',
  form_basic_section_badge: '必須項目',
  form_usage_type_label: 'ご利用区分',
  form_usage_type_placeholder: '選択してください',
  form_usage_type_option_first: '初めて',
  form_usage_type_option_repeat: '2回目以上',
  form_customer_name_label: 'お名前(カタカナ)',
  form_customer_name_placeholder: 'ヤマダ タロウ',
  form_phone_label: '連絡先(電話番号)',
  form_phone_placeholder: '090-1234-5678',
  form_pickup_label: 'お伺い場所または施設名',
  form_pickup_placeholder: '東京都渋谷区...',
  form_optional_section_title: '追加情報',
  form_optional_section_badge: '任意項目',
  form_destination_label: '送迎先住所または施設名',
  form_destination_placeholder: '病院、クリニック など',
  form_notes_label: 'ご要望・備考',
  form_notes_placeholder: 'その他ご要望があればご記入ください',
  form_service_section_title: 'サービス選択',
  form_service_section_badge: '必須項目',
  form_assistance_label: '介助内容',
  form_stair_label: '階段介助',
  form_equipment_label: '機材レンタル',
  form_round_trip_label: '往復送迎',
  form_price_section_title: '料金概算',
  form_price_total_label: '概算合計',
  form_price_notice_text: '上記料金に加え、距離運賃(2km以上200mごと/90円)が加算されます。また、時速10km以下の移行時は時間制運賃(1分30秒毎/90円)に切り替わります。',
  form_submit_button_text: '予約する',
  complete_title: 'ご予約ありがとう',
  complete_title_sub: 'ございます',
  complete_reservation_id_label: '予約ID',
  complete_phone_guide_prefix: '内容確認のため、以下の番号',
  complete_phone_guide_middle: 'よりお電話をさせていただきます。',
  complete_phone_guide_after: '確認が取れたら、正式な予約完了と致します。',
  complete_phone_guide_warning: 'お電話がつながらない場合、申し訳ございませんが自動キャンセルとさせていただく場合がございます。',
  complete_phone_guide_footer: 'あらかじめご了承ください。',
  complete_close_button_text: '閉じる',
  calendar_toggle_extended_text: '他時間予約',
  calendar_toggle_regular_text: '通常時間',
  calendar_legend_available: '◎ 予約可能',
  calendar_legend_unavailable: 'X 予約不可',
  calendar_scroll_guide_text: '上下・左右にスクロールして、他の日付や時間を確認できます。',
  warning_stair_bodyassist_text: '警告: 階段介助ご利用の場合、身体介助がセットになります',
  warning_wheelchair_damage_text: '警告: 車いす固定による傷、すり傷などは保証対象外になります',
  warning_stretcher_bodyassist_text: '警告: ストレッチャー利用時に2名体制介助料5,000円と身体介助が必須となります',
  rule_force_body_assist_on_stair: '1',
  rule_force_body_assist_on_stretcher: '0',
  rule_force_stretcher_staff2_on_stretcher: '0'
};

const defaultMenuGroupCatalog = [
  { key: 'price', label: '料金概算（基本料金）' },
  { key: 'assistance', label: '介助内容' },
  { key: 'stair', label: '階段介助' },
  { key: 'equipment', label: '機材レンタル' },
  { key: 'round_trip', label: '往復送迎' },
  { key: 'move_type', label: '移動方法' },
  { key: 'custom', label: 'その他（表示先なし）' },
  { key: 'auto_set', label: '自動セット' }
];


function getMenuMap(){
  const map = {};
  (menuMaster || []).forEach(item => {
    map[item.key] = item;
  });
  return map;
}

function findCatalogByKey(key){
  return (menuKeyCatalog || []).find(item => String(item.key || '') === String(key || '')) || null;
}

function getMenuPrice(key, fallback){
  const map = getMenuMap();
  if (map[key] && map[key].price !== undefined && map[key].price !== null && map[key].price !== '') {
    return Number(map[key].price || 0);
  }
  return Number(fallback || 0);
}

function getMenuLabel(key, fallback){
  const map = getMenuMap();
  if (map[key] && map[key].label) return String(map[key].label);
  const catalog = findCatalogByKey(key);
  if (catalog && catalog.default_label) return String(catalog.default_label);
  return fallback;
}

function getMenuNote(key, fallback){
  const map = getMenuMap();
  if (map[key] && map[key].note) return String(map[key].note);
  return fallback || '';
}

function getMenuAutoApplyGroupAt(key, slot){
  const suffix = Number(slot || 1) === 2 ? '_2' : '';
  const field = `auto_apply_group${suffix}`;
  const map = getMenuMap();
  if (map[key] && map[key][field] !== undefined) return String(map[key][field] || '');
  const catalog = findCatalogByKey(key);
  if (catalog && catalog[field] !== undefined) return String(catalog[field] || '');
  return '';
}

function getMenuAutoApplyKeyAt(key, slot){
  const suffix = Number(slot || 1) === 2 ? '_2' : '';
  const field = `auto_apply_key${suffix}`;
  const map = getMenuMap();
  if (map[key] && map[key][field] !== undefined) return String(map[key][field] || '');
  const catalog = findCatalogByKey(key);
  if (catalog && catalog[field] !== undefined) return String(catalog[field] || '');
  return '';
}

function getMenuAutoApplyGroup(key){
  return getMenuAutoApplyGroupAt(key, 1);
}

function getMenuAutoApplyKey(key){
  return getMenuAutoApplyKeyAt(key, 1);
}

function getMenuAutoApplyPairs(key){
  const pairs = [];
  for (let i = 1; i <= 2; i++) {
    const applyGroup = getMenuAutoApplyGroupAt(key, i);
    const applyKey = getMenuAutoApplyKeyAt(key, i);
    if (!applyGroup || !applyKey) continue;
    pairs.push({ apply_group: String(applyGroup || '').trim(), apply_key: String(applyKey || '').trim() });
  }
  return pairs;
}

function getItemsByGroup(group){
  const target = String(group || '').trim();
  return (menuMaster || []).filter(item => {
    const rawGroup = String(item.menu_group || '').trim();
    const key = String(item.key || '').trim();

    let matched = rawGroup === target;

    if (!matched && target === 'move_type'){
      matched = rawGroup === 'move_type' || (rawGroup === 'custom' && /^MOVE_/.test(key));
    }

    if (!matched && target === 'auto_set'){
      matched = rawGroup === 'auto_set' || (rawGroup === 'custom' && /AUTO_SET|STAFF_ADD/i.test(key));
    }

    if (!matched) return false;
    if (item.is_visible === false || String(item.is_visible).toUpperCase() === 'FALSE') return false;
    return true;
  }).sort((a,b) => {
    const aOrder = Number(a.sort_order || 9999);
    const bOrder = Number(b.sort_order || 9999);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.key || '').localeCompare(String(b.key || ''));
  });
}


function getRuleByIndex(index){
  return (autoRuleCatalog || []).find(rule => Number(rule.index) === Number(index)) || null;
}

function getRuleEnabled(index){
  const rule = getRuleByIndex(index);
  return !!(rule && rule.enabled);
}

function getAutoRuleByTrigger(targetGroup, triggerKey){
  return (autoRuleCatalog || []).find(rule => {
    if (!rule || !rule.enabled) return false;
    return String(rule.target || '') === String(targetGroup || '') && String(rule.trigger_key || '') === String(triggerKey || '');
  }) || null;
}

function getAllAutoRulesByTrigger(targetGroup, triggerKey){
  return (autoRuleCatalog || []).filter(rule => {
    if (!rule || !rule.enabled) return false;
    return String(rule.target || '') === String(targetGroup || '') && String(rule.trigger_key || '') === String(triggerKey || '');
  });
}

function rebuildBlockedSlotsFromSheet(blocks){
  blockedSlots = new Set();
  (blocks || []).forEach(b => {
    if (b.is_blocked === false || String(b.is_blocked).toUpperCase() === 'FALSE') return;

    const rawDate = b.block_date || b.date || b.slot_date;
    let date = normalizeDateToYMD(rawDate);

    let hour = Number(b.block_hour ?? b.hour ?? b.slot_hour);
    let minute = Number(b.block_minute ?? b.minute ?? b.slot_minute ?? 0);

    if ((!date || Number.isNaN(hour) || Number.isNaN(minute))){
      const k = String(b.slot_key || b.key || b.block_key || '').trim();
      const mm = k.match(/^(\d{4}-\d{2}-\d{2})-(\d{1,2})-(\d{1,2})$/);
      if (mm){
        date = date || mm[1];
        if (Number.isNaN(hour)) hour = Number(mm[2]);
        if (Number.isNaN(minute)) minute = Number(mm[3]);
      }
    }

    if (!date) return;
    if (Number.isNaN(hour)) return;
    if (Number.isNaN(minute)) minute = 0;

    blockedSlots.add(`${date}-${hour}-${minute}`);
  });
}

function reservationBlockSlots(r){
  const rt = String(r?.round_trip || '').trim();
  if (rt === '待機' || rt === '病院付き添い') return 4;
  return 2;
}

function rebuildReservedSlotsFromReservations(list){
  reservedSlots = new Set();
  (list || []).forEach(r=>{
    if (r.is_visible === false || r.is_visible === 'FALSE') return;
    if (r.status === 'キャンセル') return;

    const d = normalizeDateToYMD(r.slot_date);
    const h = Number(r.slot_hour);
    const m = Number(r.slot_minute || 0);
    if (!d || Number.isNaN(h) || Number.isNaN(m)) return;

    const start = toLocalDateTime(d, h, m);
    const slots = reservationBlockSlots(r);
    for (let i=0;i<slots;i++){
      const dt = new Date(start.getTime() + i * 30 * 60 * 1000);
      reservedSlots.add(`${ymdLocal(dt)}-${dt.getHours()}-${dt.getMinutes()}`);
    }
  });
}

function isSlotBlockedWithMinute(dateObj, hour, minute) {
  const key = `${ymdLocal(dateObj)}-${hour}-${minute}`;
  if (blockedSlots.has(key) || reservedSlots.has(key)) return true;

  const dateStr = ymdLocal(dateObj);
  if (String(config.same_day_enabled || '0') === '1') {
    const todayStr = ymdLocal(new Date());
    if (dateStr === todayStr) {
      const minHours = Number(config.same_day_min_hours || 3);
      const threshold = new Date(Date.now() + minHours * 60 * 60 * 1000);
      const rounded = ceilToNext30Min(threshold);
      const slotDt = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), Number(hour), Number(minute || 0), 0, 0);
      if (slotDt.getTime() < rounded.getTime()) return true;
    }
  }

  return false;
}



function _clonePublicInitLitePacket_(packet){
  try{
    return JSON.parse(JSON.stringify(packet || null));
  }catch(_){
    return packet ? { range: { ...(packet.range || {}) }, data: { ...(packet.data || {}) } } : null;
  }
}

let publicInitLitePrefetchPromise = null;
let publicInitLitePrefetchRangeKey = '';
let publicInitLitePrefetchData = null;

function invalidatePublicInitLitePrefetch(range){
  publicInitLitePrefetchPromise = null;
  publicInitLitePrefetchRangeKey = '';
  publicInitLitePrefetchData = null;

  blockedRangeCacheKey = '';

  try{
    const targetRange = range && range.start && range.end ? range : getPublicCalendarRange();
    if (targetRange && targetRange.start && targetRange.end){
      localStorage.removeItem(_blockedCacheKey_(targetRange));
    }
  }catch(_){ }
}

function _publicInitRangeKey_(range){
  const start = String(range && range.start || '').trim();
  const end = String(range && range.end || '').trim();
  if (!start || !end) return '';
  return `${start}__${end}`;
}

function getPrefetchedPublicInitLiteForRange(range){
  const key = _publicInitRangeKey_(range);
  if (!key) return null;
  if (publicInitLitePrefetchData && publicInitLitePrefetchRangeKey === key){
    return _clonePublicInitLitePacket_(publicInitLitePrefetchData);
  }
  return null;
}

function prefetchPublicInitLiteForCurrentRange(force=false){
  const range = getPublicCalendarRange();
  const key = _publicInitRangeKey_(range);
  if (!key) return Promise.resolve(null);

  if (!force){
    const cached = getPrefetchedPublicInitLiteForRange(range);
    if (cached) return Promise.resolve(cached);
    if (publicInitLitePrefetchPromise && publicInitLitePrefetchRangeKey === key){
      return publicInitLitePrefetchPromise;
    }
  }

  publicInitLitePrefetchRangeKey = key;
  publicInitLitePrefetchPromise = (async function(){
    const res = await gsRun('api_getPublicInitLite', range);
    if (!res || !res.isOk) throw new Error('public init lite failed');

    const packet = {
      range: { ...(range || {}) },
      data: res.data || {}
    };
    publicInitLitePrefetchData = _clonePublicInitLitePacket_(packet);
    return _clonePublicInitLitePacket_(packet);
  })();

  return publicInitLitePrefetchPromise.finally(()=>{
    if (publicInitLitePrefetchRangeKey === key){
      publicInitLitePrefetchPromise = null;
    }
  });
}

function getPublicCalendarRange(){
  try{
    if (typeof getDatesRange === 'function'){
      const dates = getDatesRange();
      if (Array.isArray(dates) && dates.length){
        return {
          start: ymdLocal(dates[0]),
          end: ymdLocal(dates[dates.length - 1])
        };
      }
    }
  }catch(_){ }

  const today = new Date();
  today.setHours(0,0,0,0);

  const daysPerPage = Math.max(7, Number(config.days_per_page || 7));
  const startOffset = String(config.same_day_enabled || '0') === '1' ? 0 : 1;

  const start = new Date(today);
  start.setDate(today.getDate() + startOffset);

  const end = new Date(start);
  end.setDate(start.getDate() + daysPerPage - 1);

  return {
    start: ymdLocal(start),
    end: ymdLocal(end)
  };
}

function _guessInitialPublicRange_(){
  const today = new Date();
  today.setHours(0,0,0,0);

  const startOffset = 1;
  const daysPerPage = 7;

  const start = new Date(today);
  start.setDate(today.getDate() + startOffset);

  const end = new Date(start);
  end.setDate(start.getDate() + daysPerPage - 1);

  return {
    start: ymdLocal(start),
    end: ymdLocal(end)
  };
}

function kickOffEarliestPublicInitLitePrefetch(){
  try{
    if (publicInitLitePrefetchPromise) return;

    const range = _guessInitialPublicRange_();
    const key = _publicInitRangeKey_(range);
    if (!key) return;

    publicInitLitePrefetchRangeKey = key;
    publicInitLitePrefetchPromise = (async function(){
      const res = await gsRun('api_getPublicInitLite', range);
      if (!res || !res.isOk) throw new Error('public init lite failed');

      const packet = {
        range: { ...(range || {}) },
        data: res.data || {}
      };
      publicInitLitePrefetchData = _clonePublicInitLitePacket_(packet);
      return _clonePublicInitLitePacket_(packet);
    })();

    publicInitLitePrefetchPromise.catch(()=> null).finally(()=>{
      if (publicInitLitePrefetchRangeKey === key){
        publicInitLitePrefetchPromise = null;
      }
    });
  }catch(_){ }
}

kickOffEarliestPublicInitLitePrefetch();

function _applyPublicInitLiteResponse_(payload, range, options){
  const opt = options && typeof options === 'object' ? options : {};
  const prevBlockedSlots = blockedSlots instanceof Set ? new Set(Array.from(blockedSlots)) : new Set();
  const prevBlockedRangeKey = String(blockedRangeCacheKey || '');

  const data = payload || {};
  _applyBootstrapLiteData_(data);
  _saveBootstrapLiteCache_({ config: data.config || {} });

  const keys = Array.isArray(data.slot_keys) ? data.slot_keys : (Array.isArray(data.keys) ? data.keys : []);
  blockedSlots = new Set((keys || []).map(v => String(v || '').trim()).filter(Boolean));
  reservedSlots = new Set();
  const normalizedRange = {
    start: String((data.start || (range && range.start) || '')).trim(),
    end: String((data.end || (range && range.end) || '')).trim()
  };
  blockedRangeCacheKey = `${normalizedRange.start}__${normalizedRange.end}`;
  _saveBlockedKeysCache_(normalizedRange, keys || []);

  if (opt.syncRenderedCalendar !== false){
    if (typeof patchRenderedCalendarBlockedStates === 'function'){
      try{
        patchRenderedCalendarBlockedStates({
          previousBlockedSlots: prevBlockedSlots,
          previousRangeKey: prevBlockedRangeKey,
          nextRangeKey: blockedRangeCacheKey
        });
      }catch(_){ }
    } else if (typeof renderCalendar === 'function'){
      try{
        if (typeof schedulePublicCalendarRender === 'function'){
          schedulePublicCalendarRender();
        } else {
          if (typeof requestAnimationFrame === 'function'){
            requestAnimationFrame(function(){ try{ renderCalendar(); }catch(_){ } });
          } else {
            setTimeout(function(){ try{ renderCalendar(); }catch(_){ } }, 0);
          }
        }
      }catch(_){ }
    }
  }
}

async function refreshBlockedSlotKeys(showToastOnFail=false){
  try{
    const range = getPublicCalendarRange();
    const cacheKey = `${range.start}__${range.end}`;

    const res = await gsRun('api_getBlockedSlotKeys', range);
    if (!res || !res.isOk) throw new Error('blocked keys failed');

    const keys = Array.isArray(res.data?.slot_keys) ? res.data.slot_keys : (Array.isArray(res.data?.keys) ? res.data.keys : []);
    blockedSlots = new Set((keys || []).map(v => String(v || '').trim()).filter(Boolean));
    reservedSlots = new Set();
    blockedRangeCacheKey = cacheKey;
    _saveBlockedKeysCache_(range, keys || []);
  }catch(e){
    const range = getPublicCalendarRange();
    if (_loadBlockedKeysCache_(range)) {
      return;
    }
    if (showToastOnFail) toast(e?.message || '通信エラー（空き枠取得）');
    throw e;
  }
}

async function ensureBlockedSlotsFresh(showToastOnFail=false, force=false){
  const range = getPublicCalendarRange();
  const cacheKey = `${range.start}__${range.end}`;
  if (!force && blockedRangeCacheKey === cacheKey && blockedSlots && blockedSlots.size >= 0) return;
  await refreshBlockedSlotKeys(showToastOnFail);
}

async function ensureFullPublicBootstrapLoaded(showToastOnFail=false){
  if (publicBootstrapLoaded && Array.isArray(menuMaster) && menuMaster.length) return true;
  if (publicFullBootstrapPromise) {
    try{
      await publicFullBootstrapPromise;
      return true;
    }catch(e){
      if (showToastOnFail) toast(e?.message || '通信エラー（フォーム初期化）');
      throw e;
    }
  }

  publicFullBootstrapPromise = (async function(){
    try{
      const bootRes = await gsRun('api_getPublicBootstrap');
      if (!bootRes || !bootRes.isOk) throw new Error('bootstrap failed');

      const data = bootRes.data || {};
      _applyBootstrapData_(data);
      _saveBootstrapCache_(data);
      publicBootstrapLoaded = true;
      return true;
    }catch(e){
      const recovered = _loadBootstrapCache_();
      if (recovered) return true;
      throw e;
    }finally{
      publicFullBootstrapPromise = null;
    }
  })();

  try{
    await publicFullBootstrapPromise;
    return true;
  }catch(e){
    if (showToastOnFail) toast(e?.message || '通信エラー（フォーム初期化）');
    throw e;
  }
}

async function refreshConfigPublic(){
  const res = await gsRun('api_getConfigPublic');
  if (res && res.isOk){
    config = { ...defaultConfig, ...(res.data || {}) };
    applyConfigToUI();
  }
}

async function refreshData(showToastOnFail=false){
  try{
    if (!publicBootstrapLoaded) {
      _loadBootstrapCache_();
    }
    if (!publicBootstrapLoaded) {
      _loadBootstrapLiteCache_();
    }

    const range = getPublicCalendarRange();
    let prefetched = typeof getPrefetchedPublicInitLiteForRange === 'function'
      ? getPrefetchedPublicInitLiteForRange(range)
      : null;

    if (!prefetched && typeof prefetchPublicInitLiteForCurrentRange === 'function') {
      try{
        prefetched = await prefetchPublicInitLiteForCurrentRange(false);
      }catch(_){ }
    }

    if (prefetched && prefetched.data) {
      _applyPublicInitLiteResponse_(prefetched.data || {}, prefetched.range || range);
      return;
    }

    const initRes = await gsRun('api_getPublicInitLite', range);
    if (!initRes || !initRes.isOk) throw new Error('public init lite failed');

    _applyPublicInitLiteResponse_(initRes.data || {}, range);
  }catch(e){
    const bootRecovered = _loadBootstrapCache_() || _loadBootstrapLiteCache_();
    const range = getPublicCalendarRange();
    const blockedRecovered = _loadBlockedKeysCache_(range);
    if (bootRecovered || blockedRecovered) {
      return;
    }
    if (showToastOnFail) toast(e?.message || '通信エラー（データ取得）');
    throw e;
  }
}

async function refreshAllData(showToastOnFail=false){
  await refreshData(showToastOnFail);
}
