import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { X, Icon, type IconName } from "./icons";
import { ACHIEVEMENTS, getProgress, setDailyGoal, MASTERY_TIERS } from "../services/progress";
import { getStreak } from "../services/streak";
import { useDockTheme } from "../contexts/ThemeContext";

const ICON: Record<string, IconName> = {
  star: "star", target: "target", award: "award", flame: "flame",
  book: "bookOpen", trend: "trendingUp", zap: "zap", trophy: "trophy",
};

// Marca = violeta. Ámbar = racha/logros. Verde = éxito/constancia.
const TONES = {
  violet: { hue: "#6d4aff", dark: "#b7a6ff", light: "#5b37e8" },
  amber:  { hue: "#d97706", dark: "#fbbf45", light: "#a15207" },
  green:  { hue: "#059669", dark: "#4ade9f", light: "#047857" },
} as const;
type Tone = keyof typeof TONES;

const TIER_ICON: IconName[] = ["star", "zap", "target", "award", "trophy"];
const GOALS = [30, 50, 100, 150];
const EASE = [0.22, 1, 0.36, 1] as const;
const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "practice", label: "Práctica" },
  { id: "mastery", label: "Maestría" },
  { id: "streak", label: "Racha" },
  { id: "export", label: "Exportación" },
] as const;

const tint = (hue: string, pct: number, base = "var(--usb-bg-3)") => `color-mix(in srgb, ${hue} ${pct}%, ${base})`;

type Prog = ReturnType<typeof getProgress>;
function achValue(id: string, p: Prog, streak: number): number {
  switch (id) {
    case "first": case "c25": case "c100": return p.correct;
    case "combo3": return p.bestCombo || 0;
    case "code1": return p.codeChallenges || 0;
    case "s1": case "s10": return p.sessions;
    case "e1": return p.exports || 0;
    case "k3": case "k7": return streak;
    case "l5": case "l10": return p.level;
    default: return 0;
  }
}

function useCountUp(target: number, ms = 800) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(a + (target - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const ShownCtx = createContext(true);
const useShown = () => useContext(ShownCtx);

function Reveal({ i = 0, lift = false, className = "", style, children }: { i?: number; lift?: boolean; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      whileHover={lift ? { y: -2 } : undefined}
      transition={{ duration: 0.45, ease: EASE, delay: inView ? 0.05 * Math.min(i, 3) : 0 }}
      className={className}
      style={style}
    >
      <ShownCtx.Provider value={inView}>{children}</ShownCtx.Provider>
    </motion.section>
  );
}

function StatNum({ value, suffix = "" }: { value: number; suffix?: string }) {
  const shown = useShown();
  const n = useCountUp(shown ? value : 0, 900);
  return <>{n}{suffix}</>;
}

function Grow({ from, to, ...rest }: { from: Record<string, any>; to: Record<string, any> } & Omit<React.ComponentProps<typeof motion.span>, "initial" | "animate">) {
  const shown = useShown();
  return <motion.span {...rest} initial={from} animate={shown ? to : from} />;
}

function RankNode({ i, current, children }: { i: number; current: boolean; children: React.ReactNode }) {
  const shown = useShown();
  return (
    <span className="relative">
      {current && shown && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: TONES.violet.hue }}
          initial={{ scale: 1, opacity: 0.45 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.9 }}
        />
      )}
      <motion.span
        className="relative block"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={shown ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
        whileHover={{ scale: 1.1 }}
        transition={{ type: "spring", stiffness: 340, damping: 16, delay: 0.1 + 0.09 * i }}
      >
        {children}
      </motion.span>
    </span>
  );
}

function Tile({ icon, tone, size = 30 }: { icon: IconName; tone: Tone; size?: number }) {
  const { t } = useDockTheme();
  const c = TONES[tone];
  return (
    <span
      className="rounded-xl flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: tint(c.hue, 16), color: t(c.dark, c.light) }}
    >
      <Icon name={icon} size={Math.round(size * 0.55)} weight="fill" />
    </span>
  );
}

function Card({ i, tone, icon, title, right, children }: { i: number; tone: Tone; icon: IconName; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Reveal
      i={i}
      lift
      className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-2xl p-4 pt-5 space-y-4"
      style={{ ["--kx-step" as string]: TONES[tone].hue }}
    >
      <div className="flex items-center gap-2.5">
        <Tile icon={icon} tone={tone} size={28} />
        <h4 className="flex-1 text-[13px] font-bold tracking-tight text-[var(--usb-fg-hi)]">{title}</h4>
        {right}
      </div>
      {children}
    </Reveal>
  );
}

function Ring({ pct, level }: { pct: number; level: number }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className="relative w-[104px] h-[104px] shrink-0" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso al siguiente nivel">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" stroke="rgba(255,255,255,0.22)" />
        <motion.circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="8" strokeLinecap="round" stroke="#fff"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="kx-hero-t2 kx-slate">Nivel</span>
        <span className="kx-hero-t1 text-[34px] leading-none mt-1 font-extrabold tabular-nums tracking-tight">{level}</span>
      </div>
    </div>
  );
}

export function ProgressPanel({ onClose }: { onClose: () => void }) {
  const { t } = useDockTheme();
  const [, tick] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  useEffect(() => {
    const h = () => tick((n) => n + 1);
    window.addEventListener("usb:xp", h);
    return () => window.removeEventListener("usb:xp", h);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const p = getProgress();
  const streak = getStreak();
  const pct = Math.min(100, Math.round((p.into / p.span) * 100));
  const scale = Math.max(1, ...p.week.map((d) => d.xp), p.dailyGoalXp);
  const goalDone = p.dailyGoalPct >= 100;
  const tierIdx = Math.max(0, MASTERY_TIERS.findIndex((x) => x.name === p.tier.name));
  const nextTier = MASTERY_TIERS[tierIdx + 1];
  const levelsToNext = nextTier ? nextTier.minLevel - p.level : 0;
  const rankPct = nextTier ? Math.round(((p.level - p.tier.minLevel + pct / 100) / (nextTier.minLevel - p.tier.minLevel)) * 100) : 100;
  const toLevel = Math.max(0, p.span - p.into);
  const xpNow = useCountUp(p.into);
  const nextGoal = GOALS[(GOALS.indexOf(p.dailyGoalXp) + 1) % GOALS.length];
  const amberInk = t(TONES.amber.dark, TONES.amber.light);

  const msg = goalDone
    ? { icon: "checkCircle2" as IconName, text: "Meta cumplida. Cada XP extra te acerca al siguiente nivel." }
    : toLevel <= 25
    ? { icon: "zap" as IconName, text: `Estás a ${toLevel} XP del nivel ${p.level + 1}. Una pregunta más.` }
    : streak > 0
    ? { icon: "flame" as IconName, text: `Racha de ${streak} ${streak === 1 ? "día" : "días"}. Estudia hoy para mantenerla.` }
    : { icon: "target" as IconName, text: "Responde una pregunta hoy y empieza tu racha." };

  const shownAchievements = ACHIEVEMENTS
    .filter((a) => selectedFilter === "all" || a.category === selectedFilter)
    .map((a) => {
      const max = a.progressMax || 1;
      const on = p.unlocked.includes(a.id);
      const v = on ? max : Math.min(max, achValue(a.id, p, streak));
      return { a, on, v, max };
    })
    .sort((x, y) => Number(y.on) - Number(x.on) || y.v / y.max - x.v / x.max);

  const pastDays = p.history.filter((d) => !d.future);
  const activeDays = pastDays.filter((d) => d.xp > 0).length;
  let bestRun = 0, run = 0;
  for (const d of pastDays) { run = d.xp > 0 ? run + 1 : 0; bestRun = Math.max(bestRun, run); }
  bestRun = Math.max(bestRun, streak);
  const avg = Math.round(p.weekXp / 7);

  const stats = [
    { v: streak, s: "d", l: "Racha", icon: "flame", tone: "amber" },
    { v: p.correct, s: "", l: "Aciertos", icon: "checkCircle2", tone: "green" },
    { v: p.codeChallenges || 0, s: "", l: "Retos", icon: "trophy", tone: "violet" },
    { v: p.sessions, s: "", l: "Lecciones", icon: "bookOpen", tone: "violet" },
  ] as { v: number; s: string; l: string; icon: IconName; tone: Tone }[];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="kx-page absolute inset-x-0 top-[41px] bottom-0 z-40 overflow-y-auto bg-[var(--usb-bg-2)] border-t border-[var(--usb-border)] custom-scrollbar"
      role="region"
      aria-label="Tu progreso"
    >
      <div className="kx-cap px-4 py-5 space-y-4">
        <div className="sticky top-0 z-10 -mx-4 -mt-5 px-4 pt-5 pb-3 flex items-center gap-3 backdrop-blur-md bg-[color-mix(in_srgb,var(--usb-bg-2)_88%,transparent)]">
          <div className="min-w-0 flex-1">
            <span className="kx-slate block" style={{ color: t(TONES.violet.dark, TONES.violet.light) }}>Tu progreso</span>
            <h3 className="mt-1 text-[16px] font-extrabold tracking-tight leading-tight text-[var(--usb-fg-hi)] truncate">
              Nivel {p.level} · {p.tier.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Hero */}
        <Reveal i={0} className="kx-hero-solid relative overflow-hidden rounded-2xl p-4 space-y-4">
          <span className="kx-ring kx-ring-1" aria-hidden="true" />
          <div className="relative flex items-center gap-4">
            <Ring pct={pct} level={p.level} />
            <div className="min-w-0 flex-1 space-y-2">
              <span className="kx-hero-chip inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full" title="Tu rango se desbloquea al alcanzar cierto nivel">
                <Icon name={TIER_ICON[tierIdx]} size={12} weight="fill" />
                {p.tier.name}
              </span>
              <span className="kx-hero-t2 ml-1.5 text-[11px] font-semibold tabular-nums">{p.xp} XP totales</span>
              <p className="kx-hero-t1 flex items-baseline gap-1.5 tabular-nums">
                <span className="text-[26px] leading-none font-extrabold tracking-tight">{xpNow}</span>
                <span className="kx-hero-t2 text-[12.5px] font-semibold">/ {p.span} XP</span>
              </p>
              <p className="kx-hero-t2 text-[11.5px] leading-snug">{toLevel} XP para el nivel {p.level + 1}</p>
            </div>
          </div>

          <div className="relative space-y-1.5">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="kx-hero-t1 font-semibold">Meta del día</span>
              <span className="kx-hero-t2 inline-flex items-center gap-2 tabular-nums">
                <span><strong className="kx-hero-t1">{p.todayXp}</strong> / {p.dailyGoalXp} XP</span>
                <button
                  type="button"
                  onClick={() => setDailyGoal(nextGoal)}
                  title={`Cambiar meta a ${nextGoal} XP`}
                  aria-label={`Cambiar meta diaria a ${nextGoal} XP`}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 kx-hero-chip h-5 px-1.5 rounded-md text-[10px] font-semibold hover:brightness-125 transition"
                >
                  Cambiar
                </button>
              </span>
            </div>
            <div className="relative h-2 rounded-full overflow-hidden bg-white/20" role="progressbar" aria-valuenow={p.dailyGoalPct} aria-valuemin={0} aria-valuemax={100} aria-label="Meta del día">
              <motion.div
                className="h-full rounded-full"
                style={{ background: goalDone ? "#86efac" : "#fff" }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, p.dailyGoalPct)}%` }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
              />
              {p.dailyGoalPct > 0 && (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                  initial={{ left: "-25%" }}
                  animate={{ left: "125%" }}
                  transition={{ duration: 1.1, ease: "easeInOut", delay: 1.3 }}
                />
              )}
            </div>
          </div>

          <div className="kx-hero-chip relative flex items-center gap-2.5 rounded-xl px-3 py-2.5">
            <Icon name={msg.icon} size={15} weight="fill" />
            <p className="text-[12px] leading-snug font-medium">{msg.text}</p>
          </div>
        </Reveal>

        {/* Estadísticas */}
        <Reveal i={1} className="bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-2xl grid grid-cols-4 divide-x divide-[var(--usb-divider)]">
          {stats.map((x, i) => (
            <div key={x.l} className="group py-3.5 px-1 flex flex-col items-center gap-1.5 min-w-0">
              <motion.span
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.12, rotate: -6 }}
                transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.25 + 0.08 * i }}
              >
                <Tile icon={x.icon} tone={x.tone} size={30} />
              </motion.span>
              <p className="text-[19px] leading-none font-extrabold tabular-nums text-[var(--usb-fg-hi)]"><StatNum value={x.v} suffix={x.s} /></p>
              <p className="kx-slate truncate max-w-full text-[var(--usb-fg-mid)]">{x.l}</p>
            </div>
          ))}
        </Reveal>

        {/* Rangos */}
        <Card
          i={2} tone="violet" icon="trophy" title="Rangos"
          right={<span className="text-[11px] font-semibold text-[var(--usb-fg-mid)]">{nextTier ? `${levelsToNext} ${levelsToNext === 1 ? "nivel" : "niveles"} para ${nextTier.name}` : "Rango máximo"}</span>}
        >
          <ol className="relative grid grid-cols-5 gap-1">
            <span aria-hidden className="absolute left-[10%] right-[10%] top-[17px] h-[2px] rounded-full bg-[var(--usb-border)]" />
            <Grow
              aria-hidden
              className="absolute left-[10%] top-[17px] h-[2px] rounded-full"
              style={{ background: TONES.violet.hue }}
              from={{ width: 0 }}
              to={{ width: `${(tierIdx / (MASTERY_TIERS.length - 1)) * 80}%` }}
              transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
            />
            {MASTERY_TIERS.map((x, i) => {
              const reached = p.level >= x.minLevel;
              const current = i === tierIdx;
              return (
                <li key={x.name} className="relative flex flex-col items-center text-center gap-1.5 min-w-0" aria-current={current ? "step" : undefined}>
                  <RankNode i={i} current={current}>
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center border-2"
                    style={{
                      background: current ? TONES.violet.hue : reached ? tint(TONES.violet.hue, 16) : "var(--usb-bg-2)",
                      borderColor: reached ? TONES.violet.hue : "var(--usb-border)",
                      color: current ? "#fff" : reached ? t(TONES.violet.dark, TONES.violet.light) : "var(--usb-fg-lo)",
                      boxShadow: current ? `0 0 0 4px ${tint(TONES.violet.hue, 22, "transparent")}` : undefined,
                    }}
                  >
                    <Icon name={reached ? TIER_ICON[i] : "lock"} size={16} weight={reached ? "fill" : "regular"} />
                  </span>
                  </RankNode>
                  <div className="min-w-0 w-full">
                    <p className={`text-[10.5px] leading-tight font-bold break-words ${reached ? "text-[var(--usb-fg-hi)]" : "text-[var(--usb-fg-mid)]"}`}>{x.name}</p>
                    <span className="text-[10px] tabular-nums text-[var(--usb-fg-mid)]">{current ? `Tú · Nv. ${p.level}` : `Nv. ${x.minLevel}`}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          {nextTier && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[10.5px] font-semibold text-[var(--usb-fg-mid)]">
                <span>{p.tier.name}</span>
                <span>{nextTier.name}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: tint(TONES.violet.hue, 14) }} role="progressbar" aria-valuenow={rankPct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso al siguiente rango">
                <Grow className="block h-full rounded-full" style={{ background: TONES.violet.hue }} from={{ width: 0 }} to={{ width: `${rankPct}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.5 }} />
              </div>
            </div>
          )}
        </Card>

        {/* Actividad */}
        <Card
          i={3} tone="violet" icon="barChart2" title="Actividad"
          right={<span className="text-[11px] font-semibold text-[var(--usb-fg-mid)]"><strong className="text-[var(--usb-fg-hi)] tabular-nums">{p.weekXp} XP</strong> · prom. {avg}/día</span>}
        >
          {p.weekXp === 0 && (
            <p className="text-[11.5px] text-[var(--usb-fg-mid)]">Aún no hay actividad esta semana. Tu primera respuesta enciende la barra de hoy.</p>
          )}
          <div className="relative h-[120px]">
            <div
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed pointer-events-none"
              style={{ bottom: `${(p.dailyGoalXp / scale) * 88}%`, borderColor: tint(TONES.amber.hue, 70, "transparent") }}
            />
            <div className="absolute inset-0 flex items-end gap-2">
              {p.week.map((d, i) => {
                const hit = d.xp >= p.dailyGoalXp;
                return (
                  <div key={i} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${d.xp} XP`}>
                    <span className={`text-[10px] tabular-nums leading-none ${d.xp ? "font-semibold text-[var(--usb-fg-mid)]" : "text-transparent"}`}>{d.xp}</span>
<Grow
                      className="block w-full rounded-md origin-bottom hover:brightness-110 transition"
                      style={{ background: d.xp ? (hit ? TONES.green.hue : TONES.violet.hue) : "var(--usb-border)", opacity: d.xp && !d.today ? 0.6 : 1 }}
                      from={{ height: 0 }}
                      to={{ height: d.xp ? `${Math.max(6, (d.xp / scale) * 88)}%` : 4 }}
                      transition={{ duration: 0.7, ease: EASE, delay: 0.1 + 0.05 * i }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            {p.week.map((d, i) => (
              <span
                key={i}
                className={`flex-1 text-center text-[11px] rounded-md py-0.5 ${d.today ? "font-bold text-[var(--usb-fg-hi)]" : "font-medium text-[var(--usb-fg-mid)]"}`}
                style={d.today ? { background: tint(TONES.violet.hue, 16) } : undefined}
              >
                {d.label}
              </span>
            ))}
          </div>
          <p className="flex items-center gap-3 text-[10.5px] text-[var(--usb-fg-mid)]">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: TONES.violet.hue }} />Activo</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: TONES.green.hue }} />Meta cumplida</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed" style={{ borderColor: TONES.amber.hue }} />Meta</span>
          </p>
        </Card>

        {/* Constancia */}
        <Card
          i={4} tone="green" icon="flame" title="Constancia"
          right={<span className="text-[11px] font-semibold text-[var(--usb-fg-mid)]"><strong className="text-[var(--usb-fg-hi)] tabular-nums">{activeDays}</strong> días · mejor racha {bestRun}d</span>}
        >
          <div>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
                <span key={i} className="text-center text-[10px] font-semibold text-[var(--usb-fg-mid)]">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {p.history.map((d, i) => {
                const lvl = d.xp === 0 ? 0 : d.xp < p.dailyGoalXp * 0.5 ? 1 : d.xp < p.dailyGoalXp ? 2 : 3;
                return (
<Grow
                    key={i}
                    title={d.future ? "" : `${d.label}: ${d.xp} XP`}
                    className="block h-6 w-full rounded-md hover:scale-110 transition-transform"
                    style={{
                      background: lvl ? tint(TONES.green.hue, [0, 32, 60, 100][lvl], "var(--usb-bg-3)") : "var(--usb-border)",
                      outline: d.today ? `2px solid ${TONES.green.hue}` : undefined,
                      outlineOffset: 1,
                    }}
                    from={{ opacity: 0, scale: 0.5 }}
                    to={{ opacity: d.future ? 0.2 : 1, scale: 1 }}
                    transition={{ duration: 0.35, ease: EASE, delay: 0.015 * (i % 7) + 0.04 * Math.floor(i / 7) }}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-[var(--usb-fg-mid)]">
            <span>{activeDays === 0 ? "Estudia hoy para marcar tu primer día." : `${Math.round((activeDays / pastDays.length) * 100)}% de los últimos ${pastDays.length} días`}</span>
            <span className="inline-flex items-center gap-1.5">
              Menos
              {[0, 32, 60, 100].map((v) => (
                <span key={v} className="w-3 h-3 rounded-[4px]" style={{ background: v ? tint(TONES.green.hue, v) : "var(--usb-border)" }} />
              ))}
              Más
            </span>
          </div>
        </Card>

        {/* Logros */}
        <Card
          i={5} tone="amber" icon="award" title="Logros"
          right={<span className="text-[12px] font-extrabold tabular-nums text-[var(--usb-fg-hi)]">{p.unlocked.length} <span className="text-[var(--usb-fg-mid)] font-semibold">/ {ACHIEVEMENTS.length}</span></span>}
        >
          <div role="tablist" aria-label="Categoría de logros" className="flex items-center gap-1 p-1 rounded-xl bg-[var(--usb-bg-2)] border border-[var(--usb-border)] overflow-x-auto custom-scrollbar">
            {FILTERS.map((f) => {
              const active = selectedFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedFilter(f.id)}
                  className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 flex-1 px-2.5 h-7 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors border ${
                    active ? "text-white border-transparent" : "text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] border-transparent"
                  }`}
                  style={active ? { background: TONES.violet.hue } : undefined}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {[
            { label: "Desbloqueados", items: shownAchievements.filter((x) => x.on) },
            { label: "Por desbloquear", items: shownAchievements.filter((x) => !x.on) },
          ].filter((g) => g.items.length > 0).map((g) => (
            <div key={g.label} className="space-y-2">
              <span className="kx-slate block text-[var(--usb-fg-mid)]">{g.label} · {g.items.length}</span>
              <div className="grid grid-cols-2 gap-2.5">
                {g.items.map(({ a, on, v, max }, gi) => (
                  <motion.div
                    key={a.id}
                    title={a.desc}
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.35, ease: EASE, delay: 0.04 * (gi % 6) }}
                    className="rounded-xl p-3 flex flex-col gap-2 border"
                    style={on ? { background: tint(TONES.amber.hue, 9), borderColor: tint(TONES.amber.hue, 30, "var(--usb-border)") } : { background: "var(--usb-bg-2)", borderColor: "var(--usb-border)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                        style={on ? { background: tint(TONES.amber.hue, 22), color: amberInk } : { background: "var(--usb-bg-3)", color: "var(--usb-fg-lo)" }}
                      >
                        <Icon name={on ? ICON[a.icon] || "star" : "lock"} size={16} weight={on ? "fill" : "regular"} />
                      </span>
                      <p className={`flex-1 min-w-0 text-[12px] font-bold leading-tight ${on ? "text-[var(--usb-fg-hi)]" : "text-[var(--usb-fg-mid)]"}`}>{a.title}</p>
                      {on && (
                        <motion.span style={{ color: amberInk }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 14, delay: 0.25 + 0.04 * (gi % 6) }}>
                          <Icon name="checkCircle2" size={15} weight="fill" />
                        </motion.span>
                      )}
                    </div>
                    <p className="text-[10.5px] leading-snug text-[var(--usb-fg-mid)] line-clamp-2">{a.desc}</p>
                    {!on && (
                      <div className="flex items-center gap-2">
                        <div className="h-1 flex-1 rounded-full bg-[var(--usb-border)] overflow-hidden">
                          <Grow className="block h-full rounded-full" style={{ background: v / max >= 0.5 ? TONES.amber.hue : TONES.violet.hue }} from={{ width: 0 }} to={{ width: `${(v / max) * 100}%` }} transition={{ duration: 0.7, ease: EASE, delay: 0.2 + 0.04 * (gi % 6) }} />
                        </div>
                        <span className="text-[10px] font-semibold tabular-nums text-[var(--usb-fg-mid)]">{v}/{max}</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </motion.div>
  );
}
