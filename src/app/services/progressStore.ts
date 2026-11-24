/**
 * Almacén unificado de progreso, nivel/XP y racha para TODAS las plataformas.
 * En la extensión la fuente de verdad es chrome.storage.local (una sola copia
 * compartida por udemy.com, app.datacamp.com y master.dev); en preview se usa
 * localStorage como antes, con las mismas claves para no romper los arneses.
 */
import { chromeLocalStorage } from './chromeStorage.ts';
import { historyService } from './historyService.ts';

export const PROGRESS_KEY = 'usb_progress_v1';
export const STREAK_KEY = 'usb_streak_v1';
export const LEGACY_PROGRESS_KEY = 'kinema-progress';
export const LEGACY_STREAK_KEY = 'kinema-streak';
export const LEGACY_STREAK_SHOWN_KEY = 'kinema-streak-shown';
export const REWARDED_KEY = 'usb:rewarded-keys';

const COUNTERS = ['xp', 'correct', 'answered', 'improved', 'sessions', 'exports', 'codeChallenges', 'practiceAttempted', 'practiceCorrect'] as const;

export interface ProgressState {
  xp: number;
  correct: number;
  answered: number;
  improved: number;
  sessions: number;
  exports: number;
  codeChallenges: number;
  practiceAttempted: number;
  practiceCorrect: number;
  reinforced: number;
  finishedDays: Record<string, number>;
  recentFirstTry: boolean[];
  unlocked: string[];
  days: Record<string, number>;
  dailyGoalXp: number;
  originsMigrated?: Record<string, number>;
  rewardedKeys?: string[];
}

export interface StreakState {
  last: string;
  count: number;
  best: number;
  freezeAt?: string;
  celebratedAt?: string;
  originsMigrated?: Record<string, number>;
}

export const emptyProgress = (): ProgressState => ({
  xp: 0, correct: 0, answered: 0, improved: 0, sessions: 0, exports: 0,
  codeChallenges: 0, practiceAttempted: 0, practiceCorrect: 0, reinforced: 0,
  finishedDays: {}, recentFirstTry: [], unlocked: [], days: {}, dailyGoalXp: 50,
  originsMigrated: {}, rewardedKeys: [],
});
export const emptyStreak = (): StreakState => ({ last: '', count: 0, best: 0, originsMigrated: {} });

/** YYYY-MM-DD, con mes y día de dos dígitos. */
export function localDayKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Acepta el formato viejo `2026-4-5` y lo convierte a `2026-04-05`. */
export function normalizeDayKey(raw: string): string | null {
  const m = String(raw ?? '').trim().replace(/^"+|"+$/g, '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, da] = m;
  const month = Number(mo), day = Number(da);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Desplaza una fecha YYYY-MM-DD por días de calendario local (sin deriva por cambio horario DST). */
export function shiftDay(isoDay: string, deltaDays: number): string {
  const norm = normalizeDayKey(isoDay) ?? localDayKey();
  const [y, m, d] = norm.split('-').map(Number);
  return localDayKey(new Date(y, m - 1, d + deltaDays));
}

/** Diferencia exacta en días de calendario entre dos fechas YYYY-MM-DD (to - from). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = normalizeDayKey(fromIso);
  const b = normalizeDayKey(toIso);
  if (!a || !b) return 9999;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function hasExtensionStorage(): boolean {
  const api = globalThis as typeof globalThis & { chrome?: { storage?: { local?: unknown }; runtime?: { id?: string } } };
  return Boolean(api?.chrome?.storage?.local || api?.chrome?.runtime?.id);
}

let memProgress: ProgressState | null = null;
let memStreak: StreakState | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();
const hydrateHooks: Array<() => void> = [];
export function onHydrate(fn: () => void): () => void {
  hydrateHooks.push(fn);
  return () => { const i = hydrateHooks.indexOf(fn); if (i >= 0) hydrateHooks.splice(i, 1); };
}

const legacyGet = (key: string): unknown => {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const legacySet = (key: string, value: unknown) => {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
};

function normalizeDays(input: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    const day = normalizeDayKey(key);
    if (day) out[day] = Math.max(out[day] ?? 0, Number(value) || 0);
  }
  return out;
}

function normalizeProgress(raw: Partial<ProgressState> | null): ProgressState {
  const base = emptyProgress();
  if (!raw) return base;
  const days = normalizeDays(raw.days);
  return {
    ...base, ...raw,
    days,
    finishedDays: normalizeDays(raw.finishedDays),
    unlocked: Array.isArray(raw.unlocked) ? [...new Set(raw.unlocked)] : [],
    recentFirstTry: Array.isArray(raw.recentFirstTry) ? raw.recentFirstTry.slice(-20) : [],
    originsMigrated: raw.originsMigrated ?? {},
    rewardedKeys: Array.isArray(raw.rewardedKeys) ? raw.rewardedKeys.slice(-800) : [],
    dailyGoalXp: raw.dailyGoalXp || 50,
  };
}
function normalizeStreak(raw: Partial<StreakState> | null): StreakState {
  const base = emptyStreak();
  if (!raw) return base;
  return {
    ...base, ...raw,
    last: normalizeDayKey(raw.last ?? '') ?? '',
    freezeAt: raw.freezeAt ? (normalizeDayKey(raw.freezeAt) ?? undefined) : undefined,
    celebratedAt: raw.celebratedAt ? (normalizeDayKey(raw.celebratedAt) ?? undefined) : undefined,
    originsMigrated: raw.originsMigrated ?? {},
  };
}

export function getProgressState(): ProgressState {
  if (hasExtensionStorage()) return memProgress ?? emptyProgress();
  // Preview/tests: siempre leer de localStorage para ver cambios directos de la page.
  const raw = legacyGet(LEGACY_PROGRESS_KEY) as Partial<ProgressState> | null;
  const rewarded = legacyGet(REWARDED_KEY);
  const merged = normalizeProgress(raw);
  if (Array.isArray(rewarded)) merged.rewardedKeys = [...new Set([...merged.rewardedKeys, ...rewarded.slice(-800)])].slice(-800);
  memProgress = merged;
  return merged;
}
export function getStreakState(): StreakState {
  if (hasExtensionStorage()) return memStreak ?? emptyStreak();
  const raw = legacyGet(LEGACY_STREAK_KEY) as Partial<StreakState> | null;
  const normalized = normalizeStreak(raw);
  const shown = normalizeDayKey(String(globalThis.localStorage?.getItem(LEGACY_STREAK_SHOWN_KEY) ?? ''));
  if (shown && !normalized.celebratedAt) normalized.celebratedAt = shown;
  memStreak = normalized;
  return normalized;
}

export function emitXp() {
  try { globalThis.dispatchEvent?.(new CustomEvent('usb:xp')); } catch { /* sin window */ }
}
export function emitStreak() {
  try { globalThis.dispatchEvent?.(new CustomEvent('usb:streak')); } catch { /* sin window */ }
}

function persist(items: Record<string, unknown>) {
  const snapshot = JSON.parse(JSON.stringify(items));
  writeQueue = writeQueue.then(async () => {
    if (hasExtensionStorage()) {
      try { await chromeLocalStorage.set(snapshot); } catch { /* storage ausente */ }
    } else {
      for (const [key, value] of Object.entries(snapshot)) legacySet(key, value);
    }
  }).catch(() => undefined);
}

export function setProgressState(next: ProgressState, emit = true) {
  const normalized = normalizeProgress(next);
  if (hasExtensionStorage()) {
    memProgress = normalized;
    persist({ [PROGRESS_KEY]: normalized });
  } else {
    legacySet(LEGACY_PROGRESS_KEY, normalized);
    legacySet(REWARDED_KEY, normalized.rewardedKeys);
  }
  if (emit) emitXp();
}
export function setStreakState(next: StreakState, emit = true) {
  const normalized = normalizeStreak(next);
  if (hasExtensionStorage()) {
    memStreak = normalized;
    persist({ [STREAK_KEY]: normalized });
  } else {
    legacySet(LEGACY_STREAK_KEY, normalized);
    if (normalized.celebratedAt) {
      try { globalThis.localStorage?.setItem(LEGACY_STREAK_SHOWN_KEY, normalized.celebratedAt); } catch { /* ignore */ }
    }
  }
  if (emit) emitStreak();
}

export function claimRewardKey(key: string): boolean {
  const s = getProgressState();
  const seen = s.rewardedKeys ?? [];
  if (seen.includes(key)) return false;
  s.rewardedKeys = [...seen, key].slice(-800);
  setProgressState(s, false);
  return true;
}

/** Racha vigente aplicando exactamente un día de descanso semanal por ventana de 7 días. */
export function recomputeStreakFromDays(days: Record<string, number>, prev: StreakState, today = localDayKey()): StreakState {
  const normDays = normalizeDays(days);
  const active = Object.keys(normDays).filter((d) => Number(normDays[d]) > 0 && daysBetween(d, today) >= 0);
  const prevLast = normalizeDayKey(prev.last ?? '');
  if (prevLast && daysBetween(prevLast, today) >= 0) active.push(prevLast);
  const sorted = [...new Set(active)].sort();
  if (!sorted.length) return { ...prev, count: 0, best: Math.max(prev.best || 0, 0) };

  let best = prev.best || 0;
  let run = 0;
  let freezeAt: string | undefined = undefined;
  let previous: string | null = null;
  for (const day of sorted) {
    if (!previous) {
      run = 1;
    } else {
      const gap = daysBetween(previous, day);
      if (gap === 1) {
        run += 1;
      } else if (gap === 2) {
        const missedDay = shiftDay(previous, 1);
        if (!freezeAt || daysBetween(freezeAt, missedDay) >= 7) {
          run += 1;
          freezeAt = missedDay;
        } else {
          run = 1;
        }
      } else if (gap > 2) {
        run = 1;
      }
    }
    best = Math.max(best, run);
    previous = day;
  }

  const lastActive = sorted[sorted.length - 1];
  const gapToToday = daysBetween(lastActive, today);
  if (prevLast && prevLast === lastActive && (prev.count || 0) > run && gapToToday <= 2) {
    run = prev.count;
    best = Math.max(best, run);
  }
  if (prev.freezeAt) {
    const prevFreeze = normalizeDayKey(prev.freezeAt);
    if (prevFreeze && (!freezeAt || prevFreeze > freezeAt) && daysBetween(prevFreeze, today) >= 0 && daysBetween(prevFreeze, today) < 7) {
      freezeAt = prevFreeze;
    }
  }
  return { ...prev, last: lastActive, count: run, best: Math.max(best, run), freezeAt };
}

function addDaysMap(target: Record<string, number>, source: Record<string, number>) {
  for (const [day, xp] of Object.entries(normalizeDays(source))) target[day] = (target[day] ?? 0) + xp;
}

/** Base del disco + cualquier escritura en vuelo que ocurrió antes de resolver la lectura. */
function mergeInFlightProgress(disk: ProgressState, inFlight: ProgressState | null): ProgressState {
  if (!inFlight) return disk;
  const out = normalizeProgress(disk);
  for (const key of COUNTERS) out[key] = Math.max(out[key] || 0, inFlight[key] || 0);
  for (const [day, xp] of Object.entries(inFlight.days)) out.days[day] = Math.max(out.days[day] ?? 0, xp);
  for (const [day, n] of Object.entries(inFlight.finishedDays)) out.finishedDays[day] = Math.max(out.finishedDays[day] ?? 0, n);
  out.unlocked = [...new Set([...out.unlocked, ...inFlight.unlocked])];
  out.rewardedKeys = [...new Set([...(out.rewardedKeys ?? []), ...(inFlight.rewardedKeys ?? [])])].slice(-800);
  out.originsMigrated = { ...(out.originsMigrated ?? {}), ...(inFlight.originsMigrated ?? {}) };
  return out;
}

/** Ingesta idempotente de un origen + suelo desde el historial + racha reconstruida. */
export async function hydrateUnifiedProgress(): Promise<void> {
  const inExtension = hasExtensionStorage();
  let p: ProgressState;
  let s: StreakState;
  if (inExtension) {
    let loadedProgress: unknown;
    let loadedStreak: unknown;
    try {
      const values = await chromeLocalStorage.get([PROGRESS_KEY, STREAK_KEY]);
      loadedProgress = values[PROGRESS_KEY];
      loadedStreak = values[STREAK_KEY];
    } catch { /* sin almacenamiento: seguimos con la caché */ }
    p = mergeInFlightProgress(normalizeProgress(loadedProgress as Partial<ProgressState> | null), memProgress);
    s = normalizeStreak((loadedStreak ?? memStreak) as Partial<StreakState> | null);
    if (!s.celebratedAt && memStreak?.celebratedAt) s.celebratedAt = memStreak.celebratedAt;
  } else {
    // En preview LEGACY_PROGRESS_KEY YA ES el almacén: no lo sumamos sobre sí mismo.
    p = normalizeProgress(legacyGet(LEGACY_PROGRESS_KEY) as Partial<ProgressState> | null);
    s = normalizeStreak(legacyGet(LEGACY_STREAK_KEY) as Partial<StreakState> | null);
  }
  const origin = typeof location !== 'undefined' ? location.origin : 'preview';
  p.originsMigrated = p.originsMigrated ?? {};

  // A) origen aún no migrado: suma una sola vez los datos legacy de ese dominio.
  if (!p.originsMigrated[origin]) {
    const legacyProgress = legacyGet(LEGACY_PROGRESS_KEY) as Partial<ProgressState> | null;
    const legacyStreak = legacyGet(LEGACY_STREAK_KEY) as Partial<StreakState> | null;
    if (inExtension) {
      for (const key of COUNTERS) p[key] = (p[key] || 0) + Number(legacyProgress?.[key] || 0);
      addDaysMap(p.days, legacyProgress?.days);
      addDaysMap(p.finishedDays, legacyProgress?.finishedDays);
      p.unlocked = [...new Set([...p.unlocked, ...(legacyProgress?.unlocked ?? [])])];
      p.recentFirstTry = [...(legacyProgress?.recentFirstTry ?? []), ...p.recentFirstTry].slice(-20);
    }
    if (legacyStreak?.best) s.best = Math.max(s.best || 0, Number(legacyStreak.best));
    const shown = normalizeDayKey(String(globalThis.localStorage?.getItem(LEGACY_STREAK_SHOWN_KEY) ?? ''));
    if (shown && !s.celebratedAt) s.celebratedAt = shown;
    p.originsMigrated[origin] = Date.now();
  }
  const rewarded = legacyGet(REWARDED_KEY);
  if (Array.isArray(rewarded)) p.rewardedKeys = [...new Set([...(p.rewardedKeys ?? []), ...rewarded.slice(-800)])].slice(-800);

  // B) suelo garantizado desde el historial.
  try {
    const lectures = (await historyService.listLectures()).filter((l: { deletedAt?: number }) => !l.deletedAt);
    const completed = lectures.filter((l: { status?: string; finishedAt?: number }) => l.status === 'completed' || l.finishedAt != null);
    const exported = lectures.filter((l: { exportedAt?: number; obsidianExportedAt?: number }) => l.exportedAt != null || l.obsidianExportedAt != null);
    p.sessions = Math.max(p.sessions, completed.length);
    p.exports = Math.max(p.exports, exported.length);
    const finishedByDay: Record<string, number> = {};
    const activeByDay: Record<string, number> = {};
    for (const l of completed) {
      const ts = (l as { finishedAt?: number; completedAt?: number }).finishedAt ?? (l as { completedAt?: number }).completedAt;
      if (!ts) continue;
      const day = localDayKey(new Date(ts));
      finishedByDay[day] = (finishedByDay[day] ?? 0) + 1;
      activeByDay[day] = Math.max(activeByDay[day] ?? 0, 30);
    }
    for (const l of lectures) {
      const attempts = [...(l.questions ?? []), ...(l.codeChallenge ? [l.codeChallenge] : [])] as Array<{ answeredAt?: number }>;
      for (const a of attempts) if (a.answeredAt) {
        const day = localDayKey(new Date(a.answeredAt));
        activeByDay[day] = Math.max(activeByDay[day] ?? 0, 5);
      }
    }
    for (const [day, n] of Object.entries(finishedByDay)) p.finishedDays[day] = Math.max(p.finishedDays[day] ?? 0, n);
    for (const [day, n] of Object.entries(activeByDay)) p.days[day] = Math.max(p.days[day] ?? 0, n);
    p.xp = Math.max(p.xp, Object.values(p.days).reduce((a, b) => a + b, 0));
    s = recomputeStreakFromDays({ ...p.days, ...activeByDay }, s);
  } catch { /* sin historial: solo migración de origen */ }

  setProgressState(p, false);
  setStreakState(s, false);
  for (const hook of hydrateHooks) { try { hook(); } catch { /* ignore */ } }
  emitXp();
  emitStreak();
}

/** Suscripción a cambios de otras pestañas (solo en la extensión). */
export function watchUnifiedStorage(): () => void {
  if (!hasExtensionStorage()) return () => undefined;
  return chromeLocalStorage.onChange((changes) => {
    const byKey = changes as Record<string, { newValue?: unknown }>;
    if (PROGRESS_KEY in byKey) { memProgress = normalizeProgress(byKey[PROGRESS_KEY]?.newValue as Partial<ProgressState> | null); emitXp(); }
    if (STREAK_KEY in byKey) { memStreak = normalizeStreak(byKey[STREAK_KEY]?.newValue as Partial<StreakState> | null); emitStreak(); }
  });
}

void watchUnifiedStorage();
