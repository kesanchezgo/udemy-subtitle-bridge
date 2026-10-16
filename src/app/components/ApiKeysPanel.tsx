// ─── ApiKeysPanel ─────────────────────────────────────────────────────────────
// Cuerpo de la sección "Proveedor de IA" en Configuración: motor principal,
// endpoint, llave y modelo. Una sola llave por proveedor (sin rotación).
//
// Cadena de resolución:
//   IA local (8010) → Proveedor configurado → Demo offline (solo prototipo)

import { toast } from "sonner";
import React, { useState, useEffect } from "react";
import { Eye, EyeOff, CheckCircle2, Loader2, Zap, Sparkles, HardDrive, Brain, Icon } from "./icons";
import { Field, Notice, SettingsGroup, fieldCls, primaryBtnCls } from "./settings/SettingsKit";
import {
  DEFAULT_BASE_URLS,
  DEFAULT_MODELS,
  validateProviderConfig,
  type AiProviderConfig,
  type AiProviderKind,
} from "../services/ai-providers";

interface ApiKeysPanelProps {
  localConnected?: boolean;
  providerConfig: AiProviderConfig;
  onSaveProvider: (config: AiProviderConfig) => void;
}

const PROVIDER_KINDS: AiProviderKind[] = ["local", "openai", "anthropic", "gemini"];

const PROVIDER_KINDS_INFO: Record<AiProviderKind, { label: string; desc: string; icon: React.ReactNode; keyHint: string; models: string[] }> = {
  local: { label: "Local", desc: "En tu equipo · sin llave", icon: <HardDrive size={18} />, keyHint: "", models: [] },
  openai: { label: "OpenAI", desc: "OpenAI o compatible (DeepSeek, OpenRouter, Groq)", icon: <Zap size={18} />, keyHint: "platform.openai.com → API keys", models: ["gpt-4o-mini", "gpt-4o"] },
  anthropic: { label: "Claude", desc: "Anthropic", icon: <Brain size={18} />, keyHint: "console.anthropic.com → API keys", models: ["claude-sonnet-5", "claude-haiku-4-5-20251001"] },
  gemini: { label: "Gemini", desc: "Google AI Studio", icon: <Sparkles size={18} />, keyHint: "aistudio.google.com → Get API key", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
};

const ENDPOINT_HINTS: Record<AiProviderKind, string> = {
  local: "Servidor compatible con OpenAI: Kinema (8010), Ollama (:11434/v1) o LM Studio (:1234/v1).",
  openai: "Cambia la URL para usar otro servicio compatible, p. ej. api.deepseek.com/v1.",
  anthropic: "Normalmente no hace falta cambiarlo.",
  gemini: "Normalmente no hace falta cambiarlo.",
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
  localConnected = false,
  providerConfig,
  onSaveProvider,
}: ApiKeysPanelProps) {
  const [provider, setProvider] = useState<AiProviderConfig>(providerConfig);
  const [providerSaved, setProviderSaved] = useState(false);
  const [providerKeyVisible, setProviderKeyVisible] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ status: string; message: string } | null>(null);

  const externalProviderSignature = `${providerConfig.kind}|${providerConfig.baseUrl}|${providerConfig.apiKey}|${providerConfig.model}`;

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
    // El permiso de host opcional NO se puede pedir desde aquí: este panel vive
    // en el content script, donde chrome.permissions no existe, y el service
    // worker —que sí lo tiene— rechaza permissions.request con "must be called
    // during a user gesture" porque ese gesto no cruza el sendMessage. Los dos
    // casos comprobados en Chromium real.
    //
    // chrome://extensions → Acceso a sitios tampoco sirve: con permiso opcional
    // solo deja activar los hosts que el manifest ya declara, no añadir uno
    // nuevo. Por eso existe permission.html: es el único sitio donde el clic del
    // usuario llega a la API.
    setValidating(true);
    setValidation(null);
    const covered = await isHostCovered(provider.baseUrl);
    // Si el host no tiene permiso, la validación fallaría con un error de red
    // que no explica nada. Se avisa antes, con la acción que lo resuelve, y no
    // se gasta el intento.
    if (covered === false) {
      setValidating(false);
      toast.error("Sin permiso de red para ese endpoint", {
        description: "Chrome bloquea las peticiones a hosts fuera de los permitidos.",
        action: {
          label: "Conceder permiso",
          onClick: () => void openPermissionPage(provider.baseUrl),
        },
        duration: 15000,
      });
      return;
    }
    let result: Awaited<ReturnType<typeof validateProviderConfig>>;
    try {
      result = await validateProviderConfig(provider);
    } catch (error) {
      setValidating(false);
      toast.error("No se pudo validar el proveedor", { description: error instanceof Error ? error.message : "Inténtalo de nuevo." });
      return;
    }
    setValidating(false);
    setValidation(result);
    onSaveProvider(provider);
    setProviderSaved(true);
    setTimeout(() => setProviderSaved(false), 2600);
  };

  const productionRuntime = Boolean(
    (globalThis as typeof globalThis & { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id
  );

  /**
   * ¿El endpoint ya tiene permiso de red? Lo consulta el service worker, que es
   * quien tiene chrome.permissions. `contains` no exige gesto, así que aquí sí
   * se puede usar. Devuelve:
   *   true  → cubierto
   *   false → falta (los fetch fallarán)
   *   null  → no se pudo determinar (sin runtime o baseUrl no parseable)
   */
  const isHostCovered = async (baseUrl: string): Promise<boolean | null> => {
    let origin: string | null = null;
    try { origin = new URL(baseUrl).origin + '/*'; } catch { return null; }
    if (!origin) return null;
    const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: Function } } }).chrome?.runtime;
    if (!runtime?.sendMessage) return null;
    try {
      return await new Promise<boolean | null>((resolve) => {
        runtime.sendMessage({ type: 'USG_HOST_COVERED', origin }, (response: { covered?: boolean } | null) => {
          resolve(response && typeof response.covered === 'boolean' ? response.covered : null);
        });
      });
    } catch {
      return null;
    }
  };

  /**
   * Abre la página propia de la extensión que SÍ puede pedir el permiso: allí
   * `chrome.permissions` existe y el clic del usuario es un gesto válido.
   *
   * Se usa chrome.tabs.create en vez de openOptionsPage porque este necesita
   * recibir el host concreto (?origin=…), y openOptionsPage no admite parámetros.
   */
  const openPermissionPage = async (baseUrl: string): Promise<void> => {
    let origin: string | null = null;
    try { origin = new URL(baseUrl).origin; } catch { origin = null; }
    const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: { id?: string; getURL?: Function }; tabs?: { create?: Function } } }).chrome?.runtime;
    const tabs = (globalThis as typeof globalThis & { chrome?: { tabs?: { create?: Function } } }).chrome?.tabs;
    if (!origin || !runtime?.getURL || !tabs?.create) {
      toast.error("No se pudo abrir la página de permisos", {
        description: "Concédelo a mano en chrome://extensions → Kinema → Detalles.",
      });
      return;
    }
    try {
      await tabs.create({ url: `${runtime.getURL('permission.html')}?origin=${encodeURIComponent(origin)}` });
    } catch {
      toast.error("No se pudo abrir la página de permisos");
    }
  };

  const providerReady = provider.kind === "local"
    ? Boolean(provider.baseUrl)
    : Boolean(provider.baseUrl && provider.apiKey);

  // La IA local siempre se intenta primero; si el motor elegido ya es local,
  // no se repite como segundo paso.
  const chain = [
    { id: "local", title: "IA local", sub: localConnected ? "Conectada" : "Sin conexión", active: localConnected },
    ...(provider.kind === "local" ? [] : [{ id: provider.kind, title: PROVIDER_KINDS_INFO[provider.kind].label, sub: providerReady ? provider.model : "Falta la llave", active: providerReady }]),
    productionRuntime
      ? { id: "none", title: "Sin IA", sub: "Avisa del error", active: false }
      : { id: "mock", title: "Demo", sub: "Respuestas de ejemplo", active: true },
  ];

  const monoField = fieldCls + " font-mono";

  const info = PROVIDER_KINDS_INFO[provider.kind];

  return (
    <div className="space-y-4">
      <SettingsGroup title="Motor principal">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Motor principal">
          {PROVIDER_KINDS.map((kind) => {
            const isSelected = provider.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => changeProviderKind(kind)}
                data-on={isSelected ? "1" : "0"}
                className="kx-tile-btn kx-choice border border-[var(--usb-border)] !h-[64px] !gap-1 !text-[12px] rounded-xl font-semibold transition-all"
              >
                {PROVIDER_KINDS_INFO[kind].icon}
                <span>{PROVIDER_KINDS_INFO[kind].label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--usb-fg-mid)]">{info.desc}</p>
      </SettingsGroup>

      <SettingsGroup title="Conexión">
        <div className="space-y-3">
          {provider.kind !== "local" && (
            <Field label="Llave API" hint={<>Consíguela en {info.keyHint}.</>}>
              <span className="relative flex items-center">
                <input type={providerKeyVisible ? "text" : "password"} value={provider.apiKey} onChange={(e) => updateProvider({ apiKey: e.target.value })} placeholder={provider.kind === "anthropic" ? "sk-ant-…" : provider.kind === "gemini" ? "AIza…" : "sk-…"} autoComplete="off" spellCheck={false} className={`${monoField} pr-9`} />
                <button type="button" onClick={(e) => { e.preventDefault(); setProviderKeyVisible((v) => !v); }} className="absolute right-1.5 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] transition-colors" aria-label={providerKeyVisible ? "Ocultar llave" : "Mostrar llave"}>
                  {providerKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
            </Field>
          )}

          <Field label="Modelo" hint={info.models.length ? undefined : "El nombre que muestra tu servidor local."}>
            <input type="text" value={provider.model} onChange={(e) => updateProvider({ model: e.target.value })} placeholder={DEFAULT_MODELS[provider.kind]} autoComplete="off" spellCheck={false} className={monoField} />
          </Field>
          {info.models.length > 0 && (
            <div className="flex flex-wrap gap-1.5 -mt-1.5" aria-label="Modelos sugeridos">
              {info.models.map((model) => (
                <button key={model} type="button" onClick={() => updateProvider({ model })} aria-pressed={provider.model === model}
                  className={`h-7 px-2.5 rounded-lg border font-mono text-[11px] transition-colors ${provider.model === model ? "border-[#6d4aff]/50 bg-[var(--usb-accent-soft)] text-[var(--usb-fg-hi)]" : "border-[var(--usb-border)] bg-[var(--usb-bg-3)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)]"}`}>
                  {model}
                </button>
              ))}
            </div>
          )}

          <Field label="Endpoint" hint={ENDPOINT_HINTS[provider.kind]}>
            <input type="text" value={provider.baseUrl} onChange={(e) => updateProvider({ baseUrl: e.target.value })} placeholder={DEFAULT_BASE_URLS[provider.kind]} autoComplete="off" spellCheck={false} className={monoField} />
          </Field>
        </div>
      </SettingsGroup>

      <button
        type="button"
        onClick={handleSaveProvider}
        disabled={validating}
        className={`${primaryBtnCls} w-full`}
        style={providerSaved ? ({ "--kx-btn": "#059669" } as React.CSSProperties) : undefined}
      >
        {validating ? <><Loader2 size={14} className="animate-spin" />Verificando conexión…</>
          : providerSaved ? <><CheckCircle2 size={14} />Guardado y activo</>
          : <><Zap size={14} />Probar conexión y guardar</>}
      </button>

      {validation && (
        <Notice tone={validation.status === "ok" ? "ok" : "warn"} icon={validation.status === "ok" ? "checkCircle2" : "alertCircle"}>
          {validation.message}
        </Notice>
      )}

      <SettingsGroup title="Orden de uso" aside={<span className="text-[11px] text-[var(--usb-fg-mid)]">Si uno falla, pasa al siguiente</span>}>
        <ol className={`grid gap-2 ${chain.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {chain.map((step, i) => (
            <li key={step.id} className={`min-w-0 rounded-xl border px-2.5 py-2.5 ${step.active ? "border-[#6d4aff]/35 bg-[var(--usb-accent-soft)]" : "border-[var(--usb-border)] bg-[var(--usb-bg-3)]"}`}>
              <span className="text-[11px] font-bold tabular-nums text-[var(--usb-fg-mid)]">{i + 1}</span>
              <p className={`text-[12px] font-bold leading-tight truncate ${step.active ? "text-[var(--usb-fg-hi)]" : "text-[var(--usb-fg)]"}`}>{step.title}</p>
              <p className="text-[11px] truncate mt-0.5 text-[var(--usb-fg-mid)]">{step.sub}</p>
            </li>
          ))}
        </ol>
      </SettingsGroup>

      <p className="text-[11px] text-[var(--usb-fg-mid)] flex items-center gap-1.5"><Icon name="lock" size={12} /> La llave se guarda solo en este navegador.</p>
    </div>
  );
}
