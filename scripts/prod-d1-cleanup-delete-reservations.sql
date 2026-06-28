-- Production reservation cleanup (physical delete)
-- Target DB: reservation-db (remote)
-- Keeps: settings, config, menu, email_logs, manual blocks (no reservation_id)
-- Deletes: reservation-linked child data then reservations

DELETE FROM blocks
WHERE reservation_id IS NOT NULL AND reservation_id != '';

DELETE FROM meter_fixed_fare_runs;

DELETE FROM quote_consents;

DELETE FROM quotes;

DELETE FROM reservations;
