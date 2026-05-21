import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Settings, Download, Upload, RefreshCcw, CheckCircle2, AlertCircle,
  PlaySquare, Sparkles, Captions, Layers, GraduationCap, RotateCcw,
  Type, Eye, EyeOff, AlignCenter, FileText,
  Loader2, ArrowUpDown, Baseline, Check, GripHorizontal, Cpu, Wifi, WifiOff,
  CloudUpload, ArrowRight, LogIn, LogOut, Keyboard, X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { StudyAgentTab } from "./StudyAgentTab";
import { TranslationPipeline } from "./TranslationPipeline";
import { ApiKeysPanel } from "./ApiKeysPanel";
import { DevTab } from "./DevTab";
import { usePersistedState } from "../hooks/usePersistedState";
import { contentBridge } from "../services/contentBridge";
import { AppLogo } from "./AppLogo";
import { Session } from "@supabase/supabase-js";
import { useDockTheme } from "../contexts/ThemeContext";
import { initGeminiKeys, saveGeminiKeys, setGeminiKeysSync } from "../../gemini-config";

interface ExtensionSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  session?: Session;
  onRequestLogin?: () => void;
  onSignOut?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  const { t } = useDockTheme();
  return <p className={`text-[9px] uppercase tracking-widest mb-2 ${t("text-white/22","text-[#3d3a38]/60")}`}>{children}</p>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { t } = useDockTheme();
  return (
    <div className={`border shadow-sm rounded-xl p-4 ${t("bg-gradient-to-b from-[#18181b] to-[#121214] border-white/5","bg-white border-black/7 shadow-[0_1px_4px_rgba(0,0,0,0.06)]")} ${className}`}>
      {children}
    </div>
  );
}

function StatusRow({ label, status, ok, pulse }: { label: string; status: string; ok: boolean; pulse?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-white/40 text-[11px]">{label}</span>
      <span className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {pulse && ok
          ? <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"/></span>
          : ok ? <CheckCircle2 size={10}/> : <AlertCircle size={10}/>}
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
  const [apiKey1, setApiKey1] = usePersistedState("gemini_api_key_1", "");
  const [apiKey2, setApiKey2] = usePersistedState("gemini_api_key_2", "");
  const [showApiPanel, setShowApiPanel] = useState(false);

  const handleSaveKeys = (k1: string, k2: string) => {
    setApiKey1(k1);
    setApiKey2(k2);
    setGeminiKeysSync([k1, k2]);
    void saveGeminiKeys([k1, k2]);
  };

  useEffect(() => {
    setGeminiKeysSync([apiKey1, apiKey2]);
  }, [apiKey1, apiKey2]);

  useEffect(() => {
    let alive = true;

    void initGeminiKeys().then(() => {
      const keys = (globalThis as typeof globalThis & { USB_GEMINI_API_KEYS?: string[] }).USB_GEMINI_API_KEYS;
      if (!alive || apiKey1 || apiKey2 || !Array.isArray(keys) || keys.length === 0) return;
      setApiKey1(keys[0] ?? "");
      setApiKey2(keys[1] ?? "");
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
  const [, setContentScriptConnected] = useState(false);
  const [syncPulse, setSyncPulse]                           = useState(false);

  // ── Local API status (mock — simulates checking port 8010) ───────────────
  const [localConnected, setLocalConnected] = useState(true);

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
          syncOffset: syncOffset[0],
          customPos: hasCustomPos ? { x: customPosX, y: customPosY } : null,
        },
      });
      setSyncPulse(true);
      setTimeout(() => setSyncPulse(false), 1800);
    }, 280);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverlay, fontSize, opacity, position, textColor, shadowStrength, syncOffset, hasCustomPos, customPosX, customPosY]);

  // ── Auto-translate toggle sync ────────────────────────────────────────────
  useEffect(() => {
    contentBridge.sendToContent({ type: "AUTO_TRANSLATE_TOGGLE", payload: { active: autoTranslate } });
    if (!autoTranslate) {
      translateAbortRef.current?.abort();
      setLiveEs("");
      pushOverlayText("");
    } else if (liveEn && showOverlay) {
      pushOverlayText(liveEs || liveEn);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslate, liveEn, liveEs, showOverlay]);

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
  const hasKeys    = !!(apiKey1 || apiKey2);
  const preview_en = liveEn || MOCK_LINES[currentLine]?.en || "";
  const preview_es = liveEs || MOCK_LINES[currentLine]?.es || "";
  const preview_ts = liveTs !== "--:--" ? liveTs : (MOCK_LINES[currentLine]?.ts ?? "--:--");

  // Which backend is active? Local takes priority over Gemini
  const activeBackend: "local" | "gemini" | "mock" =
    localConnected ? "local" : hasKeys ? "gemini" : "mock";

  const BACKEND_LABELS = {
    local:  "IA Local",
    gemini: "Gemini",
    mock:   "Mock",
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
    { id: "study"    as const, label: "Study",    icon: GraduationCap, ping: true  },
    { id: "captions" as const, label: "Captions", icon: Captions,      ping: false },
    { id: "overlay"  as const, label: "Overlay",  icon: Layers,        ping: false },
    ...(devMode ? [{ id: "dev" as const, label: "Dev", icon: Settings, ping: false }] : []),
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full w-full ${t("bg-[#1a1b1d]", "bg-[#f8f7f6]")}`}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={`px-4 py-3 border-b shrink-0 backdrop-blur-md sticky top-0 z-20 ${t("border-white/5 bg-[#121214]/80", "border-black/6 bg-[#f0efed]")}`}>
        <div className="flex items-center justify-between">

          {/* Left: Logo + title */}
          <div className="flex items-center gap-3">
            <AppLogo size={28} />
            <div>
              <h1 className={`text-[13px] leading-tight tracking-wide ${t("text-white","text-[#1a1918]")}`} style={{ fontWeight: 600 }}>
                Subtitle Bridge
              </h1>
              <div className="flex items-center mt-0.5">
                <span className={`text-[9px] font-medium tracking-wider uppercase ${t("text-white/40","text-[#3d3a38]/65")}`}>
                  EN → ES Subtitles
                </span>
              </div>
            </div>
          </div>

          {/* Right: status indicators + gear */}
          <div className="flex items-center gap-2">

            {/* ── Active AI Engine Badge ── */}
            <button
              onClick={() => setShowApiPanel(v => !v)}
              title="Configurar motores de IA"
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] transition-all duration-300 border ${
                activeBackend === "local" 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                  : activeBackend === "gemini"
                    ? "bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/20"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
              }`}
              style={{ fontWeight: 600 }}
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                {(activeBackend === "local" || activeBackend === "gemini") && !showApiPanel && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                    activeBackend === "local" ? "bg-emerald-400" : "bg-violet-400"
                  }`}/>
                )}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  activeBackend === "local" ? "bg-emerald-400 shadow-[0_0_5px_#34d399]" : 
                  activeBackend === "gemini" ? "bg-violet-400 shadow-[0_0_5px_#a78bfa]" : "bg-amber-400"
                }`}/>
              </span>
              {activeBackend === "local" && <Wifi size={10} />}
              {activeBackend === "gemini" && <Cpu size={10} />}
              {activeBackend === "mock" && <AlertCircle size={10} />}
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
                <Settings size={14} />
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
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0 shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', fontSize: 9, fontWeight: 700 }}
                >
                  {session.user.email?.[0]?.toUpperCase() ?? 'U'}
                </div>
                {/* Email */}
                <span className={`text-[10px] truncate max-w-[155px] ${t("text-white/38","text-[#3d3a38]/65")}`}>
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
                  <LogOut size={9} />
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
        apiKey1={apiKey1}
        apiKey2={apiKey2}
        localConnected={localConnected}
        onSave={handleSaveKeys}
      />

      {/* ── Tab Nav ──────────────────────────────────────────────────────── */}
      <div className={`flex shrink-0 p-1.5 gap-1 border-b relative z-10 ${t("bg-[#121214] border-white/5","bg-[#f2f1ef] border-black/6")}`}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg text-[10px] transition-colors z-10 ${
                active
                  ? t("text-white","text-[#1a1918]")
                  : t("text-white/40 hover:text-white/70 hover:bg-white/5","text-[#3d3a38]/65 hover:text-[#1a1918] hover:bg-black/6")
              }`}>
              {active && (
                <motion.div
                  layoutId="activeTabBg"
                  className={`absolute inset-0 rounded-lg ${t("bg-white/10 border border-white/10","bg-black/8 border border-black/12")}`}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={13} className={`relative z-10 ${active ? "text-violet-400" : ""}`} />
              <span className="relative z-10 tracking-wide" style={{ fontWeight: active ? 600 : 500 }}>{tab.label}</span>
              {tab.ping && !active && (
                <span className="absolute top-1.5 right-2 w-1.5 h-1.5 bg-violet-500 rounded-full shadow-[0_0_5px_#8b5cf6]"/>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      <div className={`flex-1 overflow-hidden relative min-h-0 ${t("", "bg-[#f8f7f6]")}`}>

        {/* ════════ STUDY AGENT ════════ */}
        <motion.div
          animate={{ opacity: activeTab === "study" ? 1 : 0 }}
          transition={{ duration: 0.14 }}
          className={`absolute inset-0 flex flex-col ${activeTab === "study" ? "pointer-events-auto z-10" : "pointer-events-none z-0"}`}
        >
          <StudyAgentTab session={session} />
        </motion.div>

        {/* ════════ CAPTIONS ════════ */}
        <motion.div
          animate={{ opacity: activeTab === "captions" ? 1 : 0 }}
          transition={{ duration: 0.14 }}
          className={`absolute inset-0 flex flex-col overflow-y-auto custom-scrollbar p-3 space-y-3 ${t("bg-[#1a1b1d]", "bg-[#f8f7f6]")} ${activeTab === "captions" ? "pointer-events-auto z-10" : "pointer-events-none z-0"}`}
        >

          {/* Status card */}
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <PlaySquare size={11} className="text-violet-400"/>
                    <span className="text-white/55 text-[11px]" style={{ fontWeight: 600 }}>Estado en vivo</span>
                  </div>
                  <button
                    onClick={handleRefreshStatus}
                    className="flex items-center gap-1 text-[9px] text-white/25 hover:text-white/50 border border-white/8 px-1.5 py-0.5 rounded transition-colors"
                  >
                    <RefreshCcw size={8}/>Refresh
                  </button>
                </div>
                <div className="divide-y divide-white/5">
                  <StatusRow label="Subtítulos ES nativos"    status="No disponible"                                         ok={false}/>
                  <StatusRow
                    label="Subtítulos EN capturados"
                    status={capturedLineCount > 0 ? `${capturedLineCount} líneas` : "Esperando"}
                    ok={capturedLineCount > 0}
                    pulse={capturedLineCount > 0}
                  />
                  <StatusRow label="IA local (8010)"          status={localConnected ? "Conectada" : "Sin conexión"}         ok={localConnected} pulse={localConnected}/>
                  <StatusRow label="Traducción activa"        status={autoTranslate ? "En curso" : "Pausada"}                ok={autoTranslate}/>
                  {hasKeys && (
                    <StatusRow label="Gemini fallback"        status={apiKey1 ? "Key 1 configurada" : "Key 2 configurada"}   ok={true}  pulse/>
                  )}
                </div>
              </Card>

              {/* Translation toggle */}
              <div className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${autoTranslate ? "bg-violet-600/10 border-violet-500/22" : "bg-white/3 border-white/7"}`}>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles size={11} className={autoTranslate ? "text-violet-400" : "text-white/30"}/>
                    <span className="text-white text-[11px]" style={{ fontWeight: 500 }}>Auto EN → ES</span>
                  </div>
                  <p className="text-white/30 text-[10px]">
                    Traducción batch · {BACKEND_LABELS[activeBackend]}
                  </p>
                </div>
                <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate}
                  className="data-[state=checked]:bg-violet-600 scale-[0.82] shrink-0"/>
              </div>

              {/* Pipeline */}
              <TranslationPipeline
                autoTranslate={autoTranslate}
                apiKey1={apiKey1}
                apiKey2={apiKey2}
                localConnected={localConnected}
                capturedLineCount={capturedLineCount}
                lectureKey={currentLectureKey}
              />

              {/* SRT management */}
              <div className="space-y-2">
                <SectionLabel>Gestión SRT</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleExportSrt}
                    className="flex items-center justify-center gap-1.5 h-8 rounded-lg bg-white/4 hover:bg-white/7 border border-white/8 hover:border-white/14 text-white/45 hover:text-white/75 text-[10px] transition-all">
                    <Download size={11}/>Export EN
                  </button>
                  <button
                    onClick={() => srtTextareaRef.current?.focus()}
                    className="flex items-center justify-center gap-1.5 h-8 rounded-lg bg-white/4 hover:bg-white/7 border border-white/8 hover:border-white/14 text-white/45 hover:text-white/75 text-[10px] transition-all"
                  >
                    <Upload size={11}/>Import ES
                  </button>
                </div>
              </div>

              {/* Paste SRT */}
              <div className="space-y-2">
                <SectionLabel>Pegar SRT en español</SectionLabel>
                <div className="bg-[#0f1012] border border-white/7 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5">
                    <FileText size={10} className="text-white/25"/>
                    <span className="text-white/25 text-[9px]">Formato SRT estándar</span>
                  </div>
                  <textarea ref={srtTextareaRef} value={pasteSrt} onChange={e => { setPasteSrt(e.target.value); setSrtApplied(false); }}
                    placeholder={"1\n00:00:00,000 --> 00:00:02,000\nHola a todos…"}
                    className="w-full h-[68px] text-[10px] font-mono bg-transparent text-white/60 placeholder:text-white/15 p-2.5 resize-none outline-none leading-relaxed"/>
                </div>
                <AnimatePresence mode="wait">
                  {srtApplied ? (
                    <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="w-full h-8 rounded-lg bg-emerald-700/40 border border-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center gap-1.5">
                      <CheckCircle2 size={11}/>SRT aplicado correctamente
                    </motion.div>
                  ) : (
                    <motion.button key="btn" onClick={handleApplySrt} disabled={!pasteSrt.trim() || applyingCopy}
                      className="w-full h-8 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-25 disabled:cursor-not-allowed text-white text-[10px] flex items-center justify-center gap-1.5 transition-all">
                      {applyingCopy ? <><Loader2 size={10} className="animate-spin"/>Aplicando…</> : <>Aplicar SRT</>}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              <div className="h-2"/>
        </motion.div>

        {/* ════════ OVERLAY ════════ */}
        <motion.div
          animate={{ opacity: activeTab === "overlay" ? 1 : 0 }}
          transition={{ duration: 0.14 }}
          className={`absolute inset-0 flex flex-col min-h-0 ${activeTab === "overlay" ? "pointer-events-auto z-10" : "pointer-events-none z-0"}`}
        >

          {/* ── STICKY TOP: preview siempre visible ── */}
              <div className="shrink-0 px-3 pt-3 pb-2.5 space-y-2.5 border-b border-white/6 bg-[#1a1b1d]">

                {/* ── Preview frame (16:9) ── */}
                <div
                  ref={previewRef}
                  className={`rounded-xl overflow-hidden bg-[#0a0a0c] transition-all duration-200 ${
                    isDragging
                      ? "border border-violet-500/50 shadow-[0_0_16px_rgba(139,92,246,0.2)]"
                      : "border border-white/8"
                  }`}
                  style={{ aspectRatio: "16/9", position: "relative" }}
                >
                  {/* Fake video background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-[#0a0a0c]"/>
                  <div className="absolute inset-0 flex items-center justify-center opacity-20">
                    <div className="text-[7px] font-mono text-emerald-400 leading-relaxed text-left px-4">
                      {`public class JVM {\n  public static void main\n    (String[] args) {\n    System.out.println\n      ("Hello World");\n  }\n}`}
                    </div>
                  </div>

                  {/* Position reference guides during drag */}
                  {isDragging && (
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Horizontal thirds */}
                      <div className="absolute left-0 right-0 border-t border-dashed border-white/8" style={{ top: "33%" }}/>
                      <div className="absolute left-0 right-0 border-t border-dashed border-white/8" style={{ top: "66%" }}/>
                      {/* Vertical center */}
                      <div className="absolute top-0 bottom-0 border-l border-dashed border-white/8" style={{ left: "50%" }}/>
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
                          maxWidth: "80%",
                        }}
                      >
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={currentLine}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-center px-2 py-0.5 rounded max-w-full whitespace-pre-wrap"
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
                              ? "cursor-grabbing text-violet-400 bg-violet-500/20"
                              : "text-white/30 hover:text-white/65 hover:bg-white/10"
                          }`}
                          title="Arrastra para mover"
                        >
                          <GripHorizontal size={11}/>
                        </div>
                        {/* Coordinates badge */}
                        {isDragging && (
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-violet-900/80 border border-violet-500/30 px-1.5 py-0.5 rounded text-[8px] text-violet-200 font-mono whitespace-nowrap">
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
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={`${currentLine}-${position}`}
                            initial={{ opacity: 0, y: position === "top" ? -4 : 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-center px-2 py-0.5 rounded max-w-full whitespace-pre-wrap"
                            style={previewSubtitleStyle}
                          >
                            {preview_es}
                          </motion.div>
                        </AnimatePresence>
                        {/* Drag handle */}
                        <div
                          onMouseDown={startDragHandle}
                          className="flex items-center justify-center cursor-grab select-none text-white/20 hover:text-white/55 hover:bg-white/8 px-2 py-0.5 rounded transition-all duration-150"
                          title="Arrastra para posición libre"
                        >
                          <GripHorizontal size={11}/>
                        </div>
                      </div>
                    )
                  )}

                  {/* Preview label */}
                  <div className="absolute top-1.5 left-2">
                    <span className="text-white/18 text-[8px] bg-black/40 px-1.5 py-0.5 rounded">Preview</span>
                  </div>

                  {/* Drag hint when not dragging and in default mode */}
                  {showOverlay && !hasCustomPos && !isDragging && (
                    <div className="absolute bottom-1 right-2">
                      <span className="text-white/15 text-[7px] select-none">arrastra ⠿</span>
                    </div>
                  )}

                  {!showOverlay && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-white/20 text-[10px] flex items-center gap-1.5"><EyeOff size={11}/>Overlay desactivado</p>
                    </div>
                  )}
                </div>

                {/* ── En vivo card ── */}
                <div className={`rounded-xl border overflow-hidden transition-all duration-500 ${
                  autoTranslate && showOverlay
                    ? "border-violet-500/20 bg-violet-500/5"
                    : "border-white/6 bg-white/[0.015]"
                }`}>
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5">
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      {autoTranslate && showOverlay && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60"/>
                      )}
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${autoTranslate && showOverlay ? "bg-violet-400" : "bg-white/20"}`}/>
                    </span>
                    <span className={`text-[9px] uppercase tracking-widest flex-1 ${autoTranslate && showOverlay ? "text-violet-400/80" : "text-white/25"}`} style={{ fontWeight: 600 }}>
                      {autoTranslate && showOverlay ? "En vivo" : "Pausado"}
                    </span>
                    {autoTranslate && showOverlay && (
                      <span className="text-white/22 text-[9px] font-mono tabular-nums">
                        {preview_ts}
                      </span>
                    )}
                  </div>
                  {autoTranslate && showOverlay ? (
                    <div className="px-3 py-2">
                      <AnimatePresence mode="wait">
                        <motion.div key={`${currentLine}-${preview_es.slice(0, 24)}`}
                          initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.2 }}>
                          <p className="text-white/28 text-[9px] truncate mb-0.5 leading-tight">{preview_en}</p>
                          <p className="text-white/85 text-[11.5px] leading-snug" style={{ fontWeight: 500 }}>{preview_es}</p>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  ) : !autoTranslate ? (
                    <div className="px-3 py-2 flex items-center gap-2">
                      <Sparkles size={10} className="text-white/20 shrink-0"/>
                      <p className="text-white/22 text-[10px]">Activa la traducción en Captions</p>
                    </div>
                  ) : (
                    <div className="px-3 py-2 flex items-center gap-2">
                      <EyeOff size={10} className="text-white/20 shrink-0"/>
                      <p className="text-white/22 text-[10px]">Activa el overlay para ver subtítulos</p>
                    </div>
                  )}
                </div>

                {/* ── Overlay master toggle ── */}
                <div className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${showOverlay ? "bg-white/4 border-white/10" : "bg-white/2 border-white/6"}`}>
                  <div>
                    <p className="text-white text-[11px]" style={{ fontWeight: 500 }}>Overlay activo</p>
                    <p className="text-white/28 text-[10px]">Mostrar traducción sobre el video</p>
                  </div>
                  <Switch checked={showOverlay} onCheckedChange={setShowOverlay}
                    className="data-[state=checked]:bg-violet-600 scale-[0.82] shrink-0"/>
                </div>
              </div>

              {/* ── SCROLLABLE CONTROLS — preview always stays above ── */}
              <div className={`flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 transition-opacity duration-300 ${!showOverlay ? "opacity-25 pointer-events-none" : ""}`}>

                {/* Position presets */}
                <div>
                  <SectionLabel>Posición</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: "top"    as const, label: "Arriba",  icon: ArrowUpDown },
                      { id: "center" as const, label: "Centro",  icon: AlignCenter },
                      { id: "bottom" as const, label: "Abajo",   icon: Baseline    },
                    ] as const).map(p => (
                      <button key={p.id} onClick={() => handleSetPosition(p.id)}
                        className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg border text-[10px] tracking-wide transition-all shadow-sm ${
                          position === p.id && !hasCustomPos
                            ? "bg-gradient-to-b from-violet-500/20 to-violet-500/10 border-violet-400/40 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.15)] font-semibold"
                            : "bg-white/5 border-white/5 text-white/40 hover:text-white/70 hover:bg-white/10 hover:border-white/10"
                        }`}>
                        <p.icon size={14}/>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Drag position */}
                <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  hasCustomPos
                    ? "bg-violet-500/8 border-violet-500/20"
                    : "bg-white/3 border-white/7"
                }`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-white/55 text-[11px] flex items-center gap-1.5" style={{ fontWeight: 500 }}>
                      <GripHorizontal size={11} className={hasCustomPos ? "text-violet-400" : "text-white/35"}/>
                      Posición libre
                      {hasCustomPos && (
                        <span className="text-violet-400/70 text-[9px] font-mono ml-1">
                          {customPosX}% · {customPosY}%
                        </span>
                      )}
                    </p>
                    <p className="text-white/25 text-[9.5px] mt-0.5">
                      {hasCustomPos
                        ? "Arrastra el ⠿ en el preview para mover"
                        : "Arrastra el ⠿ en el preview para posición libre"
                      }
                    </p>
                  </div>
                  {hasCustomPos && (
                    <button
                      onClick={resetDragPos}
                      className="flex items-center gap-1 text-[9px] text-white/30 hover:text-amber-400 border border-white/8 hover:border-amber-500/25 px-2 py-1 rounded-lg transition-colors shrink-0 ml-2">
                      <RefreshCcw size={8}/>Resetear
                    </button>
                  )}
                </div>

                {/* Font size */}
                <Card className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[11px] flex items-center gap-1.5"><Type size={10}/>Tamaño de texto</span>
                    <span className="text-violet-400 text-[10px] font-mono bg-violet-500/10 border border-violet-500/15 px-2 py-0.5 rounded">{fontSize[0]}px</span>
                  </div>
                  <Slider value={fontSize} onValueChange={setFontSize} max={48} min={12} step={2}
                    className="[&_[data-slot=track]]:bg-white/10 [&_[data-slot=range]]:bg-violet-500 [&_[data-slot=thumb]]:border-violet-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-3.5 [&_[data-slot=thumb]]:w-3.5"/>
                  <div className="flex items-center justify-between text-[9px] text-white/18 px-0.5">
                    <span>12px</span><span>48px</span>
                  </div>
                </Card>

                {/* Background opacity */}
                <Card className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[11px] flex items-center gap-1.5"><Eye size={10}/>Fondo del subtítulo</span>
                    <span className="text-violet-400 text-[10px] font-mono bg-violet-500/10 border border-violet-500/15 px-2 py-0.5 rounded">{opacity[0]}%</span>
                  </div>
                  <Slider value={opacity} onValueChange={setOpacity} max={100} min={0} step={5}
                    className="[&_[data-slot=track]]:bg-white/10 [&_[data-slot=range]]:bg-violet-500 [&_[data-slot=thumb]]:border-violet-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-3.5 [&_[data-slot=thumb]]:w-3.5"/>
                  <div className="flex items-center justify-between text-[9px] text-white/18 px-0.5">
                    <span>Transparente</span><span>Sólido</span>
                  </div>
                </Card>

                {/* Text shadow */}
                <Card className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[11px] flex items-center gap-1.5"><Sparkles size={10}/>Sombra del texto</span>
                    <span className="text-violet-400 text-[10px] font-mono bg-violet-500/10 border border-violet-500/15 px-2 py-0.5 rounded">{shadowStrength[0]}%</span>
                  </div>
                  <Slider value={shadowStrength} onValueChange={setShadowStrength} max={100} min={0} step={10}
                    className="[&_[data-slot=track]]:bg-white/10 [&_[data-slot=range]]:bg-violet-500 [&_[data-slot=thumb]]:border-violet-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-3.5 [&_[data-slot=thumb]]:w-3.5"/>
                </Card>

                {/* Text color */}
                <div>
                  <SectionLabel>Color del texto</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: "white"  as const, label: "Blanco",   dot: "#ffffff" },
                      { id: "yellow" as const, label: "Amarillo", dot: "#fde047" },
                      { id: "cyan"   as const, label: "Cian",     dot: "#67e8f9" },
                    ]).map(c => (
                      <button key={c.id} onClick={() => setTextColor(c.id)}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[10px] tracking-wide font-medium transition-all shadow-sm ${textColor === c.id ? "bg-white/10 border-white/30 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]" : "bg-white/5 border-white/5 text-white/40 hover:text-white/70 hover:bg-white/10 hover:border-white/10"}`}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: c.dot }}/>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sync offset */}
                <Card className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-400/80 text-[11px] flex items-center gap-1.5"><RotateCcw size={10}/>Sync Offset</span>
                    <span className="text-amber-400 text-[10px] font-mono bg-amber-500/10 border border-amber-500/15 px-2 py-0.5 rounded">
                      {syncOffset[0] >= 0 ? "+" : ""}{syncOffset[0]}ms
                    </span>
                  </div>
                  <Slider value={syncOffset} onValueChange={setSyncOffset} max={2000} min={-2000} step={100}
                    className="[&_[data-slot=track]]:bg-white/10 [&_[data-slot=range]]:bg-amber-500 [&_[data-slot=thumb]]:border-amber-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-3.5 [&_[data-slot=thumb]]:w-3.5"/>
                  <p className="text-white/22 text-[10px] leading-relaxed">
                    Ajusta si los subtítulos van adelantados (+) o atrasados (−).
                  </p>
                  {syncOffset[0] !== 0 && (
                    <button onClick={() => setSyncOffset([0])}
                      className="text-[9px] text-amber-400/60 hover:text-amber-400 flex items-center gap-1 transition-colors">
                      <RefreshCcw size={8}/>Resetear offset
                    </button>
                  )}
                </Card>

                {/* Quick presets */}
                <div>
                  <SectionLabel>Presets rápidos</SectionLabel>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Cine",          action: () => { setFontSize([22]); setOpacity([90]); setTextColor("white");  setShadowStrength([80]); handleSetPosition("bottom"); } },
                      { label: "Mínimal",       action: () => { setFontSize([16]); setOpacity([0]);  setTextColor("yellow"); setShadowStrength([90]); handleSetPosition("bottom"); } },
                      { label: "Alto contraste",action: () => { setFontSize([26]); setOpacity([95]); setTextColor("yellow"); setShadowStrength([0]);  handleSetPosition("bottom"); } },
                      { label: "Por defecto",   action: () => { setFontSize([24]); setOpacity([85]); setTextColor("white");  setShadowStrength([60]); handleSetPosition("bottom"); } },
                    ].map(p => (
                      <button key={p.label} onClick={p.action}
                        className="h-7 rounded-lg bg-white/4 hover:bg-white/7 border border-white/7 hover:border-white/12 text-white/40 hover:text-white/70 text-[10px] transition-all">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-2"/>
              </div>

        </motion.div>

        {/* ════════ DEV ════════ */}
        <motion.div
          animate={{ opacity: activeTab === "dev" ? 1 : 0 }}
          transition={{ duration: 0.14 }}
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
            className="w-full group relative overflow-hidden flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-violet-500/25 bg-violet-500/[0.08] hover:bg-violet-500/[0.14] hover:border-violet-400/35 transition-all duration-200"
          >
            {/* Shimmer */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-violet-400/8 to-transparent pointer-events-none" />

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                <CloudUpload size={12} className="text-violet-400" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-violet-200/90 text-[11px] leading-tight" style={{ fontWeight: 600 }}>
                  Sincronizar en la nube
                </p>
                <p className="text-violet-400/50 text-[9px] mt-0.5 truncate">
                  Tu configuración solo está en este dispositivo
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 text-violet-400/70 group-hover:text-violet-300 transition-colors">
              <LogIn size={11} />
              <span className="text-[10px]" style={{ fontWeight: 600 }}>Login</span>
              <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        </motion.div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className={`relative px-3.5 py-2 border-t shrink-0 flex items-center justify-between ${t("border-white/6 bg-[#161718]","border-black/6 bg-[#f2f1ef]")}`}>

        {/* ── Keyboard shortcuts panel ── */}
        <AnimatePresence>
          {showHotkeys && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className={`absolute bottom-full left-3 right-3 mb-2 backdrop-blur-sm border rounded-xl overflow-hidden shadow-2xl z-50 ${t("bg-[#0d0e0f]/95 border-white/10","bg-[#f8f7f6]/98 border-black/10")}`}
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
                  <p className={`text-[9px] ${t("text-white/18","text-[#6e6b68]/55")}`}>⚙ Triple-click → Dev mode (telemetría SSE)</p>
                  <p className={`text-[9px] ${t("text-white/18","text-[#6e6b68]/55")}`}>Badge de IA → Configurar Gemini API keys</p>
                  <p className={`text-[9px] ${t("text-white/18","text-[#6e6b68]/55")}`}>Overlay tab → arrastra ⠿ para posición libre</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-mono ${t("text-white/16","text-[#6e6b68]/40")}`}>127.0.0.1:8010</span>
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
            <Keyboard size={9} />
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
                <Check size={8}/>Guardado
              </motion.span>
            )}
          </AnimatePresence>
          <span className={t("text-white/10","text-black/15")}>·</span>
          <span className="text-violet-400/40 text-[9px]">v1.0.0</span>
        </div>
      </div>

    </div>
  );
}
