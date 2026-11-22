// ─── ApiKeysPanel ─────────────────────────────────────────────────────────────
// Cuerpo de «Proveedor de IA» en Configuración (rediseño 5.1, el mismo
// lenguaje que el resto de Ajustes, en un solo nivel): Motor (cuál, y si
// funciona) · Conexión (servidor, o llave y modelo) · «Probar» y una línea
// con lo último que se supo. Una sola llave por proveedor (sin rotación).
// Probar = una petición corta real: se guarda solo si responde.

import { toast } from "sonner";
import React, { useState, useEffect } from "react";
import { Eye, EyeOff, Icon, Loader2, Zap } from "./icons";
import { useDockTheme } from "../contexts/ThemeContext";
import { chromeLocalStorage } from "../services/chromeStorage";
import {
  Disclosure, Field, SettingsGroup, StatusPill, fieldCls, primaryBtnCls, type ConnectionTone,
} from "./settings/SettingsKit";
import type { IconName } from "./icons";
import {
  DEFAULT_BASE_URLS,
  DEFAULT_MODELS,
  normalizeAiProviderConfig,
  validateProviderConfig,
  type AiProviderConfig,
  type AiProviderKind,
} from "../services/ai-providers";

interface ApiKeysPanelProps {
  /** Se sigue aceptando (lo pasa Ajustes); el estado de la IA local se ve en la barra del dock. */
  localConnected?: boolean;
  providerConfig: AiProviderConfig;
  onSaveProvider: (config: AiProviderConfig) => void;
}

const PROVIDER_KINDS: AiProviderKind[] = ["local", "openai", "anthropic", "gemini"];

const PROVIDER_KINDS_INFO: Record<AiProviderKind, { label: string; tag: string; desc: string; icon: IconName; keyHint: string; models: string[] }> = {
  local: { label: "Local", tag: "En tu equipo", desc: "Servidor local en tu ordenador compatible con OpenAI (sin llave API).", icon: "hardDrive", keyHint: "", models: [] },
  openai: { label: "OpenAI", tag: "Con llave", desc: "Modelos de OpenAI o servicios compatibles (DeepSeek, OpenRouter, Groq).", icon: "zap", keyHint: "platform.openai.com → API keys", models: ["gpt-4o-mini", "gpt-4o"] },
  anthropic: { label: "Claude", tag: "Con llave", desc: "Modelos Claude de Anthropic.", icon: "brain", keyHint: "console.anthropic.com → API keys", models: ["claude-sonnet-5", "claude-haiku-4-5-20251001"] },
  gemini: { label: "Gemini", tag: "Con llave", desc: "Modelos Gemini de Google AI Studio.", icon: "sparkles", keyHint: "aistudio.google.com → Get API key", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
};

const ENDPOINT_HINTS: Record<AiProviderKind, string> = {
  local: "Servidor local compatible con OpenAI.",
  openai: "Para servicios compatibles (ej. api.deepseek.com/v1).",
  anthropic: "Déjalo por defecto salvo proxy propio.",
  gemini: "Déjalo por defecto salvo proxy propio.",
};

/** El último «Probar» que respondió (o no), por configuración: el estado sin gastar otra petición. */
const LAST_CHECK_KEY = "kinema_ai_last_check";
type LastCheck = { fingerprint: string; ok: boolean; message: string; at: number };
const fingerprintOf = (raw: AiProviderConfig) => {
  const c = normalizeAiProviderConfig(raw);
  return `${c.kind}|${c.baseUrl}|${c.model}|${c.apiKey ? `${c.apiKey.length}:${c.apiKey.slice(-4)}` : ""}`;
};
const formatWhen = (ms: number) => new Date(ms).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const isLoopback = (url: string) => { try { return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname); } catch { return false; } };

/** Infer the provider kind from a base URL so the two can never disagree. */
function inferProviderKind(rawUrl: string): AiProviderKind | null {
  const url = String(rawUrl || "").toLowerCase();
  if (!url) return null;
  // Un servidor de este ordenador puede ser «Local» u «OpenAI compatible»:
  // lo decide el motor elegido, no la URL.
  if (isLoopback(rawUrl)) return null;
  if (url.includes("anthropic")) return "anthropic";
  if (url.includes("generativelanguage.googleapis") || url.includes("/v1beta")) return "gemini";
  if (url.includes("/v1") || url.includes("openai") || url.includes("deepseek") || url.includes("openrouter")) return "openai";
  return null;
}

export function ApiKeysPanel({
  providerConfig,
  onSaveProvider,
}: ApiKeysPanelProps) {
  const { isSepia } = useDockTheme();
  const [provider, setProvider] = useState<AiProviderConfig>(providerConfig);
  const [providerSaved, setProviderSaved] = useState(false);
  const [providerKeyVisible, setProviderKeyVisible] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ status: string; message: string } | null>(null);
  const [lastCheck, setLastCheck] = useState<LastCheck | null>(null);
  useEffect(() => {
    let alive = true;
    void chromeLocalStorage.get([LAST_CHECK_KEY]).then((items) => {
      const value = items[LAST_CHECK_KEY] as LastCheck | undefined;
      if (alive && value && typeof value.fingerprint === "string") setLastCheck(value);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const rememberCheck = (config: AiProviderConfig, ok: boolean, message: string) => {
    const value: LastCheck = { fingerprint: fingerprintOf(config), ok, message, at: Date.now() };
    setLastCheck(value);
    void chromeLocalStorage.set({ [LAST_CHECK_KEY]: value }).catch(() => undefined);
  };

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

  // Cuando el usuario concede el permiso en permission.html (otra pestaña), el
  // service worker lo detecta con permissions.onAdded y lo reenvía hasta aquí.
  // Se avisa para que el usuario sepa que ya puede pulsar Guardar.
  useEffect(() => {
    const onAdded = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; origins?: string[] }>).detail;
      if (detail?.type !== 'USG_HOST_PERMISSION_ADDED') return;
      if (!(detail.origins ?? []).length) return;
      toast.success("Permiso concedido", {
        description: "Ya puedes pulsar «Probar y guardar».",
        duration: 8000,
      });
    };
    window.addEventListener('usb_to_sidebar', onAdded as EventListener);
    return () => window.removeEventListener('usb_to_sidebar', onAdded as EventListener);
  }, []);

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
      // id estable: sin él, un re-render del panel durante los primeros
      // milisegundos hacía que sonner descartara el toast al instante (medido:
      // vivía ~200 ms pese a duration: 15000) y el usuario no llegaba a ver
      // ni el aviso ni el botón.
      toast.error("Sin permiso de red para ese endpoint", {
        id: 'host-permission-missing',
        description: "Chrome bloquea las peticiones a hosts fuera de los permitidos.",
        // sonner v2 acepta las dos formas de `action`: el objeto {label,onClick}
        // de v1 sigue soportado (lo convierte en <button> él mismo).
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
    if (result.status === 'ok' || result.status === 'unreachable' || result.status === 'http_error') rememberCheck(provider, result.status === 'ok', result.message);
    // Un resultado con error es un veredicto, no un fallo de la sonda: hay que
    // mostrarlo. Antes se guardaba el proveedor igual y se marcaba «Guardado y
    // activo», así que un endpoint caído (HTTP 503, sin red, llave inválida)
    // quedaba configurado sin que el usuario viera por qué fallaba.
    if (result.status !== 'ok') {
      toast.error(result.status === 'unreachable' ? 'El endpoint no responde' : 'El endpoint respondió con error', {
        id: 'provider-validation-failed',
        description: result.message,
        duration: 12000,
      });
      return;
    }
    onSaveProvider(provider);
    setProviderSaved(true);
    setTimeout(() => setProviderSaved(false), 2600);
  };

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
    const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: Function; lastError?: unknown } } }).chrome?.runtime;
    if (!runtime?.sendMessage) return null;
    const ask = () => new Promise<boolean | null>((resolve) => {
      try {
        runtime.sendMessage({ type: 'USG_HOST_COVERED', origin }, (response: { covered?: boolean } | null) => {
          // Leer lastError consume el error benigno (recarga de la extensión,
          // puerto cerrado). Sin esto, Chrome lo reporta en consola como
          // "Unchecked runtime.lastError".
          const err = (runtime as { lastError?: { message?: string } }).lastError;
          void err;
          resolve(response && typeof response.covered === 'boolean' ? response.covered : null);
        });
      } catch {
        resolve(null);
      }
    });
    // El service worker puede estar dormido: el primer mensaje lo despierta y
    // se pierde. Se reintenta un par de veces antes de dudar. Medido en la
    // página real — sin esto, la consulta devolvía null y el guard no saltaba.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const covered = await ask();
      if (covered !== null) return covered;
      await new Promise((r) => setTimeout(r, 900));
    }
    return null;
  };

  /**
   * Abre la página propia de la extensión que SÍ puede pedir el permiso.
   *
   * Lo abre el service worker porque el panel vive en el content script, donde
   * chrome.tabs es undefined (mismo caso que chrome.permissions). Abrir una
   * pestaña no exige gesto: el gesto real ocurre después, cuando el usuario
   * pulsa el botón dentro de la página. El tema viaja en la URL para que la
   * página use los mismos tokens que el dock.
   */
  const openPermissionPage = async (baseUrl: string): Promise<void> => {
    let origin: string | null = null;
    try { origin = new URL(baseUrl).origin; } catch { origin = null; }
    const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: { sendMessage?: Function; lastError?: unknown } } }).chrome?.runtime;
    if (!origin || !runtime?.sendMessage) {
      toast.error("No se pudo abrir la página de permisos", {
        description: "Vuelve a intentarlo desde el panel del proveedor.",
      });
      return;
    }
    try {
      const response = await new Promise<{ ok?: boolean } | null>((resolve) => {
        runtime.sendMessage({ type: 'USG_OPEN_PERMISSION_PAGE', origin, theme: isSepia ? 'sepia' : 'dark' }, (r: { ok?: boolean } | null) => {
          void runtime.lastError; // consume el error benigno del puerto
          resolve(r ?? null);
        });
      });
      if (!response?.ok) {
        toast.error("No se pudo abrir la página de permisos", {
          description: "Vuelve a intentarlo desde el panel del proveedor.",
        });
        return;
      }
      toast.info("Concede el permiso en la pestaña que se abrió", {
        description: "Luego pulsa Guardar aquí para validar el endpoint.",
        duration: 12000,
      });
    } catch {
      toast.error("No se pudo abrir la página de permisos");
    }
  };

  const saved = providerConfig;
  const dirty = fingerprintOf(provider) !== fingerprintOf(saved);
  const savedInfo = PROVIDER_KINDS_INFO[saved.kind];
  const savedReady = saved.kind === "local" ? Boolean(saved.baseUrl) : Boolean(saved.baseUrl && saved.apiKey);
  const savedCheck = lastCheck && lastCheck.fingerprint === fingerprintOf(saved) ? lastCheck : null;
  const info = PROVIDER_KINDS_INFO[provider.kind];
  const monoField = fieldCls + " font-mono";
  const host = (() => { try { return new URL(saved.baseUrl).host; } catch { return saved.baseUrl; } })();

  // Qué se dice arriba: el motor GUARDADO (el que usa Kinema) y lo último que se supo de él.
  let tone: ConnectionTone;
  let statusText: string;
  if (validating) { tone = "busy"; statusText = "Comprobando conexión…"; }
  else if (validation && validation.status !== "ok") { tone = "warn"; statusText = validation.message; }
  else if (dirty) { tone = "idle"; statusText = "Cambios sin guardar."; }
  else if (!savedReady) { tone = "warn"; statusText = "Falta la llave API."; }
  else if (savedCheck?.ok) { tone = "ok"; statusText = `Verificado (${formatWhen(savedCheck.at)}).`; }
  else if (savedCheck && !savedCheck.ok) { tone = "warn"; statusText = savedCheck.message; }
  else { tone = "idle"; statusText = "Sin verificar."; }
  const pill = tone === "ok" ? "Conectado" : tone === "busy" ? "Comprobando" : tone === "warn" ? "No responde" : dirty ? "Sin guardar" : "Sin verificar";

  const engineName = saved.kind === "local" ? `Local · ${host}` : `${savedInfo.label}${saved.model ? ` · ${saved.model}` : ""}`;

  return (
    <div className="space-y-4">
      <SettingsGroup title="Motor" aside={<StatusPill tone={tone}>{pill}</StatusPill>}>
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
                className="kx-tile-btn kx-choice border border-[var(--usb-border)] !h-[68px] !gap-0.5 !text-[12px] rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d4aff]/70"
              >
                <Icon name={PROVIDER_KINDS_INFO[kind].icon} size={17} />
                <span className="mt-0.5">{PROVIDER_KINDS_INFO[kind].label}</span>
                <span className="text-[10px] font-medium opacity-80">{PROVIDER_KINDS_INFO[kind].tag}</span>
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Conexión">
        <div className="space-y-3">
          {provider.kind === "local" ? (
            <Field label="Servidor" hint={ENDPOINT_HINTS.local}>
              <input type="text" value={provider.baseUrl} onChange={(e) => updateProvider({ baseUrl: e.target.value })} placeholder={DEFAULT_BASE_URLS.local} autoComplete="off" spellCheck={false} className={monoField} aria-label="Endpoint" />
            </Field>
          ) : (
            <Field label="Llave API" hint={`Solo en este navegador · ${info.keyHint}`}>
              <span className="relative flex items-center">
                <input type={providerKeyVisible ? "text" : "password"} value={provider.apiKey} onChange={(e) => updateProvider({ apiKey: e.target.value })} placeholder={provider.kind === "anthropic" ? "sk-ant-…" : provider.kind === "gemini" ? "AIza…" : "sk-…"} autoComplete="off" spellCheck={false} className={`${monoField} pr-9`} />
                <button type="button" onClick={(e) => { e.preventDefault(); setProviderKeyVisible((v) => !v); }} className="absolute right-1.5 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)] transition-colors" aria-label={providerKeyVisible ? "Ocultar llave" : "Mostrar llave"}>
                  {providerKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
            </Field>
          )}

          <Field label="Modelo">
            <input type="text" value={provider.model} onChange={(e) => updateProvider({ model: e.target.value })} placeholder={DEFAULT_MODELS[provider.kind]} autoComplete="off" spellCheck={false} className={monoField} />
          </Field>
          {info.models.length > 0 && (
            <div className="flex flex-wrap gap-1.5 -mt-1.5" aria-label="Modelos sugeridos">
              {info.models.map((model) => (
                <button key={model} type="button" onClick={() => updateProvider({ model })} aria-pressed={provider.model === model}
                  className={`kx-choice h-7 px-2.5 rounded-lg border font-mono text-[11px] transition-colors ${provider.model === model ? "border-[#6d4aff]/50 bg-[var(--usb-accent-soft)] text-[var(--usb-fg-hi)]" : "border-[var(--usb-border)] bg-[var(--usb-bg-2)] text-[var(--usb-fg-mid)] hover:text-[var(--usb-fg-hi)]"}`}>
                  {model}
                </button>
              ))}
            </div>
          )}

          {provider.kind !== "local" && (
            <Disclosure summary="Endpoint personalizado (opcional)" defaultOpen={provider.baseUrl !== DEFAULT_BASE_URLS[provider.kind]}>
              <input type="text" value={provider.baseUrl} onChange={(e) => updateProvider({ baseUrl: e.target.value })} placeholder={DEFAULT_BASE_URLS[provider.kind]} autoComplete="off" spellCheck={false} className={monoField} aria-label="Endpoint" />
              <p className="text-[11px] leading-snug text-[var(--usb-fg-mid)]">{ENDPOINT_HINTS[provider.kind]}</p>
            </Disclosure>
          )}
        </div>
      </SettingsGroup>

      <div className="space-y-2">
        <button
          type="button"
          onClick={handleSaveProvider}
          disabled={validating}
          className={`${primaryBtnCls} !h-9 w-full`}
          style={providerSaved ? ({ "--kx-btn": "#059669" } as React.CSSProperties) : undefined}
        >
          {validating ? <><Loader2 size={14} className="animate-spin motion-reduce:animate-none" />Comprobando…</>
            : providerSaved ? <><Icon name="checkCircle2" size={14} />Guardado y conectado</>
            : <><Zap size={14} />{dirty ? "Probar y guardar" : "Probar conexión"}</>}
        </button>
        <p role="status" data-ai-connection className={`text-[11px] leading-snug ${tone === "warn" ? "text-[var(--usb-warn-text)]" : tone === "ok" ? "text-[var(--usb-ok-text)]" : "text-[var(--usb-fg-mid)]"}`}>
          <span className="font-semibold">{engineName}.</span> <span data-ai-connection-status>{statusText}</span>
        </p>
      </div>
    </div>
  );
}
