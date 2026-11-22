/**
 * Total de lecciones de un curso, leído de la plataforma (no inventado).
 *
 * La Biblioteca solo da un porcentaje del CURSO si conoce su temario: el
 * content script lo lee al abrir una lección y lo guarda aquí. Sin total (o si
 * no cuadra con lo estudiado) la Biblioteca dice «2 terminadas de 3 empezadas»
 * y nunca un porcentaje que parezca del curso entero.
 *
 * Campos verificados contra las APIs reales (2026-11):
 * - Udemy  GET /api-2.0/courses/{slug}/?fields[course]=title,num_published_lectures
 *          → num_published_lectures (num_lectures incluye las no publicadas).
 * - DataCamp GET campus-api.datacamp.com/api/courses/{slug} (ya lo descarga el
 *          content script) → chapters[].exercises[].type === 'VideoExercise'
 *          (lo que Kinema estudia); respaldo: chapters[].number_of_videos.
 *          nb_exercises NO sirve: no cuadra con la lista de ejercicios.
 *
 * Sin dependencias: lo importan el content script y la Biblioteca.
 */

export const COURSE_TOTALS_KEY = 'usb_course_totals';
/** Se vuelve a leer pasada una semana (los cursos añaden lecciones). */
export const COURSE_TOTAL_TTL_MS = 7 * 86_400_000;

export interface CourseTotal {
	total: number;
	source: 'udemy' | 'datacamp';
	slug?: string;
	at: number;
}
export type CourseTotals = Record<string, CourseTotal>;

/** Clave por título (el mismo que el historial guarda como courseName). «+» y «#» cuentan: C++ ≠ C# ≠ C. */
export function courseTotalKey(title: string): string {
	return String(title || '')
		.replace(/\+/g, ' plus ')
		.replace(/([a-z])#/gi, '$1 sharp ')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

const positiveInt = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null);

/** Udemy: lecciones publicadas del curso. */
export function udemyLectureTotal(json: unknown): number | null {
	return positiveInt((json as { num_published_lectures?: unknown } | null)?.num_published_lectures);
}

/** DataCamp: vídeos del curso (cada uno es una lección de Kinema). */
export function dataCampVideoTotal(outline: unknown): number | null {
	const chapters = (outline as { chapters?: unknown } | null)?.chapters;
	if (!Array.isArray(chapters) || chapters.length === 0) return null;
	let listed = 0;
	let declared = 0;
	let everyChapterListed = true;
	for (const chapter of chapters as Array<{ exercises?: unknown; number_of_videos?: unknown }>) {
		if (Array.isArray(chapter?.exercises)) listed += (chapter.exercises as Array<{ type?: unknown }>).filter((e) => e?.type === 'VideoExercise').length;
		else everyChapterListed = false;
		declared += positiveInt(chapter?.number_of_videos) ?? 0;
	}
	return positiveInt(everyChapterListed ? listed : 0) ?? positiveInt(declared);
}

export const isFreshTotal = (entry: CourseTotal | null | undefined, now = Date.now()): boolean =>
	Boolean(entry) && now - (entry as CourseTotal).at < COURSE_TOTAL_TTL_MS;

/** Guarda el total bajo cada título con que puede aparecer el curso (página y API). */
export function withCourseTotal(totals: CourseTotals, titles: Array<string | null | undefined>, entry: CourseTotal): CourseTotals {
	const next = { ...totals };
	for (const title of titles) {
		const key = courseTotalKey(title ?? '');
		if (key) next[key] = entry;
	}
	return next;
}

/** El total de un curso, solo si es coherente con lo estudiado (si no, mejor no saberlo). */
export function courseTotalFor(totals: CourseTotals | null | undefined, courseName: string, studied: number): CourseTotal | null {
	const entry = totals?.[courseTotalKey(courseName)];
	return entry && positiveInt(entry.total) && entry.total >= studied ? entry : null;
}

export interface CourseProgress {
	/** 'course' = sobre el temario de la plataforma; 'started' = sobre lo empezado (sin temario). */
	basis: 'course' | 'started';
	done: number;
	of: number;
	ratio: number;
	/** Lo que se pinta dentro del anillo: «4%», «<1%», «100%» o «2/3». */
	label: string;
	source?: CourseTotal['source'];
}

export function courseProgress(finished: number, studied: number, total: CourseTotal | null): CourseProgress {
	if (total) {
		const ratio = Math.min(1, finished / total.total);
		const pct = ratio * 100;
		const label = finished === 0 ? '0%' : pct < 1 ? '<1%' : `${Math.floor(pct)}%`;
		return { basis: 'course', done: finished, of: total.total, ratio, label, source: total.source };
	}
	return { basis: 'started', done: finished, of: studied, ratio: studied > 0 ? Math.min(1, finished / studied) : 0, label: `${finished}/${studied}` };
}

/** Lo mínimo de chrome.storage.local (callbacks) que necesita el content script. */
export interface CallbackStorage {
	get: (keys: string[], cb: (items: Record<string, unknown>) => void) => void;
	set: (items: Record<string, unknown>, cb?: () => void) => void;
}

export function readCourseTotals(storage: CallbackStorage): Promise<CourseTotals> {
	return new Promise((resolve) => {
		try { storage.get([COURSE_TOTALS_KEY], (items) => resolve((items?.[COURSE_TOTALS_KEY] as CourseTotals) ?? {})); }
		catch { resolve({}); }
	});
}

export async function saveCourseTotal(storage: CallbackStorage, titles: Array<string | null | undefined>, entry: CourseTotal): Promise<void> {
	const next = withCourseTotal(await readCourseTotals(storage), titles, entry);
	await new Promise<void>((resolve) => {
		try { storage.set({ [COURSE_TOTALS_KEY]: next }, () => resolve()); }
		catch { resolve(); }
	});
}
