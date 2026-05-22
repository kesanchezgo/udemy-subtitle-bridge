// ─── Per-Course Objectives Cache ──────────────────────────────────────────────
// Stores the 4 AI-generated learning objectives for each course so we only
// invoke the AI on first lesson of a new course (or when the user explicitly
// regenerates). Local-only by design — these are recoverable with one click.
//
// Namespace: "usb_objectives_" — distinct from cache (usb_cache_) and history
// (usb_history_). Never expires, never synced to Supabase (regenerable).

import { generateCourseObjectives, type GeneratedObjective } from "./localAI";
import { slugify } from "./historyService";

const PREFIX = "usb_objectives_";

function isChromeLocal(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome?.storage?.local?.get === "function"
  );
}

async function sGet(key: string): Promise<unknown> {
  const sk = PREFIX + key;
  if (isChromeLocal()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise((r) => (chrome as any).storage.local.get([sk], (res: Record<string, unknown>) => r(res[sk])));
  }
  const raw = localStorage.getItem(sk);
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

async function sSet(key: string, val: unknown): Promise<void> {
  const sk = PREFIX + key;
  if (isChromeLocal()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise((r) => (chrome as any).storage.local.set({ [sk]: val }, r));
  }
  localStorage.setItem(sk, JSON.stringify(val));
}

async function sRemove(key: string): Promise<void> {
  const sk = PREFIX + key;
  if (isChromeLocal()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise((r) => (chrome as any).storage.local.remove([sk], r));
  }
  localStorage.removeItem(sk);
}

export interface ObjectivesCacheEntry {
  courseId: string;
  courseName: string;
  description: string;
  objectives: GeneratedObjective[];
  generatedAt: number;
  isMock: boolean;
}

function key(courseId: string): string {
  return `course::${courseId}`;
}

export const objectivesService = {
  /** Returns cached objectives for a course, or null if none cached. */
  async get(courseName: string): Promise<ObjectivesCacheEntry | null> {
    const courseId = slugify(courseName);
    const entry = (await sGet(key(courseId))) as ObjectivesCacheEntry | undefined;
    return entry ?? null;
  },

  /**
   * Returns cached objectives if present, otherwise generates via AI and caches.
   * Description is used by the AI; cache key is the course slug only.
   */
  async getOrGenerate(courseName: string, description: string): Promise<ObjectivesCacheEntry> {
    const existing = await this.get(courseName);
    if (existing) return existing;
    return this.regenerate(courseName, description);
  },

  /** Force a fresh AI call and overwrite the cache. */
  async regenerate(courseName: string, description: string): Promise<ObjectivesCacheEntry> {
    const courseId = slugify(courseName);
    const { objectives, isMock } = await generateCourseObjectives(courseName, description);
    const entry: ObjectivesCacheEntry = {
      courseId,
      courseName,
      description,
      objectives,
      generatedAt: Date.now(),
      isMock,
    };
    await sSet(key(courseId), entry);
    return entry;
  },

  /** Wipe a single course's cached objectives. */
  async clear(courseName: string): Promise<void> {
    await sRemove(key(slugify(courseName)));
  },
};
