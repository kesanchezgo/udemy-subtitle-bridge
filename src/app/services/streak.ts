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
