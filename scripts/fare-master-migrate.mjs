/**
 * 料金マスター dry-run migration / seed 検証
 * Run: node scripts/fare-master-migrate.mjs [--dry-run] [--execute]
 */
import { buildHeadquartersV1Record } from "../shared/fare-master-v1.js";
import { validateHeadquartersV1SeedCompleteness } from "../shared/fare-master-core.js";

const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--execute");

function buildReport(record){
  const m = record.meterRules;
  const d = record.displayRules?.pricingTable || [];
  const dp = record.fareRules?.distancePricing?.patternA || {};
  return {
    versionId: record.id,
    version: record.version,
    scopeType: record.scopeType,
    status: record.status,
    effectiveFrom: record.effectiveFrom,
    initialFare: dp.initialFare,
    initialDistanceKm: dp.initialDistanceKm,
    incrementFare: dp.incrementFare,
    meterWaiting: m.waitingFare?.unitFareYen,
    meterEscort: m.escortFare?.unitFareYen,
    timeMeter: m.timeMeter?.baseAmountYen,
    boardingAssist: m.assistItems?.find(i => i.id === "boardingAssist")?.amount,
    bodyAssist: m.assistItems?.find(i => i.id === "bodyAssist")?.amount,
    stairFloor3: m.assistItems?.find(i => i.id === "stairsAssist")?.floorOptions?.find(f => f.id === "stair-floor3")?.amount,
    faqInitialFare: record.displayRules?.faqAmounts?.initialFare,
    pricingTableCount: d.length,
    hasDistancePricing: !!record.fareRules?.distancePricing?.patternA,
    hasFareComponents: !!record.fareRules?.fareComponents,
    dryRun,
  };
}

const record = buildHeadquartersV1Record();
validateHeadquartersV1SeedCompleteness(record);
const report = buildReport(record);

console.log("=== Fare Master Migration Report ===");
console.log(JSON.stringify(report, null, 2));

if(dryRun){
  console.log("\nDry-run mode. Seed source: shared/fare-master-v1.js (buildHeadquartersV1Record).");
  console.log("Production D1 write is NOT performed by this script in dry-run.");
  console.log("To seed production D1 after deploy: POST /api/admin/fare-master/seed");
} else {
  console.log("\nTo seed production D1, call POST /api/admin/fare-master/seed after deploy.");
}

process.exit(0);
