/**
 * Estado de la conexión directa con Obsidian (plugin Local REST API),
 * compartido por Fijar, la Biblioteca y Ajustes: una comprobación cada 30 s
 * para todos (el equivalente de useAnkiConnection).
 *  · configured=false       → sin clave: Kinema usa obsidian:// como siempre.
 *  · status null            → sin extensión (vista previa) o aún sin comprobar.
 *  · available + authenticated → «ready»: se escribe todo de una vez.
 *  · available sin autenticar  → la clave no es la del plugin (se dice cómo arreglarlo).
 *  · !available             → Obsidian cerrado o sin el plugin: obsidian:// de respaldo.
 * A diferencia de AnkiConnect, el plugin no muestra ningún diálogo: con clave,
 * se comprueba solo.
 */
import { useCallback, useEffect, useState } from "react";
import { chromeLocalStorage } from "../services/chromeStorage";
import { loadObsidianExportConfig, OBSIDIAN_EXPORT_STORAGE_KEY } from "../services/obsidianExport";
import { obsidianStatus, restConnectionOf } from "../services/obsidianBridge";
import type { ObsidianRestStatus } from "../services/obsidianRestOps";

type Snapshot = { status: ObsidianRestStatus | null; configured: boolean; at: number; checking: boolean };
let snapshot: Snapshot = { status: null, configured: false, at: 0, checking: false };
const listeners = new Set<(s: Snapshot) => void>();
const publish = (next: Partial<Snapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((fn) => fn(snapshot));
};

let inflight: Promise<ObsidianRestStatus | null> | null = null;
async function check(): Promise<ObsidianRestStatus | null> {
  if (inflight) return inflight;
  publish({ checking: true });
  inflight = (async () => {
    const config = await loadObsidianExportConfig();
    const configured = Boolean(restConnectionOf(config));
    const status = configured ? await obsidianStatus().catch(() => ({ available: false } as ObsidianRestStatus)) : null;
    publish({ status, configured, at: Date.now(), checking: false });
    return status;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function useObsidianConnection(auto = true) {
  const [state, setState] = useState<Snapshot>(snapshot);
  useEffect(() => {
    listeners.add(setState);
    if (auto && Date.now() - snapshot.at > 30_000) void check();
    // Clave o URL nuevas en Ajustes: se vuelve a comprobar al momento.
    const off = chromeLocalStorage.onChange((changes) => {
      if (OBSIDIAN_EXPORT_STORAGE_KEY in changes) void check();
    });
    return () => { listeners.delete(setState); off(); };
  }, [auto]);
  const connect = useCallback(() => check(), []);
  const ready = Boolean(state.configured && state.status?.available && state.status.authenticated);
  return { status: state.status, configured: state.configured, checking: state.checking, ready, connect };
}

/** Para pruebas: olvida la última comprobación. */
export function resetObsidianConnectionCache(): void {
  snapshot = { status: null, configured: false, at: 0, checking: false };
}
