import { createHash } from "node:crypto";
import { Agent, fetch } from "undici";
import { AppError } from "./security";
import { publicLookup } from "./panel";
import { compatibleLoaders, versionCompatible, type ServerSoftware } from "./software";

const apiOrigin = "https://api.modrinth.com/v2";
const headers = { "User-Agent": "god-subconsole/1.0.0 (github.com/godtamil/god-subconsole)", Accept: "application/json" };
const dispatcher = new Agent({ connect: { lookup: publicLookup } });
const projectId = /^[A-Za-z0-9]{1,24}$/;
const serverSupported = (project: any) => project?.server_side === "required" || project?.server_side === "optional";

async function get(path: string): Promise<any> {
  const response = await fetch(apiOrigin + path, {
    headers, dispatcher, redirect: "error", signal: AbortSignal.timeout(12000),
  }).catch(() => { throw new AppError(502, "Modrinth is temporarily unavailable"); });
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(response.status === 429 ? 429 : 502,
      response.status === 429 ? "Modrinth rate limit reached" : "Modrinth request failed");
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 2_000_000) { await response.body?.cancel(); throw new AppError(502, "Modrinth response is too large"); }
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new AppError(502, "Modrinth response is too large");
  return JSON.parse(raw);
}

function safeFile(version: any) {
  const files = Array.isArray(version.files) ? version.files : [];
  const file = files.find((item: any) => item.primary && item.file_type == null && /\.jar$/i.test(item.filename))
    || files.find((item: any) => item.file_type == null && /\.jar$/i.test(item.filename));
  if (!file || !/^[A-Za-z0-9][A-Za-z0-9._+() -]{0,179}\.jar$/i.test(file.filename)
    || !Number.isInteger(file.size) || file.size < 4 || file.size > 25_000_000
    || !/^[a-f0-9]{128}$/i.test(file.hashes?.sha512 || "")) return null;
  const url = new URL(file.url);
  if (url.protocol !== "https:" || url.hostname !== "cdn.modrinth.com" || url.username || url.password || url.port)
    return null;
  return { filename: file.filename, size: file.size, url: file.url, sha512: file.hashes.sha512.toLowerCase() };
}

function mapVersion(version: any) {
  const file = safeFile(version);
  return {
    id: String(version.id || ""), projectId: String(version.project_id || ""),
    name: String(version.name || ""), version: String(version.version_number || ""),
    minecraftVersions: version.game_versions || [], software: version.loaders || [],
    environment: version.environment || "unknown", releasedAt: version.date_published || null,
    filename: file?.filename || null, size: file?.size || null,
    dependencies: (Array.isArray(version.dependencies) ? version.dependencies : [])
      .filter((item: any) => item.dependency_type === "required")
      .map((item: any) => ({ projectId: item.project_id || null, versionId: item.version_id || null, filename: item.file_name || null })),
  };
}

export async function compatibleVersions(project: string, software: ServerSoftware, kind: "plugin" | "mod") {
  if (!projectId.test(project) || !software.minecraftVersion || software.kind !== kind) return [];
  if (kind === "mod" && !serverSupported(await get(`/project/${project}`))) return [];
  const params = new URLSearchParams({
    loaders: JSON.stringify(compatibleLoaders(software)),
    game_versions: JSON.stringify([software.minecraftVersion]),
    include_changelog: "false",
  });
  const response = await get(`/project/${project}/version?${params}`);
  return (Array.isArray(response) ? response : [])
    .filter((version: any) => version.project_id === project && versionCompatible(version, software, kind) && safeFile(version))
    .slice(0, 30).map(mapVersion);
}

export async function searchProjects(query: string, offset: number, software: ServerSoftware, kind: "plugin" | "mod") {
  if (!software.minecraftVersion || software.kind !== kind) return { source: "Modrinth", total: 0, offset, data: [] };
  const facets = JSON.stringify([
    [`all_project_types:${kind}`],
    [`versions:${software.minecraftVersion}`],
    compatibleLoaders(software).map(loader => `categories:${loader}`),
  ]);
  const params = new URLSearchParams({ query, facets, limit: "20", offset: String(offset) });
  const response = await get(`/search?${params}`);
  const hits = (Array.isArray(response.hits) ? response.hits : []).slice(0, 20)
    .filter((hit: any) => projectId.test(hit.project_id || ""));
  const data: any[] = [];
  for (let start = 0; start < hits.length; start += 5) {
    const batch = await Promise.allSettled(hits.slice(start, start + 5).map(async (hit: any) => {
      const versions = await compatibleVersions(hit.project_id, software, kind);
      if (!versions.length) return null;
      const latest = versions[0];
      return {
        id: hit.project_id, title: String(hit.title || ""), description: String(hit.description || ""),
        author: String(hit.author || ""), icon: /^https:\/\/cdn\.modrinth\.com\//.test(hit.icon_url || "") ? hit.icon_url : null,
        downloads: Number(hit.downloads) || 0,
        minecraftVersions: [software.minecraftVersion], software: latest.software,
        latest, source: "Modrinth", url: `https://modrinth.com/${kind}/${hit.project_id}`,
      };
    }));
    for (const result of batch) if (result.status === "fulfilled" && result.value) data.push(result.value);
  }
  return { source: "Modrinth", total: Number(response.total_hits) || 0, offset, data };
}

export async function verifiedRelease(project: string, versionId: string, software: ServerSoftware, kind: "plugin" | "mod") {
  if (!projectId.test(project) || !projectId.test(versionId)) throw new AppError(400, "Invalid release selection");
  if (kind === "mod" && !serverSupported(await get(`/project/${project}`)))
    throw new AppError(409, "This mod does not explicitly support server use");
  const version = await get(`/version/${versionId}`);
  if (version.project_id !== project || !versionCompatible(version, software, kind))
    throw new AppError(409, "Release is incompatible with this server");
  const file = safeFile(version);
  if (!file) throw new AppError(409, "No verified server JAR is available for this release");
  const dependencies = mapVersion(version).dependencies;
  if (dependencies.length) throw new AppError(409, "Required dependencies must be installed and verified first; one-click installation is unavailable for this release");
  return { version: mapVersion(version), file };
}

export async function downloadVerifiedFile(file: { url: string; size: number; sha512: string }, onProgress: (received: number) => void) {
  const url = new URL(file.url);
  if (url.protocol !== "https:" || url.hostname !== "cdn.modrinth.com" || url.username || url.password || url.port)
    throw new AppError(400, "Unapproved release download URL");
  const response = await fetch(url, { dispatcher, headers: { "User-Agent": headers["User-Agent"] }, redirect: "error", signal: AbortSignal.timeout(120000) })
    .catch(() => { throw new AppError(502, "Release download failed"); });
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new AppError(502, `Release download failed (HTTP ${response.status})`); }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > 25_000_000 || received > file.size) { await response.body.cancel(); throw new AppError(413, "Release exceeds its verified size"); }
    chunks.push(chunk);
    onProgress(received);
  }
  const body = Buffer.concat(chunks);
  if (body.length !== file.size || body.readUInt32LE(0) !== 0x04034b50 || createHash("sha512").update(body).digest("hex") !== file.sha512)
    throw new AppError(502, "Release size, JAR format, or SHA-512 verification failed");
  return body;
}
