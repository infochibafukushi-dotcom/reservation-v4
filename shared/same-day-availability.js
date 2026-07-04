/**
 * 当日予約（予約可能最短時間）の共通判定。
 * 公開予約表・管理カレンダーの両方から利用する。
 */
(function (global) {
  function isSameDayBookingEnabled(settings) {
    const value = settings && settings.same_day_enabled;
    if (value === false || value === 0) return false;
    const normalized = String(value == null ? "true" : value).trim().toLowerCase();
    if (normalized === "" || normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no") return false;
    return true;
  }

  function getMinBookableHours(settings) {
    const hours = Number(settings && settings.min_hours);
    if (!Number.isFinite(hours) || hours < 0) return 3;
    return hours;
  }

  /**
   * 予約可能最短時間ルールにより枠が予約不可か。
   * 手動ブロックや予約由来ブロックは含まない（表示・判定上の自動ブロックのみ）。
   *
   * @param {string} date YYYY-MM-DD
   * @param {string} time HH:MM
   * @param {{same_day_enabled?: string|boolean, min_hours?: string|number}} settings
   * @param {Date} [now]
   * @returns {boolean}
   */
  function isSlotBlockedBySameDayRule(date, time, settings, now) {
    if (!isSameDayBookingEnabled(settings)) return false;
    const slotTime = new Date(`${date}T${time}:00`);
    if (Number.isNaN(slotTime.getTime())) return false;
    const current = now && typeof now.getTime === "function" && !Number.isNaN(now.getTime()) ? now : new Date();
    const limit = new Date(current.getTime() + getMinBookableHours(settings) * 60 * 60 * 1000);
    return slotTime.getTime() < limit.getTime();
  }

  /** 公開側互換: 予約可能なら true */
  function isSlotBookableBySameDayRule(date, time, settings, now) {
    return !isSlotBlockedBySameDayRule(date, time, settings, now);
  }

  global.SameDayAvailability = {
    isSameDayBookingEnabled: isSameDayBookingEnabled,
    getMinBookableHours: getMinBookableHours,
    isSlotBlockedBySameDayRule: isSlotBlockedBySameDayRule,
    isSlotBookableBySameDayRule: isSlotBookableBySameDayRule
  };
})(typeof window !== "undefined" ? window : globalThis);
