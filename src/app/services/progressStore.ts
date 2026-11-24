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
  const m = String(raw ?? '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, da] = m;
  const month = Number(mo), day = Number(da);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
    originsMigrated: raw.originsMigrated ?? {},
  };
}

export function getProgressState(): ProgressState {
  if (memProgress) return memProgress;
  if (hasExtensionStorage()) { memProgress = emptyProgress(); return memProgress; }
  memProgress = normalizeProgress(legacyGet(LEGACY_PROGRESS_KEY) as Partial<ProgressState> | null);
  return memProgress;
}
export function getStreakState(): StreakState {
  if (memStreak) return memStreak;
  if (hasExtensionStorage()) { memStreak = emptyStreak(); return memStreak; }
  memStreak = normalizeStreak(legacyGet(LEGACY_STREAK_KEY) as Partial<StreakState> | null);
  return memStreak;
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
  memProgress = normalizeProgress(next);
  persist({ [PROGRESS_KEY]: memProgress });
  if (emit) emitXp();
}
export function setStreakState(next: StreakState, emit = true) {
  memStreak = normalizeStreak(next);
  persist({ [STREAK_KEY]: memStreak });
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

/** Racha vigente aplicando un día de descanso semanal. */
export function recomputeStreakFromDays(days: Record<string, number>, prev: StreakState, today = localDayKey()): StreakState {
  const active = Object.keys(normalizeDays(days)).filter((d) => Number(days[d]) > 0);
  if (prev.last) active.push(normalizeDayKey(prev.last) ?? prev.last);
  const sorted = [...new Set(active)].sort();
  if (!sorted.length) return { ...prev, count: 0, best: Math.max(prev.best || 0, 0) };
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const day of sorted) {
    const current = new Date(`${day}T00:00:00`);
    const gap = previous ? Math.round((current.getTime() - previous.getTime()) / 86400000) : 1;
    run = gap === 1 || gap === 2 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = current;
  }
  // Racha vigente: se cuenta hoy hacia atrás; un solo día sin actividad es el descanso semanal.
  let current = 0;
  let graceUsed = false;
  const todayDate = new Date(`${today}T00:00:00`);
  for (let i = 0; i < 400; i++) {
    const day = localDayKey(new Date(todayDate.getTime() - i * 86400000));
    if (sorted.includes(day)) current++;
    else if (!graceUsed) graceUsed = true;
    else break;
  }
  const last = sorted.includes(today) ? today
    : sorted.includes(prev.last) ? prev.last
      : sorted[sorted.length - 1];
  return { ...prev, last, count: current, best: Math.max(prev.best || 0, best) };
}

function addDaysMap(target: Record<string, number>, source: Record<string, number>) {
  for (const [day, xp] of Object.entries(normalizeDays(source))) target[day] = (target[day] ?? 0) + xp;
}

/** Ingesta idempotente de un origen + suelo desde el historial + racha reconstruida. */
export async function hydrateUnifiedProgress(): Promise<void> {
  let loadedProgress: unknown;
  let loadedStreak: unknown;
  if (hasExtensionStorage()) {
    try {
      const values = await chromeLocalStorage.get([PROGRESS_KEY, STREAK_KEY]);
      loadedProgress = values[PROGRESS_KEY];
      loadedStreak = values[STREAK_KEY];
    } catch { /* sin almacenamiento: seguimos con la caché */ }
  }
  // Ojo: en preview getProgressState() lee la MISMA clave legacy que vamos a
  // migrar; usar la caché (o vacío) evita contar dos veces el primer origen.
  let p = normalizeProgress(memProgress ?? (loadedProgress as Partial<ProgressState> | null));
  let s = normalizeStreak(memStreak ?? (loadedStreak as Partial<StreakState> | null));
  const origin = typeof location !== 'undefined' ? location.origin : 'preview';
  p.originsMigrated = p.originsMigrated ?? {};

  // A) origen aún no migrado: suma una sola vez sus contadores y días.
  if (!p.originsMigrated[origin]) {
    const legacyProgress = legacyGet(LEGACY_PROGRESS_KEY) as Partial<ProgressState> | null;
    const legacyStreak = legacyGet(LEGACY_STREAK_KEY) as Partial<StreakState> | null;
    for (const key of COUNTERS) p[key] = (p[key] || 0) + Number(legacyProgress?.[key] || 0);
    addDaysMap(p.days, legacyProgress?.days);
    addDaysMap(p.finishedDays, legacyProgress?.finishedDays);
    p.unlocked = [...new Set([...p.unlocked, ...(legacyProgress?.unlocked ?? [])])];
    p.recentFirstTry = [...(legacyProgress?.recentFirstTry ?? []), ...p.recentFirstTry].slice(-20);
    if (legacyStreak?.best) s.best = Math.max(s.best || 0, Number(legacyStreak.best));
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
