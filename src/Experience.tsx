import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Logo } from "./components";
type Burst = { id: number; x: number; y: number };
export default function Experience() {
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem("god-sound") !== "off";
    } catch {
      return true;
    }
  });
  const [bursts, setBursts] = useState<Burst[]>([]),
    [entry, setEntry] = useState(false);
  const audio = useRef<AudioContext | null>(null),
    sequence = useRef(0);
  function tone(entrance = false) {
    try {
      const ctx = (audio.current ??= new AudioContext());
      void ctx
        .resume()
        .then(() => {
          if (ctx.state !== "running") return;
          const notes = entrance ? [392, 523.25, 783.99] : [640];
          notes.forEach((frequency, i) => {
            const start = ctx.currentTime + i * 0.065,
              oscillator = ctx.createOscillator(),
              gain = ctx.createGain();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(frequency * 1.5, start);
            oscillator.frequency.exponentialRampToValueAtTime(
              frequency,
              start + 0.075,
            );
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(
              entrance ? 0.07 : 0.045,
              start + 0.008,
            );
            gain.gain.exponentialRampToValueAtTime(
              0.0001,
              start + (entrance ? 0.23 : 0.12),
            );
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start(start);
            oscillator.stop(start + 0.28);
            oscillator.onended = () => {
              oscillator.disconnect();
              gain.disconnect();
            };
          });
        })
        .catch(() => {});
    } catch {
      /* Optional audio must never interrupt controls. */
    }
  }
  useEffect(() => {
    try {
      localStorage.setItem("god-sound", sound ? "on" : "off");
    } catch {}
  }, [sound]);
  useEffect(() => {
    let entryTimer: ReturnType<typeof setTimeout> | undefined;
    const reduced = () =>
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    function clicked(e: MouseEvent) {
      const target =
        e.target instanceof Element
          ? e.target.closest("button,a,select,[role='button']")
          : null;
      if (
        !target ||
        target.hasAttribute("disabled") ||
        target.closest(".sound-toggle")
      )
        return;
      if (sound) tone();
      if (reduced()) return;
      const box = target.getBoundingClientRect(),
        id = ++sequence.current;
      setBursts((old) => [
        ...old.slice(-3),
        {
          id,
          x: e.detail ? e.clientX : box.x + box.width / 2,
          y: e.detail ? e.clientY : box.y + box.height / 2,
        },
      ]);
    }
    function entered() {
      if (sound) tone(true);
      if (reduced()) return;
      setEntry(true);
      clearTimeout(entryTimer);
      entryTimer = setTimeout(() => setEntry(false), 650);
    }
    document.addEventListener("click", clicked);
    window.addEventListener("god:entry", entered);
    return () => {
      document.removeEventListener("click", clicked);
      window.removeEventListener("god:entry", entered);
      clearTimeout(entryTimer);
    };
  }, [sound]);
  useEffect(
    () => () => {
      void audio.current?.close();
      audio.current = null;
    },
    [],
  );
  return (
    <>
      <div className="bubble-atmosphere" aria-hidden="true">
        <img className="ambient-lion" src="/god-smp.png" alt="" />
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className={`floating-bubble bubble-${i}`} />
        ))}
        <div className="ambient-halo" />
        <div className="ambient-current ambient-current-one" />
        <div className="ambient-current ambient-current-two" />
        <div className="ambient-stars" />
        <div className="ambient-lines" />
      </div>
      <div className="bubble-fx" aria-hidden="true">
        {bursts.map((b) => (
          <div
            key={b.id}
            className="bubble-click"
            style={{ left: b.x, top: b.y }}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget)
                setBursts((old) => old.filter((x) => x.id !== b.id));
            }}
          >
            <span className="pop-ring" />
            {Array.from({ length: 8 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    "--dx": `${Math.cos((i * Math.PI) / 4) * 48}px`,
                    "--dy": `${Math.sin((i * Math.PI) / 4) * 48}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>
      {entry && (
        <div className="entry-burst" aria-hidden="true">
          <span />
          <span />
          <span />
          <div>
            <Logo />
            <strong>GOD Subconsole</strong>
          </div>
        </div>
      )}
      <button
        className="sound-toggle"
        aria-label={sound ? "Mute interface sounds" : "Enable interface sounds"}
        aria-pressed={sound}
        onClick={() => {
          if (!sound) tone();
          setSound(!sound);
        }}
      >
        {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
        <span>Sound {sound ? "on" : "off"}</span>
      </button>
    </>
  );
}
