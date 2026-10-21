import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { rateLimit } from "express-rate-limit";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import nodemailer from "nodemailer";
import { db } from "./db";
import { users, sessions, invitations, audit, profileImages } from "./schema";
import { config } from "./config";
import { permissionOptions } from "../shared/resources";
import {
  AppError,
  token,
  digest,
  publicUser,
  permitted,
} from "./security";
declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: any;
    }
  }
}
export async function auditEvent(
  actor: string,
  action: string,
  server: string | null,
  result = "success",
) {
  await db.insert(audit).values({ id: token(), actor, action, server, result });
}
export function serverAccess(user: any) {
  if (!config.sharedControl || user.suspended) return user;
  return { ...user,
    role: user.role === "owner" ? "owner" : "operator",
    permissions: user.role === "owner" ? ["*"] : permissionOptions.filter(p => p !== "audit.read"),
    servers: [config.server], sharedControl: true,
  };
}
export async function lookupSession(value: string | undefined) {
  if (!value) return null;
  const rows = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(eq(sessions.id, digest(value)), gt(sessions.expires, new Date())),
    )
    .limit(1);
  return rows[0] && !rows[0].u.suspended ? { ...rows[0], u: serverAccess(rows[0].u) } : null;
}
export async function auth(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await lookupSession(req.cookies?.gs_session);
    if (!row) throw new AppError(401, "Sign in to access your server");
    req.user = row.u;
    req.session = row.s;
    next();
  } catch (e) {
    next(e);
  }
}
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    (req.get("origin") !== new URL(config.app).origin ||
      (req.session && req.get("x-csrf-token") !== req.session.csrf))
  )
    return next(new AppError(403, "Request verification failed"));
  next();
}
export function requirePermission(permission: string, server?: string) {
  return (req: Request, _res: Response, next: NextFunction) =>
    permitted(req.user, permission, server)
      ? next()
      : next(
          new AppError(
            403,
            "Your application permissions do not allow this action",
          ),
        );
}
export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  return req.user?.role === "owner"
    ? next()
    : next(new AppError(403, "Owner access required"));
}
const password = z.string().min(12).max(128);
const loginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().max(128),
});
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Try again in 15 minutes.",
  },
});
export const authRouter = Router();
authRouter.post("/bootstrap-local", limiter, async (req, res) => {
  const time = req.get("X-Bootstrap-Time") || "";
  if (
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip || "") ||
    Math.abs(Date.now() - Number(time)) > 30000 ||
    !time ||
    req.get("X-Local-Bootstrap") !== digest("bootstrap:" + time)
  )
    throw new AppError(403, "Local bootstrap command required");
  if (
    (await db.select().from(users).where(eq(users.role, "owner")).limit(1))
      .length
  )
    throw new AppError(409, "An owner account already exists");
  const value = token();
  await db.insert(invitations).values({
    id: digest(value),
    email: "bootstrap",
    role: "owner",
    permissions: ["*"],
    servers: [config.server],
    expires: new Date(Date.now() + 15 * 60000),
  });
  res.json({ url: config.app + "/#setup=" + value });
});
async function createSession(res: Response, u: any) {
  const value = token(),
    csrf = token();
  await db.insert(sessions).values({
    id: digest(value),
    userId: u.id,
    csrf,
    expires: new Date(Date.now() + 12 * 3600000),
  });
  res.cookie("gs_session", value, {
    httpOnly: true,
    secure: config.production,
    sameSite: "strict",
    maxAge: 12 * 3600000,
    path: "/",
  });
  return { user: publicUser(serverAccess(u)), csrf };
}
authRouter.get("/status", async (_req, res) => {
  res.json({
    setupRequired: !(
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "owner"))
        .limit(1)
    ).length,
    emailConfigured: !!process.env.SMTP_HOST,
    signupEnabled: config.signup,
    sharedControl: config.sharedControl,
  });
});
authRouter.post("/signup", limiter, csrf, async (req, res) => {
  if (!config.signup)
    throw new AppError(
      403,
      "Public account creation is disabled. Ask the owner for an invitation.",
    );
  const b = z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z
        .email()
        .max(254)
        .transform((x) => x.toLowerCase()),
      password,
      confirmPassword: z.string().max(128),
    })
    .refine((x) => x.password === x.confirmPassword, {
      message: "Passwords must match",
    })
    .parse(req.body);
  if (
    (
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, b.email))
        .limit(1)
    ).length
  )
    throw new AppError(
      409,
      "An account with this email already exists. Sign in or recover your password.",
    );
  let u;
  try {
    [u] = await db
      .insert(users)
      .values({
        id: token(),
        name: b.name,
        email: b.email,
        password: await hash(b.password),
        role: "viewer",
        permissions: ["view", "network.read"],
        servers: [],
      })
      .returning();
  } catch (e: any) {
    if (e?.code === "23505" || e?.cause?.code === "23505")
      throw new AppError(409, "An account with this email already exists.");
    throw e;
  }
  await auditEvent(u.id, config.sharedControl ? "auth.signup.shared-control" : "auth.signup.pending-approval", null);
  res.status(201).json({
    ...(await createSession(res, u)),
    message: config.sharedControl
      ? "Account created. Your shared server workspace is ready."
      : "Account created. The owner must assign a server before you can access it.",
  });
});
authRouter.post("/login", limiter, csrf, async (req, res) => {
  const b = loginSchema.parse(req.body);
  const matches = b.email.includes("@")
    ? await db.select().from(users).where(eq(users.email, b.email.toLowerCase())).limit(2)
    : await db.select().from(users).where(sql`lower(${users.name}) = ${b.email.toLowerCase()}`).limit(2);
  const u = matches.length === 1 ? matches[0] : null;
  if (!u || u.suspended || !(await verify(u.password, b.password)))
    throw new AppError(401, "Email or password is incorrect");
  await auditEvent(u.id, "auth.login", null);
  res.json(await createSession(res, u));
});
authRouter.post("/register", limiter, csrf, async (req, res) => {
  const b = z
    .object({
      token: z.string().min(20).max(128),
      email: z.email().transform((x) => x.toLowerCase()),
      name: z.string().min(1).max(80),
      password,
    })
    .parse(req.body);
  const u = await db.transaction(async (tx: any) => {
    await tx.execute(sql.raw("LOCK TABLE users IN EXCLUSIVE MODE"));
    let [invite] = await tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, digest(b.token)),
          gt(invitations.expires, new Date()),
        ),
      )
      .returning();
    if (
      !invite &&
      config.hostedSetupToken.length >= 43 &&
      digest(b.token) === digest(config.hostedSetupToken)
    ) {
      const owners = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "owner"))
        .limit(1);
      if (owners.length)
        throw new AppError(409, "Owner has already been created");
      invite = {
        email: "bootstrap",
        role: "owner",
        permissions: ["*"],
        servers: [config.server],
      };
    }
    if (!invite || invite.role === "reset")
      throw new AppError(400, "Invitation is invalid or expired");
    if (invite.email === "bootstrap") {
      if (
        (await tx.select().from(users).where(eq(users.role, "owner")).limit(1))
          .length
      )
        throw new AppError(409, "Owner has already been created");
    } else if (invite.email !== b.email)
      throw new AppError(400, "Use the invited email address");
    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.email, b.email))
      .limit(1);
    if (existing && invite.email === "bootstrap") {
      if (existing.suspended || !(await verify(existing.password, b.password)))
        throw new AppError(401, "Use this existing account's current password to finish owner setup.");
      const [claimed] = await tx.update(users).set({
        role: "owner",
        permissions: ["*"],
        servers: [config.server],
      }).where(eq(users.id, existing.id)).returning();
      await tx.delete(sessions).where(eq(sessions.userId, existing.id));
      return claimed;
    }
    if (existing)
      throw new AppError(
        409,
        "An account with this email already exists. Create the owner with an email that has not signed up yet.",
      );
    const [created] = await tx
      .insert(users)
      .values({
        id: token(),
        email: b.email,
        name: b.name,
        password: await hash(b.password),
        role: invite.role,
        permissions: invite.permissions,
        servers: invite.servers,
      })
      .returning();
    return created;
  });
  await auditEvent(u.id, "auth.register", null);
  res.json(await createSession(res, u));
});
authRouter.post("/forgot", limiter, csrf, async (req, res) => {
  const { email } = z
    .object({ email: z.email().transform((x) => x.toLowerCase()) })
    .parse(req.body);
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
    throw new AppError(
      503,
      "Email recovery is unavailable. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM on the backend.",
    );
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (u) {
    const value = token();
    await db.insert(invitations).values({
      id: digest(value),
      email,
      role: "reset",
      permissions: [],
      servers: [],
      expires: new Date(Date.now() + 15 * 60000),
    });
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Reset your GOD Subconsole password",
      text: `Reset your password within 15 minutes: ${config.app}/#reset=${value}`,
    });
  }
  res.json({
    message: "If this account exists, a recovery email has been sent.",
  });
});
authRouter.post("/reset", limiter, csrf, async (req, res) => {
  const b = z
    .object({ token: z.string().min(20).max(128), password })
    .parse(req.body);
  await db.transaction(async (tx: any) => {
    const [invite] = await tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, digest(b.token)),
          eq(invitations.role, "reset"),
          gt(invitations.expires, new Date()),
        ),
      )
      .returning();
    if (!invite) throw new AppError(400, "Recovery link is invalid or expired");
    const [u] = await tx
      .update(users)
      .set({ password: await hash(b.password) })
      .where(eq(users.email, invite.email))
      .returning();
    if (u) await tx.delete(sessions).where(eq(sessions.userId, u.id));
  });
  res.json({
    message: "Password updated. Sign in with your new password.",
  });
});
authRouter.use(auth, csrf);
authRouter.get("/me", (req, res) =>
  res.json({ user: publicUser(req.user), csrf: req.session.csrf }),
);
authRouter.post("/logout", async (req, res) => {
  await db.delete(sessions).where(eq(sessions.id, req.session.id));
  res.clearCookie("gs_session", { path: "/" }).json({ ok: true });
});
authRouter.get("/sessions", async (req, res) => {
  const rows = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      expires: sessions.expires,
    })
    .from(sessions)
    .where(
      and(eq(sessions.userId, req.user.id), gt(sessions.expires, new Date())),
    );
  res.json(rows.map((s: any) => ({ ...s, current: s.id === req.session.id })));
});
authRouter.delete("/sessions/:id", async (req, res) => {
  await db
    .delete(sessions)
    .where(
      and(
        eq(sessions.id, String(req.params.id)),
        eq(sessions.userId, req.user.id),
      ),
    );
  res.json({ ok: true });
});
authRouter.patch("/profile", async (req, res) => {
  const { name } = z
    .object({ name: z.string().min(1).max(80) })
    .parse(req.body);
  await db.update(users).set({ name }).where(eq(users.id, req.user.id));
  res.json({ ok: true });
});
authRouter.get("/avatar", async (req, res) => {
  const [image] = await db.select().from(profileImages).where(eq(profileImages.userId, req.user.id)).limit(1);
  if (!image) throw new AppError(404, "Profile photo unavailable");
  res.type(image.mime).send(Buffer.from(image.body, "base64"));
});
authRouter.post("/avatar", async (req, res) => {
  const { dataUrl } = z.object({dataUrl:z.string().max(350_000)}).parse(req.body);
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new AppError(400, "Choose a PNG, JPEG, or WebP photo");
  const mime = match[1], data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 250_000) throw new AppError(413, "Profile photo must be under 250 KB");
  const valid = mime === "image/png"
    ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === "image/jpeg"
      ? data[0] === 255 && data[1] === 216 && data.at(-2) === 255 && data.at(-1) === 217
      : data.toString("ascii",0,4) === "RIFF" && data.toString("ascii",8,12) === "WEBP";
  if (!valid) throw new AppError(400, "Photo content does not match its format");
  const avatarAt = new Date();
  await db.transaction(async (tx:any) => {
    await tx.insert(profileImages).values({userId:req.user.id,mime,body:data.toString("base64")})
      .onConflictDoUpdate({target:profileImages.userId,set:{mime,body:data.toString("base64")}});
    await tx.update(users).set({avatarAt}).where(eq(users.id,req.user.id));
  });
  await auditEvent(req.user.id,"profile.avatar.update",null);
  res.json({avatarAt:avatarAt.toISOString(),message:"Profile photo saved to your account."});
});
authRouter.delete("/avatar", async (req, res) => {
  await db.transaction(async (tx:any) => {
    await tx.delete(profileImages).where(eq(profileImages.userId,req.user.id));
    await tx.update(users).set({avatarAt:null}).where(eq(users.id,req.user.id));
  });
  await auditEvent(req.user.id,"profile.avatar.remove",null);
  res.json({avatarAt:null,message:"Profile photo removed."});
});
authRouter.post("/password", async (req, res) => {
  const b = z
    .object({ current: z.string().max(128), password })
    .parse(req.body);
  if (!(await verify(req.user.password, b.current)))
    throw new AppError(403, "Current password is incorrect");
  await db.transaction(async (tx: any) => {
    await tx
      .update(users)
      .set({ password: await hash(b.password) })
      .where(eq(users.id, req.user.id));
    await tx.delete(sessions).where(eq(sessions.userId, req.user.id));
  });
  res.clearCookie("gs_session", { path: "/" }).json({
    message: "Password changed; all sessions revoked. Sign in again.",
  });
});
export async function cleanupAuth() {
  await db.delete(sessions).where(lt(sessions.expires, new Date()));
  await db.delete(invitations).where(lt(invitations.expires, new Date()));
}
