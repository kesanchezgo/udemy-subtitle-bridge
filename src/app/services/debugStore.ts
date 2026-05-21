// ─── Debug Store ──────────────────────────────────────────────────────────────
// Singleton event bus for the Dev tab.
// Collects SSE token chunks, per-token latencies and translation cache entries
// emitted by localAI.ts and TranslationPipeline.tsx.

export interface SSEToken {
  token: string;
  accumulated: string;
  /** ms elapsed since the previous token (or request start for first token) */
  deltaMs: number;
  timestamp: number;
}

export type RequestStatus = "streaming" | "done" | "error" | "aborted";

export interface DebugRequest {
  id: string;
  /** e.g. 'translate' | 'eval-question' | 'eval-code' */
  context: string;
  startTs: number;
  tokens: SSEToken[];
  totalMs?: number;
  totalTokens?: number;
  success?: boolean;
  status: RequestStatus;
}

export interface CacheEntry {
  en: string;
  es: string;
  latencyMs: number;
  usedAI: boolean;
  timestamp: number;
}

const MAX_REQUESTS = 15;
const MAX_CACHE    = 60;

class DebugStore {
  requests: DebugRequest[]  = [];
  cacheEntries: CacheEntry[] = [];
  private listeners = new Set<() => void>();

  // ── Subscription ──────────────────────────────────────────────────────────
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  // ── Request lifecycle ─────────────────────────────────────────────────────
  startRequest(id: string, context: string): void {
    // A retry or mock fallback may reuse a generated id during fast abort/retry cycles.
    // Keep the newest lifecycle authoritative instead of showing duplicate rows.
    this.requests = this.requests.filter((r) => r.id !== id);
    const req: DebugRequest = {
      id,
      context,
      startTs: performance.now(),
      tokens:  [],
      status:  "streaming",
    };
    this.requests = [req, ...this.requests.slice(0, MAX_REQUESTS - 1)];
    this.notify();
  }

  addToken(id: string, token: string, accumulated: string): void {
    const req = this.requests.find((r) => r.id === id);
    if (!req) return;
    if (req.status !== "streaming") req.status = "streaming";
    const prev   = req.tokens.length > 0 ? req.tokens[req.tokens.length - 1] : undefined;
    const prevTs = prev ? prev.timestamp : req.startTs;
    const now    = performance.now();
    req.tokens.push({
      token,
      accumulated,
      deltaMs:   Math.max(0, Math.round(now - prevTs)),
      timestamp: now,
    });
    this.notify();
  }

  endRequest(id: string, success: boolean, aborted = false): void {
    const req = this.requests.find((r) => r.id === id);
    if (!req) return;
    req.totalMs     = Math.round(performance.now() - req.startTs);
    req.totalTokens = req.tokens.length;
    req.success     = success;
    req.status      = aborted ? "aborted" : success ? "done" : "error";
    this.notify();
  }

  // ── Cache tracking ────────────────────────────────────────────────────────
  addCacheEntry(entry: CacheEntry): void {
    this.cacheEntries = [entry, ...this.cacheEntries.slice(0, MAX_CACHE - 1)];
    this.notify();
  }

  // ── Utility ───────────────────────────────────────────────────────────────
  clear(): void {
    this.requests    = [];
    this.cacheEntries = [];
    this.notify();
  }

  /** Derived stats for the most recent completed request */
  getLatestStats(): {
    avgDeltaMs: number;
    minDeltaMs: number;
    maxDeltaMs: number;
    tokenCount: number;
    totalMs: number;
    tokensPerSec: number;
  } | null {
    const done = this.requests.find((r) => r.status === "done" || r.status === "aborted");
    if (!done || done.tokens.length === 0) return null;
    const deltas   = done.tokens.map((t) => t.deltaMs).filter((d) => d > 0);
    const safeDeltas = deltas.length > 0 ? deltas : [0];
    const avg      = safeDeltas.reduce((a, b) => a + b, 0) / safeDeltas.length;
    const total    = done.totalMs ?? 0;
    const tps      = total > 0 ? Math.round((done.tokens.length / total) * 1000 * 10) / 10 : 0;
    return {
      avgDeltaMs:  Math.round(avg),
      minDeltaMs:  Math.min(...safeDeltas),
      maxDeltaMs:  Math.max(...safeDeltas),
      tokenCount:  done.tokens.length,
      totalMs:     total,
      tokensPerSec: tps,
    };
  }
}

export const debugStore = new DebugStore();
