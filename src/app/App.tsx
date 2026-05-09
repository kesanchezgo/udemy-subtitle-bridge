import React, { useState, useEffect, useRef, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
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
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { AppLogo } from "./components/AppLogo";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";
import { contentBridge, type OverlayConfig } from "./services/contentBridge";
import { useHotkeys } from "./hooks/useHotkeys";
import { CelebrationOverlay } from "./components/CelebrationOverlay";
import { InPageDock } from "./components/InPageDock";

const COURSE_VIDEO_IMG =
  "https://images.unsplash.com/photo-1664570000007-db164768644d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxqYXZhJTIwcHJvZ3JhbW1pbmclMjBjb2RlJTIwc2NyZWVufGVufDF8fHx8MTc3NzkyNjczMnww&ixlib=rb-4.1.0&q=80&w=1080";

type CurriculumLesson = {
  title: string;
  duration: string;
  type: "video" | "quiz";
  locked: boolean;
};

type CurriculumSection = {
  section: string;
  duration: string;
  lessons: CurriculumLesson[];
};

const curriculum: CurriculumSection[] = [
  {
    section: "1. Course Introduction",
    duration: "45min",
    lessons: [
      { title: "Welcome to the Course", duration: "4:12", type: "video", locked: false },
      { title: "Course Resources", duration: "2:45", type: "video", locked: false },
    ],
  },
  {
    section: "2. Java Core Concepts",
    duration: "3h 15min",
    lessons: [
      { title: "What is Java & JVM?", duration: "8:30", type: "video", locked: false },
      { title: "Data Types & Variables", duration: "12:20", type: "video", locked: false },
      { title: "Operators & Expressions", duration: "9:15", type: "video", locked: false },
      { title: "Control Flow", duration: "15:40", type: "video", locked: false },
      { title: "Quiz: Core Concepts", duration: "10 questions", type: "quiz", locked: false },
    ],
  },
  {
    section: "3. Object-Oriented Programming",
    duration: "5h 20min",
    lessons: [
      { title: "Classes & Objects", duration: "18:00", type: "video", locked: false },
      { title: "Inheritance", duration: "22:15", type: "video", locked: true },
      { title: "Polymorphism", duration: "19:30", type: "video", locked: true },
    ],
  },
  {
    section: "4. Collections & Generics",
    duration: "4h 10min",
    lessons: [{ title: "ArrayList & LinkedList", duration: "20:10", type: "video", locked: true }],
  },
];

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

function normalizeOverlayOpacity(opacity: number | undefined) {
  if (typeof opacity !== "number" || Number.isNaN(opacity)) {
    return 0.85;
  }

  return opacity > 1 ? opacity / 100 : opacity;
}

function getFlatLessonIndex(sectionIdx: number, lessonIdx: number) {
  let count = 0;

  for (let index = 0; index < curriculum.length; index += 1) {
    if (index === sectionIdx) {
      return count + lessonIdx;
    }

    count += curriculum[index].lessons.length;
  }

  return 0;
}

export function App() {
  const [activeBottomTab, setActiveBottomTab] = useState("overview");
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({ 0: true, 1: true });
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress] = useState(38);
  const [currentSubtitle, setCurrentSubtitle] = useState(0);
  const [volume] = useState(85);
  const [currentLesson, setCurrentLesson] = useState({ sectionIdx: 1, lessonIdx: 0 });
  const lessonRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [, setAppSession] = useState<Session | null | undefined>(undefined);
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>({
    show: true,
    fontSize: 24,
    opacity: 85,
    position: "bottom",
    textColor: "white",
    shadowStrength: 60,
    syncOffset: 0,
  });
  const [overlayText, setOverlayText] = useState("");
  const [autoTranslateActive, setAutoTranslateActive] = useState(true);
  const [contentScriptReady, setContentScriptReady] = useState(false);

  const currentFlatIdx = getFlatLessonIndex(currentLesson.sectionIdx, currentLesson.lessonIdx);

  useHotkeys({
    "alt+p": () => {
      setIsPlaying((previous) => !previous);
      toast(isPlaying ? "Video pausado" : "Video reanudado", {
        icon: isPlaying ? <Pause className="text-violet-400" size={18} /> : <Play className="text-violet-400" size={18} />,
      });
    },
    "alt+c": () => {
      toast.success("Captura de pantalla guardada en notas", {
        icon: (
          <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 p-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
            <Camera className="h-4 w-4 text-emerald-400" />
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      toast.success("Subtitle Bridge activado", {
        description: "Dock inyectado con Shadow DOM · Listo para traducir.",
        icon: (
          <div className="rounded-full border border-violet-500/20 bg-violet-500/10 p-1.5 shadow-[0_0_12px_rgba(139,92,246,0.2)]">
            <Rocket className="h-4 w-4 text-violet-400" />
          </div>
        ),
      });
    }, 800);

    setContentScriptReady(true);

    const unsubscribe = contentBridge.onMessageFromSidebar((message) => {
      if (message.type === "PING") {
        window.setTimeout(() => {
          void contentBridge.sendToSidebar({ type: "PONG" }).catch(() => undefined);
        }, 150);
      }

      if (message.type === "OVERLAY_CONFIG_UPDATE") {
        const payload = (message.payload ?? {}) as OverlayConfig;
        setOverlayConfig((current) => ({
          ...current,
          ...payload,
          show: payload.show ?? payload.visible ?? payload.enabled ?? payload.showOverlay ?? current.show,
          visible: payload.visible ?? payload.show ?? payload.enabled ?? payload.showOverlay ?? current.visible,
          enabled: payload.enabled ?? payload.show ?? payload.visible ?? payload.showOverlay ?? current.enabled,
          showOverlay: payload.showOverlay ?? payload.show ?? payload.visible ?? payload.enabled ?? current.showOverlay,
        }));
      }

      if (message.type === "OVERLAY_TEXT_UPDATE") {
        const payload = message.payload as { text?: string } | undefined;
        setOverlayText(String(payload?.text ?? "").trim());
      }

      if (message.type === "AUTO_TRANSLATE_TOGGLE") {
        const payload = message.payload as { active?: boolean } | undefined;
        if (typeof payload?.active === "boolean") {
          setAutoTranslateActive(payload.active);
        }
      }

      if (message.type === "OVERLAY_RESET_POSITION") {
        setOverlayConfig((current) => ({
          ...current,
          position: "bottom",
          offsetMs: 0,
          syncOffset: 0,
        }));
      }
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!contentScriptReady) {
      return;
    }

    void contentBridge.sendToSidebar({
      type: "SUBTITLE_LINE_RECEIVED",
      payload: { en: subtitleLines[currentSubtitle], ts: Date.now() },
    }).catch(() => undefined);
  }, [currentSubtitle, contentScriptReady]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentSubtitle((previous) => (previous + 1) % subtitleLines.length);
    }, 3000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setExpandedSections((previous) => ({ ...previous, [currentLesson.sectionIdx]: true }));
  }, [currentLesson.sectionIdx]);

  useEffect(() => {
    const key = `${currentLesson.sectionIdx}-${currentLesson.lessonIdx}`;
    const element = lessonRefs.current.get(key);

    if (!element) {
      return;
    }

    const timer = window.setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, activeBottomTab === "overview" ? 230 : 0);

    return () => window.clearTimeout(timer);
  }, [currentLesson, activeBottomTab]);

  const handleSelectLesson = useCallback((sectionIdx: number, lessonIdx: number) => {
    setCurrentLesson({ sectionIdx, lessonIdx });
    setActiveBottomTab("overview");
  }, []);

  const toggleSection = useCallback((index: number) => {
    setExpandedSections((previous) => ({ ...previous, [index]: !previous[index] }));
  }, []);

  const overlayVisible = Boolean(
    overlayConfig.show ?? overlayConfig.visible ?? overlayConfig.enabled ?? overlayConfig.showOverlay ?? true,
  );
  const overlayOpacity = normalizeOverlayOpacity(overlayConfig.opacity);
  const overlayTextColor = TEXT_COLORS_MAP[overlayConfig.textColor ?? overlayConfig.tone ?? "white"] ?? "#ffffff";
  const overlayTextSize = Math.max(18, Math.min(Number(overlayConfig.fontSize ?? 24), 44));
  const overlayShadowStrength = Number(overlayConfig.shadowStrength ?? 60);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#1c1d1f]">
      <Toaster
        theme="dark"
        position="bottom-center"
        expand={false}
        gap={8}
        toastOptions={{
          duration: 3500,
          style: {
            background: "rgba(17, 18, 24, 0.45)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            color: "#ffffff",
            borderRadius: "16px",
            padding: "14px 18px",
            fontSize: "13.5px",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow:
              "0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 0 20px rgba(139,92,246,0.05)",
            maxWidth: "360px",
          },
        }}
      />

      <CelebrationOverlay />

      <header className="z-40 flex h-12 shrink-0 items-center gap-4 border-b border-white/10 bg-[#1c1d1f] px-4">
        <div className="flex shrink-0 items-center gap-1">
          <svg viewBox="0 0 91 32" className="h-5" fill="white">
            <path d="M10.578 0L0 18.284l10.578 13.467 10.577-13.467z" fill="#A435F0" />
            <path d="M10.578 31.751l10.577-13.467H0z" fill="#6A0DAD" />
            <text x="26" y="24" fontSize="22" fontWeight="700" fill="white" fontFamily="Arial">
              udemy
            </text>
          </svg>
        </div>

        <div className="hidden cursor-pointer items-center gap-1 text-xs text-white/80 transition-colors hover:text-white lg:flex">
          <span>Categories</span>
          <ChevronDown size={13} />
        </div>

        <div className="hidden max-w-lg flex-1 md:block">
          <div className="flex h-8 items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3">
            <Search size={13} className="text-white/40" />
            <span className="text-xs text-white/30">Search for anything</span>
          </div>
        </div>

        <div className="hidden max-w-xs flex-1 truncate text-xs text-white/70 xl:block">
          Java In-Depth: Become a Complete Java Engineer!
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button className="hidden items-center gap-1.5 text-xs text-white/70 transition-colors hover:text-white md:flex">
            <Globe size={14} />
          </button>
          <button className="text-white/70 transition-colors hover:text-white">
            <Bell size={16} />
          </button>
          <button className="text-white/70 transition-colors hover:text-white">
            <ShoppingCart size={16} />
          </button>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#a435f0] text-xs text-white">
            K
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex-shrink-0 bg-black" style={{ aspectRatio: "16/9", maxHeight: "calc(100vh - 48px - 200px)" }}>
            <ImageWithFallback src={COURSE_VIDEO_IMG} alt="Course video" className="h-full w-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-black/50" />

            {overlayVisible && autoTranslateActive && (
              <div
                className={`absolute left-0 right-0 flex px-6 pointer-events-none transition-all duration-300 ${
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
                        backgroundColor: `rgba(0,0,0,${overlayOpacity})`,
                        color: overlayTextColor,
                        fontSize: `${overlayTextSize}px`,
                        textShadow:
                          overlayShadowStrength > 0
                            ? `0 1px ${Math.round(overlayShadowStrength / 20)}px rgba(0,0,0,${overlayShadowStrength / 100})`
                            : "none",
                      }}
                    >
                      {subtitleLines[currentSubtitle]}
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}

            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/12 bg-black/50 px-2.5 py-1 text-[10px] text-white shadow-lg backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-300 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-200" />
              </span>
              <AppLogo size={10} iconOnly />
              {contentScriptReady ? "content_script · Shadow DOM activo" : "Inicializando contenido"}
            </div>

            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-600/80 px-2.5 py-1 text-[10px] text-white shadow-lg backdrop-blur-sm">
              <span className="text-[9px] opacity-70">⟼</span>
              Dock inyectado
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setIsPlaying((previous) => !previous)}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white transition-all hover:scale-105 hover:bg-black/60"
              >
                {isPlaying ? <Pause size={22} /> : <Play size={22} className="translate-x-0.5" />}
              </button>
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-6">
              <div className="group mb-2 cursor-pointer">
                <div className="h-1 rounded-full bg-white/20 transition-all group-hover:h-1.5">
                  <div className="relative h-full rounded-full bg-[#a435f0]" style={{ width: `${progress}%` }}>
                    <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[#a435f0] opacity-0 shadow transition-opacity group-hover:opacity-100" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsPlaying((previous) => !previous)} className="text-white transition-colors hover:text-white/80">
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button className="text-white/70 transition-colors hover:text-white">
                    <SkipBack size={14} />
                  </button>
                  <button className="text-white/70 transition-colors hover:text-white">
                    <SkipForward size={14} />
                  </button>
                  <div className="group flex items-center gap-1.5">
                    <Volume2 size={14} className="text-white/70" />
                    <div className="hidden h-1 w-16 cursor-pointer rounded-full bg-white/20 group-hover:block">
                      <div className="h-full rounded-full bg-white" style={{ width: `${volume}%` }} />
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-white/60">5:03 / 6:51</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] text-white/60 transition-colors hover:text-white">1x</button>
                  <button className="text-white/60 transition-colors hover:text-white">
                    <Settings size={14} />
                  </button>
                  <button className="text-white/60 transition-colors hover:text-white">
                    <Maximize size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#f7f8fa]">
            <div className="border-b border-white/8 bg-[#1c1d1f] px-5 py-3">
              <h1 className="text-sm text-white" style={{ fontWeight: 600 }}>
                Java In-Depth: Become a Complete Java Engineer! [2026]
              </h1>
              <div className="mt-1 flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[#f69c08]">★★★★★</span>
                  <span className="text-[11px] text-white/50">4.5 (25,010 ratings)</span>
                </div>
                <span className="text-xs text-white/30">·</span>
                <span className="flex items-center gap-1 text-[11px] text-white/50">
                  <Users size={11} /> 142,117
                </span>
                <span className="text-xs text-white/30">·</span>
                <span className="flex items-center gap-1 text-[11px] text-white/50">
                  <Clock size={11} /> 85.5h
                </span>
              </div>
            </div>

            <div className="sticky top-0 z-10 flex border-b border-gray-200 bg-white">
              {[
                { id: "overview", label: "Overview", icon: BookOpen },
                { id: "qa", label: "Q&A", icon: MessageSquare },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeBottomTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveBottomTab(tab.id)}
                    className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs transition-all ${
                      isActive ? "border-[#1c1d1f] text-[#1c1d1f]" : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    <Icon size={13} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="p-5">
              {activeBottomTab === "overview" && (
                <div className="max-w-2xl space-y-4">
                  <div>
                    <h3 className="mb-2 text-base text-gray-900" style={{ fontWeight: 600 }}>
                      About this course
                    </h3>
                    <p className="text-sm leading-relaxed text-gray-600">
                      Java Programming Bootcamp with Spring Boot, Best Practices, Design Rules & Spring Boot Project — Updated for Java 25. This comprehensive course will take you from zero to expert in Java development.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ["85.5 total hours", Clock],
                      ["142,117 students", Users],
                      ["Certificate of completion", CheckSquare],
                      ["Full lifetime access", Globe],
                    ] as const).map(([text, Icon]) => (
                      <div key={text} className="flex items-center gap-2 text-xs text-gray-600">
                        <Icon size={14} className="shrink-0 text-gray-400" />
                        {text}
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="mb-3 mt-4 text-sm text-gray-900" style={{ fontWeight: 600 }}>
                      Course content
                    </h3>
                    <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                      {curriculum.map((section, sectionIdx) => (
                        <div key={section.section}>
                          <button
                            onClick={() => toggleSection(sectionIdx)}
                            className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100"
                          >
                            <span className="text-sm text-gray-800" style={{ fontWeight: 500 }}>
                              {section.section}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="text-xs text-gray-400">{section.duration}</span>
                              {expandedSections[sectionIdx] ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
                            </div>
                          </button>
                          {expandedSections[sectionIdx] && (
                            <div className="divide-y divide-gray-50">
                              {section.lessons.map((lesson, lessonIdx) => {
                                const isActive = currentLesson.sectionIdx === sectionIdx && currentLesson.lessonIdx === lessonIdx;

                                return (
                                  <button
                                    key={lesson.title}
                                    ref={(element) => {
                                      if (element) {
                                        lessonRefs.current.set(`${sectionIdx}-${lessonIdx}`, element);
                                      }
                                    }}
                                    onClick={() => {
                                      if (!lesson.locked) {
                                        handleSelectLesson(sectionIdx, lessonIdx);
                                      }
                                    }}
                                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-violet-50" : "hover:bg-gray-50"} ${lesson.locked ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                                  >
                                    {lesson.locked ? (
                                      <Lock size={12} className="shrink-0 text-gray-400" />
                                    ) : lesson.type === "quiz" ? (
                                      <FileText size={12} className="shrink-0 text-amber-500" />
                                    ) : (
                                      <PlayCircle size={12} className={isActive ? "text-violet-500" : "text-gray-400"} />
                                    )}
                                    <span className={`flex-1 text-xs ${isActive ? "text-violet-700" : "text-gray-600"}`} style={{ fontWeight: isActive ? 600 : 400 }}>
                                      {lesson.title}
                                    </span>
                                    <span className="shrink-0 font-mono text-xs text-gray-400">{lesson.duration}</span>
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
                <div className="py-8 text-center text-sm text-gray-500">
                  <MessageSquare size={32} className="mx-auto mb-3 text-gray-300" />
                  <p>No questions yet. Be the first to ask!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <InPageDock onSessionResolved={setAppSession} localAiConnected={true} />
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

export default App;