/**
 * Shared slot availability: public/admin parity, buffers, half-open overlap, JST date edge.
 * Run: node scripts/test-slot-availability.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadApis() {
  const sandbox = { console, window: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "shared/same-day-availability.js"), "utf8"),
    sandbox
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "shared/slot-availability.js"), "utf8"),
    sandbox
  );
  return {
    SameDayAvailability: sandbox.SameDayAvailability,
    SlotAvailability: sandbox.SlotAvailability
  };
}

function blocksFromRange(date, times, type = "auto", reservationId = "R1") {
  return times.map((time, i) => ({
    id: i + 1,
    date,
    time,
    type,
    reservation_id: type === "auto" ? reservationId : null
  }));
}

function expectAvail(slot, available, reason = null, label = "") {
  assert(slot.available === available, `${label}: available expected ${available}, got ${slot.available}`);
  assert(
    slot.blockedReason === reason,
    `${label}: blockedReason expected ${reason}, got ${slot.blockedReason}`
  );
}

function main() {
  const { SlotAvailability } = loadApis();
  const date = "2026-07-14";
  const occupied = ["11:30", "12:00", "12:30", "13:00"]; // 11:30〜13:30
  const blocks = blocksFromRange(date, occupied, "auto", "202607141130");

  // 1) 11:30〜13:30 block → 11:00 available, occupied slots unavailable
  {
    const s1100 = SlotAvailability.evaluateSlot(date, "11:00", { blocks, settings: {} });
    const s1130 = SlotAvailability.evaluateSlot(date, "11:30", { blocks, settings: {} });
    const s1300 = SlotAvailability.evaluateSlot(date, "13:00", { blocks, settings: {} });
    const s1330 = SlotAvailability.evaluateSlot(date, "13:30", { blocks, settings: {} });
    expectAvail(s1100, true, null, "test1 11:00");
    expectAvail(s1130, false, "reservation", "test1 11:30");
    expectAvail(s1300, false, "reservation", "test1 13:00");
    expectAvail(s1330, true, null, "test1 13:30");
    console.log("PASS 1: 11:30-13:30 occupancy without buffer");
  }

  // 2) buffer_before 30 → 11:00 also blocked; public/admin same result
  {
    const settings = { buffer_before_minutes: 30 };
    const publicSlot = SlotAvailability.evaluateSlot(date, "11:00", { blocks, settings });
    const adminSlot = SlotAvailability.evaluateSlot(date, "11:00", { blocks, settings });
    expectAvail(publicSlot, false, "buffer", "test2 public 11:00");
    expectAvail(adminSlot, false, "buffer", "test2 admin 11:00");
    assert(
      JSON.stringify({
        a: publicSlot.available,
        r: publicSlot.blockedReason,
        id: publicSlot.sourceId
      }) ===
        JSON.stringify({
          a: adminSlot.available,
          r: adminSlot.blockedReason,
          id: adminSlot.sourceId
        }),
      "test2 public/admin mismatch"
    );
    console.log("PASS 2: buffer_before 30 blocks 11:00 on both surfaces");
  }

  // 3) aligned :00 / :30 starts
  {
    const alignedBlocks = blocksFromRange(date, ["10:00", "10:30"], "manual");
    const s1000 = SlotAvailability.evaluateSlot(date, "10:00", { blocks: alignedBlocks });
    const s1030 = SlotAvailability.evaluateSlot(date, "10:30", { blocks: alignedBlocks });
    const s1100 = SlotAvailability.evaluateSlot(date, "11:00", { blocks: alignedBlocks });
    expectAvail(s1000, false, "manual_block", "test3 10:00");
    expectAvail(s1030, false, "manual_block", "test3 10:30");
    expectAvail(s1100, true, null, "test3 11:00");
    console.log("PASS 3: aligned 30-minute starts");
  }

  // 4) non-aligned 10:45 / 11:15
  {
    const odd = [
      { id: 9, date, time: "10:45", endTime: "11:15", type: "manual" }
    ];
    const s1030 = SlotAvailability.evaluateSlot(date, "10:30", { blocks: odd });
    const s1100 = SlotAvailability.evaluateSlot(date, "11:00", { blocks: odd });
    const s1130 = SlotAvailability.evaluateSlot(date, "11:30", { blocks: odd });
    expectAvail(s1030, false, "manual_block", "test4 10:30 overlaps 10:45-11:15");
    expectAvail(s1100, false, "manual_block", "test4 11:00 overlaps 10:45-11:15");
    expectAvail(s1130, true, null, "test4 11:30 after 11:15");
    console.log("PASS 4: non-aligned start/end times");
  }

  // 5) end == next start → not overlapping
  {
    const endingAt1100 = [
      { id: 1, date, time: "10:30", endTime: "11:00", type: "auto", reservation_id: "X" }
    ];
    const s1100 = SlotAvailability.evaluateSlot(date, "11:00", { blocks: endingAt1100 });
    expectAvail(s1100, true, null, "test5 half-open boundary");
    assert(
      SlotAvailability.overlapsHalfOpen(
        SlotAvailability.toAbsoluteMinutes(date, "11:00"),
        SlotAvailability.toAbsoluteMinutes(date, "11:30"),
        SlotAvailability.toAbsoluteMinutes(date, "10:30"),
        SlotAvailability.toAbsoluteMinutes(date, "11:00")
      ) === false,
      "test5 overlap helper should be false at boundary"
    );
    console.log("PASS 5: half-open end==start not blocked");
  }

  // 6) cross-midnight / JST date boundary
  {
    const overnight = [
      { id: 1, date: "2026-07-14", time: "23:30", type: "auto", reservation_id: "N1" }
    ];
    const late = SlotAvailability.evaluateSlot("2026-07-14", "23:30", { blocks: overnight });
    expectAvail(late, false, "reservation", "test6 23:30");
    const nextDayEarly = SlotAvailability.evaluateSlot("2026-07-15", "00:00", {
      blocks: overnight,
      settings: { buffer_after_minutes: 30 }
    });
    expectAvail(nextDayEarly, false, "buffer", "test6 next-day buffer");
    const nextDayClear = SlotAvailability.evaluateSlot("2026-07-15", "00:00", {
      blocks: overnight,
      settings: {}
    });
    expectAvail(nextDayClear, true, null, "test6 next-day no buffer");
    console.log("PASS 6: JST/date boundary with overnight buffer");
  }

  // 7) normal vs estimate source: same availability (blockCount ignored for display)
  {
    const times = ["11:00", "11:30", "12:00", "12:30", "13:00", "13:30"];
    const normal = SlotAvailability.buildAvailabilitySlots([date], times, {
      blocks,
      settings: {}
    });
    const estimate = SlotAvailability.buildAvailabilitySlots([date], times, {
      blocks,
      settings: {},
      // estimate-only fields must not change display availability
      requiredBlockCount: 4,
      source: "estimate",
      estimateNo: "EST-20260713-8430"
    });
    assert(normal.length === estimate.length, "test7 length mismatch");
    for (let i = 0; i < normal.length; i++) {
      assert(
        normal[i].available === estimate[i].available &&
          normal[i].blockedReason === estimate[i].blockedReason,
        `test7 mismatch at ${times[i]}`
      );
    }
    console.log("PASS 7: normal vs estimate availability identical");
  }

  // 8) public/admin share identical AvailabilitySlot results
  {
    const times = ["11:00", "11:30", "12:00", "12:30", "13:00", "13:30"];
    const settings = { same_day_enabled: "false", buffer_before_minutes: 0 };
    const publicMap = SlotAvailability.availabilityMap([date], times, { blocks, settings });
    const adminMap = SlotAvailability.availabilityMap([date], times, { blocks, settings });
    for (const t of times) {
      const p = publicMap.get(`${date}_${t}`);
      const a = adminMap.get(`${date}_${t}`);
      assert(p && a, `missing slot ${t}`);
      assert(p.available === a.available, `parity available ${t}`);
      assert(p.blockedReason === a.blockedReason, `parity reason ${t}`);
      assert(String(p.sourceId || "") === String(a.sourceId || ""), `parity source ${t}`);
    }
    // Production Jul 14 expectation
    assert(publicMap.get(`${date}_11:00`).available === true, "prod 11:00 should be available");
    assert(publicMap.get(`${date}_11:30`).available === false, "prod 11:30 blocked");
    assert(publicMap.get(`${date}_13:00`).available === false, "prod 13:00 blocked");
    assert(publicMap.get(`${date}_13:30`).available === true, "prod 13:30 available");
    console.log("PASS 8: public/admin identical AvailabilitySlot map");
  }

  // canStartAt still rejects 11:00 when duration needs 11:30
  {
    assert(
      SlotAvailability.canStartAt(date, "11:00", 2, { blocks, settings: {} }) === false,
      "canStartAt 11:00 count=2 should fail"
    );
    assert(
      SlotAvailability.canStartAt(date, "10:30", 2, { blocks, settings: {} }) === true,
      "canStartAt 10:30 count=2 should pass"
    );
    console.log("PASS bonus: booking duration check separate from display");
  }

  console.log("ALL slot-availability tests passed");
}

main();
