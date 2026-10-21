import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { hash, verify } from "@node-rs/argon2";

describe("legacy two-factor removal migration", () => {
  it("retains existing account credentials and permissions while deleting OTP material", async () => {
    const database = new PGlite();
    try {
      const savedPassword = await hash("Legacy-password-2026!");
      await database.exec(await readFile(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8"));
      await database.query(
        "INSERT INTO users (id,email,name,password,role,permissions,servers,totp,pending_totp,recovery) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        ["legacy", "legacy@example.test", "Legacy user", savedPassword, "owner", '["*"]', '["server-1"]', "encrypted-otp", "pending-otp", '["hashed-recovery"]'],
      );
      await database.exec(await readFile(new URL("../migrations/0003_remove_two_factor.sql", import.meta.url), "utf8"));
      const account = await database.query<{ email: string; password: string; role: string; permissions: string[]; servers: string[] }>(
        "SELECT email,password,role,permissions,servers FROM users WHERE id='legacy'",
      );
      expect(account.rows[0]).toMatchObject({ email: "legacy@example.test", password: savedPassword, role: "owner", permissions: ["*"], servers: ["server-1"] });
      expect(await verify(account.rows[0].password, "Legacy-password-2026!")).toBe(true);
      const columns = await database.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='users'");
      const names = columns.rows.map(row => row.column_name);
      for (const removed of ["totp", "pending_totp", "recovery"])
        expect(names).not.toContain(removed);
    } finally {
      await database.close();
    }
  }, 20000);
});
