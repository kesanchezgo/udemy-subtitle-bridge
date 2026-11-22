/**
 * Biblioteca (fase 2): Programa (opcional) → Curso → Lección, a partir del
 * historial. Pura: la UI le pasa los registros, el registro de mazos y la
 * configuración, y recibe grupos listos para pintar.
 *
 * Una sola fuente de verdad para el mazo: el mismo que usa Fijar
 * (ankiDestination.conceptDestination + registro de mazos por curso). Las
 * cifras locales salen de las tarjetas guardadas en el historial; las de Anki
 * (en Anki, nuevas, aprendiendo, reaprendiendo, pendientes hoy) salen de
 * AnkiConnect con las MISMAS búsquedas que los repasos pendientes
 * (kinemaCardsQuery), así que cuadran con cualquier estructura de mazos y con
 * mazos elegidos por el estudiante. Solo conceptos: el vocabulario se excluye
 * por tipo de nota aunque comparta mazo con el curso.
 */
import { assignedDeckFor, conceptDestination, kinemaCardsQuery, type AnkiLayoutConfig, type CourseDeckRegistry, type DeckDestination } from './ankiDestination.ts';
import { kinemaSlug, programTag } from './ankiDesign.ts';
import { deckIdeaMatches, type DeckMatch } from './deckConcepts.ts';
import { courseProgress, courseTotalFor, type CourseProgress, type CourseTotals } from './courseTotals.ts';
import {
	courseMocPathFor, courseNoteFolder, fileOf, folderOf, sessionNotePathIn, sourcesRoot,
	type CourseFolderRegistry, type ObsidianLayoutConfig,
} from './obsidianDestination.ts';

/** Lo mínimo del registro de historial que necesita la Biblioteca. */
export interface LibraryRecord {
	courseId: string;
	courseName: string;
	lectureId: string;
	lectureName: string;
	status?: string;
	finishedAt?: number;
	startedAt?: number;
	updatedAt?: number;
	exportedAt?: number;
	obsidianExportedAt?: number;
	/** Fase 3: dónde se escribió su nota (si consta). */
	obsidianNotePath?: string;
	/** Solo se mira si existe: sin contenido guardado no se puede rehacer la nota. */
	studyContent?: unknown;
	ankiDeck?: string;
	dcTrackSlug?: string;
	ankiCardsCount?: number;
	ankiCards?: { type?: string; reinforce?: boolean; excluded?: boolean; doubt?: boolean; inDeck?: boolean }[];
}

export interface CardCounts {
	/** Tarjetas aceptadas (las quitadas en Fijar no cuentan). */
	total: number;
	reinforce: number;
	doubt: number;
	interview: number;
}

export interface ProgramRef {
	slug: string;
	title: string;
}

export interface LibraryLesson<R extends LibraryRecord = LibraryRecord> {
	rec: R;
	cards: CardCounts;
	finished: boolean;
	/** Sus tarjetas ya fueron a Anki (.apkg o «Enviar a Anki»). */
	inAnki: boolean;
	/** Terminada, con tarjetas guardadas y sin exportar: hay que descargarlas. */
	pending: boolean;
	inObsidian: boolean;
	/**
	 * Fase 3: dónde está (o estaría) su nota: la ruta guardada; si se exportó
	 * antes de guardarla, la carpeta de lecciones (donde iban todas); si no, la
	 * carpeta del curso. null sin Obsidian configurado.
	 */
	notePath: string | null;
	/** Terminada, con contenido y sin nota: se puede guardar desde la Biblioteca. */
	obsidianSavable: boolean;
	/** Etiquetas de Kinema con las que se encuentran sus tarjetas en Anki. */
	tags: string[];
	/**
	 * Fase 4: ideas de la lección que ya estaban en el mazo al estudiarla (se
	 * practicaron sin crear otra tarjeta, salvo «Añadir igualmente»).
	 */
	inDeck: DeckMatch[];
}

/** La carpeta de notas del curso (la misma que usa Fijar) y su índice. */
export interface LibraryObsidian {
	folder: string;
	/** ¿Fijada en el registro (primera nota o «Cambiar»)? */
	assigned: boolean;
	/** La que tocaría por Ajustes (para «volver a la de Kinema»). */
	defaultFolder: string;
	mocPath: string;
	/** Lecciones terminadas sin nota que se pueden guardar ahora. */
	savable: number;
}

export interface LibraryCourse<R extends LibraryRecord = LibraryRecord> {
	courseId: string;
	courseName: string;
	/** Programa principal (el más estudiado con este curso), si es de DataCamp. */
	program: ProgramRef | null;
	/** Los demás programas con los que lo estudiaste: el curso NO se duplica, son etiquetas. */
	otherPrograms: ProgramRef[];
	lessons: LibraryLesson<R>[];
	studied: number;
	finished: number;
	/**
	 * Progreso: sobre el temario de la plataforma si se conoce (y cuadra con lo
	 * estudiado); si no, sobre lo empezado, sin fingir un porcentaje del curso.
	 */
	progress: CourseProgress;
	cards: CardCounts & { inAnki: number; pending: number };
	inObsidian: number;
	/** Fase 4: ideas que ya estaban en el mazo, sumadas por lección (no se duplicaron). */
	inDeckIdeas: number;
	/** Fase 3: carpeta de Obsidian del curso (null sin Obsidian configurado). */
	obsidian: LibraryObsidian | null;
	/** Mazo del curso: el asignado (registro) o el que tocaría por la configuración. */
	deck: DeckDestination;
	/** ¿El mazo está fijado en el registro (primera exportación o «Cambiar»)? */
	deckAssigned: boolean;
	/** Mazos a los que fueron de verdad sus lecciones (por si cambió con el tiempo). */
	decksUsed: string[];
	lastSeenAt: number;
}

export interface LibraryGroup<R extends LibraryRecord = LibraryRecord> {
	/** null = cursos sin programa (Udemy u otras plataformas). */
	program: ProgramRef | null;
	courses: LibraryCourse<R>[];
}

export type LessonFilter = 'all' | 'reinforce' | 'doubt' | 'interview' | 'pending';

/** «data-scientist-in-python» → «Data Scientist In Python» (si no conocemos el título). */
export function prettifySlug(slug: string): string {
	return String(slug || '')
		.split(/[-_]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

/**
 * Tarjetas aceptadas de una lección: las que van (o fueron) al mazo. No cuentan
 * las quitadas en Fijar ni las que ya estaban en el mazo (fase 4: excluded).
 * Una sola regla para «Sin descargar», «Descargar N», el aviso del menú y la
 * descarga de pendientes (antes contaban también las quitadas).
 */
export function acceptedCardCount(rec: { ankiCards?: { excluded?: boolean }[] }): number {
	return (rec.ankiCards ?? []).filter((c) => c && !c.excluded).length;
}

/** Terminada, con tarjetas aceptadas guardadas y sin llegar a Anki: falta enviarlas. */
export function isPendingExport(rec: { deletedAt?: number; status?: string; finishedAt?: number; exportedAt?: number; ankiCards?: { excluded?: boolean }[] }): boolean {
	return !rec.deletedAt && (rec.status === 'completed' || rec.finishedAt != null) && !rec.exportedAt && acceptedCardCount(rec) > 0;
}

type SyncRecord = Parameters<typeof isPendingExport>[0] & { syncPending?: { anki?: number; obsidian?: number }; studyContent?: unknown; exportedGuids?: string[] };

/**
 * Fase 5 · terminada cuando Anki no respondía: se envía SOLA cuando Anki
 * vuelva. Solo las que «Terminar lección» dejó en espera (las lecciones de
 * antes sin enviar no se mandan por su cuenta: la Biblioteca las ofrece).
 */
export function isWaitingForAnki(rec: SyncRecord): boolean {
	return !rec.deletedAt && Boolean(rec.syncPending?.anki) && acceptedCardCount(rec) > 0;
}

/** Fase 5 · terminada cuando Obsidian no respondía: su nota se guarda sola cuando vuelva. */
export function isWaitingForObsidian(rec: SyncRecord): boolean {
	return !rec.deletedAt && Boolean(rec.syncPending?.obsidian) && Boolean(rec.studyContent);
}

export function lessonCards(rec: LibraryRecord): CardCounts {
	const kept = (rec.ankiCards ?? []).filter((c) => !c.excluded);
	if (kept.length === 0) return { total: Math.max(0, rec.ankiCardsCount ?? 0), reinforce: 0, doubt: 0, interview: 0 };
	return {
		total: kept.length,
		reinforce: kept.filter((c) => c.reinforce && !c.doubt).length,
		doubt: kept.filter((c) => c.doubt).length,
		interview: kept.filter((c) => c.type === 'entrevista').length,
	};
}

/** Las etiquetas que llevan sus tarjetas (las mismas que pone el envío a Anki). */
export function lessonTags(rec: LibraryRecord): string[] {
	return [
		`kinema::curso::${kinemaSlug(rec.courseName)}`,
		`kinema::leccion::${kinemaSlug(rec.lectureName)}`,
		...(rec.dcTrackSlug ? [programTag(rec.dcTrackSlug)] : []),
	];
}

/**
 * Fase 5 · los programas de un curso: los de todas sus lecciones (el programa
 * que seguías al estudiar cada una) más el de ahora. Un curso puede estar en
 * varios programas (N:M): sus tarjetas llevan la etiqueta de cada uno.
 */
export function courseProgramSlugs(records: Array<Pick<LibraryRecord, 'courseName' | 'dcTrackSlug'>>, course: string, current?: string | null): string[] {
	const key = kinemaSlug(course);
	const out = new Set<string>();
	for (const rec of records) if (rec.dcTrackSlug && kinemaSlug(rec.courseName) === key) out.add(rec.dcTrackSlug);
	if (current) out.add(current);
	return [...out].sort();
}

export function buildLibrary<R extends LibraryRecord>(
	records: R[],
	input: {
		config: AnkiLayoutConfig;
		registry: CourseDeckRegistry;
		programTitles?: Record<string, string>;
		courseTotals?: CourseTotals;
		/** Fase 3: con Obsidian configurado, la carpeta de cada curso (misma fuente que Fijar). */
		obsidian?: { config: ObsidianLayoutConfig; registry: CourseFolderRegistry } | null;
	},
): LibraryGroup<R>[] {
	const titles = input.programTitles ?? {};
	const ref = (slug: string): ProgramRef => ({ slug, title: titles[slug] || prettifySlug(slug) });
	const byCourse = new Map<string, R[]>();
	for (const rec of records) {
		const list = byCourse.get(rec.courseId) ?? [];
		list.push(rec);
		byCourse.set(rec.courseId, list);
	}
	const courses: LibraryCourse<R>[] = [];
	for (const [courseId, recs] of byCourse) {
		const ordered = [...recs].sort((a, b) => (a.startedAt ?? a.updatedAt ?? 0) - (b.startedAt ?? b.updatedAt ?? 0));
		const courseName = ordered[ordered.length - 1].courseName;
		// Programa principal = el más frecuente; el resto, «también en».
		const freq = new Map<string, number>();
		for (const rec of ordered) if (rec.dcTrackSlug) freq.set(rec.dcTrackSlug, (freq.get(rec.dcTrackSlug) ?? 0) + 1);
		const slugs = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
		const obs = input.obsidian ? courseNoteFolder(input.obsidian.config, input.obsidian.registry, courseName, slugs[0] ?? null) : null;
		const lessons: LibraryLesson<R>[] = ordered.map((rec) => {
			const cards = lessonCards(rec);
			const finished = rec.status === 'completed' || rec.finishedAt != null;
			const inAnki = Boolean(rec.exportedAt) && cards.total > 0;
			const inObsidian = Boolean(rec.obsidianExportedAt);
			const notePath = !input.obsidian || !obs ? null
				: rec.obsidianNotePath
					|| sessionNotePathIn(inObsidian ? sourcesRoot(input.obsidian.config) : obs.folder, rec.courseName, rec.lectureName);
			return {
				rec,
				cards,
				finished,
				inAnki,
				pending: isPendingExport(rec),
				inObsidian,
				notePath,
				obsidianSavable: Boolean(input.obsidian) && finished && !inObsidian && Boolean(rec.studyContent),
				tags: lessonTags(rec),
				inDeck: deckIdeaMatches(rec.studyContent),
			};
		});
		const assigned = assignedDeckFor(input.registry, courseName);
		const deck = conceptDestination(input.config, courseName, '', { assigned });
		const sum = (pick: (l: LibraryLesson<R>) => number) => lessons.reduce((n, l) => n + pick(l), 0);
		const finishedCount = lessons.filter((l) => l.finished).length;
		courses.push({
			courseId,
			courseName,
			program: slugs[0] ? ref(slugs[0]) : null,
			otherPrograms: slugs.slice(1).map(ref),
			lessons,
			studied: lessons.length,
			finished: finishedCount,
			progress: courseProgress(finishedCount, lessons.length, courseTotalFor(input.courseTotals, courseName, lessons.length)),
			cards: {
				total: sum((l) => l.cards.total),
				reinforce: sum((l) => l.cards.reinforce),
				doubt: sum((l) => l.cards.doubt),
				interview: sum((l) => l.cards.interview),
				inAnki: sum((l) => (l.inAnki ? l.cards.total : 0)),
				pending: sum((l) => (l.pending ? acceptedCardCount(l.rec) : 0)),
			},
			inObsidian: lessons.filter((l) => l.inObsidian).length,
			inDeckIdeas: sum((l) => l.inDeck.length),
			obsidian: obs && input.obsidian ? {
				folder: obs.folder,
				assigned: obs.assigned,
				defaultFolder: obs.defaultFolder,
				mocPath: courseMocPathFor(input.obsidian.config, courseName),
				savable: lessons.filter((l) => l.obsidianSavable).length,
			} : null,
			deck,
			deckAssigned: Boolean(assigned),
			decksUsed: [...new Set(ordered.map((r) => r.ankiDeck).filter((d): d is string => Boolean(d)))],
			lastSeenAt: Math.max(...ordered.map((r) => r.updatedAt ?? r.startedAt ?? 0)),
		});
	}
	const groups = new Map<string, LibraryGroup<R>>();
	for (const course of courses) {
		const key = course.program?.slug ?? '';
		const group = groups.get(key) ?? { program: course.program, courses: [] };
		group.courses.push(course);
		groups.set(key, group);
	}
	for (const group of groups.values()) group.courses.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
	// Programas primero (por título); los cursos sin programa al final.
	return [...groups.values()].sort((a, b) => {
		if (!a.program) return 1;
		if (!b.program) return -1;
		return a.program.title.localeCompare(b.program.title);
	});
}

export function filterLessons<R extends LibraryRecord>(lessons: LibraryLesson<R>[], filter: LessonFilter): LibraryLesson<R>[] {
	switch (filter) {
		case 'reinforce': return lessons.filter((l) => l.cards.reinforce > 0);
		case 'doubt': return lessons.filter((l) => l.cards.doubt > 0);
		case 'interview': return lessons.filter((l) => l.cards.interview > 0);
		case 'pending': return lessons.filter((l) => l.pending);
		default: return lessons;
	}
}

export function filterCounts<R extends LibraryRecord>(lessons: LibraryLesson<R>[]): Record<LessonFilter, number> {
	return {
		all: lessons.length,
		reinforce: filterLessons(lessons, 'reinforce').length,
		doubt: filterLessons(lessons, 'doubt').length,
		interview: filterLessons(lessons, 'interview').length,
		pending: filterLessons(lessons, 'pending').length,
	};
}

/** Lo que excluye el vocabulario de las búsquedas de conceptos (vive en ankiDestination). */
export { NOT_VOCAB } from './ankiDestination.ts';

export interface CourseAnkiQueries {
	/** Todas sus tarjetas de conceptos (también suspendidas y enterradas). */
	cards: string;
	/** Pendientes hoy (repasos y pasos de aprendizaje vencidos; Anki ya excluye suspendidas y enterradas). */
	due: string;
	/** Nuevas activas. */
	fresh: string;
	/** Aprendiendo por primera vez, activas (tipo «aprendizaje»). */
	learning: string;
	/** Reaprendiendo, activas: olvidadas en un repaso (tipo «reaprendizaje»). */
	relearning: string;
	reinforce: string;
	suspended: string;
}

/**
 * Búsquedas de Anki de un curso (las de los repasos pendientes, con su mazo).
 * Semántica verificada con el motor de Anki (scripts/qa-anki-real-search.mjs):
 * is:new / is:learn / is:review van por el TIPO de tarjeta e incluyen las
 * suspendidas y enterradas, así que el desglose se limita a las activas (lo
 * mismo que cuenta la pantalla de mazos de Anki); las suspendidas se dicen aparte.
 */
export function courseAnkiQueries(course: Pick<LibraryCourse, 'courseName' | 'deck'>, config: AnkiLayoutConfig): CourseAnkiQueries {
	const cards = kinemaCardsQuery('course', { rootDeck: config.rootDeck, course: course.courseName, courseDeck: course.deck.deck });
	const active = `${cards} -is:suspended -is:buried`;
	return {
		cards,
		due: `${cards} is:due`,
		fresh: `${active} is:new`,
		learning: `${active} is:learn -is:review`,
		relearning: `${active} is:learn is:review`,
		reinforce: `${cards} tag:kinema::reforzar`,
		suspended: `${cards} is:suspended`,
	};
}

/** Búsquedas de Anki de una lección. */
export function lessonAnkiQueries(rec: Pick<LibraryRecord, 'courseName' | 'lectureName'>, config: AnkiLayoutConfig): { cards: string; due: string } {
	const cards = kinemaCardsQuery('lesson', { rootDeck: config.rootDeck, course: rec.courseName, lesson: rec.lectureName });
	return { cards, due: `${cards} is:due` };
}

/** Cifras reales de Anki de un curso abierto (null = Anki no responde). */
export interface CourseAnkiCounts {
	cards: number;
	due: number;
	fresh: number;
	learning: number;
	relearning: number;
	reinforce: number;
	suspended: number;
	/** lectureId → pendientes hoy (solo las primeras lecciones, para no cargar a Anki). */
	lessonDue: Record<string, number>;
}

/** Cuántas lecciones por curso se consultan una a una en Anki (el resto, solo el total del curso). */
export const LESSON_QUERY_LIMIT = 40;

// ── Obsidian (fase 3): lo que hay de verdad en el vault ────────────────────

/** Las carpetas a listar para comprobar las notas de un curso (una petición por carpeta). */
export function obsidianFoldersToCheck(course: Pick<LibraryCourse, 'lessons' | 'obsidian'>): string[] {
	if (!course.obsidian) return [];
	const folders = new Set<string>([folderOf(course.obsidian.mocPath)]);
	for (const lesson of course.lessons) if (lesson.notePath && (lesson.inObsidian || lesson.obsidianSavable)) folders.add(folderOf(lesson.notePath));
	return [...folders];
}

export type NoteState = 'present' | 'missing';

export interface CourseVaultState {
	/** lectureId → la nota está (o no) en el vault. Solo lecciones con nota o guardables. */
	notes: Record<string, NoteState>;
	mocExists: boolean;
	/** Exportadas según el historial pero ya no están en el vault (borradas o movidas a mano). */
	missing: number;
}

/** Cruza el historial con lo que el plugin dice que hay en cada carpeta. */
export function courseVaultState(course: Pick<LibraryCourse, 'lessons' | 'obsidian'>, listing: Record<string, string[]>): CourseVaultState {
	const has = (path: string) => (listing[folderOf(path)] ?? []).includes(fileOf(path));
	const notes: Record<string, NoteState> = {};
	let missing = 0;
	for (const lesson of course.lessons) {
		if (!lesson.notePath || !(lesson.inObsidian || lesson.obsidianSavable)) continue;
		const state: NoteState = has(lesson.notePath) ? 'present' : 'missing';
		notes[lesson.rec.lectureId] = state;
		if (lesson.inObsidian && state === 'missing') missing += 1;
	}
	return { notes, mocExists: course.obsidian ? has(course.obsidian.mocPath) : false, missing };
}
