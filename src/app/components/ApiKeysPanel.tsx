// ─── ApiKeysPanel ─────────────────────────────────────────────────────────────
// Panel colapsable que aparece bajo el header para configurar las
// API keys de Gemini como fallback cuando la IA local no está disponible.
// Orden de uso: IA Local (8010) → Key 1 → Key 2 → Mock

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Key, Eye, EyeOff, CheckCircle2, X, Save, ChevronRight, Database, Zap } from "lucide-react";

interface ApiKeysPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey1: string;
  apiKey2: string;
  localConnected?: boolean;
  onSave: (key1: string, key2: string) => void;
}

export function ApiKeysPanel({
  isOpen,
  onClose,
  apiKey1,
  apiKey2,
  localConnected = false,
  onSave,
}: ApiKeysPanelProps) {
  const [key1, setKey1]   = useState(apiKey1);
  const [key2, setKey2]   = useState(apiKey2);
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync external value changes (e.g. on first load from storage)
  useEffect(() => { setKey1(apiKey1); }, [apiKey1]);
  useEffect(() => { setKey2(apiKey2); }, [apiKey2]);

  const handleSave = () => {
    onSave(key1.trim(), key2.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const activeCount = [key1, key2].filter(Boolean).length;

  // Fallback chain indicator
  const chain: { label: string; active: boolean; color: string }[] = [
    { label: "IA Local",  active: localConnected, color: localConnected ? "text-emerald-400" : "text-white/25" },
    { label: "Key 1",     active: !!key1,         color: key1  ? "text-violet-400" : "text-white/25" },
    { label: "Key 2",     active: !!key2,         color: key2  ? "text-violet-400" : "text-white/25" },
    { label: "Mock",      active: true,           color: "text-amber-400/50" },
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

            {/* ── Key 1 ── */}
            <div className="space-y-1">
              <div className="relative">
                <input
                  type={show1 ? "text" : "password"}
                  value={key1}
                  onChange={e => setKey1(e.target.value)}
                  placeholder="API Key 1 (principal)"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-9 bg-black/30 border border-white/8 rounded-lg px-3 pr-9 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-violet-500/40 transition-colors font-mono"
                />
                <button
                  onClick={() => setShow1(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors"
                >
                  {show1 ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </div>
              <AnimatePresence>
                {key1 && (
                  <motion.p
                    initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-emerald-400/75 text-[9px] ml-1 flex items-center gap-1"
                  >
                    <CheckCircle2 size={8} />Key activa
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* ── Key 2 ── */}
            <div className="space-y-1">
              <div className="relative">
                <input
                  type={show2 ? "text" : "password"}
                  value={key2}
                  onChange={e => setKey2(e.target.value)}
                  placeholder="API Key 2 (fallback, opcional)"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-9 bg-black/30 border border-white/8 rounded-lg px-3 pr-9 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-violet-500/40 transition-colors font-mono"
                />
                <button
                  onClick={() => setShow2(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors"
                >
                  {show2 ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </div>
              <AnimatePresence>
                {key2 && (
                  <motion.p
                    initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-emerald-400/75 text-[9px] ml-1 flex items-center gap-1"
                  >
                    <CheckCircle2 size={8} />Key activa
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* ── Save button ── */}
            <button
              onClick={handleSave}
              className={`flex items-center gap-1.5 h-8 px-4 rounded-lg text-[11px] transition-all duration-300 ${
                saved
                  ? "bg-emerald-600/25 border border-emerald-500/30 text-emerald-400"
                  : "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_2px_12px_rgba(139,92,246,0.3)]"
              }`}
              style={{ fontWeight: 600 }}
            >
              {saved
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
