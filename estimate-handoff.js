const HANDOFF_STORAGE_KEY = "lp_estimate_handoff";
let estimateBookingState = {
  active: false,
  estimateNo: "",
  handoff: null,
  degraded: false,
  degradedReason: "",
  pendingApi: false
};

function parseEstimateBookingParams(search) {
  const params = new URLSearchParams(search || (typeof location !== "undefined" ? location.search : ""));
  return {
    source: String(params.get("source") || "").trim(),
    estimateNo: String(params.get("estimateNo") || params.get("estimateNumber") || "").trim()
  };
}

function isValidEstimateNo(no) {
  return /^EST-/.test(String(no || "").trim());
}

function getHandoffRecord() {
  try {
    const raw = sessionStorage.getItem(HANDOFF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveHandoffRecord(record) {
  try {
    if (!record || typeof record !== "object") return;
    sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* optional cache only */
  }
}

function matchingCachedHandoff(estimateNo) {
  const handoff = getHandoffRecord();
  if (!handoff || typeof handoff !== "object") return null;
  if (String(handoff.estimateNumber || "").trim() !== String(estimateNo || "").trim()) return null;
  return handoff;
}

function isEstimateBookingMode(params, handoff) {
  if (!params) return false;
  const estimateNo = String(params.estimateNo || "").trim();
  if (!isValidEstimateNo(estimateNo)) return false;
  // URL estimateNo is enough for estimate mode (cross-origin safe).
  // source=estimate preferred, but estimateNo alone also activates restore.
  if (params.source === "estimate" || estimateNo) {
    if (!handoff || typeof handoff !== "object") return true;
    const cachedNo = String(handoff.estimateNumber || "").trim();
    return !cachedNo || cachedNo === estimateNo;
  }
  return false;
}

function buildHandoffFromQuoteResponse(data) {
  if (!data || typeof data !== "object") return null;
  const estimateNo = String(data.estimateNo || "").trim();
  if (!isValidEstimateNo(estimateNo)) return null;
  const snapshot = data.quoteSnapshot && typeof data.quoteSnapshot === "object" ? data.quoteSnapshot : {};
  const routePlan = data.routePlan && typeof data.routePlan === "object"
    ? data.routePlan
    : (snapshot.routePlan && typeof snapshot.routePlan === "object" ? snapshot.routePlan : null);
  return {
    estimateNumber: estimateNo,
    createdAt: data.createdAt || null,
    total: Number(data.total) || Number(snapshot.totalAmount) || Number(snapshot.total) || 0,
    distanceKm: snapshot.distanceKm != null ? Number(snapshot.distanceKm) : null,
    usageSummary: Array.isArray(data.usageSummary) ? data.usageSummary : [],
    breakdown: Array.isArray(snapshot.fixedFareBreakdown) ? snapshot.fixedFareBreakdown : [],
    quoteSnapshot: snapshot,
    routePlan: routePlan,
    snapshotHash: data.snapshotHash || null,
    selections: {},
    handoffSource: String(data.handoffSource || "lp-site-estimate").trim() || "lp-site-estimate",
    dtoVersion: Number(data.dtoVersion) || 2,
    quoteExpiresAt: data.expiresAt || null,
    fareMode: data.fareMode || snapshot.fareMode || null,
    selectedRouteId: data.selectedRouteId || snapshot.selectedRouteId || null
  };
}

function setEstimateBookingState(patch) {
  estimateBookingState = { ...estimateBookingState, ...(patch || {}) };
  return estimateBookingState;
}

function markEstimateDegraded(reason, estimateNo) {
  estimateBookingState = {
    active: false,
    estimateNo: String(estimateNo || estimateBookingState.estimateNo || "").trim(),
    handoff: null,
    degraded: true,
    degradedReason: String(reason || "見積内容を読み込めませんでした。通常の予約フォームをご利用ください。").trim(),
    pendingApi: false
  };
  return estimateBookingState;
}

function initEstimateBookingMode() {
  const params = parseEstimateBookingParams();
  const estimateNo = String(params.estimateNo || "").trim();
  const cached = matchingCachedHandoff(estimateNo);

  if (isValidEstimateNo(estimateNo) && (params.source === "estimate" || estimateNo)) {
    // Activate from URL; API restore is source of truth. sessionStorage is optional cache.
    estimateBookingState = {
      active: true,
      estimateNo,
      handoff: cached,
      degraded: false,
      degradedReason: "",
      pendingApi: true
    };
    return estimateBookingState;
  }

  if (params.source === "estimate" || estimateNo) {
    return markEstimateDegraded(
      "見積番号が不正です。通常の予約フォームをご利用ください。",
      estimateNo
    );
  }

  estimateBookingState = {
    active: false,
    estimateNo: "",
    handoff: null,
    degraded: false,
    degradedReason: "",
    pendingApi: false
  };
  return estimateBookingState;
}

function getEstimateBookingState() {
  return estimateBookingState;
}

window.EstimateBookingHandoff = {
  HANDOFF_STORAGE_KEY,
  parseEstimateBookingParams,
  isValidEstimateNo,
  getHandoffRecord,
  saveHandoffRecord,
  matchingCachedHandoff,
  isEstimateBookingMode,
  buildHandoffFromQuoteResponse,
  setEstimateBookingState,
  markEstimateDegraded,
  initEstimateBookingMode,
  getEstimateBookingState
};
