-- 004_updated_at_triggers.sql
-- updated_at maintenance triggers for tables.

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- skus
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skus') THEN
    DROP TRIGGER IF EXISTS trg_set_updated_at_skus ON skus;
    CREATE TRIGGER trg_set_updated_at_skus
      BEFORE UPDATE ON skus
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at_timestamp();
  END IF;

  -- ml_items
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ml_items') THEN
    DROP TRIGGER IF EXISTS trg_set_updated_at_ml_items ON ml_items;
    CREATE TRIGGER trg_set_updated_at_ml_items
      BEFORE UPDATE ON ml_items
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at_timestamp();
  END IF;

  -- tn_items
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tn_items') THEN
    DROP TRIGGER IF EXISTS trg_set_updated_at_tn_items ON tn_items;
    CREATE TRIGGER trg_set_updated_at_tn_items
      BEFORE UPDATE ON tn_items
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at_timestamp();
  END IF;

  -- sale_units
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sale_units') THEN
    DROP TRIGGER IF EXISTS trg_set_updated_at_sale_units ON sale_units;
    CREATE TRIGGER trg_set_updated_at_sale_units
      BEFORE UPDATE ON sale_units
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at_timestamp();
  END IF;
END $$;
