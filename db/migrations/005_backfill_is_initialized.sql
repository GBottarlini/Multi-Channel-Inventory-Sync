-- 005_backfill_is_initialized.sql
-- Backfill skus.is_initialized based on existing data.

UPDATE skus s
SET is_initialized = true
WHERE s.is_initialized = false
  AND (
    s.stock <> 0
    OR EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku)
    OR EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku)
  );
