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
}

export { vocabularySessionKey } from "./vocabularyService";
export const vocabularyWordKey = (word: string) => word.toLowerCase().trim().replace(/\s+/g, " ");
export const vocabularyCriteriaKey = (config: VocabConfig) => JSON.stringify([config.targetLang, config.baseLangLabel.trim().toLowerCase(), config.minLevel]);
export function vocabularyMatches(word: string, text: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}
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
