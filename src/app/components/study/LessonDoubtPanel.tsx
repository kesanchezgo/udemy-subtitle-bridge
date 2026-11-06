import React, { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, Check, HelpCircle, Plus, RotateCcw, Send, X, Icon } from "../icons";
import { textareaCls } from "../settings/SettingsKit";
import {
  MAX_DOUBT_CARDS,
  MAX_DOUBT_TURNS,
  appendDoubtTurn,
  askLessonDoubt,
  snapshotDoubtCard,
  updateDoubtTurn,
  type DoubtTranscript,
  type LessonDoubtContext,
  type LessonDoubtThread,
  type LessonDoubtTurn,
} from "../../services/lessonDoubts";

/**
 * Duda sobre la lección (Study §5): panel en línea bajo el punto donde surge.
 * Mismo lenguaje que AIFeedback (acciones, «Local», cargador sin bucle) y los
 * tokens --usb-* del dock, así funciona igual en tema oscuro y claro.
 * La lección se estudia una vez: lo que perdura es la tarjeta, por eso
 * «Guardar como tarjeta» es la acción principal de cada respuesta.
 */
export function LessonDoubtPanel({
  ctx, thread, savedCount, isInDeck, getTranscript, demoAnswer, onChange, onClose,
}: {
  ctx: LessonDoubtContext;
  thread: LessonDoubtThread | null;
  /** Tarjetas de duda ya guardadas en la lección (para el tope). */
  savedCount: number;
  /** ¿Ya hay en el mazo una tarjeta con este frente? (mismo frente = mismo GUID en Anki). */
  isInDeck: (front: string) => boolean;
  getTranscript: () => Promise<DoubtTranscript | null>;
  demoAnswer?: ((question: string) => string) | null;
  onChange: (thread: LessonDoubtThread) => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [partial, setPartial] = useState<{ text: string; outside: boolean }>({ text: "", outside: false });
  const [error, setError] = useState<string | null>(null);

  const turns = thread?.turns ?? [];
  const asking = pending !== null && !error;
  const canAsk = turns.length < MAX_DOUBT_TURNS;
  const followUpsLeft = MAX_DOUBT_TURNS - turns.length;
  const capReached = savedCount >= MAX_DOUBT_CARDS;

  // Foco: al abrir, al campo; al cerrar, de vuelta a quien abrió el panel —
  // salvo que el foco ya esté en otro sitio (p. ej. se abrió otra duda).
  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      abortRef.current?.abort();
      const active = document.activeElement;
      const focusLost = !active || active === document.body || !active.isConnected;
      const target = returnFocusRef.current;
      if (focusLost && target && target.isConnected) target.focus({ preventScroll: true });
    };
  }, []);

  // Tras cada respuesta (ya renderizada): foco al campo o, si se llegó al tope y
  // el campo desapareció, a «Cerrar duda» — nunca se pierde en el documento.
  const turnCount = turns.length;
  const prevTurnCount = useRef(turnCount);
  useEffect(() => {
    if (turnCount > prevTurnCount.current) (inputRef.current ?? closeRef.current)?.focus({ preventScroll: true });
    prevTurnCount.current = turnCount;
  }, [turnCount]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || !canAsk) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(q);
    setError(null);
    setPartial({ text: "", outside: false });
    const result = await askLessonDoubt({
      ctx, thread, question: q, getTranscript, demoAnswer,
      onPartial: (visible) => { if (!controller.signal.aborted) setPartial(visible); },
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (!result.ok || !result.turn) { setError(result.error ?? "No se pudo responder. Inténtalo de nuevo."); return; }
    onChange(appendDoubtTurn(thread, ctx, result.turn));
    setPending(null);
    setDraft("");
    setPartial({ text: "", outside: false });
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!asking) void ask(draft);
  };

  const saveCard = (turn: LessonDoubtTurn) => {
    if (!thread || capReached || !turn.card || isInDeck(turn.card.front)) return;
    const snapshot = snapshotDoubtCard(turn);
    if (snapshot) onChange(updateDoubtTurn(thread, turn.at, snapshot));
  };
  const removeCard = (turn: LessonDoubtTurn) => {
    if (thread) onChange(updateDoubtTurn(thread, turn.at, null));
  };

  const anchorLabel = ctx.kind === "question"
    ? `Sobre la pregunta: «${ctx.anchor}»`
    : ctx.kind === "practice"
      ? `Sobre el desafío: «${ctx.anchor}»`
      : `Sobre la idea: «${ctx.anchor}»`;

  return (
    <motion.section
      ref={rootRef}
      role="region"
      aria-label="Duda sobre la lección"
      data-lesson-doubt={ctx.kind}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      }}
      className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] overflow-hidden"
    >
      <header className="flex items-start gap-2.5 px-3.5 pt-3 pb-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-violet-500/18 bg-violet-500/10 text-violet-300" aria-hidden="true">
          <HelpCircle size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="kx-slate">Duda sobre la lección</p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--usb-fg-mid)] line-clamp-2">{anchorLabel}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar duda"
          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-bg-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
        >
          <X size={12} />
        </button>
      </header>

      <div className="px-3.5 pb-3.5 space-y-3">
        <div className="space-y-3" aria-live="polite">
          {turns.map((turn) => (
            <DoubtTurnView
              key={turn.at}
              turn={turn}
              capReached={capReached}
              inDeck={Boolean(turn.card && !turn.saved && isInDeck(turn.card.front))}
              onSave={() => saveCard(turn)}
              onRemove={() => removeCard(turn)}
            />
          ))}

          {pending !== null && (
            <div className="space-y-2">
              <QuestionLine text={pending} />
              {error ? (
                <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-500/18 bg-red-500/5 px-3 py-2.5">
                  <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-red-300/85 text-[11px]" style={{ fontWeight: 600 }}>No se pudo responder</p>
                    <p className="text-red-300/60 text-[10.5px] mt-0.5 leading-relaxed">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void ask(pending)}
                    className="flex items-center gap-1.5 text-[10px] text-red-300/70 hover:text-red-300 border border-red-500/18 hover:border-red-500/30 px-2.5 py-1.5 rounded-lg transition-all shrink-0"
                  >
                    <RotateCcw size={10} />Reintentar
                  </button>
                </div>
              ) : partial.text ? (
                <div className="rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-3 py-2.5 space-y-2">
                  {partial.outside && <Badges outside local={false} />}
                  <p className="text-white/70 text-[11.5px] leading-relaxed whitespace-pre-line">
                    {partial.text}
                    <span className="inline-block w-[5px] h-[12px] ml-0.5 align-middle bg-violet-400/70" aria-hidden="true" />
                  </p>
                </div>
              ) : (
                <DoubtLoader />
              )}
            </div>
          )}
        </div>

        {canAsk ? (
          <form onSubmit={submit} className="space-y-1.5">
            <label htmlFor={inputId} className="sr-only">{turns.length ? "Tu repregunta" : "Tu duda"}</label>
            <textarea
              id={inputId}
              ref={inputRef}
              rows={2}
              maxLength={600}
              value={draft}
              // readOnly (no disabled) mientras responde: un campo deshabilitado
              // pierde el foco y Escape dejaría de llegar al panel.
              readOnly={asking}
              aria-busy={asking || undefined}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); }
              }}
              placeholder={turns.length ? "Repregunta sobre lo mismo…" : "¿Qué no te quedó claro?"}
              className={textareaCls}
            />
            <div className="flex items-center gap-2">
              <span className="text-[9.5px] leading-snug text-[var(--usb-fg-lo)]">
                {turns.length
                  ? `Te ${followUpsLeft === 1 ? "queda 1 repregunta" : `quedan ${followUpsLeft} repreguntas`} · Ctrl + Enter`
                  : "Responde con la transcripción de esta lección · Ctrl + Enter"}
              </span>
              <button
                type="submit"
                disabled={!draft.trim() || asking}
                className={`ml-auto h-8 px-3 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 shrink-0 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70 ${
                  turns.length
                    ? "border border-[var(--usb-border)] bg-[var(--usb-bg-3)] text-[var(--usb-fg)] hover:border-[#6d4aff]/45 hover:text-[var(--usb-fg-hi)]"
                    : "kx-on-solid kx-cta"
                }`}
              >
                <Send size={11} />{turns.length ? "Repreguntar" : "Preguntar"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-[10.5px] leading-relaxed text-[var(--usb-fg-mid)]">
            Llegaste al máximo de repreguntas de esta duda. Si sigue sin quedar claro, vuelve a esa parte de la lección.
          </p>
        )}
      </div>
    </motion.section>
  );
}

function QuestionLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="kx-slate shrink-0 mt-[3px]">Tú</span>
      <p className="text-[11.5px] font-semibold text-[var(--usb-fg-hi)] leading-snug whitespace-pre-line min-w-0">{text}</p>
    </div>
  );
}

function Badges({ outside, local }: { outside: boolean; local: boolean }) {
  if (!outside && !local) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {outside && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--usb-border-mid)] bg-[var(--usb-bg-2)] text-[var(--usb-fg-mid)]" style={{ fontWeight: 700 }}>
          Fuera de la lección
        </span>
      )}
      {local && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-300" style={{ fontWeight: 700 }}>
          Local
        </span>
      )}
    </div>
  );
}

function DoubtTurnView({
  turn, capReached, inDeck, onSave, onRemove,
}: {
  turn: LessonDoubtTurn;
  capReached: boolean;
  /** La tarjeta propuesta ya está en el mazo (otra respuesta o la sesión). */
  inDeck: boolean;
  onSave: () => void;
  onRemove: () => void;
}) {
  const paragraphs = turn.answer.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const card = turn.saved ?? turn.card;
  return (
    <div className="space-y-2" data-doubt-turn>
      <QuestionLine text={turn.q} />
      <div className="rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-3 py-2.5 space-y-2">
        <Badges outside={turn.outside} local={turn.source === "local"} />
        {paragraphs.map((p, i) => (
          <p key={i} className="text-white/70 text-[11.5px] leading-relaxed whitespace-pre-line">{renderDoubtInline(p)}</p>
        ))}
        {turn.quotes.length > 0 && (
          <div className="space-y-1.5 pt-0.5">
            <p className="kx-slate">En la lección</p>
            {turn.quotes.map((quote) => (
              <blockquote key={quote} className="border-l-2 border-[#6d4aff]/45 pl-2.5 text-[11px] leading-relaxed text-[var(--usb-fg-mid)]">
                «{quote}»
              </blockquote>
            ))}
          </div>
        )}
        {!turn.outside && turn.quotes.length === 0 && turn.source === "ai" && (
          <p className="text-[10px] leading-relaxed text-[var(--usb-fg-mid)]">
            Sin cita literal verificable en la transcripción: contrástalo con la lección.
          </p>
        )}
      </div>

      {/* Tarjeta de repaso de ESTA respuesta → al mazo (máx. 2 por lección) */}
      {card && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.05] px-3 py-2.5 space-y-1.5" data-doubt-card>
          <div className="flex items-center gap-1.5">
            <Icon name="layers" size={12} className="text-violet-300" />
            <p className="kx-slate">{turn.saved ? "Tarjeta en tu mazo" : "Tarjeta de repaso propuesta"}</p>
          </div>
          <p className="text-[11.5px] font-semibold text-[var(--usb-fg-hi)] leading-snug">{card.front}</p>
          <p className="text-[11px] text-[var(--usb-fg-mid)] leading-relaxed">{card.back}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {turn.saved ? (
              <>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border border-emerald-500/30 bg-[var(--usb-bg-2)] text-emerald-300">
                  <Check size={10} />Se exporta con la lección en Fijar
                </span>
                <button
                  type="button"
                  onClick={onRemove}
                  className="text-[10px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] px-1.5 py-1 rounded-md transition-colors"
                >
                  Quitar del mazo
                </button>
              </>
            ) : inDeck ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border border-[var(--usb-border-mid)] bg-[var(--usb-bg-2)] text-[var(--usb-fg-mid)]">
                <Check size={10} />Ya está en tu mazo
              </span>
            ) : (
              <button
                type="button"
                onClick={onSave}
                disabled={capReached}
                className="kx-on-solid kx-cta h-8 px-3 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
              >
                <Plus size={11} />Guardar como tarjeta
              </button>
            )}
          </div>
          {capReached && !turn.saved && !inDeck && (
            <p className="text-[10px] text-[var(--usb-fg-mid)] leading-relaxed">
              Ya guardaste {MAX_DOUBT_CARDS} tarjetas de duda en esta lección. Quita una para guardar esta.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function renderDoubtInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="text-white/90" style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={i} className="px-1 py-0.5 rounded bg-white/8 text-violet-300 text-[10.5px] font-mono">{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/** Cargador con pasos finitos (no hay bucle): mismo lenguaje que AIAnalyzingLoader. */
function DoubtLoader() {
  const steps = ["Buscando en la lección…", "Redactando la respuesta…"];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setStep(1), 1800);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="rounded-lg border border-violet-500/18 bg-violet-500/5 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/18 flex items-center justify-center shrink-0 text-violet-300" aria-hidden="true">
          <Icon name={step === 0 ? "search" : "edit3"} size={15} />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <AnimatePresence mode="wait">
            <motion.p
              key={step}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="text-violet-300/80 text-[11px]"
              style={{ fontWeight: 500 }}
            >
              {steps[step]}
            </motion.p>
          </AnimatePresence>
          <div className="flex gap-1 items-center" aria-hidden="true">
            {steps.map((_, i) => (
              <motion.div
                key={i}
                animate={{ width: i === step ? 20 : i < step ? 14 : 6, opacity: i <= step ? 1 : 0.2 }}
                transition={{ duration: 0.3 }}
                className={`h-[2px] rounded-full ${i < step ? "bg-violet-400/55" : i === step ? "bg-violet-400" : "bg-white/12"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
