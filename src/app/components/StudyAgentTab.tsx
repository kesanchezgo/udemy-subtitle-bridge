import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Target, Sparkles, Wand2, Check, Edit3, ArrowRight, Brain,
  CheckCircle2, Circle, RotateCcw, X, Zap, FlipHorizontal,
  ChevronLeft, ChevronRight, Info, FileDown, FolderPlus,
  FolderSync, Send, Loader2, Wifi, WifiOff, Star, BookOpen,
  Repeat2, Lock, ChevronDown, Package, Rocket, Diamond, Flame, Download, FastForward, History,
  BookMarked, Settings2, ClipboardCopy, ExternalLink, Languages,
  Icon, Glyph, splitLeadingMarker
} from "./icons";
import type { IconName } from "./icons";
import { FrameMarks } from "./AppLogo";
import { motion, AnimatePresence } from "motion/react";
import { evaluateActiveAnswer, evaluateCodeSolution, evaluateActiveAnswerStream, evaluateCodeSolutionStream, type AIRating, type StudyAIContext } from "../services/localAI";
import { buildAnkiApkg, downloadApkg } from "../services/ankiApkg";
import { buildConceptSpec, sanitizeDeckSegment } from "../services/ankiDesign";
import {
  DEFAULT_VOCAB_CONFIG, buildVocabularySpec, filterVocabulary, getLectureGlossary, loadVocabConfig,
  loadVocabRegistry, markVocabularyExported, parseVocabularyPayload, saveVocabConfig,
  splitAlreadyExported,
  type VocabConfig,
} from "../services/vocabularyService";
import { cefrLevels } from "../../shared/prompts";
import { Collapse, ExportModule, exportFieldCls, exportGhostBtnCls, exportLabelCls, exportPrimaryBtnCls } from "./study/ExportModule";
import { historyService, slugify, type QuestionAttempt, type StoredAnkiCard, type StoredStudyContent } from "../services/historyService";
import { objectivesService, type ObjectivesCacheEntry } from "../services/objectivesService";
import { refineCustomObjective, type GeneratedObjective } from "../services/localAI";
import { HistoryPanel } from "./HistoryPanel";
import { projectId } from "../../../utils/supabase/info";
import { usePersistedState } from "../hooks/usePersistedState";
import { useDockTheme } from "../contexts/ThemeContext";
import { contentBridge, type BridgeMessage } from "../services/contentBridge";
import { chromeLocalStorage, chromeStorage } from "../services/chromeStorage";
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
import { MemoryCard } from "./study/MemoryCard";
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
}

interface StudyContent {
  relevance: { score: number; reason: string };
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
    emoji: "😵‍💫",
    bars: 1,
    tag: "Dominio 1",
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
    emoji: "🤔",
    bars: 2,
    tag: "Dominio 2",
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
    emoji: "😊",
    bars: 3,
    tag: "Dominio 3",
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
    emoji: "😎",
    bars: 4,
    tag: "Dominio 4",
    label: "Lo domino",
    desc: "Desafío de alto nivel",
    ring: "ring-violet-500/40",
    bg: "bg-violet-500/8 dark:bg-violet-500/10",
    border: "border-violet-500/30",
    color: "#8b5cf6",
    label_c: "text-violet-500 dark:text-violet-400",
  },
];

const STEP_META: { hue: string; inkDark: string; inkLight: string; icon: IconName; title: string; sub: string }[] = [
  { hue: "#6d4aff", inkDark: "#b7a6ff", inkLight: "#5b37e8", icon: "compass",   title: "Calibra tu sesión",       sub: "Dinos cómo te fue en la clase" },
  { hue: "#0284c7", inkDark: "#5cc8fb", inkLight: "#0369a1", icon: "lightbulb", title: "Lo esencial de la clase", sub: "Marca lo que ya tienes claro" },
  { hue: "#d97706", inkDark: "#fbbf45", inkLight: "#a15207", icon: "brain",     title: "Recupera de memoria",     sub: "Responde sin mirar, ahí se aprende" },
  { hue: "#059669", inkDark: "#4ade9f", inkLight: "#047857", icon: "rocket",    title: "Llévalo a la práctica",   sub: "Un caso real para aplicar lo visto" },
  { hue: "#e11d48", inkDark: "#fb7185", inkLight: "#be123c", icon: "layers",    title: "Fíjalo en memoria",       sub: "Tarjetas listas para repasar" },
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
        <span className="kx-step-eyebrow text-[9.5px] font-extrabold tracking-[0.14em] uppercase">Paso {step + 1} de 5</span>
        <p className="kx-step-title text-[14px] font-bold leading-tight mt-0.5">{m.title}</p>
        <p className="kx-step-sub text-[11px] leading-snug mt-0.5">{m.sub}</p>
      </div>
    </div>
  );
}

const CONFIDENCE_HINT: Record<ConfidenceLevel, string> = {
  confused:  "Sin problema — empezamos desde los fundamentos. El 80% de los expertos también lo vivió así al inicio.",
  partial:   "Normal en el primer intento. Vamos a cerrar esos gaps con preguntas muy concretas.",
  clear:     "Bien. Ahora lo comprobamos con preguntas de aplicación real para solidificar.",
  mastered:  "Perfecto. Te espera un desafío de análisis profundo para confirmar el dominio.",
};

// Coach bubble post-selection (motivational, personalized per level)
const COACH_BUBBLE: Record<ConfidenceLevel, { icon: IconName; title: string; tip: string }> = {
  confused:  { icon: "flame", title: "¡La honestidad es el primer paso real!", tip: "Cada experto que conoces pasó exactamente por aquí. Las preguntas están calibradas para tu nivel — sin saltos abruptos." },
  partial:   { icon: "target", title: "Ya tienes la base.", tip: "Solo necesitas conectar los puntos. Las preguntas cerrarán exactamente los gaps que detectaste." },
  clear:     { icon: "zap", title: "Buen nivel de comprensión.", tip: "Ahora viene la prueba real: aplicarlo sin mirar. Eso es lo que separa entender de dominar." },
  mastered:  { icon: "flame", title: "¡Nivel alto, vamos a confirmarlo!", tip: "Te espera un análisis en profundidad. Demuestra que no solo sabes — sabes por qué funciona." },
};



const CARD_META: Record<CardType, { label: string; icon: IconName; color: string; accent: string }> = {
  concepto:    { label: "Concepto",    icon: "target", color: "text-violet-400",  accent: "#9a83ff" },
  aplicacion:  { label: "Aplicación",  icon: "puzzle", color: "text-emerald-400", accent: "#34d399" },
  codigo:      { label: "Código",      icon: "code", color: "text-emerald-400", accent: "#86efac" },
  entrevista:  { label: "Entrevista",  icon: "briefcase", color: "text-sky-400",     accent: "#93c5fd" },
  comparacion: { label: "Comparación", icon: "compare", color: "text-amber-400",   accent: "#fcd34d" },
  proceso:     { label: "Proceso",     icon: "steps", color: "text-fuchsia-400", accent: "#e879f9" },
};
const ANKI_NOTE_TYPE = "Subtitle Bridge Basic";

const QUESTIONS_FOR: Record<ConfidenceLevel, ConfidenceLevel[]> = {
  confused: ["confused"],
  partial:  ["confused", "partial"],
  clear:    ["partial", "clear"],
  mastered: ["clear", "mastered"],
};

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

function humanizeObjectivesError(error: string | null | undefined): string {
  if (!error) return "El servidor de IA local y Gemini no respondieron. Configura tu API key o reintenta.";
  const msg = error.toLowerCase();
  if (msg.includes("cortada a mitad") || msg.includes("max_tokens") || msg.includes("max tokens") || msg.includes("límite de tokens")) {
    return "La IA fue cortada a mitad de respuesta por el límite de tokens. Pulsa Regenerar — el siguiente intento usará más tokens.";
  }
  if (msg.includes("saturado") || msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded") || msg.includes("high demand")) {
    return "Gemini está saturado por alta demanda. Espera 1-2 minutos y vuelve a pulsar Regenerar.";
  }
  if (msg.includes("rate") && msg.includes("limit")) return "Gemini está limitando peticiones. Espera unos segundos y vuelve a intentarlo.";
  if (msg.includes("quota") || msg.includes("resource_exhausted")) return "Tu cuota de Gemini se agotó por hoy. Añade otra clave o espera al reset.";
  if (msg.includes("no gemini api keys")) return "No has configurado tu API key de Gemini. Ábrela en Ajustes → API keys e inténtalo de nuevo.";
  if (msg.includes("api key") || msg.includes("api_key") || (msg.includes("invalid") && msg.includes("key"))) return "La API key de Gemini parece inválida. Verifícala en Ajustes → API keys.";
  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("err_")) return "Error de red al hablar con la IA. Revisa tu conexión y reintenta.";
  if (msg.includes("background")) return "No se pudo contactar con el background de la extensión. Recarga la página de Udemy.";
  if (msg.includes("parse") || msg.includes("json") || msg.includes("formato no era válido")) return "La IA respondió pero el formato no era válido. Pulsa Regenerar para reintentar.";
  return error.length > 140 ? `${error.slice(0, 140)}…` : error;
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
          initial={{ x: "-100%" }}
          animate={{ x: "300%" }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
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
                <span className="inline-block w-[5px] h-[12px] ml-0.5 align-middle bg-violet-400/70 animate-pulse" />
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

function buildAnkiTxt(cards: AnkiCard[], course: string, lesson: string): string {
  const cell = (s: string) => cardTextToHtml(s).replace(/\t/g, " ");
  const lines = [
    "#separator:tab",
    "#html:true",
    "#tags column:3",
    `#notetype:${ANKI_NOTE_TYPE}`,
    `#deck:${sanitizeDeckSegment(course)}::${sanitizeDeckSegment(lesson)}`,
  ];
  for (const c of cards) {
    const tags = [...c.tags, c.type].map(t => t.replace(/\s+/g, "_")).join(" ");
    lines.push(`${cell(c.front)}\t${cell(c.back)}\t${tags}`);
  }
  return lines.join("\n");
}

const ANKI_CSS = `.card {
  font-family: "Plus Jakarta Sans", -apple-system, "Segoe UI", sans-serif;
  font-size: 18px;
  line-height: 1.55;
  text-align: left;
  color: #1c1b22;
  background: #f7f6fb;
  padding: 20px;
}
.nightMode .card, .night_mode .card { color: #ecebf3; background: #17161d; }
.front { font-weight: 600; }
.back { margin-top: 12px; }
hr#answer { border: 0; border-top: 1px solid #d4c9ff; margin: 16px 0; }
code { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-size: 0.9em; padding: 1px 6px; border-radius: 6px; background: rgba(109, 74, 255, 0.12); color: #6d4aff; }
pre { padding: 12px 14px; border-radius: 10px; background: rgba(109, 74, 255, 0.08); overflow-x: auto; }
pre code { background: transparent; padding: 0; }
`;

function buildTemplateGuide(course: string, lesson: string): string {
  return [
    `PLANTILLA ANKI — ${ANKI_NOTE_TYPE}`,
    `Curso: ${course}`,
    `Lección: ${lesson}`,
    "",
    "1. En Anki: Herramientas → Gestionar tipos de nota → Añadir → «Básico».",
    `2. Nómbralo exactamente: ${ANKI_NOTE_TYPE}`,
    "3. Campos: Front, Back.",
    "4. Tarjetas → Plantilla frontal:",
    '   <div class="front">{{Front}}</div>',
    "5. Plantilla trasera:",
    '   {{FrontSide}}<hr id="answer"><div class="back">{{Back}}</div>',
    "6. Estilo: pega el contenido de anki-card-styles.css.",
    "7. Archivo → Importar → selecciona el .txt de tarjetas.",
    "",
    "Consejo: el paquete .apkg instala todo esto automáticamente.",
  ].join("\n");
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
  const spec = buildConceptSpec(
    cards.map((c) => ({
      front: cardTextToHtml(c.front),
      back: cardTextToHtml(c.back),
      // GUID probado: hash de curso|lección|front — reimportar ACTUALIZA en vez de duplicar.
      guid: stableAnkiGuid(course, lesson, c),
      type: c.type,
      tags: [...c.tags, c.type].map((t) => t.replace(/\s+/g, "_")),
    })),
    course,
    lesson,
    root,
    lessonUrl,
  );
  onProgress?.("Empaquetando tarjetas…");
  const apkg = await buildAnkiApkg(spec, onProgress);
  const safe = (s: string) => s.replace(/[^a-z0-9]/gi, "_");
  downloadApkg(apkg, `${safe(lesson)}_conceptos.apkg`);
  return `${sanitizeDeckSegment(root)}::${sanitizeDeckSegment(course)}::${sanitizeDeckSegment(lesson)}`;
}

// GUID por contenido (curso|lección|front): reimportar la misma lección
// actualiza las notas en vez de duplicarlas aunque cambie el orden o la cantidad.
function stableAnkiGuid(course: string, lesson: string, card: { front: string }): string {
  const source = `${sanitizeDeckSegment(course)}|${sanitizeDeckSegment(lesson)}|${card.front}`;
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
        Continuar a practicar<ArrowRight size={12} />
      </button>
    </div>
  );
}

// ─── Anki flip-card preview ───────────────────────────────────────────────────
function AnkiFlipPreview({ cards }: { cards: AnkiCard[] }) {
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
          <span className={`flex items-center gap-1.5 text-[9.5px] ${meta.color}`} style={{ fontWeight: 600 }}>
            <Icon name={meta.icon} size={11} />{meta.label}
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
        <button onClick={() => go(1)} aria-label="Tarjeta siguiente" className="p-1.5 rounded-lg text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-bg-2)] transition-colors">
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function StudyAgentTab({ session, apiKeys = [] }: { session?: Session; apiKeys?: string[] }) {
  const { t } = useDockTheme();
  const [phase, setPhase]             = useState<Phase>("objective");
  const [selectedObj, setSelectedObj] = usePersistedState<string>("agent_selected_obj", "custom");
  const [customObj, setCustomObj]     = usePersistedState<string>("agent_custom_obj", "");
  const [refinedObj, setRefinedObj]   = useState("");
  const [refinedFromText, setRefinedFromText] = useState("");
  const [isRefining, setIsRefining]   = useState(false);
  const [courseName, setCourseName]   = usePersistedState<string>("agent_course_name", "");
  const [lessonName, setLessonName]   = usePersistedState<string>("agent_lesson_name", "");
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
  const [apkgProgress, setApkgProgress]             = useState("");
  const [txtSetupCourses, setTxtSetupCourses]       = useState<Set<string>>(new Set());
  const [showHint, setShowHint]                     = useState(false);
  const [showModelAnswer, setShowModelAnswer]       = useState(false);
  const [questionAnswers, setQuestionAnswers]       = useState<Record<number, string>>({});
  const [questionFeedbacks, setQuestionFeedbacks]   = useState<Record<number, FeedbackState>>({});
  const [currentQIdx, setCurrentQIdx]               = useState(0);
  const [questionsComplete, setQuestionsComplete]   = useState(false);
  const [sessionComplete, setSessionComplete]       = useState(false);
  const [showInterviewAnswer, setShowInterviewAnswer] = useState(false);
  const [oralAnswer, setOralAnswer]                 = useState("");
  const [oralFeedback, setOralFeedback]             = useState<FeedbackState>(IDLE_FB);
  const [oralSkipped, setOralSkipped]               = useState(false);
  const [recallRevealed, setRecallRevealed]         = useState(false);
  const [recallNotes, setRecallNotes]               = useState("");
  const [historyOpen, setHistoryOpen]               = useState(false);

  // Vocabulary export
  const [vocabCfg, setVocabCfg]             = useState<VocabConfig>(DEFAULT_VOCAB_CONFIG);
  const [vocabPanelOpen, setVocabPanelOpen] = useState(false);
  const [vocabStatus, setVocabStatus]       = useState<"idle" | "loading" | "done" | "error">("idle");
  const [vocabProgress, setVocabProgress]   = useState("");
  const [vocabLangOk, setVocabLangOk]       = useState<boolean | null>(null);

  // Badge de repasos: tarjetas de ESTA lección con repaso pendiente en Anki hoy
  // (vía AnkiConnect; null = Anki cerrado o sin datos).
  const [ankiDue, setAnkiDue]               = useState<number | null>(null);

  // Obsidian export
  const [obsidianCfg, setObsidianCfg]             = useState<ObsidianExportConfig>(DEFAULT_OBSIDIAN_EXPORT_CONFIG);
  const [obsidianPanelOpen, setObsidianPanelOpen] = useState(false);
  const [obsidianHelpOpen, setObsidianHelpOpen]   = useState(false);
  const [obsidianStatus, setObsidianStatus]       = useState<"idle" | "done" | "error">("idle");
  const [createdMocs, setCreatedMocs]             = useState<string[]>([]);
  const [, setExportedNotes]                      = useState<string[]>([]);

  // Focus navigator (one step at a time)
  const [focusStep, setFocusStep] = useState(0);
  const [focusDir,  setFocusDir]  = useState(1);

  // Gamification & Dopamine state
  const [sessionXp, setSessionXp]       = useState(0);
  const [streakCount, setStreakCount]   = useState(() => getStreak());
  const [userProgress, setUserProgress] = useState(() => getProgress());
  const [consecutiveStreak, setConsecutiveStreak] = useState(0); // combo aciertos seguidos
  const [floatingXp, setFloatingXp]     = useState<{ id: number; amount: number; text?: string; combo?: number } | null>(null);
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>([]);
  const [shakeQuestionIdx, setShakeQuestionIdx] = useState<number | null>(null);
  const [glintQuestionIdx, setGlintQuestionIdx] = useState<number | null>(null);

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
  const scrollRef          = useRef<HTMLDivElement>(null);
  const conceptsRef        = useRef<HTMLDivElement>(null);
  const questionsRef       = useRef<HTMLDivElement>(null);
  const applyRef           = useRef<HTMLDivElement>(null);
  const ankiRef            = useRef<HTMLDivElement>(null);

  useEffect(() => { selectedObjRef.current = selectedObj; }, [selectedObj]);

  const triggerXpGain = useCallback((amount: number, text?: string, activityType?: string, comboBonus?: number) => {
    setSessionXp(prev => prev + amount);
    // Gains that come with a celebration card show their XP inside it; the pill is only for quiet gains.
    if (activityType !== "question_correct" && activityType !== "code_challenge") {
      setFloatingXp({ id: Date.now(), amount, text, combo: comboBonus });
    }
    
    // question_correct is recorded by CelebrationOverlay (same moment, via celebrate), so skip it here to avoid double XP.
    if (activityType && activityType !== "question_correct") {
      const res = recordActivity(activityType);
      if (res.unlocked && res.unlocked.length > 0) {
        setUnlockedBadges(prev => [...prev, ...res.unlocked.map(u => u.title)]);
      }
      const queue: Parameters<typeof celebrate>[0][] = [];
      if (res.levelUp) queue.push({ type: "level_up", title: `Nivel ${res.levelUp}`, subtitle: "Sigues subiendo." });
      res.unlocked.forEach(u => queue.push({ type: "achievement", title: u.title, subtitle: `Logro desbloqueado · ${u.desc}` }));
      queue.forEach(c => celebrate(c));
    }
    setUserProgress(getProgress());

    setTimeout(() => {
      setFloatingXp(curr => (curr && Date.now() - curr.id >= 1900 ? null : curr));
    }, 2100);
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
    void chromeLocalStorage.get(["agent_anki_txt_setup_courses"]).then((data) => {
      const stored = data.agent_anki_txt_setup_courses;
      if (alive && Array.isArray(stored)) setTxtSetupCourses(new Set(stored.map(String)));
    });
    return () => { alive = false; };
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

  // Empuja el glosario de la lección al overlay (content script): palabras
  // exportadas de ESTA lección con su IPA/definición para el chip del video.
  const pushLectureGlossary = useCallback(async () => {
    try {
      if (!courseName.trim() || !lessonName.trim()) return;
      // SIEMPRE se envía (incluso vacío): al cambiar a una lección sin
      // vocabulario, el overlay debe limpiar el glosario de la anterior.
      const words = await getLectureGlossary(courseName, lessonName);
      await contentBridge.sendToContent({
        type: "GLOSSARY_UPDATE",
        payload: { course: courseName, lesson: lessonName, words },
      });
    } catch { /* overlay sin glosario — no fatal */ }
  }, [courseName, lessonName]);

  useEffect(() => { void pushLectureGlossary(); }, [pushLectureGlossary]);

  // Badge de repasos: consulta AnkiConnect (si Anki está abierto) cuántas
  // tarjetas de esta lección tienen repaso pendiente hoy.
  useEffect(() => {
    if (!content) return;
    let alive = true;
    void sendRuntimeMessage<{ ok?: boolean; due?: number }>({
      type: "USG_ANKI_DUE", course: courseName, lesson: lessonName, rootDeck: vocabCfg.rootDeck,
    }).then((r) => {
      if (alive && r?.ok && typeof r.due === "number") setAnkiDue(r.due);
      else if (alive) setAnkiDue(null);
    });
    return () => { alive = false; };
  }, [content, courseName, lessonName, ankiExported, vocabCfg.rootDeck]);

  const handleSaveVocabCfg = (patch: Partial<VocabConfig>) => {
    const next = { ...vocabCfg, ...patch };
    setVocabCfg(next);
    void saveVocabConfig(next);
  };

  // ── Verdict sound is handled centrally by celebrate() ──────────────────────

  // ── Auto-advance focus navigator when steps complete ─────────────────────
  useEffect(() => {
    if (confidence && focusStep === 0) { setFocusDir(1); setFocusStep(1); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confidence]);

  useEffect(() => {
    if (questionsComplete && focusStep <= 2) {
      setFocusDir(1);
      setFocusStep(3);
      // Victory sound
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsComplete]);

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
          if (typeof debug?.promptPreview === "string") {
            console.info("[USG][study][client] prompt sent to Gemini (preview):", debug.promptPreview);
          }
          if (typeof debug?.rawResponse === "string") {
            console.info("[USG][study][client] raw Gemini response:", debug.rawResponse);
            console.info("[USG][study][client] raw Gemini response length:", debug.rawResponseLength);
          }
        } else {
          generationError = "No hubo respuesta del motor de IA. Configura Gemini o inicia la IA local y reintenta.";
        }
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
            description: generationError.length > 140 ? `${generationError.slice(0, 140)}…` : generationError,
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

      // Auto-save Anki cards to Supabase if logged in
      if (session?.user && newContent.ankiCards.length > 0) {
        fetch(`https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c/anki?userId=${session.user.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newContent.ankiCards)
        }).catch(err => console.error("Failed to sync Anki cards", err));
      }

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

    const restoredConfidence = rec.confidence ?? null;
    const canonicalQuestions = restoredConfidence
      ? restored.questions.filter((q) => QUESTIONS_FOR[restoredConfidence].includes(q.difficulty))
      : [];

    const answers: Record<number, string> = {};
    const feedbacks: Record<number, FeedbackState> = {};

    canonicalQuestions.forEach((cq, i) => {
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

    // Legacy snapshots (no prompt stored) fall back to positional mapping.
    if (!attemptsByPrompt.size && rec.questions.length) {
      rec.questions.forEach((q, i) => {
        answers[i] = q.answer ?? "";
        if (q.feedback || q.rating) {
          feedbacks[i] = {
            status: "done",
            content: q.feedback ?? "",
            rating: (q.rating ?? "unknown") as AIRating,
          };
        }
      });
    }

    setQuestionAnswers(answers);
    setQuestionFeedbacks(feedbacks);

    const checkedConceptIndexes = Array.isArray(rec.checkedConceptIndexes) ? rec.checkedConceptIndexes : [];
    setConceptsChecked(Object.fromEntries(checkedConceptIndexes.map((idx) => [idx, true])));
    setConceptsAcknowledged(Boolean(rec.conceptsAcknowledged));

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
    const hasAnkiExport = Boolean(rec.ankiCards && rec.ankiCards.length > 0);
    const done = rec.status === "completed" || hasAnkiExport;
    const restoredQuestionsComplete =
      done ||
      hasCodeChallenge ||
      Boolean(rec.questionsComplete) ||
      rec.questions.some(q => q.rating === "correct" || q.rating === "excellent");
    setQuestionsComplete(restoredQuestionsComplete);
    setSessionComplete(done);
    if (hasAnkiExport) { setAnkiExported(true); setOralSkipped(true); setRecallRevealed(true); }
    const restoredStep = typeof rec.focusStep === "number"
      ? Math.max(0, Math.min(4, Math.round(rec.focusStep)))
      : done
        ? 4
        : rec.codeChallenge
          ? 3
          : restoredQuestionsComplete
            ? 3
            : rec.questions.length > 0
              ? 2
              : rec.conceptsAcknowledged
                ? 2
                : rec.confidence
                  ? 1
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
      const lastLectureWithObjective = lectures.find(l => l.objectiveId || l.objective);
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
          description: "Revisa tus API keys o intenta otra vez en unos segundos.",
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
    setPhase("objective"); setContent(null); setConfidence(null);
    setActiveSessionObjective(null);
    setConceptsChecked({}); setAppAnswer(""); setAppFeedback(IDLE_FB);
    setConceptsAcknowledged(false);
    setShowAppSolution(false); setShowAppHint(false); setAppAttempts(0); appRewardedRef.current = false; setQuestionAnswers({}); setQuestionFeedbacks({});
    setCurrentQIdx(0); setQuestionsComplete(false); setSessionComplete(false);
    setAnkiExported(false); setShowAnkiGuide(false); setShowHint(false);
    setShowModelAnswer(false); setShowInterviewAnswer(false); setOralAnswer(""); setOralFeedback(IDLE_FB); setOralSkipped(false); setRecallRevealed(false); qRewardedRef.current.clear(); conceptRewardedRef.current.clear();
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

  // BUG FIX: reset question state when confidence changes
  const handleConfidenceChange = (c: ConfidenceLevel) => {
    setConfidence(c);
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      confidence: c,
      objectiveId: getActiveObjectiveId(),
      objective: getActiveObjectiveText(),
      focusStep: 1,
    }).catch(err => console.error("[history] upsert confidence", err));
    setCurrentQIdx(0);
    setQuestionsComplete(false);
    setQuestionAnswers({});          // ← was missing
    setQuestionFeedbacks({});        // ← was missing
    setShowHint(false);
    setConceptsAcknowledged(false);
    toast.info("Adaptando las preguntas a tu nivel...", {
      icon: (
        <div className="p-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
          <Brain className="text-blue-400 w-4 h-4" />
        </div>
      )
    });
    setShowModelAnswer(false);
    setAppAnswer("");
    setAppFeedback(IDLE_FB);
    setShowAppSolution(false);
    setSessionComplete(false);
  };

  const handleConceptToggle = (idx: number) => {
    if (questionsComplete) return;
    const isNowChecked = !conceptsChecked[idx];
    if (isNowChecked && !conceptRewardedRef.current.has(idx)) {
      conceptRewardedRef.current.add(idx);
      triggerXpGain(2, "+2 XP Concepto", "concept_ack");
    }
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
        focusStep: 1,
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

  const visibleQuestions = useMemo(() => {
    if (!content || !confidence) return [];
    const base = content.questions.filter(q => QUESTIONS_FOR[confidence].includes(q.difficulty));
    const totalConcepts = content.keyConcepts.length;
    if (totalConcepts <= 0 || base.length <= 1) return base;

    const weakConcepts = new Set<number>();
    for (let i = 0; i < totalConcepts; i += 1) {
      if (!conceptsChecked[i]) weakConcepts.add(i);
    }
    if (weakConcepts.size === 0 || weakConcepts.size === totalConcepts) return base;

    return [...base].sort((a, b) => {
      const aRefs = a.conceptRefs ?? [];
      const bRefs = b.conceptRefs ?? [];
      const aWeak = aRefs.some(ref => weakConcepts.has(ref)) ? 1 : 0;
      const bWeak = bRefs.some(ref => weakConcepts.has(ref)) ? 1 : 0;
      return bWeak - aWeak;
    });
  // conceptSelectionSignature intentionally makes the dependency stable by checked indexes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, confidence, conceptSelectionSignature]);

  // Persist attempts in the canonical question order (content.questions), not in
  // the weakness-sorted visibleQuestions order. Rehydration maps by prompt, so a
  // reorder while answering can no longer shuffle answer/feedback across cards.
  const persistQuestionsInCanonicalOrder = (idx: number, fb: FeedbackState): QuestionAttempt[] => {
    const baseQuestions = content
      ? content.questions.filter(q => confidence && QUESTIONS_FOR[confidence].includes(q.difficulty))
      : [];
    const canonical = baseQuestions.length ? baseQuestions : visibleQuestions;

    return canonical.map((cq) => {
      const vi = visibleQuestions.findIndex(vq => vq.q === cq.q);
      const f = vi === idx ? fb : vi >= 0 ? questionFeedbacks[vi] : undefined;
      return {
        prompt: cq.q,
        answer: vi >= 0 ? questionAnswers[vi] ?? "" : "",
        rating: f?.rating,
        feedback: f?.content,
        answeredAt: vi === idx ? Date.now() : undefined,
      };
    });
  };

  const persistQuestionProgress = (idx: number, fb: FeedbackState) => {
    if (!visibleQuestions[idx]) return;
    const attempts: QuestionAttempt[] = persistQuestionsInCanonicalOrder(idx, fb);
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      questions: attempts,
      focusStep: 2,
    }).catch(err => console.error("[history] upsert question", err));
  };

  const handleEvalQuestion = async (idx: number) => {
    if (!content || !visibleQuestions[idx]) return;
    const userAns = questionAnswers[idx] || "";
    if (!userAns.trim()) return;
    const prevRating = questionFeedbacks[idx]?.rating;
    setQuestionFeedbacks(p => ({ ...p, [idx]: { status: "loading", content: "", rating: "unknown" } }));
    const q = visibleQuestions[idx];
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
      // No auto-advance on fallback path either
      setTimeout(() => scrollToBottom(), 120);
      return;
    }

    const fb: FeedbackState = { status: "done", content: res.content, rating: res.rating, isMock: res.isMock };
    setQuestionFeedbacks(p => ({ ...p, [idx]: fb }));
    persistQuestionProgress(idx, fb);
    
    const isGoodNow = res.rating === "correct" || res.rating === "excellent";
    const alreadyRewarded = qRewardedRef.current.has(q.q) || prevRating === "correct" || prevRating === "excellent";
    const improved = isGoodNow && (prevRating === "partial" || prevRating === "wrong");
    if (isGoodNow && !alreadyRewarded) {
      qRewardedRef.current.add(q.q);
      const nextStreak = consecutiveStreak + 1;
      setConsecutiveStreak(nextStreak);
      setGlintQuestionIdx(idx);
      setTimeout(() => setGlintQuestionIdx(null), 1200);

      const comboBonus = nextStreak >= 2 ? nextStreak * 5 : 0;
      const improveBonus = improved ? 5 : 0;
      const totalGain = 10 + comboBonus + improveBonus;
      const comboText = nextStreak >= 2 ? `+${totalGain} XP (Racha x${nextStreak})` : `+${totalGain} XP`;

      triggerXpGain(totalGain, comboText, "question_correct", nextStreak >= 2 ? nextStreak : undefined);

      const praises = [
        { title: nextStreak >= 2 ? `¡Racha x${nextStreak}! Impecable` : "¡Excelente deducción!", subtitle: "Tu razonamiento es sólido", icon: <Target className="text-violet-400" /> },
        { title: "¡Impecable!", subtitle: "Eso es dominio real del tema", icon: <Zap className="text-amber-400" /> },
        { title: "¡Muy bien respondido!", subtitle: "Bloom diría que vas a nivel 4", icon: <Rocket className="text-violet-400" /> },
        { title: "¡Exacto! Sigue así", subtitle: "Cada respuesta correcta es progreso real", icon: <Sparkles className="text-emerald-400" /> },
        { title: "¡Brillante!", subtitle: "Respuesta correcta al 100%", icon: <Diamond className="text-violet-400" /> },
      ];
      const pick = praises[Math.floor(Math.random() * praises.length)];
      celebrate(improved
        ? { type: "question_correct", bonusXp: comboBonus + improveBonus, combo: nextStreak, title: "¡Lo corregiste!", subtitle: `${comboText} · de ${prevRating === "partial" ? "Parcial" : "Revisemos"} a ${res.rating === "excellent" ? "Excelente" : "Correcto"}`, icon: <Target className="text-violet-400" /> }
        : { type: "question_correct", bonusXp: comboBonus + improveBonus, combo: nextStreak, title: pick.title, subtitle: `${comboText} · nivel «${q.bloom}» · ${(Object.values({ ...questionFeedbacks, [idx]: fb }) as FeedbackState[]).filter(f => f.rating === "correct" || f.rating === "excellent").length} de ${content?.questions.length ?? "?"} dominadas`, icon: pick.icon });
    } else if (!isGoodNow) {
      setConsecutiveStreak(0);
      setShakeQuestionIdx(idx);
      setTimeout(() => setShakeQuestionIdx(null), 600);

      if (res.rating === "partial") {
        triggerXpGain(5, "+5 XP", "question_combo");
        toast.info("Vas por buen camino, veamos el detalle.", {
          icon: (
            <div className="p-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              <Sparkles className="text-amber-400 w-4 h-4" />
            </div>
          )
        });
      }
    }

    // NO auto-advance — the user reads the feedback and clicks "Siguiente" manually
    setTimeout(() => scrollToBottom(), 120);
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

    if (!res.success || !res.content.trim()) {
      const fallback = await evaluateCodeSolution(content.application.setup, content.application.solution, appAnswer, aiContext);
      const fb: FeedbackState = { status: fallback.success ? "done" : "error", content: fallback.success ? fallback.content : (fallback.error ?? "Error"), rating: fallback.rating, isMock: fallback.isMock };
      setAppFeedback(fb);
      if (fb.status === "done") setAppAttempts(n => n + 1);
      historyService.upsertLecture({
        courseName,
        lectureName: lessonName,
        codeChallenge: { prompt: content.application.challenge, answer: appAnswer, rating: fb.rating, feedback: fb.content, answeredAt: Date.now() },
        questionsComplete: true,
        conceptsAcknowledged: true,
        focusStep: 3,
      }).catch(err => console.error("[history] upsert code", err));
      if (fallback.success && (fallback.rating === "correct" || fallback.rating === "excellent")) {
        const firstCode = !appRewardedRef.current;
        if (firstCode) { appRewardedRef.current = true; triggerXpGain(50, "+50 XP Reto Código", "code_challenge"); }
        celebrate({ type: "code_correct", title: "¡Código brillante!", subtitle: firstCode ? "Tu solución es correcta · +50 XP" : "Tu solución es correcta", icon: <Flame className="text-orange-400" /> });
      }
      if (fallback.success && !sessionComplete) setTimeout(() => setSessionComplete(true), 800);
      return;
    }

    setAppFeedback({ status: "done", content: res.content, rating: res.rating, isMock: res.isMock });
    setAppAttempts(n => n + 1);
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      codeChallenge: { prompt: content.application.challenge, answer: appAnswer, rating: res.rating, feedback: res.content, answeredAt: Date.now() },
      questionsComplete: true,
      conceptsAcknowledged: true,
      focusStep: 3,
    }).catch(err => console.error("[history] upsert code", err));
    
    if (res.rating === "correct" || res.rating === "excellent") {
      const firstCode = !appRewardedRef.current;
        if (firstCode) { appRewardedRef.current = true; triggerXpGain(50, "+50 XP Reto Código", "code_challenge"); }
      celebrate({ type: "code_correct", title: "¡Código brillante!", subtitle: firstCode ? "Tu solución es correcta · +50 XP" : "Tu solución es correcta", icon: <Flame className="text-orange-400" /> });
    } else if (res.rating === "partial") {
      triggerXpGain(15, "+15 XP Progreso", "question_combo");
      toast.info("Buena aproximación, revisemos el feedback.", {
        icon: (
          <div className="p-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
            <Wand2 className="text-amber-400 w-4 h-4" />
          </div>
        )
      });
    }

    if (!sessionComplete) setSessionComplete(true);
  };

  const handleForceComplete = () => { 
    setQuestionsComplete(true); 
    setShowHint(false); 
    setShowModelAnswer(false); 
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      questionsComplete: true,
      focusStep: 3,
    }).catch(err => console.error("[history] upsert force complete", err));
    toast.message("Evaluación saltada", { icon: <FastForward className="text-violet-400" size={18} /> });
  };

  // The export that closes the lesson hands the stage to the session-complete celebration.
  const completesSession = () => !sessionCelebratedRef.current && oralDone && steps.slice(0, 4).every(s => s.done);

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

  const handleExport = () => {
    if (!content) return;
    const courseKey = slugify(courseName);
    const isFirst = !txtSetupCourses.has(courseKey);
    const safe = (s: string) => s.replace(/[^a-z0-9]/gi, "_");
    downloadFile(buildAnkiTxt(content.ankiCards, courseName, lessonName), `${safe(lessonName)}_tarjetas.txt`);
    if (isFirst) {
      setTimeout(() => downloadFile(ANKI_CSS, "anki-card-styles.css", "text/css"), 300);
      setTimeout(() => downloadFile(buildTemplateGuide(courseName, lessonName), "PLANTILLA-ANKI.txt"), 600);
      const next = Array.from(new Set([...txtSetupCourses, courseKey]));
      setTxtSetupCourses(new Set(next));
      void chromeLocalStorage.set({ agent_anki_txt_setup_courses: next });
    }
    setAnkiExported(true);
    persistAnkiAndComplete();
    celebrate({ type: "export_done", silent: completesSession(), rewardKey: `anki-txt::${slugify(courseName)}::${slugify(lessonName)}`, title: "¡Tarjetas exportadas!", subtitle: "Archivo TXT listo para importar en Anki", icon: <Download className="text-emerald-400" /> });
  };

  const handleDownloadTxtSetup = () => {
    const courseKey = slugify(courseName);
    downloadFile(ANKI_CSS, "anki-card-styles.css", "text/css");
    setTimeout(() => downloadFile(buildTemplateGuide(courseName, lessonName), "PLANTILLA-ANKI.txt"), 300);
    const next = Array.from(new Set([...txtSetupCourses, courseKey]));
    setTxtSetupCourses(new Set(next));
    void chromeLocalStorage.set({ agent_anki_txt_setup_courses: next });
    toast.success("Setup TXT descargado", {
      description: `Usa CSS + plantilla si necesitas reparar o recrear ${ANKI_NOTE_TYPE}.`,
      icon: <Download className="text-emerald-400" size={18} />,
    });
  };

  const persistAnkiAndComplete = () => {
    if (!content) return;
    const cards: StoredAnkiCard[] = content.ankiCards.map(c => ({
      id: c.id, front: c.front, back: c.back, tags: c.tags, type: c.type,
    }));
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      studyContent: content as StoredStudyContent,
      ankiCards: cards,
      ankiCardsCount: cards.length,
      questionsComplete: true,
      conceptsAcknowledged: true,
      focusStep: 4,
      status: "completed",
      exportedAt: Date.now(),
    }).then(() => historyService.markCompleted(slugify(courseName), slugify(lessonName)))
      .catch(err => console.error("[history] complete", err));
  };

  const handleExportApkg = async () => {
    markQa("apkg-click");
    if (!content || apkgStatus === "loading") { markQa("apkg-skip:" + (content ? "loading" : "no-content")); return; }
    setApkgStatus("loading");
    setApkgProgress("Iniciando…");
    try {
      const deckName = await exportApkgFile(content.ankiCards, courseName, lessonName, vocabCfg.rootDeck, (msg) => {
        setApkgProgress(msg);
        markQa("apkg-progress:" + msg.slice(0, 40));
      });
      setApkgStatus("done");
      setAnkiExported(true);
      markQa("apkg-done:" + deckName.slice(0, 60));
      persistAnkiAndComplete();
      celebrate({ type: "anki_export", silent: completesSession(), rewardKey: `anki-apkg::${slugify(courseName)}::${slugify(lessonName)}`, title: "¡Paquete Anki listo!", subtitle: `Mazo: ${deckName} — impórtalo con doble clic en Anki Desktop`, icon: <Package className="text-violet-400" /> });
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
  const handleExportVocabulary = async () => {
    if (vocabStatus === "loading") return;
    markQa("vocab-click");
    setVocabStatus("loading");
    setVocabProgress("Transcripción…");
    try {
      const transcript = await requestStudyTranscript(22000);
      if (!transcript.ok || !transcript.transcriptText?.trim()) {
        throw new Error(transcript.error || "No hay transcripción disponible en esta lección.");
      }

      setVocabProgress("IA extrayendo palabras…");
      const ai = await sendRuntimeMessage<{ ok?: boolean; payload?: unknown; error?: string }>({
        type: "USG_GENERATE_VOCABULARY",
        transcriptText: transcript.transcriptText,
        course: courseName,
        lesson: lessonName,
        targetLang: vocabCfg.targetLang === "en" ? "inglés" : vocabCfg.targetLangLabel,
        baseLang: vocabCfg.baseLangLabel,
        minLevel: vocabCfg.minLevel,
        maxWords: vocabCfg.maxWords,
      });
      if (!ai?.ok) throw new Error(ai?.error || "El motor de IA no respondió.");

      const parsed = parseVocabularyPayload(ai.payload);
      if (parsed.length === 0) {
        throw new Error(`La IA no encontró palabras de nivel ${vocabCfg.minLevel}+. ¿Los subtítulos de la lección están en ${vocabCfg.targetLangLabel}?`);
      }
      const { fresh: levelFiltered } = filterVocabulary(parsed, vocabCfg);
      const registry = await loadVocabRegistry();
      const { fresh, seen } = splitAlreadyExported(levelFiltered, registry, vocabCfg.targetLang);

      if (fresh.length === 0) {
        setVocabStatus("done");
        setVocabProgress(`${seen.length} ya exportadas`);
        markQa("vocab-dup:" + seen.length);
        toast.info("Sin palabras nuevas esta lección", {
          description: seen.length > 0
            ? `Las ${seen.length} palabras ya estaban en tu mazo de otras lecciones.`
            : "Todo el vocabulario de esta lección ya fue exportado.",
          icon: <CheckCircle2 className="text-sky-400" size={18} />,
        });
        setTimeout(() => setVocabStatus("idle"), 4000);
        return;
      }

      setVocabProgress(`Empaquetando ${fresh.length} palabras…`);
      const { spec, deckPath } = buildVocabularySpec(fresh, courseName, lessonName, vocabCfg);
      const apkg = await buildAnkiApkg(spec, (msg) => setVocabProgress(msg));
      downloadApkg(apkg, `${lessonName.replace(/[^a-z0-9]/gi, "_")}_vocabulario_${vocabCfg.targetLang}.apkg`);
      await markVocabularyExported(vocabCfg.targetLang, fresh, { course: courseName, lesson: lessonName, deck: deckPath });
      void pushLectureGlossary();

      setVocabStatus("done");
      setVocabProgress(`${fresh.length} palabras`);
      markQa("vocab-done:" + fresh.length);
      celebrate({
        type: "anki_export",
        rewardKey: `anki-vocab::${slugify(courseName)}::${slugify(lessonName)}::${vocabCfg.targetLang}`,
        title: "¡Vocabulario exportado!",
        subtitle: `${fresh.length} palabras → ${deckPath}${seen.length ? ` (${seen.length} repetidas saltadas)` : ""}`,
        icon: <Languages className="text-sky-400" />,
      });
      setTimeout(() => setVocabStatus("idle"), 4000);
    } catch (err) {
      console.error("[vocab export]", err);
      markQa("vocab-error:" + String(err instanceof Error ? err.message : err).slice(0, 70));
      setVocabStatus("error");
      setVocabProgress(err instanceof Error ? err.message.slice(0, 70) : "Error al exportar");
      toast.error("No se pudo exportar el vocabulario", {
        description: err instanceof Error && err.message.length > 140 ? `${err.message.slice(0, 140)}…` : undefined,
      });
      setTimeout(() => setVocabStatus("idle"), 5000);
    }
  };

  // ── Obsidian export ──────────────────────────────────────────────────────────
  const getObsidianSessionData = (): ObsidianSessionData | null => {
    if (!content) return null;
    return {
      courseName,
      lessonName,
      objective: getActiveObjectiveText() || undefined,
      sourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      platform: "udemy",
      content: content as ObsidianSessionData["content"],
    };
  };

  const handleExportObsidian = () => {
    const data = getObsidianSessionData();
    if (!data) return;
    if (!obsidianCfg.vaultName.trim()) {
      setObsidianPanelOpen(true);
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
        description: "Reexportar crea una copia (\"nombre 1.md\"). «Copiar» te da el markdown sin duplicar.",
        action: { label: "Exportar copia", onClick: () => doExportObsidian(data, false) },
        duration: 10000,
        icon: <BookMarked className="text-amber-400" size={18} />,
      });
      return;
    }
    doExportObsidian(data, true);
  };

  const doExportObsidian = (data: ObsidianSessionData, markExported: boolean) => {
    try {
      const result = exportSessionToObsidian(data, obsidianCfg, {
        createdMocs,
        onMocCreated: (slug) => {
          const next = [...createdMocs, slug];
          setCreatedMocs(next);
          void saveCreatedMocs(next);
        },
      });
      setObsidianStatus("done");
      setAnkiExported(true); persistAnkiAndComplete();
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
      if (obsidianCfg.includeRawSrt) {
        void fetchEnSrtForExport().then((srt) => {
          if (!srt) {
            toast.info("SRT crudo no disponible todavía — raw/ omitido en esta exportación.");
            return;
          }
          const rawPath = buildRawSrtNotePath(data.courseName, data.lessonName, { platform: "udemy" });
          openObsidianUri(buildObsidianNewUri(obsidianCfg.vaultName, {
            path: rawPath,
            markdown: buildRawSrtNoteMarkdown(data.courseName, data.lessonName, srt, {
              platform: "udemy",
              sourceUrl: data.sourceUrl,
            }),
          }));
          toast.success("SRT crudo guardado en raw/", { description: rawPath });
        });
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
      } finally {
        area.remove();
      }
    }
    toast.success("Markdown copiado", { description: "Pégalo en Obsidian donde quieras (Ctrl+V)." });
  };

  const handleDownloadObsidianMarkdown = () => {
    const data = getObsidianSessionData();
    if (!data) return;
    const path = buildSessionNotePath(obsidianCfg, courseName, lessonName);
    downloadFile(buildSessionNoteMarkdown(data, obsidianCfg), path.split("/").pop() || "sesion.md", "text/markdown;charset=utf-8");
    toast.success("Nota .md descargada", { description: "Muévela a la carpeta del vault si no la guardaste ahí." });
  };

  const handleSaveObsidianCfg = (patch: Partial<ObsidianExportConfig>) => {
    const next = { ...obsidianCfg, ...patch };
    setObsidianCfg(next);
    void saveObsidianExportConfig(next);
  };

  const handleTestObsidianVault = () => {
    if (!obsidianCfg.vaultName.trim()) {
      toast.error("Escribe el nombre del vault primero.");
      return;
    }
    openObsidianUri(buildObsidianOpenVaultUri(obsidianCfg.vaultName));
    toast.info("Obsidian debería abrir ese vault ahora", {
      description: "Si abre vacío o avisa que no existe, revisa el nombre exacto en el selector de vaults.",
      duration: 7000,
    });
  };

  const handleCreateVaultScaffold = () => {
    if (!obsidianCfg.vaultName.trim()) {
      toast.error("Escribe el nombre del vault primero.");
      return;
    }
    const count = createVaultScaffold(obsidianCfg, { platform: "udemy" });
    toast.success(`Creando estructura (${count} notas)…`, {
      description: "Obsidian crea carpetas y notas: CLAUDE.md, índice, log y plantillas.",
      icon: <FolderPlus className="text-violet-400" size={18} />,
    });
  };

  const isFirstExport = !txtSetupCourses.has(slugify(courseName));
  // BUG FIX: only show apply if questionsComplete (not allQsAnswered with wrong ratings)
  const showApply = confidence !== null && questionsComplete;

  // ── Focus navigator helpers ───────────────────────────────────────────────
  const stepUnlocked = [
    true,                    // 0 Autocalibrar
    confidence !== null,      // 1 Conceptos
    confidence !== null,      // 2 Verificar
    questionsComplete,        // 3 Aplicar
    showApply,               // 4 Anki + Entrevista
  ] as const;

  const canGoNext = focusStep < 4 && stepUnlocked[focusStep + 1 as 0|1|2|3|4];
  const canGoPrev = focusStep > 0;

  const goToStep = (target: number) => {
    if (target < 0 || target > 4) return;
    if (!stepUnlocked[target as 0|1|2|3|4]) return;
    if (focusStep === 1 && target === 2) setConceptsAcknowledged(true);
    // Reset scroll ANTES del re-render — evita que AnimatePresence empuje hacia abajo
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setFocusDir(target > focusStep ? 1 : -1);
    setFocusStep(target);
    if (content) {
      historyService.upsertLecture({
        courseName,
        lectureName: lessonName,
        focusStep: target,
        conceptsAcknowledged: focusStep === 1 && target === 2 ? true : undefined,
      }).catch(err => console.error("[history] upsert focus step", err));
    }
  };

  const handleGoVerify = () => {
    const checkedConceptIndexes = Object.entries(conceptsChecked)
      .filter(([, checked]) => checked)
      .map(([key]) => Number(key))
      .filter(Number.isFinite);
    setConceptsAcknowledged(true);
    historyService.upsertLecture({
      courseName,
      lectureName: lessonName,
      checkedConceptIndexes,
      conceptsAcknowledged: true,
      focusStep: 2,
    }).catch(err => console.error("[history] upsert concept acknowledgement", err));
    goToStep(2);
  };

  // BUG FIX: once questionsComplete, conceptsDone is locked true (prevents unmark on back-nav)
  const conceptsMarkedCount = Object.values(conceptsChecked).filter(Boolean).length;
  const conceptsDone = questionsComplete || conceptsAcknowledged || conceptsMarkedCount >= 2;

  const oralDone = !content?.interviewQ || oralFeedback.status === "done" || oralSkipped;

  // "Wrong" blocks the step until a 2nd attempt or until the reference solution was opened; an AI error never blocks.
  const appPassed = appFeedback.status === "done" && (appFeedback.rating !== "wrong" || appAttempts >= 2 || showAppSolution);

  // Stepper state
  const steps = [
    { label: "Mi nivel",    done: confidence !== null,  active: confidence === null },
    { label: "Lo que vi",   done: conceptsDone,         active: confidence !== null && !conceptsDone },
    { label: "¿Lo sé?",    done: questionsComplete,    active: confidence !== null && !questionsComplete },
    { label: "Practícalo", done: appPassed, active: showApply && !appPassed },
    { label: "No olvidar", done: ankiExported && oralDone, active: showApply },
  ];

  const allStepsComplete = steps.every(s => s.done);
  const hasUsableObjective = Boolean(
    customObj.trim() ||
    (dynamicObjectives?.some(o => o.id === selectedObj) && !objectivesMock)
  );

  // Celebrate once per session when every step is done (not on rehydrate, not on re-toggle).
  useEffect(() => {
    if (!allStepsComplete || sessionCelebratedRef.current) return;
    const id = setTimeout(() => {
      if (sessionCelebratedRef.current) return;
      sessionCelebratedRef.current = true;
      celebrate({
        type: "session_complete",
        rewardKey: `session::${slugify(courseName)}::${slugify(lessonName)}`,
        title: "¡Lección Dominada!",
        subtitle: `${lessonName ? `«${lessonName}»: ` : ""}evaluada, practicada y fijada en tu memoria`,
        icon: <Icon name="graduation" size={24} />,
      });
      setTimeout(() => scrollToBottom(), 300);
    }, 500);
    return () => clearTimeout(id);
  }, [allStepsComplete, scrollToBottom]);

  // duplicate allStepsComplete effect removed — first useEffect above handles chord + scroll

  // El botón de historial de las pestañas (ExtensionSidebar) abre el historial.
  useEffect(() => {
    const open = () => setHistoryOpen(true);
    window.addEventListener("usb:open-history", open);
    return () => window.removeEventListener("usb:open-history", open);
  }, []);

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
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--usb-divider)] shrink-0">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border shadow-sm"
                  style={{
                    background: "color-mix(in srgb, #6d4aff 12%, var(--usb-bg-3))",
                    borderColor: "color-mix(in srgb, #6d4aff 24%, var(--usb-border))",
                    color: t("#b7a6ff", "#5b37e8"),
                  }}>
                  <Icon name="history" size={15} weight="duotone" />
                </span>
                <span className="flex-1 text-[13px] font-bold tracking-tight text-[var(--usb-fg)]">Historial de estudio</span>
                <button
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Cerrar historial"
                  className="kx-chip w-7 h-7 flex items-center justify-center rounded-full"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <HistoryPanel
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
                  <span className="kx-hero-t2 text-[11px] font-bold tracking-wider uppercase">Study Agent</span>
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
                {([["steps", "5 pasos"], ["timer", "~8 min"], ["zap", "+XP por clase"]] as const).map(([ic, label]) => (
                  <span key={label} className="kx-hero-chip text-[10.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <Icon name={ic} size={13} weight="duotone" />{label}
                  </span>
                ))}
              </div>
            </div>

            <MemoryCard
              onExportLesson={async (rec) => {
                await exportApkgFile(
                  (rec.ankiCards ?? []).map((c) => ({ ...c, tags: c.tags ?? [], type: c.type ?? "concept" })) as unknown as AnkiCard[],
                  rec.courseName, rec.lectureName, vocabCfg.rootDeck,
                );
                await new Promise((r) => setTimeout(r, 600));
              }}
            />

            {/* Objectives — AI-generated per course, with fold-don't-hide disclosure */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <SectionTitle icon="target" hue={0}>¿Para qué estudias esto?</SectionTitle>
                {(dynamicObjectives || objectivesMock || objectivesError) && (
                  <button onClick={handleRegenerateObjectives} disabled={objectivesLoading}
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
                    <div key={i} className="h-[88px] rounded-2xl bg-[var(--usb-bg-3)] border border-[var(--usb-border)] animate-pulse"/>
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


            {/* Custom objective */}
            {(() => {
              const isCustomActive = selectedObj === "custom" && customObj.trim().length > 0;
              const textChangedSinceRefine = refinedObj && customObj.trim() !== refinedFromText.trim();
              const fallbackId = dynamicObjectives?.[0]?.id ?? lastUsedObjectiveId ?? "spring-senisenior";
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
                    className={`w-full h-[74px] text-[12.5px] rounded-2xl bg-[var(--usb-bg-3)] border ${isCustomActive ? "border-[#6d4aff]/60 ring-2 ring-[#6d4aff]/20" : "border-[var(--usb-border)]"} text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-fg-lo)] px-4 py-3 resize-none outline-none focus:border-[#6d4aff]/60 focus:ring-2 focus:ring-[#6d4aff]/20 transition-colors leading-relaxed`}/>

                  <AnimatePresence mode="wait">
                    {/* No refined version yet → primary CTA */}
                    {customObj.trim() && !refinedObj && (
                      <motion.button key="refine-cta" initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        onClick={handleRefine} disabled={isRefining}
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

            {/* Course info */}
            <div className="space-y-3">
              <SectionTitle icon="bookOpen" hue={2}>Datos del curso</SectionTitle>
              <input value={courseName} onChange={e => { setCourseName(e.target.value); courseNameEditedRef.current = true; }} placeholder="Nombre del curso (para mazo Anki)"
                className="w-full h-11 text-[12.5px] rounded-2xl kx-field bg-[var(--usb-bg-3)] border border-[var(--usb-border)] text-[var(--usb-fg)] placeholder:text-[var(--usb-fg-lo)] px-4 outline-none focus:border-[#6d4aff]/60 focus:ring-2 focus:ring-[#6d4aff]/20 transition-colors"/>
              <input value={lessonName} onChange={e => setLessonName(e.target.value)} placeholder="Nombre del video/clase actual"
                className="w-full h-11 text-[12.5px] rounded-2xl kx-field bg-[var(--usb-bg-3)] border border-[var(--usb-border)] text-[var(--usb-fg)] placeholder:text-[var(--usb-fg-lo)] px-4 outline-none focus:border-[#6d4aff]/60 focus:ring-2 focus:ring-[#6d4aff]/20 transition-colors"/>
              <textarea value={courseDescription} onChange={e => setCourseDescription(e.target.value)}
                placeholder="Descripción breve del curso (ayuda a la IA a generar mejores objetivos)"
                className="w-full h-[74px] text-[12px] rounded-2xl bg-[var(--usb-bg-3)] border border-[var(--usb-border)] text-[var(--usb-fg)] placeholder:text-[var(--usb-fg-lo)] p-3 resize-none outline-none focus:border-[#6d4aff]/60 focus:ring-2 focus:ring-[#6d4aff]/20 transition-colors leading-relaxed custom-scrollbar-thin"/>
            </div>

            {/* Transcript indicator */}
            <div className="kx-ok-strip flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
              <span className="kx-ok-tile w-8 h-8 rounded-xl flex items-center justify-center shrink-0"><Icon name="fileText" size={17} weight="duotone"/></span>
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-[var(--usb-fg-hi)] leading-tight">Transcripción capturada</p>
                <p className="text-[10.5px] text-[var(--usb-fg-lo)] font-medium">Lista para analizar</p>
              </div>
              <span className="kx-ok-pill text-[11px] font-bold tabular-nums ml-auto px-2.5 py-1 rounded-full">248 líneas</span>
            </div>

            {/* Preview de los 5 pasos */}
            <div className="kx-card rounded-2xl p-4 space-y-3.5" style={{ "--kx-step": STEP_META[0].hue } as React.CSSProperties}>
            <p className="kx-slate">Tu recorrido · 5 pasos</p>
            <div className="relative grid grid-cols-5 gap-1.5">
              <span className="absolute left-[10%] right-[10%] top-5 h-px bg-[var(--usb-border)]" aria-hidden="true" />
              {STEP_META.map((m, i) => (
                <div key={i} className="group flex flex-col items-center gap-2 min-w-0" style={{ "--kx-step": m.hue, "--kx-ink": t(m.inkDark, m.inkLight) } as React.CSSProperties}>
                  <span className="relative w-10 h-10 rounded-xl flex items-center justify-center border transition-transform duration-200 group-hover:-translate-y-0.5"
                    style={{ background: `color-mix(in srgb, ${m.hue} 20%, var(--usb-bg-3))`, borderColor: `color-mix(in srgb, ${m.hue} 45%, var(--usb-border))`, color: t(m.inkDark, m.inkLight), boxShadow: `0 6px 12px -8px ${m.hue}` }}>
                    <Icon name={m.icon} size={19} weight="duotone" />
                  </span>
                  <span className="text-[10.5px] font-bold tracking-tight text-[var(--usb-fg-hi)] leading-none truncate max-w-full">
                    {["Nivel", "Repaso", "Recordar", "Práctica", "Anki"][i]}
                  </span>
                </div>
              ))}
            </div>
            </div>

            {/* Generate CTA */}
            <button onClick={handleGenerate} disabled={!hasUsableObjective}
              className="kx-gen-cta w-full h-12 rounded-2xl disabled:cursor-not-allowed text-[12.5px] font-bold flex items-center justify-center gap-2 transition-all">
              <Icon name="sparkles" size={17} weight="duotone"/>Generar sesión de aprendizaje
              <ArrowRight size={14}/>
            </button>
          </motion.div>
        )}

        {/* ══ GENERATING ══ */}
        {phase === "generating" && (
          <motion.div key="gen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
            className="kx-study flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
            {(() => {
              const cur = STEP_META[Math.min(genStep, STEP_META.length - 1)];
              const pct = Math.round((Math.min(genStep, 5) / 5) * 100);
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
                        <span className="kx-hero-t2 text-[11px] font-bold tracking-wider uppercase">Study Agent</span>
                      </div>
                      <span className="kx-hero-chip text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <span className="kx-live-dot" />Paso {Math.min(genStep + 1, 5)} de 5
                      </span>
                    </div>
                    <p className="kx-hero-t1 relative text-[21px] font-extrabold tracking-tight leading-tight">Preparando tu sesión</p>
                    <p className="kx-hero-t2 relative text-[12px] leading-relaxed mt-1.5">Calibrando conceptos y práctica personalizada</p>
                    <div className="relative mt-3.5 h-1.5 rounded-full bg-white/25 overflow-hidden">
                      <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${Math.max(pct, 6)}%` }} />
                    </div>
                  </div>

                  <div className="kx-card rounded-2xl p-2 space-y-0.5" style={{ "--kx-step": cur.hue } as React.CSSProperties}>
                    {GEN_STEPS.map((label, i) => {
                      const m = STEP_META[i];
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
                            <p className="kx-slate">Paso {i + 1}</p>
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
                  {consecutiveStreak >= 2 && (
                    <motion.span
                      key={consecutiveStreak}
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 14 }}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-bold"
                    >
                      <Flame size={10} className="fill-orange-400" />
                      x{consecutiveStreak}
                    </motion.span>
                  )}
                  {sessionXp > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-semibold tracking-tight">
                      <Zap size={10} className="fill-amber-400 text-amber-400" />
                      +{sessionXp} XP
                    </span>
                  )}
                  <button onClick={handleReset} className="flex items-center gap-1 text-[10px] text-[var(--usb-fg-lo)] hover:text-violet-400 transition-colors font-medium">
                    <RotateCcw size={10}/>Reiniciar
                  </button>
                </div>
              </div>

              {/* Live Level & XP Progress bar */}
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <div className="flex items-center gap-1 text-[9.5px] font-semibold text-white/50 shrink-0">
                  <span className="text-violet-300 font-bold">Nv. {userProgress.level}</span>
                </div>
                <div className="h-1 flex-1 bg-white/6 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 via-amber-400 to-emerald-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(5, (userProgress.into / userProgress.span) * 100))}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <span className="text-[9px] font-mono text-white/35 tabular-nums shrink-0">
                  {userProgress.into}/{userProgress.span} XP
                </span>
              </div>

              {/* Floating XP Toast / Pill */}
              <AnimatePresence>
                {floatingXp && (
                  <motion.div
                    key={floatingXp.id}
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: -2, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.85 }}
                    transition={{ duration: 0.25 }}
                    className="absolute right-4 top-full mt-2 pointer-events-none z-30 flex items-center gap-1 px-2.5 py-1 rounded-full kx-on-solid kx-cta text-[10px] font-extrabold"
                  >
                    <Zap size={11} />
                    <span>{floatingXp.text || `+${floatingXp.amount} XP`}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <ProgressStepper steps={steps} focus={focusStep}/>
            </div>

            <div className="p-4 space-y-4">

              {/* Session complete banner */}
              <AnimatePresence>
                {sessionComplete && !allStepsComplete && (
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -6 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="bg-emerald-500/8 border border-emerald-500/22 rounded-xl p-3 flex items-center gap-3 relative overflow-hidden">
                    <motion.span 
                      animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                      className="text-2xl shrink-0 relative z-10"
                    >
                      <Icon name="graduation" size={26} />
                    </motion.span>
                    <div className="relative z-10">
                      <p className="text-white/80 text-[11px]" style={{ fontWeight: 600 }}>¡Sesión completada!</p>
                      <p className="text-white/35 text-[10px] mt-0.5">Practicaste activamente. Exporta las tarjetas para no perder lo aprendido.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

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
                {ankiDue != null && ankiDue > 0 && (
                  <button
                    onClick={() => { void sendRuntimeMessage({ type: "USG_ANKI_DUE", course: courseName, lesson: lessonName, browse: true, rootDeck: vocabCfg.rootDeck }); }}
                    title="Abrir estas tarjetas en el navegador de Anki"
                    className="ml-auto shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300/90 text-[10px] font-bold tabular-nums hover:bg-amber-500/18 transition-colors"
                  >
                    <Repeat2 size={10}/>
                    {ankiDue} por repasar
                  </button>
                )}
              </div>
              )}

              {/* ── FOCUS NAV ── */}
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => goToStep(focusStep - 1)} disabled={!canGoPrev}
                  className={`kx-nav-btn flex items-center gap-1 pl-2 pr-3 py-1.5 rounded-full text-[10.5px] font-semibold transition-all ${canGoPrev ? "text-white/60 hover:bg-white/8 cursor-pointer" : "text-white/15 cursor-not-allowed"}`}>
                  <ChevronLeft size={13} /> Anterior
                </button>
                <span className="kx-step-count text-[10px] font-bold tabular-nums px-2.5 py-1 rounded-full">{focusStep + 1} / 5</span>
                <button onClick={() => goToStep(focusStep + 1)} disabled={!canGoNext}
                  title={!canGoNext && focusStep < 4 ? "Completa este paso primero" : ""}
                  className={`kx-nav-btn flex items-center gap-1 pl-3 pr-2 py-1.5 rounded-full text-[10.5px] font-semibold transition-all ${canGoNext ? "kx-next cursor-pointer" : "text-white/15 cursor-not-allowed"}`}>
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
                  <StepHeader n={1} label="¿Cómo llegaste al video?" subLabel="mi nivel" status={confidence ? "done" : "active"}/>
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
                          {/* Top indicator row: emoji badge + tag */}
                          <div className="flex items-center justify-between w-full mb-3">
                            <span
                              className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs transition-all group-hover:scale-110 text-[20px] select-none"
                              style={{
                                background: `color-mix(in srgb, ${c.color} ${isSelected ? "18%" : "8%"}, var(--usb-bg-3))`,
                                borderColor: `color-mix(in srgb, ${c.color} ${isSelected ? "40%" : "20%"}, var(--usb-border))`,
                              }}
                            >
                              {c.emoji}
                            </span>

                            {/* Tag + Level meter */}
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border bg-[var(--usb-bg-2)]/90 border-[var(--usb-border)] shadow-2xs">
                              <span className="text-[9.5px] font-bold tracking-tight text-[var(--usb-fg-lo)]">
                                {c.tag}
                              </span>
                              <div className="flex items-end gap-0.5">
                                {[1, 2, 3, 4].map(barIndex => (
                                  <span
                                    key={barIndex}
                                    className={`w-1 rounded-full transition-all ${
                                      barIndex <= c.bars
                                        ? "bg-current"
                                        : "bg-[var(--usb-border)]"
                                    }`}
                                    style={{
                                      height: `${barIndex * 2.5 + 3}px`,
                                      color: isSelected ? c.color : "var(--usb-fg-mid)",
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
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

                  {/* Coach bubble — appears after selection */}
                  <AnimatePresence>
                    {confidence && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 380, damping: 28, delay: 0.15 }}
                        className="mt-3.5 pt-3.5 border-t border-[var(--usb-border)] flex items-start gap-3 bg-[var(--usb-bg-2)]/50 p-3 rounded-xl"
                      >
                        <motion.span
                          animate={{ rotate: [0, -8, 8, -4, 0] }}
                          transition={{ duration: 0.5, delay: 0.3 }}
                          className="text-[20px] shrink-0 leading-none mt-0.5 text-violet-400"
                        ><Icon name={COACH_BUBBLE[confidence].icon} size={22} weight="duotone" /></motion.span>
                        <div>
                          <p className="text-[var(--usb-fg-hi)] text-[12px] leading-tight mb-1 font-bold">{COACH_BUBBLE[confidence].title}</p>
                          <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">{COACH_BUBBLE[confidence].tip}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              )}

              {/* ── Step 1: Key concepts ── */}
              {focusStep === 1 && confidence && (() => {
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
                          className="kx-field w-full resize-none rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-fg-lo)] outline-none focus:border-[#6d4aff]/60 transition-colors"
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
                              Verificar mi comprensión <ArrowRight size={11} />
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

              {/* ── Step 2: Questions ── */}
              {focusStep === 2 && confidence && visibleQuestions.length > 0 && (() => {
                const doneCount = Object.values(questionFeedbacks).filter(f => f?.status === "done").length;
                return (
                <div ref={questionsRef} className="space-y-3.5">
                  {questionsComplete && (
                    <p className="text-white/45 text-[11px] leading-relaxed px-1">Toca cada pregunta para revisar tu respuesta y el feedback de la IA.</p>
                  )}

                {/* Review mode — when questionsComplete, show the summary instead of the card */}
                {questionsComplete && (
                  <VerifyDoneReview
                    questions={visibleQuestions}
                    answers={questionAnswers}
                    feedbacks={questionFeedbacks}
                    onGoApply={() => goToStep(3)}
                  />
                )}
                <div className={`kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden ${questionsComplete ? "hidden" : ""}`}>
                    <div className="px-4 pt-4 pb-2.5 border-b border-[var(--usb-divider)]">
                      <div className="flex items-center justify-between">
                        <StepHeader n={3} label="¿Cuánto retuviste?" status={questionsComplete ? "done" : "active"}/>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2 pb-4">
                          {visibleQuestions.map((_, i) => {
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
                          animate={{ width: questionsComplete ? "100%" : `${(doneCount / Math.max(visibleQuestions.length, 1)) * 100}%` }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    <div className="p-4">
                      {questionsComplete ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4 space-y-2 relative">
                          <p className="text-emerald-400 text-[13px] relative z-10 pt-3" style={{ fontWeight: 600 }}>¡Comprensión verificada!</p>
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none animate-[spin_15s_linear_infinite]" />
                          <div className="relative z-10 animate-[bounce_2s_ease-in-out_infinite] mt-2 text-emerald-300 drop-shadow-md"><Icon name="rocket" size={40} /></div>
                          <p className="text-white/40 text-[10px] relative z-10 pt-1">La IA confirmó que captaste los conceptos clave. Continúa con la práctica.</p>
                        </motion.div>
                      ) : (
                        <>
                          {visibleQuestions.map((q, i) => i !== currentQIdx ? null : (
                            <motion.div
                              key={`q-${i}-${confidence}`}
                              initial={{ opacity: 0, x: 12, scale: 0.99 }}
                              animate={{
                                opacity: 1,
                                x: shakeQuestionIdx === i ? [0, -6, 6, -4, 4, 0] : 0,
                                scale: glintQuestionIdx === i ? [1, 1.02, 1] : 1,
                              }}
                              transition={{
                                type: "spring", stiffness: 360, damping: 28,
                                x: shakeQuestionIdx === i ? { type: "tween", duration: 0.4, ease: "easeInOut" } : { type: "spring", stiffness: 360, damping: 28 },
                                scale: glintQuestionIdx === i ? { type: "tween", duration: 0.5, ease: "easeInOut" } : { type: "spring", stiffness: 360, damping: 28 },
                              }}
                              className={`space-y-3 transition-shadow duration-300 ${
                                glintQuestionIdx === i ? "ring-2 ring-emerald-400/60 rounded-xl bg-emerald-500/5 p-1" : ""
                              } ${
                                shakeQuestionIdx === i ? "ring-2 ring-amber-400/50 rounded-xl" : ""
                              }`}
                            >


                              {/* Question header: number + bloom */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-white/22 text-[10px] font-mono">{i+1} <span className="text-white/12">/</span> {visibleQuestions.length}</span>
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
                                      className={`w-full h-[92px] text-[12px] rounded-2xl bg-[var(--usb-bg-3)] border px-3.5 py-3 resize-none outline-none transition-all leading-relaxed text-[var(--usb-fg)] placeholder:text-[var(--usb-fg-lo)] ${ratingBorder}`}/>
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

                                {/* Siguiente / Continuar — appears after feedback */}
                                {questionFeedbacks[i]?.status === "done" && (() => {
                                  const isLast = i >= visibleQuestions.length - 1;
                                  const isGood = questionFeedbacks[i]?.rating === "correct" || questionFeedbacks[i]?.rating === "excellent";
                                  return (
                                    <motion.button
                                      initial={{ opacity: 0, scale: 0.9, x: -6 }}
                                      animate={{ opacity: 1, scale: 1, x: 0 }}
                                      transition={{ type: "spring", stiffness: 400, damping: 24, delay: 0.15 }}
                                      onClick={() => isLast ? handleForceComplete() : (setCurrentQIdx(i+1), setShowHint(false), setShowModelAnswer(false))}
                                      className={`flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg transition-all ml-auto ${
                                        isGood
                                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30"
                                          : "border border-violet-500/25 bg-violet-500/8 text-violet-300/80 hover:text-violet-200 hover:border-violet-500/40"
                                      }`}
                                    >
                                      {isLast
                                        ? <>Ir al desafío <ArrowRight size={9}/></>
                                        : <>Siguiente <ArrowRight size={9}/></>
                                      }
                                    </motion.button>
                                  );
                                })()}
                              </div>

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
                                        ? "bg-white/5 border-white/10 text-white/55"
                                        : "border-[var(--usb-border)] text-white/25 hover:text-white/45 hover:border-white/12"
                                    }`}>
                                    <span className="text-[10px] flex-1">Respuesta modelo</span>
                                    <ChevronDown size={9} className={`shrink-0 transition-transform text-white/30 ${showModelAnswer ? "rotate-180" : ""}`}/>
                                  </button>
                                  <AnimatePresence>
                                    {showModelAnswer && (
                                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden -mt-1">
                                        <div className="bg-white/3 border border-[var(--usb-border)] rounded-xl px-3 py-2.5 text-[11px] text-white/50 leading-relaxed whitespace-pre-line">
                                          {q.answer}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </>
                              )}
                            </motion.div>
                          ))}
                          {/* Escape hatch — always visible, not a trap */}
                          {!questionsComplete && (
                            <button onClick={handleForceComplete} className="mt-1 w-full text-[9px] text-white/15 hover:text-white/38 transition-colors py-1 flex items-center justify-center gap-1">
                              <FastForward size={8}/>Saltar a la práctica
                            </button>
                          )}
                        </>
                      )}
                    </div>
                </div>
                </div>
                );
              })()}

              {/* ── Step 3: Apply ── */}
              {focusStep === 3 && (
                showApply ? (
                <div className="space-y-3.5">
                  <div ref={applyRef} className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden">
                    <div className="px-4 pt-4 pb-2">
                      <StepHeader
                        n={4}
                        label={content.application.isCode ? "Escribe código real" : "Aplica lo aprendido"}
                        subLabel={content.application.isCode ? "desafío práctico" : "ejercicio práctico"}
                        status={appPassed ? "done" : "active"}
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
                          className={`w-full h-[100px] text-[12px] rounded-2xl bg-[var(--usb-bg-3)] border px-3.5 py-3 resize-none outline-none transition-all leading-relaxed shadow-inner placeholder:text-[var(--usb-fg-lo)] ${
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

                      {/* Ir a Anki — appears once evaluation is done */}
                      <AnimatePresence>
                        {appFeedback.status === "done" && !appPassed && (
                          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10.5px] text-[var(--usb-fg-mid)] text-center leading-relaxed">
                            Aún no es suficiente. Usa el feedback, ajusta tu respuesta y vuelve a revisar; tras un segundo intento podrás continuar.
                          </motion.p>
                        )}
                        {appPassed && (
                          <motion.button
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, type: "spring", stiffness: 380, damping: 26 }}
                            onClick={() => goToStep(4)}
                            className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-[10px] transition-all ${
                              appFeedback.rating === "correct" || appFeedback.rating === "excellent"
                                ? "kx-on-solid kx-cta border-transparent"
                                : "border-white/10 text-white/40 hover:text-white/65 hover:border-white/20"
                            }`}
                          >
                            {appFeedback.rating === "correct" || appFeedback.rating === "excellent"
                              ? <>Fíjalo en memoria <ArrowRight size={10}/></>
                              : <>Continuar de todas formas <ArrowRight size={10}/></>
                            }
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
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

              {/* ── Step 5: calibración + práctica oral + fijar en memoria ── */}
              {focusStep === 4 && (() => {
                const correctCount = Object.values(questionFeedbacks).filter(f => f?.rating === "correct" || f?.rating === "excellent").length;
                const totalQ = visibleQuestions.length;
                const elapsedMin = Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 60000));
                const oralPracticeMeta = getOralPracticeMeta(content, activeSessionObjective || getActiveObjectiveText());
                const calibration = (() => {
                  if (!confidence || totalQ === 0) return null;
                  const order: ConfidenceLevel[] = ["confused", "partial", "clear", "mastered"];
                  const ratio = correctCount / totalQ;
                  const shown = ratio < 0.4 ? 0 : ratio < 0.65 ? 1 : ratio < 0.9 ? 2 : 3;
                  const said = order.indexOf(confidence);
                  const label = (i: number) => CONFIDENCE.find(c => c.id === order[i])?.label ?? "";
                  const diff = shown - said;
                  return {
                    said: label(said), shown: label(shown),
                    msg: diff === 0 ? "Tu autopercepción fue precisa. Eso también es aprender."
                      : diff < 0 ? "Te sentías más seguro de lo que mostraste. Es normal: repasar con Anki cierra justo esa brecha."
                      : "Sabes más de lo que creías. La próxima vez sube tu nivel de partida.",
                  };
                })();
                return (
              <div className="space-y-3.5">
                {/* Session achievement summary */}
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 340, damping: 28 }}
                  className="kx-step-solid kx-on-solid rounded-2xl p-4 flex items-center gap-3 relative overflow-hidden"
                >
                  <motion.span animate={{ rotate: [0, -8, 8, 0] }} transition={{ duration: 0.6, delay: 0.3 }} className="relative z-10 w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.18)" }}><Icon name="flag" size={26} weight="duotone" /></motion.span>
                  <div className="flex-1 relative z-10">
                    <p className="text-[13px]" style={{ fontWeight: 800 }}>¡Llegaste al último paso!</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10.5px] font-semibold flex items-center gap-1"><Check size={9} strokeWidth={3}/>{Object.values(conceptsChecked).filter(Boolean).length} conceptos</span>
                      {totalQ > 0 && <span className="text-[10.5px] font-semibold flex items-center gap-1"><Check size={9} strokeWidth={3}/>{correctCount}/{totalQ} correctas</span>}
                      <span className="text-[10.5px] font-semibold opacity-80">~{elapsedMin} min</span>
                    </div>
                  </div>
                </motion.div>

              {calibration && (
                <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-[#6d4aff]/8 border-b border-[#6d4aff]/15">
                    <div className="w-8 h-8 rounded-xl bg-[#6d4aff]/15 border border-[#6d4aff]/30 flex items-center justify-center shrink-0">
                      <Target size={14} className="text-[#6d4aff]"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--usb-fg-hi)] text-[11.5px] font-bold">Tu nivel: creído vs. demostrado</p>
                      <p className="text-[var(--usb-fg-lo)] text-[10px] font-medium">Saber cuánto sabes de verdad te ayuda a estudiar mejor</p>
                    </div>
                  </div>
                  <div className="px-4 py-3.5 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2">
                        <p className="text-[var(--usb-fg-lo)] text-[9px] font-semibold uppercase tracking-wider">Al empezar dijiste</p>
                        <p className="text-[var(--usb-fg-hi)] text-[12px] font-bold mt-0.5">{calibration.said}</p>
                      </div>
                      <div className="rounded-xl border border-[#6d4aff]/35 bg-[#6d4aff]/10 px-3 py-2">
                        <p className="text-[var(--usb-fg-lo)] text-[9px] font-semibold uppercase tracking-wider">Tus respuestas muestran</p>
                        <p className="text-[var(--usb-fg-hi)] text-[12px] font-bold mt-0.5">{calibration.shown} <span className="text-[var(--usb-fg-lo)] font-medium">· {correctCount}/{totalQ}</span></p>
                      </div>
                    </div>
                    <p className="text-[var(--usb-fg-mid)] text-[11px] leading-relaxed">{calibration.msg}</p>
                  </div>
                </div>
              )}

              {content.interviewQ && (
                <div className="kx-card bg-[var(--usb-bg-3)] border border-[var(--usb-border)] rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-[#6d4aff]/8 border-b border-[#6d4aff]/15">
                    <div className="w-8 h-8 rounded-xl bg-[#6d4aff]/15 border border-[#6d4aff]/30 flex items-center justify-center shrink-0">
                      <Star size={14} className="text-[#6d4aff]"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--usb-fg-hi)] text-[11.5px] font-bold">{oralPracticeMeta.title}</p>
                      <p className="text-[var(--usb-fg-lo)] text-[10px] font-medium">{oralPracticeMeta.subtitle}</p>
                    </div>
                  </div>
                  <div className="px-4 py-3.5 space-y-3.5">
                    <p className="text-[var(--usb-fg)] text-[12px] leading-relaxed font-medium">{content.interviewQ.q}</p>
                    <textarea
                      value={oralAnswer}
                      onChange={(e) => { setOralAnswer(e.target.value); if (oralFeedback.status === "done" || oralFeedback.status === "error") setOralFeedback(IDLE_FB); }}
                      placeholder="Escribe aquí lo que dirías en voz alta…"
                      rows={3}
                      className="kx-field w-full resize-none rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-fg-lo)] outline-none focus:border-[#6d4aff]/60 transition-colors"
                    />
                    {oralFeedback.status === "idle" && (
                      <button onClick={handleEvaluateOral} disabled={!oralAnswer.trim()}
                        className="kx-on-solid kx-cta w-full h-9 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed">
                        <Sparkles size={12}/>Evaluar mi respuesta
                      </button>
                    )}
                    <AIFeedback fb={oralFeedback} onRetry={handleEvaluateOral} />
                    {oralFeedback.status !== "done" && !oralSkipped && (
                      <button onClick={() => setOralSkipped(true)} className="w-full text-[10px] font-medium text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] transition-colors">
                        Omitir por ahora
                      </button>
                    )}
                    {oralSkipped && oralFeedback.status !== "done" && (
                      <p className="text-[10px] font-medium text-[var(--usb-fg-lo)] text-center">Omitida. Puedes responderla cuando quieras.</p>
                    )}
                    <button onClick={() => setShowInterviewAnswer(v => !v)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${
                        showInterviewAnswer
                          ? "bg-[#6d4aff]/10 border-[#6d4aff]/30 text-[var(--usb-fg-hi)]"
                          : "border-[var(--usb-border)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg)] hover:border-[var(--usb-border-mid)]"
                      }`}>
                      <span className="text-[10.5px] font-semibold flex-1">{oralPracticeMeta.answerLabel}</span>
                      <ChevronDown size={11} className={`shrink-0 transition-transform text-[var(--usb-fg-lo)] ${showInterviewAnswer ? "rotate-180" : ""}`}/>
                    </button>
                    <AnimatePresence>
                      {showInterviewAnswer && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden -mt-1">
                          <div className="bg-[#6d4aff]/6 border border-[#6d4aff]/18 rounded-2xl p-3.5 text-[11.5px] text-[var(--usb-fg-mid)] leading-relaxed">{content.interviewQ.idealAnswer}</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* ── Step 5: fíjalo en memoria ── */}
              {focusStep === 4 && confidence && (
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
                      subtitle={`${content.ankiCards.length} tarjetas · .apkg se importa con doble clic`}
                      badge={ankiExported ? <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full border text-[#059669] bg-[#059669]/12 border-[#059669]/35 flex items-center gap-1 shrink-0"><Check size={9} strokeWidth={3}/>Listo</span> : undefined}
                    >
                      <div className="grid grid-cols-[1.4fr_1fr] gap-1.5">
                        <button onClick={handleExportApkg} disabled={!showApply || apkgStatus === "loading"}
                          style={{ "--kx-btn": apkgStatus === "error" ? "#e11d48" : apkgStatus === "done" ? "#059669" : "#6d4aff" } as React.CSSProperties}
                          className={exportPrimaryBtnCls}>
                          {apkgStatus === "loading"
                            ? <><Loader2 size={12} className="animate-spin"/><span className="truncate max-w-[85px]">{apkgProgress}</span></>
                            : apkgStatus === "done"
                              ? <><CheckCircle2 size={12}/>Exportado</>
                              : apkgStatus === "error"
                                ? <><X size={12}/>Error</>
                                : <><Package size={12}/>Exportar .apkg</>}
                        </button>
                        <button onClick={handleExport} disabled={!showApply} className={`${exportGhostBtnCls} h-9`}>
                          <FileDown size={12}/>.txt
                        </button>
                      </div>
                      <p className="text-[var(--usb-fg-lo)] text-[9.5px] leading-relaxed">
                        {isFirstExport
                          ? ".txt es manual: la primera vez de cada curso incluye CSS y plantilla."
                          : ".txt usa el setup que ya creaste para este curso."}
                      </p>
                      <div className="flex items-center gap-4">
                        <button onClick={() => setShowCardPreview(v => !v)} aria-expanded={showCardPreview}
                          className="text-[10px] font-medium text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] flex items-center gap-1 transition-colors">
                          <ChevronDown size={11} className={`transition-transform ${showCardPreview ? "rotate-180" : ""}`}/>{showCardPreview ? "Ocultar tarjetas" : "Ver tarjetas"}
                        </button>
                        <button onClick={() => setShowAnkiGuide(v => !v)} aria-expanded={showAnkiGuide}
                          className="text-[10px] font-medium text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] flex items-center gap-1 transition-colors">
                          <Info size={10}/>{showAnkiGuide ? "Ocultar guía" : "Guía de importación"}
                        </button>
                      </div>
                      <AnimatePresence initial={false}>
                        {showCardPreview && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <AnkiFlipPreview cards={content.ankiCards}/>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <AnimatePresence initial={false}>
                        {showAnkiGuide && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="bg-[var(--usb-bg-2)] border border-[var(--usb-border)] rounded-xl p-3 space-y-3">
                              {/* Qué configura la extensión en Anki (automático, primera importación) */}
                              <div className="space-y-1">
                                <p className="text-[var(--usb-fg-hi)] text-[11px]" style={{ fontWeight: 600 }}>Qué se configura solo en Anki (primera importación)</p>
                                {[
                                  `Mazos bajo «${vocabCfg.rootDeck}»: Courses → curso → lección (conceptos) y Vocabulary → English → curso (vocabulario).`,
                                  "Presets propios, solo para estos mazos: Cursos 20 nuevas/día · Vocabulario 15/día · pasos 1 y 10 min · si la tarjeta falla conserva 30% del intervalo · a los 8 fallos se marca «leech» · retención objetivo 90%.",
                                  "FSRS queda activado automáticamente en los dos presets al importar (sin pasos). Opcional: tras unos días de reseñas, «Optimizar» afina los pesos a tu memoria.",
                                  "Tus demás mazos y tu preset Default NO se tocan nunca.",
                                  `Audio del vocabulario (${vocabCfg.audioMode === "tts" ? "voz del sistema" : "archivos de calidad"}): cambia el modo en Configurar. Imagen y fonética las completa tu sistema de imágenes.`,
                                ].map((s, i) => (
                                  <p key={i} className="text-[var(--usb-fg-mid)] text-[10px] leading-relaxed">{i + 1}. {s}</p>
                                ))}
                              </div>
                              <div className="pt-2 border-t border-[var(--usb-divider)]" />
                              {isFirstExport ? (
                                <>
                                  <p className="text-[var(--usb-fg-hi)] text-[11px]" style={{ fontWeight: 600 }}>Guía TXT manual · solo si no usas .apkg</p>
                                  {[
                                    { file:"anki-card-styles.css", color:"text-[#d97706]", steps:[`Crea o selecciona el tipo ${ANKI_NOTE_TYPE}`,"Ábrelo con cualquier editor (Notepad, VS Code…)","Selecciona todo (Ctrl+A) y cópialo","En Anki: Cards → Styling","Selecciona todo, pega el CSS y guarda"] },
                                    { file:"PLANTILLA-ANKI.txt",   color:"text-[#6d4aff]",   steps:[`En ${ANKI_NOTE_TYPE} → Cards`,"Ábrelo y ve al final del archivo","Anverso: selecciona todo → pega el bloque FRONT","Reverso: selecciona todo → pega el bloque BACK → guarda"] },
                                    { file:`${lessonName.replace(/[^a-z0-9]/gi,"_")}_tarjetas.txt`, color:"text-[#059669]", steps:["En Anki: Archivo → Importar → selecciona este archivo","Verifica columnas: Front, Back, Tags | HTML activado","Clic en Importar"] },
                                  ].map(({ file, color, steps }) => (
                                    <div key={file} className="space-y-1 pt-2 border-t border-[var(--usb-divider)]">
                                      <p className={`font-mono text-[10px] ${color}`}>{file}</p>
                                      {steps.map((s,i) => <p key={i} className="text-[var(--usb-fg-mid)] text-[10px] leading-relaxed pl-2">{i+1}. {s}</p>)}
                                    </div>
                                  ))}
                                </>
                              ) : (
                                <>
                                  <p className="text-[var(--usb-fg-hi)] text-[11px]" style={{ fontWeight: 600 }}>TXT manual · siguientes lecciones</p>
                                  {["Archivo → Importar en Anki",`Selecciona "${lessonName.replace(/[^a-z0-9]/gi,"_")}_tarjetas.txt"`,"Verifica columnas: Front, Back, Tags | HTML activado","Clic en Importar y revisa el resumen antes de confirmar"].map((s,i) => (
                                    <p key={i} className="text-[var(--usb-fg-mid)] text-[10px] leading-relaxed">{i+1}. {s}</p>
                                  ))}
                                  <button onClick={handleDownloadTxtSetup}
                                    className="w-full h-7 rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] text-[10px] font-medium flex items-center justify-center gap-1.5 transition-all">
                                    <FolderPlus size={10}/>Descargar CSS + plantilla otra vez
                                  </button>
                                </>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </ExportModule>

                      {/* ── Vocabulario del curso (idiomas) ── */}
                      {vocabLangOk === false ? (
                        <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-[var(--usb-border-mid)] px-3 py-2.5">
                          <Languages size={12} className="text-[var(--usb-fg-lo)] shrink-0 mt-0.5"/>
                          <p className="text-[var(--usb-fg-mid)] text-[10px] leading-relaxed">
                            <span className="text-[var(--usb-fg-hi)] font-semibold">Vocabulario no disponible en esta lección.</span>
                            {" "}Los subtítulos no están en {vocabCfg.targetLangLabel}; conceptos y Obsidian funcionan igual.
                          </p>
                        </div>
                      ) : (
                        <ExportModule
                          icon={Languages}
                                          title={`Vocabulario · ${vocabCfg.targetLangLabel}`}
                          subtitle={<>Nivel {vocabCfg.minLevel}+ · hasta {vocabCfg.maxWords} palabras · {vocabCfg.audioMode === "tts" ? "voz del sistema" : "audio de calidad"}</>}
                          configOpen={vocabPanelOpen}
                          onToggleConfig={() => setVocabPanelOpen(v => !v)}
                        >
                          <AnimatePresence initial={false}>
                          {vocabPanelOpen && (
                            <Collapse>
                            <div className="space-y-2 pb-1">
                              <div className="grid grid-cols-2 gap-1.5">
                                <label className="block">
                                  <p className={exportLabelCls}>Nivel mínimo (CEFR)</p>
                                  <select value={vocabCfg.minLevel} onChange={(e) => handleSaveVocabCfg({ minLevel: e.target.value })} className={exportFieldCls}>
                                    {cefrLevels().map((level) => (
                                      <option key={level} value={level}>{level}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block">
                                  <p className={exportLabelCls}>Máx. palabras / lección</p>
                                  <input type="number" min={3} max={20} value={vocabCfg.maxWords}
                                    onChange={(e) => handleSaveVocabCfg({ maxWords: Math.min(20, Math.max(3, Number(e.target.value) || 8)) })}
                                    className={exportFieldCls}/>
                                </label>
                                <label className="block">
                                  <p className={exportLabelCls}>Audio de las tarjetas</p>
                                  <select value={vocabCfg.audioMode} onChange={(e) => handleSaveVocabCfg({ audioMode: e.target.value as VocabConfig["audioMode"] })} className={exportFieldCls}>
                                    <option value="field">Archivo de calidad</option>
                                    <option value="tts">Voz del sistema</option>
                                  </select>
                                </label>
                                <label className="block">
                                  <p className={exportLabelCls}>Mazo raíz</p>
                                  <input value={vocabCfg.rootDeck} onChange={(e) => handleSaveVocabCfg({ rootDeck: e.target.value })}
                                    placeholder="Kinema" className={exportFieldCls}/>
                                </label>
                              </div>
                              <p className="text-[var(--usb-fg-lo)] text-[9.5px] leading-relaxed">
                                {vocabCfg.audioMode === "tts"
                                  ? "Voz del sistema: Anki habla al instante con las voces del sistema operativo, sin archivos."
                                  : "Archivo de calidad: la plantilla reproduce word audio / sentence audio, que genera HyperTTS o tu pipeline externo."}
                                {" "}Cada tarjeta trae una oración limpia escrita para ella; las palabras repetidas de otras lecciones se saltan solas.
                              </p>
                            </div>
                            </Collapse>
                          )}
                          </AnimatePresence>

                          <button onClick={handleExportVocabulary} disabled={vocabStatus === "loading"}
                            style={{ "--kx-btn": vocabStatus === "error" ? "#e11d48" : vocabStatus === "done" ? "#059669" : "#6d4aff" } as React.CSSProperties}
                            className={`${exportPrimaryBtnCls} w-full`}>
                            {vocabStatus === "loading"
                              ? <><Loader2 size={11} className="animate-spin"/><span className="truncate max-w-[180px]">{vocabProgress}</span></>
                              : vocabStatus === "done"
                                ? <><CheckCircle2 size={12}/><span className="truncate max-w-[180px]">Exportado · {vocabProgress}</span></>
                                : vocabStatus === "error"
                                  ? <><X size={12}/><span className="truncate max-w-[180px]">{vocabProgress}</span></>
                                  : <><Languages size={12}/>Extraer vocabulario (.apkg)</>
                            }
                          </button>
                        </ExportModule>
                      )}

                      {/* ── Obsidian export ── */}
                      <ExportModule
                        icon={BookMarked}
                                        title="Obsidian"
                        subtitle={obsidianCfg.vaultName.trim()
                          ? <>Vault «{obsidianCfg.vaultName}» · nota + MOC del curso</>
                          : "Sin vault configurado"}
                        configOpen={obsidianPanelOpen}
                        onToggleConfig={() => setObsidianPanelOpen(v => !v)}
                      >
                        <AnimatePresence initial={false} mode="wait">
                        {obsidianPanelOpen ? (
                          <Collapse key="cfg">
                          <div className="space-y-2">
                            <label className="block">
                              <p className={exportLabelCls}>Nombre del vault (igual que en el selector de Obsidian)</p>
                              <input value={obsidianCfg.vaultName} onChange={(e) => handleSaveObsidianCfg({ vaultName: e.target.value })}
                                placeholder="Ej: Dev Courses" className={exportFieldCls}/>
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              <label className="block">
                                <p className={exportLabelCls}>Notas de sesión</p>
                                <input value={obsidianCfg.sourcesFolder} onChange={(e) => handleSaveObsidianCfg({ sourcesFolder: e.target.value })} className={`${exportFieldCls} font-mono`}/>
                              </label>
                              <label className="block">
                                <p className={exportLabelCls}>MOCs de curso</p>
                                <input value={obsidianCfg.mocsFolder} onChange={(e) => handleSaveObsidianCfg({ mocsFolder: e.target.value })} className={`${exportFieldCls} font-mono`}/>
                              </label>
                            </div>
                            <div className="grid grid-cols-1 gap-1">
                              {([
                                ["includeCards", "Incluir tarjetas #flashcards"],
                                ["autoExport", "Auto-exportar al generar la sesión"],
                                ["includeRawSrt", "Guardar SRT crudo en raw/"],
                              ] as const).map(([key, label]) => (
                                <label key={key} className="flex items-center gap-2 text-[var(--usb-fg-mid)] text-[10px] cursor-pointer py-0.5">
                                  <input type="checkbox" checked={obsidianCfg[key]} onChange={(e) => handleSaveObsidianCfg({ [key]: e.target.checked } as Partial<ObsidianExportConfig>)} className="accent-[#6d4aff] w-3 h-3"/>
                                  {label}
                                </label>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button onClick={handleTestObsidianVault} className={exportGhostBtnCls}>
                                <ExternalLink size={10}/>Probar vault
                              </button>
                              <button onClick={handleCreateVaultScaffold} className={exportGhostBtnCls}>
                                <FolderPlus size={10}/>Crear desde cero
                              </button>
                            </div>
                            <p className="text-[var(--usb-fg-lo)] text-[9.5px] leading-relaxed">
                              Requiere Obsidian instalado. La primera vez Chrome pregunta si abrir <span className="font-mono text-[var(--usb-fg-hi)]">obsidian://</span>: marca «Siempre».
                            </p>
                          </div>
                          </Collapse>
                        ) : (
                          <Collapse key="main">
                          <>
                            {!obsidianCfg.vaultName.trim() && (
                              <button onClick={() => setObsidianPanelOpen(true)}
                                className="w-full text-left rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] hover:bg-[var(--usb-bg-2)] px-3 py-2 text-[var(--usb-fg-mid)] text-[10.5px] font-medium leading-relaxed transition-colors shadow-2xs">
                                Configura el nombre de tu vault para exportar con un clic →
                              </button>
                            )}
                            <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-1.5">
                              <button onClick={handleExportObsidian} disabled={!showApply}
                                style={{ "--kx-btn": obsidianStatus === "done" ? "#059669" : "#6d4aff" } as React.CSSProperties}
                                className={exportPrimaryBtnCls}>
                                {obsidianStatus === "done"
                                  ? <><CheckCircle2 size={11}/>Listo</>
                                  : <><BookMarked size={11}/>Exportar</>}
                              </button>
                              <button onClick={handleCopyObsidianMarkdown} disabled={!showApply} className={exportGhostBtnCls}>
                                <ClipboardCopy size={10}/>Copiar
                              </button>
                              <button onClick={handleDownloadObsidianMarkdown} disabled={!showApply} className={exportGhostBtnCls}>
                                <FileDown size={10}/>.md
                              </button>
                            </div>
                            <p className="text-[var(--usb-fg-lo)] text-[9.5px] leading-relaxed">
                              Crea la nota en <span className="font-mono text-[var(--usb-fg-hi)]">{obsidianCfg.sourcesFolder}/</span> y el MOC en <span className="font-mono text-[var(--usb-fg-hi)]">{obsidianCfg.mocsFolder}/</span>. Copiar y .md son respaldos manuales.
                            </p>
                            <button onClick={() => setObsidianHelpOpen(v => !v)}
                              className="text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] text-[9.5px] flex items-center gap-1 transition-colors">
                              <Info size={10}/>{obsidianHelpOpen ? "Ocultar ayuda" : "¿No pasó nada al exportar?"}
                            </button>
                            {obsidianHelpOpen && (
                              <ol className="rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-2)] p-2.5 space-y-1.5">
                                {[
                                  "Instala Obsidian y abre tu vault al menos una vez (que aparezca en el selector de vaults).",
                                  "Exporta de nuevo: Chrome pregunta «¿Abrir Obsidian?» → marca Siempre permitir.",
                                  "Si antes marcaste Bloquear: Chrome → Configuración → Privacidad → Configuración de sitios → Protocolos adicionales, y borra el bloqueo de obsidian.",
                                  "Verifica el nombre con Probar vault (en Configurar): Obsidian avisa si no existe.",
                                  "Como respaldo siempre quedan Copiar (portapapeles) o .md (archivo).",
                                ].map((s, i) => (
                                  <li key={i} className="flex gap-2 text-[var(--usb-fg-mid)] text-[9.5px] leading-relaxed">
                                    <span className="w-3.5 h-3.5 rounded-full bg-[#6d4aff]/15 text-[#6d4aff] text-[8px] flex items-center justify-center shrink-0 mt-px" style={{ fontWeight: 700 }}>{i + 1}</span>
                                    <span>{s}</span>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </>
                          </Collapse>
                        )}
                        </AnimatePresence>
                      </ExportModule>
                  </div>
              )}
              </div>
              );
              })()}
              </motion.div>
              </AnimatePresence>

              {/* Completion recap — static; the one-time celebration lives in CelebrationOverlay */}
              <AnimatePresence>
                {allStepsComplete && focusStep === 4 && (() => {
                  const correctFinal = Object.values(questionFeedbacks).filter(f => f?.rating === "correct" || f?.rating === "excellent").length;
                  const totalQFinal = visibleQuestions.length;
                  const elapsedFinal = Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 60000));
                  const conceptsFinal = Object.values(conceptsChecked).filter(Boolean).length;
                  return (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", damping: 24, stiffness: 300, delay: 0.1 }}
                    className="kx-hero-solid relative overflow-hidden rounded-2xl p-4.5 mt-1"
                  >
                    <div className="relative flex items-center gap-3 mb-3.5">
                      <div className="kx-hero-chip w-11 h-11 rounded-2xl flex items-center justify-center shrink-0">
                        <Icon name="trophy" size={24} weight="duotone" />
                      </div>
                      <div className="min-w-0">
                        <p className="kx-hero-t1 text-[17px] font-extrabold tracking-tight leading-tight">Lección dominada</p>
                        <p className="kx-hero-t2 text-[11.5px] leading-snug mt-0.5">Tarjetas listas. Puedes seguir con el video.</p>
                      </div>
                    </div>
                    <div className="relative grid grid-cols-4 gap-1.5">
                      {[
                        { icon: "pin" as IconName, value: conceptsFinal, label: "conceptos" },
                        { icon: "checkCircle2" as IconName, value: `${correctFinal}/${totalQFinal}`, label: "correctas" },
                        { icon: "zap" as IconName, value: `+${sessionXp || (correctFinal * 10)}`, label: "XP" },
                        { icon: "timer" as IconName, value: `${elapsedFinal}m`, label: "tiempo" },
                      ].map(st => (
                        <div key={st.label} className="kx-hero-chip flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-2">
                          <Icon name={st.icon} size={14} />
                          <span className="text-[11.5px] font-mono font-bold">{st.value}</span>
                          <span className="text-[9.5px] font-medium opacity-80 truncate max-w-[56px]">{st.label}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                  );
                })()}
              </AnimatePresence>

              <div className="h-5"/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
