import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";

export type CelebrationType =
  | "session_complete"
  | "question_correct"
  | "cloud_synced"
  | "login_welcome"
  | "export_done"
  | "anki_export"
  | "streak";

export interface CelebrationConfig {
  type: CelebrationType;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

export function celebrate(config: CelebrationConfig): void {
  window.dispatchEvent(new CustomEvent("usb:celebrate", { detail: config }));
}

const TYPE_CFG: Record<CelebrationType, {
  size: "big" | "small";
  bg: string;
  glow: string;
  bar: string;
  confetti: boolean;
  duration: number;
}> = {
  session_complete: {
    size: "big",
    bg: "from-violet-950/96 via-slate-950/96 to-indigo-950/96",
    glow: "from-violet-600/20 via-fuchsia-600/10 to-emerald-600/15",
    bar: "from-violet-500 via-fuchsia-500 to-emerald-500",
    confetti: true,
    duration: 4200,
  },
  question_correct: {
    size: "small",
    bg: "from-violet-950/92 to-slate-900/92",
    glow: "from-violet-500/15 to-transparent",
    bar: "from-violet-500 to-violet-400",
    confetti: false,
    duration: 2400,
  },
  cloud_synced: {
    size: "small",
    bg: "from-slate-900/92 to-sky-950/92",
    glow: "from-sky-500/12 to-transparent",
    bar: "from-sky-500 to-violet-500",
    confetti: false,
    duration: 2600,
  },
  login_welcome: {
    size: "big",
    bg: "from-violet-950/96 via-slate-950/96 to-fuchsia-950/96",
    glow: "from-violet-600/20 via-fuchsia-600/15 to-transparent",
    bar: "from-violet-400 via-fuchsia-400 to-pink-400",
    confetti: false,
    duration: 3600,
  },
  export_done: {
    size: "big",
    bg: "from-emerald-950/96 via-slate-950/96 to-teal-950/96",
    glow: "from-emerald-600/20 via-teal-600/10 to-transparent",
    bar: "from-emerald-400 via-teal-400 to-cyan-400",
    confetti: true,
    duration: 3600,
  },
  anki_export: {
    size: "big",
    bg: "from-indigo-950/96 via-slate-950/96 to-purple-950/96",
    glow: "from-indigo-600/20 to-purple-600/15",
    bar: "from-indigo-400 to-purple-400",
    confetti: true,
    duration: 3600,
  },
  streak: {
    size: "big",
    bg: "from-amber-950/96 via-slate-950/96 to-orange-950/96",
    glow: "from-amber-600/20 to-orange-600/15",
    bar: "from-amber-400 to-orange-400",
    confetti: true,
    duration: 3800,
  },
};

function Sparkle({ x, y, delay, size = 3 }: { x: number; y: number; delay: number; size?: number }) {
  return (
    <motion.div
      className="absolute rounded-full bg-white pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.8, 0], opacity: [0, 0.9, 0], y: [-0, -18, -36] }}
      transition={{ duration: 1.4, delay, repeat: Infinity, repeatDelay: 1.2 + Math.random() * 1.5 }}
    />
  );
}

function RippleRing({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      className="absolute rounded-full border border-violet-400/20 pointer-events-none"
      style={{ inset: "20%" }}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 2.5, opacity: [0, 0.5, 0] }}
      transition={{ duration: 1.8, delay, repeat: Infinity, repeatDelay: 0.8 }}
    />
  );
}

function OrbitalDot({ angle, radius, color }: { angle: number; radius: number; color: string }) {
  return (
    <motion.div
      className="absolute w-1.5 h-1.5 rounded-full pointer-events-none"
      style={{
        background: color,
        left: "50%",
        top: "50%",
        marginLeft: -3,
        marginTop: -3,
      }}
      animate={{
        x: [
          Math.cos(angle) * radius,
          Math.cos(angle + Math.PI * 2) * radius,
        ],
        y: [
          Math.sin(angle) * radius,
          Math.sin(angle + Math.PI * 2) * radius,
        ],
      }}
      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
    />
  );
}

export function CelebrationOverlay() {
  const [current, setCurrent] = useState<CelebrationConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const config = (event as CustomEvent<CelebrationConfig>).detail;
      const cfg = TYPE_CFG[config.type];

      if (timerRef.current) window.clearTimeout(timerRef.current);
      setCurrent(config);
      setVisible(true);

      if (cfg.confetti) {
        window.setTimeout(() => {
          confetti({
            particleCount: 90,
            angle: 60,
            spread: 75,
            origin: { x: 0.1, y: 0.55 },
            colors: ["#8b5cf6", "#10b981", "#fde047", "#38bdf8", "#f472b6"],
            ticks: 200,
          });
          confetti({
            particleCount: 90,
            angle: 120,
            spread: 75,
            origin: { x: 0.9, y: 0.55 },
            colors: ["#8b5cf6", "#10b981", "#fde047", "#38bdf8", "#f472b6"],
            ticks: 200,
          });
        }, 280);

        if (cfg.size === "big") {
          window.setTimeout(() => {
            confetti({
              particleCount: 40,
              spread: 120,
              origin: { x: 0.5, y: 0.4 },
              colors: ["#c4b5fd", "#a7f3d0", "#fde68a"],
              ticks: 150,
            });
          }, 800);
        }
      }

      timerRef.current = window.setTimeout(() => {
        setVisible(false);
        window.setTimeout(() => setCurrent(null), 700);
      }, cfg.duration);
    };

    window.addEventListener("usb:celebrate", handler);
    return () => {
      window.removeEventListener("usb:celebrate", handler);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!current) return null;

  const cfg = TYPE_CFG[current.type];
  const isBig = cfg.size === "big";

  const sparkles = isBig
    ? [
        { x: 8, y: 12, d: 0.0, s: 2 },
        { x: 85, y: 8, d: 0.4, s: 3 },
        { x: 15, y: 72, d: 0.8, s: 2 },
        { x: 88, y: 68, d: 1.2, s: 2 },
        { x: 50, y: 6, d: 0.6, s: 3 },
        { x: 92, y: 40, d: 1.6, s: 2 },
        { x: 5, y: 45, d: 1.0, s: 2 },
        { x: 72, y: 85, d: 0.2, s: 3 },
      ]
    : [];

  const orbitals = isBig
    ? [
        { angle: 0, radius: 110, color: "#8b5cf6" },
        { angle: Math.PI * 0.67, radius: 110, color: "#10b981" },
        { angle: Math.PI * 1.33, radius: 110, color: "#38bdf8" },
      ]
    : [];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[999998] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
          {/* CONFETTI ONLY: No visual cards or boxes */}
        </motion.div>
      )}
    </AnimatePresence>
  );
}