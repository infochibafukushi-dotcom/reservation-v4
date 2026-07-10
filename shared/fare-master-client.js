/**
 * 料金マスター API クライアント（LP・予約・管理画面）
 */
(function(global){
  const CACHE_KEY = "fareMasterCache";
  const CACHE_TTL_MS = 5 * 60 * 1000;

  function readCache(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed?.fetchedAt || Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
      return parsed.data;
    }catch{
      return null;
    }
  }

  function writeCache(data){
    try{
      localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
    }catch{}
  }

  async function fetchActiveFareMaster(apiBase, scope){
    const params = new URLSearchParams();
    if(scope?.tenantId) params.set("tenantId", scope.tenantId);
    if(scope?.franchiseeId) params.set("franchiseeId", scope.franchiseeId);
    if(scope?.storeId) params.set("storeId", scope.storeId);
    const url = String(apiBase || "").replace(/\/$/, "") + "/api/fare-master/active" + (params.toString() ? "?" + params.toString() : "");
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error("fare master HTTP " + res.status);
    const data = await res.json();
    if(!data?.success) throw new Error(data?.message || "fare master fetch failed");
    writeCache(data);
    return data;
  }

  async function fetchDisplayPricing(apiBase, scope){
    const params = new URLSearchParams();
    if(scope?.franchiseeId) params.set("franchiseeId", scope.franchiseeId);
    if(scope?.storeId) params.set("storeId", scope.storeId);
    const url = String(apiBase || "").replace(/\/$/, "") + "/api/fare-master/display" + (params.toString() ? "?" + params.toString() : "");
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error("fare display HTTP " + res.status);
    return res.json();
  }

  function mergeEstimateConfig(staticConfig, fareMasterPayload){
    if(!fareMasterPayload?.estimateConfig) return staticConfig;
    const merged = Object.assign({}, staticConfig, fareMasterPayload.estimateConfig);
    merged.fareMasterId = fareMasterPayload.fareMasterId;
    merged.fareVersionId = fareMasterPayload.fareVersionId;
    merged.fareVersion = fareMasterPayload.fareVersion;
    merged._fareSource = fareMasterPayload.fareSource;
    return merged;
  }

  async function loadEstimateConfigWithFareMaster({ apiBase, staticLoader, scope, allowCache = true }){
    let staticConfig = null;
    if(typeof staticLoader === "function"){
      staticConfig = await staticLoader();
    }
    if(!apiBase){
      return { config: staticConfig, fareSource: "static_json", fallbackReason: "api_base_missing" };
    }
    try{
      const payload = allowCache ? (readCache() || await fetchActiveFareMaster(apiBase, scope)) : await fetchActiveFareMaster(apiBase, scope);
      return {
        config: mergeEstimateConfig(staticConfig, payload),
        fareSource: payload.fareSource || "active_master",
        fareMasterId: payload.fareMasterId,
        fareVersionId: payload.fareVersionId,
      };
    }catch(error){
      const cached = readCache();
      if(cached){
        return {
          config: mergeEstimateConfig(staticConfig, cached),
          fareSource: "cached_master",
          fallbackReason: String(error?.message || error),
        };
      }
      if(staticConfig){
        return { config: staticConfig, fareSource: "static_json", fallbackReason: String(error?.message || error) };
      }
      throw new Error("料金情報を取得できませんでした");
    }
  }

  global.FareMasterClient = {
    fetchActiveFareMaster,
    fetchDisplayPricing,
    mergeEstimateConfig,
    loadEstimateConfigWithFareMaster,
    readCache,
  };
})(typeof window !== "undefined" ? window : globalThis);
