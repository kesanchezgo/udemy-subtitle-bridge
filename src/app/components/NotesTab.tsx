import React, { useState, useEffect } from "react";
import { Download, Cloud, Loader2, Save, CloudOff, RefreshCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { projectId } from "../../../utils/supabase/info";
import { usePersistedState } from "../hooks/usePersistedState";
import type { Session } from "@supabase/supabase-js";

interface CloudState {
  status: "idle" | "loading" | "synced" | "error";
  count: number;
  lastSync: Date | null;
}

export function NotesTab({
  courseName,
  lessonName,
  session,
}: {
  courseName: string;
  lessonName: string;
  session: Session | null;
}) {
  const [notes, setNotes] = usePersistedState(`notes_${courseName}_${lessonName}`, "");
  const [saving, setSaving] = useState(false);
  const [cloud, setCloud] = useState<CloudState>({ status: "idle", count: 0, lastSync: null });

  useEffect(() => {
    if (!session || !projectId) return;
    void fetchCloudCount();
  }, [session?.user?.id]);

  const fetchCloudCount = async () => {
    if (!session || !projectId) return;
    setCloud((current) => ({ ...current, status: "loading" }));
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c/migrate`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        const noteCount = (data.items as Array<{ key: string }>)?.filter((item) => item.key.startsWith("notes_")).length ?? 0;
        setCloud({ status: "synced", count: noteCount, lastSync: new Date() });
      } else {
        setCloud((current) => ({ ...current, status: "error" }));
      }
    } catch {
      setCloud((current) => ({ ...current, status: "error" }));
    }
  };

  useEffect(() => {
    if (!notes || !session || !projectId) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-e0dd828c/progress?userId=${session.user.id}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: `notes_${courseName}_${lessonName}`,
              courseName,
              lessonName,
              notes,
              timestamp: new Date().toISOString(),
            }),
          }
        );
        if (res.ok) {
          setCloud((current) => ({ ...current, lastSync: new Date() }));
        }
      } catch (error) {
        console.error("Failed to save note to DB", error);
      } finally {
        setSaving(false);
      }
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [notes, courseName, lessonName, session?.user?.id]);

  const exportMarkdown = () => {
    const md = `# Notes: ${courseName}\n## ${lessonName}\n\n${notes || "No notes yet."}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${lessonName.replace(/[^a-z0-9]/gi, "_")}-notes.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Notes exported as Markdown (.md)", {
      icon: (
        <div className="p-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
          <Download className="text-emerald-400 w-4 h-4" />
        </div>
      ),
    });
  };

  const exportNotion = () => {
    exportMarkdown();
    toast.success("Markdown ready to import into Notion", {
      icon: (
        <div className="p-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 shadow-[0_0_12px_rgba(14,165,233,0.2)]">
          <Cloud className="text-sky-400 w-4 h-4" />
        </div>
      ),
    });
  };

  const timeAgo = (d: Date) => {
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 60) return "Ahora mismo";
    if (secs < 3600) return `Hace ${Math.floor(secs / 60)} min`;
    return `Hace ${Math.floor(secs / 3600)} h`;
  };

  return (
    <div className="flex flex-col h-full space-y-4 p-5 text-white/90">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-white">Apuntes de Clase</h3>
          <p className="mt-1 text-[10px] leading-relaxed text-white/35 break-words">
            {courseName} · {lessonName}
          </p>
        </div>

        {saving ? (
          <span className="flex items-center gap-1.5 text-[10px] text-white/40">
            <Loader2 size={10} className="animate-spin" /> Guardando…
          </span>
        ) : session ? (
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
            <CheckCircle2 size={10} /> Sincronizado
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[10px] text-amber-500/60">
            <Save size={10} /> Solo local
          </span>
        )}
      </div>

      {session && projectId && (
        <div className="rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {cloud.status === "loading" ? (
              <Loader2 size={12} className="text-violet-400 animate-spin shrink-0" />
            ) : cloud.status === "synced" ? (
              <Cloud size={12} className="text-violet-400 shrink-0" />
            ) : cloud.status === "error" ? (
              <CloudOff size={12} className="text-red-400/70 shrink-0" />
            ) : (
              <Cloud size={12} className="text-white/20 shrink-0" />
            )}

            <div className="min-w-0">
              {cloud.status === "loading" && (
                <p className="text-white/35 text-[10px]">Verificando nube…</p>
              )}
              {cloud.status === "synced" && (
                <p className="text-white/50 text-[10px]">
                  <span className="text-violet-300/80" style={{ fontWeight: 600 }}>{cloud.count}</span>
                  {" "}apunte{cloud.count !== 1 ? "s" : ""} en la nube
                  {cloud.lastSync && (
                    <span className="text-white/25 ml-1.5">· {timeAgo(cloud.lastSync)}</span>
                  )}
                </p>
              )}
              {cloud.status === "error" && (
                <p className="text-red-400/60 text-[10px]">Error al conectar con la nube</p>
              )}
              {cloud.status === "idle" && (
                <p className="text-white/25 text-[10px]">Sin datos en la nube aún</p>
              )}
            </div>
          </div>

          <button
            onClick={fetchCloudCount}
            disabled={cloud.status === "loading"}
            title="Actualizar conteo"
            className="w-6 h-6 flex items-center justify-center rounded-lg text-white/20 hover:text-white/60 hover:bg-white/6 transition-all disabled:opacity-30 shrink-0"
          >
            <RefreshCcw size={10} className={cloud.status === "loading" ? "animate-spin" : ""} />
          </button>
        </div>
      )}

      <p className="text-[11px] text-white/50 leading-relaxed">
        Toma tus apuntes libremente. Puedes usar formato Markdown (## títulos, - listas, **negrita**).
        Se guardan automáticamente{session ? " y se sincronizan en la nube" : ""}.
      </p>

      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className="w-full flex-1 min-h-[220px] bg-black/20 border border-white/10 rounded-xl p-4 text-[12px] text-white/80 placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 transition-colors resize-none font-mono"
        placeholder={`## ${lessonName}\n\n- Concepto 1:\n- Concepto 2:\n`}
      />

      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={exportMarkdown}
          className="flex items-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-lg text-[11px] transition-colors font-medium"
        >
          <Download size={13} className="text-white/60" /> Exportar para Obsidian (.md)
        </button>
        <button
          onClick={exportNotion}
          className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 px-4 py-2 rounded-lg text-[11px] text-violet-300 transition-colors font-medium"
        >
          <Cloud size={13} /> Exportar para Notion
        </button>
      </div>
    </div>
  );
}