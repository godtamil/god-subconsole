export const serverPages = new Set([
  "overview", "console", "files", "plugins", "mods", "schedules", "backups",
  "settings", "players", "network", "startup", "subusers", "activity",
  "users", "health", "account",
]);

export function parseServerRoute(pathname: string) {
  const match = /^\/servers\/([a-zA-Z0-9_-]{1,80})(?:\/([a-z-]+))?\/?$/.exec(pathname);
  if (!match || !serverPages.has(match[2] || "overview")) return null;
  return { identifier: match[1], page: match[2] || "overview" };
}

export function serverUrl(identifier: string, page = "overview") {
  return `/servers/${encodeURIComponent(identifier)}/${page}`;
}
