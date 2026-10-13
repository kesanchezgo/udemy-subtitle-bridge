import React, { useState, useEffect, useCallback } from "react";
import { Trash2, Clock, RefreshCw, Loader2 } from "./icons";
import { Slider } from "./ui/slider";
import { cacheService, type CacheStats } from "../services/cacheService";
import { Notice, SettingsGroup, dangerBtnCls, secondaryBtnCls } from "./settings/SettingsKit";

interface CacheSettingsPanelProps {
  ttlDays: number;
  onTtlChange: (days: number) => void;
}

function daysUntil(ts: number): number {
  return Math.max(0, Math.ceil((ts - Date.now()) / 86_400_000));
}

export function CacheSettingsPanel({ ttlDays, onTtlChange }: CacheSettingsPanelProps) {
  const [stats,         setStats]         = useState<CacheStats | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [feedback,      setFeedback]      = useState<string | null>(null);
  const [clearingId,    setClearingId]    = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    const s = await cacheService.getStats();
    setStats(s);
    setLoading(false);
  }, []);

  // Seed demo data once (preview only) then load stats; the section mounts this body only when expanded.
  useEffect(() => {
    cacheService.seedDemoData(ttlDays).then(loadStats);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleClearExpired = async () => {
    const n = await cacheService.clearExpired();
    await loadStats();
    showFeedback(n > 0 ? `${n} ${n === 1 ? "entrada expirada eliminada" : "entradas expiradas eliminadas"}` : "No hay entradas expiradas");
  };

  const handleClearAll = async () => {
    await cacheService.clearAll();
    await loadStats();
    showFeedback("Caché limpiado completamente");
  };

  const handleClearCourse = async (courseId: string) => {
    setClearingId(courseId);
    const n = await cacheService.clearByCourse(courseId);
    await loadStats();
    setClearingId(null);
    showFeedback(`${n} ${n === 1 ? "entrada eliminada" : "entradas eliminadas"}`);
  };

  const sizeLabel = (kb: number) => kb > 0 ? `~${kb} KB` : "< 1 KB";

  return (
    <div className="space-y-4">
      <SettingsGroup
        title="Tiempo de vida"
        aside={<span className="text-[11.5px] font-mono font-bold tabular-nums px-2.5 py-0.5 rounded-full bg-[var(--usb-accent-soft)] text-[var(--usb-fg)]">{ttlDays} {ttlDays === 1 ? "día" : "días"}</span>}
      >
        <Slider value={[ttlDays]} onValueChange={([v]) => onTtlChange(v)} min={1} max={30} step={1} aria-label="Tiempo de vida del caché en días" />
        <div className="flex items-center justify-between text-[11px] text-[var(--usb-fg-mid)]">
          <span>1 día</span><span className="font-semibold">7 recomendado</span><span>30 días</span>
        </div>
        <p className="text-[11.5px] leading-snug text-[var(--usb-fg-mid)]">
          Subtítulos y datos del curso se guardan aquí. Al vencer, se regeneran la próxima vez que abras la lección.
        </p>
      </SettingsGroup>

      <Notice icon="lock">
        Solo se borran archivos regenerables (subtítulos, traducciones, temario). Tu <strong>historial de estudio</strong> vive aparte y nunca expira.
      </Notice>

      <SettingsGroup
        title="Uso actual"
        aside={
          <button type="button" onClick={loadStats} disabled={loading} aria-label="Refrescar estadísticas" className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        }
      >
        {stats ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Cursos", value: String(stats.courseCount) },
              { label: "Entradas", value: String(stats.totalEntries) },
              { label: "Tamaño", value: sizeLabel(stats.estimatedSizeKb) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-2 py-2.5 text-center">
                <p className="text-[15px] font-extrabold tabular-nums text-[var(--usb-fg-hi)]">{value}</p>
                <p className="text-[11px] font-medium text-[var(--usb-fg-mid)]">{label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-3 text-[var(--usb-fg-mid)]"><Loader2 size={15} className="animate-spin" /></div>
        )}
      </SettingsGroup>

      {stats && stats.courses.length > 0 && (
        <SettingsGroup title="Cursos en caché">
          <ul className="space-y-1.5">
            {stats.courses.map((course) => {
              const daysLeft = daysUntil(course.expiresAt);
              const urgent = daysLeft <= 1;
              return (
                <li key={course.courseId} className="flex items-center gap-2.5 rounded-xl border border-[var(--usb-border)] bg-[var(--usb-bg-3)] px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold truncate text-[var(--usb-fg-hi)]">{course.label}</p>
                    <p className="text-[11px] text-[var(--usb-fg-mid)]">
                      {course.entries} entradas · {sizeLabel(course.sizeKb)} · <span className={urgent ? "font-semibold text-[var(--usb-warn-text)]" : ""}>{daysLeft === 0 ? "vence hoy" : `vence en ${daysLeft} d`}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClearCourse(course.courseId)}
                    disabled={clearingId === course.courseId}
                    aria-label={`Eliminar caché de ${course.label}`}
                    className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--usb-fg-mid)] hover:text-rose-500 transition-colors"
                  >
                    {clearingId === course.courseId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </SettingsGroup>
      )}

      {stats && stats.totalEntries === 0 && (
        <p className="text-[11.5px] text-center leading-snug text-[var(--usb-fg-mid)] py-2">
          Sin datos en caché. Los subtítulos traducidos se guardarán aquí al procesar una lección.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={handleClearExpired} className={secondaryBtnCls}><Clock size={14} />Limpiar expirados</button>
        <button type="button" onClick={handleClearAll} className={dangerBtnCls}><Trash2 size={14} />Limpiar todo</button>
      </div>

      {feedback && <Notice tone="ok" icon="checkCircle2">{feedback}</Notice>}
    </div>
  );
}
