// ================================
// GAS完全互換（元コード壊さない版）
// ================================

const API_BASE = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

function wrapOk(data){
  return { isOk: true, data: data };
}

// ★ここが重要（完全互換）
window.gsRun = function(func, payload){

  return new Promise(async (resolve, reject)=>{

    try{

      // ======================
      // Bootstrap
      // ======================
      if (func === 'api_getPublicBootstrap' || func === 'api_getPublicBootstrapLite') {
        return resolve(wrapOk({
          config: {
            max_forward_days: "30",
            days_per_page: "7",
            same_day_enabled: "0"
          },
          menu_master: [],
          menu_key_catalog: [],
          menu_group_catalog: [],
          auto_rule_catalog: []
        }));
      }

      // ======================
      // カレンダー初期（ここが核心）
      // ======================
      if (func === 'api_getPublicInitLite') {

        return resolve(wrapOk({
          slot_keys: [],
          hasReliableAvailability: true,
          business_hours: {
            start: "08:00",
            end: "18:00"
          },
          config: {
            max_forward_days: "30",
            days_per_page: "7",
            same_day_enabled: "0"
          }
        }));
      }

      // ======================
      // ブロック
      // ======================
      if (func === 'api_getBlockedSlotKeys') {
        return resolve(wrapOk({ slot_keys: [] }));
      }

      // ======================
      // 予約保存（Workers）
      // ======================
      if (func === 'api_createReservation') {

        const res = await fetch(API_BASE + "/create", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify(payload || {})
        });

        const data = await res.json();

        return resolve(wrapOk(data));
      }

      // ======================
      // その他
      // ======================
      return resolve(wrapOk({}));

    }catch(e){
      reject(e);
    }

  });
};
