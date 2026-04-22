-- 003_sale_units_tables.sql
-- Sale units (listings/variants) and their BOM (components).

CREATE TABLE IF NOT EXISTS sale_units (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_sku TEXT,
  linked_sku TEXT REFERENCES skus(sku),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_sale_units_channel CHECK (channel IN ('ml', 'tn')),
  CONSTRAINT uq_sale_units_channel_external_id UNIQUE (channel, external_id)
);

CREATE TABLE IF NOT EXISTS sale_unit_components (
  sale_unit_id BIGINT NOT NULL REFERENCES sale_units(id) ON DELETE CASCADE,
  component_sku TEXT NOT NULL REFERENCES skus(sku) ON DELETE RESTRICT,
  qty INTEGER NOT NULL,
  CONSTRAINT ck_sale_unit_components_qty CHECK (qty > 0),
  CONSTRAINT uq_sale_unit_components UNIQUE (sale_unit_id, component_sku)
);

CREATE INDEX IF NOT EXISTS idx_sale_units_channel_external_id
  ON sale_units (channel, external_id);

CREATE INDEX IF NOT EXISTS idx_sale_units_external_sku
  ON sale_units (external_sku);

CREATE INDEX IF NOT EXISTS idx_sale_unit_components_sale_unit_id
  ON sale_unit_components (sale_unit_id);

CREATE INDEX IF NOT EXISTS idx_sale_unit_components_component_sku
  ON sale_unit_components (component_sku);
