// Tests puros del almacén unificado de progreso/racha/XP (sin navegador ni extensiones).
// node scripts/qa-progress-units.mjs
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); Object.defineProperty(globalThis.localStorage, k, { value: String(v), enumerable: true, writable: true, configurable: true }); },
  removeItem: (k) => { store.delete(k); delete globalThis.localStorage[k]; },
  clear: () => { store.clear(); for (const k of Object.keys(globalThis.localStorage)) if (!["getItem","setItem","removeItem","clear"].includes(k)) delete globalThis.localStorage[k]; },
};
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
const setOrigin = (origin) => Object.defineProperty(globalThis, "location", { value: { origin }, writable: true, configurable: true });
setOrigin("preview");

const ps = await import("../src/app/services/progressStore.ts");
const progress = await import("../src/app/services/progress.ts");
const streak = await import("../src/app/services/streak.ts");

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
};

test("fechas canónicas y retrocompatibilidad", () => {
  assert.equal(ps.normalizeDayKey("2026-4-5"), "2026-04-05");
  assert.equal(ps.normalizeDayKey("2026-11-24"), "2026-11-24");
  assert.equal(ps.normalizeDayKey("no-fecha"), null);
  assert.equal(ps.localDayKey(new Date(2026, 3, 5)), "2026-04-05");
});

const today = ps.localDayKey();
setOrigin("https://www.udemy.com");
store.set("kinema-progress", JSON.stringify({ xp: 100, correct: 2, days: { "2026-4-5": 100 }, unlocked: ["first"] }));
store.set("kinema-streak", JSON.stringify({ last: today, count: 3, best: 3 }));
await ps.hydrateUnifiedProgress();
const afterUdemy = ps.getProgressState();
assert.equal(afterUdemy.xp, 100, " primers origen sumado");

setOrigin("https://master.dev");
store.set("kinema-progress", JSON.stringify({ xp: 50, answered: 4, days: { "2026-4-6": 50 } }));
store.set("kinema-streak", JSON.stringify({ last: "", count: 0, best: 2 }));
await ps.hydrateUnifiedProgress();
await ps.hydrateUnifiedProgress();
test("migración multi-origen idempotente", () => {
  const s = ps.getProgressState();
  assert.equal(s.xp, 150, "udemy + master.dev, una sola vez por origen");
  assert.equal(s.answered, 4);
  assert.equal(s.days["2026-04-05"], 100);
  assert.equal(s.days["2026-04-06"], 50);
  assert(Math.max(...Object.keys(s.originsMigrated ?? {}).length ? [Object.keys(s.originsMigrated).length] : [0]) >= 2);
});

globalThis.localStorage.setItem("usb_history_lecture::c::l", JSON.stringify({
  courseId: "c", courseName: "Curso", lectureId: "l", lectureName: "Lección",
  status: "completed", finishedAt: Date.now(), exportedAt: Date.now(), startedAt: Date.now() - 1000,
  updatedAt: Date.now(), ankiCardsCount: 3,
  ankiCards: [{ front: "a", back: "b" }, { front: "c", back: "d" }, { front: "x", back: "y", excluded: true }],
  questions: [{ answer: "sí", answeredAt: Date.now(), rating: "correct", firstTryCorrect: true }],
}));
await ps.hydrateUnifiedProgress();
test("reconciliación con el historial y racha con escudo", () => {
  const s = ps.getProgressState();
  assert(s.sessions >= 1, "sesión completada");
  assert(s.exports >= 1, "exportación completada");
  assert(s.days[today] >= 30, "día activo desde finishedAt");
  assert(streak.getStreak() >= 1, "racha vigente");
  assert.equal(typeof streak.streakIsFrozen(), "boolean");
  assert.equal(typeof streak.streakFreezeAvailable(), "boolean");
});

test("claimRewardKey es unificado y no premia dos veces", () => {
  const key = "vocab::curso::leccion::en";
  assert.equal(ps.claimRewardKey(key), true);
  assert.equal(ps.claimRewardKey(key), false);
  assert(progress.getProgress().xp > 0);
});

console.log(`QA unidades de progreso: ${passed}/${passed} OK`);
