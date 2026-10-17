import { config } from "./config";
import { AppError } from "./security";
import dns from "node:dns/promises";
import net from "node:net";
import { Agent,fetch as transportFetch } from "undici";
export function publicIp(ip: string) {
  if (net.isIP(ip) === 4) {
    const p = ip.split(".").map(Number);
    return !(
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 198 && (p[1] === 18 || p[1] === 19))
    );
  }
  return net.isIP(ip) === 6 && !/^(::|fc|fd|fe[89ab])/i.test(ip);
}
export async function validateDestination(url: URL) {
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((x) => !publicIp(x.address)))
    throw new AppError(
      502,
      "Integration destination must resolve to a public address",
    );
}
// Validate the addresses at connection time too, closing the DNS rebinding gap.
export const publicLookup: any = (
  host: string,
  options: any,
  callback: any,
) => {
  dns
    .lookup(host, { all: true })
    .then((addresses) => {
      if (!addresses.length || addresses.some((x) => !publicIp(x.address)))
        return callback(Error("Non-public destination"));
      if (options?.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    })
    .catch(() => callback(Error("DNS resolution failed")));
};
const dispatcher = new Agent({ connect: { lookup: publicLookup } });
export async function externalFetch(url: URL, init: RequestInit = {}) {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    ![new URL(config.origin).hostname, ...config.wsHosts].includes(url.hostname)
  )
    throw new AppError(502, "Unapproved transfer destination");
  return await transportFetch(url, { ...init, redirect: "error", dispatcher } as any) as unknown as Response;
}
let validated = 0;
export async function panel(
  path: string,
  method = "GET",
  body?: unknown,
  raw = false,
) {
  if (!config.key) throw new AppError(503, "Hosting API key is not configured");
  if (Date.now() - validated > 60000) {
    await validateDestination(new URL(config.origin));
    validated = Date.now();
  }
  const r = await externalFetch(new URL(config.origin + "/api/client" + path), {
    method,
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: `Bearer ${config.key}`,
      Accept: "Application/vnd.pterodactyl.v1+json",
      ...(body !== undefined
        ? { "Content-Type": raw ? "text/plain" : "application/json" }
        : {}),
    },
    body:
      body === undefined
        ? undefined
        : raw
          ? String(body)
          : JSON.stringify(body),
  }).catch(() => {
    throw new AppError(
      502,
      "Hosting panel could not be reached. Last known data may be stale.",
    );
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new AppError(
      r.status === 403
        ? 403
        : r.status === 404
          ? 404
          : r.status === 429
            ? 429
            : 502,
      r.status === 403
        ? "Hosting account does not permit this operation"
        : r.status === 404
          ? "This hosting feature or resource is unavailable"
          : r.status === 429
            ? "Hosting rate limit reached; try again shortly"
            : `Hosting request failed (HTTP ${r.status})`,
    );
  }
  if (r.status === 204) return null;
  if (raw) {
    const length = Number(r.headers.get("content-length"));
    if (length > 1024 * 1024) {
      await r.body?.cancel();
      throw new AppError(413, "Text file exceeds 1 MiB editor limit");
    }
    const reader = r.body?.getReader();
    let content = "",
      size = 0;
    const decoder = new TextDecoder();
    if (reader)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw new AppError(413, "Text file exceeds 1 MiB editor limit");
        }
        content += decoder.decode(value, { stream: true });
      }
    return content + decoder.decode();
  }
  return r.json();
}
export const serverPath = (id: string) => "/servers/" + encodeURIComponent(id);
export async function details(id: string) {
  return panel(serverPath(id));
}
export async function upstreamPermission(id: string, permission: string) {
  const d = await details(id);
  const p = d.meta?.user_permissions || [];
  if (
    !d.meta?.is_server_owner &&
    !p.includes("*") &&
    permission !== "view" &&
    !p.includes(permission)
  )
    throw new AppError(403, "Upstream permission denied");
  return d;
}
export function sanitizeDetails(d: any) {
  const a = d.attributes;
  return {
    identifier: a.identifier,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.uuid || "") ? a.uuid : null,
    name: a.name,
    description: a.description,
    node: a.node,
    limits: a.limits,
    feature_limits: a.feature_limits,
    is_suspended: a.is_suspended,
    is_installing: a.is_installing,
    allocations:
      a.relationships?.allocations?.data?.map((x: any) => x.attributes) || [],
    image: a.docker_image,
    permissions: d.meta?.user_permissions || [],
    isOwner: !!d.meta?.is_server_owner,
  };
}
