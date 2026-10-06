import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Download, Loader2, Layers } from "../icons";
import { historyService, type LectureHistoryRecord } from "../../services/historyService";
import { celebrate } from "../CelebrationOverlay";
import { exportPrimaryBtnCls, exportGhostBtnCls } from "./ExportModule";
import { chromeLocalStorage } from "../../services/chromeStorage";

const HINT_KEY = "kinema-memory-hint-seen";

interface Props {
  /** Exports one lesson's stored cards as .apkg (downloads the file). */
  onExportLesson: (rec: LectureHistoryRecord) => Promise<void>;
  /** Opens the in-app Anki/Obsidian guide. */
  onOpenGuide?: () => void;
}

export function MemoryCard({ onExportLesson, onOpenGuide }: Props) {
  const [lectures, setLectures] = useState<LectureHistoryRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [hintSeen, setHintSeen] = useState(false);

  const load = useCallback(() => {
    historyService.listLectures().then((l) => setLectures(l.filter((r) => !r.deletedAt && r.status === "completed"))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    void chromeLocalStorage.get([HINT_KEY]).then((items) => {
      setHintSeen(items[HINT_KEY] === "1");
    }).catch(() => {});
  }, []);

  const dismissHint = () => {
    void chromeLocalStorage.set({ [HINT_KEY]: "1" }).catch(() => {});
    setHintSeen(true);
  };

  // Estados fácticos: (a) generadas sin exportar, (b) exportadas.
  // El estado de repaso (vencidas/hoy) vive SOLO en Anki — nunca se estima aquí.
  const pending = useMemo(() => lectures.filter((l) => !l.exportedAt && (l.ankiCards?.length ?? 0) > 0), [lectures]);
  const exported = useMemo(() => lectures.filter((l) => l.exportedAt), [lectures]);

  const courses = useMemo(() => {
    const m = new Map<string, { name: string; total: number; exported: number }>();
    for (const l of lectures) {
      const c = m.get(l.courseId) ?? { name: l.courseName, total: 0, exported: 0 };
      c.total++;
      if (l.exportedAt) c.exported++;
      m.set(l.courseId, c);
    }
    return [...m.values()].filter((c) => c.total > 0).slice(0, 3);
  }, [lectures]);

  if (lectures.length === 0) return null;

  const exportAll = async () => {
    if (busy) return;
    setBusy(true);
    let done = 0;
    try {
      for (const rec of pending) {
        setProgress(`${done + 1} de ${pending.length} · ${rec.lectureName}`);
        await onExportLesson(rec);
        await historyService.markExported(rec.courseId, rec.lectureId);
        done++;
      }
      if (done > 0) celebrate({
        type: "anki_export",
        rewardKey: `anki-batch::${pending[done - 1].courseId}::${pending[done - 1].lectureId}`,
        title: `${done} ${done === 1 ? "lección fijada" : "lecciones fijadas"} en Anki`,
        subtitle: "Impórtalas con doble clic y tu repaso espaciado queda listo.",
      });
    } catch (e) {
      console.error("[memory] batch export", e);
    } finally {
      setBusy(false);
      setProgress("");
      load();
    }
  };

  const showHint = !hintSeen && exported.length === 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="kx-card rounded-2xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-[#6d4aff]/12 flex items-center justify-center text-[#6d4aff]">
            <Layers size={14} />
          </div>
          <div>
            <p className="text-[var(--usb-fg-hi)] text-[12px] font-bold leading-tight">Tu memoria</p>
            <p className="text-[var(--usb-fg-lo)] text-[10px]">Anki y Obsidian son tu sistema de repaso</p>
          </div>
        </div>
      </div>

      {courses.length > 0 && (
        <div className="space-y-2">
          {courses.map((c) => (
            <div key={c.name}>
              <div className="flex items-center justify-between text-[10.5px] mb-1">
                <span className="text-[var(--usb-fg)] font-semibold truncate pr-2">{c.name}</span>
                <span className="text-[var(--usb-fg-lo)] shrink-0">{c.exported} de {c.total} fijadas</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--usb-bg-3)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--usb-ok-ink)] transition-all duration-500" style={{ width: `${(c.exported / c.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="rounded-xl bg-[#d97706]/8 border border-[#d97706]/25 p-3 space-y-2">
          <p className="text-[var(--usb-fg-hi)] text-[11.5px] font-semibold leading-snug">
            {pending.length === 1 ? "1 lección" : `${pending.length} lecciones`} sin fijar en memoria
          </p>
          <p className="text-[var(--usb-fg-mid)] text-[10.5px] leading-relaxed">
            Sin repaso espaciado, la mayor parte se olvida en días. Expórtalas a Anki ahora.
          </p>
          <button onClick={exportAll} disabled={busy} className={`${exportPrimaryBtnCls} w-full`}>
            {busy ? <><Loader2 size={13} className="animate-spin" />{progress || "Exportando…"}</>
              : <><Download size={13} />Exportar {pending.length === 1 ? "tarjetas" : `${pending.length} mazos`} a Anki</>}
          </button>
        </div>
      )}

      {showHint && (
        <div className="rounded-xl bg-[var(--usb-bg-3)] border border-[var(--usb-border)] p-3 space-y-2">
          <p className="text-[var(--usb-fg-mid)] text-[10.5px] leading-relaxed">
            Kinema no repite tarjetas dentro de la app: las lleva a Anki u Obsidian, donde el repaso espaciado ya funciona. Expórtalas al terminar cada clase.
          </p>
          <div className="flex gap-2">
            {onOpenGuide && <button onClick={onOpenGuide} className={`${exportGhostBtnCls} px-3`}>Ver guía</button>}
            <button onClick={dismissHint} className={`${exportGhostBtnCls} px-3`}>Entendido</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
