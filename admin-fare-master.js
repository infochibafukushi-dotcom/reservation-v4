/**
 * 料金マスター管理 UI（詳細編集）
 * index.api.js の API_BASE / getAdminToken / authHeaders を使用する。
 */
(function(){
  let currentForm = null;
  let activeRecord = null;
  let loading = false;

  function formatFareMasterError(status, data, text){
    const msg = String(data?.message || text || "").trim();
    if(status === 401){
      return "401：管理者ログインの有効期限が切れています。再ログインしてください。";
    }
    if(status === 403){
      return `403：${msg || "料金マスターへのアクセス権限がありません。"}`;
    }
    if(status === 404){
      return `404：${msg || "料金マスターAPIが見つかりません。API_BASEの設定を確認してください。"}`;
    }
    if(status >= 500){
      return `${status}：サーバーエラーが発生しました。${msg ? `（${msg}）` : ""}`;
    }
    if(status){
      return `${status}：${msg || "料金マスターの取得に失敗しました。"}`;
    }
    return msg || "料金マスターの取得に失敗しました。";
  }

  async function fareMasterRequest(path, options = {}){
    if(typeof apiUrl !== "function" || typeof fetchWithRetry !== "function"){
      throw Object.assign(new Error("API設定が読み込まれていません。config.js / index.api.js を確認してください。"), { status: 0 });
    }
    const headers = typeof authHeaders === "function"
      ? authHeaders(options.headers || {})
      : (options.headers || {});
    const res = await fetchWithRetry(apiUrl(path), {
      cache: "no-store",
      ...options,
      headers,
    });
    const text = await res.text();
    let data;
    try{ data = JSON.parse(text); }catch{ data = text; }
    if(!res.ok){
      if(res.status === 401 || res.status === 403){
        if(typeof clearAdminSession === "function") clearAdminSession();
        if(typeof showLogin === "function") showLogin();
      }
      const err = new Error(formatFareMasterError(res.status, data, text));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    if(data && typeof data === "object" && data.success === false){
      const err = new Error(formatFareMasterError(res.status, data, text));
      err.status = res.status || 400;
      err.data = data;
      throw err;
    }
    return data;
  }

  function fareMasterGet(path){ return fareMasterRequest(path); }
  function fareMasterPost(path, body){
    return fareMasterRequest(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  function setActiveBoxLoading(){
    const box = document.getElementById("fareMasterActiveBox");
    if(box) box.innerHTML = "<span class=\"fare-master-loading\">読み込み中…</span>";
  }

  function renderActiveBoxError(err){
    const box = document.getElementById("fareMasterActiveBox");
    if(!box) return;
    const status = err?.status ? `HTTP ${err.status}` : "エラー";
    const reason = escapeHtml(err?.message || "料金マスターの取得に失敗しました。");
    const relogin = err?.status === 401
      ? "<p class=\"note warn\">画面上部のログイン欄から再ログインしてください。</p>"
      : "";
    box.innerHTML = `<div class="fare-master-error"><strong>料金マスターの取得に失敗しました。</strong><p>${status}：${reason}</p>${relogin}<div class="actions"><button type="button" class="secondary-btn" id="fareMasterRetryBtn">再読込</button></div></div>`;
    box.querySelector("#fareMasterRetryBtn")?.addEventListener("click", () => { void refreshFareMasterPanel(); });
  }

  function renderActiveBoxSuccess(data, scope){
    const box = document.getElementById("fareMasterActiveBox");
    if(!box) return;
    const version = escapeHtml(data.active?.version || "-");
    const id = escapeHtml(data.active?.id || "-");
    const source = escapeHtml(data.fareSource || "");
    const scopeLabel = escapeHtml(data.active?.scopeType || scope);
    box.innerHTML = `<strong>現行:</strong> ${version} (${id}) / ${source} / ${scopeLabel}`;
  }

  function buildScopeQuery(){
    const franchiseeId = document.getElementById("fareMasterFranchiseeId")?.value?.trim() || "";
    const storeId = document.getElementById("fareMasterStoreId")?.value?.trim() || "";
    const params = new URLSearchParams();
    if(franchiseeId) params.set("franchiseeId", franchiseeId);
    if(storeId) params.set("storeId", storeId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  const FIELD_GROUPS = [
    { title: "認可運賃（距離制）", fields: [
      ["initialDistanceKm", "初乗り距離(km)", "number", "0.01"],
      ["initialFare", "初乗り運賃(円)", "number", "1"],
      ["incrementDistanceKm", "加算距離(km)", "number", "0.001"],
      ["incrementFare", "加算運賃(円)", "number", "1"],
      ["lowSpeedThresholdKmh", "低速判定(km/h)", "number", "1"],
      ["lowSpeedUnitSeconds", "低速加算時間(秒)", "number", "1"],
      ["lowSpeedUnitFareYen", "低速加算運賃(円)", "number", "1"],
    ]},
    { title: "時間制運賃", fields: [
      ["timeBaseMinutes", "初回時間(分)", "number", "1"],
      ["timeBaseAmountYen", "初回運賃(円)", "number", "1"],
      ["timeBlockMinutes", "加算時間(分)", "number", "1"],
      ["timeBlockAmountYen", "加算運賃(円)", "number", "1"],
    ]},
    { title: "基本・介助・機材", fields: [
      ["pickupFee", "迎車料金(円)", "number", "1"],
      ["specialVehicleFee", "特殊車両料金(円)", "number", "1"],
      ["boardingAssist", "乗降介助(円)", "number", "1"],
      ["bodyAssist", "身体介助(円)", "number", "1"],
      ["stairFloor2", "階段介助2階(円)", "number", "1"],
      ["stairFloor3", "階段介助3階(円)", "number", "1"],
      ["stairFloor4", "階段介助4階(円)", "number", "1"],
      ["stairFloor5", "階段介助5階以上(円)", "number", "1"],
      ["waitingUnitSeconds", "待機単位(秒)", "number", "1"],
      ["waitingUnitFareYen", "待機料金(円)", "number", "1"],
      ["escortUnitSeconds", "付き添い単位(秒)", "number", "1"],
      ["escortUnitFareYen", "付き添い料金(円)", "number", "1"],
      ["standardWheelchair", "標準車いす(円)", "number", "1"],
      ["recliningWheelchair", "リクライニング(円)", "number", "1"],
      ["stretcher", "ストレッチャー(円)", "number", "1"],
    ]},
    { title: "表示（迎車・特殊車両）", fields: [
      ["pickupDisplayName", "迎車 表示名称", "text", "1"],
      ["pickupLpVisible", "迎車 LP表示", "checkbox", "1"],
      ["pickupEstimateVisible", "迎車 見積表示", "checkbox", "1"],
      ["pickupShowTilde", "迎車 円～表示", "checkbox", "1"],
      ["specialDisplayName", "特殊車両 表示名称", "text", "1"],
      ["specialLpVisible", "特殊車両 LP表示", "checkbox", "1"],
      ["specialEstimateVisible", "特殊車両 見積表示", "checkbox", "1"],
      ["specialShowTilde", "特殊車両 円～表示", "checkbox", "1"],
    ]},
    { title: "割増・割引", fields: [
      ["nightStartHour", "深夜開始(時)", "number", "1"],
      ["nightEndHour", "深夜終了(時)", "number", "1"],
      ["nightSurchargeRate", "深夜割増率(0-1)", "number", "0.01"],
      ["disabilityDiscountRate", "障害者割引率(0-1)", "number", "0.01"],
    ]},
  ];

  function renderEditor(form){
    const editor = document.getElementById("fareMasterEditor");
    if(!editor) return;
    currentForm = form;
    if(!form || typeof form !== "object"){
      editor.innerHTML = "<p class=\"note\">料金データを読み込めませんでした。</p>";
      return;
    }
    editor.innerHTML = FIELD_GROUPS.map(group => `
      <fieldset class="fare-master-group"><legend>${group.title}</legend>
        <div class="two-col">${group.fields.map(([key,label,type,step]) => {
          if(type === "checkbox"){
            const checked = form[key] ? "checked" : "";
            return `<label>${label}<input data-fare-field="${key}" type="checkbox" ${checked}></label>`;
          }
          const val = form[key] ?? "";
          return `<label>${label}<input data-fare-field="${key}" type="${type}" step="${step}" value="${escapeHtml(val)}"></label>`;
        }).join("")}</div>
      </fieldset>
    `).join("");
  }

  function readFormFromDom(){
    const form = {};
    document.querySelectorAll("[data-fare-field]").forEach(el => {
      const key = el.getAttribute("data-fare-field");
      if(el.type === "checkbox") form[key] = el.checked;
      else form[key] = el.type === "number" ? Number(el.value) : el.value;
    });
    form.scopeType = document.getElementById("fareMasterScopeType")?.value || "headquarters";
    form.franchiseeId = document.getElementById("fareMasterFranchiseeId")?.value?.trim() || "";
    form.storeId = document.getElementById("fareMasterStoreId")?.value?.trim() || "";
    return form;
  }

  function renderDiff(diff){
    const el = document.getElementById("fareMasterDiffBox");
    if(!el) return;
    if(!diff?.length){ el.innerHTML = "<p class=\"note\">変更差分なし</p>"; return; }
    el.innerHTML = "<table><thead><tr><th>項目</th><th>変更前</th><th>変更後</th></tr></thead><tbody>" +
      diff.map(r => `<tr><td>${escapeHtml(r.item)}</td><td>${escapeHtml(r.before)}</td><td>${escapeHtml(r.after)}</td></tr>`).join("") +
      "</tbody></table>";
  }

  function renderVersions(versions, err){
    const el = document.getElementById("fareMasterVersionList");
    if(!el) return;
    if(err){
      el.innerHTML = `<p class="note warn">${escapeHtml(err.message || "バージョン一覧の取得に失敗しました")}</p>`;
      return;
    }
    if(!versions?.length){ el.innerHTML = "<p class=\"note\">バージョンがありません。</p>"; return; }
    const now = Date.now();
    el.innerHTML = "<table><thead><tr><th>ID</th><th>版</th><th>状態</th><th>適用開始</th><th>区分</th></tr></thead><tbody>" +
      versions.map(v => {
        const isFuture = v.status === "scheduled" && Date.parse(v.effectiveFrom) > now;
        const tag = isFuture ? "未来適用" : v.status === "active" ? "現行" : v.status;
        return `<tr><td>${escapeHtml(v.id)}</td><td>${escapeHtml(v.version)}</td><td>${escapeHtml(tag)}</td><td>${escapeHtml(v.effectiveFrom || "")}</td><td>${escapeHtml(v.scopeType)}</td></tr>`;
      }).join("") + "</tbody></table>";
  }

  function renderChanges(changes, err){
    const el = document.getElementById("fareMasterChangeList");
    if(!el) return;
    if(err){
      el.innerHTML = `<p class="note warn">${escapeHtml(err.message || "変更履歴の取得に失敗しました")}</p>`;
      return;
    }
    if(!changes?.length){ el.innerHTML = "<p class=\"note\">変更履歴なし</p>"; return; }
    el.innerHTML = changes.slice(0, 30).map(c =>
      `<div class="info-box"><strong>${escapeHtml(c.changedAt)}</strong> ${escapeHtml(c.changeReason || "")}<br>${escapeHtml(c.changeType)} / ${escapeHtml(c.changedBy)}</div>`
    ).join("");
  }

  function requireAdminForFareMaster(){
    const token = typeof getAdminToken === "function" ? getAdminToken() : "";
    if(!token){
      const err = new Error("401：管理者ログインの有効期限が切れています。再ログインしてください。");
      err.status = 401;
      throw err;
    }
  }

  async function loadEditor(){
    const scope = document.getElementById("fareMasterScopeType")?.value || "headquarters";
    requireAdminForFareMaster();
    const data = await fareMasterGet(`/api/admin/fare-master/edit-form${buildScopeQuery()}`);
    activeRecord = data.active;
    renderEditor(data.form || {});
    renderActiveBoxSuccess(data, scope);
    return data;
  }

  async function refreshFareMasterPanel(){
    if(loading) return;
    loading = true;
    setActiveBoxLoading();
    const editor = document.getElementById("fareMasterEditor");
    if(editor) editor.innerHTML = "";
    renderVersions(null);
    renderChanges(null);
    try{
      requireAdminForFareMaster();
      await loadEditor();
      const scopeQs = buildScopeQuery();
      try{
        const versions = await fareMasterGet(`/api/admin/fare-master/versions${scopeQs}`);
        renderVersions(versions.versions);
      }catch(e){
        renderVersions(null, e);
      }
      try{
        const changes = await fareMasterGet("/api/admin/fare-master/changes");
        renderChanges(changes.changes);
      }catch(e){
        renderChanges(null, e);
      }
      try{
        const perms = await fareMasterGet("/api/admin/fare-master/permissions");
        const permBox = document.getElementById("fareMasterPermBox");
        if(permBox){
          permBox.textContent = perms.isOwnerDefault
            ? "権限: オーナー（全権限）"
            : "権限: " + (perms.permissions || []).join(", ");
        }
      }catch(e){
        const permBox = document.getElementById("fareMasterPermBox");
        if(permBox) permBox.textContent = e?.status === 403 ? "権限情報: 参照不可" : "";
      }
    }catch(e){
      renderActiveBoxError(e);
      if(editor) editor.innerHTML = "<p class=\"note warn\">ログイン後に再読込してください。</p>";
      renderVersions(null, e);
      renderChanges(null, e);
    }finally{
      loading = false;
    }
  }

  function initFareMasterPanel(){
    document.getElementById("fareMasterSeedBtn")?.addEventListener("click", async () => {
      if(!confirm("本部標準 v1 をシードしますか？")) return;
      try{
        const result = await fareMasterPost("/api/admin/fare-master/seed");
        toast(result.message || result.action || "シード完了");
        await refreshFareMasterPanel();
      }catch(e){
        toast(e.message || "シードに失敗しました");
      }
    });
    document.getElementById("fareMasterRefreshBtn")?.addEventListener("click", () => { void refreshFareMasterPanel(); });
    document.getElementById("fareMasterLoadBtn")?.addEventListener("click", async () => {
      setActiveBoxLoading();
      try{
        await loadEditor();
      }catch(e){
        renderActiveBoxError(e);
      }
    });
    document.getElementById("fareMasterDraftBtn")?.addEventListener("click", async () => {
      const changeReason = document.getElementById("fareMasterChangeReason")?.value?.trim() || "下書き保存";
      try{
        await fareMasterPost("/api/admin/fare-master/draft", { form: readFormFromDom(), changeReason });
        toast("下書き保存しました");
        await refreshFareMasterPanel();
      }catch(e){
        toast(e.message || "下書き保存に失敗しました");
      }
    });
    document.getElementById("fareMasterPublishBtn")?.addEventListener("click", async () => {
      const changeReason = document.getElementById("fareMasterChangeReason")?.value?.trim();
      if(!changeReason){ toast("変更理由を入力してください"); return; }
      if(!confirm("認可運賃に関係する項目は許可内容と一致していることを確認してください。公開しますか？")) return;
      const effectiveFrom = document.getElementById("fareMasterEffectiveFrom")?.value;
      const body = { form: readFormFromDom(), changeReason, immediate: !effectiveFrom };
      if(effectiveFrom) body.effectiveFrom = new Date(effectiveFrom).toISOString();
      try{
        const result = await fareMasterPost("/api/admin/fare-master/publish", body);
        renderDiff(result.diff || []);
        toast("公開しました");
        await refreshFareMasterPanel();
      }catch(e){
        toast(e.message || "公開に失敗しました");
      }
    });
    ["fareMasterScopeType", "fareMasterFranchiseeId", "fareMasterStoreId"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", () => { void refreshFareMasterPanel(); });
    });
    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", () => { void refreshFareMasterPanel(); });
    }else{
      void refreshFareMasterPanel();
    }
  }

  window.refreshFareMasterPanel = refreshFareMasterPanel;
  window.FareMasterAdmin = {
    formatFareMasterError,
    buildScopeQuery,
    FIELD_GROUPS,
  };

  initFareMasterPanel();
})();
