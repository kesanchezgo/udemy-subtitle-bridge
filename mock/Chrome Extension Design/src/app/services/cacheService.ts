// ─── Persistent Cache Service ──────────────────────────────────────────────────
// Uses chrome.storage.local (10 MB capacity) in extension context.
// Falls back to localStorage for the preview / dev environment.
//
// All keys are prefixed with "usb_cache_" to avoid collisions with sync storage.
// TTL is enforced on read: expired entries are evicted lazily.

const CACHE_PREFIX = "usb_cache_";

function isChromeLocal(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome?.storage?.local?.get === "function"
  );
}

// ─── Low-level storage helpers ────────────────────────────────────────────────

async function sGet(key: string): Promise<unknown> {
  const sk = CACHE_PREFIX + key;
  if (isChromeLocal()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise((r) => (chrome as any).storage.local.get([sk], (res: Record<string, unknown>) => r(res[sk])));
  }
  const raw = localStorage.getItem(sk);
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

async function sSet(key: string, val: unknown): Promise<void> {
  const sk = CACHE_PREFIX + key;
  if (isChromeLocal()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise((r) => (chrome as any).storage.local.set({ [sk]: val }, r));
  }
  localStorage.setItem(sk, JSON.stringify(val));
}

async function sRemove(key: string): Promise<void> {
  const sk = CACHE_PREFIX + key;
  if (isChromeLocal()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Promise((r) => (chrome as any).storage.local.remove([sk], r));
  }
  localStorage.removeItem(sk);
}

// Returns bare keys (without CACHE_PREFIX)
async function getAllKeys(): Promise<string[]> {
  if (isChromeLocal()) {
    return new Promise((r) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (chrome as any).storage.local.get(null, (items: Record<string, unknown>) =>
        r(
          Object.keys(items)
            .filter((k) => k.startsWith(CACHE_PREFIX))
            .map((k) => k.slice(CACHE_PREFIX.length))
        )
      )
    );
  }
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(CACHE_PREFIX))
    .map((k) => k.slice(CACHE_PREFIX.length));
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CacheEntry<T = unknown> {
  data: T;
  expires: number;      // unix ms
  createdAt: number;    // unix ms
  courseId?: string;
  courseLabel?: string;
  type?: "srt" | "curriculum" | "translation" | "other";
}

export interface CourseCacheInfo {
  courseId: string;
  label: string;
  entries: number;
  expiresAt: number;    // unix ms — minimum expiry across all entries
  sizeKb: number;
}

export interface CacheStats {
  totalEntries: number;
  courseCount: number;
  estimatedSizeKb: number;
  oldestEntry?: number;   // unix ms
  newestEntry?: number;   // unix ms
  courses: CourseCacheInfo[];
}

// ─── Cache service ────────────────────────────────────────────────────────────

export const cacheService = {
  /** Read an entry. Returns null if missing or expired (and evicts the stale entry). */
  async get<T>(key: string): Promise<T | null> {
    const entry = (await sGet(key)) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      await sRemove(key);
      return null;
    }
    return entry.data;
  },

  /** Write an entry with a TTL (in days). */
  async set<T>(
    key: string,
    data: T,
    ttlDays: number,
    meta?: Pick<CacheEntry, "courseId" | "courseLabel" | "type">
  ): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      expires: Date.now() + ttlDays * 86_400_000,
      createdAt: Date.now(),
      ...meta,
    };
    await sSet(key, entry);
  },

  /** Delete a single entry. */
  async del(key: string): Promise<void> {
    await sRemove(key);
  },

  /** Delete all entries belonging to a specific course. Returns count cleared. */
  async clearByCourse(courseId: string): Promise<number> {
    const keys = await getAllKeys();
    let n = 0;
    for (const k of keys) {
      const e = (await sGet(k)) as CacheEntry | undefined;
      if (e?.courseId === courseId) { await sRemove(k); n++; }
    }
    return n;
  },

  /** Evict all entries whose TTL has passed. Returns count cleared. */
  async clearExpired(): Promise<number> {
    const keys = await getAllKeys();
    let n = 0;
    const now = Date.now();
    for (const k of keys) {
      const e = (await sGet(k)) as CacheEntry | undefined;
      if (e && now > e.expires) { await sRemove(k); n++; }
    }
    return n;
  },

  /** Wipe all cache entries. */
  async clearAll(): Promise<void> {
    const keys = await getAllKeys();
    for (const k of keys) await sRemove(k);
  },

  /** Aggregate statistics for the settings UI. */
  async getStats(): Promise<CacheStats> {
    const keys = await getAllKeys();
    const now = Date.now();
    const map = new Map<string, { label: string; entries: number; expiresAt: number; bytes: number }>();
    let total = 0, bytes = 0, oldest = Infinity, newest = 0;

    for (const k of keys) {
      const e = (await sGet(k)) as CacheEntry | undefined;
      if (!e || now > e.expires) continue;

      total++;
      const sz = JSON.stringify(e.data).length + k.length;
      bytes += sz;
      if (e.createdAt < oldest) oldest = e.createdAt;
      if (e.createdAt > newest) newest = e.createdAt;

      const cid = e.courseId ?? "_ungrouped";
      const label = e.courseLabel ?? e.courseId ?? "Sin curso";
      const cur = map.get(cid);
      if (cur) {
        cur.entries++;
        cur.bytes += sz;
        if (e.expires < cur.expiresAt) cur.expiresAt = e.expires;
      } else {
        map.set(cid, { label, entries: 1, expiresAt: e.expires, bytes: sz });
      }
    }

    return {
      totalEntries: total,
      courseCount: map.size,
      estimatedSizeKb: Math.round(bytes / 1024),
      oldestEntry: oldest === Infinity ? undefined : oldest,
      newestEntry: newest === 0 ? undefined : newest,
      courses: Array.from(map.entries()).map(([courseId, v]) => ({
        courseId,
        label: v.label,
        entries: v.entries,
        expiresAt: v.expiresAt,
        sizeKb: Math.max(1, Math.round(v.bytes / 1024)),
      })),
    };
  },

  // Only seeds data in the browser preview (localStorage) so the UI looks populated.
  // Skips if there are already cache entries, or if running inside a real extension.
  async seedDemoData(ttlDays: number): Promise<void> {
    if (isChromeLocal()) return;
    const existing = await getAllKeys();
    if (existing.length > 0) return;

    const courses = [
      { id: "java-spring-boot",    label: "Java con Spring Boot",      daysAgo: 2, lessons: 8  },
      { id: "react-avanzado",      label: "React Avanzado",            daysAgo: 5, lessons: 6  },
      { id: "aws-cloud-pract",     label: "AWS Cloud Practitioner",    daysAgo: 1, lessons: 10 },
    ];

    for (const c of courses) {
      const createdAt = Date.now() - c.daysAgo * 86_400_000;
      const expires   = createdAt + ttlDays * 86_400_000;

      // One curriculum entry per course
      await sSet(`curriculum_${c.id}`, {
        data: { sections: c.lessons, title: c.label },
        expires, createdAt,
        courseId: c.id, courseLabel: c.label, type: "curriculum",
      });

      // Several SRT translation entries per course
      for (let i = 0; i < c.lessons; i++) {
        await sSet(`srt_${c.id}_${i}`, {
          data: `1\n00:00:0${i},000 --> 00:00:0${i + 2},000\nContenido traducido lección ${i + 1}`,
          expires,
          createdAt: createdAt + i * 60_000,
          courseId: c.id, courseLabel: c.label, type: "srt",
        });
      }
    }
  },
};
