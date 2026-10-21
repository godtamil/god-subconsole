import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Server, ShieldCheck, ExternalLink } from "lucide-react";
import { request } from "./api";

export default function IntegrationPanel({
  user,
  notify,
}: {
  user: any;
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    request("/integration")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      b = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    try {
      const r = await request("/admin/integration", "PUT", {
        server: b.server,
        key: b.key || undefined,
      });
      setData(r);
      form.reset();
      notify(r.message);
      location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel padded integration-settings">
      <div className="settings-icon">
        <KeyRound size={22} />
      </div>
      <h2>Hosting connection</h2>
      <p>
        Connect your panel and server. Your Client API key stays encrypted on
        the backend.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <div className="skeleton" />
      ) : (
        <>
          <div className="connection-facts">
            <span>
              <Server size={14} />
              {data.server}
            </span>
            <span>
              <ShieldCheck size={14} />
              {data.keyConfigured ? "Key configured" : "Key needed"}
            </span>
          </div>
          <a href={data.panel} target="_blank" rel="noreferrer">
            Open hosting panel <ExternalLink size={12} />
          </a>
          {user.role === "owner" ? (
            <form onSubmit={save}>
              <label>
                Server ID or full UUID
                <input
                  name="server"
                  required
                  defaultValue={data.server}
                  maxLength={80}
                />
              </label>
              <label>
                Client API key
                <input
                  name="key"
                  type="password"
                  autoComplete="off"
                  placeholder="ptlc_… · leave blank to keep saved key"
                  maxLength={256}
                />
              </label>
              <p className="panel-note">
                Connection is checked before saving. Two-factor authentication
                is required for this change.
              </p>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Checking your connection…"
                  : "Verify & save connection"}
              </button>
            </form>
          ) : (
            <p className="panel-note">
              Connection credentials are managed by the site administrator.
              Server controls are shared with signed-in members.
            </p>
          )}
          <div className="shared-mode">
            <strong>
              {data.sharedControl ? "Shared server control" : "Approval mode"}
            </strong>
            <p>
              {data.sharedControl
                ? "Every signed-in member can manage this server. Site credentials and account administration stay restricted."
                : "Server access is assigned by an administrator."}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
