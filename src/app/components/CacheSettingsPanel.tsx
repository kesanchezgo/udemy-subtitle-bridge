import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Database, Lock, ChevronDown, Trash2, Clock, BookOpen,
  RefreshCw, X, CheckCircle2, Loader2,
} from "./icons";
import { Slider } from "./ui/slider";
import { cacheService, type CacheStats } from "../services/cacheService";
import { useDockTheme } from "../contexts/ThemeContext";

interface CacheSettingsPanelProps {
  ttlDays: number;
  onTtlChange: (days: number) => void;
}

// Local helpers — mirrors the Card/SectionLabel pattern from ExtensionSidebar
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { t } = useDockTheme();
  return (
    <div className={`kx-card p-4 ${className}`}>
      {children}
    </div>
  );
}

function daysUntil(ts: number): number {
  return Math.max(0, Math.ceil((ts - Date.now()) / 86_400_000));
}

export function CacheSettingsPanel({ ttlDays, onTtlChange }: CacheSettingsPanelProps) {
  const { t } = useDockTheme();
  const [expanded,      setExpanded]      = useState(false);
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

  // Seed demo data once (preview only) then load stats when panel first opens
  useEffect(() => {
    if (!expanded) return;
    cacheService.seedDemoData(ttlDays).then(loadStats);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

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

  const summaryText = stats
    ? `${stats.courseCount} ${stats.courseCount === 1 ? "curso" : "cursos"} · TTL ${ttlDays}d`
    : `TTL ${ttlDays}d`;

  return (
    <div className="space-y-2">

      {/* ── Collapsible header ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="kx-card w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-all"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border shadow-sm transition-transform"
            style={{
              background: "color-mix(in srgb, #0284c7 12%, var(--usb-bg-3))",
              borderColor: "color-mix(in srgb, #0284c7 24%, var(--usb-border))",
              color: t("#5cc8fb", "#0369a1"),
            }}>
            <Database size={14} />
          </span>
          <span className="text-[12.5px] font-bold tracking-tight text-[var(--usb-fg)]">Caché de datos</span>
          <span className="kx-ok-pill text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "color-mix(in srgb, #0284c7 16%, transparent)", color: t("#5cc8fb", "#0369a1") } as React.CSSProperties}>
            {summaryText}
          </span>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-[var(--usb-fg-lo)]" />
        </motion.div>
      </button>

      {/* ── Expanded content ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-1">

              {/* ── TTL slider ── */}
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] flex items-center gap-1.5 ${t("text-white/55", "text-[#3d3a38]/70")}`}>
                    <Clock size={10} />
                    Tiempo de vida
                  </span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    t("text-sky-400 bg-sky-500/10 border-sky-500/15",
                      "text-sky-600 bg-sky-500/8 border-sky-500/15")
                  }`}>
                    {ttlDays} {ttlDays === 1 ? "día" : "días"}
                  </span>
                </div>

                <Slider
                  value={[ttlDays]}
                  onValueChange={([v]) => onTtlChange(v)}
                  min={1}
                  max={30}
                  step={1}
                  className="[&_[data-slot=track]]:bg-white/10 [&_[data-slot=range]]:bg-sky-500 [&_[data-slot=thumb]]:border-sky-500 [&_[data-slot=thumb]]:bg-white [&_[data-slot=thumb]]:h-3.5 [&_[data-slot=thumb]]:w-3.5"
                />

                <div className={`flex items-center justify-between text-[10px] px-0.5 ${t("text-white/35", "text-[#3d3a38]/60")}`}>
                  <span>1 día</span>
                  <span className={t("text-white/50 font-medium", "text-[#3d3a38]/75 font-medium")}>7d recomendado por curso</span>
                  <span>30 días</span>
                </div>

                <p className={`text-[10px] leading-relaxed ${t("text-white/40", "text-[#3d3a38]/65")}`}>
                  Subtítulos y datos del curso guardados localmente por este tiempo. Al vencer se regeneran automáticamente la próxima vez que abras la lección.
                </p>

                <div className={`flex items-start gap-2 text-[10px] leading-relaxed p-2.5 rounded-lg border ${
                  t("bg-violet-500/10 border-violet-500/20 text-violet-300/85",
                    "bg-violet-500/8 border-violet-500/18 text-violet-800")
                }`}>
                  <Lock size={13} className="shrink-0 mt-0.5" />
                  <span>
                    Solo borra archivos regenerables (subtítulos, traducciones, curriculum). Tu <strong className={t("text-violet-200", "text-violet-900")}>historial de estudio</strong> — respuestas, evaluaciones y lecciones completadas — vive aparte y nunca expira.
                  </span>
                </div>
              </Card>

              {/* ── Stats ── */}
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] uppercase tracking-widest ${t("text-white/22", "text-[#3d3a38]/60")}`}
                    style={{ fontWeight: 600 }}>
                    Estadísticas
                  </span>
                  <button
                    onClick={loadStats}
                    disabled={loading}
                    title="Refrescar"
                    className={`transition-colors ${t("text-white/20 hover:text-white/55", "text-[#3d3a38]/45 hover:text-[#1a1918]")}`}
                  >
                    <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
                  </button>
                </div>

                {stats ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Cursos",   value: String(stats.courseCount)    },
                      { label: "Entradas", value: String(stats.totalEntries)   },
                      {
                        label: "Tamaño",
                        value: stats.estimatedSizeKb > 0
                          ? `~${stats.estimatedSizeKb} KB`
                          : "< 1 KB",
                      },
                    ].map(({ label, value }) => (
                      <div key={label} className={`rounded-lg p-2.5 text-center border ${
                        t("bg-black/25 border-white/6", "bg-[#f5f3f0] border-black/5")
                      }`}>
                        <p className={`text-[13px] font-mono font-medium ${t("text-white/85", "text-[#1a1918]")}`}>
                          {value}
                        </p>
                        <p className={`text-[9px] uppercase tracking-wider font-medium mt-0.5 ${t("text-white/35", "text-[#3d3a38]/60")}`}>
                          {label}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 size={14} className={`animate-spin ${t("text-white/30", "text-[#3d3a38]/45")}`} />
                  </div>
                )}

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleClearExpired}
                    className={`flex items-center justify-center gap-1.5 h-8 rounded-lg text-[10.5px] font-medium border transition-all ${
                      t("bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/16 text-white/60 hover:text-white",
                        "bg-white hover:bg-black/5 border-black/10 hover:border-black/16 text-[#3d3a38]/80 hover:text-[#1a1918]")
                    }`}
                  >
                    <Clock size={11} />
                    Limpiar expirados
                  </button>
                  <button
                    onClick={handleClearAll}
                    className={`flex items-center justify-center gap-1.5 h-8 rounded-lg text-[10.5px] font-medium border transition-all ${
                      t("bg-red-500/10 hover:bg-red-500/18 border-red-500/20 hover:border-red-500/30 text-red-400 hover:text-red-300",
                        "bg-red-500/8 hover:bg-red-500/15 border-red-500/16 hover:border-red-500/25 text-red-600 hover:text-red-700")
                    }`}
                  >
                    <Trash2 size={11} />
                    Limpiar todo
                  </button>
                </div>

                {/* Operation feedback */}
                <AnimatePresence>
                  {feedback && (
                    <motion.div
                      key="fb"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border ${
                        t("bg-emerald-500/10 border-emerald-500/15 text-emerald-400",
                          "bg-emerald-500/8 border-emerald-500/15 text-emerald-700")
                      }`}
                    >
                      <CheckCircle2 size={10} />
                      {feedback}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>

              {/* ── Course list ── */}
              {stats && stats.courses.length > 0 && (
                <div className="space-y-1.5">
                  <p className={`text-[9px] uppercase tracking-widest ${t("text-white/22", "text-[#3d3a38]/60")}`}
                    style={{ fontWeight: 600 }}>
                    Cursos en caché
                  </p>
                  {stats.courses.map((course) => {
                    const daysLeft = daysUntil(course.expiresAt);
                    const urgent   = daysLeft <= 1;
                    return (
                      <div
                        key={course.courseId}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all ${
                          urgent
                            ? t("bg-amber-500/5 border-amber-500/15", "bg-amber-500/4 border-amber-500/12")
                            : t("bg-white/3 border-white/6", "bg-black/2 border-black/6")
                        }`}
                      >
                        {/* Icon */}
                        <div className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center ${
                          t("bg-sky-500/15", "bg-sky-500/10")
                        }`}>
                          <BookOpen size={9} className="text-sky-400" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[10px] truncate ${t("text-white/75", "text-[#1a1918]")}`}
                            style={{ fontWeight: 500 }}>
                            {course.label}
                          </p>
                          <p className={`text-[9px] flex items-center gap-1 mt-0.5 ${
                            urgent
                              ? t("text-amber-400/70", "text-amber-600/80")
                              : t("text-white/28", "text-[#3d3a38]/50")
                          }`}>
                            <span>{course.entries} entradas · {course.sizeKb > 0 ? `~${course.sizeKb} KB` : "< 1 KB"}</span>
                            <span className={t("text-white/15", "text-[#3d3a38]/30")}>·</span>
                            <span>
                              {daysLeft === 0 ? "vence hoy" : `vence en ${daysLeft}d`}
                            </span>
                          </p>
                        </div>

                        {/* Per-course clear */}
                        <button
                          onClick={() => handleClearCourse(course.courseId)}
                          disabled={clearingId === course.courseId}
                          title="Eliminar caché de este curso"
                          className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-md transition-all ${
                            t("text-white/20 hover:text-red-400/80 hover:bg-red-500/10",
                              "text-[#3d3a38]/40 hover:text-red-500/80 hover:bg-red-500/8")
                          }`}
                        >
                          {clearingId === course.courseId
                            ? <Loader2 size={8} className="animate-spin" />
                            : <X size={8} />
                          }
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Empty state ── */}
              {stats && stats.totalEntries === 0 && (
                <div className={`flex flex-col items-center gap-2 py-5 rounded-xl border ${
                  t("border-white/5 bg-white/[0.015]", "border-black/5 bg-black/[0.015]")
                }`}>
                  <Database size={16} className={t("text-white/15", "text-[#3d3a38]/30")} />
                  <p className={`text-[10px] ${t("text-white/30", "text-[#3d3a38]/50")}`}>
                    Sin datos en caché
                  </p>
                  <p className={`text-[9px] text-center px-6 leading-relaxed ${t("text-white/18", "text-[#3d3a38]/38")}`}>
                    Los subtítulos traducidos se guardarán aquí automáticamente al procesar una lección
                  </p>
                </div>
              )}

              <div className="h-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
