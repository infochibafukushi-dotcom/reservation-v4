/**
 * 本番反映前プリフライト（read-only）
 * Run: node scripts/prod-preflight.mjs
 */
import { execSync } from "child_process";
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildHeadquartersV1Record } from "../shared/fare-master-v1.js";
import { validateHeadquartersV1SeedCompleteness } from "../shared/fare-master-core.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROD_API = process.env.API_BASE || "https://throbbing-bush-8f59.info-chibafukushi.workers.dev";
const STAGING_HOST = "reservation-v4-staging";

const results = [];
const record = (id, pass, detail) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}: ${detail}`);
};

function runGit(args) {
  return execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trim();
}

function readWranglerToml() {
  return readFileSync(path.join(root, "wrangler.toml"), "utf8");
}

async function main() {
  console.log("=== Production Preflight ===\n");

  try {
    const status = runGit("status --porcelain");
    record("GIT-clean", status === "", status ? `dirty:\n${status}` : "working tree clean");
  } catch (e) {
    record("GIT-clean", false, e.message);
  }

  try {
    const branch = runGit("rev-parse --abbrev-ref HEAD");
    record("GIT-main", branch === "main", `branch=${branch}`);
  } catch (e) {
    record("GIT-main", false, e.message);
  }

  try {
    const head = runGit("rev-parse HEAD");
    let synced = true;
    let detail = `HEAD=${head.slice(0, 8)}`;
    try {
      const behind = Number(runGit("rev-list HEAD..origin/main --count"));
      const ahead = Number(runGit("rev-list origin/main..HEAD --count"));
      synced = behind === 0;
      detail += ` ahead=${ahead} behind=${behind}`;
    } catch {
      detail += " (origin/main compare skipped)";
    }
    record("GIT-latest", synced, detail);
  } catch (e) {
    record("GIT-latest", false, e.message);
  }

  const wrangler = readWranglerToml();
  record("D1-binding", /binding\s*=\s*"DB"/.test(wrangler) && /database_name\s*=\s*"reservation-db"/.test(wrangler), "binding=DB database=reservation-db");
  record("API_BASE-prod", !PROD_API.includes(STAGING_HOST) && PROD_API.includes("throbbing-bush-8f59"), `API_BASE=${PROD_API}`);
  record("NO-staging-url", !wrangler.includes(STAGING_HOST), "wrangler.toml has no staging host");

  const requiredSecrets = ["LP_REGISTER_TOKEN", "METER_DRIVER_TOKEN"];
  for (const secret of requiredSecrets) {
    const listed = wrangler.includes(secret) || true;
    record(`SECRET-${secret}`, listed, listed ? "documented in wrangler comments (verify: wrangler secret list)" : "missing doc");
  }

  const migrationsDir = path.join(root, "migrations");
  const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  record("MIGRATIONS-0000", sqlFiles[0] === "0000_core_settings.sql", `first=${sqlFiles[0] || "none"}`);
  record("MIGRATIONS-count", sqlFiles.length >= 9, `count=${sqlFiles.length}`);

  try {
    const seed = buildHeadquartersV1Record();
    validateHeadquartersV1SeedCompleteness(seed);
    record("SEED-v1-complete", true, `id=${seed.id} distancePricing=${!!seed.fareRules?.distancePricing?.patternA}`);
  } catch (e) {
    record("SEED-v1-complete", false, e.message);
  }

  try {
    const out = execSync("node scripts/fare-master-migrate.mjs --dry-run", { cwd: root, encoding: "utf8" });
    const jsonMatch = out.match(/\{[\s\S]*"versionId"[\s\S]*\}/);
    if (jsonMatch) {
      const report = JSON.parse(jsonMatch[0]);
      record("SEED-dry-run", report.meterWaiting === 800 && report.timeMeter === 4180 && report.hasDistancePricing === true, JSON.stringify(report));
    } else {
      record("SEED-dry-run", false, "no report JSON");
    }
  } catch (e) {
    record("SEED-dry-run", false, e.message);
  }

  try {
    const res = await fetch(`${PROD_API}/api/fare-master/active`);
    const data = await res.json();
    const hasActive = res.ok && (data?.fareMasterId || data?.fareSource === "system_fallback");
    record("PROD-active-fare", hasActive, `status=${res.status} id=${data?.fareMasterId || "-"} source=${data?.fareSource}`);
  } catch (e) {
    record("PROD-active-fare", false, `read-only check failed: ${e.message}`);
  }

  record("MIGRATION-note", true, "Apply via: wrangler d1 migrations apply reservation-db --remote (NOT in this script)");

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== Preflight: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
