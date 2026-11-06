/**
 * Repasos pendientes en Anki, vía AnkiConnect (a través del background).
 * Lo usan «Tu progreso» y el historial: la misma cifra y el mismo mazo raíz
 * que las exportaciones (Ajustes → Vocabulario → Mazo raíz). Sin extensión o
 * sin AnkiConnect devuelve null: la UI lo dice, no inventa un número.
 */
import { loadVocabConfig } from "./vocabularyService";

type ChromeLike = { runtime?: { id?: string; sendMessage?: (msg: unknown, cb: (res: unknown) => void) => void } };

async function askBackground(browse: boolean): Promise<unknown> {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome;
  if (!chromeApi?.runtime?.id || !chromeApi.runtime.sendMessage) return null;
  const rootDeck = (await loadVocabConfig().catch(() => null))?.rootDeck || "Kinema";
  return new Promise((resolve) => {
    try {
      chromeApi.runtime!.sendMessage!({ type: "USG_ANKI_DUE", course: "", lesson: "", browse, rootDeck, scope: "all" }, (res: unknown) => resolve(res ?? null));
    } catch { resolve(null); }
  });
}

/** Tarjetas para repasar hoy en todo el mazo raíz, o null si Anki no responde. */
export async function fetchAnkiDue(): Promise<number | null> {
  const res = (await askBackground(false)) as { ok?: boolean; due?: number } | null;
  return res?.ok && typeof res.due === "number" ? res.due : null;
}

/** Abre en Anki el navegador con los repasos de hoy. true si Anki respondió. */
export async function browseAnkiDue(): Promise<boolean> {
  const res = (await askBackground(true)) as { ok?: boolean } | null;
  return Boolean(res?.ok);
}
