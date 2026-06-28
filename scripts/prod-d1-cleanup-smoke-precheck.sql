-- Precheck: prod-smoke reservations before targeted delete
SELECT id, date, time, status, is_visible, estimate_no, pre_fixed_fare_confirmable
FROM reservations
WHERE id IN ('209912231600', '209912240800')
ORDER BY id;

SELECT COUNT(*) AS reservations_count FROM reservations;

SELECT reservation_id, status, completion_status, completion_reason
FROM meter_fixed_fare_runs
WHERE reservation_id IN ('209912231600', '209912240800');

SELECT estimate_no, status, reservation_id, created_at, consumed_at
FROM quotes
WHERE reservation_id IN ('209912231600', '209912240800')
   OR estimate_no = 'EST-PROD-SMOKE-1782636116'
ORDER BY estimate_no;

SELECT id, estimate_no, reservation_id, created_at
FROM quote_consents
WHERE reservation_id IN ('209912231600', '209912240800')
   OR estimate_no = 'EST-PROD-SMOKE-1782636116'
ORDER BY id;

SELECT id, date, time, type, reservation_id
FROM blocks
WHERE reservation_id IN ('209912231600', '209912240800')
ORDER BY id;
