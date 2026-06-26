-- 事前確定M 旅客都合途中終了メタデータ
ALTER TABLE meter_fixed_fare_runs ADD COLUMN completion_status TEXT;
ALTER TABLE meter_fixed_fare_runs ADD COLUMN completion_reason TEXT;
ALTER TABLE meter_fixed_fare_runs ADD COLUMN pre_fixed_fare_exception_json TEXT;
