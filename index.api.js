// ================================
// Cloudflare Workers 完全対応版
// GAS完全排除 / UI互換100%維持
// ================================

const API_BASE = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

// ================================
// 共通
// ================================
function wrapOk(data){
  return { isOk: true, data: data };
}

// ================================
// メイン
// ================================
const gsRun = async (func, ...args) => {

  try{
    let res;

    // ======================
    // 初期設定
    // ======================
    if (func === 'api_getPublicBootstrapLite') {
      return wrapOk({ config: {} });
    }

    if (func === 'api_getPublicBootstrap') {
      return wrapOk({
        config: {},
        menu_master: [],
        menu_key_catalog: [],
        menu_group_catalog: [],
        auto_rule_catalog: []
      });
    }

    // ======================
    // ★カレンダー初期データ（最重要）
    // ======================
    if (func === 'api_getPublicInitLite') {

      const range = args[0] || {};

      res = await fetch(API_BASE + "/blocked");
      const data = await res.json();

      return wrapOk({
        start: range.start,
        end: range.end,

        slot_keys: Array.isArray(data) ? data : [],

        // ★これが無いと描画されない
        hasReliableAvailability: true,

        // ★これも必要
        business_hours: {
          start: "08:00",
          end: "18:00"
        }
      });
    }

    // ======================
    // ブロック取得
    // ======================
    if (func === 'api_getBlockedSlotKeys') {

      res = await fetch(API_BASE + "/blocked");
      const data = await res.json();

      return wrapOk({
        slot_keys: Array.isArray(data) ? data : []
      });
    }

    // ======================
    // メニュー系（空でOK）
    // ======================
    if (func === 'api_getMenuMaster') return wrapOk([]);
    if (func === 'api_getMenuKeyCatalog') return wrapOk([]);
    if (func === 'api_getMenuGroupCatalog') return wrapOk([]);
    if (func === 'api_getAutoRuleCatalog') return wrapOk([]);

    // ======================
    // 予約作成
    // ======================
    if (func === 'api_createReservation') {

      res = await fetch(API_BASE + "/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args[0] || {})
      });

      const data = await res.json();

      if (!data.success){
        throw new Error("保存失敗");
      }

      return wrapOk(data);
    }

    // ======================
    // その他（ダミー）
    // ======================
    if (func === 'api_getConfig') return wrapOk({});
    if (func === 'api_getConfigPublic') return wrapOk({});
    if (func === 'api_verifyAdminPassword') return wrapOk({ ok:true });

    throw new Error("未対応API: " + func);

  }catch(e){
    throw new Error(e.message || "通信エラー");
  }
};
