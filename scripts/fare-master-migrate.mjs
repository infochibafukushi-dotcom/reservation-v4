/**
 * 料金マスター dry-run migration / seed
 * Run: node scripts/fare-master-migrate.mjs [--dry-run] [--execute]
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildHeadquartersV1Record } from "../shared/fare-master-v1.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--execute");

function loadEstimateConfig(){
  return JSON.parse(readFileSync(path.join(root, "data/estimate-config.json"), "utf8"));
}

function buildReport(record){
  const m = record.meterRules;
  const d = record.displayRules?.pricingTable || [];
  return {
    versionId: record.id,
    version: record.version,
    scopeType: record.scopeType,
    status: record.status,
    effectiveFrom: record.effectiveFrom,
    meterWaiting: m.waitingFare?.unitFareYen,
    meterEscort: m.escortFare?.unitFareYen,
    timeMeter: m.timeMeter?.baseAmountYen,
    boardingAssist: m.assistItems?.find(i => i.id === "boardingAssist")?.amount,
    bodyAssist: m.assistItems?.find(i => i.id === "bodyAssist")?.amount,
    pricingTableCount: d.length,
    dryRun,
  };
}

const record = buildHeadquartersV1Record(loadEstimateConfig());
const report = buildReport(record);

console.log("=== Fare Master Migration Report ===");
console.log(JSON.stringify(report, null, 2));

if(dryRun){
  console.log("\nDry-run mode. Use --execute to apply (requires D1 binding / admin seed API).");
  console.log("Production D1 write is NOT performed by this script in dry-run.");
} else {
  console.log("\nTo seed production D1, call POST /api/admin/fare-master/seed after deploy.");
}

process.exit(0);
