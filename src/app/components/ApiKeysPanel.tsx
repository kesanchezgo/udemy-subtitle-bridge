// ─── ApiKeysPanel ─────────────────────────────────────────────────────────────
// Configuración de motores de IA y modelos: proveedor (Local / OpenAI-compatible /
// Anthropic Claude / Google Gemini) + llaves API en rotación para Gemini fallback.
//
// Cadena de resolución:
//   IA Local (8010) → Proveedor configurado → Google Gemini (fallback) → Mock local
//
// Diseño:
//   Alineado con el diseño estético del dock y de StudyAgentTab:
//   - Tarjeta refinada con bordes tenues y elevación suave.
//   - Selector segmentado de proveedor tipo pill con transiciones fluidas.
//   - Status badges con micro-indicadores y pulsos activos.
//   - Campos de texto limpios con iconos descriptivos y feedback inmediato.
//   - Visualización de la cadena de fallback elegante con chips de estado.
//   - 100% tokenizado con variables CSS (--usb-*) para soporte idéntico en dark y sepia/light.

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useDockTheme } from "../contexts/ThemeContext";
import {
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Zap,
  Server,
  Sparkles,
  KeyRound,
  HardDrive,
  Brain,
  Icon,
} from "./icons";
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

const PROVIDER_KINDS_INFO: Record<AiProviderKind, { label: string; desc: string; icon: React.ReactNode }> = {
  local: { label: "Local", desc: "Ollama / vLLM / LM Studio", icon: <HardDrive size={18} /> },
  openai: { label: "OpenAI", desc: "GPT-4o, DeepSeek, etc.", icon: <Zap size={18} /> },
  anthropic: { label: "Claude", desc: "Anthropic Messages API", icon: <Brain size={18} /> },
  gemini: { label: "Gemini", desc: "Google 2.5 Flash / Pro", icon: <Sparkles size={18} /> },
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
  const { t } = useDockTheme();
  const [keys, setKeys] = useState<string[]>(apiKeys.length ? apiKeys : [""]);
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState<AiProviderConfig>(providerConfig);
  const [providerSaved, setProviderSaved] = useState(false);
  const [providerKeyVisible, setProviderKeyVisible] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ status: string; message: string } | null>(null);
  const [activeTabSection, setActiveTabSection] = useState<"provider" | "gemini">("provider");

  const externalSignature = apiKeys.join("\n");
  const externalProviderSignature = `${providerConfig.kind}|${providerConfig.baseUrl}|${providerConfig.apiKey}|${providerConfig.model}`;

  useEffect(() => { setKeys(apiKeys.length ? apiKeys : [""]); }, [externalSignature]);
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
    onSaveProvider(provider);
    setProviderSaved(true);
    setTimeout(() => setProviderSaved(false), 2600);
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

  const chain = [
    {
      id: "step-local",
      title: "Local (8010)",
      sub: "Servidor local",
      active: localConnected,
    },
    {
      id: `step-provider-${provider.kind}`,
      title: PROVIDER_KINDS_INFO[provider.kind]?.label ?? "Proveedor",
      sub: provider.model ? provider.model.split("/").pop() : "Configurado",
      active: providerReady,
    },
    {
      id: "step-gemini",
      title: activeCount > 0 ? `Gemini (${activeCount})` : "Gemini",
      sub: "Fallback cloud",
      active: activeCount > 0,
    },
    {
      id: productionRuntime ? "step-fallback-prod" : "step-fallback-mock",
      title: productionRuntime ? "Directo" : "Mock",
      sub: productionRuntime ? "Sin mock" : "Offline",
      active: !productionRuntime,
    },
  ];

  const fieldClass =
    "kx-field w-full h-11 bg-[var(--usb-bg-3)] border border-[var(--usb-border)] focus:border-[#6d4aff]/60 focus:ring-2 focus:ring-[#6d4aff]/25 rounded-2xl px-3.5 text-[12.5px] font-medium text-[var(--usb-fg-hi)] placeholder:text-[var(--usb-fg-lo)] outline-none transition-colors font-mono";
  const labelClass = "kx-slate";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="api-panel"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="usb-ai-panel kx-ov-top overflow-hidden border-b border-[var(--usb-border)] bg-[var(--usb-bg-5)] shrink-0"
        >
          <div className="px-4 pt-4 pb-4 space-y-4 max-w-full">

            {/* ── Encabezado ── */}
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border"
                style={{
                  background: "color-mix(in srgb, #6d4aff 20%, var(--usb-bg-3))",
                  borderColor: "color-mix(in srgb, #6d4aff 45%, var(--usb-border))",
                  color: t("#b7a6ff", "#5b37e8"),
                  boxShadow: "0 6px 12px -8px #6d4aff",
                }}>
                <Icon name="cpu" size={20} weight="duotone" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="kx-slate">Configuración</p>
                <h3 className="text-[var(--usb-fg-hi)] text-[15px] tracking-tight font-bold leading-tight mt-0.5">Motores de IA</h3>
                <p className="text-[12px] font-medium text-[var(--usb-fg-mid)] leading-snug mt-0.5">
                  Elige qué modelo traduce y responde. Si falla, Kinema pasa al siguiente.
                </p>
              </div>
              <button
                onClick={onClose}
                className="kx-chip shrink-0 w-8 h-8 flex items-center justify-center rounded-full"
                aria-label="Cerrar panel"
              >
                <X size={14} />
              </button>
            </div>

            {/* ── Sub-tabs ── */}
            <div className="kx-seg" role="tablist">
              {([
                { id: "provider", label: "Proveedor", icon: <Server size={14} />, badge: null },
                { id: "gemini", label: "Llaves Gemini", icon: <KeyRound size={14} />, badge: activeCount > 0 ? activeCount : null },
              ] as const).map((tab) => {
                const active = activeTabSection === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTabSection(tab.id)}
                    className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] transition-colors ${
                      active ? "kx-tab-on" : "text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)]"
                    }`}
                  >
                    {active && (
                      <motion.span layoutId="aiSectionPill" className="kx-seg-pill"
                        transition={{ type: "spring", stiffness: 460, damping: 36 }} />
                    )}
                    <span className="relative">{tab.icon}</span>
                    <span className="relative" style={{ fontWeight: active ? 600 : 500 }}>{tab.label}</span>
                    {tab.badge !== null && (
                      <span className="relative text-[10.5px] tabular-nums px-1.5 rounded-full bg-white/25 font-semibold">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>


            {/* ── Sección 1: Proveedor Principal ── */}
            {activeTabSection === "provider" && (
              <motion.div
                key="tab-provider"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                {/* Selector de proveedor */}
                <div className="grid grid-cols-4 gap-2.5">
                  {PROVIDER_KINDS.map((kind) => {
                    const isSelected = provider.kind === kind;
                    const info = PROVIDER_KINDS_INFO[kind];
                    return (
                      <button
                        key={kind}
                        onClick={() => changeProviderKind(kind)}
                        aria-pressed={isSelected}
                        data-on={isSelected ? "1" : "0"}
                        className="kx-tile-btn !h-[76px] !gap-1.5 !text-[12px] rounded-2xl font-semibold transition-all hover:border-[#6d4aff]/50"
                      >
                        {info.icon}
                        <span>{info.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[12px] text-[var(--usb-fg-mid)] px-1 font-medium leading-snug">
                  {PROVIDER_KINDS_INFO[provider.kind].desc}
                </p>

                {/* Campos del Proveedor */}
                <div className="kx-card rounded-2xl p-4 space-y-3.5 border border-[var(--usb-border)]">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className={labelClass}>Endpoint</label>
                    </div>
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
                      <div className="flex items-center justify-between">
                        <label className={labelClass}>API key</label>
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type={providerKeyVisible ? "text" : "password"}
                          value={provider.apiKey}
                          onChange={(e) => updateProvider({ apiKey: e.target.value })}
                          placeholder={provider.kind === "anthropic" ? "sk-ant-..." : "sk-..."}
                          autoComplete="off"
                          spellCheck={false}
                          className={`${fieldClass} pr-8`}
                        />
                        <button
                          onClick={() => setProviderKeyVisible((v) => !v)}
                          className="absolute right-2 text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] transition-colors p-1"
                          aria-label={providerKeyVisible ? "Ocultar key" : "Mostrar key"}
                        >
                          {providerKeyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className={labelClass}>Modelo</label>
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

                  {/* Botón de Test y Guardado */}
                  <div className="pt-1">
                    <button
                      onClick={handleSaveProvider}
                      disabled={validating}
                      className={`kx-on-solid kx-cta w-full flex items-center justify-center gap-1.5 h-11 rounded-2xl text-[12.5px] font-semibold transition-all duration-200 ${validating ? "opacity-60 cursor-wait" : ""}`}
                      style={providerSaved ? ({ "--kx-btn": "#059669" } as React.CSSProperties) : undefined}
                    >
                      {validating ? (
                        <>
                          <Loader2 size={13} className="animate-spin text-white/80" />
                          <span>Verificando conexión…</span>
                        </>
                      ) : providerSaved ? (
                        <>
                          <CheckCircle2 size={13} />
                          <span>Guardado y activo</span>
                        </>
                      ) : (
                        <>
                          <Zap size={13} />
                          <span>Probar conexión y guardar</span>
                        </>
                      )}
                    </button>
                  </div>

                  <AnimatePresence>
                    {validation && (
                      <motion.div
                        initial={{ opacity: 0, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`text-[11.5px] font-medium leading-relaxed rounded-xl p-3 flex items-start gap-2 border ${
                          validation.status === "ok"
                            ? "text-[var(--usb-fg-hi)] bg-[color-mix(in_srgb,#059669_10%,var(--usb-bg-3))] border-[#059669]/35"
                            : "text-[var(--usb-fg-hi)] bg-[color-mix(in_srgb,#d97706_10%,var(--usb-bg-3))] border-[#d97706]/35"
                        }`}
                      >
                        {validation.status === "ok" ? (
                          <CheckCircle2 size={13} className="shrink-0 mt-0.5 text-[#059669]" />
                        ) : (
                          <AlertCircle size={13} className="shrink-0 mt-0.5 text-[#d97706]" />
                        )}
                        <span>{validation.message}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* ── Sección 2: Gemini Fallback Keys ── */}
            {activeTabSection === "gemini" && (
              <motion.div
                key="tab-gemini"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15 }}
                className="space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="kx-slate">Respaldo</p>
                    <span className="text-[13px] font-bold tracking-tight text-[var(--usb-fg-hi)] block mt-0.5">Llaves Gemini en rotación</span>
                    <p className="text-[12px] font-medium text-[var(--usb-fg-mid)] leading-snug mt-1">
                      Si el proveedor falla o agota su cuota, se rota automáticamente entre estas llaves.
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums font-semibold px-2.5 py-1 rounded-full bg-[var(--usb-accent-soft)] text-[var(--usb-accent)]">
                    {activeCount} activa{activeCount === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-0.5">
                  {keys.map((key, idx) => {
                    const visible = Boolean(visibleKeys[idx]);
                    const active = Boolean(key.trim());
                    const duplicate = duplicateIndexes.has(idx);
                    return (
                      <div key={`gemini-key-${idx}`} className="space-y-0.5">
                        <div className="relative flex items-center">
                          <input
                            type={visible ? "text" : "password"}
                            value={key}
                            onChange={(e) => updateKey(idx, e.target.value)}
                            placeholder={`Gemini API Key ${idx + 1}${idx === 0 ? " (principal)" : ""}`}
                            autoComplete="off"
                            spellCheck={false}
                            className={`${fieldClass} pr-16 ${
                              duplicate ? "!border-[#d97706]/70 focus:!border-[#d97706]" : ""
                            }`}
                          />
                          <button
                            onClick={() => setVisibleKeys((current) => ({ ...current, [idx]: !visible }))}
                            className="absolute right-8 text-[var(--usb-fg-lo)] hover:text-[var(--usb-fg-hi)] transition-colors p-1"
                            aria-label={visible ? "Ocultar key" : "Mostrar key"}
                          >
                            {visible ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            onClick={() => removeKey(idx)}
                            className="absolute right-2 text-[var(--usb-fg-lo)] hover:text-rose-400 transition-colors p-1"
                            title="Quitar key"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {duplicate && (
                          <p className="text-[var(--usb-warn-text)] text-[10px] pl-1 flex items-center gap-1">
                            <AlertCircle size={10} /> Llave repetida en la lista
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2.5 pt-1.5">
                  <button
                    onClick={addKey}
                    className="kx-chip flex-1 h-11 rounded-2xl text-[12px] font-semibold flex items-center justify-center gap-1.5 hover:border-[#6d4aff]/50 transition-all"
                  >
                    <Plus size={14} />
                    <span>Añadir otra llave</span>
                  </button>

                  <button
                    onClick={handleSave}
                    disabled={hasDuplicates}
                    className={`kx-on-solid kx-cta flex-1 flex items-center justify-center gap-1.5 h-11 rounded-2xl text-[12.5px] font-bold transition-all duration-200 shadow-sm hover:brightness-105 ${hasDuplicates ? "opacity-50 cursor-not-allowed" : ""}`}
                    style={saved ? ({ "--kx-btn": "#059669" } as React.CSSProperties) : undefined}
                  >
                    {hasDuplicates ? (
                      <>
                        <AlertCircle size={14} />
                        <span>Llaves duplicadas</span>
                      </>
                    ) : saved ? (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Llaves guardadas</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Guardar llaves</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Orden de respaldo ── */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                    style={{
                      background: "color-mix(in srgb, #6d4aff 14%, var(--usb-bg-3))",
                      borderColor: "color-mix(in srgb, #6d4aff 32%, var(--usb-border))",
                      color: t("#b7a6ff", "#5b37e8"),
                    }}>
                    <Icon name="layers" size={15} weight="duotone" />
                  </span>
                  <span className="text-[12.5px] text-[var(--usb-fg-hi)] font-bold tracking-tight">Orden de respaldo</span>
                </span>
                <span className="kx-slate">Izquierda → derecha</span>
              </div>

              <ol className="kx-card grid grid-cols-4 overflow-hidden divide-x divide-[var(--usb-divider)]">
                {chain.map((step, i) => (
                  <li key={step.id} className="px-3 py-3 min-w-0">
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center text-[10.5px] tabular-nums font-bold mb-2 border"
                      style={step.active
                        ? { background: `color-mix(in srgb, ${i === 0 ? "#059669" : "#6d4aff"} 18%, var(--usb-bg-3))`, borderColor: `color-mix(in srgb, ${i === 0 ? "#059669" : "#6d4aff"} 45%, var(--usb-border))`, color: i === 0 ? t("#4ade9f", "#047857") : t("#b7a6ff", "#5b37e8") }
                        : { background: "var(--usb-bg-2)", borderColor: "var(--usb-border)", color: "var(--usb-fg-lo)" }}
                    >
                      {i + 1}
                    </span>
                    <p className={`text-[12px] font-bold leading-tight truncate ${step.active ? "text-[var(--usb-fg-hi)]" : "text-[var(--usb-fg-lo)]"}`}>{step.title}</p>
                    <p className="text-[11px] font-medium truncate mt-0.5 text-[var(--usb-fg-lo)]">{step.sub}</p>
                  </li>
                ))}
              </ol>
            </div>

            <p className="text-[11px] font-medium text-[var(--usb-fg-lo)] leading-snug">
              Las llaves se guardan solo en este navegador.
            </p>


          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
