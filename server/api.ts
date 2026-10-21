import express, { Router } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { eq, desc, and, like } from "drizzle-orm";
import { config } from "./config";
import {
  panel,
  serverPath,
  upstreamPermission,
  sanitizeDetails,
  externalFetch,
} from "./panel";
import { auth, csrf, requireOwner, requireMfa, auditEvent } from "./auth";
import {
  AppError,
  permitted,
  filePath,
  token,
  digest,
  publicUser,
} from "./security";
import { db } from "./db";
import { users, sessions, invitations, audit, settings } from "./schema";
import { permissionOptions, roleDefaults } from "../shared/resources";
import { integrationSummary, saveIntegration } from "./integration";
export const api = Router();
api.use(
  auth,
  csrf,
  rateLimit({
    windowMs: 60000,
    limit: 120,
    keyGenerator: (req) =>
      req.user.id +
      ":" +
      (req.path.match(/^\/servers\/([^/]+)/)?.[1] || "application"),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Per-user server request limit reached. Please wait a moment.",
    },
  }),
);
const histories = new Map<string, any[]>();
const pending = new Set<string>();
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const sensitive = (content: string) =>
  /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"'#]+/i.test(
    content,
  );
function check(req: any, local: string, server?: string) {
  if (!permitted(req.user, local, server))
    throw new AppError(
      403,
      "Your application permissions do not allow this action",
    );
}
async function gate(req: any, local: string, upstream: string) {
  const id = idSchema.parse(req.params.id);
  check(req, local, id);
  await upstreamPermission(id, upstream);
  return serverPath(id);
}
api.get("/servers", async (req, res) => {
  if (!req.user.servers.length) {
    res.json({ data: [], truncated: false });
    return;
  }
  let page = 1,
    results: any[] = [];
  while (page <= 25) {
    const result = await panel(page === 1 ? "" : "?page=" + page);
    results.push(...(result.data || []));
    if (
      !result.meta?.pagination?.total_pages ||
      page >= result.meta.pagination.total_pages
    )
      break;
    page++;
  }
  res.json({
    data: results
      .filter((x: any) => permitted(req.user, "view", x.attributes.identifier))
      .map((x: any) => sanitizeDetails(x)),
    truncated: page > 25,
  });
});
api.get("/servers/:id/overview", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  check(req, "view", id);
  const d = await upstreamPermission(id, "view");
  let resources = null,
    error = null;
  try {
    resources = (await panel(serverPath(id) + "/resources")).attributes;
  } catch (e) {
    error = e instanceof AppError ? e.message : "Resources unavailable";
  }
  const at = new Date().toISOString();
  const [addressSetting] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "display-address:" + id));
  if (resources) {
    const h = histories.get(id) || [];
    if (
      !h.length ||
      Date.now() - new Date(h[h.length - 1].at).getTime() >= 4500
    )
      h.push({ at, ...resources.resources });
    histories.set(id, h.slice(-720));
  }
  res.json({
    server: sanitizeDetails(d),
    joinAddress:
      addressSetting?.value?.address ||
      (id === config.server ? config.joinAddress : null),
    resources,
    updatedAt: resources ? at : null,
    error,
    history: histories.get(id) || [],
    sampling: {
      intervalSeconds: 5,
      retentionSamples: 720,
      persistence: "process memory",
    },
  });
});
api.put("/servers/:id/display-address", requireMfa, async (req, res) => {
  const id = idSchema.parse(req.params.id);
  check(req, "settings.write", id);
  await upstreamPermission(id, "view");
  const { address } = z
    .object({
      address: z
        .string()
        .trim()
        .max(260)
        .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?):\d{1,5}$/)
        .refine((x) => {
          const port = Number(x.split(":").at(-1));
          return port >= 1 && port <= 65535;
        }),
    })
    .parse(req.body);
  await db
    .insert(settings)
    .values({ id: "display-address:" + id, value: { address } })
    .onConflictDoUpdate({ target: settings.id, set: { value: { address } } });
  await auditEvent(req.user.id, "display-address.update", id);
  res.json({
    message:
      "Display join address saved. DNS and hosting allocations are managed separately.",
  });
});
api.post("/servers/:id/power", requireMfa, async (req, res) => {
  const b = z
    .object({
      signal: z.enum(["start", "stop", "restart", "kill"]),
      confirmation: z.string().optional(),
    })
    .parse(req.body);
  if (b.signal === "kill" && b.confirmation !== "FORCE STOP")
    throw new AppError(400, "Type FORCE STOP to confirm");
  const p = await gate(
    req,
    "power." + b.signal,
    "control." + (b.signal === "kill" ? "stop" : b.signal),
  );
  const id = String(req.params.id);
  if (pending.has(id))
    throw new AppError(409, "A power action is already pending");
  pending.add(id);
  try {
    await panel(p + "/power", "POST", { signal: b.signal });
    await auditEvent(req.user.id, "power." + b.signal, id);
    res.json({
      message:
        "Power action accepted by hosting panel; waiting for server status.",
    });
  } finally {
    setTimeout(() => pending.delete(id), 10000).unref();
  }
});
api.post("/servers/:id/command", requireMfa, async (req, res) => {
  const b = z
    .object({
      command: z.string().min(1).max(1000).optional(),
      template: z.enum(["save", "day", "clear", "announce"]).optional(),
      text: z.string().max(200).optional(),
      confirmation: z.string().optional(),
    })
    .parse(req.body);
  let command = b.command || "";
  const p = await gate(
    req,
    b.template ? "console.templates" : "console.command",
    "control.console",
  );
  if (b.template) {
    command = {
      save: "save-all",
      day: "time set day",
      clear: "weather clear",
      announce: "say " + (b.text || ""),
    }[b.template];
  }
  if (/[\r\n\x00]/.test(command) || !command.trim())
    throw new AppError(400, "Enter a single command");
  if (
    /^(?:\/?(?:minecraft:)?op|lp|luckperms|pex)\b/i.test(command) &&
    b.confirmation !== "GRANT ACCESS"
  )
    throw new AppError(400, "Type GRANT ACCESS to confirm privilege changes");
  await panel(p + "/command", "POST", { command });
  await auditEvent(
    req.user.id,
    b.template
      ? "console.template." + b.template
      : "console.command [arguments redacted]",
    String(req.params.id),
  );
  res.json({ message: "Command accepted by hosting panel." });
});
const readFeatures: Record<string, [string, string, string]> = {
  backups: ["backups.read", "backup.read", "/backups"],
  schedules: ["schedules.read", "schedule.read", "/schedules"],
  network: ["network.read", "allocation.read", "/network/allocations"],
  startup: ["startup.read", "startup.read", "/startup"],
  subusers: ["subusers.read", "user.read", "/users"],
};
api.get("/servers/:id/features/:feature", async (req, res) => {
  const f = readFeatures[String(req.params.feature)];
  if (!f) throw new AppError(404, "Feature unavailable");
  const p = await gate(req, f[0], f[1]);
  const data = await panel(p + f[2]);
  if (req.params.feature === "startup") {
    data.data = (data.data || []).map((x: any) => ({
      ...x,
      attributes: {
        ...x.attributes,
        server_value: /password|secret|token|key/i.test(
          x.attributes.env_variable,
        )
          ? "••••••••"
          : x.attributes.server_value,
      },
    }));
  }
  res.json(data);
});
api.post(
  "/servers/:id/files/upload",
  requireMfa,
  express.raw({ type: "application/octet-stream", limit: "10mb" }),
  async (req, res) => {
    const p = await gate(req, "files.write", "file.create");
    const pluginUpload = req.query.plugin === "true";
    const directory = pluginUpload ? "/plugins" : filePath(req.query.directory || "/");
    const name = decodeURIComponent(req.get("X-File-Name") || "");
    if (!name || name.includes("/") || name.includes("\\"))
      throw new AppError(400, "Invalid upload name");
    filePath(directory + "/" + name);
    if (!Buffer.isBuffer(req.body))
      throw new AppError(400, "Upload binary file contents");
    if (pluginUpload) {
      if (!/\.jar$/i.test(name) || req.body.length < 4 || req.body.readUInt32LE(0) !== 0x04034b50)
        throw new AppError(400, "Choose a plugin .jar archive");
      const root = await panel(p + "/files/list?directory=%2F");
      const plugins = root.data.find((x: any) => x.attributes.name === "plugins");
      if (plugins?.attributes.is_file) throw new AppError(409, "A file named plugins blocks the plugin directory");
      if (!plugins) await panel(p + "/files/create-folder", "POST", { root: "/", name: "plugins" });
    }
    const existing = await panel(
      p + "/files/list?directory=" + encodeURIComponent(directory),
    );
    if (existing.data.some((x: any) => x.attributes.name === name))
      throw new AppError(
        409,
        "File already exists. Rename it before uploading a replacement.",
      );
    if (!pluginUpload && sensitive(req.body.toString("utf8")))
      throw new AppError(403, "Secret-bearing content is protected");
    const link = await panel(p + "/files/upload");
    const url = new URL(link.attributes.url);
    url.searchParams.set("directory", directory);
    const body = new FormData();
    body.append("files", new Blob([new Uint8Array(req.body)]), name);
    const response = await externalFetch(url, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(120000),
    });
    await response.body?.cancel();
    if (!response.ok)
      throw new AppError(
        502,
        `Hosting upload failed (HTTP ${response.status})`,
      );
    await auditEvent(req.user.id, "file.upload", String(req.params.id));
    res.json({
      message: pluginUpload
        ? "Plugin JAR uploaded to /plugins. Restart the server to load it; the plugin creates its data folder when it starts."
        : "File uploaded. Server code changes may require a restart.",
    });
  },
);
api.get("/servers/:id/plugins", async (req, res) => {
  const p = await gate(req, "files.read", "file.read");
  const root = await panel(p + "/files/list?directory=%2F");
  const folder = root.data.find((x: any) => x.attributes.name === "plugins");
  if (!folder || folder.attributes.is_file) return res.json({ data: [], directoryExists: false });
  const files = await panel(p + "/files/list?directory=%2Fplugins");
  res.json({ ...files, directoryExists: true });
});
api.get("/servers/:id/backups/:backup/download", async (req, res) => {
  const p = await gate(req, "backups.download", "backup.download");
  const uuid = z.uuid().parse(req.params.backup);
  const link = await panel(p + "/backups/" + uuid + "/download");
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10 * 60000);
  res.on("close", () => abort.abort());
  try {
    const response = await externalFetch(new URL(link.attributes.url), {
      signal: abort.signal,
    });
    if (!response.ok || !response.body)
      throw new AppError(502, "Backup download is unavailable");
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="backup-${uuid}.tar.gz"`,
    });
    await pipeline(Readable.fromWeb(response.body as any), res);
    await auditEvent(req.user.id, "backup.download", String(req.params.id));
  } finally {
    clearTimeout(timeout);
  }
});
api.post("/servers/:id/subusers", requireMfa, async (req, res) => {
  const p = await gate(req, "subusers.write", "user.create");
  const b = z
    .object({
      email: z.email(),
      permissions: z.array(z.string().regex(/^[a-z-]+\.[a-z-]+$/)).min(1),
      confirmation: z.literal("GRANT ACCESS"),
    })
    .parse(req.body);
  const upstream = await upstreamPermission(
    String(req.params.id),
    "user.create",
  );
  if (
    !upstream.meta?.is_server_owner &&
    !upstream.meta?.user_permissions?.includes("*") &&
    b.permissions.some((x) => !upstream.meta?.user_permissions?.includes(x))
  )
    throw new AppError(
      403,
      "Cannot grant permissions beyond your hosting account",
    );
  const result = await panel(p + "/users", "POST", {
    email: b.email,
    permissions: b.permissions,
  });
  await auditEvent(req.user.id, "hosting-user.create", String(req.params.id));
  res.json(result);
});
api.put("/servers/:id/subusers/:uuid", requireMfa, async (req, res) => {
  const p = await gate(req, "subusers.write", "user.update");
  const b = z
    .object({
      permissions: z.array(z.string().regex(/^[a-z-]+\.[a-z-]+$/)),
      confirmation: z.literal("GRANT ACCESS"),
    })
    .parse(req.body);
  const upstream = await upstreamPermission(
    String(req.params.id),
    "user.update",
  );
  if (
    !upstream.meta?.is_server_owner &&
    !upstream.meta?.user_permissions?.includes("*") &&
    b.permissions.some((x) => !upstream.meta?.user_permissions?.includes(x))
  )
    throw new AppError(
      403,
      "Cannot grant permissions beyond your hosting account",
    );
  res.json(
    await panel(p + "/users/" + z.uuid().parse(req.params.uuid), "POST", {
      permissions: b.permissions,
    }),
  );
  await auditEvent(req.user.id, "hosting-user.update", String(req.params.id));
});
api.delete("/servers/:id/subusers/:uuid", requireMfa, async (req, res) => {
  const p = await gate(req, "subusers.write", "user.delete");
  if (req.body.confirmation !== "REMOVE ACCESS")
    throw new AppError(400, "Type REMOVE ACCESS to confirm");
  await panel(p + "/users/" + z.uuid().parse(req.params.uuid), "DELETE");
  await auditEvent(req.user.id, "hosting-user.delete", String(req.params.id));
  res.json({ ok: true });
});
api.get("/servers/:id/files", async (req, res) => {
  const p = await gate(req, "files.read", "file.read");
  const dir = filePath(req.query.directory || "/");
  const list = await panel(
    p + "/files/list?directory=" + encodeURIComponent(dir),
  );
  res.json({
    ...list,
    data: list.data.filter((x: any) => {
      try {
        filePath(dir + "/" + x.attributes.name);
        return true;
      } catch {
        return false;
      }
    }),
  });
});
api.get("/servers/:id/file", async (req, res) => {
  const p = await gate(req, "files.read", "file.read-content");
  const path = filePath(req.query.path);
  const content = await panel(
    p + "/files/contents?file=" + encodeURIComponent(path),
    "GET",
    undefined,
    true,
  );
  if (sensitive(content))
    throw new AppError(403, "File contains potential secrets and is protected");
  res.json({ content, revision: digest(content), path });
});
api.put("/servers/:id/file", requireMfa, async (req, res) => {
  const p = await gate(req, "files.write", "file.update");
  const b = z
    .object({
      path: z.string(),
      content: z.string().max(1024 * 1024),
      revision: z.string().optional(),
      create: z.boolean().optional(),
    })
    .parse(req.body);
  const path = filePath(b.path);
  if (sensitive(b.content))
    throw new AppError(
      403,
      "Secret-bearing content must be managed through the hosting panel",
    );
  if (!b.create) {
    const old = await panel(
      p + "/files/contents?file=" + encodeURIComponent(path),
      "GET",
      undefined,
      true,
    );
    if (sensitive(old)) throw new AppError(403, "File is protected");
    if (!b.revision || digest(old) !== b.revision)
      throw new AppError(
        409,
        "File changed upstream. Reopen it before saving.",
      );
  } else {
    try {
      await panel(
        p + "/files/contents?file=" + encodeURIComponent(path),
        "GET",
        undefined,
        true,
      );
      throw new AppError(409, "File already exists");
    } catch (e) {
      if (!(e instanceof AppError) || e.status !== 404) throw e;
    }
  }
  await panel(
    p + "/files/write?file=" + encodeURIComponent(path),
    "POST",
    b.content,
    true,
  );
  await auditEvent(req.user.id, "file.write", String(req.params.id));
  res.json({
    revision: digest(b.content),
    message: "File saved. Configuration changes may require a restart.",
  });
});
api.post("/servers/:id/files/action", requireMfa, async (req, res) => {
  const b = z
    .object({
      action: z.enum(["folder", "rename", "copy", "delete"]),
      path: z.string(),
      name: z.string().optional(),
      confirmation: z.string().optional(),
    })
    .parse(req.body);
  const p = await gate(
    req,
    b.action === "delete" ? "files.delete" : "files.write",
    b.action === "folder"
      ? "file.create"
      : b.action === "delete"
        ? "file.delete"
        : b.action === "copy"
          ? "file.create"
          : "file.update",
  );
  const path = filePath(b.path);
  if (path === "/") throw new AppError(400, "Choose a file or folder");
  if (b.action === "delete") {
    if (b.confirmation !== "DELETE")
      throw new AppError(400, "Type DELETE to confirm");
    await panel(p + "/files/delete", "POST", {
      root: "/",
      files: [path.slice(1)],
    });
  } else if (b.action === "copy") {
    await panel(p + "/files/copy", "POST", { location: path });
  } else if (b.action === "folder") {
    const parts = path.split("/");
    const name = parts.pop();
    await panel(p + "/files/create-folder", "POST", {
      root: parts.join("/") || "/",
      name,
    });
  } else {
    const to = filePath(b.name);
    await panel(p + "/files/rename", "PUT", {
      root: "/",
      files: [{ from: path.slice(1), to: to.slice(1) }],
    });
  }
  await auditEvent(req.user.id, "file." + b.action, String(req.params.id));
  res.json({ ok: true });
});
api.post("/servers/:id/backups", requireMfa, async (req, res) => {
  const p = await gate(req, "backups.create", "backup.create");
  const b = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
  const d = await upstreamPermission(String(req.params.id), "backup.create");
  if (d.attributes.feature_limits?.backups === 0)
    throw new AppError(409, "The hosting plan allows zero backups");
  const result = await panel(p + "/backups", "POST", b);
  await auditEvent(req.user.id, "backup.create", String(req.params.id));
  res.json(result);
});
api.post(
  "/servers/:id/backups/:backup/action",
  requireMfa,
  async (req, res) => {
    const b = z
      .object({
        action: z.enum(["restore", "delete"]),
        confirmation: z.string(),
      })
      .parse(req.body);
    if (b.confirmation !== (b.action === "restore" ? "RESTORE" : "DELETE"))
      throw new AppError(400, "Confirmation does not match");
    const p = await gate(req, "backups." + b.action, "backup." + b.action);
    const backup = z.uuid().parse(req.params.backup);
    await panel(
      p + "/backups/" + backup + (b.action === "restore" ? "/restore" : ""),
      b.action === "restore" ? "POST" : "DELETE",
      b.action === "restore" ? { truncate: true } : undefined,
    );
    await auditEvent(req.user.id, "backup." + b.action, String(req.params.id));
    res.json({ message: "Backup action accepted by hosting panel." });
  },
);
const scheduleSchema = z.object({
  name: z.string().min(1).max(100),
  minute: z.string().regex(/^[\d*,/\-]{1,40}$/),
  hour: z.string().regex(/^[\d*,/\-]{1,40}$/),
  day_of_month: z.string().regex(/^[\d*,/\-]{1,40}$/),
  month: z.string().regex(/^[\d*,/\-]{1,40}$/),
  day_of_week: z.string().regex(/^[\d*,/\-]{1,40}$/),
  is_active: z.boolean(),
  only_when_online: z.boolean(),
});
api.post("/servers/:id/schedules", requireMfa, async (req, res) => {
  const p = await gate(req, "schedules.write", "schedule.create");
  const result = await panel(
    p + "/schedules",
    "POST",
    scheduleSchema.parse(req.body),
  );
  await auditEvent(req.user.id, "schedule.create", String(req.params.id));
  res.json(result);
});
api.put("/servers/:id/schedules/:schedule", requireMfa, async (req, res) => {
  const p = await gate(req, "schedules.write", "schedule.update");
  res.json(
    await panel(
      p +
        "/schedules/" +
        z.coerce.number().int().positive().parse(req.params.schedule),
      "POST",
      scheduleSchema.parse(req.body),
    ),
  );
  await auditEvent(req.user.id, "schedule.update", String(req.params.id));
});
api.delete("/servers/:id/schedules/:schedule", requireMfa, async (req, res) => {
  if (req.body.confirmation !== "DELETE")
    throw new AppError(400, "Type DELETE to confirm");
  const p = await gate(req, "schedules.write", "schedule.delete");
  await panel(
    p +
      "/schedules/" +
      z.coerce.number().int().positive().parse(req.params.schedule),
    "DELETE",
  );
  await auditEvent(req.user.id, "schedule.delete", String(req.params.id));
  res.json({ ok: true });
});
api.post(
  "/servers/:id/schedules/:schedule/tasks{/:task}",
  requireMfa,
  async (req, res) => {
    const b = z
      .object({
        action: z.enum(["command", "power", "backup"]),
        payload: z.string().max(1000),
        time_offset: z.number().int().min(0).max(900),
        continue_on_failure: z.boolean(),
        confirmation: z.string().optional(),
      })
      .parse(req.body);
    const p = await gate(req, "schedules.write", "schedule.update");
    if (b.action === "command") {
      check(req, "console.command", String(req.params.id));
      await upstreamPermission(String(req.params.id), "control.console");
      if (/[\r\n\x00]/.test(b.payload))
        throw new AppError(400, "Invalid command");
      if (
        /^(?:\/?(?:minecraft:)?op|lp|luckperms|pex)\b/i.test(b.payload) &&
        b.confirmation !== "GRANT ACCESS"
      )
        throw new AppError(
          400,
          "Type GRANT ACCESS to confirm scheduled privilege changes",
        );
    }
    if (b.action === "power") {
      if (!["start", "stop", "restart"].includes(b.payload))
        throw new AppError(400, "Only graceful power actions can be scheduled");
      check(req, "power." + b.payload, String(req.params.id));
      await upstreamPermission(String(req.params.id), "control." + b.payload);
    }
    if (b.action === "backup") {
      check(req, "backups.create", String(req.params.id));
      await upstreamPermission(String(req.params.id), "backup.create");
    }
    res.json(
      await panel(
        p +
          "/schedules/" +
          z.coerce.number().int().positive().parse(req.params.schedule) +
          "/tasks" +
          (req.params.task
            ? "/" + z.coerce.number().int().positive().parse(req.params.task)
            : ""),
        "POST",
        b,
      ),
    );
    await auditEvent(
      req.user.id,
      "schedule.task." + b.action,
      String(req.params.id),
    );
  },
);
api.delete(
  "/servers/:id/schedules/:schedule/tasks/:task",
  requireMfa,
  async (req, res) => {
    if (req.body.confirmation !== "DELETE")
      throw new AppError(400, "Type DELETE to confirm");
    const p = await gate(req, "schedules.write", "schedule.update");
    await panel(
      p +
        "/schedules/" +
        z.coerce.number().int().positive().parse(req.params.schedule) +
        "/tasks/" +
        z.coerce.number().int().positive().parse(req.params.task),
      "DELETE",
    );
    await auditEvent(
      req.user.id,
      "schedule.task.delete",
      String(req.params.id),
    );
    res.json({ ok: true });
  },
);
api.put("/servers/:id/startup", requireMfa, async (req, res) => {
  const p = await gate(req, "startup.write", "startup.update");
  const b = z
    .object({
      key: z.string().regex(/^[A-Z0-9_]+$/),
      value: z.string().max(1000),
    })
    .parse(req.body);
  if (/password|token|secret|key/i.test(b.key))
    throw new AppError(403, "Sensitive startup variable is protected");
  res.json(await panel(p + "/startup/variable", "PUT", b));
  await auditEvent(req.user.id, "startup.update", String(req.params.id));
});
api.post("/servers/:id/settings", requireMfa, async (req, res) => {
  const p = await gate(req, "settings.write", "settings.rename");
  const b = z
    .object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).default(""),
    })
    .parse(req.body);
  await panel(p + "/settings/rename", "POST", b);
  await auditEvent(req.user.id, "settings.rename", String(req.params.id));
  res.json({ ok: true });
});
api.get("/branding", async (_req, res) => {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "branding"));
  res.json(row?.value || { name: "GOD SUBCONSOLE", accent: "#3985ff" });
});
api.get("/integration", async (req, res) => {
  res.json(integrationSummary());
});
api.put("/admin/integration", requireOwner, requireMfa, async (req, res) => {
  const b = z.object({ server: idSchema, key: z.string().regex(/^ptlc_[a-zA-Z0-9]+$/).max(256).optional() }).parse(req.body);
  const result = await saveIntegration(b.server, b.key);
  await db.update(users).set({ servers: [...new Set([...req.user.servers, result.server])] }).where(eq(users.id, req.user.id));
  await auditEvent(req.user.id, "integration.update", b.server);
  res.json({ ...result, message: "Connection verified and saved. Refreshing your server…" });
});
api.get("/audit", async (req, res) => {
  check(req, "audit.read");
  const page = Math.max(0, Math.min(10000, Number(req.query.page) || 0));
  const filter = String(req.query.filter || "")
    .replace(/[%_]/g, "")
    .slice(0, 60);
  res.json(
    await db
      .select()
      .from(audit)
      .where(filter ? like(audit.action, "%" + filter + "%") : undefined)
      .orderBy(desc(audit.createdAt))
      .limit(30)
      .offset(page * 30),
  );
});
api.get("/admin/users", requireOwner, async (_req, res) =>
  res.json((await db.select().from(users)).map(publicUser)),
);
api.get("/admin/health", requireOwner, async (_req, res) => {
  let connected = false,
    message = "Connected";
  try {
    await panel("");
    connected = true;
  } catch (e) {
    message = e instanceof AppError ? e.message : "Unavailable";
  }
  res.json({
    connected,
    message,
    panel: config.origin,
    database: process.env.DATABASE_URL
      ? "PostgreSQL"
      : "Embedded PostgreSQL (local)",
    email: !!process.env.SMTP_HOST,
    mode: "LIVE",
    uptime: Math.floor(process.uptime()),
  });
});
api.post("/admin/invite", requireOwner, requireMfa, async (req, res) => {
  const b = z
    .object({
      email: z.email().transform((x) => x.toLowerCase()),
      role: z.enum(["admin", "operator", "viewer"]),
      servers: z.array(idSchema).min(1),
      permissions: z
        .array(z.enum(permissionOptions as [string, ...string[]]))
        .optional(),
    })
    .parse(req.body);
  const accessible = await panel("");
  const ids = accessible.data.map((x: any) => x.attributes.identifier);
  if (b.servers.some((x) => !ids.includes(x)))
    throw new AppError(403, "Cannot assign an inaccessible upstream server");
  const value = token();
  await db.insert(invitations).values({
    id: digest(value),
    email: b.email,
    role: b.role,
    servers: b.servers,
    permissions: b.permissions || roleDefaults[b.role],
    expires: new Date(Date.now() + 24 * 3600000),
  });
  await auditEvent(req.user.id, "user.invite", null);
  res.json({
    url: config.app + "/#invite=" + value,
    message:
      "Invitation expires in 24 hours. Share it privately with the invited user.",
  });
});
api.patch("/admin/users/:user", requireOwner, requireMfa, async (req, res) => {
  const b = z
    .object({
      suspended: z.boolean().optional(),
      role: z.enum(["admin", "operator", "viewer"]).optional(),
      permissions: z
        .array(z.enum(permissionOptions as [string, ...string[]]))
        .optional(),
      servers: z.array(idSchema).optional(),
    })
    .parse(req.body);
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.id, String(req.params.user)));
  if (!u) throw new AppError(404, "User not found");
  if (u.role === "owner" || u.id === req.user.id)
    throw new AppError(403, "The owner account cannot be modified here");
  if (b.servers) {
    const accessible = await panel("");
    if (
      b.servers.some(
        (x) => !accessible.data.some((s: any) => s.attributes.identifier === x),
      )
    )
      throw new AppError(403, "Inaccessible upstream server");
  }
  await db.update(users).set(b).where(eq(users.id, u.id));
  await db.delete(sessions).where(eq(sessions.userId, u.id));
  await auditEvent(req.user.id, "user.permissions.update", null);
  res.json({ ok: true });
});
api.put("/admin/branding", requireOwner, requireMfa, async (req, res) => {
  const b = z
    .object({
      name: z.string().min(1).max(40),
      accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    })
    .parse(req.body);
  await db
    .insert(settings)
    .values({ id: "branding", value: b })
    .onConflictDoUpdate({ target: settings.id, set: { value: b } });
  await auditEvent(req.user.id, "branding.update", null);
  res.json(b);
});
