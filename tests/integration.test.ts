import { beforeAll, afterAll, it, expect, vi } from "vitest";
process.env.DATA_DIR = "memory://";
vi.mock("../server/panel", () => ({ externalFetch: vi.fn() }));
const { externalFetch } = await import("../server/panel");
const { db, migrate, closeDb } = await import("../server/db");
const { settings } = await import("../server/schema");
const { config } = await import("../server/config");
const { saveIntegration, loadIntegration, integrationSummary } =
  await import("../server/integration");
const { eq } = await import("drizzle-orm");
const oldKey = config.key,
  oldServer = config.server;
beforeAll(migrate);
afterAll(async () => {
  config.key = oldKey;
  config.server = oldServer;
  await closeDb();
});
it("verifies a candidate before persisting it, encrypts the key and reloads it without exposing it", async () => {
  const key = "ptlc_TestOnlyFakeIntegrationCredential",
    full = "9846e0b6-5da8-40bb-a139-de1cc3160af3";
  vi.mocked(externalFetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ attributes: { identifier: "9846e0b6" } }), {
      status: 200,
    }),
  );
  const summary = await saveIntegration(full, key);
  expect(summary.server).toBe("9846e0b6");
  expect(JSON.stringify(summary)).not.toContain(key);
  const [stored] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "hosting-integration"));
  expect(JSON.stringify(stored)).not.toContain(key);
  config.key = "";
  config.server = "temporary";
  await loadIntegration();
  expect(config.key).toBe(key);
  expect(config.server).toBe("9846e0b6");
  vi.mocked(externalFetch).mockResolvedValueOnce(
    new Response("", { status: 403 }),
  );
  await expect(
    saveIntegration("inaccessible", "ptlc_WrongKey"),
  ).rejects.toThrow("cannot access");
  expect(config.key).toBe(key);
  expect(config.server).toBe("9846e0b6");
  expect(integrationSummary()).not.toHaveProperty("key");
});
