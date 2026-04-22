import "dotenv/config";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  mlAccessToken: process.env.ML_ACCESS_TOKEN,
  mlClientId: process.env.ML_CLIENT_ID,
  mlClientSecret: process.env.ML_CLIENT_SECRET,
  mlRefreshToken: process.env.ML_REFRESH_TOKEN,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  adminUser: process.env.ADMIN_USER,
  adminPassword: process.env.ADMIN_PASSWORD,
  tiendaNubeAccessToken: process.env.TIENDA_NUBE_ACCESS_TOKEN,
  tiendaNubeStoreId: process.env.TIENDA_NUBE_STORE_ID,
  tiendaNubeClientId: process.env.TIENDA_NUBE_CLIENT_ID,
  tiendaNubeClientSecret: process.env.TIENDA_NUBE_CLIENT_SECRET,
  tiendaNubeRedirectUri: process.env.TIENDA_NUBE_REDIRECT_URI,
  tiendaNubeWebhookSecret: process.env.TIENDA_NUBE_WEBHOOK_SECRET,
  enableCron: process.env.ENABLE_CRON === "true",
  mlSyncCron: process.env.ML_SYNC_CRON,
  tnSyncCron: process.env.TN_SYNC_CRON,
};

if (!env.mlAccessToken) {
  console.warn("WARN: Falta ML_ACCESS_TOKEN en .env");
}
if (!env.mlClientId) {
  console.warn("WARN: Falta ML_CLIENT_ID en .env");
}
if (!env.mlClientSecret) {
  console.warn("WARN: Falta ML_CLIENT_SECRET en .env");
}
if (!env.mlRefreshToken) {
  console.warn("WARN: Falta ML_REFRESH_TOKEN en .env");
}
if (!env.jwtSecret) {
  console.warn("WARN: Falta JWT_SECRET en .env");
}
if (!env.adminUser) {
  console.warn("WARN: Falta ADMIN_USER en .env");
}
if (!env.adminPassword) {
  console.warn("WARN: Falta ADMIN_PASSWORD en .env");
}
if (!env.tiendaNubeAccessToken) {
  console.warn("WARN: Falta TIENDA_NUBE_ACCESS_TOKEN en .env");
}
if (!env.tiendaNubeStoreId) {
  console.warn("WARN: Falta TIENDA_NUBE_STORE_ID en .env");
}
if (!env.tiendaNubeClientId) {
  console.warn("WARN: Falta TIENDA_NUBE_CLIENT_ID en .env");
}
if (!env.tiendaNubeClientSecret) {
  console.warn("WARN: Falta TIENDA_NUBE_CLIENT_SECRET en .env");
}
if (!env.tiendaNubeRedirectUri) {
  console.warn("WARN: Falta TIENDA_NUBE_REDIRECT_URI en .env");
}
