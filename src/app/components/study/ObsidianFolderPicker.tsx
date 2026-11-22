/**
 * Carpeta del curso en Obsidian (fase 3) — el gemelo de AnkiDeckPicker, en
 * Fijar y en la Biblioteca. Se ve SIEMPRE dónde va la nota; «Cambiar» elige la
 * de Kinema (según Ajustes) u otra. El cambio vale para todo el curso (registro
 * único) y, con Obsidian conectado, puede mover las notas que ya existen con el
 * renombrado de Obsidian (actualiza los enlaces).
 */
import React, { useId, useState } from "react";
import { Check, Edit3, Loader2 } from "../icons";
import { exportFieldCls, exportGhostBtnCls, exportPrimaryBtnCls } from "./ExportModule";
import { cleanVaultFolder } from "../../services/obsidianDestination";

export function ObsidianFolderPicker({
  folder, defaultFolder, fileName, assigned, notes, canMove, onSave,
}: {
  /** Carpeta actual del curso. */
  folder: string;
  /** La de Kinema para este curso (estructura de Ajustes). */
  defaultFolder: string;
  /** Nombre de la nota de esta lección (o un ejemplo en la Biblioteca). */
  fileName?: string;
  /** ¿Fijada en el registro? */
  assigned: boolean;
  /** Notas del curso que ya están en el vault (para ofrecer moverlas). */
  notes: number;
  /** ¿Se pueden mover? (Obsidian conectado). */
  canMove: boolean;
  onSave: (folder: string, moveExisting: boolean) => Promise<void>;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"kinema" | "other">(folder === defaultFolder ? "kinema" : "other");
  const [other, setOther] = useState(folder === defaultFolder ? "" : folder);
  const [move, setMove] = useState(true);
  const [saving, setSaving] = useState(false);
  const target = choice === "kinema" ? defaultFolder : cleanVaultFolder(other);
  const changed = target !== "" && target !== folder;

  const save = async () => {
    if (!changed || saving) return;
    setSaving(true);
    try {
      await onSave(target, canMove && move && notes > 0);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2 space-y-2" data-obsidian-folder>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold text-[var(--usb-fg-mid)]">Carpeta del curso</p>
          <p className="font-mono text-[11px] text-[var(--usb-fg-hi)] leading-snug [overflow-wrap:anywhere]" data-obsidian-folder-name>{folder}/</p>
          {fileName && <p className="font-mono text-[10px] text-[var(--usb-fg-mid)] leading-snug [overflow-wrap:anywhere]">└ {fileName}</p>}
          {assigned && folder !== defaultFolder && (
            <p className="text-[10px] text-[var(--usb-fg-mid)] leading-snug mt-0.5">Carpeta personalizada para este curso.</p>
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
        <div className="space-y-2 border-t border-[var(--usb-divider)] pt-2" role="radiogroup" aria-label="Carpeta del curso">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name={`${listId}-folder`} checked={choice === "kinema"} onChange={() => setChoice("kinema")} className="mt-0.5 accent-[#6d4aff]" />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-[var(--usb-fg-hi)]">La de Kinema <span className="font-medium text-[var(--usb-fg-mid)]">· según Ajustes</span></span>
              <span className="block font-mono text-[10.5px] text-[var(--usb-fg-mid)] [overflow-wrap:anywhere]">{defaultFolder}/</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name={`${listId}-folder`} checked={choice === "other"} onChange={() => setChoice("other")} className="mt-0.5 accent-[#6d4aff]" />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block text-[11px] font-semibold text-[var(--usb-fg-hi)]">Otra carpeta del vault</span>
              <input
                aria-label="Ruta de la carpeta"
                value={other}
                onFocus={() => setChoice("other")}
                onChange={(e) => { setChoice("other"); setOther(e.target.value); }}
                placeholder="p. ej. Cursos/Java"
                className={`${exportFieldCls} !h-8 font-mono !text-[11px]`}
              />
            </span>
          </label>
          {changed && notes > 0 && (canMove ? (
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} className="mt-0.5 accent-[#6d4aff]" />
              <span className="text-[10.5px] leading-snug text-[var(--usb-fg)]">
                Mover también {notes === 1 ? "la nota que ya está" : `las ${notes} notas que ya están`} en el vault (Obsidian actualiza los enlaces).
              </span>
            </label>
          ) : (
            <p className="text-[10.5px] leading-snug text-[var(--usb-fg-mid)]">
              Lo nuevo irá a la carpeta elegida. {notes === 1 ? "La nota que ya existe se queda" : `Las ${notes} notas que ya existen se quedan`} donde {notes === 1 ? "está" : "están"} (con Obsidian conectado, Kinema puede moverlas).
            </p>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setOpen(false)} className={exportGhostBtnCls}>Cancelar</button>
            <button type="button" onClick={() => void save()} disabled={!changed || saving} className={exportPrimaryBtnCls} style={{ "--kx-btn": "#6d4aff" } as React.CSSProperties}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Usar esta carpeta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
