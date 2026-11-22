/**
 * Fijar · mazo de destino del curso (fase 2). Se ve SIEMPRE a dónde van las
 * tarjetas; «Cambiar» permite elegir un mazo existente (con Anki conectado,
 * de la lista real) o volver al de Kinema. El cambio vale para todo el curso
 * (registro único: el curso no queda repartido) y, con Anki conectado, puede
 * mover lo que ya importaste (conserva los repasos).
 */
import React, { useId, useState } from "react";
import { Check, Edit3, Loader2 } from "../icons";
import { exportFieldCls, exportGhostBtnCls, exportPrimaryBtnCls } from "./ExportModule";

export function AnkiDeckPicker({
  deck, defaultDeck, owned, decks, canMove, onSave,
}: {
  /** Mazo actual del curso. */
  deck: string;
  /** El de Kinema para este curso (mismo diseño y presets). */
  defaultDeck: string;
  owned: boolean;
  /** Mazos reales de Anki (null = Anki no conectado). */
  decks: string[] | null;
  /** ¿Se puede mover lo ya importado? (Anki conectado). */
  canMove: boolean;
  onSave: (deck: string, moveExisting: boolean) => Promise<void>;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"kinema" | "other">(deck === defaultDeck ? "kinema" : "other");
  const [other, setOther] = useState(deck === defaultDeck ? "" : deck);
  const [move, setMove] = useState(true);
  const [saving, setSaving] = useState(false);
  const target = choice === "kinema" ? defaultDeck : other.trim();
  const changed = target !== "" && target !== deck;
  const suggestedDecks = decks?.filter((d) => d !== "Default" && !d.includes("::Vocabulary"));

  const save = async () => {
    if (!changed || saving) return;
    setSaving(true);
    try {
      await onSave(target, canMove && move);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2 space-y-2" data-anki-deck>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold text-[var(--usb-fg-mid)]">Mazo del curso</p>
          <p className="font-mono text-[11px] text-[var(--usb-fg-hi)] leading-snug [overflow-wrap:anywhere]" data-anki-deck-name>{deck}</p>
          {!owned && (
            <p className="text-[10px] text-[var(--usb-fg-mid)] leading-snug mt-0.5">Un mazo tuyo · conserva sus opciones en Anki.</p>
          )}
        </div>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} aria-expanded={open}
            className="h-7 px-2.5 rounded-lg border border-[var(--usb-border)] text-[10.5px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:border-[var(--usb-border-mid)] transition-colors shrink-0 inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
            <Edit3 size={11} aria-hidden="true" />Cambiar
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2 border-t border-[var(--usb-divider)] pt-2" role="radiogroup" aria-label="Mazo del curso">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name={`${listId}-deck`} checked={choice === "kinema"} onChange={() => setChoice("kinema")} className="mt-0.5 accent-[#6d4aff]" />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-[var(--usb-fg-hi)]">El de Kinema <span className="font-medium text-[var(--usb-fg-mid)]">· recomendado</span></span>
              <span className="block font-mono text-[10.5px] text-[var(--usb-fg-mid)] [overflow-wrap:anywhere]">{defaultDeck}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name={`${listId}-deck`} checked={choice === "other"} onChange={() => setChoice("other")} className="mt-0.5 accent-[#6d4aff]" />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block text-[11px] font-semibold text-[var(--usb-fg-hi)]">Otro mazo</span>
              <input
                aria-label="Nombre del mazo"
                list={decks ? `${listId}-list` : undefined}
                value={other}
                onFocus={() => setChoice("other")}
                onChange={(e) => { setChoice("other"); setOther(e.target.value); }}
                placeholder={decks ? "Elige o escribe un mazo" : "Nombre del mazo (p. ej. Java::Curso)"}
                className={`${exportFieldCls} !h-8 font-mono !text-[11px]`}
              />
              {suggestedDecks && <datalist id={`${listId}-list`}>{suggestedDecks.map((d) => <option key={d} value={d} />)}</datalist>}
            </span>
          </label>
          {canMove && changed && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} className="mt-0.5 accent-[#6d4aff]" />
              <span className="text-[10.5px] leading-snug text-[var(--usb-fg)]">Mover también las tarjetas de este curso que ya están en Anki (conservan sus repasos).</span>
            </label>
          )}
          {!canMove && changed && (
            <p className="text-[10.5px] leading-snug text-[var(--usb-fg-mid)]">Lo nuevo irá al mazo elegido. Lo ya importado se queda donde está (con Anki conectado, Kinema puede moverlo).</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setOpen(false)} className={exportGhostBtnCls}>Cancelar</button>
            <button type="button" onClick={() => void save()} disabled={!changed || saving} className={exportPrimaryBtnCls} style={{ "--kx-btn": "#6d4aff" } as React.CSSProperties}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Usar este mazo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
