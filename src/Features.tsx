import { useEffect, useState, type FormEvent } from "react";
import {
  Folder,
  FileText,
  ChevronRight,
  ArrowLeft,
  Plus,
  RefreshCw,
  ShieldCheck,
  Copy,
  Save,
  Trash2,
  Edit3,
  Download,
} from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { request, allowed, setCsrf, csrfToken } from "./api";
import { Empty, Modal } from "./components";
import UploadPanel from "./UploadPanel";
import IntegrationPanel from "./IntegrationPanel";
import { bytes, permissionOptions, roleDefaults } from "../shared/resources";
type Props = {
  page: string;
  user: any;
  server: string;
  overview: any;
  notify: (message: string) => void;
  onUser: (user: any) => void;
};
export default function Features({
  page,
  user,
  server,
  overview,
  notify,
  onUser,
}: Props) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0),
    [directory, setDirectory] = useState("/"),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState<any>(null),
    [editor, setEditor] = useState<any>(null),
    [saving, setSaving] = useState(false),
    [auditPage, setAuditPage] = useState(0),
    [filter, setFilter] = useState("");
  const base = `/servers/${server}`;
  useEffect(() => {
    setDirectory(page === "plugins" ? "/plugins" : "/");
    setSearch("");
    setEditor(null);
    setData(null);
    setError("");
  }, [page, server]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    let endpoint = "";
    if (
      ["backups", "schedules", "network", "startup", "subusers"].includes(page)
    )
      endpoint = base + "/features/" + page;
    if (page === "files")
      endpoint =
        base +
        "/files?directory=" +
        encodeURIComponent(directory);
    if (page === "plugins") endpoint = base + "/plugins";
    if (page === "users") endpoint = "/admin/users";
    if (page === "health") endpoint = "/admin/health";
    if (page === "activity")
      endpoint =
        "/audit?page=" + auditPage + "&filter=" + encodeURIComponent(filter);
    if (page === "account") endpoint = "/auth/sessions";
    if (page === "settings") endpoint = "/branding";
    if (!endpoint) {
      setLoading(false);
      return;
    }
    request(endpoint)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, server, tick, directory, auditPage, filter]);
  const refresh = () => setTick((t) => t + 1);
  async function execute(endpoint: string, method: string, body: any) {
    setSaving(true);
    try {
      const r = await request(endpoint, method, body);
      notify(r.message || "Changes saved");
      refresh();
      return r;
    } catch (e) {
      notify((e as Error).message);
      throw e;
    } finally {
      setSaving(false);
    }
  }
  async function submitModal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const b: any = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (modal.type === "backup")
        await execute(base + "/backups", "POST", { name: b.name });
      if (modal.type === "backupAction")
        await execute(
          base + "/backups/" + modal.item.uuid + "/action",
          "POST",
          { action: modal.action, confirmation: b.confirmation },
        );
      if (modal.type === "folder")
        await execute(base + "/files/action", "POST", {
          action: "folder",
          path: directory + "/" + b.name,
        });
      if (modal.type === "newFile")
        await execute(base + "/file", "PUT", {
          path: directory + "/" + b.name,
          content: "",
          create: true,
        });
      if (modal.type === "fileAction")
        await execute(base + "/files/action", "POST", {
          action: modal.action,
          path: directory + "/" + modal.item.name,
          name: b.name,
          confirmation: b.confirmation,
        });
      if (modal.type === "schedule") {
        const r = await execute(
          base + "/schedules" + (modal.item ? "/" + modal.item.id : ""),
          modal.item ? "PUT" : "POST",
          {
            name: b.name,
            minute: b.minute,
            hour: b.hour,
            day_of_month: b.day_of_month,
            month: b.month,
            day_of_week: b.day_of_week,
            is_active: b.is_active === "on",
            only_when_online: b.only_when_online === "on",
          },
        );
        if (!modal.item)
          notify("Schedule created. Add a task to define what it does.");
      }
      if (modal.type === "scheduleDelete")
        await execute(base + "/schedules/" + modal.item.id, "DELETE", {
          confirmation: b.confirmation,
        });
      if (modal.type === "task")
        await execute(
          base +
            "/schedules/" +
            modal.item.id +
            "/tasks" +
            (modal.task ? "/" + modal.task.id : ""),
          "POST",
          {
            action: b.action,
            payload: b.payload,
            time_offset: Number(b.time_offset),
            continue_on_failure: false,
            confirmation: b.confirmation || undefined,
          },
        );
      if (modal.type === "taskDelete")
        await execute(
          base + "/schedules/" + modal.item.id + "/tasks/" + modal.task.id,
          "DELETE",
          { confirmation: b.confirmation },
        );
      if (modal.type === "subuser")
        await execute(
          base + "/subusers" + (modal.item ? "/" + modal.item.uuid : ""),
          modal.item ? "PUT" : "POST",
          {
            email: b.email,
            permissions: b.permissions
              .split(",")
              .map((p: string) => p.trim())
              .filter(Boolean),
            confirmation: b.confirmation,
          },
        );
      if (modal.type === "subuserDelete")
        await execute(base + "/subusers/" + modal.item.uuid, "DELETE", {
          confirmation: b.confirmation,
        });
      if (modal.type === "invite") {
        const r = await execute("/admin/invite", "POST", {
          email: b.email,
          role: b.role,
          servers: b.servers
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean),
        });
        setModal({
          type: "result",
          title: "Private invitation",
          message: r.message,
          value: r.url,
        });
        return;
      }
      if (modal.type === "user") {
        const form = new FormData(e.currentTarget);
        await execute("/admin/users/" + modal.item.id, "PATCH", {
          role: b.role,
          suspended: b.suspended === "on",
          permissions: form.getAll("permissions"),
          servers: b.servers
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean),
        });
      }
      if (modal.type === "totp") {
        const r = await execute("/auth/2fa/setup", "POST", {
          password: b.password,
        });
        setModal({
          type: "totpEnable",
          title: "Connect your authenticator",
          secret: r.secret,
          uri: r.uri,
        });
        return;
      }
      if (modal.type === "totpEnable") {
        const r = await execute("/auth/2fa/enable", "POST", { code: b.code });
        setCsrf(r.csrf);
        onUser(r.user);
        setModal({
          type: "result",
          title: "Save your recovery codes",
          message:
            "Store these privately. Each code can be used once. They will not be shown again.",
          value: r.recovery.join("\n"),
        });
        return;
      }
      setModal(null);
    } catch {}
  }
  async function openFile(item: any) {
    if (!item.is_file) {
      setDirectory(directory.replace(/\/$/, "") + "/" + item.name);
      return;
    }
    try {
      const r = await request(
        base + "/file?path=" + encodeURIComponent(directory + "/" + item.name),
      );
      setEditor({ ...r, name: item.name });
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const field = (
    label: string,
    name: string,
    defaultValue = "",
    type = "text",
    required = true,
  ) => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
      />
    </label>
  );
  const list = data?.data?.map((x: any) => x.attributes) || [];
  return (
    <>
      <div className="feature-heading">
        <div>
          <div className="eyebrow">SERVER WORKSPACE</div>
          <h1>
            {(
              {
                files: "File manager",
                backups: "Backups",
                schedules: "Schedules",
                network: "Network",
                startup: "Startup variables",
                players: "Player tools",
                plugins: "Plugins & mods",
                users: "Application users",
                subusers: "Hosting subusers",
                health: "Integration health",
                activity: "Activity log",
                account: "Your account",
                settings: "Settings",
              } as any
            )[page] || page}
          </h1>
        </div>
        <button onClick={refresh}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <div className="panel feature-loading">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}
      {!loading && page === "files" && (
        <section className="panel">
          <div className="panel-title file-toolbar">
            <button
              className="icon-button"
              aria-label="Parent directory"
              disabled={directory === "/"}
              onClick={() =>
                setDirectory(directory.split("/").slice(0, -1).join("/") || "/")
              }
            >
              <ArrowLeft size={18} />
            </button>
            <button className="text-button" onClick={() => setDirectory("/")}>
              Root
            </button>
            {directory
              .split("/")
              .filter(Boolean)
              .map((part, i, arr) => (
                <span key={i}>
                  <ChevronRight size={12} />
                  <button
                    className="text-button"
                    onClick={() =>
                      setDirectory("/" + arr.slice(0, i + 1).join("/"))
                    }
                  >
                    {part}
                  </button>
                </span>
              ))}
            <input
              aria-label="Filter files in directory"
              placeholder="Filter this directory…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              disabled={!allowed(user, "files.write")}
              onClick={() =>
                setModal({ type: "newFile", title: "Create text file" })
              }
            >
              <Plus size={14} />
              File
            </button>
            <button
              disabled={!allowed(user, "files.write")}
              onClick={() =>
                setModal({ type: "folder", title: "Create folder" })
              }
            >
              <Plus size={14} />
              Folder
            </button>
<span className="tag">Drag & drop below</span>
          </div>
          <UploadPanel server={server} directory={directory} disabled={!allowed(user, "files.write")} onDone={refresh} notify={notify}/>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list
                  .filter((x: any) =>
                    x.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .sort(
                    (a: any, b: any) =>
                      Number(a.is_file) - Number(b.is_file) ||
                      a.name.localeCompare(b.name),
                  )
                  .map((item: any) => (
                    <tr key={item.name}>
                      <td>
                        <button
                          className="file-name"
                          onClick={() => openFile(item)}
                        >
                          {item.is_file ? (
                            <FileText size={17} />
                          ) : (
                            <Folder size={18} />
                          )}{" "}
                          {item.name}
                        </button>
                      </td>
                      <td>{item.is_file ? bytes(item.size) : "Directory"}</td>
                      <td>{new Date(item.modified_at).toLocaleString()}</td>
                      <td>
                        <div className="row-actions">
                          {["rename", "copy", "delete"].map((action) => (
                            <button
                              key={action}
                              disabled={
                                !allowed(
                                  user,
                                  action === "delete"
                                    ? "files.delete"
                                    : "files.write",
                                )
                              }
                              onClick={() =>
                                setModal({
                                  type: "fileAction",
                                  title: action + " " + item.name,
                                  action,
                                  item,
                                })
                              }
                            >
                              {action}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!list.length && !error && (
            <Empty title="This directory is empty">
              Create a file or folder to get started.
            </Empty>
          )}
          <div className="panel-note">
            Secret-bearing files are protected. Text editor limit: 1 MiB.
            Changes are checked for conflicts before saving.
          </div>
        </section>
      )}
      {!loading && page === "backups" && (
        <section className="panel">
          <div className="panel-title">
            <h2>Server snapshots</h2>
            <span>
              {overview?.server?.feature_limits?.backups ?? "Unknown"} backup
              slots from hosting plan
            </span>
            <button
              className="primary"
              disabled={
                !allowed(user, "backups.create") ||
                overview?.server?.feature_limits?.backups === 0
              }
              onClick={() =>
                setModal({ type: "backup", title: "Create backup" })
              }
            >
              <Plus size={15} /> Create backup
            </button>
          </div>
          {!list.length ? (
            <Empty
              title={
                overview?.server?.feature_limits?.backups === 0
                  ? "No backup slots on this plan"
                  : "No backups yet"
              }
            >
              Backups are managed by your hosting provider. A backup requires an
              available upstream slot.
            </Empty>
          ) : (
            list.map((x: any) => (
              <div className="list-row" key={x.uuid}>
                <div>
                  <h3>{x.name}</h3>
                  <p>
                    {x.is_successful
                      ? "Complete"
                      : x.completed_at
                        ? "Failed"
                        : "In progress"}{" "}
                    · {bytes(x.bytes)} ·{" "}
                    {new Date(x.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  disabled={
                    !allowed(user, "backups.restore") || !x.is_successful
                  }
                  onClick={() =>
                    setModal({
                      type: "backupAction",
                      title: "Restore backup",
                      action: "restore",
                      item: x,
                    })
                  }
                >
                  Restore
                </button>
                {allowed(user, "backups.download") && x.is_successful && (
                  <a
                    className="download-link"
                    href={"/api" + base + "/backups/" + x.uuid + "/download"}
                    download
                  >
                    Download backup
                  </a>
                )}
                <button
                  disabled={!allowed(user, "backups.delete")}
                  onClick={() =>
                    setModal({
                      type: "backupAction",
                      title: "Delete backup",
                      action: "delete",
                      item: x,
                    })
                  }
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </section>
      )}
      {!loading && page === "schedules" && (
        <section className="panel">
          <div className="panel-title">
            <h2>Hosting scheduler</h2>
            <button
              className="primary"
              disabled={!allowed(user, "schedules.write")}
              onClick={() =>
                setModal({ type: "schedule", title: "Create schedule" })
              }
            >
              <Plus size={15} />
              New schedule
            </button>
          </div>
          <div className="panel-note">
            Execution uses the hosting provider’s timezone. Next-run dates below
            are displayed in {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            This is not a browser timer.
          </div>
          {!list.length ? (
            <Empty title="Your server, on a schedule">
              Create an upstream schedule, then add an authorized task.
            </Empty>
          ) : (
            list.map((x: any) => (
              <div className="schedule-card" key={x.id}>
                <div className="list-row">
                  <div>
                    <h3>
                      {x.name}{" "}
                      <span className="tag">
                        {x.is_active ? "Active" : "Paused"}
                      </span>
                    </h3>
                    <p>
                      Next run:{" "}
                      {x.next_run_at
                        ? new Date(x.next_run_at).toLocaleString()
                        : "Unavailable"}
                    </p>
                    <code>
                      {x.cron?.minute} {x.cron?.hour} {x.cron?.day_of_month}{" "}
                      {x.cron?.month} {x.cron?.day_of_week}
                    </code>
                  </div>
                  <button
                    disabled={!allowed(user, "schedules.write")}
                    onClick={() =>
                      setModal({
                        type: "task",
                        title: "Add schedule task",
                        item: x,
                      })
                    }
                  >
                    Add task
                  </button>
                  <button
                    disabled={!allowed(user, "schedules.write")}
                    onClick={() =>
                      setModal({
                        type: "schedule",
                        title: "Edit schedule",
                        item: x,
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    disabled={!allowed(user, "schedules.write")}
                    onClick={() =>
                      setModal({
                        type: "scheduleDelete",
                        title: "Delete schedule",
                        item: x,
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
                {x.relationships?.tasks?.data.map((t: any) => (
                  <div className="schedule-task" key={t.attributes.id}>
                    {t.attributes.sequence}. {t.attributes.action} ·{" "}
                    {t.attributes.action === "command"
                      ? "Command arguments hidden"
                      : t.attributes.payload}{" "}
                    · +{t.attributes.time_offset}s
                    <div className="row-actions">
                      <button
                        disabled={!allowed(user, "schedules.write")}
                        onClick={() =>
                          setModal({
                            type: "task",
                            title: "Edit schedule task",
                            item: x,
                            task: t.attributes,
                          })
                        }
                      >
                        Edit task
                      </button>
                      <button
                        disabled={!allowed(user, "schedules.write")}
                        onClick={() =>
                          setModal({
                            type: "taskDelete",
                            title: "Delete schedule task",
                            item: x,
                            task: t.attributes,
                          })
                        }
                      >
                        Delete task
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </section>
      )}
      {!loading && page === "network" && (
        <section className="panel">
          <div className="panel-title">
            <h2>Assigned allocations</h2>
            <span className="tag">Read only</span>
          </div>
          {list.map((x: any) => (
            <div className="list-row" key={x.id}>
              <div>
                <h3>
                  {x.ip_alias || x.ip}:{x.port}{" "}
                  {x.is_default && <span className="tag">Primary</span>}
                </h3>
                <p>
                  Allocated IP: {x.ip} · {x.notes || "No allocation notes"}
                </p>
              </div>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(`${x.ip_alias || x.ip}:${x.port}`)
                    .then(() => notify("Address copied"))
                    .catch(() => notify("Clipboard unavailable"))
                }
              >
                <Copy size={15} /> Copy address
              </button>
            </div>
          ))}
          {!list.length && !error && <Empty title="No allocations available" />}
          <div className="panel-note">
            These addresses are assigned by your hosting provider. Display
            settings do not register DNS or change allocations.
          </div>
        </section>
      )}
      {!loading && page === "startup" && (
        <section className="panel">
          <div className="panel-title">
            <h2>Startup configuration</h2>
          </div>
          <div className="panel-note">
            Image from API: {overview?.server?.image || "Unavailable"}. Image
            metadata does not confirm the running Java version. Changes may
            require a restart.
          </div>
          {list.map((x: any) => (
            <form
              key={x.env_variable}
              className="list-row variable-row"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await execute(base + "/startup", "PUT", {
                    key: x.env_variable,
                    value: new FormData(e.currentTarget).get("value"),
                  });
                } catch {}
              }}
            >
              <label>
                {x.name}
                <span className="muted">{x.description}</span>
                <input
                  name="value"
                  defaultValue={x.server_value}
                  disabled={
                    !x.is_editable ||
                    x.server_value === "••••••••" ||
                    !allowed(user, "startup.write")
                  }
                />
              </label>
              <button
                disabled={
                  !x.is_editable ||
                  x.server_value === "••••••••" ||
                  !allowed(user, "startup.write") ||
                  saving
                }
              >
                Save
              </button>
            </form>
          ))}
        </section>
      )}
      {!loading && page === "players" && (
        <>
          <section className="panel">
            <Empty title="Player roster unavailable">
              No verified player-list integration is configured. Console logs
              are not an authoritative roster. TPS and MSPT are unavailable.
            </Empty>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Approved Minecraft commands</h2>
            </div>
            <div className="tool-grid">
              {[
                ["save", "Save world", "save-all"],
                ["day", "Set daytime", "time set day"],
                ["clear", "Clear weather", "weather clear"],
              ].map(([template, label, command]) => (
                <button
                  key={template}
                  disabled={!allowed(user, "console.templates")}
                  onClick={async () => {
                    if (!confirm(`Send “${command}” to the live server?`))
                      return;
                    try {
                      await execute(base + "/command", "POST", { template });
                    } catch {}
                  }}
                >
                  <h3>{label}</h3>
                  <code>{command}</code>
                </button>
              ))}
            </div>
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await execute(base + "/command", "POST", {
                    template: "announce",
                    text: new FormData(e.currentTarget).get("text"),
                  });
                } catch {}
              }}
            >
              <input
                name="text"
                aria-label="Announcement"
                placeholder="Server announcement…"
                maxLength={200}
                required
              />
              <button disabled={!allowed(user, "console.templates") || saving}>
                Announce
              </button>
            </form>
            <div className="panel-note">
              These are explicit command templates, not a verified Minecraft
              plugin integration. Success means accepted by the hosting API;
              inspect console output for the game result.
            </div>
          </section>
        </>
      )}
      {!loading && page === "plugins" && (
        <section className="panel">
          <div className="panel-title">
            <h2>Plugin library</h2>
            <span className="tag">{list.filter((x:any)=>x.is_file && /\.jar$/i.test(x.name)).length} JAR files</span>
          </div>
          <div className="panel-note">
            Upload a plugin JAR to place it in /plugins automatically. Restart to load it.
            Data folders are created by the plugin when it starts. Loaded status must be checked in the console.
          </div>
          <UploadPanel server={server} plugins disabled={!allowed(user,"files.write")} onDone={refresh} notify={notify}/>
          <div className="plugin-grid">
          {list
            .filter((x: any) => x.is_file && /\.jar$/i.test(x.name))
            .map((x: any) => (
              <div className="plugin-tile" key={x.name}>
                <FileText size={20} />
                <div>
                  <h3>{x.name}</h3>
                  <p>
                    {bytes(x.size)} · {new Date(x.modified_at).toLocaleString()}
                  </p>
                </div>
                <span className="tag">On disk · load status unknown</span>
              </div>
            ))}
          </div>
          {!list.some((x:any)=>x.is_file && /\.jar$/i.test(x.name)) && !error && <Empty title="Your plugin library is empty">Drop a compatible plugin JAR above to get started.</Empty>}
          <div className="plugin-folders"><h3>Plugin data folders</h3><p>{list.filter((x:any)=>!x.is_file).map((x:any)=>x.name).join(" · ") || "No data folders yet. Plugins create these after loading."}</p></div>
          <div className="panel-note">Create folders and edit plugin configuration in File manager → plugins. Use compatible plugins from trusted sources.</div>
        </section>
      )}
      {!loading && page === "subusers" && (
        <section className="panel">
          <div className="panel-title">
            <h2>Hosting panel access</h2>
            <span className="tag">Separate from application accounts</span>
            <button
              className="primary"
              disabled={!allowed(user, "subusers.write")}
              onClick={() =>
                setModal({
                  type: "subuser",
                  title: "Grant hosting panel access",
                })
              }
            >
              Add subuser
            </button>
          </div>
          {list.map((x: any) => (
            <div className="list-row" key={x.uuid}>
              <div>
                <h3>{x.email}</h3>
                <p>{x.permissions?.join(", ")}</p>
              </div>
              <button
                disabled={!allowed(user, "subusers.write")}
                onClick={() =>
                  setModal({
                    type: "subuser",
                    title: "Edit hosting access",
                    item: x,
                  })
                }
              >
                Edit permissions
              </button>
              <button
                disabled={!allowed(user, "subusers.write")}
                onClick={() =>
                  setModal({
                    type: "subuserDelete",
                    title: "Remove hosting access",
                    item: x,
                  })
                }
              >
                Remove access
              </button>
            </div>
          ))}
          {!list.length && !error && (
            <Empty title="No hosting subusers">
              Hosting access is separate from this application’s user accounts.
            </Empty>
          )}
        </section>
      )}
      {!loading && page === "users" && (
        <section className="panel">
          <div className="panel-title">
            <h2>Application access</h2>
            <button
              className="primary"
              onClick={() =>
                setModal({ type: "invite", title: "Invite a teammate" })
              }
            >
              <Plus size={15} />
              Invite user
            </button>
          </div>
          {Array.isArray(data) &&
            data.map((x: any) => (
              <div className="list-row" key={x.id}>
                <div className="avatar">{x.name.slice(0, 1)}</div>
                <div>
                  <h3>
                    {x.name} <span className="tag">{x.role}</span>
                  </h3>
                  <p>
                    {x.email} ·{" "}
                    {x.suspended
                      ? "Suspended"
                      : x.totpEnabled
                        ? "2FA enabled"
                        : "2FA not enabled"}
                  </p>
                </div>
                <button
                  disabled={x.role === "owner"}
                  onClick={() =>
                    setModal({
                      type: "user",
                      title: "Edit access · " + x.name,
                      item: x,
                    })
                  }
                >
                  Manage access
                </button>
              </div>
            ))}
        </section>
      )}
      {!loading && page === "activity" && (
        <section className="panel">
          <div className="panel-title">
            <h2>Application audit log</h2>
            <input
              aria-label="Filter audit actions"
              placeholder="Filter actions…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setAuditPage(0);
              }}
            />
          </div>
          {Array.isArray(data) &&
            data.map((x: any) => (
              <div className="list-row" key={x.id}>
                <ShieldCheck size={17} />
                <div>
                  <h3>{x.action}</h3>
                  <p>
                    Actor {x.actor.slice(0, 8)} · {x.server || "Application"} ·{" "}
                    {new Date(x.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="tag">{x.result}</span>
              </div>
            ))}
          {!data?.length && !error && <Empty title="No matching activity" />}
          <div className="pagination">
            <button
              disabled={!auditPage}
              onClick={() => setAuditPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>Page {auditPage + 1}</span>
            <button
              disabled={data?.length !== 30}
              onClick={() => setAuditPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
      {!loading && page === "health" && data && (
        <section className="panel">
          <div className="panel-title">
            <h2>Integration status</h2>
            <span className={"tag " + (data.connected ? "good" : "")}>
              {data.connected ? "Connected" : "Unavailable"}
            </span>
          </div>
          <dl className="detail-list">
            {Object.entries(data).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
          <div className="panel-note">
            Connection secrets are configured in the backend environment. They
            cannot be viewed or changed in the browser.
          </div>
        </section>
      )}
      {!loading && page === "account" && (
        <div className="settings-grid">
          <section className="panel padded">
            <h2>Profile</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get("name"));
                try {
                  await execute("/auth/profile", "PATCH", { name });
                  onUser({ ...user, name });
                } catch {}
              }}
            >
              {field("Display name", "name", user.name)}
              <label>
                Email
                <input value={user.email} readOnly />
              </label>
              <button className="primary" disabled={saving}>
                Save profile
              </button>
            </form>
          </section>
          <section className="panel padded">
            <h2>Two-factor authentication</h2>
            <p>
              {user.totpEnabled
                ? "Your account is protected by an authenticator."
                : "Owner and admin management changes require two-factor authentication."}
            </p>
            <button
              className="primary"
              disabled={user.totpEnabled}
              onClick={() =>
                setModal({
                  type: "totp",
                  title: "Set up two-factor authentication",
                })
              }
            >
              <ShieldCheck size={16} />
              {user.totpEnabled ? "Enabled" : "Set up authenticator"}
            </button>
          </section>
          <section className="panel padded">
            <h2>Change password</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await execute(
                    "/auth/password",
                    "POST",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                  onUser(null);
                } catch {}
              }}
            >
              {field("Current password", "current", "", "password")}
              {field(
                "New password · at least 12 characters",
                "password",
                "",
                "password",
              )}
              <button disabled={saving}>Change password & sign out</button>
            </form>
          </section>
          <section className="panel padded">
            <h2>Active sessions</h2>
            {Array.isArray(data) &&
              data.map((x: any) => (
                <div className="session-row" key={x.id}>
                  <div>
                    {x.current ? "This session" : "Other session"}
                    <small>
                      Created {new Date(x.createdAt).toLocaleString()}
                    </small>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await execute(
                          "/auth/sessions/" + x.id,
                          "DELETE",
                          undefined,
                        );
                        if (x.current) onUser(null);
                      } catch {}
                    }}
                  >
                    Revoke
                  </button>
                </div>
              ))}
          </section>
        </div>
      )}
      {!loading && page === "settings" && (
        <div className="settings-grid">
          <IntegrationPanel user={user} notify={notify}/>
          <section className="panel padded">
            <h2>Game join address</h2>
            <p>
              The address displayed and copied on your dashboard. Hosting
              allocations and DNS are configured separately.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await execute(
                    base + "/display-address",
                    "PUT",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                } catch {}
              }}
            >
              {field(
                "Display address",
                "address",
                overview?.joinAddress || "godtamilsmp.chickenkiller.com:25568",
              )}
              <button
                className="primary"
                disabled={!allowed(user, "settings.write") || saving}
              >
                Save join address
              </button>
            </form>
          </section>
          <section className="panel padded">
            <h2>Server identity</h2>
            <p>Updates the server name in the hosting panel.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await execute(
                    base + "/settings",
                    "POST",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                } catch {}
              }}
            >
              {field("Server name", "name", overview?.server?.name || "")}
              {field(
                "Description",
                "description",
                overview?.server?.description || "",
                "text",
                false,
              )}
              <button
                disabled={!allowed(user, "settings.write") || saving}
                className="primary"
              >
                Save server name
              </button>
            </form>
          </section>
          {user.role === "owner" && (
            <section className="panel padded">
              <h2>Branding</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await execute(
                      "/admin/branding",
                      "PUT",
                      Object.fromEntries(new FormData(e.currentTarget)),
                    );
                    location.reload();
                  } catch {}
                }}
              >
                {field("Console name", "name", data?.name || "GOD SUBCONSOLE")}
                {field(
                  "Accent color",
                  "accent",
                  data?.accent || "#3985ff",
                  "color",
                )}
                <button disabled={saving}>Save branding</button>
              </form>
            </section>
          )}
        </div>
      )}
      {editor && (
        <Modal title={editor.name} onClose={() => setEditor(null)}>
          <div className="editor-meta">
            {editor.path} · upstream conflict checks enabled
          </div>
          <CodeMirror
            value={editor.content}
            height="400px"
            theme="dark"
            extensions={
              editor.name.endsWith(".json")
                ? [json()]
                : /\.ya?ml$/.test(editor.name)
                  ? [yaml()]
                  : []
            }
            onChange={(content) => setEditor({ ...editor, content })}
            readOnly={!allowed(user, "files.write")}
          />
          <div className="dialog-actions">
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([editor.content], { type: "text/plain" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = editor.name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={15} /> Download text
            </button>
            <button
              className="primary"
              disabled={!allowed(user, "files.write") || saving}
              onClick={async () => {
                try {
                  const r = await execute(base + "/file", "PUT", {
                    path: editor.path,
                    content: editor.content,
                    revision: editor.revision,
                  });
                  setEditor({ ...editor, revision: r.revision });
                } catch {}
              }}
            >
              <Save size={15} />
              Save changes
            </button>
          </div>
        </Modal>
      )}
      {modal && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          {modal.type === "result" ? (
            <>
              <p>{modal.message}</p>
              <textarea readOnly value={modal.value} rows={8} />
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(modal.value)
                    .then(() => notify("Copied"))
                    .catch(() => notify("Clipboard unavailable"))
                }
              >
                Copy
              </button>
            </>
          ) : (
            <form onSubmit={submitModal}>
              {["backup", "folder", "newFile"].includes(modal.type) &&
                field("Name", "name")}
              {modal.type === "fileAction" &&
                modal.action === "rename" &&
                field(
                  "New absolute path",
                  "name",
                  directory + "/" + modal.item.name,
                )}
              {modal.type === "fileAction" && modal.action === "copy" && (
                <p>Copy this file in its current directory?</p>
              )}
              {(modal.type === "backupAction" ||
                modal.type === "taskDelete" ||
                modal.type === "scheduleDelete" ||
                (modal.type === "fileAction" && modal.action === "delete")) && (
                <>
                  <div className="notice error">
                    {modal.action === "restore"
                      ? "Restoring this backup may overwrite all current server files."
                      : "This action permanently deletes the selected item."}
                  </div>
                  {field(
                    `Type ${modal.action === "restore" ? "RESTORE" : "DELETE"} to confirm`,
                    "confirmation",
                  )}
                </>
              )}
              {modal.type === "schedule" && (
                <>
                  {field("Schedule name", "name", modal.item?.name || "")}
                  {[
                    ["Minute", "minute", "0"],
                    ["Hour", "hour", "4"],
                    ["Day of month", "day_of_month", "*"],
                    ["Month", "month", "*"],
                    ["Day of week", "day_of_week", "*"],
                  ].map(([label, name, fallback]) =>
                    field(label, name, modal.item?.cron?.[name] || fallback),
                  )}
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="is_active"
                      defaultChecked={modal.item?.is_active ?? false}
                    />
                    Active
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="only_when_online"
                      defaultChecked={modal.item?.only_when_online ?? true}
                    />
                    Only when online
                  </label>
                </>
              )}
              {modal.type === "task" && (
                <>
                  <label>
                    Action
                    <select
                      name="action"
                      defaultValue={modal.task?.action || "power"}
                    >
                      <option value="power">Power</option>
                      <option value="command">
                        Command (arbitrary console permission required)
                      </option>
                      <option value="backup">Backup</option>
                    </select>
                  </label>
                  {field(
                    "Payload · e.g. restart",
                    "payload",
                    modal.task?.payload || "",
                  )}
                  {field(
                    "Delay from previous task (seconds)",
                    "time_offset",
                    String(modal.task?.time_offset || 0),
                    "number",
                  )}
                  <div className="notice">
                    Tasks run with the hosting account’s permissions. Creating a
                    command task requires unrestricted console permission.
                  </div>
                  {field(
                    "Privilege-grant commands require GRANT ACCESS",
                    "confirmation",
                    "",
                    "text",
                    false,
                  )}
                </>
              )}
              {modal.type === "subuser" && (
                <>
                  {!modal.item && field("Email address", "email", "", "email")}
                  {field(
                    "Hosting permission keys · comma separated",
                    "permissions",
                    modal.item?.permissions?.join(",") || "websocket.connect",
                  )}
                  <div className="notice">
                    This grants hosting panel access independently of this
                    application. Grant only the permissions needed.
                  </div>
                  {field("Type GRANT ACCESS to confirm", "confirmation")}
                </>
              )}
              {modal.type === "subuserDelete" && (
                <>
                  <p>Remove this user’s access in the hosting panel?</p>
                  {field("Type REMOVE ACCESS to confirm", "confirmation")}
                </>
              )}
              {modal.type === "invite" && (
                <>
                  {field("Invited email", "email", "", "email")}
                  <label>
                    Role
                    <select name="role">
                      <option value="viewer">Viewer</option>
                      <option value="operator">
                        Moderator / operator (approved templates)
                      </option>
                      <option value="admin">
                        Admin (explicit permissions)
                      </option>
                    </select>
                  </label>
                  {field(
                    "Assigned server identifiers · comma separated",
                    "servers",
                    server,
                  )}
                </>
              )}
              {modal.type === "user" && (
                <>
                  <label>
                    Role
                    <select name="role" defaultValue={modal.item.role}>
                      {Object.keys(roleDefaults)
                        .filter((x) => x !== "owner")
                        .map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                    </select>
                  </label>
                  {field(
                    "Assigned server identifiers",
                    "servers",
                    modal.item.servers.join(","),
                  )}
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="suspended"
                      defaultChecked={modal.item.suspended}
                    />
                    Suspend account and revoke sessions
                  </label>
                  <p>
                    Permissions are explicit. Changing the role does not
                    silently grant permissions.
                  </p>
                  <div className="permissions">
                    {permissionOptions.map((p) => (
                      <label className="checkbox" key={p}>
                        <input
                          type="checkbox"
                          name="permissions"
                          value={p}
                          defaultChecked={modal.item.permissions.includes(p)}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                  <div className="notice">
                    console.command allows arbitrary commands, including
                    granting operator access.
                  </div>
                </>
              )}
              {modal.type === "totp" &&
                field("Confirm password", "password", "", "password")}
              {modal.type === "totpEnable" && (
                <>
                  <p>
                    Enter this setup key in your authenticator, then enter its
                    current code.
                  </p>
                  <code className="setup-key">{modal.secret}</code>
                  <a href={modal.uri}>Open authenticator</a>
                  {field("6-digit authenticator code", "code")}
                </>
              )}
              <div className="dialog-actions">
                <button type="button" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button className="primary" disabled={saving}>
                  {saving ? "Saving…" : "Confirm"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
