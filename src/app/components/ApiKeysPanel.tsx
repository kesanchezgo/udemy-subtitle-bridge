// ─── ApiKeysPanel ─────────────────────────────────────────────────────────────
// Panel colapsable que aparece bajo el header para configurar las
// API keys de Gemini como fallback cuando la IA local no está disponible.
// Orden de uso: IA Local (8010) → Gemini keys en rotación → Mock

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff, CheckCircle2, X, Save, ChevronRight, Database, Plus, Trash2, AlertCircle } from "lucide-react";
import { normalizeGeminiKeys } from "../../gemini-config";

interface ApiKeysPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: string[];
  localConnected?: boolean;
  onSave: (keys: string[]) => void;
}

export function ApiKeysPanel({
  isOpen,
  onClose,
  apiKeys,
  localConnected = false,
  onSave,
}: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<string[]>(apiKeys.length ? apiKeys : [""]);
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState(false);
  const externalSignature = apiKeys.join("\n");

  // Sync external value changes (e.g. on first load from storage)
  useEffect(() => { setKeys(apiKeys.length ? apiKeys : [""]); }, [externalSignature]);

  const productionRuntime = Boolean(
    (globalThis as typeof globalThis & { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id
  );
  const duplicateIndexes = new Set<number>();
  const seenKeys = new Map<string, number>();
  keys.forEach((key, idx) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    const previous = seenKeys.get(trimmed);
    if (previous !== undefined) {
      duplicateIndexes.add(previous);
      duplicateIndexes.add(idx);
      return;
    }
    seenKeys.set(trimmed, idx);
  });
  const hasDuplicates = duplicateIndexes.size > 0;

  const handleSave = () => {
    if (hasDuplicates) return;
    onSave(keys.map(k => k.trim()).filter(Boolean));
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const activeCount = normalizeGeminiKeys(keys).length;
  const updateKey = (idx: number, value: string) => {
    setKeys(current => current.map((key, i) => i === idx ? value : key));
  };
  const addKey = () => setKeys(current => [...current, ""]);
  const removeKey = (idx: number) => setKeys(current => {
    const next = current.filter((_, i) => i !== idx);
    return next.length ? next : [""];
  });

  // Fallback chain indicator
  const chain: { label: string; active: boolean; color: string }[] = [
    { label: "IA Local",  active: localConnected, color: localConnected ? "text-emerald-400" : "text-white/25" },
    { label: activeCount > 0 ? `${activeCount} Gemini` : "Gemini", active: activeCount > 0, color: activeCount > 0 ? "text-violet-400" : "text-white/25" },
    productionRuntime
      ? { label: "Sin mock", active: false, color: "text-white/25" }
      : { label: "Mock", active: true, color: "text-amber-400/50" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="api-panel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden border-b border-white/6 bg-[#0c0c0f] shrink-0"
        >
          <div className="p-4 space-y-3">

            {/* ── Header ── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={11} className="text-violet-400" />
                <span className="text-white/75 text-[11px]" style={{ fontWeight: 600 }}>
                  Motores de IA
                </span>
                {activeCount > 0 && (
                  <span className="text-[9px] bg-violet-500/15 border border-violet-500/25 text-violet-400 px-1.5 py-0.5 rounded-full">
                    Gemini: {activeCount} {activeCount === 1 ? "key" : "keys"}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-white/25 hover:text-white/60 transition-colors w-5 h-5 flex items-center justify-center rounded"
              >
                <X size={13} />
              </button>
            </div>

            {/* ── Gemini keys ── */}
            <div className="space-y-2">
              {keys.map((key, idx) => {
                const visible = Boolean(visibleKeys[idx]);
                const active = Boolean(key.trim());
                const duplicate = duplicateIndexes.has(idx);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="relative flex items-center gap-1.5">
                      <input
                        type={visible ? "text" : "password"}
                        value={key}
                        onChange={e => updateKey(idx, e.target.value)}
                        placeholder={`Gemini API Key ${idx + 1}${idx === 0 ? " (principal)" : ""}`}
                        autoComplete="off"
                        spellCheck={false}
                        className={`w-full h-9 bg-black/30 border rounded-lg px-3 pr-16 text-[11px] text-white/70 placeholder:text-white/20 outline-none transition-colors font-mono ${
                          duplicate ? "border-amber-500/45 focus:border-amber-400/60" : "border-white/8 focus:border-violet-500/40"
                        }`}
                      />
                      <button
                        onClick={() => setVisibleKeys(current => ({ ...current, [idx]: !visible }))}
                        className="absolute right-9 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors"
                      >
                        {visible ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                      <button
                        onClick={() => removeKey(idx)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-rose-300 transition-colors"
                        title="Quitar key"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {duplicate ? (
                        <motion.p
                          initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="text-amber-400/80 text-[9px] ml-1 flex items-center gap-1"
                        >
                          <AlertCircle size={8} />Key duplicada
                        </motion.p>
                      ) : active && (
                        <motion.p
                          initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="text-emerald-400/75 text-[9px] ml-1 flex items-center gap-1"
                        >
                          <CheckCircle2 size={8} />Key activa · rotación #{idx + 1}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              <button
                onClick={addKey}
                className="w-full h-8 rounded-lg border border-white/8 bg-white/3 hover:bg-white/6 text-white/45 hover:text-white/70 text-[10px] flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus size={11} />Agregar otra key
              </button>
            </div>

            {/* ── Save button ── */}
            <button
              onClick={handleSave}
              disabled={hasDuplicates}
              className={`flex items-center gap-1.5 h-8 px-4 rounded-lg text-[11px] transition-all duration-300 ${
                hasDuplicates
                  ? "bg-amber-500/10 border border-amber-500/25 text-amber-300/70 cursor-not-allowed"
                  : saved
                  ? "bg-emerald-600/25 border border-emerald-500/30 text-emerald-400"
                  : "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_2px_12px_rgba(139,92,246,0.3)]"
              }`}
              style={{ fontWeight: 600 }}
            >
              {hasDuplicates
                ? <><AlertCircle size={11} />Revisa duplicadas</>
                : saved
                ? <><CheckCircle2 size={11} />Guardado</>
                : <><Save size={11} />Guardar keys</>
              }
            </button>

            {/* ── Fallback chain ── */}
            <div className="flex items-center gap-1.5">
              {chain.map((step, i) => (
                <React.Fragment key={step.label}>
                  <span className={`text-[9px] ${step.color}`} style={{ fontWeight: step.active ? 600 : 400 }}>
                    {step.label}
                  </span>
                  {i < chain.length - 1 && (
                    <ChevronRight size={8} className="text-white/15 shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* ── Info ── */}
            <p className="text-white/18 text-[9px] leading-relaxed">
              Keys guardadas en chrome.storage.local · usadas para traducción y Study Agent. Clic triple en ⚙ para Dev mode.
            </p>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
