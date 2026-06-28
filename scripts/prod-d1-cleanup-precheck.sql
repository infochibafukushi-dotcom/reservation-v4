-- Pre-cleanup inventory (read-only) - split for D1
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

SELECT COUNT(*) AS reservations_count FROM reservations;
SELECT COUNT(*) AS blocks_count FROM blocks;
SELECT COUNT(*) AS quotes_count FROM quotes;
SELECT COUNT(*) AS quote_consents_count FROM quote_consents;
SELECT COUNT(*) AS meter_fixed_fare_runs_count FROM meter_fixed_fare_runs;
SELECT COUNT(*) AS email_logs_count FROM email_logs;
SELECT COUNT(*) AS settings_count FROM settings;

SELECT r.id, r.date, r.time, r.status, COALESCE(r.is_visible,1) AS is_visible,
       r.pre_fixed_fare_confirmable, r.estimate_no,
       m.status AS meter_run_status, m.completion_status, m.completion_reason
FROM reservations r
LEFT JOIN meter_fixed_fare_runs m ON m.reservation_id = r.id
ORDER BY r.id;

SELECT estimate_no, status, reservation_id, created_at, consumed_at
FROM quotes ORDER BY created_at DESC;

SELECT id, estimate_no, reservation_id, created_at FROM quote_consents ORDER BY id;

SELECT id, date, time, type, reservation_id FROM blocks WHERE reservation_id IS NOT NULL AND reservation_id != '' ORDER BY id;

SELECT id, kind, reservation_id, subject, status, created_at FROM email_logs ORDER BY id DESC LIMIT 20;
