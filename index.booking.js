const bookingState = {
  selected: null,
  menuPrices: {
    moveType: { "車いす": 0, "ストレッチャー": 4000, "ご自身の車いす": 0 },
    assistanceType: { "乗降介助": 1500, "身体介助": 3000, "介助不要": 0 },
    stairAssistance: { "不要": 0, "見守り介助": 0, "2階移動": 3000, "3階移動": 5000, "4階移動": 7000 },
    roundTrip: { "片道": 0, "往復": 0, "待機": 1000, "病院付き添い": 1500 }
  }
};

function yen(n){ return `${Number(n || 0).toLocaleString("ja-JP")}円`; }

function updateEstimate(){
  const base = 2000 + 500;
  const ids = ["moveType", "assistanceType", "stairAssistance", "roundTrip"];
  const menu = ids.reduce((sum, id) => {
    const v = document.getElementById(id)?.value || "";
    return sum + Number(bookingState.menuPrices[id]?.[v] || 0);
  }, 0);
  document.getElementById("estimateTotal").textContent = yen(base + menu);
}

function setStep(step){
  const isMenu = step === "menu";
  document.getElementById("menuStep").classList.toggle("hidden", !isMenu);
  document.getElementById("infoStep").classList.toggle("hidden", isMenu);
  document.getElementById("stepMenuBadge").classList.toggle("active", isMenu);
  document.getElementById("stepInfoBadge").classList.toggle("active", !isMenu);
}

function openBookingForm(date, time){
  bookingState.selected = { date, time };
  document.getElementById("selectedSlotInfo").textContent = `${date} ${time} から`;
  document.getElementById("bookingModal").classList.remove("hidden");
  setStep("menu");
  updateEstimate();
}

function closeBookingForm(){
  document.getElementById("bookingModal").classList.add("hidden");
}

function validTel(tel){
  return /^0\d{9,10}$/.test(String(tel || "").replace(/-/g, ""));
}

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
    name,
    phone,
    date: bookingState.selected.date,
    time: bookingState.selected.time,
    pickup,
    destination,
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

document.addEventListener("DOMContentLoaded", () => {
  ["moveType","assistanceType","stairAssistance","roundTrip"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", updateEstimate);
  });
  document.getElementById("closeBookingBtn")?.addEventListener("click", closeBookingForm);
  document.getElementById("toInfoBtn")?.addEventListener("click", () => setStep("info"));
  document.getElementById("backToMenuBtn")?.addEventListener("click", () => setStep("menu"));
  document.getElementById("submitBookingBtn")?.addEventListener("click", submitBooking);
});
