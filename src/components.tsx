import { useEffect, useRef, type ReactNode } from "react";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Fingerprint,
  Copy,
  X,
  ArrowUpRight,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { allocation, bytes } from "../shared/resources";
export function Logo() {
  return (
    <div className="logo-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="currentColor" opacity=".10"/>
        <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="1" opacity=".55"/>
        <path d="m12 11 1-5 5 3 3-5 3 5 5-3-1 5Z" fill="currentColor"/>
        <path
          d="M20 13 31 19v11l-11 7-11-7V19Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="m26 21-6-3-6 4v7l6 4 6-4v-5h-7v3h3l-2 2-3-2v-4l3-2 3 2Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-orbit">◇</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ResourceCards({
  data,
  loading,
  copy,
}: {
  data: any;
  loading: boolean;
  copy: (value: string) => void;
}) {
  const reduced = useReducedMotion(),
    r = data?.resources?.resources,
    l = data?.server?.limits;
  const cards = [
    {
      label: "CPU USAGE",
      icon: Cpu,
      usage: r?.cpu_absolute,
      limit: l?.cpu,
      format: (v: any) =>
        typeof v === "number" ? `${v.toFixed(2)}%` : "Unavailable",
      foot: "of CPU allocation",
      type: "cpu",
    },
    {
      label: "MEMORY",
      icon: MemoryStick,
      usage: r?.memory_bytes,
      limit: typeof l?.memory === "number" ? l.memory * 1024 ** 2 : null,
      format: bytes,
      foot: "of memory allocation",
      type: "memory",
    },
    {
      label: "DISK STORAGE",
      icon: HardDrive,
      usage: r?.disk_bytes,
      limit: typeof l?.disk === "number" ? l.disk * 1024 ** 2 : null,
      format: bytes,
      foot: "of storage allocation",
      type: "disk",
    },
  ];
  return (
    <div className="resource-grid">
      {cards.map(
        ({ label, icon: Icon, usage, limit, format, foot, type }, index) => {
          const a = allocation(usage, limit);
          return (
            <motion.section
              key={label}
              className="resource-card"
              data-resource={type}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <div className="resource-label">
                <span>{label}</span>
                <Icon size={19} />
              </div>
              {loading ? (
                <>
                  <div className="skeleton value-skeleton" />
                  <div className="skeleton small-skeleton" />
                </>
              ) : (
                <>
                  <div className="resource-value">{format(a.actual)}</div>
                  <div className="resource-limit">
                    {type === "cpu" ? "CPU used / " : "of "}<strong>{a.label || format(a.limit)}</strong> allocated
                  </div>
                  {(type === "memory" || type === "disk") && a.actual !== null && a.limit !== null && a.limit > 0 &&
                    <div className="resource-available">{bytes(Math.max(0,a.limit-a.actual))} available</div>}
                </>
              )}
              <div
                className="meter"
                role="progressbar"
                aria-label={label + " allocation"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={a.percent === null ? undefined : a.bar}
                aria-valuetext={
                  a.percent === null
                    ? a.label || "Unavailable"
                    : `${a.percent.toFixed(2)}% of allocation`
                }
              >
                <span style={{ width: `${a.bar}%` }} />
              </div>
              <div className="resource-bottom">
                <span>
                  {a.percent === null
                    ? "No percentage available"
                    : `${a.percent.toFixed(2)}% ${foot}`}
                </span>
                <span className="tiny-signal">▂ ▃ ▅</span>
              </div>
            </motion.section>
          );
        },
      )}
      <motion.section
        className="resource-card id-card"
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="resource-label">
          <span>SERVER ID</span>
          <Fingerprint size={19} />
        </div>
        {loading ? (
          <div className="skeleton value-skeleton" />
        ) : (
          <div className="resource-value identifier">
            {data?.server?.identifier || "Unavailable"}
          </div>
        )}
        <div className="resource-limit">Short server identifier</div>
        <button
          className="copy-uuid"
          disabled={!data?.server?.uuid}
          onClick={() => copy(data.server.uuid)}
        >
          <Copy size={14} /> Copy full UUID <ArrowUpRight size={14} />
        </button>
        <div className="resource-bottom">
          {data?.server?.uuid
            ? "Full UUID verified by hosting API"
            : "Full UUID unavailable"}
        </div>
      </motion.section>
    </div>
  );
}
export function HistoryChart({
  history,
  kind,
}: {
  history: any[];
  kind: "cpu_absolute" | "memory_bytes";
}) {
  const points = history.slice(-60).filter((x) => typeof x[kind] === "number");
  if (points.length < 2)
    return (
      <div className="chart-empty">
        Collecting live samples
        <span>Every 5 seconds · no simulated history</span>
      </div>
    );
  const max = Math.max(
    ...points.map((x) => x[kind]),
    kind === "cpu_absolute" ? 1 : 1024 ** 2,
  );
  const firstAt = new Date(points[0].at).getTime(),
    lastAt = new Date(points.at(-1).at).getTime();
  const xPosition = (point: any) =>
    ((new Date(point.at).getTime() - firstAt) / Math.max(1, lastAt - firstAt)) *
    600;
  const segments: any[][] = [];
  points.forEach((point, index) => {
    if (
      index === 0 ||
      new Date(point.at).getTime() - new Date(points[index - 1].at).getTime() >
        15000
    )
      segments.push([]);
    segments.at(-1)!.push(point);
  });
  const start = new Date(points[0].at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    end = new Date(points.at(-1).at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  return (
    <>
      <svg
        className="chart"
        viewBox="0 0 600 110"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${kind === "cpu_absolute" ? "CPU" : "Memory"} history from ${start} to ${end}`}
      >
        <defs>
          <linearGradient id={"fade-" + kind} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3885ff" stopOpacity=".25" />
            <stop offset="100%" stopColor="#3885ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 50, 80, 109].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="600"
            y2={y}
            stroke="#1c2941"
            strokeDasharray="3 5"
          />
        ))}
        {segments.map((segment, i) => {
          const coords = segment
            .map(
              (point) =>
                `${xPosition(point)},${100 - (point[kind] / max) * 80}`,
            )
            .join(" ");
          return (
            <g key={i}>
              <polygon
                points={`${xPosition(segment[0])},110 ${coords} ${xPosition(segment.at(-1))},110`}
                fill={`url(#fade-${kind})`}
              />
              <polyline
                points={coords}
                fill="none"
                stroke={kind === "cpu_absolute" ? "#4a91ff" : "#55d4e6"}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      <div className="chart-axis">
        <span>{start}</span>
        <span>{end}</span>
      </div>
    </>
  );
}
