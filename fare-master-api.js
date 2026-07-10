/**
 * 料金マスター API — D1 操作・Worker ルートハンドラ
 */
import { buildHeadquartersV1Record, buildHeadquartersFareRules } from "./shared/fare-master-v1.js";
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
  buildFareMasterEditForm,
  applyFareMasterEditForm,
  sumServiceFeesForTotal,
  parseFareMasterAtQuery,
  validateHeadquartersV1SeedCompleteness,
} from "./shared/fare-master-core.js";
import { requireFareMasterPermission, PRICING_PERMISSIONS, listFareMasterPermissions } from "./shared/fare-master-permissions.js";

function fareScopeFromUrl(url){
  return {
    tenantId: url.searchParams.get("tenantId"),
    franchiseeId: url.searchParams.get("franchiseeId"),
    storeId: url.searchParams.get("storeId"),
  };
}

async function resolveFareMasterFromRequest(db, url, options = {}){
  const atParsed = parseFareMasterAtQuery(url);
  if(!atParsed.ok){
    return { error: atParsed, response: { success: false, message: atParsed.message, error: atParsed.error } };
  }
  const resolved = await resolveFareMaster(db, fareScopeFromUrl(url), { ...options, atIso: atParsed.atIso });
  return { resolved, atParsed };
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
  const record = buildHeadquartersV1Record();
  validateHeadquartersV1SeedCompleteness(record);
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
  const resolved = await queryActiveFareMasterVersions(db, { ...scope, atIso });
  if(resolved?.record) return resolved;
  if(!allowFallback) return null;
  return getSystemFallbackFareMaster();
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

export async function saveDraftFareMasterVersion(db, body, adminUser = "admin"){
  const now = new Date().toISOString();
  const id = body.id || `fmv-draft-${Date.now()}`;
  const parent = await resolveFareMaster(db, {
    tenantId: body.tenantId,
    franchiseeId: body.franchiseeId,
    storeId: body.storeId,
  }, { allowFallback: true });
  const base = parent?.record || buildHeadquartersV1Record();
  const edited = body.form ? applyFareMasterEditForm(base, body.form) : base;
  const record = {
    id,
    version: body.version || `draft-${Date.now()}`,
    tenantId: body.tenantId || null,
    franchiseeId: body.franchiseeId || null,
    storeId: body.storeId || null,
    scopeType: body.scopeType || base.scopeType || "headquarters",
    parentVersionId: base.id || null,
    status: "draft",
    effectiveFrom: body.effectiveFrom || now,
    effectiveTo: null,
    fareRules: edited.fareRules,
    displayRules: edited.displayRules || base.displayRules,
    calculationRules: edited.calculationRules || base.calculationRules,
    meterRules: edited.meterRules,
    createdAt: now,
    createdBy: adminUser,
    updatedAt: now,
    updatedBy: adminUser,
    publishedAt: null,
    publishedBy: null,
    changeReason: String(body.changeReason || "").trim() || "下書き保存",
  };
  const existing = await getFareMasterVersionById(db, id);
  if(existing){
    await db.prepare(`UPDATE fare_master_versions SET fare_rules=?, display_rules=?, calculation_rules=?, meter_rules=?, updated_at=?, updated_by=?, change_reason=?, status='draft' WHERE id=?`)
      .bind(JSON.stringify(record.fareRules), JSON.stringify(record.displayRules), JSON.stringify(record.calculationRules), JSON.stringify(record.meterRules), now, adminUser, record.changeReason, id).run();
  }else{
    await insertFareMasterVersion(db, record);
  }
  return { ok: true, version: record };
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
  let baseRecord = beforeRecord || buildHeadquartersV1Record();
  if(body.form){
    baseRecord = applyFareMasterEditForm(baseRecord, body.form);
  }
  const baseRules = body.fareRules || baseRecord.fareRules || buildHeadquartersFareRules();
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
    displayRules: body.displayRules || baseRecord.displayRules || beforeRecord?.displayRules || {},
    calculationRules: body.calculationRules || baseRecord.calculationRules || beforeRecord?.calculationRules || {},
    meterRules: body.meterRules || baseRecord.meterRules || beforeRecord?.meterRules || {},
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

export function buildActiveFareMasterResponse(resolved, { atMeta } = {}){
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
    atIso: atMeta?.atIso || null,
    atSource: atMeta?.source || null,
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
    const result = await resolveFareMasterFromRequest(db, url);
    if(result.error) return json(result.response, 400, headers);
    return json(buildActiveFareMasterResponse(result.resolved, { atMeta: result.atParsed }), 200, headers);
  }

  if(path === "/api/fare-master/display" && request.method === "GET"){
    const result = await resolveFareMasterFromRequest(db, url);
    if(result.error) return json(result.response, 400, headers);
    const record = result.resolved?.record;
    return json({
      success: true,
      fareMasterId: record?.id,
      fareVersion: record?.version,
      fareSource: result.resolved?.fareSource,
      atIso: result.atParsed.atIso,
      pricingTable: record?.displayRules?.pricingTable || [],
      faqAmounts: record?.displayRules?.faqAmounts || {},
    }, 200, headers);
  }

  if(path === "/api/driver/fare-master/active" && request.method === "GET"){
    if(!(await isMeterDriverAuthorized(request, env))) return json({ success: false, message: "Unauthorized" }, 401, headers);
    const driverUrl = new URL(request.url);
    const tenant = parseDriverTenantHeaders(request);
    const atParsed = parseFareMasterAtQuery(driverUrl);
    if(!atParsed.ok) return json({ success: false, message: atParsed.message, error: atParsed.error }, 400, headers);
    const resolved = await resolveFareMaster(db, tenant, { atIso: atParsed.atIso });
    return json(buildActiveFareMasterResponse(resolved, { atMeta: atParsed }), 200, headers);
  }

  if(path === "/api/admin/fare-master/edit-form" && request.method === "GET"){
    const auth = await requireFareMasterPermission(db, request, isAdminAuthorized, PRICING_PERMISSIONS.READ);
    if(!auth.ok) return json({ success: false, message: auth.message }, auth.status, headers);
    const atParsed = parseFareMasterAtQuery(url);
    const resolved = await resolveFareMaster(db, {
      franchiseeId: url.searchParams.get("franchiseeId"),
      storeId: url.searchParams.get("storeId"),
    }, { atIso: atParsed.ok ? atParsed.atIso : new Date().toISOString() });
    const record = resolved?.record || buildHeadquartersV1Record();
    return json({ success: true, form: buildFareMasterEditForm(record), active: record, fareSource: resolved?.fareSource }, 200, headers);
  }

  if(path === "/api/admin/fare-master/draft" && request.method === "POST"){
    const auth = await requireFareMasterPermission(db, request, isAdminAuthorized, PRICING_PERMISSIONS.UPDATE);
    if(!auth.ok) return json({ success: false, message: auth.message }, auth.status, headers);
    const body = await request.json().catch(() => ({}));
    const result = await saveDraftFareMasterVersion(db, body);
    return json({ success: true, ...result }, 200, headers);
  }

  if(path === "/api/admin/fare-master/publish" && request.method === "POST"){
    const auth = await requireFareMasterPermission(db, request, isAdminAuthorized, PRICING_PERMISSIONS.PUBLISH);
    if(!auth.ok) return json({ success: false, message: auth.message }, auth.status, headers);
    const body = await request.json().catch(() => ({}));
    const result = await publishFareMasterVersion(db, body);
    return json({ success: true, ...result }, 200, headers);
  }

  if(path === "/api/admin/fare-master/permissions" && request.method === "GET"){
    const auth = await requireFareMasterPermission(db, request, isAdminAuthorized, PRICING_PERMISSIONS.MANAGE_PERMISSIONS);
    if(!auth.ok) return json({ success: false, message: auth.message }, auth.status, headers);
    const permissions = await listFareMasterPermissions(db, { userId: "admin" });
    return json({ success: true, permissions, isOwnerDefault: permissions.length === 0 }, 200, headers);
  }

  if(path === "/api/admin/fare-master/versions" && request.method === "GET"){
    const auth = await requireFareMasterPermission(db, request, isAdminAuthorized, PRICING_PERMISSIONS.READ);
    if(!auth.ok) return json({ success: false, message: auth.message }, auth.status, headers);
    const versions = await listFareMasterVersions(db, {
      franchiseeId: url.searchParams.get("franchiseeId"),
      storeId: url.searchParams.get("storeId"),
    });
    return json({ success: true, versions }, 200, headers);
  }

  if(path.startsWith("/api/admin/fare-master/versions/") && request.method === "GET"){
    const auth = await requireFareMasterPermission(db, request, isAdminAuthorized, PRICING_PERMISSIONS.VIEW_HISTORY);
    if(!auth.ok) return json({ success: false, message: auth.message }, auth.status, headers);
    const id = path.replace("/api/admin/fare-master/versions/", "");
    const version = await getFareMasterVersionById(db, id);
    if(!version) return json({ success: false, message: "Not found" }, 404, headers);
    return json({ success: true, version }, 200, headers);
  }

  if(path === "/api/admin/fare-master/changes" && request.method === "GET"){
    const auth = await requireFareMasterPermission(db, request, isAdminAuthorized, PRICING_PERMISSIONS.VIEW_HISTORY);
    if(!auth.ok) return json({ success: false, message: auth.message }, auth.status, headers);
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

export { fareMasterToMenu, fareMasterToBaseFees } from "./shared/fare-master-core.js";
