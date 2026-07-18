export const PRE_OPENING_RESET_CONFIRM_TEXT = "RESET";

const TENANT_SCOPE_SQL = `COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`;

/** Single lock setting per tenant (no historical log accumulation). */
export function buildPreOpeningResetLockSettingKey(franchiseeId, storeId) {
  const franchisee = String(franchiseeId ?? "").trim();
  const store = String(storeId ?? "").trim();
  if (!franchisee && !store) return "pre_opening_reset_lock:legacy";
  return `pre_opening_reset_lock:${franchisee}:${store}`;
}

export function matchesPreOpeningResetConfirmText(confirmText, storeId, legacyAdminScope) {
  const confirm = String(confirmText ?? "").trim();
  if (legacyAdminScope) {
    return confirm === PRE_OPENING_RESET_CONFIRM_TEXT;
  }
  const store = String(storeId ?? "").trim();
  return confirm === PRE_OPENING_RESET_CONFIRM_TEXT || (Boolean(store) && confirm === store);
}

export function isPreOpeningModeActive(prelaunchSettings = {}) {
  const modeEnabled =
    String(prelaunchSettings.reservation_prelaunch_mode_enabled ?? "")
      .trim()
      .toLowerCase() === "true";
  if (modeEnabled) return true;
  const startMs = Date.parse(String(prelaunchSettings.reservation_public_start_at || "").trim());
  if (!Number.isNaN(startMs) && Date.now() < startMs) return true;
  return false;
}

export function parsePreOpeningResetLockValue(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { locked: false };
  try {
    const parsed = JSON.parse(text);
    return {
      locked: parsed?.locked === true,
      executedAt: String(parsed?.executedAt || ""),
      executedBy: String(parsed?.executedBy || ""),
    };
  } catch {
    return { locked: text.toLowerCase() === "true" || text === "1" };
  }
}

async function readPreOpeningResetLock(db, franchiseeId, storeId) {
  const key = buildPreOpeningResetLockSettingKey(franchiseeId, storeId);
  const row = await db.prepare(`SELECT value FROM settings WHERE key = ? LIMIT 1`).bind(key).first();
  return parsePreOpeningResetLockValue(row?.value);
}

async function writePreOpeningResetLock(db, { franchiseeId, storeId, executedBy, executedAt }) {
  const key = buildPreOpeningResetLockSettingKey(franchiseeId, storeId);
  const value = JSON.stringify({
    locked: true,
    executedAt,
    executedBy,
  });
  await db
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
    .bind(key, value)
    .run();
}

function emptyCounts() {
  return {
    reservations: 0,
    unhandled_reservations: 0,
    confirmed_reservations: 0,
    blocks: 0,
    quotes: 0,
    quote_consents: 0,
    meter_fixed_fare_runs: 0,
    email_logs: 0,
    pre_opening_reset_logs: 0,
  };
}

function emptyDashboard() {
  return {
    totalReservations: 0,
    unhandledReservations: 0,
    confirmedReservations: 0,
    doneReservations: 0,
  };
}

export function isLegacyAdminScope(franchiseeId, storeId) {
  return String(franchiseeId ?? "").trim() === "" && String(storeId ?? "").trim() === "";
}

export function buildPreOpeningResetScopeContext(franchiseeId, storeId) {
  const franchisee = String(franchiseeId ?? "").trim();
  const store = String(storeId ?? "").trim();
  return {
    franchiseeId: franchisee,
    storeId: store,
    legacyAdminScope: isLegacyAdminScope(franchiseeId, storeId),
  };
}

export function normalizePreOpeningResetScope(input) {
  const franchiseeRaw = input?.franchiseeId ?? input?.franchisee_id;
  const storeRaw = input?.storeId ?? input?.store_id;
  if (franchiseeRaw == null || storeRaw == null) {
    return { ok: false, status: 400, message: "franchiseeId と storeId は必須です" };
  }
  const franchiseeId = String(franchiseeRaw).trim();
  const storeId = String(storeRaw).trim();
  return {
    ok: true,
    franchiseeId,
    storeId,
    ...buildPreOpeningResetScopeContext(franchiseeId, storeId),
  };
}

export function normalizePreOpeningResetMode(input) {
  const mode = String(input?.scope ?? input?.resetScope ?? "reservations")
    .trim()
    .toLowerCase();
  if (mode !== "full" && mode !== "reservations") {
    return { ok: false, status: 400, message: "scope は full または reservations を指定してください" };
  }
  return { ok: true, mode };
}

/** Matches admin.js productionReservations() / renderStats() on visible reservation rows. */
function adminProductionReservationSql(ctx) {
  const base = `COALESCE(is_visible, 1) != 0
    AND COALESCE(is_test, 0) != 1
    AND LOWER(COALESCE(status, '')) != 'test'`;
  if (ctx.legacyAdminScope) return base;
  return `${TENANT_SCOPE_SQL} AND ${base}`;
}

function adminProductionReservationBinds(ctx) {
  return ctx.legacyAdminScope ? [] : [ctx.franchiseeId, ctx.storeId];
}

function preOpeningGuardSql(publicStartAt) {
  const testFlags = `(
    COALESCE(is_test, 0) = 1
    OR LOWER(COALESCE(status, '')) = 'test'
    OR COALESCE(source, '') = 'prelaunch-test'
  )`;
  const startAt = String(publicStartAt || "").trim();
  if (!startAt) return testFlags;
  return `(${testFlags} OR (COALESCE(created_at, '') != '' AND created_at < ?))`;
}

function eligibleReservationSql(ctx, publicStartAt) {
  const guard = preOpeningGuardSql(publicStartAt);
  const production = adminProductionReservationSql(ctx);
  const startAt = String(publicStartAt || "").trim();
  if (!startAt) return `${production} AND ${guard}`;
  return `${production} AND ${guard}`;
}

function eligibleReservationBinds(ctx, publicStartAt) {
  const binds = [...adminProductionReservationBinds(ctx)];
  const startAt = String(publicStartAt || "").trim();
  if (startAt) binds.push(startAt);
  return binds;
}

function eligibleReservationSubquery(ctx, publicStartAt) {
  return `SELECT id FROM reservations WHERE ${eligibleReservationSql(ctx, publicStartAt)}`;
}

function orphanQuoteScopeSql(ctx) {
  if (ctx.legacyAdminScope) {
    return `COALESCE(franchisee_id, '') = '' AND COALESCE(store_id, '') = ''`;
  }
  return `COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`;
}

function orphanQuoteScopeBinds(ctx) {
  return ctx.legacyAdminScope ? [] : [ctx.franchiseeId, ctx.storeId];
}

export function arePreOpeningResetCountsAligned(dashboard, targets) {
  const d = dashboard || emptyDashboard();
  const t = targets || emptyCounts();
  return (
    Number(d.totalReservations || 0) === Number(t.reservations || 0) &&
    Number(d.unhandledReservations || 0) === Number(t.unhandled_reservations || 0) &&
    Number(d.confirmedReservations || 0) === Number(t.confirmed_reservations || 0)
  );
}

export async function ensurePreOpeningResetSchema(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS pre_opening_reset_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        franchisee_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        executed_by TEXT NOT NULL,
        executed_at TEXT NOT NULL,
        targets_json TEXT NOT NULL,
        deleted_json TEXT NOT NULL,
        failed_json TEXT NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        error_message TEXT
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_pre_opening_reset_logs_executed_at
       ON pre_opening_reset_logs(executed_at)`
    )
    .run();
}

async function countScalar(db, sql, ...params) {
  const row = await db.prepare(sql).bind(...params).first();
  return Number(row?.c || 0);
}

async function countDashboardStats(db, ctx) {
  const dashboard = emptyDashboard();
  const productionSql = adminProductionReservationSql(ctx);
  const binds = adminProductionReservationBinds(ctx);
  dashboard.totalReservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations WHERE ${productionSql}`,
    ...binds
  );
  dashboard.unhandledReservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations
     WHERE ${productionSql}
       AND LOWER(COALESCE(status, 'active')) = 'active'`,
    ...binds
  );
  dashboard.confirmedReservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations
     WHERE ${productionSql}
       AND LOWER(COALESCE(status, '')) = 'confirmed'`,
    ...binds
  );
  dashboard.doneReservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations
     WHERE ${productionSql}
       AND LOWER(COALESCE(status, '')) = 'done'`,
    ...binds
  );
  return dashboard;
}

export async function countPreOpeningResetTargets(
  db,
  ctx,
  { publicStartAt = "", resetScope = "reservations" } = {}
) {
  const counts = emptyCounts();
  const eligibleSql = eligibleReservationSql(ctx, publicStartAt);
  const eligibleBinds = eligibleReservationBinds(ctx, publicStartAt);
  const eligibleSubquery = eligibleReservationSubquery(ctx, publicStartAt);
  const orphanQuoteSql = orphanQuoteScopeSql(ctx);
  const orphanQuoteBinds = orphanQuoteScopeBinds(ctx);

  counts.reservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations WHERE ${eligibleSql}`,
    ...eligibleBinds
  );
  counts.unhandled_reservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations
     WHERE ${eligibleSql}
       AND LOWER(COALESCE(status, 'active')) = 'active'`,
    ...eligibleBinds
  );
  counts.confirmed_reservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations
     WHERE ${eligibleSql}
       AND LOWER(COALESCE(status, '')) = 'confirmed'`,
    ...eligibleBinds
  );

  // blocks are never deleted on scope=reservations (manual/time-block protection).
  if (resetScope === "full") {
    counts.blocks = await countScalar(
      db,
      `SELECT COUNT(*) AS c FROM blocks
       WHERE reservation_id IN (${eligibleSubquery})`,
      ...eligibleBinds
    );
  }

  counts.meter_fixed_fare_runs = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM meter_fixed_fare_runs
     WHERE reservation_id IN (${eligibleSubquery})`,
    ...eligibleBinds
  );
  counts.pre_opening_reset_logs = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM pre_opening_reset_logs
     WHERE ${orphanQuoteSql}`,
    ...orphanQuoteBinds
  );

  counts.quotes = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM quotes
     WHERE (
         reservation_id IN (${eligibleSubquery})
         OR (
           ${orphanQuoteSql}
           AND COALESCE(reservation_id, '') = ''
         )
         OR estimate_no IN (
           SELECT estimate_no FROM reservations
           WHERE ${eligibleSql}
             AND COALESCE(estimate_no, '') != ''
         )
       )`,
    ...eligibleBinds,
    ...orphanQuoteBinds,
    ...eligibleBinds
  );
  counts.quote_consents = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM quote_consents
     WHERE reservation_id IN (${eligibleSubquery})
        OR estimate_no IN (
          SELECT estimate_no FROM reservations
          WHERE ${eligibleSql}
            AND COALESCE(estimate_no, '') != ''
        )`,
    ...eligibleBinds,
    ...eligibleBinds
  );
  counts.email_logs = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM email_logs
     WHERE reservation_id IN (${eligibleSubquery})`,
    ...eligibleBinds
  );

  return counts;
}

function buildPreOpeningResetDeleteStatements(
  db,
  ctx,
  { publicStartAt = "", resetScope = "reservations" } = {}
) {
  const eligibleSql = eligibleReservationSql(ctx, publicStartAt);
  const eligibleBinds = eligibleReservationBinds(ctx, publicStartAt);
  const eligibleSubquery = eligibleReservationSubquery(ctx, publicStartAt);
  const orphanQuoteSql = orphanQuoteScopeSql(ctx);
  const orphanQuoteBinds = orphanQuoteScopeBinds(ctx);
  const statements = [];

  if (resetScope === "full") {
    statements.push(
      db
        .prepare(
          `DELETE FROM blocks
           WHERE reservation_id IN (${eligibleSubquery})`
        )
        .bind(...eligibleBinds)
    );
  }

  // Selective (reservations) and full both delete reservation-linked meter runs + past reset logs.
  // Manual/time blocks remain untouched on scope=reservations.
  statements.push(
    db
      .prepare(
        `DELETE FROM meter_fixed_fare_runs
         WHERE reservation_id IN (${eligibleSubquery})`
      )
      .bind(...eligibleBinds),
    db
      .prepare(
        `DELETE FROM quote_consents
         WHERE reservation_id IN (${eligibleSubquery})
            OR estimate_no IN (
              SELECT estimate_no FROM reservations
              WHERE ${eligibleSql}
                AND COALESCE(estimate_no, '') != ''
            )`
      )
      .bind(...eligibleBinds, ...eligibleBinds),
    db
      .prepare(
        `DELETE FROM quotes
         WHERE reservation_id IN (${eligibleSubquery})
            OR (
              ${orphanQuoteSql}
              AND COALESCE(reservation_id, '') = ''
            )
            OR estimate_no IN (
              SELECT estimate_no FROM reservations
              WHERE ${eligibleSql}
                AND COALESCE(estimate_no, '') != ''
            )`
      )
      .bind(...eligibleBinds, ...orphanQuoteBinds, ...eligibleBinds),
    db
      .prepare(
        `DELETE FROM email_logs
         WHERE reservation_id IN (${eligibleSubquery})`
      )
      .bind(...eligibleBinds),
    db
      .prepare(
        `DELETE FROM pre_opening_reset_logs
         WHERE ${orphanQuoteSql}`
      )
      .bind(...orphanQuoteBinds),
    db.prepare(`DELETE FROM reservations WHERE ${eligibleSql}`).bind(...eligibleBinds)
  );

  return statements;
}

function deletedFromBatchResults(targets, results, resetScope) {
  const keys =
    resetScope === "full"
      ? [
          "blocks",
          "meter_fixed_fare_runs",
          "quote_consents",
          "quotes",
          "email_logs",
          "pre_opening_reset_logs",
          "reservations",
        ]
      : [
          "meter_fixed_fare_runs",
          "quote_consents",
          "quotes",
          "email_logs",
          "pre_opening_reset_logs",
          "reservations",
        ];
  const deleted = emptyCounts();
  const failed = emptyCounts();
  keys.forEach((key, index) => {
    const changes = Number(results?.[index]?.meta?.changes ?? 0);
    deleted[key] = changes;
    failed[key] = Math.max(0, Number(targets[key] || 0) - changes);
  });
  // Explicitly keep blocks at 0 for selective scope so UI/tests can assert protection.
  if (resetScope !== "full") {
    deleted.blocks = 0;
    failed.blocks = 0;
  }
  return { deleted, failed };
}

export async function executePreOpeningReset(
  db,
  {
    franchiseeId,
    storeId,
    executedBy,
    publicStartAt = "",
    resetScope = "reservations",
    prelaunchSettings = null,
  }
) {
  const ctx = buildPreOpeningResetScopeContext(franchiseeId, storeId);
  const settings = prelaunchSettings || { reservation_public_start_at: publicStartAt };
  if (!isPreOpeningModeActive(settings)) {
    return {
      ok: false,
      status: 403,
      message: "開業前モード中のみ予約データを初期化できます。",
      franchiseeId: ctx.franchiseeId,
      storeId: ctx.storeId,
      legacyAdminScope: ctx.legacyAdminScope,
      locked: false,
      preOpeningAllowed: false,
      countsAligned: false,
      dashboard: emptyDashboard(),
      targets: emptyCounts(),
      deleted: emptyCounts(),
      failed: emptyCounts(),
      logId: null,
    };
  }

  const lockState = await readPreOpeningResetLock(db, ctx.franchiseeId, ctx.storeId);
  if (lockState.locked) {
    return {
      ok: false,
      status: 403,
      message: "開業前リセットは実行済みのためロックされています。",
      franchiseeId: ctx.franchiseeId,
      storeId: ctx.storeId,
      legacyAdminScope: ctx.legacyAdminScope,
      locked: true,
      preOpeningAllowed: false,
      countsAligned: false,
      dashboard: emptyDashboard(),
      targets: emptyCounts(),
      deleted: emptyCounts(),
      failed: emptyCounts(),
      logId: null,
    };
  }

  const [targets, dashboard] = await Promise.all([
    countPreOpeningResetTargets(db, ctx, { publicStartAt, resetScope }),
    countDashboardStats(db, ctx),
  ]);
  const countsAligned = arePreOpeningResetCountsAligned(dashboard, targets);
  if (!countsAligned) {
    return {
      ok: false,
      status: 409,
      message:
        "ダッシュボード件数と削除対象件数が一致しません。本番予約が混在している可能性があります。",
      franchiseeId: ctx.franchiseeId,
      storeId: ctx.storeId,
      legacyAdminScope: ctx.legacyAdminScope,
      locked: false,
      preOpeningAllowed: true,
      countsAligned,
      dashboard,
      targets,
      deleted: emptyCounts(),
      failed: targets,
      logId: null,
    };
  }

  const executedAt = new Date().toISOString();
  const executedByValue = String(executedBy || "").trim() || "unknown";

  try {
    const results = await db.batch(
      buildPreOpeningResetDeleteStatements(db, ctx, {
        publicStartAt,
        resetScope,
      })
    );
    const { deleted, failed } = deletedFromBatchResults(targets, results, resetScope);
    // Do not accumulate reset history; keep only one lock setting for re-run prevention.
    await writePreOpeningResetLock(db, {
      franchiseeId: ctx.franchiseeId,
      storeId: ctx.storeId,
      executedBy: executedByValue,
      executedAt,
    });
    return {
      ok: true,
      franchiseeId: ctx.franchiseeId,
      storeId: ctx.storeId,
      legacyAdminScope: ctx.legacyAdminScope,
      locked: true,
      preOpeningAllowed: true,
      countsAligned: true,
      dashboard,
      executedBy: executedByValue,
      executedAt,
      resetScope,
      targets,
      deleted,
      failed,
      logId: null,
    };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 500);
    const failed = { ...targets };
    const deleted = emptyCounts();
    return {
      ok: false,
      status: 500,
      message,
      franchiseeId: ctx.franchiseeId,
      storeId: ctx.storeId,
      legacyAdminScope: ctx.legacyAdminScope,
      locked: false,
      preOpeningAllowed: true,
      countsAligned,
      dashboard,
      executedBy: executedByValue,
      executedAt,
      resetScope,
      targets,
      deleted,
      failed,
      logId: null,
    };
  }
}

export function buildPreOpeningResetCapabilityResponse(
  tenantScope,
  targets,
  dashboard,
  resetScope = "reservations",
  extras = {}
) {
  const response = {
    supported: extras.supported !== false,
    scope: resetScope,
    locked: extras.locked === true,
    preOpeningAllowed: extras.preOpeningAllowed !== false,
    message: extras.message || "",
  };
  if (tenantScope?.ok) {
    response.franchiseeId = tenantScope.franchiseeId;
    response.storeId = tenantScope.storeId;
    response.legacyAdminScope = tenantScope.legacyAdminScope;
    response.targets = targets || emptyCounts();
    response.dashboard = dashboard || emptyDashboard();
    response.countsAligned = arePreOpeningResetCountsAligned(response.dashboard, response.targets);
  }
  return response;
}

export async function buildPreOpeningResetCapability(
  db,
  tenantScope,
  { publicStartAt = "", resetScope = "reservations", prelaunchSettings = null } = {}
) {
  if (!tenantScope?.ok) {
    return buildPreOpeningResetCapabilityResponse(null, emptyCounts(), emptyDashboard(), resetScope);
  }
  const settings = prelaunchSettings || { reservation_public_start_at: publicStartAt };
  const preOpeningAllowed = isPreOpeningModeActive(settings);
  const lockState = await readPreOpeningResetLock(
    db,
    tenantScope.franchiseeId,
    tenantScope.storeId
  );
  const supported = preOpeningAllowed && !lockState.locked;
  const ctx = buildPreOpeningResetScopeContext(tenantScope.franchiseeId, tenantScope.storeId);
  const [targets, dashboard] = await Promise.all([
    countPreOpeningResetTargets(db, ctx, { publicStartAt, resetScope }),
    countDashboardStats(db, ctx),
  ]);
  return buildPreOpeningResetCapabilityResponse(tenantScope, targets, dashboard, resetScope, {
    supported,
    locked: lockState.locked,
    preOpeningAllowed,
    message: !preOpeningAllowed
      ? "開業前モード中のみ予約データを初期化できます。"
      : lockState.locked
        ? "開業前リセットは実行済みのためロックされています。"
        : "",
  });
}
