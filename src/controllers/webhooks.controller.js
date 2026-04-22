// src/controllers/webhooks.controller.js
import crypto from "crypto";
import { applyStockDeltas } from "../services/stock.service.js";
import { getOrderByResourceUrl } from "../services/mercadolibre.service.js";
import {
  getSaleUnitWithComponents,
  getSkuByMlItemId,
  getSkuByTnIds,
} from "../services/saleUnits.service.js";
import { env } from "../config/env.js";

async function getOrderData(resourceUrl) {
  try {
    return await getOrderByResourceUrl(resourceUrl);
  } catch (error) {
    console.error(
      `[ML Webhook] Error fetching order data from ${resourceUrl}:`,
      error?.response?.data || error.message
    );
    throw new Error("Could not fetch order data.");
  }
}

function safeCompareSignature(a, b) {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyTnWebhook(req) {
  const secret = env.tiendaNubeWebhookSecret || env.tiendaNubeClientSecret;
  if (!secret) {
    if (env.nodeEnv === "production") {
      return { ok: false, reason: "missing_secret" };
    }
    return { ok: true, skipped: true };
  }

  const signature = req.get("x-linkedstore-hmac-sha256");
  if (!signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return { ok: false, reason: "missing_raw_body" };
  }

  const expectedBase64 = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const ok =
    safeCompareSignature(signature, expectedBase64) ||
    safeCompareSignature(signature, expectedHex);

  return { ok, expectedBase64, expectedHex };
}

export async function handleMlWebhook(req, res) {
  const { body } = req;
  console.log(
    `[ML Webhook] Notificacion recibida. topic='${body?.topic}' resource='${body?.resource}'`
  );

  // ML envia un ping de prueba al crear el webhook.
  if (body.topic === "test_topic") {
    console.log("[ML Webhook] Ping de prueba recibido y verificado.");
    return res.status(200).send("OK");
  }

  // Verificamos que sea una notificacion de orden
  if (body.topic !== "orders_v2") {
    console.log(`[ML Webhook] Ignorando topico '${body.topic}'.`);
    return res.status(200).send("OK, topic ignored");
  }

  // Respondemos 200 OK inmediatamente para evitar reintentos de ML.
  res.status(200).send("OK");

  // --- Procesamiento asincrono ---
  try {
    const order = await getOrderData(body.resource);
    console.log(
      `[ML Webhook] Orden obtenida. order_id='${order?.id}' status='${order?.status}'`
    );

    if (order.status !== "paid") {
      console.log(`[ML Webhook] Ignorando orden con status '${order.status}'.`);
      return;
    }

    const orderItems = Array.isArray(order.order_items)
      ? order.order_items
      : [];

    const deltasBySku = new Map();
    const orderId = String(order?.id ?? "");
    const ref = orderId ? `ml:order:${orderId}` : null;

    for (const line of orderItems) {
      const itemId = String(line?.item?.id ?? "");
      const purchasedQty = Number(line?.quantity);
      const fallbackSku = line?.item?.seller_sku ? String(line.item.seller_sku) : null;

      if (!itemId) {
        console.warn(`[ML Webhook] Linea sin item_id en orden ${orderId}. Ignorando.`);
        continue;
      }
      if (!Number.isFinite(purchasedQty) || purchasedQty <= 0) {
        console.warn(
          `[ML Webhook] Linea item_id=${itemId} en orden ${orderId} sin cantidad valida. Ignorando.`
        );
        continue;
      }

      const saleUnit = await getSaleUnitWithComponents({ channel: "ml", externalId: itemId });

      let components = saleUnit?.components ?? [];
      if (components.length === 0) {
        const linkedSku = saleUnit?.linked_sku || fallbackSku || (await getSkuByMlItemId(itemId));
        if (linkedSku) {
          components = [{ component_sku: linkedSku, qty: 1 }];
        }
      }

      if (components.length === 0) {
        console.warn(
          `[ML Webhook] Sin mapeo de SKU/BOM para item_id=${itemId} en orden ${orderId}.`
        );
        continue;
      }

      for (const c of components) {
        const componentSku = c.component_sku;
        const qty = Number(c.qty);
        if (!componentSku || !Number.isFinite(qty) || qty <= 0) continue;

        const delta = -qty * purchasedQty;
        deltasBySku.set(componentSku, (deltasBySku.get(componentSku) || 0) + delta);
      }
    }

    const deltas = Array.from(deltasBySku.entries())
      .filter(([, delta]) => Number.isFinite(delta) && delta !== 0)
      .map(([sku, delta]) => ({ sku, delta, reason: "sale_ml", ref }));

    const result = await applyStockDeltas(deltas);
    console.log(
      `[ML Webhook] Orden ${orderId} aplicada. skus_actualizados=${result.updated.length}`
    );
  } catch (error) {
    console.error("[ML Webhook] Error procesando la notificacion de orden:", error);
    // El error ya fue logueado, no hacemos nada mas.
    // El webhook ya respondio 200, por lo que ML no reintentara.
  }
}

export async function handleTnWebhook(req, res) {
  const verification = verifyTnWebhook(req);
  if (!verification.ok) {
    console.warn(
      "[TN Webhook] Firma invalida:",
      verification.reason || "signature_mismatch"
    );
    if (verification.reason === "missing_secret") {
      return res.status(500).send("Webhook secret not configured");
    }
    return res.status(401).send("Invalid signature");
  }

  const { body: notification } = req;
  const event = req.get("x-tiendanube-event");

  console.log(`[TN Webhook] Notificacion recibida. Evento: '${event}' order_id='${notification?.id}'`);

  // Respondemos 200 OK inmediatamente.
  res.status(200).send("OK");

  // --- Procesamiento asincrono ---
  if (event !== "order/paid") {
    console.log(`[TN Webhook] Ignorando evento '${event}'.`);
    return;
  }

  try {
    const order = notification; // El body es el objeto de la orden
    const products = Array.isArray(order?.products) ? order.products : [];

    console.log(`[TN Webhook] Procesando orden pagada ID: ${order.id}`);

    const deltasBySku = new Map();
    const orderId = String(order?.id ?? "");
    const ref = orderId ? `tn:order:${orderId}` : null;

    for (const product of products) {
      const productId = product?.product_id;
      const variantId = product?.variant_id;
      const externalId =
        productId != null && variantId != null
          ? `${productId}:${variantId}`
          : "";

      const purchasedQty = Number(product?.quantity);
      const fallbackSku = product?.sku ? String(product.sku) : null;

      if (!externalId) {
        console.warn(`[TN Webhook] Linea sin product_id/variant_id en orden ${orderId}. Ignorando.`);
        continue;
      }
      if (!Number.isFinite(purchasedQty) || purchasedQty <= 0) {
        console.warn(
          `[TN Webhook] Linea external_id=${externalId} en orden ${orderId} sin cantidad valida. Ignorando.`
        );
        continue;
      }

      const saleUnit = await getSaleUnitWithComponents({ channel: "tn", externalId });

      let components = saleUnit?.components ?? [];
      if (components.length === 0) {
        const linkedSku =
          saleUnit?.linked_sku ||
          fallbackSku ||
          (await getSkuByTnIds(productId, variantId));
        if (linkedSku) {
          components = [{ component_sku: linkedSku, qty: 1 }];
        }
      }

      if (components.length === 0) {
        console.warn(
          `[TN Webhook] Sin mapeo de SKU/BOM para external_id=${externalId} en orden ${orderId}.`
        );
        continue;
      }

      for (const c of components) {
        const componentSku = c.component_sku;
        const qty = Number(c.qty);
        if (!componentSku || !Number.isFinite(qty) || qty <= 0) continue;

        const delta = -qty * purchasedQty;
        deltasBySku.set(componentSku, (deltasBySku.get(componentSku) || 0) + delta);
      }
    }

    const deltas = Array.from(deltasBySku.entries())
      .filter(([, delta]) => Number.isFinite(delta) && delta !== 0)
      .map(([sku, delta]) => ({ sku, delta, reason: "sale_tn", ref }));

    const result = await applyStockDeltas(deltas);
    console.log(
      `[TN Webhook] Orden ${orderId} aplicada. skus_actualizados=${result.updated.length}`
    );
  } catch (error) {
    console.error("[TN Webhook] Error procesando la notificacion de orden:", error);
  }
}
