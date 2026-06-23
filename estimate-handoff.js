const HANDOFF_STORAGE_KEY = "lp_estimate_handoff";
let estimateBookingState = { active: false, estimateNo: "", handoff: null, degraded: false, degradedReason: "" };

function parseEstimateBookingParams(search) {
  const params = new URLSearchParams(search || (typeof location !== "undefined" ? location.search : ""));
  return {
    source: String(params.get("source") || "").trim(),
    estimateNo: String(params.get("estimateNo") || params.get("estimateNumber") || "").trim()
  };
}

function getHandoffRecord() {
  try {
    const raw = sessionStorage.getItem(HANDOFF_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isEstimateBookingMode(params, handoff) {
  if (!params || params.source !== "estimate") return false;
  const estimateNo = String(params.estimateNo || "").trim();
  if (!estimateNo || !estimateNo.startsWith("EST-")) return false;
  if (!handoff || typeof handoff !== "object") return false;
  return String(handoff.estimateNumber || "").trim() === estimateNo;
}

function initEstimateBookingMode() {
  const params = parseEstimateBookingParams();
  const handoff = getHandoffRecord();
  if (isEstimateBookingMode(params, handoff)) {
    estimateBookingState = { active: true, estimateNo: params.estimateNo, handoff, degraded: false, degradedReason: "" };
  } else if (params.source === "estimate" || params.estimateNo) {
    estimateBookingState = {
      active: false,
      estimateNo: params.estimateNo || "",
      handoff: null,
      degraded: true,
      degradedReason: "見積内容を読み込めませんでした。通常の予約フォームをご利用ください。"
    };
  } else {
    estimateBookingState = { active: false, estimateNo: "", handoff: null, degraded: false, degradedReason: "" };
  }
  return estimateBookingState;
}

function getEstimateBookingState() {
  return estimateBookingState;
}

window.EstimateBookingHandoff = {
  HANDOFF_STORAGE_KEY,
  parseEstimateBookingParams,
  getHandoffRecord,
  isEstimateBookingMode,
  initEstimateBookingMode,
  getEstimateBookingState
};
