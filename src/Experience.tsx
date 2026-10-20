import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export default function Experience() {
  const [sound, setSound] = useState(() => {
    try { return localStorage.getItem("god-sound") === "on"; } catch { return false; }
  });
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    try { localStorage.setItem("god-sound", sound ? "on" : "off"); } catch { /* Storage may be disabled. */ }
    if (!sound) return;
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button,a,select") : null;
      if (!target || target.hasAttribute("disabled") || target.closest(".sound-toggle")) return;
      try {
        const ctx = audio.current ??= new AudioContext();
        void ctx.resume().then(() => {
          if (ctx.state !== "running") return;
          const tone = ctx.createOscillator(), gain = ctx.createGain();
          tone.type = "sine";
          tone.frequency.setValueAtTime(760, ctx.currentTime);
          tone.frequency.exponentialRampToValueAtTime(390, ctx.currentTime + 0.055);
          gain.gain.setValueAtTime(0.025, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.065);
          tone.connect(gain); gain.connect(ctx.destination);
          tone.start(); tone.stop(ctx.currentTime + 0.07);
          tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        }).catch(() => {});
      } catch { /* Audio is optional. */ }
    };
    document.addEventListener("click", click);
    return () => { document.removeEventListener("click", click); void audio.current?.suspend(); };
  }, [sound]);
  useEffect(() => () => { void audio.current?.close(); audio.current = null; }, []);
  return <>
    <div className="ambient-scene" aria-hidden="true"><div className="ambient-orb" /><div className="ambient-grid" /></div>
    <button className="sound-toggle" aria-label={sound ? "Mute interface sounds" : "Enable interface sounds"} aria-pressed={sound} onClick={() => setSound(!sound)}>
      {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}<span>Sound {sound ? "on" : "off"}</span>
    </button>
  </>;
}
