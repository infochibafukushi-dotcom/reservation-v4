let menuMapCache = null;
let menuMapCacheSource = null;
let menuMapCacheLength = -1;
let itemsByGroupCache = null;
let itemsByGroupCacheSource = null;
let itemsByGroupCacheLength = -1;

function invalidateMenuUiCaches(){
  menuMapCache = null;
  menuMapCacheSource = null;
  menuMapCacheLength = -1;
  itemsByGroupCache = null;
  itemsByGroupCacheSource = null;
  itemsByGroupCacheLength = -1;
}

if (typeof window !== 'undefined'){
  window.invalidateMenuUiCaches = invalidateMenuUiCaches;
}

function getMenuMap(){
  const source = menuMaster || [];
  if (menuMapCache && menuMapCacheSource === source && menuMapCacheLength === source.length){
    return menuMapCache;
  }

  const map = {};
  source.forEach(item => {
    map[item.key] = item;
  });

  menuMapCache = map;
  menuMapCacheSource = source;
  menuMapCacheLength = source.length;
  return map;
}

function findCatalogByKey(key){
  return (menuKeyCatalog || []).find(item => String(item.key || '') === String(key || '')) || null;
}

function getMenuPrice(key, fallback){
  const map = getMenuMap();
  if (map[key] && map[key].price !== undefined && map[key].price !== null && map[key].price !== '') {
    return Number(map[key].price || 0);
  }
  return Number(fallback || 0);
}

function getMenuLabel(key, fallback){
  const map = getMenuMap();
  if (map[key] && map[key].label) return String(map[key].label);
  const catalog = findCatalogByKey(key);
  if (catalog && catalog.default_label) return String(catalog.default_label);
  return fallback;
}

function getMenuNote(key, fallback){
  const map = getMenuMap();
  if (map[key] && map[key].note) return String(map[key].note);
  return fallback || '';
}

function getItemsByGroup(group){
  const source = menuMaster || [];
  const normalizedGroup = String(group || '');

  if (!itemsByGroupCache || itemsByGroupCacheSource !== source || itemsByGroupCacheLength !== source.length){
    itemsByGroupCache = new Map();
    itemsByGroupCacheSource = source;
    itemsByGroupCacheLength = source.length;
  }

  if (itemsByGroupCache.has(normalizedGroup)){
    return itemsByGroupCache.get(normalizedGroup);
  }

  const items = source.filter(item => {
    if (String(item.menu_group || '') !== normalizedGroup) return false;
    if (item.is_visible === false || String(item.is_visible).toUpperCase() === 'FALSE') return false;
    return true;
  }).sort((a,b) => {
    const aOrder = Number(a.sort_order || 9999);
    const bOrder = Number(b.sort_order || 9999);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.key).localeCompare(String(b.key));
  });

  itemsByGroupCache.set(normalizedGroup, items);
  return items;
}

function getRuleByIndex(index){
  return (autoRuleCatalog || []).find(rule => Number(rule.index) === Number(index)) || null;
}

function getRuleEnabled(index){
  const rule = getRuleByIndex(index);
  return !!(rule && rule.enabled);
}

function applyCalendarGridColumns(gridEl, daysCount){
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const timeCol = isMobile ? 44 : 60;
  const sc = gridEl?.closest?.('.scroll-container') || gridEl?.parentElement;
  const baseW = (sc && sc.clientWidth) ? sc.clientWidth : window.innerWidth;

  if (!isMobile){
    const dayW = Math.max(110, Math.floor((baseW - timeCol) / 7));
    gridEl.style.gridTemplateColumns = `${timeCol}px repeat(${daysCount}, ${dayW}px)`;
  } else {
    gridEl.style.gridTemplateColumns = `${timeCol}px repeat(${daysCount}, minmax(62px, 1fr))`;
  }
}

function getDatesRange(){
  const today = new Date();
  today.setHours(0,0,0,0);

  const maxForwardDays = Number(config.max_forward_days || 30);
  const startOffset = String(config.same_day_enabled || '0') === '1' ? 0 : 1;
  const dates = [];

  for (let i=0;i<maxForwardDays;i++){
    const dt = new Date(today);
    dt.setDate(today.getDate() + startOffset + i);
    dates.push(dt);
  }
  return dates;
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

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const dateRangeEl = document.getElementById('dateRange');
  if (!grid || !dateRangeEl) return;

  const dates = getDatesRange();
  calendarDates = dates;

  if (dates.length === 0) {
    dateRangeEl.textContent = '';
    grid.innerHTML = '';
    return;
  }

  dateRangeEl.textContent = `${formatDate(dates[0])} ～ ${formatDate(dates[dates.length-1])}`;

  const { regularSlots, extendedSlots } = buildSlots();

  let html = '';
  html += '<div class="time-label sticky-corner">時間</div>';

  dates.forEach((date, idx)=>{
    const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
    html += `<div class="date-header sticky-top ${isWeekend ? 'weekend' : ''}" data-date-idx="${idx}">${formatDate(date)}</div>`;
  });

  for (const slot of regularSlots){
    html += `<div class="time-label sticky-left">${slot.display}</div>`;
    for (let idx=0; idx<dates.length; idx++){
      const date = dates[idx];
      const blocked = isSlotBlockedWithMinute(date, slot.hour, slot.minute);
      const slotClass = blocked ? 'slot-unavailable' : 'slot-available';

      html += `<div class="${slotClass} p-3 text-center text-lg font-bold rounded-lg cursor-pointer transition"
                data-action="slot"
                data-date-idx="${idx}"
                data-hour="${slot.hour}"
                data-minute="${slot.minute}">
                ${blocked ? 'X' : '◎'}
              </div>`;
    }
  }

  const shouldShowExtended = isExtendedView;
  if (shouldShowExtended){
    html += '<div class="time-label sticky-left" style="font-weight:bold;background:linear-gradient(135deg,#cffafe 0%,#a5f3fc 100%);color:#0e7490;border:2px solid #06b6d4;">他時間</div>';

    dates.forEach((date, idx)=>{
      const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
      html += `<div class="date-header ${isWeekend ? 'weekend' : ''}"
                style="background:linear-gradient(135deg,#cffafe 0%,#a5f3fc 100%);border-color:#06b6d4;color:#0e7490;"
                data-date-idx="${idx}">${formatDate(date)}</div>`;
    });

    for (const slot of extendedSlots){
      html += `<div class="time-label sticky-left" style="background:linear-gradient(135deg,#cffafe 0%,#a5f3fc 100%);border:2px solid #06b6d4;color:#0e7490;font-weight:600;">${slot.display}</div>`;
      for (let idx=0; idx<dates.length; idx++){
        const date = dates[idx];
        const blocked = isSlotBlockedWithMinute(date, slot.hour, slot.minute);
        const slotClass = blocked ? 'slot-unavailable' : 'slot-alternate';

        html += `<div class="${slotClass} p-3 text-center text-lg font-bold rounded-lg cursor-pointer transition"
                  data-action="slot"
                  data-date-idx="${idx}"
                  data-hour="${slot.hour}"
                  data-minute="${slot.minute}">
                  ${blocked ? 'X' : '◎'}
                </div>`;
      }
    }
  }

  grid.innerHTML = html;

  applyCalendarGridColumns(grid, dates.length);
  requestAnimationFrame(()=> applyCalendarGridColumns(grid, dates.length));
}

function bindGridDelegation(){
  if (hasBoundGridDelegation) return;

  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  grid.addEventListener('click', async (ev)=>{
    const el = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
    if (!el) return;

    const action = el.dataset.action;

    if (action === 'slot'){
      const dateIdx = Number(el.dataset.dateIdx);
      const hour = Number(el.dataset.hour);
      const minute = Number(el.dataset.minute || 0);

      const date = calendarDates[dateIdx];
      if (!date) return;

      const blocked = isSlotBlockedWithMinute(date, hour, minute);
      if (blocked) return;

      openBookingForm(date, hour, minute);
    }
  }, { passive: false });

  hasBoundGridDelegation = true;
}

function buildSelectOptions(selectEl, items, includePlaceholder, placeholderText, formatter){
  if (!selectEl) return;
  let html = '';
  if (includePlaceholder) {
    html += `<option value="">${escapeHtml(placeholderText)}</option>`;
  }
  items.forEach(item => {
    const label = typeof formatter === 'function' ? formatter(item) : item.label;
    html += `<option value="${escapeHtml(String(item.label))}">${escapeHtml(String(label))}</option>`;
  });
  selectEl.innerHTML = html;
}

function renderServiceSelectors(){
  const assistanceItems = getItemsByGroup('assistance');
  const stairItems = getItemsByGroup('stair');
  const equipmentItems = getItemsByGroup('equipment');
  const roundTripItems = getItemsByGroup('round_trip');

  buildSelectOptions(
    document.getElementById('assistanceType'),
    assistanceItems,
    true,
    config.form_usage_type_placeholder || '選択してください',
    function(item){ return `${item.label}(${Number(item.price || 0).toLocaleString()}円)`; }
  );

  buildSelectOptions(
    document.getElementById('stairAssistance'),
    stairItems,
    false,
    '',
    function(item){ return `${item.label}(${Number(item.price || 0).toLocaleString()}円)`; }
  );

  buildSelectOptions(
    document.getElementById('equipmentRental'),
    equipmentItems,
    true,
    config.form_usage_type_placeholder || '選択してください',
    function(item){ return `${item.label}(${Number(item.price || 0).toLocaleString()}円)`; }
  );

  buildSelectOptions(
    document.getElementById('roundTrip'),
    roundTripItems,
    false,
    '',
    function(item){
      const note = item.note ? item.note : '';
      if (note && note.includes('30分毎')) {
        return `${item.label}(${Number(item.price || 0).toLocaleString()}円から/30分毎)`;
      }
      return `${item.label}(${Number(item.price || 0).toLocaleString()}円)`;
    }
  );

  const assistanceNote = [
    `<strong>${escapeHtml(getMenuLabel('BOARDING_ASSIST', '乗降介助'))}:</strong>${escapeHtml(getMenuNote('BOARDING_ASSIST', '玄関から車両への車いす等固定まで'))}`,
    `<strong>${escapeHtml(getMenuLabel('BODY_ASSIST', '身体介助'))}:</strong>${escapeHtml(getMenuNote('BODY_ASSIST', 'お部屋から車両への車いす等固定まで'))}`
  ].join('<br>');
  document.getElementById('assistanceNote').innerHTML = assistanceNote;

  const stairNote = [
    `<strong>${escapeHtml(getMenuLabel('STAIR_WATCH', '見守り介助'))}:</strong>${escapeHtml(getMenuNote('STAIR_WATCH', '自力歩行可能で手を握る介助'))}`,
    `<strong>階段移動:</strong>背負い移動または2名による介助`
  ].join('<br>');
  document.getElementById('stairNote').innerHTML = stairNote;

  document.getElementById('equipmentNote').innerHTML = '';

  const roundTripNote = [
    `<strong>${escapeHtml(getMenuLabel('ROUND_STANDBY', '待機'))}:</strong>病院駐車場等で待機`,
    `<strong>${escapeHtml(getMenuLabel('ROUND_HOSPITAL', '病院付き添い'))}:</strong>病院内での移動や会計などをサポート`
  ].join('<br>');
  document.getElementById('roundTripNote').innerHTML = roundTripNote;
}

function openBookingForm(date, hour, minute=0){
  if (!Array.isArray(menuMaster) || menuMaster.length === 0){
    toast('読み込み中です。少し待ってからもう一度お試しください');
    return;
  }

  selectedSlot = { date, hour, minute };
  document.getElementById('selectedSlotInfo').textContent =
    `${formatDate(date)} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} から`;
  document.getElementById('bookingModal').classList.remove('hidden');
  resetBookingForm();
  calculatePrice();
}

function resetBookingForm(){
  const form = document.getElementById('bookingForm');
  form.reset();

  const oldError = document.querySelector('#bookingForm .booking-error');
  if (oldError) oldError.remove();

  const stairWarningEl = document.getElementById('stairWarning');
  const wheelchairWarningEl = document.getElementById('wheelchairWarning');
  const stretcherWarningEl = document.getElementById('stretcherWarning');
  if (stairWarningEl) stairWarningEl.classList.add('hidden');
  if (wheelchairWarningEl) wheelchairWarningEl.classList.add('hidden');
  if (stretcherWarningEl) stretcherWarningEl.classList.add('hidden');

  const stairDefault = getItemsByGroup('stair')[0];
  const roundDefault = getItemsByGroup('round_trip')[0];
  if (stairDefault) document.getElementById('stairAssistance').value = stairDefault.label;
  if (roundDefault) document.getElementById('roundTrip').value = roundDefault.label;

  updateSubmitButton();
}

function calculatePrice(){
  let total = 0;
  const breakdown = [];

  const assistanceType = document.getElementById('assistanceType').value;
  const stairAssistance = document.getElementById('stairAssistance').value;
  const equipmentRental = document.getElementById('equipmentRental').value;
  const roundTrip = document.getElementById('roundTrip').value;

  const stairWarning = document.getElementById('stairWarning');
  const stretcherWarning = document.getElementById('stretcherWarning');
  const wheelchairWarning = document.getElementById('wheelchairWarning');
  const assistanceSelect = document.getElementById('assistanceType');

  let mustUseBodyAssist = false;
  let mustUseStretcherStaff2 = false;

  if (stairWarning) stairWarning.classList.add('hidden');
  if (stretcherWarning) stretcherWarning.classList.add('hidden');
  if (wheelchairWarning) wheelchairWarning.classList.add('hidden');

  const baseFare = getMenuPrice('BASE_FARE', 730);
  const dispatch = getMenuPrice('DISPATCH', 800);
  const specialVehicle = getMenuPrice('SPECIAL_VEHICLE', 1000);
  const boardingAssistPrice = getMenuPrice('BOARDING_ASSIST', 1400);
  const bodyAssistPrice = getMenuPrice('BODY_ASSIST', 3000);
  const stair2Price = getMenuPrice('STAIR_2F', 6000);
  const stair3Price = getMenuPrice('STAIR_3F', 9000);
  const stair4Price = getMenuPrice('STAIR_4F', 12000);
  const stair5Price = getMenuPrice('STAIR_5F', 15000);
  const recliningPrice = getMenuPrice('EQUIP_RECLINING', 2500);
  const stretcherPrice = getMenuPrice('EQUIP_STRETCHER', 5000);
  const stretcherStaffPrice = getMenuPrice('EQUIP_STRETCHER_STAFF2', 5000);
  const standbyPrice = getMenuPrice('ROUND_STANDBY', 800);
  const hospitalEscortPrice = getMenuPrice('ROUND_HOSPITAL', 1600);

  total += baseFare + dispatch + specialVehicle;
  breakdown.push({ name:getMenuLabel('BASE_FARE', '運賃'), price:baseFare, suffix:' から' });
  breakdown.push({ name:getMenuLabel('DISPATCH', '配車予約'), price:dispatch });
  breakdown.push({ name:getMenuLabel('SPECIAL_VEHICLE', '特殊車両使用料'), price:specialVehicle });

  const stairNeedBody = (
    stairAssistance &&
    stairAssistance !== getMenuLabel('STAIR_NONE', '不要') &&
    stairAssistance !== getMenuLabel('STAIR_WATCH', '見守り介助')
  );

  if (stairNeedBody) {
    if (String(config.rule_force_body_assist_on_stair || '1') === '1' || getRuleEnabled(1) || getRuleEnabled(2) || getRuleEnabled(3) || getRuleEnabled(4)) {
      mustUseBodyAssist = true;
    }
  }

  if (equipmentRental === getMenuLabel('EQUIP_STRETCHER', 'ストレッチャーレンタル')){

    if (String(config.rule_force_body_assist_on_stretcher || '1') === '1' || getRuleEnabled(5)) {
      mustUseBodyAssist = true;
    }
    if (String(config.rule_force_stretcher_staff2_on_stretcher || '1') === '1' || getRuleEnabled(6)) {
      mustUseStretcherStaff2 = true;
    }
  }

  if (equipmentRental === getMenuLabel('EQUIP_OWN_WHEELCHAIR', 'ご自身車いす')){
  }

  if (mustUseBodyAssist){
    assistanceSelect.value = getMenuLabel('BODY_ASSIST', '身体介助');
    total += bodyAssistPrice;
    breakdown.push({ name:getMenuLabel('BODY_ASSIST', '身体介助'), price:bodyAssistPrice });
  } else {
    if (assistanceType === getMenuLabel('BOARDING_ASSIST', '乗降介助')){
      total += boardingAssistPrice;
      breakdown.push({ name:getMenuLabel('BOARDING_ASSIST', '乗降介助'), price:boardingAssistPrice });
    } else if (assistanceType === getMenuLabel('BODY_ASSIST', '身体介助')){
      total += bodyAssistPrice;
      breakdown.push({ name:getMenuLabel('BODY_ASSIST', '身体介助'), price:bodyAssistPrice });
    }
  }

  const stairPrices = {};
  stairPrices[getMenuLabel('STAIR_2F', '2階移動')] = stair2Price;
  stairPrices[getMenuLabel('STAIR_3F', '3階移動')] = stair3Price;
  stairPrices[getMenuLabel('STAIR_4F', '4階移動')] = stair4Price;
  stairPrices[getMenuLabel('STAIR_5F', '5階移動')] = stair5Price;

  if (stairPrices[stairAssistance] !== undefined){
    total += stairPrices[stairAssistance];
    breakdown.push({ name:`階段介助(${stairAssistance})`, price:stairPrices[stairAssistance] });
  } else if (stairAssistance === getMenuLabel('STAIR_WATCH', '見守り介助')){
    breakdown.push({ name:getMenuLabel('STAIR_WATCH', '見守り介助'), price:0 });
  }

  if (equipmentRental === getMenuLabel('EQUIP_RECLINING', 'リクライニング車いすレンタル')){
    total += recliningPrice;
    breakdown.push({ name:getMenuLabel('EQUIP_RECLINING', 'リクライニング車いすレンタル'), price:recliningPrice });
  } else if (equipmentRental === getMenuLabel('EQUIP_STRETCHER', 'ストレッチャーレンタル')){
    total += stretcherPrice;
    breakdown.push({ name:getMenuLabel('EQUIP_STRETCHER', 'ストレッチャーレンタル'), price:stretcherPrice });

    if (mustUseStretcherStaff2){
      total += stretcherStaffPrice;
      breakdown.push({ name:getMenuLabel('EQUIP_STRETCHER_STAFF2', 'ストレッチャー2名体制介助料'), price:stretcherStaffPrice });
    }
  } else if (equipmentRental === getMenuLabel('EQUIP_WHEELCHAIR', '車いすレンタル')){
    breakdown.push({ name:getMenuLabel('EQUIP_WHEELCHAIR', '車いすレンタル'), price:0 });
  } else if (equipmentRental === getMenuLabel('EQUIP_OWN_WHEELCHAIR', 'ご自身車いす')){
    breakdown.push({ name:getMenuLabel('EQUIP_OWN_WHEELCHAIR', 'ご自身車いす'), price:0 });
  }

  if (roundTrip === getMenuLabel('ROUND_STANDBY', '待機')){
    total += standbyPrice;
    breakdown.push({ name:getMenuLabel('ROUND_STANDBY', '待機'), price:standbyPrice, suffix:' から/30分毎' });
  } else if (roundTrip === getMenuLabel('ROUND_HOSPITAL', '病院付き添い')){
    total += hospitalEscortPrice;
    breakdown.push({ name:getMenuLabel('ROUND_HOSPITAL', '病院付き添い'), price:hospitalEscortPrice, suffix:' から/30分毎' });
  }

  const breakdownEl = document.getElementById('priceBreakdown');
  breakdownEl.innerHTML = breakdown.map(item => `
    <div class="price-item">
      <span class="price-label">${escapeHtml(item.name)}</span>
      <span class="price-value">${Number(item.price).toLocaleString()}円${escapeHtml(item.suffix || '')}</span>
    </div>
  `).join('');

  document.getElementById('totalPrice').textContent = `${total.toLocaleString()}円`;
  return total;
}

function updateSubmitButton(){
  const privacy = document.getElementById('privacyAgreement').checked;
  const usageType = document.getElementById('usageType').value;
  const customerName = document.getElementById('customerName').value.trim();
  const phoneNumber = document.getElementById('phoneNumber').value.trim();
  const pickupLocation = document.getElementById('pickupLocation').value.trim();
  const assistanceType = document.getElementById('assistanceType').value;
  const equipmentRental = document.getElementById('equipmentRental').value;

  const isValid = privacy && usageType && customerName && phoneNumber && pickupLocation && assistanceType && equipmentRental && !isSubmittingBooking;

  const submitBtn = document.getElementById('submitBooking');
  if (isValid){
    submitBtn.disabled = false;
    submitBtn.className = 'w-full cute-btn py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 cursor-pointer text-lg';
  } else {
    submitBtn.disabled = true;
    submitBtn.className = 'w-full cute-btn py-4 bg-gray-300 text-white cursor-not-allowed text-lg';
  }
}

function applyConfigToUI(){
  const titleEl = document.getElementById('mainTitle');
  const subEl = document.getElementById('mainSubTitle');
  const notifyEl = document.getElementById('notifyPhoneText');

  if (titleEl) titleEl.textContent = config.logo_text || config.main_title || defaultConfig.main_title;
  if (subEl) subEl.textContent = config.logo_subtext || defaultConfig.logo_subtext;
  if (notifyEl) notifyEl.textContent = `[${config.phone_notify_text || defaultConfig.phone_notify_text}]`;

  const toggleBtn = document.getElementById('toggleTimeView');
  if (toggleBtn) {
    const extendedEnabled = String(config.extended_enabled || '1') === '1';
    toggleBtn.style.display = extendedEnabled ? '' : 'none';
    if (!extendedEnabled) {
      isExtendedView = false;
    }
    toggleBtn.textContent = isExtendedView
      ? (config.calendar_toggle_regular_text || defaultConfig.calendar_toggle_regular_text)
      : (config.calendar_toggle_extended_text || defaultConfig.calendar_toggle_extended_text);
  }

  document.getElementById('legendAvailableText').textContent = config.calendar_legend_available || defaultConfig.calendar_legend_available;
  document.getElementById('legendUnavailableText').textContent = config.calendar_legend_unavailable || defaultConfig.calendar_legend_unavailable;
  document.getElementById('scrollGuideText').textContent = config.calendar_scroll_guide_text || defaultConfig.calendar_scroll_guide_text;

  document.getElementById('formModalTitle').textContent = config.form_modal_title || defaultConfig.form_modal_title;
  document.getElementById('privacyText').childNodes[0].textContent = (config.form_privacy_text || defaultConfig.form_privacy_text) + ' ';
  document.getElementById('basicSectionTitle').textContent = config.form_basic_section_title || defaultConfig.form_basic_section_title;
  document.getElementById('basicSectionBadge').textContent = config.form_basic_section_badge || defaultConfig.form_basic_section_badge;
  document.getElementById('usageTypeLabel').innerHTML = `${escapeHtml(config.form_usage_type_label || defaultConfig.form_usage_type_label)} <span class="required">*</span>`;
  document.getElementById('customerNameLabel').innerHTML = `${escapeHtml(config.form_customer_name_label || defaultConfig.form_customer_name_label)} <span class="required">*</span>`;
  document.getElementById('phoneLabel').innerHTML = `${escapeHtml(config.form_phone_label || defaultConfig.form_phone_label)} <span class="required">*</span>`;
  document.getElementById('pickupLabel').innerHTML = `${escapeHtml(config.form_pickup_label || defaultConfig.form_pickup_label)} <span class="required">*</span>`;
  document.getElementById('optionalSectionTitle').textContent = config.form_optional_section_title || defaultConfig.form_optional_section_title;
  document.getElementById('optionalSectionBadge').textContent = config.form_optional_section_badge || defaultConfig.form_optional_section_badge;
  document.getElementById('destinationLabel').textContent = config.form_destination_label || defaultConfig.form_destination_label;
  document.getElementById('notesLabel').textContent = config.form_notes_label || defaultConfig.form_notes_label;
  document.getElementById('serviceSectionTitle').textContent = config.form_service_section_title || defaultConfig.form_service_section_title;
  document.getElementById('serviceSectionBadge').textContent = config.form_service_section_badge || defaultConfig.form_service_section_badge;
  document.getElementById('assistanceLabel').innerHTML = `${escapeHtml(config.form_assistance_label || defaultConfig.form_assistance_label)} <span class="required">*</span>`;
  document.getElementById('stairLabel').innerHTML = `${escapeHtml(config.form_stair_label || defaultConfig.form_stair_label)} <span class="required">*</span>`;
  document.getElementById('equipmentLabel').innerHTML = `${escapeHtml(config.form_equipment_label || defaultConfig.form_equipment_label)} <span class="required">*</span>`;
  document.getElementById('roundTripLabel').innerHTML = `${escapeHtml(config.form_round_trip_label || defaultConfig.form_round_trip_label)} <span class="required">*</span>`;
  document.getElementById('priceSectionTitle').textContent = config.form_price_section_title || defaultConfig.form_price_section_title;
  document.getElementById('priceTotalLabel').textContent = config.form_price_total_label || defaultConfig.form_price_total_label;
  document.getElementById('priceNoticeText').textContent = config.form_price_notice_text || defaultConfig.form_price_notice_text;
  document.getElementById('submitBooking').textContent = config.form_submit_button_text || defaultConfig.form_submit_button_text;

  document.getElementById('usageType').innerHTML = `
    <option value="">${escapeHtml(config.form_usage_type_placeholder || defaultConfig.form_usage_type_placeholder)}</option>
    <option value="${escapeHtml(config.form_usage_type_option_first || defaultConfig.form_usage_type_option_first)}">${escapeHtml(config.form_usage_type_option_first || defaultConfig.form_usage_type_option_first)}</option>
    <option value="${escapeHtml(config.form_usage_type_option_repeat || defaultConfig.form_usage_type_option_repeat)}">${escapeHtml(config.form_usage_type_option_repeat || defaultConfig.form_usage_type_option_repeat)}</option>
  `;

  document.getElementById('customerName').placeholder = config.form_customer_name_placeholder || defaultConfig.form_customer_name_placeholder;
  document.getElementById('phoneNumber').placeholder = config.form_phone_placeholder || defaultConfig.form_phone_placeholder;
  document.getElementById('pickupLocation').placeholder = config.form_pickup_placeholder || defaultConfig.form_pickup_placeholder;
  document.getElementById('destination').placeholder = config.form_destination_placeholder || defaultConfig.form_destination_placeholder;
  document.getElementById('notes').placeholder = config.form_notes_placeholder || defaultConfig.form_notes_placeholder;

  document.getElementById('completeTitle').textContent = config.complete_title || defaultConfig.complete_title;
  document.getElementById('completeTitleSub').textContent = config.complete_title_sub || defaultConfig.complete_title_sub;
  document.getElementById('completeReservationIdLabel').textContent = config.complete_reservation_id_label || defaultConfig.complete_reservation_id_label;
  document.getElementById('completePhoneGuidePrefix').textContent = config.complete_phone_guide_prefix || defaultConfig.complete_phone_guide_prefix;
  document.getElementById('completePhoneGuideMiddle').textContent = config.complete_phone_guide_middle || defaultConfig.complete_phone_guide_middle;
  document.getElementById('completePhoneGuideAfter').textContent = config.complete_phone_guide_after || defaultConfig.complete_phone_guide_after;
  document.getElementById('completePhoneGuideWarning').textContent = config.complete_phone_guide_warning || defaultConfig.complete_phone_guide_warning;
  document.getElementById('completePhoneGuideFooter').textContent = config.complete_phone_guide_footer || defaultConfig.complete_phone_guide_footer;
  document.getElementById('closeComplete').textContent = config.complete_close_button_text || defaultConfig.complete_close_button_text;

  updateLogoPreview();
}

async function updateLogoPreview(){
  const mainImg = document.getElementById('adminLoginImg');
  const logoText = config.logo_text || config.main_title || defaultConfig.main_title;
  const logoSubText = config.logo_subtext || defaultConfig.logo_subtext;

  const titleEl = document.getElementById('mainTitle');
  const subEl = document.getElementById('mainSubTitle');
  if (titleEl) titleEl.textContent = logoText;
  if (subEl) subEl.textContent = logoSubText;

  let finalSrc = config.logo_image_url || 'https://raw.githubusercontent.com/infochibafukushi-dotcom/reservation-v2/main/assets/assets/assets/logo/logo.webp';

  const useDrive = String(config.logo_use_drive_image || '0') === '1';
  const driveFileId = String(config.logo_drive_file_id || '').trim();

  if (!finalSrc && useDrive && driveFileId) {
    try{
      const res = await gsRun('api_getDriveImageDataUrl', driveFileId);
      if (res && res.isOk && res.data && res.data.dataUrl) {
        finalSrc = res.data.dataUrl;
      }
    }catch(_){}
  }

  if (mainImg) {
    mainImg.src = finalSrc || 'https://raw.githubusercontent.com/infochibafukushi-dotcom/reservation-v2/main/assets/assets/assets/logo/logo.webp';
    mainImg.onerror = function(){
      mainImg.onerror = null;
      mainImg.src = 'https://raw.githubusercontent.com/infochibafukushi-dotcom/reservation-v2/main/assets/assets/assets/logo/logo.webp';
    };
  }
}

function bindUI(){
  let tapCount = 0;
  let tapTimer = null;

  document.getElementById('adminLoginBtn').addEventListener('click', ()=>{
    tapCount++;
    if (tapTimer) clearTimeout(tapTimer);

    const targetTapCount = Number(config.admin_tap_count || defaultConfig.admin_tap_count || 5);

    if (tapCount === targetTapCount){
      document.getElementById('passwordModal').classList.remove('hidden');
      document.getElementById('adminPassword').value = '';
      document.getElementById('passwordError').classList.add('hidden');
      document.getElementById('adminPassword').focus();
      tapCount = 0;
    } else {
      tapTimer = setTimeout(()=> tapCount = 0, 1500);
    }
  });

  async function doAdminLogin(){
    const password = String(document.getElementById('adminPassword').value || '').trim();

    try{
      let authRes = null;
      await withLoading(async ()=>{
        authRes = await gsRun('api_verifyAdminPassword', { password: password });
      }, '認証中...');

      sessionStorage.setItem('chiba_care_taxi_admin_auth', 'ok');
      sessionStorage.setItem('chiba_care_taxi_admin_auth_time', String(Date.now()));
      sessionStorage.setItem('chiba_care_taxi_admin_token', String(authRes && authRes.data && authRes.data.admin_token || ''));

      window.location.href = ADMIN_PAGE_URL;

    }catch(e){
      document.getElementById('passwordError').classList.remove('hidden');
      document.getElementById('adminPassword').value = '';
      document.getElementById('adminPassword').focus();
    }
  }

  document.getElementById('submitPassword').addEventListener('click', doAdminLogin);
  document.getElementById('adminPassword').addEventListener('keypress', (e)=>{
    if (e.key === 'Enter') doAdminLogin();
  });
  document.getElementById('cancelPassword').addEventListener('click', ()=>{
    document.getElementById('passwordModal').classList.add('hidden');
  });

  document.getElementById('closeBooking').addEventListener('click', ()=> document.getElementById('bookingModal').classList.add('hidden'));
  document.getElementById('closeComplete').addEventListener('click', ()=> document.getElementById('completeModal').classList.add('hidden'));

  document.getElementById('toggleTimeView').addEventListener('click', ()=>{
    isExtendedView = !isExtendedView;
    const btn = document.getElementById('toggleTimeView');
    if (isExtendedView){
      btn.classList.remove('from-sky-500','to-sky-600','hover:from-sky-600','hover:to-sky-700');
      btn.classList.add('from-cyan-500','to-cyan-600','hover:from-cyan-600','hover:to-cyan-700');
      btn.textContent = config.calendar_toggle_regular_text || '通常時間';
    } else {
      btn.classList.remove('from-cyan-500','to-cyan-600','hover:from-cyan-600','hover:to-cyan-700');
      btn.classList.add('from-sky-500','to-sky-600','hover:from-sky-600','hover:to-sky-700');
      btn.textContent = config.calendar_toggle_extended_text || '他時間予約';
    }
    renderCalendar();
  });

  const formInputs = ['privacyAgreement','usageType','customerName','phoneNumber','pickupLocation','assistanceType','equipmentRental'];
  formInputs.forEach(id=>{
    document.getElementById(id).addEventListener('change', updateSubmitButton);
    document.getElementById(id).addEventListener('input', updateSubmitButton);
  });

  const priceInputs = ['assistanceType','stairAssistance','equipmentRental','roundTrip'];
  priceInputs.forEach(id=>{
    document.getElementById(id).addEventListener('change', ()=>{
      calculatePrice();
      updateSubmitButton();
    });
  });

  window.addEventListener('resize', debounce(()=>{
    try{
      renderCalendar();
    }catch(_){}
  }, 150));
}
