function buildSelectOptions(selectEl, items, includePlaceholder, placeholderText, formatter){
  if (!selectEl) return;
  let html = '';
  if (includePlaceholder) {
    html += `<option value="">${escapeHtml(placeholderText)}</option>`;
  }
  items.forEach(item => {
    const label = typeof formatter === 'function' ? formatter(item) : item.label;
    html += `<option value="${escapeHtml(String(item.label))}" data-key="${escapeHtml(String(item.key || ''))}">${escapeHtml(String(label))}</option>`;
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

function getSelectedOptionKey(selectId){
  const select = document.getElementById(selectId);
  if (!select) return '';
  const option = select.options[select.selectedIndex];
  if (!option) return '';
  return String(option.dataset.key || '').trim();
}

function findAutoApplyFromMenu(targetGroup, triggerKey){
  if (!targetGroup || !triggerKey) return null;

  const menuGroup = getMenuAutoApplyGroup(triggerKey);
  const menuKey = getMenuAutoApplyKey(triggerKey);
  if (menuGroup && menuKey) {
    return {
      apply_group: menuGroup,
      apply_key: menuKey
    };
  }

  const rule = getAutoRuleByTrigger(targetGroup, triggerKey);
  if (rule && rule.apply_group && rule.apply_key){
    return {
      apply_group: String(rule.apply_group || ''),
      apply_key: String(rule.apply_key || '')
    };
  }

  return null;
}

function setSelectValueByKey(selectId, key){
  const select = document.getElementById(selectId);
  if (!select) return false;

  const options = Array.from(select.options || []);
  const found = options.find(opt => String(opt.dataset.key || '') === String(key || ''));
  if (!found) return false;

  select.value = found.value;
  return true;
}

function applyAutoSelections(){
  const stairKey = getSelectedOptionKey('stairAssistance');
  const equipmentKey = getSelectedOptionKey('equipmentRental');

  const stairWarning = document.getElementById('stairWarning');
  const stretcherWarning = document.getElementById('stretcherWarning');
  const wheelchairWarning = document.getElementById('wheelchairWarning');

  stairWarning.classList.add('hidden');
  stretcherWarning.classList.add('hidden');
  wheelchairWarning.classList.add('hidden');

  let appliedBodyAssist = false;
  let appliedStaff2 = false;

  const stairAuto = findAutoApplyFromMenu('stair', stairKey);
  if (stairAuto && stairAuto.apply_group === 'assistance' && stairAuto.apply_key === 'BODY_ASSIST'){
    if (setSelectValueByKey('assistanceType', 'BODY_ASSIST')){
      appliedBodyAssist = true;
      stairWarning.textContent = config.warning_stair_bodyassist_text || defaultConfig.warning_stair_bodyassist_text;
      stairWarning.classList.remove('hidden');
    }
  } else {
    const stairNeedBody = stairKey && !['STAIR_NONE','STAIR_WATCH'].includes(stairKey);
    if (stairNeedBody && String(config.rule_force_body_assist_on_stair || '1') === '1'){
      if (setSelectValueByKey('assistanceType', 'BODY_ASSIST')){
        appliedBodyAssist = true;
        stairWarning.textContent = config.warning_stair_bodyassist_text || defaultConfig.warning_stair_bodyassist_text;
        stairWarning.classList.remove('hidden');
      }
    }
  }

  const equipAuto = findAutoApplyFromMenu('equipment', equipmentKey);
  if (equipmentKey === 'EQUIP_STRETCHER'){
    stretcherWarning.textContent = config.warning_stretcher_bodyassist_text || defaultConfig.warning_stretcher_bodyassist_text;
    stretcherWarning.classList.remove('hidden');

    if (equipAuto && equipAuto.apply_group === 'assistance' && equipAuto.apply_key === 'BODY_ASSIST'){
      if (setSelectValueByKey('assistanceType', 'BODY_ASSIST')){
        appliedBodyAssist = true;
      }
    } else if (String(config.rule_force_body_assist_on_stretcher || '1') === '1'){
      if (setSelectValueByKey('assistanceType', 'BODY_ASSIST')){
        appliedBodyAssist = true;
      }
    }

    const equipmentMap = getMenuMap();
    const stretcherMenu = equipmentMap['EQUIP_STRETCHER'];
    if (stretcherMenu && String(stretcherMenu.auto_apply_group || '') === 'equipment' && String(stretcherMenu.auto_apply_key || '') === 'EQUIP_STRETCHER_STAFF2'){
      appliedStaff2 = true;
    } else {
      const staffRule = getAutoRuleByTrigger('equipment', 'EQUIP_STRETCHER');
      if (staffRule && String(staffRule.apply_group || '') === 'equipment' && String(staffRule.apply_key || '') === 'EQUIP_STRETCHER_STAFF2'){
        appliedStaff2 = true;
      } else if (String(config.rule_force_stretcher_staff2_on_stretcher || '1') === '1'){
        appliedStaff2 = true;
      }
    }
  }

  if (equipmentKey === 'EQUIP_OWN_WHEELCHAIR'){
    wheelchairWarning.textContent = config.warning_wheelchair_damage_text || defaultConfig.warning_wheelchair_damage_text;
    wheelchairWarning.classList.remove('hidden');
  }

  return {
    appliedBodyAssist: appliedBodyAssist,
    appliedStaff2: appliedStaff2
  };
}

function hasBookingSelectOptionsReady(){
  const moveTypeEl = document.getElementById('moveType');
  const assistanceEl = document.getElementById('assistanceType');
  const stairEl = document.getElementById('stairAssistance');
  const equipmentEl = document.getElementById('equipmentRental');
  const roundTripEl = document.getElementById('roundTrip');

  const moveTypeReady = !!(moveTypeEl && moveTypeEl.options && moveTypeEl.options.length > 1);
  const assistanceReady = !!(assistanceEl && assistanceEl.options && assistanceEl.options.length > 1);
  const stairReady = !!(stairEl && stairEl.options && stairEl.options.length > 0);
  const equipmentReady = !!(equipmentEl && equipmentEl.options && equipmentEl.options.length > 1);
  const roundTripReady = !!(roundTripEl && roundTripEl.options && roundTripEl.options.length > 0);

  return moveTypeReady && assistanceReady && stairReady && equipmentReady && roundTripReady;
}

async function ensureBookingFormOptionsReady(){
  if (hasBookingSelectOptionsReady()) return true;

  try{
    await refreshAllData(true);
  }catch(_){ }

  try{
    renderServiceSelectors();
  }catch(_){ }

  if (hasBookingSelectOptionsReady()) return true;

  try{
    await sleep(250);
    renderServiceSelectors();
  }catch(_){ }

  return hasBookingSelectOptionsReady();
}

async function openBookingForm(date, hour, minute=0){
  try{
    await ensureFullPublicBootstrapLoaded(true);
  }catch(_){
    toast('フォーム読込中です。少し待ってからもう一度お試しください');
    return;
  }

  const ready = await ensureBookingFormOptionsReady();
  if (!ready){
    toast('フォーム読込中です。少し待ってからもう一度お試しください');
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
  document.getElementById('bookingForm').reset();
  document.getElementById('stairWarning').classList.add('hidden');
  document.getElementById('wheelchairWarning').classList.add('hidden');
  document.getElementById('stretcherWarning').classList.add('hidden');

  const oldError = document.querySelector('#bookingForm .booking-error');
  if (oldError) oldError.remove();

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

  const autoState = applyAutoSelections();

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

  if (autoState.appliedBodyAssist){
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

    if (autoState.appliedStaff2){
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

  const isValid = privacy && usageType && customerName && phoneNumber && pickupLocation && assistanceType && equipmentRental;

  const submitBtn = document.getElementById('submitBooking');
  if (isValid){
    submitBtn.disabled = false;
    submitBtn.className = 'w-full cute-btn py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 cursor-pointer text-lg';
  } else {
    submitBtn.disabled = true;
    submitBtn.className = 'w-full cute-btn py-4 bg-gray-300 text-white cursor-not-allowed text-lg';
  }
}

async function waitAndRefresh_(waitMs){
  await sleep(waitMs || 700);
  await refreshAllData(true);
}

async function waitUntilSelectedSlotBlocked_(retryCount = 4){
  if (!selectedSlot || typeof refreshAllData !== 'function') return;

  const waits = [600, 1000, 1500, 2200, 3000];
  for (let i = 0; i <= retryCount; i++){
    try{
      if (typeof isSlotBlockedWithMinute === 'function' &&
          isSlotBlockedWithMinute(selectedSlot.date, selectedSlot.hour, selectedSlot.minute)) {
        try{ renderCalendar(); }catch(_){}
        return;
      }
    }catch(_){}

    try{
      await refreshAllData(false);
    }catch(_){}

    try{
      if (typeof isSlotBlockedWithMinute === 'function' &&
          isSlotBlockedWithMinute(selectedSlot.date, selectedSlot.hour, selectedSlot.minute)) {
        try{ renderCalendar(); }catch(_){}
        return;
      }
    }catch(_){}

    if (i < retryCount){
      await sleep(waits[Math.min(i, waits.length - 1)]);
    }
  }

  try{ renderCalendar(); }catch(_){}
}

async function submitBooking(e){
  e.preventDefault();

  const submitBtn = document.getElementById('submitBooking');
  if (submitBtn.dataset.sending === '1') return;

  submitBtn.dataset.sending = '1';
  submitBtn.disabled = true;
  submitBtn.textContent = '予約中...';

  const reservationId = formatDateForId(selectedSlot.date, selectedSlot.hour, selectedSlot.minute);
  const total = calculatePrice();

  const equipmentRental = document.getElementById('equipmentRental').value;
  const autoState = applyAutoSelections();

  const stretcherTwoStaff = (
    equipmentRental === getMenuLabel('EQUIP_STRETCHER', 'ストレッチャーレンタル') &&
    autoState.appliedStaff2
  ) ? 'あり' : 'なし';

  const slotDateStr = ymdLocal(selectedSlot.date);

  const reservation = {
    reservation_id: reservationId,
    reservation_datetime: `${slotDateStr} ${String(selectedSlot.hour).padStart(2,'0')}:${String(selectedSlot.minute).padStart(2,'0')}`,
    usage_type: document.getElementById('usageType').value,
    customer_name: document.getElementById('customerName').value.trim(),
    phone_number: document.getElementById('phoneNumber').value.trim(),
    pickup_location: document.getElementById('pickupLocation').value.trim(),
    destination: document.getElementById('destination').value.trim() || '',
    assistance_type: document.getElementById('assistanceType').value,
    stair_assistance: document.getElementById('stairAssistance').value,
    equipment_rental: equipmentRental,
    stretcher_two_staff: stretcherTwoStaff,
    round_trip: document.getElementById('roundTrip').value,
    notes: document.getElementById('notes').value.trim() || '',
    total_price: total,
    status: '未対応',
    slot_date: slotDateStr,
    slot_hour: selectedSlot.hour,
    slot_minute: selectedSlot.minute,
    is_visible: true
  };

  try{
    await withLoading(async ()=>{
      await gsRun('api_createReservation', reservation);
    }, '予約中...');

    document.getElementById('reservationId').textContent = reservationId;
    document.getElementById('bookingModal').classList.add('hidden');
    document.getElementById('completeModal').classList.remove('hidden');

    // LINE通知の重複防止: クライアント側 fireTrigger は停止

    try{
      await waitAndRefresh_(800);
      await waitUntilSelectedSlotBlocked_(4);
    }catch(_){}

    submitBtn.disabled = false;
    submitBtn.dataset.sending = '0';
    submitBtn.textContent = config.form_submit_button_text || '予約する';

  }catch(err){
    submitBtn.disabled = false;
    submitBtn.dataset.sending = '0';
    submitBtn.textContent = config.form_submit_button_text || '予約する';
    toast(err?.message || '通信エラー（予約保存）');

    const oldError = document.querySelector('#bookingForm .booking-error');
    if (oldError) oldError.remove();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'booking-error bg-red-100 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl mb-4 font-medium';
    errorDiv.textContent = 'NG 予約に失敗しました。もう一度お試しください。';
    document.getElementById('bookingForm').prepend(errorDiv);
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
    toggleBtn.style.visibility = extendedEnabled ? 'visible' : 'hidden';
    toggleBtn.style.pointerEvents = extendedEnabled ? '' : 'none';
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

async function init(){
  try{
    try{
      hydratePublicCacheForFastPaint();
    }catch(_){ }

    bindGridDelegation();
    if (typeof prefetchPublicInitLiteForCurrentRange === 'function') {
      prefetchPublicInitLiteForCurrentRange(false).catch(function(){});
    }
    const initialRange = getPublicCalendarRange();
    const initialRangeKey = `${initialRange.start}__${initialRange.end}`;
    const hasInitialBlockedSnapshot = (String(blockedRangeCacheKey || '') === initialRangeKey);
    globalThis.__publicLiveDataReady = !!hasInitialBlockedSnapshot;
    globalThis.__publicAllowEarlyCalendarPaint = !!hasInitialBlockedSnapshot;

    const renderSoon = function(){
      if (typeof schedulePublicCalendarRender === 'function'){
        schedulePublicCalendarRender();
      } else if (typeof requestAnimationFrame === 'function'){
        requestAnimationFrame(()=>{
          try{ renderCalendar(); }catch(_){ }
        });
      } else {
        try{ renderCalendar(); }catch(_){ }
      }
    };

    const finalizeCalendarLoadingState = function(){
      if (!document.querySelector('.slot-loading')) return;
      try{
        if (typeof patchRenderedCalendarBlockedStates === 'function'){
          patchRenderedCalendarBlockedStates({
            previousBlockedSlots: new Set(),
            previousRangeKey: '',
            nextRangeKey: String(blockedRangeCacheKey || '')
          });
        } else {
          renderSoon();
        }
      }catch(_){
        renderSoon();
      }
    };

    // 初回描画は即時実行（体感速度向上）。
    // データが未取得の間はクリックで予約モーダルを開かないようにし、見た目を保ちつつ誤操作を防ぐ。
    renderSoon();

    refreshAllData(false)
      .then(function(){
        globalThis.__publicLiveDataReady = true;
        finalizeCalendarLoadingState();
      })
      .catch(function(e){
        const currentRange = getPublicCalendarRange();
        const currentRangeKey = `${currentRange.start}__${currentRange.end}`;
        globalThis.__publicLiveDataReady = (String(blockedRangeCacheKey || '') === currentRangeKey);
        if (globalThis.__publicLiveDataReady){
          finalizeCalendarLoadingState();
        }
        toast(e?.message || '通信エラー（データ取得）');
      });

    try{
      const warm = function(){
        try{
          ensureFullPublicBootstrapLoaded(false).catch(function(){});
        }catch(_){}
      };
      if (typeof requestIdleCallback === 'function'){
        requestIdleCallback(warm, { timeout: 1800 });
      } else {
        setTimeout(warm, 1200);
      }
    }catch(_){ }
  }catch(e){
    try{ showLoading(false); }catch(_){}
    toast('初期化エラー: ' + (e?.message || e));
    try{ renderCalendar(); }catch(_){}
  }
}

(function bindUI(){
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
      toast(e?.message || '認証に失敗しました');
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

  const formInputs = ['privacyAgreement','usageType','customerName','phoneNumber','pickupLocation','assistanceType','equipmentRental','moveType'];
  formInputs.forEach(id=>{
    document.getElementById(id).addEventListener('change', updateSubmitButton);
    document.getElementById(id).addEventListener('input', updateSubmitButton);
  });

  const priceInputs = ['moveType','assistanceType','stairAssistance','equipmentRental','roundTrip'];
  priceInputs.forEach(id=>{
    document.getElementById(id).addEventListener('change', ()=>{
      calculatePrice();
      updateSubmitButton();
    });
  });

  document.getElementById('bookingForm').addEventListener('submit', function(e){ return submitBooking(e); });

  window.addEventListener('resize', debounce(()=>{
    try{
      renderCalendar();
    }catch(_){}
  }, 150));
})();

init();


/* ===== move_type live patch ===== */
function getMoveTypeNoteTextPatched(key){
  const map = {
    MOVE_WHEELCHAIR: config.form_move_type_note_wheelchair || defaultConfig.form_move_type_note_wheelchair || '',
    MOVE_RECLINING: config.form_move_type_note_reclining || defaultConfig.form_move_type_note_reclining || '',
    MOVE_STRETCHER: config.form_move_type_note_stretcher || defaultConfig.form_move_type_note_stretcher || '',
    MOVE_OWN: config.form_move_type_note_own || defaultConfig.form_move_type_note_own || ''
  };
  return map[String(key || '')] || (config.form_move_type_help_text || defaultConfig.form_move_type_help_text || '');
}

function syncEquipmentFromMoveTypePatched(){
  const moveTypeKey = getSelectedOptionKey('moveType');
  if (!moveTypeKey) return '';
  const moveTypeAuto = findAutoApplyFromMenu('move_type', moveTypeKey);
  if (moveTypeAuto && moveTypeAuto.apply_group === 'equipment' && moveTypeAuto.apply_key){
    setSelectValueByKey('equipmentRental', moveTypeAuto.apply_key);
    return String(moveTypeAuto.apply_key || '');
  }
  return '';
}



function getPublicMenuGroupOrderConfig(){
  try{
    const parsed = JSON.parse(String(config.menu_group_order_json || '[]'));
    return Array.isArray(parsed) ? parsed.map(v => String(v || '').trim()).filter(Boolean) : [];
  }catch(_){
    return [];
  }
}

function getPublicMenuGroupVisibilityConfig(){
  try{
    const parsed = JSON.parse(String(config.menu_group_visibility_json || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }catch(_){
    return {};
  }
}

let publicServiceGroupCardMapCache = null;

function isPublicServiceCardMapCacheValid(map){
  if (!map) return false;
  const keys = ['move_type', 'assistance', 'stair', 'equipment', 'round_trip'];
  return keys.every(key => {
    const el = map[key];
    return !el || !!el.isConnected;
  });
}

function getPublicServiceGroupCardMap(){
  if (isPublicServiceCardMapCacheValid(publicServiceGroupCardMapCache)){
    return publicServiceGroupCardMapCache;
  }

  const map = {
    move_type: document.querySelector('[data-service-group-card="move_type"]'),
    assistance: document.querySelector('[data-service-group-card="assistance"]'),
    stair: document.querySelector('[data-service-group-card="stair"]'),
    equipment: document.querySelector('[data-service-group-card="equipment"]'),
    round_trip: document.querySelector('[data-service-group-card="round_trip"]')
  };

  publicServiceGroupCardMapCache = map;
  return map;
}

function isTruthyVisibilityFlag(value){
  return value === undefined
    || value === null
    || value === ''
    || value === true
    || String(value) === '1'
    || String(value).toUpperCase() === 'TRUE';
}

function applyPublicServiceGroupLayout(){
  const cardMap = getPublicServiceGroupCardMap();
  const firstCard = cardMap.move_type || cardMap.assistance || cardMap.stair || cardMap.equipment || cardMap.round_trip;
  if (!firstCard || !firstCard.parentNode) return;

  const wrap = firstCard.parentNode;
  const order = getPublicMenuGroupOrderConfig();
  const visibility = getPublicMenuGroupVisibilityConfig();

  const fallback = ['move_type', 'assistance', 'stair', 'equipment', 'round_trip'];
  const finalOrder = [];
  const seen = new Set();
  const pushUnique = (key) => {
    const value = String(key || '').trim();
    if (!value) return;
    if (!cardMap[value]) return;
    if (seen.has(value)) return;
    seen.add(value);
    finalOrder.push(value);
  };

  order.forEach(pushUnique);
  fallback.forEach(pushUnique);

  let needsReorder = false;
  for (let i=0; i<finalOrder.length; i++){
    const el = cardMap[finalOrder[i]];
    if (!el || el.parentNode !== wrap || wrap.children[i] !== el){
      needsReorder = true;
      break;
    }
  }

  finalOrder.forEach(group => {
    const el = cardMap[group];
    if (!el) return;
    const visible = isTruthyVisibilityFlag(visibility[group]);
    const display = visible ? '' : 'none';
    if (el.style.display !== display) el.style.display = display;
  });

  if (!needsReorder) return;

  const frag = document.createDocumentFragment();
  finalOrder.forEach(group => {
    const el = cardMap[group];
    if (el) frag.appendChild(el);
  });
  wrap.appendChild(frag);
}

const _renderServiceSelectorsOriginal = renderServiceSelectors;
renderServiceSelectors = function(){
  const moveTypeItems = getItemsByGroup('move_type');
  const moveTypeEl = document.getElementById('moveType');

  _renderServiceSelectorsOriginal();

  if (moveTypeEl){
    buildSelectOptions(
      moveTypeEl,
      moveTypeItems,
      true,
      config.form_move_type_placeholder || defaultConfig.form_move_type_placeholder || '選択してください',
      function(item){ return `${item.label}${Number(item.price || 0) ? `(${Number(item.price || 0).toLocaleString()}円)` : ''}`; }
    );
    const moveTypeLabel = document.getElementById('moveTypeLabel');
    if (moveTypeLabel) moveTypeLabel.innerHTML = `${escapeHtml(config.form_move_type_label || defaultConfig.form_move_type_label || '移動方法')} <span class="required">*</span>`;
    const moveTypeNote = document.getElementById('moveTypeNote');
    if (moveTypeNote) moveTypeNote.textContent = config.form_move_type_help_text || defaultConfig.form_move_type_help_text || '最初に移動方法をお選びください';
  }

  const stairNoteEl = document.getElementById('stairNote');
  if (stairNoteEl){
    stairNoteEl.innerHTML = [
      `<strong>${escapeHtml(getMenuLabel('STAIR_WATCH', '見守り介助'))}:</strong>${escapeHtml(getMenuNote('STAIR_WATCH', '自力歩行可能で手を握る介助'))}`,
      `<strong>階段移動:</strong>${escapeHtml(getMenuNote('STAIR_2F', '1名体制での目安'))}`
    ].join('<br>');
  }

  applyPublicServiceGroupLayout();
};

const _applyAutoSelectionsOriginal = applyAutoSelections;
applyAutoSelections = function(){
  const moveTypeKey = getSelectedOptionKey('moveType');
  const syncedEquipmentKey = syncEquipmentFromMoveTypePatched();
  const state = _applyAutoSelectionsOriginal();
  const equipmentKey = syncedEquipmentKey || getSelectedOptionKey('equipmentRental');

  const moveTypeNoteEl = document.getElementById('moveTypeNote');
  if (moveTypeNoteEl){
    moveTypeNoteEl.textContent = getMoveTypeNoteTextPatched(moveTypeKey);
  }

  if ((moveTypeKey === 'MOVE_STRETCHER' || equipmentKey === 'EQUIP_STRETCHER') && state && !state.appliedStaff2){
    state.appliedStaff2 = true;
    const sw = document.getElementById('stretcherWarning');
    if (sw){
      sw.textContent = (config.warning_stretcher_bodyassist_text || defaultConfig.warning_stretcher_bodyassist_text || 'ストレッチャー利用時は身体介助が必要です')
        + ' / '
        + (config.warning_staff_add_text || defaultConfig.warning_staff_add_text || '表示価格は1名体制での目安です。状況により安全確保のため2名体制となる場合があります（＋5,000円）');
      sw.classList.remove('hidden');
    }
  }

  if (state && state.appliedBodyAssist && (getSelectedOptionKey('stairAssistance') && !['STAIR_NONE','STAIR_WATCH'].includes(getSelectedOptionKey('stairAssistance')))){
    const stairWarning = document.getElementById('stairWarning');
    if (stairWarning){
      stairWarning.textContent = (config.warning_stair_bodyassist_text || defaultConfig.warning_stair_bodyassist_text || '階段介助ご利用時は身体介助が必要です')
        + ' / '
        + (config.warning_staff_add_text || defaultConfig.warning_staff_add_text || '表示価格は1名体制での目安です。状況により安全確保のため2名体制となる場合があります（＋5,000円）');
      stairWarning.classList.remove('hidden');
    }
    state.appliedStaff2 = true;
  }

  return state;
};

const _calculatePriceOriginal = calculatePrice;
calculatePrice = function(){
  const total = _calculatePriceOriginal();
  return total;
};

const _resetBookingFormOriginal = resetBookingForm;
resetBookingForm = function(){
  if (!hasBookingSelectOptionsReady()){
    try{ renderServiceSelectors(); }catch(_){ }
  }
  _resetBookingFormOriginal();
  const moveTypeEl = document.getElementById('moveType');
  if (moveTypeEl) moveTypeEl.selectedIndex = 0;
  const noteEl = document.getElementById('moveTypeNote');
  if (noteEl) noteEl.textContent = config.form_move_type_help_text || defaultConfig.form_move_type_help_text || '最初に移動方法をお選びください';
};

document.addEventListener('DOMContentLoaded', function(){
  const moveTypeEl = document.getElementById('moveType');
  if (moveTypeEl && !moveTypeEl.dataset.boundMoveType){
    moveTypeEl.dataset.boundMoveType = '1';
    moveTypeEl.addEventListener('change', function(){
      applyAutoSelections();
      calculatePrice();
      updateSubmitButton();
    });
  }
});
/* ===== move_type live patch end ===== */



/* ===== booking button stabilization patch ===== */
function _bookingFieldVisible(el){
  if (!el) return false;
  if (el.type === 'hidden') return false;
  const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  if (el.closest && el.closest('.hidden')) return false;
  let cur = el;
  while (cur && cur !== document.body){
    if (cur.classList && cur.classList.contains('hidden')) return false;
    const s = window.getComputedStyle ? window.getComputedStyle(cur) : null;
    if (s && (s.display === 'none' || s.visibility === 'hidden')) return false;
    cur = cur.parentElement;
  }
  return true;
}

function _bookingHasValue(el){
  if (!el) return false;
  if (el.type === 'checkbox') return !!el.checked;
  const v = String(el.value || '').trim();
  return !!v;
}

function _bookingUpdateSubmitButtonPatched(){
  const submitBtn = document.getElementById('submitBooking');
  if (!submitBtn) return;

  const privacyEl = document.getElementById('privacyAgreement');
  const usageTypeEl = document.getElementById('usageType');
  const customerNameEl = document.getElementById('customerName');
  const phoneEl = document.getElementById('phoneNumber');
  const pickupEl = document.getElementById('pickupLocation');
  const moveTypeEl = document.getElementById('moveType');
  const assistanceEl = document.getElementById('assistanceType');
  const stairEl = document.getElementById('stairAssistance');
  const equipmentEl = document.getElementById('equipmentRental');
  const roundTripEl = document.getElementById('roundTrip');

  // move_type の変更で equipment が自動同期される前提なので、先に同期を試みる
  try{ applyAutoSelections(); }catch(_){}

  const requiredChecks = [
    !!(privacyEl && privacyEl.checked),
    !!(usageTypeEl && _bookingHasValue(usageTypeEl)),
    !!(customerNameEl && _bookingHasValue(customerNameEl)),
    !!(phoneEl && _bookingHasValue(phoneEl)),
    !!(pickupEl && _bookingHasValue(pickupEl))
  ];

  // 表示されているグループだけ必須判定
  if (moveTypeEl && _bookingFieldVisible(moveTypeEl)){
    requiredChecks.push(_bookingHasValue(moveTypeEl));
  }

  if (assistanceEl && _bookingFieldVisible(assistanceEl)){
    requiredChecks.push(_bookingHasValue(assistanceEl));
  }

  // stair / roundTrip は非表示なら必須にしない
  if (stairEl && _bookingFieldVisible(stairEl)){
    requiredChecks.push(_bookingHasValue(stairEl));
  }

  if (roundTripEl && _bookingFieldVisible(roundTripEl)){
    requiredChecks.push(_bookingHasValue(roundTripEl));
  }

  // equipment は visible かつ moveType から同期されていない場合のみ厳密必須
  if (equipmentEl && _bookingFieldVisible(equipmentEl)){
    const equipmentHasValue = _bookingHasValue(equipmentEl);
    const moveTypeHasValue = !!(moveTypeEl && _bookingHasValue(moveTypeEl));
    requiredChecks.push(equipmentHasValue || moveTypeHasValue);
  }

  const isValid = requiredChecks.every(Boolean);

  if (isValid){
    submitBtn.disabled = false;
    submitBtn.className = 'w-full cute-btn py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 cursor-pointer text-lg';
  } else {
    submitBtn.disabled = true;
    submitBtn.className = 'w-full cute-btn py-4 bg-gray-300 text-white cursor-not-allowed text-lg';
  }
}

const _updateSubmitButtonOriginalForPatch = typeof updateSubmitButton === 'function' ? updateSubmitButton : null;
updateSubmitButton = function(){
  return _bookingUpdateSubmitButtonPatched();
};

function _bookingRecheckSubmitButtonSoon(){
  if (_bookingRecheckSubmitButtonSoon._timer){
    clearTimeout(_bookingRecheckSubmitButtonSoon._timer);
    _bookingRecheckSubmitButtonSoon._timer = null;
  }
  try{ updateSubmitButton(); }catch(_){}
  _bookingRecheckSubmitButtonSoon._timer = setTimeout(function(){
    try{ updateSubmitButton(); }catch(_){ }
    _bookingRecheckSubmitButtonSoon._timer = null;
  }, 120);
}

const _openBookingFormOriginalForPatch = typeof openBookingForm === 'function' ? openBookingForm : null;
openBookingForm = async function(date, hour, minute){
  const result = await _openBookingFormOriginalForPatch(date, hour, minute);
  _bookingRecheckSubmitButtonSoon();
  return result;
};

const _resetBookingFormOriginalForPatch2 = typeof resetBookingForm === 'function' ? resetBookingForm : null;
resetBookingForm = function(){
  const result = _resetBookingFormOriginalForPatch2();
  _bookingRecheckSubmitButtonSoon();
  return result;
};

document.addEventListener('DOMContentLoaded', function(){
  [
    'privacyAgreement','usageType','customerName','phoneNumber','pickupLocation',
    'moveType','assistanceType','stairAssistance','equipmentRental','roundTrip'
  ].forEach(function(id){
    const el = document.getElementById(id);
    if (!el) return;
    ['change','input','blur'].forEach(function(evt){
      el.addEventListener(evt, function(){
        _bookingRecheckSubmitButtonSoon();
      });
    });
  });
  _bookingRecheckSubmitButtonSoon();
});
/* ===== booking button stabilization patch end ===== */


/* ===== reservation consistency patch start ===== */
function getSelectedOptionKeySafe(selectId){
  try{
    return String(getSelectedOptionKey(selectId) || '').trim();
  }catch(_){
    return '';
  }
}

function getMenuItemByKeySafe(key){
  const map = typeof getMenuMap === 'function' ? getMenuMap() : {};
  return map && map[key] ? map[key] : null;
}

function getMenuItemLabelByKeySafe(key, fallback){
  const item = getMenuItemByKeySafe(key);
  if (item && item.label) return String(item.label);
  return getMenuLabel(key, fallback || key || '');
}

function getMenuItemPriceByKeySafe(key, fallback){
  return Number(getMenuPrice(key, fallback || 0) || 0);
}

function buildResolvedSelectionState(){
  const selected = {
    move_type: getSelectedOptionKeySafe('moveType'),
    assistance: getSelectedOptionKeySafe('assistanceType'),
    stair: getSelectedOptionKeySafe('stairAssistance'),
    equipment: getSelectedOptionKeySafe('equipmentRental'),
    round_trip: getSelectedOptionKeySafe('roundTrip')
  };

  const autoAppliedMap = {};
  const appliedPairs = [];
  const visitedPairKeys = new Set();

  function applyPair(sourceKey, pair){
    if (!pair || !pair.apply_group || !pair.apply_key) return;
    const targetGroup = String(pair.apply_group || '').trim();
    const targetKey = String(pair.apply_key || '').trim();
    if (!targetGroup || !targetKey) return;

    const pairKey = `${String(sourceKey || '')}=>${targetGroup}:${targetKey}`;
    if (visitedPairKeys.has(pairKey)) return;
    visitedPairKeys.add(pairKey);

    selected[targetGroup] = targetKey;
    autoAppliedMap[targetGroup] = {
      source_key: String(sourceKey || '').trim(),
      apply_key: targetKey
    };
    appliedPairs.push({
      source_key: String(sourceKey || '').trim(),
      apply_group: targetGroup,
      apply_key: targetKey
    });

    const chainedPairs = typeof getMenuAutoApplyPairs === 'function' ? getMenuAutoApplyPairs(targetKey) : [];
    chainedPairs.forEach(function(nextPair){
      applyPair(targetKey, nextPair);
    });
  }

  ['move_type','assistance','stair','equipment','round_trip'].forEach(function(group){
    const sourceKey = String(selected[group] || '').trim();
    if (!sourceKey) return;
    const pairs = typeof getMenuAutoApplyPairs === 'function' ? getMenuAutoApplyPairs(sourceKey) : [];
    pairs.forEach(function(pair){
      applyPair(sourceKey, pair);
    });
  });

  return {
    selected: selected,
    autoAppliedMap: autoAppliedMap,
    appliedPairs: appliedPairs
  };
}

function syncResolvedSelectionsToVisibleInputs(state){
  const resolved = state && state.selected ? state.selected : {};
  try{
    if (resolved.assistance) setSelectValueByKey('assistanceType', resolved.assistance);
  }catch(_){}

  try{
    if (resolved.equipment) setSelectValueByKey('equipmentRental', resolved.equipment);
  }catch(_){}

  try{
    if (resolved.round_trip) setSelectValueByKey('roundTrip', resolved.round_trip);
  }catch(_){}

  try{
    if (resolved.stair) setSelectValueByKey('stairAssistance', resolved.stair);
  }catch(_){}
}

function updateResolvedSelectionWarnings(state){
  const resolved = state && state.selected ? state.selected : {};
  const autoAppliedMap = state && state.autoAppliedMap ? state.autoAppliedMap : {};

  const stairWarning = document.getElementById('stairWarning');
  const stretcherWarning = document.getElementById('stretcherWarning');
  const wheelchairWarning = document.getElementById('wheelchairWarning');

  if (stairWarning) stairWarning.classList.add('hidden');
  if (stretcherWarning) stretcherWarning.classList.add('hidden');
  if (wheelchairWarning) wheelchairWarning.classList.add('hidden');

  const stairKey = String(resolved.stair || '').trim();
  const equipmentKey = String(resolved.equipment || '').trim();
  const moveTypeKey = String(resolved.move_type || '').trim();
  const bodyAssistApplied = String(resolved.assistance || '').trim() === 'BODY_ASSIST' && !!autoAppliedMap.assistance;
  const staff2Applied = (
    String(resolved.equipment || '').trim() === 'EQUIP_STRETCHER_STAFF2' ||
    (state && state.appliedPairs || []).some(function(pair){
      return String(pair.apply_key || '').trim() === 'EQUIP_STRETCHER_STAFF2';
    })
  );

  if (stairWarning && bodyAssistApplied && stairKey && !['STAIR_NONE','STAIR_WATCH'].includes(stairKey)){
    stairWarning.textContent = (config.warning_stair_bodyassist_text || defaultConfig.warning_stair_bodyassist_text || '警告: 階段介助ご利用の場合、身体介助がセットになります');
    if (staff2Applied){
      stairWarning.textContent += ' / ' + (config.warning_staff_add_text || defaultConfig.warning_staff_add_text || '表示価格は1名体制での目安です。状況により安全確保のため2名体制となる場合があります（＋5,000円）');
    }
    stairWarning.classList.remove('hidden');
  }

  if (stretcherWarning && (equipmentKey === 'EQUIP_STRETCHER' || moveTypeKey === 'MOVE_STRETCHER')){
    stretcherWarning.textContent = config.warning_stretcher_bodyassist_text || defaultConfig.warning_stretcher_bodyassist_text || 'ストレッチャー利用時は身体介助が必要です';
    if (staff2Applied){
      stretcherWarning.textContent += ' / ' + (config.warning_staff_add_text || defaultConfig.warning_staff_add_text || '表示価格は1名体制での目安です。状況により安全確保のため2名体制となる場合があります（＋5,000円）');
    }
    stretcherWarning.classList.remove('hidden');
  }

  if (wheelchairWarning && equipmentKey === 'EQUIP_OWN_WHEELCHAIR'){
    wheelchairWarning.textContent = config.warning_wheelchair_damage_text || defaultConfig.warning_wheelchair_damage_text || '警告: 車いす固定による傷、すり傷などは保証対象外になります';
    wheelchairWarning.classList.remove('hidden');
  }

  const moveTypeNoteEl = document.getElementById('moveTypeNote');
  if (moveTypeNoteEl){
    moveTypeNoteEl.textContent = getMoveTypeNoteTextPatched(moveTypeKey);
  }

  return {
    appliedBodyAssist: bodyAssistApplied,
    appliedStaff2: staff2Applied
  };
}

applyAutoSelections = function(){
  const state = buildResolvedSelectionState();
  syncResolvedSelectionsToVisibleInputs(state);
  const flags = updateResolvedSelectionWarnings(state);
  state.appliedBodyAssist = !!flags.appliedBodyAssist;
  state.appliedStaff2 = !!flags.appliedStaff2;
  window.__resolvedSelectionState = state;
  return state;
};

calculatePrice = function(){
  const state = applyAutoSelections();
  const resolved = state && state.selected ? state.selected : {};
  const breakdown = [];
  let total = 0;

  [
    { key: 'BASE_FARE', fallbackLabel: '運賃', suffix: ' から' },
    { key: 'DISPATCH', fallbackLabel: '配車予約', suffix: '' },
    { key: 'SPECIAL_VEHICLE', fallbackLabel: '特殊車両使用料', suffix: '' }
  ].forEach(function(item){
    const price = getMenuItemPriceByKeySafe(item.key, 0);
    total += price;
    breakdown.push({
      name: getMenuItemLabelByKeySafe(item.key, item.fallbackLabel),
      price: price,
      suffix: item.suffix || ''
    });
  });

  const alreadyAddedKeys = new Set(['BASE_FARE','DISPATCH','SPECIAL_VEHICLE']);

  function addSelectedKey(group, key, fallbackLabel, extraSuffix){
    const resolvedKey = String(key || '').trim();
    if (!resolvedKey) return;
    if (alreadyAddedKeys.has(resolvedKey)) return;
    alreadyAddedKeys.add(resolvedKey);

    const price = getMenuItemPriceByKeySafe(resolvedKey, 0);
    total += price;

    let name = getMenuItemLabelByKeySafe(resolvedKey, fallbackLabel || resolvedKey);
    if (group === 'stair' && price > 0){
      name = `階段介助(${name})`;
    }
    breakdown.push({
      name: name,
      price: price,
      suffix: extraSuffix || ''
    });
  }

  addSelectedKey('move_type', resolved.move_type, '移動方法');
  addSelectedKey('assistance', resolved.assistance, '介助内容');
  addSelectedKey('stair', resolved.stair, '階段介助');
  addSelectedKey('equipment', resolved.equipment, '機材レンタル');

  const roundTripKey = String(resolved.round_trip || '').trim();
  const roundTripSuffix = (roundTripKey === 'ROUND_STANDBY' || roundTripKey === 'ROUND_HOSPITAL') ? ' から/30分毎' : '';
  addSelectedKey('round_trip', roundTripKey, '往復送迎', roundTripSuffix);

  (state && state.appliedPairs || []).forEach(function(pair){
    if (!pair || String(pair.apply_group || '').trim() !== 'auto_set') return;
    addSelectedKey('auto_set', pair.apply_key, '自動セット');
  });

  const breakdownEl = document.getElementById('priceBreakdown');
  if (breakdownEl){
    breakdownEl.innerHTML = breakdown.map(function(item){
      return `
        <div class="price-item">
          <span class="price-label">${escapeHtml(item.name)}</span>
          <span class="price-value">${Number(item.price || 0).toLocaleString()}円${escapeHtml(item.suffix || '')}</span>
        </div>
      `;
    }).join('');
  }

  const totalEl = document.getElementById('totalPrice');
  if (totalEl){
    totalEl.textContent = `${Number(total || 0).toLocaleString()}円`;
  }

  window.__lastCalculatedTotalPrice = Number(total || 0);
  return Number(total || 0);
};

submitBooking = async function(e){
  e.preventDefault();

  const submitBtn = document.getElementById('submitBooking');
  if (!submitBtn) return;
  if (submitBtn.dataset.sending === '1') return;

  submitBtn.dataset.sending = '1';
  submitBtn.disabled = true;
  submitBtn.textContent = '予約中...';

  try{
    await ensureFullPublicBootstrapLoaded(true);
    const ready = await ensureBookingFormOptionsReady();
    if (!ready){
      throw new Error('フォーム読込中です。少し待ってからもう一度お試しください');
    }

    const usageTypeEl = document.getElementById('usageType');
    const customerNameEl = document.getElementById('customerName');
    const phoneNumberEl = document.getElementById('phoneNumber');
    const pickupLocationEl = document.getElementById('pickupLocation');
    const destinationEl = document.getElementById('destination');
    const notesEl = document.getElementById('notes');
    const moveTypeEl = document.getElementById('moveType');
    const assistanceEl = document.getElementById('assistanceType');
    const stairEl = document.getElementById('stairAssistance');
    const equipmentEl = document.getElementById('equipmentRental');
    const roundTripEl = document.getElementById('roundTrip');

    if (!selectedSlot || !selectedSlot.date){
      throw new Error('予約枠の情報がありません。もう一度お試しください');
    }

    const reservationId = formatDateForId(selectedSlot.date, selectedSlot.hour, selectedSlot.minute);
    const total = calculatePrice();
    const state = applyAutoSelections();
    const resolved = state && state.selected ? state.selected : {};
    const appliedPairs = state && state.appliedPairs ? state.appliedPairs : [];

    const slotDateStr = ymdLocal(selectedSlot.date);
    const stretcherTwoStaff = (
      String(resolved.equipment || '') === 'EQUIP_STRETCHER_STAFF2' ||
      appliedPairs.some(function(pair){ return String(pair.apply_key || '') === 'EQUIP_STRETCHER_STAFF2'; })
    ) ? 'あり' : 'なし';

    const usageType = usageTypeEl ? String(usageTypeEl.value || '').trim() : '';
    const customerName = customerNameEl ? String(customerNameEl.value || '').trim() : '';
    const phoneNumber = phoneNumberEl ? String(phoneNumberEl.value || '').trim() : '';
    const pickupLocation = pickupLocationEl ? String(pickupLocationEl.value || '').trim() : '';
    const destination = destinationEl ? String(destinationEl.value || '').trim() : '';
    const notes = notesEl ? String(notesEl.value || '').trim() : '';

    const moveTypeLabel = getMenuItemLabelByKeySafe(resolved.move_type, moveTypeEl ? moveTypeEl.value : '');
    const assistanceLabel = getMenuItemLabelByKeySafe(resolved.assistance, assistanceEl ? assistanceEl.value : '');
    const stairLabel = getMenuItemLabelByKeySafe(resolved.stair, stairEl ? stairEl.value : '');
    const equipmentLabel = getMenuItemLabelByKeySafe(resolved.equipment, equipmentEl ? equipmentEl.value : '');
    const roundTripLabel = getMenuItemLabelByKeySafe(resolved.round_trip, roundTripEl ? roundTripEl.value : '');

    const reservation = {
      reservation_id: reservationId,
      id: reservationId,
      reservation_datetime: `${slotDateStr} ${String(selectedSlot.hour).padStart(2,'0')}:${String(selectedSlot.minute).padStart(2,'0')}`,
      usage_type: usageType,
      customer_name: customerName,
      name: customerName,
      phone_number: phoneNumber,
      phone: phoneNumber,
      pickup_location: pickupLocation,
      pickup: pickupLocation,
      destination: destination || '',
      move_type: moveTypeLabel,
      assistance_type: assistanceLabel,
      stair_assistance: stairLabel,
      equipment_rental: equipmentLabel,
      stretcher_two_staff: stretcherTwoStaff,
      round_trip: roundTripLabel,
      notes: notes || '',
      total_price: Number(total || 0),
      status: '未対応',
      slot_date: slotDateStr,
      slot_hour: selectedSlot.hour,
      slot_minute: selectedSlot.minute,
      is_visible: true
    };

    await withLoading(async function(){
      await gsRun('api_createReservation', reservation);
    }, '予約中...');

    try{
      if (typeof invalidatePublicInitLitePrefetch === 'function'){
        invalidatePublicInitLitePrefetch();
      }
    }catch(_){ }

    document.getElementById('reservationId').textContent = reservationId;
    document.getElementById('bookingModal').classList.add('hidden');
    document.getElementById('completeModal').classList.remove('hidden');

    try{
      await waitUntilSelectedSlotBlocked_(4);
    }catch(_){}

    submitBtn.disabled = false;
    submitBtn.dataset.sending = '0';
    submitBtn.textContent = config.form_submit_button_text || '予約する';
  }catch(err){
    submitBtn.disabled = false;
    submitBtn.dataset.sending = '0';
    submitBtn.textContent = config.form_submit_button_text || '予約する';
    toast(err && err.message ? err.message : '通信エラー（予約保存）');

    const oldError = document.querySelector('#bookingForm .booking-error');
    if (oldError) oldError.remove();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'booking-error bg-red-100 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl mb-4 font-medium';
    errorDiv.textContent = 'NG 予約に失敗しました。もう一度お試しください。';
    document.getElementById('bookingForm').prepend(errorDiv);
  }
};
/* ===== reservation consistency patch end ===== */


/* ===== authoritative final booking fix ===== */
(function(){
  function __finalHelpText__(){
    return config.form_move_type_help_text || defaultConfig.form_move_type_help_text || '最初に移動方法をお選びください';
  }

  function __finalGetSelect__(id){
    return document.getElementById(id);
  }

  function __finalSelectedOption__(id){
    var el = __finalGetSelect__(id);
    if (!el) return null;
    return el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
  }

  function __finalSelectedKey__(id){
    try{
      return String(getSelectedOptionKey(id) || '').trim();
    }catch(_){
      return '';
    }
  }

  function __finalSelectedLabel__(id){
    var el = __finalGetSelect__(id);
    if (!el) return '';
    return String(el.value || '').trim();
  }

  function __finalMenuItemByKey__(key){
    try{
      var map = typeof getMenuMap === 'function' ? getMenuMap() : {};
      return map && map[key] ? map[key] : null;
    }catch(_){
      return null;
    }
  }

  function __finalMoveMeta__(){
    var key = __finalSelectedKey__('moveType');
    var label = __finalSelectedLabel__('moveType');
    var item = __finalMenuItemByKey__(key);
    var note = '';
    if (item && item.note) note = String(item.note || '').trim();
    if (!note){
      var opt = __finalSelectedOption__('moveType');
      if (opt && opt.dataset && opt.dataset.note) note = String(opt.dataset.note || '').trim();
    }
    return {
      key: key,
      label: label,
      note: note
    };
  }

  function getMoveTypeNoteTextPatched(key){
    var item = __finalMenuItemByKey__(String(key || '').trim());
    if (item && String(item.note || '').trim()) return String(item.note || '').trim();
    return __finalHelpText__();
  }

  function __finalMoveRule__(meta){
    var key = String(meta && meta.key || '').toUpperCase();
    var label = String(meta && meta.label || '');

    if (key === 'MOVE_STRETCHER' || label.indexOf('ストレッチャー') !== -1) return 'stretcher';
    if (key === 'MOVE_RECLINING' || label.indexOf('リクライニング') !== -1) return 'wheelchair';
    if (key === 'MOVE_WHEELCHAIR' || label.indexOf('無料車いす') !== -1) return 'wheelchair';
    if (key === 'MOVE_OWN' || label.indexOf('ご自身の車いす') !== -1) return 'wheelchair';
    if (key === 'MOVE_OTHER' || label.indexOf('その他') !== -1) return 'other';

    return '';
  }

  function __isBoardingAssistItem__(item){
    var key = String(item && item.key || '').trim().toUpperCase();
    var label = String(item && item.label || '').trim();
    return key === 'BOARDING_ASSIST' || label.indexOf('乗降介助') !== -1;
  }

  function __isBodyAssistItem__(item){
    var key = String(item && item.key || '').trim().toUpperCase();
    var label = String(item && item.label || '').trim();
    return key === 'BODY_ASSIST' || label.indexOf('身体介助') !== -1;
  }

  function __isNoneAssistItem__(item){
    var key = String(item && item.key || '').trim().toUpperCase();
    var label = String(item && item.label || '').trim();
    return key === 'ASSIST_NONE' || label.indexOf('介助不要') !== -1 || label === '不要' || label.indexOf('不要(') !== -1;
  }

  function __finalAllowedAssistanceItems__(items, rule){
    var list = Array.isArray(items) ? items.slice() : [];

    if (rule === 'wheelchair'){
      return list.filter(function(item){
        return __isBoardingAssistItem__(item) || __isBodyAssistItem__(item);
      });
    }

    if (rule === 'stretcher'){
      return list.filter(function(item){
        return __isBodyAssistItem__(item);
      });
    }

    if (rule === 'other'){
      return list.filter(function(item){
        return __isBoardingAssistItem__(item) || __isBodyAssistItem__(item) || __isNoneAssistItem__(item);
      });
    }

    return list;
  }

  function __finalBuildAssistanceOptions__(){
    var assistanceEl = __finalGetSelect__('assistanceType');
    if (!assistanceEl) return;

    var currentKey = __finalSelectedKey__('assistanceType');
    var meta = __finalMoveMeta__();
    var rule = __finalMoveRule__(meta);
    var items = typeof getItemsByGroup === 'function' ? getItemsByGroup('assistance') : [];
    var filtered = __finalAllowedAssistanceItems__(items, rule);

    buildSelectOptions(
      assistanceEl,
      filtered,
      true,
      config.form_usage_type_placeholder || '選択してください',
      function(item){
        return ''.concat(item.label, '(').concat(Number(item.price || 0).toLocaleString(), '円)');
      }
    );

    if (currentKey && !setSelectValueByKey('assistanceType', currentKey)){
      if (filtered.length === 1){
        setSelectValueByKey('assistanceType', String(filtered[0].key || ''));
      } else {
        assistanceEl.selectedIndex = 0;
      }
    } else if (!currentKey && filtered.length === 1){
      setSelectValueByKey('assistanceType', String(filtered[0].key || ''));
    }
  }

  function __finalFindNoneOptionKey__(selectId){
    var el = __finalGetSelect__(selectId);
    if (!el || !el.options) return '';
    for (var i = 0; i < el.options.length; i++){
      var opt = el.options[i];
      var key = String(opt && opt.dataset && opt.dataset.key || '').trim();
      var label = String(opt && opt.value || '').trim();
      if (key.toUpperCase().indexOf('NONE') !== -1) return key;
      if (label.indexOf('不要') !== -1) return key;
    }
    return '';
  }

  function __finalSyncEquipment__(){
    var meta = __finalMoveMeta__();
    var rule = __finalMoveRule__(meta);
    var equipmentEl = __finalGetSelect__('equipmentRental');
    if (!equipmentEl) return;

    if (rule === 'stretcher'){
      try{
        var moveTypeAuto = findAutoApplyFromMenu('move_type', meta.key);
        if (moveTypeAuto && moveTypeAuto.apply_group === 'equipment' && moveTypeAuto.apply_key){
          setSelectValueByKey('equipmentRental', String(moveTypeAuto.apply_key || ''));
        }
      }catch(_){}
      return;
    }

    var equipmentKey = __finalSelectedKey__('equipmentRental');
    var equipmentLabel = __finalSelectedLabel__('equipmentRental');
    var isStretcherEquipment = (
      equipmentKey === 'EQUIP_STRETCHER' ||
      equipmentKey === 'EQUIP_STRETCHER_STAFF2' ||
      equipmentLabel.indexOf('ストレッチャー') !== -1
    );

    if (isStretcherEquipment){
      var noneKey = __finalFindNoneOptionKey__('equipmentRental');
      if (noneKey){
        setSelectValueByKey('equipmentRental', noneKey);
      } else {
        equipmentEl.selectedIndex = 0;
      }
    }
  }

  function __finalHideWarnings__(){
    ['stairWarning','stretcherWarning','wheelchairWarning'].forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  function __finalSyncMoveTypeNote__(){
    var noteEl = document.getElementById('moveTypeNote');
    if (!noteEl) return;
    var meta = __finalMoveMeta__();
    noteEl.textContent = meta.note || __finalHelpText__();
  }

  function __finalHideNoneZeroRows__(){
    try{
      var breakdownEl = document.getElementById('priceBreakdown');
      if (!breakdownEl) return;
      Array.prototype.slice.call(breakdownEl.querySelectorAll('.price-item')).forEach(function(row){
        var labelEl = row.querySelector('.price-label');
        var valueEl = row.querySelector('.price-value');
        var label = String(labelEl ? labelEl.textContent || '' : '').trim();
        var value = String(valueEl ? valueEl.textContent || '' : '').trim();
        var isNoneLabel = (
          label.indexOf('不要') !== -1 ||
          label.indexOf('介助不要') !== -1
        );
        var isZero = value.indexOf('0円') !== -1;
        if (isNoneLabel && isZero){
          row.remove();
        }
      });
    }catch(_){}
  }

  function __finalNormalizeBookingState__(){
    __finalSyncMoveTypeNote__();
    __finalBuildAssistanceOptions__();
    __finalSyncEquipment__();
    __finalHideWarnings__();
  }

  var __finalRenderServiceSelectorsBase__ = renderServiceSelectors;
  renderServiceSelectors = function(){
    var result = __finalRenderServiceSelectorsBase__.apply(this, arguments);
    __finalNormalizeBookingState__();
    return result;
  };

  var __finalApplyAutoSelectionsBase__ = applyAutoSelections;
  applyAutoSelections = function(){
    __finalNormalizeBookingState__();
    var state = __finalApplyAutoSelectionsBase__.apply(this, arguments);
    __finalHideWarnings__();
    __finalSyncMoveTypeNote__();
    return state;
  };

  var __finalCalculatePriceBase__ = calculatePrice;
  calculatePrice = function(){
    __finalNormalizeBookingState__();
    var total = __finalCalculatePriceBase__.apply(this, arguments);
    __finalHideWarnings__();
    __finalSyncMoveTypeNote__();
    __finalHideNoneZeroRows__();
    return total;
  };

  function __finalAfterMoveTypeChanged__(){
    __finalNormalizeBookingState__();
    try{ applyAutoSelections(); }catch(_){}
    try{ calculatePrice(); }catch(_){}
    try{ updateSubmitButton(); }catch(_){}
  }

  document.addEventListener('DOMContentLoaded', function(){
    __finalNormalizeBookingState__();
    try{ calculatePrice(); }catch(_){}

    var moveTypeEl = __finalGetSelect__('moveType');
    if (moveTypeEl && !moveTypeEl.dataset.finalAuthoritativeBound){
      moveTypeEl.dataset.finalAuthoritativeBound = '1';
      moveTypeEl.addEventListener('change', function(){
        __finalAfterMoveTypeChanged__();
      });
    }
  });
})();
/* ===== authoritative final booking fix end ===== */
