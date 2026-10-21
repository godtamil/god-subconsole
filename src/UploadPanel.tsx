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
    setResult("");
    try {
      const response = await fetch(
        `/api/servers/${encodeURIComponent(server)}/files/upload?directory=${encodeURIComponent(directory)}&plugin=${plugin}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-CSRF-Token": csrfToken,
            "X-File-Name": encodeURIComponent(file.name),
          },
          body: file,
        },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Upload failed");
      setResult(data.message);
      notify(data.message);
      onDone();
    } catch (e) {
      setResult((e as Error).message);
      notify((e as Error).message);
    } finally {
      setBusy(false);
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
