/**
 * 公開カレンダー / 管理カレンダー共通の枠可否判定。
 * 半開区間 [start, end) で重複判定する（終了時刻 = 次枠開始 は非重複）。
 */
(function (global) {
  const SLOT_MINUTES = 30;
  const REASON_PRIORITY = {
    reservation: 40,
    manual_block: 30,
    business_hours: 20,
    buffer: 15,
    closed: 10
  };

  function pad(v) {
    return String(v).padStart(2, "0");
  }

  function parseTimeToMinutes(time) {
    const m = String(time || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 47 || min < 0 || min > 59) {
      return null;
    }
    return h * 60 + min;
  }

  function formatDateParts(y, m, d) {
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  function addDaysToDateString(dateStr, dayOffset) {
    const [y, m, d] = String(dateStr || "").split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + Number(dayOffset || 0));
    return formatDateParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  function minutesToTime(totalMinutes) {
    const mod = ((Number(totalMinutes) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(mod / 60))}:${pad(mod % 60)}`;
  }

  function toAbsoluteMinutes(dateStr, timeStr) {
    const [y, m, d] = String(dateStr || "").split("-").map(Number);
    const mins = parseTimeToMinutes(timeStr);
    if (!y || !m || !d || mins == null) return null;
    return Date.UTC(y, m - 1, d) / 60000 + mins;
  }

  function fromAbsoluteMinutes(abs) {
    const dayMs = Math.floor(abs / 1440) * 86400000;
    const dt = new Date(dayMs);
    const time = minutesToTime(abs);
    return {
      date: formatDateParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()),
      time: time
    };
  }

  function normalizeBufferSettings(settings) {
    const beforeRaw = settings?.buffer_before_minutes ?? settings?.bufferBeforeMinutes ?? 0;
    const afterRaw = settings?.buffer_after_minutes ?? settings?.bufferAfterMinutes ?? 0;
    const before = Number(beforeRaw);
    const after = Number(afterRaw);
    return {
      bufferBeforeMinutes: Number.isFinite(before) && before > 0 ? before : 0,
      bufferAfterMinutes: Number.isFinite(after) && after > 0 ? after : 0
    };
  }

  function blockDurationMinutes(block) {
    if (block?.endTime != null && block?.time != null && block?.date) {
      const startAbs = toAbsoluteMinutes(block.date, block.time);
      const endDate = block.endDate || block.date;
      const endAbs = toAbsoluteMinutes(endDate, block.endTime);
      if (startAbs != null && endAbs != null && endAbs > startAbs) return endAbs - startAbs;
    }
    const duration = Number(block?.durationMinutes);
    if (Number.isFinite(duration) && duration > 0) return duration;
    return SLOT_MINUTES;
  }

  function overlapsHalfOpen(slotStart, slotEnd, blockedStart, blockedEnd) {
    return slotStart < blockedEnd && slotEnd > blockedStart;
  }

  function reasonForBlockType(type) {
    return String(type || "").toLowerCase() === "auto" ? "reservation" : "manual_block";
  }

  function pickBetter(current, candidate) {
    if (!candidate) return current;
    if (!current) return candidate;
    const cp = REASON_PRIORITY[current.blockedReason] || 0;
    const np = REASON_PRIORITY[candidate.blockedReason] || 0;
    if (np > cp) return candidate;
    return current;
  }

  function evaluateAgainstBlock(slotStartAbs, slotEndAbs, block, buffer) {
    const rawStart = toAbsoluteMinutes(block.date, block.time);
    if (rawStart == null) return null;
    const rawEnd = rawStart + blockDurationMinutes(block);
    const expandedStart = rawStart - buffer.bufferBeforeMinutes;
    const expandedEnd = rawEnd + buffer.bufferAfterMinutes;

    if (!overlapsHalfOpen(slotStartAbs, slotEndAbs, expandedStart, expandedEnd)) {
      return {
        hit: false,
        rawStart: rawStart,
        rawEnd: rawEnd,
        expandedStart: expandedStart,
        expandedEnd: expandedEnd
      };
    }

    const direct = overlapsHalfOpen(slotStartAbs, slotEndAbs, rawStart, rawEnd);
    const blockedReason = direct ? reasonForBlockType(block.type) : "buffer";
    return {
      hit: true,
      direct: direct,
      blockedReason: blockedReason,
      sourceId:
        blockedReason === "reservation"
          ? block.reservation_id || block.id || null
          : block.id || block.reservation_id || null,
      rawStart: rawStart,
      rawEnd: rawEnd,
      expandedStart: expandedStart,
      expandedEnd: expandedEnd,
      block: block
    };
  }

  /**
   * @returns {{
   *   date: string,
   *   startTime: string,
   *   endTime: string,
   *   available: boolean,
   *   blockedReason: 'reservation'|'manual_block'|'business_hours'|'buffer'|'closed'|null,
   *   sourceId?: string|null,
   *   debug?: object
   * }}
   */
  function evaluateSlot(date, startTime, options) {
    const opts = options || {};
    const blocks = Array.isArray(opts.blocks) ? opts.blocks : [];
    const settings = opts.settings || {};
    const slotMinutes = Number(opts.slotMinutes) > 0 ? Number(opts.slotMinutes) : SLOT_MINUTES;
    const now = opts.now;
    const buffer = normalizeBufferSettings(settings);
    const startAbs = toAbsoluteMinutes(date, startTime);
    const endParts = startAbs == null ? null : fromAbsoluteMinutes(startAbs + slotMinutes);
    const endTime = endParts ? endParts.time : "";
    const base = {
      date: String(date || ""),
      startTime: String(startTime || ""),
      endTime: endTime,
      available: true,
      blockedReason: null,
      sourceId: null
    };

    if (startAbs == null) {
      return {
        ...base,
        available: false,
        blockedReason: "closed",
        debug: { reasonDetail: "invalid_slot_time" }
      };
    }

    const slotEndAbs = startAbs + slotMinutes;
    let chosen = null;
    const hits = [];

    for (let i = 0; i < blocks.length; i++) {
      const evaluated = evaluateAgainstBlock(startAbs, slotEndAbs, blocks[i], buffer);
      if (!evaluated || !evaluated.hit) continue;
      hits.push(evaluated);
      chosen = pickBetter(chosen, {
        available: false,
        blockedReason: evaluated.blockedReason,
        sourceId: evaluated.sourceId != null ? String(evaluated.sourceId) : null,
        debug: {
          blockedStart: fromAbsoluteMinutes(evaluated.rawStart),
          blockedEnd: fromAbsoluteMinutes(evaluated.rawEnd),
          expandedStart: fromAbsoluteMinutes(evaluated.expandedStart),
          expandedEnd: fromAbsoluteMinutes(evaluated.expandedEnd),
          overlapRule: "slotStart < blockedEnd && slotEnd > blockedStart",
          bufferBeforeMinutes: buffer.bufferBeforeMinutes,
          bufferAfterMinutes: buffer.bufferAfterMinutes
        }
      });
    }

    if (!chosen) {
      const sameDayApi = global.SameDayAvailability;
      if (sameDayApi && typeof sameDayApi.isSlotBlockedBySameDayRule === "function") {
        if (sameDayApi.isSlotBlockedBySameDayRule(date, startTime, settings, now)) {
          chosen = {
            available: false,
            blockedReason: "closed",
            sourceId: null,
            debug: {
              reasonDetail: "same_day_min_hours",
              bufferBeforeMinutes: buffer.bufferBeforeMinutes,
              bufferAfterMinutes: buffer.bufferAfterMinutes
            }
          };
        }
      }
    }

    const result = chosen
      ? {
          ...base,
          available: false,
          blockedReason: chosen.blockedReason,
          sourceId: chosen.sourceId,
          debug: chosen.debug
        }
      : {
          ...base,
          debug: {
            bufferBeforeMinutes: buffer.bufferBeforeMinutes,
            bufferAfterMinutes: buffer.bufferAfterMinutes,
            hitCount: 0
          }
        };

    if (opts.log) {
      console.info("[slot-availability]", {
        date: result.date,
        slotStart: result.startTime,
        slotEnd: result.endTime,
        available: result.available,
        blockedReason: result.blockedReason,
        sourceId: result.sourceId,
        bufferBeforeMinutes: buffer.bufferBeforeMinutes,
        bufferAfterMinutes: buffer.bufferAfterMinutes,
        hits: hits.map((h) => ({
          reason: h.blockedReason,
          sourceId: h.sourceId,
          blockedStart: fromAbsoluteMinutes(h.rawStart),
          blockedEnd: fromAbsoluteMinutes(h.rawEnd)
        }))
      });
    }

    return result;
  }

  function buildAvailabilitySlots(dates, times, options) {
    const out = [];
    const dateList = Array.isArray(dates) ? dates : [];
    const timeList = Array.isArray(times) ? times : [];
    for (let di = 0; di < dateList.length; di++) {
      for (let ti = 0; ti < timeList.length; ti++) {
        out.push(evaluateSlot(dateList[di], timeList[ti], options));
      }
    }
    return out;
  }

  function availabilityMap(dates, times, options) {
    const map = new Map();
    const slots = buildAvailabilitySlots(dates, times, options);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      map.set(`${s.date}_${s.startTime}`, s);
    }
    return map;
  }

  function addMinutesToSlot(date, time, minutes) {
    const abs = toAbsoluteMinutes(date, time);
    if (abs == null) return { date: date, time: time };
    return fromAbsoluteMinutes(abs + Number(minutes || 0));
  }

  /**
   * 予約開始に必要な連続枠がすべて available か（表示判定とは別に予約時に使用）。
   */
  function canStartAt(date, time, blockCount, options) {
    const count = Math.max(1, Number(blockCount) || 1);
    for (let i = 0; i < count; i++) {
      const slot = i === 0 ? { date: date, time: time } : addMinutesToSlot(date, time, i * SLOT_MINUTES);
      const evaluated = evaluateSlot(slot.date, slot.time, options);
      if (!evaluated.available) return false;
    }
    return true;
  }

  function blockedReasonLabel(reason) {
    return (
      {
        reservation: "予約によるブロック",
        manual_block: "手動ブロック",
        buffer: "前後バッファによるブロック",
        business_hours: "営業時間外",
        closed: "予約可能最短時間外"
      }[reason] || "予約不可"
    );
  }

  const api = {
    SLOT_MINUTES: SLOT_MINUTES,
    parseTimeToMinutes: parseTimeToMinutes,
    toAbsoluteMinutes: toAbsoluteMinutes,
    fromAbsoluteMinutes: fromAbsoluteMinutes,
    addMinutesToSlot: addMinutesToSlot,
    addDaysToDateString: addDaysToDateString,
    overlapsHalfOpen: overlapsHalfOpen,
    normalizeBufferSettings: normalizeBufferSettings,
    evaluateSlot: evaluateSlot,
    buildAvailabilitySlots: buildAvailabilitySlots,
    availabilityMap: availabilityMap,
    canStartAt: canStartAt,
    blockedReasonLabel: blockedReasonLabel
  };

  global.SlotAvailability = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
