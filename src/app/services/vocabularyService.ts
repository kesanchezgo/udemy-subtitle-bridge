/**
 * Pipeline de vocabulario: convierte la transcripción de una lección en
 * tarjetas de vocabulario del idioma del curso (inglés ahora, arquitectura
 * abierta a cualquier idioma) y las empaqueta en un .apkg con su propio
 * note type + preset.
 *
 * Convivencia con la colección del usuario:
 *  - Note type propio "Udemy Bridge Vocab" con los MISMOS nombres de campo que
 *    el "English Cards" del usuario → el pipeline externo ANKI-IMAGE-SENTENCE
 *    (imágenes + corrección de traducciones, que selecciona por mazo + campo
 *    "picture" vacío) y ReadPronunciation (fonética + audio) funcionan sin
 *    cambios sobre estas notas.
 *  - GUID por contenido (idioma|lema): reexportar la misma palabra nunca
 *    duplica; actualiza la nota.
 *  - Registro local de lemas exportados (chrome.storage.local) para saltar
 *    palabras ya vistas de lecciones anteriores dentro del mismo idioma.
 */
import { chromeLocalStorage } from './chromeStorage';
import { cefrRank, type VocabularyWord } from '../../shared/prompts';
import {
	CONCEPT_MODEL,
	COURSES_PRESET,
	DEFAULT_ROOT_DECK,
	ROOT_DECK_DESCRIPTION,
	VOCAB_MODEL_NAME,
	VOCAB_PRESET,
	buildVocabModel,
	stableGuid,
	vocabDeckPath,
	type VocabAudioMode,
} from './ankiDesign';
import type { ApkgSpec } from './ankiApkgCore';

export interface VocabConfig {
	/** Mazo raíz de TODA la extensión (Courses + Vocabulary cuelgan de él). */
	rootDeck: string;
	/** Código corto del idioma objetivo: clave de registro y de mazo. */
	targetLang: string;
	/** Etiqueta visible del idioma (rama del árbol y textos). */
	targetLangLabel: string;
	/** Idioma base del estudiante (significados y traducciones). */
	baseLangLabel: string;
	/** Nivel CEFR mínimo (incluido). */
	minLevel: string;
	/** Máximo de palabras nuevas por lección. */
	maxWords: number;
	/**
	 * Fuente de audio de las tarjetas:
	 *  - "field" (default): archivos de calidad en "word audio"/"sentence audio"
	 *    (HyperTTS o el sistema externo con edge-tts). Sin archivo, sin botón.
	 *  - "tts": voces del sistema de Anki ({{tts}}), instantáneo y offline.
	 */
	audioMode: VocabAudioMode;
}

export const DEFAULT_VOCAB_CONFIG: VocabConfig = {
	rootDeck: DEFAULT_ROOT_DECK,
	targetLang: 'en',
	targetLangLabel: 'English',
	baseLangLabel: 'español',
	minLevel: 'B1',
	maxWords: 8,
	audioMode: 'field',
};

const VOCAB_CONFIG_KEY = 'usb_vocab_config';
const VOCAB_REGISTRY_KEY = 'usb_vocab_registry';

export interface VocabRegistryEntry {
	course: string;
	lesson: string;
	date: string;
	deck: string;
	word?: string;
	phonetic?: string;
	monolingual?: string;
}

export type VocabRegistry = Record<string, VocabRegistryEntry>;

export async function loadVocabConfig(): Promise<VocabConfig> {
	try {
		const stored = await chromeLocalStorage.get([VOCAB_CONFIG_KEY]);
		const raw = stored[VOCAB_CONFIG_KEY];
		if (raw && typeof raw === 'object') {
			const saved = raw as Partial<VocabConfig>;
			const merged: VocabConfig = {
				...DEFAULT_VOCAB_CONFIG,
				...saved,
				maxWords: Math.min(20, Math.max(3, Number(saved.maxWords) || DEFAULT_VOCAB_CONFIG.maxWords)),
			};
			// Migración de marca una vez: el default legacy 'Udemy Bridge' pasa a 'Kinema'
			// (los valores personalizados del usuario no se tocan).
			if (merged.rootDeck === 'Udemy Bridge') {
				merged.rootDeck = DEFAULT_VOCAB_CONFIG.rootDeck;
				void saveVocabConfig(merged).catch(() => {});
			}
			return merged;
		}
	} catch {
		/* defaults */
	}
	return { ...DEFAULT_VOCAB_CONFIG };
}

export async function saveVocabConfig(config: VocabConfig): Promise<void> {
	await chromeLocalStorage.set({ [VOCAB_CONFIG_KEY]: config });
}


/** Glosario de la lección actual: palabras exportadas con su IPA y definición
 *  monolingüe — alimenta el chip del overlay durante el video. */
export async function getLectureGlossary(course: string, lesson: string): Promise<{ word: string; phonetic: string; monolingual: string }[]> {
	const registry = await loadVocabRegistry();
	const wantCourse = course.trim().toLowerCase();
	const wantLesson = lesson.trim().toLowerCase();
	const out: { word: string; phonetic: string; monolingual: string }[] = [];
	for (const entry of Object.values(registry)) {
		if (!entry.word) continue;
		if (entry.course.trim().toLowerCase() !== wantCourse || entry.lesson.trim().toLowerCase() !== wantLesson) continue;
		out.push({ word: entry.word, phonetic: entry.phonetic ?? '', monolingual: entry.monolingual ?? '' });
	}
	return out;
}

export async function loadVocabRegistry(): Promise<VocabRegistry> {
	try {
		const stored = await chromeLocalStorage.get([VOCAB_REGISTRY_KEY]);
		const raw = stored[VOCAB_REGISTRY_KEY];
		if (raw && typeof raw === 'object') return raw as VocabRegistry;
	} catch {
		/* sin registro */
	}
	return {};
}

export async function markVocabularyExported(
	lang: string,
	words: VocabularyWord[],
	meta: { course: string; lesson: string; deck: string }
): Promise<void> {
	const registry = await loadVocabRegistry();
	const today = new Date().toISOString().slice(0, 10);
	for (const word of words) {
		registry[registryKey(lang, word.word)] = {
			...meta,
			date: today,
			word: word.word,
			phonetic: word.phonetic,
			monolingual: word.monolingual,
		};
	}
	await chromeLocalStorage.set({ [VOCAB_REGISTRY_KEY]: registry });
}

function registryKey(lang: string, word: string): string {
	return `${lang}|${normalizeLemma(word)}`;
}

function normalizeLemma(word: string): string {
	return String(word || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Extrae y valida la lista de palabras del payload JSON de la IA. */
export function parseVocabularyPayload(payload: unknown): VocabularyWord[] {
	const container = payload as { words?: unknown } | unknown[] | null;
	const list = Array.isArray(container)
		? container
		: Array.isArray((container as { words?: unknown })?.words)
			? ((container as { words: unknown[] }).words)
			: [];
	const words: VocabularyWord[] = [];
	for (const item of list) {
		if (!item || typeof item !== 'object') continue;
		const raw = item as Record<string, unknown>;
		const word = cleanText(raw.word);
		const sentence = cleanText(raw.sentence);
		const sentenceTranslation = cleanText(raw.sentenceTranslation);
		const meaning = cleanText(raw.meaning);
		if (!word || !sentence || !sentenceTranslation || !meaning) continue;
		words.push({
			word: normalizeLemma(word),
			level: String(raw.level || '').trim().toUpperCase(),
			pos: cleanText(raw.pos).toLowerCase() || 'word',
			meaning: meaning.toLowerCase(),
			sentence: ensureSentenceEnd(sentence),
			sentenceTranslation: ensureSentenceEnd(sentenceTranslation),
			// Campos que antes quedaban para herramientas externas y ahora la IA
			// genera directamente (vacíos tolerados: la plantilla los oculta).
			phonetic: cleanText(raw.phonetic),
			monolingual: cleanText(raw.monolingual),
		});
	}
	return words;
}

/**
 * Aplica el filtro de nivel (solo si la IA reportó nivel: nivel ausente no
 * castiga), deduplica lemas dentro del lote y aplica el tope por lección.
 */
export function filterVocabulary(words: VocabularyWord[], config: VocabConfig): { fresh: VocabularyWord[]; belowLevel: number } {
	const minRank = cefrRank(config.minLevel);
	const seenLemmas = new Set<string>();
	const fresh: VocabularyWord[] = [];
	let belowLevel = 0;
	for (const word of words) {
		const rank = cefrRank(word.level);
		if (rank !== -1 && minRank !== -1 && rank < minRank) {
			belowLevel += 1;
			continue;
		}
		const key = normalizeLemma(word.word);
		if (seenLemmas.has(key)) continue;
		seenLemmas.add(key);
		fresh.push(word);
	}
	return { fresh: fresh.slice(0, config.maxWords), belowLevel };
}

/** Separa las palabras ya exportadas antes (en cualquier lección del idioma). */
export function splitAlreadyExported(words: VocabularyWord[], registry: VocabRegistry, lang: string) {
	const fresh: VocabularyWord[] = [];
	const seen: VocabularyWord[] = [];
	for (const word of words) {
		if (registry[registryKey(lang, word.word)]) seen.push(word);
		else fresh.push(word);
	}
	return { fresh, seen };
}

export interface VocabSpecResult {
	spec: ApkgSpec;
	deckPath: string;
}

/**
 * Spec completa del .apkg de vocabulario (árbol + note type + ambos presets).
 * Pura: el empaquetado (zip) lo hace buildAnkiApkg en la UI / QA.
 */
export function buildVocabularySpec(
	words: VocabularyWord[],
	course: string,
	lesson: string,
	config: VocabConfig
): VocabSpecResult {
	const langLabel = config.targetLangLabel || 'English';
	const paths = vocabDeckPath(config.rootDeck || DEFAULT_ROOT_DECK, langLabel, course);
	const deckPath = paths[paths.length - 1];

	const notes = words.map((word) => ({
		modelName: VOCAB_MODEL_NAME,
		deck: deckPath,
		guid: stableGuid(`usb-vocab|${config.targetLang}|${normalizeLemma(word.word)}`),
		fields: [
			word.word,
			word.phonetic, // IPA (o lectura en kana para japonés) generada por la IA
			word.sentence,
			word.sentenceTranslation,
			`(${word.pos}) ${word.meaning}`,
			word.monolingual, // definición simple EN el idioma objetivo, generada por la IA
			'', // picture — la completa ANKI-IMAGE-SENTENCE
			'', // sentence audio — archivos de calidad (HyperTTS o edge-tts en el sistema externo)
			'', // word audio — ídem
		],
		tags: [
			'udemy-bridge',
			`curso::${slugify(course)}`,
			`leccion::${slugify(lesson)}`,
			...(word.level ? [`cefr::${word.level.toLowerCase()}`] : []),
		],
	}));

	const spec: ApkgSpec = {
		decks: [
			{ name: paths[0], conf: COURSES_PRESET.id, desc: ROOT_DECK_DESCRIPTION },
			{
				name: paths[1],
				conf: VOCAB_PRESET.id,
				desc: 'Rama de vocabulario: palabras extraídas de los subtítulos de los cursos que estudias con la extensión.',
			},
			{
				name: paths[2],
				conf: VOCAB_PRESET.id,
				desc: `Vocabulario de ${langLabel} (nivel ${config.minLevel}+) generado desde cursos reales de Udemy.`,
			},
			{
				name: deckPath,
				conf: VOCAB_PRESET.id,
				desc: `Palabras de ${langLabel} extraídas de las lecciones de «${course}». Imágenes y audios los completa el pipeline externo.`,
			},
		],
		models: [buildVocabModel(config.audioMode)],
		dconfs: [COURSES_PRESET, VOCAB_PRESET],
		notes,
	};

	return { spec, deckPath };
}

function cleanText(value: unknown): string {
	return String(value ?? '')
		.replace(/<[^>]+>/g, '')
		.replace(/[“”«»]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function ensureSentenceEnd(text: string): string {
	return /[.!?…:]$/.test(text) ? text : `${text}.`;
}

function slugify(text: string): string {
	return String(text || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

// Re-export para que la UI arme el apkg de conceptos con el mismo preset.
export { CONCEPT_MODEL, COURSES_PRESET, VOCAB_PRESET, DEFAULT_ROOT_DECK };
