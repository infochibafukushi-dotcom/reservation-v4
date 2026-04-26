const bookingState = {
  selected: null,
  menu: null,
  baseFees: null
};

function yen(n){ return `${Number(n || 0).toLocaleString("ja-JP")}円`; }

async function loadMenuForBooking(){
  try {
    bookingState.menu = await apiGet(ENDPOINTS.getMenu);
  } catch {
    bookingState.menu = fallbackMenu();
  }

  try {
    const fees = await apiGet(ENDPOINTS.baseFees);
    bookingState.baseFees = fees.baseFees || fallbackBaseFees();
  } catch {
    bookingState.baseFees = fallbackBaseFees();
  }

  renderBaseFees();
  fillSelect("moveType", bookingState.menu.vehicle || []);
  fillSelect("assistanceType", bookingState.menu.assist || []);
  fillSelect("stairAssistance", bookingState.menu.stairs || []);
  fillSelect("roundTrip", bookingState.menu.round || []);
  updateEstimate();
}

function fallbackBaseFees(){
  return {
    items: [
      { id: "base", label: "基本運賃", price: 2000, visible: true },
      { id: "dispatch", label: "予約配車料", price: 500, visible: true }
    ],
    note: "走行距離・待機時間・追加介助により最終金額は変動する場合があります。"
  };
}

function fallbackMenu(){
  return {
    vehicle:[{name:"車いす",price:0},{name:"ストレッチャー",price:4000},{name:"ご自身の車いす",price:0}],
    assist:[{name:"乗降介助",price:1500},{name:"身体介助",price:3000},{name:"介助不要",price:0}],
    stairs:[{name:"不要",price:0},{name:"見守り介助",price:0},{name:"2階移動",price:3000},{name:"3階移動",price:5000}],
    round:[{name:"片道",price:0},{name:"往復",price:0},{name:"待機",price:1000},{name:"病院付き添い",price:1500}]
  };
}

function renderBaseFees(){
  const fees = bookingState.baseFees || fallbackBaseFees();
  const items = (fees.items || []).filter(x => x.visible !== false);
  const wrap = document.getElementById("baseFeeList");
  wrap.innerHTML = items.map(item => `<p><strong>${escapeHtml(item.label)}</strong> <span>${yen(item.price)}</span></p>`).join("");
  document.getElementById("baseFeeNote").textContent = `※ ${fees.note || ""}`;
}

function fillSelect(id, items){
  const el = document.getElementById(id);
  el.innerHTML = (items || []).map(item => `<option value="${escapeHtml(item.name)}" data-price="${Number(item.price||0)}">${escapeHtml(item.name)}${Number(item.price||0) ? `（+${Number(item.price||0).toLocaleString()}円）` : ""}</option>`).join("");
}

function selectedPrice(id){
  const el = document.getElementById(id);
  const opt = el?.options?.[el.selectedIndex];
  return Number(opt?.dataset?.price || 0);
}

function updateEstimate(){
  const fees = bookingState.baseFees || fallbackBaseFees();
  const base = (fees.items || []).filter(x => x.visible !== false).reduce((sum, x) => sum + Number(x.price || 0), 0);
  const menu = selectedPrice("moveType") + selectedPrice("assistanceType") + selectedPrice("stairAssistance") + selectedPrice("roundTrip");
  document.getElementById("estimateTotal").textContent = yen(base + menu);
}

function setStep(step){
  const isMenu = step === "menu";
  document.getElementById("menuStep").classList.toggle("hidden", !isMenu);
  document.getElementById("infoStep").classList.toggle("hidden", isMenu);
  document.getElementById("stepMenuBadge").classList.toggle("active", isMenu);
  document.getElementById("stepInfoBadge").classList.toggle("active", !isMenu);
}

async function openBookingForm(date, time){
  bookingState.selected = { date, time };
  document.getElementById("selectedSlotInfo").textContent = `${date} ${time} から`;
  document.getElementById("bookingModal").classList.remove("hidden");
  setStep("menu");
  await loadMenuForBooking();
}

function closeBookingForm(){ document.getElementById("bookingModal").classList.add("hidden"); }
function validTel(tel){ return /^0\d{9,10}$/.test(String(tel || "").replace(/-/g, "")); }

async function submitBooking(){
  if (!bookingState.selected) return toast("日時を選択してください");
  const name = document.getElementById("customerName").value.trim();
  const phone = document.getElementById("customerPhone").value.replace(/-/g, "").trim();
  const pickup = document.getElementById("pickupLocation").value.trim();
  const destination = document.getElementById("destination").value.trim();

  if (!name || !phone || !pickup) return toast("必須項目を入力してください");
  if (!validTel(phone)) return toast("電話番号形式が正しくありません");
  if (!document.getElementById("agree").checked) return toast("個人情報の取扱いに同意してください");

  const payload = {
    name, phone,
    date: bookingState.selected.date,
    time: bookingState.selected.time,
    pickup, destination,
    vehicle: document.getElementById("moveType").value,
    assist: document.getElementById("assistanceType").value,
    stairs: document.getElementById("stairAssistance").value,
    roundTrip: document.getElementById("roundTrip").value,
    notes: document.getElementById("notes").value.trim(),
    estimate: document.getElementById("estimateTotal").textContent
  };

  try{
    document.getElementById("submitBookingBtn").disabled = true;
    const res = await apiPost(ENDPOINTS.createReservation, payload);
    if (!res.success) throw new Error(res.message || "予約に失敗しました");
    closeBookingForm();
    toast("予約を受け付けました");
    await loadCalendarData();
  }catch(e){
    toast(e.message || "通信エラー");
  }finally{
    document.getElementById("submitBookingBtn").disabled = false;
  }
}

function escapeHtml(v){
  return String(v ?? "").replace(/[&<>"']/g, s => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s]));
}

document.addEventListener("DOMContentLoaded", () => {
  ["moveType","assistanceType","stairAssistance","roundTrip"].forEach(id => document.getElementById(id)?.addEventListener("change", updateEstimate));
  document.getElementById("closeBookingBtn")?.addEventListener("click", closeBookingForm);
  document.getElementById("toInfoBtn")?.addEventListener("click", () => setStep("info"));
  document.getElementById("backToMenuBtn")?.addEventListener("click", () => setStep("menu"));
  document.getElementById("submitBookingBtn")?.addEventListener("click", submitBooking);
});
