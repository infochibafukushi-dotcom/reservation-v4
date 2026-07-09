export const PRE_OPENING_RESET_CONFIRM_TEXT = "RESET";

const RESERVATION_SCOPE_SQL = `COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`;

function emptyCounts() {
  return {
    reservations: 0,
    blocks: 0,
    quotes: 0,
    quote_consents: 0,
    meter_fixed_fare_runs: 0,
    email_logs: 0,
    pre_opening_reset_logs: 0,
  };
}

export function normalizePreOpeningResetScope(input) {
  const franchiseeId = String(input?.franchiseeId ?? input?.franchisee_id ?? "").trim();
  const storeId = String(input?.storeId ?? input?.store_id ?? "").trim();
  if (!franchiseeId || !storeId) {
    return { ok: false, status: 400, message: "franchiseeId と storeId は必須です" };
  }
  return { ok: true, franchiseeId, storeId };
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

export async function countPreOpeningResetTargets(db, franchiseeId, storeId) {
  const counts = emptyCounts();
  counts.reservations = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM reservations WHERE ${RESERVATION_SCOPE_SQL}`,
    franchiseeId,
    storeId
  );
  counts.blocks = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM blocks
     WHERE reservation_id IN (
       SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
     )`,
    franchiseeId,
    storeId
  );
  counts.meter_fixed_fare_runs = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM meter_fixed_fare_runs
     WHERE reservation_id IN (
       SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
     )`,
    franchiseeId,
    storeId
  );
  counts.quotes = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM quotes
     WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?
        OR reservation_id IN (
          SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
        )`,
    franchiseeId,
    storeId,
    franchiseeId,
    storeId
  );
  counts.quote_consents = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM quote_consents
     WHERE reservation_id IN (
         SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
       )
        OR estimate_no IN (
          SELECT estimate_no FROM reservations
          WHERE ${RESERVATION_SCOPE_SQL}
            AND COALESCE(estimate_no, '') != ''
          UNION
          SELECT estimate_no FROM quotes
          WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?
            AND COALESCE(estimate_no, '') != ''
        )`,
    franchiseeId,
    storeId,
    franchiseeId,
    storeId,
    franchiseeId,
    storeId
  );
  counts.email_logs = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM email_logs
     WHERE reservation_id IN (
       SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
     )`,
    franchiseeId,
    storeId
  );
  counts.pre_opening_reset_logs = await countScalar(
    db,
    `SELECT COUNT(*) AS c FROM pre_opening_reset_logs
     WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`,
    franchiseeId,
    storeId
  );
  return counts;
}

function buildPreOpeningResetDeleteStatements(db, franchiseeId, storeId) {
  return [
    db
      .prepare(
        `DELETE FROM blocks
         WHERE reservation_id IN (
           SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
         )`
      )
      .bind(franchiseeId, storeId),
    db
      .prepare(
        `DELETE FROM meter_fixed_fare_runs
         WHERE reservation_id IN (
           SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
         )`
      )
      .bind(franchiseeId, storeId),
    db
      .prepare(
        `DELETE FROM quote_consents
         WHERE reservation_id IN (
             SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
           )
            OR estimate_no IN (
              SELECT estimate_no FROM reservations
              WHERE ${RESERVATION_SCOPE_SQL}
                AND COALESCE(estimate_no, '') != ''
              UNION
              SELECT estimate_no FROM quotes
              WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?
                AND COALESCE(estimate_no, '') != ''
            )`
      )
      .bind(franchiseeId, storeId, franchiseeId, storeId, franchiseeId, storeId),
    db
      .prepare(
        `DELETE FROM quotes
         WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?
            OR reservation_id IN (
              SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
            )`
      )
      .bind(franchiseeId, storeId, franchiseeId, storeId),
    db
      .prepare(
        `DELETE FROM email_logs
         WHERE reservation_id IN (
           SELECT id FROM reservations WHERE ${RESERVATION_SCOPE_SQL}
         )`
      )
      .bind(franchiseeId, storeId),
    db
      .prepare(
        `DELETE FROM pre_opening_reset_logs
         WHERE COALESCE(franchisee_id, '') = ? AND COALESCE(store_id, '') = ?`
      )
      .bind(franchiseeId, storeId),
    db
      .prepare(`DELETE FROM reservations WHERE ${RESERVATION_SCOPE_SQL}`)
      .bind(franchiseeId, storeId),
  ];
}

function deletedFromBatchResults(targets, results) {
  const keys = [
    "blocks",
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
  return { deleted, failed };
}

export async function executePreOpeningReset(db, { franchiseeId, storeId, executedBy }) {
  const targets = await countPreOpeningResetTargets(db, franchiseeId, storeId);
  const executedAt = new Date().toISOString();
  const executedByValue = String(executedBy || "").trim() || "unknown";

  try {
    const results = await db.batch(buildPreOpeningResetDeleteStatements(db, franchiseeId, storeId));
    const { deleted, failed } = deletedFromBatchResults(targets, results);
    return {
      ok: true,
      franchiseeId,
      storeId,
      executedBy: executedByValue,
      executedAt,
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
      franchiseeId,
      storeId,
      executedBy: executedByValue,
      executedAt,
      targets,
      deleted,
      failed,
      logId: null,
    };
  }
}

export function buildPreOpeningResetCapabilityResponse(scope, targets) {
  const response = { supported: true };
  if (scope?.ok) {
    response.franchiseeId = scope.franchiseeId;
    response.storeId = scope.storeId;
    response.targets = targets || emptyCounts();
  }
  return response;
}
