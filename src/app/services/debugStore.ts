export interface SSEToken {
  token: string;
  accumulated: string;
  deltaMs: number;
  timestamp: number;
}

export type RequestStatus = 'streaming' | 'done' | 'error' | 'aborted';

export interface DebugRequest {
  id: string;
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

const MAX_REQUESTS = 20;
const MAX_CACHE = 80;

class DebugStore {
  requests: DebugRequest[] = [];
  cacheEntries: CacheEntry[] = [];
  private listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  startRequest(id: string, context: string) {
    const request: DebugRequest = {
      id,
      context,
      startTs: performance.now(),
      tokens: [],
      status: 'streaming'
    };

    this.requests = [request, ...this.requests.slice(0, MAX_REQUESTS - 1)];
    this.notify();
  }

  addToken(id: string, token: string, accumulated: string) {
    const request = this.requests.find((item) => item.id === id);
    if (!request) {
      return;
    }

    const previous = request.tokens.length ? request.tokens[request.tokens.length - 1] : undefined;
    const previousTs = previous ? previous.timestamp : request.startTs;
    const now = performance.now();

    request.tokens.push({
      token,
      accumulated,
      deltaMs: Math.round(now - previousTs),
      timestamp: now
    });
    this.notify();
  }

  endRequest(id: string, success: boolean, aborted = false) {
    const request = this.requests.find((item) => item.id === id);
    if (!request) {
      return;
    }

    request.totalMs = Math.round(performance.now() - request.startTs);
    request.totalTokens = request.tokens.length;
    request.success = success;
    request.status = aborted ? 'aborted' : success ? 'done' : 'error';
    this.notify();
  }

  addCacheEntry(entry: CacheEntry) {
    this.cacheEntries = [entry, ...this.cacheEntries.slice(0, MAX_CACHE - 1)];
    this.notify();
  }

  clear() {
    this.requests = [];
    this.cacheEntries = [];
    this.notify();
  }

  getLatestStats() {
    const latest = this.requests.find((item) => item.status === 'done' || item.status === 'aborted');
    if (!latest || latest.tokens.length === 0) {
      return null;
    }

    const deltas = latest.tokens.map((item) => item.deltaMs).filter((delta) => delta > 0);
    const avg = deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : 0;
    const total = latest.totalMs ?? 0;

    return {
      avgDeltaMs: Math.round(avg),
      minDeltaMs: deltas.length ? Math.min(...deltas) : 0,
      maxDeltaMs: deltas.length ? Math.max(...deltas) : 0,
      tokenCount: latest.tokens.length,
      totalMs: total,
      tokensPerSec: total > 0 ? Math.round((latest.tokens.length / total) * 1000 * 10) / 10 : 0
    };
  }
}

export const debugStore = new DebugStore();