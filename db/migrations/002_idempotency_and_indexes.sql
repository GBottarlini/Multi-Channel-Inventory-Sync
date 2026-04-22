-- 002_idempotency_and_indexes.sql
-- Idempotency guard for stock_ledger + performance indexes.

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_ledger_sku_reason_ref_notnull
  ON stock_ledger (sku, reason, ref)
  WHERE ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ml_items_sku
  ON ml_items (sku);

CREATE INDEX IF NOT EXISTS idx_tn_items_sku
  ON tn_items (sku);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_sku_created_at_desc
  ON stock_ledger (sku, created_at DESC);
