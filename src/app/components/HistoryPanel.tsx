import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  History, ChevronDown, ChevronRight, Trash2, BookOpen,
  CheckCircle2, Circle, RefreshCw, Loader2, X, Layers, Award,
} from "lucide-react";
import { historyService, type CourseHistorySummary, type LectureHistoryRecord, type HistoryStats } from "../services/historyService";
import { useDockTheme } from "../contexts/ThemeContext";

interface HistoryPanelProps {
  /** Optional click handler — receives a record so a parent can re-open the lecture. */
  onOpenLecture?: (rec: LectureHistoryRecord) => void;
  /** Start expanded. Useful when rendered inside a drawer. */
  defaultOpen?: boolean;
  /** Hide the collapsible toggle header — content is always visible. */
  hideToggle?: boolean;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { t } = useDockTheme();
  return (
    <div className={`border shadow-sm rounded-xl p-4 ${t(
      "bg-gradient-to-b from-[#18181b] to-[#121214] border-white/5",
      "bg-white border-black/7 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
    )} ${className}`}>
      {children}
    </div>
  );
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function HistoryPanel({ onOpenLecture, defaultOpen = false, hideToggle = false }: HistoryPanelProps) {
  const { t } = useDockTheme();
  const [expanded, setExpanded] = useState(defaultOpen || hideToggle);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [courses, setCourses] = useState<CourseHistorySummary[]>([]);
  const [lecturesByCourse, setLecturesByCourse] = useState<Record<string, LectureHistoryRecord[]>>({});
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, cs] = await Promise.all([historyService.getStats(), historyService.listCourses()]);
    setStats(s);
    setCourses(cs);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    load();
  }, [expanded, load]);

  const toggleCourse = async (courseId: string) => {
    if (openCourse === courseId) {
      setOpenCourse(null);
      return;
    }
    if (!lecturesByCourse[courseId]) {
      const recs = await historyService.getCourseLectures(courseId);
      setLecturesByCourse(prev => ({ ...prev, [courseId]: recs }));
    }
    setOpenCourse(courseId);
  };

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleDeleteCourse = async (courseId: string) => {
    setBusyId(courseId);
    const n = await historyService.deleteCourse(courseId);
    setLecturesByCourse(prev => {
      const next = { ...prev };
      delete next[courseId];
      return next;
    });
    if (openCourse === courseId) setOpenCourse(null);
    await load();
    setBusyId(null);
    showFeedback(`${n} ${n === 1 ? "lección eliminada" : "lecciones eliminadas"}`);
  };

  const handleDeleteLecture = async (rec: LectureHistoryRecord) => {
    const id = `${rec.courseId}::${rec.lectureId}`;
    setBusyId(id);
    await historyService.deleteLecture(rec.courseId, rec.lectureId);
    const recs = await historyService.getCourseLectures(rec.courseId);
    setLecturesByCourse(prev => ({ ...prev, [rec.courseId]: recs }));
    await load();
    setBusyId(null);
  };

  const handleClearAll = async () => {
    if (!confirm("¿Borrar todo tu historial de estudio? Esta acción no se puede deshacer.")) return;
    await historyService.clearAll();
    setLecturesByCourse({});
    setOpenCourse(null);
    await load();
    showFeedback("Historial borrado");
  };

  const summaryText = stats
    ? `${stats.totalCourses} ${stats.totalCourses === 1 ? "curso" : "cursos"} · ${stats.completedLectures}/${stats.totalLectures}`
    : "Sin historial aún";

  return (
    <div className="space-y-2">
      {!hideToggle && (
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all duration-200 ${
          expanded
            ? t("bg-violet-500/8 border-violet-500/22", "bg-violet-500/5 border-violet-500/20")
            : t("bg-white/3 border-white/7 hover:bg-white/5 hover:border-white/12",
                "bg-black/3 border-black/7 hover:bg-black/5 hover:border-black/12")
        }`}
      >
        <div className="flex items-center gap-2">
          <History size={11} className={expanded ? "text-violet-400" : t("text-white/40", "text-[#3d3a38]/55")} />
          <span
            className={`text-[11px] ${expanded ? t("text-white", "text-[#1a1918]") : t("text-white/55", "text-[#3d3a38]/70")}`}
            style={{ fontWeight: 500 }}
          >
            Historial de estudio
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
            t("bg-violet-500/10 border-violet-500/20 text-violet-400/80",
              "bg-violet-500/8 border-violet-500/20 text-violet-600/80")
          }`} style={{ fontWeight: 500 }}>
            {summaryText}
          </span>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={12} className={t("text-white/30", "text-[#3d3a38]/50")} />
        </motion.div>
      </button>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-1">

              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] uppercase tracking-widest ${t("text-white/22", "text-[#3d3a38]/60")}`}
                    style={{ fontWeight: 600 }}>
                    Tu progreso
                  </span>
                  <button
                    onClick={load}
                    disabled={loading}
                    title="Refrescar"
                    className={`transition-colors ${t("text-white/20 hover:text-white/55", "text-[#3d3a38]/45 hover:text-[#1a1918]")}`}
                  >
                    <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
                  </button>
                </div>

                {stats ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Cursos",     value: String(stats.totalCourses),       icon: <Layers size={9} /> },
                      { label: "Lecciones",  value: String(stats.totalLectures),      icon: <BookOpen size={9} /> },
                      { label: "Completas",  value: String(stats.completedLectures),  icon: <CheckCircle2 size={9} /> },
                      { label: "Anki",       value: String(stats.totalAnkiCards),     icon: <Award size={9} /> },
                    ].map(({ label, value, icon }) => (
                      <div key={label} className={`rounded-lg p-2 text-center border ${
                        t("bg-white/3 border-white/6", "bg-black/3 border-black/6")
                      }`}>
                        <p className={`text-[13px] font-mono ${t("text-white/80", "text-[#1a1918]")}`} style={{ fontWeight: 600 }}>
                          {value}
                        </p>
                        <p className={`text-[8px] mt-0.5 flex items-center justify-center gap-1 ${t("text-white/25", "text-[#3d3a38]/55")}`}>
                          {icon}
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 size={14} className={`animate-spin ${t("text-white/20", "text-[#3d3a38]/35")}`} />
                  </div>
                )}

                <button
                  onClick={handleClearAll}
                  className={`w-full flex items-center justify-center gap-1.5 h-7 rounded-lg text-[10px] border transition-all ${
                    t("bg-red-500/5 hover:bg-red-500/10 border-red-500/10 hover:border-red-500/20 text-red-400/55 hover:text-red-400",
                      "bg-red-500/4 hover:bg-red-500/8 border-red-500/10 hover:border-red-500/20 text-red-500/60 hover:text-red-600")
                  }`}
                >
                  <Trash2 size={10} />
                  Borrar todo el historial
                </button>

                <AnimatePresence>
                  {feedback && (
                    <motion.div
                      key="fb"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border ${
                        t("bg-emerald-500/10 border-emerald-500/15 text-emerald-400",
                          "bg-emerald-500/8 border-emerald-500/15 text-emerald-700")
                      }`}
                    >
                      <CheckCircle2 size={10} />
                      {feedback}
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className={`text-[9.5px] leading-relaxed ${t("text-white/25", "text-[#3d3a38]/50")}`}>
                  Este historial NO expira — guarda tus respuestas, evaluaciones y tarjetas Anki para que sepas qué ya estudiaste. No lo afecta la limpieza de caché.
                </p>
              </Card>

              {courses.length > 0 ? (
                <div className="space-y-1.5">
                  <p className={`text-[9px] uppercase tracking-widest ${t("text-white/22", "text-[#3d3a38]/60")}`}
                    style={{ fontWeight: 600 }}>
                    Cursos estudiados
                  </p>
                  {courses.map((course) => {
                    const isOpen = openCourse === course.courseId;
                    const lectures = lecturesByCourse[course.courseId] ?? [];
                    return (
                      <div key={course.courseId} className={`rounded-xl border overflow-hidden ${
                        t("bg-white/3 border-white/6", "bg-black/2 border-black/6")
                      }`}>
                        <div className="flex items-center gap-2.5 px-3 py-2">
                          <button
                            onClick={() => toggleCourse(course.courseId)}
                            className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                          >
                            <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.15 }}>
                              <ChevronRight size={10} className={t("text-white/30", "text-[#3d3a38]/50")} />
                            </motion.div>
                            <div className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center ${
                              t("bg-violet-500/15", "bg-violet-500/10")
                            }`}>
                              <BookOpen size={9} className="text-violet-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[10px] truncate ${t("text-white/75", "text-[#1a1918]")}`}
                                style={{ fontWeight: 500 }}>
                                {course.courseName}
                              </p>
                              <p className={`text-[9px] mt-0.5 ${t("text-white/28", "text-[#3d3a38]/50")}`}>
                                {course.completedCount}/{course.lectureCount} completas · {course.totalAnkiCards} Anki · última {formatDate(course.lastSeenAt)}
                              </p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleDeleteCourse(course.courseId)}
                            disabled={busyId === course.courseId}
                            title="Eliminar todo el curso del historial"
                            className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-md transition-all ${
                              t("text-white/20 hover:text-red-400/80 hover:bg-red-500/10",
                                "text-[#3d3a38]/40 hover:text-red-500/80 hover:bg-red-500/8")
                            }`}
                          >
                            {busyId === course.courseId
                              ? <Loader2 size={8} className="animate-spin" />
                              : <X size={8} />}
                          </button>
                        </div>

                        <AnimatePresence>
                          {isOpen && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.18 }}
                              className="overflow-hidden"
                            >
                              <div className={`px-3 pb-2 pt-0.5 space-y-1 border-t ${t("border-white/5", "border-black/5")}`}>
                                {lectures.length === 0 ? (
                                  <p className={`text-[9px] py-2 text-center ${t("text-white/25", "text-[#3d3a38]/50")}`}>
                                    Cargando…
                                  </p>
                                ) : lectures.map((rec) => {
                                  const id = `${rec.courseId}::${rec.lectureId}`;
                                  const done = rec.status === "completed";
                                  return (
                                    <div
                                      key={id}
                                      className={`flex items-center gap-2 py-1.5 px-1.5 rounded-md transition-colors ${
                                        onOpenLecture
                                          ? t("hover:bg-white/4 cursor-pointer", "hover:bg-black/4 cursor-pointer")
                                          : ""
                                      }`}
                                      onClick={() => onOpenLecture?.(rec)}
                                    >
                                      {done
                                        ? <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />
                                        : <Circle size={10} className={t("text-white/25", "text-[#3d3a38]/40") + " shrink-0"} />}
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-[10px] truncate ${t("text-white/70", "text-[#1a1918]")}`}>
                                          {rec.lectureName}
                                        </p>
                                        <p className={`text-[8.5px] mt-0.5 ${t("text-white/22", "text-[#3d3a38]/45")}`}>
                                          {rec.confidence ?? "sin nivel"} · {rec.questions.length}Q · {rec.ankiCardsCount} Anki · {formatDate(rec.updatedAt)}
                                        </p>
                                      </div>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteLecture(rec); }}
                                        disabled={busyId === id}
                                        title="Eliminar esta lección"
                                        className={`shrink-0 w-4 h-4 flex items-center justify-center rounded ${
                                          t("text-white/15 hover:text-red-400/80", "text-[#3d3a38]/30 hover:text-red-500/80")
                                        }`}
                                      >
                                        {busyId === id
                                          ? <Loader2 size={7} className="animate-spin" />
                                          : <X size={7} />}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              ) : stats && stats.totalLectures === 0 && (
                <div className={`flex flex-col items-center gap-2 py-5 rounded-xl border ${
                  t("border-white/5 bg-white/[0.015]", "border-black/5 bg-black/[0.015]")
                }`}>
                  <History size={16} className={t("text-white/15", "text-[#3d3a38]/30")} />
                  <p className={`text-[10px] ${t("text-white/30", "text-[#3d3a38]/50")}`}>
                    Sin historial aún
                  </p>
                  <p className={`text-[9px] text-center px-6 leading-relaxed ${t("text-white/18", "text-[#3d3a38]/38")}`}>
                    Cuando completes los 5 pasos de una lección, aparecerá aquí para que no la repitas sin darte cuenta.
                  </p>
                </div>
              )}

              <div className="h-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
