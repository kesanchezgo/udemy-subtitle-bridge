import { fieldCls, textareaCls } from "./settings/SettingsKit";
import { TIMED_TRANSCRIPT, bloomTaskLabel, vocabularyCandidateTarget } from "../../shared/prompts";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Target, Sparkles, Wand2, Check, Edit3, ArrowRight, Brain,
  CheckCircle2, Circle, RotateCcw, X, Zap, FlipHorizontal,
  ChevronLeft, ChevronRight, Info, FileDown,
  FolderSync, Send, Loader2, Wifi, WifiOff, BookOpen,
  Repeat2, Lock, ChevronDown, Package, Rocket, Diamond, Flame, Download, FastForward, History,
  BookMarked, RefreshCw, Settings2, ClipboardCopy, ExternalLink, Languages,
  HelpCircle, Plus, Icon, Glyph, splitLeadingMarker
} from "./icons";
import type { IconName } from "./icons";
import { FrameMarks } from "./AppLogo";
import { motion, AnimatePresence } from "motion/react";
import { evaluateActiveAnswer, evaluateCodeSolution, evaluateActiveAnswerStream, evaluateCodeSolutionStream, type AIRating, type StudyAIContext } from "../services/localAI";
import { buildAnkiApkg, downloadApkg, PRISM_MEDIA_FILES } from "../services/ankiApkg";
import { buildConceptSpec, sanitizeDeckSegment } from "../services/ankiDesign";
import { cacheService } from "../services/cacheService";
import { aiBlockedMessage, type AiState } from "../hooks/useAiHealth";
import { AI_PROVIDER_STORAGE_KEY, describeProviderFailure, getAiProviderConfig } from "../services/ai-providers";
import {
  DEFAULT_VOCAB_CONFIG, loadVocabConfig, parseVocabularyPayload, saveVocabConfig,
  type VocabConfig,
} from "../services/vocabularyService";
import { VocabularyPanel } from "./study/VocabularyPanel";
import { LessonDoubtPanel } from "./study/LessonDoubtPanel";
import {
  DOUBT_TRANSCRIPT_CHARS, MAX_DOUBT_CARDS, cardFrontKey, doubtCardHtml, doubtCardId, doubtThreadId,
  sanitizeStoredDoubts, savedDoubtCount, snapshotDoubtCard, updateDoubtTurn, upsertDoubtThread,
  type DoubtTranscript, type LessonDoubtContext, type LessonDoubtKind, type LessonDoubtThread,
} from "../services/lessonDoubts";
// Datos de demo SOLO en desarrollo: import estático dejaría el módulo (y sus
// palabras/historial de ejemplo) dentro del bundle de producción.
/** Fábrica del generador de demo: en DEV carga el módulo; en prod devuelve null. */
async function prototypeVocabularyFor(lang: string) {
  // Prototipo: la vista previa es un build de producción sin runtime de
  // extensión, así que la demo sustituye a la transcripción real (en el repo: solo DEV).
  if (!import.meta.env?.DEV) return null; // en el repo: solo DEV
  try {
    const mod = await import("../services/prototypeData");
    return mod.prototypeVocabulary(lang);
  } catch {
    return null;
  }
}
/** §5: transcripción y respuestas de demostración para las dudas (misma condición que el vocabulario). */
async function prototypeDoubtDemoFor() {
  if (!import.meta.env?.DEV) return null; // en el repo: solo DEV
  try {
    const mod = await import("../services/prototypeData");
    return mod.prototypeDoubtDemo();
  } catch {
    return null;
  }
}
import { knownVocabularyIn, vocabularyMatches } from "../services/vocabularySession";
import { ExportModule, exportFieldCls, exportGhostBtnCls, exportLabelCls, exportPrimaryBtnCls } from "./study/ExportModule";
import { historyService, slugify, type QuestionAttempt, type StoredAnkiCard, type StoredStudyContent } from "../services/historyService";
import { objectivesService, type ObjectivesCacheEntry } from "../services/objectivesService";
import { refineCustomObjective, type GeneratedObjective } from "../services/localAI";
import { HistoryPanel } from "./HistoryPanel";
import { usePersistedState } from "../hooks/usePersistedState";
import { useDockTheme } from "../contexts/ThemeContext";
import { contentBridge, type BridgeMessage } from "../services/contentBridge";
import { checkPlanState, conceptCoverage, orderPresented, pickNextCheckQuestion } from "../services/checkPlan";
import { chromeLocalStorage, chromeStorage } from "../services/chromeStorage";
import { conceptDeckPath, kinemaTags } from "../services/ankiDesign";
import {
  buildSessionNoteMarkdown, buildSessionNotePath, buildRawSrtNoteMarkdown, buildRawSrtNotePath,
  openObsidianNote, sessionExportKey, isSessionExported, exportSessionUpdateToObsidian,
  DEFAULT_OBSIDIAN_EXPORT_CONFIG, exportSessionToObsidian, loadCreatedMocs,
  loadObsidianExportConfig, loadObsidianExportedNotes, openObsidianUri,
  buildObsidianNewUri, buildProgramMocMarkdown, buildProgramMocPath,
  saveCreatedMocs, saveObsidianExportConfig, saveObsidianExportedNotes,
  slugifyVault,
  type ObsidianExportConfig, type ObsidianSessionData,
} from "../services/obsidianExport";
import { initGeminiKeys, normalizeGeminiKeys, saveGeminiKeys, setGeminiKeysSync } from "../../gemini-config";
import { toast } from "sonner";
import { celebrate } from "./CelebrationOverlay";
import { getStreak } from "../services/streak";
import { getProgress, recordActivity } from "../services/progress";

import { Session } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = "objective" | "generating" | "result";
type ConfidenceLevel = "confused" | "partial" | "clear" | "mastered";
type CardType = "concepto" | "aplicacion" | "codigo" | "entrevista" | "comparacion" | "proceso";

interface FeedbackState {
  status: "idle" | "loading" | "streaming" | "done" | "error";
  content: string;
  rating: AIRating;
  isMock?: boolean;
}
const IDLE_FB: FeedbackState = { status: "idle", content: "", rating: "unknown" };

interface AnkiCard {
  id: string;
  type: CardType;
  front: string;
  back: string;
  tags: string[];
  /** F2-1: minuto de la lección donde se enseña («mm:ss»). Opcional. */
  t?: string;
  /** Índices de keyConcepts que refuerza (flowVersion 2, §3). */
  conceptRefs?: number[];
  /** Tarjeta de refuerzo generada desde un fallo de Study (§3). */
  reinforce?: boolean;
  /** El estudiante la quitó del paquete: no se exporta. */
  excluded?: boolean;
  /** El back ya es HTML de confianza (tarjetas de refuerzo): no se re-escapa. */
  isHtml?: boolean;
  /** §5: guardada desde una duda sobre la lección (de refuerzo, origen «duda»). */
  doubt?: boolean;
}

interface StudyContent {
  relevance: { score: number; reason: string };
  /** C4: síntesis generativa (3-5 frases con palabras propias). */
  summary?: string;
  /** F2-2: conceptos enlazables entre cursos (nombres canónicos). */
  conceptTerms?: string[];
  keyConcepts: string[];
  /** Legado: ya no se genera ni se muestra (tarea genérica sin verificación). */
  quickWin?: string;
  questions: { q: string; bloom: string; difficulty: ConfidenceLevel; hint: string; answer: string; conceptRefs?: number[] }[];
  application: { setup: string; challenge: string; solution: string; isCode: boolean };
  interviewQ: { q: string; idealAnswer: string } | null;
  nextAction: string;
  ankiCards: AnkiCard[];
}

type StudyTranscriptResult = {
  ok?: boolean;
  transcriptText?: string;
  text?: string;
  source?: string;
  cueCount?: number;
  transcriptTruncated?: boolean;
  truncated?: boolean;
  lectureKey?: string;
  courseSlug?: string;
  courseTitle?: string;
  lectureTitle?: string;
  /** «video», «article» (lección de texto) u «other» (cuestionario, ejercicio…). */
  lectureKind?: "video" | "article" | "other";
  error?: string;
};

type LearningPanelResponse = {
  ok?: boolean;
  source?: string;
  payload?: unknown;
  raw?: string;
  error?: string;
  debug?: unknown;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const CONFIDENCE = [
  {
    id: "confused" as ConfidenceLevel,
    icon: "face1" as IconName,
    label: "Confuso",
    desc: "Reforzar desde la base",
    ring: "ring-rose-500/40",
    bg: "bg-rose-500/8 dark:bg-rose-500/10",
    border: "border-rose-500/30",
    color: "#f43f5e",
    label_c: "text-rose-500 dark:text-rose-400",
  },
  {
    id: "partial" as ConfidenceLevel,
    icon: "face2" as IconName,
    label: "Más o menos",
    desc: "Cerrar dudas puntuales",
    ring: "ring-amber-500/40",
    bg: "bg-amber-500/8 dark:bg-amber-500/10",
    border: "border-amber-500/30",
    color: "#f59e0b",
    label_c: "text-amber-500 dark:text-amber-400",
  },
  {
    id: "clear" as ConfidenceLevel,
    icon: "face3" as IconName,
    label: "Entendido",
    desc: "Comprobar y afianzar",
    ring: "ring-emerald-500/40",
    bg: "bg-emerald-500/8 dark:bg-emerald-500/10",
    border: "border-emerald-500/30",
    color: "#10b981",
    label_c: "text-emerald-500 dark:text-emerald-400",
  },
  {
    id: "mastered" as ConfidenceLevel,
    icon: "face4" as IconName,
    label: "Lo domino",
    desc: "Un desafío exigente",
    ring: "ring-violet-500/40",
    bg: "bg-violet-500/8 dark:bg-violet-500/10",
    border: "border-violet-500/30",
    color: "#8b5cf6",
    label_c: "text-violet-500 dark:text-violet-400",
  },
];

// Única fuente de nombres del flujo (flowVersion 2): stepper, banner y
// vista previa toman short/title/sub de aquí. flowVersion 2 = 4 pasos.
const STEP_META: { short: string; hue: string; inkDark: string; inkLight: string; icon: IconName; title: string; sub: string }[] = [
  { short: "Recordar",  hue: "#6d4aff", inkDark: "#b7a6ff", inkLight: "#5b37e8", icon: "compass",   title: "Lo que recuerdas",      sub: "Qué tan claro te quedó y lo que recuerdas sin mirar" },
  { short: "Comprobar", hue: "#0284c7", inkDark: "#5cc8fb", inkLight: "#0369a1", icon: "brain",     title: "Ponte a prueba",        sub: "Responde sin mirar, ahí se aprende" },
  { short: "Aplicar",   hue: "#059669", inkDark: "#4ade9f", inkLight: "#047857", icon: "rocket",    title: "Llévalo a la práctica", sub: "Un caso real para aplicar lo visto" },
  { short: "Fijar",     hue: "#e11d48", inkDark: "#fb7185", inkLight: "#be123c", icon: "layers",    title: "Fíjalo en memoria",     sub: "Tarjetas listas para repasar" },
];

function SectionTitle({ icon, hue, children }: { icon: IconName; hue: number; children: React.ReactNode }) {
  const { t } = useDockTheme();
  const m = STEP_META[hue];
  return (
    <div className="flex items-center gap-2" style={{ "--kx-step": m.hue, "--kx-ink": t(m.inkDark, m.inkLight) } as React.CSSProperties}>
      <span className="kx-obj-tile w-7 h-7 rounded-lg flex items-center justify-center shrink-0"><Icon name={icon} size={15} weight="duotone" /></span>
      <span className="text-[12.5px] font-bold text-[var(--usb-fg-hi)] tracking-tight">{children}</span>
    </div>
  );
}

function StepBanner({ step }: { step: number }) {
  const m = STEP_META[step];
  return (
    <div className="kx-step-banner relative overflow-hidden flex items-center gap-3 rounded-2xl p-3 mb-3">
      <div className="kx-step-tile w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 relative">
        <Icon name={m.icon} size={24} weight="duotone" />
      </div>
      <div className="min-w-0 relative">
        <span className="kx-step-eyebrow text-[9.5px] font-extrabold tracking-[0.14em] uppercase">Paso {step + 1} de 4 · {m.short}</span>
        <p className="kx-step-title text-[14px] font-bold leading-tight mt-0.5">{m.title}</p>
        <p className="kx-step-sub text-[11px] leading-snug mt-0.5">{m.sub}</p>
      </div>
    </div>
  );
}

// Línea de coach neutra por nivel — sin frases inventadas ni hype.
const COACH_LINE: Record<ConfidenceLevel, { icon: IconName; tip: string }> = {
  // Lo que de verdad hace el nivel: fija la dificultad de la PRIMERA pregunta
  // de Comprobar (pickStartQuestion); las siguientes se adaptan a tus aciertos.
  confused:  { icon: "compass", tip: "Sin problema: la primera pregunta será de definir y subimos desde ahí." },
  partial:   { icon: "target",  tip: "Normal al principio: empezamos explicando y cerramos lo que falte." },
  clear:     { icon: "zap",     tip: "Bien: la primera pregunta te pedirá usarlo en un caso." },
  mastered:  { icon: "flame",   tip: "Perfecto: empezamos por la pregunta que combina varias ideas." },
};



const CARD_META: Record<CardType, { label: string; icon: IconName; color: string; accent: string }> = {
  concepto:    { label: "Concepto",    icon: "target", color: "text-violet-400",  accent: "#9a83ff" },
  aplicacion:  { label: "Aplicación",  icon: "puzzle", color: "text-emerald-400", accent: "#34d399" },
  codigo:      { label: "Código",      icon: "code", color: "text-emerald-400", accent: "#86efac" },
  entrevista:  { label: "Entrevista",  icon: "briefcase", color: "text-sky-400",     accent: "#93c5fd" },
  comparacion: { label: "Comparación", icon: "compare", color: "text-amber-400",   accent: "#fcd34d" },
  proceso:     { label: "Proceso",     icon: "steps", color: "text-fuchsia-400", accent: "#e879f9" },
};

// Orden canónico de dificultad para la lógica adaptativa (§1.2).
const DIFF_ORDER: ConfidenceLevel[] = ["confused", "partial", "clear", "mastered"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendRuntimeMessage<T>(message: unknown): Promise<T | null> {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { sendMessage?: (msg: unknown, cb: (res: unknown) => void) => void; lastError?: { message?: string } } };
  }).chrome;
  if (!chromeApi?.runtime?.sendMessage) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      chromeApi.runtime?.sendMessage?.(message, (response) => {
        if (chromeApi.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve((response ?? null) as T | null);
      });
    } catch {
      resolve(null);
    }
  });
}

function isExtensionRuntime(): boolean {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { id?: string; sendMessage?: unknown } };
  }).chrome;
  return Boolean(chromeApi?.runtime?.id && typeof chromeApi.runtime.sendMessage === "function");
}

// §5: en la extensión los campos arrancan vacíos (la detección los llena).
// Los valores de demo solo existen fuera de runtime (preview/prototipo),
// misma regla que el vocabulario de demo.
const IS_EXTENSION = isExtensionRuntime();

function fingerprintKey(apiKey: string): string {
  const key = String(apiKey || "").trim();
  if (!key) return "(empty)";
  if (key.length <= 10) return "short-key";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function describeGeminiKeys(keys: string[]): string {
  const normalized = normalizeGeminiKeys(keys);
  return `${normalized.length} key(s) [${normalized.map(fingerprintKey).join(", ")}]`;
}

async function resolveGeminiKeysForStudy(propKeys: string[]): Promise<string[]> {
  await initGeminiKeys().catch(() => undefined);
  const memoryKeys = (globalThis as typeof globalThis & { USB_GEMINI_API_KEYS?: string[] }).USB_GEMINI_API_KEYS;
  const visibleKeys: Record<string, unknown> = await chromeStorage
    .get(["gemini_api_keys", "gemini_api_key_1", "gemini_api_key_2"])
    .catch(() => ({} as Record<string, unknown>));
  const syncedArray = Array.isArray(visibleKeys.gemini_api_keys)
    ? normalizeGeminiKeys((visibleKeys.gemini_api_keys as unknown[]).map(String))
    : [];
  const legacy = normalizeGeminiKeys([
    typeof visibleKeys.gemini_api_key_1 === "string" ? visibleKeys.gemini_api_key_1 : "",
    typeof visibleKeys.gemini_api_key_2 === "string" ? visibleKeys.gemini_api_key_2 : "",
  ]);
  const resolved = normalizeGeminiKeys([
    ...propKeys,
    ...(Array.isArray(memoryKeys) ? memoryKeys : []),
    ...syncedArray,
    ...legacy,
  ]);

  console.info("[USG][study][client] resolved Gemini keys:", {
    prop: describeGeminiKeys(propKeys),
    memory: describeGeminiKeys(Array.isArray(memoryKeys) ? memoryKeys : []),
    syncArray: describeGeminiKeys(syncedArray),
    legacy: describeGeminiKeys(legacy),
    resolved: describeGeminiKeys(resolved),
  });

  if (resolved.length > 0) {
    setGeminiKeysSync(resolved);
    await saveGeminiKeys(resolved).catch(() => undefined);
  }

  return resolved;
}

async function requestStudyTranscript(maxChars = 22000): Promise<StudyTranscriptResult> {
  const runtimeResult = await sendRuntimeMessage<StudyTranscriptResult>({
    type: "USG_GET_STUDY_TRANSCRIPT",
    maxChars,
  });
  if (runtimeResult?.ok && runtimeResult.transcriptText) return runtimeResult;

  return new Promise<StudyTranscriptResult>((resolve) => {
    let done = false;
    const cleanup = contentBridge.onMessageFromContent((message: BridgeMessage) => {
      if (message.type !== "TRANSCRIPT_RESULT") return;
      done = true;
      cleanup();
      const payload = (message.payload ?? {}) as StudyTranscriptResult;
      resolve({
        ok: Boolean(payload.text || payload.transcriptText),
        transcriptText: payload.transcriptText ?? payload.text,
        ...payload,
      });
    });

    void contentBridge.sendToContent({ type: "GET_TRANSCRIPT", payload: { maxChars } });
    window.setTimeout(() => {
      if (done) return;
      cleanup();
      resolve(runtimeResult ?? { ok: false, error: "No se pudo leer la transcripción de la lección." });
    }, 5000);
  });
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 70;
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeDifficulty(value: unknown, fallback: ConfidenceLevel): ConfidenceLevel {
  const v = String(value || "").toLowerCase();
  return (["confused", "partial", "clear", "mastered"] as ConfidenceLevel[]).includes(v as ConfidenceLevel)
    ? v as ConfidenceLevel
    : fallback;
}

function normalizeCardType(value: unknown, fallback: CardType): CardType {
  const v = String(value || "").toLowerCase();
  return (["concepto", "aplicacion", "codigo", "entrevista", "comparacion", "proceso"] as CardType[]).includes(v as CardType)
    ? v as CardType
    : fallback;
}

function normalizeConceptRefs(value: unknown, fallback: number[], maxConcepts: number): number[] {
  if (maxConcepts <= 0) return [];
  const raw = Array.isArray(value) ? value : [];
  const refs = raw
    .map((item) => Number(item))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < maxConcepts);
  const unique = Array.from(new Set(refs));
  return unique.length > 0 ? unique.slice(0, 3) : fallback.filter((n) => n >= 0 && n < maxConcepts).slice(0, 3);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validDifficulty(value: unknown): boolean {
  return (["confused", "partial", "clear", "mastered"] as string[]).includes(String(value || "").toLowerCase());
}

function validateStudyPayload(payload: unknown): string[] {
  const issues: string[] = [];
  const raw = isRecord(payload) ? payload : {};
  const relevance = isRecord(raw.relevance) ? raw.relevance : null;
  if (!relevance || !Number.isFinite(Number(relevance.score))) issues.push("relevance.score");

  const keyConcepts = Array.isArray(raw.keyConcepts) ? raw.keyConcepts.map(v => asText(v)).filter(Boolean) : [];
  // 2–7 según la densidad de la lección (keyConceptRange): lo elige la IA.
  if (keyConcepts.length < 2) issues.push("keyConcepts[2]");

  // Una por idea + síntesis; la cobertura idea→pregunta la mide conceptCoverage.
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  if (questions.length < 3) issues.push("questions[3]");
  questions.slice(0, 8).forEach((item, i) => {
    const q = isRecord(item) ? item : {};
    if (!asText(q.q)) issues.push(`questions[${i}].q`);
    if (!asText(q.bloom ?? q.bloomLevel)) issues.push(`questions[${i}].bloom`);
    if (!validDifficulty(q.difficulty)) issues.push(`questions[${i}].difficulty`);
    if (!asText(q.hint)) issues.push(`questions[${i}].hint`);
    if (!asText(q.answer)) issues.push(`questions[${i}].answer`);
  });

  const app = isRecord(raw.application) ? raw.application : {};
  if (!asText(app.setup)) issues.push("application.setup");
  if (!asText(app.challenge)) issues.push("application.challenge");
  if (!asText(app.solution)) issues.push("application.solution");
  if (typeof app.isCode !== "boolean") issues.push("application.isCode");

  if (!asText(raw.nextAction)) issues.push("nextAction");

  const cards = Array.isArray(raw.ankiCards) ? raw.ankiCards : [];
  if (cards.length < 3) issues.push("ankiCards[3]");
  cards.slice(0, Math.min(cards.length, 8)).forEach((item, i) => {
    const card = isRecord(item) ? item : {};
    if (!asText(card.front)) issues.push(`ankiCards[${i}].front`);
    if (!asText(card.back)) issues.push(`ankiCards[${i}].back`);
    if (!asText(card.type)) issues.push(`ankiCards[${i}].type`);
  });

  return issues;
}

function normalizeStudyContent(payload: unknown, fallback: StudyContent): StudyContent {
  const raw = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const relevance = (raw.relevance && typeof raw.relevance === "object" ? raw.relevance : {}) as Record<string, unknown>;
  const fallbackQuestions = fallback.questions;
  const questionDifficulties: ConfidenceLevel[] = ["confused", "partial", "clear", "mastered"];
  const keyConcepts = Array.isArray(raw.keyConcepts)
    ? raw.keyConcepts.map((v) => asText(v)).filter(Boolean).slice(0, 7)
    : fallback.keyConcepts;
  // C4/F2-2: summary y conceptTerms son opcionales y retrocompatibles.
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : undefined;
  const conceptTerms = Array.isArray(raw.conceptTerms)
    ? raw.conceptTerms.map((v) => asText(v)).filter(Boolean).slice(0, 5)
    : undefined;
  const questions = Array.isArray(raw.questions)
    ? raw.questions.slice(0, 8).map((item, i) => {
        const q = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const fb = fallbackQuestions[i] ?? fallbackQuestions[0];
        return {
          q: asText(q.q, fb.q),
          bloom: asText(q.bloom ?? q.bloomLevel, fb.bloom),
          difficulty: normalizeDifficulty(q.difficulty, questionDifficulties[Math.min(i, questionDifficulties.length - 1)]),
          hint: asText(q.hint, fb.hint),
          answer: asText(q.answer, fb.answer),
          // Sin refs: la pregunta i evalúa la idea i; la de síntesis (la última), varias.
          conceptRefs: normalizeConceptRefs(q.conceptRefs ?? q.concepts, i < keyConcepts.length ? [i] : keyConcepts.map((_, k) => k).slice(0, 3), keyConcepts.length),
        };
      })
    : [];

  const app = (raw.application && typeof raw.application === "object" ? raw.application : {}) as Record<string, unknown>;
  const cards = Array.isArray(raw.ankiCards)
    ? raw.ankiCards.slice(0, 8).map((item, i) => {
        const card = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const fb = fallback.ankiCards[i % Math.max(1, fallback.ankiCards.length)];
        const tagsRaw = card.tags;
        const tags = Array.isArray(tagsRaw)
          ? tagsRaw.map(String).filter(Boolean).slice(0, 8)
          : typeof card.tag === "string"
            ? [card.tag]
            : fb.tags;
        return {
          id: asText(card.id, `card-${String(i + 1).padStart(3, "0")}`),
          type: normalizeCardType(card.type, fb.type),
          // Gate F2-1: sin transcripción temporizada, cualquier t del modelo
          // es inventada — se descarta siempre.
          t: TIMED_TRANSCRIPT && typeof card.t === 'string' && /^\d{1,2}:\d{2}$/.test(card.t) ? card.t : undefined,
          front: asText(card.front, fb.front),
          back: asText(card.back, fb.back),
          tags,
          // Qué ideas refuerza la tarjeta: sin esto, ni el refuerzo de lo no
          // marcado/fallado ni la cobertura de Fijar veían las tarjetas de la IA.
          conceptRefs: normalizeConceptRefs(card.conceptRefs ?? card.concepts, [], keyConcepts.length),
          // Las de refuerzo creadas en Study traen HTML de confianza (al restaurar).
          ...(card.isHtml === true ? { isHtml: true } : {}),
        };
      })
    : [];

  return {
    relevance: {
      // -1 = sin estimación (plantilla): se conserva para no mostrar una cifra inventada.
      score: relevance.score == null ? fallback.relevance.score : clampScore(relevance.score),
      reason: asText(relevance.reason, fallback.relevance.reason),
    },
    summary,
    conceptTerms,
    keyConcepts,
    // Con menos de 3 no hay comprobación posible: validateStudyPayload ya lo rechaza antes.
    questions: questions.length >= 3 ? questions : fallback.questions,
    application: {
      isCode: typeof app.isCode === "boolean" ? app.isCode : fallback.application.isCode,
      setup: asText(app.setup, fallback.application.setup),
      challenge: asText(app.challenge, fallback.application.challenge),
      solution: asText(app.solution, fallback.application.solution),
    },
    interviewQ: raw.interviewQ === null
      ? null
      : raw.interviewQ && typeof raw.interviewQ === "object"
        ? {
            q: asText((raw.interviewQ as Record<string, unknown>).q, fallback.interviewQ?.q ?? ""),
            idealAnswer: asText((raw.interviewQ as Record<string, unknown>).idealAnswer, fallback.interviewQ?.idealAnswer ?? ""),
          }
        : fallback.interviewQ,
    nextAction: asText(raw.nextAction, fallback.nextAction),
    // Sin duplicados: mismo frente = misma nota en Anki (una pisaría a la otra).
    ankiCards: cards.length >= 3 ? cards.filter((c, i, arr) => arr.findIndex(o => cardFrontKey(o.front) === cardFrontKey(c.front)) === i) : fallback.ankiCards,
  };
}

// §1.2: primera pregunta de la dificultad elegida; desempate por conceptos
// no marcados (los débiles primero). Hay una pregunta por idea + síntesis, así
// que varias pueden compartir nivel.
// Recibe las ideas MARCADAS (las que dijiste recordar); las demás son las débiles.
function pickStartQuestion(conf: ConfidenceLevel, cnt: StudyContent, checked: Set<number>): number {
  // El nivel elegido; si la lección no tiene pregunta de ese nivel, la más
  // cercana (a igualdad, la más baja: empezar fácil no penaliza).
  const want = DIFF_ORDER.indexOf(conf);
  const all = cnt.questions.map((q, i) => ({ q, i, gap: Math.abs(DIFF_ORDER.indexOf(q.difficulty) - want), below: DIFF_ORDER.indexOf(q.difficulty) <= want ? 0 : 1 }));
  const best = Math.min(...all.map(x => x.gap * 2 + x.below));
  const pool2 = all.filter(x => x.gap * 2 + x.below === best);
  const weakFirst = [...pool2].sort((a, b) => {
    const aWeak = (a.q.conceptRefs ?? []).some(r => !checked.has(r)) ? 1 : 0;
    const bWeak = (b.q.conceptRefs ?? []).some(r => !checked.has(r)) ? 1 : 0;
    return bWeak - aWeak;
  });
  return weakFirst[0]?.i ?? 0;
}

function getOralPracticeMeta(content: StudyContent, objective: string) {
  const text = `${objective} ${content.interviewQ?.q ?? ""}`.toLowerCase();
  const isInterview = /\b(entrevista|interview|technical interview|hiring|recruiter|rrhh)\b/.test(text);
  const isProfessional = /\b(profesional|trabajo|laboral|senior|ingeniero|empresa|producci[oó]n|cliente)\b/.test(text);

  if (isInterview) {
    return {
      title: "Como en una entrevista",
      subtitle: "Responde como en una entrevista",
      answerLabel: "Ver una buena estructura",
    };
  }

  if (isProfessional) {
    return {
      title: "Como en el trabajo",
      subtitle: "Explícalo como en el trabajo",
      answerLabel: "Ver una buena estructura",
    };
  }

  return {
    title: "Con tus palabras",
    subtitle: "Explícalo con tus palabras",
    answerLabel: "Ver una buena estructura",
  };
}

function humanizeObjectivesError(error: string | null | undefined): string {
  // El vocabulario vive en un solo sitio (ai-providers) y habla del proveedor
  // REAL: estos mensajes nombraban a Gemini aunque el camino sea el configurado.
  if (!error) return "La IA no respondió. Revisa el proveedor en Ajustes o pulsa Regenerar.";
  const cfg = getAiProviderConfig();
  const ctx = { kind: cfg.kind, endpoint: cfg.baseUrl, model: cfg.model };
  const msg = error.toLowerCase();
  if (msg.includes("cortada a mitad") || msg.includes("max_tokens") || msg.includes("max tokens") || msg.includes("límite de tokens")) {
    return "La respuesta se cortó por el límite de tokens. Pulsa Regenerar: el siguiente intento usará más.";
  }
  if (msg.includes("saturado") || msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded") || msg.includes("high demand")) {
    return "Gemini está saturado por alta demanda. Espera 1-2 minutos y vuelve a pulsar Regenerar.";
  }
  if (msg.includes("rate") && msg.includes("limit")) return "Gemini está limitando peticiones. Espera unos segundos y vuelve a intentarlo.";
  if (msg.includes("quota") || msg.includes("resource_exhausted")) return "Tu cuota de Gemini se agotó por hoy. Añade otra clave o espera al reset.";
  if (msg.includes("api key") || msg.includes("api_key") || (msg.includes("invalid") && msg.includes("key"))) {
    return describeProviderFailure(error, ctx);
  }
  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("err_")) return "Error de red: Kinema no pudo conectar con tu proveedor de IA. Revisa tu conexión y reintenta.";
  if (msg.includes("background")) return "No se pudo contactar con el background de la extensión. Recarga la página de Udemy.";
  if (msg.includes("parse") || msg.includes("json") || msg.includes("formato no era válido")) return "La respuesta llegó con un formato no válido. Pulsa Regenerar para reintentar.";
  return describeProviderFailure(error, ctx);
}

function BLOOM_STYLE(l: string) {
  return ({
    recordar:   "bg-slate-500/10 border-slate-500/20 text-slate-400",
    comprender: "bg-sky-500/10 border-sky-500/20 text-sky-400",
    aplicar:    "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    analizar:   "bg-violet-500/10 border-violet-500/20 text-violet-400",
    evaluar:    "bg-amber-500/10 border-amber-500/20 text-amber-400",
    crear:      "bg-rose-500/10 border-rose-500/20 text-rose-400",
  } as Record<string, string>)[l] ?? "bg-sky-500/10 border-sky-500/20 text-sky-400";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Step header with number circle + status
function StepHeader({
  n, label, status, subLabel
}: { n: number; label: string; status: "pending" | "active" | "done"; subLabel?: string }) {
  return (
    <motion.div 
      initial={status === "active" ? { opacity: 0, x: -10 } : false} 
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3 mb-4"
    >
      <motion.div 
        animate={status === "active" ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 ${
        status === "done"    ? "bg-emerald-500/12 border border-emerald-500/30 text-emerald-400" :
        status === "active"  ? "kx-step-num border" :
                               "bg-[var(--usb-bg-3)] border border-[var(--usb-border)] text-[var(--usb-fg-lo)]"
      }`}>
        <AnimatePresence mode="wait">
          {status === "done"
            ? <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={12} strokeWidth={3} /></motion.div>
            : <motion.span key="num" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex" data-n={n}><Icon name={status === "active" ? "sparkles" : "lock"} size={12} weight="fill" /></motion.span>
          }
        </AnimatePresence>
      </motion.div>
      <div className="flex flex-col min-w-0">
        <span className={`text-[12px] tracking-wide transition-colors ${status === "pending" ? "text-[var(--usb-fg-lo)]" : "text-[var(--usb-fg-hi)]"}`} style={{ fontWeight: 600 }}>{label}</span>
        {subLabel && <span className={`text-[10px] mt-0.5 transition-colors ${status === "pending" ? "text-[var(--usb-fg-lo)]" : "text-[var(--usb-fg-mid)]"}`}>{subLabel}</span>}
      </div>
      {status === "pending" && <Lock size={12} className="text-[var(--usb-fg-lo)] ml-auto shrink-0" />}
    </motion.div>
  );
}

// ── AI Analyzing Loader — own component so hooks are valid (no early-return conflict) ──
function AIAnalyzingLoader() {
  const STEPS = [
    { label: "Leyendo tu respuesta…",             icon: "bookOpen" as IconName },
    { label: "Comparando con la lección…",        icon: "brain" as IconName },
    { label: "Preparando tu revisión…",           icon: "edit3" as IconName },
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-violet-500/18 bg-violet-500/5 overflow-hidden"
    >
      <div className="h-[2px] bg-violet-500/8 overflow-hidden">
        <motion.div
          className="h-full bg-violet-400"
          style={{ width: "35%" }}
        />
      </div>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/18 flex items-center justify-center shrink-0">
          <AnimatePresence mode="wait">
            <motion.span key={step}
              initial={{ scale: 0.4, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0, rotate: 10 }}
              transition={{ duration: 0.22 }}
              className="text-[15px]"
            ><Icon name={STEPS[step].icon} size={17} /></motion.span>
          </AnimatePresence>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <AnimatePresence mode="wait">
            <motion.p key={step}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}
              className="text-violet-300/80 text-[11px]" style={{ fontWeight: 500 }}
            >{STEPS[step].label}</motion.p>
          </AnimatePresence>
          <div className="flex gap-1 items-center">
            {STEPS.map((_, i) => (
              <motion.div key={i}
                animate={{ width: i === step ? 20 : i < step ? 14 : 6, opacity: i <= step ? 1 : 0.2 }}
                transition={{ duration: 0.3 }}
                className={`h-[2px] rounded-full ${i < step ? "bg-violet-400/55" : i === step ? "bg-violet-400" : "bg-white/12"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Feedback v2.0 — verdict hero + structured content + contextual actions
// ─────────────────────────────────────────────────────────────────────────────
/** Avance del paso — mismo botón (y misma acción que «Siguiente») en todos los pasos (§1.7). */
function StepContinueButton({ label, onClick, hint }: { label: string; onClick: () => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      {hint && <p className="text-[10.5px] text-center leading-relaxed text-[var(--usb-fg-mid)]">{hint}</p>}
      <button
        type="button"
        onClick={onClick}
        className="kx-on-solid kx-cta w-full h-10 rounded-xl text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
      >
        {label}<ArrowRight size={12} />
      </button>
    </div>
  );
}

/** Salto de paso — mismo texto, estilo y lugar en todos los pasos que lo admiten (§1.7). */
function SkipStepButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <div className="text-center" data-skip-step>
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-bg-2)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
      >
        <FastForward size={11} />Saltar este paso
      </button>
    </div>
  );
}

// Secciones del feedback (formato pedido al modelo: BIEN / FALTÓ / PARA RECORDAR,
// o DIAGNÓSTICO / BIEN / MEJORAR / SIGUIENTE NIVEL en la práctica). Se muestran
// con rótulos legibles en vez del texto crudo con etiquetas en mayúsculas.
const FEEDBACK_SECTIONS: { key: RegExp; label: string; color: string }[] = [
  { key: /^DIAGN[OÓ]STICO$/, label: "", color: "" },
  { key: /^BIEN$/, label: "Lo que está bien", color: "text-[var(--usb-ok-text)]" },
  { key: /^FALT[OÓ]$/, label: "Lo que faltó", color: "text-[var(--usb-warn-text)]" },
  { key: /^MEJORAR$/, label: "Qué mejorar", color: "text-[var(--usb-warn-text)]" },
  { key: /^PARA RECORDAR$/, label: "Para recordar", color: "text-[var(--usb-accent-text)]" },
  { key: /^SIGUIENTE NIVEL$/, label: "Para ir más allá", color: "text-[var(--usb-info-text)]" },
];

function parseFeedbackSections(content: string): { label: string; color: string; text: string }[] | null {
  const body = content.replace(/^\s*\[(?:CORRECTO|PARCIAL|INCORRECTO|EXCELENTE)\]\s*/i, "");
  const marker = /(?:^|\n)[ \t]*(DIAGN[OÓ]STICO|BIEN|FALT[OÓ]|MEJORAR|PARA RECORDAR|SIGUIENTE NIVEL)[ \t]*:[ \t]*/g;
  const hits = [...body.matchAll(marker)];
  if (hits.length === 0) return null;
  const clean = (t: string) => t.replace(/^[\s\u2705\u274C\u26A0\uFE0F\u{1F4A1}\u{1F680}]+/u, "").trim();
  const out: { label: string; color: string; text: string }[] = [];
  const lead = clean(body.slice(0, hits[0].index));
  if (lead) out.push({ label: "", color: "", text: lead });
  hits.forEach((m, i) => {
    const from = (m.index ?? 0) + m[0].length;
    const to = i + 1 < hits.length ? hits[i + 1].index : body.length;
    const text = clean(body.slice(from, to));
    if (!text || /^\(?\s*nada\s*\)?\.?$/i.test(text)) return;
    const meta = FEEDBACK_SECTIONS.find((sec) => sec.key.test(m[1].toUpperCase())) ?? FEEDBACK_SECTIONS[0];
    out.push({ label: meta.label, color: meta.color, text });
  });
  return out;
}

/**
 * Revisión de Kinema: veredicto + qué está bien / qué faltó / para recordar.
 * Solo informa. Todo lo que se puede HACER después (intentar de nuevo, pasar,
 * ver la respuesta, preguntar una duda) va justo debajo, en un solo bloque.
 */
function AIFeedback({
  fb, stale,
}: {
  fb: FeedbackState;
  /** La respuesta cambió desde esta revisión: se avisa de que es de la versión anterior. */
  stale?: boolean;
}) {
  if (fb.status === "idle") return null;
  if (fb.status === "loading") return <AIAnalyzingLoader />;

  // ── Error: la respuesta se conserva; se reintenta con el mismo botón de revisar ──
  if (fb.status === "error") return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      role="status"
      className="border border-red-500/25 bg-red-500/5 rounded-xl flex items-start gap-3 p-3.5"
    >
      <div className="w-8 h-8 rounded-xl bg-red-500/12 border border-red-500/20 flex items-center justify-center shrink-0">
        <WifiOff size={12} className="text-[var(--usb-err-text)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[var(--usb-err-text)] text-[11.5px] font-semibold">Kinema no pudo revisar tu respuesta</p>
        <p className="text-[var(--usb-fg-mid)] text-[10.5px] mt-0.5 leading-relaxed">{fb.content} Tu respuesta se conserva: vuelve a pulsar «Revisar».</p>
      </div>
    </motion.div>
  );

  const isStreaming = fb.status === "streaming";
  const rating = fb.rating ?? "unknown";

  // ── Verdict config ────────────────────────────────────────────────────────
  const VERDICT = {
    correct:   { heroText: "text-emerald-300", heroBg: "bg-emerald-500/10", heroBorder: "border-emerald-500/20", heroIconBg: "bg-emerald-500/18 border-emerald-500/30", icon: "checkCircle2" as IconName, label: "Correcto",    sublabel: "Captaste la idea central.",                 ring: "border-emerald-500/22", cardBg: "bg-emerald-500/[0.04]" },
    excellent: { heroText: "text-violet-300",  heroBg: "bg-violet-500/10",  heroBorder: "border-violet-500/20",  heroIconBg: "bg-violet-500/18 border-violet-500/30",  icon: "target" as IconName,       label: "Excelente",   sublabel: "Respuesta completa y precisa.",              ring: "border-violet-500/22",  cardBg: "bg-violet-500/[0.05]"  },
    partial:   { heroText: "text-amber-300",   heroBg: "bg-amber-500/8",    heroBorder: "border-amber-500/18",   heroIconBg: "bg-amber-500/15 border-amber-500/28",    icon: "zap" as IconName,          label: "A medias",    sublabel: "Vas bien, pero falta una parte.",            ring: "border-amber-500/20",   cardBg: "bg-amber-500/[0.04]"   },
    wrong:     { heroText: "text-rose-300",    heroBg: "bg-rose-500/7",     heroBorder: "border-rose-500/16",    heroIconBg: "bg-rose-500/14 border-rose-500/25",      icon: "messageSquare" as IconName, label: "Todavía no", sublabel: "Abajo tienes qué faltó para llegar.",       ring: "border-rose-500/18",    cardBg: "bg-rose-500/[0.04]"    },
    unknown:   { heroText: "text-violet-300",  heroBg: "bg-violet-500/7",   heroBorder: "border-violet-500/15",  heroIconBg: "bg-violet-500/14 border-violet-500/25",  icon: "sparkles" as IconName,     label: "Revisando…",  sublabel: "",                                           ring: "border-violet-500/15",  cardBg: "bg-violet-500/[0.04]"  },
  } as const;
  const v = VERDICT[isStreaming ? "unknown" : (rating as keyof typeof VERDICT)] ?? VERDICT.unknown;

  const sections = parseFeedbackSections(fb.content || "");
  const paragraphs = sections ? [] : (fb.content || "").replace(/^\s*\[(?:CORRECTO|PARCIAL|INCORRECTO|EXCELENTE)\]\s*/i, "").split(/\n{2,}|\n(?=\s*[-*•]\s)/).map(p => p.trim()).filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-xl border overflow-hidden ${v.ring} ${v.cardBg}`}
      data-feedback
    >
      {/* ── Verdict hero band ── */}
      <div className={`flex items-center gap-3 px-3.5 py-3 ${v.heroBg} border-b ${v.heroBorder}`}>
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${v.heroIconBg} ${v.heroText}`}>
          {isStreaming
            ? <Loader2 size={15} className="animate-spin" />
            : <Icon name={v.icon} size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold leading-none text-[var(--usb-fg-mid)]">Revisión de Kinema</p>
          <p className={`text-[13px] mt-1 ${v.heroText}`} style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>{v.label}</p>
          {v.sublabel && <p className="text-[var(--usb-fg-mid)] text-[10.5px] mt-0.5 leading-snug">{v.sublabel}</p>}
        </div>
        {fb.isMock && (
          <span title="Revisión de ejemplo del prototipo: no evalúa tu respuesta." className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-[var(--usb-warn-text)] shrink-0">Demo</span>
        )}
      </div>

      {stale && !isStreaming && (
        <p className="px-3.5 pt-2.5 text-[10.5px] font-medium text-[var(--usb-fg-mid)]">Esta revisión es de tu versión anterior.</p>
      )}

      {/* ── Structured content ── */}
      <div className="px-3.5 py-3 space-y-2.5">
        {!sections && paragraphs.length === 0 && isStreaming && (
          <p className="text-[var(--usb-fg-mid)] text-[11px]">Kinema está leyendo tu respuesta…</p>
        )}
        {sections?.map((sec, i) => (
          <div key={i} data-feedback-section={sec.label || "resumen"}>
            {sec.label && <p className={`text-[10.5px] font-bold leading-tight mb-0.5 ${sec.color}`}>{sec.label}</p>}
            <p className={`text-[11.5px] leading-relaxed whitespace-pre-line ${sec.label ? "text-[var(--usb-fg)]" : "text-[var(--usb-fg-hi)] font-medium"}`}>
              {renderInline(sec.text)}
              {isStreaming && i === sections.length - 1 && (
                <span className="inline-block w-[5px] h-[12px] ml-0.5 align-middle bg-violet-400/70" />
              )}
            </p>
          </div>
        ))}
        {paragraphs.map((p, i) => {
          const isBullet = /^\s*[-*•]\s+/.test(p);
          const textOnly = p.replace(/^\s*[-*•]\s+/, "");
          return isBullet ? (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-[7px] h-1 w-1 rounded-full bg-violet-400/70 shrink-0" aria-hidden="true" />
              <p className="text-[var(--usb-fg)] text-[11.5px] leading-relaxed">{renderInline(textOnly)}</p>
            </div>
          ) : (
            <p key={i} className="text-[var(--usb-fg)] text-[11.5px] leading-relaxed whitespace-pre-line">
              {renderInline(textOnly)}
              {isStreaming && i === paragraphs.length - 1 && (
                <span className="inline-block w-[5px] h-[12px] ml-0.5 align-middle bg-violet-400/70" />
              )}
            </p>
          );
        })}
      </div>

    </motion.div>
  );
}

/**
 * «¿Cómo sigues?» — lo que se puede hacer tras una revisión sin acierto, en un
 * solo bloque y en el mismo orden en cada paso: la opción principal, la
 * alternativa y, en la misma caja, la ayuda («Tengo una duda»). Los rótulos se
 * explican solos; la línea de apoyo solo dice una consecuencia que no se ve.
 */
type NextMove = { id: string; label: string; hint?: string; onClick: () => void; primary?: boolean; icon: React.ComponentType<{ size?: number; className?: string }>; disabled?: boolean };
function NextMoves({ moves, help, exit }: { moves: NextMove[]; help?: React.ReactNode; exit?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] p-3 space-y-2" data-next-moves role="group" aria-label="Cómo sigues">
      <p className="text-[11.5px] font-bold text-[var(--usb-fg-hi)] leading-tight">¿Cómo sigues?</p>
      {moves.map(({ id, label, hint, onClick, primary, icon: MoveIcon, disabled }) => (
        <button
          key={id}
          type="button"
          onClick={onClick}
          disabled={disabled}
          data-move={id}
          className={`w-full flex items-center gap-2.5 rounded-xl px-3 min-h-10 py-2 text-left transition-all active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
            primary
              ? "kx-on-solid kx-cta"
              : "border border-[var(--usb-border-mid)] bg-[var(--usb-bg-3)] hover:border-[#6d4aff]/45"
          }`}
        >
          <MoveIcon size={13} className={`shrink-0 ${primary ? "" : "text-[var(--usb-fg-mid)]"}`} />
          <span className="min-w-0">
            <span className={`block text-[11.5px] font-bold leading-tight ${primary ? "" : "text-[var(--usb-fg-hi)]"}`}>{label}</span>
            {hint && <span className={`block text-[10.5px] font-medium leading-snug mt-0.5 ${primary ? "" : "text-[var(--usb-fg-mid)]"}`}>{hint}</span>}
          </span>
        </button>
      ))}
      {(help || exit) && (
        <div className="pt-1 flex flex-wrap items-center gap-2">
          {help}
          {exit && (
            <button type="button" onClick={exit.onClick} data-move-exit
              className="ml-auto h-8 px-2 text-[11px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] underline-offset-2 hover:underline rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
              {exit.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** «Tengo una duda» — mismo botón en todos los sitios: justo debajo de la revisión. */
function DoubtButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} data-doubt-trigger
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 text-[11px] font-semibold border rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
        open
          ? "text-violet-300 border-violet-500/40 bg-violet-500/10"
          : "text-[var(--usb-fg-mid)] hover:text-violet-300 border-[var(--usb-border)] bg-[var(--usb-bg-3)] hover:border-violet-500/35"
      }`}>
      <HelpCircle size={12} />Tengo una duda
    </button>
  );
}

/** Mostrar/ocultar una referencia (respuesta esperada, solución): mismo control en cada paso. */
function RevealButton({ open, onClick, label, openLabel }: { open: boolean; onClick: () => void; label: string; openLabel: string }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} data-show-expected
      className="inline-flex items-center gap-1.5 h-8 px-2.5 text-[11px] font-semibold border rounded-lg border-[var(--usb-border)] bg-[var(--usb-bg-3)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:border-[var(--usb-border-mid)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
      <BookOpen size={12} />{open ? openLabel : label}
    </button>
  );
}

/** Ayuda plegable (pista, estructura): el mismo control en cada paso; no cuenta como intento. */
function HelpToggle({ open, onToggle, label, openLabel, children }: { open: boolean; onToggle: () => void; label: string; openLabel: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5" data-help-toggle>
      <button onClick={onToggle} aria-expanded={open}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
          open
            ? "bg-amber-500/10 border-amber-500/30 text-[var(--usb-warn-text)]"
            : "bg-[var(--usb-bg-3)] border-[var(--usb-border)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg)] hover:border-[var(--usb-border-mid)]"
        }`}>
        <Sparkles size={12} className="shrink-0 text-amber-400" />
        <span className="text-[11px] font-semibold flex-1">{open ? openLabel : label}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl p-3 text-[11.5px] text-[var(--usb-fg)] leading-relaxed whitespace-pre-wrap">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Referencia que se ve al cerrar el intento (respuesta esperada / solución). */
function ReferenceAnswer({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] overflow-hidden" data-reference-answer>
      <p className="px-3 pt-2.5 text-[10.5px] font-bold text-[var(--usb-ok-text)]">{label}</p>
      <div className={`px-3 pb-3 pt-1 text-[11.5px] leading-relaxed text-[var(--usb-fg)] whitespace-pre-wrap overflow-x-auto ${mono ? "font-mono text-[10.5px]" : ""}`}>{children}</div>
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="text-white/90" style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i} className="px-1 py-0.5 rounded bg-white/8 text-violet-300 text-[10.5px] font-mono">{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// ─── Utility helpers ──────────────────────────────────────────────────────────
function markQa(marker: string): void {
  try {
    const w = window as unknown as { __usgQa?: string[] };
    (w.__usgQa ??= []).push(marker);
    if (w.__usgQa.length > 200) w.__usgQa.shift();
  } catch {}
}

function downloadFile(content: string, filename: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function detectTranscriptLang(text: string): "en" | "es" | null {
  const sample = text.slice(0, 4000).toLowerCase();
  const words = sample.match(/[a-záéíóúñ]+/g) ?? [];
  if (words.length < 20) return null;
  const en = new Set(["the", "and", "is", "of", "to", "in", "that", "it", "you", "we", "this", "for", "with", "are", "on", "can", "have"]);
  const es = new Set(["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "es", "por", "con", "para", "se", "lo", "como", "del"]);
  let e = 0, s = 0;
  for (const w of words) { if (en.has(w)) e++; if (es.has(w)) s++; }
  if (e === s) return null;
  return e > s ? "en" : "es";
}

// ── Programa (career track) ───────────────────────────────────────────────────
// El content script del sitio escribe dc_program_context por storage (tracks
// del curso, el elegido por el usuario y sus datos). El dock solo lo lee: en
// Udemy no existe y todo lo de programa deja de renderizarse.
type DcProgramCourse = { id: number; title: string; slug: string; position: number; done: boolean | null };
type DcProgram = {
  slug: string; title: string; description: string; timeNeeded: string;
  completionRate: number | null; enrolled: boolean | null;
  courses: DcProgramCourse[];
  currentCourseDone: boolean | null;
  nextCourse: { title: string; slug: string } | null;
};
type DcProgramContext = {
  tracks: { slug: string; title: string }[] | null;
  activeSlug: string | null;
  program: DcProgram | null;
  courseId: number | null;
};

function useDcProgramContext(): DcProgramContext | null {
  const [ctx, setCtx] = useState<DcProgramContext | null>(null);
  useEffect(() => {
    let alive = true;
    chromeStorage.get(["dc_program_context"]).then((data) => {
      if (alive) setCtx((data.dc_program_context as DcProgramContext) ?? null);
    }).catch(() => { /* sin storage (preview): sin programa */ });
    const off = chromeStorage.onChange((changes) => {
      if ("dc_program_context" in changes && alive) setCtx((changes.dc_program_context as DcProgramContext) ?? null);
    });
    return () => { alive = false; off(); };
  }, []);
  return ctx;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cardTextToHtml(s: string): string {
  return escapeHtml(s)
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}

async function exportApkgFile(
  cards: AnkiCard[],
  course: string,
  lesson: string,
  rootDeck: string,
  onProgress?: (msg: string) => void,
  dcTrackSlug?: string | null,
): Promise<string> {
  const root = rootDeck.trim() || "Kinema";
  const lessonUrl = typeof window !== "undefined" && /^https?:/.test(window.location.href) ? window.location.href : "";
  const selected = cards.filter((c) => !c.excluded);
  const spec = buildConceptSpec(
    selected.map((c) => ({
      front: c.isHtml ? c.front : cardTextToHtml(c.front),
      back: c.isHtml ? c.back : cardTextToHtml(c.back),
      // GUID probado: hash de curso|lección|front — reimportar ACTUALIZA en vez de duplicar.
      guid: stableAnkiGuid(course, lesson, c),
      type: c.type,
      // §3: las de refuerzo se ordenan primero dentro de buildConceptSpec.
      reinforce: c.reinforce,
      // §5: las de duda también son de refuerzo, con su propio origen.
      // Programa activo: tag kinema::track::<slug> en TODAS las tarjetas —
      // en Anki una tarjeta vive en un mazo, así que el programa va por tag
      // (un curso puede estar en varios programas sin duplicar nada).
      tags: [
        ...kinemaTags({ course, lesson, type: c.type, aiTags: c.tags, reinforce: c.reinforce, origin: c.doubt ? "duda" : c.reinforce ? "study" : undefined }),
        ...(dcTrackSlug ? [`kinema::track::${dcTrackSlug}`] : []),
      ],
    })),
    course,
    lesson,
    root,
    lessonUrl,
  );
  onProgress?.("Empaquetando tarjetas…");
  const apkg = await buildAnkiApkg(spec, onProgress, PRISM_MEDIA_FILES);
  const safe = (s: string) => s.replace(/[^a-z0-9]/gi, "_");
  downloadApkg(apkg, `${safe(lesson)}_conceptos.apkg`);
  return conceptDeckPath(root, course, lesson);
}

// GUID por contenido (curso|lección|[study:]front): reimportar la misma
// lección actualiza las notas en vez de duplicarlas aunque cambie el orden
// o la cantidad. Las de refuerzo NUEVAS (study-refuerzo-*) llevan el prefijo
// "study:" (§3), así que no colisionan con una generada por IA; las de duda
// (§5) llevan "duda:" por el mismo motivo. Marcar una de IA como refuerzo
// cambia sus etiquetas y su orden, no su GUID.
/** Tarjetas que ejercitan lo mismo que Aplicar (refuerzo si la práctica no salió). */
/** Un solo aviso de Obsidian en pantalla: cada uno reemplaza al anterior. */
const OBSIDIAN_TOAST_ID = "kx-obsidian";

function isPracticeCard(c: { type: AnkiCard["type"] }): boolean {
  return c.type === "aplicacion" || c.type === "codigo" || c.type === "entrevista";
}

function stableAnkiGuid(course: string, lesson: string, card: { id?: string; front: string; reinforce?: boolean; doubt?: boolean }): string {
  // "study:" solo en las tarjetas NUEVAS de refuerzo (frente = una pregunta). Una
  // tarjeta de la lección que pasa a ser de refuerzo conserva su GUID: si no,
  // cambiar una marca o hacer la práctica tras exportar la duplicaría en Anki.
  const extra = card.reinforce && (card.id ?? "").startsWith("study-refuerzo-");
  const source = `${sanitizeDeckSegment(course)}|${sanitizeDeckSegment(lesson)}|${card.doubt ? "duda:" : extra ? "study:" : ""}${card.front}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `usb${hash.toString(36)}`;
}

function generateContent(objectiveId: string, custom: string, course: string, lesson: string): StudyContent {
  const goal = (custom || objectiveId || "dominar el tema").trim();
  const topic = lesson.trim() || "esta lección";
  const tag = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const tags = [tag(course) || "curso", tag(lesson) || "leccion"];
  return {
    relevance: {
      // Sin IA no hay estimación real: -1 oculta la barra (nada de cifras inventadas).
      score: -1,
      reason: `Plantilla local: «${topic}» sostiene lo que viene después en «${course}». Conectarlo con tu objetivo hoy evita releerlo mañana.`,
    },
    keyConcepts: [
      `Idea central de «${topic}»: qué problema resuelve y en qué contexto se usa.`,
      `Cómo funciona por dentro: las piezas o pasos que hacen que «${topic}» haga lo que hace.`,
      `Cuándo aplicarlo y cuándo no: límites, errores comunes y alternativas.`,
    ],
    questions: [
      { q: `¿Qué problema resuelve «${topic}» y por qué importa?`, bloom: "recordar", difficulty: "confused", hint: "Piensa en qué pasaría si no existiera.", answer: `Debe nombrar el problema central de «${topic}» y una consecuencia concreta de no resolverlo.`, conceptRefs: [0] },
      { q: `Describe con tus palabras cómo funciona «${topic}».`, bloom: "comprender", difficulty: "partial", hint: "Recorre el proceso de principio a fin.", answer: `Una explicación ordenada de las piezas o pasos clave, sin saltos.`, conceptRefs: [1] },
      { q: `Dado tu objetivo («${goal}»), ¿en qué situación aplicarías «${topic}» y en cuál no?`, bloom: "aplicar", difficulty: "clear", hint: "Da un caso concreto y un contraejemplo.", answer: `Un caso de uso realista más un límite claro, justificado.`, conceptRefs: [2] },
      { q: `Compara «${topic}» con la alternativa más común. ¿Qué decisión tomarías y por qué?`, bloom: "evaluar", difficulty: "mastered", hint: "Compara costo, riesgo y mantenimiento.", answer: `Una comparación con criterios explícitos y una decisión defendida.`, conceptRefs: [1, 2] },
    ],
    application: {
      setup: `Imagina que debes aplicar «${topic}» en un proyecto real alineado con: ${goal}.`,
      challenge: `Escribe un breve plan o fragmento que demuestre «${topic}» en ese contexto y explica una decisión clave.`,
      solution: `Una solución válida aplica la idea central, respeta los límites del tema y justifica al menos una decisión con un criterio claro.`,
      isCode: false,
    },
    // Entrevista solo si el objetivo lo pide (misma regla que el prompt de la IA).
    interviewQ: {
      q: /\b(entrevista|interview)\b/i.test(goal)
        ? `En una entrevista te piden explicar «${topic}» en un minuto. ¿Qué dirías? Cubre qué es, para qué sirve y un ejemplo.`
        : `Explícale «${topic}» en un minuto a alguien que no lo conoce. Cubre qué es, para qué sirve y un ejemplo.`,
      idealAnswer: `1) Qué es y qué problema resuelve. 2) Cómo funciona en una frase. 3) Un ejemplo real. 4) Un límite o trade-off.`,
    },
    nextAction: `Usa «${topic}» en un ejemplo propio (tu proyecto o un ejercicio pequeño) antes de la siguiente lección.`,
    ankiCards: [
      // Una por idea clave (conceptRefs): así el refuerzo de lo no marcado también funciona sin IA.
      { id: "card-001", type: "concepto", conceptRefs: [0], front: `¿Qué problema resuelve «${topic}»?`, back: `Resuelve la necesidad central del tema dentro de «${course}». Explícalo con un ejemplo propio.`, tags },
      { id: "card-002", type: "proceso", conceptRefs: [1], front: `¿Cómo funciona «${topic}», paso a paso?`, back: `Piezas clave en orden: entrada, transformación y resultado. Di qué hace cada una.`, tags },
      { id: "card-003", type: "comparacion", conceptRefs: [2], front: `¿Cuándo usar «${topic}» y cuándo evitarlo?`, back: `Úsalo cuando encaja con tu objetivo (${goal}); evítalo cuando sus límites lo hacen costoso o frágil.`, tags },
    ],
  };
}

// ─── Progress stepper ─────────────────────────────────────────────────────────
function ProgressStepper({ steps, focus }: { steps: { label: string; done: boolean; active: boolean }[]; focus: number }) {
  return (
    <div className="flex items-start" role="list" aria-label="Progreso de la sesión">
      {steps.map((s, i) => {
        const m = STEP_META[i];
        const cur = i === focus;
        const state = s.done && !cur ? "done" : cur ? "cur" : "todo";
        const stepColor = m.hue;
        return (
          <div
            key={s.label}
            role="listitem"
            className="flex-1 min-w-0 flex flex-col items-center gap-1.5 relative"
            style={{ "--kx-step-color": stepColor } as React.CSSProperties}
          >
            {i > 0 && (
              <span
                className="kx-node-line"
                data-on={steps[i - 1].done ? "1" : "0"}
                style={steps[i - 1].done ? { background: STEP_META[i - 1].hue } : undefined}
                aria-hidden="true"
              />
            )}
            <motion.span
              animate={cur ? { scale: [1, 1.08, 1] } : s.done ? { scale: [1, 1.15, 1] } : { scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="kx-node relative z-10 w-7 h-7 rounded-full flex items-center justify-center shadow-xs"
              data-st={state}
              style={
                state === "cur"
                  ? {
                      backgroundColor: stepColor,
                      borderColor: stepColor,
                      boxShadow: `0 0 0 3.5px color-mix(in srgb, ${stepColor} 26%, transparent)`,
                    }
                  : state === "done"
                    ? {
                        borderColor: stepColor,
                        color: stepColor,
                      }
                    : undefined
              }
            >
              {state === "done" ? (
                <Check size={13} strokeWidth={2.8} style={{ color: stepColor }} />
              ) : (
                <Icon
                  name={m.icon}
                  size={13}
                  weight={cur ? "fill" : "duotone"}
                  style={{ color: cur ? "#fff" : undefined }}
                />
              )}
            </motion.span>
            <span
              className="text-[10px] truncate max-w-full leading-none transition-colors"
              style={{
                color: cur ? stepColor : s.done ? "var(--usb-fg-hi)" : "var(--usb-fg-lo)",
                fontWeight: cur ? 700 : 500,
              }}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Review of answered questions ─────────────────────────────────────────────
/** Comprobación cerrada: cada pregunta con tu respuesta, la revisión y la respuesta esperada. */
const RATING_LABEL: Record<string, string> = { correct: "Correcta", excellent: "Excelente", partial: "A medias", wrong: "Todavía no" };
function VerifyDoneReview({
  questions, answers, feedbacks, onGoApply, onAskDoubt, isDoubtOpen, renderDoubt, onChallenge,
}: {
  questions: StudyContent["questions"];
  answers: Record<number, string>;
  feedbacks: Record<number, FeedbackState>;
  onGoApply: () => void;
  /** §5: la duda también se pide al repasar (quien acierta a la primera llega aquí). */
  onAskDoubt?: (i: number) => void;
  isDoubtOpen?: (i: number) => boolean;
  renderDoubt?: (i: number) => React.ReactNode;
  /** §1.2: «Un reto más», opcional, solo tras acertar y si hay una de nivel más alto. */
  onChallenge?: () => void;
}) {
  // Solo lo respondido; la última queda abierta (su revisión y la duda siguen a la vista).
  const answered = questions.map((q, i) => ({ q, i })).filter(({ i }) => feedbacks[i]?.status === "done");
  const [openIdx, setOpenIdx] = useState<number | null>(answered.length > 0 ? answered[answered.length - 1].i : null);
  const [shownAnswers, setShownAnswers] = useState<Record<number, boolean>>({});
  const missed = answered.some(({ i }) => !["correct", "excellent"].includes(feedbacks[i]?.rating ?? ""));
  return (
    <div className="space-y-2" data-verify-review>
      <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed px-1">
        <span className="font-bold text-[var(--usb-fg-hi)]">Comprobación terminada.</span>{missed ? " Lo que falló va a Anki como refuerzo." : ""} Toca una pregunta para repasarla.
      </p>
      {answered.map(({ q, i }) => {
        const fb = feedbacks[i];
        const open = openIdx === i;
        const rating = fb?.rating ?? "unknown";
        const tone =
          rating === "correct" || rating === "excellent" ? "bg-emerald-400"
          : rating === "partial" ? "bg-amber-400"
          : rating === "wrong" ? "bg-red-400"
          : "bg-white/25";
        return (
          <div key={i} className="bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenIdx(open ? null : i)}
              aria-expanded={open}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
            >
              <span className={`h-2 w-2 rounded-full shrink-0 ${tone}`} aria-hidden="true" />
              <span className="flex-1 min-w-0 text-[11px] font-semibold text-[var(--usb-fg-hi)] leading-snug">{q.q}</span>
              <span className="text-[10px] font-semibold text-[var(--usb-fg-mid)] shrink-0">{RATING_LABEL[rating] ?? ""}</span>
              <ChevronDown size={13} className={`text-[var(--usb-fg-lo)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-2">
                    <div className="rounded-xl bg-[var(--usb-bg-2)] border border-[var(--usb-border)] px-3 py-2.5">
                      <p className="text-[10.5px] font-bold text-[var(--usb-fg-mid)] mb-1">Tu respuesta</p>
                      <p className="text-[11.5px] text-[var(--usb-fg)] leading-relaxed whitespace-pre-wrap">{answers[i] || "—"}</p>
                    </div>
                    <AIFeedback fb={fb} />
                    {/* Lo que se puede hacer con esta pregunta, justo bajo su revisión */}
                    <div className="flex flex-wrap items-center gap-2">
                      <RevealButton open={Boolean(shownAnswers[i])} onClick={() => setShownAnswers(p => ({ ...p, [i]: !p[i] }))} label="Ver la respuesta esperada" openLabel="Ocultar la respuesta esperada" />
                      {onAskDoubt && <DoubtButton open={Boolean(isDoubtOpen?.(i))} onClick={() => onAskDoubt(i)} />}
                    </div>
                    {shownAnswers[i] && <ReferenceAnswer label="Respuesta esperada">{q.answer}</ReferenceAnswer>}
                    {renderDoubt?.(i)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      {onChallenge && (
        <button
          type="button"
          onClick={onChallenge}
          data-challenge
          className="w-full flex items-start gap-2.5 rounded-xl border border-[var(--usb-border-mid)] bg-[var(--usb-bg-3)] hover:border-[#6d4aff]/45 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
        >
          <Zap size={13} className="mt-0.5 shrink-0 text-amber-400" />
          <span className="min-w-0">
            <span className="block text-[11.5px] font-bold text-[var(--usb-fg-hi)] leading-tight">Un reto más (opcional)</span>
            <span className="block text-[10.5px] text-[var(--usb-fg-mid)] leading-snug mt-0.5">Una pregunta más difícil. Cuenta en tu resumen.</span>
          </span>
        </button>
      )}
      <StepContinueButton label="Continuar a Aplicar" onClick={onGoApply} />
    </div>
  );
}

// ─── Anki flip-card preview ───────────────────────────────────────────────────
/** Vista previa legible de una tarjeta con HTML de confianza (refuerzo, duda): sin etiquetas literales. */
function cardPreviewText(value: string, isHtml?: boolean): string {
  if (!isHtml) return value;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<blockquote[^>]*>/gi, "\n«")
    .replace(/<\/blockquote>/gi, "»")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function AnkiFlipPreview({ cards, onToggleExclude }: { cards: AnkiCard[]; onToggleExclude?: (id: string) => void }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!cards.length) return null;
  const card = cards[Math.min(idx, cards.length - 1)];
  const meta = CARD_META[card.type] ?? CARD_META.concepto;
  const go = (d: number) => { setFlipped(false); setIdx((i) => (i + d + cards.length) % cards.length); };
  return (
    <div className="space-y-2">
      <button
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Ver frente de la tarjeta" : "Ver reverso de la tarjeta"}
        className="w-full text-left rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-3.5 py-3.5 min-h-[112px] transition-colors hover:border-[#6d4aff]/40"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5">
            <span className={`flex items-center gap-1.5 text-[9.5px] ${meta.color}`} style={{ fontWeight: 600 }}>
              <Icon name={meta.icon} size={11} />{meta.label}
            </span>
            {card.doubt ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300" style={{ fontWeight: 700 }}>
                Duda{card.t ? ` · ${card.t}` : ""}
              </span>
            ) : card.reinforce && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300" style={{ fontWeight: 700 }}>Refuerzo</span>
            )}
          </span>
          <span className="flex items-center gap-1 text-[var(--usb-fg-lo)] text-[9.5px] font-medium">
            <FlipHorizontal size={10} />{flipped ? "Reverso" : "Frente"}
          </span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={`${card.id}-${flipped}`}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className={`text-[12px] leading-relaxed whitespace-pre-wrap ${flipped ? "text-[var(--usb-fg-mid)]" : "text-[var(--usb-fg-hi)]"}`}
            style={{ fontWeight: flipped ? 400 : 600 }}
          >
            {cardPreviewText(flipped ? card.back : card.front, card.isHtml)}
          </motion.p>
        </AnimatePresence>
      </button>
      <div className="flex items-center justify-between">
        <button onClick={() => go(-1)} aria-label="Tarjeta anterior" className="p-1.5 rounded-lg text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-bg-2)] transition-colors">
          <ChevronLeft size={13} />
        </button>
        <span className="text-[var(--usb-fg-lo)] text-[10px] font-medium">{idx + 1} / {cards.length}</span>
        <div className="flex items-center gap-1.5">
          {onToggleExclude && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExclude(card.id); }}
              className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors ${
                card.excluded
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-500/45"
                  : "border-[var(--usb-border)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:border-[var(--usb-border-mid)]"
              }`}
            >
              {card.excluded ? "Incluir" : "Quitar"}
            </button>
          )}
          <button onClick={() => go(1)} aria-label="Tarjeta siguiente" className="p-1.5 rounded-lg text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-bg-2)] transition-colors">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function StudyAgentTab({ session, apiKeys = [], vocabularyMount }: { session?: Session; apiKeys?: string[]; vocabularyMount?: HTMLElement | null }) {
  const { t } = useDockTheme();
  const [phase, setPhase]             = useState<Phase>(() => {
    // Si ya hay contenido en cache o estamos en prototipo, permitir iniciar en ready si existe
    return "objective";
  });
  const [selectedObj, setSelectedObj] = usePersistedState<string>("agent_selected_obj", IS_EXTENSION ? "" : "spring-interview");
  const [customObj, setCustomObj]     = usePersistedState<string>("agent_custom_obj", "");
  const [refinedObj, setRefinedObj]   = useState("");
  const [refinedFromText, setRefinedFromText] = useState("");
  const [isRefining, setIsRefining]   = useState(false);
  const [courseName, setCourseName]   = usePersistedState<string>("agent_course_name", IS_EXTENSION ? "" : "Java In-Depth: Become a Complete Java Engineer!");
  const [lessonName, setLessonName]   = usePersistedState<string>("agent_lesson_name", IS_EXTENSION ? "" : "What is Java & JVM?");
  const [courseDescription, setCourseDescription] = usePersistedState<string>("agent_course_description", "");
  const [courseAIContext, setCourseAIContext]           = useState("");
  const [courseAIContextSlug, setCourseAIContextSlug]   = useState("");
  const [courseAIContextTitle, setCourseAIContextTitle] = useState("");
  const [genStep, setGenStep]         = useState(0);

  const [dynamicObjectives, setDynamicObjectives]   = useState<GeneratedObjective[] | null>(null);
  const [objectivesLoading, setObjectivesLoading]   = useState(false);
  const [objectivesError, setObjectivesError]       = useState<string | null>(null);
  const [objectivesMock, setObjectivesMock]         = useState(false);
  const [lastUsedObjectiveId, setLastUsedObjectiveId] = useState<string | null>(null);
  // Objetivo de ESTE curso recuperado del historial (texto + id): única fuente
  // admisible para pre-generar sin que el estudiante lo confirme — el texto
  // libre global (`agent_custom_obj`) sobrevive al cambio de curso.
  const courseObjectiveRef = useRef<{ text: string; id: string | null } | null>(null);
  // Pre-generación del mazo mientras corre el vídeo. Vive solo en caché: no
  // toca historial ni gamificación hasta que el estudiante abra Study.
  const preGenRef = useRef<{
    status: "idle" | "running" | "done";
    lectureKey: string;
    objectiveText: string;
    objectiveId: string | null;
    promise: Promise<void> | null;
    lastAttemptAt: number;
  }>({ status: "idle", lectureKey: "", objectiveText: "", objectiveId: null, promise: null, lastAttemptAt: 0 });
  const videoClockRef = useRef<{ ts: number; duration: number | null }>({ ts: 0, duration: null });
  // Disponibilidad REAL de la IA. Antes el CTA se podía pulsar sin proveedor y
  // el fallo aparecía tras la espera; y el badge decía «conectada» siempre.
  //   no-config   -> falta base URL o key
  //   comprobando -> primer sondeo en vuelo
  //   lista       -> el proveedor respondió
  //   sin-respuesta -> configurado pero no contesta (se reintenta solo)
  const [aiState, setAiState] = useState<AiState>("comprobando");
  const [aiEndpoint, setAiEndpoint] = useState<string>("");
  // Objetivo activo LEÍDO EN VIVO (el callback de pre-generación captura el
  // estado de su render; comparar contra esa foto no protegía de un cambio).
  const currentObjectiveRef = useRef<string>("");
  // Identidad de la lección actual: si cambia, la pre-generación en curso o
  // terminada se descarta (Study está siempre montado y el estado sobrevive).
  const lessonIdentityRef = useRef<string>("");
  const [objectivesExpanded, setObjectivesExpanded] = useState(false);
  const [objectivesRegenCount, setObjectivesRegenCount] = useState(0);
  const [activeSessionObjective, setActiveSessionObjective] = useState<string | null>(null);

  const [content, setContent]                       = useState<StudyContent | null>(null);
  const [confidence, setConfidence]                 = useState<ConfidenceLevel | null>(null);
  const [conceptsChecked, setConceptsChecked]       = useState<Record<number, boolean>>({});
  const [conceptsAcknowledged, setConceptsAcknowledged] = useState(false);
  const [appAnswer, setAppAnswer]                   = useState("");
  const [appFeedback, setAppFeedback]               = useState<FeedbackState>(IDLE_FB);
  const [showAppSolution, setShowAppSolution]       = useState(false);
  const [ankiExported, setAnkiExported]             = useState(false);
  const appRewardedRef = useRef(false);
  const [showAppHint, setShowAppHint]               = useState(false);
  const [showAnkiGuide, setShowAnkiGuide]           = useState(false);
  const [showCardPreview, setShowCardPreview]       = useState(false);
  const [apkgStatus, setApkgStatus]                 = useState<"idle" | "loading" | "done" | "error">("idle");
  // v1.5.4: aviso ÚNICO tras el primer export .apkg — sin la opción
  // «Importar cualquier configuración del mazo» los presets no llegan y los
  // mazos caen en Default. Anki recuerda la opción: basta una vez.
  const [importHintSeen, setImportHintSeen]         = usePersistedState<boolean>("kinema_import_hint_seen", false);
  const [apkgProgress, setApkgProgress]             = useState("");
  const [showHint, setShowHint]                     = useState(false);
  const [questionAnswers, setQuestionAnswers]       = useState<Record<number, string>>({});
  const [questionFeedbacks, setQuestionFeedbacks]   = useState<Record<number, FeedbackState>>({});
  // Texto que Kinema revisó por pregunta: si cambia, la revisión es de la versión anterior.
  const [evaluatedAnswers, setEvaluatedAnswers]     = useState<Record<number, string>>({});
  // «Un reto más» en curso: la comprobación ya estaba cerrada y sigue cerrada.
  const [challengeOpen, setChallengeOpen]           = useState(false);
  // Aplicar: texto revisado y si ya se vio la solución (cierra los intentos: §1.7 honestidad).
  const [appEvaluated, setAppEvaluated]             = useState("");
  const [appSolutionSeen, setAppSolutionSeen]       = useState(false);
  const [oralEvaluated, setOralEvaluated]           = useState("");
  // §5: dudas sobre la lección — hilos (fuente de verdad de sus tarjetas), el
  // panel abierto (uno solo, en línea bajo su ancla) y la lección de la sesión
  // (las dudas se responden con SU transcripción).
  const [doubts, setDoubts]                         = useState<LessonDoubtThread[]>([]);
  const [openDoubtKey, setOpenDoubtKey]             = useState<string | null>(null);
  const [doubtDemo, setDoubtDemo]                   = useState<{ transcript: string; answerFor: (question: string) => string } | null>(null);
  const [studySession, setStudySession]             = useState<{ course: string; lesson: string } | null>(null);
  // GUIDs del último .apkg: en Fijar avisa si hay tarjetas que aún no llegaron a Anki.
  const [lastExportGuids, setLastExportGuids]       = useState<string[] | null>(null);
  // Recordar: el selector de nivel se pliega al elegir (el recuerdo queda a la vista).
  const [levelPickerOpen, setLevelPickerOpen]       = useState(false);
  const [currentQIdx, setCurrentQIdx]               = useState(0);
  // §1.2: cola adaptativa de preguntas (índices canónicos de content.questions).
  const [questionQueue, setQuestionQueue]           = useState<number[]>([]);
  const [questionsComplete, setQuestionsComplete]   = useState(false); // paso 2 terminado (respondido o saltado)
  const [questionsSkipped, setQuestionsSkipped]     = useState(false);
  const [challengeUsed, setChallengeUsed]           = useState(false); // «Un reto más» ya usado
  // §1.3/§1.7: Aplicar nunca bloquea; «Saltar este paso» cuenta como pendiente.
  const [practiceStatus, setPracticeStatus]         = useState<"done" | "correct" | "later" | null>(null);
  // §1.4: finished = finishedAt != null — exportar ya no es requisito.
  const [finishedAt, setFinishedAt]                 = useState<number | null>(null);
  // §1.7: Aplicar ofrece dos formas de practicar, a la vista (ejercicio o explicarlo).
  const [practiceMode, setPracticeMode]             = useState<"exercise" | "explain">("exercise");
  // §1.5: indicador REAL de transcripción en la pantalla de objetivo.
  // §1.5: fuera de runtime (vista previa web) no hay bridge que consultar:
  // el estado nace "preview" y la tira lo dice en vez de «Comprobando…» eterno.
  const [transcriptState, setTranscriptState]       = useState<{ status: "checking" | "ready" | "waiting" | "none" | "unsupported" | "preview"; cues: number | null; article?: boolean }>(IS_EXTENSION ? { status: "checking", cues: null } : { status: "preview", cues: null });
  // «Volver a comprobar»: reinicia la detección (tras activar los subtítulos, por ejemplo).
  const [transcriptRecheck, setTranscriptRecheck]   = useState(0);
  const [courseDueCount, setCourseDueCount]         = useState<number | null>(null);
  // §2: nivel/logros desbloqueados en el flujo se muestran DENTRO del cierre.
  const [pendingLevelUp, setPendingLevelUp]         = useState<number | null>(null);
  const [pendingUnlocked, setPendingUnlocked]       = useState<string[]>([]);
  // §6 (v1.5.1): confirmación de reinicio DENTRO del dock — el diálogo nativo
  // no sigue los temas y dentro de Udemy bloquea página y vídeo.
  const [confirmingReset, setConfirmingReset]       = useState(false);
  const confirmingResetTimerRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetBtnRef                                 = useRef<HTMLButtonElement>(null);
  const confirmGroupRef                             = useRef<HTMLSpanElement>(null);
  const restoreResetFocusRef                        = useRef(false);
  useEffect(() => () => {
    if (confirmingResetTimerRef.current) clearTimeout(confirmingResetTimerRef.current);
  }, []);
  // v1.5.2: Cancelar, Escape y el temporizador de 5 s pasan por AQUÍ. Si el
  // foco seguía dentro del grupo de confirmación, vuelve al botón «Reiniciar»
  // (quien navegaba con teclado/lector no pierde su sitio en el header).
  const closeResetConfirm = () => {
    const root = confirmGroupRef.current?.getRootNode() as Document | ShadowRoot | undefined;
    const active = root?.activeElement ?? null;
    if (confirmGroupRef.current && active && confirmGroupRef.current.contains(active as Node)) {
      restoreResetFocusRef.current = true;
    }
    if (confirmingResetTimerRef.current) clearTimeout(confirmingResetTimerRef.current);
    setConfirmingReset(false);
  };
  // Escape cancela la confirmación (además del botón «Cancelar»).
  useEffect(() => {
    if (!confirmingReset) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeResetConfirm(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // Restauración del foco al desmontar el grupo de confirmación.
  useEffect(() => {
    if (confirmingReset) return;
    if (restoreResetFocusRef.current) {
      restoreResetFocusRef.current = false;
      resetBtnRef.current?.focus();
    }
  }, [confirmingReset]);
  const [showInterviewAnswer, setShowInterviewAnswer] = useState(false);
  const [oralAnswer, setOralAnswer]                 = useState("");
  const [oralFeedback, setOralFeedback]             = useState<FeedbackState>(IDLE_FB);
  const [recallRevealed, setRecallRevealed]         = useState(false);
  const [recallNotes, setRecallNotes]               = useState("");
  const [historyOpen, setHistoryOpen]               = useState(false);

  // Vocabulary export
  const [vocabCfg, setVocabCfg]             = useState<VocabConfig>(DEFAULT_VOCAB_CONFIG);
  const [vocabLangOk, setVocabLangOk]       = useState<boolean | null>(null);

  // Badge de repasos: tarjetas de ESTA lección con repaso pendiente en Anki hoy
  // (vía AnkiConnect; null = Anki cerrado o sin datos).
  const [ankiDue, setAnkiDue]               = useState<number | null>(null);
  const [ankiOpening, setAnkiOpening]       = useState(false);

  // Obsidian export
  const [obsidianCfg, setObsidianCfg]             = useState<ObsidianExportConfig>(DEFAULT_OBSIDIAN_EXPORT_CONFIG);
  // Programa (career track) del sitio — null en Udemy o sin elección.
  const dcCtx = useDcProgramContext();
  const openObsidianSettings = () => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "obsidian" } }));
  const [obsidianHelpOpen, setObsidianHelpOpen]   = useState(false);
  const [obsidianStatus, setObsidianStatus]       = useState<"idle" | "done" | "error">("idle");
  const [createdMocs, setCreatedMocs]             = useState<string[]>([]);
  const [exportedNotes, setExportedNotes]                    = useState<string[]>([]);
  const [obsidianExportedAt, setObsidianExportedAt]           = useState<number | null>(null);
  // «Ir a la siguiente lección» (tras terminar).
  const [nextLessonStatus, setNextLessonStatus] = useState<"idle" | "going" | "failed">("idle");
  const pendingNextLessonRef = useRef<string | null>(null);
  const nextLessonRef = useRef<HTMLDivElement | null>(null);

  // Focus navigator (one step at a time)
  const [focusStep, setFocusStep] = useState(0);
  const [focusDir,  setFocusDir]  = useState(1);

  // Gamification & Dopamine state
  const [sessionXp, setSessionXp]       = useState(0);
  const [streakCount, setStreakCount]   = useState(() => getStreak());
  const [userProgress, setUserProgress] = useState(() => getProgress());
  // Mismo nivel/XP que la cabecera del dock: el cierre suma XP fuera de este componente.
  useEffect(() => {
    const sync = () => setUserProgress(getProgress());
    window.addEventListener("usb:xp", sync);
    return () => window.removeEventListener("usb:xp", sync);
  }, []);
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>([]);

  // Refs
  const sessionStartRef    = useRef<number>(Date.now());
  const selectedObjRef     = useRef(selectedObj);
  const courseNameEditedRef = useRef(false);
  const objectivesForRef   = useRef<string>("");
  const rehydratedKeyRef   = useRef<string>("");
  const exportedNotesRef   = useRef<string[]>([]);
  const sessionCelebratedRef = useRef(false);
  const qRewardedRef       = useRef<Set<string>>(new Set());
  const conceptRewardedRef = useRef<Set<number>>(new Set());
  // Preguntas correctas al PRIMER intento — alimenta calibración honesta (§1.6)
  // y el resumen de cierre (§1.4).
  const firstTryCorrectRef = useRef<Set<string>>(new Set());
  // §1.5: estudiante que vuelve (ya hay historial u objetivo en el curso).
  const [returningStudent, setReturningStudent] = useState(false);
  const [showCourseFields, setShowCourseFields] = useState(false);
  const [showCustomObjFold, setShowCustomObjFold] = useState(false);
  const scrollRef          = useRef<HTMLDivElement>(null);
  const conceptsRef        = useRef<HTMLDivElement>(null);
  const questionsRef       = useRef<HTMLDivElement>(null);
  const applyRef           = useRef<HTMLDivElement>(null);
  const ankiRef            = useRef<HTMLDivElement>(null);

  useEffect(() => { selectedObjRef.current = selectedObj; }, [selectedObj]);

  // §2: el XP registra el esfuerzo de aprendizaje; los logros/nivel no abren
  // overlays en cola — se muestran dentro de la tarjeta de cierre (§1.4).
  const recordXp = useCallback((activityType: string, bonus = 0): number => {
    const res = recordActivity(activityType, { bonus });
    if (res.levelUp) setPendingLevelUp(res.levelUp);
    if (res.unlocked.length > 0) {
      setUnlockedBadges(prev => [...prev, ...res.unlocked.map(u => u.title)]);
      setPendingUnlocked(prev => [...new Set([...prev, ...res.unlocked.map(u => u.title)])]);
    }
    setUserProgress(getProgress());
    return res.gained;
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 150);
  }, []);

  // Load persisted export configuration once.
  useEffect(() => {
    let alive = true;
    void loadVocabConfig().then((cfg) => { if (alive) setVocabCfg(cfg); }).catch(() => undefined);
    void loadObsidianExportConfig().then((cfg) => { if (alive) setObsidianCfg(cfg); }).catch(() => undefined);
    void loadCreatedMocs().then((mocs) => { if (alive) setCreatedMocs(mocs); }).catch(() => undefined);
    void loadObsidianExportedNotes().then((notes) => {
      if (!alive) return;
      exportedNotesRef.current = notes;
      setExportedNotes(notes);
    }).catch(() => undefined);
    const unsubscribe = chromeLocalStorage.onChange(changes => {
      if ("obsidian_export_config" in changes) void loadObsidianExportConfig().then(config => { if (alive) setObsidianCfg(config); });
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  // Hidden Udemy course context (written by the sidebar into local storage).
  useEffect(() => {
    const keys = ["agent_course_context", "agent_course_context_slug", "agent_course_context_title"];
    const apply = (data: Record<string, unknown>) => {
      if (typeof data.agent_course_context === "string") setCourseAIContext(data.agent_course_context);
      if (typeof data.agent_course_context_slug === "string") setCourseAIContextSlug(data.agent_course_context_slug);
      if (typeof data.agent_course_context_title === "string") setCourseAIContextTitle(data.agent_course_context_title);
    };
    void chromeLocalStorage.get(keys).then(apply);
    return chromeLocalStorage.onChange((changes) => {
      const relevant: Record<string, unknown> = {};
      for (const k of keys) if (k in changes) relevant[k] = changes[k] ?? "";
      if (Object.keys(relevant).length) apply(relevant);
    });
  }, []);

  useEffect(() => {
    if (!content) return;
    let alive = true;
    void sendRuntimeMessage<{ ok?: boolean; due?: number }>({
      type: "USG_ANKI_DUE", course: courseName, lesson: lessonName, rootDeck: vocabCfg.rootDeck,
    }).then((r) => {
      if (alive && r?.ok && typeof r.due === "number") {
        setAnkiDue(r.due);
      } else if (alive) {
        setAnkiDue(null);
      }
    });
    return () => { alive = false; };
  }, [content, courseName, lessonName, ankiExported, vocabCfg.rootDeck]);

  const handleSaveVocabCfg = (patch: Partial<VocabConfig>) => {
    const next = { ...vocabCfg, ...patch };
    setVocabCfg(next);
    void saveVocabConfig(next);
  };

  const handleOpenAnkiDue = useCallback((scope: "lesson" | "course" = "course") => {
    if (ankiOpening) return;
    setAnkiOpening(true);
    void sendRuntimeMessage({
      type: "USG_ANKI_DUE",
      course: courseName,
      lesson: lessonName,
      browse: true,
      rootDeck: vocabCfg.rootDeck,
      scope,
    });
    setTimeout(() => {
      setAnkiOpening(false);
    }, 1200);
  }, [ankiOpening, courseName, lessonName, vocabCfg.rootDeck]);

  // ── Verdict sound is handled centrally by celebrate() ──────────────────────

  // ── §1.2: SIN auto-avance al completar Comprobar — el estudiante lee el
  // feedback y decide («Un reto más» es opcional); Continuar a Aplicar es manual.
  // ── §1.5: indicador real de transcripción en la pantalla de objetivo ──────
  // Consulta el bridge con maxChars mínimo y reintenta cada 5 s (máx. 12).
  useEffect(() => {
    if (phase !== "objective" || !isExtensionRuntime()) return;
    let tries = 0;
    let alive = true;
    let lastCheckAt = 0;
    const check = async () => {
      if (Date.now() - lastCheckAt < 2000) return;
      lastCheckAt = Date.now();
      tries += 1;
      // Mismo canal que la generación: runtime si responde, bridge del
      // content script si no (el background no maneja GET_STUDY_TRANSCRIPT).
      const res = await requestStudyTranscript(200);
      if (!alive) return;
      if (res?.ok && typeof res.cueCount === "number" && res.cueCount > 0) {
        setTranscriptState({ status: "ready", cues: res.cueCount, article: res.source === "article-text" });
      } else if (res?.lectureKind === "other") {
        // Cuestionario/ejercicio: no hay nada que esperar (ni subtítulos ni texto).
        tries = 12;
        setTranscriptState({ status: "unsupported", cues: null });
      } else if (tries >= 12) {
        setTranscriptState({ status: "none", cues: null });
      } else {
        setTranscriptState({ status: "waiting", cues: null });
      }
    };
    void check();
    // NO rendirse: la captura puede arrancar tarde (p. ej. tras reintentar
    // desde Captions) y antes se dejaba de sondear a los ~60 s, así que el
    // panel se quedaba en «Sin subtítulos» y el CTA bloqueado para siempre.
    const iv = setInterval(() => void check(), 5000);
    // Y si los cues ya están llegando, re-evaluar de inmediato (con freno
    // de 2 s: llegan muchas veces por segundo).
    const onCue = () => { void check(); };
    window.addEventListener("usb:video-progress", onCue);
    return () => { alive = false; clearInterval(iv); window.removeEventListener("usb:video-progress", onCue); };
  }, [phase, courseName, lessonName, transcriptRecheck]);

  // ── §1.5: repasos pendientes del CURSO en la pantalla de objetivo ─────────
  useEffect(() => {
    if (phase !== "objective" || !courseName.trim()) return;
    let alive = true;
    void sendRuntimeMessage<{ ok?: boolean; due?: number }>({
      type: "USG_ANKI_DUE", course: courseName, lesson: lessonName, browse: false,
      rootDeck: vocabCfg.rootDeck, scope: "course",
    }).then((r) => {
      if (!alive) return;
      setCourseDueCount(r?.ok && typeof r.due === "number" ? r.due : null);
    });
    return () => { alive = false; };
  }, [phase, courseName, lessonName, vocabCfg.rootDeck]);

  // NO auto-advance step 3→4: el usuario lee el feedback y decide cuándo continuar

  // Scroll to top — scrollTop=0 es síncrono + doble disparo post-AnimatePresence
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      });
    });
    const t = setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, 350);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [focusStep]);

  // (smart scroll replaced by focus navigator — step auto-advance above)

  // Add sound on phase transitions to keep it interesting
  useEffect(() => {
    if (phase === "result") {
    }
  }, [phase]);

  const GEN_STEPS = [
    "Analizando la transcripción…",
    "Identificando conceptos clave…",
    "Calibrando preguntas a tu objetivo…",
    "Generando escenario de aplicación real…",
    "Creando tarjetas Anki optimizadas…",
  ];

  const getActiveObjectiveText = useCallback(() => {
    if (selectedObj === "custom" && customObj.trim()) return customObj.trim();
    const found = dynamicObjectives?.find(o => o.id === selectedObj);
    if (found) return `${found.title}${found.sub ? ` — ${found.sub}` : ""}`;
    return customObj.trim() || selectedObj;
  }, [customObj, dynamicObjectives, selectedObj]);

  const getActiveObjectiveId = useCallback(() => {
    if (selectedObj === "custom" && customObj.trim()) return "custom";
    if (dynamicObjectives?.some(o => o.id === selectedObj)) return selectedObj;
    return selectedObj || "custom";
  }, [customObj, dynamicObjectives, selectedObj]);

  // ── Pre-generación del mazo durante el vídeo ─────────────────────────────
  // Objetivo admisible sin confirmación del estudiante: (a) el último usado en
  // ESTE curso, (b) el dinámico del curso elegido, (c) el primero de la lista
  // del curso. Un texto libre solo cuenta si el historial del curso ya lo
  // registró; si no, se pre-genera con el del curso (y si el estudiante
  // mantiene el suyo, la pre-generación se descarta al no coincidir).
  const resolvePreGenObjective = useCallback((): { text: string; id: string | null } | null => {
    const courseObj = courseObjectiveRef.current;
    if (courseObj?.text) return courseObj;
    const activeId = getActiveObjectiveId();
    if (activeId && activeId !== "custom") {
      const found = dynamicObjectives?.find(o => o.id === activeId);
      if (found) return { text: `${found.title}${found.sub ? ` — ${found.sub}` : ""}`, id: found.id };
    }
    const first = dynamicObjectives?.[0];
    if (first) return { text: `${first.title}${first.sub ? ` — ${first.sub}` : ""}`, id: first.id };
    return null;
  }, [dynamicObjectives, getActiveObjectiveId]);

  // Clave de caché de la pre-generación: SIEMPRE curso + ID real de la lección
  // (el id numérico de Udemy) + objetivo. Sin curso ni id, dos lecciones con el
  // mismo nombre («Introduction», «Demo») compartirían mazo.
  const preGenCacheKey = useCallback((courseSlug: string, lectureKey: string, objectiveText: string) => (
    `study_pre_${slugify(courseSlug)}_${slugify(lectureKey)}_${slugify(objectiveText).slice(0, 60)}`
  ), []);

  const effectiveCourseDescription = useMemo(() => {
    const visible = courseDescription.trim();
    const rawHidden = courseAIContext.trim();
    const currentCourseId = slugify(courseName);
    const contextIds = [courseAIContextTitle, courseAIContextSlug].map(slugify).filter(Boolean);
    const hiddenMatchesIdentity = contextIds.some((contextId) =>
      contextId === currentCourseId
      || contextId.includes(currentCourseId)
      || currentCourseId.includes(contextId)
    );
    const visibleFingerprint = visible.slice(0, 80);
    const hiddenMatchesVisibleDescription = visibleFingerprint.length >= 30 && rawHidden.includes(visibleFingerprint);
    const hidden = hiddenMatchesIdentity || hiddenMatchesVisibleDescription ? rawHidden : "";
    if (!hidden) return visible;
    if (!visible) return hidden;
    const combined = hidden.includes(visible) || visible.includes(hidden)
      ? (hidden.length >= visible.length ? hidden : visible)
      : `${visible}\n\nContexto Udemy ampliado:\n${hidden}`;
    return combined.length > 8000 ? `${combined.slice(0, 7999).trimEnd()}…` : combined;
  }, [courseName, courseDescription, courseAIContext, courseAIContextSlug, courseAIContextTitle]);

  const getStudyAIContext = useCallback((currentContent?: StudyContent | null): StudyAIContext => ({
    courseName,
    courseDescription: effectiveCourseDescription,
    lessonName,
    objective: activeSessionObjective || getActiveObjectiveText(),
    techContext: currentContent?.keyConcepts?.join(" | "),
  }), [courseName, effectiveCourseDescription, lessonName, activeSessionObjective, getActiveObjectiveText]);

  // Genera el mazo en segundo plano y lo deja SOLO en caché (condición 3): sin
  // upsert de historial y sin XP hasta que el estudiante abra Study.
  const startPreGeneration = useCallback((objective: { text: string; id: string | null }) => {
    const pre = preGenRef.current;
    if (pre.status === "running") return;
    // Identidad de la lección EN EL MOMENTO DE ARRANCAR. Si el estudiante cambia
    // de lección mientras genera, el resultado se descarta (no se escribe
    // siquiera): la clave lleva el ID real de la lección.
    const startedFor = { courseName, lessonName };
    pre.status = "running";
    pre.objectiveText = objective.text;
    pre.objectiveId = objective.id;
    pre.lastAttemptAt = Date.now();
    pre.lectureKey = slugify(lessonName);
    pre.promise = (async () => {
      try {
        const resolvedGeminiKeys = await resolveGeminiKeysForStudy(apiKeys);
        const transcript = await requestStudyTranscript(22000);
        if (!transcript.ok || !transcript.transcriptText?.trim()) { pre.status = "idle"; return; }
        const courseSlug = transcript.courseSlug || slugify(courseName);
        const lectureId = transcript.lectureKey || slugify(lessonName);
        const cacheKey = preGenCacheKey(courseSlug, lectureId, objective.text);
        pre.lectureKey = lectureId;
        const existing = await cacheService.get<{ payload: unknown }>(cacheKey).catch(() => null);
        if (existing?.payload) { pre.status = "done"; return; }
        const aiResult = await sendRuntimeMessage<LearningPanelResponse>({
          type: "USG_GENERATE_LEARNING_PANEL",
          apiKeys: resolvedGeminiKeys,
          transcriptText: transcript.transcriptText,
          cueCount: transcript.cueCount,
          transcriptTruncated: Boolean(transcript.transcriptTruncated ?? transcript.truncated),
          lectureKey: lectureId,
          courseSlug,
          lectureId,
          courseName,
          courseDescription: effectiveCourseDescription,
          lessonName,
          objective: objective.text,
        });
        // Condición 2: si el objetivo cambió mientras generaba, se descarta —
        // mismo criterio que el vocabulario al cambiar de lección. Se lee el
        // objetivo ACTUAL (ref), no el capturado al arrancar.
        const stillSameObjective = currentObjectiveRef.current === objective.text;
        const stillSameLesson = preGenRef.current === pre
          && lessonIdentityRef.current === `${startedFor.courseName}::${startedFor.lessonName}`;
        if (!stillSameObjective || !stillSameLesson) {
          pre.status = "idle";
          console.info("[USG][study][client] pre-generación descartada (objetivo o lección cambiaron)");
          return;
        }
        if (aiResult?.ok && aiResult.payload && validateStudyPayload(aiResult.payload).length === 0) {
          await cacheService.set(cacheKey, {
            payload: aiResult.payload,
            objectiveText: objective.text,
            objectiveId: objective.id,
            courseSlug,
            lectureId,
            at: Date.now(),
          }, 2, { type: "other" });
          pre.status = "done";
          console.info("[USG][study][client] pre-generación lista; se usará al pulsar Empezar");
        } else {
          pre.status = "idle";
        }
      } catch (error) {
        pre.status = "idle";
        console.warn("[USG][study][client] pre-generación falló", error);
      }
    })();
    return pre.promise;
  }, [apiKeys, courseName, effectiveCourseDescription, lessonName, preGenCacheKey, requestStudyTranscript, resolveGeminiKeysForStudy, sendRuntimeMessage]);

  // Sondeo de disponibilidad: al montar, al cambiar la configuración (evento o
  // storage) y con reintento (5 s si no está lista, 30 s si lo está). Así el
  // botón se habilita solo en cuanto la IA aparece, sin recargar. Una sola
  // cadena viva: cada sondeo nuevo cancela el temporizador pendiente y descarta
  // la respuesta de uno anterior que siga en vuelo.
  useEffect(() => {
    if (!IS_EXTENSION) { setAiState("lista"); return; }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let run = 0;
    const probe = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      const id = ++run;
      // Extensión recargada con la pestaña abierta: sin contexto no hay a quién
      // preguntar; reintentar cada 5 s solo acumula errores.
      if (!isExtensionRuntime()) { alive = false; return; }
      try {
        const res = await sendRuntimeMessage<{ ok?: boolean; configured?: boolean; endpoint?: string; status?: number }>({ type: "USG_PROVIDER_HEALTH" });
        if (!alive || id !== run) return;
        const healthy = Boolean(res?.ok);
        const configured = res?.configured !== false;
        setAiEndpoint(res?.endpoint ?? "");
        const next = !configured ? "no-config" : healthy ? "lista" : "sin-respuesta";
        setAiState(next);
        window.dispatchEvent(new CustomEvent("usb:ai-health", { detail: { ok: healthy, configured } }));
        timer = setTimeout(probe, healthy ? 30000 : 5000);
      } catch {
        if (!alive || id !== run) return;
        setAiState("sin-respuesta");
        window.dispatchEvent(new CustomEvent("usb:ai-health", { detail: { ok: false, configured: true } }));
        timer = setTimeout(probe, 5000);
      }
    };
    void probe();
    const onConfig = () => { setAiState("comprobando"); void probe(); };
    type StorageListener = (changes: Record<string, unknown>, area: string) => void;
    const storageEvents = (globalThis as typeof globalThis & {
      chrome?: { storage?: { onChanged?: { addListener: (cb: StorageListener) => void; removeListener: (cb: StorageListener) => void } } };
    }).chrome?.storage?.onChanged;
    const onStorage: StorageListener = (changes, area) => {
      if (area === "local" && AI_PROVIDER_STORAGE_KEY in changes) onConfig();
    };
    window.addEventListener("usb:provider-changed", onConfig);
    storageEvents?.addListener(onStorage);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("usb:provider-changed", onConfig);
      storageEvents?.removeListener(onStorage);
    };
  }, []);

  const aiReady = aiState === "lista";

  // Condición 4: arrancar en los últimos ~3 min (o al momento si la lección dura
  // menos). Solo antes de estudiar, y sin gastar llamadas en lecciones ojeadas.
  const maybeTriggerPreGen = useCallback(() => {
    if (!IS_EXTENSION) return;
    if (aiState !== "lista") return; // sin IA no se gasta la llamada
    const pre = preGenRef.current;
    if (pre.status !== "idle") return;
    if (phase !== "objective") return;
    const { ts, duration } = videoClockRef.current;
    if (duration === null || duration <= 0) return;
    if (duration - ts > 180) return;
    if (Date.now() - pre.lastAttemptAt < 20000) return; // reintento con calma
    const objective = resolvePreGenObjective();
    if (!objective) return;
    void startPreGeneration(objective);
  }, [aiState, phase, resolvePreGenObjective, startPreGeneration]);

  useEffect(() => {
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ ts?: number; duration?: number | null }>).detail;
      if (typeof detail?.ts !== "number") return;
      videoClockRef.current = { ts: detail.ts, duration: detail.duration ?? null };
      maybeTriggerPreGen();
    };
    window.addEventListener("usb:video-progress", onProgress);
    return () => window.removeEventListener("usb:video-progress", onProgress);
  }, [maybeTriggerPreGen]);

  // Objetivo vivo (para descartar una pre-generación cuyo objetivo cambió).
  useEffect(() => { currentObjectiveRef.current = getActiveObjectiveText(); }, [getActiveObjectiveText]);

  // Cambio de lección: la pre-generación es por lección. Sin este reset, un
  // estado 'done' de la lección anterior impedía pre-generar la siguiente, y un
  // 'running' ajeno hacía esperar de más al pulsar Empezar.
  useEffect(() => {
    lessonIdentityRef.current = `${courseName}::${lessonName}`;
    preGenRef.current = {
      status: "idle", lectureKey: "", objectiveText: "", objectiveId: null, promise: null, lastAttemptAt: 0,
    };
    videoClockRef.current = { ts: 0, duration: null };
  }, [courseName, lessonName]);

  const handleGenerate = async () => {
    // Warn if the user has already studied this lecture (non-blocking).
    try {
      const already = await historyService.hasStudied(courseName, lessonName);
      if (already) {
        toast.info("Ya estudiaste esta lección antes", {
          description: "Puedes repetirla, pero ya está en tu historial.",
          icon: <Repeat2 className="text-amber-400" size={18} />,
        });
      }
    } catch {}

    // Sesión nueva = estado limpio (antes se arrastraban nivel, respuestas y cierre de la anterior).
    resetSessionState();
    sessionCelebratedRef.current = false;
    setPhase("generating"); setGenStep(0);
    sessionStartRef.current = Date.now();
    const sessionObjective = getActiveObjectiveText();
    const iv = setInterval(() => setGenStep(p => p >= GEN_STEPS.length - 1 ? p : p + 1), 650);
    try {
      const fallbackContent = generateContent(selectedObj, customObj, courseName, lessonName);
      const resolvedGeminiKeys = await resolveGeminiKeysForStudy(apiKeys);
      const transcript = await requestStudyTranscript(22000);
      let newContent = fallbackContent;
      let usedFallback = false;
      let generationError = "";

      if (transcript.ok && transcript.transcriptText?.trim()) {
        const detected = detectTranscriptLang(transcript.transcriptText);
        setVocabLangOk(detected === "en" ? true : detected === "es" ? false : null);
        if (resolvedGeminiKeys.length > 0) {
          const syncResponse = await sendRuntimeMessage<{ ok?: boolean; source?: string; keyCount?: number; error?: string }>({
            type: "USG_SYNC_GEMINI_KEYS",
            apiKeys: resolvedGeminiKeys,
          });
          console.info("[USG][study][client] background key sync response:", syncResponse);
        }
        // Mazo pre-generado durante el vídeo: si el objetivo coincide, se usa
        // sin espera. Solo se espera la generación en curso si es de ESTA
        // lección y ESTE objetivo; una ajena se ignora (no se paga su espera).
        const preCourseSlug = transcript.courseSlug || slugify(courseName);
        const preLectureId = transcript.lectureKey || slugify(lessonName);
        const preKey = preGenCacheKey(preCourseSlug, preLectureId, sessionObjective);
        const preState = preGenRef.current;
        const preMatchesThisLesson = preState.lectureKey === preLectureId
          && (preState.objectiveText === sessionObjective || preState.status !== "running");
        if (preState.status === "running" && preState.objectiveText === sessionObjective && preMatchesThisLesson && preState.promise) {
          await preState.promise.catch(() => undefined);
        }
        let prePayload: unknown = null;
        if (preState.status !== "running" && preState.objectiveText === sessionObjective) {
          const cached = await cacheService.get<{ payload: unknown; courseSlug?: string; lectureId?: string }>(preKey).catch(() => null);
          // Doble comprobación al consumir: el mazo debe ser de este curso y de
          // esta lección, no solo coincidir el nombre de la lección.
          if (cached?.payload && (cached.courseSlug ?? preCourseSlug) === preCourseSlug && (cached.lectureId ?? preLectureId) === preLectureId) {
            prePayload = cached.payload;
          }
        }
        if (prePayload && validateStudyPayload(prePayload).length === 0) {
          newContent = normalizeStudyContent(prePayload, fallbackContent);
          await cacheService.del(preKey).catch(() => undefined);
          preGenRef.current = { status: "idle", lectureKey: "", objectiveText: "", objectiveId: null, promise: null, lastAttemptAt: 0 };
          console.info("[USG][study][client] mazo pre-generado consumido (sin espera)");
        } else {
        console.info("[USG][study][client] sending learning panel request:", {
          apiKeys: describeGeminiKeys(resolvedGeminiKeys),
          transcriptChars: transcript.transcriptText.length,
          courseName,
          lessonName,
        });
        const aiResult = await sendRuntimeMessage<LearningPanelResponse>({
          type: "USG_GENERATE_LEARNING_PANEL",
          apiKeys: resolvedGeminiKeys,
          transcriptText: transcript.transcriptText,
          cueCount: transcript.cueCount,
          transcriptTruncated: Boolean(transcript.transcriptTruncated ?? transcript.truncated),
          lectureKey: transcript.lectureKey || slugify(lessonName),
          courseSlug: transcript.courseSlug || slugify(courseName),
          lectureId: transcript.lectureKey || slugify(lessonName),
          courseName,
          courseDescription: effectiveCourseDescription,
          lessonName,
          objective: sessionObjective,
        });
        if (aiResult?.ok && aiResult.payload) {
          const payloadIssues = validateStudyPayload(aiResult.payload);
          if (payloadIssues.length > 0) {
            console.warn("[USG][study][client] invalid learning panel payload:", payloadIssues, aiResult.payload);
            generationError = `Gemini respondió, pero faltan campos requeridos en la sesión: ${payloadIssues.slice(0, 5).join(", ")}.`;
          } else {
          newContent = normalizeStudyContent(aiResult.payload, fallbackContent);
          }
        } else if (aiResult?.error) {
          generationError = aiResult.error;
          console.warn("[study] AI panel failed:", aiResult.error, aiResult.debug);
          const debug = aiResult.debug as { promptPreview?: unknown; rawResponse?: unknown; rawResponseLength?: unknown } | undefined;
          if (import.meta.env.DEV && typeof debug?.promptPreview === "string") {
            console.info("[USG][study][client] prompt sent to Gemini (preview):", debug.promptPreview);
          }
          if (import.meta.env.DEV && typeof debug?.rawResponse === "string") {
            console.info("[USG][study][client] raw Gemini response:", debug.rawResponse);
            console.info("[USG][study][client] raw Gemini response length:", debug.rawResponseLength);
          }
        } else {
          generationError = "Kinema no recibió respuesta de tu proveedor de IA. Configura Gemini en Ajustes o inicia la IA local y reintenta.";
        }
        } // fin del else de pre-generación
      } else {
        setVocabLangOk(null);
        generationError = transcript.error || "No hay transcripción disponible para esta lección.";
        console.warn("[study] transcript unavailable:", transcript.error);
      }

      if (generationError) {
        if (isExtensionRuntime()) {
          clearInterval(iv);
          setPhase("objective");
          toast.error("No se pudo generar la sesión", {
            description: describeProviderFailure(generationError, {
              kind: getAiProviderConfig().kind,
              endpoint: getAiProviderConfig().baseUrl,
              model: getAiProviderConfig().model,
            }),
            icon: <WifiOff className="text-amber-400" size={18} />,
            duration: 7000,
          });
          return;
        }
        usedFallback = true;
      }

      clearInterval(iv);
      setContent(newContent);
      setActiveSessionObjective(sessionObjective);
      // §5: sesión nueva → sus dudas empiezan vacías y se atan a esta lección.
      setStudySession({ course: courseName, lesson: lessonName }); setDoubts([]); setOpenDoubtKey(null); setLastExportGuids(null);
      setPhase("result");

      // «Guardar automáticamente» en Obsidian ocurre al TERMINAR la lección
      // (handleFinishLesson): aquí la nota aún no tendría recuerdo, resultados
      // ni dudas, y el export final chocaría con «ya exportada».

      // Persist initial history record (paso 1 + paso 2)
      historyService.upsertLecture({
        courseName,
        lectureName: lessonName,
        objective: sessionObjective,
        objectiveId: getActiveObjectiveId(),
        studyContent: newContent as StoredStudyContent,
        keyConcepts: newContent.keyConcepts,
        clearProgress: true,
        focusStep: 0,
        status: "in_progress",
      }).catch(err => console.error("[history] upsert on generate", err));

      // §5: el autosync de tarjetas a Supabase queda eliminado del flujo — la
      // edge function aún identificaba al usuario por ?userId= en la URL, sin
      // Authorization. Cuando la función valide el JWT (requisito fuera de
      // este repo), se reactiva con Authorization: Bearer y sin userId en URL.

      toast.message("¡Material de estudio listo!", {
        description: usedFallback
          ? "Kinema usó una plantilla local porque tu proveedor de IA no completó la generación."
          : "Analizamos la lección y preparamos tu sesión de 4 pasos.",
        icon: <Rocket className="text-violet-400" size={18} />
      });
      scrollToBottom();
    } catch (error) {
      console.error("[study] generate session failed", error);
      clearInterval(iv);
      if (isExtensionRuntime()) {
        setPhase("objective");
        const message = error instanceof Error ? error.message : String(error);
        toast.error("No se pudo generar la sesión", {
          description: message.length > 140 ? `${message.slice(0, 140)}…` : message,
          icon: <WifiOff className="text-amber-400" size={18} />,
          duration: 7000,
        });
        return;
      }
      const newContent = generateContent(selectedObj, customObj, courseName, lessonName);
      setContent(newContent);
      setActiveSessionObjective(sessionObjective);
      setStudySession({ course: courseName, lesson: lessonName }); setDoubts([]); setOpenDoubtKey(null); setLastExportGuids(null);
      setPhase("result");
      toast.warning("Sesión provisional", {
        description: "Tu proveedor de IA no respondió; Kinema usó una plantilla local para no bloquearte.",
        icon: <WifiOff className="text-amber-400" size={18} />,
      });
    }
  };

  // Rebuild in-memory session state from a persisted history record.
  const rehydrateFromRecord = useCallback((rec: import("../services/historyService").LectureHistoryRecord) => {
    // generateContent is deterministic on (objective, course, lesson)
    const obj = rec.objective || customObj || selectedObj;
    resetSessionState();
    // El tiempo de estudio se mide desde que empezó ESTA sesión (no desde que se abrió el dock).
    if (typeof rec.startedAt === "number") sessionStartRef.current = rec.startedAt;
    // Solo una lección ya terminada no vuelve a celebrarse; una a medias sí, al terminarla.
    sessionCelebratedRef.current = rec.finishedAt != null || rec.status === "completed";
    const rebuilt = generateContent(obj, obj, rec.courseName, rec.lectureName);
    const restored = rec.studyContent ? normalizeStudyContent(rec.studyContent, rebuilt) : rebuilt;
    setContent(restored);
    setActiveSessionObjective(rec.objective || null);

    if (rec.confidence) setConfidence(rec.confidence);

    // Replay user's answers + AI feedback for each question.
    // Attempts are stored in canonical question order, but the on-screen order
    // (visibleQuestions) is weakness-sorted and can differ. Index the stored
    // attempts by prompt and resolve each visible question through that map so
    // answers/feedback never land on the wrong card.
    const attemptsByPrompt = new Map<string, QuestionAttempt>();
    rec.questions.forEach((q) => {
      if (q.prompt) attemptsByPrompt.set(q.prompt, q);
    });

    // §1.2: la cola se reconstruye del historial — los intentos guardados
    // (por prompt) fijan el orden presentado; sin intentos, la pregunta de
    // arranque según el nivel declarado.
    const restoredConfidence = rec.confidence ?? null;
    // Solo lo PRESENTADO y respondido: el historial guarda todas las preguntas en
    // orden canónico (las no presentadas con respuesta vacía). Orden de la cola:
    // la de arranque, luego la de consolidación (más básica) y el reto (más alta).
    const startIdx = restoredConfidence
      ? pickStartQuestion(restoredConfidence, restored, new Set(Array.isArray(rec.checkedConceptIndexes) ? rec.checkedConceptIndexes : []))
      : -1;
    const answeredIdx = rec.questions
      .filter((a) => a.prompt && ((a.answer ?? "").trim() || a.rating || a.feedback))
      .map((a) => restored.questions.findIndex((q) => q.q === a.prompt))
      .filter((i, k, arr) => i >= 0 && arr.indexOf(i) === k);
    const startD = startIdx >= 0 ? DIFF_ORDER.indexOf(restored.questions[startIdx].difficulty) : 0;
    const diffOf = (i: number) => DIFF_ORDER.indexOf(restored.questions[i].difficulty);
    const restoredChecked = new Set(Array.isArray(rec.checkedConceptIndexes) ? rec.checkedConceptIndexes : []);
    const byLevel = answeredIdx.filter((i) => i !== startIdx).sort((x, y) => Number(diffOf(x) > startD) - Number(diffOf(y) > startD));
    const restoredQueue = answeredIdx.length > 0
      ? answeredIdx.includes(startIdx)
        // Arranque, luego los pasos del plan y al final el reto (orderPresented).
        ? orderPresented(restored, startIdx, [startIdx, ...byLevel], restoredChecked)
        : byLevel
      : startIdx >= 0
        ? [startIdx]
        : [];

    const answers: Record<number, string> = {};
    const feedbacks: Record<number, FeedbackState> = {};
    // Lo premiado y lo acertado a la primera es de ESTA lección: se reconstruye desde su historial.
    qRewardedRef.current.clear();
    firstTryCorrectRef.current.clear();

    restoredQueue.forEach((cqIdx, i) => {
      const cq = restored.questions[cqIdx];
      const attempt = attemptsByPrompt.get(cq.q);
      if (!attempt) return;
      answers[i] = attempt.answer ?? "";
      if (attempt.feedback || attempt.rating) {
        feedbacks[i] = {
          status: "done",
          content: attempt.feedback ?? "",
          rating: (attempt.rating ?? "unknown") as AIRating,
        };
        // Ya revisada: otro intento tras recargar no vuelve a dar XP ni cuenta
        // como «a la primera»; y lo acertado a la primera se recuerda.
        qRewardedRef.current.add(cq.q);
        if (attempt.firstTryCorrect) firstTryCorrectRef.current.add(cq.q);
      }
    });

    setQuestionAnswers(answers);
    setQuestionFeedbacks(feedbacks);
    setQuestionQueue(restoredQueue);
    // La última presentada: si no se acertó, vuelve con su revisión y «¿Cómo sigues?».
    setCurrentQIdx(Math.max(0, restoredQueue.length - 1));
    // Más respondidas que el plan = la última fue el reto opcional.
    setChallengeUsed(startIdx >= 0 && restoredQueue.length > checkPlanState(restored, restoredQueue, restoredChecked).planned);
    setChallengeOpen(false);
    setEvaluatedAnswers({});

    const checkedConceptIndexes = Array.isArray(rec.checkedConceptIndexes) ? rec.checkedConceptIndexes : [];
    setConceptsChecked(Object.fromEntries(checkedConceptIndexes.map((idx) => [idx, true])));
    setConceptsAcknowledged(Boolean(rec.conceptsAcknowledged));
    setRecallNotes(rec.recallNotes ?? "");
    if (rec.recallNotes || rec.confidence) setRecallRevealed(true);
    // §5: las dudas de la sesión vuelven con ella (de ellas perdura la tarjeta).
    setDoubts(sanitizeStoredDoubts(rec.doubts));
    setOpenDoubtKey(null);
    setLastExportGuids(Array.isArray(rec.exportedGuids) ? rec.exportedGuids : null);
    setStudySession({ course: rec.courseName, lesson: rec.lectureName });

    if (rec.codeChallenge) {
      setAppAnswer(rec.codeChallenge.answer ?? "");
      if (rec.codeChallenge.feedback || rec.codeChallenge.rating) {
        setAppFeedback({
          status: "done",
          content: rec.codeChallenge.feedback ?? "",
          rating: (rec.codeChallenge.rating ?? "unknown") as AIRating,
        });
      }
    }

    const hasCodeChallenge = Boolean(rec.codeChallenge);
    // La práctica (caso, código o explicación) se premia una vez por lección, también tras recargar.
    appRewardedRef.current = hasCodeChallenge || rec.practiceStatus === "done" || rec.practiceStatus === "correct";
    setPracticeStatus(rec.practiceStatus ?? (hasCodeChallenge ? "done" : null));
    setQuestionsComplete(Boolean(rec.questionsDone));
    setQuestionsSkipped(Boolean(rec.questionsSkipped));
    setFinishedAt(rec.finishedAt ?? null);
    // Exportaciones previas restauran su estado sin completar la lección:
    // terminar es una acción explícita (§1.4).
    const hasAnkiExport = Boolean(rec.ankiCards && rec.ankiCards.length > 0);
    if (hasAnkiExport) setAnkiExported(true);
    if (rec.obsidianExportedAt) setObsidianExportedAt(rec.obsidianExportedAt);
    // Flags de refuerzo/exclusión persistidos vuelven al contenido.
    if (hasAnkiExport && rec.ankiCards?.length) {
      const byFront = new Map(rec.ankiCards.map((c) => [c.front, c]));
      setContent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ankiCards: prev.ankiCards.map((c) => {
            const stored = byFront.get(c.front);
            return stored ? { ...c, reinforce: stored.reinforce, excluded: stored.excluded, conceptRefs: c.conceptRefs?.length ? c.conceptRefs : stored.conceptRefs, isHtml: c.isHtml ?? stored.isHtml } : c;
          }),
        };
      });
    }
    const done = rec.finishedAt != null || rec.status === "completed";
    const restoredStep = typeof rec.focusStep === "number"
      ? Math.max(0, Math.min(3, Math.round(rec.focusStep)))
      : done
        ? 3
        : hasCodeChallenge
          ? 2
          : Boolean(rec.questionsDone)
            ? 2
            : restoredQueue.length > 0
              ? 1
              : rec.confidence
                ? 0
                : 0;
    setFocusStep(restoredStep);
    setPhase("result");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customObj, selectedObj]);

  // Load cached objectives + last-used objective whenever the course changes.
  useEffect(() => {
    if (!courseName.trim()) {
      setDynamicObjectives(null);
      setLastUsedObjectiveId(null);
      return;
    }
    let cancelled = false;
    const courseId = slugify(courseName);

    (async () => {
      const [cache, lectures] = await Promise.all([
        objectivesService.get(courseName),
        historyService.getCourseLectures(courseId),
      ]);
      if (cancelled) return;

      if (cache) {
        // Render whatever we have, including offline/mock objectives, so the
        // Study tab is never empty. objectivesMock drives the "generated
        // locally" notice and lets Regenerar retry against the live AI.
        setDynamicObjectives(cache.objectives);
        setObjectivesMock(Boolean(cache.isMock));
        setObjectivesError(cache.isMock ? cache.error ?? null : null);
        objectivesForRef.current = slugify(courseName); // cache matches this course
      } else {
        setDynamicObjectives(null);
        setObjectivesMock(false);
        setObjectivesError(null);
      }

      // Most recent objective used in this course (lectures are already sorted desc).
      // Prefer objectiveId from newer records; fall back to matching old records by text.
      setReturningStudent(lectures.length > 0);
      const lastLectureWithObjective = lectures.find(l => l.objectiveId || l.objective);
      // Objetivo propio de este curso: la pre-generación solo puede usarlo (o el
      // dinámico derivado del curso), nunca un texto libre de otro curso.
      courseObjectiveRef.current = lastLectureWithObjective?.objective
        ? { text: lastLectureWithObjective.objective, id: lastLectureWithObjective.objectiveId ?? null }
        : null;
      const objs = cache && !cache.isMock ? cache.objectives : [];
      const lastObjRaw = lastLectureWithObjective?.objectiveId ?? lastLectureWithObjective?.objective ?? null;
      const lastId = lastObjRaw
        ? (objs.find(o => o.id === lastObjRaw || `${o.title}${o.sub ? ` — ${o.sub}` : ""}` === lastObjRaw)?.id ?? null)
        : null;
      const persistedSelectedObj = selectedObjRef.current;
      const persistedId = objs.some(o => o.id === persistedSelectedObj) ? persistedSelectedObj : null;
      const currentId = persistedId ?? lastId;
      setLastUsedObjectiveId(currentId);
      if (currentId) setSelectedObj(currentId);
      // Hero mode = collapsed by default when there's a prior selection.
      setObjectivesExpanded(!currentId);
    })();

    return () => { cancelled = true; };
  }, [courseName, setSelectedObj]);

  // Auto-generate objectives for each NEW course (revalidate-on-key-change:
  // when the lecture context replaces the placeholder name with the real one,
  // the objectives regenerate once for the real course — no manual Regenerar).
  useEffect(() => {
    if (phase !== "objective") return;
    if (!courseName.trim()) return;
    const courseId = slugify(courseName);
    if (objectivesForRef.current === courseId) return; // objectives already match this course
    if (objectivesLoading) return;

    // Debounce so we don't fire on every keystroke while user is typing the name.
    const t = setTimeout(async () => {
      objectivesForRef.current = courseId;
      setObjectivesLoading(true);
      try {
        const entry = await objectivesService.getOrGenerate(courseName, effectiveCourseDescription);
        // Always surface the objectives, including the deterministic offline
        // fallback, so the Study tab renders instead of staying empty.
        setDynamicObjectives(entry.objectives.length ? entry.objectives : null);
        setObjectivesMock(entry.isMock);
        setObjectivesError(entry.isMock ? (entry.error ?? null) : null);
        setObjectivesExpanded(!lastUsedObjectiveId);
      } catch (err) {
        console.error("[objectives] auto-gen failed", err);
      } finally {
        setObjectivesLoading(false);
      }
    }, 700);

    return () => clearTimeout(t);
  }, [phase, courseName, effectiveCourseDescription, dynamicObjectives, objectivesLoading, lastUsedObjectiveId]);

  // Keep `selectedObj` consistent with the current dynamic objectives.
  // If the persisted id doesn't exist in the freshly-loaded set (e.g. user switched
  // courses, or objectives were regenerated), fall back to the last-used id or the
  // first available — but don't overwrite a custom free-text objective.
  useEffect(() => {
    if (!dynamicObjectives || dynamicObjectives.length === 0) return;
    if (selectedObj === "custom" && customObj.trim()) return;
    if (dynamicObjectives.some(o => o.id === selectedObj)) return;
    const next = (lastUsedObjectiveId && dynamicObjectives.find(o => o.id === lastUsedObjectiveId))
      ? lastUsedObjectiveId
      : dynamicObjectives[0].id;
    setSelectedObj(next);
  }, [dynamicObjectives, lastUsedObjectiveId, selectedObj, customObj, setSelectedObj]);

  const handleRegenerateObjectives = async () => {
    if (objectivesLoading) return;
    setObjectivesLoading(true);
    try {
      const entry = await objectivesService.regenerate(courseName, effectiveCourseDescription);
      setDynamicObjectives(entry.isMock ? null : entry.objectives);
      setObjectivesMock(entry.isMock);
      setObjectivesError(entry.isMock ? (entry.error ?? null) : null);
      setObjectivesExpanded(true);
      setObjectivesRegenCount(c => c + 1);
      if (!entry.isMock) {
        const sourceLabel = entry.source === "gemini" ? "Gemini" : entry.source === "local" ? "IA local" : "IA";
        toast.success(`Objetivos generados con ${sourceLabel}`, {
          icon: <Sparkles className="text-violet-400" size={18} />,
        });
      }
    } catch (err) {
      console.error("[objectives] regenerate failed", err);
      toast.error("No se pudieron regenerar los objetivos");
    } finally {
      setObjectivesLoading(false);
    }
  };

  // Auto-rehydrate when entering the objective phase with a course+lesson that has history.
  useEffect(() => {
    if (phase !== "objective") return;
    if (!courseName || !lessonName) return;
    const cid = slugify(courseName);
    const lid = slugify(lessonName);
    const key = `${cid}::${lid}`;
    if (rehydratedKeyRef.current === key) return; // already attempted for this pair

    historyService.getLecture(cid, lid).then(rec => {
      if (!rec) return;
      if (!historyService.hasProgress(rec)) return;
      rehydratedKeyRef.current = key;
      rehydrateFromRecord(rec);
      toast.info(
        rec.status === "completed" ? "Sesión recuperada del historial" : "Continuando donde lo dejaste",
        {
          description: rec.status === "completed" ? "Esta lección ya estaba completa." : "Tus respuestas anteriores se restauraron.",
          icon: <History className="text-violet-400" size={18} />,
        }
      );
    }).catch(err => console.error("[history] rehydrate", err));
  }, [phase, courseName, lessonName, rehydrateFromRecord]);

  const handleRefine = async () => {
    if (!customObj.trim()) return;
    setIsRefining(true);
    const sourceText = customObj;
    try {
      const { refined, isMock } = await refineCustomObjective(courseName, effectiveCourseDescription, sourceText);
      if (!refined.trim() || isMock) {
        toast.warning("Kinema no pudo refinar tu objetivo", {
          description: describeProviderFailure("", {
            kind: getAiProviderConfig().kind,
            endpoint: getAiProviderConfig().baseUrl,
            model: getAiProviderConfig().model,
          }),
          icon: <Sparkles className="text-amber-400" size={18} />,
        });
        return;
      }
      setRefinedObj(refined);
      setRefinedFromText(sourceText);
    } catch (err) {
      console.error("[objectives] refine failed", err);
      toast.error("No se pudo refinar el objetivo");
    } finally {
      setIsRefining(false);
    }
  };

  // Estado de UNA sesión de estudio. Se limpia al empezar otra (generar, abrir
  // otra lección o reiniciar): nada de la lección anterior se arrastra a la nueva.
  const resetSessionState = () => {
    setContent(null); setConfidence(null);
    setActiveSessionObjective(null);
    setConceptsChecked({}); setAppAnswer(""); setAppFeedback(IDLE_FB);
    setConceptsAcknowledged(false);
    setShowAppSolution(false); setShowAppHint(false); appRewardedRef.current = false; setQuestionAnswers({}); setQuestionFeedbacks({});
    setCurrentQIdx(0); setQuestionsComplete(false); setQuestionsSkipped(false); setChallengeUsed(false);
    setQuestionQueue([]); setPracticeStatus(null); setFinishedAt(null); setPracticeMode("exercise");
    setPendingLevelUp(null); setPendingUnlocked([]);
    firstTryCorrectRef.current.clear();
    setAnkiExported(false); setShowAnkiGuide(false); setShowHint(false);
    setShowInterviewAnswer(false); setOralAnswer(""); setOralFeedback(IDLE_FB); setRecallRevealed(false); setRecallNotes("");
    setEvaluatedAnswers({}); setChallengeOpen(false); setAppEvaluated(""); setAppSolutionSeen(false); setOralEvaluated("");
    setDoubts([]); setOpenDoubtKey(null); setLastExportGuids(null); setStudySession(null);
    qRewardedRef.current.clear(); conceptRewardedRef.current.clear();
    setApkgStatus("idle"); setApkgProgress("");
    setFocusStep(0); setFocusDir(1);
    sessionCelebratedRef.current = false;
    sessionStartRef.current = Date.now();
    setSessionXp(0); setLevelPickerOpen(false); setShowCardPreview(false);
    setObsidianStatus("idle"); setObsidianExportedAt(null); setObsidianHelpOpen(false);
    setNextLessonStatus("idle");
  };

  // Abrir otra lección en Study (desde el historial o tras cambiar de video en Udemy).
  const openLessonInStudy = () => {
    resetSessionState();
    rehydratedKeyRef.current = "";
    setPhase("objective");
  };

  const handleReset = () => {
    // §2: confirmación en el propio header (confirmingReset) — sin diálogos nativos.
    setPhase("objective");
    resetSessionState();
    // Mark the current lecture as already-handled so rehydration doesn't auto-reload it.
    // Switching to a different course/lecture produces a new key and rehydrates normally.
    rehydratedKeyRef.current = `${slugify(courseName)}::${slugify(lessonName)}`;
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      focusStep: 0,
      questionsComplete: false,
      conceptsAcknowledged: false,
      checkedConceptIndexes: [],
      clearProgress: true,
    }).catch(err => console.error("[history] upsert reset", err));
    toast.message("Sesión reiniciada", { icon: <RotateCcw className="text-violet-400" size={18} /> });
  };

  // §1.1: elegir nivel (único requisito del paso Recordar) y preparar la cola
  // adaptativa del paso Comprobar con la pregunta de la dificultad elegida.
  const handleConfidenceChange = (c: ConfidenceLevel) => {
    setConfidence(c);
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      confidence: c,
      objectiveId: getActiveObjectiveId(),
      objective: getActiveObjectiveText(),
      focusStep: 0,
    }).catch(err => console.error("[history] upsert confidence", err));
    setCurrentQIdx(0);
    setQuestionsComplete(false);
    setQuestionsSkipped(false);
    setChallengeUsed(false);
    setChallengeOpen(false);
    setEvaluatedAnswers({});
    firstTryCorrectRef.current.clear();
    setQuestionAnswers({});
    setQuestionFeedbacks({});
    setOpenDoubtKey(null);
    setShowHint(false);
    setConceptsAcknowledged(false);
    setAppAnswer("");
    setAppFeedback(IDLE_FB);
    setShowAppSolution(false);
    setQuestionQueue(content ? [pickStartQuestion(c, content, new Set(Object.keys(conceptsChecked).filter(k => conceptsChecked[Number(k)]).map(Number)))] : []);
  };

  // §1.1: marcar conceptos es autodeclarado — ya no da XP (§2).
  const handleConceptToggle = (idx: number) => {
    const isNowChecked = !conceptsChecked[idx];
    setConceptsChecked(p => {
      const next = { ...p, [idx]: isNowChecked };
      const checkedConceptIndexes = Object.entries(next)
        .filter(([, checked]) => checked)
        .map(([key]) => Number(key))
        .filter(Number.isFinite);
      historyService.upsertLecture({
        courseName,
        lectureName: lessonName,
        checkedConceptIndexes,
        conceptsAcknowledged: false,
        focusStep: 0,
      }).catch(err => console.error("[history] upsert concepts", err));
      return next;
    });
    setConceptsAcknowledged(false);
    setCurrentQIdx(0);
    setQuestionAnswers({});
    setQuestionFeedbacks({});
    setShowHint(false);
  };

  const conceptSelectionSignature = useMemo(
    () => Object.entries(conceptsChecked).filter(([, checked]) => checked).map(([idx]) => idx).sort().join(","),
    [conceptsChecked],
  );

  // §1.2: las preguntas presentadas son la COLA adaptativa (en orden), no un
  // filtro fijo: empieza en la dificultad elegida y puede añadir consolidación.
  const queueQuestions = useMemo(() => {
    if (!content) return [];
    return questionQueue.map((qi) => content.questions[qi]).filter(Boolean);
  }, [content, questionQueue]);

  const persistQuestionsInCanonicalOrder = (idx: number, fb: FeedbackState): QuestionAttempt[] => {
    return content ? content.questions.map((cq) => {
      const vi = queueQuestions.findIndex(vq => vq.q === cq.q);
      const f = vi === idx ? fb : vi >= 0 ? questionFeedbacks[vi] : undefined;
      // Se persiste antes de applyEvalOutcome: el intento actual es el primero si aún no se premió.
      const good = f?.rating === "correct" || f?.rating === "excellent";
      const firstTryCorrect = vi === idx && !qRewardedRef.current.has(cq.q) ? good : firstTryCorrectRef.current.has(cq.q);
      return {
        prompt: cq.q,
        answer: vi >= 0 ? questionAnswers[vi] ?? "" : "",
        rating: f?.rating,
        feedback: f?.content,
        answeredAt: vi === idx ? Date.now() : undefined,
        firstTryCorrect: firstTryCorrect || undefined,
      };
    }) : [];
  };

  const persistQuestionProgress = (idx: number, fb: FeedbackState) => {
    if (!queueQuestions[idx]) return;
    const attempts: QuestionAttempt[] = persistQuestionsInCanonicalOrder(idx, fb);
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      questions: attempts,
      focusStep: 1,
    }).catch(err => console.error("[history] upsert question", err));
  };

  const handleEvalQuestion = async (idx: number) => {
    if (!content || !queueQuestions[idx]) return;
    const userAns = questionAnswers[idx] || "";
    if (!userAns.trim()) return;
    const prevRating = questionFeedbacks[idx]?.rating;
    setEvaluatedAnswers(p => ({ ...p, [idx]: userAns }));
    setQuestionFeedbacks(p => ({ ...p, [idx]: { status: "loading", content: "", rating: "unknown" } }));
    const q = queueQuestions[idx];
    const aiContext = getStudyAIContext(content);

    // Attempt streaming evaluation first
    const res = await evaluateActiveAnswerStream(
      q.q, q.answer, userAns, q.bloom,
      (_, accumulated) => {
        setQuestionFeedbacks(p => ({
          ...p,
          [idx]: { status: "streaming", content: accumulated, rating: "unknown", isMock: p[idx]?.isMock },
        }));
      },
      aiContext,
    );

    // If streaming failed or returned nothing, fall back to non-streaming
    if (!res.success || !res.content.trim()) {
      const fallback = await evaluateActiveAnswer(q.q, q.answer, userAns, q.bloom, aiContext);
      const fb: FeedbackState = { status: fallback.success ? "done" : "error", content: fallback.success ? fallback.content : (fallback.error ?? "Error"), rating: fallback.rating, isMock: fallback.isMock };
      setQuestionFeedbacks(p => ({ ...p, [idx]: fb }));
      persistQuestionProgress(idx, fb);
      if (fb.status === "done") applyEvalOutcome(idx, q, fb, userAns, prevRating);
      // No auto-advance on fallback path either
      setTimeout(() => scrollToBottom(), 120);
      return;
    }

    const fb: FeedbackState = { status: "done", content: res.content, rating: res.rating, isMock: res.isMock };
    setQuestionFeedbacks(p => ({ ...p, [idx]: fb }));
    persistQuestionProgress(idx, fb);
    applyEvalOutcome(idx, q, fb, userAns, prevRating);

    // NO auto-advance — the user reads the feedback and clicks "Siguiente" manually
    setTimeout(() => scrollToBottom(), 120);
  };

  // §2/§1.2: XP por esfuerzo y completado del paso — común a streaming y fallback.
  const applyEvalOutcome = (idx: number, q: StudyContent["questions"][number], fb: FeedbackState, userAns: string, prevRating?: AIRating) => {
    const isGoodNow = fb.rating === "correct" || fb.rating === "excellent";
    const firstAttempt = !qRewardedRef.current.has(q.q);
    const improved = isGoodNow && (prevRating === "partial" || prevRating === "wrong");
    if (firstAttempt) {
      qRewardedRef.current.add(q.q);
      let gained = 0;
      if (userAns.trim().length >= 20) gained += recordXp("answer_submitted"); // una vez por pregunta
      if (isGoodNow) {
        gained += recordXp("first_try_correct");
        firstTryCorrectRef.current.add(q.q);
      } else {
        recordXp("first_try_miss"); // sin XP: alimenta el % de aciertos a la primera
      }
      setSessionXp(prev => prev + gained);
    } else if (improved) {
      const gained = recordXp("answer_improved");
      setSessionXp(prev => prev + gained);
    }

    // §1.2/§1.7: acertar cierra la comprobación (y el reto, si era el reto). Si
    // no, el estudiante elige en «¿Cómo sigues?»: mejorar su respuesta, pasar a
    // otra pregunta o terminar — nunca se cierra sin que lo decida.
    if (isGoodNow && (challengeOpen || !findNextPlanned(idx, true))) {
      setQuestionsComplete(true);
      setChallengeOpen(false);
      persistQuestionsDone(false);
    }

    // NO auto-advance — the user reads the feedback and clicks "Siguiente" manually
    setTimeout(() => scrollToBottom(), 120);
  };

  // §1.2: el plan de Comprobar — una pregunta por idea que no marcaste en
  // Recordar (+ una que sí marcaste, para confirmarla), con tope de fatiga.
  // Su tamaño sale de la lección (nº de ideas) y de tus marcas (checkPlan.ts).
  const checkedSet = useMemo(
    () => new Set(Object.keys(conceptsChecked).filter(k => conceptsChecked[Number(k)]).map(Number)),
    [conceptsChecked],
  );
  const planState = useMemo(
    () => content ? checkPlanState(content, challengeUsed ? questionQueue.slice(0, -1) : questionQueue, checkedSet) : null,
    [content, questionQueue, checkedSet, challengeUsed],
  );
  const planTotal = Math.max(1, planState?.total ?? 1);
  /** Siguiente pregunta del plan tras la `idx` (solo desde la última presentada, nunca en el reto). */
  const findNextPlanned = (idx: number, goodOverride?: boolean) => {
    if (!content || challengeOpen || !planState) return undefined;
    const planQueue = questionQueue.slice(0, planState.planned);
    if (idx !== planQueue.length - 1) return undefined;
    const fb = questionFeedbacks[idx];
    const good = goodOverride ?? (fb?.status === "done" && (fb.rating === "correct" || fb.rating === "excellent"));
    const lastD = DIFF_ORDER.indexOf(queueQuestions[idx]?.difficulty ?? confidence ?? "partial");
    const target = Math.max(0, Math.min(DIFF_ORDER.length - 1, lastD + (good ? 1 : -1)));
    return pickNextCheckQuestion(content, planQueue, checkedSet, target);
  };

  const goNextQuestion = (idx: number) => {
    if (!content) return;
    const candidate = findNextPlanned(idx);
    if (candidate) {
      setQuestionQueue(prev => [...prev, candidate.i]);
      setCurrentQIdx(idx + 1);
      setShowHint(false);
    } else {
      // Plan terminado (no quedan ideas sin preguntar) → el paso se completa.
      setQuestionsComplete(true);
      persistQuestionsDone(false);
    }
  };

  // «Un reto más» (opcional, R7): solo tras acertar y si hay una pregunta de
  // nivel MÁS ALTO que lo acertado (la del nivel siguiente).
  const findChallenge = () => {
    if (!content || challengeUsed) return undefined;
    const correctIdx = queueQuestions
      .map((q, i) => ({ q, fb: questionFeedbacks[i] }))
      .filter(({ fb }) => fb?.status === "done" && (fb.rating === "correct" || fb.rating === "excellent"))
      .map(({ q }) => DIFF_ORDER.indexOf(q.difficulty));
    if (correctIdx.length === 0) return undefined;
    const floor = Math.max(...correctIdx);
    const used = new Set(questionQueue);
    return content.questions
      .map((q, i) => ({ q, i, d: DIFF_ORDER.indexOf(q.difficulty) }))
      .filter(({ i, d }) => !used.has(i) && d > floor)
      .sort((a, b) => a.d - b.d)[0];
  };

  const goChallengeQuestion = () => {
    const candidate = findChallenge();
    if (!candidate) return;
    setChallengeUsed(true);
    setChallengeOpen(true);
    setQuestionQueue(prev => [...prev, candidate.i]);
    setCurrentQIdx(queueQuestions.length);
    setShowHint(false);
  };

  // Dejar el reto: la comprobación ya estaba cerrada; el reto queda como intentado.
  const closeChallenge = () => setChallengeOpen(false);

  const persistQuestionsDone = (skipped: boolean) => {
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      questionsDone: true,
      questionsSkipped: skipped,
      focusStep: 1,
    }).catch(err => console.error("[history] upsert questions done", err));
  };

  // Bug §1.2: «Ir al desafío» ya no pasa por handleForceComplete — completa sin toast.
  const completeQuestions = () => {
    setQuestionsComplete(true);
    persistQuestionsDone(false);
  };
  // «Terminar aquí» antes de responder una pregunta del plan (la 2.ª en adelante):
  // la que no respondiste sale de la cola (no cuenta ni como fallo ni en el repaso).
  const finishBeforeAnswer = (i: number) => {
    setQuestionQueue(prev => prev.slice(0, i));
    setCurrentQIdx(Math.max(0, i - 1));
    completeQuestions();
  };

  // «Saltar este paso» (único camino del toast «Comprobación saltada»).
  const handleSkipQuestions = () => {
    setQuestionsComplete(true);
    setQuestionsSkipped(true);
    persistQuestionsDone(true);
    toast.message("Comprobación saltada", {
      icon: <FastForward className="text-violet-400" size={18} />,
      action: { label: "Deshacer", onClick: () => handleUndoSkipQuestions() },
    });
  };

  // §1.7: saltar no es definitivo — se vuelve a la pregunta donde estabas.
  const handleUndoSkipQuestions = () => {
    setQuestionsComplete(false);
    setQuestionsSkipped(false);
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      questionsDone: false,
      questionsSkipped: false,
      questionsComplete: false,
      focusStep: 1,
    }).catch(err => console.error("[history] upsert undo skip", err));
    goToStep(1, true);
  };

  const handleEvalApp = async () => {
    // Vista la solución, el intento queda cerrado (un acierto después no sería propio).
    if (!content || !appAnswer.trim() || appSolutionSeen) return;
    setAppEvaluated(appAnswer);
    setAppFeedback({ status: "loading", content: "", rating: "unknown" });

    // Attempt streaming code review first
    const aiContext = getStudyAIContext(content);
    const res = await evaluateCodeSolutionStream(
      content.application.setup, content.application.solution, appAnswer,
      (_, accumulated) => {
        setAppFeedback(prev => ({ status: "streaming", content: accumulated, rating: "unknown", isMock: prev.isMock }));
      },
      aiContext,
      // El nivel que declaraste también calibra el «siguiente nivel» de la revisión (igual que sin streaming).
      confidence ?? undefined,
    );

    // §2: la práctica y el código son lo mejor pagado; el intento cuenta.
    const firstAttempt = !appRewardedRef.current;
    const markAttempted = () => {
      if (firstAttempt) {
        appRewardedRef.current = true;
        const gained = recordXp("practice_attempted");
        setSessionXp(prev => prev + gained);
      }
    };
    const markCorrect = (bonus: number) => {
      const gained = recordXp("practice_correct", bonus);
      setSessionXp(prev => prev + gained);
      setPracticeStatus("correct");
    };
    const persistCode = (rating: AIRating, feedback: string) => {
      historyService.upsertLecture({
        courseName,
        lectureName: lessonName,
        codeChallenge: { prompt: content.application.challenge, answer: appAnswer, rating, feedback, answeredAt: Date.now() },
        practiceStatus: rating === "correct" || rating === "excellent" ? "correct" : "done",
        focusStep: 2,
      }).catch(err => console.error("[history] upsert code", err));
    };

    if (!res.success || !res.content.trim()) {
      const fallback = await evaluateCodeSolution(content.application.setup, content.application.solution, appAnswer, aiContext, confidence ?? undefined);
      const fb: FeedbackState = { status: fallback.success ? "done" : "error", content: fallback.success ? fallback.content : (fallback.error ?? "Error"), rating: fallback.rating, isMock: fallback.isMock };
      setAppFeedback(fb);
      if (fb.status === "done") {
        markAttempted();
        const isGood = fallback.rating === "correct" || fallback.rating === "excellent";
        setPracticeStatus(prev => (prev === "correct" ? prev : isGood ? "correct" : "done"));
        if (isGood && firstAttempt) markCorrect(content.application.isCode ? 20 : 0);
        persistCode(fb.rating, fb.content);
      }
      return;
    }

    setAppFeedback({ status: "done", content: res.content, rating: res.rating, isMock: res.isMock });
    markAttempted();
    const isGood = res.rating === "correct" || res.rating === "excellent";
    setPracticeStatus(prev => (prev === "correct" ? prev : isGood ? "correct" : "done"));
    if (isGood && firstAttempt) markCorrect(content.application.isCode ? 20 : 0);
    persistCode(res.rating, res.content);
    // §1.3: sin banner «¡Sesión completada!» — el cierre ocurre en Fijar.
  };

  // §1.7: «Saltar este paso» en Aplicar — el estudiante decide; queda como pendiente.
  const handlePracticeLater = () => {
    setPracticeStatus(prev => prev ?? "later");
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      practiceStatus: "later",
      focusStep: 2,
    }).catch(err => console.error("[history] upsert practice later", err));
    toast.message("Práctica pendiente", {
      icon: <FastForward className="text-violet-400" size={18} />,
      // Volver a Aplicar: la práctica sigue abierta y el resumen se actualiza al revisarla.
      action: { label: "Volver", onClick: () => goToStep(2, true) },
    });
    // El estado aún no se ha aplicado: se fuerza el paso (el salto ya es explícito).
    goToStep(3, true);
  };


  // §1.7: explicarlo con tus palabras es otra forma de practicar — cuenta como práctica hecha.
  // Una explicación bien valorada cuenta como práctica CORRECTA (transferencia
  // demostrada): alimenta el resumen y no refuerza sus tarjetas en Anki.
  const markOralPracticed = (rating?: AIRating) => {
    // §2: explicarlo es la otra forma de practicar y se premia igual que el
    // caso (una sola práctica premiada por lección, la primera evaluada).
    if (!appRewardedRef.current) {
      appRewardedRef.current = true;
      let gained = recordXp("practice_attempted");
      if (rating === "correct" || rating === "excellent") gained += recordXp("practice_correct");
      setSessionXp(prev => prev + gained);
    }
    // También tras un salto («later»): volver y explicarlo la cuenta como hecha.
    const next = rating === "correct" || rating === "excellent" ? "correct" : "done";
    if (practiceStatus === "correct" || practiceStatus === next) return;
    setPracticeStatus(next);
    historyService.upsertLecture({ courseName, lectureName: lessonName, practiceStatus: next, focusStep: 2 })
      .catch(err => console.error("[history] upsert oral practice", err));
  };

  const handleEvaluateOral = async () => {
    if (!content?.interviewQ || !oralAnswer.trim() || oralFeedback.status === "loading" || oralFeedback.status === "streaming") return;
    const q = content.interviewQ;
    const aiContext = getStudyAIContext(content);
    setOralEvaluated(oralAnswer);
    setOralFeedback({ status: "loading", content: "", rating: "unknown" });
    const res = await evaluateActiveAnswerStream(
      q.q, q.idealAnswer, oralAnswer, "aplicar",
      (_, acc) => setOralFeedback({ status: "streaming", content: acc, rating: "unknown" }),
      aiContext,
    );
    if (res.success && res.content.trim()) {
      setOralFeedback({ status: "done", content: res.content, rating: res.rating, isMock: res.isMock });
      markOralPracticed(res.rating);
      return;
    }
    const fallback = await evaluateActiveAnswer(q.q, q.idealAnswer, oralAnswer, "aplicar", aiContext);
    if (fallback.success) markOralPracticed(fallback.rating);
    setOralFeedback({ status: fallback.success ? "done" : "error", content: fallback.success ? fallback.content : (fallback.error ?? "Error"), rating: fallback.rating, isMock: fallback.isMock });
  };

  // C3: marca la sesión como exportada a OBSIDIAN, sin tocar exportedAt (que
  // alimenta el «en Anki» del historial). Exportar NO completa la lección:
  // terminar es la acción explícita «Terminar lección» (§1.4).
  const persistObsidianExport = () => {
    if (!content) return;
    const cards: StoredAnkiCard[] = allCardsWithReinforce.map(c => ({
      id: c.id, front: c.front, back: c.back, tags: c.tags, type: c.type,
      conceptRefs: c.conceptRefs, reinforce: c.reinforce, excluded: c.excluded,
      doubt: c.doubt, isHtml: c.isHtml,
    }));
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      studyContent: content as StoredStudyContent,
      ankiCards: cards,
      ankiCardsCount: cards.filter(c => !c.excluded).length,
      questionsDone: questionsComplete || undefined,
      questionsSkipped: questionsSkipped || undefined,
      practiceStatus: practiceStatus ?? "later",
      focusStep: 3,
      obsidianExportedAt: Date.now(),
      recallNotes: recallNotes.trim() || undefined,
    }).catch(err => console.error("[history] export (obsidian)", err));
  };

  const persistAnkiExport = (guids: string[]) => {
    if (!content) return;
    const cards: StoredAnkiCard[] = allCardsWithReinforce.map(c => ({
      id: c.id, front: c.front, back: c.back, tags: c.tags, type: c.type,
      conceptRefs: c.conceptRefs, reinforce: c.reinforce, excluded: c.excluded,
      doubt: c.doubt, isHtml: c.isHtml,
    }));
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      studyContent: content as StoredStudyContent,
      ankiCards: cards,
      ankiCardsCount: cards.filter(c => !c.excluded).length,
      questionsDone: questionsComplete || undefined,
      questionsSkipped: questionsSkipped || undefined,
      practiceStatus: practiceStatus ?? "later",
      focusStep: 3,
      exportedAt: Date.now(),
      exportedGuids: guids,
      recallNotes: recallNotes.trim() || undefined,
    }).catch(err => console.error("[history] export", err));
  };

  const handleExportApkg = async () => {
    markQa("apkg-click");
    if (!content || apkgStatus === "loading") { markQa("apkg-skip:" + (content ? "loading" : "no-content")); return; }
    setApkgStatus("loading");
    setApkgProgress("Iniciando…");
    try {
      const deckName = await exportApkgFile(allCardsWithReinforce, courseName, lessonName, vocabCfg.rootDeck, (msg) => {
        setApkgProgress(msg);
        markQa("apkg-progress:" + msg.slice(0, 40));
      }, dcCtx?.activeSlug);
      const guids = allCardsWithReinforce.filter(c => !c.excluded).map(c => stableAnkiGuid(courseName, lessonName, c));
      setApkgStatus("done");
      setAnkiExported(true);
      setLastExportGuids(guids);
      markQa("apkg-done:" + deckName.slice(0, 60));
      // §3: el aviso de reexportación solo si el CONJUNTO de tarjetas cambió.
      try {
        const rec = await historyService.getLecture(slugify(courseName), slugify(lessonName));
        const prev = rec?.exportedGuids;
        const added = prev ? guids.filter(g => !prev.includes(g)).length : 0;
        const removed = prev ? prev.filter(g => !guids.includes(g)).length : 0;
        if (prev && removed > 0) {
          toast.info("Ya exportaste otra versión de esta lección", {
            description: "Anki conservará las anteriores. Si solo quieres las nuevas, borra el mazo de la lección antes de importar.",
            duration: 12000,
          });
        } else if (prev && added > 0) {
          // GUID estables: Anki reconoce las ya importadas y solo suma las nuevas.
          toast.info(added === 1 ? "1 tarjeta nueva en este mazo" : `${added} tarjetas nuevas en este mazo`, {
            description: "Las que ya importaste no se duplican: Anki reconoce cada tarjeta y solo añade las nuevas.",
            duration: 9000,
          });
        }
      } catch {}
      persistAnkiExport(guids);
      if (!importHintSeen) {
        setImportHintSeen(true);
        toast.info("Antes de importar en Anki", {
          description: "Activa «Importar cualquier configuración del mazo» en la pantalla de importación para recibir los presets de Kinema. Anki lo recordará; solo hace falta la primera vez.",
          duration: 12000,
          action: { label: "Ver guía", onClick: () => setShowAnkiGuide(true) },
        });
      }
      // §2: export_done una vez por lección (Anki u Obsidian) — silencioso,
      // la celebración grande es la del cierre.
      celebrate({ type: "anki_export", silent: true, rewardKey: `export::${slugify(courseName)}::${slugify(lessonName)}`, title: "¡Paquete Anki listo!", subtitle: `Mazo: ${deckName} — impórtalo con doble clic en Anki Desktop`, icon: <Package className="text-violet-400" /> });
      setTimeout(() => setApkgStatus("idle"), 4000);
    } catch (err) {
      console.error("[apkg export]", err);
      markQa("apkg-error:" + String(err instanceof Error ? err.message : err).slice(0, 80));
      setApkgStatus("error");
      setApkgProgress("Error al generar el .apkg. Revisa la consola.");
      toast.error("Hubo un error al generar el paquete .apkg", {
        icon: (
          <div className="p-1.5 rounded-full bg-red-500/10 border border-red-500/20">
            <X className="text-red-400 w-4 h-4" />
          </div>
        )
      });
      setTimeout(() => setApkgStatus("idle"), 5000);
    }
  };

  // ── Vocabulario del curso → .apkg (note type + preset propios) ─────────────
  const generateVocabularyCandidates = async () => {
    // Sin runtime de extensión (preview web), la demo local permite ver el flujo.
    const previewPayload = await prototypeVocabularyFor(vocabCfg.targetLang);
    if (previewPayload) return previewPayload;
    const transcript = await requestStudyTranscript(22000);
    if (!transcript.ok || !transcript.transcriptText?.trim()) throw new Error(transcript.error || "No hay transcripción disponible.");
    // Lo que ya está en tu mazo (de cualquier lección o curso del idioma) y sale
    // en esta lección no se vuelve a pedir: las candidatas son todas nuevas.
    const transcriptText = transcript.transcriptText;
    const known = await knownVocabularyIn(vocabCfg.targetLang, transcriptText);
    const knownWords = known.map(entry => entry.word).slice(0, 80);
    const response = await sendRuntimeMessage<{ ok?: boolean; payload?: unknown; error?: string }>({
      type: "USG_GENERATE_VOCABULARY", transcriptText: transcript.transcriptText, knownWords,
      course: courseName, lesson: lessonName, targetLang: vocabCfg.targetLangLabel,
      // Candidatas según el volumen de la lección (6 corta … 20 densa); el
      // estudiante exporta después hasta su máximo por lección.
      baseLang: vocabCfg.baseLangLabel, minLevel: vocabCfg.minLevel, maxWords: vocabularyCandidateTarget(transcript.transcriptText),
    });
    if (!response?.ok) throw new Error(response?.error || "Para generar vocabulario, Kinema necesita la extensión y un proveedor de IA configurado. Puedes probar la demo sin exportar.");
    const words = parseVocabularyPayload(response.payload).filter(word => vocabularyMatches(word.word, transcript.transcriptText ?? "", word.form));
    // Sin nuevas pero con palabras que ya tienes: no es un error (la lección solo repasa).
    if (!words.length && known.length === 0) throw new Error("Kinema no encontró palabras de los subtítulos con estos criterios. Revisa el idioma objetivo y la transcripción.");
    // Las que ya tienes viajan aparte: no ocupan hueco en la lista, pero el chip
    // del video las sigue mostrando (volver a verlas en contexto también fija).
    return { words, known: known.slice(0, 40), partial: Boolean(transcript.truncated || transcript.transcriptTruncated) };
  };

  // ── Obsidian export ──────────────────────────────────────────────────────────
  const getObsidianSessionData = (): ObsidianSessionData | null => {
    if (!content) return null;
    // §6: el cierre de Study viaja a la nota — recuerdo libre, puntos débiles
    // (preguntas falladas/parciales con su respuesta) y el resumen final.
    const weakPoints = queueQuestions
      .map((q, i) => ({ q, fb: questionFeedbacks[i] }))
      .filter(({ fb }) => fb?.status === "done" && (fb.rating === "partial" || fb.rating === "wrong"))
      .map(({ q }) => ({ q: q.q, answer: q.answer }));
    // §5: cada respuesta de duda (con su respaldo literal) y las tarjetas guardadas.
    const doubtNotes = doubts.flatMap(thread => thread.turns.map(turn => ({
      q: turn.q, answer: turn.answer, quotes: turn.quotes, outside: turn.outside,
    })));
    // Las mismas tarjetas que el mazo (aceptadas: de duda, de refuerzo y de la lección).
    const noteCards = allCardsWithReinforce.filter(c => !c.excluded).map(c => ({ front: c.front, back: c.back, type: c.type }));
    const unrecalledIdeas = content.keyConcepts.filter((_, i) => !conceptsChecked[i]);
    return {
      courseName,
      lessonName,
      objective: getActiveObjectiveText() || undefined,
      sourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      // Plataforma real de la lección (raw/ y frontmatter la citan).
      platform: typeof window !== "undefined" && window.location.hostname.includes("datacamp") ? "datacamp" : "udemy",
      // Programa elegido (solo DataCamp con track activo): frontmatter + MOC.
      program: dcCtx?.activeSlug && dcCtx.program ? { title: dcCtx.program.title, slug: dcCtx.program.slug } : undefined,
      ankiDeck: conceptDeckPath(vocabCfg.rootDeck || "Kinema", courseName, lessonName),
      recallNotes: recallNotes.trim() || undefined,
      weakPoints: weakPoints.length > 0 ? weakPoints : undefined,
      // Lo mismo que Anki refuerza: ideas no marcadas y la práctica que no salió.
      unrecalledIdeas: unrecalledIdeas.length > 0 ? unrecalledIdeas : undefined,
      practiceToRedo: practiceWeak || undefined,
      doubts: doubtNotes.length > 0 ? doubtNotes : undefined,
      result: buildResultSummary(),
      content: { ...content, ankiCards: noteCards } as ObsidianSessionData["content"],
    };
  };

  const handleExportObsidian = () => {
    const data = getObsidianSessionData();
    if (!data) return;
    if (!obsidianCfg.vaultName.trim()) {
      openObsidianSettings();
      toast.error("Escribe el nombre de tu vault para exportar", {
        description: "Obsidian lo abre y crea la nota — sin plugins ni servidores.",
        icon: <BookMarked className="text-violet-400" size={18} />,
      });
      return;
    }
    // Ya exportada (en este vault y carpeta): obsidian://new crearía «nombre 1.md».
    // Lo seguro es AÑADIR el repaso de hoy al final; reemplazar es la otra opción.
    // (Ref, no state: el guard debe ver las marcas aunque el closure sea viejo.)
    if (isSessionExported(exportedNotesRef.current, obsidianCfg, data.courseName, data.lessonName)) {
      markQa("exportar-guard");
      // Un solo aviso de Obsidian a la vez (mismo id): el nuevo reemplaza al anterior.
      toast.warning("Esta lección ya tiene nota", {
        id: OBSIDIAN_TOAST_ID,
        description: "Añadir: suma lo de hoy al final, sin tocar tu nota. Reemplazar: la rehace y borra tus cambios.",
        action: { label: "Añadir", onClick: () => doExportObsidianUpdate(data) },
        cancel: { label: "Reemplazar", onClick: () => doExportObsidian(data, false, { overwrite: true }) },
        duration: 12000,
        icon: <BookMarked className="text-amber-400" size={18} />,
      });
      return;
    }
    doExportObsidian(data, true);
  };

  // Nota ya exportada: el vault crece con un «Repaso · fecha» al final (append).
  const doExportObsidianUpdate = (data: ObsidianSessionData) => {
    try {
      const result = exportSessionUpdateToObsidian(data, obsidianCfg);
      setObsidianStatus("done");
      setObsidianExportedAt(Date.now());
      persistObsidianExport();
      toast.success("Repaso añadido a la nota", { id: OBSIDIAN_TOAST_ID, description: "Al final de la nota de la lección; lo que escribiste sigue igual.", icon: <BookMarked className="text-violet-400" size={18} /> });
      setTimeout(() => setObsidianStatus("idle"), 4000);
    } catch (err) {
      setObsidianStatus("error");
      toast.error(err instanceof Error ? err.message : "No se pudo exportar a Obsidian.");
    }
  };

  const doExportObsidian = async (data: ObsidianSessionData, markExported: boolean, options: { overwrite?: boolean } = {}) => {
    try {
      // C8: si va a viajar el SRT crudo, pedirlo ANTES de abrir la primera URI
      // (el fetch es asíncrono y después perderíamos el gesto del clic).
      const srt = obsidianCfg.includeRawSrt ? await fetchEnSrtForExport() : "";
      const result = exportSessionToObsidian(data, obsidianCfg, {
        createdMocs,
        overwrite: options.overwrite,
      });
      setObsidianStatus("done");
      // C3: exportar a Obsidian NO marca la lección como «en Anki» — estados
      // separados. §2: XP de exportación compartido, una vez por lección.
      setObsidianExportedAt(Date.now());
      persistObsidianExport();
      celebrate({ type: "export_done", silent: true, rewardKey: `export::${slugify(courseName)}::${slugify(lessonName)}`, title: "Exportado a Obsidian" });
      // Chrome abre UN protocolo externo por clic: lo demás (índice del curso,
      // subtítulos) se ofrece como acción propia, encadenada, cada una con su clic.
      // Textos cortos: el aviso es estrecho y las rutas largas lo desbordaban.
      const followUps: { label: string; pending: string; done: string; path: string; open: () => void }[] = [];
      if (result.moc) {
        const moc = result.moc;
        followUps.push({
          label: "Crear índice", pending: "Falta el índice del curso: un clic más.", done: "Índice del curso creado", path: moc.note.path,
          open: () => {
            openObsidianNote(obsidianCfg.vaultName.trim(), moc.note);
            setCreatedMocs(prev => {
              const next = [...new Set([...prev, moc.key])];
              void saveCreatedMocs(next);
              return next;
            });
          },
        });
      }
      // MOC del programa (career track): índice de los cursos en orden + las
      // sesiones estudiadas (Dataview por programa_slug). Solo con programa.
      if (dcCtx?.program && dcCtx.activeSlug) {
        const program = dcCtx.program;
        const programPath = buildProgramMocPath(obsidianCfg, program.title, program.slug);
        followUps.push({
          label: "MOC del programa", pending: "Falta el MOC del programa: un clic más.", done: "MOC del programa creado", path: programPath,
          open: () => openObsidianUri(buildObsidianNewUri(obsidianCfg.vaultName, {
            path: programPath,
            markdown: buildProgramMocMarkdown({ ...program, platform: "datacamp" }, { sourcesFolder: obsidianCfg.sourcesFolder }),
          })),
        });
      }
      if (obsidianCfg.includeRawSrt && srt) {
        const rawPath = buildRawSrtNotePath(data.courseName, data.lessonName, { platform: "udemy" });
        followUps.push({
          label: "Guardar subtítulos", pending: "Faltan los subtítulos (raw/): un clic más.", done: "Subtítulos guardados en raw/", path: rawPath,
          open: () => openObsidianUri(buildObsidianNewUri(obsidianCfg.vaultName, {
            path: rawPath,
            markdown: buildRawSrtNoteMarkdown(data.courseName, data.lessonName, srt, { platform: "udemy", sourceUrl: data.sourceUrl }),
          })),
        });
      }
      const folderOf = (path: string) => `${path.split("/").slice(0, -1).join("/")}/`;
      const offer = (i: number, title: string, path: string) => {
        const next = followUps[i];
        toast.success(title, {
          id: OBSIDIAN_TOAST_ID,
          description: next ? next.pending : `En ${folderOf(path)}`,
          icon: <BookMarked className="text-violet-400" size={18} />,
          duration: next ? 12000 : 4000,
          action: next ? { label: next.label, onClick: () => { next.open(); offer(i + 1, next.done, next.path); } } : undefined,
        });
      };
      offer(0, "Nota creada en Obsidian", result.notePath);
      setTimeout(() => setObsidianStatus("idle"), 4000);
      if (markExported) {
        const key = sessionExportKey(obsidianCfg, data.courseName, data.lessonName);
        const next = [...new Set([...exportedNotesRef.current, key])];
        exportedNotesRef.current = next;
        setExportedNotes(next);
        void saveObsidianExportedNotes(next);
      }

      // Subtítulos → raw/: se ofrecen arriba como acción propia (otro clic).
      if (obsidianCfg.includeRawSrt && !srt) {
        toast.info("Los subtítulos aún no están disponibles: esta vez no se guardan en raw/.");
      }
    } catch (err) {
      setObsidianStatus("error");
      toast.error(err instanceof Error ? err.message : "No se pudo exportar a Obsidian.");
    }
  };

  /** Pide al content script el SRT EN capturado (timeout 5s, no bloquea el export). */
  const fetchEnSrtForExport = (): Promise<string> => {
    return new Promise((resolve) => {
      let done = false;
      const cleanup = contentBridge.onMessageFromContent((message: BridgeMessage) => {
        if (message.type !== "EN_SRT_RESULT") return;
        done = true;
        cleanup();
        const payload = (message.payload ?? {}) as { srt?: string };
        resolve(String(payload.srt || ""));
      });
      void contentBridge.sendToContent({ type: "GET_EN_SRT", payload: {} });
      window.setTimeout(() => {
        if (!done) {
          cleanup();
          resolve("");
        }
      }, 5000);
    });
  };

  const handleCopyObsidianMarkdown = async () => {
    const data = getObsidianSessionData();
    if (!data) { markQa("copy-skip:no-content"); return; }
    markQa("copy-click");
    const markdown = buildSessionNoteMarkdown(data, obsidianCfg);
    // writeText falla silencioso en algunos contextos de content script:
    // el fallback execCommand copia con la activación del click.
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      const area = document.createElement("textarea");
      area.value = markdown;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      try {
        if (!document.execCommand("copy")) throw new Error("execCommand(copy) devolvió false");
      } catch {
        toast.error("No se pudo copiar el Markdown", { description: "Usa «Descargar .md» como alternativa." });
        return;
      } finally {
        area.remove();
      }
    }
    toast.success("Markdown copiado", { description: "Pégalo en Obsidian donde quieras (Ctrl+V)." });
  };

  const handleDownloadObsidianMarkdown = () => {
    const data = getObsidianSessionData();
    if (!data) return;
    try {
      const path = buildSessionNotePath(obsidianCfg, courseName, lessonName);
      downloadFile(buildSessionNoteMarkdown(data, obsidianCfg), path.split("/").pop() || "sesion.md", "text/markdown;charset=utf-8");
    } catch (error) {
      toast.error("No se pudo descargar la nota", { description: error instanceof Error ? error.message : "Inténtalo de nuevo." });
      return;
    }
    toast.success("Nota .md descargada", { description: "Muévela a la carpeta del vault si no la guardaste ahí." });
  };

  const handleSaveObsidianCfg = (patch: Partial<ObsidianExportConfig>) => {
    const next = { ...obsidianCfg, ...patch };
    setObsidianCfg(next);
    void saveObsidianExportConfig(next);
  };

  // §1.2: Comprobar terminado (respondido o saltado) habilita Aplicar.
  const showApply = confidence !== null && questionsComplete;

  // §1.5: estudiante que vuelve → objetivo/curso plegados y CTA corto.
  const returningMode = Boolean(
    returningStudent &&
    dynamicObjectives &&
    !objectivesExpanded &&
    (lastUsedObjectiveId || (selectedObj && selectedObj !== "custom"))
  );
  // §1.5: sin transcripción (esperando o sin subtítulos) el CTA no arranca en la extensión.
  const transcriptBlocksCta = IS_EXTENSION && (transcriptState.status === "none" || transcriptState.status === "waiting" || transcriptState.status === "unsupported");

  // ── Focus navigator helpers (flowVersion 2: 4 pasos) ─────────────────────
  const stepUnlocked = [
    true,                     // 0 Recordar
    confidence !== null,      // 1 Comprobar
    questionsComplete,        // 2 Aplicar
    questionsComplete && practiceStatus !== null, // 3 Fijar: práctica intentada o saltada (§1.7)
  ] as const;

  // §1.7: en Comprobar, lo mínimo es una respuesta revisada; «Siguiente» entonces
  // termina la comprobación (lo mismo que «Terminar la comprobación»).
  const anyAnswerReviewed = queueQuestions.some((_, i) => questionFeedbacks[i]?.status === "done");
  const canGoNext = focusStep < 3 && (stepUnlocked[focusStep + 1 as 0|1|2|3] || (focusStep === 1 && anyAnswerReviewed));
  const handleTopNext = () => {
    if (focusStep === 0) { handleGoVerify(); return; }
    if (focusStep === 1 && !questionsComplete) {
      if (!anyAnswerReviewed) return;
      completeQuestions();
      goToStep(2, true);
      return;
    }
    goToStep(focusStep + 1);
  };
  const canGoPrev = focusStep > 0;

  const goToStep = (target: number, force = false) => {
    if (target < 0 || target > 3) return;
    if (!force && !stepUnlocked[target as 0|1|2|3]) return;
    // Reset scroll ANTES del re-render — evita que AnimatePresence empuje hacia abajo
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setFocusDir(target > focusStep ? 1 : -1);
    setFocusStep(target);
    if (content) {
      historyService.upsertLecture({
        courseName,
        lectureName: lessonName,
        focusStep: target,
      }).catch(err => console.error("[history] upsert focus step", err));
    }
  };

  // §1.1: el CTA del paso Recordar — solo el toque de nivel bloquea.
  const handleGoVerify = () => {
    const checkedConceptIndexes = Object.entries(conceptsChecked)
      .filter(([, checked]) => checked)
      .map(([key]) => Number(key))
      .filter(Number.isFinite);
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      checkedConceptIndexes,
      conceptsAcknowledged: true,
      recallNotes: recallNotes.trim() || undefined,
      focusStep: 1,
    }).catch(err => console.error("[history] upsert concept acknowledgement", err));
    goToStep(1);
  };

  const conceptsMarkedCount = Object.values(conceptsChecked).filter(Boolean).length;

  // §1.3: la práctica nunca bloquea — status único en vez de appPassed.
  const practiceLabel = practiceStatus === "correct" ? "correcta" : practiceStatus === "done" ? "hecha" : "pendiente";
  const oralPracticeMeta = content ? getOralPracticeMeta(content, activeSessionObjective || getActiveObjectiveText()) : null;

  // Stepper (nombres de STEP_META, 4 pasos)
  const steps = [
    { label: STEP_META[0].short, done: confidence !== null, active: confidence === null },
    { label: STEP_META[1].short, done: questionsComplete, active: confidence !== null && !questionsComplete },
    { label: STEP_META[2].short, done: practiceStatus !== null, active: showApply && practiceStatus === null },
    { label: STEP_META[3].short, done: finishedAt !== null, active: showApply && practiceStatus !== null },
  ];

  // Un objetivo ELEGIDO por el estudiante cuenta aunque las plantillas del
  // curso sean heuristicas (sin Gemini): la sesion se genera con el proveedor
  // configurado, no con Gemini, asi que exigir !objectivesMock solo dejaba el
  // boton muerto sin decir por que. El aviso de «plantillas heuristicas» sigue.
  const hasUsableObjective = Boolean(
    customObj.trim() ||
    dynamicObjectives?.some(o => o.id === selectedObj)
  );
  const hasCourseContext = Boolean(courseName.trim() && lessonName.trim());

  // ── §1.6: calibración honesta ─────────────────────────────────────────────
  // Demostrado = la dificultad MÁS ALTA respondida correcta a la primera.
  // Si ninguna, un nivel por debajo del declarado (mínimo «Confuso»).
  // Sin respuestas evaluadas (p. ej. Comprobación saltada) no hay calibración:
  // sin evidencia no se dice nada (regla de honestidad, R5).
  const calibration = useMemo(() => {
    if (!content || !confidence || queueQuestions.length === 0 || questionsSkipped) return null;
    if (!queueQuestions.some((_, i) => questionFeedbacks[i]?.status === "done")) return null;
    const label = (i: number) => CONFIDENCE.find(c => c.id === DIFF_ORDER[i])?.label ?? "";
    const saidIdx = DIFF_ORDER.indexOf(confidence);
    const said = label(saidIdx);
    const firstTryCorrect = queueQuestions.filter((q) => firstTryCorrectRef.current.has(q.q));
    if (firstTryCorrect.length === 0) {
      // Con «Confuso» y sin acierto no hay nada que calibrar: el resumen ya lo dice.
      if (saidIdx <= 0) return null;
      return { said, shown: "", message: `Elegiste «${said}», pero no acertaste a la primera: repásalo en Anki.` };
    }
    const shownIdx = Math.max(...firstTryCorrect.map(q => DIFF_ORDER.indexOf(q.difficulty)));
    const shown = label(shownIdx);
    const diff = shownIdx - saidIdx;
    const message = diff === 0
      ? saidIdx === 0
        ? `Acertaste la pregunta básica: la próxima vez prueba con «${label(1)}».`
        : `Elegiste «${said}» y tus respuestas lo confirman.`
      : diff < 0
        ? `Elegiste «${said}», pero tus respuestas quedaron en «${shown}».`
        : `Sabes más de lo que creías: la próxima vez prueba con «${shown}».`;
    return { said, shown, message };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, confidence, questionQueue, questionFeedbacks, questionsSkipped]);

  // ── §1.4: resumen de cierre con datos reales ─────────────────────────────
  const firstTryCount = queueQuestions.filter((q) => firstTryCorrectRef.current.has(q.q)).length;
  const improvedCount = queueQuestions.filter((_, i) => {
    const fb = questionFeedbacks[i];
    return fb?.status === "done" && (fb.rating === "correct" || fb.rating === "excellent");
  }).length - firstTryCount;
  // R5: nunca «dominada» por defecto; lo saltado o pendiente se nombra tal cual.
  // Los fallos no cambian el título: el resumen los muestra y van a Anki como refuerzo.
  const resultTitle = (() => {
    const totalQ = queueQuestions.filter((_, i) => questionFeedbacks[i]?.status === "done").length;
    const pending = questionsSkipped || practiceStatus === null || practiceStatus === "later";
    if (pending) return "Lección con pasos pendientes";
    if (totalQ > 0 && firstTryCount === totalQ && practiceStatus === "correct") return "Lección dominada";
    return "Lección completada";
  })();

  // Solo lo usa la nota de Obsidian: las mismas cifras que la caja de Fijar
  // (refuerzo calculado de las tres fases, no solo el guardado en el contenido).
  const buildResultSummary = (): import("../services/obsidianExport").StudyResultSummary => {
    const accepted = allCardsWithReinforce.filter(c => !c.excluded);
    const selected = accepted.filter(c => !c.doubt);
    const reinforceCount = selected.filter(c => c.reinforce).length;
    const doubtCount = accepted.filter(c => c.doubt).length;
    // Si no fueron a Anki, viajan en esta misma nota (cuando la nota las incluye).
    const destination: "anki" | "obsidian" | "none" = ankiExported ? "anki" : obsidianExportedAt || obsidianCfg.includeCards ? "obsidian" : "none";
    return {
      title: resultTitle,
      remembered: { count: conceptsMarkedCount, total: content?.keyConcepts.length ?? 0 },
      check: { firstTry: firstTryCount, improved: Math.max(0, improvedCount), skipped: questionsSkipped },
      practice: practiceStatus === "correct" ? "correct" : practiceStatus === "done" ? "done" : "later",
      calibration: calibration ? { said: calibration.said, shown: calibration.shown, message: calibration.message } : undefined,
      cards: { total: selected.length + doubtCount, reinforce: reinforceCount, destination, doubt: doubtCount || undefined },
    };
  };

  // ── §5a: dudas sobre la lección ────────────────────────────────────────────
  // Cada lección se estudia una vez y a donde se vuelve es a Anki: la duda
  // aparece al intentar (recuerdo libre, feedback) y se resuelve en la misma
  // sesión; lo que perdura es su tarjeta (docs/STUDY_FLOW_PEDAGOGY §5).
  useEffect(() => {
    let alive = true;
    void prototypeDoubtDemoFor().then((demo) => { if (alive) setDoubtDemo(demo); });
    return () => { alive = false; };
  }, []);

  // Solo con la sesión abierta, sin terminar y del vídeo que se está viendo: la
  // respuesta se apoya en la transcripción del vídeo abierto y se guarda en SU lección.
  // Tras «Ir a la siguiente lección»: en cuanto Udemy abre otra, Study la prepara.
  useEffect(() => {
    const from = pendingNextLessonRef.current;
    if (from === null || !lessonName.trim() || slugify(lessonName) === slugify(from)) return;
    pendingNextLessonRef.current = null;
    openLessonInStudy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonName]);

  // La lección abierta en Udemy ya no es la de esta sesión (cambiaste de video).
  const sessionElsewhere = phase === "result" && studySession !== null && lessonName.trim() !== ""
    && (slugify(studySession.course) !== slugify(courseName) || slugify(studySession.lesson) !== slugify(lessonName));
  const doubtsAvailable = phase === "result" && finishedAt === null && studySession !== null
    && slugify(studySession.course) === slugify(courseName) && slugify(studySession.lesson) === slugify(lessonName);

  const getDoubtTranscript = useCallback(async (): Promise<DoubtTranscript | null> => {
    if (doubtDemo) return { text: doubtDemo.transcript, truncated: false };
    const res = await requestStudyTranscript(DOUBT_TRANSCRIPT_CHARS);
    const text = res.transcriptText ?? res.text ?? "";
    return res.ok && text.trim() ? { text, truncated: Boolean(res.transcriptTruncated ?? res.truncated) } : null;
  }, [doubtDemo]);

  // Los hilos son la fuente de verdad: se guardan con la lección de la sesión
  // (solo para sobrevivir a una recarga a mitad de la sesión).
  const doubtsRef = useRef<LessonDoubtThread[]>(doubts);
  doubtsRef.current = doubts;
  const handleDoubtChange = (thread: LessonDoubtThread) => {
    if (!studySession) return;
    const next = upsertDoubtThread(doubtsRef.current, thread);
    doubtsRef.current = next;
    setDoubts(next);
    historyService.upsertLecture({ courseName: studySession.course, lectureName: studySession.lesson, doubts: next })
      .catch(err => console.error("[history] upsert doubts", err));
  };

  const savedDoubts = savedDoubtCount(doubts);
  const doubtCtx = (kind: LessonDoubtKind, anchor: string, extra?: Partial<LessonDoubtContext>): LessonDoubtContext => ({
    course: courseName,
    lesson: lessonName,
    objective: activeSessionObjective || getActiveObjectiveText(),
    kind,
    anchor,
    keyConcepts: content?.keyConcepts,
    ...extra,
  });
  const toggleDoubt = (ctx: LessonDoubtContext) => {
    const key = doubtThreadId(ctx.kind, ctx.anchor);
    setOpenDoubtKey(current => current === key ? null : key);
  };
  const isDoubtOpen = (ctx: LessonDoubtContext) => openDoubtKey === doubtThreadId(ctx.kind, ctx.anchor);
  // Anclas: la pregunta (con lo que respondió y el feedback) y el desafío.
  const questionDoubtCtx = (i: number) => doubtCtx("question", queueQuestions[i]?.q ?? "", {
    studentAnswer: questionAnswers[i], feedback: questionFeedbacks[i]?.content,
  });
  const practiceDoubtCtx = () => doubtCtx("practice", content?.application.challenge ?? "", {
    studentAnswer: appAnswer, feedback: appFeedback.content,
  });
  // El panel pertenece a un ancla de un paso: al cambiar de paso, de pregunta o
  // de lección (o al cerrarse la sesión), se cierra.
  useEffect(() => { setOpenDoubtKey(null); }, [focusStep, currentQIdx, courseName, lessonName, doubtsAvailable]);

  // Tarjetas guardadas desde dudas, una por respuesta: derivadas de los hilos
  // (no viven en content.ankiCards, que se normaliza y recorta al restaurar).
  const doubtCards: AnkiCard[] = doubts.flatMap((thread): AnkiCard[] => thread.turns.flatMap((turn): AnkiCard[] => {
    if (!turn.saved) return [];
    const html = doubtCardHtml(turn.saved);
    return [{
      id: doubtCardId(thread, turn), type: "concepto", front: html.front, back: html.back, tags: [],
      reinforce: true, doubt: true, isHtml: true,
    }];
  }));


  // ── §3: conceptos débiles → tarjetas de refuerzo (máx. 2 nuevas) ──────────
  // Lo débil sale de las tres fases: ideas no marcadas (Recordar), preguntas
  // falladas (Comprobar) y la práctica intentada sin acierto o con la solución
  // vista (Aplicar → sus tarjetas de aplicación/código/entrevista van primero).
  // Saltar la práctica no es evidencia de nada: no refuerza.
  const practiceWeak = practiceStatus !== "correct" && (practiceStatus === "done" || appSolutionSeen);
  const reinforcePlan = useMemo(() => {
    if (!content) return [];
    const weak = new Set<number>();
    content.keyConcepts.forEach((_, i) => { if (!conceptsChecked[i]) weak.add(i); });
    queueQuestions.forEach((q, i) => {
      const fb = questionFeedbacks[i];
      if (fb?.status === "done" && (fb.rating === "partial" || fb.rating === "wrong")) {
        (q.conceptRefs ?? []).forEach(r => weak.add(r));
      }
    });
    const cards = content.ankiCards.map(c => ({
      ...c,
      reinforce: (c.conceptRefs ?? []).some(r => weak.has(r)) || (practiceWeak && isPracticeCard(c)) || Boolean(c.reinforce),
    }));
    const covered = new Set(cards.filter(c => c.reinforce).flatMap(c => c.conceptRefs ?? []));
    const uncoveredWeak = new Set([...weak].filter(i => !covered.has(i)));
    if (uncoveredWeak.size === 0) return cards;
    // Máx. 2 en TOTAL: las que ya pasaron al contenido (efecto de abajo) cuentan.
    let added = cards.filter(c => c.id.startsWith("study-refuerzo-")).length;
    const extras: AnkiCard[] = [];
    for (const q of queueQuestions) {
      if (added >= 2) break;
      const hits = (q.conceptRefs ?? []).filter(r => uncoveredWeak.has(r));
      if (hits.length === 0) continue;
      const qIdx = content.questions.findIndex(cq => cq.q === q.q);
      const id = `study-refuerzo-q${qIdx}`;
      // Id estable por pregunta (no por posición): con la cola creciendo
      // (consolidación, reto) dos refuerzos distintos no pueden compartir id.
      if (cards.some(c => c.id === id)) continue;
      extras.push({
        id,
        type: "concepto",
        front: q.q,
        back: `<p><b>${escapeHtml(q.answer)}</b></p>`,
        tags: [],
        conceptRefs: hits,
        reinforce: true,
        isHtml: true,
      });
      hits.forEach(r => { uncoveredWeak.delete(r); covered.add(r); });
      added += 1;
    }
    return [...extras, ...cards];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, conceptsChecked, queueQuestions, questionFeedbacks, practiceWeak]);

  // El contenido exportable lleva los flags del plan de refuerzo.
  const exportCards: AnkiCard[] = content
    ? content.ankiCards.map((c) => reinforcePlan.find(p => p.id === c.id) ?? c)
    : [];
  const allCardsWithReinforce: AnkiCard[] = content
    ? [...doubtCards, ...reinforcePlan.filter(p => !content.ankiCards.some(c => c.id === p.id)), ...exportCards]
    : [];

  // §3: solo se exporta lo que el estudiante acepta — quitar/incluir por tarjeta.
  // §5: una de duda está en el mazo o no — «Quitar» la saca (y libera su hueco).
  const handleToggleExcludeCard = (id: string) => {
    for (const thread of doubts) {
      const turn = thread.turns.find(x => x.saved && doubtCardId(thread, x) === id);
      if (turn) { handleDoubtChange(updateDoubtTurn(thread, turn.at, null)); return; }
    }
    setContent(prev => prev ? { ...prev, ankiCards: prev.ankiCards.map(c => c.id === id ? { ...c, excluded: !c.excluded } : c) } : prev);
  };

  // Las tarjetas de refuerzo recién creadas pasan al contenido (una sola vez)
  // para que la vista previa y las exclusiones operen sobre un único origen.
  useEffect(() => {
    if (!content) return;
    const missing = reinforcePlan.filter(p => !content.ankiCards.some(c => c.id === p.id));
    if (missing.length === 0) return;
    setContent(prev => prev ? { ...prev, ankiCards: [...missing, ...prev.ankiCards] } : prev);
  }, [reinforcePlan, content]);

  // ── §5b: dudas frente al mazo ─────────────────────────────────────────────
  // Mismo frente = mismo GUID en Anki = una nota pisaría a la otra: una duda no
  // puede guardar una tarjeta que ya está en el mazo (de IA, de refuerzo o de duda).
  const deckFrontKeys = new Set(allCardsWithReinforce.filter(c => !c.excluded).map(c => cardFrontKey(c.front)));
  const isInDeck = (front: string) => deckFrontKeys.has(cardFrontKey(front));
  const renderDoubtPanel = (ctx: LessonDoubtContext) => {
    const key = doubtThreadId(ctx.kind, ctx.anchor);
    if (!doubtsAvailable || openDoubtKey !== key) return null;
    return (
      <LessonDoubtPanel
        key={key}
        ctx={ctx}
        thread={doubts.find(t => t.id === key) ?? null}
        savedCount={savedDoubts}
        isInDeck={isInDeck}
        getTranscript={getDoubtTranscript}
        demoAnswer={doubtDemo?.answerFor ?? null}
        onChange={handleDoubtChange}
        onClose={() => setOpenDoubtKey(null)}
      />
    );
  };
  // Última oportunidad (Fijar): respuestas con tarjeta propuesta que no se
  // guardaron — sin repetir frentes ni los que ya están en el mazo.
  const unsavedDoubtProposals = (() => {
    const seen = new Set<string>();
    return doubts.flatMap(thread => thread.turns
      .filter(turn => turn.card && !turn.saved && !turn.outside)
      .map(turn => ({ thread, turn })))
      .filter(({ turn }) => {
        const key = cardFrontKey(turn.card?.front ?? "");
        if (!key || seen.has(key) || deckFrontKeys.has(key)) return false;
        seen.add(key);
        return true;
      });
  })();
  const addDoubtCardFromFijar = (thread: LessonDoubtThread, at: number) => {
    const turn = thread.turns.find(x => x.at === at);
    if (!turn?.card || savedDoubts >= MAX_DOUBT_CARDS || isInDeck(turn.card.front)) return;
    const snapshot = snapshotDoubtCard(turn);
    if (snapshot) handleDoubtChange(updateDoubtTurn(thread, at, snapshot));
  };

  // ── §1.4: «Terminar lección» — siempre disponible, sin exportar ───────────
  const handleFinishLesson = () => {
    if (finishedAt) return;
    const now = Date.now();
    setFinishedAt(now);
    // «Guardar automáticamente» en Obsidian: al terminar (la nota ya lleva todo)
    // y dentro de este clic (Chrome exige un gesto para abrir Obsidian). Si la
    // lección ya tenía nota, se le añade el repaso de hoy (no se pisa).
    if (obsidianCfg.autoExport && obsidianCfg.vaultName.trim()) {
      const data = getObsidianSessionData();
      if (data) {
        if (isSessionExported(exportedNotesRef.current, obsidianCfg, courseName, lessonName)) doExportObsidianUpdate(data);
        else void doExportObsidian(data, true);
      }
    }
    const guids = allCardsWithReinforce.filter(c => !c.excluded).map(c => stableAnkiGuid(courseName, lessonName, c));
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      finishedAt: now,
      status: "completed",
      focusStep: 3,
      questionsDone: questionsComplete || undefined,
      questionsSkipped: questionsSkipped || undefined,
      practiceStatus: practiceStatus ?? "later",
      recallNotes: recallNotes.trim() || undefined,
      ankiCards: allCardsWithReinforce.map(c => ({
        id: c.id, front: c.front, back: c.back, tags: c.tags, type: c.type,
        conceptRefs: c.conceptRefs, reinforce: c.reinforce, excluded: c.excluded,
        doubt: c.doubt, isHtml: c.isHtml,
      })),
      ankiCardsCount: allCardsWithReinforce.filter(c => !c.excluded).length,
      // Lo realmente exportado (no lo añadido después, p. ej. una tarjeta de duda).
      exportedGuids: lastExportGuids ?? (ankiExported || obsidianExportedAt ? guids : undefined),
    }).catch(err => console.error("[history] finish", err));
    // XP de cierre + la ÚNICA celebración grande, con nivel/logros dentro.
    if (!sessionCelebratedRef.current) {
      sessionCelebratedRef.current = true;
      celebrate({
        type: "session_complete",
        rewardKey: `session::${slugify(courseName)}::${slugify(lessonName)}`,
        title: resultTitle,
        subtitle: lessonName ? `«${lessonName}» · ${practiceLabel === "pendiente" ? "práctica pendiente" : `práctica ${practiceLabel}`}` : undefined,
        icon: <Icon name="graduation" size={24} />,
        mergeFollowUps: true,
        levelUp: pendingLevelUp,
        unlockedTitles: pendingUnlocked,
      });
    }
    // Sin saltar arriba: solo lo justo para que «Ir a la siguiente lección» (que aparece
    // debajo de «Lección terminada») quede entero a la vista.
    setTimeout(() => nextLessonRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 350);
  };

  // «Ir a la siguiente lección»: pide a Udemy (content script) que pase de video; al
  // cambiar la lección abierta, Study abre la nueva directamente (sin la tarjeta intermedia).
  const handleGoNextLesson = () => {
    if (nextLessonStatus === "going") return;
    setNextLessonStatus("going");
    pendingNextLessonRef.current = lessonName;
    let settled = false;
    const cleanup = contentBridge.onMessageFromContent((message: BridgeMessage) => {
      if (message.type !== "NEXT_LECTURE_RESULT") return;
      settled = true;
      cleanup();
      const ok = Boolean((message.payload as { ok?: boolean } | undefined)?.ok);
      if (!ok) { pendingNextLessonRef.current = null; setNextLessonStatus("failed"); }
    });
    void contentBridge.sendToContent({ type: "GO_TO_NEXT_LECTURE" });
    window.setTimeout(() => {
      if (!settled) cleanup();
      // Sin respuesta o sin cambio de lección: se dice, no se queda girando.
      if (pendingNextLessonRef.current !== null) { pendingNextLessonRef.current = null; setNextLessonStatus("failed"); }
    }, 8000);
  };

  // duplicate allStepsComplete effect removed — first useEffect above handles chord + scroll

  // El botón de historial de las pestañas (ExtensionSidebar) abre el historial.
  useEffect(() => {
    const open = () => setHistoryOpen(true);
    const toggle = () => setHistoryOpen(v => !v);
    const close = (e: Event) => { if ((e as CustomEvent<{ open: boolean }>).detail?.open) setHistoryOpen(false); };
    window.addEventListener("usb:open-history", open);
    window.addEventListener("usb:toggle-history", toggle);
    window.addEventListener("usb:settings-open", close);
    return () => {
      window.removeEventListener("usb:open-history", open);
      window.removeEventListener("usb:toggle-history", toggle);
      window.removeEventListener("usb:settings-open", close);
    };
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("usb:history-open", { detail: { open: historyOpen } }));
    if (!historyOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHistoryOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  // ── Render ────────────────────────────────────────��─────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">

      {/* ── History drawer ── */}
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.div
              key="hist-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setHistoryOpen(false)}
              className="absolute inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
            />
            <motion.div
              key="hist-drawer"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="absolute inset-y-0 right-0 z-50 w-[88%] max-w-[360px] bg-[var(--usb-bg-1)] border-l border-[var(--usb-border)] shadow-2xl flex flex-col"
            >
              {/* Misma cabecera que DockSheet (Configuración / Nivel). */}
              <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-[var(--usb-divider)] shrink-0">
                <div className="min-w-0 flex-1">
                  <span className="kx-slate block" style={{ color: t("#b7a6ff", "#5b37e8") }}>Estudio</span>
                  <h3 className="mt-1 text-[16px] font-extrabold tracking-tight leading-tight text-[var(--usb-fg-hi)] truncate">Historial</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Cerrar historial"
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <HistoryPanel
                  onExportLesson={async rec => { await exportApkgFile((rec.ankiCards ?? []).filter(card => !card.excluded).map(card => ({ ...card, tags: card.tags ?? [], type: card.type ?? "concept" })) as unknown as AnkiCard[], rec.courseName, rec.lectureName, vocabCfg.rootDeck); }}
                  hideToggle
                  defaultOpen
                  onOpenLecture={(rec) => {
                    setCourseName(rec.courseName);
                    setLessonName(rec.lectureName);
                    setHistoryOpen(false);
                    // Estado limpio + rehidratación de la lección elegida (sin arrastrar la anterior).
                    openLessonInStudy();
                  }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <VocabularyPanel compact mount={vocabularyMount} course={courseName} lesson={lessonName} config={vocabCfg} onConfig={handleSaveVocabCfg} generate={generateVocabularyCandidates} aiReady={aiReady} aiNotice={aiBlockedMessage(aiState, aiEndpoint)} />

      <AnimatePresence mode="wait">

        {/* ══ OBJECTIVE ══ */}
        {phase === "objective" && (
          <motion.div key="obj" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}
            className="kx-study flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

            {/* Hero header */}
            <div className="kx-hero-solid relative overflow-hidden rounded-2xl p-4.5">
              <span className="kx-ring kx-ring-1" aria-hidden="true" />
              <span className="kx-ring kx-ring-2" aria-hidden="true" />
              <Icon name="sparkles" size={16} weight="duotone" className="kx-spark kx-spark-a" />
              <Icon name="star" size={12} weight="fill" className="kx-spark kx-spark-b" />
              <Icon name="sparkles" size={12} weight="duotone" className="kx-spark kx-spark-c" />
              <div className="relative flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="kx-hero-chip w-7 h-7 rounded-xl flex items-center justify-center">
                    <Icon name="brain" size={18} weight="duotone" />
                  </div>
                  <span className="kx-hero-t2 text-[11px] font-bold tracking-wider uppercase">Estudio</span>
                </div>
                <span className="kx-hero-chip text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <span className="kx-live-dot" />Kinema AI
                </span>
              </div>
              <p className="kx-hero-t1 relative text-[21px] font-extrabold tracking-tight leading-tight">
                Aprende y domina cada clase
              </p>
              <p className="kx-hero-t2 relative text-[12px] leading-relaxed mt-1.5">
                Evaluaciones interactivas por lección y tarjetas inteligentes de retención con Anki.
              </p>
              <div className="relative flex flex-wrap gap-1.5 mt-3.5">
                {([["steps", "4 pasos"], ["timer", "~5–15 min"], ["zap", "+XP por clase"]] as const).map(([ic, label]) => (
                  <span key={label} className="kx-hero-chip text-[10.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <Icon name={ic} size={13} weight="duotone" />{label}
                  </span>
                ))}
              </div>
            </div>


            {/* Objectives — AI-generated per course, with fold-don't-hide disclosure */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionTitle icon="target" hue={0}>¿Para qué estudias esto?</SectionTitle>
                {(dynamicObjectives || objectivesMock || objectivesError) && (
                  <button onClick={handleRegenerateObjectives} disabled={objectivesLoading || !aiReady}
                    title={!aiReady ? aiBlockedMessage(aiState, aiEndpoint) : undefined}
                    className="kx-chip h-7 px-2.5 rounded-full disabled:cursor-wait text-[10.5px] font-semibold flex items-center gap-1.5 transition-colors">
                    {objectivesLoading
                      ? <><Loader2 size={11} className="animate-spin"/>Regenerando…</>
                      : <><Sparkles size={11}/>Regenerar</>}
                  </button>
                )}
              </div>

              {objectivesLoading && !dynamicObjectives && (
                <div className="grid grid-cols-2 gap-2">
                  {[0,1,2,3].map(i => (
                    <div key={i} className="h-[88px] rounded-2xl bg-[var(--usb-bg-3)] border border-[var(--usb-border)]"/>
                  ))}
                </div>
              )}

              {!objectivesLoading && !dynamicObjectives && !courseName.trim() && (
                <div className="rounded-2xl bg-[var(--usb-bg-3)] border border-dashed border-[var(--usb-border)] p-4 text-center">
                  <p className="text-[var(--usb-fg-mid)] text-[12px] font-medium">Escribe el nombre del curso abajo para generar objetivos a medida.</p>
                </div>
              )}

              {!objectivesLoading && !dynamicObjectives && courseName.trim() && (objectivesMock || objectivesError) && (
                <div className="rounded-2xl bg-[color-mix(in_srgb,#d97706_9%,var(--usb-bg-3))] border border-[#d97706]/35 p-3.5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,#d97706_18%,var(--usb-bg-3))] border border-[#d97706]/40 flex items-center justify-center shrink-0">
                    <Sparkles size={15} style={{ color: t("#fbbf45", "#a15207") }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[var(--usb-fg-hi)] text-[12px] leading-snug font-bold">
                      Objetivos de ejemplo
                    </p>
                    <p className="text-[var(--usb-fg-mid)] text-[11px] font-medium mt-0.5 leading-relaxed">
                      {humanizeObjectivesError(objectivesError)}
                    </p>
                    <button onClick={handleRegenerateObjectives}
                      className="kx-chip mt-2.5 h-8 px-3 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all">
                      <Sparkles size={12}/>Generar de nuevo
                    </button>
                  </div>
                </div>
              )}

              {dynamicObjectives && (() => {
                const objs = dynamicObjectives;
                const heroId = lastUsedObjectiveId ?? (objs.some(o => o.id === selectedObj) ? selectedObj : null);
                const hero = heroId ? objs.find(o => o.id === heroId) : null;
                const showHero = hero && !objectivesExpanded;

                if (showHero) {
                  const active = selectedObj === hero.id;
                  return (
                    <div className="space-y-2">
                      <button onClick={() => { setSelectedObj(hero.id); setCustomObj(""); setRefinedObj(""); }}
                        className={`kx-obj relative w-full text-left p-3.5 rounded-2xl border transition-all overflow-hidden ${active ? "" : "bg-[var(--usb-bg-3)] border-[var(--usb-border)] hover:bg-[var(--usb-accent-soft)]"}`}
                        data-on={active ? "1" : "0"}
                        style={{ "--kx-step": STEP_META[0].hue, "--kx-ink": t(STEP_META[0].inkDark, STEP_META[0].inkLight) } as React.CSSProperties}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={`kx-obj-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-xl`}><Glyph name={hero.icon} size={20} /></span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <p className="text-[13px] font-bold tracking-tight text-[var(--usb-fg-hi)] leading-tight">{hero.title}</p>
                              {active && <CheckCircle2 size={12} className="text-[var(--kx-ink)] shrink-0"/>}
                            </div>
                            <p className="text-[11.5px] font-medium text-[var(--usb-fg-mid)]">{hero.sub}</p>
                            <p className="kx-slate mt-2 flex items-center gap-1"><History size={10}/>Tu enfoque actual en este curso</p>
                          </div>
                        </div>
                      </button>
                      <button onClick={() => setObjectivesExpanded(true)}
                        className="kx-chip w-full h-9 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1.5">
                        Cambiar enfoque <ChevronDown size={12}/>
                      </button>
                    </div>
                  );
                }

                const gridKey = `${objectivesRegenCount}-${objs.map(o => o.id).join("|")}`;
                return (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-xl">
                      {/* Sweep shimmer that crosses the grid on every regenerate */}
                      <AnimatePresence>
                        {objectivesLoading && objectivesRegenCount > 0 && (
                          <motion.div key={`sweep-${objectivesRegenCount}`}
                            initial={{ left: "-40%", opacity: 0 }}
                            animate={{ left: "100%", opacity: 0.6 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.9, ease: "easeInOut" }}
                            className="pointer-events-none absolute inset-y-0 w-1/4 z-10 bg-[#6d4aff]/20 blur-sm"/>
                        )}
                      </AnimatePresence>

                      <AnimatePresence mode="wait">
                        <motion.div key={gridKey}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="grid grid-cols-2 gap-2.5">
                          {objs.map((obj, i) => {
                            const active = selectedObj === obj.id;
                            const om = STEP_META[i % STEP_META.length];
                            return (
                              <motion.button key={obj.id}
                                data-on={active ? "1" : "0"}
                                style={{ "--kx-step": om.hue, "--kx-ink": t(om.inkDark, om.inkLight) } as React.CSSProperties}
                                initial={{ opacity: 0, y: 12, scale: 0.92 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{
                                  delay: i * 0.08,
                                  type: "spring",
                                  stiffness: 300,
                                  damping: 22,
                                }}
                                onClick={() => { setSelectedObj(obj.id); setCustomObj(""); setRefinedObj(""); }}
                                className={`kx-obj relative text-left p-3.5 rounded-2xl border transition-colors overflow-hidden ${active ? "" : "bg-[var(--usb-bg-3)] border-[var(--usb-border)] hover:border-[#6d4aff]/50"}`}>
                                {active && <div className="kx-obj-check absolute top-2 right-2 z-10 w-4 h-4 rounded-full flex items-center justify-center"><Check size={10} strokeWidth={3}/></div>}
                                <motion.span
                                  initial={{ rotate: -18, scale: 0.6, opacity: 0 }}
                                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                                  transition={{ delay: i * 0.08 + 0.12, type: "spring", stiffness: 260, damping: 16 }}
                                  className="kx-obj-tile relative mb-2 flex h-8 w-8 items-center justify-center rounded-xl"><Glyph name={obj.icon} size={17} /></motion.span>
                                <motion.p
                                  initial={{ opacity: 0, x: -4 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.3, delay: i * 0.08 + 0.18 }}
                                  className="relative text-[12px] leading-tight font-bold tracking-tight text-[var(--usb-fg-hi)]">{obj.title}</motion.p>
                                <motion.p
                                  initial={{ opacity: 0, x: -4 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.3, delay: i * 0.08 + 0.24 }}
                                  className="kx-obj-sub relative text-[10.5px] font-medium mt-1 leading-snug">{obj.sub}</motion.p>
                              </motion.button>
                            );
                          })}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    {objectivesMock && (
                      <div className="rounded-xl bg-[color-mix(in_srgb,#d97706_9%,var(--usb-bg-3))] border border-[#d97706]/35 px-3 py-2 flex items-start gap-2">
                        <Sparkles size={12} className="mt-px shrink-0" style={{ color: t("#fbbf45", "#a15207") }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--usb-fg-hi)] text-[11px] font-semibold leading-snug">
                            {humanizeObjectivesError(objectivesError)}
                          </p>
                          <p className="text-[var(--usb-fg-mid)] text-[10.5px] font-medium mt-0.5">
                            Son objetivos de ejemplo: Kinema no pudo generarlos para este curso.
                          </p>
                        </div>
                      </div>
                    )}
                    {hero && objectivesExpanded && (
                      <button onClick={() => setObjectivesExpanded(false)}
                        className="w-full h-8 rounded-lg text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors">
                        <ChevronDown size={12} className="rotate-180"/> Volver al enfoque actual
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>


            {/* §1.5: para quien vuelve, el objetivo propio va plegado */}
            {returningMode && !showCustomObjFold && (
              <button onClick={() => setShowCustomObjFold(true)}
                className="kx-chip w-full h-9 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1.5">
                Objetivo propio <ChevronDown size={12}/>
              </button>
            )}

            {/* Custom objective */}
            {(() => {
              if (returningMode && !showCustomObjFold) return null;
              const isCustomActive = selectedObj === "custom" && customObj.trim().length > 0;
              const textChangedSinceRefine = refinedObj && customObj.trim() !== refinedFromText.trim();
              const fallbackId = dynamicObjectives?.[0]?.id ?? lastUsedObjectiveId ?? (IS_EXTENSION ? "" : "spring-senisenior");
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <SectionTitle icon="edit3" hue={1}>O escribe tu propio objetivo</SectionTitle>
                    {isCustomActive && (
                      <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="text-[10.5px] font-semibold flex items-center gap-1 bg-[#6d4aff]/15 border border-[#6d4aff]/35 rounded-full px-2.5 py-0.5" style={{ color: t("#b7a6ff", "#5b37e8") }}>
                        <CheckCircle2 size={11}/>Activo
                      </motion.span>
                    )}
                  </div>
                  <textarea value={customObj}
                    onChange={e => {
                      const v = e.target.value;
                      setCustomObj(v);
                      if (v.trim()) setSelectedObj("custom");
                      else { setSelectedObj(fallbackId); setRefinedObj(""); setRefinedFromText(""); }
                    }}
                    placeholder="Ej: Conseguir trabajo en fintech como Java dev en 3 meses…"
                    className={`kx-field w-full h-[74px] text-[12px] rounded-xl bg-[var(--usb-bg-3)] border ${isCustomActive ? "border-[#6d4aff]/60 ring-2 ring-[#6d4aff]/20" : "border-[var(--usb-border)]"} text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-fg-mid)] px-4 py-3 resize-none outline-none focus:border-[#6d4aff]/60 focus:ring-2 focus:ring-[#6d4aff]/20 transition-colors leading-relaxed`}/>

                  <AnimatePresence mode="wait">
                    {/* No refined version yet → primary CTA */}
                    {customObj.trim() && !refinedObj && (
                      <motion.button key="refine-cta" initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        onClick={handleRefine} disabled={isRefining || !aiReady}
                        title={!aiReady ? aiBlockedMessage(aiState, aiEndpoint) : undefined}
                        className="kx-chip w-full h-10 rounded-2xl disabled:cursor-wait text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all">
                        {isRefining ? <><Loader2 size={11} className="animate-spin"/>Refinando…</> : <><Sparkles size={12}/>Refinar con Kinema</>}
                      </motion.button>
                    )}

                    {/* Refined card */}
                    {refinedObj && (
                      <motion.div key="refined-card" initial={{ opacity: 0, y: 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                        className="space-y-2">
                        <div className={`relative rounded-2xl p-3.5 border transition-all ${isCustomActive ? "bg-[#6d4aff]/14 border-[#6d4aff]/45" : "bg-[#6d4aff]/7 border-[#6d4aff]/25"}`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Sparkles size={12} style={{ color: t("#b7a6ff", "#5b37e8") }}/>
                            <span className="kx-slate">Objetivo refinado</span>
                            {isCustomActive && <CheckCircle2 size={13} className="ml-auto text-[#059669]"/>}
                          </div>
                          <p className="text-[12.5px] text-[var(--usb-fg-hi)] leading-relaxed font-medium pr-5">{refinedObj}</p>
                          <p className="text-[11px] text-[var(--usb-fg-mid)] mt-1.5 italic line-clamp-1">Basado en: "{refinedFromText}"</p>
                          <button onClick={() => { setRefinedObj(""); setRefinedFromText(""); }}
                            className="absolute top-2.5 right-2.5 text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg)] transition-colors" title="Descartar refinamiento">
                            <X size={12}/>
                          </button>
                        </div>

                        <div className="flex gap-2">
                          {textChangedSinceRefine ? (
                            <button onClick={handleRefine} disabled={isRefining}
                              className="kx-chip flex-1 h-9 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1 transition-all">
                              {isRefining ? <><Loader2 size={11} className="animate-spin"/>Refinando…</> : <><Sparkles size={11}/>Refinar texto nuevo</>}
                            </button>
                          ) : (
                            <button onClick={handleRefine} disabled={isRefining}
                              className="kx-chip flex-1 h-9 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1 transition-all"
                              title="Pide a Kinema otra versión del mismo texto">
                              {isRefining ? <><Loader2 size={11} className="animate-spin"/>Generando…</> : <><RotateCcw size={11}/>Otra variante</>}
                            </button>
                          )}
                          <button onClick={() => { setCustomObj(refinedObj); setRefinedFromText(refinedObj); setSelectedObj("custom"); }}
                            className="kx-chip flex-1 h-9 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1 transition-all"
                            title="Reemplaza tu texto por la versión refinada">
                            <Wand2 size={11}/>Usar como mi texto
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })()}

            {/* §1.5: para quien vuelve, los datos del curso van plegados */}
            {returningMode && !showCourseFields && (
              <button onClick={() => setShowCourseFields(true)}
                className="kx-chip w-full h-9 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1.5">
                Editar curso o lección <ChevronDown size={12}/>
              </button>
            )}

            {/* Course info */}
            {!returningMode || showCourseFields ? (
            <div className="space-y-3">
              <SectionTitle icon="bookOpen" hue={2}>Datos del curso</SectionTitle>
              <input value={courseName} onChange={e => { setCourseName(e.target.value); courseNameEditedRef.current = true; }} placeholder="Nombre del curso (para mazo Anki)"
                className={fieldCls}/>
              <input value={lessonName} onChange={e => setLessonName(e.target.value)} placeholder="Nombre del video/clase actual"
                className={fieldCls}/>
              {/* Programa (career track): solo existe en sitios con programas
                  (DataCamp). La elección viaja por storage y el content script
                  trae los datos; el flujo de estudio no cambia. */}
              {dcCtx?.tracks?.length ? (
                <div className="space-y-1.5">
                  <select value={dcCtx.activeSlug ?? ""} onChange={e => { void chromeStorage.set({ dc_active_track: e.target.value || null }); }}
                    className={fieldCls} aria-label="Programa al que pertenece este curso">
                    <option value="">Sin programa (solo este curso)</option>
                    {dcCtx.tracks.map(t => <option key={t.slug} value={t.slug}>{t.title}</option>)}
                  </select>
                  {dcCtx.program ? (() => {
                    const p = dcCtx.program;
                    const idx = p.courses.findIndex(c => c.id === dcCtx.courseId);
                    const pct = p.completionRate !== null ? Math.round(p.completionRate * 100) : null;
                    return (
                      <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)] px-1">
                        Programa: <span className="font-semibold text-[var(--usb-fg-hi)]">{p.title}</span>
                        {idx >= 0 ? ` · curso ${idx + 1} de ${p.courses.length}` : ""}
                        {pct !== null ? ` · ${pct}% del programa` : ""}
                      </p>
                    );
                  })() : null}
                </div>
              ) : null}
              <textarea value={courseDescription} onChange={e => setCourseDescription(e.target.value)}
                placeholder="Descripción breve del curso (ayuda a Kinema a proponer mejores objetivos)"
                className={`${textareaCls} h-[74px] custom-scrollbar-thin`}/>
            </div>
            ) : null}

            {/* §1.5: indicador de transcripción REAL (nada de texto fijo) */}
            <div className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-3 ${
              transcriptState.status === "ready"
                ? "kx-ok-strip"
                : "border border-[var(--usb-border)] bg-[var(--usb-bg-2)]"
            }`}>
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                transcriptState.status === "ready" ? "kx-ok-tile" : "bg-[var(--usb-bg-4)] text-[var(--usb-fg-mid)]"
              }`}><Icon name="fileText" size={17} weight="duotone"/></span>
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-[var(--usb-fg-hi)] leading-tight">
                  {transcriptState.status === "ready"
                    ? transcriptState.article ? "Texto de la lección listo" : "Subtítulos listos"
                    : transcriptState.status === "waiting"
                      ? "Esperando subtítulos"
                      : transcriptState.status === "none"
                        ? "Sin subtítulos en esta lección"
                        : transcriptState.status === "unsupported"
                          ? "Lección sin video ni texto"
                          : transcriptState.status === "preview"
                            ? "Vista previa sin extensión"
                            : "Comprobando la lección…"}
                </p>
                <p className="text-[10.5px] text-[var(--usb-fg-mid)] font-medium">
                  {transcriptState.status === "waiting"
                    ? "Activa los subtítulos en inglés en el video"
                    : transcriptState.status === "ready"
                      ? "Listo para analizar"
                      : transcriptState.status === "none"
                        ? "Activa los subtítulos en inglés y vuelve a comprobar"
                        : transcriptState.status === "unsupported"
                          ? "Es un cuestionario o ejercicio: complétalo en Udemy"
                          : transcriptState.status === "preview"
                            ? "Se usará una sesión de ejemplo"
                            : "Un momento…"}
                </p>
              </div>
              {transcriptState.status === "ready" && transcriptState.cues ? (
                <span className="kx-ok-pill text-[11px] font-bold tabular-nums ml-auto px-2.5 py-1 rounded-full">
                  {transcriptState.cues} {transcriptState.article ? "párrafos" : "líneas"}
                </span>
              ) : transcriptState.status === "none" ? (
                <button type="button" onClick={() => { setTranscriptState({ status: "checking", cues: null }); setTranscriptRecheck(n => n + 1); }}
                  className="kx-chip ml-auto shrink-0 h-7 px-2.5 rounded-full text-[10.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
                  Volver a comprobar
                </button>
              ) : null}
            </div>

            {/* §1.5: repasos pendientes del curso — la fila discreta que faltaba */}
            {courseDueCount != null && courseDueCount > 0 && (
              <button onClick={() => handleOpenAnkiDue("course")}
                className="w-full flex items-center gap-2.5 rounded-2xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-3.5 py-2.5 text-left hover:border-[#6d4aff]/40 transition-colors">
                <Icon name="repeat2" size={15} weight="duotone" className="text-amber-400 shrink-0" />
                <span className="flex-1 min-w-0 text-[11.5px] font-semibold text-[var(--usb-fg-hi)]">
                  {courseDueCount} {courseDueCount === 1 ? "tarjeta de este curso para repasar hoy" : "tarjetas de este curso para repasar hoy"}
                </span>
                <span className="shrink-0 text-[10.5px] font-bold flex items-center gap-1" style={{ color: t("#b7a6ff", "#5b37e8") }}>
                  Abrir en Anki <ArrowRight size={11} />
                </span>
              </button>
            )}

            {/* Preview de los 4 pasos: una línea para quien vuelve */}
            {returningMode ? (
              <p className="kx-slate text-center text-[11px] font-semibold tracking-wide">
                {STEP_META.map(m => m.short).join(" · ")}
              </p>
            ) : (
            <div className="kx-card rounded-2xl p-4 space-y-3.5" style={{ "--kx-step": STEP_META[0].hue } as React.CSSProperties}>
            <p className="kx-slate">Tu recorrido · 4 pasos</p>
            <div className="relative grid grid-cols-4 gap-1.5">
              <span className="absolute left-[12%] right-[12%] top-5 h-px bg-[var(--usb-border)]" aria-hidden="true" />
              {STEP_META.map((m, i) => (
                <div key={i} className="group flex flex-col items-center gap-2 min-w-0" style={{ "--kx-step": m.hue, "--kx-ink": t(m.inkDark, m.inkLight) } as React.CSSProperties}>
                  <span className="relative w-10 h-10 rounded-xl flex items-center justify-center border transition-transform duration-200 group-hover:-translate-y-0.5"
                    style={{ background: `color-mix(in srgb, ${m.hue} 20%, var(--usb-bg-3))`, borderColor: `color-mix(in srgb, ${m.hue} 45%, var(--usb-border))`, color: t(m.inkDark, m.inkLight), boxShadow: `0 6px 12px -8px ${m.hue}` }}>
                    <Icon name={m.icon} size={19} weight="duotone" />
                  </span>
                  <span className="text-[10.5px] font-bold tracking-tight text-[var(--usb-fg-hi)] leading-none truncate max-w-full">
                    {m.short}
                  </span>
                </div>
              ))}
            </div>
            </div>
            )}

            {/* Generate CTA */}
            <button onClick={handleGenerate}
              disabled={!hasUsableObjective || !hasCourseContext || transcriptBlocksCta || !aiReady}
              className="kx-gen-cta w-full h-12 rounded-2xl disabled:cursor-not-allowed text-[12.5px] font-bold flex items-center justify-center gap-2 transition-all">
              <Icon name="sparkles" size={17} weight="duotone"/>{returningMode ? "Empezar" : "Generar sesión de aprendizaje"} · ~5–15 min
              <ArrowRight size={14}/>
            </button>
            {(!hasCourseContext || !hasUsableObjective || transcriptBlocksCta || !aiReady) && (
              <p className="text-[11px] text-[var(--usb-fg-mid)] text-center leading-relaxed">
                {!hasCourseContext
                  ? "Escribe el nombre del curso y de la lección para empezar."
                  : !hasUsableObjective
                    ? "Elige o escribe un objetivo para empezar."
                    : !aiReady
                      ? aiBlockedMessage(aiState, aiEndpoint)
                    : transcriptState.status === "unsupported"
                      ? "Kinema estudia lecciones de video o de texto. Pasa a la siguiente lección cuando termines esta."
                      : "Sin transcripción todavía — activa los subtítulos en inglés o reintenta."}
              </p>
            )}
          </motion.div>
        )}

        {/* ══ GENERATING ══ */}
        {phase === "generating" && (
          <motion.div key="gen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
            className="kx-study flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
            {(() => {
              const cur = STEP_META[Math.min(genStep, STEP_META.length - 1)];
              return (
                <>
                  <div className="kx-hero-solid relative overflow-hidden rounded-2xl p-4.5">
                    <span className="kx-ring kx-ring-1" aria-hidden="true" />
                    <span className="kx-ring kx-ring-2" aria-hidden="true" />
                    <div className="relative flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="kx-hero-chip w-7 h-7 rounded-xl flex items-center justify-center">
                          <Icon name="brain" size={18} weight="duotone" />
                        </div>
                        <span className="kx-hero-t2 text-[11px] font-bold tracking-wider uppercase">Estudio</span>
                      </div>
                      <span className="kx-hero-chip text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <span className="kx-live-dot" />Generando…
                      </span>
                    </div>
                    <p className="kx-hero-t1 relative text-[21px] font-extrabold tracking-tight leading-tight">Preparando tu sesión</p>
                    <p className="kx-hero-t2 relative text-[12px] leading-relaxed mt-1.5">Calibrando conceptos y práctica personalizada</p>
                  </div>

                  <div className="kx-card rounded-2xl p-2 space-y-0.5" style={{ "--kx-step": cur.hue } as React.CSSProperties}>
                    {GEN_STEPS.map((label, i) => {
                      // GEN_STEPS son estados, no pasos: el color cicla el set de 4.
                      const m = STEP_META[i % STEP_META.length];
                      const st = i < genStep ? "done" : i === genStep ? "now" : "todo";
                      return (
                        <div key={label} style={{ "--kx-step": m.hue, "--kx-ink": t(m.inkDark, m.inkLight) } as React.CSSProperties}
                          className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors duration-300 ${st === "now" ? "bg-[var(--usb-bg-2)]" : ""} ${st === "todo" ? "opacity-55" : ""}`}>
                          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300"
                            style={{
                              background: `color-mix(in srgb, ${m.hue} ${st === "todo" ? 12 : 20}%, var(--usb-bg-3))`,
                              borderColor: `color-mix(in srgb, ${m.hue} ${st === "now" ? 70 : 45}%, var(--usb-border))`,
                              color: t(m.inkDark, m.inkLight),
                              boxShadow: st === "now" ? `0 0 0 3px color-mix(in srgb, ${m.hue} 18%, transparent), 0 6px 12px -8px ${m.hue}` : st === "done" ? `0 6px 12px -8px ${m.hue}` : "none",
                            }}>
                            {st === "done" ? <Check size={17} strokeWidth={3} /> : st === "now" ? <Loader2 size={17} className="animate-spin" /> : <Icon name={m.icon} size={19} weight="duotone" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="kx-slate">{st === "done" ? "Listo" : st === "now" ? "En curso" : "En cola"}</p>
                            <p className={`truncate text-[12.5px] mt-0.5 ${st === "now" ? "font-bold text-[var(--usb-fg-hi)]" : "font-medium text-[var(--usb-fg-mid)]"}`}>{label}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}

        {/* ══ RESULT ══ */}
        {phase === "result" && content && (
          <motion.div key="result" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}
            ref={scrollRef} className="kx-study flex-1 overflow-y-auto custom-scrollbar" style={{ "--kx-step": STEP_META[focusStep].hue, "--kx-btn": t(STEP_META[focusStep].inkLight, STEP_META[focusStep].inkLight), "--kx-ink": t(STEP_META[focusStep].inkDark, STEP_META[focusStep].inkLight) } as React.CSSProperties}>

            {/* Sticky header — solid bg (no backdrop-filter) so its text and
                icons stay crisp instead of being rasterized into a blur layer. */}
            <div className="sticky top-0 z-20 bg-[var(--usb-bg-2)] border-b border-[var(--usb-border)] px-4 py-3 relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <BookOpen size={12} className="text-violet-400 shrink-0"/>
                  <span className="text-[11px] font-semibold text-[var(--usb-fg-hi)] truncate">{studySession?.lesson ?? lessonName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {sessionXp > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-semibold tracking-tight">
                      <Zap size={10} className="fill-amber-400 text-amber-400" />
                      +{sessionXp} XP
                    </span>
                  )}
                  {sessionElsewhere ? null : confirmingReset ? (
                    <span ref={confirmGroupRef} role="group" aria-label="Confirmar reinicio" className="inline-flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-[var(--usb-fg-mid)]">¿Borrar respuestas?</span>
                      <button
                        onClick={() => {
                          if (confirmingResetTimerRef.current) clearTimeout(confirmingResetTimerRef.current);
                          setConfirmingReset(false);
                          handleReset();
                        }}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md border border-rose-500/30 text-rose-300 hover:border-rose-500/50 transition-colors"
                      >
                        Sí, reiniciar
                      </button>
                      <button
                        autoFocus
                        onClick={closeResetConfirm}
                        className="text-[10px] font-medium text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] transition-colors"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      ref={resetBtnRef}
                      onClick={() => {
                        setConfirmingReset(true);
                        if (confirmingResetTimerRef.current) clearTimeout(confirmingResetTimerRef.current);
                        confirmingResetTimerRef.current = setTimeout(() => closeResetConfirm(), 5000);
                      }}
                      title="¿Reiniciar? Se borran tus respuestas de esta lección"
                      className="flex items-center gap-1 text-[10px] text-[var(--usb-fg-lo)] hover:text-violet-400 transition-colors font-medium"
                    >
                      <RotateCcw size={10}/>Reiniciar
                    </button>
                  )}
                </div>
              </div>

              {/* Live Level & XP Progress bar (§2: tokens de tema, AA en claro y sepia) */}
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <div className="flex items-center gap-1 text-[9.5px] font-semibold text-[var(--usb-fg-mid)] shrink-0">
                  <span className="font-bold" style={{ color: t("#b7a6ff", "#5b37e8") }}>Nv. {userProgress.level}</span>
                </div>
                <div className="h-1 flex-1 bg-[var(--usb-border)] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 via-amber-400 to-emerald-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(5, (userProgress.into / userProgress.span) * 100))}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <span className="text-[9px] font-mono text-[var(--usb-fg-mid)] tabular-nums shrink-0">
                  {userProgress.into}/{userProgress.span} XP
                </span>
              </div>

              {!sessionElsewhere && <ProgressStepper steps={steps} focus={focusStep}/>}
            </div>

            <div className="p-4 space-y-4">

              {/* Cambiaste de video en Udemy: esta sesión es de otra lección. Se oculta (para
                  no escribir en la lección equivocada) y se ofrece estudiar la que está abierta. */}
              {sessionElsewhere ? (
                <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-2xl p-4 space-y-3" data-lesson-changed style={{ "--kx-btn": "#6d4aff" } as React.CSSProperties}>
                  <div className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 text-[var(--usb-accent-text)] border-[#6d4aff]/30 bg-[#6d4aff]/10" aria-hidden="true">
                      <Icon name="compass" size={19} weight="duotone" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold leading-snug text-[var(--usb-fg-hi)]">Estás en otra lección</p>
                      <p className="text-[11px] leading-relaxed text-[var(--usb-fg-mid)] mt-1">
                        Ahora tienes abierta «{lessonName}». Tu sesión de «{studySession?.lesson}» quedó guardada en el historial.
                      </p>
                    </div>
                  </div>
                  <StepContinueButton label="Estudiar esta lección" onClick={openLessonInStudy} />
                </div>
              ) : (<>

              {/* ── Relevance bar ── */}
              {/* Solo con estimación real (la plantilla local no inventa una cifra). */}
              {focusStep === 0 && content.relevance.score >= 0 && (
              <div className="kx-card-flat flex items-center gap-2.5 rounded-xl px-3 py-2.5" title={content.relevance.reason}>
                <Icon name="target" size={15} weight="duotone" className="text-emerald-400 shrink-0" />
                <span className="text-[var(--usb-fg-mid)] text-[10.5px] font-semibold shrink-0">Relevancia para tu objetivo</span>
                <div className="h-1.5 flex-1 bg-white/6 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${content.relevance.score}%` }}
                    transition={{ duration: 1, delay: 0.4, ease: "easeOut" }} className="h-full bg-emerald-500 rounded-full"/>
                </div>
                <span className="text-emerald-400 text-[11px] font-bold tabular-nums shrink-0">{content.relevance.score}%</span>
              </div>
              )}
              {focusStep === 0 && content.relevance.score >= 0 && content.relevance.score < 50 && (
                <div className="kx-card-flat flex items-center gap-2.5 rounded-xl px-3 py-2.5">
                  <p className="flex-1 text-[10.5px] text-[var(--usb-fg-mid)] leading-relaxed">
                    Esta lección aporta poco a tu objetivo: puedes ir directo a Comprobar.
                  </p>
                  {stepUnlocked[1] && (
                    <button onClick={handleGoVerify} className="kx-chip shrink-0 h-7 px-2.5 rounded-full text-[10.5px] font-semibold">
                      Ir a Comprobar
                    </button>
                  )}
                </div>
              )}

              {/* ── FOCUS NAV ── */}
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => goToStep(focusStep - 1)} disabled={!canGoPrev}
                  className={`kx-nav-btn flex items-center gap-1 pl-2 pr-3 py-1.5 rounded-full text-[10.5px] font-semibold transition-all ${canGoPrev ? "text-[var(--usb-fg-mid)] hover:bg-[var(--usb-bg-3)] cursor-pointer" : "text-[var(--usb-fg-lo)] opacity-50 cursor-not-allowed"}`}>
                  <ChevronLeft size={13} /> Anterior
                </button>
                <button onClick={handleTopNext} disabled={!canGoNext}
                  title={!canGoNext && focusStep < 3 ? (["Elige qué tan claro te quedó", "Revisa una respuesta o salta este paso", "Intenta la práctica o salta este paso"][focusStep] ?? "") : ""}
                  className={`kx-nav-btn flex items-center gap-1 pl-3 pr-2 py-1.5 rounded-full text-[10.5px] font-semibold transition-all ${canGoNext ? "kx-next cursor-pointer" : "text-[var(--usb-fg-lo)] opacity-50 cursor-not-allowed"}`}>
                  Siguiente <ChevronRight size={13} />
                </button>
              </div>

              {/* ── FOCUS NAV: animated step ── */}
              {/* Al cambiar de paso se empieza arriba: también cuando la salida del paso
                  anterior termina después del reinicio de scroll (p. ej. al llegar a Fijar). */}
              <AnimatePresence custom={focusDir} mode="wait" onExitComplete={() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }}>
              <motion.div key={focusStep} custom={focusDir}
                variants={{
                  enter:  (d: number) => ({ x: d >= 0 ? 56 : -56, opacity: 0, scale: 0.98 }),
                  center: (_d: number) => ({ x: 0, opacity: 1, scale: 1 }),
                  exit:   (d: number) => ({ x: d >= 0 ? -56 : 56, opacity: 0, scale: 0.98 }),
                }}
                initial="enter" animate="center" exit="exit"
                transition={{ type: "spring", stiffness: 380, damping: 34 }}>

              <StepBanner step={focusStep} />

              {/* ── Paso 0 (Recordar): nivel → recuerdo libre → comparar con las ideas clave ── */}
              {focusStep === 0 && (() => {
                const checkedCount = Object.values(conceptsChecked).filter(Boolean).length;
                const total = content.keyConcepts.length;
                const isLocked = questionsComplete; // registrado al completar Comprobar
                const recallOpen = recallRevealed || isLocked || checkedCount > 0 || conceptsAcknowledged;
                const level = confidence ? CONFIDENCE.find(c => c.id === confidence) ?? null : null;
                const showPicker = !level || levelPickerOpen;
                return (
                <div className="space-y-3.5">
                  {/* Nivel: un toque. Elegido, se pliega para que el recuerdo quede a la vista. */}
                  {showPicker || !level ? (
                    <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl p-4" data-level-picker>
                      <StepHeader n={1} label="¿Qué tan claro te quedó la lección?" status={confidence ? "done" : "active"}/>
                      <div className="grid grid-cols-2 gap-2.5">
                      {CONFIDENCE.map(c => {
                        const isSelected = confidence === c.id;
                        return (
                          <motion.button
                            key={c.id}
                            onClick={() => { setLevelPickerOpen(false); if (c.id !== confidence) handleConfidenceChange(c.id); }}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            className={`group relative flex flex-col p-3.5 rounded-2xl border text-left transition-all overflow-hidden ${
                              isSelected
                                ? `${c.bg} ${c.border} ring-1 ${c.ring} shadow-md`
                                : "bg-[var(--usb-bg-3)] border-[var(--usb-border)] hover:border-[var(--usb-border-mid)] hover:bg-[var(--usb-bg-2)]/70 hover:shadow-2xs"
                            }`}>
                            {/* Top indicator row: icono del set propio (sin emoji) */}
                            <div className="flex items-center justify-between w-full mb-3">
                              <span
                                className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs transition-all group-hover:scale-110"
                                style={{
                                  background: `color-mix(in srgb, ${c.color} ${isSelected ? "18%" : "8%"}, var(--usb-bg-3))`,
                                  borderColor: `color-mix(in srgb, ${c.color} ${isSelected ? "40%" : "20%"}, var(--usb-border))`,
                                  color: c.color,
                                }}
                              >
                                <Icon name={c.icon} size={20} weight="duotone" />
                              </span>
                            </div>

                            {/* Label & Description */}
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className={`text-[13px] leading-tight font-bold transition-colors ${isSelected ? c.label_c : "text-[var(--usb-fg-hi)]"}`}>
                                  {c.label}
                                </p>
                                {isSelected && (
                                  <CheckCircle2 size={13} className={`${c.label_c} shrink-0`} />
                                )}
                              </div>
                              <p className="text-[11px] text-[var(--usb-fg-mid)] mt-1 font-medium leading-snug">
                                {c.desc}
                              </p>
                            </div>
                          </motion.button>
                        );
                      })}
                      </div>
                    </div>
                  ) : (
                    <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl px-3.5 py-3 flex items-center gap-3" data-level-summary>
                      <span
                        className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
                        style={{
                          background: `color-mix(in srgb, ${level.color} 14%, var(--usb-bg-3))`,
                          borderColor: `color-mix(in srgb, ${level.color} 36%, var(--usb-border))`,
                          color: level.color,
                        }}
                        aria-hidden="true"
                      >
                        <Icon name={level.icon} size={18} weight="duotone" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-[var(--usb-fg-hi)] leading-tight">Te quedó: {level.label}</p>
                        <p className="text-[10.5px] text-[var(--usb-fg-mid)] leading-snug mt-0.5">{COACH_LINE[level.id].tip}</p>
                      </div>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => setLevelPickerOpen(true)}
                          className="h-7 px-2.5 rounded-lg border border-[var(--usb-border)] text-[10.5px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:border-[var(--usb-border-mid)] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
                        >
                          Cambiar
                        </button>
                      )}
                    </div>
                  )}

                  {/* Recuerdo libre y comparación con las ideas clave (R6: recuperar antes de re-estudiar) */}
                  {confidence && (
                  <div ref={conceptsRef} className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden" data-recall-card>
                    <div className="flex items-center justify-between px-4 pt-4 pb-1">
                      <StepHeader n={2} label={isLocked ? "Las ideas clave" : recallOpen ? "¿Cuáles recordaste?" : "¿Qué recuerdas de la lección?"} subLabel={isLocked ? "registrado" : recallOpen ? "compáralas con tu recuerdo" : "primero, sin mirar"} status={recallOpen ? "done" : "active"}/>
                      {recallOpen && (
                        <span
                          className={`shrink-0 ml-2 mb-3.5 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                            checkedCount > 0
                              ? "bg-emerald-500/12 border-emerald-500/25 text-emerald-400"
                              : "bg-[var(--usb-bg-2)] border-[var(--usb-border)] text-[var(--usb-fg-mid)]"
                          }`}
                          title={`${checkedCount} de ${total} ideas marcadas`}
                        >
                          {checkedCount}/{total}
                        </span>
                      )}
                    </div>

                    {!recallOpen ? (
                      <div className="px-4 pb-4 space-y-3">
                        <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">Escribe 2 o 3 ideas con tus palabras, sin mirar. Después las comparas con las ideas clave.</p>
                        <textarea
                          value={recallNotes}
                          onChange={(e) => setRecallNotes(e.target.value)}
                          rows={3}
                          placeholder="Lo que recuerdo es…"
                          className={textareaCls}
                        />
                        <button onClick={() => setRecallRevealed(true)}
                          className="kx-on-solid kx-cta w-full h-10 rounded-xl text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
                          {recallNotes.trim() ? "Comparar con las ideas clave" : "Ver las ideas clave"}<ArrowRight size={12}/>
                        </button>
                      </div>
                    ) : (
                      <div className="px-4 pb-4 space-y-3">
                        {recallNotes.trim() && (
                          <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2.5" data-recall-notes>
                            <p className="kx-slate mb-1">Tu recuerdo</p>
                            <p className="text-[11.5px] text-[var(--usb-fg-mid)] leading-relaxed whitespace-pre-wrap">{recallNotes.trim()}</p>
                          </div>
                        )}
                        {/* Qué significa marcar y qué provoca — sin premio implícito por marcarlo todo:
                            lo NO marcado se refuerza en Anki (reinforcePlan). */}
                        {isLocked ? (
                          <p className="text-[10.5px] leading-relaxed text-[var(--usb-fg-mid)]">
                            Las ideas clave de la lección. Las marcadas son las que dijiste recordar.
                          </p>
                        ) : (
                          <div className="space-y-1" data-recall-instructions>
                            <p className="text-[10.5px] leading-relaxed text-[var(--usb-fg-mid)]">
                              Marca solo las que te vinieron a la mente sin mirar. Comprobar te pregunta por cada una que no marques (y confirma una de las que marques); las que no marques también se refuerzan en Anki.
                              {doubtsAvailable ? " Si alguna no te quedó clara, pulsa «Duda»." : ""}
                            </p>
                          </div>
                        )}
                        <ul className="space-y-2" data-doubt-recall>
                          {content.keyConcepts.map((c, i) => {
                            const checked = Boolean(conceptsChecked[i]);
                            const ctx = doubtCtx("concepts", c);
                            const open = isDoubtOpen(ctx);
                            return (
                              <li key={i} className="space-y-2">
                                <div className={`kx-row flex items-start rounded-xl border transition-all ${
                                  checked ? "kx-row-on" : isLocked ? "border-transparent" : "border-[var(--usb-border)] hover:border-[var(--usb-border-mid)]"
                                }`}>
                                  <button
                                    type="button"
                                    onClick={() => handleConceptToggle(i)}
                                    disabled={isLocked}
                                    aria-pressed={checked}
                                    className={`flex-1 min-w-0 flex items-start gap-2.5 text-left px-3 py-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${isLocked ? "cursor-default" : ""}`}
                                  >
                                    <span className={`mt-0.5 w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-all ${
                                      checked ? "kx-check-on" : isLocked ? "border-[var(--usb-border)]" : "kx-check-off"
                                    }`} aria-hidden="true">
                                      {checked && <Check size={10} strokeWidth={2.4}/>}
                                    </span>
                                    <span className={`text-[11.5px] leading-relaxed ${checked ? "text-white/85" : "text-white/70"}`}>{c}</span>
                                  </button>
                                  {doubtsAvailable && (
                                    <button
                                      type="button"
                                      onClick={() => toggleDoubt(ctx)}
                                      aria-expanded={open}
                                      aria-label="Tengo una duda sobre esta idea"
                                      title="Tengo una duda sobre esta idea"
                                      data-doubt-trigger
                                      className={`m-1.5 h-7 px-2 rounded-lg inline-flex items-center gap-1 shrink-0 border text-[10.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
                                        open
                                          ? "text-violet-300 border-violet-500/40 bg-violet-500/10"
                                          : "text-[var(--usb-fg-mid)] border-[var(--usb-border)] hover:text-violet-300 hover:border-violet-500/30"
                                      }`}
                                    >
                                      <HelpCircle size={12} aria-hidden="true" />Duda
                                    </button>
                                  )}
                                </div>
                                {renderDoubtPanel(ctx)}
                              </li>
                            );
                          })}
                        </ul>
                        {!isLocked && (
                          <StepContinueButton label="Ponerme a prueba" onClick={handleGoVerify} />
                        )}
                      </div>
                    )}
                  </div>
                  )}
                </div>
                );
              })()}

              {/* ── Paso 1 (Comprobar): adaptativo, máximo 2 preguntas (+ reto opcional) ──
                  Una regla en cada pregunta: escribes → «Revisar mi respuesta» → Kinema
                  revisa → si no acertaste, «¿Cómo sigues?» con dos opciones explícitas. */}
              {focusStep === 1 && confidence && queueQuestions.length > 0 && (() => {
                const cardOpen = !questionsComplete || challengeOpen;
                return (
                <div ref={questionsRef} className="space-y-3.5">

                {/* §1.7: saltada no es definitiva — se puede responder ahora. */}
                {questionsComplete && questionsSkipped && (
                  <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl p-4 space-y-3" data-skipped-step="comprobar">
                    <div className="flex items-start gap-2.5">
                      <span className="w-8 h-8 rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-2)] flex items-center justify-center shrink-0 text-[var(--usb-fg-mid)]" aria-hidden="true">
                        <FastForward size={14} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-[var(--usb-fg-hi)] leading-snug">Saltaste la comprobación</p>
                        <p className="text-[10.5px] text-[var(--usb-fg-mid)] leading-relaxed mt-0.5">
                          En el resumen figura como saltada. Si fue sin querer, puedes responder ahora.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleUndoSkipQuestions}
                      className="w-full h-9 rounded-xl border border-[var(--usb-border-mid)] bg-[var(--usb-bg-3)] text-[11.5px] font-bold text-[var(--usb-fg-hi)] hover:border-[#6d4aff]/50 flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
                    >
                      <RotateCcw size={12} aria-hidden="true" />Responder ahora
                    </button>
                    <StepContinueButton label="Continuar a Aplicar" onClick={() => goToStep(2)} />
                  </div>
                )}

                {/* Cerrada: el repaso de lo respondido, con la respuesta esperada y el reto opcional. */}
                {questionsComplete && !questionsSkipped && !challengeOpen && (
                  <VerifyDoneReview
                    questions={queueQuestions}
                    answers={questionAnswers}
                    feedbacks={questionFeedbacks}
                    onGoApply={() => goToStep(2)}
                    onAskDoubt={doubtsAvailable ? (i) => toggleDoubt(questionDoubtCtx(i)) : undefined}
                    isDoubtOpen={(i) => isDoubtOpen(questionDoubtCtx(i))}
                    renderDoubt={(i) => renderDoubtPanel(questionDoubtCtx(i))}
                    onChallenge={findChallenge() ? goChallengeQuestion : undefined}
                  />
                )}

                {cardOpen && (
                <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden">
                    <div className="px-4 pt-3.5 pb-3 border-b border-[var(--usb-divider)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] font-bold text-[var(--usb-fg-hi)] leading-tight">
                          {challengeOpen ? "Un reto más · opcional" : `Pregunta ${currentQIdx + 1} de ${planTotal}`}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
                          {queueQuestions.map((_, i) => {
                              const fb = questionFeedbacks[i];
                              const isDone = fb?.status === "done";
                              const isCurrent = i === currentQIdx;
                              const rating = fb?.rating;
                              const dotColor = isDone
                                ? rating === "correct" || rating === "excellent"
                                  ? "bg-emerald-400"
                                  : rating === "partial"
                                    ? "bg-amber-400"
                                    : "bg-red-400"
                                : isCurrent
                                  ? "bg-violet-400"
                                  : "bg-white/15";
                              return (
                                <motion.div key={i}
                                  animate={{ width: (isDone || isCurrent) ? 14 : 6, height: 6 }}
                                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                                  className={`rounded-full ${dotColor} transition-shadow duration-300`}
                                />
                              );
                            })}
                        </div>
                      </div>
                      {/* Por qué esta pregunta: el plan sale de lo que marcaste en Recordar. */}
                      {!challengeOpen && planState && (() => {
                        const kind = planState.kinds[currentQIdx];
                        const refs = queueQuestions[currentQIdx]?.conceptRefs ?? [];
                        const why = kind === "spot"
                          ? "Sobre una idea que sí marcaste: confirma que la recuerdas."
                          : kind === "gap"
                            ? "Sobre otra idea que no marcaste en Recordar."
                            : refs.some(r => !checkedSet.has(r))
                              ? "Sobre una idea que no marcaste, según lo claro que te quedó."
                              : "Sobre una idea que marcaste, según lo claro que te quedó: confirma que la recuerdas.";
                        const left = planState.uncovered.length;
                        return (
                          <p className="mt-1 text-[10.5px] leading-snug text-[var(--usb-fg-mid)]" data-plan-why>
                            {why}
                            {currentQIdx === 0 && left > 0 ? ` ${left === 1 ? "La otra idea que no marcaste va" : `Las otras ${left} ideas que no marcaste van`} directo a Anki como refuerzo, para no alargar.` : ""}
                          </p>
                        );
                      })()}
                    </div>

                    <div className="p-4">
                          {queueQuestions.map((q, i) => {
                            if (i !== currentQIdx) return null;
                            const qfb = questionFeedbacks[i] || IDLE_FB;
                            const reviewed = qfb.status === "done";
                            const busy = qfb.status === "loading" || qfb.status === "streaming";
                            const good = reviewed && (qfb.rating === "correct" || qfb.rating === "excellent");
                            const answer = questionAnswers[i] ?? "";
                            const changed = reviewed && answer !== (evaluatedAnswers[i] ?? answer);
                            const needsWork = reviewed && !good;
                            const isChallenge = challengeOpen && i === queueQuestions.length - 1;
                            // Siguiente del plan (otra idea que no marcaste), si queda.
                            const nextPlanned = reviewed && !busy ? findNextPlanned(i) : undefined;
                            const focusAnswer = () => {
                              const el = document.getElementById(`kx-answer-${i}`) as HTMLTextAreaElement | null;
                              if (!el) return;
                              el.scrollIntoView({ block: "center", behavior: "smooth" });
                              el.focus();
                              el.setSelectionRange(el.value.length, el.value.length);
                            };
                            const ratingBorder =
                              reviewed && good ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                              : reviewed && qfb.rating === "partial" ? "border-amber-500/40 ring-1 ring-amber-500/20"
                              : reviewed ? "border-rose-500/40 ring-1 ring-rose-500/20"
                              : "border-[var(--usb-border)] focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20";
                            return (
                            <motion.div
                              key={`q-${i}-${confidence}`}
                              initial={{ opacity: 0, x: 12, scale: 0.99 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              transition={{ type: "spring", stiffness: 360, damping: 28 }}
                              className="space-y-3"
                              data-question-card
                            >
                              {/* Qué tipo de pregunta es */}
                              <div className="flex items-center gap-1.5">
                                {isChallenge && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-[var(--usb-border)] text-[var(--usb-fg-mid)]">
                                    más difícil
                                  </span>
                                )}
                                {/* Qué te pide (Bloom en palabras de tarea): «aplicar»/«recordar» se confundían con los pasos. */}
                                <span className={`text-[9.5px] px-1.5 py-0.5 rounded-md border ${BLOOM_STYLE(q.bloom)}`}>{bloomTaskLabel(q.bloom)}</span>
                              </div>

                              <p className="text-[var(--usb-fg-hi)] text-[12.5px] font-medium leading-relaxed whitespace-pre-line">{q.q}</p>

                              {/* Ayuda: la pista no cuenta como intento */}
                              <HelpToggle open={showHint} onToggle={() => setShowHint(v => !v)} label="Ver pista" openLabel="Ocultar pista">
                                {q.hint}
                              </HelpToggle>

                              <div className="relative">
                                <textarea id={`kx-answer-${i}`} value={answer}
                                  onChange={e => setQuestionAnswers(p => ({ ...p, [i]: e.target.value }))}
                                  aria-label="Tu respuesta"
                                  placeholder="Escribe tu respuesta con tus propias palabras…"
                                  className={`kx-field w-full h-[92px] text-[12px] rounded-xl bg-[var(--usb-bg-3)] border px-3 py-2.5 resize-none outline-none transition-all leading-relaxed text-[var(--usb-fg)] placeholder:text-[var(--usb-fg-mid)] ${changed ? "border-[var(--usb-border)] focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20" : ratingBorder}`}/>
                              </div>

                              {/* Antes de revisar (o revisando): una sola acción */}
                              {(!reviewed || busy) && (
                                <button onClick={() => handleEvalQuestion(i)}
                                  disabled={!answer.trim() || busy}
                                  className="kx-on-solid kx-cta w-full h-10 rounded-xl text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
                                  {busy
                                    ? <><Loader2 size={12} className="animate-spin"/>Kinema está revisando…</>
                                    : <><Send size={12}/>Revisar mi respuesta</>}
                                </button>
                              )}
                              {/* La salida temprana está siempre: de la 2.ª pregunta en adelante, también antes de responder. */}
                              {i > 0 && !isChallenge && !reviewed && !busy && (
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-[10.5px] leading-snug text-[var(--usb-fg-mid)]">Si lo dejas aquí, lo que falta va a Anki como refuerzo.</p>
                                  <button type="button" onClick={() => finishBeforeAnswer(i)} data-finish-early
                                    className="shrink-0 text-[11px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/60 rounded">
                                    Terminar aquí
                                  </button>
                                </div>
                              )}

                              <AIFeedback fb={qfb} stale={changed} />

                              {/* §1.2/§1.7: tras cada revisión, un solo bloque con lo que se puede hacer.
                                  Acertaste y queda plan → la siguiente idea. No acertaste → intentar de
                                  nuevo o seguir. Siempre: la duda en la misma caja y «Terminar aquí». */}
                              {reviewed && !busy && (needsWork || nextPlanned) && (
                                <NextMoves
                                  moves={[
                                    ...(needsWork ? [changed
                                      ? { id: "retry", icon: Send, primary: true, label: "Revisar de nuevo", onClick: () => handleEvalQuestion(i), disabled: !answer.trim() }
                                      : { id: "improve", icon: Edit3, primary: true, label: "Intentarlo de nuevo", hint: "Edita tu respuesta con lo que faltó.", onClick: focusAnswer }] : []),
                                    isChallenge
                                      ? { id: "leave", icon: ArrowRight, label: "Dejar el reto", hint: "Vuelves al repaso de la comprobación.", onClick: closeChallenge }
                                      : nextPlanned
                                        ? { id: "next", icon: ArrowRight, primary: !needsWork, label: `Siguiente pregunta (${i + 2} de ${planTotal})`, hint: `${nextPlanned.kind === "spot" ? "Sobre una idea que sí marcaste, para confirmarla." : "Sobre otra idea que no marcaste en Recordar."}${needsWork ? " Lo que falló aquí va a Anki como refuerzo." : ""}`, onClick: () => goNextQuestion(i) }
                                        : { id: "finish", icon: CheckCircle2, label: "Terminar y ver la respuesta esperada", onClick: completeQuestions },
                                  ]}
                                  help={doubtsAvailable ? <DoubtButton open={isDoubtOpen(questionDoubtCtx(i))} onClick={() => toggleDoubt(questionDoubtCtx(i))} /> : undefined}
                                  exit={nextPlanned ? { label: "Terminar aquí", onClick: completeQuestions } : undefined}
                                />
                              )}
                              {reviewed && renderDoubtPanel(questionDoubtCtx(i))}
                            </motion.div>
                            );
                          })}
                          {/* §1.7: el mismo salto en cada paso que lo admite; tras revisar ya no se salta */}
                          {!questionsComplete && !anyAnswerReviewed && (
                            <div className="pt-3">
                              <SkipStepButton onClick={handleSkipQuestions} title="Quedará como saltada en el resumen; puedes volver" />
                            </div>
                          )}
                    </div>
                </div>
                )}
                </div>
                );
              })()}

              {/* ── Paso 2 (Aplicar): nunca bloquea ── */}
              {focusStep === 2 && (
                showApply ? (() => {
                // §1.7: las dos formas de practicar se ven ANTES de cualquier salto.
                const oralQ = content.interviewQ;
                const mode: "exercise" | "explain" = oralQ ? practiceMode : "exercise";
                const practiceDone = practiceStatus === "done" || practiceStatus === "correct";
                return (
                <div className="space-y-3.5">
                  <div ref={applyRef} className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden">
                    <div className="pt-4" />

                    {/* Saltada no es definitiva: al volver, se dice y la práctica sigue abierta. */}
                    {practiceStatus === "later" && (
                      <div role="status" className="mx-4 mb-3 rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2.5 flex items-start gap-2" data-skipped-step="aplicar">
                        <FastForward size={12} className="mt-0.5 shrink-0 text-[var(--usb-fg-mid)]" aria-hidden="true" />
                        <p className="text-[10.5px] leading-relaxed text-[var(--usb-fg-mid)]">
                          Saltaste la práctica. Si fue sin querer, hazla ahora: el resumen se actualiza al revisarla.
                        </p>
                      </div>
                    )}

                    {oralQ && (
                      <div className="px-4 pb-3 space-y-1.5" data-practice-modes>
                        <p className="text-[11px] font-semibold leading-snug text-[var(--usb-fg-hi)]">Elige cómo practicar <span className="font-medium text-[var(--usb-fg-mid)]">· cualquiera de las dos vale</span></p>
                        <div className="kx-seg" role="tablist" aria-label="Forma de practicar">
                          {([
                            { id: "exercise", label: content.application.isCode ? "Escribir código" : "Resolver el caso", sub: content.application.isCode ? "Desafío práctico" : "Ejercicio práctico" },
                            { id: "explain", label: "Explicarlo", sub: oralPracticeMeta?.title ?? "Con tus palabras" },
                          ] as const).map((opt) => {
                            const on = mode === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                onClick={() => setPracticeMode(opt.id)}
                                className={`relative flex-1 min-w-0 flex flex-col items-center justify-center px-2 py-1.5 rounded-[9px] text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${on ? "kx-tab-on bg-[var(--kx-btn)] shadow-[0_3px_8px_-3px_var(--kx-btn)]" : "text-[var(--usb-fg-hi)] hover:bg-[var(--usb-bg-3)]"}`}
                              >
                                {/* Fondo en el propio botón (no una píldora hermana): el contraste se mide y se ve igual. */}
                                <span className="relative text-[11.5px] font-bold leading-tight truncate max-w-full">{opt.label}</span>
                                <span className={`relative text-[10px] font-medium leading-tight mt-0.5 truncate max-w-full ${on ? "" : "text-[var(--usb-fg-mid)]"}`}>{opt.sub}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {mode === "exercise" && (() => {
                      // Mismo patrón que Comprobar: escribir → revisar → «¿Cómo sigues?».
                      const reviewed = appFeedback.status === "done";
                      const busy = appFeedback.status === "loading" || appFeedback.status === "streaming";
                      const good = reviewed && (appFeedback.rating === "correct" || appFeedback.rating === "excellent");
                      const changed = reviewed && appAnswer !== (appEvaluated || appAnswer);
                      // Ver la solución cierra los intentos: lo que salga después no sería tuyo.
                      const closed = appSolutionSeen;
                      const focusApp = () => {
                        const el = document.getElementById("kx-app-answer") as HTMLTextAreaElement | null;
                        if (!el) return;
                        el.scrollIntoView({ block: "center", behavior: "smooth" });
                        el.focus();
                        el.setSelectionRange(el.value.length, el.value.length);
                      };
                      const openSolution = () => { setAppSolutionSeen(true); setShowAppSolution(true); };
                      return (<>
                    <div className="mx-4 mb-2.5 bg-violet-500/7 border border-violet-500/14 rounded-xl p-2.5 flex items-start gap-2">
                      <span className="shrink-0"><Icon name="steps" size={14} /></span>
                      <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">{content.application.setup}</p>
                    </div>

                    {content.application.isCode ? (
                      <pre className="mx-4 mb-3 bg-black/50 border border-[var(--usb-border)] rounded-xl p-3 text-[10px] text-emerald-300/80 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap shadow-inner">{content.application.challenge}</pre>
                    ) : (
                      <div className="mx-4 mb-3 bg-[var(--usb-bg-2)] border border-[var(--usb-border)] rounded-xl p-3 text-[11.5px] text-[var(--usb-fg-hi)] overflow-x-auto leading-relaxed whitespace-pre-wrap">{content.application.challenge}</div>
                    )}

                    <div className="px-4 space-y-3">
                      {!closed && (
                        <HelpToggle open={showAppHint} onToggle={() => setShowAppHint(v => !v)} label="Ver pista" openLabel="Ocultar pista">
                          {(() => {
                            const first = content.application.solution.split(/\n|(?<=[.!?])\s/)[0].trim();
                            return `Por dónde empezar: ${first.length > 110 ? first.slice(0, 110).trimEnd() + "…" : first}`;
                          })()}
                        </HelpToggle>
                      )}
                      <textarea id="kx-app-answer" value={appAnswer} onChange={e => setAppAnswer(e.target.value)}
                        readOnly={closed}
                        aria-label={content.application.isCode ? "Tu solución" : "Tu respuesta"}
                        placeholder={content.application.isCode ? "// Escribe tu solución aquí…" : "Escribe tu respuesta aquí…"}
                        className={`kx-field w-full h-[100px] text-[12px] rounded-xl bg-[var(--usb-bg-3)] border px-3 py-2.5 resize-none outline-none transition-all leading-relaxed shadow-inner placeholder:text-[var(--usb-fg-mid)] ${
                          content.application.isCode ? "font-mono text-emerald-400" : "text-[var(--usb-fg)]"
                        } ${
                          changed ? "border-[var(--usb-border)] focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20"
                          : reviewed && good ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                          : reviewed && appFeedback.rating === "partial" ? "border-amber-500/40 ring-1 ring-amber-500/20"
                          : reviewed ? "border-rose-500/40 ring-1 ring-rose-500/20"
                          : "border-[var(--usb-border)] focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20"
                        }`}/>
                      {(!reviewed || busy) && (
                        <button onClick={handleEvalApp} disabled={!appAnswer.trim() || busy}
                          className="kx-on-solid kx-cta w-full h-10 rounded-xl text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
                          {busy ? <><Loader2 size={12} className="animate-spin"/>Kinema está revisando…</> : <><Send size={12}/>Revisar mi respuesta</>}
                        </button>
                      )}
                      <AIFeedback fb={appFeedback} stale={changed} />

                      {/* Mismo bloque que en Comprobar: intentar de nuevo o ver la solución, y la duda al lado. */}
                      {reviewed && !busy && !good && !closed && (
                        <NextMoves
                          moves={[
                            changed
                              ? { id: "retry", icon: Send, primary: true, label: "Revisar de nuevo", onClick: handleEvalApp, disabled: !appAnswer.trim() }
                              : { id: "improve", icon: Edit3, primary: true, label: "Intentarlo de nuevo", hint: "Edita tu respuesta con lo que faltó.", onClick: focusApp },
                            { id: "solution", icon: BookOpen, label: "Ver la solución", hint: "Después ya no podrás revisar otro intento.", onClick: openSolution },
                          ]}
                          help={doubtsAvailable ? <DoubtButton open={isDoubtOpen(practiceDoubtCtx())} onClick={() => toggleDoubt(practiceDoubtCtx())} /> : undefined}
                        />
                      )}
                      {reviewed && !busy && (good || closed) && (
                        <div className="flex flex-wrap items-center gap-2">
                          <RevealButton open={showAppSolution} onClick={() => (showAppSolution ? setShowAppSolution(false) : openSolution())} label="Ver la solución" openLabel="Ocultar la solución" />
                          {doubtsAvailable && <DoubtButton open={isDoubtOpen(practiceDoubtCtx())} onClick={() => toggleDoubt(practiceDoubtCtx())} />}
                        </div>
                      )}
                      {closed && !good && (
                        <p className="text-[10.5px] leading-relaxed text-[var(--usb-fg-mid)]">Viste la solución, así que este intento queda cerrado.{content.ankiCards.some(c => !c.excluded && isPracticeCard(c)) ? " Sus tarjetas de aplicación irán primero en Anki, como refuerzo." : ""}</p>
                      )}
                      {showAppSolution && reviewed && (
                        <ReferenceAnswer label="Solución" mono={content.application.isCode}>{content.application.solution}</ReferenceAnswer>
                      )}
                      {reviewed && renderDoubtPanel(practiceDoubtCtx())}
                    </div>
                    </>);
                    })()}

                    {/* Explicarlo — la otra forma de practicar (§1.7: cuenta como práctica hecha). */}
                    {mode === "explain" && oralQ && (() => {
                      const reviewed = oralFeedback.status === "done";
                      const busy = oralFeedback.status === "loading" || oralFeedback.status === "streaming";
                      const good = reviewed && (oralFeedback.rating === "correct" || oralFeedback.rating === "excellent");
                      const changed = reviewed && oralAnswer !== (oralEvaluated || oralAnswer);
                      const focusOral = () => {
                        const el = document.getElementById("kx-oral-answer") as HTMLTextAreaElement | null;
                        if (!el) return;
                        el.scrollIntoView({ block: "center", behavior: "smooth" });
                        el.focus();
                        el.setSelectionRange(el.value.length, el.value.length);
                      };
                      return (
                      <div className="px-4 space-y-3" data-practice-explain>
                        <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] p-3">
                          <p className="text-[var(--usb-fg-hi)] text-[12px] leading-relaxed font-medium">{oralQ.q}</p>
                          <p className="text-[10.5px] text-[var(--usb-fg-mid)] leading-relaxed mt-1.5">Sin mirar la lección, como si se lo contaras a alguien. Kinema revisa si es clara y completa.</p>
                        </div>
                        <HelpToggle open={showInterviewAnswer} onToggle={() => setShowInterviewAnswer(v => !v)} label={oralPracticeMeta?.answerLabel ?? "Ver una buena estructura"} openLabel="Ocultar la estructura">
                          {oralQ.idealAnswer}
                        </HelpToggle>
                        <textarea
                          id="kx-oral-answer"
                          value={oralAnswer}
                          onChange={(e) => setOralAnswer(e.target.value)}
                          aria-label="Tu explicación"
                          placeholder="Escribe tu explicación con tus palabras…"
                          rows={4}
                          className={textareaCls}
                        />
                        {(!reviewed || busy) && (
                          <button onClick={handleEvaluateOral} disabled={!oralAnswer.trim() || busy}
                            className="kx-on-solid kx-cta w-full h-10 rounded-xl text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
                            {busy ? <><Loader2 size={12} className="animate-spin"/>Kinema está revisando…</> : <><Send size={12}/>Revisar mi explicación</>}
                          </button>
                        )}
                        <AIFeedback fb={oralFeedback} stale={changed} />
                        {reviewed && !busy && !good && (
                          <NextMoves
                            moves={[
                              changed
                                ? { id: "retry", icon: Send, primary: true, label: "Revisar de nuevo", onClick: handleEvaluateOral, disabled: !oralAnswer.trim() }
                                : { id: "improve", icon: Edit3, primary: true, label: "Intentarlo de nuevo", hint: "Completa tu explicación con lo que faltó.", onClick: focusOral },
                            ]}
                          />
                        )}
                      </div>
                      );
                    })()}

                    <div className="px-4 pt-3.5 pb-4 space-y-3.5">
                      {/* §1.7: mismo salto y mismo avance que en el resto de pasos */}
                      {practiceStatus === null
                        ? <SkipStepButton onClick={handlePracticeLater} title="Quedará como pendiente en el resumen; puedes volver" />
                        : <StepContinueButton label="Continuar a Fijar" onClick={() => goToStep(3)} />}
                    </div>
                  </div>
                </div>
                );
                })() : (
                  <div className="bg-[var(--usb-bg-3)] border border-[var(--usb-divider)] rounded-xl p-4 opacity-35">
                    <StepHeader
                      n={4}
                      label="Practícalo"
                      subLabel={content.application.isCode ? "desafío práctico" : "ejercicio práctico"}
                      status="pending"
                    />
                    <div className="h-10 bg-white/3 rounded-lg flex items-center justify-center">
                      <Lock size={11} className="text-white/18 mr-1.5"/>
                      <span className="text-white/18 text-[10px]">Completa las preguntas primero</span>
                    </div>
                  </div>
                )
              )}

              {/* ── Paso 3 (Fijar): resumen de cierre + tarjetas + Terminar (§1.4) ── */}
              {focusStep === 3 && (() => {
                const selectedCards = allCardsWithReinforce.filter(c => !c.excluded);
                // §5: las de duda también son de refuerzo, pero se cuentan aparte (como en la nota).
                const reinforceCount = selectedCards.filter(c => c.reinforce && !c.doubt).length;
                const doubtCount = selectedCards.filter(c => c.doubt).length;
                const cardsBreakdown = [
                  reinforceCount > 0 ? `${reinforceCount} de refuerzo` : "",
                  doubtCount > 0 ? `${doubtCount} de duda` : "",
                ].filter(Boolean);
                // Solo cuenta lo respondido (una pregunta abierta sin responder no suma ni resta).
                const totalQFinal = queueQuestions.filter((_, i) => questionFeedbacks[i]?.status === "done").length;
                // Minutos reales de ESTA sesión; si no son creíbles (p. ej. retomada días después), no se muestran.
                const rawMin = Math.round(((finishedAt ?? Date.now()) - sessionStartRef.current) / 60000);
                const elapsedMin = rawMin >= 0 && rawMin <= 180 ? Math.max(1, rawMin) : null;
                return (
              <div className="space-y-3.5" style={{ "--kx-btn": "#6d4aff" } as React.CSSProperties}>
                {/* Resumen de cierre — una tarjeta con datos reales (§1.4): un bloque por
                    paso, con el mismo nombre y color que en la barra de pasos; lo saltado o
                    pendiente lleva su botón para volver (§1.7). */}
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 340, damping: 28 }}
                  className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-2xl p-4 space-y-3"
                  data-lesson-summary
                >
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0" aria-hidden="true"
                      style={{ background: `color-mix(in srgb, ${STEP_META[3].hue} 12%, var(--usb-bg-3))`, borderColor: `color-mix(in srgb, ${STEP_META[3].hue} 30%, var(--usb-border))`, color: t(STEP_META[3].inkDark, STEP_META[3].inkLight) }}>
                      <Icon name="flag" size={19} weight="duotone" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-extrabold leading-tight text-[var(--usb-fg-hi)]">{resultTitle}</p>
                      <p className="text-[10.5px] font-medium leading-tight mt-1 text-[var(--usb-fg-mid)]">
                        {finishedAt !== null ? "Lección terminada" : "Tu resumen hasta ahora"}{elapsedMin !== null ? ` · ~${elapsedMin} min de estudio` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2" role="list">
                    {([
                      { id: "recordar", step: 0, value: `${conceptsMarkedCount}/${content.keyConcepts.length}`, caption: "ideas, según tú" },
                      questionsSkipped
                        ? { id: "comprobar", step: 1, value: "—", caption: "saltada", action: { label: "Responder", onClick: handleUndoSkipQuestions } }
                        : { id: "comprobar", step: 1, value: `${firstTryCount}/${totalQFinal}`, caption: improvedCount > 0 ? `a la primera · ${improvedCount} corregida${improvedCount === 1 ? "" : "s"}` : "a la primera" },
                      practiceStatus === "done" || practiceStatus === "correct"
                        ? { id: "aplicar", step: 2, value: practiceStatus === "correct" ? "Bien" : "Hecha", caption: practiceStatus === "correct" ? "práctica correcta" : "práctica" }
                        : { id: "aplicar", step: 2, value: "—", caption: "pendiente", action: { label: "Hacerla", onClick: () => goToStep(2, true) } },
                    ] as { id: string; step: number; value: string; caption: string; action?: { label: string; onClick: () => void } }[]).map((tile) => {
                      const m = STEP_META[tile.step];
                      const ink = t(m.inkDark, m.inkLight);
                      return (
                        <div key={tile.id} role="listitem" data-summary-tile={tile.id}
                          className="rounded-xl border px-2.5 py-2.5 flex flex-col min-w-0"
                          style={{ background: `color-mix(in srgb, ${m.hue} 7%, var(--usb-bg-3))`, borderColor: `color-mix(in srgb, ${m.hue} 24%, var(--usb-border))` }}>
                          <span className="text-[10px] font-bold leading-none" style={{ color: ink }}>{m.short}</span>
                          <span className="text-[17px] font-extrabold leading-none mt-2 text-[var(--usb-fg-hi)] tabular-nums">{tile.value}</span>
                          <span className="text-[10px] leading-snug mt-1 text-[var(--usb-fg-mid)]">{tile.caption}</span>
                          {tile.action && (
                            <button type="button" onClick={tile.action.onClick}
                              className="mt-2 h-7 rounded-lg border text-[10.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
                              style={{ color: ink, borderColor: `color-mix(in srgb, ${m.hue} 45%, var(--usb-border))`, background: "var(--usb-bg-3)" }}>
                              {tile.action.label}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {calibration && (
                    <p className="text-[10.5px] leading-relaxed text-[var(--usb-fg-mid)]" data-calibration>{calibration.message}</p>
                  )}
                  <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2.5 flex items-start gap-2" data-next-step>
                    <ArrowRight size={13} className="mt-0.5 shrink-0 text-[var(--usb-accent-text)]" aria-hidden="true" />
                    <p className="text-[11px] leading-relaxed text-[var(--usb-fg)]">
                      <span className="font-bold text-[var(--usb-fg-hi)]">Próximo paso: </span>
                      {ankiExported
                        ? "repasa en Anki mañana."
                        : obsidianExportedAt
                          ? "exporta también a Anki para repasar mañana."
                          : "exporta las tarjetas a Anki y repásalas mañana."}
                      {finishedAt !== null ? " Para seguir, pulsa «Ir a la siguiente lección» (abajo)." : ""}
                    </p>
                  </div>
                </motion.div>

              {/* ── Fíjalo en memoria ── */}
              {confidence && (
                  <div ref={ankiRef} className="space-y-3">

                    <ExportModule
                      icon={Package}
                      title="Tarjetas de la lección"
                      subtitle={`${selectedCards.length} tarjetas${cardsBreakdown.length > 0 ? ` · ${cardsBreakdown.join(" · ")}` : ""}`}
                      badge={ankiExported ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border text-[#059669] bg-[#059669]/12 border-[#059669]/35 flex items-center gap-1 shrink-0"><Check size={9} strokeWidth={3}/>Listo</span> : undefined}
                    >
                      {/* Qué se convierte en tarjetas y por qué: datos reales de las tres fases. */}
                      {(() => {
                        const lessonCards = selectedCards.filter(c => !c.doubt);
                        const n = content.keyConcepts.length;
                        const withRefs = lessonCards.some(c => (c.conceptRefs ?? []).length > 0);
                        const covered = n - conceptCoverage({ keyConcepts: content.keyConcepts, questions: content.questions, ankiCards: lessonCards }).ideasWithoutCard.length;
                        const unmarked = content.keyConcepts.filter((_, i) => !conceptsChecked[i]).length;
                        const failed = queueQuestions.filter((_, i) => questionFeedbacks[i]?.status === "done" && (questionFeedbacks[i]?.rating === "partial" || questionFeedbacks[i]?.rating === "wrong")).length;
                        const reasons = [
                          unmarked > 0 ? "las ideas que no marcaste" : "",
                          failed > 0 ? "lo que fallaste en Comprobar" : "",
                          // Solo si de verdad reforzó alguna tarjeta de aplicación/código/entrevista.
                          practiceWeak && lessonCards.some(c => c.reinforce && isPracticeCard(c)) ? "la práctica que no salió" : "",
                        ].filter(Boolean);
                        const why = reasons.length > 1 ? `${reasons.slice(0, -1).join(", ")} y ${reasons[reasons.length - 1]}` : reasons[0];
                        if (!withRefs && reinforceCount === 0) return null;
                        return (
                          <p className="text-[10.5px] leading-relaxed text-[var(--usb-fg-mid)]" data-cards-why>
                            {withRefs ? (covered === n ? `Cubren las ${n} ideas clave de la lección.` : `Cubren ${covered} de las ${n} ideas clave de la lección.`) : ""}
                            {reinforceCount > 0 && why ? `${withRefs ? " " : ""}Primero van ${reinforceCount === 1 ? "1 de refuerzo" : `${reinforceCount} de refuerzo`}: ${why}.` : ""}
                          </p>
                        );
                      })()}
                      {/* §5: última oportunidad, ANTES de exportar — la lección no se vuelve a abrir. */}
                      {doubtsAvailable && savedDoubts < MAX_DOUBT_CARDS && unsavedDoubtProposals.length > 0 && (
                        <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.05] px-3 py-2.5 space-y-2" data-doubt-proposals>
                          <div className="flex items-center gap-1.5">
                            <HelpCircle size={12} className="text-violet-300 shrink-0" aria-hidden="true" />
                            <p className="kx-slate flex-1">Dudas resueltas sin guardar</p>
                            <span className="text-[10px] font-mono tabular-nums text-[var(--usb-fg-lo)]">{savedDoubts}/{MAX_DOUBT_CARDS}</span>
                          </div>
                          {unsavedDoubtProposals.slice(-3).map(({ thread, turn }) => (
                            <div key={`${thread.id}-${turn.at}`} className="flex items-start gap-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-semibold text-[var(--usb-fg-hi)] leading-snug">{turn.card?.front}</p>
                                <p className="text-[10.5px] text-[var(--usb-fg-mid)] leading-snug line-clamp-2">{turn.card?.back}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => addDoubtCardFromFijar(thread, turn.at)}
                                className="h-7 px-2.5 rounded-md text-[10.5px] font-semibold border shrink-0 inline-flex items-center gap-1 transition-colors text-violet-300 border-violet-500/30 hover:border-violet-500/50 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
                              >
                                <Plus size={10} />Añadir al mazo
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-1">
                        <button onClick={handleExportApkg} disabled={!showApply || apkgStatus === "loading"}
                          style={{ "--kx-btn": apkgStatus === "done" ? "#059669" : "#6d4aff" } as React.CSSProperties}
                          className={exportPrimaryBtnCls}>
                          {apkgStatus === "loading"
                            ? <><Loader2 size={12} className="animate-spin"/><span className="truncate max-w-[85px]">{apkgProgress}</span></>
                            : apkgStatus === "done"
                              ? <><CheckCircle2 size={12}/>Exportado</>
                              : apkgStatus === "error"
                                ? <><RefreshCw size={12}/>Reintentar</>
                                : <><Package size={12}/>Exportar .apkg</>}
                        </button>
                      </div>
                      {(() => {
                        // Tarjetas aceptadas que el último .apkg no llevaba (p. ej. una duda añadida después).
                        const exported = lastExportGuids ? new Set(lastExportGuids) : null;
                        const fresh = exported ? selectedCards.filter(c => !exported.has(stableAnkiGuid(courseName, lessonName, c))).length : 0;
                        return fresh > 0 ? (
                          <p role="status" className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-amber-300">
                            <Info size={12} className="mt-px shrink-0" />
                            {fresh === 1
                              ? "1 tarjeta nueva desde tu última exportación: vuelve a exportar para llevarla a Anki."
                              : `${fresh} tarjetas nuevas desde tu última exportación: vuelve a exportar para llevarlas a Anki.`}
                          </p>
                        ) : null;
                      })()}
                      <div className="flex items-center gap-4">
                        <button onClick={() => setShowCardPreview(v => !v)} aria-expanded={showCardPreview}
                          className="text-[11px] font-medium text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] flex items-center gap-1 transition-colors">
                          <ChevronDown size={14} className={`transition-transform ${showCardPreview ? "rotate-180" : ""}`}/>{showCardPreview ? "Ocultar tarjetas" : "Ver tarjetas"}
                        </button>
                        <button onClick={() => setShowAnkiGuide(v => !v)} aria-expanded={showAnkiGuide}
                          className="text-[11px] font-medium text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] flex items-center gap-1 transition-colors">
                          <Info size={13}/>{showAnkiGuide ? "Ocultar guía" : "Guía de importación"}
                        </button>
                      </div>
                      <AnimatePresence initial={false}>
                        {showCardPreview && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <p className="text-[10.5px] leading-relaxed text-[var(--usb-fg-mid)] mb-2">Solo se exporta lo que aceptas: «Quitar» saca la tarjeta del paquete.</p>
                            <AnkiFlipPreview cards={allCardsWithReinforce} onToggleExclude={handleToggleExcludeCard}/>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <AnimatePresence initial={false}>
                        {showAnkiGuide && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-[var(--usb-bg-2)] border border-[var(--usb-border)] rounded-xl p-3 space-y-3">
                              {/* Al importar en Anki (primera vez) — honesto: los
                                  presets SOLO llegan si el usuario activa la opción
                                  «Importar cualquier configuración del mazo» (v1.5.3) */}
                              <div className="space-y-1">
                                <p className="text-[var(--usb-fg-hi)] text-[11px]" style={{ fontWeight: 600 }}>Al importar en Anki (primera vez)</p>
                                {[
                                  `Mazos bajo «${vocabCfg.rootDeck}»: Courses → curso → lección (conceptos) y Vocabulary → ${vocabCfg.targetLangLabel} → curso (vocabulario).`,
                                  "En la pantalla de importación activa «Importar cualquier configuración del mazo» (en inglés: «Import any deck presets») para recibir los presets propios de estos mazos: Cursos 20 nuevas/día · Vocabulario 15/día · pasos 1 y 10 min · si la tarjeta falla conserva 30% del intervalo · a los 8 fallos se marca «leech» · retención objetivo 90%. Anki recuerda la opción; si no la activas, estos mazos usan tu preset Default.",
                                  "Comprueba que FSRS esté activado: Opciones del mazo → FSRS (Anki 23.10+). Ese interruptor vale para toda tu colección; si ya lo estaba, no tienes que hacer nada. Opcional: tras unos días de reseñas, «Optimizar» afina los pesos a tu memoria.",
                                  "Kinema no modifica tus demás mazos ni tu preset Default.",
                                  "Audio del vocabulario: usa el archivo si tu sistema externo lo generó (HyperTTS / edge-tts) y la voz del sistema de Anki si no. La imagen puedes añadirla tú o con un add-on.",
                                ].map((s, i) => (
                                  <p key={i} className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">{i + 1}. {s}</p>
                                ))}
                              </div>
                              <div className="pt-2 border-t border-[var(--usb-divider)]" />
                              <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">
                                Doble clic en el archivo .apkg → Anki importa el mazo con su configuración. Si algo sale mal, vuelve a descargar el .apkg: Anki añade lo que falte y nunca duplica ni pisa lo que ya tienes (tampoco lo que editaste allí).
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </ExportModule>

                      {/* Destinos al mismo nivel que las tarjetas de la lección, visibles sin plegar;
                          el mazo de la lección va primero (regla 1: el vocabulario es secundario). */}
                          <VocabularyPanel course={courseName} lesson={lessonName} config={vocabCfg} onConfig={handleSaveVocabCfg} generate={generateVocabularyCandidates} aiReady={aiReady} aiNotice={aiBlockedMessage(aiState, aiEndpoint)} />

                          {/* ── Obsidian export ── */}
                          <ExportModule
                            icon={BookMarked}
                            title="Obsidian"
                            badge={isSessionExported(exportedNotes, obsidianCfg, courseName, lessonName) ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border text-[#059669] bg-[#059669]/12 border-[#059669]/35 flex items-center gap-1 shrink-0"><Check size={9} strokeWidth={3}/>Listo</span> : undefined}
                            subtitle={obsidianCfg.vaultName.trim()
                              ? <>Vault «{obsidianCfg.vaultName}» · nota de la lección</>
                              : "Sin vault configurado"}
                            configLabel="Ajustar"
                            onToggleConfig={openObsidianSettings}
                          >
                              <>
                                {/* Sin vault: una sola acción principal (conectarlo) y los respaldos manuales. */}
                                {!obsidianCfg.vaultName.trim() && (
                                  <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">Conecta tu vault y Kinema crea la nota de la lección con un clic.</p>
                                )}
                                <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-1.5">
                                  {!obsidianCfg.vaultName.trim() ? (
                                    <button onClick={openObsidianSettings} className={exportGhostBtnCls}>
                                      <Settings2 size={12}/>Conectar vault
                                    </button>
                                  ) : (
                                  <button onClick={handleExportObsidian} disabled={!showApply}
                                    style={{ "--kx-btn": obsidianStatus === "done" ? "#059669" : "#6d4aff" } as React.CSSProperties}
                                    className={exportPrimaryBtnCls}>
                                    {obsidianStatus === "done"
                                      ? <><CheckCircle2 size={12}/>Exportado</>
                                      : <><BookMarked size={12}/>Exportar</>}
                                  </button>
                                  )}
                                  <button onClick={handleCopyObsidianMarkdown} disabled={!showApply} className={exportGhostBtnCls}>
                                    <ClipboardCopy size={12}/>Copiar
                                  </button>
                                  <button onClick={handleDownloadObsidianMarkdown} disabled={!showApply} className={exportGhostBtnCls}>
                                    <FileDown size={12}/>.md
                                  </button>
                                </div>
                                {obsidianCfg.vaultName.trim() && (<>
                                <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">
                                  Crea la nota en <span className="font-mono text-[var(--usb-fg-hi)]">{obsidianCfg.sourcesFolder}/</span> (y, la primera vez de cada curso, su índice en <span className="font-mono text-[var(--usb-fg-hi)]">{obsidianCfg.mocsFolder}/</span>). Si ya existe, le añade un «Repaso» al final sin tocar lo que escribiste.{obsidianCfg.autoExport ? " Se guarda sola al terminar la lección." : ""} Copiar y .md son respaldos.
                                </p>
                                <button onClick={() => setObsidianHelpOpen(v => !v)}
                                  className="text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] text-[11px] flex items-center gap-1 transition-colors">
                                  <Info size={13}/>{obsidianHelpOpen ? "Ocultar ayuda" : "¿No pasó nada al exportar?"}
                                </button>
                                {obsidianHelpOpen && (
                                  <ol className="rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-2)] p-2.5 space-y-1.5">
                                    {[
                                      "Instala Obsidian y abre tu vault al menos una vez (que aparezca en el selector de vaults).",
                                      "Exporta de nuevo: Chrome pregunta «¿Abrir Obsidian?» → marca Siempre permitir. Si Kinema dice que la lección ya tiene nota, elige «Reemplazar»: la primera no llegó a crearse.",
                                      "Si antes marcaste Bloquear: Chrome → Configuración → Privacidad → Configuración de sitios → Protocolos adicionales, y borra el bloqueo de obsidian.",
                                      "Verifica el nombre con Probar vault (en Ajustar): Obsidian avisa si no existe.",
                                      "Como respaldo siempre quedan Copiar (portapapeles) o .md (archivo).",
                                    ].map((s, i) => (
                                      <li key={i} className="flex gap-2 text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">
                                        <span className="w-3.5 h-3.5 rounded-full bg-[#6d4aff]/15 text-[#6d4aff] text-[8px] flex items-center justify-center shrink-0 mt-px" style={{ fontWeight: 700 }}>{i + 1}</span>
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                                </>)}
                              </>
                          </ExportModule>

                      {/* §1.4: Terminar lección — siempre disponible, con o sin exportar */}
                      {/* Programa terminado según la propia plataforma: el siguiente
                          curso del programa, con deep-link (solo DataCamp + track). */}
                      {dcCtx?.program?.currentCourseDone === true && dcCtx.program.nextCourse ? (
                        <a href={`https://app.datacamp.com/es/campus/courses/${dcCtx.program.nextCourse.slug}`}
                          target="_blank" rel="noreferrer"
                          className="w-full h-9 rounded-xl text-[11.5px] font-semibold flex items-center justify-center gap-1.5 border border-[var(--usb-border)] bg-[var(--usb-bg-2)] text-[var(--usb-fg-hi)] hover:bg-[var(--usb-bg-3)] transition-colors">
                          Siguiente curso del programa: {dcCtx.program.nextCourse.title}
                        </a>
                      ) : null}
                      <button
                        onClick={handleFinishLesson}
                        disabled={finishedAt !== null}
                        className={`w-full h-11 rounded-2xl text-[12.5px] font-bold flex items-center justify-center gap-2 transition-all ${
                          finishedAt !== null
                            ? "bg-emerald-500/12 border border-emerald-500/30 text-emerald-300 cursor-default"
                            : "kx-gen-cta"
                        }`}
                      >
                        {finishedAt !== null
                          ? <><CheckCircle2 size={14}/>Lección terminada</>
                          : <><Icon name="flag" size={14} weight="duotone"/>Terminar lección</>}
                      </button>
                      {/* Terminada: el siguiente paso natural, justo debajo (Udemy pasa de video
                          y Kinema abre la lección nueva en Study). */}
                      <div ref={nextLessonRef} className="space-y-1.5 scroll-mb-4">
                      {finishedAt !== null && (
                        <div className="space-y-1.5" data-next-lesson>
                          {/* Secundario: no compite con «Exportar .apkg» (el mazo de la lección es lo primero). */}
                          <button
                            type="button"
                            onClick={handleGoNextLesson}
                            disabled={nextLessonStatus === "going"}
                            className="w-full h-10 rounded-xl border border-[var(--usb-border-mid)] bg-[var(--usb-bg-3)] text-[var(--usb-fg-hi)] hover:border-[#6d4aff]/45 text-[11.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
                          >
                            {nextLessonStatus === "going"
                              ? <><Loader2 size={13} className="animate-spin"/>Abriendo la siguiente lección…</>
                              : <>Ir a la siguiente lección<ArrowRight size={13}/></>}
                          </button>
                          {nextLessonStatus === "failed" && (
                            <p role="status" className="text-[10.5px] text-[var(--usb-fg-mid)] text-center leading-relaxed">
                              No encontré el botón «Siguiente» de Udemy. Abre la próxima lección desde el temario: Kinema te ofrecerá estudiarla.
                            </p>
                          )}
                        </div>
                      )}
                      {!ankiExported && !obsidianExportedAt && finishedAt !== null && (
                        <p className="text-[10.5px] text-[var(--usb-fg-mid)] text-center leading-relaxed">
                          Sin exportar: la lección queda en «Tarjetas por descargar» del historial.
                        </p>
                      )}
                      </div>
                  </div>
              )}
              </div>
              );
              })()}
              </motion.div>
              </AnimatePresence>
              </>)}

              <div className="h-5"/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
