/**
 * Operaciones de AnkiConnect (fase 2), con la llamada inyectada: el service
 * worker les pasa su `invoke` real y los tests, un Anki falso.
 *
 * «Enviar a Anki» importa EL MISMO .apkg que la descarga manual
 * (storeMediaFile + importPackage): mismos GUID, note types, CSS y presets,
 * y la misma regla de no pisar lo ya importado (KINEMA_NOTE_MOD). Así los dos
 * caminos nunca duplican una tarjeta entre sí, cosa que addNotes (GUID al
 * azar) no podría garantizar.
 */
import { ankiSearchValue, cardsDirectlyIn, exactTagQuery, isOwnedDeck, kinemaVocabDeck, rootOf, type DeckMove, type TagRename } from './ankiDestination.ts';
import { CONCEPT_MODEL_NAME, VOCAB_FIELDS_BASE, VOCAB_MODEL_NAME_LEGACY, vocabModelName } from './ankiDesign.ts';

export type AnkiInvoke = (action: string, params?: Record<string, unknown>) => Promise<unknown>;

export interface AnkiStatus {
	available: boolean;
	/** «granted» o «denied» (requestPermission de AnkiConnect ≥ 6). */
	permission?: 'granted' | 'denied';
	version?: number;
	error?: string;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const ids = (value: unknown): number[] => (Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : []);

/** ¿Anki está abierto con AnkiConnect, y nos deja hablar con él? */
export async function ankiStatus(invoke: AnkiInvoke): Promise<AnkiStatus> {
	try {
		const res = (await invoke('requestPermission')) as { permission?: string; version?: number } | null;
		const permission = res?.permission === 'granted' ? 'granted' : res?.permission === 'denied' ? 'denied' : undefined;
		if (permission) return { available: true, permission, version: typeof res?.version === 'number' ? res.version : undefined };
	} catch {
		/* AnkiConnect antiguo (sin requestPermission) o Anki cerrado: se prueba version */
	}
	try {
		const version = await invoke('version');
		return { available: true, permission: 'granted', version: typeof version === 'number' ? version : undefined };
	} catch (error) {
		return { available: false, error: message(error) };
	}
}

export async function deckNames(invoke: AnkiInvoke): Promise<string[]> {
	const res = await invoke('deckNames');
	return Array.isArray(res) ? res.filter((d): d is string => typeof d === 'string').sort((a, b) => a.localeCompare(b)) : [];
}

export async function countNotes(invoke: AnkiInvoke, query: string): Promise<number> {
	return ids(await invoke('findNotes', { query })).length;
}

export async function countCards(invoke: AnkiInvoke, query: string): Promise<number> {
	return ids(await invoke('findCards', { query })).length;
}

/** Tope de búsquedas por llamada (la Biblioteca pide las de un curso de una vez). */
export const MAX_COUNT_QUERIES = 120;

/** Varias búsquedas de tarjetas de una vez (solo lectura). Las que sobran del tope, -1. */
export async function countManyCards(invoke: AnkiInvoke, queries: string[]): Promise<number[]> {
	const out: number[] = [];
	for (const [i, query] of queries.entries()) {
		out.push(i < MAX_COUNT_QUERIES && query.trim() ? await countCards(invoke, query) : -1);
	}
	return out;
}

export interface ImportResult {
	before: number;
	after: number;
	/** Notas que de verdad entraron (las que ya estaban no se duplican ni se pisan). */
	added: number;
}

/**
 * Importa un .apkg (base64) en la colección abierta y dice cuántas notas de
 * `countQuery` había antes y hay después: la confirmación es un dato de Anki,
 * no «la descarga terminó».
 */
export async function importApkg(invoke: AnkiInvoke, input: { base64: string; filename: string; countQuery: string }): Promise<ImportResult> {
	const filename = `_kinema_import_${input.filename.replace(/[^a-z0-9._-]/gi, '_')}`;
	const before = await countNotes(invoke, input.countQuery);
	await invoke('storeMediaFile', { filename, data: input.base64 });
	try {
		await invoke('importPackage', { path: filename });
	} finally {
		// El paquete no se queda en la carpeta de medios del estudiante.
		await invoke('deleteMediaFile', { filename }).catch(() => undefined);
	}
	const after = await countNotes(invoke, input.countQuery);
	return { before, after, added: Math.max(0, after - before) };
}

export interface MoveResult extends DeckMove {
	cards: number;
	moved: boolean;
	/** El submazo vacío se borró (solo si se comprobó vacío justo antes). */
	removed: boolean;
}

/**
 * Aplana la estructura antigua. Mueve las tarjetas (changeDeck conserva el
 * historial de repasos y crea el destino si falta) y borra el submazo SOLO si
 * queda vacío. `dryRun` solo cuenta.
 */
export async function runMigration(invoke: AnkiInvoke, moves: DeckMove[], options: { dryRun: boolean; prune?: string[] }): Promise<MoveResult[]> {
	const out: MoveResult[] = [];
	for (const move of moves) {
		const cards = ids(await invoke('findCards', { query: cardsDirectlyIn(move.from) }));
		if (options.dryRun) {
			out.push({ ...move, cards: cards.length, moved: false, removed: false });
			continue;
		}
		if (cards.length) await invoke('changeDeck', { cards, deck: move.to });
		// Comprobación inmediatamente antes de borrar: el submazo (y sus hijos) sin ninguna tarjeta.
		const remaining = await countCards(invoke, `deck:"${ankiSearchValue(move.from)}"`);
		let removed = false;
		if (remaining === 0) {
			await invoke('deleteDecks', { decks: [move.from], cardsToo: true });
			removed = true;
		}
		out.push({ ...move, cards: cards.length, moved: cards.length > 0, removed });
	}
	// Fase 5: los mazos intermedios de «Por programa» que quedan vacíos (comprobado justo antes).
	if (!options.dryRun) {
		for (const deck of options.prune ?? []) {
			if ((await countCards(invoke, `deck:"${ankiSearchValue(deck)}"`)) === 0) await invoke('deleteDecks', { decks: [deck], cardsToo: true }).catch(() => undefined);
		}
	}
	return out;
}

export interface TagRenameResult extends TagRename {
	notes: number;
	renamed: boolean;
}

/**
 * Fase 5 · etiquetas antiguas de Kinema a su nombre de ahora
 * (kinema::track::x → kinema::programa::x, kinema/platform::x →
 * kinema::plataforma::x). Solo cambia etiquetas: ni campos, ni mazos, ni
 * repasos. `dryRun` solo cuenta. Nunca se ejecuta sola.
 */
export async function renameTags(invoke: AnkiInvoke, renames: TagRename[], options: { dryRun: boolean }): Promise<TagRenameResult[]> {
	const out: TagRenameResult[] = [];
	for (const rename of renames) {
		const notes = ids(await invoke('findNotes', { query: exactTagQuery(rename.from) }));
		if (!options.dryRun && notes.length) {
			await invoke('addTags', { notes, tags: rename.to });
			await invoke('removeTags', { notes, tags: rename.from });
		}
		out.push({ ...rename, notes: notes.length, renamed: !options.dryRun && notes.length > 0 });
	}
	return out;
}

export async function allTags(invoke: AnkiInvoke): Promise<string[]> {
	const res = await invoke('getTags');
	return Array.isArray(res) ? res.filter((t): t is string => typeof t === 'string') : [];
}

/**
 * Fase 5 · añade una etiqueta a las notas de una búsqueda (p. ej. el programa
 * a las tarjetas de un curso que aún no la llevan). Solo AÑADE: no cambia
 * campos, mazos ni repasos. Devuelve cuántas notas la recibieron.
 */
export async function addTagToQuery(invoke: AnkiInvoke, query: string, tag: string): Promise<number> {
	if (!query.trim() || !tag.trim() || /\s/.test(tag)) return 0;
	const notes = ids(await invoke('findNotes', { query }));
	if (notes.length) await invoke('addTags', { notes, tags: tag });
	return notes.length;
}

/** Mueve a `deck` las tarjetas de una búsqueda (conserva su historial). */
export async function moveCards(invoke: AnkiInvoke, query: string, deck: string): Promise<number> {
	const cards = ids(await invoke('findCards', { query }));
	if (cards.length) await invoke('changeDeck', { cards, deck });
	return cards.length;
}

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Lema normalizado igual que el registro local de vocabulario. */
export const knownLemma = (value: string) => stripHtml(value).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Palabras que ya están en Anki (el mazo de vocabulario y los que el
 * estudiante marque como «ya conocidas»). Lee el campo «word» (el de Kinema y
 * English Cards) o, si la nota no lo tiene, el primero. Además, si se indica
 * `langCode`, busca también por el tipo de nota de Kinema de ese idioma para
 * encontrar todas sus palabras aunque el usuario haya renombrado el mazo.
 */
export async function knownWords(invoke: AnkiInvoke, decks: string[], options: { limit?: number; fields?: string[]; langCode?: string } = {}): Promise<string[]> {
	const limit = options.limit ?? 6000;
	const fields = options.fields ?? ['word', 'Word', 'Front', 'front', 'Palabra', 'palabra'];
	const out = new Set<string>();
	const queries = decks.map((deck) => `deck:"${ankiSearchValue(deck)}"`);
	if (options.langCode) {
		const code = options.langCode.trim().toLowerCase();
		queries.push(`note:"${ankiSearchValue(vocabModelName(code))}"`);
		if (code === 'en') queries.push(`note:"${ankiSearchValue(VOCAB_MODEL_NAME_LEGACY)}"`);
	}
	for (const query of [...new Set(queries)]) {
		const noteIds = ids(await invoke('findNotes', { query })).slice(0, limit);
		for (let i = 0; i < noteIds.length; i += 500) {
			const infos = (await invoke('notesInfo', { notes: noteIds.slice(i, i + 500) })) as { fields?: Record<string, { value?: string; order?: number }> }[] | null;
			for (const info of Array.isArray(infos) ? infos : []) {
				const entries = Object.entries(info?.fields ?? {});
				const named = fields.map((name) => info?.fields?.[name]?.value).find((v) => typeof v === 'string' && v.trim());
				const first = entries.sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0))[0]?.[1]?.value;
				const lemma = knownLemma(String(named ?? first ?? ''));
				if (lemma && lemma.length <= 60) out.add(lemma);
			}
		}
	}
	return [...out];
}

// ── Detección de mazos de vocabulario compatibles por diseño/campos ──────────

export interface CompatibleVocabDeck {
	deck: string;
	/**
	 * 'kinema' = ya contiene notas con la plantilla Kinema · Vocab de este idioma (incluso si se renombró el mazo).
	 * 'compatible' = usa un tipo de nota con los mismos 9 campos base (p. ej. English Cards).
	 */
	reason: 'kinema' | 'compatible';
	noteType: string;
	cards: number;
}

export interface VocabDeckInspection {
	/** Si ya existe un mazo en Anki con tarjetas de Kinema para este idioma (aunque tenga otro nombre). */
	detectedKinemaDeck: string | null;
	/** ¿Ya existe en Anki el mazo por defecto `<Raíz>::Vocabulary::<Idioma>`? */
	defaultDeckExists: boolean;
	/** Otros mazos compatibles con el esquema de vocabulario de Kinema para este idioma. */
	compatibleDecks: CompatibleVocabDeck[];
}

function hasCompatibleVocabSchema(fieldNames: string[]): boolean {
	const lower = new Set(fieldNames.map((f) => f.trim().toLowerCase()));
	return VOCAB_FIELDS_BASE.every((required) => lower.has(required.toLowerCase()));
}

function modelMatchesOtherLanguage(modelName: string, langCode: string, langLabel: string): boolean {
	const clean = modelName.trim();
	if (clean.startsWith('Kinema · Vocab · ')) {
		const target = vocabModelName(langCode);
		return clean !== target;
	}
	if (langCode !== 'en') {
		if (clean === VOCAB_MODEL_NAME_LEGACY) return true;
		if (/\benglish\b/i.test(clean) && !new RegExp(`\\b${langLabel}\\b`, 'i').test(clean)) return true;
	}
	return false;
}

/**
 * Inspecciona la colección de Anki por DISEÑO (tipo de nota y campos), no solo por nombre:
 *  1. Detecta si ya existe un mazo con notas `Kinema · Vocab · <Idioma>` aunque el usuario lo haya renombrado.
 *  2. Detecta solo mazos cuyo tipo de nota comparte el esquema compatible de vocabulario (excluyendo mazos de cursos, Default o diseños incompatibles).
 */
export async function inspectVocabDecks(
	invoke: AnkiInvoke,
	input: { langCode: string; langLabel: string; rootDeck: string },
): Promise<VocabDeckInspection> {
	const code = (input.langCode || 'en').trim().toLowerCase();
	const label = (input.langLabel || 'English').trim();
	const root = rootOf({ rootDeck: input.rootDeck });
	const defaultDeck = kinemaVocabDeck({ rootDeck: root }, label);
	const allDecks = await deckNames(invoke);
	const defaultDeckExists = allDecks.includes(defaultDeck);

	const kinemaModels = [vocabModelName(code), ...(code === 'en' ? [VOCAB_MODEL_NAME_LEGACY] : [])];
	const deckStats = new Map<string, CompatibleVocabDeck>();

	const collectDecksForModel = async (model: string, reason: 'kinema' | 'compatible') => {
		try {
			const cardIds = ids(await invoke('findCards', { query: `note:"${ankiSearchValue(model)}"` })).slice(0, 250);
			if (!cardIds.length) return;
			const infos = (await invoke('cardsInfo', { cards: cardIds })) as { deckName?: string }[] | null;
			const countsByDeck = new Map<string, number>();
			for (const info of Array.isArray(infos) ? infos : []) {
				const d = typeof info?.deckName === 'string' ? info.deckName.trim() : '';
				if (!d) continue;
				countsByDeck.set(d, (countsByDeck.get(d) ?? 0) + 1);
			}
			for (const [deck, cards] of countsByDeck.entries()) {
				// Nunca sugerir mazos de conceptos de cursos de Kinema como destino de vocabulario.
				if (deck.startsWith(`${root}::Courses::`) || deck === `${root}::Courses` || deck.startsWith(`${root}::Programs::`)) continue;
				const existing = deckStats.get(deck);
				if (!existing || (existing.reason !== 'kinema' && reason === 'kinema')) {
					deckStats.set(deck, { deck, reason, noteType: model, cards: (existing?.cards ?? 0) + cards });
				} else {
					existing.cards += cards;
				}
			}
		} catch {
			/* AnkiConnect parcial o sin cardsInfo */
		}
	};

	for (const model of kinemaModels) {
		await collectDecksForModel(model, 'kinema');
	}

	try {
		const rawModels = await invoke('modelNames');
		const models = Array.isArray(rawModels) ? rawModels.filter((m): m is string => typeof m === 'string') : [];
		for (const model of models) {
			if (kinemaModels.includes(model) || model === CONCEPT_MODEL_NAME) continue;
			if (modelMatchesOtherLanguage(model, code, label)) continue;
			const rawFields = await invoke('modelFieldNames', { modelName: model });
			const fieldList = Array.isArray(rawFields) ? rawFields.filter((f): f is string => typeof f === 'string') : [];
			if (!hasCompatibleVocabSchema(fieldList)) continue;
			await collectDecksForModel(model, 'compatible');
			// Si existe un mazo vacío cuyo nombre coincide exactamente con el note type compatible (p. ej. "English Cards"), incluirlo también.
			if (allDecks.includes(model) && !isOwnedDeck(root, model) && !deckStats.has(model)) {
				deckStats.set(model, { deck: model, reason: 'compatible', noteType: model, cards: 0 });
			}
		}
	} catch {
		/* Si AnkiConnect no expone modelNames, basta con lo detectado por notas de Kinema */
	}

	const kinemaDecks = [...deckStats.values()]
		.filter((d) => d.reason === 'kinema')
		.sort((a, b) => Number(b.deck === defaultDeck) - Number(a.deck === defaultDeck) || b.cards - a.cards);

	const detectedKinemaDeck = kinemaDecks[0]?.deck ?? (defaultDeckExists ? defaultDeck : null);
	const compatibleDecks = [...deckStats.values()]
		.filter((d) => d.deck !== defaultDeck)
		.sort((a, b) => Number(b.reason === 'kinema') - Number(a.reason === 'kinema') || a.deck.localeCompare(b.deck));

	return { detectedKinemaDeck, defaultDeckExists, compatibleDecks };
}

// ── Fase 4 · ¿Esta idea ya está en tu mazo? ────────────────────────────────

/** Una nota de conceptos tal como la necesita el control de duplicados. */
export interface AnkiConceptNote {
	id: number;
	/** Campo Front (HTML tal cual). */
	front: string;
	/** Campo Leccion (sin HTML). */
	lesson: string;
	tags: string[];
}

/** Tope de notas leídas por consulta (las más recientes primero): no bloquear a Anki con colecciones enormes. */
export const MAX_CONCEPT_NOTES = 1500;

/**
 * Las notas de conceptos de una búsqueda (la del curso: kinemaCardsQuery),
 * con su frente, su lección y sus etiquetas. Solo lectura (findNotes + notesInfo).
 */
export async function conceptNotes(invoke: AnkiInvoke, query: string, options: { limit?: number } = {}): Promise<AnkiConceptNote[]> {
	const limit = Math.max(1, Math.min(options.limit ?? MAX_CONCEPT_NOTES, MAX_CONCEPT_NOTES));
	// El id de una nota es su fecha de creación: de mayor a menor = las más recientes primero.
	const noteIds = ids(await invoke('findNotes', { query })).sort((a, b) => b - a).slice(0, limit);
	const out: AnkiConceptNote[] = [];
	for (let i = 0; i < noteIds.length; i += 500) {
		const infos = (await invoke('notesInfo', { notes: noteIds.slice(i, i + 500) })) as { noteId?: number; tags?: unknown; fields?: Record<string, { value?: string; order?: number }> }[] | null;
		for (const info of Array.isArray(infos) ? infos : []) {
			if (typeof info?.noteId !== 'number') continue;
			const fields = info.fields ?? {};
			const first = Object.values(fields).sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))[0]?.value;
			const front = String(fields.Front?.value ?? first ?? '');
			if (!front.trim()) continue;
			out.push({
				id: info.noteId,
				front: front.slice(0, 2000),
				lesson: stripHtml(String(fields.Leccion?.value ?? '')).slice(0, 200),
				tags: Array.isArray(info.tags) ? info.tags.filter((t): t is string => typeof t === 'string').slice(0, 40) : [],
			});
		}
	}
	return out;
}

/**
 * Lo ÚNICO que «Repasar hoy en Anki» puede cambiar: tarjetas de conceptos de
 * Kinema EN REPASO, activas y que aún no tocan hoy. Las nuevas (sin calendario
 * que adelantar), las que están en aprendizaje o reaprendizaje (Anki ya las
 * devuelve en minutos u horas), las suspendidas o enterradas y las que ya
 * tocan hoy no se tocan.
 */
export const RESCHEDULABLE = 'is:review -is:learn -is:suspended -is:buried -is:due';

/** foreign = la nota existe pero no es de conceptos de Kinema (no se toca). */
export type CardReviewState = 'review' | 'due' | 'new' | 'learning' | 'inactive' | 'foreign' | 'missing';

export interface NoteReviewState {
	noteId: number;
	state: CardReviewState;
	/** Solo en «review»: las tarjetas que se pondrían para hoy. */
	cards: number[];
}

const conceptNoteClause = `note:"${ankiSearchValue(CONCEPT_MODEL_NAME)}"`;

/** En qué estado está cada nota en Anki (solo lectura: findCards). Solo notas de conceptos de Kinema. */
export async function noteReviewStates(invoke: AnkiInvoke, noteIds: number[]): Promise<NoteReviewState[]> {
	const out: NoteReviewState[] = [];
	for (const id of [...new Set(noteIds)].filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 50)) {
		const base = `nid:${id} ${conceptNoteClause}`;
		const eligible = ids(await invoke('findCards', { query: `${base} ${RESCHEDULABLE}` }));
		if (eligible.length) { out.push({ noteId: id, state: 'review', cards: eligible }); continue; }
		const has = async (extra: string) => ids(await invoke('findCards', { query: `${base}${extra}` })).length > 0;
		const exists = async () => ids(await invoke('findCards', { query: `nid:${id}` })).length > 0;
		const state: CardReviewState = !(await has('')) ? ((await exists()) ? 'foreign' : 'missing')
			: (await has(' (is:suspended OR is:buried)')) ? 'inactive'
				: (await has(' is:new')) ? 'new'
					: (await has(' is:learn')) ? 'learning'
						: 'due';
		out.push({ noteId: id, state, cards: [] });
	}
	return out;
}

export interface RescheduleResult {
	/** Notas cuyas tarjetas pasaron a hoy. */
	changed: number[];
	/** Tarjetas cambiadas. */
	cards: number;
	/** El estado de cada nota justo antes de cambiar (las demás dicen por qué no). */
	states: NoteReviewState[];
}

/**
 * «Repasar hoy en Anki» (solo al pulsarlo): pone para hoy las tarjetas en
 * repaso de esas notas con setDueDate "0" — sin «!». Verificado con el motor
 * de Anki 26.9.4 (scripts/qa-deck-real-anki.mjs): sigue en repaso y conserva su
 * historial; sin FSRS conserva el intervalo; con FSRS conserva la memoria de la
 * tarjeta (estabilidad, dificultad) y el intervalo pasa a los días reales desde
 * el último repaso. El próximo intervalo sale de la respuesta real. Comprueba
 * el estado justo antes de cambiar nada.
 */
export async function rescheduleToday(invoke: AnkiInvoke, noteIds: number[]): Promise<RescheduleResult> {
	const states = await noteReviewStates(invoke, noteIds);
	const target = states.filter((s) => s.state === 'review' && s.cards.length > 0);
	const cards = target.flatMap((s) => s.cards);
	if (cards.length) await invoke('setDueDate', { cards, days: '0' });
	return { changed: target.map((s) => s.noteId), cards: cards.length, states };
}
