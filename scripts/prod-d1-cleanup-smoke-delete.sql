-- Targeted delete: prod-smoke test reservations only
-- IDs: 209912231600, 209912240800
-- Keeps: email_logs, settings, config, manual blocks

DELETE FROM blocks
WHERE reservation_id IN ('209912231600', '209912240800');

DELETE FROM meter_fixed_fare_runs
WHERE reservation_id IN ('209912231600', '209912240800');

DELETE FROM quote_consents
WHERE reservation_id IN ('209912231600', '209912240800')
   OR estimate_no = 'EST-PROD-SMOKE-1782636116';

DELETE FROM quotes
WHERE reservation_id IN ('209912231600', '209912240800')
   OR estimate_no = 'EST-PROD-SMOKE-1782636116';

DELETE FROM reservations
WHERE id IN ('209912231600', '209912240800');
