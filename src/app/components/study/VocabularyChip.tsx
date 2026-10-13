import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Plus, ExternalLink } from "../icons";

export interface VocabularyChipWord {
  word: string;
  phonetic: string;
  monolingual: string;
  selected?: boolean;
  exported?: boolean;
  demo?: boolean;
  needsUpdate?: boolean;
}

/** Margin kept between the chip and the edges of its bounding video surface. */
const EDGE_PADDING = 6;
/** Gap between the subtitle anchor and the chip (matches `top: calc(100% + 10px)`). */
const ANCHOR_GAP = 10;
const BOUNDS_SELECTOR = "[data-vocabulary-bounds], .usb-video-surface, [data-prototype-video]";

type ChipLayout = { mode: "full" | "compact"; shiftX: number; maxHeight: number | undefined };

/**
 * The chip is absolutely positioned under its anchor (the subtitle block), so it
 * never pushes the subtitle. Its geometry is measured from the live DOM (not from
 * values computed during the parent render, which are one frame stale) and
 * re-measured whenever the anchor moves (drag), resizes, or the surface resizes:
 *  - shifted horizontally so it never leaves the surface;
 *  - when paused and the full detail card does not fit below the subtitle, it
 *    switches to a compact layout (IPA + one-line definition inside the pill)
 *    instead of being clipped into a sliver.
 */
function useChipLayout(rootRef: React.RefObject<HTMLDivElement | null>, deps: unknown[], fallbackHeight: number) {
  const [layout, setLayout] = useState<ChipLayout>({ mode: "full", shiftX: 0, maxHeight: undefined });
  const fullHeightRef = useRef<number | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const measure = useCallback(() => {
    const el = rootRef.current;
    const anchor = el?.parentElement;
    if (!el || !anchor) return;
    const bounds = el.closest(BOUNDS_SELECTOR) as HTMLElement | null;
    const anchorRect = anchor.getBoundingClientRect();
    const boundsRect = bounds?.getBoundingClientRect();
    const current = layoutRef.current;

    // offsetWidth/scrollHeight ignore transforms, so entry animations can't skew them.
    const width = el.offsetWidth;
    const naturalHeight = el.scrollHeight;
    if (current.mode === "full") fullHeightRef.current = naturalHeight;

    let shiftX = 0;
    let available = fallbackHeight - ANCHOR_GAP;
    if (boundsRect && boundsRect.width > 0) {
      const naturalLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
      const minLeft = boundsRect.left + EDGE_PADDING;
      const maxLeft = boundsRect.right - EDGE_PADDING - width;
      shiftX = maxLeft < minLeft ? minLeft - naturalLeft : Math.min(Math.max(naturalLeft, minLeft), maxLeft) - naturalLeft;
      available = boundsRect.bottom - EDGE_PADDING - (anchorRect.bottom + ANCHOR_GAP);
    }
    available = Math.max(24, Math.floor(available));

    const fullHeight = fullHeightRef.current ?? naturalHeight;
    const mode: ChipLayout["mode"] = fullHeight <= available ? "full" : "compact";
    const next: ChipLayout = { mode, shiftX: Math.round(shiftX), maxHeight: available };
    if (next.mode !== current.mode || Math.abs(next.shiftX - current.shiftX) >= 1 || next.maxHeight !== current.maxHeight) {
      setLayout(next);
    }
  }, [rootRef, fallbackHeight]);

  // Reset the remembered full height when content changes, then measure before paint.
  useLayoutEffect(() => {
    fullHeightRef.current = null;
    setLayout(prev => (prev.mode === "full" ? prev : { ...prev, mode: "full" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useLayoutEffect(() => { measure(); });

  useLayoutEffect(() => {
    const el = rootRef.current;
    const anchor = el?.parentElement;
    if (!el || !anchor) return;
    const bounds = el.closest(BOUNDS_SELECTOR);
    const resize = new ResizeObserver(() => measure());
    resize.observe(el); resize.observe(anchor);
    if (bounds) resize.observe(bounds);
    // Dragging changes the anchor's inline left/top without resizing it.
    const mutation = new MutationObserver(() => measure());
    mutation.observe(anchor, { attributes: true, attributeFilter: ["style", "class"] });
    const onSettled = () => measure();
    const target = bounds ?? anchor;
    target.addEventListener("transitionend", onSettled);
    target.addEventListener("animationend", onSettled);
    window.addEventListener("resize", onSettled);
    return () => {
      resize.disconnect(); mutation.disconnect();
      target.removeEventListener("transitionend", onSettled);
      target.removeEventListener("animationend", onSettled);
      window.removeEventListener("resize", onSettled);
    };
  }, [measure, rootRef]);

  return layout;
}

export function VocabularyChip({
  word,
  paused,
  onSelect,
  disabled = false,
  availableHeight = 150,
  baseSize,
}: {
  word: VocabularyChipWord;
  paused: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  availableHeight?: number;
  /** Tamaño del subtítulo (px); el chip queda siempre por debajo de él. */
  baseSize?: number;
}) {
  const isSelected = Boolean(word.selected);
  const isExported = Boolean(word.exported);
  const isPendingUpdate = Boolean(word.needsUpdate);

  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useChipLayout(rootRef, [word.word, word.phonetic, word.monolingual, paused, isSelected, isExported], availableHeight);
  const compact = paused && layout.mode === "compact";

  const action = isPendingUpdate
    ? "Actualizar palabras en Configuración"
    : isExported
    ? "Ya exportada"
    : isSelected
    ? "Desmarcar selección"
    : "Seleccionar para exportar";

  // Tono del estado: violeta = en tu selección, verde = ya en Anki, neutro = sugerida.
  const dot = isExported ? "bg-emerald-400" : isSelected ? "bg-[#a48bff]" : "bg-white/55";
  const status = isExported ? "En Anki" : isSelected ? "En tu selección" : null;

  return (
    <div
      ref={rootRef}
      data-vocabulary-chip
      data-chip-layout={paused ? layout.mode : "pill"}
      style={{
        position: "absolute",
        fontSize: `${baseSize ? Math.min(12.5, Math.max(9, baseSize * 0.82)) : 12.5}px`,
        top: `calc(100% + ${ANCHOR_GAP}px)`,
        left: "50%",
        transform: `translateX(calc(-50% + ${layout.shiftX}px))`,
        maxHeight: layout.maxHeight,
      }}
      className={`z-20 w-max max-w-[min(300px,100%)] overflow-hidden text-left leading-snug select-none ${paused ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {!paused ? (
        /* Reproduciendo: solo una marca discreta, sin caja, que aparece tarde para no competir con el subtítulo. */
        <motion.div
          key={word.word}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="flex items-center gap-1.5 whitespace-nowrap px-1 text-[0.88em] font-medium text-white/60 [text-shadow:0_1px_3px_rgba(0,0,0,.9)]"
        >
          <span className={`h-1 w-1 rounded-full ${dot}`} aria-hidden="true" />
          <span>{word.word}</span>
          <span className="sr-only">: palabra de vocabulario, pausa para ver su definición</span>
        </motion.div>
      ) : (
        /* En pausa: una sola tarjeta sobria con lo esencial. */
        <motion.div
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className={`rounded-xl border border-white/10 bg-[#0f0d17]/80 backdrop-blur-md shadow-[0_10px_30px_-14px_rgba(0,0,0,.8)] ${compact ? "px-2.5 py-1.5" : "px-3 py-2.5"}`}
        >
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
            <span className="shrink-0 whitespace-nowrap text-[1em] font-semibold text-white">{word.word}</span>
            {word.phonetic && <span className="min-w-0 truncate font-mono text-[0.84em] text-white/60">{word.phonetic}</span>}
            {onSelect && (
              <button
                type="button"
                aria-label={action}
                title={action}
                disabled={disabled || isExported || isPendingUpdate}
                onClick={(event) => { event.stopPropagation(); onSelect(); }}
                className={`ml-auto -mr-1 flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[0.84em] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a48bff] disabled:cursor-default ${
                  isExported ? "text-emerald-300" : isSelected ? "text-[#c9bbff] hover:bg-white/10" : isPendingUpdate ? "text-amber-200/80" : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {isSelected || isExported ? <Check size={11} className="stroke-[2.5]" /> : isPendingUpdate ? <ExternalLink size={11} /> : <Plus size={11} className="stroke-[2.5]" />}
                {!compact && <span>{status ?? (isPendingUpdate ? "Actualizar" : "Mazo")}</span>}
              </button>
            )}
          </div>
          <p
            tabIndex={!compact && word.monolingual.length > 120 ? 0 : undefined}
            className={`mt-1 text-[0.88em] text-white/75 ${compact ? "truncate" : "line-clamp-3"}`}
          >
            {word.monolingual}
          </p>
        </motion.div>
      )}
    </div>
  );
}
