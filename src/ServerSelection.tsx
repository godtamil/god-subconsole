import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, HardDrive, LogOut, RefreshCw, Search, Server, WifiOff } from "lucide-react";
import { request } from "./api";
import { Logo } from "./components";
import { bytes } from "../shared/resources";

type ServerInfo = { identifier: string; name: string; description?: string; allocations?: any[] };
type LiveInfo = { data?: any; error?: string; loading?: boolean };

export default function ServerSelection({ user, servers, loading, error, onRetry, onManage, onSignOut }: {
  user: any; servers: ServerInfo[]; loading: boolean; error: string;
  onRetry: () => void; onManage: (identifier: string) => void; onSignOut: () => void;
}) {
  const [query, setQuery] = useState("");
  const [live, setLive] = useState<Record<string, LiveInfo>>({});
  useEffect(() => {
    if (loading || error || !servers.length) return;
    let active = true;
    const refresh = () => {
      for (const server of servers) {
        setLive(prev => ({...prev, [server.identifier]: {...prev[server.identifier], loading: !prev[server.identifier]?.data}}));
        request(`/servers/${server.identifier}/overview`)
          .then(data => { if (active) setLive(prev => ({...prev, [server.identifier]: {data, error: data.error}})); })
          .catch(reason => { if (active) setLive(prev => ({...prev, [server.identifier]: {data: prev[server.identifier]?.data, error: reason.message}})); });
      }
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [servers, loading, error]);
  const filtered = useMemo(() => servers.filter(server =>
    `${server.name} ${server.identifier}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [servers, query]);
  return <div className="selection-page">
    <div className="selection-lines" aria-hidden="true" />
    <header className="selection-header">
      <div className="selection-brand"><Logo /><div><strong>GOD <span>SERVERS</span></strong><small>GOD Subconsole · GOD Company</small></div></div>
      <div className="selection-header-actions"><span>{user.name}</span><button onClick={onSignOut}><LogOut size={15}/> Sign out</button></div>
    </header>
    <main className="selection-main">
      <div className="selection-intro"><div className="eyebrow">YOUR AUTHORIZED WORKSPACE</div><h1>Choose your server<span>.</span></h1><p>Select a world to open its GOD Subconsole dashboard. Only servers assigned to your account appear here.</p></div>
      <div className="selection-toolbar"><div><strong>GOD SERVERS</strong><small>{loading ? "Loading" : `${servers.length} available`}</small></div><div className="selection-tools">{servers.length > 1 && <label className="selection-search"><Search size={16}/><span className="sr-only">Search servers</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your servers" /></label>}<button onClick={onRetry} disabled={loading}><RefreshCw size={15}/> Refresh</button></div></div>
      {error && <div className="selection-alert" role="alert"><AlertTriangle size={18}/><span>Could not load authorized servers. {error}</span><button onClick={onRetry}>Try again</button></div>}
      {loading && <div className="selection-grid" aria-label="Loading servers">{[1,2,3].map(n => <div className="selection-card selection-skeleton" key={n}><div/><div/><div/></div>)}</div>}
      {!loading && !error && !servers.length && <div className="selection-empty"><Server size={34}/><h2>No assigned servers yet</h2><p>Your account is ready. Ask the workspace administrator to assign a server, then refresh this page.</p><button onClick={onRetry}>Check access again</button></div>}
      {!loading && !error && servers.length > 0 && !filtered.length && <div className="selection-empty"><Search size={30}/><h2>No matches</h2><p>Try a different server name or identifier.</p></div>}
      {!loading && !error && <div className="selection-grid">{filtered.map(server => {
        const result = live[server.identifier];
        const data = result?.data;
        const stale = !!result?.error || (!!data?.updatedAt && Date.now() - new Date(data.updatedAt).getTime() > 30000);
        const state = !data ? "unavailable" : stale ? "stale" : data.resources?.current_state || "unavailable";
        const allocation = data?.server?.allocations?.find((item:any) => item.is_default) || server.allocations?.find((item:any) => item.is_default);
        const host = allocation?.ip_alias || allocation?.ip;
        const address = data?.joinAddress || (host && allocation?.port ? `${host}:${allocation.port}` : null);
        const usage = data?.resources?.resources;
        return <article className="selection-card" key={server.identifier}>
          <div className="selection-card-top"><div className="selection-server-icon"><Server size={23}/></div><span className={`selection-state ${state}`}><i/>{state === "running" ? "Online" : state === "offline" ? "Offline" : state === "stale" ? "Stale data" : state === "unavailable" ? "Unavailable" : state}</span></div>
          <h2>{server.name}</h2><p className="selection-id">{server.identifier}</p>
          <div className="selection-address">{address || "Address unavailable"}</div>
          <div className="selection-metrics"><div><span>LIVE RAM</span><strong>{usage ? bytes(usage.memory_bytes) : "Unavailable"}</strong></div><div><span>DISK USED</span><strong>{usage ? bytes(usage.disk_bytes) : "Unavailable"}</strong></div></div>
          {result?.error && <p className="selection-card-error"><WifiOff size={13}/>{data ? "Live data is stale" : result.error}</p>}
          {!result && <p className="selection-card-error">Connecting to hosting API…</p>}
          <button className="selection-manage" onClick={() => onManage(server.identifier)}>Manage Server <ArrowRight size={17}/></button>
        </article>;
      })}</div>}
    </main>
    <footer className="selection-footer"><HardDrive size={14}/> Live figures come from the authorized hosting API.</footer>
  </div>;
}
