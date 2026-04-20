const { API_BASE, ENDPOINTS } = window.APP_CONFIG;

const API = {
  reservations: `${API_BASE}/api/getReservations`,
  cancelReservation: `${API_BASE}${ENDPOINTS.cancelReservation}`,
  getUITexts: `${API_BASE}${ENDPOINTS.getUITexts}`,
  setUITexts: `${API_BASE}/api/admin/setUITexts`,
  getBaseFees: `${API_BASE}${ENDPOINTS.baseFees}`,
  setBaseFees: `${API_BASE}${ENDPOINTS.baseFees}`,
  getMenu: `${API_BASE}${ENDPOINTS.getMenu}`,
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

function apiPost(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(r => r.json());
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
    <button class="btn" onclick="saveUITexts()">UIテキスト保存</button>

    <h2>基本料金編集</h2>
    <label>基本運賃<input id="baseFare"></label>
    <label>予約配車料<input id="dispatchFee"></label>
    <label>特殊車両料<input id="specialFee"></label>
    <label>説明文<input id="baseNote"></label>
    <button class="btn" onclick="saveBaseFees()">基本料金保存</button>

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
    <label>日付<input type="date" id="blockDate"></label>
    <label>時間<input type="time" id="blockTime" step="1800"></label>
    <div class="actions">
      <button class="btn" onclick="blockDay()">1日全体ブロック</button>
      <button class="btn btn--secondary" onclick="unblockDay()">1日全体ブロック解除</button>
      <button class="btn" onclick="blockSlot()">1コマブロック</button>
      <button class="btn btn--secondary" onclick="unblockSlot()">1コマ解除</button>
    </div>

    <h2>予約一覧（キャンセル可）</h2>
    <div id="resList"></div>
  `;

  await loadUITexts();
  await loadBaseFees();
  await loadMenu();
  await loadReservations();
}

async function loadUITexts() {
  const res = await fetch(API.getUITexts);
  const data = await res.json();
  const merged = { ...uiTextDefaults, ...(data.uiTexts || {}) };
  document.getElementById("uiTexts").value = JSON.stringify(merged, null, 2);
}

async function saveUITexts() {
  try {
    const parsed = JSON.parse(document.getElementById("uiTexts").value || "{}");
    await apiPost(API.setUITexts, { uiTexts: parsed });
    alert("UIテキスト保存完了");
  } catch {
    alert("JSON形式が不正です");
  }
}

async function loadBaseFees() {
  const res = await fetch(API.getBaseFees);
  const data = await res.json();
  const fees = data.baseFees || {};
  document.getElementById("baseFare").value = fees.baseFare ?? 2000;
  document.getElementById("dispatchFee").value = fees.dispatchFee ?? 500;
  document.getElementById("specialFee").value = fees.specialFee ?? 1000;
  document.getElementById("baseNote").value = fees.note ?? "走行距離・待機時間・追加介助により最終金額は変動する場合があります。";
}

async function saveBaseFees() {
  await apiPost(API.setBaseFees, {
    baseFees: {
      baseFare: Number(document.getElementById("baseFare").value || 0),
      dispatchFee: Number(document.getElementById("dispatchFee").value || 0),
      specialFee: Number(document.getElementById("specialFee").value || 0),
      note: document.getElementById("baseNote").value || ""
    }
  });
  alert("基本料金保存完了");
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

async function blockDay() {
  await apiPost(API.blockDay, { date: document.getElementById("blockDate").value, mode: "block" });
  alert("1日ブロック完了");
}

async function unblockDay() {
  await apiPost(API.blockDay, { date: document.getElementById("blockDate").value, mode: "unblock" });
  alert("1日ブロック解除完了");
}

async function blockSlot() {
  await apiPost(API.blockSlot, {
    date: document.getElementById("blockDate").value,
    time: document.getElementById("blockTime").value,
    mode: "block"
  });
  alert("1コマブロック完了");
}

async function unblockSlot() {
  await apiPost(API.blockSlot, {
    date: document.getElementById("blockDate").value,
    time: document.getElementById("blockTime").value,
    mode: "unblock"
  });
  alert("1コマブロック解除完了");
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
  await loadReservations();
}
