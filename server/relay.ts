import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { lookupSession } from "./auth";
import { config } from "./config";
import { permitted } from "./security";
import {
  panel,
  serverPath,
  upstreamPermission,
  validateDestination,
  publicLookup,
} from "./panel";
export function attachRelay(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const counts = new Map<string, number>();
  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url || "/", config.app);
    if (url.pathname !== "/console-stream") return;
    const reject = () => {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
    };
    try {
      const value = req.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("gs_session="))
        ?.slice(11);
      const session = await lookupSession(value);
      const id = url.searchParams.get("server") || "";
      if (
        req.headers.origin !== new URL(config.app).origin ||
        !session ||
        !permitted(session.u, "console.read", id) ||
        (counts.get(session.u.id) || 0) >= 2 ||
        wss.clients.size >= 20
      )
        return reject();
      await upstreamPermission(id, "websocket.connect");
      counts.set(session.u.id, (counts.get(session.u.id) || 0) + 1);
      wss.handleUpgrade(req, socket, head, (client) => {
        let upstream: WebSocket | undefined,
          stopped = false,
          retry = 0,
          timer: NodeJS.Timeout | undefined,
          refreshing = false;
        const send = (data: any) => {
          if (client.readyState !== WebSocket.OPEN) return;
          if (client.bufferedAmount > 1024 * 1024) {
            client.close(1013, "Slow consumer");
            return;
          }
          client.send(JSON.stringify(data));
        };
        async function credentials() {
          const result = await panel(serverPath(id) + "/websocket");
          const url = new URL(result.data.socket);
          if (
            url.protocol !== "wss:" ||
            url.username ||
            url.password ||
            !config.wsHosts.includes(url.hostname)
          )
            throw Error("Unapproved websocket host");
          await validateDestination(url);
          return result.data;
        }
        async function connect() {
          if (stopped) return;
          send({ event: "connection", data: "connecting" });
          try {
            const c = await credentials();
            if (stopped) return;
            upstream = new WebSocket(c.socket, {
              origin: config.origin,
              handshakeTimeout: 10000,
              maxPayload: 256 * 1024,
              followRedirects: false,
              lookup: publicLookup,
            });
            upstream.on("open", () =>
              upstream?.send(
                JSON.stringify({ event: "auth", args: [c.token] }),
              ),
            );
            upstream.on("message", async (raw) => {
              try {
                const m = JSON.parse(raw.toString());
                if (m.event === "auth success") {
                  retry = 0;
                  send({ event: "connection", data: "connected" });
                  upstream?.send(
                    JSON.stringify({ event: "send logs", args: [] }),
                  );
                } else if (
                  ["console output", "install output"].includes(m.event)
                ) {
                  send({
                    event: "output",
                    at: new Date().toISOString(),
                    data: String(m.args?.[0] || "").slice(0, 32768),
                  });
                } else if (m.event === "status")
                  send({ event: "status", data: m.args?.[0] });
                else if (
                  ["token expiring", "token expired", "jwt error"].includes(
                    m.event,
                  ) &&
                  !refreshing
                ) {
                  refreshing = true;
                  try {
                    const next = await credentials();
                    upstream?.send(
                      JSON.stringify({ event: "auth", args: [next.token] }),
                    );
                  } catch {
                    upstream?.close();
                  } finally {
                    refreshing = false;
                  }
                }
              } catch {
                send({ event: "connection", data: "invalid upstream message" });
              }
            });
            upstream.on("error", () => upstream?.close());
            upstream.on("close", schedule);
          } catch {
            schedule();
          }
        }
        function schedule() {
          if (stopped) return;
          send({ event: "connection", data: "disconnected — reconnecting" });
          clearTimeout(timer);
          timer = setTimeout(
            connect,
            Math.min(30000, 1000 * 2 ** Math.min(retry++, 5)),
          );
        }
        const verifyTimer = setInterval(async () => {
          try {
            const current = await lookupSession(value);
            if (!current || !permitted(current.u, "console.read", id)) {
              client.close(1008, "Session or permission expired");
              return;
            }
            await upstreamPermission(id, "websocket.connect");
          } catch {
            client.close(1008, "Authorization unavailable");
          }
        }, 15000);
        verifyTimer.unref();
        client.on("message", () =>
          client.close(1008, "Use the authorized HTTP command endpoint"),
        );
        client.on("error", () => client.close());
        client.on("close", () => {
          stopped = true;
          clearTimeout(timer);
          clearInterval(verifyTimer);
          upstream?.close();
          counts.set(
            session.u.id,
            Math.max(0, (counts.get(session.u.id) || 1) - 1),
          );
        });
        void connect();
      });
    } catch {
      reject();
    }
  });
  return wss;
}
