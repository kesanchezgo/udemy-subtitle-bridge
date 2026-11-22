/**
 * Lado de la interfaz de la fase 2: el mazo asignado a cada curso (registro)
 * y las llamadas a AnkiConnect a través del service worker.
 *
 * El registro es lo que impide duplicar: la primera exportación de un curso
 * fija su mazo y las siguientes van ahí aunque cambie el programa activo de
 * DataCamp o la configuración. Cambiarlo es una acción explícita («Cambiar»
 * en Fijar), que además puede mover lo ya importado.
 */
import { chromeLocalStorage } from './chromeStorage';
import {
	assignedDeckFor, conceptDestination, courseKey, kinemaCardsQuery, lessonNotesQuery, missingProgramTagQuery, normalizeDeckName, registryAfterMoves,
	type AnkiLayoutConfig, type CourseDeckAssignment, type CourseDeckRegistry, type DeckDestination,
} from './ankiDestination';
import { programTag } from './ankiDesign';
import type { AnkiConceptNote, AnkiStatus, ImportResult, MoveResult, NoteReviewState, RescheduleResult, TagRenameResult, VocabDeckInspection } from './ankiConnectOps';

const REGISTRY_KEY = 'usb_anki_course_decks';

export async function loadCourseDecks(): Promise<CourseDeckRegistry> {
	try {
		const raw = (await chromeLocalStorage.get([REGISTRY_KEY]))[REGISTRY_KEY];
		return raw && typeof raw === 'object' ? (raw as CourseDeckRegistry) : {};
	} catch {
		return {};
	}
}

export async function assignCourseDeck(course: string, deck: string, program?: string | null): Promise<CourseDeckAssignment | null> {
	const clean = normalizeDeckName(deck);
	if (!clean || !courseKey(course)) return null;
	const registry = await loadCourseDecks();
	const entry: CourseDeckAssignment = { deck: clean, ...(program ? { program } : {}), at: Date.now() };
	await chromeLocalStorage.set({ [REGISTRY_KEY]: { ...registry, [courseKey(course)]: entry } });
	return entry;
}

/** Destino de una lección + el mazo ya asignado a su curso (si lo hay). */
export async function resolveConceptDestination(
	config: AnkiLayoutConfig, course: string, lesson: string, program?: string | null,
): Promise<{ destination: DeckDestination; assigned: CourseDeckAssignment | null }> {
	const assigned = assignedDeckFor(await loadCourseDecks(), course);
	return { destination: conceptDestination(config, course, lesson, { program, assigned }), assigned };
}

/** La primera vez que un curso llega a Anki, queda con su mazo (las siguientes no cambian solas). */
export async function rememberCourseDeck(_config: AnkiLayoutConfig, course: string, destination: DeckDestination, program?: string | null): Promise<void> {
	if (assignedDeckFor(await loadCourseDecks(), course)) return;
	await assignCourseDeck(course, destination.deck, program);
}

// ── AnkiConnect (vía service worker) ───────────────────────────────────────

type Transport = (message: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
type ChromeLike = { runtime?: { id?: string; sendMessage?: (msg: unknown, cb: (res: unknown) => void) => void; lastError?: unknown } };

const chromeTransport: Transport = (message) => {
	const chromeApi = (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome;
	if (!chromeApi?.runtime?.id || !chromeApi.runtime.sendMessage) return Promise.resolve(null);
	return new Promise((resolve) => {
		try {
			chromeApi.runtime!.sendMessage!(message, (res) => resolve(chromeApi.runtime?.lastError ? null : ((res ?? null) as Record<string, unknown> | null)));
		} catch {
			resolve(null);
		}
	});
};

let transport: Transport = chromeTransport;
/** Solo para pruebas: un Anki simulado en la vista previa. */
export function setAnkiTransport(next: Transport | null): void {
	transport = next ?? chromeTransport;
}

async function call(op: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> {
	return transport({ type: 'USG_ANKI_CONNECT', op, ...payload });
}

function unwrap<T>(res: Record<string, unknown> | null, key: string): T {
	if (!res) throw new Error('Kinema no puede hablar con Anki desde aquí (solo en la extensión).');
	if (!res.ok) throw new Error(String(res.error || 'Anki no respondió.'));
	return res[key] as T;
}

/**
 * null = sin extensión (vista previa): la UI ofrece solo el .apkg.
 * Pide permiso a AnkiConnect (Anki muestra su diálogo la primera vez): por eso
 * solo se llama al pulsar «Conectar» o si ya se conectó antes (`rememberedAnki`).
 */
export async function ankiConnectStatus(): Promise<AnkiStatus | null> {
	const res = await call('status');
	if (!res) return null;
	const status = res.ok ? (res.status as AnkiStatus) : { available: false, error: String(res.error || '') };
	if (status.available && status.permission === 'granted') await chromeLocalStorage.set({ [CONNECTED_KEY]: true }).catch(() => undefined);
	return status;
}

const CONNECTED_KEY = 'usb_anki_connected';
/** ¿Ya se conectó alguna vez? Entonces se comprueba solo al abrir Fijar o Ajustes. */
export async function rememberedAnki(): Promise<boolean> {
	try {
		return Boolean((await chromeLocalStorage.get([CONNECTED_KEY]))[CONNECTED_KEY]);
	} catch {
		return false;
	}
}

export async function forgetAnki(): Promise<void> {
	await chromeLocalStorage.set({ [CONNECTED_KEY]: false }).catch(() => undefined);
}

export async function ankiDeckNames(): Promise<string[]> {
	return unwrap<string[]>(await call('decks'), 'decks') ?? [];
}

function toBase64(data: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
	return btoa(binary);
}

/** Importa el .apkg en Anki y devuelve cuántas notas de la lección entraron. */
export async function sendApkgToAnki(data: Uint8Array, filename: string, course: string, lesson: string): Promise<ImportResult> {
	return unwrap<ImportResult>(await call('import', { base64: toBase64(data), filename, countQuery: lessonNotesQuery(course, lesson) }), 'result');
}

/** Vocabulario: misma importación; se cuentan las notas del mazo destino. */
export async function sendVocabApkgToAnki(data: Uint8Array, filename: string, deck: string): Promise<ImportResult> {
	return unwrap<ImportResult>(await call('import', { base64: toBase64(data), filename, countQuery: `deck:"${deck.replace(/"/g, '\\"')}"` }), 'result');
}

/** «Ordenar lo antiguo»: mazos de estructuras anteriores y etiquetas antiguas. */
export interface CleanupPlan {
	moves: MoveResult[];
	tags: TagRenameResult[];
}

function cleanupOf(res: Record<string, unknown> | null): CleanupPlan {
	const moves = unwrap<MoveResult[]>(res, 'moves') ?? [];
	const tags = Array.isArray(res?.tags) ? (res!.tags as TagRenameResult[]) : [];
	return { moves, tags };
}

/** Solo cuenta (no cambia nada en Anki). */
export async function planDeckMigration(config: AnkiLayoutConfig): Promise<CleanupPlan> {
	return cleanupOf(await call('migrate', { config, dryRun: true }));
}

/**
 * Aplica lo contado (al confirmar): mueve las tarjetas con sus repasos,
 * renombra las etiquetas antiguas y deja el registro de cursos apuntando a su
 * mazo nuevo (un curso de «Por programa» pasa a <Root>::Courses::<Curso>).
 */
export async function applyDeckMigration(config: AnkiLayoutConfig): Promise<CleanupPlan> {
	const done = cleanupOf(await call('migrate', { config, dryRun: false }));
	const moved = done.moves.filter((m) => m.kind === 'concepts' && (m.moved || m.removed));
	if (moved.length) {
		const registry = await loadCourseDecks();
		await chromeLocalStorage.set({ [REGISTRY_KEY]: registryAfterMoves(registry, moved) });
	}
	return done;
}

/**
 * Fase 5 · un curso puede estar en varios programas: las tarjetas que ya
 * tienes de ese curso reciben la etiqueta de cada programa que lo incluye
 * (solo se AÑADE la etiqueta). Devuelve cuántas notas la recibieron; 0 si
 * Anki no responde (no bloquea el envío).
 */
export async function tagCourseWithPrograms(course: string, programs: string[]): Promise<number> {
	let tagged = 0;
	for (const program of programs) {
		const tag = programTag(program);
		if (!tag) continue;
		try {
			const res = await call('addTag', { query: missingProgramTagQuery(course, program), tag });
			if (res?.ok && typeof res.tagged === 'number') tagged += res.tagged;
		} catch {
			/* sin Anki: se reintenta en el próximo envío */
		}
	}
	return tagged;
}

/** Lo ya importado de un curso, a su mazo nuevo (al cambiarlo en Fijar). */
export async function moveCourseCards(config: AnkiLayoutConfig, course: string, deck: string): Promise<number> {
	return unwrap<number>(await call('move', { query: kinemaCardsQuery('course', { rootDeck: config.rootDeck, course }), deck }), 'moved') ?? 0;
}

/** Biblioteca: cuántas tarjetas devuelve cada búsqueda (null si Anki no responde). */
export async function ankiCounts(queries: string[]): Promise<number[] | null> {
	if (queries.length === 0) return [];
	try {
		const res = await call('counts', { queries });
		return res?.ok && Array.isArray(res.counts) ? (res.counts as number[]) : null;
	} catch {
		return null;
	}
}

/** Abre el explorador de Anki con una búsqueda (true si Anki respondió). */
export async function ankiBrowse(query: string): Promise<boolean> {
	try {
		const res = await call('browse', { query });
		return Boolean(res?.ok);
	} catch {
		return false;
	}
}

/** Lemas que ya están en esos mazos de Anki; null si Anki no está disponible. */
export async function ankiKnownWords(decks: string[], langCode?: string): Promise<string[] | null> {
	try {
		const res = await call('knownWords', { decks, ...(langCode ? { langCode } : {}) });
		return res?.ok ? ((res.words as string[]) ?? []) : null;
	} catch {
		return null;
	}
}

/** Mazos compatibles por diseño/campos para el vocabulario de un idioma; null si Anki no responde. */
export async function ankiCompatibleVocabDecks(langCode: string, langLabel: string, rootDeck: string): Promise<VocabDeckInspection | null> {
	try {
		const res = await call('vocabDecks', { langCode, langLabel, rootDeck });
		return res?.ok && res.inspection ? (res.inspection as VocabDeckInspection) : null;
	} catch {
		return null;
	}
}

// ── Fase 4 · ideas que ya están en el mazo ──────────────────────────────────

/** Las tarjetas de conceptos de una búsqueda (la del curso), de Anki; null si Anki no responde. Solo lectura. */
export async function ankiConceptNotes(query: string): Promise<AnkiConceptNote[] | null> {
	if (!query.trim()) return [];
	try {
		const res = await call('concepts', { query });
		return res?.ok && Array.isArray(res.notes) ? (res.notes as AnkiConceptNote[]) : null;
	} catch {
		return null;
	}
}

/** En qué estado están esas notas en Anki (nueva, en aprendizaje, en repaso…); null si Anki no responde. Solo lectura. */
export async function ankiReviewStates(noteIds: number[]): Promise<NoteReviewState[] | null> {
	if (noteIds.length === 0) return [];
	try {
		const res = await call('reviewStates', { noteIds });
		return res?.ok && Array.isArray(res.states) ? (res.states as NoteReviewState[]) : null;
	} catch {
		return null;
	}
}

/**
 * «Repasar hoy en Anki» (solo al pulsarlo): las tarjetas en repaso de esas
 * notas pasan a hoy, conservando su intervalo. Lanza si Anki no responde.
 */
export async function ankiReviewToday(noteIds: number[]): Promise<RescheduleResult> {
	return unwrap<RescheduleResult>(await call('reviewToday', { noteIds }), 'result');
}
