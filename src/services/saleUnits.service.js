// src/services/saleUnits.service.js
import { pool } from "../config/db.js";

/**
 * Upsert de una unidad de venta (listing/variant) a SKU interno.
 * @param {object} params
 * @param {'ml'|'tn'} params.channel
 * @param {string} params.externalId
 * @param {string|null} [params.externalSku]
 * @param {string|null} [params.linkedSku]
 */
export async function upsertSaleUnit({
  channel,
  externalId,
  externalSku = null,
  linkedSku = null,
}) {
  if (!channel || !externalId) {
    throw new Error("upsertSaleUnit requiere channel y externalId");
  }

  const { rows } = await pool.query(
    `
    INSERT INTO sale_units (channel, external_id, external_sku, linked_sku)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (channel, external_id) DO UPDATE SET
      external_sku = EXCLUDED.external_sku,
      linked_sku = EXCLUDED.linked_sku
    RETURNING id, channel, external_id, external_sku, linked_sku
    `,
    [channel, externalId, externalSku, linkedSku]
  );

  return rows[0];
}

/**
 * Devuelve una sale_unit con sus componentes BOM (si hay).
 * @param {object} params
 * @param {'ml'|'tn'} params.channel
 * @param {string} params.externalId
 */
export async function getSaleUnitWithComponents({ channel, externalId }) {
  const { rows } = await pool.query(
    `
    SELECT
      su.id,
      su.linked_sku,
      suc.component_sku,
      suc.qty
    FROM sale_units su
    LEFT JOIN sale_unit_components suc
      ON suc.sale_unit_id = su.id
    WHERE su.channel = $1 AND su.external_id = $2
    ORDER BY suc.component_sku ASC
    `,
    [channel, externalId]
  );

  if (rows.length === 0) return null;

  const first = rows[0];
  const components = rows
    .filter((r) => r.component_sku)
    .map((r) => ({ component_sku: r.component_sku, qty: Number(r.qty) }));

  return {
    id: first.id,
    linked_sku: first.linked_sku,
    components,
  };
}

export async function getSkuByMlItemId(itemId) {
  const { rows } = await pool.query(
    "SELECT sku FROM ml_items WHERE item_id = $1",
    [itemId]
  );
  return rows[0]?.sku ?? null;
}

export async function getSkuByTnIds(productId, variantId) {
  const { rows } = await pool.query(
    "SELECT sku FROM tn_items WHERE product_id = $1 AND variant_id = $2",
    [productId, variantId]
  );
  return rows[0]?.sku ?? null;
}
