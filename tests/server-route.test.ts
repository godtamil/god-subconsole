import { describe, expect, it } from "vitest";
import { parseServerRoute, serverUrl } from "../src/serverRoute";

describe("server-specific dashboard routes", () => {
  it("keeps the landing page outside a server dashboard", () => {
    expect(parseServerRoute("/")).toBeNull();
    expect(parseServerRoute("/servers")).toBeNull();
  });
  it("recognizes valid server and section URLs", () => {
    expect(parseServerRoute("/servers/abc123/overview")).toEqual({ identifier: "abc123", page: "overview" });
    expect(parseServerRoute("/servers/abc123/files")).toEqual({ identifier: "abc123", page: "files" });
    expect(parseServerRoute("/servers/abc123")).toEqual({ identifier: "abc123", page: "overview" });
    expect(serverUrl("abc123", "backups")).toBe("/servers/abc123/backups");
  });
  it("rejects unknown sections and malformed identifiers", () => {
    expect(parseServerRoute("/servers/abc123/unknown")).toBeNull();
    expect(parseServerRoute("/servers/%2e%2e/files")).toBeNull();
    expect(parseServerRoute("/servers/abc123/files/other")).toBeNull();
  });
});
