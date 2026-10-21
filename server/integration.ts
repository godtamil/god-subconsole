import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./schema";
import { config } from "./config";
import { encrypt, decrypt, AppError } from "./security";
import { externalFetch } from "./panel";

export async function loadIntegration() {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "hosting-integration"));
  if (!row) return;
  const stored = row.value;
  config.key = decrypt(stored.key);
  config.server = stored.server;
}
export function integrationSummary() {
  return {
    panel: config.origin,
    server: config.server,
    keyConfigured: !!config.key,
    sharedControl: config.sharedControl,
  };
}
export async function saveIntegration(server: string, key?: string) {
  const candidate = key || config.key;
  if (!candidate) throw new AppError(400, "Enter a Client API key");
  const response = await externalFetch(
    new URL(
      config.origin + "/api/client/servers/" + encodeURIComponent(server),
    ),
    {
      headers: {
        Authorization: `Bearer ${candidate}`,
        Accept: "Application/vnd.pterodactyl.v1+json",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(
      400,
      "The key cannot access this server. Check the server ID and Client API key.",
    );
  }
  const result = await response.json();
  const identifier = result.attributes?.identifier;
  if (!identifier || !/^[a-zA-Z0-9_-]{1,80}$/.test(identifier))
    throw new AppError(
      502,
      "Hosting API returned an invalid server identifier",
    );
  await db
    .insert(settings)
    .values({
      id: "hosting-integration",
      value: { server: identifier, key: encrypt(candidate) },
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: { value: { server: identifier, key: encrypt(candidate) } },
    });
  config.key = candidate;
  config.server = identifier;
  return integrationSummary();
}
