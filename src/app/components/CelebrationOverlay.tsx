import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";
import { useDockTheme } from "../contexts/ThemeContext";
import { playSound } from "../services/sounds";
import { touchStreak } from "../services/streak";
import { Check, Flame, Cloud, Sparkles, Award, TrendingUp } from "./icons";
import { recordActivity } from "../services/progress";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CelebrationType =
  | "session_complete"
  | "question_correct"
  | "cloud_synced"
  | "login_welcome"
  | "export_done"
  | "code_correct"
  | "anki_export"
  | "streak"
  | "achievement"
  | "level_up";

export interface CelebrationConfig {
  type: CelebrationType;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** XP for this celebration is granted once per key (e.g. one export per lesson). */
  rewardKey?: string;
  /** Record XP/streak/achievements but show no card (another celebration is about to cover it). */
  silent?: boolean;
  /** Extra XP on top of the base reward (combo / improvement). */
  bonusXp?: number;
  /** Current correct-answer streak, used for combo achievements. */
  combo?: number;
}

// ─── Global trigger (call this from anywhere) ─────────────────────────────────

let lastKey = "";
let lastAt = 0;
const REWARDED_KEY = "usb:rewarded-keys";
function claimReward(key: string): boolean {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(REWARDED_KEY) || "[]");
    if (seen.includes(key)) return false;
    localStorage.setItem(REWARDED_KEY, JSON.stringify([...seen, key].slice(-500)));
  } catch {}
  return true;
}

export function celebrate(config: CelebrationConfig): void {
  const key = `${config.type}|${config.title}`;
  const now = Date.now();
  if (key === lastKey && now - lastAt < 2500) return;
  lastKey = key;
  lastAt = now;
  window.dispatchEvent(new CustomEvent("usb:celebrate", { detail: config }));
}

// ─── Per-type visual config ───────────────────────────────────────────────────

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
    bg: "from-violet-950/96 to-slate-950/96",
    glow: "from-violet-600/20 to-transparent",
    bar: "from-violet-400 to-violet-400",
    confetti: true,
    duration: 4200,
  },
  question_correct: {
    size: "small",
    bg: "from-violet-950/92 to-slate-950/92",
    glow: "from-violet-500/15 to-transparent",
    bar: "from-violet-400 to-violet-400",
    confetti: false,
    duration: 2400,
  },
  cloud_synced: {
    size: "small",
    bg: "from-slate-950/92 to-slate-900/92",
    glow: "from-sky-500/12 to-transparent",
    bar: "from-violet-400 to-violet-400",
    confetti: false,
    duration: 2600,
  },
  login_welcome: {
    size: "big",
    bg: "from-violet-950/96 to-slate-950/96",
    glow: "from-violet-600/20 to-transparent",
    bar: "from-violet-400 to-violet-400",
    confetti: false,
    duration: 3600,
  },
  export_done: {
    size: "big",
    bg: "from-emerald-950/96 to-slate-950/96",
    glow: "from-emerald-600/20 to-transparent",
    bar: "from-emerald-400 to-emerald-400",
    confetti: true,
    duration: 3600,
  },
  code_correct: {
    size: "big",
    bg: "", glow: "", bar: "",
    confetti: true,
    duration: 3400,
  },
  anki_export: {
    size: "big",
    bg: "from-violet-950/96 to-slate-950/96",
    glow: "from-violet-600/20 to-transparent",
    bar: "from-violet-400 to-violet-400",
    confetti: true,
    duration: 3600,
  },
  achievement: {
    size: "small",
    bg: "", glow: "", bar: "",
    confetti: false,
    duration: 3400,
  },
  level_up: {
    size: "big",
    bg: "", glow: "", bar: "",
    confetti: true,
    duration: 3600,
  },
  streak: {
    size: "big",
    bg: "from-amber-950/96 to-slate-950/96",
    glow: "from-amber-600/20 to-transparent",
    bar: "from-amber-400 to-amber-400",
    confetti: true,
    duration: 3800,
  },
};

const ACCENT: Record<CelebrationType, string> = {
  session_complete: "#6d4aff",
  question_correct: "#059669",
  cloud_synced: "#059669",
  login_welcome: "#6d4aff",
  export_done: "#059669",
  code_correct: "#059669",
  anki_export: "#6d4aff",
  streak: "#d97706",
  achievement: "#6d4aff",
  level_up: "#6d4aff",
};
const DEFAULT_ICON: Record<CelebrationType, React.ReactNode> = {
  session_complete: <Sparkles size={18} />,
  question_correct: <Check size={18} />,
  cloud_synced: <Cloud size={18} />,
  login_welcome: <Sparkles size={18} />,
  export_done: <Check size={18} />,
  code_correct: <Check size={18} />,
  anki_export: <Sparkles size={18} />,
  streak: <Flame size={18} />,
  achievement: <Award size={18} />,
  level_up: <TrendingUp size={18} />,
};
const ACTIVITY: CelebrationType[] = ["question_correct", "session_complete", "export_done", "anki_export"];

export function CelebrationOverlay() {
  const { isSepia } = useDockTheme();
  const [current, setCurrent] = useState<CelebrationConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const [nonce, setNonce] = useState(0);
  const queueRef = useRef<CelebrationConfig[]>([]);
  const busyRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const later = (fn: () => void, ms: number) => { timersRef.current.push(setTimeout(fn, ms)); };

    const show = (config: CelebrationConfig) => {
      const cfg = TYPE_CFG[config.type];
      busyRef.current = true;
      setCurrent(config);
      setNonce((n) => n + 1);
      setVisible(true);

      playSound(config.type === "streak" || config.type === "achievement" ? "streak" : config.type === "level_up" ? "celebrate" : cfg.size === "big" ? "celebrate" : config.type === "question_correct" ? "pop" : "success");

      if (cfg.confetti) {
        const colors = ["#6d4aff", "#8463ff", "#b9a8ff", "#ffffff", "#059669"];
        later(() => {
          confetti({ particleCount: 70, angle: 60, spread: 70, origin: { x: 0.1, y: 0.55 }, colors, ticks: 200, scalar: 0.9, zIndex: 2147483000, disableForReducedMotion: true });
          confetti({ particleCount: 70, angle: 120, spread: 70, origin: { x: 0.9, y: 0.55 }, colors, ticks: 200, scalar: 0.9, zIndex: 2147483000, disableForReducedMotion: true });
        }, 280);
        if (cfg.size === "big") {
          later(() => confetti({ particleCount: 36, spread: 120, origin: { x: 0.5, y: 0.4 }, colors, ticks: 150, scalar: 0.9, zIndex: 2147483000, disableForReducedMotion: true }), 800);
        }
      }

      later(() => {
        setVisible(false);
        later(() => {
          setCurrent(null);
          busyRef.current = false;
          const next = queueRef.current.shift();
          if (next) show(next);
        }, 450);
      }, cfg.duration);
    };

    const enqueue = (config: CelebrationConfig) => {
      if (!busyRef.current) { show(config); return; }
      // A praise that waits behind other messages is stale — drop it.
      if (config.type === "question_correct") return;
      if (queueRef.current.length < 4) queueRef.current.push(config);
    };

    const handler = (e: Event) => {
      const config = (e as CustomEvent<CelebrationConfig>).detail;

      // Rewards are recorded once, here; follow-ups (streak, level, achievements) join the same queue.
      const follow: CelebrationConfig[] = [];
      if (ACTIVITY.includes(config.type) && (!config.rewardKey || claimReward(config.rewardKey))) {
        const { count, isNewDay, usedFreeze } = touchStreak();
        const { gained, levelUp, unlocked } = recordActivity(config.type, { bonus: config.bonusXp, combo: config.combo });
        if (isNewDay && count >= 2) follow.push({ type: "streak", title: `Racha de ${count} días`, subtitle: usedFreeze ? "Tu día de descanso semanal salvó la racha. Vuelve mañana." : "Constancia que se nota. Vuelve mañana para mantenerla." });
        if (levelUp) follow.push({ type: "level_up", title: `Nivel ${levelUp}`, subtitle: `+${gained} XP. Sigues subiendo.` });
        unlocked.forEach((a) => follow.push({ type: "achievement", title: a.title, subtitle: `Logro desbloqueado · ${a.desc}` }));
      }
      if (!config.silent) enqueue(config);
      follow.forEach(enqueue);
    };

    window.addEventListener("usb:celebrate", handler);
    return () => {
      window.removeEventListener("usb:celebrate", handler);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      queueRef.current = [];
      busyRef.current = false;
    };
  }, []);

  const cfg = current ? TYPE_CFG[current.type] : null;
  const accent = current ? ACCENT[current.type] : "#6d4aff";

  return (
    <AnimatePresence>
      {visible && current && cfg && (
        <motion.div
          key={nonce}
          role="status"
          aria-live="polite"
          className="kx-celebrate absolute top-[76px] left-4 right-4 z-[999998] pointer-events-none mx-auto max-w-[380px]"
          initial={{ opacity: 0, y: -18, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.3 } }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          <div
            className="relative overflow-hidden rounded-2xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-4 py-3.5 flex items-center gap-3.5"
            style={{ boxShadow: isSepia ? "0 1px 2px rgba(60,40,10,.06), 0 18px 40px -16px rgba(60,40,10,.30)" : "0 1px 2px rgba(0,0,0,.10), 0 18px 44px -14px rgba(0,0,0,.65)" }}
          >
            <span className="absolute left-4 right-4 top-0 h-[2px] rounded-b" style={{ background: accent, opacity: 0.85 }} aria-hidden="true" />
            <motion.div
              className="kx-celebrate-tile shrink-0 h-11 w-11 rounded-2xl flex items-center justify-center border"
              style={{
                background: `color-mix(in srgb, ${accent} 18%, var(--usb-bg-3))`,
                borderColor: `color-mix(in srgb, ${accent} 42%, var(--usb-border))`,
                color: accent,
              }}
              initial={{ scale: 0.4, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 14, delay: 0.08 }}
            >
              {current.icon ?? DEFAULT_ICON[current.type]}
            </motion.div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold leading-tight tracking-tight text-[var(--usb-fg-hi)]">
                {current.title}
              </p>
              {current.subtitle && (
                <p className="text-[11.5px] font-medium leading-snug mt-0.5 text-[var(--usb-fg-mid)]">
                  {current.subtitle}
                </p>
              )}
            </div>
            <motion.span
              className="absolute left-0 bottom-0 h-[2.5px] origin-left"
              style={{ background: accent, width: "100%" }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: cfg.duration / 1000, ease: "linear" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
