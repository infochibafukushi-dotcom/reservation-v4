/**
 * 料金マスター管理 UI
 */
(function(){
  const API = window.API || {};
  const base = API.BASE || "";

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

  function renderVersions(versions){
    const el = document.getElementById("fareMasterVersionList");
    if(!el) return;
    if(!versions?.length){
      el.innerHTML = "<p class=\"note\">バージョンがありません。初回シードを実行してください。</p>";
      return;
    }
    el.innerHTML = "<table><thead><tr><th>ID</th><th>版</th><th>状態</th><th>適用開始</th><th>理由</th></tr></thead><tbody>" +
      versions.map(v => `<tr><td>${v.id}</td><td>${v.version}</td><td>${v.status}</td><td>${v.effectiveFrom || ""}</td><td>${v.changeReason || ""}</td></tr>`).join("") +
      "</tbody></table>";
  }

  function renderChanges(changes){
    const el = document.getElementById("fareMasterChangeList");
    if(!el) return;
    if(!changes?.length){ el.innerHTML = "<p class=\"note\">変更履歴なし</p>"; return; }
    el.innerHTML = changes.slice(0, 20).map(c =>
      `<div class="info-box"><strong>${c.changedAt}</strong> ${c.changeReason || ""}<br>by ${c.changedBy} / ${c.changeType}</div>`
    ).join("");
  }

  async function refreshFareMasterPanel(){
    const versions = await apiGet("/api/admin/fare-master/versions");
    if(versions.success) renderVersions(versions.versions);
    const changes = await apiGet("/api/admin/fare-master/changes");
    if(changes.success) renderChanges(changes.changes);
    const active = await fetch(base + "/api/fare-master/active").then(r => r.json()).catch(() => null);
    const box = document.getElementById("fareMasterActiveBox");
    if(box && active?.success){
      box.innerHTML = `<strong>現行:</strong> ${active.fareVersion} (${active.fareMasterId}) / ${active.fareSource}`;
    }
  }

  document.getElementById("fareMasterSeedBtn")?.addEventListener("click", async () => {
    if(!confirm("本部標準 v1 をシードしますか？")) return;
    const result = await apiPost("/api/admin/fare-master/seed");
    alert(result.message || result.action || JSON.stringify(result));
    await refreshFareMasterPanel();
  });

  document.getElementById("fareMasterRefreshBtn")?.addEventListener("click", refreshFareMasterPanel);

  document.getElementById("fareMasterPublishBtn")?.addEventListener("click", async () => {
    const changeReason = document.getElementById("fareMasterChangeReason")?.value?.trim();
    if(!changeReason){ alert("変更理由を入力してください"); return; }
    if(!confirm("料金マスターを公開しますか？認可運賃に関係する項目は許可内容と一致していることを確認してください。")) return;
    const effectiveFrom = document.getElementById("fareMasterEffectiveFrom")?.value;
    const body = { changeReason, immediate: !effectiveFrom };
    if(effectiveFrom) body.effectiveFrom = new Date(effectiveFrom).toISOString();
    const result = await apiPost("/api/admin/fare-master/publish", body);
    if(result.success){
      alert("公開しました");
      await refreshFareMasterPanel();
    } else {
      alert(result.message || "公開に失敗しました");
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    void refreshFareMasterPanel();
  });
})();
