import { getStreak } from "./streak";

export interface Achievement { 
  id: string; 
  title: string; 
  desc: string; 
  icon: "star" | "target" | "award" | "flame" | "book" | "trend" | "zap" | "trophy";
  category?: "streak" | "mastery" | "practice" | "export";
  progressMax?: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first", title: "Primer paso", desc: "Responde tu primera pregunta", icon: "star", category: "practice", progressMax: 1 },
  { id: "c25", title: "Buen pulso", desc: "25 respuestas correctas", icon: "target", category: "practice", progressMax: 25 },
  { id: "c100", title: "Precisión", desc: "100 respuestas correctas", icon: "award", category: "practice", progressMax: 100 },
  { id: "combo3", title: "En la zona", desc: "Consigue una racha de combo de 3 respuestas seguidas", icon: "zap", category: "practice", progressMax: 3 },
  { id: "code1", title: "Ingeniero Activo", desc: "Resuelve tu primer reto de código", icon: "trophy", category: "mastery", progressMax: 1 },
  { id: "s1", title: "Lección dominada", desc: "Completa una lección de estudio", icon: "book", category: "mastery", progressMax: 1 },
  { id: "s10", title: "Constante", desc: "Completa 10 lecciones", icon: "book", category: "mastery", progressMax: 10 },
  { id: "e1", title: "Coleccionista", desc: "Exporta tus tarjetas a Anki u Obsidian", icon: "award", category: "export", progressMax: 1 },
  { id: "k3", title: "Racha de 3", desc: "3 días seguidos de estudio", icon: "flame", category: "streak", progressMax: 3 },
  { id: "k7", title: "Racha de 7", desc: "Una semana seguida de estudio", icon: "flame", category: "streak", progressMax: 7 },
  { id: "l5", title: "Estudiante Focado", desc: "Alcanza el rango Estudiante Focado (nivel 5)", icon: "trend", category: "mastery", progressMax: 5 },
  { id: "l10", title: "Gran Maestro", desc: "Alcanza el rango Gran Maestro (nivel 10)", icon: "trend", category: "mastery", progressMax: 10 },
];

export interface MasteryTier {
  name: string;
  minLevel: number;
  badge: string;
  color: string;
}

export const MASTERY_TIERS: MasteryTier[] = [
  { name: "Iniciado", minLevel: 1, badge: "🌱", color: "#10b981" },
  { name: "Aprendiz Diligente", minLevel: 3, badge: "⚡", color: "#06b6d4" },
  { name: "Estudiante Focado", minLevel: 5, badge: "🔮", color: "#8b5cf6" },
  { name: "Especialista", minLevel: 8, badge: "💎", color: "#ec4899" },
  { name: "Gran Maestro", minLevel: 10, badge: "👑", color: "#f59e0b" },
];

export function getMasteryTier(level: number): MasteryTier {
  for (let i = MASTERY_TIERS.length - 1; i >= 0; i--) {
    if (level >= MASTERY_TIERS[i].minLevel) {
      return MASTERY_TIERS[i];
    }
  }
  return MASTERY_TIERS[0];
}

interface State {
  xp: number;
  correct: number;
  sessions: number;
  exports: number;
  codeChallenges: number;
  bestCombo: number;
  unlocked: string[];
  days: Record<string, number>;
  dailyGoalXp: number;
}

const KEY = "kinema-progress";
const XP: Record<string, number> = { 
  concept_ack: 2, 
  question_correct: 10, 
  question_combo: 5, 
  code_challenge: 50, 
  session_complete: 50, 
  export_done: 25, 
  anki_export: 30 
};

const empty = (): State => ({ 
  xp: 0, 
  correct: 0, 
  sessions: 0, 
  exports: 0, 
  codeChallenges: 0,
  bestCombo: 0,
  unlocked: [], 
  days: {},
  dailyGoalXp: 50,
});

const read = (): State => {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return empty(); }
};

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export const levelOf = (xp: number) => Math.floor(Math.sqrt(xp / 60)) + 1;
const floorXp = (level: number) => 60 * (level - 1) ** 2;

export function getProgress() {
  const s = read();
  const level = levelOf(s.xp);
  const from = floorXp(level);
  const to = floorXp(level + 1);
  const tier = getMasteryTier(level);
  const todayXp = s.days[dayKey()] || 0;
  const dailyGoalXp = s.dailyGoalXp || 50;
  const dailyGoalPct = Math.min(100, Math.round((todayXp / dailyGoalXp) * 100));

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { label: d.toLocaleDateString("es", { weekday: "narrow" }).toUpperCase(), xp: s.days[dayKey(d)] || 0, today: i === 6 };
  });

  const today = new Date();
  const offset = (today.getDay() + 6) % 7;
  const history = Array.from({ length: 35 }, (_, i) => {
    const d = new Date();
    d.setDate(today.getDate() + (6 - offset) - (34 - i));
    return { xp: s.days[dayKey(d)] || 0, future: d > today && dayKey(d) !== dayKey(today), today: dayKey(d) === dayKey(today), label: d.toLocaleDateString("es", { day: "numeric", month: "short" }) };
  });

  return {
    xp: s.xp, level, tier, into: s.xp - from, span: to - from,
    history, week, weekXp: week.reduce((a, b) => a + b.xp, 0),
    todayXp, dailyGoalXp, dailyGoalPct,
    unlocked: s.unlocked, correct: s.correct, sessions: s.sessions,
    exports: s.exports, codeChallenges: s.codeChallenges, bestCombo: s.bestCombo,
  };
}

export function recordActivity(type: string, meta?: { combo?: number; bonus?: number }): { gained: number; levelUp: number | null; unlocked: Achievement[] } {
  const base = XP[type];
  if (!base) return { gained: 0, levelUp: null, unlocked: [] };
  const gain = base + Math.max(0, Math.round(meta?.bonus ?? 0));
  const s = read();
  const before = levelOf(s.xp);
  s.xp += gain;
  s.days[dayKey()] = (s.days[dayKey()] || 0) + gain;
  if (type === "question_correct") s.correct++;
  if (type === "session_complete") s.sessions++;
  if (type === "code_challenge") s.codeChallenges = (s.codeChallenges || 0) + 1;
  if (type === "export_done" || type === "anki_export") s.exports++;
  if (meta?.combo && meta.combo > (s.bestCombo || 0)) {
    s.bestCombo = meta.combo;
  }
  const after = levelOf(s.xp);
  const streak = getStreak();
  const checks: Record<string, boolean> = {
    first: s.correct >= 1, 
    c25: s.correct >= 25, 
    c100: s.correct >= 100,
    combo3: (s.bestCombo || 0) >= 3 || (meta?.combo ?? 0) >= 3,
    code1: (s.codeChallenges || 0) >= 1,
    s1: s.sessions >= 1, 
    s10: s.sessions >= 10, 
    e1: s.exports >= 1,
    k3: streak >= 3, 
    k7: streak >= 7, 
    l5: after >= 5,
    l10: after >= 10,
  };
  const unlocked = ACHIEVEMENTS.filter((a) => checks[a.id] && !s.unlocked.includes(a.id));
  s.unlocked.push(...unlocked.map((a) => a.id));
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  window.dispatchEvent(new CustomEvent("usb:xp"));
  return { gained: gain, levelUp: after > before ? after : null, unlocked };
}

export function setDailyGoal(xp: number) {
  const s = read();
  s.dailyGoalXp = xp;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  window.dispatchEvent(new CustomEvent("usb:xp"));
}
