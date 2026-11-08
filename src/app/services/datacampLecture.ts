/**
 * Adaptador del sitio DataCamp (app.datacamp.com).
 *
 * La SPA monta las lecciones de vídeo en un iframe cross-origin
 * (projector.datacamp.com) cuyo src lleva `projector_key=course_<id>_<hash>`.
 * Esa key alimenta la API pública del projector, que devuelve el deck con los
 * subtítulos oficiales en WebVTT (16-24 idiomas por vídeo). Las lecciones que
 * no son vídeo (SingleProcessExercise, ChatExercise, …) no tienen ese iframe:
 * la app no aparece ahí.
 *
 * Todo se lee desde el marco superior: la API del projector es pública (sin
 * cookies) y el fetch desde la página funciona (CORS verificado).
 */

export type DataCampSubtitleTrack = { language: string; link: string };

export type DataCampVideoMeta = {
	key: string;
	subtitle_vtt_link?: string | null;
	subtitles?: DataCampSubtitleTrack[] | null;
	slide_deck?: {
		title?: string | null;
		plain_video_mp4_link?: string | null;
		structure?: Array<{ title?: string | null; script?: string | null }> | null;
	} | null;
};

/** Idioma detectado del contenido de un VTT. */
export type DataCampVttLanguage = 'es' | 'en' | 'otro';

export function isDataCampProjectorFrame(): boolean {
	return window.location.hostname === 'projector.datacamp.com';
}

export function isDataCampCampusPage(): boolean {
	return window.location.hostname === 'app.datacamp.com' && /\/campus\/courses\/[^/]+/.test(window.location.pathname);
}

/** El slug del curso: /es/campus/courses/<slug>/<capitulo>?ex=N */
export function getDataCampCourseSlug(): string | null {
	const match = window.location.pathname.match(/\/campus\/courses\/([^/]+)/);
	return match ? match[1] : null;
}

/**
 * La projector_key del vídeo actual, leída del iframe del reproductor.
 * Devuelve null en lecciones que no son vídeo (ahí no hay iframe): es la señal
 * que decide si la app aparece o no.
 */
export function getDataCampProjectorKey(doc: Document = document): string | null {
	const iframe = doc.querySelector('iframe[src*="projector.datacamp.com"]') as HTMLIFrameElement | null;
	const src = iframe?.getAttribute('src') ?? '';
	const match = src.match(/[?&]projector_key=([^&]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

export async function fetchDataCampVideoMeta(key: string): Promise<DataCampVideoMeta | null> {
	try {
		const response = await fetch(`https://projector.datacamp.com/api/videos/${encodeURIComponent(key)}`, { credentials: 'omit' });
		if (!response.ok) return null;
		return (await response.json()) as DataCampVideoMeta;
	} catch {
		return null;
	}
}

export async function fetchText(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, { credentials: 'omit' });
		if (!response.ok) return null;
		return await response.text();
	} catch {
		return null;
	}
}

const ES_MARKERS = /\b(el|la|los|las|un|una|unos|unas|para|con|porque|esto|esto es|muy|también|según|vamos|aprenderás|curso| Aquí|aquí)\b/gi;
const EN_MARKERS = /\b(the|and|you|with|for|that|this|from|are|have|will|your|course|learn|here)\b/gi;

/**
 * Idioma del CONTENIDO de un VTT, no de la etiqueta: en los cursos traducidos
 * DataCamp etiqueta la pista nativa como «English» aunque esté en español.
 */
export function detectVttLanguage(vtt: string): DataCampVttLanguage {
	const lines = vtt
		.split('\n')
		.filter((line) => !/^\s*(WEBVTT|NOTE|STYLE|\d+\s*$)/.test(line) && !line.includes('-->') && line.trim().length > 0)
		.slice(0, 120)
		.join(' ')
		.toLowerCase();
	const es = (lines.match(ES_MARKERS) ?? []).length;
	const en = (lines.match(EN_MARKERS) ?? []).length;
	if (es >= 3 && es > en * 1.5) return 'es';
	if (en >= 3 && en > es * 1.5) return 'en';
	return 'otro';
}

/**
 * El VTT que Kinema debe usar y su idioma REAL (detectado del contenido).
 *  - es  → la pista nativa ya está en español: se muestra tal cual, sin IA.
 *  - en  → pista nativa en inglés: el pipeline de traducción del dock la toma.
 *  - otro→ se usa la pista nativa igual, sin traducción.
 */
export async function resolveDataCampSubtitles(key: string): Promise<{ meta: DataCampVideoMeta; vtt: string; lang: DataCampVttLanguage } | null> {
	const meta = await fetchDataCampVideoMeta(key);
	if (!meta) return null;
	const link = meta.subtitle_vtt_link ?? meta.subtitles?.find((t) => t.language === 'English')?.link ?? null;
	if (!link) return null;
	const vtt = await fetchText(link);
	if (!vtt || !vtt.includes('-->')) return null;
	return { meta, vtt, lang: detectVttLanguage(vtt) };
}

/**
 * Título de la lección: el de la PRIMERA diapositiva del deck (el título del
 * deck es el del CURSO). document.title en DataCamp es «<lección> | …».
 */
export function getDataCampLectureTitleFromMeta(meta: DataCampVideoMeta | null): string | null {
	const firstSlide = meta?.slide_deck?.structure?.[0]?.title?.trim();
	if (firstSlide) return firstSlide;
	const deckTitle = meta?.slide_deck?.title?.trim();
	return deckTitle || null;
}

/** Botón de avance de la SPA (aria-label localizado; matchean es/en). */
export function goToNextDataCampExercise(doc: Document = document): boolean {
	const selectors = [
		'[aria-label="Ir al siguiente ejercicio"]',
		'[aria-label="Go to the next exercise"]',
		'button[aria-label*="siguiente ejercicio" i]',
		'button[aria-label*="next exercise" i]'
	];
	for (const selector of selectors) {
		const button = doc.querySelector(selector) as HTMLButtonElement | null;
		if (button && !button.disabled) {
			button.click();
			return true;
		}
	}
	return false;
}

// ── Programa (career track) ───────────────────────────────────────────────────
// Un curso de DataCamp pertenece a VARIOS tracks a la vez (el outline trae
// `tracks[]`), así que el programa es CONTEXTO — nunca unidad de generación:
// Anki lo lleva como tag y Obsidian como un MOC propio, sin duplicar nada.

export type DataCampTrackRef = { slug: string; title: string };

export type DataCampProgramCourse = {
	id: number;
	title: string;
	slug: string;
	position: number;
	/** Lo dice el propio DataCamp (userContent); null si no se pudo casar. */
	done: boolean | null;
};

export type DataCampProgram = {
	slug: string;
	title: string;
	description: string;
	timeNeeded: string;
	completionRate: number | null;
	enrolled: boolean | null;
	courses: DataCampProgramCourse[];
	/** El curso que se está estudiando, según DataCamp. */
	currentCourseDone: boolean | null;
	/** Primer curso posterior al actual que DataCamp no marca completado. */
	nextCourse: { title: string; slug: string } | null;
};

type TrackOutline = { path?: string; title_with_subtitle?: string };

/** Los tracks del curso, desde el outline ya descargado (coste cero). */
export function parseDataCampTracks(outline: { tracks?: TrackOutline[] } | null): DataCampTrackRef[] {
	return (outline?.tracks ?? [])
		.map((t) => ({
			slug: (t.path ?? '').replace(/^\/tracks\//, '').replace(/\/+$/, ''),
			title: (t.title_with_subtitle ?? '').trim(),
		}))
		.filter((t) => t.slug && t.title);
}

type LearnHubTrack = {
	title?: string;
	subtitle?: string;
	description?: string;
	slug?: string;
	timeNeeded?: string;
	courseCount?: number;
	courseIds?: number[];
	content?: Array<{ contentId?: number; contentType?: string; position?: number; optional?: boolean }>;
	userTrack?: { active?: boolean; completionRate?: number; enrolled?: boolean } | null;
	userContent?: Array<{ completed?: boolean; content?: { id?: number; contentType?: string } }> | null;
};

/**
 * El programa completo para el estudio: cursos en orden con su título (la API
 * del track solo da ids; los títulos se resuelven por id y se cachean 24 h en
 * storage.local) y el estado que DataCamp tiene del usuario.
 */
export async function fetchDataCampProgram(
	trackSlug: string,
	currentCourseId: number | null,
): Promise<DataCampProgram | null> {
	try {
		const response = await fetch(`https://learn-hub-api.datacamp.com/tracks/user-track-v2/${encodeURIComponent(trackSlug)}`, { credentials: 'include' });
		if (!response.ok) return null;
		const track = (await response.json()) as LearnHubTrack;
		if (!track || !Array.isArray(track.courseIds)) return null;

		// Cache de títulos por id: 10 cursos son 10 peticiones; el payload no
		// cambia entre lecciones, así que se piden una vez al día.
		const cacheKey = `dc_program_cache::${trackSlug}`;
		let titles: Record<string, { title: string; slug: string }> = {};
		try {
			const stored = await new Promise<Record<string, unknown>>((done) => {
				const chromeApi = globalThis as typeof globalThis & { chrome?: { storage?: { local?: { get: (k: string[], cb: (r: Record<string, unknown>) => void) => void } } } };
				chromeApi.chrome?.storage?.local?.get([cacheKey], (r) => done(r ?? {}));
			});
			const cached = stored[cacheKey] as { at?: number; titles?: Record<string, { title: string; slug: string }> } | undefined;
			if (cached && typeof cached.at === 'number' && Date.now() - cached.at < 86400000 && cached.titles) {
				titles = cached.titles;
			}
		} catch { /* sin storage: se resuelve en vivo */ }

		const missing = track.courseIds.filter((id) => !titles[String(id)]);
		const resolved = await Promise.all(missing.map(async (id) => {
			try {
				const r = await fetch(`https://campus-api.datacamp.com/api/courses/${id}`, { credentials: 'include' });
				if (!r.ok) return null;
				const c = (await r.json()) as { title?: string; slug?: string };
				return c?.title && c?.slug ? { id: String(id), title: c.title, slug: c.slug } : null;
			} catch { return null; }
		}));
		for (const r of resolved) if (r) titles[r.id] = { title: r.title, slug: r.slug };
		try {
			const chromeApi = globalThis as typeof globalThis & { chrome?: { storage?: { local?: { set: (items: Record<string, unknown>, cb?: () => void) => void } } } };
			chromeApi.chrome?.storage?.local?.set({ [cacheKey]: { at: Date.now(), titles } });
		} catch { /* sin storage */ }

		// Estado por curso (userContent va en el mismo orden que content, con
		// projects intercalados: se casa por id y, si el payload no trae id, por
		// posición entre los cursos).
		const doneById = new Map<string, boolean>();
		const courseContent = (track.content ?? []).filter((c) => c.contentType === 'course');
		(track.userContent ?? []).forEach((u, index) => {
			const id = u.content?.id ?? courseContent[index]?.contentId;
			if (id !== undefined) doneById.set(String(id), Boolean(u.completed));
		});

		const courses: DataCampProgramCourse[] = track.courseIds.map((id, index) => ({
			id,
			title: titles[String(id)]?.title ?? `Curso ${id}`,
			slug: titles[String(id)]?.slug ?? String(id),
			position: (track.content ?? []).find((c) => c.contentId === id)?.position ?? index,
			done: doneById.get(String(id)) ?? null,
		}));

		const current = currentCourseId !== null ? courses.find((c) => c.id === currentCourseId) ?? null : null;
		const currentIndex = current ? courses.indexOf(current) : -1;
		const nextCourse = currentIndex >= 0
			? courses.slice(currentIndex + 1).find((c) => c.done !== true) ?? null
			: null;

		return {
			slug: track.slug ?? trackSlug,
			title: track.title ?? trackSlug,
			description: track.description ?? '',
			timeNeeded: track.timeNeeded ?? '',
			completionRate: typeof track.userTrack?.completionRate === 'number' ? track.userTrack.completionRate : null,
			enrolled: typeof track.userTrack?.enrolled === 'boolean' ? track.userTrack.enrolled : null,
			courses,
			currentCourseDone: current ? current.done : null,
			nextCourse: nextCourse ? { title: nextCourse.title, slug: nextCourse.slug } : null,
		};
	} catch {
		return null;
	}
}

/**
 * Título y descripción del curso desde la API del outline. El slug de la URL
 * responde aunque la sesión no tenga el curso; con credenciales trae más.
 */
export async function fetchDataCampCourseOutline(slug: string): Promise<{ title?: string; description?: string; raw?: unknown } | null> {
	try {
		const response = await fetch(`https://campus-api.datacamp.com/api/courses/${encodeURIComponent(slug)}`, { credentials: 'include' });
		if (!response.ok) return null;
		const data = (await response.json()) as { title?: string; short_description?: string; description?: string };
		return { title: data.title, description: data.short_description ?? data.description, raw: data };
	} catch {
		return null;
	}
}
