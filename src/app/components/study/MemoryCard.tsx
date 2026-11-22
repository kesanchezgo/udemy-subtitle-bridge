import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Send } from "../icons";
import { historyService, type LectureHistoryRecord } from "../../services/historyService";
import { acceptedCardCount, isPendingExport, isWaitingForAnki } from "../../services/library";
import { ExportModule, exportPrimaryBtnCls } from "./ExportModule";

/**
 * Biblioteca · lo que aún no está en Anki (fase 5: no hay que exportar).
 * Las lecciones que terminaste sin Anki ESPERAN y se envían solas en cuanto
 * Anki responde; las de antes (terminadas sin enviar) se envían desde aquí con
 * un clic. Sin AnkiConnect queda un respaldo discreto: el mismo paquete .apkg.
 */
export function PendingContentExports({ ankiReady, onSendLesson, onExportLesson }: {
  ankiReady: boolean;
  onSendLesson?: (record: LectureHistoryRecord) => Promise<number>;
  onExportLesson?: (record: LectureHistoryRecord) => Promise<void>;
}) {
  const [pending, setPending] = useState<LectureHistoryRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const load = useCallback(() => { void historyService.listLectures().then(records => setPending(records.filter(isPendingExport))).catch(() => {}); }, []);
  useEffect(() => { load(); return historyService.onChanged(load); }, [load]);
  const waiting = pending.filter(isWaitingForAnki).length;
  const sendAll = async (mode: "send" | "download") => {
    if (busy) return;
    setBusy(true);
    let count = 0;
    let added = 0;
    try {
      for (const record of pending) {
        setProgress(record.lectureName);
        if (mode === "send" && onSendLesson) added += await onSendLesson(record);
        else if (onExportLesson) { await onExportLesson(record); await historyService.markExported(record.courseId, record.lectureId); }
        count += 1;
      }
      if (mode === "send") toast.success(`${count === 1 ? "1 lección" : `${count} lecciones`} en Anki`, { description: `${added === 1 ? "1 tarjeta nueva" : `${added} tarjetas nuevas`}. Las que ya tenías no se duplican.` });
      else toast.success("Archivos descargados", { description: `${count} archivos .apkg: ábrelos para importarlos en Anki.` });
    } catch (error) {
      toast.error(mode === "send" ? "Anki no aceptó todas" : "No se completó la descarga", { description: error instanceof Error ? error.message : "Las lecciones pendientes se conservan para volver a intentarlo." });
    } finally { setBusy(false); setProgress(""); load(); }
  };
  if (!pending.length) return null;
  return <ExportModule icon={Send} title="Aún no están en Anki" subtitle={waiting > 0 ? `${waiting === pending.length ? "Esperan" : `${waiting} esperan`} a que Anki responda` : "Lecciones terminadas sin enviar"}>
    <div className="space-y-2" data-pending-anki>{pending.map(record => <div key={record.courseId + record.lectureId} className="text-[11px]"><p className="font-semibold text-[var(--usb-fg-hi)]">{record.lectureName}</p><p className="text-[var(--usb-fg-mid)]">{record.courseName} · {acceptedCardCount(record)} tarjetas{isWaitingForAnki(record) ? " · se envía sola" : ""}</p></div>)}</div>
    {ankiReady && onSendLesson ? (
      <button onClick={() => void sendAll("send")} disabled={busy} className={exportPrimaryBtnCls + " w-full"} data-pending-send><Send size={13} />{busy ? "Enviando…" : `Enviar a Anki (${pending.length})`}</button>
    ) : (
      <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">
        {waiting > 0 ? "Abre Anki con AnkiConnect y llegarán solas." : "Conecta Anki (Ajustes → Anki) y envíalas desde aquí."}
      </p>
    )}
    {progress && <p role="status" className="text-[11px] text-[var(--usb-fg-mid)]">{progress}</p>}
    {!ankiReady && onExportLesson && (
      <button type="button" onClick={() => void sendAll("download")} disabled={busy} className="self-start inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] underline-offset-2 hover:underline disabled:opacity-50" data-pending-download>
        <Download size={11} />¿Sin AnkiConnect? Descargar los .apkg
      </button>
    )}
  </ExportModule>;
}
