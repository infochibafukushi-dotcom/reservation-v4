const MOBILITY_MAP = {
  "own-wheelchair": "ご自身の車いす",
  "free-wheelchair": "無料車いす",
  "reclining-wheelchair": "リクライニング車いす",
  stretcher: "ストレッチャー",
  "cane-walk": "杖・歩行器"
};

const ASSIST_MAP = {
  "boarding-assist": "乗降介助",
  "body-assist": "身体介助",
  "watch-assist": "見守り介助"
};

const STAIR_MAP = {
  "stair-none": "階段介助なし",
  "stair-watch": "見守り介助",
  "stair-floor2": "2階移動",
  "stair-floor3": "3階移動",
  "stair-floor4": "4階移動",
  "stair-floor5": "5階移動"
};

const TRIP_MAP = {
  "one-way": "片道",
  "round-trip": "往復"
};

const ROUND_ADDON_MAP = {
  "waiting30min": "待機",
  "escort30min": "病院付き添い",
  "addon-waiting": "待機",
  "addon-escort": "病院付き添い"
};

const USAGE_LABELS = {
  mobility: "移動方法",
  assist: "介助内容",
  assistance: "介助内容",
  stair: "階段介助",
  trip: "送迎方法",
  roundTripAddon: "待機・付き添い"
};

function usageSummaryValue(handoff, labels) {
  const list = Array.isArray(handoff?.usageSummary) ? handoff.usageSummary : [];
  for (const label of labels) {
    const row = list.find((x) => String(x?.label || "").trim() === label);
    if (row && String(row.value || "").trim()) return String(row.value).trim();
  }
  return "";
}

function mapId(map, id, handoff, labelKeys) {
  const key = String(id || "").trim();
  if (key && map[key]) return map[key];
  const fromSummary = usageSummaryValue(handoff, labelKeys);
  return fromSummary || "";
}

function mapAddonLabel(rawLabel) {
  const label = String(rawLabel || "").trim();
  if (!label || label === "なし") return "なし";
  if (label.includes("待機")) return "待機";
  if (label.includes("付き添い")) return label.includes("病院") ? "病院付き添い" : "付き添い";
  return label;
}

function resolveRoundTripValue(tripType, roundTripAddon) {
  const trip = String(tripType || "").trim();
  const addon = String(roundTripAddon || "").trim();
  if (trip === "片道") return "片道";
  if (trip !== "往復") return trip || "片道";
  if (!addon || addon === "なし") return "往復";
  if (addon.includes("付き添い") && !addon.includes("病院")) return "病院付き添い";
  return addon;
}

function mapHandoffToFormValues(handoff) {
  const selections = handoff?.selections || {};
  const routePlan = handoff?.routePlan || null;
  const pickup = String(routePlan?.pickup?.address || "").trim();
  const destination = String(routePlan?.destination?.address || "").trim();
  const vehicle = mapId(MOBILITY_MAP, selections.mobilityId, handoff, [USAGE_LABELS.mobility, "移動方法"]);
  const assist = mapId(ASSIST_MAP, selections.assistanceId, handoff, [USAGE_LABELS.assist, USAGE_LABELS.assistance, "介助内容"]);
  const stairs = mapId(STAIR_MAP, selections.stairId, handoff, [USAGE_LABELS.stair, "階段介助"]);
  const tripType = mapId(TRIP_MAP, selections.tripTypeId, handoff, [USAGE_LABELS.trip, "送迎方法"]);
  let roundTripAddon = "なし";
  if (selections.tripTypeId === "round-trip") {
    const addonRaw = mapId(ROUND_ADDON_MAP, selections.roundTripAddonId, handoff, [USAGE_LABELS.roundTripAddon, "待機・付き添い"]);
    roundTripAddon = mapAddonLabel(addonRaw);
  }
  const roundTrip = resolveRoundTripValue(tripType, roundTripAddon);
  return {
    pickup,
    destination,
    vehicle,
    assist,
    stairs,
    tripType,
    roundTripAddon,
    roundTrip,
    equipment: "レンタルなし",
    total: Number(handoff?.total) || 0,
    estimateNumber: String(handoff?.estimateNumber || "").trim()
  };
}

window.EstimateMapping = {
  mapHandoffToFormValues,
  usageSummaryValue,
  resolveRoundTripValue
};
