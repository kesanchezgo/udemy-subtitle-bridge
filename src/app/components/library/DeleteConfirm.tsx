import { AlertCircle, Download } from "../icons";

/** Confirmación en línea: explica qué se borra y qué pasa con Anki antes de hacerlo. */
export function DeleteConfirm({ what, pending, onConfirm, onCancel, onDownload, downloadLabel = "Descargar primero", extra, flush = false }: {
  what: string; pending: number; onConfirm: () => void; onCancel: () => void; onDownload?: () => void; downloadLabel?: string; extra?: string; flush?: boolean;
}) {
  return (
    <div role="alertdialog" aria-label={`Eliminar ${what}`} className={`${flush ? "" : "mx-2 mb-2"} rounded-lg border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-3 py-2.5 space-y-2.5`} onClick={e => e.stopPropagation()}>
      <div className="flex gap-2">
      <span className="kx-danger-btn mt-px shrink-0 w-5 h-5 rounded-md border border-rose-500/35 bg-rose-500/10 text-rose-300 flex items-center justify-center"><AlertCircle size={11} /></span>
      <p className="text-[11.5px] leading-snug text-[var(--usb-fg)]">
        Se borra el progreso de {what} en Kinema. Las tarjetas que ya importaste <strong>siguen en Anki</strong>.
        {pending > 0 && <> <span className="kx-danger-text font-semibold text-rose-300">{pending} {pending === 1 ? "tarjeta que aún no está en Anki se perderá" : "tarjetas que aún no están en Anki se perderán"}.</span></>}
        {extra && <> <span className="text-[var(--usb-fg-mid)]">{extra}</span></>}
      </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="kx-chip h-7 px-2.5 rounded-lg text-[11px] font-semibold">Cancelar</button>
        {onDownload && (
          <button type="button" onClick={onDownload} className="kx-chip h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1">
            <Download size={11} />{downloadLabel}
          </button>
        )}
        <button type="button" onClick={onConfirm} className="kx-danger-btn h-7 px-2.5 rounded-lg text-[11px] font-semibold border border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15 transition-colors">Eliminar</button>
      </div>
    </div>
  );
}
