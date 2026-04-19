const API_BASE = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

function wrapOk(data){
  return { isOk: true, data: data };
}

const gsRun = async (func, ...args) => {

  if (func === 'api_getPublicBootstrap') {
    return wrapOk({
      config: {},
      menu_master: [],
      menu_key_catalog: [],
      menu_group_catalog: [],
      auto_rule_catalog: []
    });
  }

  if (func === 'api_getPublicBootstrapLite') {
    return wrapOk({ config: {} });
  }

  if (func === 'api_getPublicInitLite') {
    const range = args[0] || {};

    return wrapOk({
      start: range.start,
      end: range.end,
      slot_keys: [],
      config: {
        max_forward_days: "30",
        days_per_page: "7",
        same_day_enabled: "0"
      }
    });
  }

  if (func === 'api_getBlockedSlotKeys') {
    return wrapOk({ slot_keys: [] });
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

  return wrapOk({});
};
