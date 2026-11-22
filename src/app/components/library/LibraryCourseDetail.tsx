/**
 * Biblioteca · un curso abierto (fase 2).
 *
 * Lo que hay de este curso en Kinema, en Anki y en Obsidian, con las mismas
 * fuentes que Fijar: el mazo sale de ankiDestination + registro (y se cambia
 * con el mismo selector), y las cifras de Anki con las mismas búsquedas que
 * los repasos pendientes. Sin Anki conectado no se inventa ninguna cifra: se
 * muestran las del historial y se dice de dónde salen.
 */
import React, { useEffect, useState } from "react";
import {
  BookMarked, Check, CheckCircle2, ChevronDown, Circle, Download, ExternalLink, Loader2, RefreshCw, Repeat2, Send, Trash2,
} from "../icons";
import { useDockTheme } from "../../contexts/ThemeContext";
import type { LectureHistoryRecord } from "../../services/historyService";
import type { AnkiLayoutConfig } from "../../services/ankiDestination";
import {
  LESSON_QUERY_LIMIT, courseAnkiQueries, filterCounts, filterLessons, lessonAnkiQueries,
  type CourseAnkiCounts, type LessonFilter, type LibraryCourse, type LibraryLesson,
} from "../../services/library";
import { ankiBrowse, ankiCounts } from "../../services/ankiBridge";
import { AnkiDeckPicker } from "../study/AnkiDeckPicker";
import { ObsidianFolderPicker } from "../study/ObsidianFolderPicker";
import { obsidianListFolder } from "../../services/obsidianBridge";
import { acceptedCardCount, courseVaultState, isWaitingForAnki, obsidianFoldersToCheck, type CourseVaultState, type NoteState } from "../../services/library";
import { vaultSlug } from "../../services/obsidianDestination";
import type { LibraryObsidianContext } from "../HistoryPanel";
import { DeleteConfirm } from "./DeleteConfirm";
import { toast } from "sonner";

// Lo que elegiste en Recordar, con las MISMAS palabras que allí.
const CLARITY: Record<string, string> = { confused: "Confuso", partial: "Más o menos", clear: "Entendido", mastered: "Lo domino" };
const deleteBtnCls = "shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--usb-fg-mid)] hover:!text-rose-400 hover:bg-rose-500/10 transition";
const chipBtnCls = "kx-chip h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5";

const FILTERS: { id: LessonFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "reinforce", label: "Refuerzo" },
  { id: "doubt", label: "Dudas" },
  { id: "interview", label: "Entrevista" },
  { id: "pending", label: "Sin enviar" },
];

export function LibraryCourseDetail({
  course, config, ankiReady, ankiDecks, defaultDeck, onChangeDeck, obsidian, onObsidianChanged,
  onOpenLecture, onDownloadLecture, onDeleteLecture, busyId, armed, setArmed,
}: {
  course: LibraryCourse<LectureHistoryRecord>;
  config: AnkiLayoutConfig;
  ankiReady: boolean;
  ankiDecks: string[] | null;
  /** El mazo de Kinema para este curso (para «volver al de Kinema»). */
  defaultDeck: string;
  /** Cambiar el mazo de TODO el curso (el mismo flujo que Fijar). */
  onChangeDeck?: (deck: string, moveExisting: boolean) => Promise<void>;
  /** Fase 3 · con Obsidian configurado: carpeta del curso, vault real y acciones (las de Fijar). */
  obsidian?: LibraryObsidianContext | null;
  /** Tras guardar o mover notas: recargar el historial. */
  onObsidianChanged?: () => void;
  onOpenLecture?: (rec: LectureHistoryRecord) => void;
  onDownloadLecture?: (rec: LectureHistoryRecord) => void;
  onDeleteLecture: (rec: LectureHistoryRecord) => void;
  busyId: string | null;
  armed: string | null;
  setArmed: (next: string | null) => void;
}) {
  const { t } = useDockTheme();
  const [filter, setFilter] = useState<LessonFilter>("all");
  const [counts, setCounts] = useState<CourseAnkiCounts | null>(null);
  const [countsState, setCountsState] = useState<"idle" | "loading" | "error">("idle");
  const [nonce, setNonce] = useState(0);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  /** Lo que hay de verdad en el vault (solo con Obsidian conectado). */
  const [vault, setVault] = useState<CourseVaultState | null>(null);
  const [vaultState, setVaultState] = useState<"idle" | "loading" | "error">("idle");
  const [vaultNonce, setVaultNonce] = useState(0);
  const [savingNotes, setSavingNotes] = useState<string | null>(null);

  // Una petición por carpeta (no por nota): la del índice y las de sus notas.
  useEffect(() => {
    if (!obsidian?.ready || !course.obsidian) { setVault(null); setVaultState("idle"); return; }
    let alive = true;
    const folders = obsidianFoldersToCheck(course);
    setVaultState("loading");
    void Promise.all(folders.map((f) => obsidianListFolder(f).then((files) => [f, files] as const)))
      .then((pairs) => { if (alive) { setVault(courseVaultState(course, Object.fromEntries(pairs))); setVaultState("idle"); } })
      .catch(() => { if (alive) { setVault(null); setVaultState("error"); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obsidian?.ready, course.courseId, course.obsidian?.folder, course.inObsidian, vaultNonce]);

  /** Guardar en Obsidian: lecciones sin nota (o cuya nota ya no está en el vault). */
  const saveNotes = async (recs: LectureHistoryRecord[], busyKey: string) => {
    if (!obsidian || recs.length === 0) return;
    setSavingNotes(busyKey);
    try {
      const saved = await obsidian.saveLessons(recs);
      toast.success(saved === 1 ? "Nota guardada en Obsidian" : `${saved} notas guardadas en Obsidian`, {
        description: course.obsidian ? `En ${course.obsidian.folder}/, rehechas desde tu historial.` : undefined,
      });
      onObsidianChanged?.();
      setVaultNonce((n) => n + 1);
    } catch (error) {
      toast.error("No se pudo guardar en Obsidian", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setSavingNotes(null);
    }
  };
  const missingRecs = (vault ? course.lessons.filter((l) => vault.notes[l.rec.lectureId] === "missing" && (l.obsidianSavable || (l.inObsidian && l.rec.studyContent))) : course.lessons.filter((l) => l.obsidianSavable)).map((l) => l.rec);

  // Cifras reales de Anki: una sola llamada por curso abierto (y por «Actualizar»).
  useEffect(() => {
    if (!ankiReady) { setCounts(null); setCountsState("idle"); return; }
    let alive = true;
    const q = courseAnkiQueries(course, config);
    const counted = course.lessons.filter((l) => l.inAnki).slice(0, LESSON_QUERY_LIMIT);
    setCountsState("loading");
    void ankiCounts([q.cards, q.due, q.fresh, q.learning, q.relearning, q.reinforce, q.suspended, ...counted.map((l) => lessonAnkiQueries(l.rec, config).due)]).then((res) => {
      if (!alive) return;
      // -1 = esa búsqueda no se pudo hacer: mejor «no respondió» que una cifra falsa.
      if (!res || res.slice(0, 7).some((n) => n < 0)) { setCounts(null); setCountsState("error"); return; }
      const [cards, due, fresh, learning, relearning, reinforce, suspended, ...perLesson] = res;
      setCounts({ cards, due, fresh, learning, relearning, reinforce, suspended, lessonDue: Object.fromEntries(counted.map((l, i) => [l.rec.lectureId, perLesson[i] ?? -1])) });
      setCountsState("idle");
    });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ankiReady, course.courseId, course.deck.deck, nonce]);

  const queries = courseAnkiQueries(course, config);
  const browse = (query: string) => { void ankiBrowse(query).then((ok) => { if (!ok) toast.error("Anki no respondió", { description: "Ábrelo en tu ordenador y vuelve a intentarlo." }); }); };
  const byFilter = filterCounts(course.lessons);
  const lessons = filterLessons(course.lessons, filter);
  const otherDecks = course.decksUsed.filter((d) => d !== course.deck.deck);
  const hasFilters = FILTERS.slice(1).some((f) => byFilter[f.id] > 0);
  const accent = t("#b7a6ff", "#5b37e8");

  return (
    <div className="px-2 pb-2 space-y-2.5" data-library-course={course.courseId}>
      {/* Mazo del curso: el mismo selector que Fijar (registro único, sin repartir el curso). */}
      {onChangeDeck ? (
        <AnkiDeckPicker
          key={`${course.courseId}|${course.deck.deck}`}
          deck={course.deck.deck}
          defaultDeck={defaultDeck}
          owned={course.deck.owned}
          decks={ankiDecks}
          canMove={ankiReady}
          onSave={async (deck, move) => { await onChangeDeck(deck, move); setNonce((n) => n + 1); }}
        />
      ) : (
        <p className="px-1 text-[10.5px] text-[var(--usb-fg-mid)] leading-snug" data-library-deck>
          Mazo: <span className="font-mono text-[var(--usb-fg-hi)] [overflow-wrap:anywhere]">{course.deck.deck}</span>
        </p>
      )}
      {otherDecks.length > 0 && (
        <p className="px-1 text-[10.5px] leading-snug text-[var(--usb-fg-mid)]">
          Algunas lecciones fueron a {otherDecks.map((d, i) => <React.Fragment key={d}>{i > 0 ? ", " : ""}<span className="font-mono [overflow-wrap:anywhere]">{d}</span></React.Fragment>)}.
        </p>
      )}

      {/* Programas: uno principal; los demás son etiquetas (el curso no se duplica). */}
      {course.program && (
        <p className="px-1 text-[10.5px] leading-snug text-[var(--usb-fg-mid)]" data-library-programs>
          Programa: <span className="font-semibold text-[var(--usb-fg)]">{course.program.title}</span>
          {course.otherPrograms.length > 0 && <> · también en {course.otherPrograms.map((p) => p.title).join(", ")} (por etiqueta, sin duplicar tarjetas)</>}
        </p>
      )}

      {/* Fase 4: lo que no se duplicó (ideas que ya estaban en el mazo al estudiarlas). */}
      {course.inDeckIdeas > 0 && (
        <p className="px-1 text-[10.5px] leading-snug text-[var(--usb-fg-mid)]" data-library-in-deck-course>
          {course.inDeckIdeas === 1 ? "1 idea ya estaba" : `${course.inDeckIdeas} ideas ya estaban`} en tu mazo al estudiar{course.inDeckIdeas === 1 ? "la" : "las"}: se practicaron sin duplicar tarjetas.
        </p>
      )}

      {/* Cifras: las del historial siempre; las de Anki solo si Anki responde. */}
      <div className="rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] overflow-hidden" data-library-stats>
        <div className="grid grid-cols-4 divide-x divide-[var(--usb-border)]">
          {[
            { label: "Tarjetas", value: course.cards.total },
            { label: "Refuerzo", value: course.cards.reinforce },
            { label: "Dudas", value: course.cards.doubt },
            { label: "En Anki", value: course.cards.inAnki },
          ].map((tile) => (
            <div key={tile.label} className="px-1 py-2 text-center min-w-0">
              <p className="text-[15px] leading-none font-bold tabular-nums text-[var(--usb-fg-hi)]">{tile.value}</p>
              <p className="mt-1 text-[9.5px] font-medium text-[var(--usb-fg-mid)] truncate">{tile.label}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--usb-border)] px-2.5 py-2 flex items-center gap-2" data-library-anki>
          {!ankiReady ? (
            <p className="flex-1 text-[10.5px] leading-snug text-[var(--usb-fg-mid)]">Cifras de tu historial. Con Anki abierto y conectado verás aquí las tarjetas reales del curso.</p>
          ) : countsState === "loading" && !counts ? (
            <p className="flex-1 text-[10.5px] text-[var(--usb-fg-mid)] inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />Preguntando a Anki…</p>
          ) : counts ? (
            <div className="flex-1 min-w-0" data-library-anki-counts>
              <div className="flex items-center gap-2">
                <p className="flex-1 min-w-0 text-[10.5px] leading-snug text-[var(--usb-fg)]">
                  En tu Anki
                  {counts.reinforce > 0 ? <span className="text-[var(--usb-fg-mid)]"> · {counts.reinforce} de refuerzo</span> : null}
                  {counts.suspended > 0 ? <span className="text-[var(--usb-fg-mid)]" title="Cuentan en el total, no en el desglose ni en «Para hoy»" data-anki-suspended> · {counts.suspended} {counts.suspended === 1 ? "suspendida" : "suspendidas"}</span> : null}
                </p>
                <button type="button" onClick={() => setNonce((n) => n + 1)} aria-label="Actualizar las cifras de Anki" title="Actualizar"
                  className="w-7 h-7 -my-1 -mr-1 shrink-0 flex items-center justify-center rounded-lg text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-accent-soft)]">
                  <RefreshCw size={11} className={countsState === "loading" ? "animate-spin" : ""} />
                </button>
              </div>
              {/* Arriba, lo que mira el estudiante cada día; abajo, el desglose de la cola de aprendizaje. */}
              <dl className="mt-1.5 grid grid-cols-6 gap-1">
                {[
                  { label: "Total", value: counts.cards, key: "cards", hint: "Tarjetas de conceptos de este curso en Anki" },
                  { label: "Nuevas", value: counts.fresh, key: "fresh", hint: "Aún sin estudiar en Anki (sin contar suspendidas)" },
                  { label: "Para hoy", value: counts.due, key: "due", hint: "Repasos y pasos de aprendizaje que tocan hoy" },
                  { label: "Aprendiendo", value: counts.learning, key: "learning", hint: "En sus primeros pasos, antes de graduarse" },
                  { label: "Reaprendiendo", value: counts.relearning, key: "relearning", hint: "Olvidadas en un repaso; vuelven a aprenderse" },
                ].map((cell, i) => {
                  const hot = cell.key === "due" && cell.value > 0;
                  const top = i < 3;
                  return (
                    <div key={cell.key} data-anki-count={cell.key} title={cell.hint}
                      className={`${top ? "col-span-2 flex-col-reverse text-center py-1" : "col-span-3 flex-row-reverse items-baseline justify-end gap-1.5 px-2 py-1"} flex rounded-md min-w-0 ${hot ? "bg-emerald-500/10" : "bg-[var(--usb-bg-2)]"}`}>
                      <dt className={`${top ? "mt-0.5" : ""} text-[9.5px] font-medium text-[var(--usb-fg-mid)] truncate`}>{cell.label}</dt>
                      <dd className={`${top ? "text-[13px]" : "text-[11.5px]"} leading-none font-bold tabular-nums ${hot ? "text-[var(--usb-ok-text)]" : "text-[var(--usb-fg-hi)]"}`}>{cell.value}</dd>
                    </div>
                  );
                })}
              </dl>
              {counts.cards === 0 && course.cards.inAnki > 0 && (
                <p className="mt-1.5 text-[10px] leading-snug text-[var(--usb-warn-text)]">Anki no tiene tarjetas de este curso. ¿Las borraste o estás en otro perfil?</p>
              )}
            </div>
          ) : (
            <p className="flex-1 text-[10.5px] leading-snug text-[var(--usb-fg-mid)]">Anki no respondió. Las cifras son las de tu historial.</p>
          )}
        </div>
        {ankiReady && counts && (
          <div className="border-t border-[var(--usb-border)] px-2.5 py-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => browse(queries.cards)} className={chipBtnCls}><ExternalLink size={11} />Abrir en Anki</button>
            {counts.due > 0 && <button type="button" onClick={() => browse(queries.due)} className={chipBtnCls}><Repeat2 size={11} />Repasar hoy ({counts.due})</button>}
          </div>
        )}
      </div>

      {/* Obsidian (fase 3): la carpeta del curso (el mismo control que Fijar), cuántas
          lecciones tienen nota y, con Obsidian conectado, lo que hay de verdad en el vault. */}
      <div className="space-y-1.5" data-library-obsidian>
        {obsidian && course.obsidian && (
          <ObsidianFolderPicker
            key={`${course.courseId}|${course.obsidian.folder}`}
            folder={course.obsidian.folder}
            defaultFolder={course.obsidian.defaultFolder}
            fileName={`${vaultSlug(course.courseName)}---‹lección›.md`}
            assigned={course.obsidian.assigned}
            notes={course.inObsidian}
            canMove={obsidian.ready}
            onSave={async (folder, move) => { await obsidian.onChangeFolder(course.courseName, folder, move, course.program?.slug ?? null); onObsidianChanged?.(); setVaultNonce((n) => n + 1); }}
          />
        )}
        <div className="px-1 flex items-center gap-2">
          <BookMarked size={12} className="shrink-0 text-[var(--usb-fg-mid)]" aria-hidden="true" />
          <p className="flex-1 min-w-0 text-[10.5px] leading-snug text-[var(--usb-fg-mid)]" data-library-obsidian-count>
            {course.inObsidian === 0 ? "Ninguna lección en Obsidian todavía." : `${course.inObsidian} de ${course.studied} ${course.studied === 1 ? "lección" : "lecciones"} en Obsidian.`}
            {vault && (
              <span className={vault.missing > 0 ? "text-[var(--usb-warn-text)]" : ""} data-library-vault-check>
                {vault.missing > 0 ? ` ${vault.missing} ya no ${vault.missing === 1 ? "está" : "están"} en el vault.` : " Comprobado en el vault."}
              </span>
            )}
            {obsidian?.ready && vaultState === "loading" && !vault && <span> Mirando el vault…</span>}
            {obsidian?.ready && vaultState === "error" && <span> Obsidian no respondió.</span>}
          </p>
          {obsidian?.ready && course.obsidian && (
            <button type="button" onClick={() => setVaultNonce((n) => n + 1)} aria-label="Volver a mirar el vault" title="Volver a mirar el vault"
              className="w-7 h-7 -my-1 shrink-0 flex items-center justify-center rounded-lg text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-accent-soft)]">
              <RefreshCw size={11} className={vaultState === "loading" ? "animate-spin" : ""} />
            </button>
          )}
        </div>
        {obsidian && course.obsidian && ((vault ? vault.mocExists : course.inObsidian > 0) || (obsidian.ready && missingRecs.length > 0)) && (
          <div className="px-1 flex flex-wrap gap-1.5">
            {(vault ? vault.mocExists : course.inObsidian > 0) && (
              <button type="button" onClick={() => obsidian.openNote(course.obsidian!.mocPath)} className={chipBtnCls} data-library-open-index>
                <ExternalLink size={11} />Abrir índice
              </button>
            )}
            {obsidian.ready && missingRecs.length > 0 && (
              <button type="button" onClick={() => void saveNotes(missingRecs, "course")} disabled={savingNotes !== null} className={chipBtnCls} data-library-save-notes>
                {savingNotes === "course" ? <Loader2 size={11} className="animate-spin" /> : <BookMarked size={11} />}
                {missingRecs.length === 1 ? "Guardar la nota que falta" : `Guardar las ${missingRecs.length} notas que faltan`}
              </button>
            )}
          </div>
        )}
        {obsidian && course.obsidian && vault && !vault.mocExists && course.inObsidian > 0 && (
          <p className="px-1 text-[10px] leading-snug text-[var(--usb-fg-mid)]">El índice del curso aún no está en el vault: se crea solo con la próxima nota.</p>
        )}
        {obsidian && course.obsidian && !obsidian.ready && course.obsidian.savable > 0 && (
          <p className="px-1 text-[10px] leading-snug text-[var(--usb-fg-mid)]">
            {course.obsidian.savable === 1 ? "1 lección terminada no tiene nota" : `${course.obsidian.savable} lecciones terminadas no tienen nota`}: guárdala desde su detalle (con Obsidian conectado, todas de una vez).
          </p>
        )}
      </div>

      {hasFilters && (
        <div className="flex flex-wrap gap-1.5 px-1" role="group" aria-label="Filtrar lecciones" data-library-filters>
          {FILTERS.filter((f) => f.id === "all" || byFilter[f.id] > 0).map((f) => {
            const on = filter === f.id;
            return (
              <button key={f.id} type="button" aria-pressed={on} onClick={() => setFilter(f.id)}
                className={`h-6 px-2 rounded-full border text-[10.5px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${on ? "border-violet-500/55 bg-violet-500/12 text-[var(--usb-fg-hi)]" : "border-[var(--usb-border)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)]"}`}>
                {f.label} {byFilter[f.id]}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-0.5">
        {lessons.length === 0 && <p className="text-[11px] py-2 text-center text-[var(--usb-fg-mid)]">Ninguna lección con este filtro.</p>}
        {lessons.map((lesson) => (
          <LessonRow
            key={lesson.rec.lectureId}
            lesson={lesson}
            config={config}
            accent={accent}
            ankiReady={ankiReady}
            due={counts?.lessonDue[lesson.rec.lectureId]}
            open={openLesson === lesson.rec.lectureId}
            onToggle={() => setOpenLesson((v) => (v === lesson.rec.lectureId ? null : lesson.rec.lectureId))}
            onBrowse={browse}
            obsidian={obsidian}
            noteState={vault?.notes[lesson.rec.lectureId]}
            onSaveNote={obsidian ? () => void saveNotes([lesson.rec], `l:${lesson.rec.lectureId}`) : undefined}
            savingNote={savingNotes === `l:${lesson.rec.lectureId}`}
            onOpenLecture={onOpenLecture}
            onDownloadLecture={onDownloadLecture}
            onDeleteLecture={onDeleteLecture}
            busyId={busyId}
            armed={armed}
            setArmed={setArmed}
          />
        ))}
      </div>
    </div>
  );
}

function LessonRow({
  lesson, config, accent, ankiReady, due, open, onToggle, onBrowse, obsidian, noteState, onSaveNote, savingNote, onOpenLecture, onDownloadLecture, onDeleteLecture, busyId, armed, setArmed,
}: {
  lesson: LibraryLesson<LectureHistoryRecord>;
  config: AnkiLayoutConfig;
  accent: string;
  ankiReady: boolean;
  due?: number;
  open: boolean;
  onToggle: () => void;
  onBrowse: (query: string) => void;
  obsidian?: LibraryObsidianContext | null;
  /** Con Obsidian conectado: ¿su nota está en el vault? */
  noteState?: NoteState;
  onSaveNote?: () => void;
  savingNote?: boolean;
  onOpenLecture?: (rec: LectureHistoryRecord) => void;
  onDownloadLecture?: (rec: LectureHistoryRecord) => void;
  onDeleteLecture: (rec: LectureHistoryRecord) => void;
  busyId: string | null;
  armed: string | null;
  setArmed: (next: string | null) => void;
}) {
  const { t } = useDockTheme();
  const { rec, cards } = lesson;
  const id = `${rec.courseId}::${rec.lectureId}`;
  // Solo se puede (re)enviar si las tarjetas siguen guardadas, no solo su conteo.
  // Fase 5: con Anki conectado se envía (Anki confirma); sin él, el respaldo es el .apkg.
  const canDownload = Boolean(onDownloadLecture) && acceptedCardCount(rec) > 0;
  const waiting = isWaitingForAnki(rec);
  const answered = rec.questions.filter((a) => (a.answer ?? "").trim() || a.rating).length;
  const lq = lessonAnkiQueries(rec, config);
  return (
    <div data-library-lesson={rec.lectureId}>
      {/* Abrir la lección es un botón propio: las demás acciones son hermanas, no hijas. */}
      <div className={`group flex items-start gap-2.5 py-2 pl-2.5 pr-1 rounded-lg transition-colors ${onOpenLecture ? "hover:bg-[var(--usb-accent-soft)]" : ""}`}>
        {lesson.finished
          ? <CheckCircle2 size={15} className="shrink-0 mt-px" style={{ color: t("#4ade9f", "#047857") }} aria-label="Completa" />
          : <Circle size={15} className="shrink-0 mt-px text-[var(--usb-fg-mid)]" aria-label="En curso" />}
        <div className="flex-1 min-w-0">
          {(() => {
            const body = (
              <>
                <span className="block text-[12px] font-semibold truncate text-[var(--usb-fg)]">{rec.lectureName}</span>
                <span className="block mt-1 text-[10.5px] text-[var(--usb-fg-mid)] tabular-nums truncate" title="Qué tan claro te quedó (lo que elegiste en Recordar) · preguntas respondidas">
                  {rec.confidence && CLARITY[rec.confidence] ? CLARITY[rec.confidence] : lesson.finished ? "Terminada" : "Sin empezar"} · {answered === 1 ? "1 respondida" : `${answered} respondidas`}
                </span>
              </>
            );
            return onOpenLecture ? (
              <button type="button" onClick={() => onOpenLecture(rec)} title={`Abrir «${rec.lectureName}» en Study`}
                className="block w-full min-w-0 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a48bff]">
                {body}
              </button>
            ) : <div className="min-w-0">{body}</div>;
          })()}
          {(cards.total > 0 || cards.reinforce > 0 || cards.doubt > 0 || cards.interview > 0 || lesson.inDeck.length > 0 || lesson.inObsidian || (due ?? 0) > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1" data-library-badges>
              {cards.total > 0 && (lesson.inAnki ? (
                <button
                  type="button"
                  onClick={() => { if (canDownload) onDownloadLecture?.(rec); }}
                  disabled={!canDownload || busyId === `dl:${id}`}
                  title={!canDownload ? "Ya están en Anki" : ankiReady ? "Ya están en Anki. ¿Borraste alguna? Clic para enviarlas otra vez (las que siguen allí no se duplican)." : "Ya están en Anki. Sin Anki conectado: clic para descargar el .apkg de nuevo."}
                  aria-label={`${cards.total} tarjetas ya en Anki. ${ankiReady ? "Enviar" : "Descargar"} de nuevo`}
                  className={`shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-opacity enabled:hover:opacity-80 disabled:cursor-default ${t("bg-emerald-400/10 text-emerald-300", "bg-emerald-600/10")}`}
                  // Tema claro: tinta más oscura que el verde general (#047857 daba 4,2:1 sobre el fondo verde de la insignia).
                  style={{ color: t("", "#065f46") || undefined }}
                >
                  {busyId === `dl:${id}` ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}{cards.total} en Anki
                </button>
              ) : lesson.finished && canDownload && (ankiReady || !waiting) ? (
                <button
                  type="button"
                  onClick={() => onDownloadLecture?.(rec)}
                  disabled={busyId === `dl:${id}`}
                  data-library-send={rec.lectureId}
                  title={ankiReady ? "Envía sus tarjetas a Anki (las que ya tengas no se duplican)" : "Sin Anki conectado: descarga el .apkg y ábrelo con doble clic para importarlo"}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[#6d4aff]/35 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors hover:bg-[color-mix(in_srgb,#6d4aff_12%,transparent)]"
                  style={{ color: accent }}
                >
                  {busyId === `dl:${id}` ? <Loader2 size={10} className="animate-spin" /> : ankiReady ? <Send size={10} /> : <Download size={10} />}
                  {ankiReady ? `Enviar ${cards.total}` : `Descargar ${cards.total}`}
                </button>
              ) : (
                <span
                  title={waiting ? "Terminaste la lección sin Anki abierto: sus tarjetas se envían solas en cuanto Anki responda" : lesson.finished ? "Las tarjetas de esta lección ya no están guardadas; vuelve a abrirla para generarlas" : "Llegan a Anki solas al terminar la lección"}
                  className="shrink-0 rounded-md bg-[var(--usb-bg-3)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--usb-fg-mid)]"
                  data-library-waiting={waiting ? rec.lectureId : undefined}
                >
                  {cards.total} {waiting ? "esperan a Anki" : lesson.finished ? "tarjetas" : "al terminar"}
                </span>
              ))}
              {cards.reinforce > 0 && <span className="rounded px-1 text-[9.5px] font-semibold border border-amber-500/30 text-[var(--usb-warn-text)]">{cards.reinforce} refuerzo</span>}
              {cards.doubt > 0 && <span className="rounded px-1 text-[9.5px] font-semibold border border-violet-500/30" style={{ color: accent }}>{cards.doubt} {cards.doubt === 1 ? "duda" : "dudas"}</span>}
              {cards.interview > 0 && <span className={`rounded px-1 text-[9.5px] font-semibold border border-sky-500/30 ${t("text-sky-300", "text-sky-800")}`}>entrevista</span>}
              {lesson.inDeck.length > 0 && (
                <span className="rounded px-1 text-[9.5px] font-semibold border border-[var(--usb-border)] text-[var(--usb-fg-mid)]" data-library-in-deck
                  title="Ideas que ya tenías en tu mazo: se practicaron sin crear otra tarjeta">
                  {lesson.inDeck.length} ya en tu mazo
                </span>
              )}
              {lesson.inObsidian && noteState !== "missing" && <span className="rounded px-1 text-[9.5px] font-semibold border border-[var(--usb-border)] text-[var(--usb-fg-mid)]" data-note-state={noteState ?? "recorded"}>en Obsidian</span>}
              {lesson.inObsidian && noteState === "missing" && <span className="rounded px-1 text-[9.5px] font-semibold border border-amber-500/30 text-[var(--usb-warn-text)]" data-note-state="missing" title="Kinema la guardó, pero ya no está en esa carpeta del vault (¿la borraste o la moviste a mano?)">no está en el vault</span>}
              {(due ?? 0) > 0 && <span className="rounded px-1 text-[9.5px] font-semibold border border-emerald-500/30 text-[var(--usb-ok-text)] tabular-nums">{due} para hoy</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`Detalle de ${rec.lectureName}`}
          title="Etiquetas y acciones"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-accent-soft)] transition"
        >
          <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <button
          onClick={() => setArmed(armed === `l:${id}` ? null : `l:${id}`)}
          aria-expanded={armed === `l:${id}`}
          disabled={busyId === id}
          title="Eliminar esta lección"
          aria-label={`Eliminar ${rec.lectureName} del historial`}
          className={deleteBtnCls}
        >
          {busyId === id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
        </button>
      </div>
      {open && (
        <div className="ml-7 mr-1 mb-2 rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-2.5 py-2 space-y-1.5" data-library-lesson-detail>
          <p className="text-[10px] font-semibold text-[var(--usb-fg-mid)]">Etiquetas en Anki</p>
          <ul className="flex flex-wrap gap-1" aria-label="Etiquetas de sus tarjetas en Anki">
            {lesson.tags.map((tag) => (
              <li key={tag} data-library-tag className="rounded border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-1 font-mono text-[10px] leading-relaxed text-[var(--usb-fg)] [overflow-wrap:anywhere] select-all" title="Clic para seleccionarla y buscarla en Anki">{tag}</li>
            ))}
          </ul>
          {rec.ankiDeck && <p className="text-[10px] text-[var(--usb-fg-mid)]">En el mazo <span className="font-mono [overflow-wrap:anywhere]">{rec.ankiDeck}</span></p>}
          {lesson.inDeck.length > 0 && (
            <div className="space-y-0.5" data-library-in-deck-detail>
              <p className="text-[10px] font-semibold text-[var(--usb-fg-mid)]">Ya estaban en tu mazo (sin tarjeta nueva)</p>
              <ul className="space-y-0.5">
                {lesson.inDeck.map((m) => (
                  <li key={m.idea} className="text-[10px] leading-snug text-[var(--usb-fg)]">
                    {m.front} <span className="text-[var(--usb-fg-mid)]">· {m.sameLesson ? "de una sesión anterior" : `de «${m.lesson}»${m.course ? ` (curso «${m.course}»)` : ""}`}{m.rescheduledAt ? " · adelantada a hoy en Anki" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {obsidian && lesson.notePath && (lesson.inObsidian || lesson.obsidianSavable) && (
            <p className="text-[10px] text-[var(--usb-fg-mid)]" data-library-note-path>
              {lesson.inObsidian ? "Nota" : "Su nota iría a"} <span className="font-mono [overflow-wrap:anywhere]">{lesson.notePath}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {ankiReady && lesson.inAnki && <button type="button" onClick={() => onBrowse(lq.cards)} className={chipBtnCls}><ExternalLink size={11} />Ver en Anki</button>}
            {obsidian && lesson.notePath && lesson.inObsidian && noteState !== "missing" && <button type="button" onClick={() => obsidian.openNote(lesson.notePath!)} className={chipBtnCls}><BookMarked size={11} />Abrir nota</button>}
            {onSaveNote && Boolean(rec.studyContent) && (lesson.obsidianSavable || noteState === "missing") && (
              <button type="button" onClick={onSaveNote} disabled={savingNote} className={chipBtnCls} data-library-save-note>
                {savingNote ? <Loader2 size={11} className="animate-spin" /> : <BookMarked size={11} />}{noteState === "missing" ? "Guardar otra vez" : "Guardar nota"}
              </button>
            )}
          </div>
        </div>
      )}
      {armed === `l:${id}` && (
        <DeleteConfirm
          what="esta lección"
          pending={lesson.pending ? acceptedCardCount(rec) : 0}
          onDownload={lesson.pending && canDownload ? () => { setArmed(null); onDownloadLecture?.(rec); } : undefined}
          downloadLabel={ankiReady ? "Enviar a Anki primero" : "Descargar primero"}
          onCancel={() => setArmed(null)}
          onConfirm={() => { setArmed(null); onDeleteLecture(rec); }}
        />
      )}
    </div>
  );
}
