/**
 * Adaptador del sitio master.dev (Frontend Masters).
 *
 * Es un sitio SSR con un reproductor propio (`fmplayer`). La lección está en
 * `/courses/<slug>/<lesson-slug>/` y el vídeo es un `<video>` en la página (no
 * iframe). Los metadatos del curso vienen de la API pública de kabuki y los
 * subtítulos oficiales son WebVTT en `captions.master.dev`, ambos sin cookies:
 *
 *   GET https://api.master.dev/v2/kabuki/courses/<slug>
 *       → { title, datePublished, lessonData: { hash → { slug, title, index, ... } },
 *           lessonSlugs, hasTranscript, hasWebVTT, hasHLS, ... }
 *
 *   GET https://captions.master.dev/assets/courses/<datePublished>-<courseSlug>/<index>-<lessonSlug>.vtt
 *
 *   GET https://api.master.dev/v2/kabuki/video/<lessonHash>/source?f=m3u8
 *       → { url } (HLS firmado; solo se necesita si se quiere el vídeo, Kinema
 *         usa el <video> de la página para reloj y rect)
 *
 * Los "programas" son learning paths en `/learn/<slug>/`, con la lista de
 * cursos en `window._bs.learningPaths[slug].core` y el progreso en
 * `window._bs.progress`. Todo se lee desde la página, sin permisos extra.
 */

export type MasterLesson = {
	hash: string;
	slug: string;
	title: string;
	description?: string;
	/** Índice de la lección en el curso (0-based): parte del nombre del VTT. */
	index: number;
	elementIndex?: number;
	timestamp?: string;
};

export type MasterCourse = {
	slug: string;
	title: string;
	description?: string;
	datePublished?: string;
	lessonSlugs: string[];
	lessonData: Record<string, MasterLesson>;
	instructors?: Array<{ name?: string; slug?: string }>;
	hasTranscript?: boolean;
	hasWebVTT?: boolean;
	hasHLS?: boolean;
};

export type MasterVideoMeta = {
	course: MasterCourse;
	lesson: MasterLesson;
	vttUrl: string;
	videoApiUrl: string;
};

const API = 'https://api.master.dev/v2/kabuki/';
const CAPTIONS = 'https://captions.master.dev/assets/courses/';

export function isMasterCampusPage(): boolean {
	return window.location.hostname === 'master.dev' || window.location.hostname === 'www.master.dev';
}

/** /courses/<slug>/<lesson>/ → { courseSlug, lessonSlug }. null si es /courses/ o /learn/. */
export function getMasterLessonRoute(): { courseSlug: string; lessonSlug: string } | null {
	const m = window.location.pathname.match(/^\/courses\/([^/]+)\/([^/]+)\/?$/);
	return m ? { courseSlug: m[1], lessonSlug: m[2] } : null;
}

/** /learn/<slug>/ → slug del programa (learning path). */
export function getMasterProgramSlug(): string | null {
	const m = window.location.pathname.match(/^\/learn\/([^/]+)\/?$/);
	return m ? m[1] : null;
}

export async function fetchMasterCourse(slug: string): Promise<MasterCourse | null> {
	try {
		const res = await fetch(`${API}courses/${encodeURIComponent(slug)}`, { credentials: 'omit' });
		if (!res.ok) return null;
		const raw = await res.json() as Record<string, unknown>;
		const lessonData: Record<string, MasterLesson> = {};
		const data = (raw.lessonData ?? {}) as Record<string, Record<string, unknown>>;
		for (const [hash, l] of Object.entries(data)) {
			if (!l || typeof l.slug !== 'string') continue;
			lessonData[hash] = {
				hash,
				slug: l.slug,
				title: String(l.title ?? l.slug),
				description: typeof l.description === 'string' ? l.description : undefined,
				index: typeof l.index === 'number' ? l.index : 0,
				elementIndex: typeof l.elementIndex === 'number' ? l.elementIndex : undefined,
				timestamp: typeof l.timestamp === 'string' ? l.timestamp : undefined,
			};
		}
		return {
			slug: String(raw.slug ?? slug),
			title: String(raw.title ?? slug),
			description: typeof raw.description === 'string' ? raw.description : undefined,
			datePublished: typeof raw.datePublished === 'string' ? raw.datePublished : undefined,
			lessonSlugs: Array.isArray(raw.lessonSlugs) ? (raw.lessonSlugs as string[]) : [],
			lessonData,
			instructors: Array.isArray(raw.instructors) ? (raw.instructors as MasterCourse['instructors']) : undefined,
			hasTranscript: raw.hasTranscript === true,
			hasWebVTT: raw.hasWebVTT === true,
			hasHLS: raw.hasHLS === true,
		};
	} catch {
		return null;
	}
}

/** Resuelve la lección actual y construye las URLs del VTT y del vídeo. */
export async function resolveMasterVideo(route: { courseSlug: string; lessonSlug: string }): Promise<MasterVideoMeta | null> {
	const course = await fetchMasterCourse(route.courseSlug);
	if (!course) return null;
	const lesson = Object.values(course.lessonData).find((l) => l.slug === route.lessonSlug);
	if (!lesson) return null;
	const prefix = course.datePublished ? `${course.datePublished}-${course.slug}` : null;
	if (!prefix) return null;
	return {
		course,
		lesson,
		vttUrl: `${CAPTIONS}${prefix}/${lesson.index}-${lesson.slug}.vtt`,
		videoApiUrl: `${API}video/${encodeURIComponent(lesson.hash)}/source?f=m3u8`,
	};
}

/** Programas (learning paths) leídos del bootstrap de la página /learn/<slug>/. */
export function readMasterLearningPath(): { slug: string; courses: string[] } | null {
	const slug = getMasterProgramSlug();
	if (!slug) return null;
	const bs = (window as unknown as { _bs?: { learningPaths?: Record<string, { core?: string[] }> } })._bs;
	const core = bs?.learningPaths?.[slug]?.core;
	return core && core.length ? { slug, courses: [...core] } : null;
}
