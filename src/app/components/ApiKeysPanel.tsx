// ─── ApiKeysPanel ─────────────────────────────────────────────────────────────
// Configuración de motores de IA: proveedor (OpenAI-compatible / Anthropic /
// Gemini / local) + API keys de Gemini en rotación.
//
// Chain: IA Local (8010) → proveedor configurado → Gemini → mock
//
// Diseño: minimalista, jerarquía por peso/espaciado (no por bordes anidados) y
// 100% basado en los tokens `--usb-*` del tema, de modo que el modo oscuro y el
// sepia/claro salen del mismo marcado sin parches.

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Eye, EyeOff, CheckCircle2, X, ChevronRight, Plus, Trash2, AlertCircle,
  Cpu, Loader2, Zap,
} from "lucide-react";
import { normalizeGeminiKeys } from "../../gemini-config";
import {
  DEFAULT_BASE_URLS,
  DEFAULT_MODELS,
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

  useEffect(() => { setKeys(apiKeys.length ? apiKeys : [""]); }, [externalSignature]);
  // Sync when the config changes from outside, but keep the validation message:
  // our own save also changes this signature, and clearing there would wipe the
  // "✓ Conexión correcta" result the user just asked for before it can be read.
  // Editing any field already clears it via updateProvider.
  useEffect(() => { setProvider(providerConfig); }, [externalProviderSignature]);

  const updateProvider = (patch: Partial<AiProviderConfig>) => {
    setValidation(null);
    setProvider((current) => {
      const next = { ...current, ...patch };
      if (patch.baseUrl !== undefined) {
        const inferred = inferProviderKind(next.baseUrl);
        if (inferred) next.kind = inferred;
      }
      return next;
    });
  };

  const changeProviderKind = (kind: AiProviderKind) => {
    setValidation(null);
    setProvider((current) => ({
      ...current,
      kind,
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
    if (result.status !== "ok") return;
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
  const updateKey = (idx: number, value: string) => {
    setKeys(current => current.map((key, i) => i === idx ? value : key));
  };
  const addKey = () => setKeys(current => [...current, ""]);
  const removeKey = (idx: number) => setKeys(current => {
    const next = current.filter((_, i) => i !== idx);
    return next.length ? next : [""];
  });

  const providerReady = provider.kind === "local"
    ? Boolean(provider.baseUrl)
    : Boolean(provider.baseUrl && provider.apiKey);

  const chain: { label: string; active: boolean; color: string }[] = [
    { label: "Local", active: localConnected, color: localConnected ? "text-[var(--usb-ok-fg)]" : "text-[var(--usb-fg-dim)]" },
    { label: PROVIDER_KINDS_LABELS[provider.kind], active: providerReady, color: providerReady ? "text-[var(--usb-accent-fg)]" : "text-[var(--usb-fg-dim)]" },
    { label: activeCount > 0 ? `Gemini ×${activeCount}` : "Gemini", active: activeCount > 0, color: activeCount > 0 ? "text-[var(--usb-accent-fg)]" : "text-[var(--usb-fg-dim)]" },
    productionRuntime
      ? { label: "Sin mock", active: false, color: "text-[var(--usb-fg-dim)]" }
      : { label: "Mock", active: true, color: "text-[var(--usb-warn-fg)]" },
  ];

  // ── Shared field styling (token-based so both themes are correct) ───────────
  const fieldClass =
    "w-full h-9 bg-[var(--usb-input-bg)] border border-[var(--usb-border)] focus:border-[var(--usb-accent-ring)] focus:ring-2 focus:ring-[var(--usb-accent-soft)] rounded-[var(--radius-md)] px-3 text-[11px] text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-placeholder)] outline-none transition-all font-mono";
  const labelClass = "text-[var(--usb-fg-lo)] text-[9px] uppercase tracking-wider";

  // ── Per-kind guidance so the fields are never a guessing game ───────────────
  const KIND_HINTS: Record<typeof provider.kind, { base: string; model: string }> = {
    local:    { base: "Servidor local incluido en el puerto 8010.",            model: "Se detecta automáticamente." },
    openai:   { base: "Cualquier endpoint compatible con OpenAI. Acepta también un proxy en 127.0.0.1 (p. ej. 6660).", model: "Ej.: gpt-4o-mini, deepseek-v4.1-flash" },
    anthropic:{ base: "Usa la API Messages de Anthropic.",                     model: "Ej.: claude-3-5-sonnet-latest" },
    gemini:   { base: "Usa las keys de Gemini de abajo.",                      model: "Ej.: gemini-2.5-flash" },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="api-panel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden border-b border-[var(--usb-border)] bg-[var(--usb-bg-5)] shrink-0"
        >
          <div className="px-4 pt-3.5 pb-4 space-y-4">

            {/* ── Header ── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-[var(--radius-md)] bg-[var(--usb-accent-soft)] flex items-center justify-center shrink-0">
                  <Cpu size={12} className="text-[var(--usb-accent-fg)]" />
                </span>
                <div className="leading-none">
                  <p className="text-[var(--usb-fg-hi)] text-[12px] tracking-tight" style={{ fontWeight: 600 }}>
                    Motores de IA
                  </p>
                  <p className="text-[var(--usb-fg-dim)] text-[9px] mt-[3px]">
                    Elige dónde traducir y estudiar
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] hover:bg-[var(--usb-fg-dim)]/10 transition-colors w-6 h-6 flex items-center justify-center rounded-[var(--radius-md)]"
                aria-label="Cerrar"
              >
                <X size={13} />
              </button>
            </div>

            {/* ── Provider ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={labelClass} style={{ fontWeight: 600 }}>Proveedor</span>
                <span className={`flex items-center gap-1 text-[9px] px-2 py-[3px] rounded-full ${
                  providerReady
                    ? "bg-[var(--usb-ok-soft)] text-[var(--usb-ok-fg)]"
                    : "bg-[var(--usb-fg-dim)]/10 text-[var(--usb-fg-lo)]"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${providerReady ? "bg-[var(--usb-ok)]" : "bg-[var(--usb-fg-dim)]"}`} />
                  {providerReady ? "activo" : "sin configurar"}
                </span>
              </div>

              {/* Segmented control — quiet, single pill */}
              <div className="relative flex gap-0.5 p-0.5 rounded-[var(--radius-md)] bg-[var(--usb-input-bg)]">
                {PROVIDER_KINDS.map((kind) => {
                  const isActive = provider.kind === kind;
                  return (
                    <button
                      key={kind}
                      onClick={() => changeProviderKind(kind)}
                      className={`relative flex-1 h-7 rounded-[var(--radius-sm)] text-[10px] transition-colors duration-200 z-10 ${
                        isActive
                          ? "text-white"
                          : "text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)]"
                      }`}
                      style={{ fontWeight: isActive ? 600 : 500 }}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="provider-pill"
                          className="absolute inset-0 rounded-[var(--radius-sm)] bg-[var(--usb-accent)] shadow-[0_1px_6px_var(--usb-accent-ring)]"
                          transition={{ type: "spring", stiffness: 480, damping: 38 }}
                        />
                      )}
                      <span className="relative">{PROVIDER_KINDS_LABELS[kind]}</span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[var(--usb-fg-dim)] text-[9px] leading-relaxed -mt-1">
                {KIND_HINTS[provider.kind].base}
              </p>

              <div className="space-y-1">
                <label className={labelClass}>Base URL</label>
                <input
                  type="text"
                  value={provider.baseUrl}
                  onChange={(e) => updateProvider({ baseUrl: e.target.value })}
                  placeholder={DEFAULT_BASE_URLS[provider.kind]}
                  autoComplete="off"
                  spellCheck={false}
                  className={fieldClass}
                />
              </div>

              {provider.kind !== "local" && (
                <div className="space-y-1">
                  <label className={labelClass}>API Key</label>
                  <div className="relative flex items-center">
                    <input
                      type={providerKeyVisible ? "text" : "password"}
                      value={provider.apiKey}
                      onChange={(e) => updateProvider({ apiKey: e.target.value })}
                      placeholder="sk-..."
                      autoComplete="off"
                      spellCheck={false}
                      className={`${fieldClass} pr-9`}
                    />
                    <button
                      onClick={() => setProviderKeyVisible((v) => !v)}
                      className="absolute right-2.5 text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] transition-colors"
                      aria-label={providerKeyVisible ? "Ocultar key" : "Mostrar key"}
                    >
                      {providerKeyVisible ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Modelo</label>
                  <span className="text-[var(--usb-fg-dim)] text-[8px] font-mono">{KIND_HINTS[provider.kind].model}</span>
                </div>
                <input
                  type="text"
                  value={provider.model}
                  onChange={(e) => updateProvider({ model: e.target.value })}
                  placeholder={DEFAULT_MODELS[provider.kind]}
                  autoComplete="off"
                  spellCheck={false}
                  className={fieldClass}
                />
              </div>

              <button
                onClick={handleSaveProvider}
                disabled={validating || !providerReady}
                className={`w-full flex items-center justify-center gap-1.5 h-8 rounded-[var(--radius-md)] text-[11px] transition-all duration-200 ${
                  validating
                    ? "bg-[var(--usb-accent)]/45 text-white/70 cursor-wait"
                    : providerSaved
                      ? "bg-[var(--usb-ok-soft)] text-[var(--usb-ok-fg)]"
                      : "bg-[var(--usb-accent)] hover:bg-[var(--usb-accent-2)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
                style={{ fontWeight: 600 }}
              >
                {validating
                  ? <><Loader2 size={11} className="animate-spin" />Probando conexión…</>
                  : providerSaved
                    ? <><CheckCircle2 size={11} />Proveedor guardado</>
                    : <><Zap size={11} />Probar y guardar</>}
              </button>

              <AnimatePresence>
                {validation && (
                  <motion.p
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`text-[10px] leading-relaxed rounded-[var(--radius-md)] px-2.5 py-2 border ${
                      validation.status === "ok"
                        ? "text-[var(--usb-ok-fg)] bg-[var(--usb-ok-soft)] border-[var(--usb-ok)]/25"
                        : "text-[var(--usb-warn-fg)] bg-[var(--usb-warn-soft)] border-[var(--usb-warn)]/25"
                    }`}
                  >
                    {validation.status === "ok" ? "✓ " : "⚠ "}{validation.message}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* ── Gemini keys ── */}
            <div className="space-y-2">
              <span className={labelClass} style={{ fontWeight: 600 }}>Gemini keys (fallback)</span>

              {keys.map((key, idx) => {
                const visible = Boolean(visibleKeys[idx]);
                const active = Boolean(key.trim());
                const duplicate = duplicateIndexes.has(idx);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="relative flex items-center">
                      <input
                        type={visible ? "text" : "password"}
                        value={key}
                        onChange={e => updateKey(idx, e.target.value)}
                        placeholder={`Key ${idx + 1}${idx === 0 ? " (principal)" : ""}`}
                        autoComplete="off"
                        spellCheck={false}
                        className={`${fieldClass} pr-16 ${
                          duplicate ? "border-[var(--usb-warn)]/50 focus:border-[var(--usb-warn)]/60" : ""
                        }`}
                      />
                      <button
                        onClick={() => setVisibleKeys(current => ({ ...current, [idx]: !visible }))}
                        className="absolute right-9 text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] transition-colors"
                        aria-label={visible ? "Ocultar key" : "Mostrar key"}
                      >
                        {visible ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                      <button
                        onClick={() => removeKey(idx)}
                        className="absolute right-2.5 text-[var(--usb-fg-lo)] hover:text-[var(--usb-danger-fg)] transition-colors"
                        title="Quitar key"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {duplicate ? (
                        <motion.p
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[var(--usb-warn-fg)] text-[9px] ml-0.5 flex items-center gap-1"
                        >
                          <AlertCircle size={8} />Key duplicada
                        </motion.p>
                      ) : active && (
                        <motion.p
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[var(--usb-ok-fg)] text-[9px] ml-0.5 flex items-center gap-1"
                        >
                          <CheckCircle2 size={8} />Activa · rotación #{idx + 1}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              <div className="flex gap-2">
                <button
                  onClick={addKey}
                  className="flex-1 h-8 rounded-[var(--radius-md)] border border-dashed border-[var(--usb-border-mid)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] hover:border-[var(--usb-fg-dim)] text-[10px] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus size={11} />Agregar key
                </button>
                <button
                  onClick={handleSave}
                  disabled={hasDuplicates}
                  className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-[var(--radius-md)] text-[11px] transition-all duration-200 ${
                    hasDuplicates
                      ? "text-[var(--usb-warn-fg)] cursor-not-allowed bg-[var(--usb-warn-soft)]"
                      : saved
                        ? "bg-[var(--usb-ok-soft)] text-[var(--usb-ok-fg)]"
                        : "bg-[var(--usb-accent)] hover:bg-[var(--usb-accent-2)] text-white"
                  }`}
                  style={{ fontWeight: 600 }}
                >
                  {hasDuplicates
                    ? <><AlertCircle size={11} />Duplicadas</>
                    : saved
                      ? <><CheckCircle2 size={11} />Guardado</>
                      : <><CheckCircle2 size={11} />Guardar keys</>}
                </button>
              </div>
            </div>

            {/* ── Chain ── */}
            <div className="flex items-center gap-1.5 pt-0.5">
              {chain.map((step, i) => (
                <div key={step.label} className="flex items-center gap-1.5">
                  <span className={`text-[9px] ${step.color}`} style={{ fontWeight: step.active ? 600 : 400 }}>
                    {step.label}
                  </span>
                  {i < chain.length - 1 && (
                    <ChevronRight size={8} className="text-[var(--usb-fg-dim)] shrink-0" />
                  )}
                </div>
              ))}
            </div>

            <p className="text-[var(--usb-fg-dim)] text-[9px] leading-relaxed">
              Guardado local · clic triple en ⚙ para Dev mode
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
