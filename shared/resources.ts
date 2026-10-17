export function allocation(usage: unknown, limit: unknown) {
  const actual =
    typeof usage === "number" && Number.isFinite(usage) && usage >= 0
      ? usage
      : null;
  const max =
    typeof limit === "number" && Number.isFinite(limit) && limit >= 0
      ? limit
      : null;
  const percent =
    actual !== null && max !== null && max > 0 ? (actual / max) * 100 : null;
  return {
    actual,
    limit: max,
    percent,
    bar: percent === null ? 0 : Math.min(100, Math.max(0, percent)),
    label: max === 0 ? "Unlimited" : max === null ? "Unavailable" : null,
  };
}
export function bytes(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return "Unavailable";
  return value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(2)} GiB`
    : `${(value / 1024 ** 2).toFixed(1)} MiB`;
}
export function uptime(ms: unknown) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0)
    return "Unavailable";
  const minutes = Math.floor(ms / 60000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export const permissionOptions = [
  "view",
  "console.read",
  "console.command",
  "console.templates",
  "power.start",
  "power.stop",
  "power.restart",
  "power.kill",
  "files.read",
  "files.write",
  "files.delete",
  "backups.read",
  "backups.download",
  "backups.create",
  "backups.restore",
  "backups.delete",
  "schedules.read",
  "schedules.write",
  "network.read",
  "startup.read",
  "startup.write",
  "settings.write",
  "subusers.read",
  "subusers.write",
  "audit.read",
];
export const roleDefaults: Record<string, string[]> = {
  owner: ["*"],
  admin: [
    "view",
    "console.read",
    "power.start",
    "power.stop",
    "power.restart",
    "files.read",
    "backups.read",
    "backups.create",
    "schedules.read",
    "network.read",
    "startup.read",
  ],
  operator: ["view", "console.read", "console.templates"],
  viewer: ["view", "network.read"],
};
