(function (global) {
  const MOBILITY_BY_NAME = {
    "無料車いす": "free-wheelchair",
    車いす: "free-wheelchair",
    ご自身の車いす: "own-wheelchair",
    リクライニング車いす: "reclining-wheelchair",
    ストレッチャー: "stretcher",
    "杖・歩行器": "cane-walk",
    杖歩行: "cane-walk"
  };

  const ASSIST_BY_NAME = {
    見守り介助: "watch-assist",
    乗降介助: "boarding-assist",
    身体介助: "body-assist",
    介助不要: ""
  };

  const STAIR_BY_NAME = {
    階段介助なし: "stair-none",
    見守り介助: "stair-watch",
    "2階移動": "stair-floor2",
    "3階移動": "stair-floor3",
    "4階移動": "stair-floor4",
    "5階移動": "stair-floor5"
  };

  const TRIP_BY_NAME = {
    片道: "one-way",
    往復: "round-trip"
  };

  const ADDON_BY_NAME = {
    なし: "",
    待機: "addon-waiting",
    "待機（30分）": "addon-waiting",
    付き添い: "addon-escort",
    "付き添い（30分）": "addon-escort",
    病院付き添い: "addon-escort"
  };

  const CATEGORY_KEYS = {
    move_type: "mobility",
    assist: "assistance",
    stairs: "stairAssist"
  };

  function findConfigItem(config, categoryKey, name) {
    const label = String(name || "").trim();
    if (!label || !config?.categories?.[categoryKey]?.items) return null;
    return (
      config.categories[categoryKey].items.find(function (item) {
        return String(item?.label || "").trim() === label;
      }) || null
    );
  }

  function enrichMenuItems(items, config, categoryKey) {
    const list = Array.isArray(items) ? items : [];
    return list.map(function (item) {
      const cfg = findConfigItem(config, categoryKey, item.name);
      if (!cfg) return item;
      return {
        ...item,
        price: Number(cfg.amount ?? item.price ?? 0),
        description: String(cfg.description || item.description || "").trim()
      };
    });
  }

  function enrichMenuFromConfig(menu, config) {
    if (!menu || !config) return menu;
    const next = { ...menu };
    Object.entries(CATEGORY_KEYS).forEach(function ([groupKey, categoryKey]) {
      if (Array.isArray(next[groupKey])) {
        next[groupKey] = enrichMenuItems(next[groupKey], config, categoryKey);
      }
    });
    if (Array.isArray(next.round)) {
      next.round = next.round.map(function (item) {
        const name = String(item.name || "").trim();
        if (name === "片道" || name === "往復") {
          const trip = findConfigItem(config, "tripType", name);
          return trip
            ? {
                ...item,
                price: Number(trip.amount ?? item.price ?? 0),
                description: String(trip.description || item.description || "").trim()
              }
            : item;
        }
        if (/待機|付き添い/.test(name)) {
          const addon =
            findConfigItem(config, "roundTripAddon", "待機（30分）") ||
            findConfigItem(config, "roundTripAddon", "付き添い（30分）");
          const waitingFee = config.waitingFees?.waiting30min;
          const escortFee = config.waitingFees?.escort30min;
          const fee = /待機/.test(name) ? waitingFee : escortFee;
          return {
            ...item,
            price: Number(fee?.amount ?? item.price ?? 0),
            description: String(fee?.description || item.description || "").trim()
          };
        }
        return item;
      });
    }
    return next;
  }

  function splitRoundMenuItems(roundItems) {
    const list = Array.isArray(roundItems) ? roundItems : [];
    const tripItems = list.filter(function (item) {
      const name = String(item.name || "").trim();
      return name === "片道" || name === "往復";
    });
    const addonItems = list.filter(function (item) {
      const name = String(item.name || "").trim();
      return /待機|付き添い/.test(name);
    });
    return { tripItems, addonItems };
  }

  function resolveRoundTripValue(tripType, addon) {
    const trip = String(tripType || "").trim();
    const extra = String(addon || "").trim();
    if (trip === "片道") return "片道";
    if (trip !== "往復") return trip || "片道";
    if (!extra || extra === "なし" || extra === "選択してください") return "往復";
    if (extra.includes("付き添い") && !extra.includes("病院")) return "病院付き添い";
    return extra;
  }

  function mapFormToEstimateState(form) {
    const mobilityId = MOBILITY_BY_NAME[String(form.moveType || "").trim()] || "";
    const assistanceId = ASSIST_BY_NAME[String(form.assistType || "").trim()] || "";
    const stairId = STAIR_BY_NAME[String(form.stairType || "").trim()] || "";
    const tripTypeId = TRIP_BY_NAME[String(form.tripType || "").trim()] || "one-way";
    let roundTripAddonId = "";
    if (tripTypeId === "round-trip") {
      roundTripAddonId = ADDON_BY_NAME[String(form.roundTripAddon || "").trim()] || "";
    }
    return {
      mobilityId,
      assistanceId,
      stairId,
      tripTypeId,
      roundTripAddonId,
      distanceKm: Number(form.distanceKm) || 0,
      roadType: "general"
    };
  }

  async function loadEstimateConfig() {
    const res = await fetch("data/estimate-config.json?v=20260625A", { cache: "no-cache" });
    if (!res.ok) throw new Error("estimate-config.json を読み込めませんでした");
    return res.json();
  }

  function getDisplayBasicFareAmount(config) {
    const pattern = config?.distancePricing?.patternA || {};
    return Number(pattern.initialFare) || 500;
  }

  function getBookingDisplayTotal(config, result, form) {
    const total = Number(result?.total) || 0;
    const distanceKm = Number(form?.distanceKm) || 0;
    if (distanceKm > 0) return total;
    return total + getDisplayBasicFareAmount(config);
  }

  function computeBookingEstimate(config, form) {
    if (!global.EstimateCalc?.computeEstimate || !config) return null;
    const state = mapFormToEstimateState(form);
    return global.EstimateCalc.computeEstimate(config, state);
  }

  function getAddonNoneOption() {
    return {
      name: "なし",
      price: 0,
      description: "往復のみで、待機・付き添いは不要な場合に選択してください。追加料金はかかりません。"
    };
  }

  global.ReservationPricing = {
    MOBILITY_BY_NAME,
    ASSIST_BY_NAME,
    STAIR_BY_NAME,
    TRIP_BY_NAME,
    ADDON_BY_NAME,
    enrichMenuFromConfig,
    splitRoundMenuItems,
    resolveRoundTripValue,
    mapFormToEstimateState,
    loadEstimateConfig,
    computeBookingEstimate,
    getDisplayBasicFareAmount,
    getBookingDisplayTotal,
    getAddonNoneOption
  };
})(typeof window !== "undefined" ? window : globalThis);
