import { fieldCls, textareaCls } from "./settings/SettingsKit";
import { TIMED_TRANSCRIPT } from "../../shared/prompts";
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Target, Sparkles, Wand2, Check, Edit3, ArrowRight, Brain,
  CheckCircle2, Circle, RotateCcw, X, Zap, FlipHorizontal,
  ChevronLeft, ChevronRight, Info, FileDown, FolderPlus,
  FolderSync, Send, Loader2, Wifi, WifiOff, Star, BookOpen,
  Repeat2, Lock, ChevronDown, Package, Rocket, Diamond, Flame, Download, FastForward, History,
  BookMarked, RefreshCw, Settings2, ClipboardCopy, ExternalLink, Languages,
  Icon, Glyph, splitLeadingMarker
} from "./icons";
import type { IconName } from "./icons";
import { FrameMarks } from "./AppLogo";
import { motion, AnimatePresence } from "motion/react";
import { evaluateActiveAnswer, evaluateCodeSolution, evaluateActiveAnswerStream, evaluateCodeSolutionStream, type AIRating, type StudyAIContext } from "../services/localAI";
import { buildAnkiApkg, downloadApkg, PRISM_MEDIA_FILES } from "../services/ankiApkg";
import { buildConceptSpec, sanitizeDeckSegment } from "../services/ankiDesign";
import { cacheService } from "../services/cacheService";
import { describeProviderFailure, getAiProviderConfig } from "../services/ai-providers";
import {
  DEFAULT_VOCAB_CONFIG, loadVocabConfig, parseVocabularyPayload, saveVocabConfig,
  type VocabConfig,
} from "../services/vocabularyService";
import { VocabularyPanel } from "./study/VocabularyPanel";
// Datos de demo SOLO en desarrollo: import estático dejaría el módulo (y sus
// palabras/historial de ejemplo) dentro del bundle de producción.
/** Fábrica del generador de demo: en DEV carga el módulo; en prod devuelve null. */
async function prototypeVocabularyFor(lang: string) {
  if (!import.meta.env?.DEV) return null;
  try {
    const mod = await import("../services/prototypeData");
    return mod.prototypeVocabulary(lang);
  } catch {
    return null;
  }
}
import { vocabularyMatches } from "../services/vocabularySession";
import { Collapse, ExportModule, exportFieldCls, exportGhostBtnCls, exportLabelCls, exportPrimaryBtnCls } from "./study/ExportModule";
import { historyService, slugify, type QuestionAttempt, type StoredAnkiCard, type StoredStudyContent } from "../services/historyService";
import { objectivesService, type ObjectivesCacheEntry } from "../services/objectivesService";
import { refineCustomObjective, type GeneratedObjective } from "../services/localAI";
import { HistoryPanel } from "./HistoryPanel";
import { usePersistedState } from "../hooks/usePersistedState";
import { useDockTheme } from "../contexts/ThemeContext";
import { contentBridge, type BridgeMessage } from "../services/contentBridge";
import { chromeLocalStorage, chromeStorage } from "../services/chromeStorage";
import { conceptDeckPath, kinemaTags } from "../services/ankiDesign";
import {
  buildSessionNoteMarkdown, buildSessionNotePath, buildRawSrtNoteMarkdown, buildRawSrtNotePath,
  createVaultScaffold, sessionExportKey,
  DEFAULT_OBSIDIAN_EXPORT_CONFIG, exportSessionToObsidian, loadCreatedMocs,
  loadObsidianExportConfig, loadObsidianExportedNotes, openObsidianUri,
  buildObsidianNewUri, buildObsidianOpenVaultUri,
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
}

interface StudyContent {
  relevance: { score: number; reason: string };
  /** C4: síntesis generativa (3-5 frases con palabras propias). */
  summary?: string;
  /** F2-2: conceptos enlazables entre cursos (nombres canónicos). */
  conceptTerms?: string[];
  keyConcepts: string[];
  quickWin: string;
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
    desc: "Desafío de alto nivel",
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
  { short: "Recordar",  hue: "#6d4aff", inkDark: "#b7a6ff", inkLight: "#5b37e8", icon: "compass",   title: "Lo que recuerdas",      sub: "Tu nivel y lo que recuerdas sin mirar" },
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
        <span className="kx-step-eyebrow text-[9.5px] font-extrabold tracking-[0.14em] uppercase">{m.short} · Paso {step + 1} de 4</span>
        <p className="kx-step-title text-[14px] font-bold leading-tight mt-0.5">{m.title}</p>
        <p className="kx-step-sub text-[11px] leading-snug mt-0.5">{m.sub}</p>
      </div>
    </div>
  );
}

// Línea de coach neutra por nivel — sin frases inventadas ni hype.
const COACH_LINE: Record<ConfidenceLevel, { icon: IconName; tip: string }> = {
  confused:  { icon: "compass", tip: "Sin problema: empezamos por la base y subimos desde ahí." },
  partial:   { icon: "target",  tip: "Normal en el primer intento; vamos a cerrar justo los puntos que faltaron." },
  clear:     { icon: "zap",     tip: "Bien. Ahora lo comprobamos con preguntas de aplicación." },
  mastered:  { icon: "flame",   tip: "Perfecto: te espera un desafío para confirmar el nivel." },
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
  if (keyConcepts.length < 4) issues.push("keyConcepts[4]");

  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  if (questions.length < 4) issues.push("questions[4]");
  questions.slice(0, 4).forEach((item, i) => {
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

  if (!asText(raw.quickWin)) issues.push("quickWin");
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
    ? raw.keyConcepts.map((v) => asText(v)).filter(Boolean).slice(0, 4)
    : fallback.keyConcepts;
  // C4/F2-2: summary y conceptTerms son opcionales y retrocompatibles.
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : undefined;
  const conceptTerms = Array.isArray(raw.conceptTerms)
    ? raw.conceptTerms.map((v) => asText(v)).filter(Boolean).slice(0, 5)
    : undefined;
  const questions = Array.isArray(raw.questions)
    ? raw.questions.slice(0, 4).map((item, i) => {
        const q = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const fb = fallbackQuestions[i] ?? fallbackQuestions[0];
        return {
          q: asText(q.q, fb.q),
          bloom: asText(q.bloom ?? q.bloomLevel, fb.bloom),
          difficulty: normalizeDifficulty(q.difficulty, questionDifficulties[i] ?? fb.difficulty),
          hint: asText(q.hint, fb.hint),
          answer: asText(q.answer, fb.answer),
          conceptRefs: normalizeConceptRefs(q.conceptRefs ?? q.concepts, fb.conceptRefs ?? [i % Math.max(1, keyConcepts.length)], keyConcepts.length),
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
        };
      })
    : [];

  return {
    relevance: {
      score: clampScore(relevance.score ?? fallback.relevance.score),
      reason: asText(relevance.reason, fallback.relevance.reason),
    },
    summary,
    conceptTerms,
    keyConcepts,
    quickWin: asText(raw.quickWin, fallback.quickWin),
    questions: questions.length >= 4 ? questions : fallback.questions,
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
    ankiCards: cards.length >= 3 ? cards : fallback.ankiCards,
  };
}

// §1.2: primera pregunta de la dificultad elegida; desempate por conceptos
// no marcados (los débiles primero). El contenido trae una por dificultad.
function pickStartQuestion(conf: ConfidenceLevel, cnt: StudyContent, unchecked: Set<number>): number {
  const candidates = cnt.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => q.difficulty === conf);
  const pool = candidates.length > 0
    ? candidates
    : cnt.questions.map((q, i) => ({ q, i })).filter(({ q }) => q.difficulty === DIFF_ORDER[Math.max(0, DIFF_ORDER.indexOf(conf) - 1)]);
  const pool2 = pool.length > 0 ? pool : cnt.questions.map((q, i) => ({ q, i }));
  const weakFirst = [...pool2].sort((a, b) => {
    const aWeak = (a.q.conceptRefs ?? []).some(r => unchecked.has(r)) ? 1 : 0;
    const bWeak = (b.q.conceptRefs ?? []).some(r => unchecked.has(r)) ? 1 : 0;
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
      title: "Pregunta de entrevista",
      subtitle: "Practica tu respuesta en voz alta",
      answerLabel: "Estructura de respuesta ideal",
    };
  }

  if (isProfessional) {
    return {
      title: "Explicación profesional",
      subtitle: "Practica cómo lo dirías en contexto real",
      answerLabel: "Estructura sugerida",
    };
  }

  return {
    title: "Explícalo en voz alta",
    subtitle: "Consolida la idea con tus palabras",
    answerLabel: "Estructura sugerida",
  };
}

export type AiState = "comprobando" | "no-config" | "lista" | "sin-respuesta";

/** Motivo, en una frase, de por que una accion de IA esta bloqueada. */
function aiBlockedMessage(state: AiState, endpoint: string): string {
  if (state === "no-config") return "Sin proveedor de IA: configúralo en Ajustes → Proveedor.";
  if (state === "comprobando") return "Comprobando la IA…";
  return `El proveedor no responde${endpoint ? ` (${endpoint})` : ""}. Reintentando…`;
}

function humanizeObjectivesError(error: string | null | undefined): string {
  // El vocabulario vive en un solo sitio (ai-providers) y habla del proveedor
  // REAL: estos mensajes nombraban a Gemini aunque el camino sea el configurado.
  if (!error) return "La IA no respondió. Revisa el proveedor en Ajustes o pulsa Regenerar.";
  const cfg = getAiProviderConfig();
  const ctx = { kind: cfg.kind, endpoint: cfg.baseUrl, model: cfg.model };
  const msg = error.toLowerCase();
  if (msg.includes("cortada a mitad") || msg.includes("max_tokens") || msg.includes("max tokens") || msg.includes("límite de tokens")) {
    return "La IA fue cortada a mitad de respuesta por el límite de tokens. Pulsa Regenerar — el siguiente intento usará más tokens.";
  }
  if (msg.includes("saturado") || msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded") || msg.includes("high demand")) {
    return "Gemini está saturado por alta demanda. Espera 1-2 minutos y vuelve a pulsar Regenerar.";
  }
  if (msg.includes("rate") && msg.includes("limit")) return "Gemini está limitando peticiones. Espera unos segundos y vuelve a intentarlo.";
  if (msg.includes("quota") || msg.includes("resource_exhausted")) return "Tu cuota de Gemini se agotó por hoy. Añade otra clave o espera al reset.";
  if (msg.includes("api key") || msg.includes("api_key") || (msg.includes("invalid") && msg.includes("key"))) {
    return describeProviderFailure(error, ctx);
  }
  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("err_")) return "Error de red al hablar con la IA. Revisa tu conexión y reintenta.";
  if (msg.includes("background")) return "No se pudo contactar con el background de la extensión. Recarga la página de Udemy.";
  if (msg.includes("parse") || msg.includes("json") || msg.includes("formato no era válido")) return "La IA respondió pero el formato no era válido. Pulsa Regenerar para reintentar.";
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
    { label: "Comparando con los conceptos…",     icon: "brain" as IconName },
    { label: "Generando feedback personalizado…",  icon: "edit3" as IconName },
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
        <span className="text-white/14 text-[9px] font-mono tracking-wider shrink-0">IA</span>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Feedback v2.0 — verdict hero + structured content + contextual actions
// ─────────────────────────────────────────────────────────────────────────────
function AIFeedback({
  fb, onRetry, onShowHint, onShowModel, onClearAnswer,
}: {
  fb: FeedbackState;
  onRetry?: () => void;
  onShowHint?: () => void;
  onShowModel?: () => void;
  onClearAnswer?: () => void;
}) {
  if (fb.status === "idle") return null;
  if (fb.status === "loading") return <AIAnalyzingLoader />;

  // ── Error ────────────────────────────────────────────────────────────────
  if (fb.status === "error") return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="border border-red-500/18 bg-red-500/5 rounded-xl overflow-hidden"
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="w-8 h-8 rounded-xl bg-red-500/12 border border-red-500/20 flex items-center justify-center shrink-0">
          <WifiOff size={12} className="text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-red-300/85 text-[11px]" style={{ fontWeight: 600 }}>Sin conexión con la IA local</p>
          <p className="text-red-300/45 text-[10px] mt-0.5 leading-relaxed">{fb.content}</p>
        </div>
      </div>
      {onRetry && (
        <div className="px-3.5 pb-3">
          <button onClick={onRetry}
            className="w-full flex items-center justify-center gap-1.5 text-[10px] text-red-300/70 hover:text-red-300 border border-red-500/18 hover:border-red-500/30 py-1.5 rounded-lg transition-all">
            <Loader2 size={9} />Reintentar conexión
          </button>
        </div>
      )}
    </motion.div>
  );

  // (second error block removed — duplicate dead code, handled above)

  const isStreaming = fb.status === "streaming";
  const rating = fb.rating ?? "unknown";

  // ── Verdict config ────────────────────────────────────────────────────────
  const VERDICT = {
    correct:   { heroText: "text-emerald-300", heroBg: "bg-emerald-500/10", heroBorder: "border-emerald-500/20", heroIconBg: "bg-emerald-500/18 border-emerald-500/30", icon: "checkCircle2" as IconName, label: "Correcto",    sublabel: "Tu comprensión está en el camino correcto.", ring: "border-emerald-500/22",   cardBg: "bg-emerald-500/[0.04]" },
    excellent: { heroText: "text-violet-300",  heroBg: "bg-violet-500/10",  heroBorder: "border-violet-500/20",  heroIconBg: "bg-violet-500/18 border-violet-500/30",  icon: "target" as IconName, label: "Excelente",   sublabel: "Dominas este concepto. Respuesta completa.",       ring: "border-violet-500/22", cardBg: "bg-violet-500/[0.05]"  },
    partial:   { heroText: "text-amber-300",   heroBg: "bg-amber-500/8",    heroBorder: "border-amber-500/18",   heroIconBg: "bg-amber-500/15 border-amber-500/28",    icon: "zap" as IconName, label: "Parcial",     sublabel: "Vas bien — hay algunos gaps por cerrar.",          ring: "border-amber-500/20", cardBg: "bg-amber-500/[0.04]"   },
    wrong:     { heroText: "text-rose-300",    heroBg: "bg-rose-500/7",     heroBorder: "border-rose-500/16",    heroIconBg: "bg-rose-500/14 border-rose-500/25",      icon: "messageSquare" as IconName, label: "Revisemos",   sublabel: "Todavía no llegaste. La IA te explica por qué.",  ring: "border-rose-500/18",   cardBg: "bg-rose-500/[0.04]"    },
    unknown:   { heroText: "text-violet-300",  heroBg: "bg-violet-500/7",   heroBorder: "border-violet-500/15",  heroIconBg: "bg-violet-500/14 border-violet-500/25",  icon: "sparkles" as IconName, label: "Evaluando…",  sublabel: "",                                                  ring: "border-violet-500/15",                                         cardBg: "bg-violet-500/[0.04]"  },
  } as const;
  const v = VERDICT[isStreaming ? "unknown" : (rating as keyof typeof VERDICT)] ?? VERDICT.unknown;

  const showActions = fb.status === "done";
  const needsWork = rating === "partial" || rating === "wrong" || rating === "unknown";
  const paragraphs = (fb.content || "").split(/\n{2,}|\n(?=\s*[-*•]\s)/).map(p => p.trim()).filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-xl border overflow-hidden ${v.ring} ${v.cardBg}`}
    >
      {/* ── Verdict hero band ── */}
      <div className={`flex items-center gap-3 px-3.5 py-3 ${v.heroBg} border-b ${v.heroBorder}`}>
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${v.heroIconBg} ${v.heroText}`}>
          {isStreaming
            ? <Loader2 size={15} className="animate-spin" />
            : <Icon name={v.icon} size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] ${v.heroText}`} style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>{v.label}</p>
          {v.sublabel && <p className="text-white/45 text-[10.5px] mt-0.5 leading-snug">{v.sublabel}</p>}
        </div>
        {fb.isMock && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-300 shrink-0">Local</span>
        )}
      </div>

      {/* ── Structured content ── */}
      <div className="px-3.5 py-3 space-y-2">
        {paragraphs.length === 0 && isStreaming && (
          <p className="text-white/35 text-[11px]">Analizando tu respuesta…</p>
        )}
        {paragraphs.map((p, i) => {
          const isBullet = /^\s*[-*•]\s+/.test(p);
          const textOnly = p.replace(/^\s*[-*•]\s+/, "");
          return isBullet ? (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-[7px] h-1 w-1 rounded-full bg-violet-400/70 shrink-0" aria-hidden="true" />
              <p className="text-white/70 text-[11.5px] leading-relaxed">{renderInline(textOnly)}</p>
            </div>
          ) : (
            <p key={i} className="text-white/70 text-[11.5px] leading-relaxed">
              {renderInline(textOnly)}
              {isStreaming && i === paragraphs.length - 1 && (
                <span className="inline-block w-[5px] h-[12px] ml-0.5 align-middle bg-violet-400/70" />
              )}
            </p>
          );
        })}
      </div>

      {/* ── Contextual actions ── */}
      {showActions && (onRetry || onShowHint || onShowModel || onClearAnswer) && (
        <div className="px-3.5 pb-3 flex flex-wrap gap-1.5">
          {needsWork && onClearAnswer && (
            <button onClick={onClearAnswer}
              className="flex items-center gap-1.5 text-[10px] text-white/60 hover:text-white border border-white/10 hover:border-white/20 px-2.5 py-1.5 rounded-lg transition-all">
              <Edit3 size={10} />Reescribir
            </button>
          )}
          {needsWork && onShowHint && (
            <button onClick={onShowHint}
              className="flex items-center gap-1.5 text-[10px] text-amber-300/80 hover:text-amber-300 border border-amber-500/20 hover:border-amber-500/35 px-2.5 py-1.5 rounded-lg transition-all">
              <Zap size={10} />Ver pista
            </button>
          )}
          {onShowModel && (
            <button onClick={onShowModel}
              className="flex items-center gap-1.5 text-[10px] text-violet-300/80 hover:text-violet-300 border border-violet-500/20 hover:border-violet-500/35 px-2.5 py-1.5 rounded-lg transition-all">
              <BookOpen size={10} />Respuesta modelo
            </button>
          )}
          {onRetry && fb.isMock && (
            <button onClick={onRetry}
              className="flex items-center gap-1.5 text-[10px] text-white/60 hover:text-white border border-white/10 hover:border-white/20 px-2.5 py-1.5 rounded-lg transition-all">
              <RotateCcw size={10} />Reevaluar con IA
            </button>
          )}
        </div>
      )}
    </motion.div>
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
      tags: kinemaTags({ course, lesson, type: c.type, aiTags: c.tags, reinforce: c.reinforce, origin: c.reinforce ? "study" : undefined }),
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
// o la cantidad. Las de refuerzo llevan el prefijo "study:" (§3), así que
// una tarjeta de refuerzo y la generada por IA no colisionan nunca.
function stableAnkiGuid(course: string, lesson: string, card: { front: string; reinforce?: boolean }): string {
  const source = `${sanitizeDeckSegment(course)}|${sanitizeDeckSegment(lesson)}|${card.reinforce ? "study:" : ""}${card.front}`;
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
      score: 76,
      reason: `Plantilla local: «${topic}» sostiene lo que viene después en «${course}». Conectarlo con tu objetivo hoy evita releerlo mañana.`,
    },
    keyConcepts: [
      `Idea central de «${topic}»: qué problema resuelve y en qué contexto se usa.`,
      `Cómo funciona por dentro: las piezas o pasos que hacen que «${topic}» haga lo que hace.`,
      `Cuándo aplicarlo y cuándo no: límites, errores comunes y alternativas.`,
    ],
    quickWin: `Explica «${topic}» en dos frases, sin mirar, como si se lo contaras a un colega.`,
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
    interviewQ: {
      q: `Si te preguntaran sobre «${topic}» en una entrevista, ¿cómo lo explicarías en 60 segundos?`,
      idealAnswer: `1) Qué es y qué problema resuelve. 2) Cómo funciona en una frase. 3) Un ejemplo real. 4) Un límite o trade-off.`,
    },
    nextAction: `Antes de la siguiente clase, vuelve a explicar «${topic}» sin apuntes y anota lo que dudaste.`,
    ankiCards: [
      { id: "card-001", type: "concepto", front: `¿Qué problema resuelve «${topic}»?`, back: `Resuelve la necesidad central del tema dentro de «${course}». Explícalo con un ejemplo propio.`, tags },
      { id: "card-002", type: "proceso", front: `¿Cómo funciona «${topic}», paso a paso?`, back: `Piezas clave en orden: entrada, transformación y resultado. Di qué hace cada una.`, tags },
      { id: "card-003", type: "comparacion", front: `¿Cuándo usar «${topic}» y cuándo evitarlo?`, back: `Úsalo cuando encaja con tu objetivo (${goal}); evítalo cuando sus límites lo hacen costoso o frágil.`, tags },
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
function VerifyDoneReview({
  questions, answers, feedbacks, onGoApply,
}: {
  questions: StudyContent["questions"];
  answers: Record<number, string>;
  feedbacks: Record<number, FeedbackState>;
  onGoApply: () => void;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {questions.map((q, i) => {
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
              <span className={`h-2 w-2 rounded-full shrink-0 ${tone}`} />
              <span className="flex-1 min-w-0 text-[11px] font-semibold text-[var(--usb-fg-hi)] leading-snug">{q.q}</span>
              <ChevronDown size={13} className={`text-[var(--usb-fg-lo)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-2">
                    {answers[i] ? (
                      <div className="rounded-xl bg-[var(--usb-bg-3)] border border-[var(--usb-border)] px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--usb-fg-lo)] mb-1">Tu respuesta</p>
                        <p className="text-[11.5px] text-[var(--usb-fg-mid)] leading-relaxed whitespace-pre-wrap">{answers[i]}</p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--usb-fg-lo)]">Sin respuesta registrada.</p>
                    )}
                    {fb && fb.status === "done" && <AIFeedback fb={fb} />}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      <button
        onClick={onGoApply}
        className="w-full flex items-center justify-center gap-1.5 text-[11px] text-violet-200 bg-violet-500/14 hover:bg-violet-500/22 border border-violet-500/28 py-2.5 rounded-xl transition-all"
        style={{ fontWeight: 600 }}
      >
        Continuar a Aplicar<ArrowRight size={12} />
      </button>
    </div>
  );
}

// ─── Anki flip-card preview ───────────────────────────────────────────────────
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
            {card.reinforce && (
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
            {flipped ? card.back : card.front}
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
  const [appAttempts, setAppAttempts]               = useState(0);
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
  const [showModelAnswer, setShowModelAnswer]       = useState(false);
  const [questionAnswers, setQuestionAnswers]       = useState<Record<number, string>>({});
  const [questionFeedbacks, setQuestionFeedbacks]   = useState<Record<number, FeedbackState>>({});
  const [currentQIdx, setCurrentQIdx]               = useState(0);
  // §1.2: cola adaptativa de preguntas (índices canónicos de content.questions).
  const [questionQueue, setQuestionQueue]           = useState<number[]>([]);
  const [questionsComplete, setQuestionsComplete]   = useState(false); // paso 2 terminado (respondido o saltado)
  const [questionsSkipped, setQuestionsSkipped]     = useState(false);
  const [challengeUsed, setChallengeUsed]           = useState(false); // «Un reto más» ya usado
  // §1.3: el paso Aplicar nunca bloquea; «Hacerlo después» cuenta como pendiente.
  const [practiceStatus, setPracticeStatus]         = useState<"done" | "correct" | "later" | null>(null);
  // §1.4: finished = finishedAt != null — exportar ya no es requisito.
  const [finishedAt, setFinishedAt]                 = useState<number | null>(null);
  const [showOralPractice, setShowOralPractice]     = useState(false);
  // §1.5: indicador REAL de transcripción en la pantalla de objetivo.
  // §1.5: fuera de runtime (vista previa web) no hay bridge que consultar:
  // el estado nace "preview" y la tira lo dice en vez de «Comprobando…» eterno.
  const [transcriptState, setTranscriptState]       = useState<{ status: "checking" | "ready" | "waiting" | "none" | "preview"; cues: number | null }>(IS_EXTENSION ? { status: "checking", cues: null } : { status: "preview", cues: null });
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
  const [oralSkipped, setOralSkipped]               = useState(false);
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
  const openObsidianSettings = () => window.dispatchEvent(new CustomEvent("usb:open-settings", { detail: { section: "obsidian" } }));
  const [obsidianHelpOpen, setObsidianHelpOpen]   = useState(false);
  const [obsidianStatus, setObsidianStatus]       = useState<"idle" | "done" | "error">("idle");
  const [createdMocs, setCreatedMocs]             = useState<string[]>([]);
  const [exportedNotes, setExportedNotes]                    = useState<string[]>([]);
  const [obsidianExportedAt, setObsidianExportedAt]           = useState<number | null>(null);

  // Focus navigator (one step at a time)
  const [focusStep, setFocusStep] = useState(0);
  const [focusDir,  setFocusDir]  = useState(1);

  // Gamification & Dopamine state
  const [sessionXp, setSessionXp]       = useState(0);
  const [streakCount, setStreakCount]   = useState(() => getStreak());
  const [userProgress, setUserProgress] = useState(() => getProgress());
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>([]);

  // Refs
  const sessionStartRef    = useRef<number>(Date.now());
  const selectedObjRef     = useRef(selectedObj);
  const courseNameEditedRef = useRef(false);
  const objectivesForRef   = useRef<string>("");
  const rehydratedKeyRef   = useRef<string>("");
  const obsidianAutoRef    = useRef(false);
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
        setTranscriptState({ status: "ready", cues: res.cueCount });
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
  }, [phase, courseName, lessonName]);

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

  // Sondeo de disponibilidad: al montar, al cambiar la configuración y con
  // reintento (5 s si no está lista, 30 s si lo está). Así el botón se habilita
  // solo en cuanto la IA aparece, sin recargar.
  useEffect(() => {
    if (!IS_EXTENSION) { setAiState("lista"); return; }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const probe = async () => {
      try {
        const res = await sendRuntimeMessage<{ ok?: boolean; configured?: boolean; ok2?: boolean; endpoint?: string; okHealth?: boolean } & { ok?: boolean; configured?: boolean; endpoint?: string; status?: number }>({ type: "USG_PROVIDER_HEALTH" });
        if (!alive) return;
        const healthy = Boolean(res?.ok);
        const configured = res?.configured !== false;
        setAiEndpoint(res?.endpoint ?? "");
        const next = !configured ? "no-config" : healthy ? "lista" : "sin-respuesta";
        setAiState(next);
        window.dispatchEvent(new CustomEvent("usb:ai-health", { detail: { ok: healthy, configured } }));
        timer = setTimeout(probe, healthy ? 30000 : 5000);
      } catch {
        if (!alive) return;
        setAiState("sin-respuesta");
        window.dispatchEvent(new CustomEvent("usb:ai-health", { detail: { ok: false, configured: true } }));
        timer = setTimeout(probe, 5000);
      }
    };
    void probe();
    const onConfig = () => { setAiState("comprobando"); void probe(); };
    window.addEventListener("usb:provider-changed", onConfig);
    return () => { alive = false; if (timer) clearTimeout(timer); window.removeEventListener("usb:provider-changed", onConfig); };
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
          generationError = "No hubo respuesta del motor de IA. Configura Gemini o inicia la IA local y reintenta.";
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
      setPhase("result");

      // Auto-export a Obsidian (si está activado y el vault está configurado).
      // Solo tras generar en vivo, nunca al restaurar del historial.
      if (obsidianCfg.autoExport && obsidianCfg.vaultName.trim() && !obsidianAutoRef.current) {
        obsidianAutoRef.current = true;
        setTimeout(() => handleExportObsidian(), 1200);
      }

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
          ? "Usamos una plantilla local porque no se pudo completar la generación con IA."
          : "Analizamos la lección y preparamos tu plan de dominio.",
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
      setPhase("result");
      toast.warning("Sesión provisional", {
        description: "No se pudo generar con IA; usamos una plantilla local para no bloquearte.",
        icon: <WifiOff className="text-amber-400" size={18} />,
      });
    }
  };

  // Rebuild in-memory session state from a persisted history record.
  const rehydrateFromRecord = useCallback((rec: import("../services/historyService").LectureHistoryRecord) => {
    // generateContent is deterministic on (objective, course, lesson)
    const obj = rec.objective || customObj || selectedObj;
    sessionCelebratedRef.current = true;
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
    const canonicalQuestions = rec.questions
      .map((a) => a.prompt)
      .map((prompt) => (prompt ? restored.questions.findIndex((q) => q.q === prompt) : -1))
      .filter((i) => i >= 0);
    const restoredQueue = canonicalQuestions.length > 0
      ? canonicalQuestions
      : restoredConfidence
        ? [pickStartQuestion(restoredConfidence, restored, new Set(Array.isArray(rec.checkedConceptIndexes) ? rec.checkedConceptIndexes : []))]
        : [];

    const answers: Record<number, string> = {};
    const feedbacks: Record<number, FeedbackState> = {};

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
      }
    });

    setQuestionAnswers(answers);
    setQuestionFeedbacks(feedbacks);
    setQuestionQueue(restoredQueue);
    setCurrentQIdx(Object.keys(feedbacks).length);

    const checkedConceptIndexes = Array.isArray(rec.checkedConceptIndexes) ? rec.checkedConceptIndexes : [];
    setConceptsChecked(Object.fromEntries(checkedConceptIndexes.map((idx) => [idx, true])));
    setConceptsAcknowledged(Boolean(rec.conceptsAcknowledged));
    setRecallNotes(rec.recallNotes ?? "");
    if (rec.recallNotes || rec.confidence) setRecallRevealed(true);

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
    if (hasCodeChallenge) { setAppAttempts(2); appRewardedRef.current = true; }
    setPracticeStatus(rec.practiceStatus ?? (hasCodeChallenge ? "done" : null));
    setQuestionsComplete(Boolean(rec.questionsDone));
    setQuestionsSkipped(Boolean(rec.questionsSkipped));
    setFinishedAt(rec.finishedAt ?? null);
    // Exportaciones previas restauran su estado sin completar la lección:
    // terminar es una acción explícita (§1.4).
    const hasAnkiExport = Boolean(rec.ankiCards && rec.ankiCards.length > 0);
    if (hasAnkiExport) { setAnkiExported(true); setOralSkipped(true); }
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
            return stored ? { ...c, reinforce: stored.reinforce, excluded: stored.excluded } : c;
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
        toast.warning("No se pudo refinar con IA", {
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

  const handleReset = () => {
    // §2: confirmación en el propio header (confirmingReset) — sin diálogos nativos.
    setPhase("objective"); setContent(null); setConfidence(null);
    setActiveSessionObjective(null);
    setConceptsChecked({}); setAppAnswer(""); setAppFeedback(IDLE_FB);
    setConceptsAcknowledged(false);
    setShowAppSolution(false); setShowAppHint(false); setAppAttempts(0); appRewardedRef.current = false; setQuestionAnswers({}); setQuestionFeedbacks({});
    setCurrentQIdx(0); setQuestionsComplete(false); setQuestionsSkipped(false); setChallengeUsed(false);
    setQuestionQueue([]); setPracticeStatus(null); setFinishedAt(null); setShowOralPractice(false);
    setPendingLevelUp(null); setPendingUnlocked([]);
    firstTryCorrectRef.current.clear();
    setAnkiExported(false); setShowAnkiGuide(false); setShowHint(false);
    setShowModelAnswer(false); setShowInterviewAnswer(false); setOralAnswer(""); setOralFeedback(IDLE_FB); setOralSkipped(false); setRecallRevealed(false); setRecallNotes("");
    qRewardedRef.current.clear(); conceptRewardedRef.current.clear();
    setApkgStatus("idle"); setApkgProgress("");
    setFocusStep(0); setFocusDir(1);
    sessionCelebratedRef.current = false;
    sessionStartRef.current = Date.now();
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
    firstTryCorrectRef.current.clear();
    setQuestionAnswers({});
    setQuestionFeedbacks({});
    setShowHint(false);
    setConceptsAcknowledged(false);
    setShowModelAnswer(false);
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
    setShowModelAnswer(false);
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
      return {
        prompt: cq.q,
        answer: vi >= 0 ? questionAnswers[vi] ?? "" : "",
        rating: f?.rating,
        feedback: f?.content,
        answeredAt: vi === idx ? Date.now() : undefined,
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

    // §1.2: correcta a la primera en la pregunta inicial → paso completado (con
    // «Un reto más» opcional). Cualquier pregunta de consolidación/reto
    // (idx > 0) completa el paso con su resultado, sea cual sea.
    const isFirstQuestion = idx === 0;
    if ((isGoodNow && isFirstQuestion) || idx > 0) {
      setQuestionsComplete(true);
      persistQuestionsDone(false);
    }

    // NO auto-advance — the user reads the feedback and clicks "Siguiente" manually
    setTimeout(() => scrollToBottom(), 120);
  };

  // §1.2: consolidación — tras fallar, «Siguiente» trae una pregunta del nivel
  // anterior; con esa (sea cual sea el resultado) el paso se completa (máx. 2).
  const goNextQuestion = (idx: number) => {
    if (!content) return;
    const current = queueQuestions[idx];
    const used = new Set(questionQueue);
    const currentDiff = DIFF_ORDER.indexOf(current?.difficulty ?? "partial");
    const lowerDiff = DIFF_ORDER[Math.max(0, currentDiff - 1)];
    const candidate = content.questions
      .map((q, i) => ({ q, i }))
      .filter(({ q, i }) => !used.has(i) && q.difficulty === lowerDiff)
      .sort((a, b) => {
        const unchecked = new Set(content.keyConcepts.map((_, i) => i).filter(i => !conceptsChecked[i]));
        const aWeak = (a.q.conceptRefs ?? []).some(r => unchecked.has(r)) ? 1 : 0;
        const bWeak = (b.q.conceptRefs ?? []).some(r => unchecked.has(r)) ? 1 : 0;
        return bWeak - aWeak;
      })[0];
    if (candidate) {
      setQuestionQueue(prev => [...prev, candidate.i]);
      setCurrentQIdx(idx + 1);
      setShowHint(false);
      setShowModelAnswer(false);
    } else {
      // Sin candidata (p. ej. en confused) → el paso se completa igual.
      setQuestionsComplete(true);
      persistQuestionsDone(false);
    }
  };

  // «Un reto más» (opcional): la pregunta del nivel siguiente, si existe.
  const goChallengeQuestion = () => {
    if (!content || challengeUsed) return;
    const used = new Set(questionQueue);
    const topDiff = DIFF_ORDER.length - 1;
    const candidate = content.questions
      .map((q, i) => ({ q, i }))
      .filter(({ q, i }) => !used.has(i) && DIFF_ORDER.indexOf(q.difficulty) === topDiff)[0]
      ?? content.questions.map((q, i) => ({ q, i })).filter(({ i }) => !used.has(i))[0];
    if (candidate) {
      setChallengeUsed(true);
      setQuestionQueue(prev => [...prev, candidate.i]);
      setCurrentQIdx(queueQuestions.length);
      setShowHint(false);
      setShowModelAnswer(false);
    }
  };

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

  // «Saltar» (único camino del toast «Evaluación saltada»).
  const handleSkipQuestions = () => {
    setQuestionsComplete(true);
    setQuestionsSkipped(true);
    persistQuestionsDone(true);
    toast.message("Evaluación saltada", { icon: <FastForward className="text-violet-400" size={18} /> });
  };

  const handleEvalApp = async () => {
    if (!content || !appAnswer.trim()) return;
    setAppFeedback({ status: "loading", content: "", rating: "unknown" });

    // Attempt streaming code review first
    const aiContext = getStudyAIContext(content);
    const res = await evaluateCodeSolutionStream(
      content.application.setup, content.application.solution, appAnswer,
      (_, accumulated) => {
        setAppFeedback(prev => ({ status: "streaming", content: accumulated, rating: "unknown", isMock: prev.isMock }));
      },
      aiContext,
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
        setAppAttempts(n => n + 1);
        markAttempted();
        const isGood = fallback.rating === "correct" || fallback.rating === "excellent";
        setPracticeStatus(prev => (prev === "correct" ? prev : isGood ? "correct" : "done"));
        if (isGood && firstAttempt) markCorrect(content.application.isCode ? 20 : 0);
        persistCode(fb.rating, fb.content);
      }
      return;
    }

    setAppFeedback({ status: "done", content: res.content, rating: res.rating, isMock: res.isMock });
    setAppAttempts(n => n + 1);
    markAttempted();
    const isGood = res.rating === "correct" || res.rating === "excellent";
    setPracticeStatus(prev => (prev === "correct" ? prev : isGood ? "correct" : "done"));
    if (isGood && firstAttempt) markCorrect(content.application.isCode ? 20 : 0);
    persistCode(res.rating, res.content);
    // §1.3: sin banner «¡Sesión completada!» — el cierre ocurre en Fijar.
  };

  // §1.3: «Hacerlo después» — el estudiante decide; queda marcado como pendiente.
  const handlePracticeLater = () => {
    setPracticeStatus(prev => prev ?? "later");
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      practiceStatus: "later",
      focusStep: 2,
    }).catch(err => console.error("[history] upsert practice later", err));
    goToStep(3);
  };


  const handleEvaluateOral = async () => {
    if (!content?.interviewQ || !oralAnswer.trim() || oralFeedback.status === "loading" || oralFeedback.status === "streaming") return;
    const q = content.interviewQ;
    const aiContext = getStudyAIContext(content);
    setOralFeedback({ status: "loading", content: "", rating: "unknown" });
    const res = await evaluateActiveAnswerStream(
      q.q, q.idealAnswer, oralAnswer, "aplicar",
      (_, acc) => setOralFeedback({ status: "streaming", content: acc, rating: "unknown" }),
      aiContext,
    );
    if (res.success && res.content.trim()) {
      setOralFeedback({ status: "done", content: res.content, rating: res.rating, isMock: res.isMock });
      return;
    }
    const fallback = await evaluateActiveAnswer(q.q, q.idealAnswer, oralAnswer, "aplicar", aiContext);
    setOralFeedback({ status: fallback.success ? "done" : "error", content: fallback.success ? fallback.content : (fallback.error ?? "Error"), rating: fallback.rating, isMock: fallback.isMock });
  };

  // C3: marca la sesión como exportada a OBSIDIAN, sin tocar exportedAt (que
  // alimenta el «en Anki» del historial). Exportar NO completa la lección:
  // terminar es la acción explícita «Terminar lección» (§1.4).
  const persistObsidianExport = () => {
    if (!content) return;
    const cards: StoredAnkiCard[] = content.ankiCards.map(c => ({
      id: c.id, front: c.front, back: c.back, tags: c.tags, type: c.type,
      conceptRefs: c.conceptRefs, reinforce: c.reinforce, excluded: c.excluded,
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
      });
      const guids = allCardsWithReinforce.filter(c => !c.excluded).map(c => stableAnkiGuid(courseName, lessonName, c));
      setApkgStatus("done");
      setAnkiExported(true);
      markQa("apkg-done:" + deckName.slice(0, 60));
      // §3: el aviso de reexportación solo si el CONJUNTO de tarjetas cambió.
      try {
        const rec = await historyService.getLecture(slugify(courseName), slugify(lessonName));
        const prev = rec?.exportedGuids;
        if (prev && (prev.length !== guids.length || prev.some((g, i) => g !== guids[i]))) {
          toast.info("Ya exportaste otra versión de esta lección", {
            description: "Anki conservará las anteriores. Si solo quieres las nuevas, borra el mazo de la lección antes de importar.",
            duration: 12000,
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
    const response = await sendRuntimeMessage<{ ok?: boolean; payload?: unknown; error?: string }>({
      type: "USG_GENERATE_VOCABULARY", transcriptText: transcript.transcriptText,
      course: courseName, lesson: lessonName, targetLang: vocabCfg.targetLangLabel,
      baseLang: vocabCfg.baseLangLabel, minLevel: vocabCfg.minLevel, maxWords: 20,
    });
    if (!response?.ok) throw new Error(response?.error || "La generación requiere la extensión y un motor de IA disponible. Puedes probar la demo sin exportar.");
    const words = parseVocabularyPayload(response.payload).filter(word => vocabularyMatches(word.word, transcript.transcriptText ?? ""));
    if (!words.length) throw new Error("La IA no devolvió palabras presentes en los subtítulos. Revisa el idioma objetivo y la transcripción.");
    return { words, partial: Boolean(transcript.truncated || transcript.transcriptTruncated) };
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
    return {
      courseName,
      lessonName,
      objective: getActiveObjectiveText() || undefined,
      sourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      platform: "udemy",
      ankiDeck: conceptDeckPath(vocabCfg.rootDeck || "Kinema", courseName, lessonName),
      recallNotes: recallNotes.trim() || undefined,
      weakPoints: weakPoints.length > 0 ? weakPoints : undefined,
      result: buildResultSummary(),
      content: content as ObsidianSessionData["content"],
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
    // Guard de duplicados: obsidian://new sobre un archivo existente crea
    // "nombre 1.md". Si ya se exportó esta sesión, avisar y dejar decidir.
    // (Ref, no state: el guard debe ver las marcas aunque el closure sea viejo.)
    const key = sessionExportKey(data.courseName, data.lessonName);
    if (exportedNotesRef.current.includes(key)) {
      markQa("exportar-guard");
      toast.warning("Esta sesión ya fue exportada a Obsidian", {
        description: "Reemplazar nota pisa también lo que hayas escrito en esa nota. «Copiar» te da el markdown sin tocar nada.",
        action: { label: "Reemplazar nota", onClick: () => doExportObsidian(data, false, { overwrite: true }) },
        duration: 10000,
        icon: <BookMarked className="text-amber-400" size={18} />,
      });
      return;
    }
    doExportObsidian(data, true);
  };

  const doExportObsidian = async (data: ObsidianSessionData, markExported: boolean, options: { overwrite?: boolean } = {}) => {
    try {
      // C8: si va a viajar el SRT crudo, pedirlo ANTES de abrir la primera URI
      // (el fetch es asíncrono y después perderíamos el gesto del clic).
      const srt = obsidianCfg.includeRawSrt ? await fetchEnSrtForExport() : "";
      const result = exportSessionToObsidian(data, obsidianCfg, {
        createdMocs,
        onMocCreated: (key) => {
          const next = [...createdMocs, key];
          setCreatedMocs(next);
          void saveCreatedMocs(next);
        },
        overwrite: options.overwrite,
      });
      setObsidianStatus("done");
      // C3: exportar a Obsidian NO marca la lección como «en Anki» — estados
      // separados. §2: XP de exportación compartido, una vez por lección.
      setObsidianExportedAt(Date.now());
      persistObsidianExport();
      celebrate({ type: "export_done", silent: true, rewardKey: `export::${slugify(courseName)}::${slugify(lessonName)}`, title: "Exportado a Obsidian" });
      toast.success("Exportado a Obsidian", {
        description: result.mocPath
          ? `Nota: ${result.notePath} · MOC: ${result.mocPath}`
          : `Nota: ${result.notePath}`,
        icon: <BookMarked className="text-violet-400" size={18} />,
      });
      setTimeout(() => setObsidianStatus("idle"), 4000);
      if (markExported) {
        const key = sessionExportKey(data.courseName, data.lessonName);
        const next = [...new Set([...exportedNotesRef.current, key])];
        exportedNotesRef.current = next;
        setExportedNotes(next);
        void saveObsidianExportedNotes(next);
      }

      // SRT crudo → raw/ (material inmutable para el destilado posterior).
      // El SRT ya se pidió antes de la primera URI (C8).
      if (obsidianCfg.includeRawSrt) {
        if (!srt) {
          toast.info("SRT crudo no disponible todavía — raw/ omitido en esta exportación.");
        } else {
          const rawPath = buildRawSrtNotePath(data.courseName, data.lessonName, { platform: "udemy" });
          openObsidianUri(buildObsidianNewUri(obsidianCfg.vaultName, {
            path: rawPath,
            markdown: buildRawSrtNoteMarkdown(data.courseName, data.lessonName, srt, {
              platform: "udemy",
              sourceUrl: data.sourceUrl,
            }),
          }));
          toast.success("SRT crudo guardado en raw/", { description: rawPath });
        }
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
  const transcriptBlocksCta = IS_EXTENSION && (transcriptState.status === "none" || transcriptState.status === "waiting");

  // ── Focus navigator helpers (flowVersion 2: 4 pasos) ─────────────────────
  const stepUnlocked = [
    true,                     // 0 Recordar
    confidence !== null,      // 1 Comprobar
    questionsComplete,        // 2 Aplicar
    questionsComplete,        // 3 Fijar (Aplicar no bloquea: «Hacerlo después» cuenta)
  ] as const;

  const canGoNext = focusStep < 3 && stepUnlocked[focusStep + 1 as 0|1|2|3];
  const canGoPrev = focusStep > 0;

  const goToStep = (target: number) => {
    if (target < 0 || target > 3) return;
    if (!stepUnlocked[target as 0|1|2|3]) return;
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
    { label: STEP_META[3].short, done: finishedAt !== null, active: showApply },
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
  const calibration = useMemo(() => {
    if (!content || !confidence || queueQuestions.length === 0) return null;
    const firstTryCorrect = queueQuestions.filter((q) => firstTryCorrectRef.current.has(q.q));
    const shownIdx = firstTryCorrect.length > 0
      ? Math.max(...firstTryCorrect.map(q => DIFF_ORDER.indexOf(q.difficulty)))
      : Math.max(0, DIFF_ORDER.indexOf(confidence) - 1);
    const saidIdx = DIFF_ORDER.indexOf(confidence);
    const label = (i: number) => CONFIDENCE.find(c => c.id === DIFF_ORDER[i])?.label ?? "";
    const diff = shownIdx - saidIdx;
    const message = diff === 0
      ? "Tu autoevaluación fue precisa."
      : diff < 0
        ? "Te sentías más seguro de lo que mostraste; justo eso repasarás en Anki."
        : "Sabes más de lo que creías; la próxima vez empieza un nivel más arriba.";
    return { said: label(saidIdx), shown: label(shownIdx), message };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, confidence, questionQueue, questionFeedbacks]);

  // ── §1.4: resumen de cierre con datos reales ─────────────────────────────
  const firstTryCount = queueQuestions.filter((q) => firstTryCorrectRef.current.has(q.q)).length;
  const improvedCount = queueQuestions.filter((_, i) => {
    const fb = questionFeedbacks[i];
    return fb?.status === "done" && (fb.rating === "correct" || fb.rating === "excellent");
  }).length - firstTryCount;
  const resultTitle = (() => {
    const totalQ = queueQuestions.length;
    const practiceOk = practiceStatus === "correct";
    const practiceLater = practiceStatus === null || practiceStatus === "later";
    if (totalQ > 0 && firstTryCount === totalQ && practiceOk) return "Lección dominada";
    if (firstTryCount < totalQ || practiceLater) return "Lección completada · con puntos a reforzar";
    return "Lección completada";
  })();

  const buildResultSummary = (): import("../services/obsidianExport").StudyResultSummary => {
    const selected = content?.ankiCards.filter(c => !c.excluded) ?? [];
    const reinforceCount = selected.filter(c => c.reinforce).length;
    const destination: "anki" | "obsidian" | "none" = ankiExported ? "anki" : obsidianExportedAt ? "obsidian" : "none";
    return {
      title: resultTitle,
      remembered: { count: conceptsMarkedCount, total: content?.keyConcepts.length ?? 0 },
      check: { firstTry: firstTryCount, improved: Math.max(0, improvedCount), skipped: questionsSkipped },
      practice: practiceStatus === "correct" ? "correct" : practiceStatus === "done" ? "done" : "later",
      calibration: calibration ? { said: calibration.said, shown: calibration.shown, message: calibration.message } : undefined,
      cards: { total: selected.length, reinforce: reinforceCount, destination },
    };
  };

  // ── §3: conceptos débiles → tarjetas de refuerzo (máx. 2 nuevas) ──────────
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
      reinforce: (c.conceptRefs ?? []).some(r => weak.has(r)) || Boolean(c.reinforce),
    }));
    const covered = new Set(cards.filter(c => c.reinforce).flatMap(c => c.conceptRefs ?? []));
    const uncoveredWeak = new Set([...weak].filter(i => !covered.has(i)));
    if (uncoveredWeak.size === 0) return cards;
    let added = 0;
    const extras: AnkiCard[] = [];
    for (const q of queueQuestions) {
      if (added >= 2) break;
      const hits = (q.conceptRefs ?? []).filter(r => uncoveredWeak.has(r));
      if (hits.length === 0) continue;
      extras.push({
        id: `study-refuerzo-${added + 1}`,
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
  }, [content, conceptsChecked, queueQuestions, questionFeedbacks]);

  // El contenido exportable lleva los flags del plan de refuerzo.
  const exportCards: AnkiCard[] = content
    ? content.ankiCards.map((c) => reinforcePlan.find(p => p.id === c.id) ?? c)
    : [];
  const allCardsWithReinforce: AnkiCard[] = content
    ? [...reinforcePlan.filter(p => !content.ankiCards.some(c => c.id === p.id)), ...exportCards]
    : [];

  // §3: solo se exporta lo que el estudiante acepta — quitar/incluir por tarjeta.
  const handleToggleExcludeCard = (id: string) => {
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

  // ── §1.4: «Terminar lección» — siempre disponible, sin exportar ───────────
  const handleFinishLesson = () => {
    if (finishedAt) return;
    const now = Date.now();
    setFinishedAt(now);
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
      })),
      ankiCardsCount: allCardsWithReinforce.filter(c => !c.excluded).length,
      exportedGuids: ankiExported || obsidianExportedAt ? guids : undefined,
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
      setTimeout(() => scrollToBottom(), 300);
    }
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
                    // Force re-trigger of rehydration even if same slug pair
                    rehydratedKeyRef.current = "";
                    // If we're not in objective phase, reset visible state first
                    // then the useEffect will pick up the new lecture.
                    if (phase !== "objective") {
                      setPhase("objective");
                      setContent(null);
                    }
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
                {([["steps", "4 pasos"], ["timer", "~4–10 min"], ["zap", "+XP por clase"]] as const).map(([ic, label]) => (
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
                      Objetivos pendientes de IA real
                    </p>
                    <p className="text-[var(--usb-fg-mid)] text-[11px] font-medium mt-0.5 leading-relaxed">
                      {humanizeObjectivesError(objectivesError)}
                    </p>
                    <button onClick={handleRegenerateObjectives}
                      className="kx-chip mt-2.5 h-8 px-3 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all">
                      <Sparkles size={12}/>Regenerar con IA
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
                            Estos objetivos son plantillas heurísticas, no IA real.
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
                        {isRefining ? <><Loader2 size={11} className="animate-spin"/>Refinando con IA…</> : <><Sparkles size={12}/>Refinar con IA</>}
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
                              title="Pídele a la IA otra versión del mismo texto">
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
              <textarea value={courseDescription} onChange={e => setCourseDescription(e.target.value)}
                placeholder="Descripción breve del curso (ayuda a la IA a generar mejores objetivos)"
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
                    ? "Subtítulos listos"
                    : transcriptState.status === "waiting"
                      ? "Esperando subtítulos"
                      : transcriptState.status === "none"
                        ? "Sin subtítulos en esta lección"
                        : transcriptState.status === "preview"
                          ? "Vista previa sin extensión"
                          : "Comprobando subtítulos…"}
                </p>
                <p className="text-[10.5px] text-[var(--usb-fg-lo)] font-medium">
                  {transcriptState.status === "waiting"
                    ? "Activa los subtítulos en inglés en el video"
                    : transcriptState.status === "ready"
                      ? "Listos para analizar"
                      : transcriptState.status === "none"
                        ? "El estudio usará el curso como contexto"
                        : transcriptState.status === "preview"
                          ? "Se usará una sesión de ejemplo"
                          : "Un momento…"}
                </p>
              </div>
              {transcriptState.status === "ready" && transcriptState.cues ? (
                <span className="kx-ok-pill text-[11px] font-bold tabular-nums ml-auto px-2.5 py-1 rounded-full">
                  {transcriptState.cues} líneas
                </span>
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
              <Icon name="sparkles" size={17} weight="duotone"/>{returningMode ? "Empezar" : "Generar sesión de aprendizaje"} · ~4–10 min
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
                  <span className="text-[11px] font-semibold text-[var(--usb-fg-hi)] truncate">{lessonName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {sessionXp > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-semibold tracking-tight">
                      <Zap size={10} className="fill-amber-400 text-amber-400" />
                      +{sessionXp} XP
                    </span>
                  )}
                  {confirmingReset ? (
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

              <ProgressStepper steps={steps} focus={focusStep}/>
            </div>

            <div className="p-4 space-y-4">

              {/* ── Relevance bar ── */}
              {focusStep === 0 && (
              <div className="kx-card-flat flex items-center gap-2.5 rounded-xl px-3 py-2.5">
                <Icon name="target" size={15} weight="duotone" className="text-emerald-400 shrink-0" />
                <span className="text-white/55 text-[10.5px] font-semibold shrink-0">Relevancia</span>
                <div className="h-1.5 flex-1 bg-white/6 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${content.relevance.score}%` }}
                    transition={{ duration: 1, delay: 0.4, ease: "easeOut" }} className="h-full bg-emerald-500 rounded-full"/>
                </div>
                <span className="text-emerald-400 text-[11px] font-bold tabular-nums shrink-0">{content.relevance.score}%</span>
              </div>
              )}
              {focusStep === 0 && content.relevance.score < 50 && (
                <div className="kx-card-flat flex items-center gap-2.5 rounded-xl px-3 py-2.5">
                  <p className="flex-1 text-[10.5px] text-[var(--usb-fg-mid)] leading-relaxed">
                    Esta lección aporta poco a tu objetivo: puedes ir directo a Comprobar.
                  </p>
                  {stepUnlocked[1] && (
                    <button onClick={() => goToStep(1)} className="kx-chip shrink-0 h-7 px-2.5 rounded-full text-[10.5px] font-semibold">
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
                <span className="kx-step-count text-[10px] font-bold tabular-nums px-2.5 py-1 rounded-full">{focusStep + 1} / 4</span>
                <button onClick={() => goToStep(focusStep + 1)} disabled={!canGoNext}
                  title={!canGoNext && focusStep < 3 ? "Completa este paso primero" : ""}
                  className={`kx-nav-btn flex items-center gap-1 pl-3 pr-2 py-1.5 rounded-full text-[10.5px] font-semibold transition-all ${canGoNext ? "kx-next cursor-pointer" : "text-[var(--usb-fg-lo)] opacity-50 cursor-not-allowed"}`}>
                  Siguiente <ChevronRight size={13} />
                </button>
              </div>

              {/* ── FOCUS NAV: animated step ── */}
              <AnimatePresence custom={focusDir} mode="wait">
              <motion.div key={focusStep} custom={focusDir}
                variants={{
                  enter:  (d: number) => ({ x: d >= 0 ? 56 : -56, opacity: 0, scale: 0.98 }),
                  center: (_d: number) => ({ x: 0, opacity: 1, scale: 1 }),
                  exit:   (d: number) => ({ x: d >= 0 ? -56 : 56, opacity: 0, scale: 0.98 }),
                }}
                initial="enter" animate="center" exit="exit"
                transition={{ type: "spring", stiffness: 380, damping: 34 }}>

              <StepBanner step={focusStep} />

              {/* ── Step 0: Confidence ── */}
              {focusStep === 0 && (
              <div className="space-y-3.5">
                <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl p-4">
                  <StepHeader n={1} label="¿Qué tan claro te quedó el video?" subLabel={`paso 1 · ${STEP_META[0].short.toLowerCase()}`} status={confidence ? "done" : "active"}/>
                  <div className="grid grid-cols-2 gap-2.5">
                    {CONFIDENCE.map(c => {
                      const isSelected = confidence === c.id;
                      return (
                        <motion.button
                          key={c.id}
                          onClick={() => handleConfidenceChange(c.id)}
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

                  {/* Línea de coach neutra — una sola frase por nivel (§1.1) */}
                  <AnimatePresence>
                    {confidence && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 380, damping: 28, delay: 0.15 }}
                        className="mt-3.5 pt-3.5 border-t border-[var(--usb-border)] flex items-start gap-3 bg-[var(--usb-bg-2)]/50 p-3 rounded-xl"
                      >
                        <span className="shrink-0 mt-0.5 text-violet-400">
                          <Icon name={COACH_LINE[confidence].icon} size={18} weight="duotone" />
                        </span>
                        <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">{COACH_LINE[confidence].tip}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              )}

              {/* ── Paso 0 (Recordar): recuerdo libre + conceptos, tras elegir nivel ── */}
              {focusStep === 0 && confidence && (() => {
                const checkedCount = Object.values(conceptsChecked).filter(Boolean).length;
                const total = content.keyConcepts.length;
                const isReady = checkedCount >= 2;
                const isLocked = questionsComplete; // lock once questions are done
                const recallOpen = recallRevealed || isLocked || checkedCount > 0 || conceptsAcknowledged;
                return (
                <div ref={conceptsRef} className="space-y-3.5">
                  <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden">
                    {/* Header with live counter */}
                    <div className="flex items-center justify-between px-4 pt-4 pb-1">
                      <StepHeader n={2} label="Lo que aprendiste" subLabel={isLocked ? "registrado" : recallOpen ? "marca los que ya tenías en mente" : "primero, recuerda"} status={isReady ? "done" : "active"}/>
                      <motion.div
                        key={checkedCount}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`shrink-0 ml-2 mb-3.5 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-all ${
                          isReady
                            ? "bg-emerald-500/12 border-emerald-500/25 text-emerald-400"
                            : "bg-white/5 border-[var(--usb-border)] text-white/30"
                        }`}
                      >
                        {checkedCount}/{total}
                      </motion.div>
                    </div>

                    {/* Brain-dump gate: recall first, then compare with the list */}
                    {!recallOpen && (
                      <div className="px-4 pb-4 space-y-3">
                        <p className="text-[var(--usb-fg-hi)] text-[12px] font-bold leading-snug">Antes de ver la lista, ¿qué recuerdas del video?</p>
                        <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">Escribe 2 o 3 ideas con tus palabras. Recordar sin mirar es lo que más fija el aprendizaje.</p>
                        <textarea
                          value={recallNotes}
                          onChange={(e) => setRecallNotes(e.target.value)}
                          rows={3}
                          placeholder="Lo que recuerdo es…"
                          className={textareaCls}
                        />
                        <button onClick={() => setRecallRevealed(true)}
                          className="kx-on-solid kx-cta w-full h-10 rounded-xl text-[11.5px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]">
                          {recallNotes.trim() ? "Comparar con los conceptos" : "Ver los conceptos"}<ArrowRight size={12}/>
                        </button>
                      </div>
                    )}

                    {/* Concept list */}
                    {recallOpen && (
                    <div className="px-4 pb-3 space-y-2">
                      {content.keyConcepts.map((c, i) => (
                        <motion.button
                          key={i}
                          onClick={() => !isLocked && handleConceptToggle(i)}
                          whileHover={isLocked ? {} : { x: 2 }}
                          whileTap={isLocked ? {} : { scale: 0.98 }}
                          className={`kx-row w-full flex items-start gap-2.5 text-left rounded-xl px-3 py-2.5 border transition-all group ${
                            isLocked ? "cursor-default border-transparent" :
                            conceptsChecked[i] ? "kx-row-on" : "border-[var(--usb-border)] hover:border-[var(--usb-border-mid)]"
                          }`}
                        >
                          <div className={`mt-0.5 w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-all ${
                            conceptsChecked[i]
                              ? "kx-check-on"
                              : isLocked ? "border-[var(--usb-border)]" : "kx-check-off"
                          }`}>
                            <AnimatePresence mode="wait">
                              {conceptsChecked[i] && (
                                <motion.div key="c" initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
                                  <Check size={10} strokeWidth={2.4}/>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <p className={`text-[11.5px] leading-relaxed transition-all ${
                            conceptsChecked[i] ? "text-white/85" : "text-white/65 group-hover:text-white/85"
                          }`}>{c}</p>
                        </motion.button>
                      ))}
                    </div>
                    )}

                    {/* "Verificar mi comprensión" CTA */}
                    <AnimatePresence>
                      {!isLocked && recallOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className={`mx-3 mb-3 rounded-xl overflow-hidden relative ${
                            isReady
                              ? "bg-emerald-500/8 border border-emerald-500/22"
                              : "bg-violet-500/7 border border-violet-500/18"
                          }`}>
                            <div className="flex items-center gap-2.5 p-2.5 relative z-10">
                              <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, delay: 0.2 }} className="text-[16px] shrink-0">
                                <Icon name={isReady ? "checkCircle2" : checkedCount === 0 ? "compass" : "target"} size={20} weight="duotone" className={isReady ? "text-emerald-400" : "text-violet-400"} />
                              </motion.span>
                              <div className="flex-1 min-w-0">
                                <p className={`${isReady ? "text-emerald-300/90" : "text-violet-300/90"} text-[11px]`} style={{ fontWeight: 600 }}>
                                  {isReady ? "¡Base sólida!" : checkedCount === 0 ? "Empecemos desde lo esencial" : "Buen punto de partida"}
                                </p>
                                <p className="text-white/35 text-[10px]">
                                  {isReady
                                    ? "Confirma tu comprensión con preguntas reales."
                                    : checkedCount === 0
                                      ? "No marcar nada también calibra: iremos a lo más básico."
                                      : "Usaremos lo no marcado para priorizar tus preguntas."}
                                </p>
                              </div>
                            </div>
                            {/* CTA inline — no más scroll para buscar el botón */}
                            <button
                              onClick={handleGoVerify}
                              className={`relative z-10 w-full flex items-center justify-center gap-2 transition-colors py-3 text-white text-[12px] ${
                                "kx-on-solid kx-cta"
                              }`}
                              style={{ fontWeight: 600 }}
                            >
                              Ponerme a prueba <ArrowRight size={11} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>

                  {/* Quick Win removido de aquí — aparece en "Practícalo" (paso 3) */}
                </div>
                );
              })()}

              {/* ── Paso 1 (Comprobar): adaptativo, máximo 2 obligatorias ── */}
              {focusStep === 1 && confidence && queueQuestions.length > 0 && (() => {
                const doneCount = Object.values(questionFeedbacks).filter(f => f?.status === "done").length;
                return (
                <div ref={questionsRef} className="space-y-3.5">
                  {questionsComplete && (
                    <p className="text-white/45 text-[11px] leading-relaxed px-1">Toca cada pregunta para revisar tu respuesta y el feedback de la IA.</p>
                  )}

                {/* Review mode — when questionsComplete, show the summary instead of the card */}
                {questionsComplete && (
                  <VerifyDoneReview
                    questions={queueQuestions}
                    answers={questionAnswers}
                    feedbacks={questionFeedbacks}
                    onGoApply={() => goToStep(2)}
                  />
                )}
                <div className={`kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden ${questionsComplete ? "hidden" : ""}`}>
                    <div className="px-4 pt-4 pb-2.5 border-b border-[var(--usb-divider)]">
                      <div className="flex items-center justify-between">
                        <StepHeader n={3} label={STEP_META[1].title} subLabel={`paso 2 · ${STEP_META[1].short.toLowerCase()}`} status={questionsComplete ? "done" : "active"}/>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2 pb-4">
                          {queueQuestions.map((_, i) => {
                              const fb = questionFeedbacks[i];
                              const isDone = fb?.status === "done";
                              const isCurrent = i === currentQIdx && !questionsComplete;
                              const rating = fb?.rating;
                              const dotColor = isDone
                                ? rating === "correct" || rating === "excellent"
                                  ? "bg-emerald-400"
                                  : rating === "partial"
                                    ? "bg-amber-400"
                                    : rating === "wrong"
                                      ? "bg-red-400"
                                      : "bg-emerald-400"
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
                      {/* Progress bar */}
                      <div className="h-[2px] w-full bg-white/5 rounded-full overflow-hidden -mt-1">
                        <motion.div
                          className="h-full bg-violet-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: questionsComplete ? "100%" : `${(doneCount / Math.max(queueQuestions.length, 1)) * 100}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    <div className="p-4">
                      {questionsComplete ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4 space-y-2 relative">
                          <p className="text-emerald-400 text-[13px] relative z-10 pt-3" style={{ fontWeight: 600 }}>
                            {questionsSkipped
                              ? "Comprobación saltada"
                              : `${firstTryCount} de ${queueQuestions.length} a la primera${improvedCount > 0 ? ` · reforzaste ${improvedCount}` : ""}`}
                          </p>
                          <p className="text-white/40 text-[10px] relative z-10 pt-1">Continúa con la práctica.</p>
                        </motion.div>
                      ) : (
                        <>
                          {queueQuestions.map((q, i) => i !== currentQIdx ? null : (
                            <motion.div
                              key={`q-${i}-${confidence}`}
                              initial={{ opacity: 0, x: 12, scale: 0.99 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              transition={{ type: "spring", stiffness: 360, damping: 28 }}
                              className="space-y-3"
                            >
                              {/* Question header: number + bloom */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[var(--usb-fg-lo)] text-[10px] font-mono">{i+1} <span className="opacity-60">/</span> {queueQuestions.length}</span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md border ${BLOOM_STYLE(q.bloom)}`}>{q.bloom}</span>
                                </div>
                              </div>

                              {/* Question text — prominent */}
                              <p className="text-white/85 text-[12px] leading-relaxed whitespace-pre-line">{q.q}</p>

                              {/* Hint — collapsible callout */}
                              <button onClick={() => setShowHint(v => !v)}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${
                                  showHint
                                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                                    : "bg-[var(--usb-bg-3)] border-[var(--usb-border)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg)] hover:border-[var(--usb-border-mid)]"
                                }`}>
                                <Sparkles size={12} className="shrink-0 text-amber-400" />
                                <span className="text-[11px] font-semibold flex-1">{showHint ? "Ocultar pista" : "Ver pista de apoyo"}</span>
                                <ChevronDown size={12} className={`shrink-0 transition-transform ${showHint ? "rotate-180" : ""}`} />
                              </button>
                              <AnimatePresence>
                                {showHint && (
                                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden -mt-1">
                                    <div className="bg-amber-500/8 border border-amber-500/25 rounded-2xl p-3 text-[11.5px] text-amber-200 leading-relaxed font-medium">
                                      {q.hint}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Answer textarea — reacts to rating */}
                              {(() => {
                                const qfb = questionFeedbacks[i];
                                const ratingBorder =
                                  qfb?.status === "done" && (qfb.rating === "correct" || qfb.rating === "excellent")
                                    ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                                    : qfb?.status === "done" && qfb.rating === "partial"
                                    ? "border-amber-500/40 ring-1 ring-amber-500/20"
                                    : qfb?.status === "done" && qfb.rating === "wrong"
                                    ? "border-rose-500/40 ring-1 ring-rose-500/20"
                                    : "border-[var(--usb-border)] focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20";
                                return (
                                  <div className="relative">
                                    <textarea value={questionAnswers[i] || ""}
                                      onChange={e => setQuestionAnswers(p => ({ ...p, [i]: e.target.value }))}
                                      placeholder="Escribe tu respuesta con tus propias palabras…"
                                      className={`kx-field w-full h-[92px] text-[12px] rounded-xl bg-[var(--usb-bg-3)] border px-3 py-2.5 resize-none outline-none transition-all leading-relaxed text-[var(--usb-fg)] placeholder:text-[var(--usb-fg-mid)] ${ratingBorder}`}/>
                                    {(questionAnswers[i]?.length ?? 0) > 0 && (
                                      <span className="absolute bottom-2.5 right-3 text-[10px] text-[var(--usb-fg-lo)] font-mono pointer-events-none">
                                        {questionAnswers[i].length}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Action row */}
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleEvalQuestion(i)}
                                  disabled={!questionAnswers[i]?.trim() || questionFeedbacks[i]?.status === "loading"}
                                  className={`flex items-center gap-1.5 text-[10px] font-semibold text-white px-3 py-1.5 rounded-lg transition-all ${
                                    questionAnswers[i]?.trim()
                                      ? "kx-on-solid kx-cta"
                                      : "bg-white/8 opacity-40 cursor-not-allowed"
                                  }`}>
                                  {questionFeedbacks[i]?.status === "loading"
                                    ? <><Loader2 size={10} className="animate-spin"/>Analizando…</>
                                    : <><Send size={11}/>Evaluar</>}
                                </button>

                                {/* §1.2: Siguiente trae consolidación al fallar; tras completar, Continuar */}
                                {questionFeedbacks[i]?.status === "done" && (() => {
                                  if (questionsComplete) {
                                    return (
                                      <motion.button
                                        initial={{ opacity: 0, scale: 0.9, x: -6 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 24, delay: 0.15 }}
                                        onClick={() => goToStep(2)}
                                        className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg transition-all ml-auto bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30"
                                      >
                                        Continuar a Aplicar <ArrowRight size={9}/>
                                      </motion.button>
                                    );
                                  }
                                  return (
                                    <motion.button
                                      initial={{ opacity: 0, scale: 0.9, x: -6 }}
                                      animate={{ opacity: 1, scale: 1, x: 0 }}
                                      transition={{ type: "spring", stiffness: 400, damping: 24, delay: 0.15 }}
                                      onClick={() => goNextQuestion(i)}
                                      className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg transition-all ml-auto border border-violet-500/25 bg-violet-500/8 text-violet-300/80 hover:text-violet-200 hover:border-violet-500/40"
                                    >
                                      Siguiente <ArrowRight size={9}/>
                                    </motion.button>
                                  );
                                })()}
                              </div>

                              {/* §1.2: «Un reto más» — opcional, la del nivel siguiente */}
                              {questionsComplete && questionFeedbacks[i]?.status === "done" && !challengeUsed && content.questions.length > questionQueue.length && (
                                <button
                                  onClick={goChallengeQuestion}
                                  className="w-full text-[10.5px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] border border-[var(--usb-border)] hover:border-[var(--usb-border-mid)] py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                >
                                  <Zap size={10} />Un reto más (opcional)
                                </button>
                              )}

                              {/* AI Feedback */}
                              <AIFeedback
                                fb={questionFeedbacks[i] || IDLE_FB}
                                onRetry={() => handleEvalQuestion(i)}
                                onShowHint={() => setShowHint(true)}
                                onShowModel={() => setShowModelAnswer(true)}
                                onClearAnswer={() => setQuestionAnswers(p => ({ ...p, [i]: "" }))}
                              />

                              {/* Model answer — collapsible */}
                              {questionFeedbacks[i]?.status === "done" && (
                                <>
                                  <button onClick={() => setShowModelAnswer(v => !v)}
                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                                      showModelAnswer
                                        ? "bg-[var(--usb-bg-2)] border-[var(--usb-border-mid)] text-[var(--usb-fg-hi)]"
                                        : "border-[var(--usb-border)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:border-[var(--usb-border-mid)]"
                                    }`}>
                                    <span className="text-[10px] flex-1">Respuesta modelo</span>
                                    <ChevronDown size={9} className={`shrink-0 transition-transform text-[var(--usb-fg-lo)] ${showModelAnswer ? "rotate-180" : ""}`}/>
                                  </button>
                                  <AnimatePresence>
                                    {showModelAnswer && (
                                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden -mt-1">
                                        <div className="bg-[var(--usb-bg-2)] border border-[var(--usb-border)] rounded-xl px-3 py-2.5 text-[11px] text-[var(--usb-fg-mid)] leading-relaxed whitespace-pre-line">
                                          {q.answer}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </>
                              )}
                            </motion.div>
                          ))}
                          {/* Escape hatch — visible y con contraste AA (§1.2) */}
                          {!questionsComplete && (
                            <button onClick={handleSkipQuestions} className="mt-1 w-full text-[10px] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] border border-[var(--usb-border)] hover:border-[var(--usb-border-mid)] transition-colors py-1.5 rounded-lg flex items-center justify-center gap-1.5">
                              <FastForward size={9}/>Saltar comprobación
                            </button>
                          )}
                        </>
                      )}
                    </div>
                </div>
                </div>
                );
              })()}

              {/* ── Paso 2 (Aplicar): nunca bloquea ── */}
              {focusStep === 2 && (
                showApply ? (
                <div className="space-y-3.5">
                  <div ref={applyRef} className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden">
                    <div className="px-4 pt-4 pb-2">
                      <StepHeader
                        n={4}
                        label={content.application.isCode ? "Escribe código real" : "Aplica lo aprendido"}
                        subLabel={`paso 3 · ${STEP_META[2].short.toLowerCase()}`}
                        status={practiceStatus !== null ? "done" : "active"}
                      />
                    </div>

                    {/* Setup context */}
                    <div className="mx-4 mb-2.5 bg-violet-500/7 border border-violet-500/14 rounded-xl p-2.5 flex items-start gap-2">
                      <span className="shrink-0"><Icon name="steps" size={14} /></span>
                      <p className="text-white/50 text-[11px] leading-relaxed">{content.application.setup}</p>
                    </div>

                    {content.application.isCode ? (
                      <pre className="mx-4 mb-3 bg-black/50 border border-[var(--usb-border)] rounded-xl p-3 text-[10px] text-emerald-300/80 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap shadow-inner">{content.application.challenge}</pre>
                    ) : (
                      <div className="mx-4 mb-3 bg-black/35 border border-[var(--usb-border)] rounded-xl p-3 text-[11px] text-white/68 overflow-x-auto leading-relaxed shadow-inner whitespace-pre-wrap">{content.application.challenge}</div>
                    )}

                    <div className="px-4 pb-4 space-y-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon name="edit3" size={14} weight="duotone" className="kx-step-eyebrow text-violet-400"/>
                        <p className="text-[var(--usb-fg-lo)] text-[11px] font-medium">
                          {content.application.isCode ? "Escribe tu implementación — la IA la revisará:" : "Escribe tu respuesta — la IA la revisará:"}
                        </p>
                      </div>
                      <div className="relative">
                        <textarea value={appAnswer} onChange={e => setAppAnswer(e.target.value)}
                          placeholder={content.application.isCode ? "// Tu solución aquí…" : "Tu respuesta aquí…"}
                          className={`kx-field w-full h-[100px] text-[12px] rounded-xl bg-[var(--usb-bg-3)] border px-3 py-2.5 resize-none outline-none transition-all leading-relaxed shadow-inner placeholder:text-[var(--usb-fg-mid)] ${
                            content.application.isCode ? "font-mono text-emerald-400" : "text-[var(--usb-fg)]"
                          } ${
                            appFeedback.status === "done" && (appFeedback.rating === "correct" || appFeedback.rating === "excellent")
                              ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                              : appFeedback.status === "done" && appFeedback.rating === "partial"
                              ? "border-amber-500/40 ring-1 ring-amber-500/20"
                              : appFeedback.status === "done" && appFeedback.rating === "wrong"
                              ? "border-rose-500/40 ring-1 ring-rose-500/20"
                              : "border-[var(--usb-border)] focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20"
                          }`}/>
                        {appAnswer.length > 0 && (
                          <span className="absolute bottom-2.5 right-3 text-[10px] text-[var(--usb-fg-lo)] font-mono pointer-events-none">{appAnswer.length}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleEvalApp} disabled={!appAnswer.trim() || appFeedback.status === "loading"}
                          className={`flex items-center gap-1.5 text-[11px] font-semibold text-white px-3.5 py-2 rounded-xl transition-all ${
                            appAnswer.trim()
                              ? "kx-on-solid kx-cta shadow-sm hover:brightness-105"
                              : "bg-white/8 opacity-40 cursor-not-allowed"
                          }`}>
                          {appFeedback.status === "loading" ? <><Loader2 size={12} className="animate-spin"/>Revisando…</> : <><Send size={12}/>Revisar con IA</>}
                        </button>
                        <button onClick={() => (showAppHint || showAppSolution || appFeedback.status === "done") ? setShowAppSolution(v => !v) : setShowAppHint(true)}
                          className={`flex items-center gap-1.5 text-[11px] font-semibold border px-3 py-2 rounded-xl transition-all ${showAppSolution ? "bg-[var(--usb-bg-3)] border-violet-500/30 text-violet-300" : "border-[var(--usb-border)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg)] hover:border-[var(--usb-border-mid)]"}`}>
                          <ChevronDown size={11} className={`transition-transform ${showAppSolution ? "rotate-180" : ""}`}/>
                          {showAppSolution ? "Ocultar solución" : (showAppHint || appFeedback.status === "done") ? "Ver solución" : "Pedir pista"}
                        </button>
                      </div>
                      <AnimatePresence>
                        {showAppHint && !showAppSolution && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-amber-500/6 border border-amber-500/20 rounded-xl p-2.5">
                              <p className="text-[9px] uppercase tracking-wider text-amber-500 font-bold mb-1">Pista · por dónde empezar</p>
                              <p className="text-[11px] text-[var(--usb-fg-mid)] leading-relaxed whitespace-pre-wrap">
                                {(() => {
                                  const first = content.application.solution.split(/\n|(?<=[.!?])\s/)[0].trim();
                                  return first.length > 110 ? first.slice(0, 110).trimEnd() + "…" : first;
                                })()}
                              </p>
                              <p className="text-[10px] text-[var(--usb-fg-lo)] mt-1.5">Intenta desde aquí; la solución completa aparece tras tu primer intento.</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <AIFeedback
                        fb={appFeedback}
                        onRetry={handleEvalApp}
                        onClearAnswer={() => setAppAnswer("")}
                        onShowModel={() => setShowAppSolution(true)}
                      />
                      <AnimatePresence>
                        {showAppSolution && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-emerald-500/5 border border-emerald-500/12 rounded-xl overflow-hidden">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-emerald-500/10">
                                <span className="text-[9px] text-emerald-400/60 uppercase tracking-wider" style={{ fontWeight: 600 }}>Solución de referencia</span>
                              </div>
                              {content.application.isCode ? (
                                <pre className="p-2.5 text-[10px] text-emerald-300/75 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap">{content.application.solution}</pre>
                              ) : (
                                <div className="p-2.5 text-[11px] text-white/62 overflow-x-auto leading-relaxed whitespace-pre-wrap">{content.application.solution}</div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Quick Win — Acción inmediata (aquí sí tiene sentido: ya practicaste, ahora aplícalo en el mundo real) */}
                      {content.quickWin && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                          className="relative overflow-hidden rounded-xl border border-amber-500/22 bg-amber-500/6"
                        >
                          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-amber-500/10 relative z-10">
                            <Zap size={10} className="text-amber-400 shrink-0" />
                            <span className="text-amber-400/75 text-[9px] uppercase tracking-widest" style={{ fontWeight: 700 }}>Llévalo al mundo real · bonus</span>
                            <span className="text-white/18 text-[9px] ml-auto">~2 min</span>
                          </div>
                          <div className="px-3 py-2.5 relative z-10">
                            <p className="text-white/35 text-[9px] mb-1.5">Ya practicaste el concepto. Ahora aplícalo en un proyecto real.</p>
                            <p className="text-white/60 text-[11px] leading-relaxed">{content.quickWin}</p>
                          </div>
                        </motion.div>
                      )}

                      {/* §1.3: Hacerlo después — el estudiante decide, nunca bloquea */}
                      <AnimatePresence>
                        {practiceStatus === null && (
                          <motion.button
                            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                            onClick={handlePracticeLater}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-[var(--usb-border)] text-[10.5px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:border-[var(--usb-border-mid)] transition-all"
                          >
                            Hacerlo después <ArrowRight size={10}/>
                          </motion.button>
                        )}
                        {practiceStatus !== null && (
                          <motion.button
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, type: "spring", stiffness: 380, damping: 26 }}
                            onClick={() => goToStep(3)}
                            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-[10px] transition-all ${
                              practiceStatus === "correct"
                                ? "kx-on-solid kx-cta border-transparent"
                                : "border-white/10 text-white/40 hover:text-white/65 hover:border-white/20"
                            }`}
                          >
                            {practiceStatus === "correct"
                              ? <>Fíjalo en memoria <ArrowRight size={10}/></>
                              : <>Continuar de todas formas <ArrowRight size={10}/></>
                            }
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* §1.3: práctica oral — plegada, opcional, 1 min, nunca bloquea */}
                  {content.interviewQ && (
                    <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden">
                      <button onClick={() => setShowOralPractice(v => !v)} aria-expanded={showOralPractice}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
                        <div className="w-8 h-8 rounded-xl bg-[#6d4aff]/15 border border-[#6d4aff]/30 flex items-center justify-center shrink-0">
                          <Star size={14} className="text-[#6d4aff]"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[var(--usb-fg-hi)] text-[11.5px] font-bold leading-tight">¿Prefieres explicarlo con tus palabras?</p>
                          <p className="text-[var(--usb-fg-lo)] text-[10px] font-medium">(opcional, 1 min) · {oralPracticeMeta.title}</p>
                        </div>
                        <ChevronDown size={14} className={`shrink-0 text-[var(--usb-fg-mid)] transition-transform ${showOralPractice ? "rotate-180" : ""}`}/>
                      </button>
                      <AnimatePresence initial={false}>
                        {showOralPractice && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="px-4 pb-4 pt-1 space-y-3.5">
                              <p className="text-[var(--usb-fg)] text-[12px] leading-relaxed font-medium">{content.interviewQ.q}</p>
                              <textarea
                                value={oralAnswer}
                                onChange={(e) => { setOralAnswer(e.target.value); if (oralFeedback.status === "done" || oralFeedback.status === "error") setOralFeedback(IDLE_FB); }}
                                placeholder="Escribe aquí lo que dirías en voz alta…"
                                rows={3}
                                className={textareaCls}
                              />
                              {oralFeedback.status === "idle" && (
                                <button onClick={handleEvaluateOral} disabled={!oralAnswer.trim()}
                                  className="kx-on-solid kx-cta w-full h-9 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed">
                                  <Sparkles size={12}/>Evaluar mi respuesta
                                </button>
                              )}
                              <AIFeedback fb={oralFeedback} onRetry={handleEvaluateOral} />
                              {oralFeedback.status !== "done" && !oralSkipped && (
                                <button onClick={() => setOralSkipped(true)} className="w-full text-[11px] font-medium text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] transition-colors">
                                  Omitir por ahora
                                </button>
                              )}
                              <button onClick={() => setShowInterviewAnswer(v => !v)}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${
                                  showInterviewAnswer
                                    ? "bg-[#6d4aff]/10 border-[#6d4aff]/30 text-[var(--usb-fg-hi)]"
                                    : "border-[var(--usb-border)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg)] hover:border-[var(--usb-border-mid)]"
                                }`}>
                                <span className="text-[11.5px] font-semibold flex-1">{oralPracticeMeta.answerLabel}</span>
                                <ChevronDown size={14} className={`shrink-0 transition-transform text-[var(--usb-fg-mid)] ${showInterviewAnswer ? "rotate-180" : ""}`}/>
                              </button>
                              <AnimatePresence>
                                {showInterviewAnswer && (
                                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden -mt-1">
                                    <div className="bg-[#6d4aff]/6 border border-[#6d4aff]/18 rounded-2xl p-3.5 text-[11.5px] text-[var(--usb-fg-mid)] leading-relaxed">{content.interviewQ.idealAnswer}</div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
                ) : (
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
                const reinforceCount = selectedCards.filter(c => c.reinforce).length;
                const totalQFinal = queueQuestions.length;
                const elapsedMin = Math.max(1, Math.round(((finishedAt ?? Date.now()) - sessionStartRef.current) / 60000));
                const destination = ankiExported ? "en Anki" : obsidianExportedAt ? "en Obsidian" : "sin exportar";
                return (
              <div className="space-y-3.5">
                {/* Resumen de cierre — una sola tarjeta con datos reales (§1.4) */}
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 340, damping: 28 }}
                  className="kx-step-solid kx-on-solid rounded-2xl p-4 relative overflow-hidden"
                >
                  <div className="flex items-center gap-3 relative z-10">
                    <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.18)" }}><Icon name="flag" size={26} weight="duotone" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] leading-tight" style={{ fontWeight: 800 }}>{resultTitle}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[10.5px] font-semibold flex items-center gap-1"><Check size={9} strokeWidth={3}/>{conceptsMarkedCount} de {content.keyConcepts.length} ideas (marcadas por ti)</span>
                        {totalQFinal > 0 && <span className="text-[10.5px] font-semibold flex items-center gap-1"><Check size={9} strokeWidth={3}/>{questionsSkipped ? "saltada" : `${firstTryCount}/${totalQFinal} a la primera`}</span>}
                        <span className="text-[10.5px] font-semibold opacity-80">práctica {practiceLabel}</span>
                        <span className="text-[10.5px] font-semibold opacity-80">~{elapsedMin} min</span>
                      </div>
                    </div>
                  </div>
                  <div className="relative z-10 mt-2.5 pt-2.5 border-t border-white/15 space-y-1">
                    <p className="text-[10.5px] font-semibold opacity-90">Tarjetas: {selectedCards.length}{reinforceCount > 0 ? ` (${reinforceCount} de refuerzo)` : ""} · {destination}</p>
                    {calibration && (
                      <p className="text-[10px] opacity-75 leading-relaxed">
                        Dijiste «{calibration.said}», mostraste «{calibration.shown}» · {calibration.message}
                      </p>
                    )}
                    <p className="text-[10px] opacity-75 leading-relaxed">
                      {ankiExported
                        ? "Próximo paso: repasa en Anki mañana."
                        : obsidianExportedAt
                          ? "Próximo paso: exporta a Anki para el repaso espaciado."
                          : `Próximo paso: ${content.nextAction}`}
                    </p>
                  </div>
                </motion.div>

              {/* ── Fíjalo en memoria ── */}
              {confidence && (
                  <div ref={ankiRef} className="space-y-3">
                    <div className="px-0.5">
                      <p className="kx-slate">Fíjalo en memoria · exportar</p>
                      <p className="text-[var(--usb-fg-mid)] text-[11.5px] leading-relaxed mt-1.5">
                        {showApply ? "Anki programa el repaso justo antes de que olvides. Elige a dónde llevar esta lección." : "Disponible cuando completes la práctica."}
                      </p>
                    </div>

                    <ExportModule
                      icon={Package}
                      title="Tarjetas de la lección"
                      subtitle={`${selectedCards.length} tarjetas${reinforceCount > 0 ? ` · ${reinforceCount} de refuerzo` : ""} · .apkg se importa con doble clic`}
                      badge={ankiExported ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border text-[#059669] bg-[#059669]/12 border-[#059669]/35 flex items-center gap-1 shrink-0"><Check size={9} strokeWidth={3}/>Listo</span> : undefined}
                    >
                      <div className="grid grid-cols-[1.4fr_1fr] gap-1.5">
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
                      <div className="flex items-center gap-4">
                        <button onClick={() => setShowCardPreview(v => !v)} aria-expanded={showCardPreview}
                          className="text-[11px] font-medium text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] flex items-center gap-1 transition-colors">
                          <ChevronDown size={14} className={`transition-transform ${showCardPreview ? "rotate-180" : ""}`}/>{showCardPreview ? "Ocultar tarjetas" : "Ver tarjetas"}
                        </button>
                        <span className="text-[10px] text-[var(--usb-fg-lo)]">Quita las que no quieras: solo se exporta lo que aceptas</span>
                        <button onClick={() => setShowAnkiGuide(v => !v)} aria-expanded={showAnkiGuide}
                          className="text-[11px] font-medium text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] flex items-center gap-1 transition-colors">
                          <Info size={13}/>{showAnkiGuide ? "Ocultar guía" : "Guía de importación"}
                        </button>
                      </div>
                      <AnimatePresence initial={false}>
                        {showCardPreview && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
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
                                Doble clic en el archivo .apkg → Anki importa el mazo con su configuración. Si algo sale mal, vuelve a descargar el .apkg: las notas se actualizan por GUID, nunca se duplican.
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </ExportModule>

                      <VocabularyPanel course={courseName} lesson={lessonName} config={vocabCfg} onConfig={handleSaveVocabCfg} generate={generateVocabularyCandidates} aiReady={aiReady} aiNotice={aiBlockedMessage(aiState, aiEndpoint)} />

                      {/* ── Obsidian export ── */}
                      <ExportModule
                        icon={BookMarked}
                        title="Obsidian"
                        badge={exportedNotes.includes(sessionExportKey(courseName, lessonName)) ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border text-[#059669] bg-[#059669]/12 border-[#059669]/35 flex items-center gap-1 shrink-0"><Check size={9} strokeWidth={3}/>Listo</span> : undefined}
                        subtitle={obsidianCfg.vaultName.trim()
                          ? <>Vault «{obsidianCfg.vaultName}» · nota + MOC del curso</>
                          : "Sin vault configurado"}
                        configLabel="Ajustar"
                        onToggleConfig={openObsidianSettings}
                      >
                          <>
                            {!obsidianCfg.vaultName.trim() && (
                              <button onClick={openObsidianSettings}
                                className="w-full text-left rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] hover:bg-[var(--usb-bg-2)] px-3 py-2 text-[var(--usb-fg-mid)] text-[11.5px] font-medium leading-relaxed transition-colors shadow-2xs">
                                Configura el nombre de tu vault para exportar con un clic →
                              </button>
                            )}
                            <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-1.5">
                              <button onClick={handleExportObsidian} disabled={!showApply}
                                style={{ "--kx-btn": obsidianStatus === "done" ? "#059669" : "#6d4aff" } as React.CSSProperties}
                                className={exportPrimaryBtnCls}>
                                {obsidianStatus === "done"
                                  ? <><CheckCircle2 size={12}/>Exportado</>
                                  : <><BookMarked size={12}/>Exportar</>}
                              </button>
                              <button onClick={handleCopyObsidianMarkdown} disabled={!showApply} className={exportGhostBtnCls}>
                                <ClipboardCopy size={12}/>Copiar
                              </button>
                              <button onClick={handleDownloadObsidianMarkdown} disabled={!showApply} className={exportGhostBtnCls}>
                                <FileDown size={12}/>.md
                              </button>
                            </div>
                            <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">
                              Crea la nota en <span className="font-mono text-[var(--usb-fg-hi)]">{obsidianCfg.sourcesFolder}/</span> y el MOC en <span className="font-mono text-[var(--usb-fg-hi)]">{obsidianCfg.mocsFolder}/</span>. Copiar y .md son respaldos manuales.
                            </p>
                            <button onClick={() => setObsidianHelpOpen(v => !v)}
                              className="text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] text-[11px] flex items-center gap-1 transition-colors">
                              <Info size={13}/>{obsidianHelpOpen ? "Ocultar ayuda" : "¿No pasó nada al exportar?"}
                            </button>
                            {obsidianHelpOpen && (
                              <ol className="rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-2)] p-2.5 space-y-1.5">
                                {[
                                  "Instala Obsidian y abre tu vault al menos una vez (que aparezca en el selector de vaults).",
                                  "Exporta de nuevo: Chrome pregunta «¿Abrir Obsidian?» → marca Siempre permitir.",
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
                          </>
                      </ExportModule>

                      {/* §1.4: Terminar lección — siempre disponible, con o sin exportar */}
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
                      {!ankiExported && !obsidianExportedAt && finishedAt !== null && (
                        <p className="text-[10.5px] text-[var(--usb-fg-mid)] text-center leading-relaxed">
                          Sin exportar: la lección queda en «Tarjetas de contenido por descargar» del historial.
                        </p>
                      )}
                  </div>
              )}
              </div>
              );
              })()}
              </motion.div>
              </AnimatePresence>

              <div className="h-5"/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
