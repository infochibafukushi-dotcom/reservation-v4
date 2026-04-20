const API_BASE = "https://YOUR-WORKER-URL";
const INIT_API = `${API_BASE}/api/getInitData`;

const DAYS_PER_PAGE = 7;
const SLOT_MINUTES = 30; // 30分表示（必要なら60へ変更）
const START_HOUR = 6;
const END_HOUR = 20;

const state = {
  weekOffset: 0,
  blocks: []
};

const el = {
  calendar: document.getElementById("calendar"),
  rangeLabel: document.getElementById("rangeLabel"),
  prevWeek: document.getElementById("prevWeek"),
  nextWeek: document.getElementById("nextWeek")
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

function isPastSlot(dateStr, timeStr) {
  const slotTime = new Date(`${dateStr}T${timeStr}:00`);
  return slotTime.getTime() < Date.now();
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

async function fetchBlocks() {
  try {
    const res = await fetch(INIT_API);
    const json = await res.json();
    state.blocks = json.blocks || [];
  } catch (e) {
    state.blocks = [];
  }
}

function isBlocked(dateStr, timeStr) {
  return state.blocks.some((b) => b.date === dateStr && b.time === timeStr);
}

function toJaWeekDay(date) {
  return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
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
      const blocked = isBlocked(dateStr, time) || isPastSlot(dateStr, time);

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

async function init() {
  await fetchBlocks();
  renderCalendar();
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
