/**
 * Light read-only API checks after prod-smoke reservation cleanup.
 * Does NOT create reservations.
 */
const API = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";

async function check(name, fn) {
  try {
    const result = await fn();
    const pass = result.pass;
    console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${result.detail}`);
    return pass;
  } catch (e) {
    console.log(`FAIL ${name}: ${e?.message || e}`);
    return false;
  }
}

async function main() {
  await check("API-BOOT", async () => {
    const res = await fetch(`${API}/api/bootstrap`);
    const data = await res.json();
    const fixed = data?.settings?.fixed_fare_enabled ?? data?.fixed_fare_enabled;
    return {
      pass: res.ok && (fixed === true || fixed === "true"),
      detail: `status=${res.status} fixed_fare_enabled=${fixed}`,
    };
  });

  await check("DRIVER-LIST-UNAUTH", async () => {
    const res = await fetch(`${API}/api/driver/reservations`);
    return {
      pass: res.status === 401,
      detail: `status=${res.status}`,
    };
  });

  for (const id of ["209912231600", "209912240800", "209906021400", "209906041030", "209912281000"]) {
    await check(`DRIVER-DETAIL-${id}`, async () => {
      const res = await fetch(`${API}/api/driver/reservations/${id}`);
      const data = await res.json().catch(() => null);
      return {
        pass: res.status === 401 || res.status === 404,
        detail: `status=${res.status} message=${data?.message || ""}`,
      };
    });
  }

  await check("RANGE-DATA", async () => {
    const res = await fetch(`${API}/api/rangeData?start=2099-12-01&end=2099-12-31`);
    const data = await res.json();
    return {
      pass: res.ok && data?.success === true && Array.isArray(data?.blocks),
      detail: `status=${res.status} blocks=${data?.blocks?.length ?? "?"}`,
    };
  });

  await check("GET-BLOCKS", async () => {
    const res = await fetch(`${API}/api/getBlocks`);
    const data = await res.json();
    return {
      pass: res.ok && data?.success === true,
      detail: `status=${res.status} blocks=${data?.blocks?.length ?? "?"}`,
    };
  });
}

main();
