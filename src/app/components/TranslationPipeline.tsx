// ─── TranslationPipeline — SRT Batch Mode ─────────────────────────────────────
// Captura la transcripción .srt completa del video y la traduce de una vez.
// Fallback: IA Local (8010) → proveedor configurado → Gemini → Mock
// ─────────────────────────────────────────────────────────────────────────────

import { toast } from "sonner";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Zap, TrendingUp, Database, WifiOff, RefreshCcw,
  Key, ChevronDown, ChevronRight, Copy, Check,
} from "./icons";
import { debugStore } from "../services/debugStore";
import { contentBridge } from "../services/contentBridge";
import { PROVIDER_LABELS, type AiProviderConfig } from "../services/ai-providers";

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
const TRANSLATION_PROMPT = `Actúa como un traductor experto especializado en cursos online de Udemy. Tu tarea es traducir subtítulos en formato .srt de inglés a español.

Es CRÍTICO que respetes estas reglas exactamente. Romper cualquiera corromperá el archivo:

1. SINCRONIZACIÓN ESTRICTA: Traduce bloque a bloque, en el mismo orden. NO unas, no fusiones ni separes texto entre bloques, aunque la oración quede cortada. Cada bloque traducido debe corresponder exactamente al bloque original.

2. FORMATO SRT EXACTO: Estructura por bloque:
   - Línea 1: Número de secuencia idéntico al original.
   - Línea 2: Marca de tiempo exacta sin modificar (ej: 00:00:09,680 --> 00:00:17,200).
   - Línea 3+: Texto traducido. Si el original tiene múltiples líneas de texto, mantén la misma cantidad de líneas.
   - Exactamente UNA línea en blanco entre bloques.

3. SIN ETIQUETAS NI METADATOS: Devuelve ÚNICAMENTE el SRT en texto plano. Sin \`\`\`srt, sin etiquetas XML, sin comentarios, sin saludos ni despedidas.

4. TÉRMINOS ESPECIALIZADOS EN INGLÉS: Mantén sin traducir nombres propios, marcas, herramientas, comandos, APIs, librerías, frameworks y términos del dominio cuando traducirlos reduzca precisión.

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
  if (type === "empty")     return <div className="h-[6px]" />;
  if (type === "number")    return <p className="text-violet-400 text-[10.5px] font-mono leading-tight mt-1.5 font-bold">{line}</p>;
  if (type === "timestamp") return <p className="text-[var(--usb-fg-lo)] text-[10px] font-mono leading-tight">{line}</p>;
  return <p className="text-[var(--usb-fg)] text-[11.5px] font-mono leading-relaxed">{line}</p>;
}

type StepState = "idle" | "active" | "done";

function StepNode({ index, state }: { index: number; state: StepState }) {
  const tone =
    state === "done"
      ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
      : state === "active"
        ? "bg-violet-600 border-violet-600 text-white ring-2 ring-violet-500/30"
        : "bg-[var(--usb-bg-3)] border-[var(--usb-border-mid)] text-[var(--usb-fg-lo)]";
  return (
    <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-all duration-300 text-[11px] font-mono font-bold ${tone}`}>
      {state === "done" ? <Check size={11} strokeWidth={2.6} /> : index}
    </div>
  );
}

function parseSrtPreviewBlocks(srt: string): typeof MOCK_SRT_BLOCKS {
  return String(srt || "")
    .replace(/\r/g, "")
    .trim()
    .split(/\n\n+/)
    .map((block) => block.split("\n").map((line) => line.trim()))
    .filter((lines) => lines.length >= 3 && lines[1]?.includes("-->"))
    .map((lines) => ({
      num: Number(lines[0]) || 0,
      ts: lines[1],
      text: lines.slice(2).join(" ").trim(),
    }))
    .filter((block) => block.num > 0 && block.text.length > 0);
}

// Streaming helper
async function streamWords(text: string, onUpdate: (acc: string) => void, signal?: AbortSignal): Promise<void> {
  // Show translated SRT progressively by chunks (fast for large texts)
  const lines = text.split("\n");
  const totalLines = lines.length;
  let acc = "";

  // For small texts (mock-sized), stream word by word for visual effect
  if (totalLines <= 40) {
    const tokens = text.split(/( |\n)/);
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
    return;
  }

  // For large texts, show in fast line-based chunks (~2-3 seconds total)
  const chunkSize = Math.max(4, Math.ceil(totalLines / 25));
  for (let i = 0; i < totalLines; i += chunkSize) {
    if (signal?.aborted) return;
    const chunk = lines.slice(i, i + chunkSize).join("\n");
    acc += (acc ? "\n" : "") + chunk;
    onUpdate(acc);
    await new Promise<void>(res => setTimeout(res, 80));
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type BatchPhase = "idle" | "building" | "sending" | "streaming" | "done";
type ModelSource = "local" | "provider" | "gemini" | "mock";

interface TranslationPipelineProps {
  autoTranslate: boolean;
  apiKeys?: string[];
  localConnected?: boolean;
  capturedLineCount?: number;
  lectureKey?: string;
  providerConfig?: AiProviderConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
export function TranslationPipeline({
  autoTranslate,
  apiKeys = [],
  localConnected = false,
  capturedLineCount = 0,
  lectureKey = "",
  providerConfig,
}: TranslationPipelineProps) {

  const [phase, setPhase]               = useState<BatchPhase>("idle");
  const [blockCount, setBlockCount]     = useState(0);
  const [visibleBlocks, setVisibleBlocks] = useState<typeof MOCK_SRT_BLOCKS>([]);
  const [streamedSrt, setStreamedSrt]   = useState("");
  const [latencyMs, setLatencyMs]       = useState<number | null>(null);
  const [modelUsed, setModelUsed]       = useState<ModelSource>("local");
  const [actualBackend, setActualBackend] = useState<"local" | "provider" | "gemini" | "mock" | null>(null);
  const [runCount, setRunCount]         = useState(0);
  const [showPrompt, setShowPrompt]     = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const abortRef     = useRef<AbortController | null>(null);
  const hasAutoRun   = useRef(false);
  const lastRequestedCountRef = useRef(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiKeysRef   = useRef(apiKeys);
  const localRef     = useRef(localConnected);
  const providerRef  = useRef(providerConfig);

  useEffect(() => { apiKeysRef.current = apiKeys; }, [apiKeys]);
  useEffect(() => { localRef.current = localConnected; }, [localConnected]);
  useEffect(() => { providerRef.current = providerConfig; }, [providerConfig]);

  // Track the real cue total as it streams in. It only ever grows, so the
  // header keeps up with late-arriving cues instead of freezing on the first
  // partial count. Resets per lecture in the effect below.
  const [capturedTotal, setCapturedTotal] = useState(0);
  useEffect(() => {
    if (capturedLineCount > 0) {
      setCapturedTotal((prev) => Math.max(prev, Math.max(1, Math.round(capturedLineCount))));
    }
  }, [capturedLineCount]);
  useEffect(() => { setCapturedTotal(0); }, [lectureKey]);

  const totalBlocks = capturedTotal > 0 ? capturedTotal : TOTAL_BLOCKS;
  // Read totalBlocks from a ref inside the message effect so it can stay
  // subscribed for the whole lecture instead of re-subscribing on every cue.
  const totalBlocksRef = useRef(totalBlocks);
  useEffect(() => { totalBlocksRef.current = totalBlocks; }, [totalBlocks]);

  const pickModel = (): ModelSource => {
    if (localRef.current) return "local";
    const cfg = providerRef.current;
    const providerReady = cfg
      ? (cfg.kind === "local" ? Boolean(cfg.baseUrl) : Boolean(cfg.baseUrl && cfg.apiKey))
      : false;
    if (providerReady) return "provider";
    if (apiKeysRef.current.some(Boolean)) return "gemini";
    return "mock";
  };

  const payloadKb = ((totalBlocks * 82) / 1024).toFixed(1); // ~82 chars/block avg

  // ── Run pipeline ────────────────────────────────────────────────────────────
  const runPipeline = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    if (capturedLineCount <= 0) {
      setPhase("idle");
      setBlockCount(0);
      setVisibleBlocks([]);
      setStreamedSrt("");
      setErrorMessage("Esperando subtítulos EN capturados…");
      return;
    }

    setPhase("building");
    setBlockCount(0);
    setStreamedSrt("");
    setVisibleBlocks([]);
    setLatencyMs(null);
    setErrorMessage("");
    setModelUsed(pickModel());

    await contentBridge.sendToContent({ type: "RUN_PIPELINE_TRANSLATION", payload: { lectureKey } });
  }, [capturedLineCount, lectureKey]);

  useEffect(() => {
    abortRef.current?.abort();
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    retryCountRef.current = 0;
    setPhase("idle");
    setBlockCount(0);
    setVisibleBlocks([]);
    setStreamedSrt("");
    setLatencyMs(null);
    setErrorMessage("");
    hasAutoRun.current = false;
    lastRequestedCountRef.current = 0;
  }, [lectureKey]);

  useEffect(() => {
    let sendingTimer: ReturnType<typeof setTimeout> | null = null;
    let sendingElapsed = 0;
    let sendingInterval: ReturnType<typeof setInterval> | null = null;

    const unsubscribe = contentBridge.onMessageFromContent((msg) => {
      if (msg.type === "PIPELINE_TRANSLATION_SOURCE") {
        const payload = msg.payload as { sourceSrt?: unknown; sourceCueCount?: unknown; source?: unknown; lectureKey?: unknown } | undefined;
        const payloadLectureKey = typeof payload?.lectureKey === "string" ? payload.lectureKey : "";
        if (lectureKey && payloadLectureKey && payloadLectureKey !== lectureKey) return;
        const sourceSrt = typeof payload?.sourceSrt === "string" ? payload.sourceSrt : "";
        const count = typeof payload?.sourceCueCount === "number" && Number.isFinite(payload.sourceCueCount)
          ? Math.max(0, Math.round(payload.sourceCueCount))
          : 0;
        const blocks = parseSrtPreviewBlocks(sourceSrt);

        setBlockCount(count);
        setVisibleBlocks(blocks.slice(0, 3));
        setErrorMessage("");

        if (count <= 0) {
          setPhase("idle");
          setErrorMessage("Esperando que Udemy exponga subtítulos EN para traducir.");
        } else {
          setPhase("sending");
          sendingElapsed = 0;
          // Timeout: if no response in 5min, show error
          sendingTimer = setTimeout(() => {
            setPhase("idle");
            setErrorMessage("Timeout: la IA no respondió. Pulsa Retraducir para reintentar.");
            if (sendingInterval) { clearInterval(sendingInterval); sendingInterval = null; }
          }, 300_000);
          // Update text to show progress phases
          setErrorMessage("");
          sendingInterval = setInterval(() => {
            sendingElapsed += 4;
            if (sendingElapsed <= 4) {
              setErrorMessage("Conectando con IA…");
            } else if (sendingElapsed <= 12) {
              setErrorMessage("Esperando respuesta de Gemini…");
            } else {
              setErrorMessage(`Gemini procesando ${count} bloques… (${sendingElapsed}s)`);
            }
          }, 4000);
        }
        return;
      }

      if (msg.type !== "PIPELINE_TRANSLATION_RESULT") return;

      // Clear sending timeout/interval since we got a response
      if (sendingTimer) { clearTimeout(sendingTimer); sendingTimer = null; }
      if (sendingInterval) { clearInterval(sendingInterval); sendingInterval = null; }
      setErrorMessage("");

      const payload = msg.payload as {
        ok?: unknown;
        srt?: unknown;
        blockCount?: unknown;
        sourceCueCount?: unknown;
        error?: unknown;
        lectureKey?: unknown;
        backend?: unknown;
      } | undefined;
      const payloadLectureKey = typeof payload?.lectureKey === "string" ? payload.lectureKey : "";
      if (lectureKey && payloadLectureKey && payloadLectureKey !== lectureKey) return;

      // Reflect the backend the background actually used.
      const reportedBackend = typeof payload?.backend === "string" ? payload.backend : "";
      if (reportedBackend === "local" || reportedBackend === "provider" || reportedBackend === "gemini" || reportedBackend === "mock") {
        setActualBackend(reportedBackend);
      } else {
        setActualBackend(null);
      }

      const ok = Boolean(payload?.ok);
      const translatedSrt = typeof payload?.srt === "string" ? payload.srt : "";
      const count = typeof payload?.blockCount === "number" && Number.isFinite(payload.blockCount)
        ? Math.max(0, Math.round(payload.blockCount))
        : typeof payload?.sourceCueCount === "number" && Number.isFinite(payload.sourceCueCount)
          ? Math.max(0, Math.round(payload.sourceCueCount))
          : totalBlocksRef.current;

      if (!ok || !translatedSrt.trim()) {
        // Auto-retry once after 10s if we haven't retried yet
        if (retryCountRef.current < 1 && capturedLineCount > 0) {
          retryCountRef.current += 1;
          const errorDetail = typeof payload?.error === "string" && payload.error.trim()
            ? payload.error.trim()
            : "Error en la traducción";
          setErrorMessage(`${errorDetail} — Reintentando en 10s…`);
          let countdown = 10;
          if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); }
          const countdownInterval = setInterval(() => {
            countdown -= 1;
            if (countdown > 0) {
              setErrorMessage(`${errorDetail} — Reintentando en ${countdown}s…`);
            }
          }, 1000);
          countdownIntervalRef.current = countdownInterval;
          retryTimerRef.current = setTimeout(() => {
            clearInterval(countdownInterval);
            countdownIntervalRef.current = null;
            setErrorMessage("Reintentando traducción…");
            setPhase("sending");
            void contentBridge.sendToContent({ type: "RUN_PIPELINE_TRANSLATION", payload: { lectureKey } });
          }, 10_000);
          return;
        }
        retryCountRef.current = 0;
        setPhase("idle");
        setBlockCount(Math.min(count, totalBlocksRef.current));
        setErrorMessage(
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error.trim()
            : "No se pudo traducir el SRT todavía."
        );
        return;
      }

      retryCountRef.current = 0;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const chosen = pickModel();
      const t0 = performance.now();
      setModelUsed(chosen);
      setBlockCount(Math.min(count, totalBlocksRef.current));
      setStreamedSrt("");
      setErrorMessage("");
      setPhase("streaming");

      void streamWords(
        translatedSrt,
        acc => { if (!ctrl.signal.aborted) setStreamedSrt(acc); },
        ctrl.signal
      ).then(() => {
        if (ctrl.signal.aborted) return;
        const ms = Math.round(performance.now() - t0);
        setLatencyMs(ms);
        setPhase("done");
        debugStore.addCacheEntry({
          en: `[SRT Batch: ${count} bloques]`,
          es: translatedSrt,
          latencyMs: ms,
          usedAI: chosen !== "mock",
          timestamp: Date.now(),
        });
      });
    });

    return () => {
      unsubscribe();
      if (sendingTimer) clearTimeout(sendingTimer);
      if (sendingInterval) clearInterval(sendingInterval);
      if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
    };
  }, [lectureKey]);

  // Auto-run after the captured SRT count settles.
  useEffect(() => {
    if (!autoTranslate) {
      hasAutoRun.current = false;
      lastRequestedCountRef.current = 0;
      return;
    }
    if (capturedLineCount <= 0) return;
    // Once we've successfully started a pipeline run, don't re-trigger on count changes
    if (hasAutoRun.current) return;

    const t = setTimeout(() => {
      hasAutoRun.current = true;
      lastRequestedCountRef.current = Math.max(1, Math.round(capturedLineCount));
      void runPipeline();
    }, 2200);

    return () => clearTimeout(t);
  }, [autoTranslate, capturedLineCount, runPipeline]);

  // Pause when autoTranslate turns off
  useEffect(() => {
    if (!autoTranslate) {
      abortRef.current?.abort();
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
      retryCountRef.current = 0;
      setPhase("idle");
      setBlockCount(0);
      setStreamedSrt("");
      setErrorMessage("");
      hasAutoRun.current = false;
      lastRequestedCountRef.current = 0;
    }
  }, [autoTranslate]);

  // Manual re-run trigger
  useEffect(() => {
    if (runCount === 0) return;
    retryCountRef.current = 0;
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    runPipeline();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runCount]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(TRANSLATION_PROMPT);
    } catch {
      toast.error("No se pudo copiar el prompt");
      return;
    }
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
    provider:   providerConfig ? PROVIDER_LABELS[providerConfig.kind] : "Proveedor",
    gemini:     "Gemini",
    mock:       "Mock · sin conexión",
  };

  // Prefer the backend the background actually used for the last run over the
  // locally-guessed one, so the badge never claims "Gemini" when the configured
  // provider did the work (or vice versa).
  const effectiveModelLabel = actualBackend
    ? actualBackend === "local" ? "IA Local · 8010"
      : actualBackend === "gemini" ? "Gemini"
        : actualBackend === "provider" ? (providerConfig ? PROVIDER_LABELS[providerConfig.kind] : "Proveedor")
          : MODEL_LABEL[modelUsed]
    : MODEL_LABEL[modelUsed];

  // Parse streamed SRT into lines for rendering
  const srtLines = streamedSrt.split("\n");
  const displayedBlockCount = Math.min(blockCount, totalBlocks);

  // ── Render ──────────────────────────────────────────────────────────────────
  const step1: StepState = isBuilding ? "active" : phase !== "idle" ? "done" : "idle";
  const step2: StepState = isSending || isStreaming ? "active" : isDone ? "done" : "idle";
  const step3: StepState = isDone ? "done" : isStreaming ? "active" : "idle";

  return (
    <div className="space-y-2.5">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 min-h-[28px]">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[var(--usb-bg-3)] border border-[var(--usb-border)] text-amber-500">
          {isActive
            ? <motion.span className="w-2 h-2 rounded-full bg-current" />
            : <Zap size={14} />}
        </span>
        <p className="text-[12.5px] font-bold tracking-tight text-[var(--usb-fg)] truncate">Pipeline SRT · EN → ES</p>
        <div className="ml-auto flex items-center gap-2">
          {isDone && latencyMs !== null && (
            <>
              <span className="flex items-center gap-1 text-[10px] text-[var(--usb-fg-lo)]">
                <TrendingUp size={10} />{totalBlocks} bloques
              </span>
              <span className="flex items-center gap-1 text-[10px] text-violet-400" style={{ fontWeight: 600 }}>
                <Zap size={10} />{(latencyMs / 1000).toFixed(1)}s
              </span>
            </>
          )}
          {(isDone || phase === "idle") && (
            <button
              onClick={() => setRunCount(n => n + 1)}
              disabled={!autoTranslate}
              className="kx-chip flex items-center gap-1 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1 rounded-full"
              style={{ fontWeight: 600 }}
            >
              <RefreshCcw size={10} />Retraducir
            </button>
          )}
        </div>
      </div>

      {/* ── Timeline card ────────────────────────────────────────────────── */}
      <div className="kx-card rounded-2xl overflow-hidden relative border border-[var(--usb-border)]">

        {/* Spine */}
        <div className="absolute left-[27px] top-8 bottom-8 w-px bg-[var(--usb-border-mid)] pointer-events-none" />

        {/* STEP 1 — Transcripción */}
        <div className="px-4 py-3.5 relative z-10">
          <div className="flex items-center gap-3">
            <StepNode index={1} state={step1} />
            <span className={`kx-slate flex-1 text-[12px] font-semibold ${phase !== "idle" ? "text-[var(--usb-fg)]" : "text-[var(--usb-fg-lo)]"}`}>
              {isBuilding ? "Leyendo transcripción…" : phase !== "idle" ? "Transcripción .srt · Udemy" : "Transcripción"}
            </span>
            {phase !== "idle" && (
              <span className="kx-num text-[10.5px] shrink-0 text-violet-400 font-bold">
                {displayedBlockCount} / {totalBlocks}
              </span>
            )}
          </div>

          <div className="ml-9 mt-2">
            {phase === "idle" && (
              <p className={`text-[11.5px] ${errorMessage ? "text-amber-400" : "text-[var(--usb-fg-lo)]"}`}>
                {errorMessage || "Esperando inicio del video…"}
              </p>
            )}

            {phase !== "idle" && visibleBlocks.map((block, i) => (
              <motion.div
                key={block.num}
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`py-2 ${i < visibleBlocks.length - 1 ? "border-b border-[var(--usb-divider)]" : ""}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="kx-num text-violet-400 text-[10.5px] font-bold">{block.num}</span>
                  <span className="kx-num text-[var(--usb-fg-lo)] text-[10px]">{block.ts}</span>
                </div>
                <p className="text-[var(--usb-fg-mid)] text-[11.5px] leading-snug line-clamp-1">{block.text}</p>
              </motion.div>
            ))}

            {phase !== "idle" && displayedBlockCount > 3 && (
              <p className="text-[var(--usb-fg-lo)] text-[10.5px] pt-1.5 font-medium">+ {displayedBlockCount - 3} bloques más…</p>
            )}
          </div>
        </div>

        {/* STEP 2 — Modelo IA */}
        <div className={`px-4 py-3.5 relative z-10 border-y border-[var(--usb-divider)] transition-colors duration-300 ${
          step2 === "active" ? "bg-[var(--usb-accent-soft)]" : "bg-transparent"
        }`}>
          <div className="flex items-center gap-3">
            <StepNode index={2} state={step2} />
            <span className={`text-[12px] flex-1 min-w-0 truncate ${step2 === "idle" ? "text-[var(--usb-fg-mid)]" : "text-[var(--usb-fg)]"}`} style={{ fontWeight: 600 }}>
              {isSending   ? (errorMessage || `Enviando payload .srt · ${payloadKb}KB…`) :
               isStreaming ? "Generando traducción SRT…" :
               isDone      ? effectiveModelLabel :
               "Modelo IA"}
            </span>

            {(isSending || isStreaming) && (
              <span className="text-[10.5px] text-violet-400 shrink-0 flex items-center gap-1 font-semibold">
                {localRef.current ? <><Database size={11} />Local</> : apiKeys.some(Boolean) ? <><Key size={11} />Gemini</> : <><WifiOff size={11} />Mock</>}
              </span>
            )}

            {isDone && latencyMs !== null && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`text-[10px] shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full border shadow-sm ${
                  modelUsed === "mock"
                    ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                    : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                }`}
                style={{ fontWeight: 600 }}
              >
                {modelUsed === "mock"
                  ? <><WifiOff size={10} />mock</>
                  : <><Zap size={10} />{(latencyMs / 1000).toFixed(1)}s</>}
              </motion.span>
            )}
          </div>

          <AnimatePresence>
            {(isSending || isStreaming) && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="mt-2.5 ml-9"
              >
                <div className="h-[3.5px] bg-[var(--usb-border)] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-violet-600 rounded-full"
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

        {/* STEP 3 — Salida */}
        <div className="px-4 py-3.5 relative z-10">
          <div className="flex items-center gap-3">
            <StepNode index={3} state={step3} />
            <span className={`kx-slate flex-1 text-[12px] font-semibold ${step3 === "idle" ? "text-[var(--usb-fg-lo)]" : "text-[var(--usb-fg)]"}`}>
              {isStreaming ? "Traduciendo SRT…" : isDone ? "SRT Español · Completo" : "Salida .srt"}
            </span>
            {isDone && (
              <span className="kx-num text-emerald-400 text-[10.5px] font-bold">
                {totalBlocks} bloques
              </span>
            )}
          </div>

          <div className="ml-9 mt-2">
            <AnimatePresence mode="wait">
              {(isStreaming || isDone) && streamedSrt ? (
                <motion.div
                  key="srt-output"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-[var(--usb-bg-4)] border border-[var(--usb-border)] rounded-lg overflow-hidden"
                >
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--usb-divider)]">
                    <span className="kx-num text-[var(--usb-fg-lo)] text-[10px] uppercase">subtitulos_es.srt</span>
                    {isStreaming && (
                      <motion.span
                        className="w-1 h-3 bg-violet-600 rounded-sm"
                      />
                    )}
                  </div>
                  <div
                    className="px-2.5 py-2 overflow-y-auto custom-scrollbar-thin"
                    style={{ maxHeight: isDone ? "9rem" : "7rem" }}
                  >
                    {srtLines.map((line, i) => (
                      <SrtOutputLine key={i} line={line} />
                    ))}
                    {isStreaming && (
                      <motion.span
                        className="inline-block ml-[1px] w-[2px] h-[12px] bg-violet-600 rounded-sm align-middle"
                      />
                    )}
                  </div>
                  {isDone && (
                    <div className="px-2.5 pb-2">
                      <p className="kx-num text-[var(--usb-fg-lo)] text-[10px]">
                        {totalBlocks} bloques · {streamedSrt.split(" ").length} tokens
                      </p>
                    </div>
                  )}
                </motion.div>
              ) : isBuilding || isSending ? (
                <div className="bg-[var(--usb-bg-4)] border border-[var(--usb-border)] rounded-lg p-2.5 space-y-1.5">
                  {[55, 40, 65].map((w, i) => (
                    <motion.div
                      key={i}
                      className="h-2 opacity-40 rounded bg-[var(--usb-border-mid)]"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[var(--usb-fg-lo)] text-[11px]">Pendiente…</p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Prompt ───────────────────────────────────────────────────────── */}
      <div className="kx-card overflow-hidden">
        <button
          onClick={() => setShowPrompt(v => !v)}
          className="w-full flex items-center gap-2 px-3.5 py-3 hover:bg-[var(--usb-accent-soft)] transition-colors"
        >
          <span className="kx-slate text-[var(--usb-fg-mid)] flex-1 text-left">
            Prompt de traducción
          </span>
          <span className="text-violet-400 text-[11px]" style={{ fontWeight: 600 }}>
            {showPrompt ? "ocultar" : "ver"}
          </span>
          <motion.div
            animate={{ rotate: showPrompt ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={12} className="text-[var(--usb-fg-lo)]" />
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
              <div className="border-t border-[var(--usb-divider)]">
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <p className="text-[var(--usb-fg-lo)] text-[10px]">
                    Copia y pega en Gemini · ChatGPT · Claude
                  </p>
                  <button
                    onClick={handleCopyPrompt}
                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors ${
                      promptCopied
                        ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                        : "text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg)] border-[var(--usb-border-mid)] hover:bg-[var(--usb-accent-soft)]"
                    }`}
                    style={{ fontWeight: 600 }}
                  >
                    {promptCopied ? <><Check size={10} />Copiado</> : <><Copy size={10} />Copiar</>}
                  </button>
                </div>

                <div className="mx-3.5 mb-3.5 bg-[var(--usb-bg-4)] border border-[var(--usb-border)] rounded-lg overflow-hidden">
                  <pre className="px-3 py-2.5 text-[10px] text-[var(--usb-fg-mid)] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
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
