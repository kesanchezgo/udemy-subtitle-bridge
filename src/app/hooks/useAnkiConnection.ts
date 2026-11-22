/**
 * Estado de la conexión con Anki (AnkiConnect), compartido por Fijar, el
 * vocabulario y Ajustes: una sola comprobación cada 30 s para todos.
 *  · null  → sin extensión (vista previa) o aún sin comprobar.
 *  · available + granted → «Enviar a Anki» y lista de mazos.
 *  · available + denied  → Anki rechazó a Kinema (se dice cómo permitirlo).
 *  · !available          → Anki cerrado o sin AnkiConnect: queda el .apkg.
 */
import { useCallback, useEffect, useState } from "react";
import { ankiConnectStatus, ankiDeckNames, rememberedAnki } from "../services/ankiBridge";
import type { AnkiStatus } from "../services/ankiConnectOps";

type Snapshot = { status: AnkiStatus | null; decks: string[] | null; at: number; checking: boolean };
let snapshot: Snapshot = { status: null, decks: null, at: 0, checking: false };
const listeners = new Set<(s: Snapshot) => void>();
const publish = (next: Partial<Snapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((fn) => fn(snapshot));
};

let inflight: Promise<AnkiStatus | null> | null = null;
async function check(): Promise<AnkiStatus | null> {
  if (inflight) return inflight;
  publish({ checking: true });
  inflight = (async () => {
    const status = await ankiConnectStatus().catch(() => ({ available: false } as AnkiStatus));
    let decks: string[] | null = null;
    if (status?.available && status.permission === "granted") decks = await ankiDeckNames().catch(() => null);
    publish({ status, decks, at: Date.now(), checking: false });
    return status;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function useAnkiConnection(auto = true) {
  const [state, setState] = useState<Snapshot>(snapshot);
  useEffect(() => {
    listeners.add(setState);
    // Solo sin pedirlo si ya se conectó antes: la primera vez Anki muestra un diálogo de permiso.
    if (auto && Date.now() - snapshot.at > 30_000) void rememberedAnki().then((yes) => { if (yes) void check(); });
    return () => { listeners.delete(setState); };
  }, [auto]);
  const connect = useCallback(() => check(), []);
  const ready = Boolean(state.status?.available && state.status.permission === "granted");
  return { status: state.status, decks: state.decks, checking: state.checking, ready, connect };
}

/** Para pruebas: olvida la última comprobación. */
export function resetAnkiConnectionCache(): void {
  snapshot = { status: null, decks: null, at: 0, checking: false };
}
