const { API_BASE, ENDPOINTS } = window.APP_CONFIG;
const BLOCKS_API = `${API_BASE}${ENDPOINTS.getBlocks}`;

const DAYS_PER_PAGE = 7;
const SLOT_MINUTES = 30;
const START_HOUR = 6;
const END_HOUR = 20;
const BLOCKS_CACHE_KEY = "reservation_blocks_cache_v1";

const state = {
  weekOffset: 0,
  blockSet: new Set()
};

const el = {
  calendar: document.getElementById("calendar"),
  rangeLabel: document.getElementById("rangeLabel"),
  prevWeek: document.getElementById("prevWeek"),
  nextWeek: document.getElementById("nextWeek"),
  loading: document.getElementById("calendarLoading")
};

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
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      if (h === END_HOUR && m > 0) continue;
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

function updateRangeLabel(days) {
  const first = days[0];
  const last = days[days.length - 1];
  el.rangeLabel.textContent = `${first.getFullYear()}/${first.getMonth() + 1}/${first.getDate()} - ${last.getMonth() + 1}/${last.getDate()}`;
}

function renderCalendar() {
  el.calendar.innerHTML = "";

  const days = makeDayList();
  const times = makeTimes();
  updateRangeLabel(days);

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

async function init() {
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
  state.weekOffset -= 1;
  renderCalendar();
});

el.nextWeek.addEventListener("click", () => {
  state.weekOffset += 1;
  renderCalendar();
});

init();
