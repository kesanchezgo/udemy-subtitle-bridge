import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  History, AlertCircle, ChevronDown, ChevronRight, Trash2, BookOpen,
  CheckCircle2, Circle, RefreshCw, Loader2, X, Layers, Award, Icon, Repeat2, Check, ExternalLink, Download, type IconName,
} from "./icons";
import { historyService, type CourseHistorySummary, type LectureHistoryRecord, type HistoryStats } from "../services/historyService";
import { useDockTheme } from "../contexts/ThemeContext";
import { celebrate } from "./CelebrationOverlay";
import { toast } from "sonner";
import { PendingContentExports } from "./study/MemoryCard";

interface HistoryPanelProps {
  onExportLesson?: (record: LectureHistoryRecord) => Promise<void>;
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

/** Anillo: lecciones terminadas (5 pasos) de las que estudiaste en Kinema, con la inicial del curso. */
function CourseRing({ done, total, label }: { done: number; total: number; label: string }) {
  const { t } = useDockTheme();
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const r = 13, c = 2 * Math.PI * r;
  const complete = pct >= 1;
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" strokeWidth="2.5" stroke="color-mix(in srgb, #6d4aff 16%, transparent)" />
        <motion.circle cx="16" cy="16" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round"
          stroke={complete ? "#10b981" : "#6d4aff"} strokeDasharray={c} initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.max(pct, 0.03)) }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <span className="text-[11px] font-bold uppercase" style={{ color: complete ? t("#4ade9f", "#047857") : t("#b7a6ff", "#5b37e8") }}>
        {label.trim().charAt(0) || "·"}
      </span>
    </span>
  );
}

/** Confirmación en línea: explica qué se borra y qué pasa con Anki antes de hacerlo. */
function DeleteConfirm({ what, pending, onConfirm, onCancel, onDownload, extra, flush = false }: {
  what: string; pending: number; onConfirm: () => void; onCancel: () => void; onDownload?: () => void; extra?: string; flush?: boolean;
}) {
  return (
    <div role="alertdialog" aria-label={`Eliminar ${what}`} className={`${flush ? "" : "mx-2 mb-2"} rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-3 py-2.5 space-y-2.5`} onClick={e => e.stopPropagation()}>
      <div className="flex gap-2">
      <span className="kx-danger-btn mt-px shrink-0 w-5 h-5 rounded-md border border-rose-500/35 bg-rose-500/10 text-rose-300 flex items-center justify-center"><AlertCircle size={11} /></span>
      <p className="text-[11.5px] leading-snug text-[var(--usb-fg)]">
        Se borra el progreso de {what} en Kinema. Las tarjetas que ya importaste <strong>siguen en Anki</strong>.
        {pending > 0 && <> <span className="kx-danger-text font-semibold text-rose-300">{pending} {pending === 1 ? "tarjeta sin descargar se perderá" : "tarjetas sin descargar se perderán"}.</span></>}
        {extra && <> <span className="text-[var(--usb-fg-mid)]">{extra}</span></>}
      </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="kx-chip h-7 px-2.5 rounded-lg text-[11px] font-semibold">Cancelar</button>
        {onDownload && (
          <button type="button" onClick={onDownload} className="kx-chip h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1">
            <Download size={11} />Descargar primero
          </button>
        )}
        <button type="button" onClick={onConfirm} className="kx-danger-btn h-7 px-2.5 rounded-lg text-[11px] font-semibold border border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15 transition-colors">Eliminar</button>
      </div>
    </div>
  );
}

const sectionLabelCls = "text-[11px] font-bold uppercase tracking-wider text-[var(--usb-fg-mid)]";
const deleteBtnCls = "shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--usb-fg-mid)] hover:!text-rose-400 hover:bg-rose-500/10 transition";

const DOMINIO: Record<string, string> = { confused: "Dominio 1", partial: "Dominio 2", clear: "Dominio 3", mastered: "Dominio 4" };

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function HistoryPanel({ onOpenLecture, onExportLesson, defaultOpen = false, hideToggle = false }: HistoryPanelProps) {
  const { t } = useDockTheme();
  const [expanded, setExpanded] = useState(defaultOpen || hideToggle);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [courses, setCourses] = useState<CourseHistorySummary[]>([]);
  const [lecturesByCourse, setLecturesByCourse] = useState<Record<string, LectureHistoryRecord[]>>({});
  const [allLectures, setAllLectures] = useState<LectureHistoryRecord[]>([]);
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Fila con confirmación de borrado abierta: "c:<courseId>" o "l:<courseId>::<lectureId>". */
  const [armed, setArmed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, cs, lecs] = await Promise.all([historyService.getStats(), historyService.listCourses(), historyService.listLectures()]);
    setStats(s);
    setCourses(cs);
    setAllLectures(lecs);
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

  const dueReviewLectures = useMemo(() => allLectures.filter(lecture => !lecture.deletedAt && lecture.exportedAt && lecture.ankiCardsCount > 0), [allLectures]);

  const totalDueCards = useMemo(() => {
    return dueReviewLectures.reduce((acc, l) => acc + (l.ankiCardsCount || 0), 0);
  }, [dueReviewLectures]);

  const dueByCourse = useMemo(() => {
    const map = new Map<string, { courseName: string; lectures: LectureHistoryRecord[]; totalCards: number }>();
    for (const l of dueReviewLectures) {
      const entry = map.get(l.courseId) ?? { courseName: l.courseName, lectures: [], totalCards: 0 };
      entry.lectures.push(l);
      entry.totalCards += l.ankiCardsCount || 0;
      map.set(l.courseId, entry);
    }
    return Array.from(map.values());
  }, [dueReviewLectures]);

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

  const handleDownloadLecture = async (rec: LectureHistoryRecord) => {
    if (!onExportLesson) return;
    const id = `dl:${rec.courseId}::${rec.lectureId}`;
    setBusyId(id);
    try {
      await onExportLesson(rec);
      await historyService.markExported(rec.courseId, rec.lectureId);
      const recs = await historyService.getCourseLectures(rec.courseId);
      setLecturesByCourse(prev => ({ ...prev, [rec.courseId]: recs }));
      await load();
      showFeedback("Archivo descargado · ábrelo para importarlo en Anki");
    } catch (error) {
      toast.error("No se pudo descargar", { description: error instanceof Error ? error.message : "Inténtalo de nuevo." });
    } finally {
      setBusyId(null);
    }
  };

  const isPending = (l: LectureHistoryRecord) => !l.deletedAt && l.status === "completed" && !l.exportedAt && (l.ankiCards?.length ?? 0) > 0;
  const pendingInCourse = (courseId: string) => allLectures.filter(l => l.courseId === courseId && isPending(l)).reduce((n, l) => n + (l.ankiCards?.length ?? 0), 0);

  const pendingTotal = allLectures.filter(isPending).reduce((n, l) => n + (l.ankiCards?.length ?? 0), 0);

  const handleClearAll = async () => {
    try {
      await historyService.clearAll();
      setLecturesByCourse({});
      setOpenCourse(null);
      await load();
      showFeedback("Historial borrado");
    } catch (error) {
      toast.error("No se pudo borrar el historial", { description: error instanceof Error ? error.message : "Inténtalo de nuevo." });
    }
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
            <div className="space-y-5 pt-1">

              {/* ── Resumen: una sola tarjeta, métricas en línea ── */}
              <section className="space-y-2" aria-label="Resumen de estudio">
                <div className="flex items-center justify-between px-1">
                  <p className={sectionLabelCls}>Resumen</p>
                  <button
                    onClick={load}
                    disabled={loading}
                    title="Refrescar"
                    aria-label="Refrescar historial"
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-accent-soft)] transition-colors"
                  >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                  </button>
                </div>
                <div className="grid grid-cols-4 rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] divide-x divide-[var(--usb-border)]">
                  {[
                    { label: "Cursos", value: stats?.totalCourses, dot: "#8b6dff" },
                    { label: "Lecciones", value: stats?.totalLectures, dot: "#8b6dff" },
                    { label: "Terminadas", value: stats?.completedLectures, dot: "#10b981" },
                    { label: "Tarjetas", value: totalDueCards, dot: "#10b981", hint: "Tarjetas descargadas para Anki" },
                  ].map(({ label, value, dot, hint }) => (
                    <div key={label} className="min-w-0 px-1 py-3 text-center" title={hint}>
                      <p className="text-[19px] leading-none font-bold tabular-nums tracking-tight text-[var(--usb-fg-hi)]">{stats ? value : "–"}</p>
                      <p className="mt-2 flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-medium text-[var(--usb-fg-mid)]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />{label}
                      </p>
                    </div>
                  ))}
                </div>
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
              </section>

              {/* ── Acción pendiente (solo si hay archivos sin descargar) ── */}
              {onExportLesson && <PendingContentExports onExportLesson={onExportLesson} />}

              {/* ── Cursos estudiados: cada lección muestra también su estado en Anki ── */}
              {courses.length > 0 ? (
                <section className="space-y-2" aria-label="Cursos estudiados">
                  <p className={`${sectionLabelCls} px-1`}>Cursos estudiados</p>
                  <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] divide-y divide-[var(--usb-border)] overflow-hidden">
                    {courses.map((course) => {
                      const isOpen = openCourse === course.courseId;
                      const lectures = lecturesByCourse[course.courseId] ?? [];
                      return (
                        <div key={course.courseId} className={`transition-colors ${isOpen ? "bg-[color-mix(in_srgb,#6d4aff_5%,transparent)]" : ""}`}>
                          <div className="group flex items-center gap-1 pr-2">
                            <button
                              onClick={() => toggleCourse(course.courseId)}
                              aria-expanded={isOpen}
                              className="flex-1 flex items-center gap-2.5 min-w-0 px-3 py-2.5 text-left"
                            >
                              <CourseRing done={course.completedCount} total={course.lectureCount} label={course.courseName} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-[12.5px] font-semibold truncate text-[var(--usb-fg)]">{course.courseName}</span>
                                <span className="block text-[11px] mt-0.5 text-[var(--usb-fg-mid)] tabular-nums truncate">
                                  {course.completedCount} de {course.lectureCount} {course.lectureCount === 1 ? "lección terminada" : "lecciones terminadas"} · {formatDate(course.lastSeenAt)}
                                </span>
                              </span>
                              <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.15 }} className="shrink-0">
                                <ChevronRight size={14} className="text-[var(--usb-fg-mid)]" />
                              </motion.span>
                            </button>
                            <button
                              onClick={() => setArmed(a => a === `c:${course.courseId}` ? null : `c:${course.courseId}`)}
                              aria-expanded={armed === `c:${course.courseId}`}
                              disabled={busyId === course.courseId}
                              title="Eliminar el curso del historial"
                              aria-label={`Eliminar ${course.courseName} del historial`}
                              className={deleteBtnCls}
                            >
                              {busyId === course.courseId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            </button>
                          </div>
                          {armed === `c:${course.courseId}` && (
                            <DeleteConfirm
                              what={`el curso y sus ${course.lectureCount} ${course.lectureCount === 1 ? "lección" : "lecciones"}`}
                              pending={pendingInCourse(course.courseId)}
                              onCancel={() => setArmed(null)}
                              onConfirm={() => { setArmed(null); void handleDeleteCourse(course.courseId); }}
                            />
                          )}

                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                              >
                                <div className="px-2 pb-2 space-y-0.5">
                                  {lectures.length === 0 ? (
                                    <p className="text-[11.5px] py-3 text-center text-[var(--usb-fg-mid)]">Cargando lecciones…</p>
                                  ) : lectures.map((rec) => {
                                    const id = `${rec.courseId}::${rec.lectureId}`;
                                    const done = rec.status === "completed";
                                    const inAnki = Boolean(rec.exportedAt) && rec.ankiCardsCount > 0;
                                    // Solo se puede (re)descargar si las tarjetas siguen guardadas, no solo su conteo.
                                    const canDownload = Boolean(onExportLesson) && (rec.ankiCards?.length ?? 0) > 0;
                                    return (
                                      <React.Fragment key={id}>
                                      <div
                                        role={onOpenLecture ? "button" : undefined}
                                        tabIndex={onOpenLecture ? 0 : undefined}
                                        onClick={() => onOpenLecture?.(rec)}
                                        onKeyDown={(e) => { if (onOpenLecture && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenLecture(rec); } }}
                                        className={`group flex items-center gap-2.5 py-2 pl-2.5 pr-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a48bff] ${onOpenLecture ? "hover:bg-[var(--usb-accent-soft)] cursor-pointer" : ""}`}
                                      >
                                        {done
                                          ? <CheckCircle2 size={15} className="shrink-0" style={{ color: t("#4ade9f", "#047857") }} aria-label="Completa" />
                                          : <Circle size={15} className="shrink-0 text-[var(--usb-fg-mid)]" aria-label="En curso" />}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[12px] font-semibold truncate text-[var(--usb-fg)]">{rec.lectureName}</p>
                                          <div className="mt-1 flex items-center gap-2">
                                            <p className="min-w-0 flex-1 text-[10.5px] text-[var(--usb-fg-mid)] tabular-nums truncate">
                                              {DOMINIO[rec.confidence ?? ""] ?? "Sin dominio"} · {rec.questions.length} preguntas
                                            </p>
                                            {rec.ankiCardsCount > 0 && (inAnki ? (
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); if (canDownload) void handleDownloadLecture(rec); }}
                                                disabled={!canDownload || busyId === `dl:${id}`}
                                                title={canDownload ? "Ya descargadas. ¿No están en Anki? Clic para descargar el archivo de nuevo." : "Ya descargadas para Anki"}
                                                aria-label={`${rec.ankiCardsCount} tarjetas ya descargadas. Descargar de nuevo`}
                                                className={`shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-opacity enabled:hover:opacity-80 disabled:cursor-default ${t("bg-emerald-400/10 text-emerald-300", "bg-emerald-600/10 text-emerald-800")}`}
                                              >
                                                {busyId === `dl:${id}` ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}{rec.ankiCardsCount} en Anki
                                              </button>
                                            ) : done && canDownload ? (
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); void handleDownloadLecture(rec); }}
                                                disabled={busyId === `dl:${id}`}
                                                title="Descarga el archivo .apkg; ábrelo con doble clic para importarlo en Anki"
                                                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[#6d4aff]/35 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors hover:bg-[color-mix(in_srgb,#6d4aff_12%,transparent)]"
                                                style={{ color: t("#b7a6ff", "#5b37e8") }}
                                              >
                                                {busyId === `dl:${id}` ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                                                Descargar {rec.ankiCardsCount}
                                              </button>
                                            ) : (
                                              <span
                                                title={done ? "Las tarjetas de esta lección ya no están guardadas; vuelve a abrirla para generarlas" : "Termina los 5 pasos de la lección para descargar sus tarjetas"}
                                                className="shrink-0 rounded-md bg-[var(--usb-bg-3)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--usb-fg-mid)]"
                                              >
                                                {rec.ankiCardsCount} {done ? "tarjetas" : "al terminar"}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setArmed(a => a === `l:${id}` ? null : `l:${id}`); }}
                                          aria-expanded={armed === `l:${id}`}
                                          disabled={busyId === id}
                                          title="Eliminar esta lección"
                                          aria-label={`Eliminar ${rec.lectureName} del historial`}
                                          className={deleteBtnCls}
                                        >
                                          {busyId === id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                        </button>
                                      </div>
                                      {armed === `l:${id}` && (
                                        <DeleteConfirm
                                          what="esta lección"
                                          pending={isPending(rec) ? rec.ankiCards?.length ?? 0 : 0}
                                          onDownload={isPending(rec) && canDownload ? () => { setArmed(null); void handleDownloadLecture(rec); } : undefined}
                                          onCancel={() => setArmed(null)}
                                          onConfirm={() => { setArmed(null); void handleDeleteLecture(rec); }}
                                        />
                                      )}
                                      </React.Fragment>
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
                </section>
              ) : stats && stats.totalLectures === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--usb-border)] text-center py-8 px-4 space-y-2">
                  <Icon name="history" size={22} weight="duotone" className="mx-auto text-[var(--usb-fg-mid)]" />
                  <p className="text-[13px] font-bold tracking-tight text-[var(--usb-fg-hi)]">Sin historial aún</p>
                  <p className="text-[12px] max-w-[240px] mx-auto leading-relaxed text-[var(--usb-fg-mid)]">
                    Cuando completes los 5 pasos de una lección, aparecerá aquí para que no la repitas sin darte cuenta.
                  </p>
                </div>
              )}

              {/* ── Anki: los repasos viven allí ── */}
              <section className="space-y-2" aria-label="Anki">
                <p className={`${sectionLabelCls} px-1`}>Anki</p>
                <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] divide-y divide-[var(--usb-border)]">
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 min-h-[52px]">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-[var(--usb-fg)] tabular-nums">
                        {totalDueCards} {totalDueCards === 1 ? "tarjeta exportada" : "tarjetas exportadas"}
                      </p>
                      <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">
                        {dueReviewLectures.length} {dueReviewLectures.length === 1 ? "lección" : "lecciones"} · {dueByCourse.length} {dueByCourse.length === 1 ? "curso" : "cursos"}. Kinema no ve los vencimientos: los repasos se hacen en Anki.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        window.open("anki://", "_blank");
                        celebrate({
                          type: "achievement",
                          title: "Solicitud enviada a Anki",
                          subtitle: "El navegador puede pedir permiso; abrir Anki requiere que esté instalado",
                          icon: <Repeat2 className="text-amber-400" />,
                        });
                      }}
                      className="kx-chip shrink-0 h-8 px-3 rounded-lg text-[11.5px] font-semibold inline-flex items-center gap-1.5"
                    >
                      <ExternalLink size={12} />Abrir Anki
                    </button>
                  </div>
                </div>
              </section>

              {/* ── Zona de borrado: discreta, al final ── */}
              <div className="space-y-2 pt-1">
                <div className="flex items-start justify-between gap-3 px-1">
                  <p className="text-[11px] leading-relaxed text-[var(--usb-fg-mid)]">
                    Tu progreso de estudio no expira. Borrarlo no toca lo que ya está en Anki.
                  </p>
                  <button
                    onClick={() => setArmed(a => a === "all" ? null : "all")}
                    aria-expanded={armed === "all"}
                    className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-[var(--usb-fg-mid)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 size={11} />Borrar historial
                  </button>
                </div>
                {armed === "all" && (
                  <DeleteConfirm
                    flush
                    what="todas tus lecciones"
                    extra="No afecta a la Caché ni a tu mazo de idiomas. No se puede deshacer."
                    pending={pendingTotal}
                    onCancel={() => setArmed(null)}
                    onConfirm={() => { setArmed(null); void handleClearAll(); }}
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
