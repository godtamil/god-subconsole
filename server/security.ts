import {
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { config } from "./config";
export const token = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHmac("sha256", config.secret).update(value).digest("hex");
const key = createHash("sha256").update(config.encryption).digest();
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([
    iv,
    cipher.update(value),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
export function decrypt(value: string) {
  const b = Buffer.from(value, "base64"),
    d = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(-16));
  return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString();
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function filePath(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 1024 ||
    /[\x00-\x1f\\]/.test(value)
  )
    throw new AppError(400, "Invalid file path");
  const parts = value.split("/").filter(Boolean);
  if (parts.some((x) => x === "." || x === ".." || /%2e|%2f|%5c/i.test(x)))
    throw new AppError(400, "Path traversal is not allowed");
  if (
    parts.some((x) =>
      /(^\.|\.pem$|\.key$|\.p12$|\.env|credentials|secrets|password|tokens|private)/i.test(
        x,
      ),
    )
  )
    throw new AppError(
      403,
      "This file is protected by the server secret policy",
    );
  return "/" + parts.join("/");
}
export function permitted(user: any, permission: string, server?: string) {
  return (
    !!user &&
    !user.suspended &&
    (!server || user.servers.includes(server)) &&
    (user.permissions.includes("*") || user.permissions.includes(permission))
  );
}
export function publicUser(u: any) {
  return {
    sharedControl: !!u.sharedControl,
    id: u.id,
    email: u.email,
    name: u.name,
    avatarAt: u.avatarAt || null,
    role: u.role,
    permissions: u.permissions,
    servers: u.servers,
    suspended: u.suspended,
  };
}
export function safeError(e: unknown) {
  return e instanceof AppError
    ? e.message
    : "Request failed. Please try again or check integration health.";
}
