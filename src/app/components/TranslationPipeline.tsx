// ─── TranslationPipeline ──────────────────────────────────────────────────────
// Visualizes the block-based EN → AI → ES subtitle translation pipeline.
// Uses SSE streaming so the Spanish translation types out token-by-token,
// exactly as the local AI generates it. Falls back to mock when offline.

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Zap, TrendingUp, Database, WifiOff, Radio } from "lucide-react";
import { translateLineStream } from "../services/localAI";
import { debugStore } from "../services/debugStore";
import { contentBridge } from "../services/contentBridge";

// ── Fallback translations for offline preview ─────────────────────────────────
const FALLBACK: Record<string, string> = {
  "Java is a high-level, object-oriented programming language":
    "Java es un lenguaje de programación de alto nivel y orientado a objetos",
  "desarrollado por Sun Microsystems en 1995":
    "desarrollado por Sun Microsystems en 1995",
  "que sigue el principio 'Write Once, Run Anywhere'":
    "que sigue el principio 'escribe una vez, ejecuta en cualquier lugar'",
  "The JVM (Java Virtual Machine) is what makes this possible":
    "La JVM (Máquina Virtual de Java) es lo que hace esto posible",
};

// Slow-type a mock translation word-by-word to simulate streaming
async function mockStream(
  text: string,
  onToken: (token: string, acc: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const words = text.split(" ");
  let acc = "";
  for (const word of words) {
    if (signal?.aborted) return;
    await new Promise<void>((res) => setTimeout(res, 45 + Math.random() * 55));
    if (signal?.aborted) return;
    acc += (acc ? " " : "") + word;
    onToken(word, acc);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type PipelineStatus = "idle" | "capturing" | "streaming" | "done";

interface PipelineEntry {
  id: string;
  en: string;
  es: string;
  latencyMs: number;
  usedAI: boolean;
}

interface TranslationPipelineProps {
  incomingBlock: string | null;
  autoTranslate: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
export function TranslationPipeline({
  incomingBlock,
  autoTranslate,
}: TranslationPipelineProps) {
  const [status, setStatus]       = useState<PipelineStatus>("idle");
  const [currentEn, setCurrentEn] = useState("");
  const [currentEs, setCurrentEs] = useState("");
  const [latency, setLatency]     = useState<number | null>(null);
  const [usedAI, setUsedAI]       = useState(false);
  const [history, setHistory]     = useState<PipelineEntry[]>([]);
  const [stats, setStats]         = useState({ total: 0, aiCalls: 0, totalMs: 0 });

  // Ref to abort in-flight stream when a new block arrives
  const abortRef  = useRef<AbortController | null>(null);
  const lastBlock  = useRef<string>("");

  // ── Pipeline runner ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!incomingBlock || !autoTranslate) return;
    if (incomingBlock === lastBlock.current) return;
    lastBlock.current = incomingBlock;

    // Cancel any in-flight stream
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let cancelled = false;

    (async () => {
      // ── Step 1: Capturing ────────────────────────────────────────────────
      setCurrentEn(incomingBlock);
      setCurrentEs("");
      setLatency(null);
      setStatus("capturing");
      void contentBridge.sendToContent({ type: "OVERLAY_TEXT_UPDATE", payload: { text: "" } }).catch(() => undefined);
      await new Promise<void>((r) => setTimeout(r, 180));
      if (cancelled || ctrl.signal.aborted) return;

      // ── Step 2: Stream (real AI or mock fallback) ────────────────────────
      setStatus("streaming");
      const t0 = performance.now();
      let didUseAI = false;
      let finalEs  = "";

      // Attempt real streaming AI
      const result = await translateLineStream(
        incomingBlock,
        (_, accumulated) => {
          if (!cancelled && !ctrl.signal.aborted) {
            setCurrentEs(accumulated);
          }
        },
        ctrl.signal
      );

      if (ctrl.signal.aborted || cancelled) return;

      if (result.success && result.content.trim()) {
        finalEs  = result.content.trim();
        didUseAI = true;
        setCurrentEs(finalEs);
      } else {
        // Fallback: mock-stream the translation word by word
        const mockText = FALLBACK[incomingBlock] ?? incomingBlock;
        await mockStream(
          mockText,
          (_, acc) => { if (!cancelled && !ctrl.signal.aborted) setCurrentEs(acc); },
          ctrl.signal
        );
        if (ctrl.signal.aborted || cancelled) return;
        finalEs  = mockText;
        didUseAI = false;
      }

      const ms = Math.round(performance.now() - t0);
      setLatency(ms);
      setUsedAI(didUseAI);
      setStatus("done");
      void contentBridge.sendToContent({ type: "OVERLAY_TEXT_UPDATE", payload: { text: finalEs } }).catch(() => undefined);

      const entry: PipelineEntry = {
        id: `${t0}-${incomingBlock.slice(0, 8)}`,
        en: incomingBlock,
        es: finalEs,
        latencyMs: ms,
        usedAI: didUseAI,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 6));
      setStats((prev) => ({
        total:   prev.total + 1,
        aiCalls: prev.aiCalls + (didUseAI ? 1 : 0),
        totalMs: prev.totalMs + ms,
      }));

      // Emit to Dev tab debug store
      debugStore.addCacheEntry({
        en: incomingBlock,
        es: finalEs,
        latencyMs: ms,
        usedAI: didUseAI,
        timestamp: Date.now(),
      });
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingBlock, autoTranslate]);

  const avgMs  = stats.total > 0 ? Math.round(stats.totalMs / stats.total) : null;
  const aiPct  = stats.total > 0 ? Math.round((stats.aiCalls / stats.total) * 100) : null;
  const isLive = status === "streaming";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2.5">

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <p className="text-white/22 text-[9px] uppercase tracking-widest flex items-center gap-1.5">
          {isLive && (
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          )}
          Pipeline EN → ES
        </p>
        <div className="ml-auto flex items-center gap-2.5">
          {stats.total > 0 && (
            <>
              <span className="flex items-center gap-1 text-[9px] text-white/28">
                <TrendingUp size={8} />{stats.total} bloques
              </span>
              {avgMs !== null && (
                <span className="flex items-center gap-1 text-[9px] text-violet-400/55">
                  <Zap size={8} />{avgMs}ms
                </span>
              )}
              {aiPct !== null && (
                <span className="flex items-center gap-1 text-[9px] text-emerald-400/55">
                  <Database size={8} />{aiPct}% IA
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Pipeline card ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-[#121214] to-[#0a0a0c] border border-white/10 rounded-xl overflow-hidden shadow-lg relative">
        {/* Pipeline connecting line graphic */}
        <div className="absolute left-6 top-6 bottom-6 w-px bg-gradient-to-b from-sky-500/20 via-violet-500/20 to-emerald-500/20 pointer-events-none" />

        {/* Step 1 — EN Capture */}
        <div className="px-4 py-3 relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              animate={status === "capturing" ? { scale: [1, 1.3, 1], boxShadow: ["0 0 0px #0ea5e9", "0 0 10px #0ea5e9", "0 0 0px #0ea5e9"] } : {}}
              transition={{ duration: 1.5, repeat: status === "capturing" ? Infinity : 0 }}
              className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors bg-[#121214] ${
                status !== "idle" ? "border-sky-500/50" : "border-white/10"
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${status !== "idle" ? "bg-sky-400" : "bg-white/20"}`}/>
            </motion.div>
            <span className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              status !== "idle" ? "text-sky-400" : "text-white/20"
            }`}>
              Capturado · Udemy
            </span>
          </div>
          <div className="ml-6 pl-1 border-l-2 border-transparent">
            <AnimatePresence mode="wait">
              {currentEn ? (
                <motion.p
                  key={currentEn}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-white/80 text-[12px] leading-relaxed font-medium whitespace-pre-wrap"
                >
                  {currentEn}
                </motion.p>
              ) : (
                <p className="text-white/20 text-[11px] italic">Esperando bloque de subtítulos…</p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Step 2 — AI divider */}
        <div className={`px-4 py-2 relative z-10 transition-colors duration-500 ${
          isLive ? "bg-violet-500/5 backdrop-blur-sm border-y border-violet-500/10" : "border-y border-white/5 bg-white/2"
        }`}>
          <div className="flex items-center gap-2">
             <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors bg-[#121214] ${
                isLive ? "border-violet-500/50" : "border-white/10"
              }`}>
               <Radio
                size={8}
                className={`transition-colors ${isLive ? "text-violet-400" : "text-white/20"}`}
              />
             </div>
            <span className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              isLive ? "text-violet-400" : "text-white/20"
            }`}>
              {isLive ? "IA Local · Procesando..." : "IA Local (Offline/Idle)"}
            </span>

            {/* Done badge */}
            {status === "done" && latency !== null && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`text-[9px] font-medium shrink-0 flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full border ${
                  usedAI ? "text-emerald-400 border-emerald-500/20" : "text-amber-400 border-amber-500/20"
                }`}
              >
                {usedAI ? <><Zap size={8} />{latency}ms</> : <><WifiOff size={8} />mock</>}
              </motion.span>
            )}
          </div>
        </div>

        {/* Step 3 — ES streaming output */}
        <div className="px-4 py-3 relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              animate={status === "done" ? { scale: [1, 1.2, 1], boxShadow: ["0 0 0px #10b981", "0 0 10px #10b981", "0 0 0px #10b981"] } : {}}
              transition={{ duration: 0.8 }}
              className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors bg-[#121214] ${
                status === "done" ? "border-emerald-500/50" :
                isLive           ? "border-violet-400/50"  : "border-white/10"
              }`}
            >
               <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                 status === "done" ? "bg-emerald-400" :
                 isLive ? "bg-violet-400" : "bg-white/20"
               }`}/>
            </motion.div>
            <span className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${
              status === "done" ? "text-emerald-400" :
              isLive            ? "text-violet-300"  : "text-white/20"
            }`}>
              {isLive ? "Traduciendo..." : "Subtítulo Generado"}
            </span>
          </div>

          <div className="ml-6 pl-1 border-l-2 border-transparent min-h-[1.5rem] flex items-start">
            <AnimatePresence mode="wait">
              {(isLive || status === "done") && currentEs ? (
                <motion.p
                  key={`es-${currentEn}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`text-[13px] leading-relaxed font-medium whitespace-pre-wrap ${
                    status === "done" ? "text-violet-200" : "text-violet-300/80"
                  }`}
                >
                  {currentEs}
                  {/* Blinking cursor while streaming */}
                  {isLive && (
                    <motion.span
                      className="inline-block ml-[2px] w-[3px] h-[15px] bg-violet-400 rounded-sm align-middle shadow-[0_0_8px_#a78bfa] translate-y-[-1px]"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                    />
                  )}
                </motion.p>
              ) : status === "capturing" ? (
                <motion.div
                  animate={{ opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="h-3.5 rounded bg-white/10 w-3/5 mt-0.5"
                />
              ) : status === "idle" ? (
                <p className="text-white/20 text-[11px] italic">Pendiente…</p>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Recent history ─────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div>
          <p className="text-white/22 text-[9px] uppercase tracking-widest mb-1.5">
            Historial · {history.length} bloque{history.length !== 1 ? "s" : ""}
          </p>
          <div className="bg-[#0d0e0f] border border-white/7 rounded-xl overflow-hidden">
            {history.slice(0, 5).map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i === 0 ? 0 : 0 }}
                className={`flex gap-2.5 px-3 py-2 ${
                  i < Math.min(history.length - 1, 4) ? "border-b border-white/4" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white/22 text-[9px] truncate">{entry.en}</p>
                  <p className="text-white/58 text-[10px] truncate mt-0.5">{entry.es}</p>
                </div>
                <span className={`text-[9px] shrink-0 mt-0.5 ${
                  entry.usedAI ? "text-emerald-400/50" : "text-amber-400/45"
                }`}>
                  {entry.usedAI ? `⚡${entry.latencyMs}ms` : "mock"}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
