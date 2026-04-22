// src/services/syncTnToDb.service.js
import { pool } from "../config/db.js";
import {
  getAllProducts,
  normalizeTnProduct,
} from "./tiendanube.service.js";

export async function syncTnItemsToDb() {
  // 1) Obtener lista de productos de TiendaNube
  const products = await getAllProducts();

  // 2) Normalizar los productos a una lista plana de variantes con SKU
  const normalizedVariants = products.flatMap(normalizeTnProduct);

  // 3) Guardar en DB
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let withSku = 0;

    for (const v of normalizedVariants) {
      if (!v?.sku) continue;
      withSku++;

      // Upsert SKU (guardamos title e image como referencia)
      // Nota: Potencialmente sobreescribe datos de ML si se corre después.
      // Una mejor estrategia podría ser unificar el origen de la verdad o tener campos separados.
      await client.query(
        `
        insert into skus (sku, title, image_url, updated_at)
        values ($1, $2, $3, now())
        on conflict (sku) do update set
          title = excluded.title,
          image_url = excluded.image_url,
          updated_at = now()
        `,
        [v.sku, v.title, v.image_url]
      );

      // Upsert TN item (variante)
      await client.query(
        `
        insert into tn_items (product_id, variant_id, sku, title, stock_tn, image_url, price, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, now())
        on conflict (product_id, variant_id) do update set
          sku = excluded.sku,
          title = excluded.title,
          stock_tn = excluded.stock_tn,
          image_url = excluded.image_url,
          price = excluded.price,
          updated_at = now()
        `,
        [
          v.product_id,
          v.variant_id,
          v.sku,
          v.title,
          Number(v.stock_tn) || 0,
          v.image_url,
          v.price,
        ]
      );

      // ✅ MODO INICIAL:
      // Si el stock maestro NO fue inicializado, lo inicializamos con el stock de TN.
      await client.query(
        `
        update skus
        set stock = $2, is_initialized = true, updated_at = now()
        where sku = $1 and is_initialized = false
        `,
        [v.sku, Number(v.stock_tn) || 0]
      );

      // Upsert sale_unit (por variante)
      // TN: external_id = product_id:variant_id
      const externalId = `${v.product_id}:${v.variant_id}`;
      await client.query(
        `
        INSERT INTO sale_units (channel, external_id, external_sku, linked_sku)
        VALUES ('tn', $1, $2, $3)
        ON CONFLICT (channel, external_id) DO UPDATE SET
          external_sku = EXCLUDED.external_sku,
          linked_sku = EXCLUDED.linked_sku
        `,
        [externalId, v.sku, v.sku]
      );
    }

    await client.query("COMMIT");

    return {
      total_products: products.length,
      total_variants: normalizedVariants.length,
      with_sku: withSku,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
