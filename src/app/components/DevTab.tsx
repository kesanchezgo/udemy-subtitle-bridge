// ─── Dev Tab ──────────────────────────────────────────────────────────────────
// Hidden debug panel accessible by clicking the settings icon.
// Shows: SSE token stream log, per-token latencies, translation cache.

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trash2, ChevronDown, ChevronUp, Zap, Clock,
  Database, Radio, BarChart2, RefreshCcw,
  WifiOff, CheckCircle2, AlertCircle, Icon, type IconName,
} from "./icons";
import { debugStore, type DebugRequest, type CacheEntry } from "../services/debugStore";
import { useDockTheme } from "../contexts/ThemeContext";

// ── Helpers ───────────────────────────────────────────────────────────────────
type Tone = (dark: string, light: string) => string;
function msInk(ms: number, t: Tone): string {
  if (ms < 50)  return t("#4ade9f", "#047857");
  if (ms < 150) return t("#fbbf45", "#a15207");
  return t("#fb7185", "#be123c");
}
function msBgColor(ms: number): string {
  if (ms < 50)  return "#059669";
  if (ms < 150) return "#d97706";
  return "#e11d48";
}

function contextPill(ctx: string, isDark: boolean) {
  const isMock = ctx.endsWith(":mock");
  const baseCtx = isMock ? ctx.replace(/:mock$/, "") : ctx;
  const darkMap: Record<string, string> = {
    "translate":    "bg-[#6d4aff]/15 text-[#b7a6ff] border-[#6d4aff]/30",
    "eval-question":"bg-white/8 text-white/70 border-white/15",
    "eval-code":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    "mock":         "bg-amber-500/12 text-amber-400 border-amber-500/22",
    "unknown":      "bg-white/8 text-white/40 border-white/12",
  };
  const lightMap: Record<string, string> = {
    "translate":    "bg-[#6d4aff]/10 text-[#5b37e8] border-[#6d4aff]/25",
    "eval-question":"bg-black/5 text-[#3d3a38]/80 border-black/12",
    "eval-code":    "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
    "mock":         "bg-amber-500/10 text-amber-700 border-amber-500/20",
    "unknown":      "bg-black/5 text-[#3d3a38]/60 border-black/10",
  };
  const map = isDark ? darkMap : lightMap;
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

const TONES = {
  violet: { hue: "#6d4aff", dark: "#b7a6ff", light: "#5b37e8" },
  sky:    { hue: "#0284c7", dark: "#5cc8fb", light: "#0369a1" },
  amber:  { hue: "#d97706", dark: "#fbbf45", light: "#a15207" },
  green:  { hue: "#059669", dark: "#4ade9f", light: "#047857" },
} as const;

function DevTitle({ icon, tone = "amber", children, right }: { icon: IconName; tone?: keyof typeof TONES; children: React.ReactNode; right?: React.ReactNode }) {
  const { t } = useDockTheme();
  const c = TONES[tone];
  return (
    <div className="flex items-center gap-2.5 min-h-[28px]">
      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
        style={{
          background: `color-mix(in srgb, ${c.hue} 16%, var(--usb-bg-3))`,
          borderColor: `color-mix(in srgb, ${c.hue} 38%, var(--usb-border))`,
          color: t(c.dark, c.light),
        }}>
        <Icon name={icon} size={15} weight="duotone" />
      </span>
      <span className="text-[12.5px] font-bold tracking-tight text-[var(--usb-fg-hi)] flex-1 min-w-0 truncate">{children}</span>
      {right}
    </div>
  );
}

function StatTile({ label, value, ink }: { label: string; value: string; ink?: string }) {
  return (
    <div className="kx-card-flat rounded-2xl px-2 py-3 text-center">
      <p className="text-[13px] font-mono font-bold tabular-nums text-[var(--usb-fg-hi)]" style={ink ? { color: ink } : undefined}>{value}</p>
      <p className="text-[10.5px] mt-1 font-semibold text-[var(--usb-fg-mid)]">{label}</p>
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  const { t } = useDockTheme();
  return (
    <div className="kx-card text-center py-8 px-4 space-y-2">
      <span className="w-11 h-11 rounded-2xl mx-auto flex items-center justify-center border"
        style={{
          background: "color-mix(in srgb, #6d4aff 20%, var(--usb-bg-3))",
          borderColor: "color-mix(in srgb, #6d4aff 45%, var(--usb-border))",
          color: t("#b7a6ff", "#5b37e8"),
        }}>
        <Icon name={icon} size={22} weight="duotone" />
      </span>
      <p className="text-[13px] font-bold tracking-tight text-[var(--usb-fg-hi)] pt-1">{title}</p>
      <p className="text-[12px] max-w-[240px] mx-auto text-[var(--usb-fg-mid)] leading-relaxed">{sub}</p>
    </div>
  );
}

// ── Request card ──────────────────────────────────────────────────────────────
function RequestCard({ req, expanded, onToggle }: {
  req: DebugRequest;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { isDark, t } = useDockTheme();
  const { cls, label } = contextPill(req.context, isDark);
  const deltas = req.tokens.map(tk => tk.deltaMs).filter(d => d > 0);
  const avgDelta = deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0;
  const tps = req.totalMs && req.tokens.length
    ? Math.round((req.tokens.length / req.totalMs) * 1000 * 10) / 10 : null;
  const lastAccumulated = req.tokens.length > 0 ? req.tokens[req.tokens.length - 1].accumulated : "";

  const chunkScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded && req.status === "streaming") {
      const el = chunkScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [expanded, req.tokens.length, req.status]);

  const statusIcon =
    req.status === "streaming" ? <motion.span className="w-2 h-2 rounded-full bg-[#6d4aff] inline-block" animate={{ opacity: [1,0.3,1] }} transition={{ duration:0.7,repeat:Infinity }}/> :
    req.status === "done"      ? <CheckCircle2 size={13} className="text-[#059669]"/> :
    req.status === "aborted"   ? <RefreshCcw size={13} className="text-[#d97706]"/> :
                                  <AlertCircle size={13} className="text-[#e11d48]"/>;

  return (
    <div className="kx-card rounded-2xl overflow-hidden transition-all duration-200 border border-[var(--usb-border)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 transition-colors text-left hover:bg-[var(--usb-accent-soft)]"
      >
        {statusIcon}
        <span className={`text-[11px] font-bold tracking-wide px-2.5 py-0.5 rounded-full border ${cls}`}>{label}</span>
        <span className="text-[12px] font-mono flex-1 truncate text-[var(--usb-fg-mid)]">
          {req.tokens.length > 0 ? lastAccumulated.slice(0, 45) + (lastAccumulated.length > 45 ? "…" : "") : "—"}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {req.totalMs && <span className="text-[11px] font-mono text-[var(--usb-fg-lo)] font-semibold">{req.totalMs}ms</span>}
          <span className="kx-chip text-[11px] font-bold px-2.5 py-0.5 rounded-full">{req.tokens.length}t</span>
          {expanded ? <ChevronUp size={14} className="text-[var(--usb-fg-lo)]"/> : <ChevronDown size={14} className="text-[var(--usb-fg-lo)]"/>}
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
            <div className="px-4 pb-4 space-y-3.5 border-t border-[var(--usb-divider)] pt-3.5">
              <div className="grid grid-cols-4 gap-2">
                <StatTile label="tokens"  value={String(req.tokens.length)} />
                <StatTile label="total"   value={req.totalMs ? `${req.totalMs}ms` : "…"} />
                <StatTile label="avg/tok" value={avgDelta ? `${avgDelta}ms` : "—"} />
                <StatTile label="tok/s"   value={tps ? `${tps}` : "—"} />
              </div>

              {deltas.length > 1 && (
                <div>
                  <p className="text-[11.5px] mb-2 font-semibold text-[var(--usb-fg-mid)]">Δ latencia por token (ms)</p>
                  <div className="kx-card-flat rounded-2xl p-3">
                    <LatencyBar deltas={deltas} height={28}/>
                    <div className="flex justify-between mt-2">
                      <span className="text-[10.5px] font-mono font-semibold" style={{ color: msInk(Math.min(...deltas), t) }}>min {Math.min(...deltas)}ms</span>
                      <span className="text-[10.5px] font-mono font-semibold" style={{ color: msInk(Math.max(...deltas), t) }}>max {Math.max(...deltas)}ms</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-[11.5px] mb-2 font-semibold text-[var(--usb-fg-mid)]">Chunks SSE ({req.tokens.length})</p>
                <div ref={chunkScrollRef} className="kx-card-flat rounded-2xl p-3 max-h-[120px] overflow-y-auto custom-scrollbar">
                  <p className="text-[11.5px] font-mono leading-relaxed break-all whitespace-pre-wrap text-[var(--usb-fg-mid)]">
                    {req.tokens.map((tItem, i) => (
                      <span key={i} className="inline" title={`+${tItem.deltaMs}ms`}>{tItem.token}</span>
                    ))}
                    {req.status === "streaming" && (
                      <motion.span
                        className="inline-block w-[2px] h-[11px] bg-[#6d4aff] rounded-full align-middle ml-px"
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
  const { t } = useDockTheme();
  const time = new Date(entry.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.02 }}
      className="px-4 py-3 border-b last:border-0 border-[var(--usb-divider)]"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10.5px] font-mono text-[var(--usb-fg-lo)]">{time}</span>
        <span className={`text-[10.5px] flex items-center gap-1 font-semibold ${entry.usedAI ? t("text-emerald-400", "text-emerald-700") : t("text-amber-400", "text-amber-700")}`}>
          {entry.usedAI ? <><Zap size={10}/>{entry.latencyMs}ms</> : <><WifiOff size={10}/>mock</>}
        </span>
      </div>
      <p className="text-[11.5px] truncate text-[var(--usb-fg-mid)]">{entry.en}</p>
      <p className="text-[12px] truncate mt-0.5 font-semibold" style={{ color: t("#b7a6ff", "#5b37e8") }}>{entry.es}</p>
    </motion.div>
  );
}

// ── Main DevTab ───────────────────────────────────────────────────────────────
export function DevTab() {
  const { t } = useDockTheme();
  const [, forceRender] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"sse" | "cache">("sse");

  useEffect(() => {
    const unsub = debugStore.subscribe(() => forceRender(n => n + 1));
    return unsub;
  }, []);

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
  ]);

  const stats = debugStore.getLatestStats();
  const requests = debugStore.requests;
  const cache = debugStore.cacheEntries;

  const totalRequests = requests.length;
  const streaming = requests.find(r => r.status === "streaming");

  return (
    <div className="kx-page kx-cap flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <DevTitle icon="code" tone="violet" right={
        <>
          {streaming && (
            <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold" style={{ background: "color-mix(in srgb, #6d4aff 16%, transparent)", color: t("#b7a6ff", "#5b37e8") }}>
              <Radio size={10}/>streaming
            </span>
          )}
          <button onClick={() => debugStore.clear()} className="kx-chip flex items-center gap-1 text-[10.5px] px-2.5 py-1 rounded-full hover:!text-red-500">
            <Trash2 size={10}/>Limpiar
          </button>
        </>
      }>Dev · Debug Panel</DevTitle>

      {/* ── Latest request stats ──────────────────────────────────────────── */}
      {stats && (
        <div className="kx-card rounded-2xl p-4 space-y-3.5 border border-[var(--usb-border)]">
          <DevTitle icon="barChart2" tone="violet">Última petición completada</DevTitle>
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile label="Total"  value={`${stats.totalMs}ms`} />
            <StatTile label="Tokens" value={String(stats.tokenCount)} ink={t("#b7a6ff", "#5b37e8")} />
            <StatTile label="tok/s"  value={String(stats.tokensPerSec)} ink={t("#b7a6ff", "#5b37e8")} />
            <StatTile label="Avg Δ"  value={`${stats.avgDeltaMs}ms`} ink={msInk(stats.avgDeltaMs, t)} />
            <StatTile label="Min Δ"  value={`${stats.minDeltaMs}ms`} ink={msInk(stats.minDeltaMs, t)} />
            <StatTile label="Max Δ"  value={`${stats.maxDeltaMs}ms`} ink={msInk(stats.maxDeltaMs, t)} />
          </div>
        </div>
      )}

      {/* ── Section toggle ────────────────────────────────────────────────── */}
      <div className="kx-seg" role="tablist">
        {(["sse", "cache"] as const).map(sec => {
          const active = activeSection === sec;
          return (
            <button
              key={sec}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveSection(sec)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] transition-colors ${active ? "kx-tab-on" : "text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)]"}`}
            >
              {active && (
                <motion.span layoutId="devSectionPill" className="kx-seg-pill"
                  transition={{ type: "spring", stiffness: 460, damping: 36 }} />
              )}
              <span className="relative flex items-center gap-1.5" style={{ fontWeight: active ? 600 : 500 }}>
                {sec === "sse"
                  ? <><Radio size={13}/>SSE Log ({totalRequests})</>
                  : <><Database size={13}/>Cache ({cache.length})</>}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── SSE Request log ──────────────────────────────────────────────── */}
      {activeSection === "sse" && (
        <div className="space-y-2.5">
          {requests.length === 0 ? (
            <EmptyState icon="radio" title="Sin peticiones aún" sub="Las llamadas a la IA local aparecerán aquí en tiempo real." />
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
            <EmptyState icon="database" title="Caché vacía" sub="Las traducciones del Pipeline aparecerán aquí." />
          ) : (
            <div className="kx-card rounded-2xl overflow-hidden border border-[var(--usb-border)]">
              <div className="px-4 py-3 border-b border-[var(--usb-divider)] flex items-center justify-between bg-[var(--usb-bg-2)]/30">
                <span className="text-[12px] font-bold text-[var(--usb-fg-mid)]">
                  {cache.length} entradas · más reciente primero
                </span>
                <span className={`text-[11.5px] font-bold px-2 py-0.5 rounded-full ${t("text-emerald-400 bg-emerald-500/10", "text-emerald-700 bg-emerald-500/15")}`}>
                  {cache.filter(c => c.usedAI).length} IA · {cache.filter(c => !c.usedAI).length} mock
                </span>
              </div>
              <div className="divide-y divide-[var(--usb-divider)]">
                {cache.map((entry, idx) => (
                  <CacheRow key={entry.id ?? `cache-${idx}`} entry={entry} idx={idx} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="kx-card p-4 space-y-3">
        <DevTitle icon="timer" tone="violet">Leyenda de rendimiento</DevTitle>
        <div className="space-y-2">
          {[
            { dot: "#059669", label: "< 50ms — rápido" },
            { dot: "#d97706", label: "50–150ms — normal" },
            { dot: "#e11d48", label: "> 150ms — lento (CPU cargada)" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.dot }}/>
              <span className="text-[12px] font-medium text-[var(--usb-fg-hi)]">{l.label}</span>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-[var(--usb-divider)] text-[11.5px] leading-relaxed text-[var(--usb-fg-mid)]">
          Δ latencia = tiempo entre tokens SSE consecutivos.<br/>
          tok/s = tokens generados por segundo.<br/>
          Abre la consola del navegador para logs de bajo nivel.
        </div>
      </div>

      <div className="h-2"/>
    </div>
  );
}
