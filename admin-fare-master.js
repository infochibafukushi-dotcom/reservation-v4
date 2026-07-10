/**
 * 料金マスター管理 UI（詳細編集）
 */
(function(){
  const API = window.API || {};
  const base = API.BASE || "";
  let currentForm = null;
  let activeRecord = null;

  async function apiGet(path){
    const token = sessionStorage.getItem("adminToken") || "";
    const res = await fetch(base + path, { headers: { Authorization: "Bearer " + token } });
    return res.json();
  }

  async function apiPost(path, body){
    const token = sessionStorage.getItem("adminToken") || "";
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(body || {}),
    });
    return res.json();
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
    editor.innerHTML = FIELD_GROUPS.map(group => `
      <fieldset class="fare-master-group"><legend>${group.title}</legend>
        <div class="two-col">${group.fields.map(([key,label,type,step]) => {
          if(type === "checkbox"){
            const checked = form[key] ? "checked" : "";
            return `<label>${label}<input data-fare-field="${key}" type="checkbox" ${checked}></label>`;
          }
          return `<label>${label}<input data-fare-field="${key}" type="${type}" step="${step}" value="${form[key] ?? ""}"></label>`;
        }).join("")}</div>
      </fieldset>
    `).join("");
  }

  function readFormFromDom(){
    const form = {};
    document.querySelectorAll("[data-fare-field]").forEach(el => {
      if(el.type === "checkbox") form[el.getAttribute("data-fare-field")] = el.checked;
      else form[el.getAttribute("data-fare-field")] = el.type === "number" ? Number(el.value) : el.value;
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
      diff.map(r => `<tr><td>${r.item}</td><td>${r.before}</td><td>${r.after}</td></tr>`).join("") +
      "</tbody></table>";
  }

  function renderVersions(versions){
    const el = document.getElementById("fareMasterVersionList");
    if(!el) return;
    if(!versions?.length){ el.innerHTML = "<p class=\"note\">バージョンがありません。</p>"; return; }
    const now = Date.now();
    el.innerHTML = "<table><thead><tr><th>ID</th><th>版</th><th>状態</th><th>適用開始</th><th>区分</th></tr></thead><tbody>" +
      versions.map(v => {
        const isFuture = v.status === "scheduled" && Date.parse(v.effectiveFrom) > now;
        const tag = isFuture ? "未来適用" : v.status === "active" ? "現行" : v.status;
        return `<tr><td>${v.id}</td><td>${v.version}</td><td>${tag}</td><td>${v.effectiveFrom || ""}</td><td>${v.scopeType}</td></tr>`;
      }).join("") + "</tbody></table>";
  }

  function renderChanges(changes){
    const el = document.getElementById("fareMasterChangeList");
    if(!el) return;
    if(!changes?.length){ el.innerHTML = "<p class=\"note\">変更履歴なし</p>"; return; }
    el.innerHTML = changes.slice(0, 30).map(c =>
      `<div class="info-box"><strong>${c.changedAt}</strong> ${c.changeReason || ""}<br>${c.changeType} / ${c.changedBy}</div>`
    ).join("");
  }

  async function loadEditor(){
    const scope = document.getElementById("fareMasterScopeType")?.value || "headquarters";
    const franchiseeId = document.getElementById("fareMasterFranchiseeId")?.value?.trim() || "";
    const storeId = document.getElementById("fareMasterStoreId")?.value?.trim() || "";
    const params = new URLSearchParams();
    if(franchiseeId) params.set("franchiseeId", franchiseeId);
    if(storeId) params.set("storeId", storeId);
    const data = await apiGet("/api/admin/fare-master/edit-form?" + params.toString());
    if(!data.success) return;
    activeRecord = data.active;
    renderEditor(data.form || {});
    const box = document.getElementById("fareMasterActiveBox");
    if(box){
      box.innerHTML = `<strong>現行:</strong> ${data.active?.version || "-"} (${data.active?.id || "-"}) / ${data.fareSource || ""} / ${data.active?.scopeType || scope}`;
    }
  }

  async function refreshFareMasterPanel(){
    await loadEditor();
    const versions = await apiGet("/api/admin/fare-master/versions");
    if(versions.success) renderVersions(versions.versions);
    const changes = await apiGet("/api/admin/fare-master/changes");
    if(changes.success) renderChanges(changes.changes);
    const perms = await apiGet("/api/admin/fare-master/permissions");
    const permBox = document.getElementById("fareMasterPermBox");
    if(permBox && perms.success){
      permBox.textContent = perms.isOwnerDefault
        ? "権限: オーナー（全権限）"
        : "権限: " + (perms.permissions || []).join(", ");
    }
  }

  document.getElementById("fareMasterSeedBtn")?.addEventListener("click", async () => {
    if(!confirm("本部標準 v1 をシードしますか？")) return;
    const result = await apiPost("/api/admin/fare-master/seed");
    alert(result.message || result.action || JSON.stringify(result));
    await refreshFareMasterPanel();
  });

  document.getElementById("fareMasterRefreshBtn")?.addEventListener("click", refreshFareMasterPanel);
  document.getElementById("fareMasterLoadBtn")?.addEventListener("click", loadEditor);

  document.getElementById("fareMasterDraftBtn")?.addEventListener("click", async () => {
    const changeReason = document.getElementById("fareMasterChangeReason")?.value?.trim() || "下書き保存";
    const result = await apiPost("/api/admin/fare-master/draft", { form: readFormFromDom(), changeReason });
    alert(result.success ? "下書き保存しました" : (result.message || "失敗"));
    await refreshFareMasterPanel();
  });

  document.getElementById("fareMasterPublishBtn")?.addEventListener("click", async () => {
    const changeReason = document.getElementById("fareMasterChangeReason")?.value?.trim();
    if(!changeReason){ alert("変更理由を入力してください"); return; }
    if(!confirm("認可運賃に関係する項目は許可内容と一致していることを確認してください。公開しますか？")) return;
    const effectiveFrom = document.getElementById("fareMasterEffectiveFrom")?.value;
    const body = { form: readFormFromDom(), changeReason, immediate: !effectiveFrom };
    if(effectiveFrom) body.effectiveFrom = new Date(effectiveFrom).toISOString();
    const result = await apiPost("/api/admin/fare-master/publish", body);
    if(result.success){
      renderDiff(result.diff || []);
      alert("公開しました");
      await refreshFareMasterPanel();
    } else {
      alert(result.message || "公開に失敗しました");
    }
  });

  document.addEventListener("DOMContentLoaded", () => { void refreshFareMasterPanel(); });
})();
