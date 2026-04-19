const API_BASE = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

function wrapOk(data){
  return { isOk: true, data: data };
}

const gsRun = async (func, ...args) => {

  try{

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

    if (func === 'api_getPublicInitLite') {

      const range = args[0] || {};

      return wrapOk({
        start: range.start,
        end: range.end,
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

    if (func === 'api_getBlockedSlotKeys') {
      return wrapOk({
        slot_keys: []
      });
    }

    if (func === 'api_createReservation') {

      const res = await fetch(API_BASE + "/create", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(args[0] || {})
      });

      const data = await res.json();

      return wrapOk(data);
    }

    if (func === 'api_getConfig') return wrapOk({});
    if (func === 'api_getConfigPublic') return wrapOk({});
    if (func === 'api_verifyAdminPassword') return wrapOk({ ok:true });

    return wrapOk({});

  }catch(e){
    throw new Error(e.message || "通信エラー");
  }
};
