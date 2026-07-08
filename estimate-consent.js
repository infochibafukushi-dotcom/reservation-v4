(function (global) {

  const FARE_MODE_LABELS = {

    distance: "距離定額",

    time: "時間定額",

    distance_time: "距離時間併用"

  };

  const CONSENT_TEXT_VERSION = "2026-06-01-v1";



  function fareModeLabel(mode) {

    const key = String(mode || "").trim();

    return FARE_MODE_LABELS[key] || key || "データなし";

  }



  function parseEstimateConsent(raw) {

    if (raw == null || raw === "") return null;

    if (typeof raw === "object") return raw;

    try {

      return JSON.parse(String(raw));

    } catch {

      return null;

    }

  }



  function buildEstimateConsent(handoff, estimateNo, options) {

    const opts = options && typeof options === "object" ? options : {};

    const snapshot = handoff?.quoteSnapshot || {};

    const quotedFare = Number(handoff?.total) || Number(snapshot?.total) || 0;

    return {

      schemaVersion: 2,

      estimateNo: String(estimateNo || handoff?.estimateNumber || "").trim(),

      quotedFare: quotedFare,

      fareMode: snapshot.fareMode || null,

      fareVersion: snapshot.fareVersion || null,

      quoteVersion: Number(snapshot.quoteVersion) || 1,

      userAgent: String(global.navigator?.userAgent || ""),

      consentType: "estimate_booking",

      consentText: String(opts.consentText || "").trim(),

      consentTextVersion: String(opts.consentTextVersion || CONSENT_TEXT_VERSION).trim(),

      snapshotHash: String(opts.snapshotHash || handoff?.snapshotHash || "").trim(),

      clientIp: null

    };

  }



  function formatJstDateTime(iso) {

    const text = String(iso || "").trim();

    if (!text) return "データなし";

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) return text;

    return date.toLocaleString("ja-JP", {

      timeZone: "Asia/Tokyo",

      year: "numeric",

      month: "2-digit",

      day: "2-digit",

      hour: "2-digit",

      minute: "2-digit",

      hour12: false

    });

  }



  function shortenUserAgent(ua) {

    const text = String(ua || "").trim();

    if (!text) return "データなし";

    if (text.length <= 80) return text;

    return text.slice(0, 77) + "...";

  }



  function parseYenAmount(text) {

    const match = String(text || "").replace(/[,，]/g, "").match(/(\d+)/);

    return match ? Number(match[1]) : 0;

  }



  global.EstimateConsent = {

    CONSENT_TEXT_VERSION: CONSENT_TEXT_VERSION,

    fareModeLabel: fareModeLabel,

    parseEstimateConsent: parseEstimateConsent,

    buildEstimateConsent: buildEstimateConsent,

    formatJstDateTime: formatJstDateTime,

    shortenUserAgent: shortenUserAgent,

    parseYenAmount: parseYenAmount

  };

})(typeof window !== "undefined" ? window : globalThis);

