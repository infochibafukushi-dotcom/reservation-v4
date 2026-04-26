const adminState = {
  authed: false,
  page: 0,
  blocks: [],
  blockSet: new Set()
};

function adminDates(){
  const today = new Date();
  today.setHours(0,0,0,0);
  return Array.from({length:7}, (_, i) => addDays(today, adminState.page * 7 + i));
}
function adminTimes(){
  const out = [];
  for (let h=6; h<=21; h++){
    for (let m=0; m<60; m+=30){
      if (h === 21 && m > 0) continue;
      out.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return out;
}

async function adminLogin(){
  const password = document.getElementById("adminPassword").value.trim();
  try{
    const res = await apiPost(ENDPOINTS.login, { password });
    if (!res.success) return toast("パスワードが違います");
    adminState.authed = true;
    sessionStorage.setItem("admin_auth", "1");
    document.getElementById("loginArea").classList.add("hidden");
    document.getElementById("adminView").classList.remove("hidden");
    await adminLoadAll();
  }catch(e){
    toast(e.message || "ログイン失敗");
  }
}

async function adminLoadAll(){
  await adminLoadBlocks();
  await adminLoadReservations();
}

async function adminLoadBlocks(){
  const data = await apiGet(ENDPOINTS.getBlocks);
  adminState.blocks = data.blocks || [];
  adminState.blockSet = new Set(adminState.blocks.map(b => slotKey(b.date, b.time)));
  adminRenderCalendar();
}

function adminRenderCalendar(){
  const grid = document.getElementById("adminCalendarGrid");
  const range = document.getElementById("adminDateRange");
  const dates = adminDates();
  const times = adminTimes();

  applyGridColumns(grid, dates.length);
  grid.innerHTML = "";
  range.textContent = `${formatDate(dates[0]).replaceAll("-","/")} - ${formatDate(dates[6]).slice(5).replace("-","/")}`;

  const corner = document.createElement("div");
  corner.className = "time-label";
  corner.textContent = "時間";
  grid.appendChild(corner);

  dates.forEach(d => {
    const date = formatDate(d);
    const h = document.createElement("button");
    h.className = `date-header ${[0,6].includes(d.getDay()) ? "weekend" : ""}`;
    h.innerHTML = `<span>${d.getMonth()+1}/${d.getDate()}</span><small>${jaDay(d)}</small>`;
    h.addEventListener("click", () => toggleDay(date));
    grid.appendChild(h);
  });

  times.forEach(time => {
    const t = document.createElement("div");
    t.className = "time-label";
    t.textContent = time;
    grid.appendChild(t);

    dates.forEach(d => {
      const date = formatDate(d);
      const blocked = adminState.blockSet.has(slotKey(date, time));
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `slot-cell ${blocked ? "slot-ng" : "slot-ok"}`;
      cell.textContent = blocked ? "×" : "◎";
      cell.addEventListener("click", () => toggleSlot(date, time, blocked));
      grid.appendChild(cell);
    });
  });

  document.getElementById("adminPrevWeek").disabled = adminState.page <= 0;
}

async function toggleSlot(date, time, blocked){
  await apiPost(ENDPOINTS.blockSlot, { date, time, mode: blocked ? "unblock" : "block" });
  await adminLoadBlocks();
}

async function toggleDay(date){
  await apiPost(ENDPOINTS.blockDay, { date, mode: "toggle" });
  await adminLoadBlocks();
}

async function adminLoadReservations(){
  const data = await apiGet(ENDPOINTS.getReservations);
  const list = document.getElementById("reservationList");
  list.innerHTML = (data || []).map(r => `
    <div class="res-row">
      <strong>${escapeHtml(r.name || r.customer_name || "")}</strong>
      <div>${escapeHtml(r.phone || r.phone_number || "")}</div>
      <div>${escapeHtml(r.date || "")} ${escapeHtml(r.time || "")}</div>
      <div>${escapeHtml(r.pickup || r.pickup_location || "")} → ${escapeHtml(r.destination || "")}</div>
      <div>${escapeHtml(r.vehicle || "")} / ${escapeHtml(r.assist || "")} / ${escapeHtml(r.stairs || "")} / ${escapeHtml(r.roundTrip || r.round_trip || "")}</div>
      <button class="secondary-btn" onclick="cancelReservation('${escapeHtml(r.id)}')">キャンセル</button>
    </div>
  `).join("") || "予約なし";
}

async function cancelReservation(id){
  if (!confirm("キャンセルしますか？")) return;
  await apiPost(ENDPOINTS.cancelReservation, { id });
  await adminLoadAll();
}

function escapeHtml(v){
  return String(v ?? "").replace(/[&<>"']/g, s => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s]));
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loginBtn").addEventListener("click", adminLogin);
  document.getElementById("adminPassword").addEventListener("keydown", e => { if(e.key === "Enter") adminLogin(); });
  document.getElementById("refreshAdminBtn").addEventListener("click", adminLoadAll);
  document.getElementById("adminPrevWeek").addEventListener("click", () => { adminState.page = Math.max(0, adminState.page - 1); adminLoadBlocks(); });
  document.getElementById("adminNextWeek").addEventListener("click", () => { adminState.page += 1; adminLoadBlocks(); });

  if (sessionStorage.getItem("admin_auth") === "1") {
    adminState.authed = true;
    document.getElementById("loginArea").classList.add("hidden");
    document.getElementById("adminView").classList.remove("hidden");
    adminLoadAll();
  }
});
