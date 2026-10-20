import { useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  TerminalSquare,
  FolderOpen,
  Archive,
  CalendarClock,
  Users,
  Network,
  SlidersHorizontal,
  Puzzle,
  Settings,
  ShieldCheck,
  Activity,
  ChevronDown,
  ChevronRight,
  Bell,
  Search,
  Menu,
  ArrowUpRight,
  Copy,
  Play,
  Square,
  RotateCw,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  LogOut,
  Server,
  Radio,
  Zap,
  X,
  AlertTriangle,
} from "lucide-react";
import Auth from "./Auth";
import Console, { useConsole } from "./Console";
import Features from "./Features";
import { request, allowed, setCsrf } from "./api";
import { Logo, ResourceCards, HistoryChart, Modal } from "./components";
import { bytes, uptime } from "../shared/resources";
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["console", "Console", TerminalSquare],
  ["files", "File manager", FolderOpen],
  ["backups", "Backups", Archive],
  ["schedules", "Schedules", CalendarClock],
  ["players", "Player tools", Users],
  ["network", "Network", Network],
  ["startup", "Startup", SlidersHorizontal],
  ["plugins", "Plugins & mods", Puzzle],
  ["settings", "Settings", Settings],
] as const;
function Landscape() {
  const cubes = [
    [-1, 1, 0],
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [2, 1, 0],
    [3, 1, 0],
    [-1, 2, 0],
    [0, 2, 0],
    [1, 2, 0],
    [2, 2, 0],
    [3, 2, 0],
    [0, 3, 0],
    [1, 3, 0],
    [2, 3, 0],
    [1, 1, 1],
    [1, 1, 2],
    [2, 1, 1],
    [1, 2, 1],
    [0, 1, 1],
    [1, 1, 3],
    [1, 1, 4],
    [0, 1, 3],
    [2, 1, 3],
    [1, 0, 3],
    [1, 2, 3],
  ];
  return (
    <svg className="landscape" viewBox="0 0 480 230" aria-hidden="true">
      <defs>
        <radialGradient id="terrain-glow">
          <stop stopColor="#2c81ff" stopOpacity=".3" />
          <stop offset="1" stopColor="#0b1833" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="245" cy="150" rx="235" ry="100" fill="url(#terrain-glow)" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
        <path
          key={i}
          d={`M${i * 60 - 100} 220l240-120m${-i * 60 + 500} 120L200 80`}
          stroke="#235396"
          strokeOpacity=".15"
        />
      ))}
      {cubes
        .sort((a, b) => a[2] - b[2] || a[0] + a[1] - b[0] - b[1])
        .map(([x, y, z], i) => {
          const cx = 255 + (x - y) * 28,
            cy = 125 + (x + y) * 14 - z * 26;
          const tree = z >= 3;
          return (
            <g key={i}>
              <path
                d={`M${cx} ${cy}l28 14-28 14-28-14Z`}
                fill={tree ? "#246b8c" : z > 0 ? "#255a80" : "#254c71"}
                stroke="#3975a4"
                strokeOpacity=".6"
              />
              <path
                d={`M${cx - 28} ${cy + 14}l28 14v28l-28-14Z`}
                fill={tree ? "#16415d" : z > 0 ? "#173749" : "#15263d"}
                stroke="#2a4970"
                strokeOpacity=".4"
              />
              <path
                d={`M${cx} ${cy + 28}l28-14v28l-28 14Z`}
                fill={tree ? "#1b5471" : z > 0 ? "#1d4257" : "#1a3251"}
                stroke="#2a4970"
                strokeOpacity=".4"
              />
            </g>
          );
        })}
      <path d="m365 75 5-3 5 3v6l-5 3-5-3Z" fill="#5bc5ff" />
      <circle cx="125" cy="85" r="2" fill="#6eb9ff" />
      <circle cx="395" cy="147" r="2" fill="#6eb9ff" />
    </svg>
  );
}
export default function App() {
  const sidebarRef = useRef<HTMLElement>(null);
  const [user, setUser] = useState<any>(undefined),
    [page, setPage] = useState("overview"),
    [server, setServer] = useState(""),
    [servers, setServers] = useState<any[]>([]),
    [overview, setOverview] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now()),
    [sidebar, setSidebar] = useState(false),
    [toast, setToast] = useState(""),
    [notification, setNotification] = useState(false),
    [power, setPower] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [brand, setBrand] = useState({ name: "GOD SUBCONSOLE", accent: "#3985ff" }),
    [activity, setActivity] = useState<any[]>([]);
  const stream = useConsole(user, server);
  useEffect(() => {
    if (!sidebar) return;
    const el = sidebarRef.current;
    const focusable = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),select,a[href],input:not(:disabled)",
        ) || [],
      );
    focusable()[0]?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSidebar(false);
        document.getElementById("navigation-toggle")?.focus();
      }
      if (e.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [sidebar]);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    request("/auth/me")
      .then((r) => {
        setCsrf(r.csrf);
        setUser(r.user);
      })
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    request("/servers")
      .then((r) => {
        if (active) {
          setServers(r.data);
          setServer((prev) =>
            r.data.some((s: any) => s.identifier === prev)
              ? prev
              : r.data[0]?.identifier || "",
          );
          if (!r.data.length) {
            setError("No accessible servers are assigned to this account.");
            setLoading(false);
          }
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    request("/branding")
      .then((b) => {
        if (active) setBrand(b);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user || !server) return;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    setOverview(null);
    setLoading(true);
    async function poll() {
      try {
        const d = await request(`/servers/${server}/overview`);
        if (!active) return;
        setOverview((prev: any) => ({
          ...d,
          resources: d.resources || prev?.resources || null,
          updatedAt: d.updatedAt || prev?.updatedAt || null,
        }));
        setError(d.error || "");
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(poll, 5000);
        }
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [user?.id, server]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!user || !allowed(user, "audit.read")) return;
    let active = true;
    const load = () =>
      request("/audit")
        .then((r) => {
          if (active) setActivity(r.slice(0, 4));
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [user?.id]);
  const navigate = (p: string) => {
    setPage(p);
    setSidebar(false);
    window.scrollTo({ top: 0 });
  };
  const copy = (value: string) =>
    navigator.clipboard
      .writeText(value)
      .then(() => notify("Copied to clipboard"))
      .catch(() => notify("Clipboard access is unavailable in this browser"));
  if (user === undefined)
    return (
      <div className="boot">
        <Logo />
        <p>Opening your console…</p>
      </div>
    );
  if (!user || new URLSearchParams(location.hash.slice(1)).has("setup"))
    return <Auth onLogin={setUser} />;
  const status = overview?.resources?.current_state || "unavailable";
  const stale =
    !!overview?.updatedAt &&
    (!!error || now - new Date(overview.updatedAt).getTime() > 15000);
  const fresh = !!overview?.updatedAt && !stale;
  const allocation = overview?.server?.allocations?.find(
    (x: any) => x.is_default,
  );
  const address =
    overview?.joinAddress ||
    (allocation
      ? `${allocation.ip_alias || allocation.ip}:${allocation.port}`
      : null);
  const r = overview?.resources?.resources;
  return (
    <div
      className="app"
      style={{ "--accent": brand.accent } as React.CSSProperties}
    >
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        id="workspace-navigation"
        className={"sidebar " + (sidebar ? "open" : "")}
      >
        <button className="brand" onClick={() => navigate("overview")}>
          <Logo />
          <div>
            {brand.name === "GOD SUBCONSOLE" ? (
              <>
                GOD <b>SUBCONSOLE</b>
              </>
            ) : (
              brand.name
            )}
            <small>SERVER CONTROL, ELEVATED.</small>
          </div>
        </button>
        <div className="workspace-label">
          WORKSPACE <span>01</span>
        </div>
        <div className="server-picker">
          <div className="server-avatar">
            <Server size={20} />
          </div>
          <label className="sr-only" htmlFor="server-select">
            Choose server
          </label>
          <select
            id="server-select"
            value={server}
            onChange={(e) => {
              setServer(e.target.value);
              navigate("overview");
            }}
          >
            {!servers.length && <option value="">No assigned servers</option>}
            {servers.map((s) => (
              <option key={s.identifier} value={s.identifier}>
                {s.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
          <small>{server || "No server"} · Minecraft</small>
        </div>
        <div className="nav-label">MANAGE SERVER</div>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <Icon size={18} />
              {label}
              {key === "console" && stream.status === "connected" && (
                <i className="nav-dot" />
              )}
              {page === key && <ChevronRight size={14} className="nav-arrow" />}
            </button>
          ))}
        </nav>
        <div className="nav-label administration">ADMINISTRATION</div>
        <nav>
          {allowed(user, "audit.read") && (
            <button
              className={page === "activity" ? "active" : ""}
              onClick={() => navigate("activity")}
            >
              <Activity size={18} />
              Activity log
            </button>
          )}
          {user.role === "owner" && (
            <>
              <button
                className={page === "users" ? "active" : ""}
                onClick={() => navigate("users")}
              >
                <ShieldCheck size={18} />
                User management
              </button>
              <button
                className={page === "health" ? "active" : ""}
                onClick={() => navigate("health")}
              >
                <Radio size={18} />
                Integration health
              </button>
            </>
          )}
          <button
            className={page === "subusers" ? "active" : ""}
            onClick={() => navigate("subusers")}
          >
            <Users size={18} />
            Hosting subusers
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-badge">
            <ShieldCheck size={16} />
            <span>
              Private by design<small>Credentials stay on the backend</small>
            </span>
          </div>
          <button className="profile" onClick={() => navigate("account")}>
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              {user.name}
              <small>{user.role}</small>
            </span>
            <Settings size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            id="navigation-toggle"
            aria-controls="workspace-navigation"
            aria-expanded={sidebar}
            aria-label="Open navigation"
            onClick={() => setSidebar(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} />
            <span>{overview?.server?.name || "Server"}</span>
            <ChevronRight size={13} />
            <strong>
              {nav.find((n) => n[0] === page)?.[1] ||
                page.replace(/^./, (s) => s.toUpperCase())}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <i /> LIVE ENVIRONMENT
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setNotification(!notification)}
            >
              <Bell size={18} />
              {(error || !user.totpEnabled) && <i />}
            </button>
            <span className="divider" />
            <button
              className="top-avatar"
              aria-label="Open account"
              onClick={() => navigate("account")}
            >
              {user.name[0].toUpperCase()}
            </button>
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={() =>
                request("/auth/logout", "POST")
                  .then(() => {
                    setCsrf("");
                    setUser(null);
                    setOverview(null);
                  })
                  .catch((e) => notify(e.message))
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {notification && (
          <div className="notification-panel panel">
            <h3>Notifications</h3>
            {error && <p className="error-text">{error}</p>}
            {!user.totpEnabled && (
              <p>
                Enable two-factor authentication in Account to unlock
                owner/admin management changes.
              </p>
            )}
            {!error && user.totpEnabled && <p>No action required.</p>}
            <button
              onClick={() => {
                navigate("account");
                setNotification(false);
              }}
            >
              Open account
            </button>
          </div>
        )}
        <main key={page} className={page === "console" ? "page-enter console-enter" : "page-enter"}>
          {!user.servers.length && page !== "account" ? (
            <section className="panel approval-panel">
              <ShieldCheck size={40} />
              <div className="eyebrow">ACCOUNT CREATED</div>
              <h1>Welcome, {user.name}</h1>
              <p>
                Your account is ready. The owner needs to approve your access
                and assign a server before your dashboard opens.
              </p>
              <div className="approval-email">{user.email}</div>
              <button className="primary" onClick={() => navigate("account")}>
                Manage your account
              </button>
              <button onClick={() => location.reload()}>Check access</button>
            </section>
          ) : ["overview", "console"].includes(page) ? (
            <>
              <div className="overview-heading">
                <div>
                  <div className="eyebrow">YOUR SERVER, AT A GLANCE</div>
                  <h1>
                    {page === "console" ? "Server console" : "Server overview"}
                    <span className="version-tag">MINECRAFT</span>
                  </h1>
                  <p>A little less management. A lot more Minecraft.</p>
                </div>
                <div className={"sync-state " + (stale ? "stale" : "")}>
                  <span className={fresh ? "live-dot" : "offline-dot"} />
                  {stale
                    ? "Stale data"
                    : fresh
                      ? "Live updates"
                      : "Awaiting connection"}
                  <small>
                    {overview?.updatedAt
                      ? "Updated " +
                        new Date(overview.updatedAt).toLocaleTimeString()
                      : "No live sample received"}
                  </small>
                </div>
              </div>
              {error && (
                <div role="alert" className="notice error">
                  <AlertTriangle size={16} />
                  {error}
                  {stale ? " Displaying last known values." : ""}
                </div>
              )}
              <section className="server-hero">
                <div className="hero-content">
                  <div className="hero-kicker">
                    <span
                      className={
                        "status-pill " +
                        (fresh && status === "running" ? "online" : "")
                      }
                    >
                      <i />
                      {stale ? "Last known: " : ""}
                      {status === "running" ? "Online" : status}
                    </span>
                    <span>{overview?.server?.node || "Node unavailable"}</span>
                  </div>
                  <h2>
                    {overview?.server?.name || "Your Minecraft server"}
                    <span>01</span>
                  </h2>
                  <p>
                    {overview?.server?.description ||
                      "Your world. Ready when you are."}
                  </p>
                  <button
                    className="join-address"
                    disabled={!address}
                    onClick={() => address && copy(address)}
                  >
                    <span className="join-icon">⌘</span>
                    {address || "Join address unavailable"}
                    <Copy size={14} />
                  </button>
                </div>
                <Landscape />
                <div className="power-controls">
                  <button
                    className="power-start"
                    disabled={
                      !server ||
                      busy ||
                      !allowed(user, "power.start") ||
                      status === "running"
                    }
                    onClick={() => setPower("start")}
                  >
                    <Play size={15} fill="currentColor" />
                    Start
                  </button>
                  <button
                    disabled={
                      !server || busy || !allowed(user, "power.restart")
                    }
                    onClick={() => setPower("restart")}
                  >
                    <RotateCw size={15} />
                    Restart
                  </button>
                  <button
                    className="power-stop"
                    disabled={!server || busy || !allowed(user, "power.stop")}
                    onClick={() => setPower("stop")}
                  >
                    <Square size={13} fill="currentColor" />
                    Stop
                  </button>
                  <button
                    className="force-stop"
                    disabled={!server || !allowed(user, "power.kill")}
                    onClick={() => setPower("kill")}
                  >
                    Force stop
                  </button>
                </div>
              </section>
              <ResourceCards data={overview} loading={loading} copy={copy} />
              {page === "console" ? (
                <Console
                  user={user}
                  server={server}
                  stream={stream}
                  notify={notify}
                  large
                />
              ) : (
                <>
                  <div className="dashboard-middle">
                    <Console
                      user={user}
                      server={server}
                      stream={stream}
                      notify={notify}
                    />
                    <section className="panel server-details">
                      <div className="panel-title">
                        <h2>
                          <Server size={17} /> Server details
                        </h2>
                        <button
                          className="icon-button"
                          aria-label="Open server settings"
                          onClick={() => navigate("settings")}
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                      <div className="detail-item">
                        <span>
                          <Clock size={15} /> Uptime
                        </span>
                        <strong>{uptime(r?.uptime)}</strong>
                      </div>
                      <div className="detail-item">
                        <span>
                          <ArrowDownToLine size={15} /> Network received
                        </span>
                        <strong>{bytes(r?.network_rx_bytes)}</strong>
                      </div>
                      <div className="detail-item">
                        <span>
                          <ArrowUpFromLine size={15} /> Network sent
                        </span>
                        <strong>{bytes(r?.network_tx_bytes)}</strong>
                      </div>
                      <div className="detail-item">
                        <span>
                          <Zap size={15} /> TPS / MSPT
                        </span>
                        <strong className="muted">Unavailable</strong>
                      </div>
                      <div className="details-note">
                        <ShieldCheck size={16} />
                        <p>
                          {fresh
                            ? "Connected to your hosting panel."
                            : "Live hosting data unavailable."}
                          <small>All resource values come from the API.</small>
                        </p>
                      </div>
                      <button
                        className="wide text-button"
                        onClick={() => navigate("network")}
                      >
                        View network allocations
                        <ArrowUpRight size={15} />
                      </button>
                    </section>
                  </div>
                  <div className="dashboard-bottom">
                    <section className="panel performance">
                      <div className="panel-title">
                        <h2>
                          <Activity size={17} /> Resource history
                        </h2>
                        <span className="tag">5s samples</span>
                      </div>
                      <div className="chart-grid">
                        <div>
                          <div className="chart-title">
                            <span>
                              <i />
                              CPU
                            </span>
                            <strong>
                              {typeof r?.cpu_absolute === "number"
                                ? r.cpu_absolute.toFixed(2) + "%"
                                : "Unavailable"}
                            </strong>
                          </div>
                          <HistoryChart
                            history={overview?.history || []}
                            kind="cpu_absolute"
                          />
                        </div>
                        <div>
                          <div className="chart-title cyan">
                            <span>
                              <i />
                              Memory
                            </span>
                            <strong>{bytes(r?.memory_bytes)}</strong>
                          </div>
                          <HistoryChart
                            history={overview?.history || []}
                            kind="memory_bytes"
                          />
                        </div>
                      </div>
                      <div className="panel-note">
                        Latest 60 samples shown · up to 720 retained in process
                        memory · gaps reflect missed samples
                      </div>
                    </section>
                    <section className="panel recent-activity">
                      <div className="panel-title">
                        <h2>Recent activity</h2>
                        <button
                          className="text-button"
                          disabled={!allowed(user, "audit.read")}
                          onClick={() => navigate("activity")}
                        >
                          View all
                          <ArrowUpRight size={13} />
                        </button>
                      </div>
                      {activity.length ? (
                        activity.slice(0, 3).map((a) => (
                          <div className="activity-item" key={a.id}>
                            <span className="activity-icon">
                              <ShieldCheck size={14} />
                            </span>
                            <div>
                              {a.action}
                              <small>
                                {new Date(a.createdAt).toLocaleString()}
                              </small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="activity-empty">
                          {allowed(user, "audit.read")
                            ? "No recorded actions yet."
                            : "Activity access is restricted."}
                          <small>Management actions appear here.</small>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
              <footer className="dashboard-footer">
                <span>
                  <Logo />
                  GOD SUBCONSOLE{" "}
                  <span className="muted">/ Built for your world.</span>
                </span>
                <span>
                  <span className={fresh ? "live-dot" : "offline-dot"} />
                  {fresh
                    ? "Hosting API connected"
                    : "Hosting connection unavailable"}
                </span>
              </footer>
            </>
          ) : (
            <Features
              page={page}
              user={user}
              server={server}
              overview={overview}
              notify={notify}
              onUser={setUser}
            />
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {power && (
        <Modal
          title={
            power === "kill"
              ? "Force stop server"
              : power[0].toUpperCase() + power.slice(1) + " server"
          }
          onClose={() => !busy && setPower(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const confirmation = new FormData(e.currentTarget).get(
                "confirmation",
              );
              setBusy(true);
              try {
                const r = await request(`/servers/${server}/power`, "POST", {
                  signal: power,
                  confirmation: confirmation || undefined,
                });
                notify(r.message);
                setPower(null);
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              {power === "kill"
                ? "Force stop immediately terminates the server process. Unsaved world data may be lost."
                : `Send a ${power === "stop" ? "graceful stop" : power} request to ${overview?.server?.name || "the server"}? This affects the live server.`}
            </p>
            {power === "kill" && (
              <label>
                Type FORCE STOP to confirm
                <input name="confirmation" required autoComplete="off" />
              </label>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPower(null)}
              >
                Cancel
              </button>
              <button
                className={power === "kill" ? "danger" : "primary"}
                disabled={busy}
              >
                {busy ? "Sending…" : "Confirm " + power}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
