import React, { useState, useRef, useEffect } from "react";
import {
  Settings, Download, Upload, RefreshCcw, CheckCircle2, AlertCircle,
  PlaySquare, Sparkles, Zap, Captions, Layers, GraduationCap, RotateCcw,
  Type, Eye, EyeOff, AlignCenter, FileText,
  Loader2, ArrowUpDown, Baseline, Check, Key, Save, X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { StudyAgentTab } from "./StudyAgentTab";
import { TranslationPipeline } from "./TranslationPipeline";
import { DevTab } from "./DevTab";
import { usePersistedState } from "../hooks/usePersistedState";
import { contentBridge } from "../services/contentBridge";
import { AppLogo } from "./AppLogo";
import { initGeminiKeys, saveGeminiKeys, getConfiguredKeyCount, validateGeminiKey } from "../../gemini-config";
import { checkLocalAIHealth } from "../services/localAI";

type ExtensionSidebarProps = {
  isOpen?: boolean;
  onToggle?: () => void;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-white/22 text-[9px] uppercase tracking-widest mb-2">{children}</p>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-gradient-to-b from-[#18181b] to-[#121214] border border-white/5 shadow-sm rounded-xl p-4 ${className}`}>
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

const MOCK_LINES = [
  { en: "Java is a strongly typed language", es: "Java es un lenguaje fuertemente tipado", ts: "5:01" },
  { en: "The JVM provides platform independence", es: "La JVM proporciona independencia de plataforma", ts: "5:03" },
  { en: "Every Java program starts with a class", es: "Todo programa Java comienza con una clase", ts: "5:07" },
  { en: "The main method is the entry point", es: "El método main es el punto de entrada", ts: "5:10" },
  { en: "Data types can be primitive or reference", es: "Los tipos de datos pueden ser primitivos o de referencia", ts: "5:13" },
];

export function ExtensionSidebar({ isOpen, onToggle }: ExtensionSidebarProps) {
  void isOpen;
  void onToggle;

  const [activeTab, setActiveTab] = useState<"study" | "captions" | "overlay" | "dev">("study");
  const [devMode, setDevMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [geminiKey1, setGeminiKey1] = useState("");
  const [geminiKey2, setGeminiKey2] = useState("");
  const [geminiKeyCount, setGeminiKeyCount] = useState(0);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [validatingKeys, setValidatingKeys] = useState(false);
  const [keyValidationError, setKeyValidationError] = useState<string | null>(null);
  const gearClickRef = useRef<number[]>([]);

  const [autoTranslate, setAutoTranslate] = usePersistedState("captions_auto_translate", true);
  const [captureActive, setCaptureActive] = useState(true);
  const [pasteSrt, setPasteSrt] = useState("");
  const [srtApplied, setSrtApplied] = useState(false);
  const [applyingCopy, setApplyingCopy] = useState(false);
  const [showLiveLines, setShowLiveLines] = useState(true);
  const [currentLine, setCurrentLine] = useState(2);
  const liveRef = useRef<HTMLDivElement>(null);

  const [showOverlay, setShowOverlay] = usePersistedState("overlay_show", true);
  const [fontSize, setFontSize] = usePersistedState<number[]>("overlay_font_size", [24]);
  const [opacity, setOpacity] = usePersistedState<number[]>("overlay_opacity", [85]);
  const [syncOffset, setSyncOffset] = usePersistedState<number[]>("overlay_sync_offset", [0]);
  const [position, setPosition] = usePersistedState<"top" | "center" | "bottom">("overlay_position", "bottom");
  const [textColor, setTextColor] = usePersistedState<"white" | "yellow" | "cyan">("overlay_text_color", "white");
  const [shadowStrength, setShadowStrength] = usePersistedState<number[]>("overlay_shadow", [60]);

  const [contentScriptConnected, setContentScriptConnected] = useState(false);
  const [syncPulse, setSyncPulse] = useState(false);
  const [currentEnLine, setCurrentEnLine] = useState<string | null>(null);
  const [localAIOnline, setLocalAIOnline] = useState<boolean | null>(null);

  useEffect(() => {
    initGeminiKeys().then(() => {
      setGeminiKeyCount(getConfiguredKeyCount());
    });
    checkLocalAIHealth().then(setLocalAIOnline);
    const healthInterval = setInterval(() => {
      checkLocalAIHealth().then(setLocalAIOnline);
    }, 10000);
    return () => clearInterval(healthInterval);
  }, []);

  useEffect(() => {
    const unsub = contentBridge.onMessageFromContent((msg) => {
      if (msg.type === "PONG") setContentScriptConnected(true);
      if (msg.type === "SUBTITLE_LINE_RECEIVED") {
        const payload = msg.payload as { en: string };
        setCurrentEnLine(payload.en);
      }
    });
    const t = setTimeout(() => contentBridge.sendToContent({ type: "PING" }), 600);
    return () => { clearTimeout(t); unsub(); };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      contentBridge.sendToContent({
        type: "OVERLAY_CONFIG_UPDATE",
        payload: {
          visible: showOverlay,
          enabled: showOverlay,
          show: showOverlay,
          fontSize: fontSize[0],
          opacity: opacity[0],
          position,
          tone: textColor,
          textColor,
          shadowStrength: shadowStrength[0],
          offsetMs: syncOffset[0],
          syncOffset: syncOffset[0],
        },
      });
      setSyncPulse(true);
      setTimeout(() => setSyncPulse(false), 1800);
    }, 280);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverlay, fontSize, opacity, position, textColor, shadowStrength, syncOffset]);

  useEffect(() => {
    contentBridge.sendToContent({
      type: "AUTO_TRANSLATE_TOGGLE",
      payload: { active: autoTranslate },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslate]);

  useEffect(() => {
    if (!showLiveLines || !autoTranslate) return;
    const iv = setInterval(() => setCurrentLine(p => (p + 1) % MOCK_LINES.length), 4000);
    return () => clearInterval(iv);
  }, [showLiveLines, autoTranslate]);

  const handleApplySrt = () => {
    if (!pasteSrt.trim()) return;
    setApplyingCopy(true);
    setTimeout(() => { setApplyingCopy(false); setSrtApplied(true); setPasteSrt(""); }, 1200);
  };

  const handleExportSrt = () => {
    const content = MOCK_LINES.map((l, i) => `${i + 1}\n00:05:0${i},000 --> 00:05:0${i + 2},000\n${l.es}\n`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "subtitulos_es.srt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const TEXT_COLORS = { white: "#ffffff", yellow: "#fde047", cyan: "#67e8f9" };
  const preview_es = MOCK_LINES[currentLine]?.es ?? "";

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
    } else if (gearClickRef.current.length === 1) {
      setShowSettings(s => !s);
    }
  };

  const handleSaveGeminiKeys = async () => {
    const keys = [geminiKey1, geminiKey2].filter(Boolean);
    if (!keys.length) return;

    setValidatingKeys(true);
    setKeyValidationError(null);

    for (const key of keys) {
      const result = await validateGeminiKey(key);
      if (!result.valid) {
        setValidatingKeys(false);
        setKeyValidationError(result.error || 'Key inválida.');
        return;
      }
    }

    await saveGeminiKeys(keys);
    setGeminiKeyCount(getConfiguredKeyCount());
    setValidatingKeys(false);
    setSettingsSaved(true);
    setGeminiKey1("");
    setGeminiKey2("");
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const tabs = [
    { id: "study"    as const, label: "Study",   icon: GraduationCap, ping: true  },
    { id: "captions" as const, label: "Captions", icon: Captions,      ping: false },
    { id: "overlay"  as const, label: "Overlay",  icon: Layers,        ping: false },
    { id: "dev"      as const, label: "Dev",      icon: Settings,      ping: false },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-[#1a1b1d]">
      <div className="px-4 py-3 border-b border-white/5 shrink-0 bg-[#121214]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLogo size={32} />
            <div>
              <h1 className="text-white text-xs leading-tight tracking-wide" style={{ fontWeight: 600 }}>
                Subtitle Bridge
              </h1>
              <p className="text-white/40 text-[9px] leading-none mt-1 font-medium tracking-wider uppercase">EN → ES · {localAIOnline ? 'AI Local' : geminiKeyCount > 0 ? 'Gemini' : 'Sin conexión'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 ${localAIOnline ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'} border rounded-full px-2.5 py-1`}>
              <span className="relative flex h-1.5 w-1.5">
                {localAIOnline ? (
                  <><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_5px_#10b981]"/></>
                ) : (
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500 shadow-[0_0_5px_#ef4444]"/>
                )}
              </span>
              <span className={`text-[10px] font-medium tracking-wide ${localAIOnline ? 'text-emerald-400' : 'text-red-400'}`}>{localAIOnline ? '8010' : 'Gemini'}</span>
            </div>
            <button
              onClick={handleGearClick}
              title="Triple-click para activar Dev mode"
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-300 ${devMode ? "text-amber-400 bg-amber-500/10 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]" : "text-white/30 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10"}`}>
              <motion.div
                animate={devMode ? { rotate: 360 } : { rotate: 0 }}
                transition={devMode
                  ? { duration: 8, repeat: Infinity, ease: "linear" }
                  : { duration: 0.4, ease: "easeOut" }
                }
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Settings size={14} />
              </motion.div>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            key="settings-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-b border-white/5 bg-[#0f1012]"
          >
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Key size={11} className="text-violet-400" />
                  <span className="text-white/55 text-[11px]" style={{ fontWeight: 600 }}>Gemini API Keys</span>
                  {geminiKeyCount > 0 && (
                    <span className="text-[9px] text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">
                      {geminiKeyCount} {geminiKeyCount === 1 ? "key" : "keys"}
                    </span>
                  )}
                </div>
                <button onClick={() => setShowSettings(false)} className="text-white/30 hover:text-white/60 transition-colors">
                  <X size={12} />
                </button>
              </div>
              <div className="space-y-2">
                <input
                  type="password"
                  value={geminiKey1}
                  onChange={e => setGeminiKey1(e.target.value)}
                  placeholder="API Key 1 (principal)"
                  className="w-full h-7 rounded-lg bg-black/30 border border-white/8 text-white/70 text-[10px] px-2.5 placeholder:text-white/20 focus:border-violet-500/30 outline-none"
                />
                <input
                  type="password"
                  value={geminiKey2}
                  onChange={e => setGeminiKey2(e.target.value)}
                  placeholder="API Key 2 (fallback, opcional)"
                  className="w-full h-7 rounded-lg bg-black/30 border border-white/8 text-white/70 text-[10px] px-2.5 placeholder:text-white/20 focus:border-violet-500/30 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveGeminiKeys}
                  disabled={(!geminiKey1.trim() && !geminiKey2.trim()) || validatingKeys}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] transition-all"
                >
                  {validatingKeys ? <><Loader2 size={10} className="animate-spin" />Validando...</> : <><Save size={10} />Guardar keys</>}
                </button>
                <AnimatePresence>
                  {settingsSaved && (
                    <motion.span
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-emerald-400 text-[10px] flex items-center gap-1"
                    >
                      <CheckCircle2 size={10} />Guardado
                    </motion.span>
                  )}
                  {keyValidationError && (
                    <motion.span
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-red-400 text-[10px] flex items-center gap-1"
                    >
                      <AlertCircle size={10} />{keyValidationError}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-white/20 text-[9px] leading-relaxed">
                Las keys se guardan en chrome.storage.local y se usan para traducción y Study Agent.
                Clic triple en ⚙ para Dev mode.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex shrink-0 p-1.5 gap-1 bg-[#121214] border-b border-white/5 relative z-10">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg text-[10px] transition-colors z-10 ${active ? "text-white" : "text-white/40 hover:text-white/70 hover:bg-white/5"}`}>
              {active && (
                <motion.div
                  layoutId="activeTabBg"
                  className="absolute inset-0 bg-white/10 border border-white/10 rounded-lg"
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

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <AnimatePresence>
          {activeTab === "study" && (
            <motion.div key="study" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="flex-1 min-h-0 flex flex-col">
              <StudyAgentTab />
            </motion.div>
          )}

          {activeTab === "captions" && (
            <motion.div key="captions" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <PlaySquare size={11} className="text-violet-400"/>
                    <span className="text-white/55 text-[11px]" style={{ fontWeight: 600 }}>Estado en vivo</span>
                  </div>
                  <button onClick={() => {}} className="flex items-center gap-1 text-[9px] text-white/25 hover:text-white/50 border border-white/8 px-1.5 py-0.5 rounded transition-colors">
                    <RefreshCcw size={8}/>Refresh
                  </button>
                </div>
                <div className="divide-y divide-white/5">
                  <StatusRow label="Subtítulos ES nativos" status="No disponible" ok={false}/>
                  <StatusRow label="Subtítulos EN capturados" status="248 líneas" ok={true} pulse/>
                  <StatusRow label="API local (8010)" status="Conectada" ok={true} pulse/>
                  <StatusRow label="Traducción activa" status={autoTranslate ? "En curso" : "Pausada"} ok={autoTranslate}/>
                  <StatusRow label="Content script" status={contentScriptConnected ? "Activo" : "Esperando…"} ok={contentScriptConnected} pulse={contentScriptConnected}/>
                </div>
              </Card>

              <div className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${autoTranslate ? "bg-violet-600/10 border-violet-500/22" : "bg-white/3 border-white/7"}`}>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles size={11} className={autoTranslate ? "text-violet-400" : "text-white/30"}/>
                    <span className="text-white text-[11px]" style={{ fontWeight: 500 }}>Auto EN → ES</span>
                  </div>
                  <p className="text-white/30 text-[10px]">Traducción en tiempo real · IA local</p>
                </div>
                <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate} className="data-[state=checked]:bg-violet-600 scale-[0.82] shrink-0"/>
              </div>

              <TranslationPipeline incomingLine={currentEnLine} autoTranslate={autoTranslate} />

              <div className="space-y-2">
                <SectionLabel>Gestión SRT</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleExportSrt} className="flex items-center justify-center gap-1.5 h-8 rounded-lg bg-white/4 hover:bg-white/7 border border-white/8 hover:border-white/14 text-white/45 hover:text-white/75 text-[10px] transition-all">
                    <Download size={11}/>Export EN
                  </button>
                  <button className="flex items-center justify-center gap-1.5 h-8 rounded-lg bg-white/4 hover:bg-white/7 border border-white/8 hover:border-white/14 text-white/45 hover:text-white/75 text-[10px] transition-all">
                    <Upload size={11}/>Import ES
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <SectionLabel>Pegar SRT en español</SectionLabel>
                <div className="bg-[#0f1012] border border-white/7 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/5">
                    <FileText size={10} className="text-white/25"/>
                    <span className="text-white/25 text-[9px]">Formato SRT estándar</span>
                  </div>
                  <textarea value={pasteSrt} onChange={e => { setPasteSrt(e.target.value); setSrtApplied(false); }} placeholder={"1\n00:00:00,000 --> 00:00:02,000\nHola a todos…"} className="w-full h-[68px] text-[10px] font-mono bg-transparent text-white/60 placeholder:text-white/15 p-2.5 resize-none outline-none leading-relaxed"/>
                </div>
                <AnimatePresence mode="wait">
                  {srtApplied ? (
                    <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-8 rounded-lg bg-emerald-700/40 border border-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center gap-1.5">
                      <CheckCircle2 size={11}/>SRT aplicado correctamente
                    </motion.div>
                  ) : (
                    <motion.button key="btn" onClick={handleApplySrt} disabled={!pasteSrt.trim() || applyingCopy} className="w-full h-8 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-25 disabled:cursor-not-allowed text-white text-[10px] flex items-center justify-center gap-1.5 transition-all">
                      {applyingCopy ? <><Loader2 size={10} className="animate-spin"/>Aplicando…</> : <>Aplicar SRT</>}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>

              <div className="h-2"/>
            </motion.div>
          )}

          {activeTab === "overlay" && (
            <motion.div key="overlay" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              <div className="rounded-xl overflow-hidden border border-white/8 bg-[#0a0a0c]" style={{ aspectRatio: "16/9", position: "relative" }}>
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-[#0a0a0c]"/>
                <div className="absolute inset-0 flex items-center justify-center opacity-20">
                  <div className="text-[7px] font-mono text-emerald-400 leading-relaxed text-left px-4">
                    {`public class JVM {\n  public static void main\n    (String[] args) {\n    System.out.println\n      ("Hello World");\n  }\n}`}
                  </div>
                </div>
                {showOverlay && (
                  <div className={`absolute left-0 right-0 px-4 flex justify-center ${position === "top" ? "top-2" : position === "center" ? "top-1/2 -translate-y-1/2" : "bottom-3"}`}>
                    <AnimatePresence mode="wait">
                      <motion.div key={currentLine} initial={{ opacity: 0, y: position === "top" ? -4 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="text-center px-2.5 py-1 rounded-md max-w-full" style={{ backgroundColor: `rgba(0,0,0,${opacity[0]/100})`, fontSize: `${Math.max(7, fontSize[0] * 0.38)}px`, color: TEXT_COLORS[textColor], textShadow: shadowStrength[0] > 0 ? `0 1px ${Math.round(shadowStrength[0]/20)}px rgba(0,0,0,${shadowStrength[0]/100})` : "none", lineHeight: 1.4 }}>
                        {preview_es}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}
                <div className="absolute top-1.5 left-2"><span className="text-white/20 text-[8px] bg-black/40 px-1.5 py-0.5 rounded">Preview</span></div>
                {!showOverlay && <div className="absolute inset-0 flex items-center justify-center"><p className="text-white/20 text-[10px] flex items-center gap-1.5"><EyeOff size={11}/>Overlay desactivado</p></div>}
              </div>

              <div className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${showOverlay ? "bg-white/4 border-white/10" : "bg-white/2 border-white/6"}`}>
                <div>
                  <p className="text-white text-[11px]" style={{ fontWeight: 500 }}>Overlay activo</p>
                  <p className="text-white/28 text-[10px]">Mostrar traducción sobre el video</p>
                </div>
                <Switch checked={showOverlay} onCheckedChange={setShowOverlay} className="data-[state=checked]:bg-violet-600 scale-[0.82] shrink-0"/>
              </div>

              <div className={`space-y-3 transition-opacity duration-300 ${!showOverlay ? "opacity-25 pointer-events-none" : ""}`}>
                <div>
                  <SectionLabel>Posición</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id:"top"    as const, label:"Arriba",  icon: ArrowUpDown },
                      { id:"center" as const, label:"Centro",  icon: AlignCenter },
                      { id:"bottom" as const, label:"Abajo",   icon: Baseline    },
                    ] as const).map(p => (
                      <button key={p.id} onClick={() => setPosition(p.id)} className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg border text-[10px] tracking-wide transition-all shadow-sm ${position === p.id ? "bg-gradient-to-b from-violet-500/20 to-violet-500/10 border-violet-400/40 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.15)] font-semibold" : "bg-white/5 border-white/5 text-white/40 hover:text-white/70 hover:bg-white/10 hover:border-white/10"}`}>
                        <p.icon size={14}/>{p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Card className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[11px] flex items-center gap-1.5"><Type size={10}/>Tamaño de texto</span>
                    <span className="text-violet-400 text-[10px] font-mono bg-violet-500/10 border border-violet-500/15 px-2 py-0.5 rounded">{fontSize[0]}px</span>
                  </div>
                  <Slider value={fontSize} onValueChange={setFontSize} max={48} min={12} step={2} className="[&_[data-slot=track]]:bg-white/10 [&_[data-slot=range]]:bg-violet-500 [&_[data-slot=thumb]]:border-violet-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-3.5 [&_[data-slot=thumb]]:w-3.5"/>
                  <div className="flex items-center justify-between text-[9px] text-white/18 px-0.5"><span>12px</span><span>48px</span></div>
                </Card>

                <Card className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[11px] flex items-center gap-1.5"><Eye size={10}/>Fondo del subtítulo</span>
                    <span className="text-violet-400 text-[10px] font-mono bg-violet-500/10 border border-violet-500/15 px-2 py-0.5 rounded">{opacity[0]}%</span>
                  </div>
                  <Slider value={opacity} onValueChange={setOpacity} max={100} min={0} step={5} className="[&_[data-slot=track]]:bg-white/10 [&_[data-slot=range]]:bg-violet-500 [&_[data-slot=thumb]]:border-violet-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-3.5 [&_[data-slot=thumb]]:w-3.5"/>
                  <div className="flex items-center justify-between text-[9px] text-white/18 px-0.5"><span>Transparente</span><span>Sólido</span></div>
                </Card>

                <Card className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-[11px] flex items-center gap-1.5"><Sparkles size={10}/>Sombra del texto</span>
                    <span className="text-violet-400 text-[10px] font-mono bg-violet-500/10 border border-violet-500/15 px-2 py-0.5 rounded">{shadowStrength[0]}%</span>
                  </div>
                  <Slider value={shadowStrength} onValueChange={setShadowStrength} max={100} min={0} step={10} className="[&_[data-slot=track]]:bg-white/10 [&_[data-slot=range]]:bg-violet-500 [&_[data-slot=thumb]]:border-violet-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-3.5 [&_[data-slot=thumb]]:w-3.5"/>
                </Card>

                <div>
                  <SectionLabel>Color del texto</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: "white"  as const, label: "Blanco", dot: "#ffffff" },
                      { id: "yellow" as const, label: "Amarillo", dot: "#fde047" },
                      { id: "cyan"   as const, label: "Cian", dot: "#67e8f9" },
                    ]).map(c => (
                      <button key={c.id} onClick={() => setTextColor(c.id)} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-[10px] tracking-wide font-medium transition-all shadow-sm ${textColor === c.id ? "bg-white/10 border-white/30 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]" : "bg-white/5 border-white/5 text-white/40 hover:text-white/70 hover:bg-white/10 hover:border-white/10"}`}>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: c.dot }}/>{c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/3 border border-white/7 rounded-xl">
                  <div>
                    <p className="text-white/55 text-[11px]" style={{ fontWeight: 500 }}>Posición del overlay</p>
                    <p className="text-white/25 text-[10px]">Arrastra el handle ═══ en el video para mover</p>
                  </div>
                  <button onClick={() => contentBridge.sendToContent({ type: "OVERLAY_RESET_POSITION" })} className="flex items-center gap-1 text-[9px] text-white/30 hover:text-amber-400 border border-white/8 hover:border-amber-500/25 px-2 py-1 rounded-lg transition-colors shrink-0 ml-2">
                    <RotateCcw size={8}/>Reset
                  </button>
                </div>

                <Card className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-400/80 text-[11px] flex items-center gap-1.5"><RotateCcw size={10}/>Sync Offset</span>
                    <span className="text-amber-400 text-[10px] font-mono bg-amber-500/10 border border-amber-500/15 px-2 py-0.5 rounded">{syncOffset[0] >= 0 ? "+" : ""}{syncOffset[0]}ms</span>
                  </div>
                  <Slider value={syncOffset} onValueChange={setSyncOffset} max={2000} min={-2000} step={100} className="[&_[data-slot=track]]:bg-white/10 [&_[data-slot=range]]:bg-amber-500 [&_[data-slot=thumb]]:border-amber-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-3.5 [&_[data-slot=thumb]]:w-3.5"/>
                  <p className="text-white/22 text-[10px] leading-relaxed">Ajusta si los subtítulos van adelantados (+) o atrasados (−).</p>
                  {syncOffset[0] !== 0 && (
                    <button onClick={() => setSyncOffset([0])} className="text-[9px] text-amber-400/60 hover:text-amber-400 flex items-center gap-1 transition-colors">
                      <RefreshCcw size={8}/>Resetear offset
                    </button>
                  )}
                </Card>

                <div>
                  <SectionLabel>Presets rápidos</SectionLabel>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Cine", action: () => { setFontSize([22]); setOpacity([90]); setTextColor("white");  setShadowStrength([80]); setPosition("bottom"); } },
                      { label: "Mínimal", action: () => { setFontSize([16]); setOpacity([0]);  setTextColor("yellow"); setShadowStrength([90]); setPosition("bottom"); } },
                      { label: "Alto contraste", action: () => { setFontSize([26]); setOpacity([95]); setTextColor("yellow"); setShadowStrength([0]); setPosition("bottom"); } },
                      { label: "Por defecto", action: () => { setFontSize([24]); setOpacity([85]); setTextColor("white");  setShadowStrength([60]); setPosition("bottom"); } },
                    ].map(p => (
                      <button key={p.label} onClick={p.action} className="h-7 rounded-lg bg-white/4 hover:bg-white/7 border border-white/7 hover:border-white/12 text-white/40 hover:text-white/70 text-[10px] transition-all">{p.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="h-2"/>
            </motion.div>
          )}

          {activeTab === "dev" && (
            <motion.div key="dev" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <DevTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-3.5 py-2 border-t border-white/6 bg-[#161718] shrink-0 flex items-center justify-between">
        <span className={`text-[9px] font-mono ${localAIOnline ? 'text-emerald-400/30' : 'text-red-400/30'}`}>{localAIOnline ? '127.0.0.1:8010' : 'Gemini API'}</span>
        <div className="flex items-center gap-1.5">
          <AnimatePresence>
            {syncPulse && (
              <motion.span key="synced" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.2 }} className="flex items-center gap-1 text-emerald-400 text-[9px]">
                <Check size={8}/>Guardado
              </motion.span>
            )}
          </AnimatePresence>
          <span className="text-white/10">·</span>
          <span className="text-violet-400/40 text-[9px]">v1.0.0</span>
        </div>
      </div>
    </div>
  );
}
