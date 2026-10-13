import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "../icons";
import { historyService, type LectureHistoryRecord } from "../../services/historyService";
import { ExportModule, exportPrimaryBtnCls } from "./ExportModule";

export function PendingContentExports({ onExportLesson }: { onExportLesson: (record: LectureHistoryRecord) => Promise<void> }) {
  const [pending, setPending] = useState<LectureHistoryRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const load = useCallback(() => { void historyService.listLectures().then(records => setPending(records.filter(record => !record.deletedAt && record.status === "completed" && !record.exportedAt && (record.ankiCards?.length ?? 0) > 0))).catch(() => {}); }, []);
  useEffect(() => { load(); return historyService.onChanged(load); }, [load]);
  const exportAll = async () => {
    if (busy) return;
    setBusy(true);
    let count = 0;
    try {
      for (const record of pending) {
        setProgress(record.lectureName);
        await onExportLesson(record);
        await historyService.markExported(record.courseId, record.lectureId);
        count += 1;
      }
      toast.success("Archivos descargados", { description: count + " archivos de contenido. Impórtalos en Anki Desktop." });
    } catch (error) {
      toast.error("No se completó la descarga", { description: error instanceof Error ? error.message : "Los archivos pendientes se conservan para volver a intentarlo." });
    } finally { setBusy(false); setProgress(""); load(); }
  };
  if (!pending.length) return null;
  return <ExportModule icon={Download} title="Tarjetas de contenido por descargar" subtitle="Lecciones terminadas cuyos archivos aún no has exportado">
    <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">{pending.map(record => <div key={record.courseId + record.lectureId} className="text-[11px]"><p className="font-semibold text-[var(--usb-fg-hi)]">{record.lectureName}</p><p className="text-[var(--usb-fg-mid)]">{record.courseName} · {record.ankiCards?.length} tarjetas</p></div>)}</div>
    <button onClick={exportAll} disabled={busy} className={exportPrimaryBtnCls + " w-full"}><Download size={13} />{busy ? "Descargando…" : "Descargar archivos pendientes"}</button>
    {progress && <p role="status" className="text-[11px] text-[var(--usb-fg-mid)]">{progress}</p>}
    <p className="text-[10px] text-[var(--usb-fg-mid)]">Importa los archivos en Anki Desktop. Anki gestiona los repasos.</p>
  </ExportModule>;
}
