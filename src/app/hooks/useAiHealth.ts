// Estado real del proveedor de IA: el sondeo de la pipeline de traducción
// (Captions) y los textos comunes del estado (motivo del bloqueo e indicador
// de la cabecera).
//
// Study conserva su propio sondeo con el mismo criterio: unificarlos rompió
// qa-full-flows (CHANGELOG 1.5.13). Los dos publican `usb:ai-health`, que es lo
// que lee el indicador de la cabecera (InPageDock). El service worker cachea el
// veredicto 15 s, así que dos sondeos no duplican peticiones al proveedor.
//
// Criterio: sin IA disponible la acción no arranca y se explica por qué; el
// sondeo se repite (5 s si no está lista, 30 s si lo está) y todo se rehabilita
// solo en cuanto el proveedor aparece. Una sola cadena viva: cada sondeo nuevo
// cancela el temporizador pendiente y descarta la respuesta de uno anterior que
// siga en vuelo.

import { useEffect, useState } from "react";
import { AI_PROVIDER_STORAGE_KEY, redactProviderUrl } from "../services/ai-providers";

export type AiState = "comprobando" | "no-config" | "lista" | "sin-respuesta";

/** Motivo, en una frase, de por qué una acción de IA está bloqueada. Nunca lleva la query del endpoint. */
export function aiBlockedMessage(state: AiState, endpoint: string): string {
  if (state === "no-config") return "Sin proveedor de IA: configúralo en Ajustes → Proveedor.";
  if (state === "comprobando") return "Comprobando la IA…";
  const where = redactProviderUrl(endpoint);
  return `El proveedor no responde${where ? ` (${where})` : ""}. Reintentando…`;
}

export type AiBadge = { name: string; state: string; tone: "ok" | "cloud" | "off"; title: string };

const CLOUD_NAMES: Record<string, string> = { openai: "OpenAI", anthropic: "Claude", gemini: "Gemini" };

/**
 * Indicador de la cabecera del dock: motor activo + estado REAL. Antes, con un
 * proveedor en la nube decía «nube» aunque faltara la key o el proveedor no
 * respondiera, mientras el CTA decía lo contrario.
 */
export function aiBadgeStatus(input: { kind: string; ok: boolean | null; configured: boolean; endpoint: string; localConnected: boolean }): AiBadge {
  const where = redactProviderUrl(input.endpoint).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const cloudName = CLOUD_NAMES[input.kind];
  if (cloudName) {
    if (!input.configured) return { name: cloudName, state: "sin configurar", tone: "off", title: `${cloudName} sin configurar: añade la API key en Ajustes → Proveedor` };
    if (input.ok === false) return { name: cloudName, state: "sin respuesta", tone: "off", title: `${cloudName} no responde${where ? ` (${where})` : ""}. Reintentando…` };
    return { name: cloudName, state: "nube", tone: "cloud", title: `Proveedor activo: ${cloudName}` };
  }
  const localWhere = where || "127.0.0.1:8010";
  const connected = input.ok === null ? input.localConnected : input.ok;
  return connected
    ? { name: "IA local", state: "conectada", tone: "ok", title: `Servidor de IA local conectado (${localWhere})` }
    : { name: "IA local", state: "sin conexión", tone: "off", title: `Servidor de IA local sin conexión (${localWhere})` };
}

type HealthResponse = { ok?: boolean; configured?: boolean; endpoint?: string; status?: number };
type StorageListener = (changes: Record<string, unknown>, area: string) => void;
type ChromeApi = {
  runtime?: {
    id?: string;
    lastError?: { message?: string };
    sendMessage?: (msg: unknown, cb: (res: HealthResponse | undefined) => void) => void;
  };
  storage?: { onChanged?: { addListener: (cb: StorageListener) => void; removeListener: (cb: StorageListener) => void } };
};

function chromeApi(): ChromeApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

function isExtensionRuntime(): boolean {
  const api = chromeApi();
  return Boolean(api?.runtime?.id && typeof api.runtime.sendMessage === "function");
}

function askBackground(): Promise<HealthResponse> {
  const api = chromeApi();
  return new Promise((resolve, reject) => {
    try {
      api?.runtime?.sendMessage?.({ type: "USG_PROVIDER_HEALTH" }, (response) => {
        // Leer lastError lo da por atendido: sin esto Chrome registra
        // «Unchecked runtime.lastError» cada vez que el SW no contesta.
        if (api?.runtime?.lastError) { resolve({ ok: false, configured: true }); return; }
        resolve(response ?? { ok: false, configured: true });
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function useAiHealth(): { state: AiState; endpoint: string; ready: boolean; notice: string } {
  const [state, setState] = useState<AiState>(() => (isExtensionRuntime() ? "comprobando" : "lista"));
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    if (!isExtensionRuntime()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let run = 0;

    const probe = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      const id = ++run;
      // Extensión recargada con la pestaña abierta: el contexto ya no existe y
      // reintentar cada 5 s solo acumula errores. Se para.
      if (!isExtensionRuntime()) { alive = false; return; }
      try {
        const res = await askBackground();
        if (!alive || id !== run) return;
        const healthy = Boolean(res?.ok);
        const configured = res?.configured !== false;
        setEndpoint(res?.endpoint ?? "");
        const next: AiState = !configured ? "no-config" : healthy ? "lista" : "sin-respuesta";
        setState(next);
        window.dispatchEvent(new CustomEvent("usb:ai-health", { detail: { ok: healthy, configured } }));
        timer = setTimeout(probe, healthy ? 30000 : 5000);
      } catch {
        if (!alive || id !== run) return;
        setState("sin-respuesta");
        window.dispatchEvent(new CustomEvent("usb:ai-health", { detail: { ok: false, configured: true } }));
        timer = setTimeout(probe, 5000);
      }
    };

    void probe();
    const onConfig = () => { setState("comprobando"); void probe(); };
    window.addEventListener("usb:provider-changed", onConfig);
    // La configuración también puede cambiar por storage (otra pestaña, el
    // panel de Ajustes de otra ventana, un seed externo).
    const api = chromeApi();
    const onStorage: StorageListener = (changes, area) => {
      if (area === "local" && AI_PROVIDER_STORAGE_KEY in changes) onConfig();
    };
    api?.storage?.onChanged?.addListener(onStorage);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("usb:provider-changed", onConfig);
      api?.storage?.onChanged?.removeListener(onStorage);
    };
  }, []);

  return { state, endpoint, ready: state === "lista", notice: aiBlockedMessage(state, endpoint) };
}
