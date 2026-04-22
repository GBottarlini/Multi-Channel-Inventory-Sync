// src/services/stock.service.js
import { pool } from "../config/db.js";
import { updateMlItemStock } from "./mercadolibre.service.js";
import { updateTnItemStock } from "./tiendanube.service.js";

/**
 * Obtiene todos los SKUs de la base de datos.
 * @returns {Promise<Array>} Una lista de todos los SKUs con su informacion.
 */
export async function getAllSkus() {
  try {
    const { rows } = await pool.query(
      "SELECT sku, title, stock, image_url, updated_at FROM skus ORDER BY updated_at DESC"
    );
    return rows;
  } catch (error) {
    console.error("Error fetching all SKUs:", error);
    throw error;
  }
}

/**
 * Obtiene todos los SKUs con info de origen (ML/TN).
 * @returns {Promise<Array>} Una lista de SKUs con flags has_ml/has_tn.
 */
export async function getAllSkusWithSources() {
  try {
    const { rows } = await pool.query(
      `SELECT s.sku, s.title, s.stock, s.image_url, s.updated_at,
        EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku) AS has_ml,
        EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku) AS has_tn,
        (SELECT m.permalink FROM ml_items m
          WHERE m.sku = s.sku AND m.permalink IS NOT NULL
          ORDER BY m.updated_at DESC NULLS LAST
          LIMIT 1) AS ml_permalink,
        (SELECT t.product_id FROM tn_items t
          WHERE t.sku = s.sku
          ORDER BY t.updated_at DESC NULLS LAST
          LIMIT 1) AS tn_product_id,
        (SELECT t.variant_id FROM tn_items t
          WHERE t.sku = s.sku
          ORDER BY t.updated_at DESC NULLS LAST
          LIMIT 1) AS tn_variant_id
       FROM skus s
       ORDER BY s.updated_at DESC`
    );
    return rows;
  } catch (error) {
    console.error("Error fetching SKUs with sources:", error);
    throw error;
  }
}

/**
 * Obtiene SKUs con paginacion y filtros.
 * @param {object} params
 * @param {number} params.limit
 * @param {number} params.offset
 * @param {string} [params.query]
 * @param {boolean} [params.linkedOnly]
 * @param {string} [params.sort]
 */
export async function getSkusPage({
  limit = 50,
  offset = 0,
  query = "",
  linkedOnly = false,
  sort = "stock_desc",
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeQuery = String(query || "").trim();

  const whereParts = [];
  const whereValues = [];
  let idx = 1;

  if (safeQuery) {
    whereParts.push(`(s.sku ILIKE $${idx} OR s.title ILIKE $${idx})`);
    whereValues.push(`%${safeQuery}%`);
    idx += 1;
  }

  if (linkedOnly) {
    whereParts.push(
      `EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku)
       AND EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku)`
    );
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const sortMap = {
    stock_desc: "s.stock DESC",
    stock_asc: "s.stock ASC",
    updated_desc: "s.updated_at DESC",
  };
  const orderBy = sortMap[sort] || sortMap.stock_desc;

  try {
    const itemsQuery = `
      SELECT s.sku, s.title, s.stock, s.image_url, s.updated_at,
        EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku) AS has_ml,
        EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku) AS has_tn,
        (SELECT m.permalink FROM ml_items m
          WHERE m.sku = s.sku AND m.permalink IS NOT NULL
          ORDER BY m.updated_at DESC NULLS LAST
          LIMIT 1) AS ml_permalink,
        (SELECT t.product_id FROM tn_items t
          WHERE t.sku = s.sku
          ORDER BY t.updated_at DESC NULLS LAST
          LIMIT 1) AS tn_product_id,
        (SELECT t.variant_id FROM tn_items t
          WHERE t.sku = s.sku
          ORDER BY t.updated_at DESC NULLS LAST
          LIMIT 1) AS tn_variant_id
      FROM skus s
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const itemsValues = [...whereValues, safeLimit, safeOffset];

    const totalQuery = `
      SELECT COUNT(*)::int AS total
      FROM skus s
      ${whereClause}
    `;

    const statsQuery = `
      SELECT
        (SELECT COUNT(*)::int FROM skus) AS total,
        (SELECT COUNT(*)::int FROM skus s
          WHERE EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku)
            AND EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku)) AS linked,
        (SELECT COUNT(*)::int FROM skus s
          WHERE EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku)
            AND NOT EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku)) AS ml_only,
        (SELECT COUNT(*)::int FROM skus s
          WHERE NOT EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku)
            AND EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku)) AS tn_only
    `;

    const [itemsRes, totalRes, statsRes] = await Promise.all([
      pool.query(itemsQuery, itemsValues),
      pool.query(totalQuery, whereValues),
      pool.query(statsQuery),
    ]);

    return {
      items: itemsRes.rows,
      total: totalRes.rows[0]?.total ?? 0,
      stats: statsRes.rows[0] || { total: 0, linked: 0, ml_only: 0, tn_only: 0 },
    };
  } catch (error) {
    console.error("Error fetching paged SKUs:", error);
    throw error;
  }
}

/**
 * Obtiene solo los SKUs vinculados en ML y TN.
 * @returns {Promise<Array>} Una lista de SKUs con has_ml/has_tn en true.
 */
export async function getLinkedSkus() {
  try {
    const { rows } = await pool.query(
      `SELECT s.sku, s.title, s.stock, s.image_url, s.updated_at,
        true AS has_ml,
        true AS has_tn,
        (SELECT m.permalink FROM ml_items m
          WHERE m.sku = s.sku AND m.permalink IS NOT NULL
          ORDER BY m.updated_at DESC NULLS LAST
          LIMIT 1) AS ml_permalink,
        (SELECT t.product_id FROM tn_items t
          WHERE t.sku = s.sku
          ORDER BY t.updated_at DESC NULLS LAST
          LIMIT 1) AS tn_product_id,
        (SELECT t.variant_id FROM tn_items t
          WHERE t.sku = s.sku
          ORDER BY t.updated_at DESC NULLS LAST
          LIMIT 1) AS tn_variant_id
       FROM skus s
       WHERE EXISTS (SELECT 1 FROM ml_items m WHERE m.sku = s.sku)
         AND EXISTS (SELECT 1 FROM tn_items t WHERE t.sku = s.sku)
       ORDER BY s.updated_at DESC`
    );
    return rows;
  } catch (error) {
    console.error("Error fetching linked SKUs:", error);
    throw error;
  }
}

/**
 * Obtiene un SKU especifico por su identificador.
 * @param {string} sku - El SKU a obtener.
 * @returns {Promise<object>} El objeto del SKU.
 */
export async function getSkuBySku(sku) {
  try {
    const { rows } = await pool.query(
      "SELECT sku, title, stock, image_url, updated_at FROM skus WHERE sku = $1",
      [sku]
    );
    return rows[0];
  } catch (error) {
    console.error(`Error fetching SKU ${sku}:`, error);
    throw error;
  }
}

/**
 * Obtiene todos los item_id de MercadoLibre asociados a un SKU.
 * @param {string} sku
 * @returns {Promise<string[]>}
 */
async function getMlItemsBySku(sku) {
  try {
    const { rows } = await pool.query(
      "SELECT item_id FROM ml_items WHERE sku = $1",
      [sku]
    );
    return rows.map((r) => r.item_id);
  } catch (error) {
    console.error(`Error fetching ML items for SKU ${sku}:`, error);
    return []; // Devolvemos un array vacio para no detener el flujo principal.
  }
}

/**
 * Obtiene todos los product_id/variant_id de TiendaNube asociados a un SKU.
 * @param {string} sku
 * @returns {Promise<{product_id: number, variant_id: number}[]>}
 */
async function getTnItemsBySku(sku) {
  try {
    const { rows } = await pool.query(
      "SELECT product_id, variant_id FROM tn_items WHERE sku = $1",
      [sku]
    );
    return rows;
  } catch (error) {
    console.error(`Error fetching TN items for SKU ${sku}:`, error);
    return [];
  }
}

async function pushSkuStockToPlatforms({ sku, stock }) {
  // MercadoLibre
  const itemIdsToUpdateML = await getMlItemsBySku(sku);
  if (itemIdsToUpdateML.length > 0) {
    console.log(
      `[Stock Sync] Encontrados ${itemIdsToUpdateML.length} items de ML para SKU ${sku}. Actualizando stock a ${stock}...`
    );
    await Promise.all(itemIdsToUpdateML.map((itemId) => updateMlItemStock(itemId, stock)));
  }

  // TiendaNube
  const itemsToUpdateTN = await getTnItemsBySku(sku);
  if (itemsToUpdateTN.length > 0) {
    console.log(
      `[Stock Sync] Encontrados ${itemsToUpdateTN.length} items de TN para SKU ${sku}. Actualizando stock a ${stock}...`
    );
    await Promise.all(
      itemsToUpdateTN.map(({ product_id, variant_id }) =>
        updateTnItemStock(product_id, variant_id, stock)
      )
    );
  }
}

async function pushSaleUnitStock({ channel, externalId, stock }) {
  if (channel === "ml") {
    await updateMlItemStock(externalId, stock);
    return;
  }
  if (channel === "tn") {
    const [productIdRaw, variantIdRaw] = String(externalId).split(":");
    const productId = Number(productIdRaw);
    const variantId = Number(variantIdRaw);
    if (!Number.isFinite(productId) || !Number.isFinite(variantId)) {
      console.warn(
        `[Stock Sync] external_id TN invalido '${externalId}' (esperado product_id:variant_id).`
      );
      return;
    }
    await updateTnItemStock(productId, variantId, stock);
  }
}

async function pushDerivedSaleUnitsForComponentSkus(componentSkus = []) {
  const unique = Array.from(new Set(componentSkus.filter(Boolean)));
  if (unique.length === 0) return;

  // sale_units que dependen de alguno de estos componentes
  const { rows: units } = await pool.query(
    `
    SELECT DISTINCT su.id, su.channel, su.external_id
    FROM sale_units su
    JOIN sale_unit_components suc
      ON suc.sale_unit_id = su.id
    WHERE suc.component_sku = ANY($1::text[])
    `,
    [unique]
  );

  for (const u of units) {
    const { rows: comps } = await pool.query(
      `
      SELECT suc.component_sku, suc.qty, s.stock
      FROM sale_unit_components suc
      JOIN skus s ON s.sku = suc.component_sku
      WHERE suc.sale_unit_id = $1
      `,
      [u.id]
    );

    if (comps.length === 0) continue;

    let derived = Infinity;
    for (const c of comps) {
      const qty = Number(c.qty);
      const stock = Number(c.stock);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (!Number.isFinite(stock) || stock < 0) continue;
      derived = Math.min(derived, Math.floor(stock / qty));
    }

    if (!Number.isFinite(derived) || derived === Infinity) continue;

    await pushSaleUnitStock({
      channel: u.channel,
      externalId: u.external_id,
      stock: Math.max(derived, 0),
    });
  }
}

async function applyStockDeltaInTx(client, { sku, delta, reason, ref = null }) {
  const safeDelta = Number(delta);
  if (!Number.isFinite(safeDelta) || safeDelta === 0) {
    return { applied: false, sku, stock: null, skipped: "invalid_delta" };
  }

  const insertRes = await client.query(
    `
    INSERT INTO stock_ledger (sku, delta, reason, ref)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (sku, reason, ref) WHERE ref IS NOT NULL
    DO NOTHING
    RETURNING id
    `,
    [sku, safeDelta, reason, ref]
  );

  if (insertRes.rowCount === 0) {
    return { applied: false, sku, stock: null, skipped: "idempotent_conflict" };
  }

  const updateRes = await client.query(
    `
    UPDATE skus
    SET
      stock = GREATEST(stock + $2, 0),
      is_initialized = true,
      updated_at = now()
    WHERE sku = $1
    RETURNING sku, stock
    `,
    [sku, safeDelta]
  );

  if (updateRes.rowCount === 0) {
    throw new Error(`El SKU '${sku}' no existe.`);
  }

  return { applied: true, sku: updateRes.rows[0].sku, stock: updateRes.rows[0].stock };
}

/**
 * Aplica un delta de stock de forma atómica e idempotente.
 * - Inserta en stock_ledger con ON CONFLICT DO NOTHING
 * - Si insertó, actualiza skus.stock con clamp a 0 e is_initialized=true
 * Todo dentro de una transacción.
 */
export async function applyStockDelta({ sku, delta, reason, ref = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applyStockDeltaInTx(client, { sku, delta, reason, ref });
    await client.query("COMMIT");

    if (result.applied) {
      await pushSkuStockToPlatforms({ sku: result.sku, stock: result.stock });
      await pushDerivedSaleUnitsForComponentSkus([result.sku]);
    }
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Aplica múltiples deltas en UNA única transacción (para órdenes).
 * Devuelve los SKUs efectivamente actualizados (para logging/propagación).
 */
export async function applyStockDeltas(deltas = []) {
  const items = Array.isArray(deltas) ? deltas : [];
  if (items.length === 0) return { updated: [] };

  const client = await pool.connect();
  const updated = [];

  try {
    await client.query("BEGIN");

    for (const d of items) {
      const r = await applyStockDeltaInTx(client, d);
      if (r.applied) updated.push({ sku: r.sku, stock: r.stock });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Propagación post-commit
  for (const u of updated) {
    await pushSkuStockToPlatforms(u);
  }

  // Si un componente cambió, puede impactar kits/BOM por listing.
  await pushDerivedSaleUnitsForComponentSkus(updated.map((u) => u.sku));

  return { updated };
}

/**
 * Verifica si ya existe un movimiento de stock para un SKU y referencia.
 * @param {object} params
 * @param {string} params.sku
 * @param {string} params.reason
 * @param {string} params.ref
 * @returns {Promise<boolean>}
 */
async function hasStockLedgerEntry({ sku, reason, ref }) {
  if (!ref) return false;
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM stock_ledger WHERE sku = $1 AND reason = $2 AND ref = $3 LIMIT 1",
      [sku, reason, ref]
    );
    return rows.length > 0;
  } catch (error) {
    console.error(
      `Error checking stock ledger for SKU ${sku} (${reason}, ${ref}):`,
      error
    );
    return false;
  }
}

/**
 * Actualiza el stock para un SKU especifico, registra el movimiento y propaga el cambio.
 * @param {object} params
 * @param {string} params.sku - El SKU a actualizar.
 * @param {number} params.stock - El nuevo valor del stock.
 * @param {string} params.reason - La razon de la actualizacion (ej. 'manual_update', 'sale_ml', 'sale_tn').
 * @param {string} [params.notes] - Notas adicionales (ej. order_id).
 * @returns {Promise<object>} El SKU actualizado de la base de datos.
 */
export async function updateStock({ sku, stock, reason, notes = null }) {
  if (isNaN(stock) || stock < 0) {
    throw new Error("El stock debe ser un numero positivo.");
  }

  if (notes && (await hasStockLedgerEntry({ sku, reason, ref: notes }))) {
    console.log(
      `[Stock Sync] Movimiento ya registrado para ${sku} (${reason}, ${notes}).`
    );
    return getSkuBySku(sku);
  }

  const client = await pool.connect();
  let updatedSku;

  try {
    await client.query("BEGIN");

    const currentStockRes = await client.query(
      "SELECT stock FROM skus WHERE sku = $1 FOR UPDATE OF skus",
      [sku]
    );

    if (currentStockRes.rows.length === 0) {
      throw new Error(`El SKU '${sku}' no existe.`);
    }
    const oldStock = currentStockRes.rows[0].stock;
    const delta = stock - oldStock;

    const updatedSkuRes = await client.query(
      "UPDATE skus SET stock = $1, is_initialized = true, updated_at = now() WHERE sku = $2 RETURNING *",
      [stock, sku]
    );
    updatedSku = updatedSkuRes.rows[0];

    await client.query(
      "INSERT INTO stock_ledger (sku, delta, reason, ref) VALUES ($1, $2, $3, $4)",
      [sku, delta, reason, notes]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      console.warn(
        `[Stock Sync] Movimiento duplicado detectado para ${sku} (${reason}, ${notes}).`
      );
      return getSkuBySku(sku);
    }
    console.error(`Error al actualizar stock para ${sku} en DB:`, error);
    throw error; // Si falla la DB, no continuamos.
  } finally {
    client.release();
  }

  // --- Sincronizacion con plataformas (despues del commit) ---
  if (updatedSku) {
    console.log(`[Stock Sync] DB actualizada para ${sku}. Sincronizando plataformas...`);
    await pushSkuStockToPlatforms({ sku, stock });
    await pushDerivedSaleUnitsForComponentSkus([sku]);
  }

  return updatedSku;
}
