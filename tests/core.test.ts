import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import supertest from "supertest";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { allocation, bytes } from "../shared/resources";
process.env.DATA_DIR = "memory://";
vi.mock("../server/panel", async () => {
  const { AppError } = await import("../server/security");
  return {
    panel: vi.fn(async (path: string, method = "GET") => {
      if (path.endsWith("/resources"))
        return {
          attributes: {
            current_state: "running",
            resources: {
              cpu_absolute: 4,
              memory_bytes: 1024 ** 3,
              disk_bytes: 2 * 1024 ** 3,
            },
          },
        };
      if (path.includes("/files/contents")) return "hello world";
      if (path === "")
        return {
          data: [
            { attributes: { identifier: "9846e0b6", name: "Test server" } },
          ],
        };
      return { data: [], ok: true };
    }),
    serverPath: (id: string) => "/servers/" + id,
    upstreamPermission: vi.fn(async () => ({
      attributes: {
        identifier: "9846e0b6",
        uuid: "9846e0b6-5da8-40bb-a139-de1cc3160af3",
        name: "Test server",
        limits: { cpu: 150, memory: 6144, disk: 20000 },
      },
      meta: { is_server_owner: true, user_permissions: ["*"] },
    })),
    sanitizeDetails: (d: any) => d.attributes,
  };
});
const { db, migrate, closeDb } = await import("../server/db");
const { users, invitations, sessions } = await import("../server/schema");
const {
  token,
  digest,
  filePath,
  encrypt,
  decrypt,
  permitted,
  AppError,
  safeError,
} = await import("../server/security");
const { createApp } = await import("../server/app");
const { config } = await import("../server/config");
const { panel, upstreamPermission } = await import("../server/panel");
const { attachRelay } = await import("../server/relay");
const { eq } = await import("drizzle-orm");
const { hash } = await import("@node-rs/argon2");
const app = createApp();
const http = supertest(app);
let viewerCookie: string,
  viewerCsrf: string,
  ownerCookie: string,
  ownerCsrf: string,
  ownerId: string;
const password = "Test-only-passphrase-83242!";
beforeAll(async () => {
  await migrate();
  ownerId = token();
  await db.insert(users).values([
    {
      id: ownerId,
      email: "owner@example.test",
      name: "Owner",
      password: await hash(password),
      role: "owner",
      permissions: ["*"],
      servers: ["9846e0b6"],
    },
    {
      id: token(),
      email: "viewer@example.test",
      name: "Viewer",
      password: await hash(password),
      role: "viewer",
      permissions: ["view", "files.read"],
      servers: ["9846e0b6"],
    },
  ]);
  const owner = await http
    .post("/api/auth/login")
    .set("Origin", config.app)
    .send({ email: "owner@example.test", password });
  ownerCookie = String(owner.headers["set-cookie"][0]).split(";")[0];
  ownerCsrf = owner.body.csrf;
  const viewer = await http
    .post("/api/auth/login")
    .set("Origin", config.app)
    .send({ email: "viewer@example.test", password });
  viewerCookie = String(viewer.headers["set-cookie"][0]).split(";")[0];
  viewerCsrf = viewer.body.csrf;
}, 30000);
afterAll(closeDb);
describe("public account creation", () => {
  let signupCookie: string;
  it("creates a viewer awaiting approval and ignores injected privileges", async () => {
    const r = await http
      .post("/api/auth/signup")
      .set("Origin", config.app)
      .send({
        name: "New member",
        email: "new@example.test",
        password,
        confirmPassword: password,
        role: "owner",
        permissions: ["*"],
        servers: ["9846e0b6"],
      });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe("viewer");
    expect(r.body.user.servers).toEqual([]);
    expect(r.body.user.permissions).not.toContain("*");
    expect(r.body.csrf).toBeTruthy();
    signupCookie = String(r.headers["set-cookie"][0]).split(";")[0];
  });
  it("does not grant the new account direct access to server data", async () => {
    expect(
      (
        await http
          .get("/api/servers/9846e0b6/overview")
          .set("Cookie", signupCookie)
      ).status,
    ).toBe(403);
    expect(
      (await http.get("/api/admin/users").set("Cookie", signupCookie)).status,
    ).toBe(403);
  });
  it("rejects mismatched password confirmation", async () => {
    expect(
      (
        await http
          .post("/api/auth/signup")
          .set("Origin", config.app)
          .send({
            name: "New member",
            email: "mismatch@example.test",
            password,
            confirmPassword: "different-password",
          })
      ).status,
    ).toBe(400);
  });
  it("rejects duplicate account creation", async () => {
    expect(
      (
        await http
          .post("/api/auth/signup")
          .set("Origin", config.app)
          .send({
            name: "New member",
            email: "new@example.test",
            password,
            confirmPassword: password,
          })
      ).status,
    ).toBe(409);
  });
});
describe("resource accuracy", () => {
  it("uses CPU allocation rather than assuming a 100% allowance", () =>
    expect(allocation(4, 150).percent).toBeCloseTo(2.6666667));
  it("handles unlimited, missing and zero usage", () => {
    expect(allocation(4, 0)).toMatchObject({
      percent: null,
      bar: 0,
      label: "Unlimited",
    });
    expect(allocation(0, 150).percent).toBe(0);
    expect(allocation(4, undefined).label).toBe("Unavailable");
    expect(allocation(undefined, 100).percent).toBeNull();
  });
  it("clamps visual bars but preserves over-allocation values", () =>
    expect(allocation(175, 150)).toMatchObject({
      actual: 175,
      bar: 100,
      percent: (175 / 150) * 100,
    }));
  it("rejects non-finite, negative and string-valued telemetry", () => {
    expect(allocation(NaN, 10).actual).toBeNull();
    expect(allocation(-1, 10).actual).toBeNull();
    expect(allocation("4", 10).actual).toBeNull();
    expect(allocation(4, -1).percent).toBeNull();
  });
  it("uses binary units and does not turn missing data into zero", () => {
    expect(bytes(1024 ** 3)).toBe("1.00 GiB");
    expect(bytes(1024 ** 2)).toBe("1.0 MiB");
    expect(bytes(null)).toBe("Unavailable");
  });
});
describe("authentication and authorization", () => {
  it("blocks unauthenticated direct API requests", async () => {
    expect((await http.get("/api/servers/9846e0b6/overview")).status).toBe(401);
  });
  it("sets HttpOnly, Strict session cookies and returns no password or hosting key", async () => {
    const r = await http
      .post("/api/auth/login")
      .set("Origin", config.app)
      .send({ email: "viewer@example.test", password });
    expect(r.status).toBe(200);
    expect(String(r.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(r.headers["set-cookie"])).toContain("SameSite=Strict");
    expect(JSON.stringify(r.body)).not.toMatch(/ptlc_|password|pendingTotp/);
  });
  it("requires exact origin for sign-in", async () =>
    expect(
      (
        await http
          .post("/api/auth/login")
          .set("Origin", "https://attacker.test")
          .send({ email: "viewer@example.test", password })
      ).status,
    ).toBe(403));
  it("rejects wrong passwords", async () =>
    expect(
      (
        await http
          .post("/api/auth/login")
          .set("Origin", config.app)
          .send({ email: "viewer@example.test", password: "incorrect" })
      ).status,
    ).toBe(401));
  it("requires CSRF for authenticated mutations", async () =>
    expect(
      (
        await http
          .post("/api/auth/logout")
          .set("Cookie", viewerCookie)
          .set("Origin", config.app)
      ).status,
    ).toBe(403));
  it("returns the upstream UUID and current usage", async () => {
    const r = await http
      .get("/api/servers/9846e0b6/overview")
      .set("Cookie", viewerCookie);
    expect(r.status).toBe(200);
    expect(r.body.server.uuid).toBe("9846e0b6-5da8-40bb-a139-de1cc3160af3");
    expect(r.body.joinAddress).toBe("godtamilsmp.chickenkiller.com:25568");
    expect(r.body.resources.resources.cpu_absolute).toBe(4);
  });
  it("denies unassigned servers even to an owner", async () =>
    expect(
      (await http.get("/api/servers/other/overview").set("Cookie", ownerCookie))
        .status,
    ).toBe(403));
  it("denies direct mutation by viewers before contacting upstream", async () => {
    vi.mocked(panel).mockClear();
    const r = await http
      .post("/api/servers/9846e0b6/power")
      .set("Cookie", viewerCookie)
      .set("Origin", config.app)
      .set("X-CSRF-Token", viewerCsrf)
      .send({ signal: "stop" });
    expect(r.status).toBe(403);
    expect(panel).not.toHaveBeenCalled();
  });
  it("denies owner management mutations until 2FA is enabled", async () =>
    expect(
      (
        await http
          .post("/api/servers/9846e0b6/power")
          .set("Cookie", ownerCookie)
          .set("Origin", config.app)
          .set("X-CSRF-Token", ownerCsrf)
          .send({ signal: "start" })
      ).status,
    ).toBe(403));
  it("requires an invitation to register", async () =>
    expect(
      (
        await http.post("/api/auth/register").set("Origin", config.app).send({
          email: "x@example.test",
          name: "x",
          password,
          token: "invalid-token-xxxxxxxxxxxxxxx",
        })
      ).status,
    ).toBe(400));
  it("does not expose owner data to viewers", async () =>
    expect(
      (await http.get("/api/admin/users").set("Cookie", viewerCookie)).status,
    ).toBe(403));
  it("enforces upstream permissions independently of local permissions", async () => {
    vi.mocked(upstreamPermission).mockRejectedValueOnce(
      new AppError(403, "Upstream permission denied"),
    );
    expect(
      (
        await http
          .get("/api/servers/9846e0b6/overview")
          .set("Cookie", ownerCookie)
      ).status,
    ).toBe(403);
  });
  it("preserves an unavailable state on upstream resource failure", async () => {
    vi.mocked(panel).mockRejectedValueOnce(
      new AppError(502, "Hosting unavailable"),
    );
    const r = await http
      .get("/api/servers/9846e0b6/overview")
      .set("Cookie", viewerCookie);
    expect(r.body.resources).toBeNull();
    expect(r.body.updatedAt).toBeNull();
    expect(r.body.error).toBe("Hosting unavailable");
  });
  it("revokes sessions immediately on logout", async () => {
    const r = await http
      .post("/api/auth/logout")
      .set("Cookie", viewerCookie)
      .set("Origin", config.app)
      .set("X-CSRF-Token", viewerCsrf);
    expect(r.status).toBe(200);
    expect(
      (await http.get("/api/auth/me").set("Cookie", viewerCookie)).status,
    ).toBe(401);
  });
});
describe("sensitive data and file policies", () => {
  it.each([
    "/../secret",
    "/a/../../secret",
    "/a\\..\\secret",
    "/.env",
    "/config/credentials.yml",
    "/private.key",
    "/%2e%2e/x",
    "/a\0b",
  ])("rejects dangerous or secret path %s", (path) =>
    expect(() => filePath(path)).toThrow(),
  );
  it("normalizes benign paths", () =>
    expect(filePath("//plugins//example.jar")).toBe("/plugins/example.jar"));
  it("authenticated encryption rejects tampering", () => {
    const value = encrypt("private secret");
    expect(decrypt(value)).toBe("private secret");
    const b = Buffer.from(value, "base64");
    b[b.length - 1] ^= 1;
    expect(() => decrypt(b.toString("base64"))).toThrow();
  });
  it("does not disclose unexpected error details", () =>
    expect(safeError(new Error("ptlc_secret-value"))).not.toContain("ptlc_"));
  it("blocks file traversal at the API boundary", async () =>
    expect(
      (
        await http
          .get("/api/servers/9846e0b6/file?path=/../secret")
          .set("Cookie", ownerCookie)
      ).status,
    ).toBe(400));
  it("blocks secret-bearing file contents", async () => {
    vi.mocked(panel).mockResolvedValueOnce("password: superprivate");
    const r = await http
      .get("/api/servers/9846e0b6/file?path=/config.yml")
      .set("Cookie", ownerCookie);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toContain("superprivate");
  });
  it("does not treat global owner status as a server assignment", () =>
    expect(
      permitted(
        { suspended: false, permissions: ["*"], servers: [] },
        "view",
        "9846e0b6",
      ),
    ).toBe(false));
});
describe("console relay boundaries", () => {
  it("rejects unauthenticated websocket subscriptions", async () => {
    const server = createServer(app);
    const relay = attachRelay(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as any).port;
    const code = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/console-stream?server=9846e0b6`,
        { origin: config.app },
      );
      ws.on("unexpected-response", (_req, res) => {
        res.resume();
        ws.terminate();
        resolve(res.statusCode || 0);
      });
      ws.on("error", () => {});
      setTimeout(() => reject(Error("timeout")), 3000).unref();
    });
    expect(code).toBe(403);
    relay.close();
    await new Promise<void>((r) => server.close(() => r()));
  });
});
