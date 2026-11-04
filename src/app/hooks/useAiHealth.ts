// Disponibilidad real del proveedor de IA, en un solo sitio.
//
// El service worker sondea el proveedor CONFIGURADO (su /models, con sus
// cabeceras) y cachea el resultado 15 s, así que varios consumidores de este
// hook no generan peticiones extra: todos leen el mismo veredicto.
//
// Consumidores: el CTA de generación, generar/regenerar objetivos, refinar,
// vocabulario y la pipeline de traducción. El criterio es el mismo en todos:
// sin IA disponible la acción no arranca y se explica por qué; el sondeo se
// repite (5 s si no está lista, 30 s si lo está) y todo se rehabilita solo en
// cuanto el proveedor aparece.

import { useEffect, useState } from "react";

export type AiState = "comprobando" | "no-config" | "lista" | "sin-respuesta";

/** Motivo, en una frase, de por qué una acción de IA está bloqueada. */
export function aiBlockedMessage(state: AiState, endpoint: string): string {
  if (state === "no-config") return "Sin proveedor de IA: configúralo en Ajustes → Proveedor.";
  if (state === "comprobando") return "Comprobando la IA…";
  return `El proveedor no responde${endpoint ? ` (${endpoint})` : ""}. Reintentando…`;
}

type HealthResponse = { ok?: boolean; configured?: boolean; endpoint?: string; status?: number };

function isExtensionRuntime(): boolean {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { id?: string; sendMessage?: unknown } };
  }).chrome;
  return Boolean(chromeApi?.runtime?.id && typeof chromeApi.runtime.sendMessage === "function");
}

function askBackground(): Promise<HealthResponse> {
  const chromeApi = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { sendMessage?: (msg: unknown, cb: (res: HealthResponse) => void) => void } };
  }).chrome;
  return new Promise((resolve, reject) => {
    try {
      chromeApi?.runtime?.sendMessage?.({ type: "USG_PROVIDER_HEALTH" }, (response) => {
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

    const probe = async () => {
      try {
        const res = await askBackground();
        if (!alive) return;
        const healthy = Boolean(res?.ok);
        const configured = res?.configured !== false;
        setEndpoint(res?.endpoint ?? "");
        const next: AiState = !configured ? "no-config" : healthy ? "lista" : "sin-respuesta";
        setState(next);
        window.dispatchEvent(new CustomEvent("usb:ai-health", { detail: { ok: healthy, configured } }));
        timer = setTimeout(probe, healthy ? 30000 : 5000);
      } catch {
        if (!alive) return;
        setState("sin-respuesta");
        window.dispatchEvent(new CustomEvent("usb:ai-health", { detail: { ok: false, configured: true } }));
        timer = setTimeout(probe, 5000);
      }
    };

    void probe();
    const onConfig = () => { setState("comprobando"); void probe(); };
    window.addEventListener("usb:provider-changed", onConfig);
    // La configuración también puede cambiar por storage (otra pestaña,
    // el panel de Ajustes de otra ventana, un seed externo): sin esto el
    // dock seguiría con el veredicto viejo hasta el siguiente sondeo.
    const chromeApi = (globalThis as typeof globalThis & {
      chrome?: { storage?: { onChanged?: { addListener: (cb: (c: Record<string, { newValue?: unknown }>, area: string) => void) => void; removeListener: (cb: (c: Record<string, { newValue?: unknown }>, area: string) => void) => void } } };
    }).chrome;
    const onStorage = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && "usg_ai_provider_config" in changes) onConfig();
    };
    chromeApi?.storage?.onChanged?.addListener(onStorage);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("usb:provider-changed", onConfig);
      chromeApi?.storage?.onChanged?.removeListener(onStorage);
    };
  }, []);

  return { state, endpoint, ready: state === "lista", notice: aiBlockedMessage(state, endpoint) };
}
