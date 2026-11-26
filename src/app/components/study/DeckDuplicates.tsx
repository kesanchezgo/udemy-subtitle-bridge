/**
 * Fase 4 · Fijar: «N ideas ya estaban en tu mazo».
 *
 * Lo que ya tienes en Anki no se duplica: la idea se practicó igual en
 * Recordar y Comprobar, pero su tarjeta de hoy queda fuera del paquete salvo
 * «Añadir igualmente». Si hoy no te salió y Anki está conectado, «Repasar hoy
 * en Anki» pone para hoy la tarjeta que ya tienes — solo al pulsarlo y solo si
 * está en repaso y activa; las demás dicen por qué no se tocan.
 */
import React from "react";
import { renderStudyInline } from "./inlineFormat";
import { Check, CheckCircle2, ExternalLink, Layers, Loader2, Plus, Repeat2 } from "../icons";
import type { CardReviewState } from "../../services/ankiConnectOps";
import type { DeckSource } from "../../services/deckConcepts";

export interface DeckDupRow {
  idea: number;
  /** La pista de la idea («Título»). */
  title: string;
  /** La tarjeta que ya tienes (texto del frente). */
  front: string;
  lesson: string;
  /** Su curso, si no es el de esta sesión (otro curso del programa u otro tuyo). */
  course?: string;
  sameLesson: boolean;
  /** Hoy no salió: «No del todo» en Recordar o fallada en Comprobar. */
  weak: boolean;
  /** Su tarjeta de esta sesión (fuera del paquete salvo «Añadir igualmente»). */
  card: { id: string; added: boolean } | null;
  /** Otra tarjeta incluida de esta lección también la repasa (p. ej. la de síntesis). */
  alsoInLesson: boolean;
  /** Estado de la tarjeta que ya tienes en Anki (solo con Anki conectado). */
  state?: CardReviewState;
  /** «Repasar hoy en Anki» ya la puso para hoy. */
  rescheduled: boolean;
  /** Nota de Anki, si se conoce («Ver en Anki»). */
  noteId?: number;
}

const STATE_TEXT: Record<CardReviewState, string> = {
  review: "En repaso en Anki: se puede adelantar a hoy.",
  due: "Ya te toca hoy en Anki.",
  new: "En Anki aún es nueva: no tiene calendario que adelantar.",
  learning: "En Anki está en aprendizaje: vuelve en minutos u horas.",
  inactive: "En Anki está suspendida o enterrada: Kinema no la reactiva.",
  foreign: "No es una tarjeta de conceptos de Kinema: no se toca.",
  missing: "No está en tu Anki (¿la borraste o es otro perfil?).",
};

export function DeckDuplicates({
  rows,
  extraCards,
  source,
  ankiReady,
  reviewable,
  reviewBusy,
  onToggleCard,
  onReviewToday,
  onBrowse,
}: {
  rows: DeckDupRow[];
  /** Tarjetas sin idea con el mismo frente que una del mazo (también fuera del paquete). */
  extraCards: number;
  source: DeckSource;
  ankiReady: boolean;
  /** Cuántas de las que hoy no salieron se pueden poner para hoy (en repaso y activas). */
  reviewable: number;
  reviewBusy: boolean;
  onToggleCard: (id: string) => void;
  onReviewToday: () => void;
  onBrowse?: (noteId: number) => void;
}) {
  if (rows.length === 0 && extraCards === 0) return null;
  const n = rows.length;
  const heading = n > 0
    ? `${n} ${n === 1 ? "idea ya estaba" : "ideas ya estaban"} en tu mazo`
    : `${extraCards} ${extraCards === 1 ? "tarjeta ya estaba" : "tarjetas ya estaban"} en tu mazo`;
  return (
    <div className="rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2.5 space-y-2" data-deck-dups data-deck-source={source}>
      <div className="flex items-center gap-1.5">
        <Layers size={12} className="text-[var(--usb-info-text)] shrink-0" aria-hidden="true" />
        <p className="kx-slate flex-1" data-deck-dups-heading>{heading}</p>
      </div>
      <p className="text-[10.5px] leading-snug text-[var(--usb-fg-mid)]">
        No se duplican: mantienen su progreso en Anki ({source === "anki" ? "comprobado en Anki" : "según tu historial local"}).
      </p>
      {n > 0 && (
        <ul className="space-y-2" aria-label="Ideas que ya estaban en tu mazo">
          {rows.map((row) => {
            const stateText = row.rescheduled
              ? "La pusiste para hoy en Anki."
              : row.weak && ankiReady && row.state
                ? STATE_TEXT[row.state]
                : row.weak
                  ? "Anki la repasará cuando le toque."
                  : "";
            return (
              <li key={row.idea} className="flex items-start gap-2.5" data-deck-dup={row.idea}>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-[var(--usb-fg-hi)] leading-snug">
                    {renderStudyInline(row.title)}
                    {row.weak && (
                      <span className="ml-1.5 inline-block align-middle whitespace-nowrap rounded px-1 text-[9.5px] font-semibold border border-amber-500/30 text-[var(--usb-warn-text)]" data-deck-dup-weak>Hoy no te salió</span>
                    )}
                  </p>
                  <p className="text-[10.5px] text-[var(--usb-fg-mid)] leading-snug line-clamp-2">
                    {row.sameLesson ? "Tu tarjeta de una sesión anterior de esta lección" : `Tu tarjeta de «${row.lesson}»${row.course ? ` (curso «${row.course}»)` : ""}`}: {renderStudyInline(row.front)}
                  </p>
                  {(stateText || row.alsoInLesson) && (
                    <p className={`text-[10.5px] leading-snug mt-0.5 ${row.rescheduled ? "text-[var(--usb-ok-text)]" : "text-[var(--usb-fg-mid)]"}`} data-deck-dup-state={row.rescheduled ? "rescheduled" : row.state ?? ""}>
                      {row.rescheduled && <CheckCircle2 size={10} className="inline -mt-px mr-1" aria-hidden="true" />}
                      {[stateText, row.alsoInLesson ? "Otra tarjeta de esta lección también la repasa." : ""].filter(Boolean).join(" ")}
                    </p>
                  )}
                  {ankiReady && row.noteId && onBrowse && (
                    <button type="button" onClick={() => onBrowse(row.noteId!)}
                      className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 rounded">
                      <ExternalLink size={10} aria-hidden="true" />Ver en Anki
                    </button>
                  )}
                </div>
                {row.card && (
                  <button
                    type="button"
                    onClick={() => onToggleCard(row.card!.id)}
                    aria-pressed={row.card.added}
                    title={row.card.added ? "Quitar del paquete (la que ya tienes sigue en Anki)" : "Crear también una tarjeta nueva de esta idea"}
                    data-deck-dup-toggle
                    className={`h-7 px-2.5 rounded-md text-[10.5px] font-semibold border shrink-0 inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${row.card.added
                      ? "text-[var(--usb-ok-text)] border-emerald-500/35 bg-emerald-500/10 hover:border-emerald-500/55"
                      : "text-violet-300 border-violet-500/30 hover:border-violet-500/50 hover:bg-violet-500/10"}`}
                  >
                    {row.card.added ? <><Check size={10} />Añadida · Quitar</> : <><Plus size={10} />Añadir igualmente</>}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ankiReady && reviewable > 0 && (
        <div className="pt-0.5 space-y-1">
          <button type="button" onClick={onReviewToday} disabled={reviewBusy} data-deck-review-today
            className="h-8 px-3 rounded-lg bg-[var(--usb-bg-3)] border border-[var(--usb-border)] hover:border-[#6d4aff]/45 text-[var(--usb-fg)] hover:text-[var(--usb-fg-hi)] text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
            {reviewBusy ? <Loader2 size={11} className="animate-spin" /> : <Repeat2 size={11} />}
            Repasar hoy en Anki ({reviewable})
          </button>
          <p className="text-[10px] leading-snug text-[var(--usb-fg-mid)]">
            Adelanta a hoy solo las que fallaron y ya estaban en repaso, conservando su historial.
          </p>
        </div>
      )}
    </div>
  );
}
