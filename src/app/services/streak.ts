const KEY = "kinema-streak";
interface State { last: string; count: number; best: number; freezeAt?: string }

const day = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return day(d); };
const read = (): State => {
  try { return JSON.parse(localStorage.getItem(KEY) || "") as State; } catch { return { last: "", count: 0, best: 0 }; }
};

/** Un día de descanso por semana: perder un solo día no rompe la racha. */
function freezeAvailable(s: State): boolean {
  if (!s.freezeAt) return true;
  for (let i = 0; i < 7; i++) if (s.freezeAt === daysAgo(i)) return false;
  return true;
}

export function getStreak(): number {
  const s = read();
  if (!s.last) return 0;
  if (s.last === day() || s.last === daysAgo(1)) return s.count;
  if (s.last === daysAgo(2) && freezeAvailable(s)) return s.count;
  return 0;
}

/** True si hoy ya se perdió un día y el descanso semanal está protegiendo la racha. */
export function streakIsFrozen(): boolean {
  const s = read();
  return s.last === daysAgo(2) && freezeAvailable(s) && s.count > 0;
}

/** ¿Hoy ya cuenta para la racha? (hubo actividad de estudio). */
export function studiedToday(): boolean {
  return read().last === day();
}

/** Mejor racha de siempre (no solo la de los últimos 35 días del calendario). */
export function getBestStreak(): number {
  const s = read();
  return Math.max(s.best || 0, getStreak());
}

const SHOWN_KEY = "kinema-streak-shown";
/**
 * La racha cuenta desde la PRIMERA actividad del día (responder ya estudia),
 * pero se celebra una sola vez al día y en el momento de cierre (lección o
 * exportación). Devuelve qué celebrar, o null si no toca.
 */
export function claimStreakCelebration(): { count: number; usedFreeze: boolean } | null {
  const s = read();
  const count = getStreak();
  if (count < 2 || s.last !== day()) return null;
  try {
    if (localStorage.getItem(SHOWN_KEY) === day()) return null;
    localStorage.setItem(SHOWN_KEY, day());
  } catch { return null; }
  return { count, usedFreeze: s.freezeAt === daysAgo(1) };
}

/** Registra actividad de hoy. Devuelve la racha y si hoy es un día nuevo. */
export function touchStreak(): { count: number; isNewDay: boolean; usedFreeze: boolean } {
  const s = read();
  const today = day();
  if (s.last === today) return { count: s.count, isNewDay: false, usedFreeze: false };
  let count = 1;
  let usedFreeze = false;
  let freezeAt = s.freezeAt;
  if (s.last === daysAgo(1)) count = s.count + 1;
  else if (s.last === daysAgo(2) && freezeAvailable(s)) { count = s.count + 1; usedFreeze = true; freezeAt = daysAgo(1); }
  try { localStorage.setItem(KEY, JSON.stringify({ last: today, count, best: Math.max(s.best || 0, count), freezeAt })); } catch {}
  window.dispatchEvent(new CustomEvent("usb:streak"));
  return { count, isNewDay: true, usedFreeze };
}
