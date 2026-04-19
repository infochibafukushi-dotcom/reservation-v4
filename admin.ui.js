// NOTE: このファイルは現在 admin.html から読み込んでいません。
// 管理ロジック本体は admin.app.js / admin.menu.js / admin.calendar.js / admin.api.js に集約されています。

function ensureAdminAuth(){
  const auth = sessionStorage.getItem('chiba_care_taxi_admin_auth');
  if (auth === 'ok'){
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('adminView').classList.remove('hidden');
    return true;
  }
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('adminView').classList.add('hidden');
  return false;
}

function applyAdminConfigToUI(){
  document.getElementById('cfgLogoText').value = adminConfig.logo_text || '';
  document.getElementById('cfgLogoSubtext').value = adminConfig.logo_subtext || '';
  document.getElementById('cfgLogoImageUrl').value = adminConfig.logo_image_url || '';
  document.getElementById('cfgLogoUseGithubImage').value = String(adminConfig.logo_use_github_image || '1');
  document.getElementById('cfgGithubUsername').value = adminConfig.github_username || '';
  document.getElementById('cfgGithubRepo').value = adminConfig.github_repo || '';
  document.getElementById('cfgGithubBranch').value = adminConfig.github_branch || 'main';
  document.getElementById('cfgGithubAssetsBasePath').value = adminConfig.github_assets_base_path || '';
  document.getElementById('cfgLogoGithubPath').value = adminConfig.logo_github_path || 'logo/logo.webp';
  document.getElementById('cfgGithubToken').value = adminConfig.github_token && adminConfig.github_token !== '***' ? adminConfig.github_token : '';
  document.getElementById('cfgPhoneNotifyText').value = adminConfig.phone_notify_text || '';
  document.getElementById('cfgSameDayEnabled').value = String(adminConfig.same_day_enabled || '0');
  document.getElementById('cfgSameDayMinHours').value = String(adminConfig.same_day_min_hours || '3');

  updateAdminLogoPreview();
  applyPanelCollapsedState();
}

function updateAdminLogoPreview(){
  const img = document.getElementById('adminLogoPreview');
  const text = document.getElementById('adminLogoPreviewText');
  const sub = document.getElementById('adminLogoPreviewSubtext');

  text.textContent = adminConfig.logo_text || '介護タクシー予約';
  sub.textContent = adminConfig.logo_subtext || '丁寧・安全な送迎をご提供します';

  let finalSrc = adminConfig.logo_image_url || 'https://raw.githubusercontent.com/infochibafukushi-dotcom/chiba-care-taxi-assets/main/logo/logo.webp';
  img.src = finalSrc;
  img.onerror = function(){
    img.onerror = null;
    img.src = 'https://raw.githubusercontent.com/infochibafukushi-dotcom/chiba-care-taxi-assets/main/logo/logo.webp';
  };
}

function applyPanelCollapsedState(){
  const collapsedDefault = String(adminConfig.admin_panels_collapsed_default || '1') === '1';

  document.querySelectorAll('[data-panel-key]').forEach(card=>{
    const key = card.getAttribute('data-panel-key');
    const body = document.getElementById(`${key}Body`);
    const toggle = card.querySelector(`[data-panel-toggle="${key}"]`);
    if (!body || !toggle) return;

    const stored = sessionStorage.getItem(`admin_panel_${key}`);
    const shouldCollapse = stored === null ? collapsedDefault : stored === '1';

    if (shouldCollapse){
      body.classList.add('collapsed');
      toggle.textContent = '+';
    } else {
      body.classList.remove('collapsed');
      toggle.textContent = '−';
    }
  });
}

function bindPanelToggle(){
  document.querySelectorAll('[data-panel-key]').forEach(card=>{
    const key = card.getAttribute('data-panel-key');
    const header = card.querySelector('.admin-panel-header');
    const body = document.getElementById(`${key}Body`);
    const toggle = card.querySelector(`[data-panel-toggle="${key}"]`);
    if (!header || !body || !toggle) return;

    header.addEventListener('click', ()=>{
      const willCollapse = !body.classList.contains('collapsed');
      if (willCollapse){
        body.classList.add('collapsed');
        toggle.textContent = '+';
        sessionStorage.setItem(`admin_panel_${key}`, '1');
      } else {
        body.classList.remove('collapsed');
        toggle.textContent = '−';
        sessionStorage.setItem(`admin_panel_${key}`, '0');
      }
    });
  });
}

function renderStats(){
  const total = adminReservations.filter(r => !(r.is_visible === false || r.is_visible === 'FALSE')).length;
  const pending = adminReservations.filter(r => !(r.is_visible === false || r.is_visible === 'FALSE') && String(r.status || '') === '未対応').length;
  const confirmed = adminReservations.filter(r => !(r.is_visible === false || r.is_visible === 'FALSE') && String(r.status || '') === '確認済').length;
  const completed = adminReservations.filter(r => !(r.is_visible === false || r.is_visible === 'FALSE') && String(r.status || '') === '完了').length;

  document.getElementById('totalReservations').textContent = String(total);
  document.getElementById('pendingCount').textContent = String(pending);
  document.getElementById('confirmedCount').textContent = String(confirmed);
  document.getElementById('completedCount').textContent = String(completed);
}

function buildMenuGroupOptions(selected){
  return (adminMenuGroupCatalog || adminDefaultMenuGroupCatalog).map(group => {
    const sel = String(group.key) === String(selected || '') ? 'selected' : '';
    return `<option value="${escapeHtml(group.key)}" ${sel}>${escapeHtml(group.label)}</option>`;
  }).join('');
}

function buildMenuKeyOptions(selected){
  return (adminMenuKeyCatalog || []).map(item => {
    const sel = String(item.key_jp || '') === String(selected || '') ? 'selected' : '';
    return `<option value="${escapeHtml(item.key_jp || '')}" ${sel}>${escapeHtml(item.key_jp || '')}</option>`;
  }).join('');
}

function renderMenuAdminList(){
  const wrap = document.getElementById('menuAdminList');
  const items = Array.isArray(adminMenuMaster) ? adminMenuMaster.slice().sort((a,b)=>{
    const ao = Number(a.sort_order || 9999);
    const bo = Number(b.sort_order || 9999);
    if (ao !== bo) return ao - bo;
    return String(a.key).localeCompare(String(b.key));
  }) : [];

  wrap.innerHTML = items.map((item, index) => `
    <div class="menu-admin-row" data-menu-row-index="${index}">
      <div>
        <select class="menu-row-keyjp w-full" data-role="keyjp">
          ${buildMenuKeyOptions(item.key_jp || '')}
        </select>
      </div>
      <div>
        <select class="menu-row-group w-full" data-role="group">
          ${buildMenuGroupOptions(item.menu_group || 'custom')}
        </select>
      </div>
      <div>
        <input type="text" class="menu-row-key w-full" data-role="key" value="${escapeHtml(item.key || '')}">
      </div>
      <div>
        <input type="text" class="menu-row-label w-full" data-role="label" value="${escapeHtml(item.label || '')}">
      </div>
      <div>
        <input type="number" class="menu-row-price w-full" data-role="price" value="${Number(item.price || 0)}">
      </div>
      <div>
        <input type="text" class="menu-row-note w-full" data-role="note" value="${escapeHtml(item.note || '')}">
      </div>
      <div>
        <select class="menu-row-visible w-full" data-role="visible">
          <option value="1" ${item.is_visible ? 'selected' : ''}>表示</option>
          <option value="0" ${!item.is_visible ? 'selected' : ''}>非表示</option>
        </select>
      </div>
      <div>
        <input type="number" class="menu-row-order w-full" data-role="order" value="${Number(item.sort_order || 9999)}">
      </div>
    </div>
  `).join('');
}

function addMenuAdminRow(){
  const nextOrder = (adminMenuMaster && adminMenuMaster.length)
    ? Math.max(...adminMenuMaster.map(item => Number(item.sort_order || 0))) + 10
    : 10;

  adminMenuMaster.push({
    key: '',
    key_jp: '',
    label: '',
    price: 0,
    note: '',
    is_visible: true,
    sort_order: nextOrder,
    menu_group: 'custom',
    required_flag: false
  });
  renderMenuAdminList();
}

function syncMenuRowFromKeyJp(rowEl){
  const keyJpSelect = rowEl.querySelector('[data-role="keyjp"]');
  const groupSelect = rowEl.querySelector('[data-role="group"]');
  const keyInput = rowEl.querySelector('[data-role="key"]');
  const labelInput = rowEl.querySelector('[data-role="label"]');
  const priceInput = rowEl.querySelector('[data-role="price"]');

  const selectedKeyJp = String(keyJpSelect.value || '').trim();
  const catalog = (adminMenuKeyCatalog || []).find(item => String(item.key_jp || '') === selectedKeyJp);
  if (!catalog) return;

  keyInput.value = catalog.key || '';
  if (!labelInput.value.trim()) labelInput.value = catalog.default_label || '';
  if (!priceInput.value.trim()) priceInput.value = Number(catalog.default_price || 0);
  if (!groupSelect.value || groupSelect.value === 'custom') groupSelect.value = catalog.menu_group || 'custom';
}

function collectMenuMasterFromUI(){
  const rows = Array.from(document.querySelectorAll('[data-menu-row-index]'));
  return rows.map((row)=>{
    const keyJp = row.querySelector('[data-role="keyjp"]').value.trim();
    const group = row.querySelector('[data-role="group"]').value.trim();
    const key = row.querySelector('[data-role="key"]').value.trim();
    const label = row.querySelector('[data-role="label"]').value.trim();
    const price = row.querySelector('[data-role="price"]').value;
    const note = row.querySelector('[data-role="note"]').value.trim();
    const visible = row.querySelector('[data-role="visible"]').value === '1';
    const order = row.querySelector('[data-role="order"]').value;
    const catalog = (adminMenuKeyCatalog || []).find(item => String(item.key_jp || '') === keyJp);

    return {
      key: key,
      key_jp: keyJp,
      label: label,
      price: Number(price || 0),
      note: note,
      is_visible: visible,
      sort_order: Number(order || 9999),
      menu_group: group || (catalog ? catalog.menu_group : 'custom'),
      required_flag: catalog ? !!catalog.required_flag : false
    };
  }).filter(item => item.key || item.key_jp || item.label);
}

function buildAutoRuleGroupOptions(selected){
  return (adminMenuGroupCatalog || adminDefaultMenuGroupCatalog)
    .filter(item => item.key !== 'price' && item.key !== 'custom')
    .map(item => `<option value="${escapeHtml(item.key)}" ${String(item.key) === String(selected || '') ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');
}

function buildAutoRuleKeyOptions(selected){
  return (adminMenuKeyCatalog || []).map(item => {
    const sel = String(item.key || '') === String(selected || '') ? 'selected' : '';
    return `<option value="${escapeHtml(item.key || '')}" ${sel}>${escapeHtml(item.key_jp || item.key || '')}</option>`;
  }).join('');
}

function renderAutoRuleList(){
  const wrap = document.getElementById('autoRuleList');
  const rules = Array.isArray(adminAutoRuleCatalog) ? adminAutoRuleCatalog : [];

  wrap.innerHTML = rules.map(rule => `
    <div class="rule-grid" data-rule-index="${Number(rule.index)}">
      <div>
        <select class="rule-enabled w-full" data-role="enabled">
          <option value="1" ${rule.enabled ? 'selected' : ''}>ON</option>
          <option value="0" ${!rule.enabled ? 'selected' : ''}>OFF</option>
        </select>
      </div>
      <div>
        <select class="rule-target w-full" data-role="target">
          ${buildAutoRuleGroupOptions(rule.target || '')}
        </select>
      </div>
      <div>
        <select class="rule-trigger-key w-full" data-role="trigger_key">
          ${buildAutoRuleKeyOptions(rule.trigger_key || '')}
        </select>
      </div>
      <div>
        <select class="rule-apply-group w-full" data-role="apply_group">
          ${buildAutoRuleGroupOptions(rule.apply_group || '')}
        </select>
      </div>
      <div>
        <select class="rule-apply-key w-full" data-role="apply_key">
          ${buildAutoRuleKeyOptions(rule.apply_key || '')}
        </select>
      </div>
    </div>
  `).join('');
}

function collectAutoRuleConfigFromUI(){
  const rows = Array.from(document.querySelectorAll('[data-rule-index]'));
  const out = {};
  rows.forEach(row => {
    const idx = Number(row.getAttribute('data-rule-index'));
    out[`auto_rule_enabled_${idx}`] = row.querySelector('[data-role="enabled"]').value === '1' ? '1' : '0';
    out[`auto_rule_target_${idx}`] = row.querySelector('[data-role="target"]').value || '';
    out[`auto_rule_trigger_key_${idx}`] = row.querySelector('[data-role="trigger_key"]').value || '';
    out[`auto_rule_apply_group_${idx}`] = row.querySelector('[data-role="apply_group"]').value || '';
    out[`auto_rule_apply_key_${idx}`] = row.querySelector('[data-role="apply_key"]').value || '';
  });
  return out;
}

function renderSheetTable(){
  const tbody = document.getElementById('sheetTableBody');

  const rows = (adminReservations || []).slice().sort((a,b)=>{
    const ad = String(a.reservation_datetime || '');
    const bd = String(b.reservation_datetime || '');
    return bd.localeCompare(ad);
  });

  tbody.innerHTML = rows.map(r => {
    const status = String(r.status || '');
    let badgeClass = 'badge-pending';
    if (status === '確認済') badgeClass = 'badge-confirmed';
    if (status === '完了') badgeClass = 'badge-completed';
    if (status === 'キャンセル') badgeClass = 'badge-cancelled';

    return `
      <tr class="sheet-row-clickable border-b border-gray-100" data-reservation-id="${escapeHtml(r.reservation_id || '')}">
        <td class="border border-sky-100 p-3">${escapeHtml(r.reservation_id || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.reservation_datetime || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.usage_type || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.customer_name || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.phone_number || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.pickup_location || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.destination || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.assistance_type || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.stair_assistance || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.equipment_rental || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.stretcher_two_staff || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.round_trip || '')}</td>
        <td class="border border-sky-100 p-3">${escapeHtml(r.notes || '')}</td>
        <td class="border border-sky-100 p-3">${Number(r.total_price || 0).toLocaleString()}円</td>
        <td class="border border-sky-100 p-3"><span class="badge ${badgeClass}">${escapeHtml(status || '未対応')}</span></td>
        <td class="border border-sky-100 p-3">
          <button type="button" class="cute-btn px-3 py-2 bg-gradient-to-r from-sky-500 to-sky-600 text-white text-xs open-detail-btn" data-reservation-id="${escapeHtml(r.reservation_id || '')}">
            詳細
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openReservationDetail(reservationId){
  const reservation = (adminReservations || []).find(r => String(r.reservation_id || '') === String(reservationId || ''));
  if (!reservation) {
    toast('予約が見つかりません');
    return;
  }

  currentDetailReservationId = String(reservationId || '');
  document.getElementById('statusSelect').value = String(reservation.status || '未対応');

  const html = `
    <div class="space-y-4">
      <div class="bg-gray-50 rounded-xl p-4">
        <div class="text-xs text-gray-500 font-bold">予約ID</div>
        <div class="text-lg font-extrabold text-gray-800 mt-1">${escapeHtml(reservation.reservation_id || '')}</div>
      </div>

      <div class="grid grid-cols-1 gap-4">
        <div><div class="text-xs text-gray-500 font-bold">予約日時</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.reservation_datetime || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">ご利用区分</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.usage_type || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">お名前</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.customer_name || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">連絡先</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.phone_number || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">お伺い先</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.pickup_location || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">送迎先</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.destination || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">介助内容</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.assistance_type || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">階段介助</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.stair_assistance || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">機材</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.equipment_rental || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">2名体制</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.stretcher_two_staff || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">往復</div><div class="text-base font-bold text-gray-800 mt-1">${escapeHtml(reservation.round_trip || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">備考</div><div class="text-base font-bold text-gray-800 mt-1 whitespace-pre-wrap">${escapeHtml(reservation.notes || '')}</div></div>
        <div><div class="text-xs text-gray-500 font-bold">料金</div><div class="text-base font-bold text-emerald-600 mt-1">${Number(reservation.total_price || 0).toLocaleString()}円</div></div>
      </div>
    </div>
  `;

  document.getElementById('detailContent').innerHTML = html;
  document.getElementById('detailModal').classList.remove('hidden');
}

async function saveLogoAndGithubConfig(){
  const payload = {
    logo_text: document.getElementById('cfgLogoText').value.trim(),
    logo_subtext: document.getElementById('cfgLogoSubtext').value.trim(),
    logo_image_url: document.getElementById('cfgLogoImageUrl').value.trim(),
    logo_use_github_image: document.getElementById('cfgLogoUseGithubImage').value,
    github_username: document.getElementById('cfgGithubUsername').value.trim(),
    github_repo: document.getElementById('cfgGithubRepo').value.trim(),
    github_branch: document.getElementById('cfgGithubBranch').value.trim() || 'main',
    github_assets_base_path: document.getElementById('cfgGithubAssetsBasePath').value.trim(),
    logo_github_path: document.getElementById('cfgLogoGithubPath').value.trim(),
    github_token: document.getElementById('cfgGithubToken').value.trim() || adminConfig.github_token || '',
    phone_notify_text: document.getElementById('cfgPhoneNotifyText').value.trim()
  };

  await withLoading(async ()=>{
    await gsRun('api_saveConfig', payload);
  }, '保存中...');

  Object.assign(adminConfig, payload);
  updateAdminLogoPreview();
  toast('ロゴ・GitHub設定を保存しました');
}

async function uploadLogoImage(){
  const fileInput = document.getElementById('logoFileInput');
  const status = document.getElementById('logoUploadStatus');
  const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

  if (!file){
    status.className = 'small-status ng';
    status.textContent = '画像ファイルを選択してください';
    return;
  }

  const githubToken = document.getElementById('cfgGithubToken').value.trim() || adminConfig.github_token || '';
  if (!githubToken){
    status.className = 'small-status ng';
    status.textContent = 'GitHub Personal Access Token を入力してください';
    return;
  }

  status.className = 'small-status';
  status.textContent = 'アップロード中...';

  const dataUrl = await readFileAsDataUrl(file);

  const saveConfigPayload = {
    github_username: document.getElementById('cfgGithubUsername').value.trim(),
    github_repo: document.getElementById('cfgGithubRepo').value.trim(),
    github_branch: document.getElementById('cfgGithubBranch').value.trim() || 'main',
    github_assets_base_path: document.getElementById('cfgGithubAssetsBasePath').value.trim(),
    logo_github_path: document.getElementById('cfgLogoGithubPath').value.trim() || `logo/${file.name}`,
    github_token: githubToken,
    logo_use_github_image: document.getElementById('cfgLogoUseGithubImage').value
  };

  await withLoading(async ()=>{
    await gsRun('api_saveConfig', saveConfigPayload);
    const res = await gsRun('api_uploadLogoImage', {
      file_name: file.name,
      mime_type: file.type || 'image/png',
      base64_data: dataUrl
    });

    if (res && res.data && res.data.raw_url){
      adminConfig.logo_image_url = res.data.raw_url;
      adminConfig.logo_use_github_image = '1';
      adminConfig.logo_github_path = res.data.path || saveConfigPayload.logo_github_path;
      document.getElementById('cfgLogoImageUrl').value = adminConfig.logo_image_url;
      document.getElementById('cfgLogoUseGithubImage').value = '1';
      document.getElementById('cfgLogoGithubPath').value = adminConfig.logo_github_path || '';
      updateAdminLogoPreview();
    }
  }, 'ロゴ画像アップロード中...');

  status.className = 'small-status ok';
  status.textContent = 'アップロード成功';
  toast('ロゴ画像をアップロードしました');
}

async function saveSameDayConfig(){
  const payload = {
    same_day_enabled: document.getElementById('cfgSameDayEnabled').value,
    same_day_min_hours: document.getElementById('cfgSameDayMinHours').value
  };

  await withLoading(async ()=>{
    await gsRun('api_saveConfig', payload);
  }, '保存中...');

  Object.assign(adminConfig, payload);
  toast('当日予約設定を保存しました');
}

async function changeAdminPassword(){
  const status = document.getElementById('passwordChangeStatus');
  status.className = 'small-status';
  status.textContent = '';

  const payload = {
    current_password: document.getElementById('cfgCurrentPassword').value.trim(),
    new_password: document.getElementById('cfgNewPassword').value.trim(),
    confirm_password: document.getElementById('cfgConfirmPassword').value.trim()
  };

  await withLoading(async ()=>{
    await gsRun('api_changeAdminPassword', payload);
  }, 'パスワード変更中...');

  document.getElementById('cfgCurrentPassword').value = '';
  document.getElementById('cfgNewPassword').value = '';
  document.getElementById('cfgConfirmPassword').value = '';

  status.className = 'small-status ok';
  status.textContent = 'パスワードを変更しました';
  toast('パスワードを変更しました');
}

async function saveMenuMaster(){
  const items = collectMenuMasterFromUI();

  await withLoading(async ()=>{
    await gsRun('api_saveMenuMaster', items);
  }, 'メニュー保存中...');

  adminMenuMaster = items;
  renderMenuAdminList();
  toast('メニューを保存しました');
}

async function saveAutoRuleConfig(){
  const payload = collectAutoRuleConfigFromUI();

  await withLoading(async ()=>{
    await gsRun('api_saveConfig', payload);
  }, '自動設定ルール保存中...');

  Object.keys(payload).forEach(key => {
    adminConfig[key] = payload[key];
  });

  adminAutoRuleCatalog = [];
  for (let i = 1; i <= 6; i++){
    adminAutoRuleCatalog.push({
      index: i,
      enabled: String(payload[`auto_rule_enabled_${i}`] || '0') === '1',
      target: payload[`auto_rule_target_${i}`] || '',
      trigger_key: payload[`auto_rule_trigger_key_${i}`] || '',
      apply_group: payload[`auto_rule_apply_group_${i}`] || '',
      apply_key: payload[`auto_rule_apply_key_${i}`] || ''
    });
  }

  renderAutoRuleList();
  toast('自動設定ルールを保存しました');
}

async function updateReservationStatus(){
  if (!currentDetailReservationId){
    toast('予約が選択されていません');
    return;
  }

  const status = document.getElementById('statusSelect').value;
  const reservation = (adminReservations || []).find(r => String(r.reservation_id || '') === String(currentDetailReservationId));
  if (!reservation){
    toast('予約が見つかりません');
    return;
  }

  const payload = {
    reservation_id: currentDetailReservationId,
    status: status,
    slot_date: reservation.slot_date,
    slot_hour: reservation.slot_hour,
    slot_minute: reservation.slot_minute,
    round_trip: reservation.round_trip,
    is_visible: reservation.is_visible
  };

  await withLoading(async ()=>{
    await gsRun('api_updateReservation', payload);
  }, '予約更新中...');

  await adminRefreshAllData(false);
  renderStats();
  renderSheetTable();
  renderAdminCalendar();
  document.getElementById('detailModal').classList.add('hidden');
  toast('予約ステータスを更新しました');
}

async function hideReservationRow(){
  if (!currentDetailReservationId){
    toast('予約が選択されていません');
    return;
  }

  const reservation = (adminReservations || []).find(r => String(r.reservation_id || '') === String(currentDetailReservationId));
  if (!reservation){
    toast('予約が見つかりません');
    return;
  }

  const payload = {
    reservation_id: currentDetailReservationId,
    status: reservation.status || '未対応',
    slot_date: reservation.slot_date,
    slot_hour: reservation.slot_hour,
    slot_minute: reservation.slot_minute,
    round_trip: reservation.round_trip,
    is_visible: false
  };

  await withLoading(async ()=>{
    await gsRun('api_updateReservation', payload);
  }, '非表示更新中...');

  await adminRefreshAllData(false);
  renderStats();
  renderSheetTable();
  renderAdminCalendar();
  document.getElementById('detailModal').classList.add('hidden');
  toast('予約を非表示にしました');
}

function bindAdminUI(){
  document.getElementById('goPublicPageBtn').addEventListener('click', ()=>{
    window.location.href = PUBLIC_PAGE_URL;
  });

  document.getElementById('goPublicPageTopBtn').addEventListener('click', ()=>{
    window.location.href = PUBLIC_PAGE_URL;
  });

  document.getElementById('logoutAdmin').addEventListener('click', ()=>{
    sessionStorage.removeItem('chiba_care_taxi_admin_auth');
    sessionStorage.removeItem('chiba_care_taxi_admin_auth_time');
    window.location.href = PUBLIC_PAGE_URL;
  });

  document.getElementById('saveLogoConfigBtn').addEventListener('click', async ()=>{
    try{
      await saveLogoAndGithubConfig();
    }catch(e){
      toast(e?.message || '保存に失敗しました');
    }
  });

  document.getElementById('uploadLogoBtn').addEventListener('click', async ()=>{
    try{
      await uploadLogoImage();
    }catch(e){
      document.getElementById('logoUploadStatus').className = 'small-status ng';
      document.getElementById('logoUploadStatus').textContent = e?.message || 'アップロード失敗';
      toast(e?.message || 'アップロードに失敗しました');
    }
  });

  document.getElementById('saveSameDayConfigBtn').addEventListener('click', async ()=>{
    try{
      await saveSameDayConfig();
    }catch(e){
      toast(e?.message || '保存に失敗しました');
    }
  });

  document.getElementById('changePasswordBtn').addEventListener('click', async ()=>{
    try{
      await changeAdminPassword();
    }catch(e){
      const status = document.getElementById('passwordChangeStatus');
      status.className = 'small-status ng';
      status.textContent = e?.message || '変更に失敗しました';
      toast(e?.message || '変更に失敗しました');
    }
  });

  document.getElementById('addMenuItemBtn').addEventListener('click', ()=>{
    addMenuAdminRow();
  });

  document.getElementById('saveMenuMasterBtn').addEventListener('click', async ()=>{
    try{
      await saveMenuMaster();
    }catch(e){
      toast(e?.message || '保存に失敗しました');
    }
  });

  document.getElementById('saveAutoRuleConfigBtn').addEventListener('click', async ()=>{
    try{
      await saveAutoRuleConfig();
    }catch(e){
      toast(e?.message || '保存に失敗しました');
    }
  });

  document.getElementById('openSheetBtn').addEventListener('click', ()=>{
    renderSheetTable();
    document.getElementById('sheetModal').classList.remove('hidden');
  });

  document.getElementById('closeSheet').addEventListener('click', ()=>{
    document.getElementById('sheetModal').classList.add('hidden');
  });

  document.getElementById('closeDetail').addEventListener('click', ()=>{
    document.getElementById('detailModal').classList.add('hidden');
  });

  document.getElementById('updateStatus').addEventListener('click', async ()=>{
    try{
      await updateReservationStatus();
    }catch(e){
      toast(e?.message || '更新に失敗しました');
    }
  });

  document.getElementById('hideReservation').addEventListener('click', async ()=>{
    try{
      await hideReservationRow();
    }catch(e){
      toast(e?.message || '更新に失敗しました');
    }
  });

  document.getElementById('sheetTableBody').addEventListener('click', (e)=>{
    const btn = e.target.closest('.open-detail-btn');
    if (btn){
      const id = btn.getAttribute('data-reservation-id') || '';
      openReservationDetail(id);
      return;
    }

    const tr = e.target.closest('[data-reservation-id]');
    if (tr){
      const id = tr.getAttribute('data-reservation-id') || '';
      openReservationDetail(id);
    }
  });

  document.getElementById('menuAdminList').addEventListener('change', (e)=>{
    const row = e.target.closest('[data-menu-row-index]');
    if (!row) return;

    if (e.target.getAttribute('data-role') === 'keyjp'){
      syncMenuRowFromKeyJp(row);
    }
  });

  window.addEventListener('resize', debounce(()=>{
    try{
      renderAdminCalendar();
    }catch(_){}
  }, 150));
}

async function initAdmin(){
  if (!ensureAdminAuth()) return;

  try{
    await withLoading(async ()=>{
      await adminRefreshAllData(true);
      applyAdminConfigToUI();
      renderStats();
      renderMenuAdminList();
      renderAutoRuleList();
      bindAdminCalendarDelegation();
      renderAdminCalendar();
      bindPanelToggle();
    }, '読み込み中...');
  }catch(e){
    showLoading(false);
    toast('初期化エラー: ' + (e?.message || e));
  }
}

bindAdminUI();
initAdmin();
