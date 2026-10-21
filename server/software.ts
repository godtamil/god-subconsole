import { AppError } from "./security";
import { panel, serverPath, upstreamPermission } from "./panel";

export type ServerSoftware = {
  loader: "paper" | "purpur" | "spigot" | "bukkit" | "folia" | "fabric" | "forge" | "neoforge" | "quilt" | null;
  minecraftVersion: string | null;
  source: "latest.log" | "unknown";
  kind: "plugin" | "mod" | "unknown";
};

export function parseSoftwareLog(log: string): ServerSoftware {
  const text = log.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const explicit = [...text.matchAll(/(?:This server is running|Loading|Starting)\s+(Paper|Purpur|Spigot|Bukkit|Folia|Fabric|Forge|NeoForge|Quilt)\b/gi)]
    .at(-1)?.[1]?.toLowerCase();
  const loader = (explicit || (/with Fabric Loader/i.test(text) ? "fabric" : /NeoForge/i.test(text) ? "neoforge" : /MinecraftForge/i.test(text) ? "forge" : null)) as ServerSoftware["loader"];
  const versions = [...text.matchAll(/(?:Starting minecraft server version|\(MC:\s*|Loading Minecraft)\s*([0-9]+(?:\.[0-9]+){1,3})/gi)];
  const minecraftVersion = versions.at(-1)?.[1] || null;
  const kind = loader && ["paper", "purpur", "spigot", "bukkit", "folia"].includes(loader)
    ? "plugin" : loader ? "mod" : "unknown";
  return { loader, minecraftVersion, source: "latest.log", kind };
}

export function compatibleLoaders(software: ServerSoftware) {
  switch (software.loader) {
    case "purpur": return ["purpur", "paper", "spigot", "bukkit"];
    case "paper": return ["paper", "spigot", "bukkit"];
    case "spigot": return ["spigot", "bukkit"];
    case "bukkit": return ["bukkit"];
    case "folia": return ["folia"];
    case "fabric": return ["fabric"];
    case "forge": return ["forge"];
    case "neoforge": return ["neoforge"];
    case "quilt": return ["quilt"];
    default: return [];
  }
}

export function versionCompatible(version: any, software: ServerSoftware, kind: "plugin" | "mod") {
  if (software.kind !== kind || !software.minecraftVersion || !software.loader) return false;
  if (!Array.isArray(version.game_versions) || !version.game_versions.includes(software.minecraftVersion)) return false;
  if (!Array.isArray(version.loaders) || !version.loaders.some((loader: string) => compatibleLoaders(software).includes(loader.toLowerCase()))) return false;
  return true;
}

export async function detectServerSoftware(id: string): Promise<ServerSoftware> {
  await upstreamPermission(id, "file.read");
  const path = serverPath(id) + "/files/contents?file=" + encodeURIComponent("/logs/latest.log");
  try {
    const log = await panel(path, "GET", undefined, true);
    return parseSoftwareLog(log);
  } catch (error) {
    if (error instanceof AppError && [403, 413].includes(error.status)) throw error;
    return { loader: null, minecraftVersion: null, source: "unknown", kind: "unknown" };
  }
}
