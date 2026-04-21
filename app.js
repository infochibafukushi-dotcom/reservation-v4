const { API_BASE, ENDPOINTS } = window.APP_CONFIG;
const BLOCKS_API = `${API_BASE}${ENDPOINTS.getBlocks}`;
const UI_TEXTS_API = `${API_BASE}${ENDPOINTS.getUITexts}`;

const SLOT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

const el = {
  todaySlots: document.getElementById("todaySlots"),
  tomorrowSlots: document.getElementById("tomorrowSlots"),
  slotLoading: document.getElementById("slotLoading"),
  earliestBtn: document.getElementById("earliestBtn"),
  logoAdminTrigger: document.getElementById("logoAdminTrigger"),
  openAdminBtn: document.getElementById("openAdminBtn"),
  indexTitle: document.getElementById("indexTitle"),
  indexSubtitle: document.getElementById("indexSubtitle"),
  calendarNote: document.getElementById("calendarNote")
};

let openSlots = [];
let logoTapCount = 0;
let logoTapTimer = null;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatTime(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function isPast(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`).getTime() <= Date.now();
}

async function applyUITexts() {
  try {
    const res = await fetch(UI_TEXTS_API, { cache: "no-store" });
    const data = await res.json();
    const t = data.uiTexts || {};
    if (t.index_title && el.indexTitle) el.indexTitle.textContent = t.index_title;
    if (t.index_subtitle && el.indexSubtitle) el.indexSubtitle.textContent = t.index_subtitle;
    if (t.calendar_note && el.calendarNote) el.calendarNote.textContent = t.calendar_note;
  } catch {
    // no-op
  }
}

function openForm(date, time) {
  location.href = `form.html?date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;
}

function renderSlotList(container, date, blocks) {
  container.innerHTML = "";

  SLOT_HOURS.forEach((hour) => {
    const time = formatTime(hour);
    const blocked = blocks.has(`${date}_${time}`) || isPast(date, time);

    if (blocked) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-cta";
    btn.innerHTML = `<strong>${time}</strong><span>予約する</span>`;
    btn.addEventListener("click", () => openForm(date, time));
    container.appendChild(btn);

    openSlots.push({ date, time });
  });

  if (!container.children.length) {
    const p = document.createElement("p");
    p.className = "slot-empty";
    p.textContent = "空き枠がありません";
    container.appendChild(p);
  }
}

async function loadSlots() {
  el.slotLoading.classList.remove("hidden");
  openSlots = [];

  try {
    const res = await fetch(BLOCKS_API, { cache: "no-store" });
    const data = await res.json();
    const blocks = new Set((data.blocks || []).map((b) => `${b.date}_${b.time}`));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    renderSlotList(el.todaySlots, formatDate(today), blocks);
    renderSlotList(el.tomorrowSlots, formatDate(tomorrow), blocks);

    el.earliestBtn.disabled = openSlots.length === 0;
  } catch {
    el.todaySlots.innerHTML = '<p class="slot-empty">読み込みに失敗しました</p>';
    el.tomorrowSlots.innerHTML = '<p class="slot-empty">読み込みに失敗しました</p>';
    el.earliestBtn.disabled = true;
  } finally {
    el.slotLoading.classList.add("hidden");
  }
}

function openAdminPage() {
  window.location.href = "./admin.html";
}

function handleLogoTap() {
  logoTapCount += 1;
  if (logoTapTimer) clearTimeout(logoTapTimer);
  logoTapTimer = setTimeout(() => (logoTapCount = 0), 5000);
  if (logoTapCount >= 5) {
    logoTapCount = 0;
    openAdminPage();
  }
}

el.earliestBtn.addEventListener("click", () => {
  if (!openSlots.length) return;
  const first = openSlots[0];
  openForm(first.date, first.time);
});

if (el.logoAdminTrigger) el.logoAdminTrigger.addEventListener("click", handleLogoTap);
if (el.openAdminBtn) el.openAdminBtn.addEventListener("click", openAdminPage);

applyUITexts();
loadSlots();
