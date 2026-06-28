-- Post-cleanup verification (read-only)
SELECT COUNT(*) AS reservations_count FROM reservations;
SELECT COUNT(*) AS blocks_with_reservation_count FROM blocks WHERE reservation_id IS NOT NULL AND reservation_id != '';
SELECT COUNT(*) AS quotes_count FROM quotes;
SELECT COUNT(*) AS quote_consents_count FROM quote_consents;
SELECT COUNT(*) AS meter_fixed_fare_runs_count FROM meter_fixed_fare_runs;
SELECT COUNT(*) AS email_logs_count FROM email_logs;
SELECT COUNT(*) AS settings_count FROM settings;

SELECT id FROM reservations WHERE id IN ('209906021400','209906041030','209912281000');
SELECT id FROM reservations ORDER BY id;
SELECT reservation_id FROM meter_fixed_fare_runs ORDER BY reservation_id;
SELECT estimate_no, reservation_id FROM quotes ORDER BY estimate_no;

SELECT key, value FROM settings WHERE key IN ('fixed_fare_enabled', 'allowed_origins');
