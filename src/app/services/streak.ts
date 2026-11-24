import {
  getStreakState, setStreakState, localDayKey, normalizeDayKey,
  LEGACY_STREAK_SHOWN_KEY,
} from './progressStore.ts';

const daysAgo = (n: number) => localDayKey(new Date(Date.now() - n * 86400000));

/** Un día de descanso por semana: perder un solo día no rompe la racha. */
function freezeAvailable(s: { freezeAt?: string }): boolean {
  if (!s.freezeAt) return true;
  const frozen = normalizeDayKey(s.freezeAt);
  if (!frozen) return true;
  for (let i = 0; i < 7; i++) if (frozen === daysAgo(i)) return false;
  return true;
}

export function streakFreezeAvailable(): boolean {
  return freezeAvailable(getStreakState());
}

export function getStreak(): number {
  const s = getStreakState();
  if (!s.last) return 0;
  if (s.last === localDayKey() || s.last === daysAgo(1)) return s.count;
  if (s.last === daysAgo(2) && freezeAvailable(s)) return s.count;
  return 0;
}

/** True si hoy ya se perdió un día y el descanso semanal está sosteniendo la racha. */
export function streakIsFrozen(): boolean {
  const s = getStreakState();
  return Boolean(s.last) && s.last === daysAgo(2) && freezeAvailable(s) && s.count > 0;
}

export function studiedToday(): boolean {
  return getStreakState().last === localDayKey();
}

export function getBestStreak(): number {
  const s = getStreakState();
  return Math.max(s.best || 0, getStreak());
}

const SHOWN_KEY = LEGACY_STREAK_SHOWN_KEY;
/** Se celebra una sola vez al día, aunque la racha se cuente desde la primera actividad. */
export function claimStreakCelebration(): { count: number; usedFreeze: boolean } | null {
  const s = getStreakState();
  const count = getStreak();
  if (count < 2 || s.last !== localDayKey()) return null;
  try {
    if (globalThis.localStorage?.getItem(SHOWN_KEY) === localDayKey()) return null;
    globalThis.localStorage?.setItem(SHOWN_KEY, localDayKey());
  } catch { return null; }
  const frozen = s.freezeAt ? normalizeDayKey(s.freezeAt) : null;
  return { count, usedFreeze: frozen === daysAgo(1) };
}

export function touchStreak(): { count: number; isNewDay: boolean; usedFreeze: boolean } {
  const s = getStreakState();
  const today = localDayKey();
  if (s.last === today) return { count: s.count, isNewDay: false, usedFreeze: false };
  let count = 1;
  let usedFreeze = false;
  let freezeAt = s.freezeAt;
  if (s.last === daysAgo(1)) count = s.count + 1;
  else if (s.last === daysAgo(2) && freezeAvailable(s)) { count = s.count + 1; usedFreeze = true; freezeAt = daysAgo(1); }
  setStreakState({ ...s, last: today, count, best: Math.max(s.best || 0, count), freezeAt });
  return { count, isNewDay: true, usedFreeze };
}
