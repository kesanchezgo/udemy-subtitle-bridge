import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  Settings,
  Maximize,
  SkipForward,
  SkipBack,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  CheckSquare,
  Lock,
  PlayCircle,
  FileText,
  MessageSquare,
  BookOpen,
  Search,
  Bell,
  Globe,
  ShoppingCart,
  Camera,
  BrainCircuit,
  Rocket,
} from "lucide-react";
import { Toaster } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { AppLogo } from "./components/AppLogo";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { contentBridge, type OverlayConfig } from "./services/contentBridge";
import { useHotkeys } from "./hooks/useHotkeys";
import { toast } from "sonner";
import { CelebrationOverlay } from "./components/CelebrationOverlay";
import { InPageDock } from "./components/InPageDock";
import { Session } from "@supabase/supabase-js";

// ── Statics ───────────────────────────────────────────────────────────────────
const COURSE_VIDEO_IMG =
  "https://images.unsplash.com/photo-1664570000007-db164768644d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxqYXZhJTIwcHJvZ3JhbW1pbmclMjBjb2RlJTIwc2NyZWVufGVufDF8fHx8MTc3NzkyNjczMnww&ixlib=rb-4.1.0&q=80&w=1080";

const curriculum = [
  {
    section: "1. Course Introduction",
    duration: "45min",
    lessons: [
      { title: "Welcome to the Course",   duration: "4:12",         type: "video", locked: false },
      { title: "Course Resources",        duration: "2:45",         type: "video", locked: false },
    ],
  },
  {
    section: "2. Java Core Concepts",
    duration: "3h 15min",
    lessons: [
      { title: "What is Java & JVM?",     duration: "8:30",  type: "video", locked: false },
      { title: "Data Types & Variables",  duration: "12:20", type: "video", locked: false },
      { title: "Operators & Expressions", duration: "9:15",  type: "video", locked: false },
      { title: "Control Flow",            duration: "15:40", type: "video", locked: false },
      { title: "Quiz: Core Concepts",     duration: "10 questions", type: "quiz", locked: false },
    ],
  },
  {
    section: "3. Object-Oriented Programming",
    duration: "5h 20min",
    lessons: [
      { title: "Classes & Objects", duration: "18:00", type: "video", locked: false },
      { title: "Inheritance",       duration: "22:15", type: "video", locked: true  },
      { title: "Polymorphism",      duration: "19:30", type: "video", locked: true  },
    ],
  },
  {
    section: "4. Collections & Generics",
    duration: "4h 10min",
    lessons: [
      { title: "ArrayList & LinkedList", duration: "20:10", type: "video", locked: true },
    ],
  },
];

function getFlatIdx(sectionIdx: number, lessonIdx: number): number {
  let count = 0;
  for (let s = 0; s < curriculum.length; s++) {
    if (s === sectionIdx) return count + lessonIdx;
    count += curriculum[s].lessons.length;
  }
  return 0;
}

const subtitleLines = [
  "Java is a high-level, object-oriented programming language",
  "desarrollado por Sun Microsystems en 1995",
  "que sigue el principio 'Write Once, Run Anywhere'",
  "The JVM (Java Virtual Machine) is what makes this possible",
];

const TEXT_COLORS_MAP: Record<string, string> = {
  white: "#ffffff",
  yellow: "#fde047",
  cyan: "#67e8f9",
};

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeBottomTab,   setActiveBottomTab]   = useState("overview");
  const [expandedSections,  setExpandedSections]  = useState<Record<number, boolean>>({ 0: true, 1: true });
  const [isPlaying,         setIsPlaying]         = useState(false);
  const [progress,          setProgress]          = useState(38);
  const [currentSubtitle,   setCurrentSubtitle]   = useState(0);
  const [volume,            setVolume]            = useState(85);

  const [currentLesson, setCurrentLesson] = useState({ sectionIdx: 1, lessonIdx: 0 });
  const lessonRefs = useRef<Map<string, HTMLElement>>(new Map());
  const currentFlatIdx = getFlatIdx(currentLesson.sectionIdx, currentLesson.lessonIdx);

  useEffect(() => {
    setExpandedSections(prev => ({ ...prev, [currentLesson.sectionIdx]: true }));
  }, [currentLesson.sectionIdx]);

  useEffect(() => {
    const key = `${currentLesson.sectionIdx}-${currentLesson.lessonIdx}`;
    const el  = lessonRefs.current.get(key);
    if (!el) return;
    const timer = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, activeBottomTab === "overview" ? 230 : 0);
    return () => clearTimeout(timer);
  }, [currentLesson, activeBottomTab]);

  const handleSelectLesson = useCallback((sectionIdx: number, lessonIdx: number) => {
    setCurrentLesson({ sectionIdx, lessonIdx });
    setActiveBottomTab("overview");
  }, []);

  const [appSession, setAppSession] = useState<Session | null | undefined>(undefined);

  useHotkeys({
    "alt+p": () => {
      setIsPlaying(prev => !prev);
      toast(isPlaying ? "Video pausado" : "Video reanudado", {
        icon: isPlaying
          ? <Pause className="text-violet-400" size={18} />
          : <Play  className="text-violet-400" size={18} />,
      });
    },
    "alt+c": () => {
      toast.success("Captura de pantalla guardada en notas", {
        icon: (
          <div className="p-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
            <Camera className="text-emerald-400 w-4 h-4" />
          </div>
        ),
      });
    },
    "alt+s": () => {
      toast("Agente de estudio abierto", {
        icon: <BrainCircuit className="text-violet-400" size={18} />,
      });
    },
  });

  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>({
    show: true,
    fontSize: 24,
    opacity: 85,
    position: "bottom",
    textColor: "white",
    shadowStrength: 60,
    syncOffset: 0,
  });
  const [autoTranslateActive, setAutoTranslateActive] = useState(true);
  const [contentScriptReady,  setContentScriptReady]  = useState(false);

  useEffect(() => {
    setTimeout(() => {
      toast.success("Subtitle Bridge activado", {
        description: "Dock inyectado con Shadow DOM · Listo para traducir.",
        icon: (
          <div className="p-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 shadow-[0_0_12px_rgba(139,92,246,0.2)]">
            <Rocket className="text-violet-400 w-4 h-4" />
          </div>
        ),
      });
    }, 800);

    setContentScriptReady(true);
    return contentBridge.onMessageFromSidebar((msg) => {
      if (msg.type === "PING") {
        setTimeout(() => contentBridge.sendToSidebar({ type: "PONG" }), 150);
      }
      if (msg.type === "OVERLAY_CONFIG_UPDATE") {
        setOverlayConfig(prev => ({ ...prev, ...(msg.payload as Partial<OverlayConfig>) }));
      }
      if (msg.type === "AUTO_TRANSLATE_TOGGLE") {
        const p = msg.payload as { active: boolean };
        setAutoTranslateActive(p.active);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!contentScriptReady) return;
    contentBridge.sendToSidebar({
      type: "SUBTITLE_LINE_RECEIVED",
      payload: { en: subtitleLines[currentSubtitle], ts: Date.now() },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSubtitle, contentScriptReady]);

  useEffect(() => {
    const iv = setInterval(() => {
      setCurrentSubtitle(p => (p + 1) % subtitleLines.length);
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const toggleSection = (idx: number) =>
    setExpandedSections(p => ({ ...p, [idx]: !p[idx] }));

  const bottomTabs = [
    { id: "overview",  label: "Overview",      icon: BookOpen    },
    { id: "qa",        label: "Q&A",           icon: MessageSquare },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#1c1d1f] overflow-hidden">
      <Toaster
        theme="dark"
        position="bottom-center"
        expand={false}
        gap={8}
        toastOptions={{
          duration: 3500,
          style: {
            background:       "rgba(17, 18, 24, 0.45)",
            border:           "1px solid rgba(255, 255, 255, 0.08)",
            color:            "#ffffff",
            borderRadius:     "16px",
            padding:          "14px 18px",
            fontSize:         "13.5px",
            backdropFilter:   "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow:        "0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 0 20px rgba(139,92,246,0.05)",
            maxWidth:         "360px",
          },
        }}
      />
      <CelebrationOverlay />

      {/* ═══ UDEMY NAVBAR ═══ */}
      <header className="h-12 bg-[#1c1d1f] border-b border-white/10 flex items-center px-4 gap-4 shrink-0 z-40">
        <div className="flex items-center gap-1 shrink-0">
          <svg viewBox="0 0 91 32" className="h-5" fill="white">
            <path d="M10.578 0L0 18.284l10.578 13.467 10.577-13.467z" fill="#A435F0" />
            <path d="M10.578 31.751l10.577-13.467H0z" fill="#6A0DAD" />
            <text x="26" y="24" fontSize="22" fontWeight="700" fill="white" fontFamily="Arial">udemy</text>
          </svg>
        </div>

        <div className="hidden lg:flex items-center gap-1 text-white/80 text-xs cursor-pointer hover:text-white transition-colors">
          <span>Categories</span>
          <ChevronDown size={13} />
        </div>

        <div className="flex-1 max-w-lg hidden md:block">
          <div className="flex items-center bg-white/8 border border-white/15 rounded-full h-8 px-3 gap-2">
            <Search size={13} className="text-white/40" />
            <span className="text-white/30 text-xs">Search for anything</span>
          </div>
        </div>

        <div className="hidden xl:block flex-1 text-white/70 text-xs truncate max-w-xs">
          Java In-Depth: Become a Complete Java Engineer!
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button className="hidden md:flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors">
            <Globe size={14} />
          </button>
          <button className="text-white/70 hover:text-white transition-colors">
            <Bell size={16} />
          </button>
          <button className="text-white/70 hover:text-white transition-colors">
            <ShoppingCart size={16} />
          </button>
          <div className="w-7 h-7 rounded-full bg-[#a435f0] flex items-center justify-center text-white text-xs shrink-0">
            K
          </div>
        </div>
      </header>

      {/* ═══ MAIN LAYOUT ═══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Udemy video + course content ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Video Player */}
          <div
            className="relative bg-black flex-shrink-0"
            style={{ aspectRatio: "16/9", maxHeight: "calc(100vh - 48px - 200px)" }}
          >
            <ImageWithFallback
              src={COURSE_VIDEO_IMG}
              alt="Course video"
              className="w-full h-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-black/50" />

            {overlayConfig.show && autoTranslateActive && (
              <div
                className={`absolute left-0 right-0 px-6 flex justify-center pointer-events-none transition-all duration-300 ${
                  overlayConfig.position === "top"
                    ? "top-12"
                    : overlayConfig.position === "center"
                    ? "top-1/2 -translate-y-1/2"
                    : "bottom-14"
                }`}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentSubtitle}
                    initial={{ opacity: 0, y: overlayConfig.position === "top" ? -6 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-center"
                  >
                    <span
                      className="inline-block rounded px-3 py-1 leading-snug transition-all duration-300"
                      style={{
                        backgroundColor: `rgba(0,0,0,${overlayConfig.opacity / 100})`,
                        color: TEXT_COLORS_MAP[overlayConfig.textColor] ?? "#ffffff",
                        fontSize: `${overlayConfig.fontSize}px`,
                        textShadow:
                          overlayConfig.shadowStrength > 0
                            ? `0 1px ${Math.round(overlayConfig.shadowStrength / 20)}px rgba(0,0,0,${overlayConfig.shadowStrength / 100})`
                            : "none",
                      }}
                    >
                      {subtitleLines[currentSubtitle]}
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}

            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-white/12 rounded-full px-2.5 py-1 text-white text-[10px] shadow-lg">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-200" />
              </span>
              <AppLogo size={10} iconOnly={true} />
              content_script · Shadow DOM activo
            </div>

            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-violet-600/80 backdrop-blur-sm border border-violet-400/30 rounded-full px-2.5 py-1 text-white text-[10px] shadow-lg">
              <span className="text-[9px] opacity-70">⟼</span>
              Dock inyectado
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition-all hover:scale-105"
              >
                {isPlaying
                  ? <Pause size={22} />
                  : <Play  size={22} className="translate-x-0.5" />
                }
              </button>
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent pt-6 pb-2 px-3">
              <div className="mb-2 group cursor-pointer">
                <div className="h-1 group-hover:h-1.5 transition-all bg-white/20 rounded-full">
                  <div className="h-full bg-[#a435f0] rounded-full relative" style={{ width: `${progress}%` }}>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#a435f0] rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsPlaying(!isPlaying)} className="text-white hover:text-white/80 transition-colors">
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button className="text-white/70 hover:text-white transition-colors"><SkipBack    size={14} /></button>
                  <button className="text-white/70 hover:text-white transition-colors"><SkipForward size={14} /></button>
                  <div className="flex items-center gap-1.5 group">
                    <Volume2 size={14} className="text-white/70" />
                    <div className="w-16 h-1 bg-white/20 rounded-full cursor-pointer hidden group-hover:block">
                      <div className="h-full bg-white rounded-full" style={{ width: `${volume}%` }} />
                    </div>
                  </div>
                  <span className="text-white/60 text-[10px] font-mono">5:03 / 6:51</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-white/60 hover:text-white text-[10px] border border-white/20 px-1.5 py-0.5 rounded transition-colors">1x</button>
                  <button className="text-white/60 hover:text-white transition-colors"><Settings size={14} /></button>
                  <button className="text-white/60 hover:text-white transition-colors"><Maximize  size={14} /></button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom content area ── */}
          <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
            {/* Course title bar */}
            <div className="bg-[#1c1d1f] px-5 py-3 border-b border-white/8">
              <h1 className="text-white text-sm" style={{ fontWeight: 600 }}>
                Java In-Depth: Become a Complete Java Engineer! [2026]
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <span className="text-[#f69c08] text-xs">★★★★★</span>
                  <span className="text-white/50 text-[11px]">4.5 (25,010 ratings)</span>
                </div>
                <span className="text-white/30 text-xs">·</span>
                <span className="text-white/50 text-[11px] flex items-center gap-1"><Users size={11} /> 142,117</span>
                <span className="text-white/30 text-xs">·</span>
                <span className="text-white/50 text-[11px] flex items-center gap-1"><Clock size={11} /> 85.5h</span>
              </div>
            </div>

            {/* Bottom Tabs */}
            <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
              {bottomTabs.map(tab => {
                const Icon     = tab.icon;
                const isActive = activeBottomTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveBottomTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs border-b-2 transition-all ${
                      isActive
                        ? "border-[#1c1d1f] text-[#1c1d1f]"
                        : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    <Icon size={13} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="p-5">
              {activeBottomTab === "overview" && (
                <div className="space-y-4 max-w-2xl">
                  <div>
                    <h3 className="text-base text-gray-900 mb-2" style={{ fontWeight: 600 }}>About this course</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Java Programming Bootcamp with Spring Boot, Best Practices, Design Rules & Spring Boot Project — Updated for Java 25. This comprehensive course will take you from zero to expert in Java development.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ["85.5 total hours",      Clock      ],
                      ["142,117 students",       Users      ],
                      ["Certificate of completion", CheckSquare],
                      ["Full lifetime access",   Globe      ],
                    ] as const).map(([text, Icon]: any) => (
                      <div key={text} className="flex items-center gap-2 text-xs text-gray-600">
                        <Icon size={14} className="text-gray-400 shrink-0" />
                        {text}
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="text-sm text-gray-900 mb-3 mt-4" style={{ fontWeight: 600 }}>Course content</h3>
                    <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                      {curriculum.map((section, sIdx) => (
                        <div key={sIdx}>
                          <button
                            onClick={() => toggleSection(sIdx)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
                          >
                            <span className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{section.section}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-gray-400">{section.duration}</span>
                              {expandedSections[sIdx] ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
                            </div>
                          </button>
                          {expandedSections[sIdx] && (
                            <div className="divide-y divide-gray-50">
                              {section.lessons.map((lesson, lIdx) => {
                                const isActive = currentLesson.sectionIdx === sIdx && currentLesson.lessonIdx === lIdx;
                                return (
                                  <button
                                    key={lIdx}
                                    ref={el => { if (el) lessonRefs.current.set(`${sIdx}-${lIdx}`, el as HTMLElement); }}
                                    onClick={() => !lesson.locked && handleSelectLesson(sIdx, lIdx)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-violet-50" : "hover:bg-gray-50"} ${lesson.locked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                                  >
                                    {lesson.locked
                                      ? <Lock size={12} className="text-gray-400 shrink-0" />
                                      : lesson.type === "quiz"
                                      ? <FileText size={12} className="text-amber-500 shrink-0" />
                                      : <PlayCircle size={12} className={isActive ? "text-violet-500" : "text-gray-400"} />}
                                    <span className={`text-xs flex-1 ${isActive ? "text-violet-700" : "text-gray-600"}`} style={{ fontWeight: isActive ? 600 : 400 }}>{lesson.title}</span>
                                    <span className="text-xs text-gray-400 font-mono shrink-0">{lesson.duration}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeBottomTab === "qa" && (
                <div className="text-sm text-gray-500 text-center py-8">
                  <MessageSquare size={32} className="mx-auto mb-3 text-gray-300" />
                  <p>No questions yet. Be the first to ask!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ IN-PAGE DOCK (Shadow DOM simulation) ═══ */}
        <InPageDock
          onSessionResolved={setAppSession}
          localAiConnected={true}
        />
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.20); }
      `}</style>
    </div>
  );
}