import { beforeAll, afterAll, describe, it, expect } from "vitest";
import supertest from "supertest";
process.env.DATA_DIR = "memory://";
const { db, migrate, closeDb } = await import("../server/db");
const { users } = await import("../server/schema");
const { config } = await import("../server/config");
const { token, encrypt, digest } = await import("../server/security");
const { createApp } = await import("../server/app");
const { eq } = await import("drizzle-orm");
const http = supertest(createApp());
const setupToken = token();
const password = "Isolated-setup-test-passphrase";
beforeAll(async () => {
  await migrate();
  config.hostedSetupToken = setupToken;
});
afterAll(closeDb);
describe("protected hosted owner setup", () => {
  it("never reveals the setup token in public status", async () => {
    const r = await http.get("/api/auth/status");
    expect(r.body.setupRequired).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain(setupToken);
  });
  it("allows ordinary signup without consuming the owner setup", async () => {
    const r = await http
      .post("/api/auth/signup")
      .set("Origin", config.app)
      .send({
        email: "waiting@example.test",
        name: "Waiting member",
        password,
        confirmPassword: password,
      });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe("viewer");
    expect((await http.get("/api/auth/status")).body.setupRequired).toBe(true);
  });
  it("rejects an incorrect setup credential", async () => {
    const r = await http
      .post("/api/auth/register")
      .set("Origin", config.app)
      .send({
        email: "wrong@example.test",
        name: "Not owner",
        password,
        token: token(),
      });
    expect(r.status).toBe(400);
  });
  it("requires the existing account password before claiming ownership", async () => {
    const r = await http
      .post("/api/auth/register")
      .set("Origin", config.app)
      .send({ email: "waiting@example.test", name: "Waiting member", password: "Incorrect-owner-passphrase", token: setupToken });
    expect(r.status).toBe(401);
    expect(r.body.error).toContain("current password");
    expect((await http.get("/api/auth/status")).body.setupRequired).toBe(true);
    const [existing] = await db.select().from(users).where(eq(users.email, "waiting@example.test"));
    expect(existing.role).toBe("viewer");
  });
  it("permits exactly one owner when setup submissions race", async () => {
    const recovery = "owner-setup-recovery-code";
    await db.update(users).set({totp: encrypt("JBSWY3DPEHPK3PXP"), recovery: [digest(recovery)]})
      .where(eq(users.email, "waiting@example.test"));
    const noMfa = await http.post("/api/auth/register").set("Origin", config.app)
      .send({ email: "waiting@example.test", name: "Waiting member", password, token: setupToken });
    expect(noMfa.status).toBe(401);
    const requests = ["first", "second"].map((name) =>
      http
        .post("/api/auth/register")
        .set("Origin", config.app)
        .send({
          email: "waiting@example.test",
          name,
          password,
          token: setupToken,
          code: recovery,
        }),
    );
    const results = await Promise.all(requests);
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
    const created = results.find((x) => x.status === 200)!;
    expect(created.body.user.role).toBe("owner");
    expect(created.body.user.servers).toEqual([config.server]);
    expect((await db.select().from(users).where(eq(users.email, "waiting@example.test")))[0].role).toBe("owner");
    expect((await db.select().from(users).where(eq(users.email, "waiting@example.test")))[0].recovery).toEqual([]);
    expect(
      (await db.select().from(users).where(eq(users.role, "owner"))).length,
    ).toBe(1);
  });
  it("refuses reuse after the owner exists", async () => {
    const r = await http
      .post("/api/auth/register")
      .set("Origin", config.app)
      .send({
        email: "later@example.test",
        name: "Later",
        password,
        token: setupToken,
      });
    expect(r.status).toBe(409);
    expect((await http.get("/api/auth/status")).body.setupRequired).toBe(false);
  });
  it("does not accept a hosted setup token after configuration removes it", async () => {
    config.hostedSetupToken = "";
    const r = await http
      .post("/api/auth/register")
      .set("Origin", config.app)
      .send({
        email: "disabled@example.test",
        name: "Disabled",
        password,
        token: setupToken,
      });
    expect(r.status).toBe(400);
  });
});
