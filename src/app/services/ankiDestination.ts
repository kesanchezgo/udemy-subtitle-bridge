/**
 * Destino de las tarjetas en Anki — fuente ÚNICA de verdad (fase 2, fijada en la 5).
 *
 * Todo lo que decide o consulta «dónde están las tarjetas» pasa por aquí:
 * el envío a Anki, Fijar, la Biblioteca, la nota de Obsidian (anki_deck), los
 * repasos pendientes (badge, progreso, historial) y «Ordenar lo antiguo».
 *
 * Estructura (fase 5: sin opciones, como recomienda Anki — pocos mazos, y
 * etiquetas para todo lo demás):
 *   Conceptos   <Root>::Courses::<Curso>       un mazo por curso
 *   Vocabulario <Root>::Vocabulary::<Idioma>   un mazo por idioma (o uno tuyo, por idioma)
 * El mazo es un contenedor: una tarjeta vive en UN mazo. Lo que se cruza va en
 * ETIQUETAS (todas bajo kinema::): la lección (kinema::leccion), el programa
 * (kinema::programa — un curso puede estar en varios programas y un programa
 * tiene varios cursos, N:M, algo que un árbol de mazos no puede representar
 * sin duplicar tarjetas) y la plataforma (kinema::plataforma). FSRS programa
 * cada tarjeta por separado: agrupar en más mazos no mejora la memoria. Para
 * repasar un programa entero basta un mazo filtrado con su etiqueta.
 *
 * Un curso, un mazo: la primera vez que un curso llega a Anki su mazo queda en
 * un registro (o el que elijas con «Cambiar»: también vale un mazo tuyo).
 *
 * Compatibilidad: las estructuras de antes («Por lección», «Por programa»,
 * vocabulario por curso) siguen funcionando — el registro mantiene cada curso
 * en su mazo y los submazos por lección cuelgan del mazo del curso. Aplanarlas
 * es opcional (migrationPlan), igual que renombrar las etiquetas antiguas
 * (kinema::track → kinema::programa, kinema/platform → kinema::plataforma).
 *
 * Repasos: se cuentan por ETIQUETA y tipo de nota (más la ruta antigua), no
 * por ruta de mazo, para que sigan siendo correctos con cualquier estructura
 * y con mazos elegidos por el estudiante fuera de la raíz.
 */
import { CONCEPT_MODEL_NAME, DEFAULT_ROOT_DECK, LEGACY_PROGRAM_TAG, PROGRAM_TAG, VOCAB_MODEL_NAME_LEGACY, kinemaSlug, legacyKinemaSlug, renamedLegacyTag, sanitizeDeckSegment, vocabModelName } from './ankiDesign.ts';

/** @deprecated Fase 5: siempre un mazo por curso. Se lee solo para entender configuraciones antiguas. */
export type ConceptLayout = 'course' | 'lesson';
/** @deprecated Fase 5: siempre un mazo por idioma (o uno tuyo). */
export type VocabLayout = 'language' | 'course';

export interface AnkiLayoutConfig {
	rootDeck: string;
	/** @deprecated Fase 5: se ignora (siempre un mazo por curso). */
	conceptLayout?: ConceptLayout;
	/** @deprecated Fase 5: se ignora (el programa va en una etiqueta). */
	groupByProgram?: boolean;
	/** @deprecated Fase 5: se ignora (un mazo por idioma). */
	vocabLayout?: VocabLayout;
	/**
	 * @deprecated Fase 5.1: un solo mazo tuyo para TODOS los idiomas (configs de
	 * antes). Se sigue leyendo para los idiomas sin entrada en `vocabDecks`.
	 */
	vocabDeck?: string;
	/**
	 * Fase 5.1 · el mazo de las palabras de cada idioma (clave: el nombre del
	 * idioma en inglés, el de la rama del mazo: «English»). Un mazo tuyo de
	 * Anki, o "" = el de Kinema (también si antes elegiste uno para todos).
	 */
	vocabDecks?: Record<string, string>;
	/** Mazos adicionales con palabras ya conocidas (legacy: inglés). */
	knownDecks?: string[];
	/** Mazos adicionales con palabras ya conocidas, aislados por código de idioma (`en`, `fr`, etc.). */
	knownDecksByLang?: Record<string, string[]>;
}

/** Mazo asignado a un curso: se fija la primera vez que llega a Anki y no cambia solo. */
export interface CourseDeckAssignment {
	deck: string;
	/** Programa con el que se creó (solo informativo: el curso NO cambia de mazo). */
	program?: string;
	at: number;
}
export type CourseDeckRegistry = Record<string, CourseDeckAssignment>;

export interface DeckDestination {
	/** Mazo donde se crean las notas. */
	deck: string;
	/** ¿Cuelga de la raíz de Kinema? (si no, es un mazo del estudiante). */
	owned: boolean;
	/** Mazos a declarar en el .apkg, de la raíz al destino (vacío si no es propio). */
	ancestors: string[];
}

export const rootOf = (config: Pick<AnkiLayoutConfig, 'rootDeck'>) => sanitizeDeckSegment(config.rootDeck) || DEFAULT_ROOT_DECK;

/** Clave del registro de mazos por curso: la misma que la etiqueta kinema::curso. */
export const courseKey = (course: string) => kinemaSlug(course);

/**
 * El mazo fijado de un curso. Si no hay entrada con la clave actual, se lee la
 * del slug anterior (cursos con «+»/«#» guardados antes del cambio): para ellos
 * es lo mismo que antes, y al «Cambiar» queda con su clave propia.
 */
export function assignedDeckFor(registry: CourseDeckRegistry, course: string): CourseDeckAssignment | null {
	return registry[courseKey(course)] ?? registry[legacyKinemaSlug(course)] ?? null;
}

/** Normaliza un nombre de mazo completo («A::B::C»): segmentos limpios, sin vacíos. */
export function normalizeDeckName(name: string): string {
	return String(name || '')
		.split('::')
		.map((segment) => segment.replace(/"/g, "'").replace(/[\u0000-\u001f]/g, ' ').trim())
		.filter(Boolean)
		.join('::');
}

export function isOwnedDeck(root: string, deck: string): boolean {
	return deck === root || deck.startsWith(`${root}::`);
}

/** La raíz y cada nivel intermedio hasta el mazo (solo para mazos propios). */
export function deckAncestors(root: string, deck: string): string[] {
	if (!isOwnedDeck(root, deck)) return [];
	const parts = deck.split('::');
	const rootDepth = root.split('::').length;
	const out: string[] = [];
	for (let i = rootDepth; i <= parts.length; i += 1) out.push(parts.slice(0, i).join('::'));
	return out;
}

function destination(root: string, deck: string): DeckDestination {
	const clean = normalizeDeckName(deck) || root;
	const owned = isOwnedDeck(root, clean);
	return { deck: clean, owned, ancestors: owned ? deckAncestors(root, clean) : [] };
}

/** El mazo de Kinema de un curso: <Root>::Courses::<Curso> (los demás parámetros ya no cambian nada). */
export function defaultConceptDeck(config: AnkiLayoutConfig, course: string, _lesson?: string, _program?: string | null): string {
	return [rootOf(config), 'Courses', sanitizeDeckSegment(course) || 'Curso'].join('::');
}

/**
 * Dónde van las tarjetas de conceptos de una lección: el mazo fijado del curso
 * (registro: el mismo curso nunca acaba repartido entre dos mazos, también si
 * es un mazo tuyo o uno de una estructura anterior) o, si aún no tiene, el de
 * Kinema. La lección y el programa NO cambian el mazo: van en etiquetas.
 */
export function conceptDestination(
	config: AnkiLayoutConfig,
	course: string,
	_lesson?: string,
	options: { program?: string | null; assigned?: CourseDeckAssignment | null } = {},
): DeckDestination {
	const root = rootOf(config);
	if (options.assigned?.deck && normalizeDeckName(options.assigned.deck)) return destination(root, options.assigned.deck);
	return destination(root, defaultConceptDeck(config, course));
}

/** El mazo de Kinema para las palabras de un idioma: <Root>::Vocabulary::<Idioma>. */
export function kinemaVocabDeck(config: AnkiLayoutConfig, languageLabel: string): string {
	return [rootOf(config), 'Vocabulary', sanitizeDeckSegment(languageLabel) || 'English'].join('::');
}

/**
 * El mazo tuyo elegido para las palabras de un idioma ("" = el de Kinema). La
 * entrada del idioma manda (también "", que vuelve al de Kinema); sin ella,
 * el mazo único de versiones anteriores (`vocabDeck`), como siempre.
 */
export function ownVocabDeck(config: AnkiLayoutConfig, languageLabel: string): string {
	const perLanguage = config.vocabDecks;
	const raw = perLanguage && Object.prototype.hasOwnProperty.call(perLanguage, languageLabel) ? perLanguage[languageLabel] : config.vocabDeck;
	return normalizeDeckName(raw ?? '');
}

/** La configuración con el mazo de las palabras de UN idioma cambiado (los demás no se tocan). */
export function withVocabDeck(config: AnkiLayoutConfig, languageLabel: string, deck: string): Record<string, string> {
	return { ...(config.vocabDecks ?? {}), [languageLabel]: normalizeDeckName(deck) };
}

/** Dónde va el vocabulario de un idioma: el mazo que elegiste para él o el de Kinema (cada palabra, una vez). */
export function vocabDestination(config: AnkiLayoutConfig, languageLabel: string, _course?: string): DeckDestination {
	const root = rootOf(config);
	const own = ownVocabDeck(config, languageLabel);
	return destination(root, own || kinemaVocabDeck(config, languageLabel));
}

/**
 * Mazos de referencia («palabras que ya sé») para UN idioma concreto.
 * Cada idioma tiene su propia lista: los mazos de inglés nunca contaminan francés, alemán, etc.
 */
export function knownDecksFor(config: Pick<AnkiLayoutConfig, 'knownDecks' | 'knownDecksByLang'>, langCode: string): string[] {
	const code = (langCode || 'en').trim().toLowerCase();
	const byLang = config.knownDecksByLang;
	if (byLang && Object.prototype.hasOwnProperty.call(byLang, code)) {
		return [...new Set((byLang[code] ?? []).map(normalizeDeckName).filter(Boolean))];
	}
	if (code === 'en' && Array.isArray(config.knownDecks)) {
		return [...new Set(config.knownDecks.map(normalizeDeckName).filter(Boolean))];
	}
	return [];
}

/** Actualiza los mazos de palabras conocidas SOLO para el idioma indicado. */
export function withKnownDecks(
	config: Pick<AnkiLayoutConfig, 'knownDecks' | 'knownDecksByLang'>,
	langCode: string,
	decks: string[],
): Pick<AnkiLayoutConfig, 'knownDecks' | 'knownDecksByLang'> {
	const code = (langCode || 'en').trim().toLowerCase();
	const clean = [...new Set(decks.map(normalizeDeckName).filter(Boolean))];
	return {
		knownDecksByLang: { ...(config.knownDecksByLang ?? {}), [code]: clean },
		knownDecks: code === 'en' ? clean : config.knownDecks,
	};
}

// ── Búsquedas de Anki ──────────────────────────────────────────────────────

/** Escapa un valor para una búsqueda de Anki entre comillas («_» y «*» son comodines). */
export function ankiSearchValue(value: string): string {
	return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\*/g, '\\*').replace(/_/g, '\\_');
}
const deckClause = (deck: string) => `deck:"${ankiSearchValue(deck)}"`;
const conceptNote = `note:"${ankiSearchValue(CONCEPT_MODEL_NAME)}"`;

/**
 * Fuera el vocabulario (sus dos familias de tipo de nota: «Kinema · Vocab · ‹idioma›»
 * y la antigua). Las notas de vocabulario también llevan kinema::curso, y las
 * cláusulas por mazo (ruta antigua, mazo propio) las traerían si el estudiante
 * guarda vocabulario en el mismo mazo que el curso. Verificado con el motor de
 * Anki: scripts/qa-anki-real-search.mjs.
 */
export const NOT_VOCAB = `-note:"${ankiSearchValue(vocabModelName(''))}*" -note:"${ankiSearchValue(VOCAB_MODEL_NAME_LEGACY)}"`;

export type DueScope = 'lesson' | 'course' | 'all';

/**
 * Las tarjetas de conceptos de una lección/curso, o todo Kinema, estén donde
 * estén: por etiqueta + tipo de nota (cualquier estructura, también mazos del
 * estudiante) O por la ruta antigua (tarjetas de versiones sin etiquetas).
 * Lección y curso son solo conceptos (sin vocabulario); «all» es todo Kinema.
 */
export function kinemaCardsQuery(scope: DueScope, input: { rootDeck: string; course?: string; lesson?: string; courseDeck?: string | null }): string {
	const root = rootOf(input);
	const course = kinemaSlug(input.course ?? '');
	const lesson = kinemaSlug(input.lesson ?? '');
	const legacyCourse = [root, 'Courses', sanitizeDeckSegment(input.course ?? '')].join('::');
	if (scope === 'all' || !course) return `(${deckClause(root)} OR tag:kinema::curso::*)`;
	if (scope === 'lesson' && lesson) {
		const legacyLesson = `${legacyCourse}::${sanitizeDeckSegment(input.lesson ?? '')}`;
		return `((${conceptNote} tag:kinema::curso::${course} tag:kinema::leccion::${lesson}) OR ${deckClause(legacyLesson)}) ${NOT_VOCAB}`;
	}
	const clauses = [`(${conceptNote} tag:kinema::curso::${course})`, deckClause(legacyCourse)];
	// El mazo asignado solo cuenta entero si es propio: uno del estudiante puede tener más cosas.
	if (input.courseDeck && isOwnedDeck(root, input.courseDeck) && input.courseDeck !== legacyCourse) clauses.push(deckClause(input.courseDeck));
	return `(${clauses.join(' OR ')}) ${NOT_VOCAB}`;
}

export const dueQuery = (scope: DueScope, input: Parameters<typeof kinemaCardsQuery>[1]) => `${kinemaCardsQuery(scope, input)} is:due`;

/** Todas las tarjetas de conceptos de Kinema, estén en el mazo que estén. */
export const allConceptsQuery = (config: Pick<AnkiLayoutConfig, 'rootDeck'>): string =>
	`${kinemaCardsQuery('all', { rootDeck: config.rootDeck })} ${NOT_VOCAB}`;

/** Todas las tarjetas de vocabulario de Kinema, incluidos mazos propios del estudiante. */
export const allVocabQuery = (_config?: Pick<AnkiLayoutConfig, 'rootDeck'>): string =>
	`(note:"${ankiSearchValue(vocabModelName(''))}*" OR note:"${ankiSearchValue(VOCAB_MODEL_NAME_LEGACY)}")`;

/** Vocabulario capturado desde un curso concreto. */
export const courseVocabQuery = (course: string): string =>
	`${allVocabQuery()} tag:kinema::curso::${kinemaSlug(course)}`;

/**
 * Fase 4: las notas de conceptos de Kinema de los DEMÁS cursos (por tipo de
 * nota, en cualquier mazo). Con la del curso (kinemaCardsQuery('course')) es
 * todo lo que el control de duplicados lee de Anki.
 */
export function otherCoursesConceptsQuery(course: string): string {
	return `${conceptNote} -tag:kinema::curso::${kinemaSlug(course)}`;
}

/** Las tarjetas de un programa (etiqueta de ahora o de antes): la búsqueda para repasarlo entero. */
export function programCardsQuery(program: string): string {
	const slug = kinemaSlug(program);
	return `(tag:${PROGRAM_TAG}${slug} OR tag:${LEGACY_PROGRAM_TAG}${slug})`;
}

/**
 * Notas de conceptos de un curso a las que les falta la etiqueta de un
 * programa que lo incluye (fase 5: N:M). Solo se les AÑADE la etiqueta.
 */
export function missingProgramTagQuery(course: string, program: string): string {
	return `${conceptNote} tag:kinema::curso::${kinemaSlug(course)} -tag:${PROGRAM_TAG}${kinemaSlug(program)}`;
}

/** Notas de UNA lección (para contar cuántas entraron al importar). */
export function lessonNotesQuery(course: string, lesson: string): string {
	return `${conceptNote} tag:kinema::curso::${kinemaSlug(course)} tag:kinema::leccion::${kinemaSlug(lesson)}`;
}

// ── «Ordenar lo antiguo» (opcional: estructuras y etiquetas de antes) ────

export interface DeckMove {
	kind: 'concepts' | 'vocab';
	from: string;
	to: string;
}

/**
 * Qué mazos de estructuras anteriores aplanar, a partir de la lista real de
 * mazos de Anki:
 *  <Root>::Courses::<Curso>::<Lección>      → <Root>::Courses::<Curso>      («Por lección»)
 *  <Root>::Programs::<Programa>::<Curso>    → <Root>::Courses::<Curso>      («Por programa»)
 *  <Root>::Vocabulary::<Idioma>::<Curso>    → <Root>::Vocabulary::<Idioma>  (vocabulario por curso)
 * Solo ese nivel exacto (nada más profundo ni ajeno). Mover tarjetas conserva
 * su historial de repasos; nunca se ejecuta sola. El vocabulario de un idioma
 * para el que elegiste un mazo tuyo no se toca.
 */
export function migrationPlan(deckNames: string[], config: AnkiLayoutConfig): DeckMove[] {
	const root = rootOf(config);
	const depth = root.split('::').length;
	const moves: DeckMove[] = [];
	for (const name of deckNames) {
		if (!isOwnedDeck(root, name)) continue;
		const rest = name.split('::').slice(depth);
		if (rest.length !== 3) continue;
		if (rest[0] === 'Courses') {
			moves.push({ kind: 'concepts', from: name, to: [root, 'Courses', rest[1]].join('::') });
		} else if (rest[0] === 'Programs') {
			moves.push({ kind: 'concepts', from: name, to: [root, 'Courses', rest[2]].join('::') });
		} else if (rest[0] === 'Vocabulary' && !ownVocabDeck(config, rest[1])) {
			moves.push({ kind: 'vocab', from: name, to: [root, 'Vocabulary', rest[1]].join('::') });
		}
	}
	return moves.sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * Mazos intermedios que quedan vacíos al aplanar «Por programa»
 * (<Root>::Programs::<Programa> y <Root>::Programs): se borran solo si se
 * comprueban vacíos justo antes, como los submazos.
 */
export function prunableParents(moves: DeckMove[], config: AnkiLayoutConfig): string[] {
	const root = rootOf(config);
	const programs = `${root}::Programs`;
	const out = new Set<string>();
	for (const move of moves) {
		if (!move.from.startsWith(`${programs}::`)) continue;
		out.add(move.from.split('::').slice(0, root.split('::').length + 2).join('::'));
		out.add(programs);
	}
	// Del más profundo al más alto: primero el programa, luego «Programs».
	return [...out].sort((a, b) => b.split('::').length - a.split('::').length || a.localeCompare(b));
}

/** Tras aplanar: los cursos fijados en un mazo que ya no existe pasan a su mazo nuevo. */
export function registryAfterMoves(registry: CourseDeckRegistry, moves: Array<DeckMove & { moved?: boolean; cards?: number }>): CourseDeckRegistry {
	const next: CourseDeckRegistry = { ...registry };
	for (const [key, entry] of Object.entries(registry)) {
		const move = moves.find((m) => m.from === entry.deck);
		if (move) next[key] = { ...entry, deck: move.to, at: Date.now() };
	}
	return next;
}

export interface TagRename {
	from: string;
	to: string;
}

/**
 * Etiquetas antiguas de Kinema y su nombre de ahora, a partir de la lista real
 * de etiquetas de Anki (getTags). Solo las de Kinema: kinema::track::… y
 * kinema/platform::….
 */
export function tagMigrationPlan(tags: string[]): TagRename[] {
	const out = new Map<string, TagRename>();
	for (const tag of tags) {
		const to = renamedLegacyTag(tag);
		if (to && to !== tag && !out.has(tag)) out.set(tag, { from: tag, to });
	}
	return [...out.values()].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** Búsqueda exacta de una etiqueta (sin sus hijas). */
export const exactTagQuery = (tag: string) => `tag:"${ankiSearchValue(tag)}" -tag:"${ankiSearchValue(tag)}::*"`;

/** Solo las tarjetas que están directamente en el submazo (no en otros más profundos). */
export const cardsDirectlyIn = (deck: string) => `${deckClause(deck)} -deck:"${ankiSearchValue(deck)}::*"`;
