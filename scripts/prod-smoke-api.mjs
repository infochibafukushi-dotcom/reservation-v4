/**
 * 本番 API スモークテスト（デプロイ後）
 * Run: node scripts/prod-smoke-api.mjs
 * Fare checks are read-only GET. Reservation tests may write data.
 */
const API = process.env.API_BASE || "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";
const LP_ORIGIN = "https://infochibafukushi-dotcom.github.io";
const HALF_HOUR_SLOTS_PER_DAY = 24;
const FIRST_SLOT_HOUR = 6;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatUtcDate(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function addUtcDaysFrom2099(dayOffset) {
  return formatUtcDate(2099, 0, 1 + dayOffset);
}

function formatHalfHourSlot(slotIndex, startHour = FIRST_SLOT_HOUR) {
  const hour = Math.floor(slotIndex / 2) + startHour;
  const minute = (slotIndex % 2) * 30;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function resolveSlotOnDay(baseDayOffset, slotIndex) {
  const dayShift = Math.floor(slotIndex / HALF_HOUR_SLOTS_PER_DAY);
  const slotOnDay = ((slotIndex % HALF_HOUR_SLOTS_PER_DAY) + HALF_HOUR_SLOTS_PER_DAY) % HALF_HOUR_SLOTS_PER_DAY;
  return {
    date: addUtcDaysFrom2099(baseDayOffset + dayShift),
    time: formatHalfHourSlot(slotOnDay),
  };
}

function buildSmokeSchedule(smokeTs) {
  const unique = Math.floor(smokeTs / 1000);
  const dayOffset = unique % 360;
  const legacySlot = unique % HALF_HOUR_SLOTS_PER_DAY;
  const fixedSlot = legacySlot + 8;
  const dupSlot = fixedSlot + 2;

  const legacy = resolveSlotOnDay(dayOffset, legacySlot);
  const fixed = resolveSlotOnDay(dayOffset, fixedSlot);
  const dup = resolveSlotOnDay(dayOffset, dupSlot);

  return {
    legacyDate: legacy.date,
    legacyTime: legacy.time,
    fixedDate: fixed.date,
    fixedTime: fixed.time,
    dupDate: dup.date,
    dupTime: dup.time,
  };
}

async function jsonFetch(path, options = {}) {
  const res = await fetch(API + path, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, text };
}

async function main() {
  const results = [];
  const record = (id, pass, detail) => {
    results.push({ id, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
  };

  const smokeTs = Date.now();
  const schedule = buildSmokeSchedule(smokeTs);
  const unique = Math.floor(smokeTs / 1000);

  console.log(
    `smoke schedule: legacy=${schedule.legacyDate} ${schedule.legacyTime}, fixed=${schedule.fixedDate} ${schedule.fixedTime}, dup=${schedule.dupDate} ${schedule.dupTime}`,
  );

  console.log(
    `smoke schedule: legacy=${schedule.legacyDate} ${schedule.legacyTime}, fixed=${schedule.fixedDate} ${schedule.fixedTime}, dup=${schedule.dupDate} ${schedule.dupTime}`,
  );

  // --- Fare master read-only checks ---
  const fareActive = await jsonFetch("/api/fare-master/active");
  record("FARE-ACTIVE", fareActive.status === 200 && fareActive.data?.success === true, `status=${fareActive.status} id=${fareActive.data?.fareMasterId || "-"}`);
  const dp = fareActive.data?.estimateConfig?.distancePricing?.patternA || {};
  record("FARE-initial-520", dp.initialFare === 520, `initialFare=${dp.initialFare}`);
  record("FARE-waiting-800", fareActive.data?.meterSettings?.waitingFare?.unitFareYen === 800, `waiting=${fareActive.data?.meterSettings?.waitingFare?.unitFareYen}`);
  record("FARE-escort-1600", fareActive.data?.meterSettings?.escortFare?.unitFareYen === 1600, `escort=${fareActive.data?.meterSettings?.escortFare?.unitFareYen}`);
  const stair3 = fareActive.data?.meterSettings?.assistItems?.find(i => i.id === "stairsAssist")?.floorOptions?.find(f => f.id === "stair-floor3")?.amount;
  record("FARE-stair3-5000", stair3 === 5000, `stair3=${stair3}`);
  record("FARE-time-4180", fareActive.data?.meterSettings?.timeMeter?.baseAmountYen === 4180, `time=${fareActive.data?.meterSettings?.timeMeter?.baseAmountYen}`);
  record("FARE-source", fareActive.data?.fareSource === "active_master" || fareActive.data?.fareSource === "system_fallback", `source=${fareActive.data?.fareSource}`);
  record("FARE-version-id", !!fareActive.data?.fareVersionId && !!fareActive.data?.fareMasterId, `versionId=${fareActive.data?.fareVersionId}`);

  const fareDisplay = await jsonFetch("/api/fare-master/display");
  record("FARE-DISPLAY", fareDisplay.status === 200 && fareDisplay.data?.success === true, `rows=${fareDisplay.data?.pricingTable?.length || 0}`);
  record("FARE-faq-520", fareDisplay.data?.faqAmounts?.initialFare === 520, `faq.initialFare=${fareDisplay.data?.faqAmounts?.initialFare}`);

  const driverToken = String(process.env.METER_DRIVER_TOKEN || "").trim();
  if (driverToken) {
    const driverFare = await jsonFetch("/api/driver/fare-master/active", {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    record("FARE-DRIVER", driverFare.status === 200 && driverFare.data?.success === true, `id=${driverFare.data?.fareMasterId || "-"}`);
  } else {
    record("FARE-DRIVER", true, "skipped (METER_DRIVER_TOKEN unset)");
  }

  const boot = await jsonFetch("/api/bootstrap");
  const fixedFare = String(boot.data?.settings?.fixed_fare_enabled || "");
  record("BOOT", boot.status === 200, `fixed_fare_enabled=${fixedFare} fareMaster=${boot.data?.fareMaster?.id || "-"}`);

  const legacy = await jsonFetch("/api/createReservation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usageType: "初めて",
      name: "スモークタロウ",
      phone: `0909999${String(smokeTs).slice(-4)}`,
      email: `smoke-test-${smokeTs}@example.com`,
      date: schedule.legacyDate,
      time: schedule.legacyTime,
      pickup: "千葉駅",
      destination: "東京駅",
      vehicle: "車いす",
      estimate: "5,000円～",
    }),
  });
  record(
    "LEGACY-RESERVATION",
    legacy.status === 200 && legacy.data?.success,
    `status=${legacy.status} id=${legacy.data?.id || ""} slot=${schedule.legacyDate} ${schedule.legacyTime}`,
  );

  const estimateNo = `EST-PROD-SMOKE-${unique}`;
  const snapshot = {
    fixedFareTotal: 10000,
    serviceFees: [{ key: "assistanceFee", label: "介助料金", amount: 2000 }],
    fareMode: "distance",
    selectedRouteId: "route_0",
    selectedUsesToll: true,
    distanceMeters: 12000,
    durationSeconds: 1500,
    preFixedFareConfirmable: true,
  };
  const reg = await jsonFetch("/api/quotes/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: LP_ORIGIN },
    body: JSON.stringify({
      estimateNo,
      total: 12000,
      fareType: "fixed",
      quoteSnapshot: snapshot,
      handoffSource: "lp-site-estimate",
      dtoVersion: 2,
    }),
  });
  const snapshotHash = reg.data?.snapshotHash || "";
  record(
    "QUOTE-REGISTER",
    reg.status === 200 && reg.data?.success && snapshotHash,
    `estimateNo=${estimateNo} hash=${snapshotHash.slice(0, 16)}... expiresAt=${reg.data?.expiresAt || ""}`,
  );

  let fixedReservationId = "";
  let driverDate = schedule.legacyDate;

  if (fixedFare === "true" && snapshotHash) {
    const consentText = `見積番号 ${estimateNo} の確定運賃 12,000円 および上記見積内容に同意して予約する`;
    const fixed = await jsonFetch("/api/createReservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usageType: "初めて",
        name: "スモークジロウ",
        phone: `0908888${String(smokeTs).slice(-4)}`,
        email: `smoke-fixed-${smokeTs}@example.com`,
        date: schedule.fixedDate,
        time: schedule.fixedTime,
        pickup: "千葉駅",
        destination: "東京駅",
        vehicle: "車いす",
        estimate: "12,000円",
        estimateNo,
        estimateConsent: {
          estimateNo,
          quotedFare: 12000,
          consentText,
          consentTextVersion: "2026-06-01-v1",
          snapshotHash,
        },
      }),
    });
    const fixedOk = fixed.status === 200 && fixed.data?.success;
    record(
      "FIXED-RESERVATION",
      fixedOk,
      `status=${fixed.status} id=${fixed.data?.id || ""} confirmedFare=${fixed.data?.confirmedFare || ""} slot=${schedule.fixedDate} ${schedule.fixedTime}`,
    );
    fixedReservationId = fixedOk ? String(fixed.data?.id || "") : "";
    driverDate = schedule.fixedDate;

    if (fixedReservationId) {
      const dup = await jsonFetch("/api/createReservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usageType: "初めて",
          name: "スモークサブロウ",
          phone: `0907777${String(smokeTs).slice(-4)}`,
          email: `smoke-dup-${smokeTs}@example.com`,
          date: schedule.dupDate,
          time: schedule.dupTime,
          pickup: "千葉駅",
          destination: "東京駅",
          vehicle: "車いす",
          estimateNo,
          estimateConsent: {
            estimateNo,
            quotedFare: 12000,
            consentText,
            consentTextVersion: "2026-06-01-v1",
            snapshotHash,
          },
        }),
      });
      record(
        "DUPLICATE-410",
        dup.status === 410,
        `status=${dup.status} slot=${schedule.dupDate} ${schedule.dupTime}`,
      );
    } else {
      record("DUPLICATE-410", true, "skipped (fixed reservation not created)");
    }

    console.log("\n--- report ids ---");
    console.log("estimateNo:", estimateNo);
    console.log("reservationId:", fixedReservationId);
    console.log("snapshotHash:", snapshotHash);
  } else {
    record("FIXED-RESERVATION", true, "skipped (fixed_fare_enabled!=true)");
    record("DUPLICATE-410", true, "skipped");
  }

  const driverTokenForList = String(process.env.METER_DRIVER_TOKEN || "").trim();
  if (driverTokenForList) {
    const driverHeaders = { Authorization: `Bearer ${driverTokenForList}` };
    const driverList = await jsonFetch(
      `/api/driver/reservations?date=${encodeURIComponent(driverDate)}`,
      { headers: driverHeaders },
    );
    record(
      "DRIVER-LIST",
      driverList.status === 200 && driverList.data?.success,
      `status=${driverList.status} count=${driverList.data?.reservations?.length ?? "?"} date=${driverDate}`,
    );

    if (fixedReservationId) {
      const driverDetail = await jsonFetch(
        `/api/driver/reservations/${encodeURIComponent(fixedReservationId)}`,
        { headers: driverHeaders },
      );
      const integrity = driverDetail.data?.reservation?.integrity;
      const detailPass =
        driverDetail.status === 200 &&
        driverDetail.data?.success &&
        integrity?.snapshotHashVerified === true;
      record(
        "DRIVER-DETAIL",
        detailPass,
        `status=${driverDetail.status} verified=${integrity?.snapshotHashVerified} fareMatch=${integrity?.confirmedFareMatchesSnapshot} id=${fixedReservationId}`,
      );
    } else {
      record("DRIVER-DETAIL", false, "skipped (no fixed reservation id)");
    }

    const driverUnauthorized = await jsonFetch(
      `/api/driver/reservations?date=${encodeURIComponent(schedule.legacyDate)}`,
    );
    record("DRIVER-UNAUTHORIZED", driverUnauthorized.status === 401, `status=${driverUnauthorized.status}`);
  } else {
    record("DRIVER-LIST", true, "skipped (METER_DRIVER_TOKEN unset)");
    record("DRIVER-DETAIL", true, "skipped (METER_DRIVER_TOKEN unset)");
    record("DRIVER-UNAUTHORIZED", true, "skipped (METER_DRIVER_TOKEN unset)");
  }

  const failed = results.filter((r) => !r.pass);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
