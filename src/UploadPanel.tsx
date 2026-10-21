import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { csrfToken } from "./api";

export default function UploadPanel({
  server,
  directory = "/",
  plugins = false,
  disabled,
  onDone,
  notify,
}: {
  server: string;
  directory?: string;
  plugins?: boolean;
  disabled: boolean;
  onDone: () => void;
  notify: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false),
    [autoPlugin, setAutoPlugin] = useState(true);
  const [result, setResult] = useState("");
  const [progress,setProgress] = useState<number|null>(null);
  async function upload(files: FileList | null) {
    if (disabled || busy || !files?.length) return;
    const file = files[0],
      plugin = plugins || (autoPlugin && /\.jar$/i.test(file.name));
    if (file.size > 10 * 1024 ** 2)
      return notify("Upload limit is 10 MiB per file");
    if (plugins && !/\.jar$/i.test(file.name))
      return notify("Choose a plugin .jar file");
    if (
      !confirm(
        `Upload ${file.name} to ${plugin ? "/plugins" : directory}? Server code can run with the server's permissions. Existing files will not be overwritten.`,
      )
    )
      return;
    setBusy(true);
    setProgress(0);
    setResult("");
    try {
      const data = await new Promise<any>((resolve,reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST",`/api/servers/${encodeURIComponent(server)}/files/upload?directory=${encodeURIComponent(directory)}&plugin=${plugin}`);
        xhr.setRequestHeader("Content-Type","application/octet-stream");
        xhr.setRequestHeader("X-CSRF-Token",csrfToken);
        xhr.setRequestHeader("X-File-Name",encodeURIComponent(file.name));
        xhr.upload.onprogress = event => { if(event.lengthComputable) setProgress(Math.round(event.loaded/event.total*100)); };
        xhr.onerror = () => reject(Error("Upload connection failed"));
        xhr.onload = () => {
          let payload:any;
          try { payload = JSON.parse(xhr.responseText); }
          catch { reject(Error("Invalid upload response")); return; }
          if(xhr.status < 200 || xhr.status >= 300) reject(Error(payload.error || "Upload failed"));
          else resolve(payload);
        };
        xhr.send(file);
      });
      setResult(data.message);
      notify(data.message);
      onDone();
    } catch (e) {
      setResult((e as Error).message);
      notify((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }
  return (
    <div className="upload-zone-wrap">
      <button
        type="button"
        className={`upload-dropzone ${dragging ? "dragging" : ""}`}
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
      >
        <span className="glass-orb-icon">
          <UploadCloud size={24} />
        </span>
        <span>
          <strong>
            {busy
              ? "Uploading to your server…"
              : plugins
                ? "Drop a plugin JAR here"
                : "Drop a file here"}
          </strong>
          <small>
            {plugins
              ? "Creates /plugins when needed · restart to load"
              : "Choose a file or drag it here · up to 10 MiB"}
          </small>
        </span>
        <span className="upload-choose">Browse files</span>
      </button>
      {busy && <div className="upload-progress" role="progressbar" aria-label="Upload progress" aria-valuenow={progress ?? undefined} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${progress ?? 15}%`}}/></div>}
      <input
        ref={input}
        type="file"
        hidden
        accept={plugins ? ".jar" : undefined}
        aria-label={plugins ? "Choose plugin JAR" : "Choose server file"}
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      {!plugins && (
        <label className="checkbox upload-routing">
          <input
            type="checkbox"
            checked={autoPlugin}
            onChange={(e) => setAutoPlugin(e.target.checked)}
          />
          Put plugin JARs in /plugins automatically
        </label>
      )}
      {result && (
        <p role="status" className="upload-result">
          {result}
        </p>
      )}
    </div>
  );
}
