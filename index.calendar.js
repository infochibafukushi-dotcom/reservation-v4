const calendarState = {
  page: 0,
  fullDay: false,
  blocks: [],
  reservations: [],
  blockSet: new Set()
};

const DAYS_PER_PAGE = 7;
const MAX_DAYS = 30;
const NORMAL_START = 6;
const NORMAL_END = 21;
const FULL_START = 0;
const FULL_END = 23;
const SAME_DAY_BLOCK_HOURS = 3;

function pad(v){ return String(v).padStart(2, "0"); }
function formatDate(d){
  const x = new Date(d);
  const y = x.getFullYear();
  const m = pad(x.getMonth() + 1);
  const day = pad(x.getDate());
  return `${y}-${m}-${day}`;
}
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function jaDay(d){ return ["日","月","火","水","木","金","土"][d.getDay()]; }
function slotKey(date, time){ return `${date}_${time}`; }

function showLoading(show, text = "空き枠を読み込み中..."){
  const ov = document.getElementById("loadingOverlay");
  const tx = document.getElementById("loadingText");
  if (tx) tx.textContent = text;
  if (ov) ov.classList.toggle("hidden", !show);
}

function makeDates(){
  const today = new Date();
  today.setHours(0,0,0,0);
  const startIndex = calendarState.page * DAYS_PER_PAGE;
  const remaining = Math.max(0, MAX_DAYS - startIndex);
  const count = Math.min(DAYS_PER_PAGE, remaining);
  return Array.from({ length: count }, (_, i) => addDays(today, startIndex + i));
}

function makeTimes(){
  const times = [];
  const s = calendarState.fullDay ? FULL_START : NORMAL_START;
  const e = calendarState.fullDay ? FULL_END : NORMAL_END;
  for (let h = s; h <= e; h++){
    for (let m = 0; m < 60; m += 30){
      if (!calendarState.fullDay && h === e && m > 0) continue;
      times.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return times;
}

function isPastOrTooSoon(date, time){
  const slot = new Date(`${date}T${time}:00`);
  const now = new Date();
  if (slot < now) return true;
  const limit = new Date(now.getTime() + SAME_DAY_BLOCK_HOURS * 60 * 60 * 1000);
  return slot < limit;
}

function isBlocked(date, time){
  return calendarState.blockSet.has(slotKey(date, time)) || isPastOrTooSoon(date, time);
}

function applyGridColumns(grid, daysCount){
  const isMobile = window.matchMedia("(max-width:640px)").matches;
  const timeCol = isMobile ? 44 : 60;
  if (isMobile) {
    grid.style.gridTemplateColumns = `${timeCol}px repeat(${daysCount}, minmax(54px, 1fr))`;
  } else {
    grid.style.gridTemplateColumns = `${timeCol}px repeat(${daysCount}, minmax(105px, 1fr))`;
  }
}

function renderCalendar(){
  const grid = document.getElementById("calendarGrid");
  const range = document.getElementById("dateRange");
  if (!grid || !range) return;

  const dates = makeDates();
  const times = makeTimes();

  applyGridColumns(grid, dates.length);
  grid.innerHTML = "";

  if (!dates.length) {
    range.textContent = "";
    return;
  }

  range.textContent = `${formatDate(dates[0]).replaceAll("-","/")} - ${formatDate(dates[dates.length - 1]).slice(5).replace("-","/")}`;

  const corner = document.createElement("div");
  corner.className = "time-label";
  corner.textContent = "時間";
  grid.appendChild(corner);

  dates.forEach(d => {
    const dateStr = formatDate(d);
    const h = document.createElement("div");
    h.className = `date-header ${[0,6].includes(d.getDay()) ? "weekend" : ""}`;
    h.innerHTML = `<span>${d.getMonth()+1}/${d.getDate()}</span><small>${jaDay(d)}</small>`;
    h.title = dateStr;
    grid.appendChild(h);
  });

  times.forEach(time => {
    const t = document.createElement("div");
    t.className = "time-label";
    t.textContent = time;
    grid.appendChild(t);

    dates.forEach(d => {
      const dateStr = formatDate(d);
      const blocked = isBlocked(dateStr, time);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `slot-cell ${blocked ? "slot-ng" : "slot-ok"}`;
      cell.textContent = blocked ? "×" : "◎";
      cell.disabled = blocked;
      if (!blocked) cell.addEventListener("click", () => openBookingForm(dateStr, time));
      grid.appendChild(cell);
    });
  });

  const totalPages = Math.ceil(MAX_DAYS / DAYS_PER_PAGE);
  document.getElementById("prevWeek").disabled = calendarState.page <= 0;
  document.getElementById("nextWeek").disabled = calendarState.page >= totalPages - 1;
  document.getElementById("modeToggleBtn").textContent = calendarState.fullDay ? "通常時間表示" : "深夜早朝予約";
}

async function loadCalendarData(){
  showLoading(true);
  try{
    const data = await apiGet(ENDPOINTS.getBlocks);
    calendarState.blocks = data.blocks || [];
    calendarState.blockSet = new Set(calendarState.blocks.map(b => slotKey(b.date, b.time)));
  }catch(e){
    calendarState.blocks = [];
    calendarState.blockSet = new Set();
    toast("空き枠取得に失敗しました");
  }finally{
    renderCalendar();
    showLoading(false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("prevWeek").addEventListener("click", () => {
    calendarState.page = Math.max(0, calendarState.page - 1);
    loadCalendarData();
  });
  document.getElementById("nextWeek").addEventListener("click", () => {
    calendarState.page += 1;
    loadCalendarData();
  });
  document.getElementById("modeToggleBtn").addEventListener("click", () => {
    calendarState.fullDay = !calendarState.fullDay;
    renderCalendar();
  });
  loadCalendarData();
});
