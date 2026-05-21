// ─── Dev Tab ──────────────────────────────────────────────────────────────────
// Hidden debug panel accessible by clicking the ⚙ gear icon.
// Shows: SSE token stream log, per-token latencies, translation cache.

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trash2, ChevronDown, ChevronUp, Zap, Clock,
  Database, Radio, BarChart2, RefreshCcw,
  WifiOff, CheckCircle2, AlertCircle,
} from "lucide-react";
import { debugStore, type DebugRequest, type CacheEntry } from "../services/debugStore";

// ── Helpers ───────────────────────────────────────────────────────────────────
function msColor(ms: number): string {
  if (ms < 50)  return "text-emerald-400";
  if (ms < 150) return "text-amber-400";
  return "text-red-400";
}
function msBgColor(ms: number): string {
  if (ms < 50)  return "#34d399"; // emerald-400
  if (ms < 150) return "#fbbf24"; // amber-400
  return "#f87171"; // red-400
}

function contextPill(ctx: string) {
  const isMock = ctx.endsWith(":mock");
  const baseCtx = isMock ? ctx.replace(/:mock$/, "") : ctx;
  const map: Record<string, string> = {
    "translate":    "bg-sky-500/15 text-sky-400 border-sky-500/25",
    "eval-question":"bg-violet-500/15 text-violet-400 border-violet-500/25",
    "eval-code":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    "mock":         "bg-amber-500/12 text-amber-400 border-amber-500/22",
    "unknown":      "bg-white/8 text-white/35 border-white/12",
  };
  const labels: Record<string, string> = {
    "translate":    "traducir",
    "eval-question":"eval·Q",
    "eval-code":    "eval·code",
    "unknown":      "?",
  };
  if (isMock) {
    return { cls: map.mock, label: `${labels[baseCtx] ?? baseCtx}·mock` };
  }
  return { cls: map[baseCtx] ?? map.unknown, label: labels[baseCtx] ?? baseCtx };
}

// Micro histogram bar
function LatencyBar({ deltas, height = 24 }: { deltas: number[]; height?: number }) {
  if (deltas.length === 0) return null;
  const max = Math.max(...deltas, 1);
  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {deltas.slice(-60).map((d, i) => (
        <div
          key={i}
          className="w-1 rounded-sm transition-all"
          style={{ height: `${Math.max(2, Math.round((d / max) * height))}px`, backgroundColor: msBgColor(d), opacity: 0.7 + (i / deltas.length) * 0.3 }}
        />
      ))}
    </div>
  );
}

// ── Request card ──────────────────────────────────────────────────────────────
function RequestCard({ req, expanded, onToggle }: {
  req: DebugRequest;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { cls, label } = contextPill(req.context);
  const deltas = req.tokens.map(t => t.deltaMs).filter(d => d > 0);
  const avgDelta = deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0;
  const tps = req.totalMs && req.tokens.length
    ? Math.round((req.tokens.length / req.totalMs) * 1000 * 10) / 10 : null;
  const lastAccumulated = req.tokens.length > 0 ? req.tokens[req.tokens.length - 1].accumulated : "";

  // Auto-scroll the token stream container while streaming
  const chunkScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded && req.status === "streaming") {
      const el = chunkScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [expanded, req.tokens.length, req.status]);

  const statusIcon =
    req.status === "streaming" ? <motion.span className="w-2 h-2 rounded-full bg-violet-400 inline-block shadow-[0_0_8px_#8b5cf6]" animate={{ opacity: [1,0.3,1] }} transition={{ duration:0.7,repeat:Infinity }}/> :
    req.status === "done"      ? <CheckCircle2 size={11} className="text-emerald-400"/> :
    req.status === "aborted"   ? <RefreshCcw size={11} className="text-amber-400"/> :
                                  <AlertCircle size={11} className="text-red-400"/>;

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors duration-300 ${expanded ? "bg-[#18181b] border-white/10 shadow-lg" : "bg-[#121214] border-white/5 hover:border-white/10"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
      >
        {statusIcon}
        <span className={`text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded border ${cls}`}>{label}</span>
        <span className="text-white/40 text-[11px] font-mono flex-1 truncate">
          {req.tokens.length > 0 ? lastAccumulated.slice(0, 45) + (lastAccumulated.length > 45 ? "…" : "") : "—"}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          {req.totalMs && <span className="text-[10px] text-white/30 font-mono">{req.totalMs}ms</span>}
          <span className="text-white/30 text-[10px] font-medium px-2 py-0.5 bg-white/5 rounded-md">{req.tokens.length}t</span>
          {expanded ? <ChevronUp size={12} className="text-white/40"/> : <ChevronDown size={12} className="text-white/40"/>}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3 border-t border-white/6 pt-2.5">

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "tokens",  value: String(req.tokens.length)       },
                  { label: "total",   value: req.totalMs ? `${req.totalMs}ms` : "…" },
                  { label: "avg/tok", value: avgDelta ? `${avgDelta}ms`       : "—" },
                  { label: "tok/s",   value: tps ? `${tps}`                   : "—" },
                ].map(s => (
                  <div key={s.label} className="bg-black/30 rounded-lg px-2 py-1.5 text-center">
                    <p className="text-white/50 text-[10px] font-mono">{s.value}</p>
                    <p className="text-white/18 text-[8px] mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Latency histogram */}
              {deltas.length > 1 && (
                <div>
                  <p className="text-white/20 text-[8px] uppercase tracking-widest mb-1.5">
                    Δ latencia por token (ms)
                  </p>
                  <div className="bg-black/30 rounded-lg p-2">
                    <LatencyBar deltas={deltas} height={28}/>
                    <div className="flex justify-between mt-1">
                      <span className={`text-[8px] ${msColor(Math.min(...deltas))}`}>
                        min {Math.min(...deltas)}ms
                      </span>
                      <span className={`text-[8px] ${msColor(Math.max(...deltas))}`}>
                        max {Math.max(...deltas)}ms
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Token stream scroll */}
              <div>
                <p className="text-white/20 text-[8px] uppercase tracking-widest mb-1.5">
                  Chunks SSE ({req.tokens.length})
                </p>
                <div ref={chunkScrollRef} className="bg-black/40 rounded-lg p-2 max-h-[100px] overflow-y-auto custom-scrollbar">
                  <p className="text-violet-300/70 text-[10px] font-mono leading-relaxed break-all whitespace-pre-wrap">
                    {req.tokens.map((t, i) => (
                      <span key={i} className="inline">
                        <span className="text-white/30" title={`+${t.deltaMs}ms`}>
                          {t.token}
                        </span>
                      </span>
                    ))}
                    {req.status === "streaming" && (
                      <motion.span
                        className="inline-block w-[2px] h-[11px] bg-violet-400 rounded-full align-middle ml-px"
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.55, repeat: Infinity }}
                      />
                    )}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cache entry row ───────────────────────────────────────────────────────────
function CacheRow({ entry, idx }: { entry: CacheEntry; idx: number }) {
  const time = new Date(entry.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.02 }}
      className="px-2.5 py-2 border-b border-white/4 last:border-0"
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-white/22 text-[8px] font-mono">{time}</span>
        <span className={`text-[8px] flex items-center gap-0.5 ${entry.usedAI ? "text-emerald-400/60" : "text-amber-400/50"}`}>
          {entry.usedAI ? <><Zap size={7}/>{entry.latencyMs}ms</> : <><WifiOff size={7}/>mock</>}
        </span>
      </div>
      <p className="text-white/28 text-[9px] truncate">{entry.en}</p>
      <p className="text-violet-300/60 text-[9px] truncate mt-0.5">{entry.es}</p>
    </motion.div>
  );
}

// ── Main DevTab ───────────────────────────────────────────────────────────────
export function DevTab() {
  const [, forceRender] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"sse" | "cache">("sse");

  // Subscribe to debugStore changes
  useEffect(() => {
    const unsub = debugStore.subscribe(() => forceRender(n => n + 1));
    return unsub;
  }, []);

  // Auto-expand the latest streaming request
  useEffect(() => {
    const latest = debugStore.requests[0];
    if (!latest) {
      setExpandedId(null);
      return;
    }
    if (latest && latest.status === "streaming") {
      setExpandedId(latest.id);
    }
  }, [
    debugStore.requests.length,
    debugStore.requests[0]?.id,
    debugStore.requests[0]?.status,
  ]);

  const stats = debugStore.getLatestStats();
  const requests = debugStore.requests;
  const cache = debugStore.cacheEntries;

  const totalRequests = requests.length;
  const streaming = requests.find(r => r.status === "streaming");

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">

      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"/>
          <span className="text-amber-400/80 text-[10px]" style={{ fontWeight: 600 }}>Dev · Debug Panel</span>
          {streaming && (
            <span className="flex items-center gap-1 bg-violet-500/12 border border-violet-500/20 rounded-full px-1.5 py-0.5 text-[8px] text-violet-400">
              <Radio size={7}/>streaming
            </span>
          )}
        </div>
        <button
          onClick={() => debugStore.clear()}
          className="flex items-center gap-1 text-[9px] text-white/22 hover:text-red-400 border border-white/8 px-2 py-0.5 rounded transition-colors"
        >
          <Trash2 size={8}/>Limpiar
        </button>
      </div>

      {/* ── Latest request stats strip ────────────────────────────────────── */}
      {stats && (
        <div className="bg-gradient-to-br from-[#18181b] to-[#121214] border border-white/10 shadow-lg rounded-xl p-3.5 mb-2">
          <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-3 flex items-center gap-1.5">
            <BarChart2 size={11}/>Última petición completada
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <Clock size={11}/>,    label: "Total",    value: `${stats.totalMs}ms`,       color: "text-white/70" },
              { icon: <Zap size={11}/>,      label: "Tokens",   value: String(stats.tokenCount),  color: "text-violet-400 font-semibold" },
              { icon: <Radio size={11}/>,    label: "tok/s",    value: String(stats.tokensPerSec), color: "text-sky-400 font-semibold"    },
              { icon: <Clock size={11}/>,    label: "Avg Δ",    value: `${stats.avgDeltaMs}ms`,    color: msColor(stats.avgDeltaMs) },
              { icon: <Clock size={11}/>,    label: "Min Δ",    value: `${stats.minDeltaMs}ms`,    color: msColor(stats.minDeltaMs) },
              { icon: <Clock size={11}/>,    label: "Max Δ",    value: `${stats.maxDeltaMs}ms`,    color: msColor(stats.maxDeltaMs) },
            ].map(s => (
              <div key={s.label} className="bg-black/20 border border-white/5 rounded-lg px-2 py-2 text-center shadow-inner hover:bg-black/30 transition-colors">
                <p className={`text-[12px] font-mono ${s.color}`}>{s.value}</p>
                <p className="text-white/30 text-[9px] mt-1 font-medium tracking-wide uppercase">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section toggle ────────────────────────────────────────────────── */}
      <div className="flex gap-1">
        {(["sse", "cache"] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] transition-all ${
              activeSection === s
                ? "bg-white/7 text-white/70 border border-white/12"
                : "text-white/28 hover:text-white/50 hover:bg-white/4"
            }`}
          >
            {s === "sse"
              ? <><Radio size={9}/>SSE Log ({totalRequests})</>
              : <><Database size={9}/>Cache ({cache.length})</>
            }
          </button>
        ))}
      </div>

      {/* ── SSE Request log ──────────────────────────────────────────────── */}
      {activeSection === "sse" && (
        <div className="space-y-2">
          {requests.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Radio size={18} className="text-white/12 mx-auto"/>
              <p className="text-white/22 text-[10px]">Sin peticiones aún</p>
              <p className="text-white/14 text-[9px]">Las llamadas a la IA local aparecerán aquí en tiempo real.</p>
            </div>
          ) : (
            requests.map(req => (
              <RequestCard
                key={req.id}
                req={req}
                expanded={expandedId === req.id}
                onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
              />
            ))
          )}
        </div>
      )}

      {/* ── Translation cache ────────────────────────────────────────────── */}
      {activeSection === "cache" && (
        <div>
          {cache.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Database size={18} className="text-white/12 mx-auto"/>
              <p className="text-white/22 text-[10px]">Cache vacío</p>
              <p className="text-white/14 text-[9px]">Las traducciones del Pipeline aparecerán aquí.</p>
            </div>
          ) : (
            <div className="bg-[#0d0e0f] border border-white/7 rounded-xl overflow-hidden">
              <div className="px-2.5 py-1.5 border-b border-white/5 flex items-center justify-between">
                <span className="text-white/22 text-[8px] uppercase tracking-widest">
                  {cache.length} entradas · más reciente primero
                </span>
                <span className="text-emerald-400/50 text-[8px]">
                  {cache.filter(c => c.usedAI).length} IA · {cache.filter(c => !c.usedAI).length} mock
                </span>
              </div>
              {cache.map((entry, i) => (
                <CacheRow key={`${entry.timestamp}-${i}`} entry={entry} idx={i}/>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="bg-[#0d0e0f] border border-white/5 rounded-xl p-2.5 space-y-1.5">
        <p className="text-white/18 text-[8px] uppercase tracking-widest mb-2">Leyenda</p>
        {[
          { dot: "bg-emerald-400", label: "< 50ms — rápido" },
          { dot: "bg-amber-400",   label: "50–150ms — normal" },
          { dot: "bg-red-400",     label: "> 150ms — lento (CPU cargada)" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${l.dot}`}/>
            <span className="text-white/28 text-[9px]">{l.label}</span>
          </div>
        ))}
        <div className="pt-1.5 border-t border-white/5 text-white/16 text-[8px] leading-relaxed">
          Δ latencia = tiempo entre tokens SSE consecutivos.<br/>
          tok/s = tokens generados por segundo.<br/>
          Abre la consola del navegador para logs de bajo nivel.
        </div>
      </div>

      <div className="h-2"/>
    </div>
  );
}
