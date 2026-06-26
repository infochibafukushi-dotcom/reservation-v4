-- 本番確認用: <estimateNo> を実際の値に置換
-- wrangler d1 execute DB --remote --file=scripts/prod-d1-verify-after-test.sql

SELECT estimate_no, status, selected_route_id, selected_overall_route_id, use_toll,
       fixed_fare_total, snapshot_hash, substr(quote_snapshot, 1, 120) AS snapshot_head,
       created_at, expires_at, consumed_at, reservation_id
FROM quotes WHERE estimate_no = '<estimateNo>';

SELECT id, estimate_no, confirmed_fare, fixed_fare_total, consent_at, quote_snapshot_hash,
       pre_fixed_fare_confirmable, selected_route_id, use_toll,
       substr(quote_snapshot, 1, 120) AS snapshot_head, created_at
FROM reservations WHERE estimate_no = '<estimateNo>';

SELECT id, estimate_no, reservation_id, consent_at, consent_text, consent_text_version,
       snapshot_hash, user_agent, ip_hash, created_at
FROM quote_consents WHERE estimate_no = '<estimateNo>' ORDER BY id DESC;
