// ─── ApiKeysPanel ─────────────────────────────────────────────────────────────
// Panel colapsable que aparece bajo el header para configurar las
// API keys de Gemini como fallback cuando la IA local no está disponible.
// Orden de uso: IA Local (8010) → Gemini keys en rotación → Mock

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff, CheckCircle2, X, Save, ChevronRight, Database, Plus, Trash2, AlertCircle, Cpu, Loader2 } from "lucide-react";
import { normalizeGeminiKeys } from "../../gemini-config";
import {
  DEFAULT_BASE_URLS,
  DEFAULT_MODELS,
  PROVIDER_LABELS,
  validateProviderConfig,
  type AiProviderConfig,
  type AiProviderKind,
} from "../services/ai-providers";

interface ApiKeysPanelProps {
  isOpen: boolean;
  onClose: () => void;
  apiKeys: string[];
  localConnected?: boolean;
  onSave: (keys: string[]) => void;
  providerConfig: AiProviderConfig;
  onSaveProvider: (config: AiProviderConfig) => void;
}

const PROVIDER_KINDS: AiProviderKind[] = ["local", "openai", "anthropic", "gemini"];

const PROVIDER_KINDS_LABELS: Record<AiProviderKind, string> = {
  local: "Local",
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
};

/** Infer the provider kind from a base URL so the two can never disagree. */
function inferProviderKind(rawUrl: string): AiProviderKind | null {
  const url = String(rawUrl || "").toLowerCase();
  if (!url) return null;
  if (url.includes("anthropic")) return "anthropic";
  if (url.includes("generativelanguage.googleapis") || url.includes("/v1beta")) return "gemini";
  // Anything else that speaks /v1 or /chat/completions is OpenAI-compatible
  // (OpenAI, DeepSeek, OpenRouter, Groq, LM Studio, Ollama, local proxies).
  if (url.includes("/v1") || url.includes("openai") || url.includes("deepseek") || url.includes("openrouter")) return "openai";
  return null;
}

export function ApiKeysPanel({
  isOpen,
  onClose,
  apiKeys,
  localConnected = false,
  onSave,
  providerConfig,
  onSaveProvider,
}: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<string[]>(apiKeys.length ? apiKeys : [""]);
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState<AiProviderConfig>(providerConfig);
  const [providerSaved, setProviderSaved] = useState(false);
  const [providerKeyVisible, setProviderKeyVisible] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ status: string; message: string } | null>(null);
  const externalSignature = apiKeys.join("\n");
  const externalProviderSignature = `${providerConfig.kind}|${providerConfig.baseUrl}|${providerConfig.apiKey}|${providerConfig.model}`;

  // Sync external value changes (e.g. on first load from storage)
  useEffect(() => { setKeys(apiKeys.length ? apiKeys : [""]); }, [externalSignature]);
  useEffect(() => { setProvider(providerConfig); }, [externalProviderSignature]);

  const updateProvider = (patch: Partial<AiProviderConfig>) => {
    setProvider((current) => {
      const next = { ...current, ...patch };
      // Derive the kind from the base URL so a user can't end up with
      // kind:"local" pointing at a remote proxy (or vice versa) and get a
      // confusing error later. Explicit kind buttons still win when they match.
      if (patch.baseUrl !== undefined) {
        const inferred = inferProviderKind(next.baseUrl);
        if (inferred) next.kind = inferred;
      }
      return next;
    });
  };

  const changeProviderKind = (kind: AiProviderKind) => {
    setProvider((current) => ({
      ...current,
      kind,
      // Only swap in a default base URL/model when the user hasn't customized
      // them away from the previous kind's default.
      baseUrl:
        !current.baseUrl || current.baseUrl === DEFAULT_BASE_URLS[current.kind]
          ? DEFAULT_BASE_URLS[kind]
          : current.baseUrl,
      model:
        !current.model || current.model === DEFAULT_MODELS[current.kind]
          ? DEFAULT_MODELS[kind]
          : current.model,
    }));
  };

  const handleSaveProvider = async () => {
    setValidating(true);
    setValidation(null);
    const result = await validateProviderConfig(provider);
    setValidating(false);
    setValidation(result);
    if (result.status !== 'ok') return;
    onSaveProvider(provider);
    setProviderSaved(true);
    setTimeout(() => setProviderSaved(false), 2200);
  };

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
  const providerReady = provider.kind === "local"
    ? Boolean(provider.baseUrl)
    : Boolean(provider.baseUrl && provider.apiKey);
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
    { label: PROVIDER_LABELS[providerConfig.kind], active: providerReady, color: providerReady ? "text-sky-400" : "text-white/25" },
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

            {/* ── Provider config (multi-provider) ── */}
            <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Cpu size={10} className="text-violet-400" />
                  <span className="text-white/70 text-[10px] uppercase tracking-wider" style={{ fontWeight: 600 }}>
                    Proveedor
                  </span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                  providerReady
                    ? "bg-violet-500/12 border-violet-500/25 text-violet-300"
                    : "bg-white/4 border-white/8 text-white/30"
                }`}>
                  {providerReady ? "activo" : "sin configurar"}
                </span>
              </div>

              <div className="px-3 pb-3 space-y-2.5">
                {/* Kind selector — pills matching the sidebar segmented controls */}
                <div className="flex gap-1 p-0.5 rounded-lg bg-black/25 border border-white/6">
                  {PROVIDER_KINDS.map((kind) => (
                    <button
                      key={kind}
                      onClick={() => changeProviderKind(kind)}
                      className={`flex-1 h-7 rounded-md text-[10px] transition-all duration-200 ${
                        provider.kind === kind
                          ? "bg-violet-600 text-white shadow-[0_2px_8px_rgba(139,92,246,0.25)]"
                          : "text-white/40 hover:text-white/70 hover:bg-white/5"
                      }`}
                      style={{ fontWeight: provider.kind === kind ? 600 : 400 }}
                    >
                      {PROVIDER_KINDS_LABELS[kind]}
                    </button>
                  ))}
                </div>

                {/* Base URL */}
                <div className="space-y-1">
                  <label className="text-white/25 text-[9px] uppercase tracking-wider ml-0.5">Base URL</label>
                  <input
                    type="text"
                    value={provider.baseUrl}
                    onChange={(e) => updateProvider({ baseUrl: e.target.value })}
                    placeholder={DEFAULT_BASE_URLS[provider.kind]}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full h-9 bg-black/30 border border-white/8 focus:border-violet-500/40 rounded-lg px-3 text-[11px] text-white/70 placeholder:text-white/20 outline-none transition-colors font-mono"
                  />
                </div>

                {/* API key (hidden for the bundled local server) */}
                {provider.kind !== "local" && (
                  <div className="space-y-1">
                    <label className="text-white/25 text-[9px] uppercase tracking-wider ml-0.5">API Key</label>
                    <div className="relative flex items-center">
                      <input
                        type={providerKeyVisible ? "text" : "password"}
                        value={provider.apiKey}
                        onChange={(e) => updateProvider({ apiKey: e.target.value })}
                        placeholder="sk-..."
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full h-9 bg-black/30 border border-white/8 focus:border-violet-500/40 rounded-lg px-3 pr-9 text-[11px] text-white/70 placeholder:text-white/20 outline-none transition-colors font-mono"
                      />
                      <button
                        onClick={() => setProviderKeyVisible((v) => !v)}
                        className="absolute right-2.5 text-white/25 hover:text-white/55 transition-colors"
                      >
                        {providerKeyVisible ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Model */}
                <div className="space-y-1">
                  <label className="text-white/25 text-[9px] uppercase tracking-wider ml-0.5">Modelo</label>
                  <input
                    type="text"
                    value={provider.model}
                    onChange={(e) => updateProvider({ model: e.target.value })}
                    placeholder={DEFAULT_MODELS[provider.kind]}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full h-9 bg-black/30 border border-white/8 focus:border-violet-500/40 rounded-lg px-3 text-[11px] text-white/70 placeholder:text-white/20 outline-none transition-colors font-mono"
                  />
                </div>

                <button
                  onClick={handleSaveProvider}
                  disabled={validating}
                  className={`w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-[11px] transition-all duration-300 ${
                    validating
                      ? "bg-violet-600/50 text-white/70 cursor-wait"
                      : providerSaved
                        ? "bg-emerald-600/25 border border-emerald-500/30 text-emerald-400"
                        : "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_2px_12px_rgba(139,92,246,0.3)]"
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  {validating
                    ? <><Loader2 size={11} className="animate-spin" />Probando conexión…</>
                    : providerSaved
                      ? <><CheckCircle2 size={11} />Proveedor guardado</>
                      : <><Save size={11} />Probar y guardar</>}
                </button>

                {validation && (
                  <p className={`text-[9px] leading-relaxed rounded-lg px-2 py-1.5 border ${
                    validation.status === 'ok'
                      ? "text-emerald-400/90 bg-emerald-500/8 border-emerald-500/20"
                      : "text-amber-300/90 bg-amber-500/8 border-amber-500/20"
                  }`}>
                    {validation.status === 'ok' ? '✓ ' : '⚠ '}{validation.message}
                  </p>
                )}
              </div>
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
              Guardado en chrome.storage.local · cadena: IA Local → proveedor → Gemini → mock. Clic triple en ⚙ para Dev mode.
            </p>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
