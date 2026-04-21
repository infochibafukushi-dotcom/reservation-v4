const { API_BASE, ENDPOINTS } = window.APP_CONFIG;

const API = {
  reservations: `${API_BASE}/api/getReservations`,
  cancelReservation: `${API_BASE}${ENDPOINTS.cancelReservation}`,
  getUITexts: `${API_BASE}${ENDPOINTS.getUITexts}`,
  setUITexts: `${API_BASE}/api/admin/setUITexts`,
  getBaseFees: `${API_BASE}${ENDPOINTS.baseFees}`,
  setBaseFees: `${API_BASE}${ENDPOINTS.baseFees}`,
  getMenu: `${API_BASE}${ENDPOINTS.getMenu}`,
  getBlocks: `${API_BASE}${ENDPOINTS.getBlocks}`,
  menuCreate: `${API_BASE}/api/admin/menu/create`,
  menuUpdate: `${API_BASE}/api/admin/menu/update`,
  menuDelete: `${API_BASE}/api/admin/menu/delete`,
  menuToggleHidden: `${API_BASE}/api/admin/menu/toggleHidden`,
  blockDay: `${API_BASE}/api/admin/blocks/day`,
  blockSlot: `${API_BASE}/api/admin/blocks/slot`
};

const uiTextDefaults = {
  index_title: "介護タクシー予約",
  index_subtitle: "丁寧・安全な送迎をご提供します",
  calendar_loading: "空き枠を読み込み中...",
  calendar_note: "※ 過去時間・満席枠は自動で予約不可になります。",
  form_title: "予約情報入力"
};

const adminBlockState = {
  weekOffset: 0,
  blocks: new Set()
};

function apiPost(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function slotKey(date, time) {
  return `${date}_${time}`;
}

function times() {
  const out = [];
  for (let h = 6; h <= 20; h++) {
    for (let m = 0; m <= 30; m += 30) {
      if (h === 20 && m > 0) continue;
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

function weekDays() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + adminBlockState.weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function dayFullyBlocked(dateStr) {
  return times().every(t => adminBlockState.blocks.has(slotKey(dateStr, t)));
}

async function login() {
  const pass = document.getElementById("password").value;
  if (pass !== "1234") {
    alert("パスワード違う");
    return;
  }
  document.getElementById("loginArea").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  renderAdmin();
}

async function renderAdmin() {
  document.getElementById("app").innerHTML = `
    <h2>UIテキスト編集</h2>
    <textarea id="uiTexts" style="width:100%;min-height:180px"></textarea>
    <div class="actions">
      <button class="btn" onclick="saveUITexts()">UIテキスト保存</button>
      <button class="btn btn--secondary" onclick="saveAllSettings()">設定をまとめて保存</button>
    </div>

    <h2>基本料金メニュー編集</h2>
    <div id="baseFeeEditor"></div>
    <div class="actions">
      <button class="btn btn--secondary" onclick="addBaseFeeItem()">料金項目を追加</button>
      <button class="btn" onclick="saveBaseFees()">基本料金保存</button>
    </div>
    <label>説明文<input id="baseNote"></label>

    <h2>メニュー管理</h2>
    <div id="menuList"></div>
    <h3>メニュー追加</h3>
    <label>名称<input id="newMenuName"></label>
    <label>価格<input id="newMenuPrice"></label>
    <label>カテゴリ
      <select id="newMenuCategory">
        <option value="vehicle">移動手段</option>
        <option value="assist">介助</option>
        <option value="stairs">階段介助</option>
        <option value="round">待機/付き添い</option>
      </select>
    </label>
    <button class="btn" onclick="createMenu()">追加</button>

    <h2>カレンダーブロック管理</h2>
    <div class="calendar-toolbar">
      <button class="btn btn--secondary" onclick="prevAdminWeek()">前週</button>
      <p id="adminRangeLabel" class="calendar-toolbar__range"></p>
      <button class="btn btn--secondary" onclick="nextAdminWeek()">次週</button>
    </div>
    <p class="calendar-note">日付ヘッダーを押すとその日を一括ブロック/解除。各◎/×で1コマ切替。</p>
    <div class="calendar-wrap"><table id="adminBlockCalendar" class="calendar"></table></div>

    <h2>予約一覧（キャンセル可）</h2>
    <div id="resList"></div>
  `;

  await loadUITexts();
  await loadBaseFees();
  await loadMenu();
  await loadBlocksAndRenderCalendar();
  await loadReservations();
}

async function saveAllSettings() {
  await saveUITexts(true);
  await saveBaseFees(true);
  alert("設定を保存しました");
}

async function loadUITexts() {
  const res = await fetch(API.getUITexts);
  const data = await res.json();
  const merged = { ...uiTextDefaults, ...(data.uiTexts || {}) };
  document.getElementById("uiTexts").value = JSON.stringify(merged, null, 2);
}

async function saveUITexts(silent = false) {
  try {
    const parsed = JSON.parse(document.getElementById("uiTexts").value || "{}");
    await apiPost(API.setUITexts, { uiTexts: parsed });
    if (!silent) alert("UIテキスト保存完了");
  } catch {
    if (!silent) alert("JSON形式が不正です");
    throw new Error("invalid json");
  }
}

async function loadBaseFees() {
  const res = await fetch(API.getBaseFees);
  const data = await res.json();
  const fees = data.baseFees || {};
  const items = Array.isArray(fees.items) && fees.items.length
    ? fees.items
    : [
        { id: "base", label: "基本運賃", price: Number(fees.baseFare ?? 2000), visible: true },
        { id: "dispatch", label: "予約配車料", price: Number(fees.dispatchFee ?? 500), visible: true },
        { id: "special", label: "特殊車両料", price: Number(fees.specialFee ?? 1000), visible: true }
      ];

  document.getElementById("baseFeeEditor").innerHTML = items.map((item, i) => `
    <div style="border:1px solid #ddd;padding:8px;margin-bottom:8px">
      <input id="fee_label_${i}" value="${item.label || ""}" placeholder="項目名">
      <input id="fee_price_${i}" value="${Number(item.price || 0)}" placeholder="価格">
      <label><input type="checkbox" id="fee_visible_${i}" ${item.visible !== false ? "checked" : ""}> 表示</label>
      <button class="btn btn--secondary" onclick="deleteBaseFeeItem(${i})">削除</button>
    </div>
  `).join("");

  document.getElementById("baseFeeEditor").dataset.count = String(items.length);
  document.getElementById("baseNote").value = fees.note ?? "走行距離・待機時間・追加介助により最終金額は変動する場合があります。";
}


function collectBaseFeeItems() {
  const count = Number(document.getElementById("baseFeeEditor").dataset.count || 0);
  const items = [];
  for (let i = 0; i < count; i++) {
    const labelEl = document.getElementById(`fee_label_${i}`);
    const priceEl = document.getElementById(`fee_price_${i}`);
    const visibleEl = document.getElementById(`fee_visible_${i}`);
    if (!labelEl || !priceEl || !visibleEl) continue;
    items.push({
      id: `fee_${i}_${Date.now()}`,
      label: labelEl.value,
      price: Number(priceEl.value || 0),
      visible: visibleEl.checked
    });
  }
  return items;
}

async function saveBaseFees(silent = false) {
  await apiPost(API.setBaseFees, {
    baseFees: {
      items: collectBaseFeeItems(),
      note: document.getElementById("baseNote").value || ""
    }
  });
  if (!silent) alert("基本料金保存完了");
}



function addBaseFeeItem() {
  const editor = document.getElementById("baseFeeEditor");
  const count = Number(editor.dataset.count || 0);
  const i = count;
  const div = document.createElement("div");
  div.style = "border:1px solid #ddd;padding:8px;margin-bottom:8px";
  div.innerHTML = `
    <input id="fee_label_${i}" value="新規料金" placeholder="項目名">
    <input id="fee_price_${i}" value="0" placeholder="価格">
    <label><input type="checkbox" id="fee_visible_${i}" checked> 表示</label>
    <button class="btn btn--secondary" onclick="deleteBaseFeeItem(${i})">削除</button>
  `;
  editor.appendChild(div);
  editor.dataset.count = String(count + 1);
}

function deleteBaseFeeItem(index) {
  const labelEl = document.getElementById(`fee_label_${index}`);
  if (!labelEl) return;
  const wrapper = labelEl.closest("div");
  if (wrapper) wrapper.remove();
}

async function loadMenu() {
  const res = await fetch(API.getMenu);
  const menu = await res.json();
  const rows = [];
  ["vehicle", "assist", "stairs", "round"].forEach(category => {
    (menu[category] || []).forEach(item => {
      rows.push(`
        <div style="border:1px solid #ddd;padding:8px;margin-bottom:8px">
          <input id="name_${item.id}" value="${item.name}">
          <input id="price_${item.id}" value="${item.price}">
          <select id="cat_${item.id}">
            <option value="vehicle" ${category === "vehicle" ? "selected" : ""}>移動手段</option>
            <option value="assist" ${category === "assist" ? "selected" : ""}>介助</option>
            <option value="stairs" ${category === "stairs" ? "selected" : ""}>階段介助</option>
            <option value="round" ${category === "round" ? "selected" : ""}>待機/付き添い</option>
          </select>
          <button class="btn" onclick="updateMenu(${item.id})">更新</button>
          <button class="btn btn--secondary" onclick="toggleMenuHidden(${item.id})">非表示/再表示</button>
          <button class="btn btn--secondary" onclick="deleteMenu(${item.id})">削除</button>
        </div>
      `);
    });
  });
  document.getElementById("menuList").innerHTML = rows.join("") || "メニューなし";
}

async function createMenu() {
  await apiPost(API.menuCreate, {
    name: document.getElementById("newMenuName").value,
    price: Number(document.getElementById("newMenuPrice").value || 0),
    category: document.getElementById("newMenuCategory").value
  });
  await loadMenu();
}

async function updateMenu(id) {
  await apiPost(API.menuUpdate, {
    id,
    name: document.getElementById(`name_${id}`).value,
    price: Number(document.getElementById(`price_${id}`).value || 0),
    category: document.getElementById(`cat_${id}`).value
  });
  await loadMenu();
}

async function deleteMenu(id) {
  await apiPost(API.menuDelete, { id });
  await loadMenu();
}

async function toggleMenuHidden(id) {
  await apiPost(API.menuToggleHidden, { id });
  await loadMenu();
}

async function loadBlocksAndRenderCalendar() {
  const res = await fetch(API.getBlocks, { cache: "no-store" });
  const data = await res.json();
  adminBlockState.blocks = new Set((data.blocks || []).map(b => slotKey(b.date, b.time)));
  renderAdminCalendar();
}

function renderAdminCalendar() {
  const days = weekDays();
  const table = document.getElementById("adminBlockCalendar");
  const range = document.getElementById("adminRangeLabel");
  range.textContent = `${formatDate(days[0])} - ${formatDate(days[6])}`;

  table.innerHTML = "";
  const head = document.createElement("tr");
  const c = document.createElement("th");
  c.textContent = "時間";
  head.appendChild(c);

  days.forEach(d => {
    const th = document.createElement("th");
    const ds = formatDate(d);
    th.innerHTML = `${d.getMonth() + 1}/${d.getDate()}`;
    th.style.cursor = "pointer";
    th.title = "この日を一括ブロック/解除";
    th.addEventListener("click", () => toggleDay(ds));
    head.appendChild(th);
  });
  table.appendChild(head);

  times().forEach(time => {
    const tr = document.createElement("tr");
    const t = document.createElement("td");
    t.className = "time-cell";
    t.textContent = time;
    tr.appendChild(t);

    days.forEach(d => {
      const ds = formatDate(d);
      const blocked = adminBlockState.blocks.has(slotKey(ds, time));
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.className = `slot ${blocked ? "slot--ng" : "slot--ok"}`;
      btn.textContent = blocked ? "×" : "◎";
      btn.addEventListener("click", () => toggleSlot(ds, time, blocked));
      td.appendChild(btn);
      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

async function toggleDay(date) {
  const fullBlocked = dayFullyBlocked(date);
  await apiPost(API.blockDay, { date, mode: fullBlocked ? "unblock" : "block" });
  await loadBlocksAndRenderCalendar();
}

async function toggleSlot(date, time, blocked) {
  await apiPost(API.blockSlot, { date, time, mode: blocked ? "unblock" : "block" });
  await loadBlocksAndRenderCalendar();
}

async function prevAdminWeek() {
  adminBlockState.weekOffset -= 1;
  renderAdminCalendar();
}

async function nextAdminWeek() {
  adminBlockState.weekOffset += 1;
  renderAdminCalendar();
}

async function loadReservations() {
  const res = await fetch(API.reservations);
  const list = await res.json();
  document.getElementById("resList").innerHTML = (list || []).map(r => `
    <div style="border:1px solid #ddd;padding:8px;margin-bottom:8px">
      ${r.reservation_datetime} / ${r.customer_name} / ${r.phone_number}<br>
      ${r.pickup_location} → ${r.destination}<br>
      <button class="btn" onclick="cancelReservation('${r.id}')">キャンセル</button>
    </div>
  `).join("") || "予約なし";
}

async function cancelReservation(id) {
  await apiPost(API.cancelReservation, { id });
  await loadBlocksAndRenderCalendar();
  await loadReservations();
}
