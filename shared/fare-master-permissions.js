/**
 * 料金マスター権限
 * 初期状態: admin セッション = オーナー（全権限）
 */
export const PRICING_PERMISSIONS = {
  READ: "pricing.read",
  UPDATE: "pricing.update",
  PUBLISH: "pricing.publish",
  SCHEDULE: "pricing.schedule",
  VIEW_HISTORY: "pricing.viewHistory",
  MANAGE_PERMISSIONS: "pricing.managePermissions",
};

export const DEFAULT_OWNER_PERMISSIONS = Object.values(PRICING_PERMISSIONS);

export async function listFareMasterPermissions(db, { userId = "admin", franchiseeId, storeId } = {}){
  const rows = await db.prepare(`
    SELECT permission_key FROM fare_master_permissions
    WHERE user_id=? AND COALESCE(franchisee_id,'')=COALESCE(?,'') AND COALESCE(store_id,'')=COALESCE(?,'')
  `).bind(userId, franchiseeId || null, storeId || null).all();
  return (rows.results || []).map(r => String(r.permission_key));
}

export async function hasFareMasterPermission(db, { userId = "admin", permission, franchiseeId, storeId }){
  const granted = await listFareMasterPermissions(db, { userId, franchiseeId, storeId });
  if(!granted.length) return true;
  return granted.includes(permission);
}

export async function grantFareMasterPermission(db, { userId, permission, grantedBy = "admin", franchiseeId, storeId }){
  await db.prepare(`
    INSERT OR IGNORE INTO fare_master_permissions (tenant_id, franchisee_id, store_id, user_id, permission_key, granted_by, granted_at)
    VALUES (?,?,?,?,?,?,?)
  `).bind(null, franchiseeId || null, storeId || null, userId, permission, grantedBy, new Date().toISOString()).run();
}

export async function requireFareMasterPermission(db, request, isAdminAuthorized, permission){
  if(!(await isAdminAuthorized(request, db))) return { ok: false, status: 401, message: "Unauthorized" };
  const allowed = await hasFareMasterPermission(db, { userId: "admin", permission });
  if(!allowed) return { ok: false, status: 403, message: "料金変更権限がありません" };
  return { ok: true };
}
