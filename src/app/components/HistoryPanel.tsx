import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  History, AlertCircle, ChevronDown, ChevronRight, Trash2, BookOpen,
  RefreshCw, Loader2, X, Layers, Award, Icon, Repeat2, Check, type IconName,
} from "./icons";
import { historyService, type LectureHistoryRecord, type HistoryStats } from "../services/historyService";
import { useDockTheme } from "../contexts/ThemeContext";
import { toast } from "sonner";
import { browseAnkiDue, fetchAnkiDue } from "../services/ankiDue";
import { PendingContentExports } from "./study/MemoryCard";
import { DeleteConfirm } from "./library/DeleteConfirm";
import { LibraryCourseDetail } from "./library/LibraryCourseDetail";
import { acceptedCardCount, buildLibrary, isPendingExport } from "../services/library";
import { platformName } from "../services/platform";
import { COURSE_TOTALS_KEY, type CourseProgress, type CourseTotals } from "../services/courseTotals";
import { chromeLocalStorage } from "../services/chromeStorage";
import { loadCourseDecks } from "../services/ankiBridge";
import { defaultConceptDeck, type AnkiLayoutConfig, type CourseDeckRegistry } from "../services/ankiDestination";
import type { CourseFolderRegistry, ObsidianLayoutConfig } from "../services/obsidianDestination";

/** Lo que la Biblioteca necesita de Study (misma configuración y conexión que Fijar). */
export interface LibraryContext {
  config: AnkiLayoutConfig;
  ankiReady: boolean;
  /** Mazos reales de Anki (null = no conectado). */
  ankiDecks: string[] | null;
  /** Cambiar el mazo de un curso (registro único; con Anki, mueve lo importado). */
  onChangeCourseDeck?: (courseName: string, deck: string, moveExisting: boolean, program?: string | null) => Promise<void>;
  /** Fase 3 · con Obsidian configurado: la carpeta de cada curso (la de Fijar), el vault real y sus acciones. */
  obsidian?: LibraryObsidianContext | null;
  /** slug → título de los programas de DataCamp que conocemos. */
  programTitles?: Record<string, string>;
}

/** Obsidian en la Biblioteca: misma configuración, registro y conexión que Fijar. */
export interface LibraryObsidianContext {
  config: ObsidianLayoutConfig;
  registry: CourseFolderRegistry;
  /** Obsidian conectado (plugin Local REST API): se comprueba qué hay en el vault. */
  ready: boolean;
  /** Abre una nota (ruta del vault) en Obsidian. */
  openNote: (path: string) => void;
  /** Guarda en Obsidian lecciones terminadas sin nota (rehechas desde el historial). Devuelve cuántas. */
  saveLessons: (recs: LectureHistoryRecord[]) => Promise<number>;
  /** Cambiar la carpeta de un curso (registro único; conectado, mueve sus notas). */
  onChangeFolder: (courseName: string, folder: string, moveExisting: boolean, program?: string | null) => Promise<void>;
}

interface HistoryPanelProps {
  /** Fase 5 · enviar una lección a Anki (AnkiConnect, el mismo paquete que el cierre). Devuelve las notas que entraron. */
  onSendLesson?: (record: LectureHistoryRecord) => Promise<number>;
  /** Respaldo sin AnkiConnect: el mismo paquete, como archivo .apkg. */
  onExportLesson?: (record: LectureHistoryRecord) => Promise<void>;
  /** Optional click handler — receives a record so a parent can re-open the lecture. */
  onOpenLecture?: (rec: LectureHistoryRecord) => void;
  /** Start expanded. Useful when rendered inside a drawer. */
  defaultOpen?: boolean;
  /** Hide the collapsible toggle header — content is always visible. */
  hideToggle?: boolean;
  /** Fase 2 · Biblioteca: mazo, Anki y Obsidian de cada curso. */
  library?: LibraryContext;
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

/**
 * Anillo del curso. Con temario de la plataforma: terminadas del curso entero
 * y su porcentaje. Sin temario: terminadas de las empezadas, como fracción
 * («2/3»), para no parecer un porcentaje del curso.
 */
function CourseRing({ progress }: { progress: CourseProgress }) {
  const { t } = useDockTheme();
  const r = 13, c = 2 * Math.PI * r;
  const courseDone = progress.basis === "course" && progress.ratio >= 1;
  const ink = courseDone ? t("#4ade9f", "#047857") : t("#b7a6ff", "#5b37e8");
  return (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" strokeWidth="2.5" stroke="color-mix(in srgb, #6d4aff 16%, transparent)"
          strokeDasharray={progress.basis === "started" ? "2.4 2" : undefined} />
        <motion.circle cx="16" cy="16" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round"
          stroke={courseDone ? "#10b981" : "#6d4aff"} strokeDasharray={c} initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.max(progress.ratio, 0.03)) }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      {courseDone ? (
        <Check size={13} strokeWidth={3} style={{ color: ink }} />
      ) : (
        <span className={`${progress.label.length > 4 ? "text-[7.5px]" : progress.label.length > 3 ? "text-[8.5px]" : "text-[9.5px]"} font-bold tabular-nums tracking-tight`} style={{ color: ink }} data-course-pct>
          {progress.label}
        </span>
      )}
    </span>
  );
}

/** Texto de progreso de la fila, según lo que se sabe del curso. */
function progressText(course: { finished: number; studied: number; progress: CourseProgress }): string {
  const { progress, finished, studied } = course;
  if (progress.basis === "course") {
    const inCourse = studied - finished;
    return `${finished} de ${progress.of} lecciones${inCourse > 0 ? ` · ${inCourse} en curso` : ""}`;
  }
  return `${finished} ${finished === 1 ? "terminada" : "terminadas"} de ${studied} ${studied === 1 ? "empezada" : "empezadas"}`;
}

const sectionLabelCls = "text-[11px] font-bold uppercase tracking-wider text-[var(--usb-fg-mid)]";
const deleteBtnCls = "shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--usb-fg-mid)] hover:!text-rose-400 hover:bg-rose-500/10 transition";

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function HistoryPanel({ onOpenLecture, onSendLesson, onExportLesson, defaultOpen = false, hideToggle = false, library }: HistoryPanelProps) {
  const { t } = useDockTheme();
  const [expanded, setExpanded] = useState(defaultOpen || hideToggle);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [allLectures, setAllLectures] = useState<LectureHistoryRecord[]>([]);
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Fila con confirmación de borrado abierta: "c:<courseId>" o "l:<courseId>::<lectureId>". */
  const [armed, setArmed] = useState<string | null>(null);
  /** Repasos de hoy en Anki (AnkiConnect); null = Anki no responde. */
  const [ankiDue, setAnkiDue] = useState<number | null>(null);
  /** Mazo asignado a cada curso (el mismo registro que Fijar). */
  const [registry, setRegistry] = useState<CourseDeckRegistry>({});
  /** Total de lecciones de cada curso, leído de la plataforma (para el porcentaje del curso). */
  const [courseTotals, setCourseTotals] = useState<CourseTotals>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [s, lecs, reg, totals] = await Promise.all([
      historyService.getStats(),
      historyService.listLectures(),
      loadCourseDecks(),
      chromeLocalStorage.get([COURSE_TOTALS_KEY]).then((d) => (d[COURSE_TOTALS_KEY] as CourseTotals) ?? {}).catch(() => ({} as CourseTotals)),
    ]);
    setStats(s);
    setAllLectures(lecs);
    setRegistry(reg);
    setCourseTotals(totals);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    load();
    let alive = true;
    void fetchAnkiDue().then((d) => { if (alive) setAnkiDue(d); });
    return () => { alive = false; };
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
      }, 350);
    });
    const offStorage = chromeLocalStorage.onChange((changes) => {
      if ("usb_anki_course_decks" in changes || COURSE_TOTALS_KEY in changes) void load();
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      offStorage();
    };
  }, [expanded, load]);

  const toggleCourse = (courseId: string) => {
    setOpenCourse(current => (current === courseId ? null : courseId));
  };

  const libraryConfig: AnkiLayoutConfig = library?.config ?? { rootDeck: "Kinema" };
  const obsidianLayout = library?.obsidian ? { config: library.obsidian.config, registry: library.obsidian.registry } : null;
  const groups = useMemo(
    () => buildLibrary(allLectures.filter(l => !l.deletedAt && historyService.hasProgress(l)), { config: libraryConfig, registry, programTitles: library?.programTitles, courseTotals, obsidian: obsidianLayout }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [allLectures, registry, courseTotals, libraryConfig.rootDeck, library?.programTitles,
      obsidianLayout?.config.sourcesFolder, obsidianLayout?.config.mocsFolder, obsidianLayout?.registry],
  );
  const withPrograms = groups.some(g => g.program);

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

  // Resultado de una acción = aviso del panel (el mismo sistema que el resto de la app).
  const showFeedback = (msg: string) => { toast.success(msg); };

  const handleDeleteCourse = async (courseId: string) => {
    setBusyId(courseId);
    const n = await historyService.deleteCourse(courseId);
    if (openCourse === courseId) setOpenCourse(null);
    await load();
    setBusyId(null);
    showFeedback(`${n} ${n === 1 ? "lección eliminada" : "lecciones eliminadas"}`);
  };

  const handleDeleteLecture = async (rec: LectureHistoryRecord) => {
    const id = `${rec.courseId}::${rec.lectureId}`;
    setBusyId(id);
    await historyService.deleteLecture(rec.courseId, rec.lectureId);
    await load();
    setBusyId(null);
  };

  // Fase 5 · con Anki conectado, la lección se ENVÍA (mismo paquete, Anki confirma
  // cuántas entraron; las que ya estaban no se duplican). Sin Anki: queda el
  // archivo .apkg como respaldo (para quien no usa AnkiConnect).
  const canSend = Boolean(onSendLesson && library?.ankiReady);
  const handleDownloadLecture = async (rec: LectureHistoryRecord) => {
    if (!canSend && !onExportLesson) return;
    const id = `dl:${rec.courseId}::${rec.lectureId}`;
    setBusyId(id);
    try {
      if (canSend) {
        const added = await onSendLesson!(rec);
        await load();
        showFeedback(added > 0 ? `${added === 1 ? "1 tarjeta nueva" : `${added} tarjetas nuevas`} en Anki` : "Ya estaban en Anki");
      } else {
        await onExportLesson!(rec);
        await historyService.markExported(rec.courseId, rec.lectureId);
        await load();
        showFeedback("Archivo descargado · ábrelo para importarlo en Anki");
      }
    } catch (error) {
      toast.error(canSend ? "Anki no aceptó las tarjetas" : "No se pudo descargar", { description: error instanceof Error ? error.message : "Inténtalo de nuevo." });
    } finally {
      setBusyId(null);
    }
  };

  // Solo las aceptadas (sin las quitadas en Fijar ni las que ya estaban en el mazo): la misma regla que la Biblioteca.
  const isPending = (l: LectureHistoryRecord) => isPendingExport(l);
  const pendingInCourse = (courseId: string) => allLectures.filter(l => l.courseId === courseId && isPending(l)).reduce((n, l) => n + acceptedCardCount(l), 0);

  const pendingTotal = allLectures.filter(isPending).reduce((n, l) => n + acceptedCardCount(l), 0);

  const handleClearAll = async () => {
    try {
      await historyService.clearAll();
      setOpenCourse(null);
      await load();
      showFeedback("Historial borrado");
    } catch (error) {
      toast.error("No se pudo borrar el historial", { description: error instanceof Error ? error.message : "Inténtalo de nuevo." });
    }
  };

  const summaryText = stats
    ? `${stats.totalCourses} ${stats.totalCourses === 1 ? "curso" : "cursos"} · ${stats.completedLectures} de ${stats.totalLectures} terminadas`
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
        <span className="text-[12.5px] font-bold tracking-tight text-[var(--usb-fg-hi)]">Biblioteca</span>
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
                    aria-label="Refrescar biblioteca"
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
                    { label: "Tarjetas", value: totalDueCards, dot: "#10b981", hint: "Tarjetas de lección en Anki" },
                  ].map(({ label, value, dot, hint }) => (
                    <div key={label} className="min-w-0 px-1 py-3 text-center" title={hint}>
                      <p className="text-[19px] leading-none font-bold tabular-nums tracking-tight text-[var(--usb-fg-hi)]">{stats ? value : "–"}</p>
                      <p className="mt-2 flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-medium text-[var(--usb-fg-mid)]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />{label}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Lo que aún no está en Anki (solo si lo hay) ── */}
              {(onSendLesson || onExportLesson) && <PendingContentExports ankiReady={Boolean(library?.ankiReady)} onSendLesson={onSendLesson} onExportLesson={onExportLesson} />}

              {/* ── Biblioteca: Programa (si lo hay) → Curso → Lección, con su mazo, Anki y Obsidian ── */}
              {groups.length > 0 ? (
                <section className="space-y-2" aria-label="Cursos estudiados" data-library>
                  <p className={`${sectionLabelCls} px-1`}>Cursos estudiados</p>
                  {groups.map((group) => (
                    <div key={group.program?.slug ?? "_"} className="space-y-1.5" data-library-group={group.program?.slug ?? "none"}>
                      {withPrograms && (
                        <p className="px-1 text-[10.5px] font-semibold text-[var(--usb-fg-mid)] flex items-center gap-1.5">
                          <Icon name={group.program ? "layers" : "bookOpen"} size={12} weight="duotone" />
                          {group.program ? <>Programa · <span className="text-[var(--usb-fg)]">{group.program.title}</span></> : "Otros cursos"}
                          <span className="ml-auto tabular-nums">{group.courses.length} {group.courses.length === 1 ? "curso" : "cursos"}</span>
                        </p>
                      )}
                      <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] divide-y divide-[var(--usb-border)] overflow-hidden">
                        {group.courses.map((course) => {
                          const isOpen = openCourse === course.courseId;
                          return (
                            <div key={course.courseId} className={`transition-colors ${isOpen ? "bg-[color-mix(in_srgb,#6d4aff_5%,transparent)]" : ""}`}>
                              <div className="group flex items-center gap-1 pr-2">
                                <button
                                  onClick={() => toggleCourse(course.courseId)}
                                  aria-expanded={isOpen}
                                  data-library-course-toggle={course.courseId}
                                  title={course.progress.basis === "course"
                                    ? course.progress.label + " del curso: " + course.progress.done + " de " + course.progress.of + " lecciones (temario de " + platformName(course.progress.source) + ")"
                                    : "Aún no conozco el temario completo de este curso: se lee al abrir una de sus lecciones con Kinema. Mientras, cuento lo que empezaste."}
                                  className="flex-1 flex items-center gap-2.5 min-w-0 px-3 py-2.5 text-left"
                                >
                                  <CourseRing progress={course.progress} />
                                  <span className="flex-1 min-w-0">
                                    <span className="block text-[12.5px] font-semibold truncate text-[var(--usb-fg)]">{course.courseName}</span>
                                    <span className="block text-[11px] mt-0.5 text-[var(--usb-fg-mid)] tabular-nums truncate">
                                      {progressText(course)} · {course.cards.total} {course.cards.total === 1 ? "tarjeta" : "tarjetas"} · {formatDate(course.lastSeenAt)}
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
                                  what={`el curso y sus ${course.studied} ${course.studied === 1 ? "lección" : "lecciones"}`}
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
                                    <LibraryCourseDetail
                                      course={course}
                                      config={libraryConfig}
                                      ankiReady={Boolean(library?.ankiReady)}
                                      ankiDecks={library?.ankiDecks ?? null}
                                      defaultDeck={defaultConceptDeck(libraryConfig, course.courseName)}
                                      onChangeDeck={library?.onChangeCourseDeck ? async (deck, move) => { await library.onChangeCourseDeck!(course.courseName, deck, move, course.program?.title ?? null); await load(); } : undefined}
                                      obsidian={library?.obsidian ?? null}
                                      onObsidianChanged={load}
                                      onOpenLecture={onOpenLecture}
                                      onDownloadLecture={canSend || onExportLesson ? (rec) => void handleDownloadLecture(rec) : undefined}
                                      onDeleteLecture={(rec) => void handleDeleteLecture(rec)}
                                      busyId={busyId}
                                      armed={armed}
                                      setArmed={setArmed}
                                    />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              ) : stats && stats.totalLectures === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--usb-border)] text-center py-8 px-4 space-y-2">
                  <Icon name="history" size={22} weight="duotone" className="mx-auto text-[var(--usb-fg-mid)]" />
                  <p className="text-[13px] font-bold tracking-tight text-[var(--usb-fg-hi)]">Sin historial aún</p>
                  <p className="text-[12px] max-w-[240px] mx-auto leading-relaxed text-[var(--usb-fg-mid)]">
                    Cuando estudies una lección en Kinema, aparecerá aquí: lo que te quedó, lo que respondiste y sus tarjetas.
                  </p>
                </div>
              )}

              {/* ── Anki: los repasos viven allí ── */}
              <section className="space-y-2" aria-label="Anki">
                <p className={`${sectionLabelCls} px-1`}>Anki</p>
                <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] divide-y divide-[var(--usb-border)]">
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 min-h-[52px]">
                    <div className="min-w-0 flex-1">
                      {/* La misma cifra que «Tu progreso» (AnkiConnect, mazo raíz configurado). */}
                      <p className="text-[12.5px] font-semibold text-[var(--usb-fg)] tabular-nums">
                        {ankiDue === null
                          ? `${totalDueCards} ${totalDueCards === 1 ? "tarjeta en Anki" : "tarjetas en Anki"}`
                          : ankiDue === 0 ? "Sin repasos pendientes hoy" : `${ankiDue} ${ankiDue === 1 ? "repaso pendiente" : "repasos pendientes"} hoy`}
                      </p>
                      <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">
                        {dueReviewLectures.length} {dueReviewLectures.length === 1 ? "lección en Anki" : "lecciones en Anki"} · {dueByCourse.length} {dueByCourse.length === 1 ? "curso" : "cursos"}.{" "}
                        {ankiDue === null ? "Abre Anki para repasar (con AnkiConnect, Kinema te muestra aquí los pendientes)." : "Los repasos se hacen en Anki."}
                      </p>
                    </div>
                    {/* Solo si Anki responde: abre sus repasos de hoy. Antes, «Abrir Anki» usaba
                        anki:// (Anki de escritorio no lo registra) y celebraba un «logro» igual. */}
                    {ankiDue !== null && ankiDue > 0 && (
                      <button
                        type="button"
                        onClick={() => { void browseAnkiDue().then((ok) => { if (!ok) toast.error("Anki no respondió", { description: "Ábrelo en tu ordenador y vuelve a intentarlo." }); }); }}
                        className="kx-chip shrink-0 h-8 px-3 rounded-lg text-[11.5px] font-semibold inline-flex items-center gap-1.5"
                      >
                        <Repeat2 size={12} />Repasar en Anki
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* ── Zona de borrado: discreta, al final ── */}
              <div className="space-y-2 pt-1">
                <div className="flex items-start justify-between gap-3 px-1">
                  <p className="text-[11px] leading-relaxed text-[var(--usb-fg-mid)]">
                    El historial no expira. Borrarlo no cambia tu nivel ni tu XP, ni lo que ya está en Anki.
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
