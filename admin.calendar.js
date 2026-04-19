let adminCalendarPage = 0;
let hasBoundAdminCalendarNav = false;
let adminBackgroundRefreshTimer = null;
let adminBackgroundRefreshPendingOptions = null;

function getAdminDaysPerPage(){
  return Math.max(1, Number(adminConfig.days_per_page || 7));
}

function adminApplyCalendarGridColumns(gridEl, daysCount){
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const timeCol = isMobile ? 44 : 60;
  const sc = gridEl?.closest?.('.scroll-container') || gridEl?.parentElement;
  const baseW = (sc && sc.clientWidth) ? sc.clientWidth : window.innerWidth;

  if (!isMobile){
    const dayW = Math.max(110, Math.floor((baseW - timeCol) / Math.max(1, daysCount)));
    gridEl.style.gridTemplateColumns = `${timeCol}px repeat(${daysCount}, ${dayW}px)`;
  } else {
    gridEl.style.gridTemplateColumns = `${timeCol}px repeat(${daysCount}, minmax(62px, 1fr))`;
  }
}

function getAdminDatesRange(){
  const today = new Date();
  today.setHours(0,0,0,0);

  const maxForwardDays = Math.max(1, Number(adminConfig.max_forward_days || 30));
  const daysPerPage = getAdminDaysPerPage();
  const startIndex = Math.max(0, adminCalendarPage * daysPerPage);
  const remaining = Math.max(0, maxForwardDays - startIndex);
  const visibleDays = Math.max(0, Math.min(daysPerPage, remaining));
  const dates = [];

  for (let i=0; i<visibleDays; i++){
    const dt = new Date(today);
    dt.setDate(today.getDate() + startIndex + i);
    dates.push(dt);
  }
  return dates;
}

function getAdminCalendarPageInfo(){
  const maxForwardDays = Math.max(1, Number(adminConfig.max_forward_days || 30));
  const daysPerPage = getAdminDaysPerPage();
  const totalPages = Math.max(1, Math.ceil(maxForwardDays / daysPerPage));
  const currentPage = Math.min(Math.max(0, adminCalendarPage), totalPages - 1);
  return { daysPerPage, totalPages, currentPage };
}

function ensureAdminCalendarNav(){
  const dateRangeEl = document.getElementById('adminDateRange');
  const headerRow = dateRangeEl ? dateRangeEl.parentElement : null;
  if (!dateRangeEl || !headerRow) return;

  let nav = document.getElementById('adminCalendarPager');
  if (!nav){
    nav = document.createElement('div');
    nav.id = 'adminCalendarPager';
    nav.className = 'flex items-center gap-2';
    nav.innerHTML = `
      <button id="adminPrevWeekBtn" class="cute-btn px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs md:text-sm whitespace-nowrap" type="button">← 前へ</button>
      <button id="adminNextWeekBtn" class="cute-btn px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs md:text-sm whitespace-nowrap" type="button">次へ →</button>
    `;
    const toggleBtn = document.getElementById('toggleAdminTimeView');
    const toggleWrap = toggleBtn ? toggleBtn.parentElement : null;
    if (toggleWrap){
      headerRow.insertBefore(nav, toggleWrap);
    } else {
      headerRow.appendChild(nav);
    }
  }

  if (!hasBoundAdminCalendarNav){
    const prevBtn = document.getElementById('adminPrevWeekBtn');
    const nextBtn = document.getElementById('adminNextWeekBtn');

    if (prevBtn){
      prevBtn.addEventListener('click', async ()=>{
        const info = getAdminCalendarPageInfo();
        if (info.currentPage <= 0) return;
        adminCalendarPage = info.currentPage - 1;
        try{
          await withLoading(async ()=>{
            if (typeof adminRefreshVisibleWindow === 'function'){
              await adminRefreshVisibleWindow({
                fetchReservations: true,
                fetchBlocks: true,
                renderTable: false,
                renderStats: false
              });
            } else {
              renderAdminCalendar();
            }
          }, '前の週を表示中...');
        }catch(err){
          toast(err?.message || '表示更新に失敗しました');
        }
      });
    }

    if (nextBtn){
      nextBtn.addEventListener('click', async ()=>{
        const info = getAdminCalendarPageInfo();
        if (info.currentPage >= info.totalPages - 1) return;
        adminCalendarPage = info.currentPage + 1;
        try{
          await withLoading(async ()=>{
            if (typeof adminRefreshVisibleWindow === 'function'){
              await adminRefreshVisibleWindow({
                fetchReservations: true,
                fetchBlocks: true,
                renderTable: false,
                renderStats: false
              });
            } else {
              renderAdminCalendar();
            }
          }, '次の週を表示中...');
        }catch(err){
          toast(err?.message || '表示更新に失敗しました');
        }
      });
    }

    hasBoundAdminCalendarNav = true;
  }

  const info = getAdminCalendarPageInfo();
  const prevBtn = document.getElementById('adminPrevWeekBtn');
  const nextBtn = document.getElementById('adminNextWeekBtn');
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

function buildAdminSlots(){
  const regularSlots = [];
  for (let h=6; h<=21; h++){
    regularSlots.push({hour:h, minute:0, display:`${String(h).padStart(2,'0')}:00`});
    if (h < 21) regularSlots.push({hour:h, minute:30, display:`${String(h).padStart(2,'0')}:30`});
  }

  const otherSlots = [];
  otherSlots.push({hour:21, minute:30, display:'21:30'});
  for (let h=22; h<24; h++){
    otherSlots.push({hour:h, minute:0, display:`${String(h).padStart(2,'0')}:00`});
    otherSlots.push({hour:h, minute:30, display:`${String(h).padStart(2,'0')}:30`});
  }
  for (let h=0; h<=5; h++){
    otherSlots.push({hour:h, minute:0, display:`${String(h).padStart(2,'0')}:00`});
    otherSlots.push({hour:h, minute:30, display:`${String(h).padStart(2,'0')}:30`});
  }

  return { regularSlots, otherSlots };
}

function ceilAdminToNext30Min(date){
  const dt = new Date(date.getTime());
  dt.setSeconds(0, 0);
  const minute = dt.getMinutes();

  if (minute === 0 || minute === 30) return dt;

  if (minute < 30) {
    dt.setMinutes(30, 0, 0);
    return dt;
  }

  dt.setHours(dt.getHours() + 1, 0, 0, 0);
  return dt;
}

function isAdminSlotExplicitlyBlocked(dateObj, hour, minute){
  const key = `${ymdLocal(dateObj)}-${hour}-${minute}`;
  return adminBlockedSlots.has(key) || adminReservedSlots.has(key);
}

function isAdminSlotSameDayBlocked(dateObj, hour, minute){
  if (String(adminConfig.same_day_enabled || '0') !== '1') return false;

  const today = new Date();
  if (ymdLocal(dateObj) !== ymdLocal(today)) return false;

  const minHours = Math.max(0, Number(adminConfig.same_day_min_hours || 3));
  const threshold = new Date(Date.now() + (minHours * 60 * 60 * 1000));
  const roundedThreshold = ceilAdminToNext30Min(threshold);

  const slotDt = new Date(
    dateObj.getFullYear(),
    dateObj.getMonth(),
    dateObj.getDate(),
    Number(hour || 0),
    Number(minute || 0),
    0,
    0
  );

  return slotDt.getTime() < roundedThreshold.getTime();
}

function isAdminSlotBlocked(dateObj, hour, minute){
  return isAdminSlotExplicitlyBlocked(dateObj, hour, minute) || isAdminSlotSameDayBlocked(dateObj, hour, minute);
}

function createAdminSlotBlockedChecker(){
  const sameDayEnabled = String(adminConfig.same_day_enabled || '0') === '1';
  const todayStr = sameDayEnabled ? ymdLocal(new Date()) : '';
  const roundedThresholdMs = sameDayEnabled
    ? ceilAdminToNext30Min(new Date(Date.now() + Math.max(0, Number(adminConfig.same_day_min_hours || 3)) * 60 * 60 * 1000)).getTime()
    : -1;

  return function(dateObj, dateStr, hour, minute){
    const key = `${dateStr}-${hour}-${minute}`;
    if (adminBlockedSlots.has(key) || adminReservedSlots.has(key)) return true;
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

function setAdminBlockedSlotLocal(dateStr, hour, minute, isBlocked){
  const key = `${String(dateStr || '').trim()}-${Number(hour || 0)}-${Number(minute || 0)}`;
  if (!key || key === '--') return;
  if (isBlocked) {
    adminBlockedSlots.add(key);
  } else {
    adminBlockedSlots.delete(key);
  }
}

function setAdminBlockedDayPartLocal(dateStr, slots, isBlocked){
  (slots || []).forEach(slot => {
    setAdminBlockedSlotLocal(dateStr, slot.h, slot.m, isBlocked);
  });
}

function scheduleAdminBackgroundRefresh(options){
  const next = options && typeof options === 'object' ? { ...options } : {};
  adminBackgroundRefreshPendingOptions = {
    ...(adminBackgroundRefreshPendingOptions || {}),
    ...next
  };

  if (adminBackgroundRefreshTimer) {
    clearTimeout(adminBackgroundRefreshTimer);
  }

  adminBackgroundRefreshTimer = setTimeout(function(){
    adminBackgroundRefreshTimer = null;
    const merged = adminBackgroundRefreshPendingOptions || {};
    adminBackgroundRefreshPendingOptions = null;

    if (typeof adminRefreshVisibleWindow !== 'function') return;
    adminRefreshVisibleWindow(merged).catch(function(){});
  }, 300);
}

function renderAdminCalendar(){
  const grid = document.getElementById('adminCalendarGrid');
  const dateRangeEl = document.getElementById('adminDateRange');
  if (!grid || !dateRangeEl) return;

  ensureAdminCalendarNav();

  const dates = getAdminDatesRange();
  adminCalendarDates = dates;

  if (dates.length === 0) {
    dateRangeEl.textContent = '';
    grid.innerHTML = '';
    ensureAdminCalendarNav();
    return;
  }

  const dateMeta = dates.map(date => ({
    date,
    ymd: ymdLocal(date),
    label: formatDate(date),
    isWeekend: (date.getDay() === 0 || date.getDay() === 6)
  }));
  const isBlockedFast = createAdminSlotBlockedChecker();

  dateRangeEl.textContent = `${dateMeta[0].label} ～ ${dateMeta[dateMeta.length - 1].label}`;
  ensureAdminCalendarNav();

  const { regularSlots, otherSlots } = buildAdminSlots();
  const slots = adminExtendedView ? otherSlots : regularSlots;

  let html = '';
  html += '<div class="time-label sticky-corner">時間</div>';

  dateMeta.forEach((meta, idx)=>{
    let rightBtnText = adminExtendedView ? '夜' : '日';
    html += `
      <div class="date-header sticky-top ${meta.isWeekend ? 'weekend' : ''}">
        <div class="w-full flex items-center justify-between px-1 gap-1">
          <button class="day-btn day-btn-block" data-action="toggleDay" data-date-idx="${idx}" type="button">全</button>
          <span class="text-[11px] font-extrabold leading-none">${meta.label}</span>
          <button class="day-btn ${adminExtendedView ? 'day-btn-block' : 'day-btn-unblock'}" data-action="toggleDayPart" data-date-idx="${idx}" type="button">${rightBtnText}</button>
        </div>
      </div>
    `;
  });

  for (const slot of slots){
    html += `<div class="time-label sticky-left">${slot.display}</div>`;
    for (let idx=0; idx<dates.length; idx++){
      const meta = dateMeta[idx];
      const blocked = isBlockedFast(meta.date, meta.ymd, slot.hour, slot.minute);
      const slotClass = blocked ? 'admin-slot-unavailable' : (adminExtendedView ? 'admin-slot-other' : 'admin-slot-available');

      html += `
        <div class="${slotClass} p-3 text-center text-lg font-bold rounded-lg transition"
             data-action="toggleSlot"
             data-date-idx="${idx}"
             data-hour="${slot.hour}"
             data-minute="${slot.minute}">
          ${blocked ? 'X' : '◎'}
        </div>
      `;
    }
  }

  grid.innerHTML = html;
  adminApplyCalendarGridColumns(grid, dates.length);
  requestAnimationFrame(()=> adminApplyCalendarGridColumns(grid, dates.length));
}

function bindAdminGridDelegation(){
  if (hasBoundAdminGridDelegation) return;

  const grid = document.getElementById('adminCalendarGrid');
  if (!grid) return;

  grid.addEventListener('click', async (ev)=>{
    const el = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
    if (!el) return;

    const action = el.dataset.action;

    try{
      if (action === 'toggleSlot'){
        const dateIdx = Number(el.dataset.dateIdx);
        const hour = Number(el.dataset.hour);
        const minute = Number(el.dataset.minute || 0);
        const date = adminCalendarDates[dateIdx];
        if (!date) return;

        const isSameDayDerivedOnlyBlocked = isAdminSlotSameDayBlocked(date, hour, minute) && !isAdminSlotExplicitlyBlocked(date, hour, minute);
        if (isSameDayDerivedOnlyBlocked){
          toast(`当日予約設定により ${Number(adminConfig.same_day_min_hours || 3)}時間後までは×表示です`);
          return;
        }

        await withLoading(async ()=>{
          const res = await gsRun('api_toggleBlock', {
            dateStr: ymdLocal(date),
            hour: hour,
            minute: minute
          });
          if (res && res.isOk && res.data){
            setAdminBlockedSlotLocal(ymdLocal(date), hour, minute, !!res.data.is_blocked);
            renderAdminCalendar();
          }
          scheduleAdminBackgroundRefresh({
            fetchReservations: false,
            renderTable: false,
            renderStats: false,
            rebuildReserved: false
          });
        }, '枠を更新中...');
      }

      if (action === 'toggleDay'){
        const dateIdx = Number(el.dataset.dateIdx);
        const date = adminCalendarDates[dateIdx];
        if (!date) return;

        const dateStr = ymdLocal(date);
        const targetAction = adminExtendedView ? 'api_setOtherTimeDayBlocked' : 'api_setRegularDayBlocked';

        let blockedCount = 0;
        const { regularSlots, otherSlots } = buildAdminSlots();
        const slots = adminExtendedView ? otherSlots : regularSlots;
        slots.forEach(slot => {
          if (isAdminSlotExplicitlyBlocked(date, slot.hour, slot.minute)) blockedCount++;
        });

        const allBlocked = blockedCount === slots.length;
        const nextState = !allBlocked;

        await withLoading(async ()=>{
          await gsRun(targetAction, {
            dateStr: dateStr,
            isBlocked: nextState
          });
          setAdminBlockedDayPartLocal(dateStr, slots, nextState);
          renderAdminCalendar();
          scheduleAdminBackgroundRefresh({
            fetchReservations: false,
            renderTable: false,
            renderStats: false,
            rebuildReserved: false
          });
        }, '日単位ブロック更新中...');
      }

      if (action === 'toggleDayPart'){
        const dateIdx = Number(el.dataset.dateIdx);
        const date = adminCalendarDates[dateIdx];
        if (!date) return;

        const dateStr = ymdLocal(date);
        const targetAction = adminExtendedView ? 'api_setOtherTimeDayBlocked' : 'api_setRegularDayBlocked';

        let blockedCount = 0;
        const { regularSlots, otherSlots } = buildAdminSlots();
        const slots = adminExtendedView ? otherSlots : regularSlots;
        slots.forEach(slot => {
          if (isAdminSlotExplicitlyBlocked(date, slot.hour, slot.minute)) blockedCount++;
        });

        const allBlocked = blockedCount === slots.length;
        const nextState = !allBlocked;

        await withLoading(async ()=>{
          await gsRun(targetAction, {
            dateStr: dateStr,
            isBlocked: nextState
          });
          setAdminBlockedDayPartLocal(dateStr, slots, nextState);
          renderAdminCalendar();
          scheduleAdminBackgroundRefresh({
            fetchReservations: false,
            renderTable: false,
            renderStats: false,
            rebuildReserved: false
          });
        }, '時間帯一括更新中...');
      }
    }catch(err){
      toast(err?.message || '更新に失敗しました');
    }
  });

  hasBoundAdminGridDelegation = true;
}
