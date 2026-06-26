-- 本番反映前: D1 現状確認（wrangler d1 execute --remote）
SELECT key, value FROM settings WHERE key IN ('fixed_fare_enabled', 'allowed_origins');

SELECT COUNT(*) AS quotes_count FROM quotes;
SELECT status, COUNT(*) AS cnt FROM quotes GROUP BY status;

SELECT COUNT(*) AS reservations_count FROM reservations;
SELECT COUNT(*) AS quote_consents_count FROM quote_consents;

-- 直近の見積・予約（存在する場合）
SELECT estimate_no, status, total_amount, snapshot_hash, created_at, consumed_at, reservation_id
FROM quotes ORDER BY created_at DESC LIMIT 5;

SELECT id, estimate_no, confirmed_fare, quote_snapshot_hash, consent_at, created_at
FROM reservations WHERE estimate_no IS NOT NULL AND estimate_no != ''
ORDER BY created_at DESC LIMIT 5;
