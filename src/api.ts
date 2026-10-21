export let csrfToken = "";
export function setCsrf(value: string) {
  csrfToken = value;
}
export async function request(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    const error = new Error(data.error || "Request failed") as Error & { status: number };
    error.status = r.status;
    throw error;
  }
  return data;
}
export const allowed = (user: any, permission: string) =>
  !!user &&
  (user.permissions.includes("*") || user.permissions.includes(permission));
