import { chromeLocalStorage } from "./chromeStorage";
import { filterVocabulary, loadVocabRegistry, type VocabConfig } from "./vocabularyService";
import type { VocabularyWord } from "../../shared/prompts";

export interface VocabularySession {
  course: string;
  lesson: string;
  config: VocabConfig;
  candidates: VocabularyWord[];
  selected: string[];
  demo: boolean;
  partial?: boolean;
  realBackup?: VocabularySession;
  exports: { words: VocabularyWord[]; config: VocabConfig; createdAt: number }[];
  /** Palabras que ya tienes (de otra lección o curso) y salen en esta: no se
   *  proponen, pero el chip del video las muestra como «En tu mazo». */
  known?: KnownVocabularyWord[];
}

export interface KnownVocabularyWord { word: string; phonetic: string; monolingual: string; course: string }

export { vocabularySessionKey } from "./vocabularyService";
export const vocabularyWordKey = (word: string) => word.toLowerCase().trim().replace(/\s+/g, " ");
export const vocabularyCriteriaKey = (config: VocabConfig) => JSON.stringify([config.targetLang, config.baseLangLabel.trim().toLowerCase(), config.minLevel]);
// Una sola regla de coincidencia (lema + flexiones + forma vista): shared/vocabMatch.ts.
import { vocabularyMatches } from "../../shared/vocabMatch";
export { vocabularyMatches };
let writes = Promise.resolve();
const exportLocks = new Set<string>();
export async function withVocabularyExportLock(key: string, action: () => Promise<void>): Promise<void> {
  if (exportLocks.has(key)) throw new Error("Esta lección ya se está exportando.");
  exportLocks.add(key);
  try { await action(); } finally { exportLocks.delete(key); }
}

export async function readVocabularySession(key: string): Promise<VocabularySession | null> {
  const stored = (await chromeLocalStorage.get([key]))[key] as VocabularySession | undefined;
  return stored && Array.isArray(stored.candidates) && Array.isArray(stored.selected) && Array.isArray(stored.exports) ? stored : null;
}

export function updateVocabularySession(key: string, update: (session: VocabularySession | null) => VocabularySession): Promise<void> {
  const task = writes.then(async () => {
    const next = update(await readVocabularySession(key));
    await chromeLocalStorage.set({ [key]: next });
  });
  writes = task.catch(() => {});
  return task;
}

/** Las palabras de tu mazo (este idioma) que aparecen en el texto de la lección. */
export async function knownVocabularyIn(lang: string, text: string): Promise<KnownVocabularyWord[]> {
  const registry = await loadVocabRegistry();
  const out: KnownVocabularyWord[] = [];
  for (const [key, entry] of Object.entries(registry)) {
    if (!key.startsWith(`${lang}|`)) continue;
    const word = key.slice(lang.length + 1);
    if (vocabularyMatches(word, text)) out.push({ word, phonetic: entry.phonetic ?? "", monolingual: entry.monolingual ?? "", course: entry.course });
  }
  return out;
}

/** De qué curso salió cada lema ya exportado (para decir dónde está en tu mazo). */
export async function exportedVocabularyOrigins(lang: string): Promise<Map<string, string>> {
  const registry = await loadVocabRegistry();
  return new Map(Object.entries(registry).filter(([key]) => key.startsWith(`${lang}|`)).map(([key, entry]) => [key.slice(lang.length + 1), entry.course]));
}

export async function exportedVocabularyKeys(lang: string): Promise<Set<string>> {
  const registry = await loadVocabRegistry();
  return new Set(Object.keys(registry).filter(key => key.startsWith(`${lang}|`)).map(key => key.slice(lang.length + 1)));
}

export function prepareVocabularyCandidates(words: VocabularyWord[], config: VocabConfig): VocabularyWord[] {
  return filterVocabulary(words.filter(word => ["A1", "A2", "B1", "B2", "C1", "C2"].includes(word.level)), { ...config, maxWords: Math.max(20, words.length) }).fresh;
}

export function toggleVocabularySelection(session: VocabularySession, word: string, exported: Set<string>): VocabularySession {
  const key = vocabularyWordKey(word);
  if (!session.candidates.some(candidate => vocabularyWordKey(candidate.word) === key)) throw new Error("Esta palabra no pertenece a la lección actual.");
  if (exported.has(key)) throw new Error("Esta palabra ya fue exportada.");
  if (session.selected.includes(key)) return { ...session, selected: session.selected.filter(value => value !== key) };
  if (session.selected.filter(value => !exported.has(value)).length >= session.config.maxWords) throw new Error(`Máximo ${session.config.maxWords} palabras nuevas. Desmarca una para añadir otra.`);
  return { ...session, selected: [...session.selected, key] };
}
