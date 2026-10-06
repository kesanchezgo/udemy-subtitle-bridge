import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Download, Upload, RefreshCcw, CheckCircle2, AlertCircle, PlaySquare,
  Sparkles, RotateCcw, Type, Eye, EyeOff, AlignCenter,
  FileText, Loader2, ArrowUpDown, Baseline, GripHorizontal, Keyboard,
  X, Icon, Settings, History, LogOut, Cloud, Check, ChevronRight, type IconName,
} from "./icons";
import { motion, AnimatePresence } from "motion/react";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { StudyAgentTab } from "./StudyAgentTab";
import { TranslationPipeline } from "./TranslationPipeline";
import { ApiKeysPanel } from "./ApiKeysPanel";
import { CacheSettingsPanel } from "./CacheSettingsPanel";
import { DevTab } from "./DevTab";
import { usePersistedState } from "../hooks/usePersistedState";
import { chromeLocalStorage, chromeStorage } from "../services/chromeStorage";
import { contentBridge } from "../services/contentBridge";
import { KinemaBrand, FrameMarks } from "./AppLogo";
import { Session } from "@supabase/supabase-js";
import { useDockTheme } from "../contexts/ThemeContext";
import { initGeminiKeys, normalizeGeminiKeys, saveGeminiKeys, setGeminiKeysSync } from "../../gemini-config";
import {
  DEFAULT_BASE_URLS,
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  getAiProviderConfig,
  initAiProviderConfig,
  saveAiProviderConfig,
  setAiProviderConfigSync,
  type AiProviderConfig,
} from "../services/ai-providers";
import { toast } from "sonner";

interface ExtensionSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  session?: Session;
  onRequestLogin?: () => void;
  onSignOut?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CAP_HUES: Record<string, { hue: string; dark: string; light: string }> = {
  violet: { hue: "#6d4aff", dark: "#b7a6ff", light: "#5b37e8" },
  sky:    { hue: "#0284c7", dark: "#5cc8fb", light: "#0369a1" },
  amber:  { hue: "#d97706", dark: "#fbbf45", light: "#a15207" },
  green:  { hue: "#059669", dark: "#4ade9f", light: "#047857" },
  rose:   { hue: "#e11d48", dark: "#fb7d97", light: "#be123c" },
};

function CapTitle({ icon, tone = "violet", children, right }: { icon: IconName; tone?: keyof typeof CAP_HUES; children: React.ReactNode; right?: React.ReactNode }) {
  const { t } = useDockTheme();
  const c = CAP_HUES[tone];
  return (
    <div className="flex items-center gap-2.5 min-h-[28px]">
      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border shadow-sm transition-transform"
        style={{
          background: `color-mix(in srgb, ${c.hue} 12%, var(--usb-bg-3))`,
          borderColor: `color-mix(in srgb, ${c.hue} 24%, var(--usb-border))`,
          color: t(c.dark, c.light),
        }}>
        <Icon name={icon} size={15} weight="duotone" />
      </span>
      <span className="text-[12.5px] font-bold tracking-tight text-[var(--usb-fg)] flex-1 min-w-0 truncate">{children}</span>
      {right}
    </div>
  );
}

function SectionLabel({ children, icon, tone }: { children: React.ReactNode; icon?: IconName; tone?: keyof typeof CAP_HUES }) {
  return <div className="mb-2.5 px-0.5"><CapTitle icon={icon ?? "sparkles"} tone={tone}>{children}</CapTitle></div>;
}

function SliderCard({ icon, tone = "violet", title, value, children, foot }: { icon: IconName; tone?: keyof typeof CAP_HUES; title: string; value: string; children: React.ReactNode; foot?: React.ReactNode }) {
  const { t } = useDockTheme();
  const c = CAP_HUES[tone];
  return (
    <Card className="space-y-3.5">
      <CapTitle icon={icon} tone={tone} right={
        <span className="text-[11.5px] font-mono font-bold tabular-nums px-2.5 py-1 rounded-full"
          style={{ background: `color-mix(in srgb, ${c.hue} 16%, transparent)`, color: t(c.dark, c.light) }}>{value}</span>
      }>{title}</CapTitle>
      {children}
      {foot}
    </Card>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`kx-card p-4 rounded-2xl ${className}`}>{children}</div>;
}

function StatusRow({ label, status, ok, pulse }: { label: string; status: string; ok: boolean; pulse?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[11.5px] text-[var(--usb-fg-mid)] font-medium">{label}</span>
      <span className="flex items-center gap-2 text-[11.5px] tabular-nums text-[var(--usb-fg)] font-semibold">
        <span className="relative flex h-2 w-2 shrink-0">
          {pulse && ok && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60"/>}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${ok ? "bg-emerald-500" : "bg-rose-500"}`}/>
        </span>
        {status}
      </span>
    </div>
  );
}

// ── Mock live caption data ────────────────────────────────────────────────────
const MOCK_LINES = [
  { en: "Java is a strongly typed language",         es: "Java es un lenguaje fuertemente tipado",              ts: "5:01" },
  { en: "The JVM provides platform independence",    es: "La JVM proporciona independencia de plataforma",      ts: "5:03" },
  { en: "Every Java program starts with a class",   es: "Todo programa Java comienza con una clase",           ts: "5:07" },
  { en: "The main method is the entry point",       es: "El método main es el punto de entrada",               ts: "5:10" },
  { en: "Data types can be primitive or reference", es: "Los tipos de datos pueden ser primitivos o de referencia", ts: "5:13" },
];

const TEXT_COLORS = { white: "#ffffff", yellow: "#fde047", cyan: "#67e8f9" };
function formatLiveTs(ts?: number): string {
  if (!Number.isFinite(ts)) return "--:--";
  if ((ts as number) >= 0 && (ts as number) < 36000) {
    const total = Math.max(0, Math.floor(ts as number));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }
  const date = new Date(ts as number);
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${mm}:${ss}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function checkLocalAiViaBackground(): Promise<boolean> {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { sendMessage?: (message: unknown, callback: (response: unknown) => void) => void; lastError?: { message?: string } } };
  }).chrome;

  if (!chromeApi?.runtime?.sendMessage) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    chromeApi.runtime?.sendMessage?.({ type: "USG_CHECK_LOCAL_AI" }, (response) => {
      const err = chromeApi.runtime?.lastError;
      if (err) {
        resolve(false);
        return;
      }
      resolve(Boolean((response as { connected?: unknown } | undefined)?.connected));
    });
  });
}

function syncGeminiKeysToBackground(keys: string[]): Promise<void> {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { sendMessage?: (message: unknown, callback?: (response: unknown) => void) => void } };
  }).chrome;

  if (!chromeApi?.runtime?.sendMessage) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      chromeApi.runtime?.sendMessage?.({ type: "USG_SYNC_GEMINI_KEYS", apiKeys: keys }, () => resolve());
    } catch {
      resolve();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
export function ExtensionSidebar({ isOpen, onToggle, session, onRequestLogin, onSignOut }: ExtensionSidebarProps) {
  // ── Tab & Dev mode ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"study" | "captions" | "overlay" | "dev">("study");
  const [devMode, setDevMode]     = useState(false);
  const gearClickRef              = useRef<number[]>([]);

  // ── Hotkeys panel ─────────────────────────────────────────────────────────
  const [showHotkeys, setShowHotkeys] = useState(false);

  // ── Theme ─────────────────────────────────────────────────────────────────
  const { t } = useDockTheme();

  // ── API Keys (persisted) ──────────────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [providerConfig, setProviderConfig] = useState<AiProviderConfig>(() => getAiProviderConfig());

  const handleSaveProvider = (config: AiProviderConfig) => {
    const saved = setAiProviderConfigSync(config);
    setProviderConfig(saved);
    void saveAiProviderConfig(saved).catch(() => undefined);
  };

  const handleSaveKeys = (keys: string[]) => {
    const normalized = normalizeGeminiKeys(keys);
    setApiKeys(normalized);
    setGeminiKeysSync(normalized);
    void chromeStorage.set({
      gemini_api_keys: normalized,
      gemini_api_key_1: normalized[0] ?? "",
      gemini_api_key_2: normalized[1] ?? "",
    });
    void saveGeminiKeys(normalized);
    void syncGeminiKeysToBackground(normalized);
  };

  useEffect(() => {
    const normalized = normalizeGeminiKeys(apiKeys);
    setGeminiKeysSync(normalized);
  }, [apiKeys]);

  useEffect(() => {
    let alive = true;
    void initAiProviderConfig().then((config) => {
      if (alive) setProviderConfig(config);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;

    void Promise.all([
      initGeminiKeys(),
      chromeStorage.get(["gemini_api_keys", "gemini_api_key_1", "gemini_api_key_2"]),
    ]).then(([, visibleKeys]) => {
      const storedKeys = (globalThis as typeof globalThis & { USB_GEMINI_API_KEYS?: string[] }).USB_GEMINI_API_KEYS;
      if (!alive) return;
      const syncedArray = Array.isArray(visibleKeys.gemini_api_keys)
        ? normalizeGeminiKeys((visibleKeys.gemini_api_keys as unknown[]).map(String))
        : [];
      const legacy = normalizeGeminiKeys([
        typeof visibleKeys.gemini_api_key_1 === "string" ? visibleKeys.gemini_api_key_1 : "",
        typeof visibleKeys.gemini_api_key_2 === "string" ? visibleKeys.gemini_api_key_2 : "",
      ]);
      const loaded = Array.isArray(storedKeys) ? normalizeGeminiKeys(storedKeys) : [];
      const next = loaded.length > 0 ? loaded : syncedArray.length > 0 ? syncedArray : legacy;
      if (next.length === 0) return;
      setApiKeys(next);
      setGeminiKeysSync(next);
      void chromeStorage.set({
        gemini_api_keys: next,
        gemini_api_key_1: next[0] ?? "",
        gemini_api_key_2: next[1] ?? "",
      });
      void saveGeminiKeys(next);
      void syncGeminiKeysToBackground(next);
    });

    return () => {
      alive = false;
    };
  // Run once to migrate keys from the engine storage into the visible panel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Captions state ────────────────────────────────────────────────────────
  const [autoTranslate, setAutoTranslate] = usePersistedState("captions_auto_translate", true);
  const [pasteSrt, setPasteSrt]           = useState("");

  // ── Cache config (persisted) ──────────────────────────────────────────────
  const [cacheTtlDays, setCacheTtlDays] = usePersistedState<number>("cache_ttl_days", 7);
  const [srtApplied, setSrtApplied]       = useState(false);
  const [applyingCopy, setApplyingCopy]   = useState(false);
  const [currentLine, setCurrentLine]     = useState(2);
  const [capturedLineCount, setCapturedLineCount] = useState(0);
  const [liveEn, setLiveEn]               = useState("");
  const [liveEs, setLiveEs]               = useState("");
  const [liveTs, setLiveTs]               = useState("--:--");
  const [currentLectureKey, setCurrentLectureKey] = useState("");

  // ── Overlay visual settings (persisted) ──────────────────────────────────
  const [showOverlay, setShowOverlay]       = usePersistedState("overlay_show", true);
  const [fontSize, setFontSize]             = usePersistedState<number[]>("overlay_font_size", [24]);
  const [opacity, setOpacity]               = usePersistedState<number[]>("overlay_opacity", [85]);
  const [syncOffset, setSyncOffset]         = usePersistedState<number[]>("overlay_sync_offset", [0]);
  const [position, setPosition]             = usePersistedState<"top" | "center" | "bottom">("overlay_position", "bottom");
  const [showGlossary, setShowGlossary]     = usePersistedState("overlay_show_glossary", true);
  const [textColor, setTextColor]           = usePersistedState<"white" | "yellow" | "cyan">("overlay_text_color", "white");
  const [shadowStrength, setShadowStrength] = usePersistedState<number[]>("overlay_shadow", [60]);

  // ── Drag position (persisted) ─────────────────────────────────────────────
  const [hasCustomPos, setHasCustomPos] = usePersistedState("overlay_has_custom_pos", false);
  const [customPosX, setCustomPosX]     = usePersistedState<number>("overlay_custom_x", 50);
  const [customPosY, setCustomPosY]     = usePersistedState<number>("overlay_custom_y", 85);
  const [isDragging, setIsDragging]     = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const srtTextareaRef = useRef<HTMLTextAreaElement>(null);

  const dragRef = useRef<HTMLDivElement>(null);
  const showOverlayRef = useRef(showOverlay);
  const autoTranslateRef = useRef(autoTranslate);
  const latestIncomingEnRef = useRef("");
  const activeLectureKeyRef = useRef<string | null>(null);
  const translateAbortRef = useRef<AbortController | null>(null);

  // ── Bridge / connection state ─────────────────────────────────────────────
  const [contentScriptConnected, setContentScriptConnected] = useState(false);
  const [syncPulse, setSyncPulse]                           = useState(false);

  // ── Local API status via background health check ─────────────────────────
  const [localConnected, setLocalConnected] = useState(false);

  useEffect(() => {
    showOverlayRef.current = showOverlay;
  }, [showOverlay]);

  useEffect(() => {
    autoTranslateRef.current = autoTranslate;
  }, [autoTranslate]);

  const pushOverlayText = useCallback((text: string) => {
    contentBridge.sendToContent({
      type: "OVERLAY_TEXT_UPDATE",
      payload: { text: text.trim() },
    });
  }, []);

  const applyLectureContext = useCallback((payload: unknown) => {
    const context = payload as {
      lectureKey?: unknown;
      cueCount?: unknown;
      hasEnglish?: unknown;
      courseTitle?: unknown;
      courseDescription?: unknown;
      courseContext?: unknown;
      lectureTitle?: unknown;
    } | undefined;
    const lectureKey = typeof context?.lectureKey === "string" ? context.lectureKey : null;

    if (lectureKey && lectureKey !== activeLectureKeyRef.current) {
      activeLectureKeyRef.current = lectureKey;
      setCurrentLectureKey(lectureKey);
      latestIncomingEnRef.current = "";
      translateAbortRef.current?.abort();
      setLiveEn("");
      setLiveEs("");
      setLiveTs("--:--");
      setCurrentLine(0);
      setCapturedLineCount(0);
      pushOverlayText("");
    } else if (lectureKey) {
      setCurrentLectureKey(lectureKey);
    }

    const cueCount = typeof context?.cueCount === "number" && Number.isFinite(context.cueCount)
      ? Math.max(0, Math.round(context.cueCount))
      : 0;
    if (cueCount > 0) {
      setCapturedLineCount((current) => Math.max(current, cueCount));
    }

    // Forward Udemy course metadata to chrome.storage so StudyAgentTab
    // can pre-populate course/lesson name and description for the
    // dynamic objectives generator. We only auto-fill when the course
    // slug changes (so we don't overwrite the user's edits within the
    // same course). The lesson name always tracks the active lecture.
    const courseSlug = typeof (context as { courseSlug?: unknown })?.courseSlug === "string" ? (context as { courseSlug?: string }).courseSlug?.trim() : "";
    const courseTitle = typeof context?.courseTitle === "string" ? context.courseTitle.trim() : "";
    const courseDescription = typeof context?.courseDescription === "string" ? context.courseDescription.trim() : "";
    const courseContext = typeof context?.courseContext === "string" ? context.courseContext.trim() : "";
    const lectureTitle = typeof context?.lectureTitle === "string" ? context.lectureTitle.trim() : "";
    if (courseTitle || courseDescription || lectureTitle) {
      void chromeStorage.get(["agent_autofilled_course_slug"]).then((existing) => {
        const lastFilledSlug = typeof existing.agent_autofilled_course_slug === "string" ? existing.agent_autofilled_course_slug : "";
        const isNewCourse = !!courseSlug && courseSlug !== lastFilledSlug;
        const updates: Record<string, unknown> = {};
        if (isNewCourse && courseTitle) updates.agent_course_name = courseTitle;
        if (isNewCourse && courseDescription) updates.agent_course_description = courseDescription;
        if (isNewCourse) updates.agent_autofilled_course_slug = courseSlug;
        // Lesson name always tracks the active lecture — overwrite freely.
        if (lectureTitle) updates.agent_lesson_name = lectureTitle;
        if (Object.keys(updates).length > 0) {
          void chromeStorage.set(updates);
        }
      });
    }
    if (courseSlug) {
      void chromeLocalStorage.get(["agent_course_context", "agent_course_context_slug"]).then((existing) => {
        const previousContext = typeof existing.agent_course_context === "string" ? existing.agent_course_context : "";
        const previousSlug = typeof existing.agent_course_context_slug === "string" ? existing.agent_course_context_slug : "";
        const hasRicherContext = courseContext.length > previousContext.length + 160;
        if (courseContext && (previousSlug !== courseSlug || hasRicherContext)) {
          void chromeLocalStorage.set({
            agent_course_context: courseContext,
            agent_course_context_slug: courseSlug,
            agent_course_context_title: courseTitle,
          });
        } else if (!courseContext && previousSlug && previousSlug !== courseSlug) {
          void chromeLocalStorage.set({
            agent_course_context: "",
            agent_course_context_slug: courseSlug,
            agent_course_context_title: courseTitle,
          });
        }
      });
    }
  }, [pushOverlayText]);

  const processIncomingSubtitle = useCallback((enLine: string, ts?: number) => {
    const clean = enLine.replace(/\s+/g, " ").trim();
    if (!clean || clean === latestIncomingEnRef.current) return;

    latestIncomingEnRef.current = clean;
    setCurrentLine((p) => (p + 1) % MOCK_LINES.length);
    setLiveEn(clean);
    setLiveEs(clean); // Show EN text until batch translation completes
    setLiveTs(formatLiveTs(ts));

    if (showOverlayRef.current && autoTranslateRef.current) {
      pushOverlayText(clean);
    }
  }, [pushOverlayText]);

  // Local API status via background. Keeping this out of the page context avoids
  // console spam and main-thread churn while the user resizes/collapses the dock.
  useEffect(() => {
    let alive = true;
    let timer: number | null = null;

    const check = async () => {
      const ok = await checkLocalAiViaBackground();
      if (!alive) {
        return;
      }

      setLocalConnected(ok);
      timer = window.setTimeout(check, ok ? 30_000 : 60_000);
    };

    void check();
    return () => {
      alive = false;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  // ── PING content script on mount ─────────────────────────────────────────
  useEffect(() => {
    const unsub = contentBridge.onMessageFromContent((msg) => {
      if (msg.type === "USG_GEMINI_RETRY_NOTICE") {
        const payload = msg as unknown as { round?: number; totalRounds?: number; waitMs?: number; reason?: string; purpose?: string };
        const seconds = Math.max(1, Math.round((payload.waitMs ?? 5000) / 1000));
        const purposeLabel = payload.purpose === "objectives" ? "objetivos"
          : payload.purpose === "refine" ? "objetivo personalizado"
          : payload.purpose === "study" ? "sesión de estudio"
          : payload.purpose === "evaluation" ? "evaluación"
          : "traducción";
        const round = payload.round ?? 2;
        const total = payload.totalRounds ?? 3;
        toast.warning(`Reintentando ${purposeLabel} (${round}/${total})`, {
          description: `${payload.reason ?? "Gemini está saturado"} Esperando ${seconds}s antes de reintentar…`,
          duration: payload.waitMs ?? 5000,
          id: `gemini-retry-${payload.purpose}`, // dedupe by purpose
        });
      }
      if (msg.type === "PONG") {
        setContentScriptConnected(true);
        applyLectureContext(msg.payload);
      }
      if (msg.type === "LECTURE_CONTEXT_UPDATE") {
        applyLectureContext(msg.payload);
      }
      if (msg.type === "SUBTITLE_LINE_RECEIVED") {
        const payload = msg.payload as { en?: string; ts?: number } | undefined;
        applyLectureContext(msg.payload);
        if (payload?.en) processIncomingSubtitle(payload.en, payload.ts);
      }
      if (msg.type === "IMPORTED_ES_LINE_RECEIVED") {
        const payload = msg.payload as { es?: string; ts?: number } | undefined;
        applyLectureContext(msg.payload);
        const clean = payload?.es?.replace(/\s+/g, " ").trim();
        if (clean) {
          setCurrentLine((p) => (p + 1) % MOCK_LINES.length);
          setLiveEn("");
          setLiveEs(clean);
          setLiveTs(formatLiveTs(payload?.ts));
          if (showOverlayRef.current && autoTranslateRef.current) {
            pushOverlayText(clean);
          }
        }
      }
      if (msg.type === "EN_SRT_RESULT") {
        const payload = msg.payload as { srt?: string; fileName?: string; error?: string } | undefined;
        const srt = payload?.srt?.trim();
        if (srt) {
          const b = new Blob([srt], { type: "text/plain;charset=utf-8" });
          const u = URL.createObjectURL(b);
          const a = document.createElement("a");
          a.href = u;
          a.download = payload?.fileName || "subtitulos_en.srt";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(u);
        }
      }
      if (msg.type === "IMPORT_ES_SRT_RESULT") {
        const payload = msg.payload as { importedCount?: number } | undefined;
        const imported = (payload?.importedCount ?? 0) > 0;
        setSrtApplied(imported);
        if (imported) setPasteSrt("");
      }
      if (msg.type === "OVERLAY_POSITION_SYNC") {
        const payload = msg.payload as { customPos?: { x?: number; y?: number } } | undefined;
        const x = payload?.customPos?.x;
        const y = payload?.customPos?.y;
        if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) {
          setCustomPosX(Math.round(clamp(x, 0, 100)));
          setCustomPosY(Math.round(clamp(y, 0, 100)));
          setHasCustomPos(true);
        }
      }
    });
    const t = setTimeout(() => contentBridge.sendToContent({ type: "PING" }), 600);
    return () => { clearTimeout(t); unsub(); };
  }, [applyLectureContext, processIncomingSubtitle, pushOverlayText, setCustomPosX, setCustomPosY, setHasCustomPos]);

  // ── Sync overlay config → content script (debounced) ─────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      contentBridge.sendToContent({
        type: "OVERLAY_CONFIG_UPDATE",
        payload: {
          show: showOverlay,
          visible: showOverlay,
          enabled: showOverlay,
          showOverlay,
          fontSize: fontSize[0],
          opacity: opacity[0],
          position,
          tone: textColor,
          textColor,
          shadowStrength: shadowStrength[0],
          offsetMs: syncOffset[0],
          showGlossary,
          syncOffset: syncOffset[0],
          customPos: hasCustomPos ? { x: customPosX, y: customPosY } : null,
        },
      });
      setSyncPulse(true);
      setTimeout(() => setSyncPulse(false), 1800);
    }, 280);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverlay, fontSize, opacity, position, textColor, shadowStrength, syncOffset, hasCustomPos, customPosX, customPosY, showGlossary]);

  // ── Auto-translate toggle sync ────────────────────────────────────────────
  // Only fire on the toggle itself; live-overlay pushes are handled below.
  useEffect(() => {
    contentBridge.sendToContent({ type: "AUTO_TRANSLATE_TOGGLE", payload: { active: autoTranslate } });
    if (!autoTranslate) {
      translateAbortRef.current?.abort();
      setLiveEs("");
      pushOverlayText("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslate]);

  // ── Live overlay text push (per incoming cue) ─────────────────────────────
  useEffect(() => {
    if (autoTranslate && liveEn && showOverlay) {
      pushOverlayText(liveEs || liveEn);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEn, liveEs, showOverlay]);

  // ── Live caption ticker ───────────────────────────────────────────────────
  useEffect(() => {
    if (!autoTranslate || liveEn) return;
    const iv = setInterval(() => setCurrentLine(p => (p + 1) % MOCK_LINES.length), 4000);
    return () => clearInterval(iv);
  }, [autoTranslate, liveEn]);

  useEffect(() => () => {
    translateAbortRef.current?.abort();
  }, []);

  // ── Drag implementation ───────────────────────────────────────────────────
  const startDragHandle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      const ref = previewRef.current;
      const dragEl = dragRef.current;
      if (!ref) { setIsDragging(false); return; }
      
      const rect = ref.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;

      if (dragEl) {
        const dragRect = dragEl.getBoundingClientRect();
        const halfW = ((dragRect.width / 2) / rect.width) * 100;
        const halfH = ((dragRect.height / 2) / rect.height) * 100;
        x = Math.max(halfW, Math.min(100 - halfW, x));
        y = Math.max(halfH, Math.min(100 - halfH, y));
      } else {
        x = Math.max(8, Math.min(92, x));
        y = Math.max(8, Math.min(92, y));
      }

      setCustomPosX(Math.round(x));
      setCustomPosY(Math.round(y));
      setHasCustomPos(true);
    };

    const handleUp = () => setIsDragging(false);

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup",   handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup",   handleUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  const resetDragPos = () => {
    setHasCustomPos(false);
    setCustomPosX(50);
    setCustomPosY(85);
  };

  // When preset position buttons are clicked, revert to preset mode
  const handleSetPosition = (p: "top" | "center" | "bottom") => {
    setPosition(p);
    setHasCustomPos(false);
  };

  // ── SRT handlers ─────────────────────────────────────────────────────────
  const handleApplySrt = () => {
    if (!pasteSrt.trim()) return;
    setApplyingCopy(true);
    contentBridge.sendToContent({
      type: "IMPORT_ES_SRT",
      payload: { srtText: pasteSrt },
    });
    setTimeout(() => setApplyingCopy(false), 420);
  };

  const handleExportSrt = () => {
    contentBridge.sendToContent({ type: "GET_EN_SRT" });
    setSyncPulse(true);
    setTimeout(() => setSyncPulse(false), 1200);
  };

  const handleRefreshStatus = () => {
    contentBridge.sendToContent({ type: "REFRESH_CAPTURE" });
    contentBridge.sendToContent({ type: "PING" });
    setSyncPulse(true);
    setTimeout(() => setSyncPulse(false), 900);
  };

  // ── Triple-click gear → Dev mode ─────────────────────────────────────────
  const handleGearClick = () => {
    const now = Date.now();
    gearClickRef.current = [...gearClickRef.current.filter(t => now - t < 1000), now];
    if (gearClickRef.current.length >= 3) {
      gearClickRef.current = [];
      setDevMode(v => {
        const next = !v;
        if (!next && activeTab === "dev") setActiveTab("study");
        return next;
      });
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const configuredGeminiKeys = useMemo(() => normalizeGeminiKeys(apiKeys), [apiKeys]);
  const hasKeys    = configuredGeminiKeys.length > 0;
  const preview_en = liveEn || MOCK_LINES[currentLine]?.en || "";
  const preview_es = liveEs || MOCK_LINES[currentLine]?.es || "";
  const preview_ts = liveTs !== "--:--" ? liveTs : (MOCK_LINES[currentLine]?.ts ?? "--:--");

  // Which backend is active? Priority mirrors the background chain:
  // local > configured provider > Gemini > mock.
  const providerReady = providerConfig.kind === "local"
    ? Boolean(providerConfig.baseUrl)
    : Boolean(providerConfig.baseUrl && providerConfig.apiKey);
  const activeBackend: "local" | "provider" | "gemini" | "mock" =
    localConnected ? "local" : providerReady ? "provider" : hasKeys ? "gemini" : "mock";

  // Label describes the provider by its actual endpoint, not just its kind tag,
  // so a mis-tagged config (e.g. kind=gemini pointing at a local proxy) still
  // reads correctly instead of claiming "Gemini".
  //
  // A localhost URL is NOT automatically "the bundled local server": the user's
  // own OpenAI-compatible proxy commonly lives on 127.0.0.1 too. Only the
  // bundled server's own default port (8010) gets the "Proveedor local" label;
  // anything else keeps its real provider name.
  const providerLabel = (() => {
    const url = (providerConfig.baseUrl || "").toLowerCase();
    if (providerConfig.kind === "gemini" || url.includes("generativelanguage.googleapis.com")) return "Gemini";
    if (providerConfig.kind === "anthropic" || url.includes("anthropic")) return "Anthropic";
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:8010)?(\/|$)/.test(url) && providerConfig.kind === "local") {
      return "Proveedor local";
    }
    return PROVIDER_LABELS[providerConfig.kind] || "Proveedor";
  })();

  const BACKEND_LABELS = {
    local: "IA Local",
    provider: providerLabel,
    gemini: "Gemini",
    mock: "Mock",
  };

  // Subtitle style for preview (scales down to fit the preview frame)
  const previewSubtitleStyle: React.CSSProperties = {
    backgroundColor: `rgba(0,0,0,${opacity[0] / 100})`,
    fontSize: `${Math.max(9, fontSize[0] * 0.44)}px`,
    color: TEXT_COLORS[textColor],
    textShadow: shadowStrength[0] > 0
      ? `0 1px ${Math.round(shadowStrength[0] / 18)}px rgba(0,0,0,${shadowStrength[0] / 100})`
      : "none",
    lineHeight: 1.35,
    fontWeight: 500,
    display: "inline-block",
    width: "fit-content",
    maxWidth: "100%",
    boxSizing: "border-box",
    textAlign: "center",
  };
  const previewPresetStyle: React.CSSProperties =
    position === "center"
      ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "max-content", maxWidth: "80%" }
      : position === "top"
        ? { left: "50%", top: "10%", transform: "translateX(-50%)", width: "max-content", maxWidth: "80%" }
        : { left: "50%", top: "90%", transform: "translate(-50%, -100%)", width: "max-content", maxWidth: "80%" };

  // Tab config
  const tabs = [
    { id: "study"    as const, label: "Study",    icon: "graduation" as IconName, ping: true  },
    { id: "captions" as const, label: "Captions", icon: "messageSquare" as IconName, ping: false },
    { id: "overlay"  as const, label: "Overlay",  icon: "clapper" as IconName, ping: false },
    ...(devMode ? [{ id: "dev" as const, label: "Dev", icon: "wrench" as IconName, ping: false }] : []),
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full w-full ${t("bg-[#1a1b1d]", "bg-[#f6f7f9]")}`}>

      {/* ── Header ────────────────────────────────────────────────────────────
           Solid background, no backdrop-filter: a blur layer here would force
           GPU rasterization of the whole header subtree and soften its text. */}
      <div className={`px-4 pt-3.5 pb-3.5 border-b shrink-0 sticky top-0 z-20 ${t("border-white/8 bg-[#121214]", "border-black/8 bg-[#ffffff]")}`}>
        <div className="flex items-center justify-between gap-3">

          {/* Left: Logo + title */}
          <KinemaBrand dense />

          {/* Right: status indicators + gear */}
          <div className="flex shrink-0 items-center gap-2">

            {/* ── Active AI Engine Badge ── */}
            <button
              onClick={() => setShowApiPanel(v => !v)}
              title="Configurar motores de IA"
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] transition-all duration-300 border ${
                activeBackend === "local"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                  : activeBackend === "provider"
                    ? "bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/20"
                    : activeBackend === "gemini"
                      ? "bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/20"
                      : "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
              }`}
              style={{ fontWeight: 600 }}
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                {(activeBackend === "local" || activeBackend === "provider" || activeBackend === "gemini") && !showApiPanel && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                    activeBackend === "local" ? "bg-emerald-400" : "bg-violet-400"
                  }`}/>
                )}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  activeBackend === "local" ? "bg-emerald-400 shadow-[0_0_5px_#34d399]" :
                  activeBackend === "provider" || activeBackend === "gemini" ? "bg-violet-400 shadow-[0_0_5px_#9a83ff]" : "bg-amber-400"
                }`}/>
              </span>
              <span>{BACKEND_LABELS[activeBackend]}</span>
            </button>

            {/* ── Dev mode gear ── */}
            <button
              onClick={handleGearClick}
              title="Triple-click para activar Dev mode"
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-300 ${
                devMode
                  ? "text-amber-400 bg-amber-500/10 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                  : t("text-white/30 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10",
                      "text-[#3d3a38]/55 hover:text-[#1a1918] hover:bg-black/6 border border-transparent hover:border-black/10")
              }`}
            >
              <motion.div
                animate={devMode ? { rotate: 360 } : { rotate: 0 }}
                transition={devMode
                  ? { duration: 4, repeat: Infinity, ease: "linear" }
                  : { duration: 0.4, ease: "easeOut" }
                }
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Settings size={15} />
              </motion.div>
            </button>
          </div>
        </div>

        {/* ── User info strip (visible when logged in) ── */}
        <AnimatePresence>
          {session && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.22 }}
              className="flex items-center justify-between overflow-hidden"
            >
              <div className="flex items-center gap-2 min-w-0">
                {/* Avatar circle */}
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0 bg-violet-600 shadow-sm"
                  style={{ fontSize: 10, fontWeight: 700 }}
                >
                  {session.user.email?.[0]?.toUpperCase() ?? 'K'}
                </div>
                {/* Email */}
                <span className={`text-[11px] truncate max-w-[170px] font-medium ${t("text-white/60","text-[#3d3a38]/80")}`}>
                  {session.user.email}
                </span>
                {/* Sync pulse */}
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-50"/>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500"/>
                </span>
              </div>

              {/* Logout button */}
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  title="Cerrar sesión"
                  className={`flex items-center gap-1 text-[9px] border px-2 py-1 rounded-lg transition-all shrink-0 ml-2 ${t("text-white/22 hover:text-red-400/80 border-white/6 hover:border-red-500/20","text-[#3d3a38]/55 hover:text-red-600/80 border-black/8 hover:border-red-400/30")}`}
                >
                  <LogOut size={12} />
                  <span>Salir</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── API Keys Panel ────────────────────────────────────────────────── */}
      <ApiKeysPanel
        isOpen={showApiPanel}
        onClose={() => setShowApiPanel(false)}
        apiKeys={configuredGeminiKeys}
        localConnected={localConnected}
        onSave={handleSaveKeys}
        providerConfig={providerConfig}
        onSaveProvider={handleSaveProvider}
      />

      {/* ── Tab Nav ── control segmentado con claqueta numerada */}
      <div className={`flex shrink-0 items-center gap-2 px-4 py-2.5 border-b relative z-10 ${t("bg-[#121214] border-white/8","bg-[#ffffff] border-black/8")}`}>
        <div className="kx-seg flex-1" role="tablist">
          {tabs.map((tab, i) => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                role="tab" aria-selected={active}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] transition-colors ${
                  active
                    ? "kx-tab-on"
                    : t("text-white/55 hover:text-white/85","text-[#3d3a38]/65 hover:text-[#1e1b2e]")
                }`}>
                {active && (
                  <motion.span layoutId="activeTabPill" className="kx-seg-pill"
                    transition={{ type: "spring", stiffness: 460, damping: 36 }} />
                )}
                <Icon name={tab.icon} size={17} weight={active ? "duotone" : "regular"} className="relative" />
                <span className="relative" style={{ fontWeight: active ? 600 : 500 }}>{tab.label}</span>
                {tab.ping && !active && (
                  <span className="usb-tab-underline absolute top-1.5 right-2 h-[5px] w-[5px] rounded-full"/>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => { setActiveTab("study"); window.dispatchEvent(new CustomEvent("usb:open-history")); }}
          title="Historial de estudio"
          aria-label="Abrir historial de estudio"
          className={`h-[34px] w-[34px] shrink-0 rounded-lg border flex items-center justify-center transition-colors ${t("bg-white/5 border-white/12 text-white/80 hover:bg-white/10 hover:text-white","bg-white border-black/12 text-[#3d3a38] hover:bg-black/5 hover:text-[#15161c]")}`}
        >
          <History size={16} />
        </button>
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      <div className={`flex-1 overflow-hidden relative min-h-0 ${t("", "bg-[#f6f7f9]")}`}>

        {/* ════════ STUDY AGENT ════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: activeTab === "study" ? 1 : 0, y: activeTab === "study" ? 0 : 10 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={`absolute inset-0 flex flex-col ${activeTab === "study" ? "pointer-events-auto z-10" : "pointer-events-none z-0"}`}
        >
          <StudyAgentTab session={session} apiKeys={configuredGeminiKeys} />
        </motion.div>

        {/* ════════ CAPTIONS ════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: activeTab === "captions" ? 1 : 0, y: activeTab === "captions" ? 0 : 10 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={`kx-page kx-cap absolute inset-0 flex flex-col overflow-y-auto custom-scrollbar p-4 space-y-5 ${t("bg-[#1a1b1d]", "bg-[#f6f7f9]")} ${activeTab === "captions" ? "pointer-events-auto z-10" : "pointer-events-none z-0"}`}
        >

          {/* Status card */}
              <Card>
                <div className="mb-2">
                  <CapTitle icon="radio" tone="green" right={
                    <button
                      onClick={handleRefreshStatus}
                      className="kx-chip flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                    >
                      <RefreshCcw size={10}/>Actualizar
                    </button>
                  }>Estado en vivo</CapTitle>
                </div>
                <div className={`divide-y divide-[var(--usb-divider)]`}>
                  <StatusRow label="Subtítulos ES nativos"    status="No disponible"                                         ok={false}/>
                  <StatusRow
                    label="Subtítulos EN capturados"
                    status={capturedLineCount > 0 ? `${capturedLineCount} líneas` : "Esperando"}
                    ok={capturedLineCount > 0}
                    pulse={capturedLineCount > 0}
                  />
                  <StatusRow label="IA local (8010)"          status={localConnected ? "Conectada" : "Sin conexión"}         ok={localConnected} pulse={localConnected}/>
                  <StatusRow label="Traducción activa"        status={autoTranslate ? "En curso" : "Pausada"}                ok={autoTranslate}/>
                  <StatusRow label="Content script"           status={contentScriptConnected ? "Activo" : "Esperando…"}      ok={contentScriptConnected} pulse={contentScriptConnected}/>
                  {/* Only show the configured provider when it is not the bundled
                      local server — that one already has its own row above. */}
                  {activeBackend === "provider" && providerConfig.kind !== "local" && (
                    <StatusRow label={providerLabel} status={`${providerConfig.model}`} ok={true} pulse/>
                  )}
                  {hasKeys && (
                    <StatusRow label="Gemini fallback"        status={`${configuredGeminiKeys.length} keys en rotación`}   ok={true}  pulse/>
                  )}
                </div>
              </Card>

              {/* Translation toggle */}
              <div className="kx-card kx-toggle p-4 flex items-center gap-3" data-on={autoTranslate ? "1" : "0"}>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[var(--usb-bg-3)] border border-[var(--usb-border)] text-violet-400">
                  <Icon name="languages" size={18} weight={autoTranslate ? "fill" : "duotone"} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold tracking-tight text-[var(--usb-fg)]">Auto EN → ES</p>
                  <p className="text-[11.5px] text-[var(--usb-fg-mid)] mt-0.5 truncate">Traducción batch · {BACKEND_LABELS[activeBackend]}</p>
                </div>
                <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate}
                  className="data-[state=checked]:bg-violet-600 scale-[0.9] shrink-0"/>
              </div>

              {/* Pipeline */}
              <TranslationPipeline
                autoTranslate={autoTranslate}
                apiKeys={configuredGeminiKeys}
                localConnected={localConnected}
                capturedLineCount={capturedLineCount}
                lectureKey={currentLectureKey}
                providerConfig={providerConfig}
              />

              {/* SRT management */}
              <div>
                <SectionLabel icon="fileText" tone="sky">Gestión SRT</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={handleExportSrt} className="kx-tile-btn p-3.5 rounded-2xl flex flex-col items-center gap-2 hover:border-violet-500/30 transition-all">
                    <Icon name="download" size={20} weight="duotone" className="text-sky-400" />
                    <span className="text-[12px] font-semibold text-[var(--usb-fg)]">Exportar EN</span>
                  </button>
                  <button onClick={() => srtTextareaRef.current?.focus()} className="kx-tile-btn p-3.5 rounded-2xl flex flex-col items-center gap-2 hover:border-violet-500/30 transition-all">
                    <Icon name="upload" size={20} weight="duotone" className="text-violet-400" />
                    <span className="text-[12px] font-semibold text-[var(--usb-fg)]">Importar ES</span>
                  </button>
                </div>
              </div>

              {/* Paste SRT */}
              <div>
                <SectionLabel icon="edit3" tone="amber">Pegar SRT en español</SectionLabel>
                <div className="kx-card rounded-2xl overflow-hidden border border-[var(--usb-border)] bg-[var(--usb-bg-3)]">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--usb-divider)] bg-[var(--usb-bg-2)]/40">
                    <FileText size={13} className="text-amber-400"/>
                    <span className="text-[11.5px] font-bold text-[var(--usb-fg-mid)]">Formato SRT estándar</span>
                  </div>
                  <textarea ref={srtTextareaRef} value={pasteSrt} onChange={e => { setPasteSrt(e.target.value); setSrtApplied(false); }}
                    placeholder={"1\n00:00:00,000 --> 00:00:02,000\nHola a todos…"}
                    className="w-full h-[98px] text-[11.5px] font-mono bg-transparent px-4 py-3 resize-none outline-none leading-relaxed text-[var(--usb-fg)] placeholder:text-[var(--usb-fg-lo)] focus:bg-[var(--usb-bg-2)]/20 transition-colors"/>
                </div>
                <AnimatePresence mode="wait">
                  {srtApplied ? (
                    <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                      className="kx-ok-pill mt-3 w-full h-11 rounded-2xl text-[12px] font-bold flex items-center justify-center gap-1.5 shadow-sm">
                      <CheckCircle2 size={15}/>SRT aplicado correctamente
                    </motion.div>
                  ) : (
                    <motion.button key="btn" onClick={handleApplySrt} disabled={!pasteSrt.trim() || applyingCopy}
                      className="kx-on-solid kx-cta mt-3 w-full h-11 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed text-[12.5px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm hover:brightness-105">
                      {applyingCopy ? <><Loader2 size={13} className="animate-spin"/>Aplicando…</> : <>Aplicar SRT</>}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              {/* Cache settings */}
              <CacheSettingsPanel ttlDays={cacheTtlDays} onTtlChange={setCacheTtlDays} />

              <div className="h-2"/>
        </motion.div>

        {/* ════════ OVERLAY ════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: activeTab === "overlay" ? 1 : 0, y: activeTab === "overlay" ? 0 : 10 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={`absolute inset-0 flex flex-col min-h-0 ${activeTab === "overlay" ? "pointer-events-auto z-10" : "pointer-events-none z-0"}`}
        >

          {/* ── STICKY TOP: preview siempre visible ── */}
              <div className={`kx-ov-top shrink-0 px-4 pt-3.5 pb-3.5 space-y-2.5 border-b transition-colors ${t("border-white/8 bg-[#121214]", "border-black/8 bg-[#ffffff]")}`}>

                {/* ── Preview frame (16:9) ── */}
                <div
                  ref={previewRef}
                  className={`usb-video-surface rounded-xl overflow-hidden transition-all duration-200 relative ${
                    isDragging
                      ? "border border-violet-500 shadow-[0_0_16px_rgba(109,74,255,0.3)]"
                      : t("border border-white/10 bg-[#0d0c12]", "border border-black/10 bg-[#15141c]")
                  }`}
                  style={{ aspectRatio: "21/9" }}
                >
                  {/* Video background */}
                  <div className="absolute inset-0 bg-[#0d0c12]"/>
                  <FrameMarks />
                  <div className="absolute inset-0 flex items-center justify-center opacity-75">
                    <div className="text-[10px] font-mono text-violet-300 leading-relaxed text-left px-4">
                      {`public class KinemaEngine {\n  public static void main(String[] args) {\n    System.out.println("Precisión cinematográfica");\n  }\n}`}
                    </div>
                  </div>

                  {/* Position reference guides during drag */}
                  {isDragging && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute left-0 right-0 border-t border-dashed border-violet-400/20" style={{ top: "33%" }}/>
                      <div className="absolute left-0 right-0 border-t border-dashed border-violet-400/20" style={{ top: "66%" }}/>
                      <div className="absolute top-0 bottom-0 border-l border-dashed border-violet-400/20" style={{ left: "50%" }}/>
                    </div>
                  )}

                  {/* ── Subtitle + drag handle ── */}
                  {showOverlay && (
                    hasCustomPos ? (
                      /* Custom dragged position */
                      <div
                        ref={dragRef}
                        className="absolute flex flex-col items-center gap-0.5"
                        style={{
                          left: `${customPosX}%`,
                          top: `${customPosY}%`,
                          transform: "translate(-50%, -50%)",
                          width: "max-content",
                          maxWidth: "85%",
                        }}
                      >
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={currentLine}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="text-center px-2.5 py-1 rounded-md max-w-full whitespace-pre-wrap"
                            style={previewSubtitleStyle}
                          >
                            {preview_es}
                          </motion.div>
                        </AnimatePresence>
                        {/* Drag handle */}
                        <div
                          onMouseDown={startDragHandle}
                          className={`flex items-center justify-center cursor-grab select-none transition-all duration-150 px-2 py-0.5 rounded ${
                            isDragging
                              ? "cursor-grabbing text-violet-300 bg-violet-600/30"
                              : "text-white/40 hover:text-white hover:bg-white/10"
                          }`}
                          title="Arrastra para mover"
                        >
                          <GripHorizontal size={12}/>
                        </div>
                        {/* Coordinates badge */}
                        {isDragging && (
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-violet-950/90 border border-violet-500/40 px-2 py-0.5 rounded text-[9px] text-violet-200 font-mono whitespace-nowrap">
                            {customPosX}% · {customPosY}%
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Preset position (top / center / bottom) */
                      <div
                        ref={dragRef}
                        className="absolute flex flex-col items-center gap-0.5"
                        style={previewPresetStyle}
                      >
                        {showGlossary && (
                          <div className="px-2.5 py-1 rounded-md bg-black/60 border border-white/16 text-[10px] leading-tight" style={{ marginTop: 6 }}>
                            <span className="font-bold text-sky-300">java</span>
                            <span className="text-teal-300 italic ml-1.5">/ˈdʒɑːvə/</span>
                            <div className="text-white/70 text-[9px] mt-0.5">lenguaje de programación y plataforma</div>
                          </div>
                        )}
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={`${currentLine}-${position}`}
                            initial={{ opacity: 0, y: position === "top" ? -4 : 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="text-center px-2.5 py-1 rounded-md max-w-full whitespace-pre-wrap"
                            style={previewSubtitleStyle}
                          >
                            {preview_es}
                          </motion.div>
                        </AnimatePresence>
                        {/* Drag handle */}
                        <div
                          onMouseDown={startDragHandle}
                          className="flex items-center justify-center cursor-grab select-none text-white/30 hover:text-white hover:bg-white/10 px-2 py-0.5 rounded transition-all duration-150"
                          title="Arrastra para posición libre"
                        >
                          <GripHorizontal size={12}/>
                        </div>
                      </div>
                    )
                  )}

                  {/* Preview label */}
                  <div className="absolute top-2.5 left-2.5">
                    <span className="text-[10px] font-bold text-white bg-black/70 border border-white/15 px-2.5 py-1 rounded-full tracking-wider shadow-sm backdrop-blur-md">
                      MONITOR EN VIVO
                    </span>
                  </div>

                  {/* Drag hint when not dragging and in default mode */}
                  {showOverlay && !hasCustomPos && !isDragging && (
                    <div className="absolute bottom-2 right-2.5">
                      <span className="text-white/60 text-[10px] select-none font-semibold bg-black/50 px-2 py-0.5 rounded-md border border-white/10">
                        arrastra ⠿
                      </span>
                    </div>
                  )}

                  {!showOverlay && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                      <p className="text-white/60 text-[12px] font-semibold flex items-center gap-2"><EyeOff size={15}/>Overlay desactivado</p>
                    </div>
                  )}
                </div>

                {/* ── En vivo card ── */}
                <div className="kx-card overflow-hidden transition-all duration-300">
                  <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[var(--usb-divider)]">
                    <span className="relative flex h-2 w-2 shrink-0">
                      {autoTranslate && showOverlay && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60"/>
                      )}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${autoTranslate && showOverlay ? "bg-violet-500" : "bg-[var(--usb-fg-lo)]"}`}/>
                    </span>
                    <span className={`text-[11.5px] font-bold flex-1 ${autoTranslate && showOverlay ? t("text-violet-300", "text-[#5b37e8]") : "text-[var(--usb-fg-mid)]"}`}>
                      {autoTranslate && showOverlay ? "Transmisión en vivo" : "Pausado"}
                    </span>
                    {autoTranslate && showOverlay && (
                      <span className="text-[11px] font-mono tabular-nums text-[var(--usb-fg-lo)]">{preview_ts}</span>
                    )}
                  </div>
                  {autoTranslate && showOverlay ? (
                    <div className="px-4 py-3">
                      <AnimatePresence mode="wait">
                        <motion.div key={`${currentLine}-${preview_es.slice(0, 24)}`}
                          initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.18 }}>
                          {preview_en !== preview_es && <p className="text-[11.5px] truncate mb-0.5 leading-tight text-[var(--usb-fg-lo)]">{preview_en}</p>}
                          <p className="text-[13px] leading-snug font-semibold text-[var(--usb-fg)]">{preview_es}</p>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="px-4 py-3 flex items-center gap-2">
                      {!autoTranslate ? <Sparkles size={13} className="text-[var(--usb-fg-lo)]"/> : <EyeOff size={13} className="text-[var(--usb-fg-lo)]"/>}
                      <p className="text-[12px] text-[var(--usb-fg-mid)]">
                        {!autoTranslate ? "Activa la traducción automática en Captions" : "Activa el overlay para renderizar subtítulos sobre el reproductor"}
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Overlay master toggle ── */}
                <div className="kx-card kx-toggle px-4 py-3 flex items-center gap-3" data-on={showOverlay ? "1" : "0"}>
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[var(--usb-bg-3)] border border-[var(--usb-border)] text-violet-400">
                    <Icon name="eye" size={18} weight={showOverlay ? "fill" : "duotone"} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold tracking-tight text-[var(--usb-fg)]">Overlay activo</p>
                  </div>
                  <Switch checked={showOverlay} onCheckedChange={setShowOverlay}
                    className="data-[state=checked]:bg-violet-600 scale-[0.9] shrink-0"/>
                </div>
              </div>

              {/* ── SCROLLABLE CONTROLS — preview always stays above ── */}
              <div className={`kx-page kx-cap flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5 transition-opacity duration-300 ${!showOverlay ? "opacity-30 pointer-events-none" : ""}`}>

                {/* Position presets */}
                <div>
                  <SectionLabel icon="layers" tone="violet">Posición vertical</SectionLabel>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { id: "top"    as const, label: "Superior",  icon: ArrowUpDown },
                      { id: "center" as const, label: "Centro",    icon: AlignCenter },
                      { id: "bottom" as const, label: "Inferior",  icon: Baseline    },
                    ] as const).map(p => (
                      <button key={p.id} onClick={() => handleSetPosition(p.id)}
                        data-on={position === p.id && !hasCustomPos ? "1" : "0"}
                        className="kx-tile-btn !h-[72px] !text-[12px] rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all">
                        <p.icon size={19}/>
                        <span className="font-semibold">{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Drag position */}
                <div className="kx-card kx-toggle p-4 flex items-center gap-3" data-on={hasCustomPos ? "1" : "0"}>
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[var(--usb-bg-3)] border border-[var(--usb-border)] text-[var(--usb-fg-mid)]">
                    <GripHorizontal size={17}/>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold tracking-tight text-[var(--usb-fg)] flex items-center gap-2">
                      Posición libre
                      {hasCustomPos && (
                        <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, #6d4aff 16%, transparent)", color: t("#b7a6ff", "#5b37e8") }}>
                          {customPosX}% · {customPosY}%
                        </span>
                      )}
                    </p>
                    <p className="text-[11.5px] mt-0.5 text-[var(--usb-fg-mid)]">
                      Arrastra el icono ⠿ en el monitor para mover libremente
                    </p>
                  </div>
                  {hasCustomPos && (
                    <button onClick={resetDragPos} className="kx-chip flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full shrink-0">
                      <RefreshCcw size={10}/>Restablecer
                    </button>
                  )}
                </div>

                <SliderCard icon="type" title="Tamaño tipográfico" value={`${fontSize[0]}px`}
                  foot={<div className="flex items-center justify-between text-[10.5px] font-mono text-[var(--usb-fg-lo)]"><span>12px</span><span>48px</span></div>}>
                  <Slider value={fontSize} onValueChange={setFontSize} max={48} min={12} step={2} className="[&_[data-slot=track]]:bg-violet-500/20 [&_[data-slot=range]]:bg-violet-600 [&_[data-slot=thumb]]:border-violet-600 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-4 [&_[data-slot=thumb]]:w-4"/>
                </SliderCard>

                <SliderCard icon="eye" tone="sky" title="Opacidad de fondo" value={`${opacity[0]}%`}
                  foot={<div className="flex items-center justify-between text-[10.5px] text-[var(--usb-fg-lo)]"><span>0% Transparente</span><span>100% Sólido</span></div>}>
                  <Slider value={opacity} onValueChange={setOpacity} max={100} min={0} step={5} className="[&_[data-slot=track]]:bg-violet-500/20 [&_[data-slot=range]]:bg-violet-600 [&_[data-slot=thumb]]:border-violet-600 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-4 [&_[data-slot=thumb]]:w-4"/>
                </SliderCard>

                <SliderCard icon="sparkles" tone="rose" title="Sombra de relieve" value={`${shadowStrength[0]}%`}>
                  <Slider value={shadowStrength} onValueChange={setShadowStrength} max={100} min={0} step={10} className="[&_[data-slot=track]]:bg-violet-500/20 [&_[data-slot=range]]:bg-violet-600 [&_[data-slot=thumb]]:border-violet-600 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-4 [&_[data-slot=thumb]]:w-4"/>
                </SliderCard>

                <div className="flex items-center justify-between px-1 py-1">
                  <div>
                    <p className="text-[11.5px] font-semibold text-[var(--usb-fg-hi)] leading-tight">Glosario de vocabulario</p>
                    <p className="text-[9.5px] text-[var(--usb-fg-lo)] leading-tight mt-0.5">Chip con palabra + IPA bajo el subtítulo; definición al pausar</p>
                  </div>
                  <button
                    onClick={() => setShowGlossary(!showGlossary)}
                    role="switch"
                    aria-checked={showGlossary}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${showGlossary ? "bg-violet-600" : "bg-black/25 border border-white/15"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${showGlossary ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </div>

                {/* Text color */}
                <div>
                  <SectionLabel icon="palette" tone="green">Color del texto</SectionLabel>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { id: "white"  as const, label: "Blanco",   dot: "#ffffff" },
                      { id: "yellow" as const, label: "Amarillo", dot: "#fde047" },
                      { id: "cyan"   as const, label: "Cian",     dot: "#67e8f9" },
                    ]).map(c => (
                      <button key={c.id} onClick={() => setTextColor(c.id)} data-on={textColor === c.id ? "1" : "0"}
                        className="kx-tile-btn !h-[54px] !flex-row !text-[12px] rounded-2xl gap-2.5 font-semibold">
                        <span className="w-4 h-4 rounded-full shrink-0 ring-2 ring-black/20 shadow-sm" style={{ backgroundColor: c.dot }}/>
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sync offset */}
                <SliderCard icon="timer" tone="amber" title="Desfase de sincronización" value={`${syncOffset[0] >= 0 ? "+" : ""}${syncOffset[0]}ms`}
                  foot={<>
                    <p className="text-[11.5px] leading-relaxed text-[var(--usb-fg-mid)]">
                      Compensa el retraso si el audio va por delante (+) o por detrás (−) de la imagen.
                    </p>
                    {syncOffset[0] !== 0 && (
                      <button onClick={() => setSyncOffset([0])} className="kx-chip flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full">
                        <RefreshCcw size={10}/>Restablecer a 0ms
                      </button>
                    )}
                  </>}>
                  <Slider value={syncOffset} onValueChange={setSyncOffset} max={2000} min={-2000} step={100} className="[&_[data-slot=track]]:bg-amber-500/20 [&_[data-slot=range]]:bg-amber-500 [&_[data-slot=thumb]]:border-amber-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-4 [&_[data-slot=thumb]]:w-4"/>
                </SliderCard>

                {/* Quick presets */}
                <div>
                  <SectionLabel icon="wand2" tone="rose">Perfiles cinematográficos</SectionLabel>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Cinema Master",     action: () => { setFontSize([22]); setOpacity([90]); setTextColor("white");  setShadowStrength([80]); handleSetPosition("bottom"); } },
                      { label: "Minimalist Clear",  action: () => { setFontSize([16]); setOpacity([0]);  setTextColor("yellow"); setShadowStrength([90]); handleSetPosition("bottom"); } },
                      { label: "High Contrast",     action: () => { setFontSize([26]); setOpacity([95]); setTextColor("yellow"); setShadowStrength([0]);  handleSetPosition("bottom"); } },
                      { label: "Studio Default",    action: () => { setFontSize([24]); setOpacity([85]); setTextColor("white");  setShadowStrength([60]); handleSetPosition("bottom"); } },
                    ].map(p => (
                      <button key={p.label} onClick={p.action} className="kx-tile-btn !h-12 !text-[12px] rounded-2xl font-semibold hover:border-violet-500/30 transition-all">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-4"/>
              </div>

        </motion.div>

        {/* ════════ DEV ════════ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: activeTab === "dev" ? 1 : 0, y: activeTab === "dev" ? 0 : 10 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={`absolute inset-0 flex flex-col min-h-0 overflow-hidden ${activeTab === "dev" ? "pointer-events-auto z-10" : "pointer-events-none z-0"}`}
        >
          <DevTab />
        </motion.div>

      </div>

      {/* ── Guest mode sync banner ────────────────────────────────────────── */}
      {!session && onRequestLogin && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
          className="shrink-0 mx-3 mb-3"
        >
          <button
            onClick={onRequestLogin}
            className="kx-sync w-full group relative overflow-hidden flex items-center gap-3 px-4 py-3.5 text-left rounded-2xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] hover:border-[#6d4aff]/50 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
          >
            <div className={`w-9 h-9 rounded-xl bg-[var(--usb-bg-2)] border border-[var(--usb-border)] flex items-center justify-center shrink-0 ${t("text-[#b7a6ff]","text-[#5b37e8]")}`}>
              <Cloud size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold tracking-tight text-[var(--usb-fg-hi)]">
                Sincronizar en la nube
              </p>
              <p className="text-[11.5px] mt-0.5 font-medium text-[var(--usb-fg-mid)]">
                Tu configuración solo está en este dispositivo
              </p>
            </div>
            <ChevronRight size={16} className="text-[var(--usb-fg-mid)] group-hover:translate-x-1 group-hover:text-[var(--usb-fg-hi)] transition-all shrink-0" />
          </button>
        </motion.div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className={`relative px-3.5 py-2 border-t shrink-0 flex items-center justify-between ${t("border-white/6 bg-[#161718]","border-black/6 bg-[#eef0f4]")}`}>

        {/* ── Keyboard shortcuts panel ── */}
        <AnimatePresence>
          {showHotkeys && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className={`absolute bottom-full left-3 right-3 mb-2 border rounded-xl overflow-hidden shadow-2xl z-50 ${t("bg-[#0d0e0f] border-white/10","bg-[#f6f7f9] border-black/10")}`}
            >
              <div className={`flex items-center justify-between px-3 py-2 border-b ${t("border-white/8","border-black/6")}`}>
                <div className="flex items-center gap-1.5">
                  <Keyboard size={10} className="text-violet-400/70" />
                  <span className={`text-[10px] ${t("text-white/55","text-[#2c2a28]")}`} style={{ fontWeight: 600 }}>Atajos de teclado</span>
                </div>
                <button onClick={() => setShowHotkeys(false)} className={`transition-colors ${t("text-white/25 hover:text-white/60","text-[#3d3a38]/55 hover:text-[#1a1918]")}`}>
                  <X size={10} />
                </button>
              </div>
              <div className="p-2.5 space-y-1.5">
                {[
                  { keys: ["Alt", "P"], desc: "Play / Pause video" },
                  { keys: ["Alt", "C"], desc: "Captura a notas" },
                  { keys: ["Alt", "S"], desc: "Abrir Study Agent" },
                ].map(({ keys, desc }) => (
                  <div key={desc} className="flex items-center justify-between gap-3">
                    <span className={`text-[10px] ${t("text-white/40","text-[#3d3a38]/70")}`}>{desc}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {keys.map((k, i) => (
                        <React.Fragment key={k}>
                          <kbd className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${t("bg-white/8 border-white/12 text-white/55","bg-black/5 border-black/12 text-[#3d3a38]/80")}`}>{k}</kbd>
                          {i < keys.length - 1 && <span className={`text-[8px] ${t("text-white/20","text-[#3d3a38]/45")}`}>+</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
                <div className={`pt-2 border-t space-y-1 ${t("border-white/5","border-black/6")}`}>
                  <p className={`text-[9px] ${t("text-white/18","text-[#6e6b68]/55")}`}>Triple clic en Ajustes: modo Dev (telemetría SSE)</p>
                  <p className={`text-[9px] ${t("text-white/18","text-[#6e6b68]/55")}`}>Badge de IA → Configurar proveedor y API keys</p>
                  <p className={`text-[9px] ${t("text-white/18","text-[#6e6b68]/55")}`}>Overlay tab → arrastra ⠿ para posición libre</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono ${t("text-white/40","text-[#6e6b68]/70")}`}>127.0.0.1:8010</span>
          <button
            onClick={() => setShowHotkeys(v => !v)}
            title="Atajos de teclado"
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border transition-all text-[9px] ${
              showHotkeys
                ? "text-violet-300/80 bg-violet-500/10 border-violet-500/20"
                : t("text-white/22 hover:text-white/50 border-transparent hover:border-white/10 hover:bg-white/5",
                    "text-[#6e6b68]/50 hover:text-[#1a1918] border-transparent hover:border-black/10 hover:bg-black/5")
            }`}
          >
            <Keyboard size={12} />
            <span>Atajos</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <AnimatePresence>
            {syncPulse && (
              <motion.span
                key="synced"
                initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1 text-emerald-400 text-[9px]"
              >
                <Check size={11} strokeWidth={2.4} />Guardado
              </motion.span>
            )}
          </AnimatePresence>
          <span className={t("text-white/10","text-black/15")}>·</span>
          <span className={`text-[10px] font-mono ${t("text-white/45","text-[#3d3a38]/60")}`}>v1.3.0</span>
        </div>
      </div>

    </div>
  );
}
