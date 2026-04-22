// src/services/mercadolibre.service.js
import axios from "axios";
import { env } from "../config/env.js";

const ml = axios.create({
  baseURL: "https://api.mercadolibre.com",
  timeout: 20000,
});

let cachedAccessToken = env.mlAccessToken || null;
let cachedRefreshToken = env.mlRefreshToken || null;
let refreshInFlight = null;

async function refreshAccessToken() {
  if (!env.mlClientId || !env.mlClientSecret || !cachedRefreshToken) {
    throw new Error("ML refresh token no configurado");
  }

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = axios
    .post(
      "https://api.mercadolibre.com/oauth/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: env.mlClientId,
        client_secret: env.mlClientSecret,
        refresh_token: cachedRefreshToken,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    )
    .then(({ data }) => {
      if (!data?.access_token) {
        throw new Error("No se recibio access_token de Mercado Libre");
      }
      cachedAccessToken = data.access_token;
      if (data.refresh_token && data.refresh_token !== cachedRefreshToken) {
        cachedRefreshToken = data.refresh_token;
        console.log(
          "[ML Auth] Refresh token actualizado. Guarda ML_REFRESH_TOKEN en .env."
        );
      }
      console.log("[ML Auth] Access token renovado.");
      return cachedAccessToken;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

async function getAccessToken() {
  if (cachedAccessToken) return cachedAccessToken;
  if (cachedRefreshToken && env.mlClientId && env.mlClientSecret) {
    return refreshAccessToken();
  }
  throw new Error("ML access token no configurado");
}

async function authHeaders() {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}` };
}

ml.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    const message = error?.response?.data?.message;
    const shouldRefresh =
      status === 401 || code === "unauthorized" || message === "invalid access token";

    if (shouldRefresh && !error.config?._mlRetry) {
      error.config._mlRetry = true;
      try {
        await refreshAccessToken();
        error.config.headers = {
          ...(error.config.headers || {}),
          Authorization: `Bearer ${cachedAccessToken}`,
        };
        return ml.request(error.config);
      } catch (refreshError) {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

let cachedUserId = null;

async function getMyUserId() {
  if (cachedUserId) return cachedUserId;

  const { data } = await ml.get("/users/me", { headers: await authHeaders() });
  if (!data?.id) throw new Error("No pude obtener user_id desde /users/me");

  cachedUserId = data.id;
  return cachedUserId;
}

function toInt(value, fallback) {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(n, max));
}

/**
 * Trae item_ids de tu cuenta (sin paginar). Para demo/partial.
 */
export async function searchMyItems(limit = 20) {
  const userId = await getMyUserId();

  const safeLimit = clamp(toInt(limit, 20), 1, 50);
  const safeOffset = 0;

  const { data } = await ml.get(`/users/${userId}/items/search`, {
    headers: await authHeaders(),
    params: { limit: safeLimit, offset: safeOffset },
  });

  return data?.results ?? [];
}

/**
 * Trae un item completo por id.
 */
export async function getItem(itemId) {
  const { data } = await ml.get(`/items/${itemId}`, {
    headers: await authHeaders(),
  });
  return data;
}

/**
 * Trae una orden por URL de recurso (usado por webhooks).
 */
export async function getOrderByResourceUrl(resourceUrl) {
  const safePath = sanitizeMlWebhookResource(resourceUrl);

  const { data } = await ml.get(safePath, {
    headers: await authHeaders(),
  });
  return data;
}

/**
 * SSRF guard: MercadoLibre manda `resource` en el webhook.
 * Aceptamos solo:
 *  - rutas relativas permitidas (e.g. /orders/...) o
 *  - URLs absolutas hacia api.mercadolibre.com con path permitido.
 *
 * Devuelve un path seguro para usar con el axios instance (baseURL).
 */
export function sanitizeMlWebhookResource(resource) {
  const raw = String(resource ?? "").trim();
  if (!raw) {
    throw new Error("ML webhook resource vacio");
  }

  const isAbsolute = /^https?:\/\//i.test(raw);
  if (!isAbsolute) {
    if (!raw.startsWith("/")) {
      throw new Error("ML webhook resource invalido (no es path absoluto)");
    }
    assertAllowedMlPath(raw);
    return raw;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ML webhook resource invalido (URL malformada)");
  }

  if (url.protocol !== "https:") {
    throw new Error("ML webhook resource invalido (solo https)");
  }
  if (url.hostname !== "api.mercadolibre.com") {
    throw new Error("ML webhook resource invalido (host no permitido)");
  }

  const pathWithQuery = `${url.pathname}${url.search || ""}`;
  assertAllowedMlPath(url.pathname);
  return pathWithQuery;
}

function assertAllowedMlPath(pathname) {
  // Ajustar si el proyecto empieza a consumir otros recursos.
  const allowedPrefixes = ["/orders/"];
  const ok = allowedPrefixes.some((p) => pathname.startsWith(p));
  if (!ok) {
    throw new Error("ML webhook resource invalido (path no permitido)");
  }
}

/**
 * Extrae SKU desde attributes si no viene en seller_custom_field.
 */
export function extractSkuFromAttributes(attributes = []) {
  if (!Array.isArray(attributes)) return null;

  const wantedIds = new Set(["SELLER_SKU", "SKU", "SELLER_CUSTOM_FIELD"]);
  const found = attributes.find((a) => wantedIds.has(a?.id));
  return found?.value_name || found?.value_id || null;
}

/**
 * Normaliza lo importante del item para tu integrador.
 */
export function normalizeItem(item) {
  const skuFromSellerField = item?.seller_custom_field ?? null;
  const skuFromAttrs = extractSkuFromAttributes(item?.attributes);

  const sku = skuFromSellerField || skuFromAttrs || null;

  const imageUrl =
    item?.pictures?.[0]?.secure_url || item?.pictures?.[0]?.url || null;

  return {
    item_id: item?.id,
    sku,
    sku_source: skuFromSellerField
      ? "seller_custom_field"
      : skuFromAttrs
      ? "attributes"
      : null,
    title: item?.title ?? null,
    stock_ml: item?.available_quantity ?? null,
    image_url: imageUrl,
    permalink: item?.permalink ?? null,
  };
}

/**
 * Trae TODOS los item_ids usando search_type=scan.
 */
export async function searchAllMyItems() {
  const userId = await getMyUserId();

  const limit = 100; // Scan permite hasta 100
  let scrollId = null;
  const results = [];

  while (true) {
    const params = {
      search_type: "scan",
      limit,
    };
    if (scrollId) params.scroll_id = scrollId;

    const { data } = await ml.get(`/users/${userId}/items/search`, {
      headers: await authHeaders(),
      params,
    });

    const batch = data?.results ?? [];
    if (batch.length === 0) break;

    results.push(...batch);
    console.log(`[ML Sync] Descargados ${results.length} items...`);

    scrollId = data.scroll_id;
    if (!scrollId) break;
  }

  return results;
}

/**
 * Actualiza el stock de un item en MercadoLibre.
 * @param {string} itemId - El ID del item de ML (ej: MLA123456)
 * @param {number} newStock - El nuevo valor del stock.
 */
export async function updateMlItemStock(itemId, newStock) {
  const stock = Number(newStock);
  if (isNaN(stock) || stock < 0) {
    throw new Error("El nuevo stock debe ser un numero valido mayor o igual a 0.");
  }

  console.log(`[ML Push] Actualizando stock para item ${itemId} a ${stock}...`);

  try {
    const { data } = await ml.put(
      `/items/${itemId}`,
      { available_quantity: stock },
      { headers: await authHeaders() }
    );
    console.log(`[ML Push] Stock para ${itemId} actualizado correctamente.`);
    return data;
  } catch (error) {
    console.error(
      `[ML Push] Error actualizando stock para ${itemId}:`,
      error?.response?.data || error.message
    );
    return {
      error: true,
      item_id: itemId,
      details: error?.response?.data || error.message,
    };
  }
}
