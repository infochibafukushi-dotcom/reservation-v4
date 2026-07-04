/**
 * 当日予約（予約可能最短時間）の共通判定。
 * 公開予約表・管理カレンダーの両方から利用する。
 */
(function (global) {
  function pickSetting(settings, keys) {
    if (!settings || typeof settings !== "object") return undefined;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (settings[key] != null && settings[key] !== "") return settings[key];
    }
    return undefined;
  }

  function parseEnabledFlag(value, defaultEnabled) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    if (value == null || value === "") return defaultEnabled;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no") return false;
    return defaultEnabled;
  }

  function parseMinHours(value, defaultHours) {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours < 0) return defaultHours;
    return hours;
  }

  /**
   * API / フォーム由来の設定を正規化する。
   * 保存キー（snake_case）と別名（camelCase）の両方を受け付ける。
   */
  function normalizeSameDaySettings(settings) {
    const enabledRaw = pickSetting(settings, [
      "same_day_enabled",
      "sameDayEnabled",
      "same_day",
      "enabled"
    ]);
    const minHoursRaw = pickSetting(settings, [
      "min_hours",
      "same_day_min_hours",
      "minHours",
      "sameDayMinHours",
      "min_bookable_hours"
    ]);
    const enabled = parseEnabledFlag(enabledRaw, true);
    const minHours = parseMinHours(minHoursRaw, 3);
    return {
      enabled: enabled,
      minHours: minHours,
      same_day_enabled: enabled ? "true" : "false",
      min_hours: String(minHours)
    };
  }

  function isSameDayBookingEnabled(settings) {
    return normalizeSameDaySettings(settings).enabled;
  }

  function getMinBookableHours(settings) {
    return normalizeSameDaySettings(settings).minHours;
  }

  /**
   * 予約可能最短時間ルールにより枠が予約不可か。
   * 手動ブロックや予約由来ブロックは含まない（表示・判定上の自動ブロックのみ）。
   */
  function isSlotBlockedBySameDayRule(date, time, settings, now) {
    const normalized = normalizeSameDaySettings(settings);
    if (!normalized.enabled) return false;
    const slotTime = new Date(`${date}T${time}:00`);
    if (Number.isNaN(slotTime.getTime())) return false;
    const current = now && typeof now.getTime === "function" && !Number.isNaN(now.getTime()) ? now : new Date();
    const limit = new Date(current.getTime() + normalized.minHours * 60 * 60 * 1000);
    return slotTime.getTime() < limit.getTime();
  }

  function isSlotBookableBySameDayRule(date, time, settings, now) {
    return !isSlotBlockedBySameDayRule(date, time, settings, now);
  }

  global.SameDayAvailability = {
    normalizeSameDaySettings: normalizeSameDaySettings,
    isSameDayBookingEnabled: isSameDayBookingEnabled,
    getMinBookableHours: getMinBookableHours,
    isSlotBlockedBySameDayRule: isSlotBlockedBySameDayRule,
    isSlotBookableBySameDayRule: isSlotBookableBySameDayRule
  };
})(typeof window !== "undefined" ? window : globalThis);
