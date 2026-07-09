export const PRE_OPENING_RESET_CONFIRM_TEXT = "RESET";

const TENANT_SCOPE_SQL = `COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`;

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
  };
}

export function normalizePreOpeningResetScope(input) {
  const franchiseeRaw = input?.franchiseeId ?? input?.franchisee_id;
  const storeRaw = input?.storeId ?? input?.store_id;
  if (franchiseeRaw == null || storeRaw == null) {
    return { ok: false, status: 400, message: "franchiseeId と storeId は必須です" };
  }
  return {
    ok: true,
    franchiseeId: String(franchiseeRaw).trim(),
    storeId: String(storeRaw).trim(),
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

function eligibleReservationSql(publicStartAt) {
  const startAt = String(publicStartAt || "").trim();
  const testFlags = `(
    COALESCE(is_test, 0) = 1
    OR LOWER(COALESCE(status, '')) = 'test'
    OR COALESCE(source, '') = 'prelaunch-test'
  )`;
  if (!startAt) {
    return `${TENANT_SCOPE_SQL} AND ${testFlags}`;
  }
  return `${TENANT_SCOPE_SQL} AND (${testFlags} OR (COALESCE(created_at, '') != '' AND created_at < ?))`;
}

function eligibleReservationBinds(franchiseeId, storeId, publicStartAt) {
  const binds = [franchiseeId, storeId];
  const startAt = String(publicStartAt || "").trim();
  if (startAt) binds.push(startAt);
  return binds;
}

function productionDashboardSql() {
  return `${TENANT_SCOPE_SQL}
    AND COALESCE(is_visible, 1) != 0
    AND COALESCE(is_test, 0) != 1
    AND LOWER(COALESCE(status, '')) != 'test'`;
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

function eligibleReservationSubquery(publicStartAt) {
  return `SELECT id FROM reservations WHERE ${eligibleReservationSql(publicStartAt)}`;
}

async function countDashboardStats(db, franchiseeId, storeId) {
  const dashboard = emptyDashboard();
  const baseBinds = [franchiseeId, storeId];
  dashboard.totalReservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations WHERE ${productionDashboardSql()}`,
    ...baseBinds
  );
  dashboard.unhandledReservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations
     WHERE ${productionDashboardSql()}
       AND LOWER(COALESCE(status, 'active')) = 'active'`,
    ...baseBinds
  );
  dashboard.confirmedReservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations
     WHERE ${productionDashboardSql()}
       AND LOWER(COALESCE(status, '')) = 'confirmed'`,
    ...baseBinds
  );
  return dashboard;
}

export async function countPreOpeningResetTargets(
  db,
  franchiseeId,
  storeId,
  { publicStartAt = "", resetScope = "reservations" } = {}
) {
  const counts = emptyCounts();
  const eligibleSql = eligibleReservationSql(publicStartAt);
  const eligibleBinds = eligibleReservationBinds(franchiseeId, storeId, publicStartAt);
  const eligibleSubquery = eligibleReservationSubquery(publicStartAt);

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

  if (resetScope === "full") {
    counts.blocks = await countScalar(
      db,
      `SELECT COUNT(*) AS c FROM blocks
       WHERE reservation_id IN (${eligibleSubquery})`,
      ...eligibleBinds
    );
    counts.meter_fixed_fare_runs = await countScalar(
      db,
      `SELECT COUNT(*) AS c FROM meter_fixed_fare_runs
       WHERE reservation_id IN (${eligibleSubquery})`,
      ...eligibleBinds
    );
    counts.pre_opening_reset_logs = await countScalar(
      db,
      `SELECT COUNT(*) AS c FROM pre_opening_reset_logs
       WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`,
      franchiseeId,
      storeId
    );
  }

  counts.quotes = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM quotes
     WHERE (
         reservation_id IN (${eligibleSubquery})
         OR (
           COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?
           AND COALESCE(reservation_id, '') = ''
         )
         OR estimate_no IN (
           SELECT estimate_no FROM reservations
           WHERE ${eligibleSql}
             AND COALESCE(estimate_no, '') != ''
         )
       )`,
    ...eligibleBinds,
    franchiseeId,
    storeId,
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
  franchiseeId,
  storeId,
  { publicStartAt = "", resetScope = "reservations" } = {}
) {
  const eligibleSql = eligibleReservationSql(publicStartAt);
  const eligibleBinds = eligibleReservationBinds(franchiseeId, storeId, publicStartAt);
  const eligibleSubquery = eligibleReservationSubquery(publicStartAt);
  const statements = [];

  if (resetScope === "full") {
    statements.push(
      db
        .prepare(
          `DELETE FROM blocks
           WHERE reservation_id IN (${eligibleSubquery})`
        )
        .bind(...eligibleBinds),
      db
        .prepare(
          `DELETE FROM meter_fixed_fare_runs
           WHERE reservation_id IN (${eligibleSubquery})`
        )
        .bind(...eligibleBinds)
    );
  }

  statements.push(
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
              COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?
              AND COALESCE(reservation_id, '') = ''
            )
            OR estimate_no IN (
              SELECT estimate_no FROM reservations
              WHERE ${eligibleSql}
                AND COALESCE(estimate_no, '') != ''
            )`
      )
      .bind(...eligibleBinds, franchiseeId, storeId, ...eligibleBinds),
    db
      .prepare(
        `DELETE FROM email_logs
         WHERE reservation_id IN (${eligibleSubquery})`
      )
      .bind(...eligibleBinds)
  );

  if (resetScope === "full") {
    statements.push(
      db
        .prepare(
          `DELETE FROM pre_opening_reset_logs
           WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`
        )
        .bind(franchiseeId, storeId)
    );
  }

  statements.push(
    db
      .prepare(`DELETE FROM reservations WHERE ${eligibleSql}`)
      .bind(...eligibleBinds)
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
      : ["quote_consents", "quotes", "email_logs", "reservations"];
  const deleted = emptyCounts();
  const failed = emptyCounts();
  keys.forEach((key, index) => {
    const changes = Number(results?.[index]?.meta?.changes ?? 0);
    deleted[key] = changes;
    failed[key] = Math.max(0, Number(targets[key] || 0) - changes);
  });
  return { deleted, failed };
}

async function insertPreOpeningResetLog(db, row) {
  const result = await db
    .prepare(
      `INSERT INTO pre_opening_reset_logs (
        franchisee_id, store_id, executed_by, executed_at,
        targets_json, deleted_json, failed_json, success, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.franchiseeId,
      row.storeId,
      row.executedBy,
      row.executedAt,
      JSON.stringify(row.targets || {}),
      JSON.stringify(row.deleted || {}),
      JSON.stringify(row.failed || {}),
      row.success ? 1 : 0,
      row.errorMessage || null
    )
    .run();
  return Number(result?.meta?.last_row_id || 0) || null;
}

export async function executePreOpeningReset(
  db,
  { franchiseeId, storeId, executedBy, publicStartAt = "", resetScope = "reservations" }
) {
  const targets = await countPreOpeningResetTargets(db, franchiseeId, storeId, {
    publicStartAt,
    resetScope,
  });
  const executedAt = new Date().toISOString();
  const executedByValue = String(executedBy || "").trim() || "unknown";

  try {
    const results = await db.batch(
      buildPreOpeningResetDeleteStatements(db, franchiseeId, storeId, {
        publicStartAt,
        resetScope,
      })
    );
    const { deleted, failed } = deletedFromBatchResults(targets, results, resetScope);
    const logId = await insertPreOpeningResetLog(db, {
      franchiseeId,
      storeId,
      executedBy: executedByValue,
      executedAt,
      targets,
      deleted,
      failed,
      success: true,
    });
    return {
      ok: true,
      franchiseeId,
      storeId,
      executedBy: executedByValue,
      executedAt,
      resetScope,
      targets,
      deleted,
      failed,
      logId,
    };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 500);
    const failed = { ...targets };
    const deleted = emptyCounts();
    const logId = await insertPreOpeningResetLog(db, {
      franchiseeId,
      storeId,
      executedBy: executedByValue,
      executedAt,
      targets,
      deleted,
      failed,
      success: false,
      errorMessage: message,
    }).catch(() => null);
    return {
      ok: false,
      status: 500,
      message,
      franchiseeId,
      storeId,
      executedBy: executedByValue,
      executedAt,
      resetScope,
      targets,
      deleted,
      failed,
      logId,
    };
  }
}

export function buildPreOpeningResetCapabilityResponse(
  tenantScope,
  targets,
  dashboard,
  resetScope = "reservations"
) {
  const response = { supported: true, scope: resetScope };
  if (tenantScope?.ok) {
    response.franchiseeId = tenantScope.franchiseeId;
    response.storeId = tenantScope.storeId;
    response.targets = targets || emptyCounts();
    response.dashboard = dashboard || emptyDashboard();
  }
  return response;
}

export async function buildPreOpeningResetCapability(
  db,
  tenantScope,
  { publicStartAt = "", resetScope = "reservations" } = {}
) {
  if (!tenantScope?.ok) {
    return buildPreOpeningResetCapabilityResponse(null, emptyCounts(), emptyDashboard(), resetScope);
  }
  const [targets, dashboard] = await Promise.all([
    countPreOpeningResetTargets(db, tenantScope.franchiseeId, tenantScope.storeId, {
      publicStartAt,
      resetScope,
    }),
    countDashboardStats(db, tenantScope.franchiseeId, tenantScope.storeId),
  ]);
  return buildPreOpeningResetCapabilityResponse(tenantScope, targets, dashboard, resetScope);
}
