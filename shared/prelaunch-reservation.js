export const PRELAUNCH_SETTING_KEYS = [
  "reservation_public_start_at",
  "reservation_prelaunch_mode_enabled",
  "test_reservation_enabled",
  "prelaunch_test_key",
  "force_public_reservation_enabled",
  "force_public_reservation_disabled",
];

export const DEFAULT_PRELAUNCH_SETTINGS = {
  reservation_public_start_at: "2027-04-01T00:00:00+09:00",
  reservation_prelaunch_mode_enabled: "true",
  test_reservation_enabled: "true",
  prelaunch_test_key: "chiba-test",
  force_public_reservation_enabled: "false",
  force_public_reservation_disabled: "false",
};

export function normalizePrelaunchSettings(raw = {}) {
  const out = { ...DEFAULT_PRELAUNCH_SETTINGS };
  for (const key of PRELAUNCH_SETTING_KEYS) {
    if (raw[key] != null && String(raw[key]).trim() !== "") {
      out[key] = String(raw[key]).trim();
    }
  }
  return out;
}

export function isTruthySetting(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function canCreatePublicReservation(settings, now = new Date()) {
  const s = normalizePrelaunchSettings(settings);
  if (isTruthySetting(s.force_public_reservation_disabled)) return false;
  if (isTruthySetting(s.force_public_reservation_enabled)) return true;
  const startMs = Date.parse(String(s.reservation_public_start_at || "").trim());
  if (!Number.isNaN(startMs) && now.getTime() >= startMs) return true;
  return false;
}

export function isTestReservationRow(row) {
  return Number(row?.is_test) === 1 || row?.is_test === true || String(row?.is_test || "").toLowerCase() === "true";
}

export function isValidTestModeRequest(body, settings) {
  const s = normalizePrelaunchSettings(settings);
  if (!isTruthySetting(s.test_reservation_enabled)) return false;
  const testFlag =
    String(body?._testMode ?? body?.testMode ?? "").trim() === "1" || body?.isTestMode === true;
  const key = String(body?._testKey ?? body?.testKey ?? "").trim();
  const expected = String(s.prelaunch_test_key || "").trim();
  return testFlag && key && expected && key === expected;
}

export function getPublicReservationStatus(settings, now = new Date()) {
  const s = normalizePrelaunchSettings(settings);
  if (isTruthySetting(s.force_public_reservation_disabled)) {
    return {
      state: "manual_disabled",
      label: "手動停止中",
      canCreatePublic: false,
      reservationPublicStartAt: s.reservation_public_start_at,
    };
  }
  if (isTruthySetting(s.force_public_reservation_enabled)) {
    return {
      state: "manual_enabled",
      label: "手動受付中",
      canCreatePublic: true,
      reservationPublicStartAt: s.reservation_public_start_at,
    };
  }
  const canCreate = canCreatePublicReservation(s, now);
  if (canCreate) {
    return {
      state: "open",
      label: "本予約受付中",
      canCreatePublic: true,
      reservationPublicStartAt: s.reservation_public_start_at,
    };
  }
  return {
    state: "closed",
    label: "本予約受付停止中",
    canCreatePublic: false,
    reservationPublicStartAt: s.reservation_public_start_at,
  };
}

export function formatPrelaunchStartAtForDisplay(iso) {
  const text = String(iso || "").trim();
  if (!text) return "未設定";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.replace("T", " ").slice(0, 16);
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function parseTestModeFromUrl(search = "") {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return {
    active: params.get("test") === "1",
    key: String(params.get("key") || "").trim(),
  };
}

export function isBrowserTestModeActive(settings, search = "") {
  const parsed = parseTestModeFromUrl(search);
  const s = normalizePrelaunchSettings(settings);
  return (
    parsed.active &&
    isTruthySetting(s.test_reservation_enabled) &&
    parsed.key &&
    parsed.key === String(s.prelaunch_test_key || "").trim()
  );
}

/** Test mode bypasses prelaunch calendar/booking blocks on the public site. */
export function shouldHidePublicCalendar(settings, search = "") {
  if (isBrowserTestModeActive(settings, search)) return false;
  return !canCreatePublicReservation(settings);
}

const prelaunchApi = {
  PRELAUNCH_SETTING_KEYS,
  DEFAULT_PRELAUNCH_SETTINGS,
  normalizePrelaunchSettings,
  isTruthySetting,
  canCreatePublicReservation,
  isTestReservationRow,
  isValidTestModeRequest,
  getPublicReservationStatus,
  formatPrelaunchStartAtForDisplay,
  parseTestModeFromUrl,
  isBrowserTestModeActive,
  shouldHidePublicCalendar,
};

if (typeof globalThis !== "undefined") {
  globalThis.PrelaunchReservation = prelaunchApi;
}
