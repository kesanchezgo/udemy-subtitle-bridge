import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  History, ChevronDown, ChevronRight, Trash2, BookOpen,
  CheckCircle2, Circle, RefreshCw, Loader2, X, Layers, Award, Icon, type IconName,
} from "./icons";
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
  return <div className={`kx-card rounded-2xl p-4 border border-[var(--usb-border)] ${className}`}>{children}</div>;
}

function Tile({ icon, hue = "#6d4aff", ink, size = 32 }: { icon: IconName; hue?: string; ink?: string; size?: number }) {
  const { t } = useDockTheme();
  const iconColor = ink || t("#b7a6ff", "#5b37e8");
  return (
    <span
      className="rounded-xl flex items-center justify-center shrink-0 border"
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${hue} 18%, var(--usb-bg-3))`,
        borderColor: `color-mix(in srgb, ${hue} 40%, var(--usb-border))`,
        color: iconColor,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.52)} weight="duotone" />
    </span>
  );
}

const DOMINIO: Record<string, string> = { confused: "Dominio 1", partial: "Dominio 2", clear: "Dominio 3", mastered: "Dominio 4" };

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

  useEffect(() => {
    if (!expanded) return;
    // historyService.onChanged fires once per changed key. During a study
    // session several upserts land in quick succession, so coalesce the
    // full refresh into a single trailing call.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = historyService.onChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void load();
        if (openCourse) {
          void historyService.getCourseLectures(openCourse).then((recs) => {
            setLecturesByCourse(prev => ({ ...prev, [openCourse]: recs }));
          });
        }
      }, 350);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [expanded, load, openCourse]);

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
    <div className="kx-cap space-y-2">
      {!hideToggle && (
      <button
        onClick={() => setExpanded(v => !v)}
        className="kx-card kx-toggle w-full flex items-center gap-2.5 px-4 py-3 text-left"
        data-on={expanded ? "1" : undefined}
      >
        <Tile icon="history" hue="#6d4aff" ink={t("#b7a6ff", "#5b37e8")} />
        <span className="text-[12.5px] font-bold tracking-tight text-[var(--usb-fg-hi)]">Historial de estudio</span>
        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full truncate" style={{ background: "color-mix(in srgb, #6d4aff 14%, transparent)", color: t("#b7a6ff", "#5b37e8") }}>
          {summaryText}
        </span>
        <motion.div className="ml-auto" animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-[var(--usb-fg-lo)]" />
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
            <div className="space-y-4 pt-1">

              <Card className="space-y-3.5">
                <div className="flex items-center gap-2.5">
                  <Tile icon="barChart2" hue="#6d4aff" ink={t("#b7a6ff", "#5b37e8")} />
                  <div className="flex-1 min-w-0">
                    <p className="kx-slate">Historial</p>
                    <p className="text-[12.5px] font-bold tracking-tight text-[var(--usb-fg-hi)] mt-0.5">Resumen de estudio</p>
                  </div>
                  <button
                    onClick={load}
                    disabled={loading}
                    title="Refrescar"
                    className="kx-chip w-7 h-7 rounded-full flex items-center justify-center"
                  >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                  </button>
                </div>

                {stats ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: "Cursos",     value: String(stats.totalCourses),       icon: "layers" as IconName,       hue: "#6d4aff", dk: "#b7a6ff", lt: "#5b37e8" },
                      { label: "Lecciones",  value: String(stats.totalLectures),      icon: "bookOpen" as IconName,     hue: "#6d4aff", dk: "#b7a6ff", lt: "#5b37e8" },
                      { label: "Completas",  value: String(stats.completedLectures),  icon: "checkCircle2" as IconName, hue: "#059669", dk: "#4ade9f", lt: "#047857" },
                      { label: "Anki",       value: String(stats.totalAnkiCards),     icon: "award" as IconName,        hue: "#d97706", dk: "#fbbf45", lt: "#a15207" },
                    ].map(({ label, value, icon, hue, dk, lt }) => (
                      <div key={label} className="kx-card-flat rounded-2xl px-3.5 py-3 flex items-center gap-3 border border-[var(--usb-border)] hover:border-[#6d4aff]/50 transition-colors">
                        <Tile icon={icon} hue={hue} ink={t(dk, lt)} size={34} />
                        <div className="min-w-0">
                          <p className="text-[22px] leading-none font-bold tabular-nums tracking-tight text-[var(--usb-fg-hi)]">{value}</p>
                          <p className="kx-slate mt-1.5">{label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 size={16} className="animate-spin text-[var(--usb-fg-lo)]" />
                  </div>
                )}

                <AnimatePresence>
                  {feedback && (
                    <motion.div
                      key="fb"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="kx-ok-strip flex items-center gap-2 text-[12px] font-semibold px-3 py-2 rounded-xl"
                    >
                      <CheckCircle2 size={14} />
                      {feedback}
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-[11.5px] font-medium leading-relaxed text-[var(--usb-fg-mid)]">
                  Este historial no expira: guarda tus respuestas, evaluaciones y tarjetas Anki para que sepas qué ya estudiaste. No lo afecta la limpieza de caché.
                </p>

                <button
                  onClick={handleClearAll}
                  className="kx-chip w-full flex items-center justify-center gap-1.5 h-10 rounded-2xl text-[12px] font-semibold hover:!text-[#e11d48] hover:!border-[#e11d48]/40 transition-all"
                >
                  <Trash2 size={13} />
                  Borrar todo el historial
                </button>
              </Card>

              {courses.length > 0 ? (
                <div className="space-y-3">
                  <p className="kx-slate px-1">Cursos estudiados</p>
                  {courses.map((course) => {
                    const isOpen = openCourse === course.courseId;
                    const lectures = lecturesByCourse[course.courseId] ?? [];
                    return (
                      <div key={course.courseId} className="kx-card rounded-2xl overflow-hidden border border-[var(--usb-border)]">
                        <div className="flex items-center gap-2.5 px-4 py-3.5 bg-[var(--usb-bg-2)]/30">
                          <button
                            onClick={() => toggleCourse(course.courseId)}
                            className="flex-1 flex items-center gap-3 min-w-0 text-left"
                          >
                            <Tile icon="bookOpen" hue="#6d4aff" ink={t("#b7a6ff", "#5b37e8")} size={32} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-bold tracking-tight truncate text-[var(--usb-fg-hi)]">{course.courseName}</p>
                              <p className="text-[11px] mt-0.5 leading-snug text-[var(--usb-fg-lo)] font-medium">
                                {course.completedCount}/{course.lectureCount} completas · {course.totalAnkiCards} Anki · {formatDate(course.lastSeenAt)}
                              </p>
                            </div>
                            <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.15 }}>
                              <ChevronRight size={15} className="text-[var(--usb-fg-lo)]" />
                            </motion.div>
                          </button>
                          <button
                            onClick={() => handleDeleteCourse(course.courseId)}
                            disabled={busyId === course.courseId}
                            title="Eliminar todo el curso del historial"
                            className="kx-chip shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:!text-[#e11d48] transition-colors"
                          >
                            {busyId === course.courseId
                              ? <Loader2 size={12} className="animate-spin" />
                              : <X size={13} />}
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
                              <div className="px-3 pb-3 pt-1.5 border-t border-[var(--usb-divider)] space-y-1">
                                {lectures.length === 0 ? (
                                  <p className="text-[11.5px] py-3 text-center text-[var(--usb-fg-lo)] font-medium">Cargando lecciones…</p>
                                ) : lectures.map((rec) => {
                                  const id = `${rec.courseId}::${rec.lectureId}`;
                                  const done = rec.status === "completed";
                                  return (
                                    <div
                                      key={id}
                                      className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all ${onOpenLecture ? "hover:bg-[var(--usb-accent-soft)] cursor-pointer" : ""}`}
                                      onClick={() => onOpenLecture?.(rec)}
                                    >
                                      {done
                                        ? <CheckCircle2 size={16} className="shrink-0" style={{ color: t("#4ade9f", "#047857") }} />
                                        : <Circle size={16} className="shrink-0 text-[var(--usb-fg-dim)]" />}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-bold truncate text-[var(--usb-fg-hi)]">{rec.lectureName}</p>
                                        <p className="text-[10.5px] mt-0.5 text-[var(--usb-fg-lo)] font-medium">
                                          {DOMINIO[rec.confidence ?? ""] ?? "Sin dominio"} · {rec.questions.length}Q · {rec.ankiCardsCount} Anki · {formatDate(rec.updatedAt)}
                                        </p>
                                      </div>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteLecture(rec); }}
                                        disabled={busyId === id}
                                        title="Eliminar esta lección"
                                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-[var(--usb-fg-lo)] hover:text-[#e11d48] hover:bg-[#e11d48]/10 transition-colors"
                                      >
                                        {busyId === id
                                          ? <Loader2 size={11} className="animate-spin" />
                                          : <X size={12} />}
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
                <div className="kx-card text-center py-8 px-4 space-y-2">
                  <span className="w-11 h-11 rounded-2xl mx-auto flex items-center justify-center border"
                    style={{
                      background: "color-mix(in srgb, #6d4aff 20%, var(--usb-bg-3))",
                      borderColor: "color-mix(in srgb, #6d4aff 45%, var(--usb-border))",
                      color: t("#b7a6ff", "#5b37e8"),
                    }}>
                    <Icon name="history" size={22} weight="duotone" />
                  </span>
                  <p className="text-[13px] font-bold tracking-tight pt-1 text-[var(--usb-fg-hi)]">Sin historial aún</p>
                  <p className="text-[12px] max-w-[240px] mx-auto leading-relaxed text-[var(--usb-fg-mid)]">
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
