import "dotenv/config";
import { randomBytes } from "node:crypto";
const origin = new URL(
  process.env.PTERODACTYL_PANEL_URL || "https://dash.pulikesiyt.fun",
);
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
)
  throw Error("Panel must be an HTTPS origin");
export const config = {
  origin: origin.origin,
  key: process.env.PTERODACTYL_CLIENT_API_KEY || "",
  server: process.env.PTERODACTYL_SERVER_ID || "9846e0b6",
  app:
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3100",
  port: Number(process.env.PORT || 3100),
  host:
    process.env.HOST ||
    (process.env.NODE_ENV === "production" || process.env.RENDER === "true"
      ? "0.0.0.0"
      : "127.0.0.1"),
  secret: process.env.SESSION_SECRET || "",
  hostedSetupToken: process.env.HOSTED_SETUP_TOKEN || "",
  encryption: process.env.INTEGRATION_ENCRYPTION_KEY || "",
  wsHosts: (process.env.PTERODACTYL_WS_HOSTS || "paid-1.pulikesiyt.fun")
    .split(",")
    .map((x) => x.trim()),
  production: process.env.NODE_ENV === "production",
  signup: process.env.ALLOW_SIGNUP !== "false",
  joinAddress:
    process.env.GAME_JOIN_ADDRESS || "godtamilsmp.chickenkiller.com:25568",
};
if (config.secret.length < 32 || config.encryption.length < 32) {
  if (process.env.NODE_ENV !== "test")
    throw Error(
      "Configure SESSION_SECRET and INTEGRATION_ENCRYPTION_KEY (at least 32 characters each) in .env.",
    );
  config.secret = randomBytes(32).toString("hex");
  config.encryption = randomBytes(32).toString("hex");
}
if (config.production && !config.app.startsWith("https://"))
  throw Error("Production APP_URL must use HTTPS");
if (config.production && !process.env.DATABASE_URL)
  throw Error(
    "Production requires DATABASE_URL. Embedded storage is not durable on free hosting.",
  );
