-- 001_skus_is_initialized_and_stock_check.sql
-- Adds skus.is_initialized + non-negative stock constraint.

ALTER TABLE skus
  ADD COLUMN IF NOT EXISTS is_initialized boolean;

UPDATE skus
SET is_initialized = false
WHERE is_initialized IS NULL;

ALTER TABLE skus
  ALTER COLUMN is_initialized SET DEFAULT false;

ALTER TABLE skus
  ALTER COLUMN is_initialized SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_skus_stock_non_negative'
      AND conrelid = 'skus'::regclass
  ) THEN
    ALTER TABLE skus
      ADD CONSTRAINT ck_skus_stock_non_negative
      CHECK (stock >= 0);
  END IF;
END $$;
