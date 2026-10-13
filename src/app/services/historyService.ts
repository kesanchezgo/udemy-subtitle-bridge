// ─── Persistent User Study History ────────────────────────────────────────────
// Stores learner knowledge that must NOT expire with the cache TTL:
// what courses/lectures the user has studied, their answers, AI ratings,
// confidence levels, and generated Anki cards.
//
// Namespace: "usb_history_" — completely separate from the "usb_cache_"
// namespace used by cacheService. Clearing cache never touches history.
//
// When the user is offline / guest mode, this is the authoritative store.
// When logged in, AuthGuard can push the entire namespace to Supabase and
// re-hydrate it on next login (same pattern as the existing migrate flow).

const HISTORY_PREFIX = "usb_history_";

function getChromeLocal(): { get: Function; set: Function; remove: Function } | undefined {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: { storage?: { local?: { get: Function; set: Function; remove: Function } } } }).chrome;
  return chromeApi?.storage?.local;
}

function getChromeStorageOnChanged():
  | { addListener: Function; removeListener: Function }
  | undefined {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: { storage?: { onChanged?: { addListener: Function; removeListener: Function } } };
  }).chrome;
  return chromeApi?.storage?.onChanged;
}

// ─── Low-level storage helpers (mirror cacheService) ──────────────────────────

async function sGet(key: string): Promise<unknown> {
  const sk = HISTORY_PREFIX + key;
  const local = getChromeLocal();
  if (local) {
    return new Promise((r) => local.get([sk], (res: Record<string, unknown>) => r(res[sk])));
  }
  const raw = localStorage.getItem(sk);
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

async function sSet(key: string, val: unknown): Promise<void> {
  const sk = HISTORY_PREFIX + key;
  const local = getChromeLocal();
  if (local) {
    return new Promise((r) => local.set({ [sk]: val }, r));
  }
  localStorage.setItem(sk, JSON.stringify(val));
}

async function sRemove(key: string): Promise<void> {
  const sk = HISTORY_PREFIX + key;
  const local = getChromeLocal();
  if (local) {
    return new Promise((r) => local.remove([sk], r));
  }
  localStorage.removeItem(sk);
}

async function getAllKeys(): Promise<string[]> {
  const local = getChromeLocal();
  if (local) {
    return new Promise((r) =>
      local.get(null, (items: Record<string, unknown>) =>
        r(
          Object.keys(items)
            .filter((k) => k.startsWith(HISTORY_PREFIX))
            .map((k) => k.slice(HISTORY_PREFIX.length))
        )
      )
    );
  }
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(HISTORY_PREFIX))
    .map((k) => k.slice(HISTORY_PREFIX.length));
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type ConfidenceLevel = "confused" | "partial" | "clear" | "mastered";
export type AnswerRating = "correct" | "excellent" | "partial" | "wrong" | "unknown";
export type LectureStatus = "in_progress" | "completed";

export interface QuestionAttempt {
  prompt?: string;          // optional snapshot of the question text
  answer: string;
  rating?: AnswerRating;
  feedback?: string;        // AI explanation
  answeredAt?: number;
}

export interface CodeChallengeAttempt {
  prompt?: string;
  answer: string;
  rating?: AnswerRating;
  feedback?: string;
  answeredAt?: number;
}

export interface StoredAnkiCard {
  id?: string;
  front: string;
  back: string;
  tags?: string[];
  type?: string;            // concepto | aplicacion | codigo | entrevista | comparacion | proceso
}

export interface StoredStudyQuestion {
  q: string;
  bloom: string;
  difficulty: ConfidenceLevel;
  hint: string;
  answer: string;
  conceptRefs?: number[];
}

export interface StoredStudyContent {
  relevance: { score: number; reason: string };
  keyConcepts: string[];
  quickWin: string;
  questions: StoredStudyQuestion[];
  application: { setup: string; challenge: string; solution: string; isCode: boolean };
  interviewQ: { q: string; idealAnswer: string } | null;
  nextAction: string;
  ankiCards: StoredAnkiCard[];
}

export interface LectureHistoryRecord {
  courseId: string;
  courseName: string;
  lectureId: string;
  lectureName: string;
  objective?: string;                // paso 1 — "Mi nivel"
  objectiveId?: string;              // id estable del objetivo IA seleccionado
  studyContent?: StoredStudyContent;  // snapshot completo generado por IA
  confidence?: ConfidenceLevel;      // paso 3 — "¿Lo sé?"
  checkedConceptIndexes?: number[];  // paso 2 — conceptos que el estudiante dice entender
  conceptsAcknowledged?: boolean;    // permite continuar incluso con 0 conceptos marcados
  questionsComplete?: boolean;       // paso 3 desbloqueado aunque no haya respuestas correctas
  focusStep?: number;                // último paso visible 0..4 para reanudar
  keyConcepts?: string[];            // snapshot de StudyContent.keyConcepts
  questions: QuestionAttempt[];      // paso 3
  codeChallenge?: CodeChallengeAttempt; // paso 4 — "Practícalo"
  ankiCards?: StoredAnkiCard[];      // paso 5 — guardamos inline (offline-safe)
  ankiCardsCount: number;
  status: LectureStatus;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  /** Tombstone used to sync deletes/resets across devices without resurrecting old cloud data. */
  deletedAt?: number;
  /** Monotonic edit counter — survives clock skew. Higher wins on merge. */
  version: number;
  /** Primera exportación a Anki/Obsidian (unix ms) — alimenta el panel de memoria. */
  exportedAt?: number;
  /** Última auto-evaluación de repaso marcada por el estudiante (unix ms). */
  reviewedAt?: number;
}

export interface CourseHistorySummary {
  courseId: string;
  courseName: string;
  lectureCount: number;
  completedCount: number;
  totalAnkiCards: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface HistoryStats {
  totalCourses: number;
  totalLectures: number;
  completedLectures: number;
  totalAnkiCards: number;
  estimatedSizeKb: number;
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

/**
 * Stable id from a free-text name. Aggressive normalization: lowercases,
 * strips diacritics, and removes ALL non-alphanumeric characters (no dashes).
 * This means "Java InDepth" and "Java In-Depth" both collapse to "javaindepth",
 * so minor renames don't fragment the user's history.
 */
export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80) || "untitled";
}

function lectureKey(courseId: string, lectureId: string): string {
  return `lecture::${courseId}::${lectureId}`;
}

/** Stable key for Supabase migrate payload (one row per lecture). */
export function cloudKeyForLecture(courseId: string, lectureId: string): string {
  return `history_lec_${courseId}_${lectureId}`;
}

export const CLOUD_HISTORY_PREFIX = "history_lec_";
/** Legacy key used by an older client version that bundled the full history. */
export const CLOUD_HISTORY_LEGACY_BUNDLE_KEY = "__history__";

// ─── Service ──────────────────────────────────────────────────────────────────

export const historyService = {
  hasProgress(rec: LectureHistoryRecord | null | undefined): boolean {
    if (!rec) return false;
    if (rec.deletedAt) return false;
    return Boolean(
      rec.studyContent ||
      rec.confidence ||
      rec.questions?.length ||
      rec.codeChallenge ||
      rec.ankiCards?.length ||
      rec.ankiCardsCount > 0 ||
      rec.status === "completed"
    );
  },

  onChanged(callback: (records: LectureHistoryRecord[]) => void): () => void {
    const onChanged = getChromeStorageOnChanged();
    if (!onChanged) return () => {};

    const listener = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName !== "local") return;
      const records = Object.entries(changes)
        .filter(([key]) => key.startsWith(HISTORY_PREFIX))
        .map(([, change]) => change.newValue as LectureHistoryRecord | undefined)
        .filter((rec): rec is LectureHistoryRecord => Boolean(rec?.courseId && rec?.lectureId));
      if (records.length > 0) {
        callback(records);
      }
    };

    onChanged.addListener(listener);
    return () => onChanged.removeListener(listener);
  },

  /** Read a single lecture record. */
  async getLecture(courseId: string, lectureId: string): Promise<LectureHistoryRecord | null> {
    const rec = (await sGet(lectureKey(courseId, lectureId))) as LectureHistoryRecord | undefined;
    return rec ?? null;
  },

  /** Create or merge-update a lecture record. Returns the persisted record. */
  async upsertLecture(
    partial: Partial<LectureHistoryRecord> &
      Pick<LectureHistoryRecord, "courseName" | "lectureName"> & { clearProgress?: boolean }
  ): Promise<LectureHistoryRecord> {
    const courseId = partial.courseId ?? slugify(partial.courseName);
    const lectureId = partial.lectureId ?? slugify(partial.lectureName);
    const now = Date.now();

    const prev = await this.getLecture(courseId, lectureId);
    const clearProgress = Boolean(partial.clearProgress);
    const impliesQuestionsComplete =
      Boolean(partial.codeChallenge) ||
      Boolean(partial.ankiCards?.length) ||
      partial.status === "completed";
    const merged: LectureHistoryRecord = {
      courseId,
      lectureId,
      courseName: partial.courseName,
      lectureName: partial.lectureName,
      objective:    partial.objective    ?? prev?.objective,
      objectiveId:  partial.objectiveId  ?? prev?.objectiveId,
      studyContent: partial.studyContent ?? (clearProgress ? undefined : prev?.studyContent),
      confidence:   partial.confidence   ?? (clearProgress ? undefined : prev?.confidence),
      checkedConceptIndexes: partial.checkedConceptIndexes ?? (clearProgress ? [] : prev?.checkedConceptIndexes),
      conceptsAcknowledged: partial.conceptsAcknowledged ?? (impliesQuestionsComplete ? true : clearProgress ? false : prev?.conceptsAcknowledged),
      questionsComplete: partial.questionsComplete ?? (impliesQuestionsComplete ? true : clearProgress ? false : prev?.questionsComplete),
      focusStep: partial.focusStep ?? (clearProgress ? 0 : prev?.focusStep),
      keyConcepts:  partial.keyConcepts  ?? (clearProgress ? undefined : prev?.keyConcepts),
      questions:    partial.questions    ?? (clearProgress ? [] : prev?.questions)    ?? [],
      codeChallenge: partial.codeChallenge ?? (clearProgress ? undefined : prev?.codeChallenge),
      ankiCards:    partial.ankiCards    ?? (clearProgress ? undefined : prev?.ankiCards),
      ankiCardsCount: partial.ankiCardsCount
        ?? partial.ankiCards?.length
        ?? (clearProgress ? 0 : prev?.ankiCardsCount)
        ?? 0,
      status:       partial.status       ?? (clearProgress ? "in_progress" : prev?.status)       ?? "in_progress",
      startedAt:    clearProgress ? now : (prev?.startedAt ?? now),
      updatedAt:    now,
      completedAt:  partial.status === "completed"
        ? (prev?.completedAt ?? now)
        : clearProgress
          ? undefined
          : prev?.completedAt,
      deletedAt: clearProgress
        ? undefined
        // A new upsert that carries real progress revives a tombstoned lecture;
        // otherwise the record would stay hidden from the UI forever.
        : (partial.studyContent || partial.confidence || partial.questions?.length || partial.codeChallenge || partial.ankiCards?.length || partial.status === "completed")
          ? undefined
          : prev?.deletedAt,
      exportedAt: clearProgress ? partial.exportedAt : (prev?.exportedAt ?? partial.exportedAt),
      reviewedAt: partial.reviewedAt ?? (clearProgress ? undefined : prev?.reviewedAt),
      version:      (prev?.version ?? 0) + 1,
    };

    await sSet(lectureKey(courseId, lectureId), merged);
    return merged;
  },

  /** Mark a lecture as completed (idempotent). */
  async markCompleted(courseId: string, lectureId: string): Promise<void> {
    const rec = await this.getLecture(courseId, lectureId);
    if (!rec) return;
    if (rec.status === "completed") return;
    rec.status = "completed";
    rec.completedAt = Date.now();
    rec.updatedAt = Date.now();
    rec.version = (rec.version ?? 0) + 1;
    await sSet(lectureKey(courseId, lectureId), rec);
  },

  /** Stamp lectures as exported (fixed in Anki/Obsidian). */
  async markExported(courseId: string, lectureId: string): Promise<void> {
    const rec = await this.getLecture(courseId, lectureId);
    if (!rec) return;
    rec.exportedAt = rec.exportedAt ?? Date.now();
    rec.updatedAt = Date.now();
    rec.version = (rec.version ?? 0) + 1;
    await sSet(lectureKey(courseId, lectureId), rec);
  },

  /** Self-reported Anki review for a lecture. */
  async markReviewed(courseId: string, lectureId: string): Promise<void> {
    const rec = await this.getLecture(courseId, lectureId);
    if (!rec) return;
    rec.reviewedAt = Date.now();
    rec.updatedAt = Date.now();
    rec.version = (rec.version ?? 0) + 1;
    await sSet(lectureKey(courseId, lectureId), rec);
  },

  /** All lectures across all courses, newest-first. */
  async listLectures(): Promise<LectureHistoryRecord[]> {
    const keys = await getAllKeys();
    const out: LectureHistoryRecord[] = [];
    for (const k of keys) {
      if (!k.startsWith("lecture::")) continue;
      const rec = (await sGet(k)) as LectureHistoryRecord | undefined;
      if (rec) out.push(rec);
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  },

  /** Lectures within a single course, newest-first. */
  async getCourseLectures(courseId: string): Promise<LectureHistoryRecord[]> {
    const all = await this.listLectures();
    return all.filter((l) => l.courseId === courseId && this.hasProgress(l));
  },

  /** Course-level summaries derived from lecture records. */
  async listCourses(): Promise<CourseHistorySummary[]> {
    const lectures = (await this.listLectures()).filter((l) => this.hasProgress(l));
    const map = new Map<string, CourseHistorySummary>();

    for (const l of lectures) {
      const cur = map.get(l.courseId);
      if (cur) {
        cur.lectureCount++;
        if (l.status === "completed") cur.completedCount++;
        cur.totalAnkiCards += l.ankiCardsCount;
        if (l.startedAt < cur.firstSeenAt) cur.firstSeenAt = l.startedAt;
        if (l.updatedAt > cur.lastSeenAt) cur.lastSeenAt = l.updatedAt;
      } else {
        map.set(l.courseId, {
          courseId: l.courseId,
          courseName: l.courseName,
          lectureCount: 1,
          completedCount: l.status === "completed" ? 1 : 0,
          totalAnkiCards: l.ankiCardsCount,
          firstSeenAt: l.startedAt,
          lastSeenAt: l.updatedAt,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  },

  /** Has this lecture already been studied? */
  async hasStudied(courseName: string, lectureName: string): Promise<boolean> {
    const rec = await this.getLecture(slugify(courseName), slugify(lectureName));
    return this.hasProgress(rec);
  },

  /** Delete one lecture record. */
  async deleteLecture(courseId: string, lectureId: string): Promise<void> {
    const prev = await this.getLecture(courseId, lectureId);
    if (!prev) return;
    const now = Date.now();
    const tombstone: LectureHistoryRecord = {
      courseId,
      lectureId,
      courseName: prev.courseName,
      lectureName: prev.lectureName,
      objective: prev.objective,
      objectiveId: prev.objectiveId,
      checkedConceptIndexes: [],
      conceptsAcknowledged: false,
      questionsComplete: false,
      focusStep: 0,
      questions: [],
      ankiCardsCount: 0,
      status: "in_progress",
      startedAt: prev.startedAt ?? now,
      updatedAt: now,
      deletedAt: now,
      version: (prev.version ?? 0) + 1,
    };
    await sSet(lectureKey(courseId, lectureId), tombstone);
  },

  /** Delete every lecture of a course. */
  async deleteCourse(courseId: string): Promise<number> {
    const keys = await getAllKeys();
    let n = 0;
    for (const k of keys) {
      if (!k.startsWith(`lecture::${courseId}::`)) continue;
      const [, , lectureId] = k.split("::");
      if (!lectureId) continue;
      await this.deleteLecture(courseId, lectureId);
      n++;
    }
    return n;
  },

  /** Aggregate stats for the settings UI. */
  async getStats(): Promise<HistoryStats> {
    const lectures = (await this.listLectures()).filter((l) => this.hasProgress(l));
    const courses = new Set(lectures.map((l) => l.courseId));
    const bytes = lectures.reduce((acc, l) => acc + JSON.stringify(l).length, 0);
    return {
      totalCourses: courses.size,
      totalLectures: lectures.length,
      completedLectures: lectures.filter((l) => l.status === "completed").length,
      totalAnkiCards: lectures.reduce((acc, l) => acc + l.ankiCardsCount, 0),
      estimatedSizeKb: Math.max(1, Math.round(bytes / 1024)),
    };
  },

  /** Wipe ALL history. Destructive — only call from an explicit user action. */
  async clearAll(): Promise<void> {
    const keys = await getAllKeys();
    for (const k of keys) {
      if (!k.startsWith("lecture::")) continue;
      const [, courseId, lectureId] = k.split("::");
      if (!courseId || !lectureId) continue;
      await this.deleteLecture(courseId, lectureId);
    }
  },

  /** Export the full namespace for Supabase sync / backup. */
  async exportAll(): Promise<LectureHistoryRecord[]> {
    // Include tombstones: they carry a bumped `version`, so on importAll they
    // beat the stale cloud copy. Dropping them let deleted lectures resurrect.
    return this.listLectures();
  },

  /**
   * Re-hydrate from a previous export (used on login). Merges by lecture key.
   *
   * Conflict resolution prefers the record with the higher `version` (a monotonic
   * counter that survives clock skew). `updatedAt` is only a tiebreak when both
   * sides have the same version — which happens for records written before the
   * `version` field existed.
   */
  async importAll(records: LectureHistoryRecord[]): Promise<number> {
    let n = 0;
    for (const r of records) {
      if (!r?.courseId || !r?.lectureId) continue;
      const prev = await this.getLecture(r.courseId, r.lectureId);
      const incomingV = r.version ?? 0;
      const prevV     = prev?.version ?? 0;
      const incomingT = r.updatedAt ?? 0;
      const prevT     = prev?.updatedAt ?? 0;

      const wins =
        !prev ||
        incomingV > prevV ||
        (incomingV === prevV && incomingT > prevT);

      if (wins) {
        // Keep version monotonic locally: never go below what we already had.
        const normalized: LectureHistoryRecord = {
          ...r,
          version: Math.max(incomingV, prevV),
        };
        await sSet(lectureKey(r.courseId, r.lectureId), normalized);
        n++;
      }
    }
    return n;
  },
};
