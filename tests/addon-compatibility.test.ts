import { describe, expect, it } from "vitest";
import { compatibleLoaders, parseSoftwareLog, versionCompatible } from "../server/software";

const paper = parseSoftwareLog("[Server thread/INFO]: This server is running Paper version 26.2\n[Server thread/INFO]: Starting minecraft server version 26.2");
const fabric = parseSoftwareLog("Loading Fabric 0.18.0\nStarting minecraft server version 1.21.1");

describe("server addon compatibility", () => {
  it("detects the actual loader and version from a startup log", () => {
    expect(paper).toMatchObject({ loader: "paper", minecraftVersion: "26.2", kind: "plugin" });
    expect(fabric).toMatchObject({ loader: "fabric", minecraftVersion: "1.21.1", kind: "mod" });
  });
  it("allows only matching plugin loaders and Minecraft versions", () => {
    expect(compatibleLoaders(paper)).toEqual(["paper", "spigot", "bukkit"]);
    expect(versionCompatible({ loaders: ["spigot"], game_versions: ["26.2"] }, paper, "plugin")).toBe(true);
    expect(versionCompatible({ loaders: ["fabric"], game_versions: ["26.2"] }, paper, "plugin")).toBe(false);
    expect(versionCompatible({ loaders: ["datapack"], game_versions: ["26.2"] }, paper, "plugin")).toBe(false);
    expect(versionCompatible({ loaders: ["paper"], game_versions: ["1.21.1"] }, paper, "plugin")).toBe(false);
  });
  it("blocks mods on Paper and other loader/version mismatches", () => {
    expect(versionCompatible({ loaders: ["fabric"], game_versions: ["1.21.1"] }, paper, "mod")).toBe(false);
    expect(versionCompatible({ loaders: ["forge"], game_versions: ["1.21.1"] }, fabric, "mod")).toBe(false);
    expect(versionCompatible({ loaders: ["fabric"], game_versions: ["1.20.4"] }, fabric, "mod")).toBe(false);
    expect(versionCompatible({ loaders: ["fabric"], game_versions: ["1.21.1"] }, fabric, "mod")).toBe(true);
  });
});
