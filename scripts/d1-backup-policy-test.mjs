import assert from 'node:assert/strict'
import {
  D1_CUSTOM_BACKUP_ENABLED,
  D1_TIME_TRAVEL_RETENTION_DAYS,
  D1_BACKUP_POLICY_SUMMARY,
} from '../d1-backup-policy.js'

assert.equal(D1_TIME_TRAVEL_RETENTION_DAYS, 30)
assert.equal(D1_CUSTOM_BACKUP_ENABLED, false)
assert.match(D1_BACKUP_POLICY_SUMMARY, /Time Travel/)
console.log('d1-backup-policy: ok')
