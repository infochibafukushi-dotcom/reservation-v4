-- 事前確定M 運行中状態リセット（復元不能時の救済）監査カラム
ALTER TABLE meter_fixed_fare_runs ADD COLUMN meter_run_status_reset_at TEXT;
ALTER TABLE meter_fixed_fare_runs ADD COLUMN meter_run_status_reset_by TEXT;
ALTER TABLE meter_fixed_fare_runs ADD COLUMN meter_run_status_reset_reason TEXT;
ALTER TABLE meter_fixed_fare_runs ADD COLUMN previous_meter_run_status TEXT;
