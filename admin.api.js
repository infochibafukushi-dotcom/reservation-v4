const GAS_URL = "https://script.google.com/macros/s/AKfycbyFKoCd64H2d5E8ExCrPRwG_g4shqlgHefgQYZrJ6HVOY5t5lwRVZ3UaXfYXIqNkCra/exec";
const PUBLIC_PAGE_URL = "index.html";

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
      try{ delete window[cbName]; }catch(_){}
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
  const adminToken = String(sessionStorage.getItem('chiba_care_taxi_admin_token') || '').trim();
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: action,
      payload: payload || {},
      admin_token: adminToken
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
  let data = null;

  if (func === 'api_getConfig') {
    data = await _getJsonWithRetry(`${GAS_URL}?action=getConfig`, 1, 20000);
  } else if (func === 'api_getInitData') {
    data = await _getJsonWithRetry(`${GAS_URL}?action=getInitData`, 1, 25000);
  } else if (func === 'api_getAdminBootstrap') {
    data = await _getJsonWithRetry(`${GAS_URL}?action=getAdminBootstrap`, 1, 25000);
  } else if (func === 'api_getReservationsRange') {
    const range = args[0] || {};
    const start = encodeURIComponent(String(range.start || ''));
    const end = encodeURIComponent(String(range.end || ''));
    data = await _getJsonWithRetry(`${GAS_URL}?action=getReservationsRange&start=${start}&end=${end}`, 1, 25000);
  } else if (func === 'api_getBlocksRange') {
    const range = args[0] || {};
    const start = encodeURIComponent(String(range.start || ''));
    const end = encodeURIComponent(String(range.end || ''));
    data = await _getJsonWithRetry(`${GAS_URL}?action=getBlocksRange&start=${start}&end=${end}`, 1, 25000);
  } else if (func === 'api_getMenuMaster') {
    data = await _getJsonWithRetry(`${GAS_URL}?action=getMenuMaster`, 1, 20000);
  } else if (func === 'api_getMenuKeyCatalog') {
    data = await _getJsonWithRetry(`${GAS_URL}?action=getMenuKeyCatalog`, 1, 20000);
  } else if (func === 'api_getMenuGroupCatalog') {
    data = await _getJsonWithRetry(`${GAS_URL}?action=getMenuGroupCatalog`, 1, 20000);
  } else if (func === 'api_getAutoRuleCatalog') {
    data = await _getJsonWithRetry(`${GAS_URL}?action=getAutoRuleCatalog`, 1, 20000);
  } else if (func === 'api_toggleBlock') {
    data = await _postJson('toggleBlock', args[0]);
  } else if (func === 'api_setRegularDayBlocked') {
    data = await _postJson('setRegularDayBlocked', args[0]);
  } else if (func === 'api_setOtherTimeDayBlocked') {
    data = await _postJson('setOtherTimeDayBlocked', args[0]);
  } else if (func === 'api_updateReservation') {
    data = await _postJson('updateReservation', args[0]);
  } else if (func === 'api_saveConfig') {
    data = await _postJson('saveConfig', args[0]);
  } else if (func === 'api_saveMenuMaster') {
    data = await _postJson('saveMenuMaster', args[0]);
  } else if (func === 'api_uploadLogoImage') {
    data = await _postJson('uploadLogoImage', args[0]);
  } else if (func === 'api_changeAdminPassword') {
    data = await _postJson('changeAdminPassword', args[0]);
  } else {
    throw new Error(`未対応のAPIです: ${func}`);
  }

  if (data && data.isOk === false) {
    throw new Error(data.error || data.message || '通信エラー');
  }

  return data;
};

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
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

let adminConfig = {};
let adminReservations = [];
let adminBlocks = [];
let adminMenuMaster = [];
let adminMenuKeyCatalog = [];
let adminMenuGroupCatalog = [];
let adminAutoRuleCatalog = [];
let adminCalendarDates = [];
let adminBlockedSlots = new Set();
let adminReservedSlots = new Set();
let adminExtendedView = false;
let adminCurrentReservation = null;
let hasBoundAdminGridDelegation = false;

const ADMIN_DEFAULT_CONFIG = {
  logo_text: '介護タクシー予約',
  logo_subtext: '丁寧・安全な送迎をご提供します',
  logo_image_url: '',
  logo_use_github_image: '1',
  phone_notify_text: '090-6331-4289',
  same_day_enabled: '0',
  same_day_min_hours: '3',
  admin_panels_collapsed_default: '1',
  warning_stair_bodyassist_text: '警告: 階段介助ご利用の場合、身体介助がセットになります',
  warning_wheelchair_damage_text: '警告: 車いす固定による傷、すり傷などは保証対象外になります',
  warning_stretcher_bodyassist_text: '警告: ストレッチャー利用時に2名体制介助料5,000円と身体介助が必須となります',
  complete_title: 'ご予約ありがとう'
};

const ADMIN_MENU_GROUPS = [
  { key: 'price', label: '料金概算（基本料金）' },
  { key: 'assistance', label: '介助内容' },
  { key: 'stair', label: '階段介助' },
  { key: 'equipment', label: '機材レンタル' },
  { key: 'round_trip', label: '往復送迎' },
  { key: 'move_type', label: '移動方法' },
  { key: 'custom', label: 'その他（表示先なし）' }
];


function safeJsonParse(text, fallback){
  try{
    const parsed = JSON.parse(String(text || ''));
    return parsed === undefined || parsed === null ? fallback : parsed;
  }catch(_){
    return fallback;
  }
}

function getAdminResolvedGroupCatalog(){
  const baseCatalog = Array.isArray(adminMenuGroupCatalog) && adminMenuGroupCatalog.length
    ? adminMenuGroupCatalog
    : ADMIN_MENU_GROUPS;

  const savedCatalog = safeJsonParse(adminConfig && adminConfig.menu_group_catalog_json, []);
  const map = {};

  (baseCatalog || []).forEach(group => {
    const key = String(group && group.key || '').trim();
    if (!key) return;
    map[key] = {
      key: key,
      label: String(group && group.label || key).trim()
    };
  });

  (savedCatalog || []).forEach(group => {
    const key = String(group && group.key || '').trim();
    if (!key) return;
    map[key] = {
      key: key,
      label: String(group && group.label || map[key]?.label || key).trim()
    };
  });

  return Object.keys(map).map(key => map[key]);
}

function getAdminGroupLabel(key){
  const found = getAdminResolvedGroupCatalog().find(g => String(g.key) === String(key));
  return found ? found.label : key;
}

function adminFindCatalogByKey(key){
  return (adminMenuKeyCatalog || []).find(item => String(item.key || '') === String(key || '')) || null;
}

function adminMenuMap(){
  const map = {};
  (adminMenuMaster || []).forEach(item => {
    map[item.key] = item;
  });
  return map;
}

function buildAdminBlockedSlots(blocks){
  adminBlockedSlots = new Set();
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

    if (!date || Number.isNaN(hour)) return;
    if (Number.isNaN(minute)) minute = 0;

    adminBlockedSlots.add(`${date}-${hour}-${minute}`);
  });
}

function adminReservationBlockSlots(r){
  const rt = String(r?.round_trip || '').trim();
  if (rt === '待機' || rt === '病院付き添い') return 4;
  return 2;
}

function buildAdminReservedSlots(list){
  adminReservedSlots = new Set();
  (list || []).forEach(r=>{
    if (r.is_visible === false || String(r.is_visible).toUpperCase() === 'FALSE') return;
    if (String(r.status || '') === 'キャンセル') return;

    const d = normalizeDateToYMD(r.slot_date);
    const h = Number(r.slot_hour);
    const m = Number(r.slot_minute || 0);
    if (!d || Number.isNaN(h) || Number.isNaN(m)) return;

    const start = new Date(`${d}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
    const slots = adminReservationBlockSlots(r);
    for (let i=0;i<slots;i++){
      const dt = new Date(start.getTime() + i * 30 * 60 * 1000);
      adminReservedSlots.add(`${ymdLocal(dt)}-${dt.getHours()}-${dt.getMinutes()}`);
    }
  });
}

function getAdminStatusBadge(status){
  if (status === '確認済') return 'badge-confirmed';
  if (status === '完了') return 'badge-completed';
  if (status === 'キャンセル') return 'badge-cancelled';
  return 'badge-pending';
}
