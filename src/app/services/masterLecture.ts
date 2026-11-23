/**
 * Adaptador del sitio master.dev (Frontend Masters).
 *
 * Sitio SSR con reproductor propio (`fmplayer` 4.4.7). La lección está en
 * `/courses/<slug>/<lesson-slug>/` y el vídeo es un `<video class="vjs-tech">`
 * en el mismo documento (sin iframe). Las funciones de parseo son puras y se
 * exportan para poder probarlas en Node sin navegador.
 *
 * Fuentes verificadas en vivo:
 *  · GET https://api.master.dev/v2/kabuki/courses/<slug>
 *      → { title, description, datePublished, lessonSlugs, lessonData,
 *          hasTranscript, hasWebVTT, hasHLS, ... } (p. ej. ai-engineering:
 *          49 lecciones, datePublished 2026-04-28, hasWebVTT true)
 *  · VTT oficial: https://captions.master.dev/assets/courses/<date>-<slug>/<index>-<lesson>.vtt
 *  · HLS firmado: GET .../video/<lessonHash>/source?f=m3u8 → { url }
 *  · Programas (learning paths): <a href="/learn/<slug>/"> en la página de la
 *    lección (p. ej. AI Engineering + Coding with AI → ambigüedad respetada) y
 *    `window._bs.learningPaths[...].core` en /learn/<slug>/ (sintaxis corchete
 *    y punto, ambas emitidas por master.dev).
 */
import type { DataCampProgram } from './datacampLecture';

export type MasterLesson = {
	hash: string;
	slug: string;
	title: string;
	description?: string;
	/** Índice 0-based de la lección en el curso: parte del nombre del VTT. */
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
	/** Vacía si hasWebVTT === false: evitar un 404 sabido. */
	vttUrl: string;
	videoApiUrl: string;
};

const API = 'https://api.master.dev/v2/kabuki/';
const CAPTIONS = 'https://captions.master.dev/assets/courses/';

// ── caché en memoria por slug (y por track de learning path) ─────────────────
const courseCache = new Map<string, Promise<MasterCourse | null>>();
const programCache = new Map<string, Promise<{ program: DataCampProgram; courseId: number | null } | null>>();

/** Solo para tests: vacía la caché en memoria. */
export function clearMasterCourseCache(): void {
	courseCache.clear();
	programCache.clear();
}

export function isMasterCampusPage(): boolean {
	return typeof window !== 'undefined'
		&& (window.location.hostname === 'master.dev' || window.location.hostname === 'www.master.dev');
}

/** /courses/<slug>/<lesson>/ → { courseSlug, lessonSlug }. null en /courses/ o /learn/. */
export function getMasterLessonRoute(): { courseSlug: string; lessonSlug: string } | null {
	if (typeof window === 'undefined') return null;
	const m = window.location.pathname.match(/^\/courses\/([^/]+)\/([^/]+)\/?$/);
	return m ? { courseSlug: m[1], lessonSlug: m[2] } : null;
}

export async function fetchMasterCourse(slug: string): Promise<MasterCourse | null> {
	const key = String(slug || '').trim();
	if (!key) return null;
	const cached = courseCache.get(key);
	if (cached) return cached;
	const task = (async () => {
		try {
			const res = await fetch(`${API}courses/${encodeURIComponent(key)}`, { credentials: 'omit' });
			if (!res.ok) return null; // no cachear null: un fallo de red no es un dato
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
				slug: String(raw.slug ?? key),
				title: String(raw.title ?? key),
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
			courseCache.delete(key); // no dejar fallos de red en caché
			return null;
		}
	})();
	courseCache.set(key, task);
	return task;
}

/** Total de lecciones del curso, para usb_course_totals (Biblioteca). */
export function masterLectureTotal(course: MasterCourse | null | undefined): number | null {
	if (!course) return null;
	const fromSlugs = Array.isArray(course.lessonSlugs) ? course.lessonSlugs.length : 0;
	if (Number.isInteger(fromSlugs) && fromSlugs > 0) return fromSlugs;
	const fromData = course.lessonData ? Object.keys(course.lessonData).length : 0;
	return fromData > 0 ? fromData : null;
}

/** Resuelve la lección actual y construye URLs. `vttUrl` vacía si no hay WebVTT. */
export async function resolveMasterVideo(route: { courseSlug: string; lessonSlug: string }): Promise<MasterVideoMeta | null> {
	const course = await fetchMasterCourse(route.courseSlug);
	if (!course) return null;
	const lesson = Object.values(course.lessonData).find((l) => l.slug === route.lessonSlug);
	if (!lesson) return null;
	const prefix = course.datePublished ? `${course.datePublished}-${course.slug}` : null;
	const canVtt = course.hasWebVTT !== false && Boolean(prefix);
	return {
		course,
		lesson,
		vttUrl: canVtt ? `${CAPTIONS}${prefix}/${lesson.index}-${lesson.slug}.vtt` : '',
		videoApiUrl: `${API}video/${encodeURIComponent(lesson.hash)}/source?f=m3u8`,
	};
}

/** Siguiente lección: botón real de fmplayer con respaldo determinista por lessonSlugs. */
export function goToNextMasterLesson(doc: Document = document, meta?: MasterVideoMeta | null): boolean {
	const next = doc.querySelector<HTMLButtonElement>(
		'button[data-nav-link="next"]:not([disabled]), button[aria-label="Next Lesson"]:not([disabled])',
	);
	if (next) { next.click(); return true; }
	const route = getMasterLessonRoute();
	const slugs = meta?.course?.lessonSlugs ?? [];
	if (!route || !slugs.length) return false;
	const idx = slugs.indexOf(route.lessonSlug);
	if (idx >= 0 && idx + 1 < slugs.length) {
		window.location.assign(`/courses/${route.courseSlug}/${slugs[idx + 1]}/`);
		return true;
	}
	return false;
}

// ── learning paths (programas) — parsers puros + fetch con caché ──────────────

const htmlDecode = (s: string): string => s
	.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
	.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

/** <a href="/learn/<slug>/"> del HTML de una lección → tracks del curso (puro). */
export function parseMasterCourseTracks(htmlOrDoc: string | Document): { slug: string; title: string }[] {
	const doc = typeof htmlOrDoc === 'string'
		? new DOMParser().parseFromString(htmlOrDoc, 'text/html')
		: htmlOrDoc;
	const out: { slug: string; title: string }[] = [];
	const seen = new Set<string>();
	for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
		const href = a.getAttribute('href') ?? '';
		const m = href.match(/^\/learn\/([^/?#]+)\/?$/);
		if (!m) continue;
		const slug = m[1].trim();
		if (!slug || seen.has(slug)) continue;
		seen.add(slug);
		const raw = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
		out.push({ slug, title: raw || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) });
	}
	return out;
}

export type MasterLearningPath = {
	slug: string;
	title: string;
	description: string;
	coreSlugs: string[];
	courseTitles: Record<string, string>;
};

/** Parsea /learn/<slug>/: core (ambas sintaxis), título, descripción y títulos de cursos (puro). */
export function parseMasterLearningPathHtml(html: string, slug: string): MasterLearningPath | null {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const scripts = Array.from(doc.querySelectorAll('script')).map((s) => s.textContent ?? '').join('\n');

	// window._bs.learningPaths["ai-engineering"]={core:[...]}  |  window._bs.learningPaths.ai={core:[...]}
	let coreSlugs: string[] = [];
	const bracket = scripts.match(/learningPaths\s*\[\s*["']([^"']+)["']\s*\]\s*=\s*\{[^}]*\bcore\s*:\s*\[([^\]]*)\]/g) ?? [];
	const dotted = scripts.match(/learningPaths\s*\.\s*([A-Za-z0-9_-]+)\s*=\s*\{[^}]*\bcore\s*:\s*\[([^\]]*)\]/g) ?? [];
	for (const m of [...bracket, ...dotted]) {
		const keyMatch = m.match(/learningPaths\s*(?:\[\s*["']([^"']+)["']\s*\]|\.\s*([A-Za-z0-9_-]+))/);
		const key = keyMatch?.[1] ?? keyMatch?.[2] ?? '';
		if (key !== slug) continue;
		const listMatch = m.match(/\bcore\s*:\s*\[([^\]]*)\]/);
		const list = (listMatch?.[1] ?? '')
			.split(',')
			.map((x) => x.trim().replace(/^["']|["']$/g, ''))
			.filter((x) => /^[a-z0-9-]+$/i.test(x));
		if (list.length) { coreSlugs = list; break; }
	}
	if (!coreSlugs.length) return null;

	const titleTag = doc.querySelector('title')?.textContent ?? '';
	const h1 = doc.querySelector('h1')?.textContent ?? '';
	const humanized = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	const cleanTitle = htmlDecode(titleTag)
		.replace(/\s*\|.*$/, '')
		.replace(/\s+-\s+.*$/, '')
		.replace(/\s+Learning Path$/i, '')
		.replace(/\s+/g, ' ').trim();
	const title = cleanTitle || htmlDecode(h1).replace(/\s+/g, ' ').trim() || humanized;
	const description = htmlDecode(doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '').replace(/\s+/g, ' ').trim();

	const courseTitles: Record<string, string> = {};
	for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
		const href = a.getAttribute('href') ?? '';
		const m = href.match(/^\/courses\/([^/?#]+)\/?$/);
		if (!m) continue;
		const cSlug = m[1];
		const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
		if (!text || text.length <= 8 || /^(courses|course)$/i.test(text)) continue;
		if (!courseTitles[cSlug]) courseTitles[cSlug] = htmlDecode(text);
	}
	return { slug, title, description, coreSlugs, courseTitles };
}

/** Descarga y parsea un learning path; reutiliza la forma DataCampProgram sin duplicar contratos. */
export async function fetchMasterProgram(
	trackSlug: string,
	currentCourseSlug: string | null,
): Promise<{ program: DataCampProgram; courseId: number | null } | null> {
	const key = String(trackSlug || '').trim();
	if (!key) return null;
	const cached = programCache.get(key);
	if (cached) return cached;
	const task = (async () => {
		try {
			const res = await fetch(`https://master.dev/learn/${encodeURIComponent(key)}/`, { credentials: 'include' });
			if (!res.ok) return null;
			const parsed = parseMasterLearningPathHtml(await res.text(), key);
			if (!parsed) return null;
			const courses = await Promise.all(parsed.coreSlugs.map(async (cSlug, index) => {
				const known = parsed.courseTitles[cSlug];
				let title = known;
				if (!title) {
					const c = await fetchMasterCourse(cSlug);
					title = c?.title || cSlug.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
				}
				return { id: index + 1, title, slug: cSlug, position: index + 1, done: null };
			}));
			const currentIdx = currentCourseSlug ? parsed.coreSlugs.indexOf(currentCourseSlug) : -1;
			const courseId = currentIdx >= 0 ? currentIdx + 1 : null;
			const next = currentIdx >= 0 && currentIdx + 1 < courses.length ? courses[currentIdx + 1] : null;
			return {
				program: {
					slug: key, title: parsed.title, description: parsed.description, timeNeeded: '',
					completionRate: null, enrolled: null, courses,
					currentCourseDone: null, nextCourse: next ? { title: next.title, slug: next.slug } : null,
				},
				courseId,
			};
		} catch {
			programCache.delete(key);
			return null;
		}
	})();
	programCache.set(key, task);
	return task;
}
