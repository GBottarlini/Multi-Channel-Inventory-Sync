// src/services/syncMlToDb.service.js
import { pool } from "../config/db.js";
import {
  getItem,
  normalizeItem,
  searchAllMyItems,
  searchMyItems,
} from "./mercadolibre.service.js";

async function mapInBatches(ids, batchSize, fn) {
  const out = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const batchRes = await Promise.all(batch.map(fn));
    out.push(...batchRes);
  }
  return out;
}

export async function syncMlItemsToDb({ mode = "all", limit = 50 } = {}) {
  // 1) Obtener lista de item_ids
  let itemIds = [];
  if (mode === "partial") {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 50));
    itemIds = await searchMyItems(safeLimit);
  } else {
    // mode === "all"
    itemIds = await searchAllMyItems();
  }

  // 2) Traer los items en batches para no saturar ML
  const items = await mapInBatches(itemIds, 10, (id) => getItem(id));
  const normalized = items.map(normalizeItem);

  // 3) Guardar en DB
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let withSku = 0;

    for (const it of normalized) {
      if (!it?.sku) continue;
      withSku++;

      // Upsert SKU (guardamos title e image como referencia)
      await client.query(
        `
        insert into skus (sku, title, image_url, updated_at)
        values ($1, $2, $3, now())
        on conflict (sku) do update set
          title = excluded.title,
          image_url = excluded.image_url,
          updated_at = now()
        `,
        [it.sku, it.title, it.image_url]
      );

      // Upsert ML item
      await client.query(
        `
        insert into ml_items (item_id, sku, title, stock_ml, image_url, permalink, sku_source, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, now())
        on conflict (item_id) do update set
          sku = excluded.sku,
          title = excluded.title,
          stock_ml = excluded.stock_ml,
          image_url = excluded.image_url,
          permalink = excluded.permalink,
          sku_source = excluded.sku_source,
          updated_at = now()
        `,
        [
          it.item_id,
          it.sku,
          it.title,
          Number(it.stock_ml) || 0,
          it.image_url,
          it.permalink,
          it.sku_source,
        ]
      );

      // ✅ MODO INICIAL:
      // Si el stock maestro NO fue inicializado, lo inicializamos con el stock de ML.
      await client.query(
        `
        update skus
        set stock = $2, is_initialized = true, updated_at = now()
        where sku = $1 and is_initialized = false
        `,
        [it.sku, Number(it.stock_ml) || 0]
      );

      // Upsert sale_unit (por listing)
      // ML: external_id = item_id
      await client.query(
        `
        INSERT INTO sale_units (channel, external_id, external_sku, linked_sku)
        VALUES ('ml', $1, $2, $3)
        ON CONFLICT (channel, external_id) DO UPDATE SET
          external_sku = EXCLUDED.external_sku,
          linked_sku = EXCLUDED.linked_sku
        `,
        [it.item_id, it.sku, it.sku]
      );
    }

    await client.query("COMMIT");

    return {
      mode,
      total_item_ids: itemIds.length,
      fetched_items: normalized.length,
      with_sku: withSku,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
