export function auditLabel(action: string) {
  if (action.startsWith("denied:POST:") && action.endsWith("/power")) return "Power action failed";
  if (action.startsWith("denied:POST:") && action.endsWith("/command")) return "Console command failed";
  if (action === "power.request.failed") return "Power action failed";
  if (action === "console.command.failed") return "Console command failed";
  return action;
}
