/**
 * 料金マスター API — D1 操作・Worker ルートハンドラ
 */
import { buildHeadquartersV1Record } from "./shared/fare-master-v1.js";
import baseEstimateConfig from "./data/estimate-config.json" with { type: "json" };
import {
  parseFareMasterRow,
  resolveActiveFareMaster,
  getSystemFallbackFareMaster,
  toEstimateConfig,
  toMeterSettingsPayload,
  buildFareSnapshot,
  fareMasterToMenu,
  fareMasterToBaseFees,
  diffFareMasterRecords,
  buildScopeCandidates,
  safeParseJson,
} from "./shared/fare-master-core.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadBaseEstimateConfigForNode(){
  return JSON.parse(readFileSync(path.join(__dirname, "data/estimate-config.json"), "utf8"));
}

function getBaseEstimateConfig(){
  return baseEstimateConfig;
}

export async function ensureFareMasterSchema(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS fare_master_versions (
    id TEXT PRIMARY KEY, version TEXT NOT NULL, tenant_id TEXT, franchisee_id TEXT, store_id TEXT,
    scope_type TEXT NOT NULL DEFAULT 'headquarters', parent_version_id TEXT, status TEXT NOT NULL DEFAULT 'draft',
    effective_from TEXT NOT NULL, effective_to TEXT, fare_rules TEXT NOT NULL, display_rules TEXT NOT NULL DEFAULT '{}',
    calculation_rules TEXT NOT NULL DEFAULT '{}', meter_rules TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL, created_by TEXT NOT NULL DEFAULT 'system', updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT 'system', published_at TEXT, published_by TEXT, change_reason TEXT NOT NULL DEFAULT ''
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_fmv_scope_status ON fare_master_versions(scope_type, status)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS fare_master_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, version_id TEXT NOT NULL, tenant_id TEXT, franchisee_id TEXT, store_id TEXT,
    changed_by TEXT NOT NULL, changed_at TEXT NOT NULL, effective_from TEXT NOT NULL, change_reason TEXT NOT NULL DEFAULT '',
    before_json TEXT NOT NULL DEFAULT '{}', after_json TEXT NOT NULL DEFAULT '{}', change_type TEXT NOT NULL DEFAULT 'publish', source TEXT NOT NULL DEFAULT 'admin'
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS fare_master_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT, franchisee_id TEXT, store_id TEXT,
    user_id TEXT NOT NULL, permission_key TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at TEXT NOT NULL,
    UNIQUE(user_id, permission_key, franchisee_id, store_id)
  )`).run();
}

export async function seedHeadquartersV1IfEmpty(db, { dryRun = false } = {}){
  const existing = await db.prepare(`SELECT id FROM fare_master_versions WHERE id=? LIMIT 1`).bind("fmv-headquarters-v1").first();
  if(existing){
    return { ok: true, action: "skip", message: "本部標準 v1 は既に存在します" };
  }
  const record = buildHeadquartersV1Record(getBaseEstimateConfig());
  if(dryRun){
    return { ok: true, action: "dry-run", record };
  }
  await insertFareMasterVersion(db, record);
  await insertFareMasterChange(db, {
    versionId: record.id,
    changedBy: "system",
    changeReason: record.changeReason,
    before: {},
    after: record,
    changeType: "seed",
    effectiveFrom: record.effectiveFrom,
  });
  return { ok: true, action: "inserted", versionId: record.id };
}

async function insertFareMasterVersion(db, record){
  await db.prepare(`
    INSERT INTO fare_master_versions (
      id, version, tenant_id, franchisee_id, store_id, scope_type, parent_version_id,
      status, effective_from, effective_to, fare_rules, display_rules, calculation_rules, meter_rules,
      created_at, created_by, updated_at, updated_by, published_at, published_by, change_reason
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    record.id,
    record.version,
    record.tenantId,
    record.franchiseeId,
    record.storeId,
    record.scopeType,
    record.parentVersionId,
    record.status,
    record.effectiveFrom,
    record.effectiveTo,
    JSON.stringify(record.fareRules),
    JSON.stringify(record.displayRules),
    JSON.stringify(record.calculationRules),
    JSON.stringify(record.meterRules),
    record.createdAt,
    record.createdBy,
    record.updatedAt,
    record.updatedBy,
    record.publishedAt,
    record.publishedBy,
    record.changeReason,
  ).run();
}

async function insertFareMasterChange(db, { versionId, changedBy, changeReason, before, after, changeType, effectiveFrom, franchiseeId, storeId }){
  await db.prepare(`
    INSERT INTO fare_master_changes (version_id, franchisee_id, store_id, changed_by, changed_at, effective_from, change_reason, before_json, after_json, change_type, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    versionId,
    franchiseeId || null,
    storeId || null,
    changedBy,
    new Date().toISOString(),
    effectiveFrom,
    changeReason || "",
    JSON.stringify(before || {}),
    JSON.stringify(after || {}),
    changeType || "publish",
    "admin",
  ).run();
}

export async function queryActiveFareMasterVersions(db, { tenantId, franchiseeId, storeId, atIso }){
  const scopes = buildScopeCandidates({ tenantId, franchiseeId, storeId });
  const records = [];
  for(const scope of scopes){
    let query = `SELECT * FROM fare_master_versions WHERE scope_type=? AND status IN ('active','scheduled')`;
    const binds = [scope.scopeType];
    if(scope.scopeType === "store"){
      query += ` AND store_id=?`;
      binds.push(scope.storeId);
      if(scope.franchiseeId){ query += ` AND franchisee_id=?`; binds.push(scope.franchiseeId); }
    }else if(scope.scopeType === "franchisee"){
      query += ` AND franchisee_id=? AND store_id IS NULL`;
      binds.push(scope.franchiseeId);
    }else{
      query += ` AND franchisee_id IS NULL AND store_id IS NULL`;
    }
    query += ` ORDER BY effective_from DESC`;
    const rows = await db.prepare(query).bind(...binds).all();
    for(const row of rows.results || []){
      records.push(parseFareMasterRow(row));
    }
  }
  return resolveActiveFareMaster(records, { atIso });
}

export async function resolveFareMaster(db, scope, { allowFallback = true, atIso } = {}){
  const resolved = await queryActiveFareMasterVersions(db, scope);
  if(resolved?.record) return resolved;
  if(!allowFallback) return null;
  return getSystemFallbackFareMaster(getBaseEstimateConfig());
}

export async function listFareMasterVersions(db, { franchiseeId, storeId, limit = 50 }){
  let query = `SELECT * FROM fare_master_versions WHERE 1=1`;
  const binds = [];
  if(storeId){ query += ` AND store_id=?`; binds.push(storeId); }
  else if(franchiseeId){ query += ` AND franchisee_id=? AND store_id IS NULL`; binds.push(franchiseeId); }
  else { query += ` AND scope_type='headquarters'`; }
  query += ` ORDER BY effective_from DESC LIMIT ?`;
  binds.push(limit);
  const rows = await db.prepare(query).bind(...binds).all();
  return (rows.results || []).map(parseFareMasterRow);
}

export async function getFareMasterVersionById(db, id){
  const row = await db.prepare(`SELECT * FROM fare_master_versions WHERE id=? LIMIT 1`).bind(id).first();
  return parseFareMasterRow(row);
}

export async function publishFareMasterVersion(db, body, adminUser = "admin"){
  const now = new Date().toISOString();
  const effectiveFrom = body.effectiveFrom || now;
  const immediate = body.immediate !== false && !body.effectiveFrom;
  const status = immediate ? "active" : "scheduled";
  const scopeType = body.scopeType || (body.storeId ? "store" : body.franchiseeId ? "franchisee" : "headquarters");
  const parent = await resolveFareMaster(db, {
    tenantId: body.tenantId,
    franchiseeId: body.franchiseeId,
    storeId: body.storeId,
  }, { allowFallback: false, atIso: effectiveFrom });

  const beforeRecord = parent?.record || null;
  const baseRules = body.fareRules || beforeRecord?.fareRules || getBaseEstimateConfig();
  const id = body.id || `fmv-${scopeType}-${Date.now()}`;
  const record = {
    id,
    version: body.version || `v${Date.now()}`,
    tenantId: body.tenantId || null,
    franchiseeId: body.franchiseeId || null,
    storeId: body.storeId || null,
    scopeType,
    parentVersionId: beforeRecord?.id || null,
    status,
    effectiveFrom,
    effectiveTo: body.effectiveTo || null,
    fareRules: baseRules,
    displayRules: body.displayRules || beforeRecord?.displayRules || {},
    calculationRules: body.calculationRules || beforeRecord?.calculationRules || {},
    meterRules: body.meterRules || beforeRecord?.meterRules || {},
    createdAt: now,
    createdBy: adminUser,
    updatedAt: now,
    updatedBy: adminUser,
    publishedAt: now,
    publishedBy: adminUser,
    changeReason: String(body.changeReason || "").trim() || "料金改定",
  };

  if(immediate && beforeRecord?.id){
    await db.prepare(`UPDATE fare_master_versions SET status='expired', effective_to=?, updated_at=? WHERE id=? AND status='active'`)
      .bind(now, now, beforeRecord.id).run();
  }

  await insertFareMasterVersion(db, record);
  await insertFareMasterChange(db, {
    versionId: id,
    changedBy: adminUser,
    changeReason: record.changeReason,
    before: beforeRecord || {},
    after: record,
    changeType: immediate ? "immediate_publish" : "scheduled_publish",
    effectiveFrom,
    franchiseeId: record.franchiseeId,
    storeId: record.storeId,
  });

  return {
    ok: true,
    version: record,
    diff: diffFareMasterRecords(beforeRecord, record),
  };
}

export async function listFareMasterChanges(db, { limit = 100 }){
  const rows = await db.prepare(`SELECT * FROM fare_master_changes ORDER BY changed_at DESC LIMIT ?`).bind(limit).all();
  return (rows.results || []).map(row => ({
    id: row.id,
    versionId: row.version_id,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    effectiveFrom: row.effective_from,
    changeReason: row.change_reason,
    before: safeParseJson(row.before_json, {}),
    after: safeParseJson(row.after_json, {}),
    changeType: row.change_type,
    source: row.source,
  }));
}

export function buildActiveFareMasterResponse(resolved){
  const record = resolved?.record;
  if(!record) return { success: false, message: "有効な料金マスターが見つかりません" };
  return {
    success: true,
    fareSource: resolved.fareSource,
    fallbackReason: resolved.fallbackReason || null,
    fareMasterId: record.id,
    fareVersionId: record.id,
    fareVersion: record.version,
    scopeType: record.scopeType,
    tenantId: record.tenantId,
    franchiseeId: record.franchiseeId,
    storeId: record.storeId,
    effectiveFrom: record.effectiveFrom,
    estimateConfig: toEstimateConfig(record),
    displayRules: record.displayRules,
    meterSettings: toMeterSettingsPayload(record),
    fareSnapshot: buildFareSnapshot(record),
    menu: fareMasterToMenu(record),
    baseFees: fareMasterToBaseFees(record),
  };
}

export async function handleFareMasterRoutes(request, env, path, headers, { isAdminAuthorized, isMeterDriverAuthorized, parseDriverTenantHeaders, json }){
  const db = env.DB;
  const url = new URL(request.url);
  await ensureFareMasterSchema(db);

  if(path === "/api/fare-master/active" && request.method === "GET"){
    const resolved = await resolveFareMaster(db, {
      tenantId: url.searchParams.get("tenantId"),
      franchiseeId: url.searchParams.get("franchiseeId"),
      storeId: url.searchParams.get("storeId"),
    }, { atIso: url.searchParams.get("at") || undefined });
    return json(buildActiveFareMasterResponse(resolved), 200, headers);
  }

  if(path === "/api/fare-master/display" && request.method === "GET"){
    const resolved = await resolveFareMaster(db, {
      franchiseeId: url.searchParams.get("franchiseeId"),
      storeId: url.searchParams.get("storeId"),
    });
    const record = resolved?.record;
    return json({
      success: true,
      fareMasterId: record?.id,
      fareVersion: record?.version,
      pricingTable: record?.displayRules?.pricingTable || [],
      faqAmounts: record?.displayRules?.faqAmounts || {},
    }, 200, headers);
  }

  if(path === "/api/driver/fare-master/active" && request.method === "GET"){
    if(!(await isMeterDriverAuthorized(request, env))) return json({ success: false, message: "Unauthorized" }, 401, headers);
    const tenant = parseDriverTenantHeaders(request);
    const resolved = await resolveFareMaster(db, tenant);
    return json(buildActiveFareMasterResponse(resolved), 200, headers);
  }

  if(path === "/api/admin/fare-master/versions" && request.method === "GET"){
    if(!(await isAdminAuthorized(request, db))) return json({ success: false, message: "Unauthorized" }, 401, headers);
    const versions = await listFareMasterVersions(db, {
      franchiseeId: url.searchParams.get("franchiseeId"),
      storeId: url.searchParams.get("storeId"),
    });
    return json({ success: true, versions }, 200, headers);
  }

  if(path.startsWith("/api/admin/fare-master/versions/") && request.method === "GET"){
    if(!(await isAdminAuthorized(request, db))) return json({ success: false, message: "Unauthorized" }, 401, headers);
    const id = path.replace("/api/admin/fare-master/versions/", "");
    const version = await getFareMasterVersionById(db, id);
    if(!version) return json({ success: false, message: "Not found" }, 404, headers);
    return json({ success: true, version }, 200, headers);
  }

  if(path === "/api/admin/fare-master/publish" && request.method === "POST"){
    if(!(await isAdminAuthorized(request, db))) return json({ success: false, message: "Unauthorized" }, 401, headers);
    const body = await request.json().catch(() => ({}));
    const result = await publishFareMasterVersion(db, body);
    return json({ success: true, ...result }, 200, headers);
  }

  if(path === "/api/admin/fare-master/changes" && request.method === "GET"){
    if(!(await isAdminAuthorized(request, db))) return json({ success: false, message: "Unauthorized" }, 401, headers);
    const changes = await listFareMasterChanges(db);
    return json({ success: true, changes }, 200, headers);
  }

  if(path === "/api/admin/fare-master/seed" && request.method === "POST"){
    if(!(await isAdminAuthorized(request, db))) return json({ success: false, message: "Unauthorized" }, 401, headers);
    const result = await seedHeadquartersV1IfEmpty(db);
    return json(result, 200, headers);
  }

  return null;
}

export {
  toEstimateConfig,
  toMeterSettingsPayload,
  buildFareSnapshot,
  fareMasterToMenu,
  fareMasterToBaseFees,
  resolveFareMaster,
  shouldExcludeServiceFeeFromMeterReadd,
};
