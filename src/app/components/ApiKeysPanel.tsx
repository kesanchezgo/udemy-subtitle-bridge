import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Save,
  X,
} from "lucide-react";

export type GeminiKeyFieldStatus = {
  status: "idle" | "valid" | "rate-limited" | "invalid";
  message?: string;
};

type ApiKeysPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  apiKey1: string;
  apiKey2: string;
  onApiKey1Change: (value: string) => void;
  onApiKey2Change: (value: string) => void;
  localConnected?: boolean;
  keyCount?: number;
  onSave: () => void;
  saving?: boolean;
  saved?: boolean;
  validationError?: string | null;
  validationWarning?: string | null;
  fieldStates?: [GeminiKeyFieldStatus?, GeminiKeyFieldStatus?];
};

function getStatusClass(status?: GeminiKeyFieldStatus["status"]) {
  if (status === "valid") return "text-emerald-400/70";
  if (status === "rate-limited") return "text-amber-400/70";
  if (status === "invalid") return "text-red-400/70";
  return "text-white/20";
}

export function ApiKeysPanel({
  isOpen,
  onClose,
  apiKey1,
  apiKey2,
  onApiKey1Change,
  onApiKey2Change,
  localConnected = false,
  keyCount = 0,
  onSave,
  saving = false,
  saved = false,
  validationError,
  validationWarning,
  fieldStates,
}: ApiKeysPanelProps) {
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  const hasDraftKeys = Boolean(apiKey1.trim() || apiKey2.trim());

  const chain: { label: string; active: boolean; color: string }[] = [
    { label: "IA Local", active: localConnected, color: localConnected ? "text-emerald-400" : "text-white/25" },
    { label: "Key 1", active: !!apiKey1.trim(), color: apiKey1.trim() ? "text-violet-400" : "text-white/25" },
    { label: "Key 2", active: !!apiKey2.trim(), color: apiKey2.trim() ? "text-violet-400" : "text-white/25" },
    { label: "Mock", active: true, color: "text-amber-400/50" },
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={11} className="text-violet-400" />
                <span className="text-white/75 text-[11px]" style={{ fontWeight: 600 }}>
                  Motores de IA
                </span>
                {keyCount > 0 && (
                  <span className="text-[9px] bg-violet-500/15 border border-violet-500/25 text-violet-400 px-1.5 py-0.5 rounded-full">
                    Gemini: {keyCount} {keyCount === 1 ? "key" : "keys"}
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

            <div className="space-y-1">
              <div className="relative">
                <input
                  type={show1 ? "text" : "password"}
                  value={apiKey1}
                  onChange={(event) => onApiKey1Change(event.target.value)}
                  placeholder="API Key 1 (principal)"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-9 bg-black/30 border border-white/8 rounded-lg px-3 pr-9 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-violet-500/40 transition-colors font-mono"
                />
                <button
                  onClick={() => setShow1((value) => !value)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors"
                >
                  {show1 ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </div>
              <AnimatePresence>
                {(fieldStates?.[0]?.message || apiKey1.trim()) && (
                  <motion.p
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`text-[9px] ml-1 flex items-center gap-1 ${getStatusClass(fieldStates?.[0]?.status)}`}
                  >
                    <CheckCircle2 size={8} />
                    {fieldStates?.[0]?.message || "Key activa"}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-1">
              <div className="relative">
                <input
                  type={show2 ? "text" : "password"}
                  value={apiKey2}
                  onChange={(event) => onApiKey2Change(event.target.value)}
                  placeholder="API Key 2 (fallback, opcional)"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-9 bg-black/30 border border-white/8 rounded-lg px-3 pr-9 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-violet-500/40 transition-colors font-mono"
                />
                <button
                  onClick={() => setShow2((value) => !value)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors"
                >
                  {show2 ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              </div>
              <AnimatePresence>
                {(fieldStates?.[1]?.message || apiKey2.trim()) && (
                  <motion.p
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`text-[9px] ml-1 flex items-center gap-1 ${getStatusClass(fieldStates?.[1]?.status)}`}
                  >
                    <CheckCircle2 size={8} />
                    {fieldStates?.[1]?.message || "Key activa"}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={onSave}
              disabled={!hasDraftKeys || saving}
              className={`flex items-center gap-1.5 h-8 px-4 rounded-lg text-[11px] transition-all duration-300 ${
                saved
                  ? "bg-emerald-600/25 border border-emerald-500/30 text-emerald-400"
                  : "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_2px_12px_rgba(139,92,246,0.3)]"
              } disabled:opacity-35 disabled:cursor-not-allowed`}
              style={{ fontWeight: 600 }}
            >
              {saving
                ? <><Loader2 size={11} className="animate-spin" />Validando...</>
                : saved
                  ? <><CheckCircle2 size={11} />Guardado</>
                  : <><Save size={11} />Guardar keys</>}
            </button>

            <div className="flex items-center gap-1.5">
              {chain.map((step, index) => (
                <React.Fragment key={step.label}>
                  <span className={`text-[9px] ${step.color}`} style={{ fontWeight: step.active ? 600 : 400 }}>
                    {step.label}
                  </span>
                  {index < chain.length - 1 && <ChevronRight size={8} className="text-white/15 shrink-0" />}
                </React.Fragment>
              ))}
            </div>

            {(validationError || validationWarning) && (
              <div className="space-y-1">
                {validationError && (
                  <p className="text-red-400 text-[10px] leading-relaxed">
                    {validationError}
                  </p>
                )}
                {validationWarning && (
                  <p className="text-amber-400 text-[10px] leading-relaxed">
                    {validationWarning}
                  </p>
                )}
              </div>
            )}

            <p className="text-white/18 text-[9px] leading-relaxed">
              Keys guardadas en chrome.storage.local · usadas para traducción y Study Agent. Clic triple en ⚙ para Dev mode.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}