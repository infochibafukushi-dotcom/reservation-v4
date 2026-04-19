if (typeof globalThis.hasBoundGridDelegation === 'undefined') globalThis.hasBoundGridDelegation = false;
if (typeof globalThis.__publicAllowEarlyCalendarPaint === 'undefined') globalThis.__publicAllowEarlyCalendarPaint = false;
if (typeof globalThis.__publicLiveDataReady === 'undefined') globalThis.__publicLiveDataReady = false;
let publicCalendarPage = 0;
let hasBoundPublicCalendarNav = false;
let hasEarlyCalendarPaint = false;
let renderedSlotCellMap = new Map();
let renderedCalendarRangeKey = '';
let nextRangePrefetchKey = '';

function getPublicDaysPerPage(){
  return Math.max(7, Number(config.days_per_page || 7));
}

function getPublicStartOffset(){
  return String(config.same_day_enabled || '0') === '1' ? 0 : 1;
}

function applyCalendarGridColumns(gridEl, daysCount){
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const timeCol = isMobile ? 44 : 60;
  const normalizedDays = Math.max(1, Number(daysCount || 1));

  if (!isMobile){
    gridEl.style.gridTemplateColumns = `${timeCol}px repeat(${normalizedDays}, minmax(112px, 1fr))`;
  } else {
    gridEl.style.gridTemplateColumns = `${timeCol}px repeat(${normalizedDays}, minmax(62px, 1fr))`;
  }
}

function getDatesRange(){
  const today = new Date();
  today.setHours(0,0,0,0);

  const maxForwardDays = Math.max(1, Number(config.max_forward_days || 30));
  const startOffset = getPublicStartOffset();
  const daysPerPage = getPublicDaysPerPage();
  const startIndex = Math.max(0, publicCalendarPage * daysPerPage);
  const remaining = Math.max(0, maxForwardDays - startIndex);
  const visibleDays = Math.max(0, Math.min(daysPerPage, remaining));
  const dates = [];

  for (let i = 0; i < visibleDays; i++){
    const dt = new Date(today);
    dt.setDate(today.getDate() + startOffset + startIndex + i);
    dates.push(dt);
  }
  return dates;
}

function getPublicCalendarPageInfo(){
  const maxForwardDays = Math.max(1, Number(config.max_forward_days || 30));
  const daysPerPage = getPublicDaysPerPage();
  const totalPages = Math.max(1, Math.ceil(maxForwardDays / daysPerPage));
  const currentPage = Math.min(Math.max(0, publicCalendarPage), totalPages - 1);
  return { daysPerPage, totalPages, currentPage };
}

function ensurePublicCalendarNav(){
  const dateRangeEl = document.getElementById('dateRange');
  if (!dateRangeEl) return;

  let nav = document.getElementById('publicCalendarPager');
  if (!nav) return;

  if (!hasBoundPublicCalendarNav){
    const prevBtn = document.getElementById('publicPrevWeekBtn');
    const nextBtn = document.getElementById('publicNextWeekBtn');

    if (prevBtn){
      prevBtn.addEventListener('click', async ()=>{
        const info = getPublicCalendarPageInfo();
        if (info.currentPage <= 0) return;
        publicCalendarPage = info.currentPage - 1;
        try{
          await withLoading(async ()=>{
            await ensureBlockedSlotsFresh(false, true);
            renderCalendar();
          }, '前の週を表示中...');
        }catch(err){
          toast(err?.message || '表示更新に失敗しました');
        }
      });
    }

    if (nextBtn){
      nextBtn.addEventListener('click', async ()=>{
        const info = getPublicCalendarPageInfo();
        if (info.currentPage >= info.totalPages - 1) return;
        publicCalendarPage = info.currentPage + 1;
        try{
          await withLoading(async ()=>{
            await ensureBlockedSlotsFresh(false, true);
            renderCalendar();
          }, '次の週を表示中...');
        }catch(err){
          toast(err?.message || '表示更新に失敗しました');
        }
      });
    }

    hasBoundPublicCalendarNav = true;
  }

  const info = getPublicCalendarPageInfo();
  const prevBtn = document.getElementById('publicPrevWeekBtn');
  const nextBtn = document.getElementById('publicNextWeekBtn');
  if (prevBtn){
    prevBtn.disabled = info.currentPage <= 0;
    prevBtn.style.opacity = info.currentPage <= 0 ? '0.45' : '1';
    prevBtn.style.pointerEvents = info.currentPage <= 0 ? 'none' : '';
  }
  if (nextBtn){
    nextBtn.disabled = info.currentPage >= info.totalPages - 1;
    nextBtn.style.opacity = info.currentPage >= info.totalPages - 1 ? '0.45' : '1';
    nextBtn.style.pointerEvents = info.currentPage >= info.totalPages - 1 ? 'none' : '';
  }
}

function buildSlots(){
  const regularSlots = [];
  for (let h=6; h<=21; h++){
    regularSlots.push({hour:h, minute:0, display:`${String(h).padStart(2,'0')}:00`});
    if (h < 21) regularSlots.push({hour:h, minute:30, display:`${String(h).padStart(2,'0')}:30`});
  }

  const extendedSlots = [];
  extendedSlots.push({hour:21, minute:30, display:`21:30`});
  for (let h=22; h<24; h++){
    extendedSlots.push({hour:h, minute:0, display:`${String(h).padStart(2,'0')}:00`});
    extendedSlots.push({hour:h, minute:30, display:`${String(h).padStart(2,'0')}:30`});
  }
  for (let h=0; h<=5; h++){
    extendedSlots.push({hour:h, minute:0, display:`${String(h).padStart(2,'0')}:00`});
    extendedSlots.push({hour:h, minute:30, display:`${String(h).padStart(2,'0')}:30`});
  }
  return { regularSlots, extendedSlots };
}

function createPublicSlotBlockedChecker(){
  const sameDayEnabled = String(config.same_day_enabled || '0') === '1';
  const todayStr = sameDayEnabled ? ymdLocal(new Date()) : '';
  const roundedThresholdMs = sameDayEnabled
    ? ceilToNext30Min(new Date(Date.now() + Number(config.same_day_min_hours || 3) * 60 * 60 * 1000)).getTime()
    : -1;

  return function(dateObj, dateStr, hour, minute){
    const key = `${dateStr}-${hour}-${minute}`;
    if (blockedSlots.has(key) || reservedSlots.has(key)) return true;
    if (!sameDayEnabled || dateStr !== todayStr) return false;

    const slotDt = new Date(
      dateObj.getFullYear(),
      dateObj.getMonth(),
      dateObj.getDate(),
      Number(hour || 0),
      Number(minute || 0),
      0,
      0
    );
    return slotDt.getTime() < roundedThresholdMs;
  };
}

function toSlotKey(dateYmd, hour, minute){
  return `${String(dateYmd || '').trim()}-${Number(hour || 0)}-${Number(minute || 0)}`;
}

function rebuildRenderedSlotCellMap(grid){
  renderedSlotCellMap = new Map();
  if (!grid) return;

  const slots = grid.querySelectorAll('[data-action="slot"]');
  slots.forEach(cell => {
    const ymd = String(cell.dataset.dateYmd || '').trim();
    if (!ymd) return;
    const key = toSlotKey(ymd, cell.dataset.hour, cell.dataset.minute);
    renderedSlotCellMap.set(key, cell);
  });
}

function warmNextCalendarPageBlockedKeys(){
  try{
    if (String(config.calendar_prefetch_next_page || '0') !== '1') return;
    if (typeof gsRun !== 'function') return;
    if (typeof getPublicCalendarPageInfo !== 'function') return;

    const info = getPublicCalendarPageInfo();
    const nextPage = info.currentPage + 1;
    if (nextPage >= info.totalPages) return;

    const today = new Date();
    today.setHours(0,0,0,0);
    const startOffset = getPublicStartOffset();
    const daysPerPage = getPublicDaysPerPage();
    const startIndex = Math.max(0, nextPage * daysPerPage);

    const start = new Date(today);
    start.setDate(today.getDate() + startOffset + startIndex);

    const end = new Date(start);
    end.setDate(start.getDate() + daysPerPage - 1);

    const range = { start: ymdLocal(start), end: ymdLocal(end) };
    const key = `${range.start}__${range.end}`;
    if (!range.start || !range.end || key === nextRangePrefetchKey) return;

    nextRangePrefetchKey = key;
    gsRun('api_getBlockedSlotKeys', range)
      .then(res => {
        if (!res || !res.isOk) return;
        const keys = Array.isArray(res.data?.slot_keys)
          ? res.data.slot_keys
          : (Array.isArray(res.data?.keys) ? res.data.keys : []);
        if (typeof _saveBlockedKeysCache_ === 'function'){
          _saveBlockedKeysCache_(range, keys || []);
        }
      })
      .catch(()=>{});
  }catch(_){ }
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const dateRangeEl = document.getElementById('dateRange');
  if (!grid || !dateRangeEl) return;

  ensurePublicCalendarNav();

  const dates = getDatesRange();
  calendarDates = dates;

  if (dates.length === 0) {
    dateRangeEl.textContent = '';
    grid.innerHTML = '';
    ensurePublicCalendarNav();
    return;
  }

  const dateMeta = dates.map(date => ({
    date,
    ymd: ymdLocal(date),
    label: formatDate(date),
    isWeekend: (date.getDay() === 0 || date.getDay() === 6)
  }));
  const isBlockedFast = createPublicSlotBlockedChecker();
  const hasReliableAvailability = !!(
    globalThis.__publicLiveDataReady === true || globalThis.__publicAllowEarlyCalendarPaint === true
  );
  const legendLoadingEl = document.getElementById('legendLoadingText');
  if (legendLoadingEl){
    if (hasReliableAvailability){
      legendLoadingEl.classList.add('hidden');
    } else {
      legendLoadingEl.classList.remove('hidden');
    }
  }

  dateRangeEl.textContent = `${dateMeta[0].label} ～ ${dateMeta[dateMeta.length - 1].label}`;
  ensurePublicCalendarNav();

  const { regularSlots, extendedSlots } = buildSlots();

  let html = '';
  html += '<div class="time-label sticky-corner">時間</div>';

  dateMeta.forEach((meta, idx)=>{
    html += `<div class="date-header sticky-top ${meta.isWeekend ? 'weekend' : ''}" data-date-idx="${idx}">${meta.label}</div>`;
  });

  for (const slot of regularSlots){
    html += `<div class="time-label sticky-left">${slot.display}</div>`;
    for (let idx=0; idx<dates.length; idx++){
      const meta = dateMeta[idx];
      const blocked = hasReliableAvailability ? isBlockedFast(meta.date, meta.ymd, slot.hour, slot.minute) : false;
      const slotClass = hasReliableAvailability
        ? (blocked ? 'slot-unavailable' : 'slot-available')
        : 'slot-loading';
      const slotMark = hasReliableAvailability ? (blocked ? 'X' : '◎') : '◎';

      html += `<div class="${slotClass} p-3 text-center text-lg font-bold rounded-lg cursor-pointer transition"
                data-action="slot"
                data-slot-variant="regular"
                data-date-idx="${idx}"
                data-date-ymd="${meta.ymd}"
                data-hour="${slot.hour}"
                data-minute="${slot.minute}">
                ${slotMark}
              </div>`;
    }
  }

  const shouldShowExtended = isExtendedView;
  if (shouldShowExtended){
    html += '<div class="time-label sticky-left" style="font-weight:bold;background:linear-gradient(135deg,#cffafe 0%,#a5f3fc 100%);color:#0e7490;border:2px solid #06b6d4;">他時間</div>';

    dateMeta.forEach((meta, idx)=>{
      html += `<div class="date-header ${meta.isWeekend ? 'weekend' : ''}"
                style="background:linear-gradient(135deg,#cffafe 0%,#a5f3fc 100%);border-color:#06b6d4;color:#0e7490;"
                data-date-idx="${idx}">${meta.label}</div>`;
    });

    for (const slot of extendedSlots){
      html += `<div class="time-label sticky-left" style="background:linear-gradient(135deg,#cffafe 0%,#a5f3fc 100%);border:2px solid #06b6d4;color:#0e7490;font-weight:600;">${slot.display}</div>`;
      for (let idx=0; idx<dates.length; idx++){
        const meta = dateMeta[idx];
        const blocked = hasReliableAvailability ? isBlockedFast(meta.date, meta.ymd, slot.hour, slot.minute) : false;
        const slotClass = hasReliableAvailability
          ? (blocked ? 'slot-unavailable' : 'slot-alternate')
          : 'slot-loading';
        const slotMark = hasReliableAvailability ? (blocked ? 'X' : '◎') : '◎';

        html += `<div class="${slotClass} p-3 text-center text-lg font-bold rounded-lg cursor-pointer transition"
                  data-action="slot"
                  data-slot-variant="extended"
                  data-date-idx="${idx}"
                  data-date-ymd="${meta.ymd}"
                  data-hour="${slot.hour}"
                  data-minute="${slot.minute}">
                  ${slotMark}
                </div>`;
      }
    }
  }

  grid.innerHTML = html;
  rebuildRenderedSlotCellMap(grid);
  renderedCalendarRangeKey = `${dateMeta[0].ymd}__${dateMeta[dateMeta.length - 1].ymd}`;

  applyCalendarGridColumns(grid, dates.length);

  if (typeof requestIdleCallback === 'function'){
    requestIdleCallback(()=>{ warmNextCalendarPageBlockedKeys(); }, { timeout: 900 });
  } else {
    setTimeout(()=>{ warmNextCalendarPageBlockedKeys(); }, 180);
  }
}

function applySlotCellVisualState(cell, blocked){
  if (!cell) return;

  if (blocked){
    if (!cell.classList.contains('slot-unavailable')){
      cell.classList.remove('slot-available', 'slot-alternate', 'slot-loading');
      cell.classList.add('slot-unavailable');
    }
    if (cell.textContent.trim() !== 'X') cell.textContent = 'X';
    return;
  }

  const variant = String(cell.dataset.slotVariant || 'regular');
  const targetClass = variant === 'extended' ? 'slot-alternate' : 'slot-available';
  if (!cell.classList.contains(targetClass)){
    cell.classList.remove('slot-unavailable', 'slot-available', 'slot-alternate', 'slot-loading');
    cell.classList.add(targetClass);
  }
  if (cell.textContent.trim() !== '◎') cell.textContent = '◎';
}

function patchRenderedCalendarBlockedStates(ctx){
  try{
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;

    if (!renderedSlotCellMap || renderedSlotCellMap.size === 0){
      rebuildRenderedSlotCellMap(grid);
    }

    if (!renderedSlotCellMap.size || !Array.isArray(calendarDates) || !calendarDates.length){
      renderCalendar();
      return;
    }

    const renderedStart = ymdLocal(calendarDates[0]);
    const renderedEnd = ymdLocal(calendarDates[calendarDates.length - 1]);
    const currentRangeKey = `${renderedStart}__${renderedEnd}`;
    const nextRangeKey = String(ctx && ctx.nextRangeKey || '');
    if (!nextRangeKey || nextRangeKey !== currentRangeKey || (renderedCalendarRangeKey && renderedCalendarRangeKey !== currentRangeKey)){
      renderCalendar();
      return;
    }

    const prevBlocked = (ctx && ctx.previousBlockedSlots instanceof Set) ? ctx.previousBlockedSlots : null;
    const isBlockedFast = createPublicSlotBlockedChecker();

    const updateKey = (slotKey) => {
      const cell = renderedSlotCellMap.get(slotKey);
      if (!cell) return;

      const ymd = String(cell.dataset.dateYmd || '').trim();
      const hour = Number(cell.dataset.hour || 0);
      const minute = Number(cell.dataset.minute || 0);

      const dateObj = calendarDates[Number(cell.dataset.dateIdx || -1)] || null;
      if (!dateObj || !ymd) return;

      const blocked = isBlockedFast(dateObj, ymd, hour, minute);
      applySlotCellVisualState(cell, blocked);
    };

    if (prevBlocked){
      const hasLoadingCells = !!(grid.querySelector && grid.querySelector('.slot-loading'));
      if (hasLoadingCells){
        renderedSlotCellMap.forEach((_, key) => updateKey(key));
        return;
      }

      const touched = [];
      renderedSlotCellMap.forEach((_, key) => {
        if (prevBlocked.has(key) !== blockedSlots.has(key)){
          touched.push(key);
        }
      });

      if (touched.length){
        touched.forEach(updateKey);
        return;
      }
      return;
    }

    renderedSlotCellMap.forEach((_, key) => updateKey(key));
  }catch(_){
    try{ renderCalendar(); }catch(__){ }
  }
}

function bindGridDelegation(){
  if (globalThis.hasBoundGridDelegation) return;

  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  grid.addEventListener('click', async (ev)=>{
    const el = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
    if (!el) return;

    const action = el.dataset.action;

    if (action === 'slot'){
      if (!isCalendarInteractive()){
        return;
      }

      const dateIdx = Number(el.dataset.dateIdx);
      const hour = Number(el.dataset.hour);
      const minute = Number(el.dataset.minute || 0);

      const date = calendarDates[dateIdx];
      if (!date) return;

      const blocked = isSlotBlockedWithMinute(date, hour, minute);
      if (blocked) return;

      await openBookingForm(date, hour, minute);
    }
  }, { passive: false });

  globalThis.hasBoundGridDelegation = true;
}

function isCalendarInteractive(){
  return globalThis.__publicLiveDataReady === true;
}

function tryEarlyCalendarPaint(){
  if (hasEarlyCalendarPaint) return;
  if (globalThis.__publicAllowEarlyCalendarPaint === false) return;
  hasEarlyCalendarPaint = true;

  const run = ()=>{
    try{
      if (typeof schedulePublicCalendarRender === 'function'){
        schedulePublicCalendarRender();
      } else {
        renderCalendar();
      }
    }catch(_){ }
  };

  if (typeof requestAnimationFrame === 'function'){
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', tryEarlyCalendarPaint, { once: true });
} else {
  tryEarlyCalendarPaint();
}
