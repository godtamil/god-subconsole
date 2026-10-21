import { useEffect, useState, type FormEvent } from "react";
import { Download, ExternalLink, Search, Server, ShieldCheck } from "lucide-react";
import { request, allowed } from "./api";
import { bytes } from "../shared/resources";

type Kind = "plugin" | "mod";
type Version = { id: string; name: string; version: string; filename: string | null; size: number | null;
  minecraftVersions: string[]; software: string[]; dependencies: { projectId: string | null; versionId: string | null; filename: string | null }[] };
type Project = { id: string; title: string; description: string; author: string; icon: string | null; downloads: number;
  minecraftVersions: string[]; software: string[]; source: string; url: string; latest: Version };
type Software = { loader: string | null; minecraftVersion: string | null; kind: string; source: string };
type Installed = { files: { name: string }[]; installed: { projectId: string; versionId: string; filename: string; version: string }[] };
type Job = { stage: string; received: number; total: number; filename: string | null; message: string };

export default function PluginDiscovery({ server, user, kind }: { server: string; user: any; kind: Kind }) {
  const [software, setSoftware] = useState<Software | null>(null);
  const [softwareError, setSoftwareError] = useState("");
  const [installed, setInstalled] = useState<Installed>({ files: [], installed: [] });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [chosen, setChosen] = useState<Version | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobId, setJobId] = useState("");
  const base = `/servers/${server}/addons`;
  const refreshInstalled = () => request(`${base}/${kind}/installed`).then(setInstalled).catch(reason => setSoftwareError(reason.message));
  useEffect(() => {
    let active = true;
    setSoftware(null); setSoftwareError(""); setResults([]); setSelected(null); setChosen(null);
    setSearched(false); setJob(null); setJobId(""); setInstalled({ files: [], installed: [] });
    request(`${base}/software`).then(data => { if (active) setSoftware(data); })
      .catch(reason => { if (active) setSoftwareError(reason.message); });
    void refreshInstalled();
    return () => { active = false; };
  }, [server, kind]);
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const poll = async () => {
      try {
        const next: Job = await request(`${base}/jobs/${jobId}`);
        if (!active) return;
        setJob(next);
        if (next.stage === "complete") { setJobId(""); void refreshInstalled(); }
        if (next.stage === "failed") setJobId("");
      } catch (reason) { if (active) { setJobId(""); setError((reason as Error).message); } }
    };
    void poll();
    const timer = setInterval(poll, 1400);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, server, kind]);
  const compatible = software?.kind === kind && !!software.minecraftVersion;
  async function search(nextOffset = 0) {
    if (query.trim().length < 2) { setError("Enter at least two characters."); return; }
    setLoading(true); setError("");
    try {
      const response = await request(`${base}/search?kind=${kind}&q=${encodeURIComponent(query.trim())}&offset=${nextOffset}`);
      setResults(response.data); setTotal(response.total); setOffset(nextOffset); setSearched(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }
  async function openVersions(project: Project) {
    setSelected(project); setVersions([]); setChosen(null); setVersionLoading(true); setError("");
    try { const response = await request(`${base}/${kind}/${project.id}/versions`); setVersions(response.data); }
    catch (reason) { setError((reason as Error).message); }
    finally { setVersionLoading(false); }
  }
  async function install() {
    if (!selected || !chosen || jobId || chosen.dependencies.length) return;
    setError(""); setJob(null);
    try {
      const result = await request(`${base}/install`, "POST", { kind, projectId: selected.id, versionId: chosen.id });
      setJobId(result.jobId);
    } catch (reason) { setError((reason as Error).message); }
  }
  const status = (project: Project) => {
    const record = installed.installed.find(item => item.projectId === project.id);
    if (record) return record.versionId === project.latest.id ? "Installed" : "Update available";
    if (installed.files.some(file => file.name === project.latest.filename)) return "Installed file detected";
    return "Compatible";
  };
  const chosenInstalled = !!chosen && !!selected &&
    (installed.installed.some(item => item.projectId === selected.id && item.versionId === chosen.id) ||
      installed.files.some(file => file.name === chosen.filename));
  return <section className="panel discovery-panel">
    <div className="panel-title"><h2><Search size={17}/> {kind === "plugin" ? "Plugin installer" : "Mod installer"}</h2><span className="tag">Modrinth · verified releases</span></div>
    <p className="discovery-intro">Installs a checked server JAR through the hosting API. No file is executed in this website.</p>
    {softwareError && <div className="notice error" role="alert">{softwareError}</div>}
    {!software && !softwareError && <p className="discovery-intro">Detecting your server software and Minecraft version…</p>}
    {software && <div className="addon-software"><Server size={15}/>{software.loader || "Software unknown"} · Minecraft {software.minecraftVersion || "version unknown"} <small>Detected from {software.source}</small></div>}
    {software && !compatible && <div className="notice" role="status">{kind === "mod" && software.kind === "plugin" ? "This server runs plugin software. Fabric, Forge and other loader mods cannot be installed here." : "A compatible loader and exact Minecraft version could not be verified. One-click installation is unavailable."}</div>}
    {compatible && <>
      <form className="discovery-search" onSubmit={(event: FormEvent) => { event.preventDefault(); void search(); }}>
        <input aria-label={`Search ${kind}s`} placeholder={`Search compatible ${kind}s`} value={query} onChange={event => setQuery(event.target.value)} maxLength={80}/>
        <button className="primary" disabled={loading || query.trim().length < 2}>{loading ? "Searching…" : "Search"}</button>
      </form>
      {error && <div className="notice error" role="alert">{error}</div>}
      {searched && !loading && !results.length && <p className="discovery-intro">No compatible {kind}s on this results page. Try another search or load more.</p>}
      {!!results.length && <div className="discovery-count">{total.toLocaleString()} candidate projects · page starting at {offset + 1} · {results.length} verified for this server</div>}
      <div className="discovery-grid" aria-busy={loading}>{results.map(project => <article className="discovery-tile" key={project.id}>
        <div className="discovery-source">{project.icon && <img src={project.icon} alt="" loading="lazy"/>} MODRINTH <span className="addon-badge">{status(project)}</span></div>
        <h3>{project.title}</h3><p>{project.description}</p>
        <div className="discovery-meta">by {project.author || "Unknown author"} · {project.downloads.toLocaleString()} downloads</div>
        <div className="discovery-tags"><span>Minecraft {software.minecraftVersion}</span><span>{project.software.join(", ")}</span><span>Latest: {project.latest.version}</span></div>
        <div className="discovery-actions"><button onClick={() => void openVersions(project)}>Review releases</button><a href={project.url} target="_blank" rel="noopener noreferrer">Official project <ExternalLink size={13}/></a></div>
      </article>)}</div>
      <div className="addon-pagination"><button disabled={loading || !offset} onClick={() => void search(Math.max(0, offset - 20))}>Previous</button><button disabled={loading || offset + 20 >= total} onClick={() => void search(offset + 20)}>Load more</button></div>
      {selected && <div className="addon-review"><div className="addon-review-head"><h3>{selected.title} · compatible releases</h3><button onClick={() => { setSelected(null); setChosen(null); }}>Close review</button></div>
        {versionLoading && <p>Checking exact releases…</p>}
        {!versionLoading && !versions.length && <p>No compatible server JAR is available.</p>}
        <div className="addon-versions">{versions.map(version => <button key={version.id} className={chosen?.id === version.id ? "selected" : ""} onClick={() => setChosen(version)}><strong>{version.version || version.name}</strong><small>{version.filename || "No JAR"} · {version.software.join(", ")} · Minecraft {software.minecraftVersion}</small></button>)}</div>
        {chosen && <div className="addon-confirm"><h4>Review before installing</h4><p><strong>File:</strong> {chosen.filename} ({chosen.size ? bytes(chosen.size) : "Size unavailable"})</p><p><strong>Destination:</strong> /{kind === "plugin" ? "plugins" : "mods"}/{chosen.filename}</p><p><strong>Loader:</strong> {chosen.software.join(", ")} · Minecraft {software.minecraftVersion}</p><p><strong>Required dependencies:</strong> {chosen.dependencies.length ? chosen.dependencies.map(dependency => dependency.projectId || dependency.filename || dependency.versionId).join(", ") : "None declared"}</p><p>Restart is required to load or update this JAR. Required dependencies must be installed separately before this installer can proceed.</p>
          <button className="primary" disabled={!allowed(user, "files.write") || !!jobId || !!chosen.dependencies.length || chosenInstalled} onClick={() => void install()}><Download size={15}/>{jobId ? "Installing…" : chosenInstalled ? "Already installed" : status(selected) === "Update available" ? "Install update" : "Install verified release"}</button>
          {!!chosen.dependencies.length && <p className="addon-blocked">One-click install is blocked until required dependencies can be verified on this server.</p>}
        </div>}
      </div>}
      {job && <div className={`addon-job ${job.stage}`} role="status"><ShieldCheck size={17}/><span>{job.message}<small>{job.stage === "downloading" && job.total ? `${bytes(job.received)} / ${bytes(job.total)} downloaded` : job.stage}</small></span>{job.stage === "downloading" && job.total > 0 && <progress value={job.received} max={job.total}/>}</div>}
      <div className="panel-note">An uploaded JAR is not confirmed loaded until the server restarts and its console reports success.</div>
    </>}
    {kind === "mod" && !!installed.files.length && <div className="addon-installed"><h3>JARs in /mods</h3>{installed.files.map(file => <span key={file.name}>{file.name}</span>)}</div>}
  </section>;
}
