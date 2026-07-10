export function formatYen(amount){
  return `${Number(amount || 0).toLocaleString("ja-JP")}円`;
}

function getPrimaryRoute(routePlan){
  if(!routePlan) return null;
  if(Array.isArray(routePlan.routes) && routePlan.routes.length){
    const selectedId = String(routePlan.selectedRouteId || "");
    const selected = routePlan.routes.find((route) => String(route?.routeId || route?.id || "") === selectedId);
    return selected || routePlan.routes[0];
  }
  return {
    distanceMeters: Number(routePlan.distanceMeters) || 0,
    durationSeconds: Number(routePlan.durationSeconds) || 0
  };
}

export function formatDistanceKm(snapshot, routePlan){
  const meters = Number(snapshot?.distanceMeters) || 0;
  if(meters > 0) return `${(meters / 1000).toFixed(1)}km`;
  const km = Number(snapshot?.distanceKm) || 0;
  if(km > 0) return `${km.toFixed(1)}km`;
  const primary = getPrimaryRoute(routePlan);
  if(primary && Number(primary.distanceMeters) > 0){
    return `${(Number(primary.distanceMeters) / 1000).toFixed(1)}km`;
  }
  return "-";
}

export function formatDurationMinutes(snapshot, routePlan){
  const seconds = Number(snapshot?.durationSeconds) || 0;
  if(seconds > 0) return `${Math.max(1, Math.round(seconds / 60))}分`;
  const primary = getPrimaryRoute(routePlan);
  if(primary && Number(primary.durationSeconds) > 0){
    return `${Math.max(1, Math.round(Number(primary.durationSeconds) / 60))}分`;
  }
  return "-";
}

export function getRouteProviderLabel(provider){
  if(provider === "google_routes") return "Google Maps Platform Routes API";
  if(provider === "manual_distance") return "距離手入力";
  return String(provider || "-");
}

function getBreakdownAmount(rows, key){
  const row = (Array.isArray(rows) ? rows : []).find((item) => item?.key === key);
  return Number(row?.amount) || 0;
}

function getServiceFeeAmount(serviceFees, keys){
  const keySet = new Set(keys);
  return (Array.isArray(serviceFees) ? serviceFees : []).reduce((sum, row) => {
    if(keySet.has(row?.key)) return sum + (Number(row.amount) || 0);
    return sum;
  }, 0);
}

export function buildFareCalculationLines(options = {}){
  const snapshot = options.quoteSnapshot || {};
  const breakdown = options.breakdown || {};
  const total = Number(options.total)
    || Number(snapshot.totalAmount)
    || Number(snapshot.fixedFareTotal)
    || 0;
  const routePlan = options.routePlan || null;
  const fareMode = String(snapshot.fareMode || options.fareMode || "");
  const isAuthorized = fareMode === "distance_time" || fareMode === "pre_fixed_fare";
  const totalLabel = String(options.totalLabel || (isAuthorized ? "お支払い合計" : "概算料金"));

  const pickupFee = getBreakdownAmount(snapshot.fixedFareBreakdown, "pickupFee")
    || Number(breakdown.pickupFee) || Number(snapshot.pickupFee) || 0;
  const specialVehicleFee = Number(snapshot.specialVehicleFeeAmount)
    || getBreakdownAmount(snapshot.fixedFareBreakdown, "specialVehicleFee")
    || 0;
  const preFixedBody = Number(snapshot.preFixedFareAmount)
    || Number(snapshot.adjustedDistanceFareAmount)
    || getBreakdownAmount(snapshot.fixedFareBreakdown, "distanceFare")
    || Number(breakdown.distanceFare)
    || 0;
  const distanceFare = getBreakdownAmount(snapshot.fixedFareBreakdown, "distanceFare")
    || Number(breakdown.distanceFare) || 0;
  const timeAdjustment = isAuthorized
    ? (Number(snapshot.scheduledDurationSurcharge) || 0)
    : (getBreakdownAmount(snapshot.fixedFareBreakdown, "timeAdjustment") || 0);
  const assistanceFee = getServiceFeeAmount(snapshot.serviceFees, ["assistanceFee"])
    || Number(breakdown.assistanceFee) || 0;
  const stairFee = getServiceFeeAmount(snapshot.serviceFees, ["stairFee"])
    || Number(breakdown.stairFee) || 0;
  const wheelchairFee = getServiceFeeAmount(snapshot.serviceFees, ["wheelchairFee"])
    || Number(breakdown.wheelchairFee) || 0;
  const waitingEscortFee = getServiceFeeAmount(snapshot.serviceFees, ["waitingFee", "escortFee"])
    || (Number(breakdown.waitingFee) || 0) + (Number(breakdown.escortFee) || 0);
  const serviceTotal = assistanceFee + stairFee + wheelchairFee + waitingEscortFee;

  const routeLabel = String(options.routeLabel || "ルート算出");
  const lines = [
    { label: "予定距離", value: formatDistanceKm(snapshot, routePlan) },
    { label: "予定時間", value: formatDurationMinutes(snapshot, routePlan) },
    { label: routeLabel, value: getRouteProviderLabel(snapshot.routeProvider) }
  ];

  if(isAuthorized){
    lines.push(
      { label: "事前確定運賃本体", value: formatYen(preFixedBody) },
      { label: "迎車料金", value: formatYen(pickupFee) }
    );
    if(specialVehicleFee > 0 || snapshot.specialVehicleFeeEnabled){
      lines.push({ label: "特殊車両使用料", value: formatYen(specialVehicleFee) });
    }
    lines.push(
      { label: "その他料金小計", value: formatYen(pickupFee + specialVehicleFee) },
      { label: "介助・機材料金", value: formatYen(assistanceFee + stairFee + wheelchairFee) },
      { label: "待機・付き添い料金", value: formatYen(waitingEscortFee) },
      { label: "サービス料金小計", value: formatYen(serviceTotal) },
      { label: totalLabel, value: formatYen(total) }
    );
  }else{
    lines.push(
      { label: "迎車料金", value: formatYen(pickupFee) },
      { label: "距離運賃", value: formatYen(distanceFare) },
      { label: "時間加算", value: formatYen(timeAdjustment) },
      { label: "介助料金", value: formatYen(assistanceFee + stairFee) },
      { label: "待機・付き添い料金", value: formatYen(waitingEscortFee) },
      { label: totalLabel, value: `${formatYen(total)}～` }
    );
  }

  return lines;
}

export function buildFareCalculationEmailText(options = {}){
  if(!options.quoteSnapshot) return "";
  const lines = buildFareCalculationLines(options);
  const body = lines.map((line) => `${line.label}：${line.value}`);
  return [
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "■ 料金計算情報",
    "",
    body.join("\n"),
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "※表示は予約時点の料金目安です。",
    "実際の料金は介助内容・待機時間・交通状況等により変動する場合があります。"
  ].join("\n");
}

export function parseRoutePlanFromBody(body){
  const raw = body?.routePlan ?? body?.route_plan;
  if(raw && typeof raw === "object") return raw;
  if(typeof raw === "string" && raw.trim()){
    try{ return JSON.parse(raw); }catch{ return null; }
  }
  return null;
}

export function parseQuoteSnapshotObject(body){
  const raw = body?.quoteSnapshot ?? body?.quote_snapshot;
  if(raw && typeof raw === "object") return raw;
  if(typeof raw === "string" && raw.trim()){
    try{ return JSON.parse(raw); }catch{ return null; }
  }
  return null;
}

export function parseEstimateTotalFromBody(body){
  const text = String(body?.estimate || "").replace(/[^\d]/g, "");
  const parsed = Number(text);
  if(parsed > 0) return parsed;
  const snapshot = parseQuoteSnapshotObject(body);
  const fixedTotal = Number(snapshot?.fixedFareTotal) || 0;
  return fixedTotal + sumServiceFeesForTotal(snapshot?.serviceFees, {
    fixedFareBreakdown: snapshot?.fixedFareBreakdown,
  });
}

export function sumServiceFeesForTotal(serviceFees, options = {}){
  const breakdown = options.fixedFareBreakdown || options.breakdown;
  const breakdownKeys = new Set(
    (Array.isArray(breakdown) ? breakdown : []).map((row) => row?.key).filter(Boolean),
  );
  const alwaysExclude = new Set(["pickupFee", "specialVehicleFee"]);
  return (Array.isArray(serviceFees) ? serviceFees : []).reduce((sum, row) => {
    const key = String(row?.key || "");
    if(alwaysExclude.has(key)) return sum;
    if(breakdownKeys.has(key)) return sum;
    return sum + (Number(row?.amount) || 0);
  }, 0);
}

export function buildEstimateFareCalculationEmailSection(body, estimateNo){
  if(!estimateNo) return "";
  const snapshot = parseQuoteSnapshotObject(body);
  if(!snapshot) return "";
  const routePlan = parseRoutePlanFromBody(body);
  return buildFareCalculationEmailText({
    quoteSnapshot: snapshot,
    routePlan: routePlan,
    total: parseEstimateTotalFromBody(body)
  });
}
