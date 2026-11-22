/**
 * Fase 5 · a dónde llega lo de esta lección y en qué estado está. Sustituye a
 * los botones de exportar: con Anki / Obsidian conectados todo llega solo al
 * terminar; si algo no responde, se dice y espera (se envía solo al volver).
 * Una sola pieza para Anki y Obsidian, con los mismos tonos que Notice.
 */
import React from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Send } from "../icons";

export type SyncTone = "info" | "ok" | "wait" | "warn" | "busy";

export function SyncStatus({ tone, children, action, sync }: {
  tone: SyncTone;
  children: React.ReactNode;
  /** Una acción secundaria (Conectar, Reintentar, Enviar…): nunca «Exportar». */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** data-sync: el estado, para las pruebas. */
  sync: string;
}) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertCircle : tone === "wait" ? Clock : tone === "busy" ? Loader2 : Send;
  const ink = tone === "ok" ? "text-[var(--usb-ok-text)]" : tone === "warn" || tone === "wait" ? "text-[var(--usb-warn-text)]" : "text-[var(--usb-accent-text)]";
  return (
    <div role="status" data-sync={sync} className="flex items-start gap-2 rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-2)] px-3 py-2.5">
      <Icon size={13} className={`mt-0.5 shrink-0 ${ink} ${tone === "busy" ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
      <p className="flex-1 min-w-0 text-[11px] leading-relaxed text-[var(--usb-fg)]">{children}</p>
      {action && (
        <button type="button" onClick={action.onClick} disabled={action.disabled}
          className="shrink-0 h-7 px-2.5 rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] text-[10.5px] font-semibold text-[var(--usb-fg)] hover:border-[#6d4aff]/45 hover:text-[var(--usb-fg-hi)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70">
          {action.label}
        </button>
      )}
    </div>
  );
}
