import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  TerminalSquare,
  Pause,
  Play,
  Download,
  Maximize,
  Search,
  Trash2,
  Copy,
  ArrowDown,
} from "lucide-react";
import { allowed, request } from "./api";
export type Line = { at: string; data: string };
export function useConsole(user: any, server: string) {
  const [lines, setLines] = useState<Line[]>([]),
    [status, setStatus] = useState("disconnected"),
    [canCommand, setCanCommand] = useState(false),
    [serverState, setServerState] = useState("unavailable");
  useEffect(() => {
    setLines([]);
    setCanCommand(false);
    setServerState("unavailable");
    if (!server) return;
    if (!allowed(user, "console.read")) { setStatus("Console permission not granted"); return; }
    let closed = false,
      ws: WebSocket,
      timer: ReturnType<typeof setTimeout>,
      attempt = 0;
    async function connect() {
      setStatus("Checking console access…");
      try {
        const access = await request(`/servers/${server}/console-access`);
        if (closed) return;
        setCanCommand(!!access.canCommand);
      } catch (reason) {
        if (!closed) setStatus((reason as Error).message);
        return;
      }
      setStatus("connecting");
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/console-stream?server=${encodeURIComponent(server)}`,
      );
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.event === "output")
            setLines((prev) =>
              [...prev, { at: m.at, data: m.data }].slice(-2000),
            );
          if (m.event === "connection") {
            setStatus(m.data);
            if (m.data === "connected") attempt = 0;
          }
          if (m.event === "status") setServerState(String(m.data || "unavailable"));
        } catch {
          setStatus("unavailable");
        }
      };
      ws.onclose = (e) => {
        setStatus(e.code === 1008 ? (e.reason || "Console authorization expired") : "disconnected — reconnecting");
        if (!closed && e.code !== 1008)
          timer = setTimeout(
            connect,
            Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)),
          );
      };
      ws.onerror = () => setStatus("disconnected");
    }
    void connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [user?.id, server]);
  return { lines, status, canCommand, serverState, clear: () => setLines([]) };
}
const plain = (s: string) =>
  s
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
const colorSafe = (s: string) =>
  s
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[(?![\d;]*m)[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1a\x1c-\x1f\x7f]/g, "");
export default function Console({
  user,
  server,
  stream,
  notify,
  serverState,
  large = false,
}: {
  user: any;
  server: string;
  stream: ReturnType<typeof useConsole>;
  notify: (message: string) => void;
  serverState: string;
  large?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    box = useRef<HTMLElement>(null),
    terminal = useRef<Terminal>(null),
    last = useRef<Line | undefined>(undefined);
  const [paused, setPaused] = useState(false),
    [scroll, setScroll] = useState(true),
    [search, setSearch] = useState(""),
    [command, setCommand] = useState(""),
    [history, setHistory] = useState<string[]>([]),
    [historyIndex, setHistoryIndex] = useState(-1),
    [sending, setSending] = useState(false),
    [commandFeedback, setCommandFeedback] = useState("");
  useEffect(() => {
    if (!host.current) return;
    const t = new Terminal({
      disableStdin: true,
      convertEol: true,
      scrollback: 2000,
      fontSize: 12,
      fontFamily: 'Consolas, "Courier New", monospace',
      lineHeight: 1.65,
      theme: {
        background: "#090f1b",
        foreground: "#a9bad3",
        green: "#65dba8",
        blue: "#6aabff",
        yellow: "#e1bf79",
      },
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(host.current);
    terminal.current = t;
    last.current = undefined;
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {}
    });
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      t.dispose();
    };
  }, []);
  useEffect(() => {
    const t = terminal.current;
    if (!t || paused) return;
    const idx = last.current ? stream.lines.indexOf(last.current) : -1;
    if (idx === -1) {
      t.clear();
      if (stream.lines.length === 0) return;
    }
    const fresh = stream.lines.slice(idx + 1);
    for (const line of fresh)
      t.writeln(
        `\x1b[90m${new Date(line.at).toLocaleTimeString()}\x1b[0m ${colorSafe(line.data)}`,
      );
    last.current = stream.lines.at(-1);
    if (scroll) t.scrollToBottom();
  }, [stream.lines, paused, scroll]);
  const logs = () =>
    stream.lines
      .map((l) => `[${new Date(l.at).toISOString()}] ${plain(l.data)}`)
      .join("\n");
  const download = () => {
    const url = URL.createObjectURL(new Blob([logs()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${server}-console.log`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !command.trim() || !stream.canCommand || stream.status !== "connected" || serverState !== "running") return;
    let confirmation;
    if (/^(?:\/?(?:minecraft:)?op|lp|luckperms|pex)\b/i.test(command)) {
      confirmation = window.prompt(
        "This command may grant privileged server access. Type GRANT ACCESS to continue.",
      );
      if (confirmation !== "GRANT ACCESS") return;
    }
    setSending(true);
    setCommandFeedback("Sending command to the hosting panel…");
    try {
      const r = await request(`/servers/${server}/command`, "POST", {
        command,
        confirmation,
      });
      setHistory((prev) => [command, ...prev].slice(0, 50));
      setCommand("");
      setHistoryIndex(-1);
      setCommandFeedback("Command accepted by the hosting panel. Check live output for the game result.");
      notify(r.message);
    } catch (e) {
      setCommandFeedback((e as Error).message);
      notify((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <section
      ref={box}
      className={"panel console-panel " + (large ? "console-large" : "")}
    >
      <div className="panel-title">
        <h2>
          <TerminalSquare size={18} /> Live console
        </h2>
        <span
          className={
            "connection " + (stream.status === "connected" ? "good" : "")
          }
        >
          <i />
          {stream.status}
        </span>
        <div className="console-actions">
          <button
            title={paused ? "Resume output" : "Pause display"}
            aria-label={paused ? "Resume output" : "Pause display"}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button
            title="Copy logs"
            aria-label="Copy logs"
            onClick={() =>
              navigator.clipboard
                .writeText(logs())
                .then(() => notify("Logs copied"))
                .catch(() => notify("Clipboard unavailable"))
            }
          >
            <Copy size={15} />
          </button>
          <button
            title="Download logs"
            aria-label="Download logs"
            onClick={download}
          >
            <Download size={15} />
          </button>
          <button
            title="Clear local display"
            aria-label="Clear local display"
            onClick={() => {
              stream.clear();
              terminal.current?.clear();
              last.current = undefined;
            }}
          >
            <Trash2 size={15} />
          </button>
          <button
            title="Fullscreen console"
            aria-label="Fullscreen console"
            onClick={() =>
              box.current
                ?.requestFullscreen()
                .catch(() => notify("Fullscreen unavailable"))
            }
          >
            <Maximize size={15} />
          </button>
        </div>
      </div>
      <div className="console-search">
        <Search size={14} />
        <input
          aria-label="Search console logs"
          placeholder="Search output…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={scroll ? "selected" : ""}
          onClick={() => setScroll(!scroll)}
        >
          <ArrowDown size={12} />
          Auto-scroll {scroll ? "on" : "off"}
        </button>
      </div>
      <div
        className="terminal-wrap"
        style={{ display: search ? "none" : "block" }}
      >
        <div ref={host} className="terminal" />
        {!stream.lines.length && (
          <div className="console-wait">
            {allowed(user, "console.read")
              ? "Waiting for server output…"
              : "Console access is not granted to your account."}
            <span>No output is simulated.</span>
          </div>
        )}
      </div>
      {search && (
        <pre className="search-results">
          {stream.lines
            .filter((l) =>
              plain(l.data).toLowerCase().includes(search.toLowerCase()),
            )
            .map(
              (l) =>
                `[${new Date(l.at).toLocaleTimeString()}] ${plain(l.data)}`,
            )
            .join("\n") || "No matching output."}
        </pre>
      )}
      {paused && (
        <div className="paused-note">
          Display paused · incoming output retained up to 2,000 lines
        </div>
      )}
      <form className="command-line" onSubmit={send}>
        <span>❯</span>
        <input
          aria-label="Server command"
          placeholder={
            allowed(user, "console.command") && stream.canCommand
              ? "Enter a server command…"
              : "Commands are unavailable for this account or hosting key"
          }
          disabled={!allowed(user, "console.command") || !stream.canCommand || stream.status !== "connected" || serverState !== "running" || sending}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              const i = Math.min(historyIndex + 1, history.length - 1);
              setHistoryIndex(i);
              setCommand(history[i] || "");
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const i = Math.max(-1, historyIndex - 1);
              setHistoryIndex(i);
              setCommand(history[i] || "");
            }
          }}
        />
        <button
          disabled={
            !command.trim() || sending || !allowed(user, "console.command") || !stream.canCommand || stream.status !== "connected" || serverState !== "running"
          }
        >
          Send <span>↵</span>
        </button>
      </form>
      {commandFeedback && (
        <div className="command-feedback" role="status" aria-live="polite">
          <span className={sending ? "command-pulse" : ""} />
          {commandFeedback}
        </div>
      )}
      <div className="console-foot">
        UTF-8 <span>Read from your server · 2,000-line local buffer</span>
      </div>
    </section>
  );
}
