import { eq, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { settings } from "./schema";
import { AppError, filePath, safeError } from "./security";
import { panel, serverPath, externalFetch, upstreamPermission } from "./panel";
import { detectServerSoftware } from "./software";
import { downloadVerifiedFile, verifiedRelease } from "./modrinth";
import { auditEvent } from "./auth";

type Kind = "plugin" | "mod";
type Job = { id: string; ownerId: string; serverId: string; kind: Kind; projectId: string;
  stage: "queued" | "downloading" | "uploading" | "verifying" | "complete" | "failed";
  received: number; total: number; filename: string | null; message: string; updatedAt: number };
const jobs = new Map<string, Job>();
const active = new Set<string>();
const directory = (kind: Kind) => kind === "plugin" ? "/plugins" : "/mods";
const settingId = (serverId: string, kind: Kind, projectId: string) => `install:${serverId}:${kind}:${projectId}`;

async function folderFiles(serverId: string, kind: Kind, create: boolean) {
  const p = serverPath(serverId);
  const name = directory(kind).slice(1);
  const root = await panel(p + "/files/list?directory=%2F");
  const folder = (root.data || []).find((item: any) => item.attributes.name === name)?.attributes;
  if (folder?.is_symlink || folder?.is_link || folder?.is_file)
    throw new AppError(409, `The ${name} directory is blocked or unsafe`);
  if (!folder) {
    if (!create) return [];
    await panel(p + "/files/create-folder", "POST", { root: "/", name });
  }
  const listed = await panel(p + "/files/list?directory=" + encodeURIComponent(directory(kind)));
  return (listed.data || []).map((item: any) => item.attributes);
}

export async function installedAddons(serverId: string, kind: Kind) {
  const files = await folderFiles(serverId, kind, false);
  const records = await db.select().from(settings).where(like(settings.id, `install:${serverId}:${kind}:%`));
  const installed = records.map((record: any) => ({ projectId: record.value.projectId, versionId: record.value.versionId,
    filename: record.value.filename, version: record.value.version, source: "Modrinth" }))
    .filter((record: any) => files.some((file: any) => file.is_file && file.name === record.filename));
  return { files: files.filter((file: any) => file.is_file && /\.jar(?:\.disabled)?$/i.test(file.name)), installed };
}

export function getInstallJob(jobId: string, ownerId: string, serverId: string) {
  const job = jobs.get(jobId);
  if (!job || job.ownerId !== ownerId || job.serverId !== serverId) throw new AppError(404, "Install job unavailable");
  return job;
}

export function startInstallJob(ownerId: string, serverId: string, kind: Kind, projectId: string, versionId: string) {
  const key = `${serverId}:${kind}:${projectId}`;
  if (active.has(key)) throw new AppError(409, "An installation for this project is already in progress");
  active.add(key);
  const job: Job = { id: randomUUID(), ownerId, serverId, kind, projectId, stage: "queued", received: 0,
    total: 0, filename: null, message: "Checking release compatibility", updatedAt: Date.now() };
  jobs.set(job.id, job);
  const update = (stage: Job["stage"], message: string) => { job.stage = stage; job.message = message; job.updatedAt = Date.now(); };
  void (async () => {
    let rollbackName: string | null = null;
    try {
      await upstreamPermission(serverId, "file.create");
      const software = await detectServerSoftware(serverId);
      const release = await verifiedRelease(projectId, versionId, software, kind);
      const filename = release.file.filename;
      filePath(directory(kind) + "/" + filename);
      job.filename = filename;
      job.total = release.file.size;
      const existing = await installedAddons(serverId, kind);
      if (existing.files.some((file: any) => file.name.toLowerCase() === filename.toLowerCase()))
        throw new AppError(409, "This JAR filename already exists on the server");
      const prior = existing.installed.find((item: any) => item.projectId === projectId);
      if (prior?.versionId === versionId) throw new AppError(409, "This release is already installed");
      if (prior) await upstreamPermission(serverId, "file.update");
      if (prior && existing.files.some((file: any) => file.name === prior.filename + ".disabled"))
        throw new AppError(409, "Old version cannot be disabled because its disabled filename already exists");
      update("downloading", "Downloading and verifying release from Modrinth");
      const body = await downloadVerifiedFile(release.file, received => { job.received = received; job.updatedAt = Date.now(); });
      update("uploading", `Uploading verified ${filename} to ${directory(kind)}`);
      const files = await folderFiles(serverId, kind, true);
      if (files.some((file: any) => file.name.toLowerCase() === filename.toLowerCase()))
        throw new AppError(409, "A file with this name appeared during installation");
      const p = serverPath(serverId);
      const link = await panel(p + "/files/upload");
      const url = new URL(link.attributes.url);
      url.searchParams.set("directory", directory(kind));
      const form = new FormData();
      form.append("files", new Blob([new Uint8Array(body)]), filename);
      const response = await externalFetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(120000) });
      await response.body?.cancel();
      if (!response.ok) throw new AppError(502, `Hosting upload failed (HTTP ${response.status})`);
      rollbackName = filename;
      update("verifying", "Checking the JAR on the selected server");
      const uploaded = await folderFiles(serverId, kind, false);
      if (!uploaded.some((file: any) => file.is_file && file.name === filename && Number(file.size) === body.length))
        throw new AppError(502, "Hosting API did not confirm the uploaded JAR and size");
      if (prior) {
        const oldName = prior.filename;
        const disabled = oldName + ".disabled";
        await panel(p + "/files/rename", "PUT", { root: directory(kind), files: [{ from: oldName, to: disabled }] });
      }
      rollbackName = null;
      await db.insert(settings).values({ id: settingId(serverId, kind, projectId), value: {
        projectId, versionId, filename, version: release.version.version,
      } }).onConflictDoUpdate({ target: settings.id, set: { value: {
        projectId, versionId, filename, version: release.version.version,
      } } });
      await auditEvent(ownerId, `${kind}.install`, serverId);
      update("complete", `${filename} verified in ${directory(kind)}. Restart the server to load it.`);
    } catch (error) {
      let message = safeError(error);
      if (rollbackName) {
        try {
          await panel(serverPath(serverId) + "/files/delete", "POST", { root: directory(kind), files: [rollbackName] });
        } catch {
          message += `; remove ${rollbackName} manually from ${directory(kind)} before retrying`;
        }
      }
      update("failed", message);
      await auditEvent(ownerId, `${kind}.install.failed`, serverId, "failed").catch(() => {});
    } finally {
      active.delete(key);
      setTimeout(() => jobs.delete(job.id), 30 * 60_000).unref();
    }
  })();
  return job;
}
