import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as embedded } from "drizzle-orm/pglite";
import { drizzle as postgres } from "drizzle-orm/node-postgres";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as schema from "./schema";
const client = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : new PGlite(process.env.DATA_DIR || ".data/postgres");
export const db: any =
  client instanceof PGlite
    ? embedded(client, { schema })
    : postgres(client, { schema });
export async function migrate() {
  const query = async (text: string, values: unknown[] = []) =>
    client instanceof PGlite
      ? client.query(text, values)
      : client.query(text, values);
  await query(
    "CREATE TABLE IF NOT EXISTS __migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const root = new URL("../migrations/", import.meta.url);
  const files = (await readdir(root))
    .filter((x) => /^\d+.*\.sql$/.test(x))
    .sort();
  for (const name of files) {
    const migration = await readFile(new URL(name, root), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    const prior = await query(
      "SELECT checksum FROM __migrations WHERE name = $1",
      [name],
    );
    if (prior.rows.length) {
      if ((prior.rows[0] as { checksum: string }).checksum !== checksum)
        throw Error("Applied database migration was modified: " + name);
      continue;
    }
    if (client instanceof PGlite)
      await client.transaction(async (tx) => {
        await tx.exec(migration);
        await tx.query(
          "INSERT INTO __migrations (name, checksum) VALUES ($1, $2)",
          [name, checksum],
        );
      });
    else {
      const connection = await client.connect();
      try {
        await connection.query("BEGIN");
        await connection.query(migration);
        await connection.query(
          "INSERT INTO __migrations (name, checksum) VALUES ($1, $2)",
          [name, checksum],
        );
        await connection.query("COMMIT");
      } catch (e) {
        await connection.query("ROLLBACK");
        throw e;
      } finally {
        connection.release();
      }
    }
  }
}
export async function closeDb() {
  if (client instanceof PGlite) await client.close();
  else await client.end();
}
