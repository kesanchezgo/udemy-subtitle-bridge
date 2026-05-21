// ─── TranslationPipeline — SRT Batch Mode ─────────────────────────────────────
// Captura la transcripción .srt completa del video y la traduce de una vez.
// Fallback: IA Local (8010) → Gemini Key 1 → Gemini Key 2 → Mock
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Zap, TrendingUp, Database, WifiOff, Radio, RefreshCcw,
  Key, ChevronDown, ChevronRight, Copy, Check,
} from "lucide-react";
import { debugStore } from "../services/debugStore";

// ── Real SRT blocks (first 5 from actual course file) ─────────────────────────
const MOCK_SRT_BLOCKS = [
  { num: 1,  ts: "00:00:09,680 --> 00:00:17,200", text: "A problem many software engineers are facing today is in writing good, clean, and well-designed code." },
  { num: 2,  ts: "00:00:17,880 --> 00:00:25,120", text: "The code works correctly and perhaps efficiently too, but due to poor design, the code is not maintainable." },
  { num: 3,  ts: "00:00:25,600 --> 00:00:31,840", text: "That is, it is not easy to understand, and if it is not easy to understand, it is not easily extendable." },
  { num: 4,  ts: "00:00:32,640 --> 00:00:36,360", text: "That's the maintenance problem and it can be a huge nightmare." },
  { num: 5,  ts: "00:00:37,080 --> 00:00:44,760", text: "By poor design I mean not following proper design principles and best practices, and this often leads" },
];

// Total blocks in the real file
const TOTAL_BLOCKS = 248;

// ── Mock translated SRT output (exact format the AI would return) ──────────────
const MOCK_ES_SRT = `1
00:00:09,680 --> 00:00:17,200
Un problema que muchos ingenieros de software enfrentan hoy en día es escribir código bueno, limpio y bien diseñado.

2
00:00:17,880 --> 00:00:25,120
El código funciona correctamente y quizás también de forma eficiente, pero por un diseño deficiente, no es mantenible.

3
00:00:25,600 --> 00:00:31,840
Es decir, no es fácil de entender, y si no es fácil de entender, tampoco es fácilmente extensible.

4
00:00:32,640 --> 00:00:36,360
Ese es el problema de mantenimiento y puede convertirse en una pesadilla enorme.

5
00:00:37,080 --> 00:00:44,760
Por diseño deficiente me refiero a no seguir los principios de diseño adecuados y las mejores prácticas, lo que a menudo lleva

6
00:00:44,760 --> 00:00:52,280
a varias rondas de refactorización o mejora del código, lo que genera una pérdida de tiempo valioso para la empresa.

7
00:00:52,280 --> 00:00:53,040
para la empresa.

8
00:00:53,880 --> 00:01:00,640
Así que con cada lanzamiento de software, en lugar de agregar nuevas funcionalidades, se invierte una cantidad significativa de tiempo

9
00:01:00,640 --> 00:01:04,160
en refactorizar el código mal diseñado.

10
00:01:05,080 --> 00:01:08,800
En gran medida, esto tiene que ver con la forma en que nos enseñan a programar.`;

// ── Refined translation prompt ─────────────────────────────────────────────────
const TRANSLATION_PROMPT = `Actúa como un traductor técnico experto especializado en desarrollo de software. Tu tarea es traducir subtítulos en formato .srt de inglés a español.

Es CRÍTICO que respetes estas reglas exactamente. Romper cualquiera corromperá el archivo:

1. SINCRONIZACIÓN ESTRICTA: Traduce bloque a bloque, en el mismo orden. NO unas, no fusiones ni separes texto entre bloques, aunque la oración quede cortada. Cada bloque traducido debe corresponder exactamente al bloque original.

2. FORMATO SRT EXACTO: Estructura por bloque:
   - Línea 1: Número de secuencia idéntico al original.
   - Línea 2: Marca de tiempo exacta sin modificar (ej: 00:00:09,680 --> 00:00:17,200).
   - Línea 3+: Texto traducido. Si el original tiene múltiples líneas de texto, mantén la misma cantidad de líneas.
   - Exactamente UNA línea en blanco entre bloques.

3. SIN ETIQUETAS NI METADATOS: Devuelve ÚNICAMENTE el SRT en texto plano. Sin \`\`\`srt, sin etiquetas XML, sin comentarios, sin saludos ni despedidas.

4. TÉRMINOS TÉCNICOS EN INGLÉS: Mantén sin traducir: Spring Boot, Spring Cloud, JVM, JPA, REST API, microservices, endpoints, multi-threading, streams, arrays, interfaces, annotations, beans, dependency injection, Hibernate, Maven, Gradle, Docker, Kubernetes, CI/CD, y todo nombre de tecnología o framework.

5. ESPAÑOL NATURAL: Usa español latino neutro, fluido y técnicamente preciso. Evita calcos del inglés.

[PEGA TU TEXTO SRT AQUÍ]`;

// ── SRT line type detector & renderer ─────────────────────────────────────────
type LineType = "number" | "timestamp" | "text" | "empty";

function getSrtLineType(line: string): LineType {
  if (!line.trim()) return "empty";
  if (/^\d+$/.test(line.trim())) return "number";
  if (line.includes("-->")) return "timestamp";
  return "text";
}

function SrtOutputLine({ line }: { line: string }) {
  const type = getSrtLineType(line);
  if (type === "empty")     return <div className="h-[5px]" />;
  if (type === "number")    return <p className="text-sky-400/80 text-[9px] font-mono leading-tight mt-1" style={{ fontWeight: 700 }}>{line}</p>;
  if (type === "timestamp") return <p className="text-amber-400/60 text-[9px] font-mono leading-tight">{line}</p>;
  return <p className="text-white/75 text-[10px] font-mono leading-relaxed">{line}</p>;
}

// Streaming helper
async function streamWords(text: string, onUpdate: (acc: string) => void, signal?: AbortSignal): Promise<void> {
  // Stream word by word but respect newlines
  const tokens = text.split(/( |\n)/);
  let acc = "";
  for (const token of tokens) {
    if (signal?.aborted) return;
    if (token === " " || token === "\n") {
      await new Promise<void>(res => setTimeout(res, 18 + Math.random() * 30));
    } else {
      await new Promise<void>(res => setTimeout(res, 30 + Math.random() * 50));
    }
    if (signal?.aborted) return;
    acc += token;
    onUpdate(acc);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type BatchPhase = "idle" | "building" | "sending" | "streaming" | "done";
type ModelSource = "local" | "gemini_k1" | "gemini_k2" | "mock";

interface TranslationPipelineProps {
  autoTranslate: boolean;
  apiKey1?: string;
  apiKey2?: string;
  localConnected?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
export function TranslationPipeline({
  autoTranslate,
  apiKey1 = "",
  apiKey2 = "",
  localConnected = false,
}: TranslationPipelineProps) {

  const [phase, setPhase]               = useState<BatchPhase>("idle");
  const [blockCount, setBlockCount]     = useState(0);
  const [visibleBlocks, setVisibleBlocks] = useState<typeof MOCK_SRT_BLOCKS>([]);
  const [streamedSrt, setStreamedSrt]   = useState("");
  const [latencyMs, setLatencyMs]       = useState<number | null>(null);
  const [modelUsed, setModelUsed]       = useState<ModelSource>("local");
  const [runCount, setRunCount]         = useState(0);
  const [showPrompt, setShowPrompt]     = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const abortRef     = useRef<AbortController | null>(null);
  const hasAutoRun   = useRef(false);
  const apiKey1Ref   = useRef(apiKey1);
  const apiKey2Ref   = useRef(apiKey2);
  const localRef     = useRef(localConnected);

  useEffect(() => { apiKey1Ref.current = apiKey1; }, [apiKey1]);
  useEffect(() => { apiKey2Ref.current = apiKey2; }, [apiKey2]);
  useEffect(() => { localRef.current = localConnected; }, [localConnected]);

  const pickModel = (): ModelSource => {
    if (localRef.current)   return "local";
    if (apiKey1Ref.current) return "gemini_k1";
    if (apiKey2Ref.current) return "gemini_k2";
    return "mock";
  };

  const payloadKb = ((TOTAL_BLOCKS * 82) / 1024).toFixed(1); // ~82 chars/block avg

  // ── Run pipeline ────────────────────────────────────────────────────────────
  const runPipeline = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setPhase("building");
    setBlockCount(0);
    setStreamedSrt("");
    setVisibleBlocks([]);
    setLatencyMs(null);

    // ── Phase 1: BUILDING — accumulate SRT blocks ─────────────────────────
    const shown: typeof MOCK_SRT_BLOCKS = [];
    for (let i = 0; i < MOCK_SRT_BLOCKS.length; i++) {
      if (ctrl.signal.aborted) return;
      await new Promise<void>(res => setTimeout(res, 220));
      if (ctrl.signal.aborted) return;
      const count = Math.round(((i + 1) / MOCK_SRT_BLOCKS.length) * TOTAL_BLOCKS);
      setBlockCount(count);
      if (i < 3) {
        shown.push(MOCK_SRT_BLOCKS[i]);
        setVisibleBlocks([...shown]);
      }
    }
    setBlockCount(TOTAL_BLOCKS);

    // ── Phase 2: SENDING ──────────────────────────────────────────────────
    if (ctrl.signal.aborted) return;
    setPhase("sending");
    const chosen = pickModel();
    setModelUsed(chosen);
    await new Promise<void>(res => setTimeout(res, 950));

    // ── Phase 3: STREAMING translated SRT ────────────────────────────────
    if (ctrl.signal.aborted) return;
    setPhase("streaming");
    const t0 = performance.now();

    await streamWords(
      MOCK_ES_SRT,
      acc => { if (!ctrl.signal.aborted) setStreamedSrt(acc); },
      ctrl.signal
    );

    if (ctrl.signal.aborted) return;

    const ms = Math.round(performance.now() - t0);
    setLatencyMs(ms);
    setPhase("done");

    debugStore.addCacheEntry({
      en: `[SRT Batch: ${TOTAL_BLOCKS} bloques]`,
      es: MOCK_ES_SRT,
      latencyMs: ms,
      usedAI: chosen !== "mock",
      timestamp: Date.now(),
    });
  }, []);

  // Auto-run when autoTranslate enables
  useEffect(() => {
    if (!autoTranslate) { hasAutoRun.current = false; return; }
    if (hasAutoRun.current) return;
    hasAutoRun.current = true;
    const t = setTimeout(() => runPipeline(), 1500);
    return () => clearTimeout(t);
  }, [autoTranslate, runPipeline]);

  // Pause when autoTranslate turns off
  useEffect(() => {
    if (!autoTranslate) {
      abortRef.current?.abort();
      setPhase("idle");
      setBlockCount(0);
      setStreamedSrt("");
      hasAutoRun.current = false;
    }
  }, [autoTranslate]);

  // Manual re-run trigger
  useEffect(() => {
    if (runCount === 0) return;
    runPipeline();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runCount]);

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(TRANSLATION_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2200);
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isBuilding  = phase === "building";
  const isSending   = phase === "sending";
  const isStreaming = phase === "streaming";
  const isDone      = phase === "done";
  const isActive    = isBuilding || isSending || isStreaming;

  const MODEL_LABEL: Record<ModelSource, string> = {
    local:      "IA Local · 8010",
    gemini_k1:  "Gemini Flash · Key 1",
    gemini_k2:  "Gemini Flash · Key 2",
    mock:       "Mock · sin conexión",
  };

  // Parse streamed SRT into lines for rendering
  const srtLines = streamedSrt.split("\n");

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2.5">

      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <p className="text-white/22 text-[9px] uppercase tracking-widest flex items-center gap-1.5">
          {isActive && (
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block shrink-0"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          )}
          Pipeline SRT · EN → ES
        </p>
        <div className="ml-auto flex items-center gap-2">
          {isDone && latencyMs !== null && (
            <>
              <span className="flex items-center gap-1 text-[9px] text-white/28">
                <TrendingUp size={8} />{TOTAL_BLOCKS} bloques
              </span>
              <span className="flex items-center gap-1 text-[9px] text-violet-400/60">
                <Zap size={8} />{(latencyMs / 1000).toFixed(1)}s
              </span>
            </>
          )}
          {(isDone || phase === "idle") && (
            <button
              onClick={() => setRunCount(n => n + 1)}
              disabled={!autoTranslate}
              className="flex items-center gap-1 text-[9px] text-white/25 hover:text-white/55 disabled:opacity-30 disabled:cursor-not-allowed border border-white/8 hover:border-white/15 px-1.5 py-0.5 rounded transition-colors"
            >
              <RefreshCcw size={7} />Retranducir
            </button>
          )}
        </div>
      </div>

      {/* ── Pipeline card ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-[#121214] to-[#0a0a0c] border border-white/10 rounded-xl overflow-hidden shadow-lg relative">

        {/* Connecting spine */}
        <div className="absolute left-6 top-5 bottom-5 w-px bg-gradient-to-b from-sky-500/20 via-violet-500/20 to-emerald-500/20 pointer-events-none" />

        {/* ── STEP 1: Captura SRT ────────────────────────────────────────── */}
        <div className="px-4 py-3 relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              animate={isBuilding
                ? { scale: [1, 1.35, 1], boxShadow: ["0 0 0px #0ea5e9","0 0 10px #0ea5e9","0 0 0px #0ea5e9"] }
                : {}}
              transition={{ duration: 1.4, repeat: isBuilding ? Infinity : 0 }}
              className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors bg-[#121214] ${
                phase !== "idle" ? "border-sky-500/50" : "border-white/10"
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${phase !== "idle" ? "bg-sky-400" : "bg-white/20"}`} />
            </motion.div>

            <span className={`text-[10px] uppercase tracking-widest transition-colors flex-1 ${phase !== "idle" ? "text-sky-400" : "text-white/20"}`} style={{ fontWeight: 600 }}>
              {isBuilding ? "Leyendo transcripción…" : phase !== "idle" ? "Transcripción .srt · Udemy" : "Transcripción"}
            </span>

            {phase !== "idle" && (
              <span className={`text-[9px] font-mono shrink-0 tabular-nums ${blockCount >= TOTAL_BLOCKS ? "text-sky-400" : "text-sky-400/55"}`}>
                {blockCount} / {TOTAL_BLOCKS}
              </span>
            )}
          </div>

          {/* SRT block preview */}
          <div className="ml-6 space-y-0">
            {phase === "idle" && (
              <p className="text-white/20 text-[11px] italic">Esperando inicio del video…</p>
            )}

            {phase !== "idle" && visibleBlocks.map((block, i) => (
              <motion.div
                key={block.num}
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`py-1.5 ${i < visibleBlocks.length - 1 ? "border-b border-white/4" : ""}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sky-400/70 text-[8px] font-mono" style={{ fontWeight: 700 }}>{block.num}</span>
                  <span className="text-amber-400/45 text-[8px] font-mono">{block.ts}</span>
                </div>
                <p className="text-white/40 text-[9.5px] leading-snug line-clamp-1">{block.text}</p>
              </motion.div>
            ))}

            {phase !== "idle" && blockCount > 3 && (
              <p className="text-white/18 text-[9px] pt-1">+ {blockCount - 3} bloques más…</p>
            )}
          </div>
        </div>

        {/* ── STEP 2: Modelo IA ─────────────────────────────────────────── */}
        <div className={`px-4 py-2.5 relative z-10 transition-colors duration-500 ${
          isSending || isStreaming
            ? "bg-violet-500/5 border-y border-violet-500/10"
            : "border-y border-white/5 bg-white/[0.015]"
        }`}>
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors bg-[#121214] ${
              isSending || isStreaming ? "border-violet-500/50" : "border-white/10"
            }`}>
              <Radio size={8} className={`transition-colors ${isSending || isStreaming ? "text-violet-400" : "text-white/20"}`} />
            </div>

            <span className={`text-[10px] tracking-wide flex-1 transition-colors ${isSending || isStreaming ? "text-violet-300" : "text-white/20"}`} style={{ fontWeight: 600 }}>
              {isSending   ? `Enviando payload .srt · ${payloadKb}KB…` :
               isStreaming ? "Generando traducción SRT…" :
               isDone      ? MODEL_LABEL[modelUsed] :
               "Modelo IA"}
            </span>

            {(isSending || isStreaming) && (
              <span className="text-[9px] text-violet-400/55 shrink-0 flex items-center gap-1">
                {apiKey1 ? <><Key size={7} />Gemini</> : <><Database size={7} />Local</>}
              </span>
            )}

            {isDone && latencyMs !== null && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`text-[9px] shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                  modelUsed === "mock"
                    ? "text-amber-400 border-amber-500/20 bg-amber-500/8"
                    : "text-emerald-400 border-emerald-500/20 bg-emerald-500/8"
                }`}
                style={{ fontWeight: 600 }}
              >
                {modelUsed === "mock"
                  ? <><WifiOff size={7} />mock</>
                  : <><Zap size={7} />{(latencyMs / 1000).toFixed(1)}s</>}
              </motion.span>
            )}
          </div>

          {/* Progress bar */}
          <AnimatePresence>
            {(isSending || isStreaming) && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mt-2 ml-6"
              >
                <div className="h-0.5 bg-white/6 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full"
                    initial={{ width: "0%" }}
                    animate={{
                      width: isSending ? "28%" : ["30%", "52%", "70%", "87%", "96%"]
                    }}
                    transition={
                      isStreaming
                        ? { duration: 5, ease: "easeOut", times: [0, 0.2, 0.4, 0.7, 1] }
                        : { duration: 0.8, ease: "easeOut" }
                    }
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── STEP 3: Salida SRT en español ────────────────────────────── */}
        <div className="px-4 py-3 relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              animate={isDone
                ? { scale: [1, 1.2, 1], boxShadow: ["0 0 0px #10b981","0 0 10px #10b981","0 0 0px #10b981"] }
                : {}}
              transition={{ duration: 0.8 }}
              className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors bg-[#121214] ${
                isDone ? "border-emerald-500/50" : isStreaming ? "border-violet-400/50" : "border-white/10"
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isDone ? "bg-emerald-400" : isStreaming ? "bg-violet-400" : "bg-white/20"
              }`} />
            </motion.div>
            <span className={`text-[10px] uppercase tracking-widest transition-colors ${
              isDone ? "text-emerald-400" : isStreaming ? "text-violet-300" : "text-white/20"
            }`} style={{ fontWeight: 600 }}>
              {isStreaming ? "Traduciendo SRT…" : isDone ? "SRT Español · Completo" : "Salida .srt"}
            </span>
            {isDone && (
              <span className="ml-auto text-emerald-400/50 text-[9px]">
                {TOTAL_BLOCKS} bloques listos
              </span>
            )}
          </div>

          {/* SRT output box */}
          <div className="ml-6">
            <AnimatePresence mode="wait">
              {(isStreaming || isDone) && streamedSrt ? (
                <motion.div
                  key="srt-output"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-[#07080a] border border-white/6 rounded-lg overflow-hidden"
                >
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/5">
                    <span className="text-white/20 text-[8px] font-mono uppercase tracking-widest">subtitulos_es.srt</span>
                    {isStreaming && (
                      <motion.span
                        className="w-1 h-3 bg-violet-400 rounded-sm"
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.45, repeat: Infinity }}
                      />
                    )}
                  </div>
                  <div
                    className="px-2.5 py-2 overflow-y-auto"
                    style={{ maxHeight: isDone ? "9rem" : "7rem" }}
                  >
                    {srtLines.map((line, i) => (
                      <SrtOutputLine key={i} line={line} />
                    ))}
                    {isStreaming && (
                      <motion.span
                        className="inline-block ml-[1px] w-[2px] h-[12px] bg-violet-400 rounded-sm align-middle shadow-[0_0_6px_#a78bfa]"
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                      />
                    )}
                  </div>
                  {isDone && (
                    <div className="px-2.5 pb-2">
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-white/18 text-[9px] font-mono"
                      >
                        {TOTAL_BLOCKS} bloques · {streamedSrt.split(" ").length} tokens
                      </motion.p>
                    </div>
                  )}
                </motion.div>
              ) : isBuilding || isSending ? (
                <div className="bg-[#07080a] border border-white/6 rounded-lg p-2.5 space-y-1.5">
                  {[55, 40, 65].map((w, i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.06, 0.18, 0.06] }}
                      transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.18 }}
                      className="h-2 rounded bg-white/10"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-white/20 text-[11px] italic">Pendiente…</p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Expandable Prompt section ─────────────────────────────────────── */}
      <div className="rounded-xl border border-white/6 bg-[#0d0e0f] overflow-hidden">
        <button
          onClick={() => setShowPrompt(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/3 transition-colors"
        >
          <span className="text-white/35 text-[9px] uppercase tracking-widest flex-1 text-left" style={{ fontWeight: 600 }}>
            Prompt de traducción
          </span>
          <span className="text-violet-400/50 text-[9px]">
            {showPrompt ? "ocultar" : "ver →"}
          </span>
          <motion.div
            animate={{ rotate: showPrompt ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={11} className="text-white/25" />
          </motion.div>
        </button>

        <AnimatePresence>
          {showPrompt && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/5">
                {/* Copy button */}
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-white/22 text-[9px]">
                    Copia y pega en Gemini · ChatGPT · Claude
                  </p>
                  <button
                    onClick={handleCopyPrompt}
                    className={`flex items-center gap-1 text-[9px] px-2 py-1 rounded-lg border transition-all ${
                      promptCopied
                        ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/8"
                        : "text-white/35 hover:text-white/65 border-white/8 hover:border-white/18"
                    }`}
                    style={{ fontWeight: 600 }}
                  >
                    {promptCopied ? <><Check size={9} />Copiado</> : <><Copy size={9} />Copiar</>}
                  </button>
                </div>

                {/* Prompt text */}
                <div className="mx-3 mb-3 bg-[#070809] border border-white/6 rounded-lg overflow-hidden">
                  <pre className="px-3 py-2.5 text-[9px] text-white/45 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
                    {TRANSLATION_PROMPT}
                  </pre>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
