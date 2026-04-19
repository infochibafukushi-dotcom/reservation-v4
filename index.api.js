const API_BASE = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

function wrapOk(data){
  return { isOk: true, data: data };
}

const gsRun = async (func, payload = {}) => {

  try{

    // Bootstrap
    if (func === 'api_getPublicBootstrap') {
      return wrapOk({
        config: {
          max_forward_days: "30",
          days_per_page: "7",
          same_day_enabled: "0"
        },
        menu_master: [],
        menu_key_catalog: [],
        menu_group_catalog: [],
        auto_rule_catalog: []
      });
    }

    if (func === 'api_getPublicBootstrapLite') {
      return wrapOk({
        config: {
          max_forward_days: "30",
          days_per_page: "7",
          same_day_enabled: "0"
        }
      });
    }

    // ★カレンダー初期（元コード互換）
    if (func === 'api_getPublicInitLite') {

      return wrapOk({
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
      });
    }

    // ブロック
    if (func === 'api_getBlockedSlotKeys') {
      return wrapOk({
        slot_keys: []
      });
    }

    // ★予約保存（Workersへ）
    if (func === 'api_createReservation') {

      const res = await fetch(API_BASE + "/create", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      return wrapOk(data);
    }

    // その他
    if (func === 'api_getConfig') return wrapOk({});
    if (func === 'api_getConfigPublic') return wrapOk({});
    if (func === 'api_verifyAdminPassword') return wrapOk({ ok:true });

    return wrapOk({});

  }catch(e){
    throw new Error(e.message || "通信エラー");
  }
};
