/**
 * reservation-v4 D1 バックアップ方針
 *
 * Cloudflare D1 Time Travel:
 * - Free: 7日 / Workers Paid: 30日
 * - 本アカウントでは 8日・25日前の bookmark が取得できたため、
 *   実質 30日 Time Travel（Paid 相当）が利用可能。
 *
 * 方針: 独自バックアップ（R2 export 等）は作らない。
 * 新しい R2・有料プラン追加・復元操作は実行しない。
 */

export const D1_TIME_TRAVEL_RETENTION_DAYS = 30
export const D1_CUSTOM_BACKUP_ENABLED = false
export const D1_BACKUP_POLICY_SUMMARY =
  'Cloudflare D1 Time Travel（30日）を利用。独自バックアップ・R2 export・復元は行わない。'
