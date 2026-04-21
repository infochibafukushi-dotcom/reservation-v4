const { API_BASE, ENDPOINTS } = window.APP_CONFIG;
const BLOCKS_API = `${API_BASE}${ENDPOINTS.getBlocks}`;
const UI_TEXTS_API = `${API_BASE}${ENDPOINTS.getUITexts}`;

const DAYS_PER_PAGE = 7;
const SLOT_MINUTES = 30;
const STANDARD_START_HOUR = 6;
const STANDARD_END_HOUR = 20;
const FULL_START_HOUR = 0;
const FULL_END_HOUR = 23;
const BLOCKS_CACHE_KEY = "reservation_blocks_cache_v1";

const state = {
  weekOffset: 0,
  blockSet: new Set(),
  fullDay: false
};

const el = {
  calendar: document.getElementById("calendar"),
  rangeLabel: document.getElementById("rangeLabel"),
  prevWeek: document.getElementById("prevWeek"),
  nextWeek: document.getElementById("nextWeek"),
  loading: document.getElementById("calendarLoading"),
  modeToggleBtn: document.getElementById("modeToggleBtn"),
  logoAdminTrigger: document.getElementById("logoAdminTrigger"),
  indexTitle: document.getElementById("indexTitle"),
  indexSubtitle: document.getElementById("indexSubtitle"),
  loadingText: document.getElementById("loadingText"),
  calendarNote: document.getElementById("calendarNote"),
  openAdminBtn: document.getElementById("openAdminBtn")
};



async function applyUITexts() {
  try {
    const res = await fetch(UI_TEXTS_API, { cache: "no-store" });
    const data = await res.json();
    const t = data.uiTexts || {};
    if (t.index_title && el.indexTitle) el.indexTitle.textContent = t.index_title;
    if (t.index_subtitle && el.indexSubtitle) el.indexSubtitle.textContent = t.index_subtitle;
    if (t.calendar_loading && el.loadingText) el.loadingText.textContent = t.calendar_loading;
    if (t.calendar_note && el.calendarNote) el.calendarNote.textContent = t.calendar_note;
  } catch (e) {
    // no-op
  }
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function pad(v) {
  return String(v).padStart(2, "0");
}

function formatTime(hours, minutes) {
  return `${pad(hours)}:${pad(minutes)}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function slotKey(dateStr, timeStr) {
  return `${dateStr}_${timeStr}`;
}

function isPastSlot(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`).getTime() < Date.now();
}

function makeDayList() {
  const start = startOfDay(addDays(new Date(), state.weekOffset * DAYS_PER_PAGE));
  return Array.from({ length: DAYS_PER_PAGE }, (_, i) => addDays(start, i));
}

function makeTimes() {
  const times = [];
  const startHour = state.fullDay ? FULL_START_HOUR : STANDARD_START_HOUR;
  const endHour = state.fullDay ? FULL_END_HOUR : STANDARD_END_HOUR;

  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      if (h === endHour && state.fullDay && m > 30) continue;
      if (!state.fullDay && h === endHour && m > 0) continue;
      times.push(formatTime(h, m));
    }
  }
  return times;
}

function toJaWeekDay(date) {
  return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
}

function setLoading(isLoading) {
  if (!el.loading) return;
  el.loading.classList.toggle("hidden", !isLoading);
}

function updateModeButtonLabel() {
  if (!el.modeToggleBtn) return;
  el.modeToggleBtn.textContent = state.fullDay ? "通常時間表示" : "深夜早朝予約（24時間）";
}

function toggleViewMode() {
  state.fullDay = !state.fullDay;
  updateModeButtonLabel();
  renderCalendar();
}



function updateWeekButtons() {
  if (!el.prevWeek) return;
  el.prevWeek.disabled = state.weekOffset <= 0;
}

function updateRangeLabel(days) {
  const first = days[0];
  const last = days[days.length - 1];
  const mode = state.fullDay ? "24時間表示" : "通常時間表示";
  el.rangeLabel.textContent = `${first.getFullYear()}/${first.getMonth() + 1}/${first.getDate()} - ${last.getMonth() + 1}/${last.getDate()}（${mode}）`;
}

function renderCalendar() {
  el.calendar.innerHTML = "";

  const days = makeDayList();
  const times = makeTimes();
  updateRangeLabel(days);
  updateWeekButtons();

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.textContent = "時間";
  headRow.appendChild(corner);

  days.forEach((d) => {
    const th = document.createElement("th");
    th.innerHTML = `${d.getMonth() + 1}/${d.getDate()}<span>${toJaWeekDay(d)}</span>`;
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  el.calendar.appendChild(thead);

  const tbody = document.createElement("tbody");

  times.forEach((time) => {
    const tr = document.createElement("tr");
    const timeCell = document.createElement("td");
    timeCell.className = "time-cell";
    timeCell.textContent = time;
    tr.appendChild(timeCell);

    days.forEach((day) => {
      const dateStr = formatDate(day);
      const blocked = state.blockSet.has(slotKey(dateStr, time)) || isPastSlot(dateStr, time);

      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `slot ${blocked ? "slot--ng" : "slot--ok"}`;
      btn.textContent = blocked ? "×" : "◎";
      btn.disabled = blocked;

      if (!blocked) {
        btn.addEventListener("click", () => {
          location.href = `form.html?date=${encodeURIComponent(dateStr)}&time=${encodeURIComponent(time)}`;
        });
      }

      td.appendChild(btn);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  el.calendar.appendChild(tbody);
}

function applyBlocks(blocks) {
  state.blockSet = new Set((blocks || []).map((b) => slotKey(b.date, b.time)));
}

function loadCachedBlocks() {
  try {
    const raw = localStorage.getItem(BLOCKS_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    applyBlocks(parsed.blocks || []);
    return true;
  } catch (e) {
    return false;
  }
}

function cacheBlocks(blocks) {
  try {
    localStorage.setItem(BLOCKS_CACHE_KEY, JSON.stringify({
      fetchedAt: Date.now(),
      blocks
    }));
  } catch (e) {
    // no-op
  }
}

async function fetchLatestBlocks() {
  const res = await fetch(BLOCKS_API, { cache: "no-store" });
  const json = await res.json();
  const blocks = json.blocks || [];
  applyBlocks(blocks);
  cacheBlocks(blocks);
}



let logoTapCount = 0;
let logoTapTimer = null;

function resetLogoTap() {
  logoTapCount = 0;
  if (logoTapTimer) {
    clearTimeout(logoTapTimer);
    logoTapTimer = null;
  }
}

function openAdminPage() {
  window.location.href = "./admin.html";
}

function handleLogoTap() {
  logoTapCount += 1;

  if (logoTapTimer) clearTimeout(logoTapTimer);
  logoTapTimer = setTimeout(() => {
    resetLogoTap();
  }, 5000);

  if (logoTapCount < 5) return;
  resetLogoTap();
  openAdminPage();
}


async function init() {
  await applyUITexts();
  updateModeButtonLabel();
  setLoading(true);
  const hasCache = loadCachedBlocks();
  if (hasCache) {
    renderCalendar();
    setLoading(false);
  }

  try {
    await fetchLatestBlocks();
    renderCalendar();
    setLoading(false);
  } catch (e) {
    if (!hasCache) {
      applyBlocks([]);
      renderCalendar();
    }
    setLoading(false);
  }
}

el.prevWeek.addEventListener("click", () => {
  state.weekOffset = Math.max(0, state.weekOffset - 1);
  renderCalendar();
});

el.nextWeek.addEventListener("click", () => {
  state.weekOffset += 1;
  renderCalendar();
});

if (el.modeToggleBtn) el.modeToggleBtn.addEventListener("click", toggleViewMode);
if (el.logoAdminTrigger) el.logoAdminTrigger.addEventListener("click", handleLogoTap);
if (el.openAdminBtn) el.openAdminBtn.addEventListener("click", openAdminPage);

init();
