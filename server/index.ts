import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { existsSync } from "node:fs";
import { createApp } from "./app";
import { config } from "./config";
import { migrate, closeDb } from "./db";
import { attachRelay } from "./relay";
import { cleanupAuth } from "./auth";
import { loadIntegration } from "./integration";
await migrate();
await loadIntegration();
const app = createApp();
const server = createServer(app);
const relay = attachRelay(server);
if (existsSync("dist/index.html")) {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const cleanup = setInterval(() => cleanupAuth().catch(() => {}), 3600000);
cleanup.unref();
server.listen(config.port, config.host, () => {
  console.log(`GOD SUBCONSOLE listening on ${config.host}:${config.port}`);
  console.log(`GOD SUBCONSOLE running at ${config.app}`);
});
async function shutdown() {
  clearInterval(cleanup);
  for (const client of relay.clients) client.close();
  relay.close();
  server.close();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
