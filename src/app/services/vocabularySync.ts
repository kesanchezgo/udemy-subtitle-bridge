/**
 * Fase 5 · las palabras marcadas de una lección llegan a Anki solas: al
 * terminar la lección (con Anki conectado) o, si Anki no respondía, en cuanto
 * vuelva a responder. Es el MISMO .apkg de siempre (note type, presets y GUID
 * por lema: una palabra vive una sola vez y reimportar no pisa), importado con
 * AnkiConnect. No hay descarga ni paso de «exportar».
 *
 * La espera vive en storage (VOCAB_WAITING_KEY): la deja el panel de Fijar al
 * terminar sin Anki y la vacía el envío. Solo lecciones terminadas con
 * palabras marcadas; nada de lo anterior se envía por su cuenta.
 */
import { buildAnkiApkg } from './ankiApkg';
import { sendVocabApkgToAnki } from './ankiBridge';
import { chromeLocalStorage } from './chromeStorage';
import { buildVocabularySpec, markVocabularyExported, type VocabConfig } from './vocabularyService';
import { exportedVocabularyKeys, readVocabularySession, updateVocabularySession, vocabularyWordKey, withVocabularyExportLock } from './vocabularySession';

export const VOCAB_WAITING_KEY = 'usb_vocab_waiting';
type Waiting = Record<string, { lessonUrl?: string; at: number }>;

export interface VocabSendResult {
	words: number;
	/** Notas que de verdad entraron (las que ya estaban no se duplican ni se pisan). */
	added: number;
	deck: string;
}

async function loadWaiting(): Promise<Waiting> {
	try {
		const raw = (await chromeLocalStorage.get([VOCAB_WAITING_KEY]))[VOCAB_WAITING_KEY];
		return raw && typeof raw === 'object' ? (raw as Waiting) : {};
	} catch {
		return {};
	}
}

/** Deja (o quita) las palabras de una lección esperando a Anki. */
export async function setVocabularyWaiting(key: string, waiting: boolean, lessonUrl?: string): Promise<void> {
	const current = await loadWaiting();
	if (waiting === Boolean(current[key])) return;
	const next = { ...current };
	if (waiting) next[key] = { ...(lessonUrl ? { lessonUrl } : {}), at: Date.now() };
	else delete next[key];
	await chromeLocalStorage.set({ [VOCAB_WAITING_KEY]: next });
}

export async function vocabularyWaitingKeys(): Promise<string[]> {
	return Object.keys(await loadWaiting());
}

/** Las palabras marcadas de esa sesión que aún no están en tu mazo (las que se enviarían). */
export async function unsentSelection(key: string): Promise<number> {
	const session = await readVocabularySession(key);
	if (!session || session.demo) return 0;
	const seen = await exportedVocabularyKeys(session.config.targetLang);
	return session.selected.filter((value) => !seen.has(value) && session.candidates.some((c) => vocabularyWordKey(c.word) === value)).length;
}

/**
 * Envía a Anki las palabras marcadas (y aún no enviadas) de una lección.
 * null si no hay nada que enviar (o es la demo). Lanza si Anki no responde:
 * entonces la espera se queda como está.
 * `live`: la configuración de ahora manda en el mazo y en las tarjetas por
 * palabra; idioma, nivel y lista son los de la sesión (con los que elegiste).
 */
export async function sendVocabularySelection(key: string, options: { lessonUrl?: string; live?: VocabConfig } = {}): Promise<VocabSendResult | null> {
	let result: VocabSendResult | null = null;
	await withVocabularyExportLock(key, async () => {
		const current = await readVocabularySession(key);
		if (!current || current.demo) return;
		const seen = await exportedVocabularyKeys(current.config.targetLang);
		const words = current.candidates
			.filter((word) => current.selected.includes(vocabularyWordKey(word.word)) && !seen.has(vocabularyWordKey(word.word)))
			.slice(0, current.config.maxWords);
		if (!words.length) return;
		const config: VocabConfig = options.live
			? { ...current.config, rootDeck: options.live.rootDeck, vocabDeck: options.live.vocabDeck, vocabDecks: options.live.vocabDecks, production: options.live.production }
			: current.config;
		const lessonUrl = /^https?:/.test(options.lessonUrl ?? '') ? options.lessonUrl : undefined;
		const { spec, deckPath } = buildVocabularySpec(words, current.course, current.lesson, config, lessonUrl);
		const apkg = await buildAnkiApkg(spec);
		const filename = `${current.lesson.replace(/[^a-z0-9]/gi, '_')}_vocabulario_${config.targetLang}.apkg`;
		const sent = await sendVocabApkgToAnki(apkg, filename, deckPath);
		await markVocabularyExported(config.targetLang, words, { course: current.course, lesson: current.lesson, deck: deckPath });
		await updateVocabularySession(key, (previous) => {
			const latest = previous ?? current;
			return { ...latest, exports: [...latest.exports, { words, config, createdAt: Date.now() }] };
		});
		result = { words: words.length, added: sent.added, deck: deckPath };
	});
	if (result) await setVocabularyWaiting(key, false);
	return result;
}

/** Lo que esperaba a Anki (de cualquier lección), ahora que responde. Devuelve las palabras enviadas. */
export async function sendWaitingVocabulary(options: { live?: VocabConfig; skip?: string } = {}): Promise<number> {
	const waiting = await loadWaiting();
	let words = 0;
	for (const [key, entry] of Object.entries(waiting)) {
		if (key === options.skip) continue;
		try {
			const sent = await sendVocabularySelection(key, { lessonUrl: entry.lessonUrl, live: options.live });
			if (sent) words += sent.words;
			else await setVocabularyWaiting(key, false);
		} catch {
			// Anki dejó de responder o la lección se está enviando ya: sigue esperando.
		}
	}
	return words;
}
